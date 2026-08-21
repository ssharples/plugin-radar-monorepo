import AVFoundation
import Foundation

public struct DryPreviewRenderResult: Codable, Sendable, Equatable {
  public let fileURL: URL
  public let duration: TimeInterval
  public let sampleRate: Double
  public let renderedSegmentCount: Int
  public let fidelity: PreviewFidelity

  public init(
    fileURL: URL,
    duration: TimeInterval,
    sampleRate: Double,
    renderedSegmentCount: Int,
    fidelity: PreviewFidelity = .approximate
  ) {
    self.fileURL = fileURL
    self.duration = duration
    self.sampleRate = sampleRate
    self.renderedSegmentCount = renderedSegmentCount
    self.fidelity = fidelity
  }
}

public enum DryPreviewRendererError: Error, LocalizedError {
  case noSegments
  case destinationExists(URL)
  case sourceUnavailable(URL)
  case invalidTempo
  case durationLimitExceeded
  case couldNotCreateFormat
  case renderingFailed(String)

  public var errorDescription: String? {
    switch self {
    case .noSegments: "The approximate preview plan does not contain any audio"
    case .destinationExists(let url):
      "Preview rendering stopped because \(url.lastPathComponent) already exists"
    case .sourceUnavailable(let url): "Preview source audio is unavailable at \(url.path)"
    case .invalidTempo: "The approximate preview plan has an invalid tempo"
    case .durationLimitExceeded: "The approximate preview exceeds the four-hour safety limit"
    case .couldNotCreateFormat: "Could not create the offline preview audio format"
    case .renderingFailed(let message): "Could not render the approximate preview: \(message)"
    }
  }
}

/// Renders the resolver's deliberately restricted dry plan without launching Ableton Live.
///
/// This engine places raw source audio on a fixed-tempo timeline. It does not reproduce source
/// offsets, clip fades, warping, automation, routing, mixer state, devices, plug-ins, or Live's
/// summing behavior, so every successful result is permanently classified as `approximate`.
public struct DryPreviewRenderer: Sendable {
  public let sampleRate: Double
  public let channelCount: AVAudioChannelCount
  public let maximumDuration: TimeInterval

  public init(
    sampleRate: Double = 44_100,
    channelCount: AVAudioChannelCount = 2,
    maximumDuration: TimeInterval = 4 * 60 * 60
  ) {
    self.sampleRate = sampleRate
    self.channelCount = channelCount
    self.maximumDuration = maximumDuration
  }

