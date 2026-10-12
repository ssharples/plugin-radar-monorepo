import AVFoundation
import CryptoKit
import Foundation

@testable import StudioCore

enum TransformedSampleResearchTestSupport {
  enum SyntheticTransform: String, CaseIterable, Sendable {
    case pitch
    case microtonal
    case timeStretch
    case equalization
    case compression
    case gain
    case filtering
    case bitcrush
    case delay
    case distortion
    case reverb
    case silence
    case duplication
    case removal
    case reversal
    case chopping
    case unrelated
    case independentReperformance
    case interpolationEvidence
    case rePerformanceEvidence
    case ambiguousRelationship
    case composite

    var family: TransformedSampleTransformFamily? {
      switch self {
      case .pitch: .pitch
      case .microtonal: .microtonal
      case .timeStretch: .timeStretch
      case .equalization: .equalization
      case .compression: .compression
      case .gain: .gain
      case .filtering: .filtering
      case .bitcrush: .bitcrush
      case .delay: .delay
      case .distortion: .distortion
      case .reverb: .reverb
      case .silence: .silence
      case .duplication: .duplication
      case .removal: .removal
      case .reversal: .reversal
      case .chopping: .chopping
      case .unrelated, .independentReperformance, .interpolationEvidence,
        .rePerformanceEvidence, .ambiguousRelationship, .composite:
        nil
      }
    }
  }

  static let positiveTransforms = SyntheticTransform.allCases.filter { $0.family != nil }

  static func writeFixturePair(
    root: URL,
    transform: SyntheticTransform
  ) throws -> (source: URL, target: URL) {
    let source = root.appending(path: "source.wav")
    let target = root.appending(path: "target-\(transform.rawValue).wav")
    try writeAudio(to: source, transform: nil)
    try writeAudio(to: target, transform: transform)
    return (source, target)
  }

