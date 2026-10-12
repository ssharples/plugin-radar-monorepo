import AVFoundation
import Accelerate
import Foundation
import SoundAnalysis

public enum SampleFrequencyRegion: String, Codable, Sendable, CaseIterable {
  case low
  case mid
  case high

  public var title: String {
    switch self {
    case .low: "Low end"
    case .mid: "Midrange"
    case .high: "High end"
    }
  }
}

public struct SampleContentSuggestion: Codable, Sendable, Equatable, Identifiable {
  public var id: String { label }
  public let label: String
  public let confidence: Double
  public let evidenceLabel: String

  public init(label: String, confidence: Double, evidenceLabel: String) {
    self.label = label
    self.confidence = confidence
    self.evidenceLabel = evidenceLabel
  }
}

public struct SampleAudioAnalysis: Codable, Sendable, Equatable {
  public let sampleID: String
  public let analyzedAt: Date
  public let sourceBytes: Int64
  public let sourceModifiedAt: Date?
  public let algorithmVersion: String
  public let spectralFrames: [[Float]]
  public let dominantFrequencyHz: Double
  public let spectralCentroidHz: Double
  public let lowEnergy: Double
  public let midEnergy: Double
  public let highEnergy: Double
  public let dominantRegion: SampleFrequencyRegion
  public let contentSuggestions: [SampleContentSuggestion]
  public let contentModel: String

  public init(
    sampleID: String,
    analyzedAt: Date,
    sourceBytes: Int64,
    sourceModifiedAt: Date?,
    algorithmVersion: String = "sample-spectrum-v1",
    spectralFrames: [[Float]],
    dominantFrequencyHz: Double,
    spectralCentroidHz: Double,
    lowEnergy: Double,
    midEnergy: Double,
    highEnergy: Double,
    dominantRegion: SampleFrequencyRegion,
    contentSuggestions: [SampleContentSuggestion],
    contentModel: String = "Apple Sound Analysis v1"
  ) {
    self.sampleID = sampleID
    self.analyzedAt = analyzedAt
    self.sourceBytes = sourceBytes
    self.sourceModifiedAt = sourceModifiedAt
    self.algorithmVersion = algorithmVersion
    self.spectralFrames = spectralFrames
    self.dominantFrequencyHz = dominantFrequencyHz
    self.spectralCentroidHz = spectralCentroidHz
    self.lowEnergy = lowEnergy
    self.midEnergy = midEnergy
    self.highEnergy = highEnergy
    self.dominantRegion = dominantRegion
    self.contentSuggestions = contentSuggestions
    self.contentModel = contentModel
  }

  public func matches(_ sample: SampleListRow) -> Bool {
    guard sourceBytes == sample.metadata.bytes else { return false }
    switch (sourceModifiedAt, sample.metadata.modifiedAt) {
    case (nil, nil): return true
    case (let left?, let right?):
      return abs(left.timeIntervalSince1970 - right.timeIntervalSince1970) < 0.001
    default: return false
    }
  }
}

public enum SampleAudioAnalyzerError: Error, LocalizedError {
  case unavailable(URL)
  case unreadable(URL, String)
  case empty(URL)

  public var errorDescription: String? {
    switch self {
    case .unavailable(let url): "Audio is unavailable at \(url.path)"
    case .unreadable(let url, let message): "Could not analyse \(url.lastPathComponent): \(message)"
    case .empty(let url): "\(url.lastPathComponent) contains no readable audio"
    }
  }
}

/// Produces bounded spectral evidence and optional local content suggestions without changing audio.
///
/// Spectrum extraction reads twelve representative 4096-frame windows. Content suggestions use
/// Apple's on-device Sound Analysis classifier and are always presented as confidence-scored hints.
public struct SampleAudioAnalyzer: Sendable {
  public static let spectralBandCount = 40
  public static let spectralFrameCount = 12

  public init() {}

  public func analyze(_ sample: SampleListRow, analyzedAt: Date = Date()) async throws
    -> SampleAudioAnalysis
  {
    guard sample.availability == .available,
      FileManager.default.isReadableFile(atPath: sample.fileURL.path)
    else {
      throw SampleAudioAnalyzerError.unavailable(sample.fileURL)
    }

    let spectrum = try Self.spectrum(fileURL: sample.fileURL)
    let suggestions = (try? await Self.classify(fileURL: sample.fileURL)) ?? []
    return SampleAudioAnalysis(
      sampleID: sample.id,
      analyzedAt: analyzedAt,
      sourceBytes: sample.metadata.bytes,
      sourceModifiedAt: sample.metadata.modifiedAt,
      spectralFrames: spectrum.frames,
      dominantFrequencyHz: spectrum.dominantFrequency,
      spectralCentroidHz: spectrum.centroid,
      lowEnergy: spectrum.lowEnergy,
      midEnergy: spectrum.midEnergy,
      highEnergy: spectrum.highEnergy,
      dominantRegion: spectrum.dominantRegion,
      contentSuggestions: suggestions
    )
  }

