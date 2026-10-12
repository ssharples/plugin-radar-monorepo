import AVFoundation
import Foundation

public struct AudioClipExportPlan: Sendable, Equatable {
  public let sourceURL: URL
  public let startSeconds: TimeInterval
  public let endSeconds: TimeInterval
  public let destinationURL: URL

  public init(
    sourceURL: URL,
    startSeconds: TimeInterval,
    endSeconds: TimeInterval,
    destinationURL: URL
  ) {
    self.sourceURL = sourceURL
    self.startSeconds = startSeconds
    self.endSeconds = endSeconds
    self.destinationURL = destinationURL
  }
}

public struct AudioClipExportResult: Sendable, Equatable {
  public let fileURL: URL
  public let frameCount: AVAudioFramePosition
  public let sampleRate: Double
  public let channelCount: AVAudioChannelCount
  public let duration: TimeInterval

  public init(
    fileURL: URL,
    frameCount: AVAudioFramePosition,
    sampleRate: Double,
    channelCount: AVAudioChannelCount,
    duration: TimeInterval
  ) {
    self.fileURL = fileURL
    self.frameCount = frameCount
    self.sampleRate = sampleRate
    self.channelCount = channelCount
    self.duration = duration
  }
}

public enum AudioClipExporterError: Error, LocalizedError, Equatable {
  case invalidRange(String)
  case sourceUnavailable(URL)
  case destinationExists(URL)
  case sourceChanged(URL)
  case unsupportedFormat(URL, String)
  case couldNotCreateFormat
  case outputVerificationFailed(String)

  public var errorDescription: String? {
    switch self {
    case .invalidRange(let reason): "The audio clip range is invalid: \(reason)"
    case .sourceUnavailable(let url): "The source audio is unavailable at \(url.path)"
    case .destinationExists(let url):
      "Audio clip export stopped because \(url.lastPathComponent) already exists"
    case .sourceChanged(let url):
      "The source audio changed while exporting \(url.lastPathComponent)"
    case .unsupportedFormat(let url, let reason):
      "The source audio format is unsupported at \(url.path): \(reason)"
    case .couldNotCreateFormat: "Could not create the 32-bit float PCM output format"
    case .outputVerificationFailed(let reason): "Exported audio failed verification: \(reason)"
    }
  }
}

/// Exports a frame-aligned, source-faithful excerpt as a 32-bit float PCM WAV.
/// The source is only read; the destination must not already exist.
public struct AudioClipExporter: @unchecked Sendable {
  private let fileManager: FileManager
  private let chunkFrameCount: AVAudioFrameCount

  public init(fileManager: FileManager = .default, chunkFrameCount: AVAudioFrameCount = 4_096) {
    self.fileManager = fileManager
    self.chunkFrameCount = max(1, chunkFrameCount)
  }