  static func writeAudio(
    to url: URL,
    transform: SyntheticTransform?,
    duration: Double = 6,
    leadingSilence: Double = 0,
    sampleRate: Double = 8_000,
    channelCount: Int = 1
  ) throws {
    let outputDuration = transformedDuration(base: duration, transform: transform)
    guard channelCount > 0, channelCount <= Int(AVAudioChannelCount.max),
      let format = AVAudioFormat(
        standardFormatWithSampleRate: sampleRate,
        channels: AVAudioChannelCount(channelCount))
    else {
      throw CocoaError(.fileWriteUnknown)
    }
    let frameCount = AVAudioFrameCount(((outputDuration + leadingSilence) * sampleRate).rounded())
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
      throw CocoaError(.fileWriteUnknown)
    }
    buffer.frameLength = frameCount
    guard let channels = buffer.floatChannelData else {
      throw CocoaError(.fileWriteUnknown)
    }
    for frame in 0..<Int(frameCount) {
      let outputTime = Double(frame) / sampleRate
      let sample = transformedSample(
        outputTime: outputTime - leadingSilence,
        baseDuration: duration,
        transform: transform)
      for channel in 0..<channelCount {
        channels[channel][frame] = sample * Float(1 - 0.01 * Double(channel))
      }
    }
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: channelCount,
      AVLinearPCMBitDepthKey: 32,
      AVLinearPCMIsFloatKey: true,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let file = try AVAudioFile(
      forWriting: url,
      settings: settings,
      commonFormat: .pcmFormatFloat32,
      interleaved: false)
    try file.write(from: buffer)
  }

  static func writeRawFloatWAV(
    to url: URL,
    sampleRate: Int,
    channelCount: Int,
    durationSeconds: Int = 5
  ) throws {
    let frameCount = sampleRate * durationSeconds
    let blockAlign = channelCount * MemoryLayout<Float>.size
    let dataByteCount = frameCount * blockAlign
    guard sampleRate > 0, channelCount > 0, blockAlign <= Int(UInt16.max),
      dataByteCount <= Int(UInt32.max) - 36
    else { throw CocoaError(.fileWriteUnknown) }
    var data = Data()
    data.reserveCapacity(44 + dataByteCount)
    data.append(Data("RIFF".utf8))
    appendLittleEndian(UInt32(36 + dataByteCount), to: &data)
    data.append(Data("WAVEfmt ".utf8))
    appendLittleEndian(UInt32(16), to: &data)
    appendLittleEndian(UInt16(3), to: &data)
    appendLittleEndian(UInt16(channelCount), to: &data)
    appendLittleEndian(UInt32(sampleRate), to: &data)
    appendLittleEndian(UInt32(sampleRate * blockAlign), to: &data)
    appendLittleEndian(UInt16(blockAlign), to: &data)
    appendLittleEndian(UInt16(32), to: &data)
    data.append(Data("data".utf8))
    appendLittleEndian(UInt32(dataByteCount), to: &data)
    data.append(Data(count: dataByteCount))
    try data.write(to: url, options: .withoutOverwriting)
  }

  private static func appendLittleEndian<T: FixedWidthInteger>(
    _ value: T,
    to data: inout Data
  ) {
    var littleEndian = value.littleEndian
    withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
  }

  static func digest(_ value: String) -> String {
    SHA256.hash(data: Data(value.utf8))
      .map { String(format: "%02x", $0) }
      .joined()
  }

  static func corpusEntry(
    id: String,
    split: TransformedSampleCorpusSplit,
    family: TransformedSampleTransformFamily? = .pitch,
    origin: TransformedSampleCorpusOriginKind = .syntheticAugmentation,
    artist: String? = nil,
    song: String? = nil,
    relationship: TransformedSampleExpectedRelationship? = nil,
    classification: TransformedSampleRelationshipClassification = .directReuse
  ) -> TransformedSampleCorpusEntry {
    let expectedRelationship = relationship ?? (family == nil ? .unrelated : .transformedUse)
    let provenance =
      origin == .syntheticAugmentation
      ? TransformedSampleCorpusOrigin(
        kind: .syntheticAugmentation,
        generatorVersion: "fixture-v1",
        augmentationSeed: UInt64(digest(id).prefix(16), radix: 16) ?? 0)
      : TransformedSampleCorpusOrigin(
        kind: .realProducerLabel,
        labelReviewID: "review-\(id)",
        rightsEvidenceID: "rights-\(id)")
    return TransformedSampleCorpusEntry(
      id: id,
      artistGroupDigest: digest(artist ?? "artist-\(id)"),
      songGroupDigest: digest(song ?? "song-\(id)"),
      sourceObservationDigest: digest("source-\(id)"),
      targetObservationDigest: digest("target-\(id)"),
      origin: provenance,
      split: split,
      expectedRelationship: expectedRelationship,
      expectedClassification: expectedRelationship == .transformedUse ? classification : nil,
      expectedTransformFamilies: family.map { [$0] } ?? [])
  }

  static func evaluation(
    entryID: String,
    family: TransformedSampleTransformFamily? = .pitch,
    score: Double = 0.9,
    resources: Bool = true,
    abstentionReason: TransformedSampleResearchAbstentionReason = .noSpecificMatch,
    classification: TransformedSampleRelationshipClassification = .directReuse,
    algorithmVersion: String = TransformedSampleResearchCapability.algorithmVersion
  ) -> TransformedSampleCorpusEvaluation {
    let measurement =
      resources
      ? TransformedSampleEvaluationResourceMeasurement(
        wallClockMilliseconds: 12,
        cpuMilliseconds: 8,
        peakResidentMegabytes: 20,
        bytesScanned: 4_096,
        decodedFrameCount: 48_000,
        comparedCandidateCount: 1)
      : nil
    if let family {
      return TransformedSampleCorpusEvaluation(
        entryID: entryID,
        algorithmVersion: algorithmVersion,
        emittedLabel: TransformedSampleResearchMatch.externalLabel,
        score: score,
        classification: classification,
        familyPredictions: [
          TransformedSampleFamilyPrediction(family: family, confidence: score)
        ],
        abstentionReason: nil,
        resources: measurement)
    }
    return TransformedSampleCorpusEvaluation(
      entryID: entryID,
      algorithmVersion: algorithmVersion,
      emittedLabel: nil,
      score: nil,
      classification: nil,
      familyPredictions: [],
      abstentionReason: abstentionReason,
      resources: measurement)
  }

  private static func transformedDuration(
    base: Double,
    transform: SyntheticTransform?
  ) -> Double {
    switch transform {
    case .timeStretch: base * 1.2
    case .duplication: base + 1
    case .removal: base - 1
    default: base
    }
  }

  private static func transformedSample(
    outputTime: Double,
    baseDuration: Double,
    transform: SyntheticTransform?
  ) -> Float {
    switch transform {
    case nil:
      return referenceSample(at: outputTime, duration: baseDuration)
    case .pitch:
      return referenceSample(at: outputTime, duration: baseDuration, pitchScale: 1.122_462)
    case .microtonal:
      return referenceSample(at: outputTime, duration: baseDuration, pitchScale: 1.011_619)
    case .timeStretch:
      return referenceSample(at: outputTime / 1.2, duration: baseDuration)
    case .equalization:
      return componentSample(at: outputTime, duration: baseDuration, low: 0.45, high: 1.45)
    case .compression:
      return tanh(referenceSample(at: outputTime, duration: baseDuration) * 2.8) * 0.62
    case .gain:
      return referenceSample(at: outputTime, duration: baseDuration) * 0.42
    case .filtering:
      return componentSample(at: outputTime, duration: baseDuration, low: 1, high: 0.08)
    case .bitcrush:
      let value = referenceSample(at: outputTime, duration: baseDuration)
      return (value * 12).rounded() / 12
    case .delay:
      return referenceSample(at: outputTime - 0.5, duration: baseDuration) * 0.82
        + referenceSample(at: outputTime - 1, duration: baseDuration) * 0.28
    case .distortion:
      return tanh(referenceSample(at: outputTime, duration: baseDuration) * 4.2) * 0.78
    case .reverb:
      return referenceSample(at: outputTime, duration: baseDuration) * 0.7
        + referenceSample(at: outputTime - 0.11, duration: baseDuration) * 0.2
        + referenceSample(at: outputTime - 0.29, duration: baseDuration) * 0.12
        + referenceSample(at: outputTime - 0.53, duration: baseDuration) * 0.08
    case .silence:
      return (2.0...2.65).contains(outputTime)
        ? 0 : referenceSample(at: outputTime, duration: baseDuration)
    case .duplication:
      let sourceTime =
        outputTime < 3 ? outputTime : (outputTime < 4 ? outputTime - 1 : outputTime - 1)
      return referenceSample(at: sourceTime, duration: baseDuration)
    case .removal:
      let sourceTime = outputTime < 2 ? outputTime : outputTime + 1
      return referenceSample(at: sourceTime, duration: baseDuration)
    case .reversal:
      return referenceSample(at: baseDuration - outputTime, duration: baseDuration)
    case .chopping:
      let order = [2, 0, 4, 1, 5, 3]
      let chunk = min(order.count - 1, max(0, Int(outputTime)))
      let sourceTime = Double(order[chunk]) + outputTime.truncatingRemainder(dividingBy: 1)
      return referenceSample(at: sourceTime, duration: baseDuration)
    case .unrelated:
      return unrelatedSample(at: outputTime)
    case .independentReperformance:
      return independentSample(at: outputTime)
    case .interpolationEvidence:
      return referenceSample(at: outputTime, duration: baseDuration) * 0.65
        + independentSample(at: outputTime) * 0.35
    case .rePerformanceEvidence:
      return rePerformedSample(at: outputTime, duration: baseDuration)
    case .ambiguousRelationship:
      return referenceSample(at: outputTime, duration: baseDuration, pitchScale: 1.059_463)
    case .composite:
      return tanh(referenceSample(at: outputTime, duration: baseDuration) * 3.1) * 0.4
    }
  }

  private static func referenceSample(
    at time: Double,
    duration: Double,
    pitchScale: Double = 1
  ) -> Float {
    guard time >= 0, time < duration else { return 0 }
    return componentSample(
      at: time,
      duration: duration,
      low: 1,
      high: 1,
      pitchScale: pitchScale)
  }

  private static func componentSample(
    at time: Double,
    duration: Double,
    low: Double,
    high: Double,
    pitchScale: Double = 1
  ) -> Float {
    guard time >= 0, time < duration else { return 0 }
    let amplitudes = [0.24, 0.82, 0.42, 0.96, 0.31, 0.69, 0.18, 0.88, 0.52, 0.28, 0.75, 0.39]
    let frequencies = [137.0, 223, 331, 181, 419, 263, 487, 307, 157, 379, 251, 443]
    let segment = min(amplitudes.count - 1, Int(time * 2))
    let envelope = amplitudes[segment]
    let frequency = frequencies[segment] * pitchScale
    let transient = time.truncatingRemainder(dividingBy: 0.5) < 0.035 ? 0.25 : 0
    let lowComponent = sin(2 * Double.pi * frequency * time) * 0.55 * low
    let highComponent = sin(2 * Double.pi * frequency * 3.17 * time) * 0.22 * high
    let click = sin(2 * Double.pi * 1_700 * time) * transient
    return Float(max(-1, min(1, envelope * (lowComponent + highComponent + click))))
  }

  private static func unrelatedSample(at time: Double) -> Float {
    let envelope = 0.2 + 0.6 * abs(sin(2 * Double.pi * 0.73 * time))
    return Float(
      envelope
        * (0.6 * sin(2 * Double.pi * (711 + 23 * time) * time)
          + 0.25 * sin(2 * Double.pi * 1_337 * time)))
  }

  private static func independentSample(at time: Double) -> Float {
    let segment = Int(time * 3) % 9
    let frequency = Double([911, 547, 1_223, 683, 1_487, 769, 1_039, 593, 1_357][segment])
    let envelope = [0.91, 0.12, 0.76, 0.22, 0.58, 0.97, 0.17, 0.66, 0.31][segment]
    return Float(
      envelope
        * (0.72 * sin(2 * Double.pi * frequency * time + 1.1)
          + 0.21 * sin(2 * Double.pi * frequency * 1.71 * time + 0.3)))
  }

  private static func rePerformedSample(at time: Double, duration: Double) -> Float {
    guard time >= 0, time < duration else { return 0 }
    let amplitudes = [0.22, 0.79, 0.45, 0.91, 0.35, 0.65, 0.21, 0.84, 0.49, 0.32, 0.71, 0.43]
    let frequencies = [137.0, 223, 331, 181, 419, 263, 487, 307, 157, 379, 251, 443]
    let segment = min(amplitudes.count - 1, Int(time * 2))
    let envelope = amplitudes[segment]
    let frequency = frequencies[segment]
    let phase = 0.83 + Double(segment) * 0.17
    let low = sin(2 * Double.pi * frequency * time + phase) * 0.57
    let high = sin(2 * Double.pi * frequency * 3.17 * time + phase * 1.71) * 0.2
    let transient =
      time.truncatingRemainder(dividingBy: 0.5) < 0.028
      ? sin(2 * Double.pi * 1_700 * time + 1.23) * 0.21 : 0
    return Float(max(-1, min(1, envelope * (low + high + transient))))
  }
}
