import AVFoundation
import Foundation

public struct AudioWaveformReadResult: Sendable, Equatable {
  public let samples: [Float]
  public let duration: Double
  public let startTime: Double
  public let endTime: Double

  public init(samples: [Float], duration: Double, startTime: Double, endTime: Double) {
    self.samples = samples
    self.duration = duration
    self.startTime = startTime
    self.endTime = endTime
  }
}

public enum AudioWaveformReaderError: Error, Sendable, Equatable {
  case emptyAudio
  case unsupportedPCM
  case invalidRange(startTime: Double, endTime: Double, duration: Double)
}

public enum AudioWaveformReader {
  public static let minimumSampleCount = 96
  public static let maximumSampleCount = 2_048

  public static func read(
    url: URL,
    sampleCount: Int,
    startTime: Double? = nil,
    endTime: Double? = nil
  ) throws -> AudioWaveformReadResult {
    try Task.checkCancellation()
    let file: AVAudioFile
    do {
      file = try AVAudioFile(forReading: url)
    } catch {
      throw AudioWaveformReaderError.unsupportedPCM
    }

    let sourceFrameCount = file.length
    guard sourceFrameCount > 0 else { throw AudioWaveformReaderError.emptyAudio }
    let format = file.processingFormat
    guard format.channelCount > 0, format.sampleRate > 0 else {
      throw AudioWaveformReaderError.unsupportedPCM
    }

    let duration = Double(sourceFrameCount) / format.sampleRate
    let requestedStart = startTime ?? 0
    let requestedEnd = endTime ?? duration
    guard requestedStart.isFinite, requestedEnd.isFinite,
      requestedStart >= 0, requestedEnd <= duration, requestedEnd > requestedStart
    else {
      throw AudioWaveformReaderError.invalidRange(
        startTime: requestedStart, endTime: requestedEnd, duration: duration)
    }

    let startFrame = AVAudioFramePosition((requestedStart * format.sampleRate).rounded(.down))
    let endFrame = min(
      sourceFrameCount,
      AVAudioFramePosition((requestedEnd * format.sampleRate).rounded(.up)))
    guard endFrame > startFrame else {
      throw AudioWaveformReaderError.invalidRange(
        startTime: requestedStart, endTime: requestedEnd, duration: duration)
    }

    let selectedFrameCount = endFrame - startFrame
    let boundedSampleCount = min(max(sampleCount, minimumSampleCount), maximumSampleCount)
    let readCapacity = AVAudioFrameCount(min(Int64(65_536), selectedFrameCount))
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: readCapacity) else {
      throw AudioWaveformReaderError.unsupportedPCM
    }

    file.framePosition = startFrame
    var bucketEnergy = [Double](repeating: 0, count: boundedSampleCount)
    var bucketFrameCounts = [Int](repeating: 0, count: boundedSampleCount)
    var frameOffset: AVAudioFramePosition = 0

    while frameOffset < selectedFrameCount {
      try Task.checkCancellation()
      let framesToRead = AVAudioFrameCount(
        min(Int64(readCapacity), selectedFrameCount - frameOffset))
      try file.read(into: buffer, frameCount: framesToRead)
      let framesRead = Int(buffer.frameLength)
      guard framesRead > 0 else { break }
      guard let channels = buffer.floatChannelData else {
        throw AudioWaveformReaderError.unsupportedPCM
      }

      for localFrame in 0..<framesRead {
        if localFrame.isMultiple(of: 16_384) { try Task.checkCancellation() }
        let bucket = min(
          Int(
            Double(frameOffset + AVAudioFramePosition(localFrame))
              / Double(selectedFrameCount) * Double(boundedSampleCount)),
          boundedSampleCount - 1)
        var frameEnergy = 0.0
        for channel in 0..<Int(format.channelCount) {
          let value = Double(channels[channel][localFrame])
          frameEnergy += value * value
        }
        bucketEnergy[bucket] += frameEnergy / Double(format.channelCount)
        bucketFrameCounts[bucket] += 1
      }
      frameOffset += AVAudioFramePosition(framesRead)
    }

    var samples = zip(bucketEnergy, bucketFrameCounts).map { energy, count in
      count > 0 ? Float(sqrt(energy / Double(count))) : 0
    }
    let maximum = samples.max() ?? 0
    if maximum > 0 {
      samples = samples.map { sqrt(min($0 / maximum, 1)) }
    }
    if samples.count > 2 {
      var smoothed = samples
      for index in 1..<(samples.count - 1) {
        smoothed[index] = (samples[index - 1] + samples[index] * 2 + samples[index + 1]) / 4
      }
      samples = smoothed
    }

    return AudioWaveformReadResult(
      samples: samples,
      duration: duration,
      startTime: Double(startFrame) / format.sampleRate,
      endTime: Double(endFrame) / format.sampleRate)
  }
}
