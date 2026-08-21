import Foundation

public enum TransformedSampleResearchAvailability: String, Codable, Sendable {
  case unavailable
  case localResearchOnly
}

public struct TransformedSampleResearchCapability: Codable, Sendable, Equatable {
  public static let currentSchemaVersion = 1
  public static let algorithmVersion = "local-transformed-sample-research-v4"

  public let schemaVersion: Int
  public let algorithmVersion: String
  public let availability: TransformedSampleResearchAvailability

  public init(
    availability: TransformedSampleResearchAvailability = .unavailable
  ) {
    schemaVersion = Self.currentSchemaVersion
    algorithmVersion = Self.algorithmVersion
    self.availability = availability
  }

  public var permitsLocalResearch: Bool {
    isWellFormed && availability == .localResearchOnly
  }

  public var isWellFormed: Bool {
    schemaVersion == Self.currentSchemaVersion
      && algorithmVersion == Self.algorithmVersion
  }
}

public enum TransformedSampleTransformFamily: String, Codable, Sendable, CaseIterable {
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

  fileprivate var allowedParameters: Set<TransformedSampleParameterName> {
    switch self {
    case .pitch: [.semitones]
    case .microtonal: [.cents]
    case .timeStretch: [.timeFactor]
    case .equalization: [.lowGainDB, .midGainDB, .highGainDB]
    case .compression: [.thresholdDB, .ratio]
    case .gain: [.gainDB]
    case .filtering: [.cutoffHz, .resonance]
    case .bitcrush: [.bitDepth]
    case .delay: [.delayMilliseconds, .feedback]
    case .distortion: [.drive]
    case .reverb: [.wetMix, .decaySeconds]
    case .silence: [.durationSeconds]
    case .duplication: [.occurrenceCount, .durationSeconds]
    case .removal: [.durationSeconds]
    case .reversal: [.reversedFraction]
    case .chopping: [.segmentSeconds, .reorderedFraction]
    }
  }
}

public enum TransformedSampleParameterName: String, Codable, Sendable, CaseIterable {
  case semitones
  case cents
  case timeFactor
  case lowGainDB
  case midGainDB
  case highGainDB
  case thresholdDB
  case ratio
  case gainDB
  case cutoffHz
  case resonance
  case bitDepth
  case delayMilliseconds
  case feedback
  case drive
  case wetMix
  case decaySeconds
  case durationSeconds
  case occurrenceCount
  case reversedFraction
  case segmentSeconds
  case reorderedFraction

  fileprivate var expectedUnit: TransformedSampleParameterUnit {
    switch self {
    case .semitones: .semitones
    case .cents: .cents
    case .timeFactor, .drive: .factor
    case .ratio, .resonance, .feedback, .wetMix: .ratio
    case .lowGainDB, .midGainDB, .highGainDB, .thresholdDB, .gainDB: .decibels
    case .cutoffHz: .hertz
    case .bitDepth: .bits
    case .delayMilliseconds: .milliseconds
    case .decaySeconds, .durationSeconds, .segmentSeconds: .seconds
    case .occurrenceCount: .count
    case .reversedFraction, .reorderedFraction: .fraction
    }
  }

  fileprivate func permits(lowerBound: Double, upperBound: Double) -> Bool {
    switch self {
    case .reversedFraction, .reorderedFraction, .feedback, .wetMix, .resonance:
      lowerBound >= 0 && upperBound <= 1
    case .timeFactor, .ratio, .cutoffHz, .bitDepth, .delayMilliseconds, .drive,
      .decaySeconds, .durationSeconds, .occurrenceCount, .segmentSeconds:
      lowerBound >= 0
    case .semitones, .cents, .lowGainDB, .midGainDB, .highGainDB, .thresholdDB,
      .gainDB:
      true
    }
  }
}

public enum TransformedSampleParameterUnit: String, Codable, Sendable {
  case semitones
  case cents
  case factor
  case decibels
  case ratio
  case hertz
  case bits
  case milliseconds
  case seconds
  case count
  case fraction
}