  private static func spectrum(fileURL: URL) throws -> SpectrumResult {
    let audioFile: AVAudioFile
    do {
      audioFile = try AVAudioFile(
        forReading: fileURL,
        commonFormat: .pcmFormatFloat32,
        interleaved: false
      )
    } catch {
      throw SampleAudioAnalyzerError.unreadable(fileURL, error.localizedDescription)
    }

    let format = audioFile.processingFormat
    let sampleRate = format.sampleRate
    let channelCount = Int(format.channelCount)
    guard sampleRate > 0, channelCount > 0, audioFile.length > 0 else {
      throw SampleAudioAnalyzerError.empty(fileURL)
    }

    let frameSize = 4_096
    guard
      let setup = vDSP_DFT_zop_CreateSetup(
        nil, vDSP_Length(frameSize), vDSP_DFT_Direction.FORWARD)
    else {
      throw SampleAudioAnalyzerError.unreadable(fileURL, "could not create FFT setup")
    }
    defer { vDSP_DFT_DestroySetup(setup) }

    guard
      let buffer = AVAudioPCMBuffer(
        pcmFormat: format,
        frameCapacity: AVAudioFrameCount(frameSize))
    else {
      throw SampleAudioAnalyzerError.unreadable(fileURL, "could not allocate decode buffer")
    }

    let maximumStart = max(0, audioFile.length - AVAudioFramePosition(frameSize))
    let starts = (0..<spectralFrameCount).map { index -> AVAudioFramePosition in
      guard spectralFrameCount > 1 else { return 0 }
      return AVAudioFramePosition(
        (Double(maximumStart) * Double(index) / Double(spectralFrameCount - 1)).rounded())
    }
    let nyquist = sampleRate / 2
    let highestFrequency = min(20_000, nyquist)
    var rawFrames: [[Double]] = []
    var combined = [Double](repeating: 0, count: spectralBandCount)

    for start in starts {
      if Task.isCancelled { throw CancellationError() }
      audioFile.framePosition = start
      do {
        try audioFile.read(into: buffer, frameCount: AVAudioFrameCount(frameSize))
      } catch {
        throw SampleAudioAnalyzerError.unreadable(fileURL, error.localizedDescription)
      }
      guard buffer.frameLength > 0, let channels = buffer.floatChannelData else { continue }

      let count = Int(buffer.frameLength)
      var inputReal = [Float](repeating: 0, count: frameSize)
      let denominator = Float(channelCount)
      for channel in 0..<channelCount {
        for index in 0..<count {
          inputReal[index] += channels[channel][index] / denominator
        }
      }
      for index in 0..<count {
        let window = 0.5 - 0.5 * cos((2 * Float.pi * Float(index)) / Float(frameSize - 1))
        inputReal[index] *= window
      }

      let inputImaginary = [Float](repeating: 0, count: frameSize)
      var outputReal = [Float](repeating: 0, count: frameSize)
      var outputImaginary = [Float](repeating: 0, count: frameSize)
      vDSP_DFT_Execute(setup, inputReal, inputImaginary, &outputReal, &outputImaginary)

      var bands = [Double](repeating: 0, count: spectralBandCount)
      for fftIndex in 1..<(frameSize / 2) {
        let frequency = Double(fftIndex) * sampleRate / Double(frameSize)
        guard frequency >= 20, frequency <= highestFrequency else { continue }
        let fraction = log(frequency / 20) / log(highestFrequency / 20)
        let band = min(spectralBandCount - 1, max(0, Int(fraction * Double(spectralBandCount))))
        let real = Double(outputReal[fftIndex])
        let imaginary = Double(outputImaginary[fftIndex])
        bands[band] += real * real + imaginary * imaginary
      }
      for index in bands.indices { combined[index] += bands[index] }
      rawFrames.append(bands)
    }

    guard !rawFrames.isEmpty else { throw SampleAudioAnalyzerError.empty(fileURL) }
    let compressed = rawFrames.map { $0.map { log1p($0) } }
    let peak = max(compressed.flatMap { $0 }.max() ?? 0, .leastNonzeroMagnitude)
    let normalizedFrames = compressed.map { frame in frame.map { Float($0 / peak) } }

    let centerFrequency: (Int) -> Double = { index in
      let fraction = (Double(index) + 0.5) / Double(spectralBandCount)
      return 20 * pow(highestFrequency / 20, fraction)
    }
    let totalEnergy = combined.reduce(0, +)
    let centroid =
      totalEnergy > 0
      ? combined.indices.reduce(0) { $0 + centerFrequency($1) * combined[$1] } / totalEnergy
      : 0
    let dominantIndex = combined.indices.max(by: { combined[$0] < combined[$1] }) ?? 0
    let energy = combined.indices.reduce(into: (low: 0.0, mid: 0.0, high: 0.0)) {
      result, index in
      switch centerFrequency(index) {
      case ..<250: result.low += combined[index]
      case ..<4_000: result.mid += combined[index]
      default: result.high += combined[index]
      }
    }
    let energyTotal = max(energy.low + energy.mid + energy.high, .leastNonzeroMagnitude)
    let normalizedEnergy = (
      low: energy.low / energyTotal,
      mid: energy.mid / energyTotal,
      high: energy.high / energyTotal
    )
    let dominantRegion: SampleFrequencyRegion =
      if normalizedEnergy.low >= normalizedEnergy.mid
        && normalizedEnergy.low >= normalizedEnergy.high
      {
        .low
      } else if normalizedEnergy.mid >= normalizedEnergy.high {
        .mid
      } else {
        .high
      }

    return SpectrumResult(
      frames: normalizedFrames,
      dominantFrequency: centerFrequency(dominantIndex),
      centroid: centroid,
      lowEnergy: normalizedEnergy.low,
      midEnergy: normalizedEnergy.mid,
      highEnergy: normalizedEnergy.high,
      dominantRegion: dominantRegion
    )
  }