  public func export(_ plan: AudioClipExportPlan) throws -> AudioClipExportResult {
    try Task.checkCancellation()
    guard plan.startSeconds.isFinite, plan.endSeconds.isFinite else {
      throw AudioClipExporterError.invalidRange("start and end must be finite")
    }
    guard plan.startSeconds >= 0 else {
      throw AudioClipExporterError.invalidRange("start cannot be negative")
    }
    guard plan.endSeconds > plan.startSeconds else {
      throw AudioClipExporterError.invalidRange("end must be after start")
    }
    guard !fileManager.fileExists(atPath: plan.destinationURL.path) else {
      throw AudioClipExporterError.destinationExists(plan.destinationURL)
    }
    guard fileManager.fileExists(atPath: plan.sourceURL.path) else {
      throw AudioClipExporterError.sourceUnavailable(plan.sourceURL)
    }

    let before = try FileFingerprint.read(from: plan.sourceURL, fileManager: fileManager)
    let input = try AVAudioFile(forReading: plan.sourceURL)
    let format = input.processingFormat
    guard format.sampleRate.isFinite, format.sampleRate > 0, format.channelCount > 0 else {
      throw AudioClipExporterError.unsupportedFormat(
        plan.sourceURL, "invalid sample rate or channel count")
    }
    guard format.channelCount <= 2 else {
      throw AudioClipExporterError.unsupportedFormat(
        plan.sourceURL, "only mono and stereo sources are supported")
    }
    guard format.sampleRate <= 192_000 else {
      throw AudioClipExporterError.unsupportedFormat(
        plan.sourceURL, "sample rates above 192 kHz are not supported")
    }
    let sourceFrames = AVAudioFramePosition(input.length)
    let sampleRate = format.sampleRate
    let sourceDuration = Double(sourceFrames) / sampleRate
    guard plan.startSeconds < sourceDuration else {
      throw AudioClipExporterError.invalidRange("start is outside the source duration")
    }
    guard plan.endSeconds <= sourceDuration + (1 / sampleRate) else {
      throw AudioClipExporterError.invalidRange("end is beyond the source duration")
    }
    let startFrame = AVAudioFramePosition((plan.startSeconds * sampleRate).rounded())
    let requestedEndFrame = AVAudioFramePosition((plan.endSeconds * sampleRate).rounded())
    guard requestedEndFrame > startFrame else {
      throw AudioClipExporterError.invalidRange("range does not contain a complete frame")
    }
    let endFrame = min(requestedEndFrame, sourceFrames)
    let frameCount = endFrame - startFrame
    guard frameCount > 0 else {
      throw AudioClipExporterError.invalidRange("range does not contain a complete frame")
    }

    let parent = plan.destinationURL.deletingLastPathComponent()
    try fileManager.createDirectory(at: parent, withIntermediateDirectories: true)
    let staging = parent.appending(
      path: ".studio-time-machine-audio-\(UUID().uuidString)", directoryHint: .isDirectory)
    try fileManager.createDirectory(at: staging, withIntermediateDirectories: false)
    let temporary = staging.appending(path: "clip.wav")
    defer { try? fileManager.removeItem(at: staging) }

    var settings = format.settings
    settings[AVFormatIDKey] = kAudioFormatLinearPCM
    settings[AVSampleRateKey] = sampleRate
    settings[AVNumberOfChannelsKey] = format.channelCount
    settings[AVLinearPCMBitDepthKey] = 32
    settings[AVLinearPCMIsFloatKey] = true
    settings[AVLinearPCMIsBigEndianKey] = false
    settings[AVLinearPCMIsNonInterleaved] = false
    do {
      let output = try AVAudioFile(forWriting: temporary, settings: settings)
      let bufferFrameCapacity = AVAudioFrameCount(
        min(Int64(chunkFrameCount), frameCount))
      guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: bufferFrameCapacity)
      else {
        throw AudioClipExporterError.couldNotCreateFormat
      }
      input.framePosition = startFrame
      var remaining = frameCount
      while remaining > 0 {
        try Task.checkCancellation()
        let count = min(AVAudioFramePosition(chunkFrameCount), remaining)
        try input.read(into: buffer, frameCount: AVAudioFrameCount(count))
        guard buffer.frameLength > 0 else {
          throw AudioClipExporterError.outputVerificationFailed("source ended early")
        }
        try output.write(from: buffer)
        remaining -= AVAudioFramePosition(buffer.frameLength)
      }
    }
    try Task.checkCancellation()
    let after = try FileFingerprint.read(from: plan.sourceURL, fileManager: fileManager)
    guard before == after else { throw AudioClipExporterError.sourceChanged(plan.sourceURL) }
    let check = try AVAudioFile(forReading: temporary)
    let outputDescription = check.fileFormat.streamDescription.pointee
    guard AVAudioFramePosition(check.length) == frameCount,
      check.processingFormat.channelCount == format.channelCount,
      abs(check.processingFormat.sampleRate - sampleRate) < 0.001,
      outputDescription.mBitsPerChannel == 32,
      outputDescription.mFormatFlags & kAudioFormatFlagIsFloat != 0
    else {
      throw AudioClipExporterError.outputVerificationFailed(
        "frame count or PCM format did not match the plan")
    }
    guard !fileManager.fileExists(atPath: plan.destinationURL.path) else {
      throw AudioClipExporterError.destinationExists(plan.destinationURL)
    }
    do {
      try fileManager.moveItem(at: temporary, to: plan.destinationURL)
    } catch {
      // A destination may appear between the preflight check and this atomic promotion.
      // Never replace it; report the same stable error as the preflight path.
      if fileManager.fileExists(atPath: plan.destinationURL.path) {
        throw AudioClipExporterError.destinationExists(plan.destinationURL)
      }
      throw error
    }
    return AudioClipExportResult(
      fileURL: plan.destinationURL, frameCount: frameCount, sampleRate: sampleRate,
      channelCount: format.channelCount, duration: Double(frameCount) / sampleRate)
  }
}