public struct TransformedSampleParameterRange: Codable, Sendable, Equatable {
  public let name: TransformedSampleParameterName
  public let lowerBound: Double
  public let upperBound: Double
  public let unit: TransformedSampleParameterUnit

  public init(
    name: TransformedSampleParameterName,
    lowerBound: Double,
    upperBound: Double,
    unit: TransformedSampleParameterUnit
  ) {
    self.name = name
    self.lowerBound = lowerBound
    self.upperBound = upperBound
    self.unit = unit
  }

  fileprivate var isWellFormed: Bool {
    lowerBound.isFinite && upperBound.isFinite && lowerBound <= upperBound
      && name.expectedUnit == unit
      && name.permits(lowerBound: lowerBound, upperBound: upperBound)
  }
}

public struct TransformedSampleTransformHypothesis: Codable, Sendable, Equatable {
  public let family: TransformedSampleTransformFamily
  public let parameters: [TransformedSampleParameterRange]
  public let confidence: Double

  public init(
    family: TransformedSampleTransformFamily,
    parameters: [TransformedSampleParameterRange],
    confidence: Double
  ) {
    self.family = family
    self.parameters = parameters.sorted { $0.name.rawValue < $1.name.rawValue }
    self.confidence = confidence
  }

  public var isWellFormed: Bool {
    confidence.isFinite && (0...1).contains(confidence)
      && !parameters.isEmpty
      && Set(parameters.map(\.name)).count == parameters.count
      && parameters.allSatisfy { parameter in
        parameter.isWellFormed && family.allowedParameters.contains(parameter.name)
      }
  }
}

public struct TransformedSampleTimeRange: Codable, Sendable, Equatable {
  public let startSeconds: Double
  public let durationSeconds: Double

  public init(startSeconds: Double, durationSeconds: Double) {
    self.startSeconds = startSeconds
    self.durationSeconds = durationSeconds
  }

  public var isWellFormed: Bool {
    startSeconds.isFinite && startSeconds >= 0
      && durationSeconds.isFinite && durationSeconds > 0
  }
}

public enum TransformedSampleRelationshipClassification: String, Codable, Sendable {
  case directReuse
  case possibleInterpolation
  case possibleReperformance
  case unknown
}

public enum TransformedSampleRelationshipAbstentionReason: String, Codable, Sendable {
  case lowEvidence
  case conflictingEvidence
  case malformedEvidence
  case indeterminate
}

public enum TransformedSampleRelationshipClassificationDisposition: Codable, Sendable, Equatable {
  case classified(TransformedSampleRelationshipClassification)
  case abstained(TransformedSampleRelationshipAbstentionReason)
}

public struct TransformedSampleRelationshipEvidence: Codable, Sendable, Equatable {
  public let waveformCorrelation: Double
  public let forwardFeatureSimilarity: Double
  public let reverseFeatureSimilarity: Double
  public let unorderedFeatureSimilarity: Double
  public let durationRatio: Double
  public let dominantFrequencyRatio: Double

  public init(
    waveformCorrelation: Double,
    forwardFeatureSimilarity: Double,
    reverseFeatureSimilarity: Double,
    unorderedFeatureSimilarity: Double,
    durationRatio: Double,
    dominantFrequencyRatio: Double
  ) {
    self.waveformCorrelation = waveformCorrelation
    self.forwardFeatureSimilarity = forwardFeatureSimilarity
    self.reverseFeatureSimilarity = reverseFeatureSimilarity
    self.unorderedFeatureSimilarity = unorderedFeatureSimilarity
    self.durationRatio = durationRatio
    self.dominantFrequencyRatio = dominantFrequencyRatio
  }

  public var isWellFormed: Bool {
    [
      waveformCorrelation,
      forwardFeatureSimilarity,
      reverseFeatureSimilarity,
      unorderedFeatureSimilarity,
    ].allSatisfy { $0.isFinite && (0...1).contains($0) }
      && durationRatio.isFinite && durationRatio > 0
      && dominantFrequencyRatio.isFinite && dominantFrequencyRatio > 0
  }