  private static func classify(fileURL: URL) async throws -> [SampleContentSuggestion] {
    let request = try SNClassifySoundRequest(classifierIdentifier: .version1)
    request.overlapFactor = 0.25
    let analyzer = try SNAudioFileAnalyzer(url: fileURL)
    let observer = SampleSoundObserver()
    try analyzer.add(request, withObserver: observer)

    return await withCheckedContinuation { continuation in
      analyzer.analyze { _ in
        continuation.resume(returning: observer.suggestions())
      }
    }
  }
}

private struct SpectrumResult {
  let frames: [[Float]]
  let dominantFrequency: Double
  let centroid: Double
  let lowEnergy: Double
  let midEnergy: Double
  let highEnergy: Double
  let dominantRegion: SampleFrequencyRegion
}

private final class SampleSoundObserver: NSObject, SNResultsObserving, @unchecked Sendable {
  private let lock = NSLock()
  private var scores: [String: [Double]] = [:]

  func request(_ request: SNRequest, didProduce result: SNResult) {
    guard let classification = result as? SNClassificationResult else { return }
    lock.lock()
    defer { lock.unlock() }
    for candidate in classification.classifications.prefix(8) {
      guard let label = Self.productLabel(for: candidate.identifier) else { continue }
      scores[label, default: []].append(candidate.confidence)
    }
  }

  func suggestions() -> [SampleContentSuggestion] {
    lock.lock()
    defer { lock.unlock() }
    return scores.compactMap { label, values -> SampleContentSuggestion? in
      let strongest = values.sorted(by: >).prefix(3)
      let confidence = strongest.reduce(0, +) / Double(strongest.count)
      guard confidence >= 0.12 else { return nil }
      let source = Self.sourceLabel(for: label)
      return SampleContentSuggestion(
        label: label, confidence: min(1, confidence), evidenceLabel: source)
    }
    .sorted { $0.confidence > $1.confidence }
    .prefix(3)
    .map { $0 }
  }

  private static func productLabel(for identifier: String) -> String? {
    switch identifier {
    case "bass_drum": "Kick"
    case "snare_drum": "Snare"
    case "drum", "drum_kit": "Drums"
    case "bass_guitar", "double_bass": "Bass"
    case "piano", "electric_piano": "Piano"
    case "keyboard_musical": "Keys"
    case "guitar", "electric_guitar", "acoustic_guitar", "steel_guitar_slide_guitar",
      "guitar_tapping", "guitar_strum":
      "Guitar"
    case "singing", "choir_singing": "Vocals"
    case "speech": "Voice"
    case "synthesizer": "Synth"
    case "music": "Music"
    default: nil
    }
  }

  private static func sourceLabel(for label: String) -> String {
    switch label {
    case "Kick": "bass_drum"
    case "Snare": "snare_drum"
    case "Drums": "drum / drum_kit"
    case "Bass": "bass_guitar / double_bass"
    case "Piano": "piano / electric_piano"
    case "Keys": "keyboard_musical"
    case "Guitar": "guitar family"
    case "Vocals": "singing / choir_singing"
    case "Voice": "speech"
    case "Synth": "synthesizer"
    default: "music"
    }
  }
}