  public func render(
    plan: DryPreviewPlan,
    destinationURL: URL,
    fileManager: FileManager = .default
  ) throws -> DryPreviewRenderResult {
    guard !plan.segments.isEmpty else { throw DryPreviewRendererError.noSegments }
    guard plan.tempo.isFinite, plan.tempo > 0 else { throw DryPreviewRendererError.invalidTempo }
    guard !fileManager.fileExists(atPath: destinationURL.path) else {
      throw DryPreviewRendererError.destinationExists(destinationURL)
    }
    guard
      let outputFormat = AVAudioFormat(
        standardFormatWithSampleRate: sampleRate,
        channels: channelCount
      )
    else {
      throw DryPreviewRendererError.couldNotCreateFormat
    }

    let secondsPerBeat = 60 / plan.tempo
    let prepared = try plan.segments.compactMap { segment -> PreparedSegment? in
      guard fileManager.fileExists(atPath: segment.sourceURL.path) else {
        throw DryPreviewRendererError.sourceUnavailable(segment.sourceURL)
      }
      let file = try AVAudioFile(forReading: segment.sourceURL)
      let sourceDuration = Double(file.length) / file.processingFormat.sampleRate
      let requestedDuration =
        segment.endBeat.map {
          max(0, $0 - segment.startBeat) * secondsPerBeat
        } ?? sourceDuration
      let duration = min(sourceDuration, requestedDuration)
      guard duration > 0 else { return nil }
      let sourceFrames = AVAudioFrameCount(
        min(Double(UInt32.max), floor(duration * file.processingFormat.sampleRate))
      )
      return PreparedSegment(
        file: file,
        startFrame: AVAudioFramePosition(max(0, segment.startBeat * secondsPerBeat * sampleRate)),
        sourceFrameCount: sourceFrames,
        outputEndTime: max(0, segment.startBeat * secondsPerBeat) + duration
      )
    }
    guard !prepared.isEmpty else { throw DryPreviewRendererError.noSegments }
    let duration = prepared.map(\.outputEndTime).max() ?? 0
    guard duration <= maximumDuration else {
      throw DryPreviewRendererError.durationLimitExceeded
    }

    let engine = AVAudioEngine()
    let nodes = prepared.map { _ in AVAudioPlayerNode() }
    for node in nodes {
      engine.attach(node)
      engine.connect(node, to: engine.mainMixerNode, format: nil)
    }
    try engine.enableManualRenderingMode(
      .offline,
      format: outputFormat,
      maximumFrameCount: 4_096
    )
    for (node, segment) in zip(nodes, prepared) {
      node.scheduleSegment(
        segment.file,
        startingFrame: 0,
        frameCount: segment.sourceFrameCount,
        at: AVAudioTime(sampleTime: segment.startFrame, atRate: sampleRate)
      )
    }

    let destinationDirectory = destinationURL.deletingLastPathComponent()
    try fileManager.createDirectory(at: destinationDirectory, withIntermediateDirectories: true)
    let temporaryURL =
      destinationDirectory
      .appending(path: ".\(UUID().uuidString).rendering.wav")
    do {
      var fileSettings = outputFormat.settings
      fileSettings[AVLinearPCMIsNonInterleaved] = false
      let outputFile = try AVAudioFile(forWriting: temporaryURL, settings: fileSettings)
      guard
        let buffer = AVAudioPCMBuffer(
          pcmFormat: engine.manualRenderingFormat,
          frameCapacity: engine.manualRenderingMaximumFrameCount
        )
      else {
        throw DryPreviewRendererError.couldNotCreateFormat
      }

      engine.prepare()
      try engine.start()
      for node in nodes { node.play() }
      let totalFrames = AVAudioFramePosition(ceil(duration * sampleRate))
      var renderedFrames: AVAudioFramePosition = 0
      var stalledAttempts = 0
      while renderedFrames < totalFrames {
        let remaining = totalFrames - renderedFrames
        let frames = AVAudioFrameCount(
          min(AVAudioFramePosition(engine.manualRenderingMaximumFrameCount), remaining)
        )
        switch try engine.renderOffline(frames, to: buffer) {
        case .success:
          try outputFile.write(from: buffer)
          renderedFrames += AVAudioFramePosition(buffer.frameLength)
          stalledAttempts = 0
        case .insufficientDataFromInputNode, .cannotDoInCurrentContext:
          stalledAttempts += 1
          if stalledAttempts > 1_000 {
            throw DryPreviewRendererError.renderingFailed("offline engine stopped progressing")
          }
        case .error:
          throw DryPreviewRendererError.renderingFailed("AVAudioEngine returned an error")
        @unknown default:
          throw DryPreviewRendererError.renderingFailed("unknown AVAudioEngine status")
        }
      }
      engine.stop()
      guard !fileManager.fileExists(atPath: destinationURL.path) else {
        throw DryPreviewRendererError.destinationExists(destinationURL)
      }
      try fileManager.moveItem(at: temporaryURL, to: destinationURL)
      return DryPreviewRenderResult(
        fileURL: destinationURL,
        duration: duration,
        sampleRate: sampleRate,
        renderedSegmentCount: prepared.count
      )
    } catch {
      engine.stop()
      try? fileManager.removeItem(at: temporaryURL)
      throw error
    }
  }
}

private struct PreparedSegment {
  let file: AVAudioFile
  let startFrame: AVAudioFramePosition
  let sourceFrameCount: AVAudioFrameCount
  let outputEndTime: TimeInterval
}