  public var conservativeClassificationDisposition:
    TransformedSampleRelationshipClassificationDisposition
  {
    guard isWellFormed else { return .abstained(.malformedEvidence) }
    if waveformCorrelation >= 0.97, forwardFeatureSimilarity >= 0.72 {
      return .classified(.directReuse)
    }
    if (0.45...0.94).contains(waveformCorrelation),
      max(forwardFeatureSimilarity, unorderedFeatureSimilarity) >= 0.78,
      reverseFeatureSimilarity
        <= max(forwardFeatureSimilarity, unorderedFeatureSimilarity) - 0.08
    {
      return .classified(.possibleInterpolation)
    }
    if waveformCorrelation <= 0.30,
      forwardFeatureSimilarity >= 0.76,
      (0.96...1.04).contains(durationRatio),
      (0.97...1.03).contains(dominantFrequencyRatio),
      reverseFeatureSimilarity <= forwardFeatureSimilarity - 0.03,
      unorderedFeatureSimilarity <= forwardFeatureSimilarity + 0.02
    {
      return .classified(.possibleReperformance)
    }
    let strongestStructuralSignal = max(
      forwardFeatureSimilarity,
      unorderedFeatureSimilarity)
    if (waveformCorrelation > 0.94 && waveformCorrelation < 0.97
      && strongestStructuralSignal >= 0.78)
      || (waveformCorrelation >= 0.45 && strongestStructuralSignal >= 0.78
        && reverseFeatureSimilarity > strongestStructuralSignal - 0.08)
    {
      return .abstained(.conflictingEvidence)
    }
    if max(
      waveformCorrelation,
      forwardFeatureSimilarity,
      reverseFeatureSimilarity,
      unorderedFeatureSimilarity) < 0.65
    {
      return .abstained(.lowEvidence)
    }
    return .abstained(.indeterminate)
  }

  public var conservativeClassification: TransformedSampleRelationshipClassification {
    guard case .classified(let classification) = conservativeClassificationDisposition else {
      return .unknown
    }
    return classification
  }
}

public struct TransformedSampleImmutableFileObservation: Codable, Sendable, Equatable {
  public let contentSHA256: String
  public let bytes: Int64
  public let modifiedAtNanoseconds: Int64?
  public let resourceIdentity: String?
  public let sampleRate: Double
  public let channelCount: Int
  public let frameCount: Int64

  public init(
    contentSHA256: String,
    bytes: Int64,
    modifiedAtNanoseconds: Int64?,
    resourceIdentity: String?,
    sampleRate: Double,
    channelCount: Int,
    frameCount: Int64
  ) {
    self.contentSHA256 = contentSHA256
    self.bytes = bytes
    self.modifiedAtNanoseconds = modifiedAtNanoseconds
    self.resourceIdentity = resourceIdentity
    self.sampleRate = sampleRate
    self.channelCount = channelCount
    self.frameCount = frameCount
  }

  public var durationSeconds: Double {
    Double(frameCount) / sampleRate
  }

  public var isWellFormed: Bool {
    contentSHA256.count == 64
      && contentSHA256.allSatisfy(\.isHexDigit)
      && bytes >= 0
      && sampleRate.isFinite && sampleRate > 0
      && channelCount > 0
      && frameCount > 0
  }
}

public struct TransformedSampleResearchCandidate: Sendable, Equatable {
  public let candidateID: String
  public let fileURL: URL

  public init(candidateID: String, fileURL: URL) {
    self.candidateID = candidateID
    self.fileURL = fileURL.standardizedFileURL
  }
}

public struct TransformedSampleResearchRequest: Sendable, Equatable {
  public let sourceID: String
  public let sourceURL: URL
  public let candidates: [TransformedSampleResearchCandidate]

  public init(
    sourceID: String,
    sourceURL: URL,
    candidates: [TransformedSampleResearchCandidate]
  ) {
    self.sourceID = sourceID
    self.sourceURL = sourceURL.standardizedFileURL
    self.candidates = candidates
  }
}

public struct TransformedSampleResearchResourceUsage: Codable, Sendable, Equatable {
  public let decodedFrameCount: Int64
  public let comparedCandidateCount: Int
  public let comparedWindowPairCount: Int
  public let bytesScanned: Int64
  public let workingMemoryUpperBoundBytes: Int64

  public init(
    decodedFrameCount: Int64,
    comparedCandidateCount: Int,
    comparedWindowPairCount: Int,
    bytesScanned: Int64,
    workingMemoryUpperBoundBytes: Int64
  ) {
    self.decodedFrameCount = decodedFrameCount
    self.comparedCandidateCount = comparedCandidateCount
    self.comparedWindowPairCount = comparedWindowPairCount
    self.bytesScanned = bytesScanned
    self.workingMemoryUpperBoundBytes = workingMemoryUpperBoundBytes
  }

  public var isWellFormed: Bool {
    decodedFrameCount > 0
      && comparedCandidateCount > 0
      && comparedWindowPairCount > 0
      && bytesScanned > 0
      && workingMemoryUpperBoundBytes > 0
  }
}

public struct TransformedSampleResearchMatch: Codable, Sendable, Equatable {
  public static let externalLabel = "Possible transformed use"

  public let candidateID: String
  public let label: String
  public let classification: TransformedSampleRelationshipClassification
  public let score: Double
  public let runnerUpMargin: Double
  public let sourceRange: TransformedSampleTimeRange
  public let targetRange: TransformedSampleTimeRange
  public let hypotheses: [TransformedSampleTransformHypothesis]
  public let relationshipEvidence: TransformedSampleRelationshipEvidence
  public let sourceObservation: TransformedSampleImmutableFileObservation
  public let targetObservation: TransformedSampleImmutableFileObservation
  public let algorithmVersion: String
  public let resourceUsage: TransformedSampleResearchResourceUsage

  public init(
    candidateID: String,
    classification: TransformedSampleRelationshipClassification,
    score: Double,
    runnerUpMargin: Double,
    sourceRange: TransformedSampleTimeRange,
    targetRange: TransformedSampleTimeRange,
    hypotheses: [TransformedSampleTransformHypothesis],
    relationshipEvidence: TransformedSampleRelationshipEvidence,
    sourceObservation: TransformedSampleImmutableFileObservation,
    targetObservation: TransformedSampleImmutableFileObservation,
    algorithmVersion: String,
    resourceUsage: TransformedSampleResearchResourceUsage
  ) {
    self.candidateID = candidateID
    label = Self.externalLabel
    self.classification = classification
    self.score = score
    self.runnerUpMargin = runnerUpMargin
    self.sourceRange = sourceRange
    self.targetRange = targetRange
    self.hypotheses = hypotheses.sorted { $0.family.rawValue < $1.family.rawValue }
    self.relationshipEvidence = relationshipEvidence
    self.sourceObservation = sourceObservation
    self.targetObservation = targetObservation
    self.algorithmVersion = algorithmVersion
    self.resourceUsage = resourceUsage
  }

  public var isWellFormedResearchEvidence: Bool {
    label == Self.externalLabel
      && score.isFinite && (0...1).contains(score)
      && runnerUpMargin.isFinite && (0...1).contains(runnerUpMargin)
      && sourceRange.isWellFormed && targetRange.isWellFormed
      && !hypotheses.isEmpty && hypotheses.allSatisfy(\.isWellFormed)
      && relationshipEvidence.isWellFormed
      && relationshipEvidence.conservativeClassificationDisposition == .classified(classification)
      && classification != .unknown
      && sourceObservation.isWellFormed && targetObservation.isWellFormed
      && sourceObservation.contentSHA256 != targetObservation.contentSHA256
      && resourceUsage.isWellFormed
      && algorithmVersion == TransformedSampleResearchCapability.algorithmVersion
  }

  private enum CodingKeys: String, CodingKey {
    case candidateID
    case label
    case classification
    case score
    case runnerUpMargin
    case sourceRange
    case targetRange
    case hypotheses
    case relationshipEvidence
    case sourceObservation
    case targetObservation
    case algorithmVersion
    case resourceUsage
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    candidateID = try container.decode(String.self, forKey: .candidateID)
    label = try container.decode(String.self, forKey: .label)
    classification = try container.decode(
      TransformedSampleRelationshipClassification.self,
      forKey: .classification)
    score = try container.decode(Double.self, forKey: .score)
    runnerUpMargin = try container.decode(Double.self, forKey: .runnerUpMargin)
    sourceRange = try container.decode(TransformedSampleTimeRange.self, forKey: .sourceRange)
    targetRange = try container.decode(TransformedSampleTimeRange.self, forKey: .targetRange)
    hypotheses = try container.decode(
      [TransformedSampleTransformHypothesis].self,
      forKey: .hypotheses)
    relationshipEvidence = try container.decode(
      TransformedSampleRelationshipEvidence.self,
      forKey: .relationshipEvidence)
    sourceObservation = try container.decode(
      TransformedSampleImmutableFileObservation.self,
      forKey: .sourceObservation)
    targetObservation = try container.decode(
      TransformedSampleImmutableFileObservation.self,
      forKey: .targetObservation)
    algorithmVersion = try container.decode(String.self, forKey: .algorithmVersion)
    resourceUsage = try container.decode(
      TransformedSampleResearchResourceUsage.self,
      forKey: .resourceUsage)
    guard isWellFormedResearchEvidence else {
      throw DecodingError.dataCorruptedError(
        forKey: .algorithmVersion,
        in: container,
        debugDescription: "Unsupported or malformed transformed-sample match evidence.")
    }
  }
}

public enum TransformedSampleResearchAbstentionReason: String, Codable, Sendable, CaseIterable {
  case capabilityUnavailable
  case invalidRequest
  case candidateLimitExceeded
  case resourceLimitExceeded
  case unreadableAudio
  case insufficientDuration
  case immutableObservationChanged
  case byteIdenticalNotTransformedUse
  case relationshipLowEvidence
  case relationshipConflictingEvidence
  case relationshipMalformedEvidence
  case relationshipIndeterminate
  case noSpecificMatch
  case ambiguousMatch
}

public struct TransformedSampleResearchAbstention: Codable, Sendable, Equatable {
  public let candidateID: String?
  public let reason: TransformedSampleResearchAbstentionReason

  public init(candidateID: String? = nil, reason: TransformedSampleResearchAbstentionReason) {
    self.candidateID = candidateID
    self.reason = reason
  }
}

public struct TransformedSampleResearchResult: Codable, Sendable, Equatable {
  public let schemaVersion: Int
  public let capability: TransformedSampleResearchCapability
  public let matches: [TransformedSampleResearchMatch]
  public let abstentions: [TransformedSampleResearchAbstention]

  public init(
    capability: TransformedSampleResearchCapability,
    matches: [TransformedSampleResearchMatch],
    abstentions: [TransformedSampleResearchAbstention]
  ) {
    schemaVersion = TransformedSampleResearchCapability.currentSchemaVersion
    self.capability = capability
    self.matches = matches.sorted {
      if $0.score != $1.score { return $0.score > $1.score }
      return $0.candidateID < $1.candidateID
    }
    self.abstentions = abstentions.sorted {
      ($0.candidateID ?? "", $0.reason.rawValue) < ($1.candidateID ?? "", $1.reason.rawValue)
    }
  }

  public var isWellFormedResearchResult: Bool {
    schemaVersion == TransformedSampleResearchCapability.currentSchemaVersion
      && capability.isWellFormed
      && (matches.isEmpty || capability.permitsLocalResearch)
      && matches.allSatisfy {
        $0.isWellFormedResearchEvidence
          && $0.algorithmVersion == capability.algorithmVersion
      }
  }

  private enum CodingKeys: String, CodingKey {
    case schemaVersion
    case capability
    case matches
    case abstentions
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
    capability = try container.decode(TransformedSampleResearchCapability.self, forKey: .capability)
    matches = try container.decode([TransformedSampleResearchMatch].self, forKey: .matches)
    abstentions = try container.decode(
      [TransformedSampleResearchAbstention].self,
      forKey: .abstentions)
    guard isWellFormedResearchResult else {
      throw DecodingError.dataCorruptedError(
        forKey: .capability,
        in: container,
        debugDescription: "Unsupported or mixed-version transformed-sample result evidence.")
    }
  }
}
