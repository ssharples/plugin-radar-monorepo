import CryptoKit
import Foundation

public enum TransformedSampleCorpusOriginKind: String, Codable, Sendable {
  case syntheticAugmentation
  case realProducerLabel
}

public struct TransformedSampleCorpusOrigin: Codable, Sendable, Equatable {
  public let kind: TransformedSampleCorpusOriginKind
  public let generatorVersion: String?
  public let augmentationSeed: UInt64?
  public let labelReviewID: String?
  public let rightsEvidenceID: String?

  public init(
    kind: TransformedSampleCorpusOriginKind,
    generatorVersion: String? = nil,
    augmentationSeed: UInt64? = nil,
    labelReviewID: String? = nil,
    rightsEvidenceID: String? = nil
  ) {
    self.kind = kind
    self.generatorVersion = generatorVersion
    self.augmentationSeed = augmentationSeed
    self.labelReviewID = labelReviewID
    self.rightsEvidenceID = rightsEvidenceID
  }

  fileprivate var isWellFormed: Bool {
    switch kind {
    case .syntheticAugmentation:
      nonempty(generatorVersion) && augmentationSeed != nil
        && labelReviewID == nil && rightsEvidenceID == nil
    case .realProducerLabel:
      generatorVersion == nil && augmentationSeed == nil
        && nonempty(labelReviewID) && nonempty(rightsEvidenceID)
    }
  }
}

public enum TransformedSampleCorpusSplit: String, Codable, Sendable, CaseIterable {
  case training
  case validation
  case heldOut
}

public enum TransformedSampleExpectedRelationship: String, Codable, Sendable {
  case transformedUse
  case unrelated
  case independentReperformance
}

public struct TransformedSampleCorpusEntry: Codable, Sendable, Equatable {
  public let id: String
  public let artistGroupDigest: String
  public let songGroupDigest: String
  public let sourceObservationDigest: String
  public let targetObservationDigest: String
  public let origin: TransformedSampleCorpusOrigin
  public let split: TransformedSampleCorpusSplit
  public let expectedRelationship: TransformedSampleExpectedRelationship
  public let expectedClassification: TransformedSampleRelationshipClassification?
  public let expectedTransformFamilies: [TransformedSampleTransformFamily]

  public init(
    id: String,
    artistGroupDigest: String,
    songGroupDigest: String,
    sourceObservationDigest: String,
    targetObservationDigest: String,
    origin: TransformedSampleCorpusOrigin,
    split: TransformedSampleCorpusSplit,
    expectedRelationship: TransformedSampleExpectedRelationship,
    expectedClassification: TransformedSampleRelationshipClassification?,
    expectedTransformFamilies: [TransformedSampleTransformFamily]
  ) {
    self.id = id
    self.artistGroupDigest = artistGroupDigest
    self.songGroupDigest = songGroupDigest
    self.sourceObservationDigest = sourceObservationDigest
    self.targetObservationDigest = targetObservationDigest
    self.origin = origin
    self.split = split
    self.expectedRelationship = expectedRelationship
    self.expectedClassification = expectedClassification
    self.expectedTransformFamilies = Array(Set(expectedTransformFamilies)).sorted {
      $0.rawValue < $1.rawValue
    }
  }
}

public struct TransformedSampleCorpusManifest: Codable, Sendable, Equatable {
  public static let currentSchemaVersion = 1
  public static let maximumEntryCount = 10_000

  public let schemaVersion: Int
  public let corpusID: String
  public let entries: [TransformedSampleCorpusEntry]

  public init(
    schemaVersion: Int = Self.currentSchemaVersion,
    corpusID: String,
    entries: [TransformedSampleCorpusEntry]
  ) {
    self.schemaVersion = schemaVersion
    self.corpusID = corpusID
    self.entries = entries.sorted { $0.id < $1.id }
  }

  public func validated() throws -> TransformedSampleCorpusManifest {
    guard schemaVersion == Self.currentSchemaVersion else {
      throw TransformedSampleCorpusError.unsupportedSchemaVersion(schemaVersion)
    }
    guard validIdentifier(corpusID), !entries.isEmpty,
      entries.count <= Self.maximumEntryCount
    else { throw TransformedSampleCorpusError.invalidManifest("corpus bounds") }
    guard Set(entries.map(\.id)).count == entries.count else {
      throw TransformedSampleCorpusError.duplicateEntryID
    }
    for entry in entries {
      try validate(entry)
    }
    try validateIsolation()
    return self
  }

  public func deterministicData() throws -> Data {
    _ = try validated()
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(self)
  }

  public func deterministicDigest() throws -> String {
    SHA256.hash(data: try deterministicData())
      .map { String(format: "%02x", $0) }
      .joined()
  }

  public var containsOnlySyntheticAugmentation: Bool {
    entries.allSatisfy { $0.origin.kind == .syntheticAugmentation }
  }

  private func validate(_ entry: TransformedSampleCorpusEntry) throws {
    guard validIdentifier(entry.id), isDigest(entry.artistGroupDigest),
      isDigest(entry.songGroupDigest), isDigest(entry.sourceObservationDigest),
      isDigest(entry.targetObservationDigest), entry.origin.isWellFormed
    else { throw TransformedSampleCorpusError.invalidEntry(entry.id) }
    switch entry.expectedRelationship {
    case .transformedUse:
      guard let expectedClassification = entry.expectedClassification,
        expectedClassification != .unknown,
        !entry.expectedTransformFamilies.isEmpty,
        entry.sourceObservationDigest != entry.targetObservationDigest
      else { throw TransformedSampleCorpusError.invalidEntry(entry.id) }
    case .unrelated, .independentReperformance:
      guard entry.expectedClassification == nil,
        entry.expectedTransformFamilies.isEmpty
      else { throw TransformedSampleCorpusError.invalidEntry(entry.id) }
    }
  }

  private func validateIsolation() throws {
    var artistSplits: [String: Set<TransformedSampleCorpusSplit>] = [:]
    var songSplits: [String: Set<TransformedSampleCorpusSplit>] = [:]
    for entry in entries {
      artistSplits[entry.artistGroupDigest, default: []].insert(entry.split)
      songSplits[entry.songGroupDigest, default: []].insert(entry.split)
    }
    if let artist = artistSplits.filter({ $0.value.count > 1 }).keys.sorted().first {
      throw TransformedSampleCorpusError.artistSplitLeakage(artist)
    }
    if let song = songSplits.filter({ $0.value.count > 1 }).keys.sorted().first {
      throw TransformedSampleCorpusError.songSplitLeakage(song)
    }
  }
}

public enum TransformedSampleCorpusError: Error, LocalizedError, Equatable {
  case unsupportedSchemaVersion(Int)
  case invalidManifest(String)
  case invalidEntry(String)
  case duplicateEntryID
  case artistSplitLeakage(String)
  case songSplitLeakage(String)
  case duplicateEvaluationID
  case unknownEvaluationEntry(String)
  case invalidEvaluation(String)
  case invalidGateEvidence(String)

  public var errorDescription: String? {
    switch self {
    case .unsupportedSchemaVersion(let version):
      "Unsupported transformed-sample corpus schema version: \(version)."
    case .invalidManifest(let reason):
      "Invalid transformed-sample corpus manifest: \(reason)."
    case .invalidEntry(let id):
      "Invalid transformed-sample corpus entry: \(id)."
    case .duplicateEntryID:
      "Transformed-sample corpus entry IDs must be unique."
    case .artistSplitLeakage(let digest):
      "Artist group \(digest) appears in more than one corpus split."
    case .songSplitLeakage(let digest):
      "Song group \(digest) appears in more than one corpus split."
    case .duplicateEvaluationID:
      "Each corpus entry may have only one evaluation."
    case .unknownEvaluationEntry(let id):
      "Evaluation references unknown corpus entry: \(id)."
    case .invalidEvaluation(let id):
      "Evaluation is malformed for corpus entry: \(id)."
    case .invalidGateEvidence(let field):
      "Transformed-sample gate evidence is malformed: \(field)."
    }
  }
}

public struct TransformedSampleEvaluationResourceMeasurement: Codable, Sendable, Equatable {
  public let wallClockMilliseconds: Double
  public let cpuMilliseconds: Double
  public let peakResidentMegabytes: Double
  public let bytesScanned: Int64
  public let decodedFrameCount: Int64
  public let comparedCandidateCount: Int

  public init(
    wallClockMilliseconds: Double,
    cpuMilliseconds: Double,
    peakResidentMegabytes: Double,
    bytesScanned: Int64,
    decodedFrameCount: Int64,
    comparedCandidateCount: Int
  ) {
    self.wallClockMilliseconds = wallClockMilliseconds
    self.cpuMilliseconds = cpuMilliseconds
    self.peakResidentMegabytes = peakResidentMegabytes
    self.bytesScanned = bytesScanned
    self.decodedFrameCount = decodedFrameCount
    self.comparedCandidateCount = comparedCandidateCount
  }

  fileprivate var isWellFormed: Bool {
    wallClockMilliseconds.isFinite && wallClockMilliseconds >= 0
      && cpuMilliseconds.isFinite && cpuMilliseconds >= 0
      && peakResidentMegabytes.isFinite && peakResidentMegabytes >= 0
      && bytesScanned >= 0 && decodedFrameCount >= 0 && comparedCandidateCount >= 0
  }
}

public struct TransformedSampleFamilyPrediction: Codable, Sendable, Equatable {
  public let family: TransformedSampleTransformFamily
  public let confidence: Double

  public init(family: TransformedSampleTransformFamily, confidence: Double) {
    self.family = family
    self.confidence = confidence
  }

  fileprivate var isWellFormed: Bool {
    confidence.isFinite && confidence > 0 && confidence <= 1
  }
}

public struct TransformedSampleCorpusEvaluation: Codable, Sendable, Equatable {
  public let entryID: String
  public let algorithmVersion: String
  public let emittedLabel: String?
  public let score: Double?
  public let classification: TransformedSampleRelationshipClassification?
  public let familyPredictions: [TransformedSampleFamilyPrediction]
  public let abstentionReason: TransformedSampleResearchAbstentionReason?
  public let resources: TransformedSampleEvaluationResourceMeasurement?

  public init(
    entryID: String,
    algorithmVersion: String = TransformedSampleResearchCapability.algorithmVersion,
    emittedLabel: String?,
    score: Double?,
    classification: TransformedSampleRelationshipClassification?,
    familyPredictions: [TransformedSampleFamilyPrediction],
    abstentionReason: TransformedSampleResearchAbstentionReason?,
    resources: TransformedSampleEvaluationResourceMeasurement?
  ) {
    self.entryID = entryID
    self.algorithmVersion = algorithmVersion
    self.emittedLabel = emittedLabel
    self.score = score
    self.classification = classification
    self.familyPredictions = familyPredictions.sorted {
      $0.family.rawValue < $1.family.rawValue
    }
    self.abstentionReason = abstentionReason
    self.resources = resources
  }

  fileprivate var emittedPrediction: Bool {
    emittedLabel == TransformedSampleResearchMatch.externalLabel
  }

  public var predictedTransformFamilies: [TransformedSampleTransformFamily] {
    familyPredictions.map(\.family)
  }

  fileprivate func confidence(for family: TransformedSampleTransformFamily) -> Double {
    familyPredictions.first(where: { $0.family == family })?.confidence ?? 0
  }

  fileprivate var isWellFormed: Bool {
    guard validIdentifier(entryID),
      algorithmVersion == TransformedSampleResearchCapability.algorithmVersion,
      resources?.isWellFormed ?? true
    else { return false }
    if emittedPrediction {
      return score.map { $0.isFinite && (0...1).contains($0) } == true
        && classification != nil && classification != .unknown && !familyPredictions.isEmpty
        && familyPredictions.allSatisfy(\.isWellFormed)
        && Set(familyPredictions.map(\.family)).count == familyPredictions.count
        && abstentionReason == nil && resources != nil
    }
    return emittedLabel == nil && score == nil && classification == nil
      && familyPredictions.isEmpty && abstentionReason != nil
  }

  private enum CodingKeys: String, CodingKey {
    case entryID
    case algorithmVersion
    case emittedLabel
    case score
    case classification
    case familyPredictions
    case abstentionReason
    case resources
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    entryID = try container.decode(String.self, forKey: .entryID)
    algorithmVersion = try container.decode(String.self, forKey: .algorithmVersion)
    emittedLabel = try container.decodeIfPresent(String.self, forKey: .emittedLabel)
    score = try container.decodeIfPresent(Double.self, forKey: .score)
    classification = try container.decodeIfPresent(
      TransformedSampleRelationshipClassification.self,
      forKey: .classification)
    familyPredictions = try container.decode(
      [TransformedSampleFamilyPrediction].self,
      forKey: .familyPredictions)
    abstentionReason = try container.decodeIfPresent(
      TransformedSampleResearchAbstentionReason.self,
      forKey: .abstentionReason)
    resources = try container.decodeIfPresent(
      TransformedSampleEvaluationResourceMeasurement.self,
      forKey: .resources)
    guard isWellFormed else {
      throw DecodingError.dataCorruptedError(
        forKey: .algorithmVersion,
        in: container,
        debugDescription: "Unsupported or malformed transformed-sample evaluation evidence.")
    }
  }
}

public struct TransformedSampleMetricResources: Codable, Sendable, Equatable {
  public let measuredCount: Int
  public let meanWallClockMilliseconds: Double?
  public let meanCPUMilliseconds: Double?
  public let maximumPeakResidentMegabytes: Double?
  public let totalBytesScanned: Int64?
  public let totalDecodedFrameCount: Int64?
  public let totalComparedCandidateCount: Int?

  fileprivate var isWellFormed: Bool {
    guard measuredCount >= 0 else { return false }
    if measuredCount == 0 {
      return meanWallClockMilliseconds == nil && meanCPUMilliseconds == nil
        && maximumPeakResidentMegabytes == nil && totalBytesScanned == nil
        && totalDecodedFrameCount == nil && totalComparedCandidateCount == nil
    }
    return (meanWallClockMilliseconds.map(finiteNonnegative) ?? true)
      && (meanCPUMilliseconds.map(finiteNonnegative) ?? true)
      && (maximumPeakResidentMegabytes.map(finiteNonnegative) ?? true)
      && (totalBytesScanned.map { $0 >= 0 } ?? true)
      && (totalDecodedFrameCount.map { $0 >= 0 } ?? true)
      && (totalComparedCandidateCount.map { $0 >= 0 } ?? true)
  }
}

public struct TransformedSampleTransformMetrics: Codable, Sendable, Equatable {
  public let family: TransformedSampleTransformFamily
  public let reviewedCount: Int
  public let truePositiveCount: Int
  public let falsePositiveCount: Int
  public let falseNegativeCount: Int
  public let precision: Double?
  public let recall: Double?
  public let brierScore: Double?
  public let meanAbsoluteCalibrationError: Double?
  public let abstentionRate: Double?
  public let coverage: Double?
  public let resources: TransformedSampleMetricResources

  fileprivate var isWellFormed: Bool {
    guard reviewedCount >= 0,
      truePositiveCount >= 0,
      falsePositiveCount >= 0,
      falseNegativeCount >= 0,
      truePositiveCount <= reviewedCount,
      falsePositiveCount <= reviewedCount,
      falseNegativeCount <= reviewedCount,
      resources.measuredCount <= reviewedCount,
      resources.isWellFormed
    else { return false }
    return [precision, recall, brierScore, meanAbsoluteCalibrationError, abstentionRate, coverage]
      .allSatisfy { $0.map(validProbability) ?? true }
  }
}

public enum TransformedSampleEvaluationGateStatus: String, Codable, Sendable {
  case notRun
  case ineligible
  case acceptedForResearchReview
}

public enum TransformedSampleActivationAvailability: String, Codable, Sendable {
  case unavailableResearchOnly
}

public enum TransformedSamplePartitionIsolationStatus: String, Codable, Sendable {
  case passed
}

public struct TransformedSampleEvaluationArtifactBinding: Codable, Sendable, Equatable {
  public let manifestDigest: String
  public let evaluationDigest: String
  public let algorithmVersion: String
  public let artifactID: String

  public init(
    manifestDigest: String,
    evaluationDigest: String,
    algorithmVersion: String,
    artifactID: String
  ) {
    self.manifestDigest = manifestDigest
    self.evaluationDigest = evaluationDigest
    self.algorithmVersion = algorithmVersion
    self.artifactID = artifactID
  }

  public var isWellFormed: Bool {
    isDigest(manifestDigest)
      && isDigest(evaluationDigest)
      && algorithmVersion == TransformedSampleResearchCapability.algorithmVersion
      && artifactID
        == transformedSampleArtifactID(
          manifestDigest: manifestDigest,
          evaluationDigest: evaluationDigest,
          algorithmVersion: algorithmVersion)
  }

  private enum CodingKeys: String, CodingKey {
    case manifestDigest
    case evaluationDigest
    case algorithmVersion
    case artifactID
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    manifestDigest = try container.decode(String.self, forKey: .manifestDigest)
    evaluationDigest = try container.decode(String.self, forKey: .evaluationDigest)
    algorithmVersion = try container.decode(String.self, forKey: .algorithmVersion)
    artifactID = try container.decode(String.self, forKey: .artifactID)
    guard isWellFormed else {
      throw DecodingError.dataCorruptedError(
        forKey: .algorithmVersion,
        in: container,
        debugDescription: "Unsupported or inconsistent transformed-sample artifact binding.")
    }
  }
}

public struct TransformedSampleLabelledCorpusGateEvidence: Codable, Sendable, Equatable {
  public let artifactBinding: TransformedSampleEvaluationArtifactBinding
  public let minimumHeldOutExamplesPerTransform: Int
  public let minimumHeldOutNegativeCount: Int
  public let minimumPrecision: Double
  public let minimumRecall: Double
  public let maximumBrierScore: Double

  public init(
    artifactBinding: TransformedSampleEvaluationArtifactBinding,
    minimumHeldOutExamplesPerTransform: Int,
    minimumHeldOutNegativeCount: Int,
    minimumPrecision: Double,
    minimumRecall: Double,
    maximumBrierScore: Double
  ) {
    self.artifactBinding = artifactBinding
    self.minimumHeldOutExamplesPerTransform = minimumHeldOutExamplesPerTransform
    self.minimumHeldOutNegativeCount = minimumHeldOutNegativeCount
    self.minimumPrecision = minimumPrecision
    self.minimumRecall = minimumRecall
    self.maximumBrierScore = maximumBrierScore
  }
}

public struct TransformedSampleRightsModelGateEvidence: Codable, Sendable, Equatable {
  public let artifactBinding: TransformedSampleEvaluationArtifactBinding
  public let reviewID: String
  public let corpusRightsAccepted: Bool
  public let modelRightsAccepted: Bool

  public init(
    artifactBinding: TransformedSampleEvaluationArtifactBinding,
    reviewID: String,
    corpusRightsAccepted: Bool,
    modelRightsAccepted: Bool
  ) {
    self.artifactBinding = artifactBinding
    self.reviewID = reviewID
    self.corpusRightsAccepted = corpusRightsAccepted
    self.modelRightsAccepted = modelRightsAccepted
  }
}

public struct TransformedSampleResourceGateEvidence: Codable, Sendable, Equatable {
  public let artifactBinding: TransformedSampleEvaluationArtifactBinding
  public let evaluatedEntryCount: Int
  public let maximumMeanWallClockMilliseconds: Double
  public let maximumMeanCPUMilliseconds: Double
  public let maximumPeakResidentMegabytes: Double
  public let maximumTotalBytesScanned: Int64
  public let maximumTotalDecodedFrameCount: Int64

  public init(
    artifactBinding: TransformedSampleEvaluationArtifactBinding,
    evaluatedEntryCount: Int,
    maximumMeanWallClockMilliseconds: Double,
    maximumMeanCPUMilliseconds: Double,
    maximumPeakResidentMegabytes: Double,
    maximumTotalBytesScanned: Int64,
    maximumTotalDecodedFrameCount: Int64
  ) {
    self.artifactBinding = artifactBinding
    self.evaluatedEntryCount = evaluatedEntryCount
    self.maximumMeanWallClockMilliseconds = maximumMeanWallClockMilliseconds
    self.maximumMeanCPUMilliseconds = maximumMeanCPUMilliseconds
    self.maximumPeakResidentMegabytes = maximumPeakResidentMegabytes
    self.maximumTotalBytesScanned = maximumTotalBytesScanned
    self.maximumTotalDecodedFrameCount = maximumTotalDecodedFrameCount
  }
}

public struct TransformedSampleFalsePositiveGateEvidence: Codable, Sendable, Equatable {
  public let artifactBinding: TransformedSampleEvaluationArtifactBinding
  public let reviewedEvaluationCount: Int
  public let minimumReviewedNegativeCount: Int
  public let maximumFalsePositiveCount: Int
  public let reviewID: String

  public init(
    artifactBinding: TransformedSampleEvaluationArtifactBinding,
    reviewedEvaluationCount: Int,
    minimumReviewedNegativeCount: Int,
    maximumFalsePositiveCount: Int,
    reviewID: String
  ) {
    self.artifactBinding = artifactBinding
    self.reviewedEvaluationCount = reviewedEvaluationCount
    self.minimumReviewedNegativeCount = minimumReviewedNegativeCount
    self.maximumFalsePositiveCount = maximumFalsePositiveCount
    self.reviewID = reviewID
  }
}

public struct TransformedSampleEvaluationGateEvidence: Codable, Sendable, Equatable {
  public let labelledCorpus: TransformedSampleLabelledCorpusGateEvidence?
  public let rightsAndModel: TransformedSampleRightsModelGateEvidence?
  public let resourceBudget: TransformedSampleResourceGateEvidence?
  public let falsePositiveBudget: TransformedSampleFalsePositiveGateEvidence?

  public init(
    labelledCorpus: TransformedSampleLabelledCorpusGateEvidence? = nil,
    rightsAndModel: TransformedSampleRightsModelGateEvidence? = nil,
    resourceBudget: TransformedSampleResourceGateEvidence? = nil,
    falsePositiveBudget: TransformedSampleFalsePositiveGateEvidence? = nil
  ) {
    self.labelledCorpus = labelledCorpus
    self.rightsAndModel = rightsAndModel
    self.resourceBudget = resourceBudget
    self.falsePositiveBudget = falsePositiveBudget
  }

  public static let notRun = TransformedSampleEvaluationGateEvidence()

  fileprivate func isBound(to binding: TransformedSampleEvaluationArtifactBinding) -> Bool {
    [
      labelledCorpus?.artifactBinding,
      rightsAndModel?.artifactBinding,
      resourceBudget?.artifactBinding,
      falsePositiveBudget?.artifactBinding,
    ].allSatisfy { $0 == nil || $0 == binding }
  }
}

public struct TransformedSampleEvaluationGates: Codable, Sendable, Equatable {
  public let labelledRealProducerCorpus: TransformedSampleEvaluationGateStatus
  public let rightsAndModelReview: TransformedSampleEvaluationGateStatus
  public let resourceBudgetReview: TransformedSampleEvaluationGateStatus
  public let falsePositiveBudgetReview: TransformedSampleEvaluationGateStatus
}

public struct TransformedSampleGateTransformEvidence: Codable, Sendable, Equatable {
  public let family: TransformedSampleTransformFamily
  public let heldOutExampleCount: Int
  public let precision: Double?
  public let recall: Double?
  public let brierScore: Double?

  public init(
    family: TransformedSampleTransformFamily,
    heldOutExampleCount: Int,
    precision: Double?,
    recall: Double?,
    brierScore: Double?
  ) {
    self.family = family
    self.heldOutExampleCount = heldOutExampleCount
    self.precision = precision
    self.recall = recall
    self.brierScore = brierScore
  }

  fileprivate var isWellFormed: Bool {
    heldOutExampleCount >= 0
      && heldOutExampleCount <= TransformedSampleCorpusManifest.maximumEntryCount
      && [precision, recall, brierScore].allSatisfy { $0.map(validProbability) ?? true }
  }
}

public struct TransformedSampleGateResourceEvidence: Codable, Sendable, Equatable {
  public let evaluatedEntryCount: Int
  public let meanWallClockMilliseconds: Double
  public let meanCPUMilliseconds: Double
  public let maximumPeakResidentMegabytes: Double
  public let totalBytesScanned: Int64
  public let totalDecodedFrameCount: Int64

  public init(
    evaluatedEntryCount: Int,
    meanWallClockMilliseconds: Double,
    meanCPUMilliseconds: Double,
    maximumPeakResidentMegabytes: Double,
    totalBytesScanned: Int64,
    totalDecodedFrameCount: Int64
  ) {
    self.evaluatedEntryCount = evaluatedEntryCount
    self.meanWallClockMilliseconds = meanWallClockMilliseconds
    self.meanCPUMilliseconds = meanCPUMilliseconds
    self.maximumPeakResidentMegabytes = maximumPeakResidentMegabytes
    self.totalBytesScanned = totalBytesScanned
    self.totalDecodedFrameCount = totalDecodedFrameCount
  }

  fileprivate var isWellFormed: Bool {
    evaluatedEntryCount > 0
      && finiteNonnegative(meanWallClockMilliseconds)
      && finiteNonnegative(meanCPUMilliseconds)
      && finiteNonnegative(maximumPeakResidentMegabytes)
      && totalBytesScanned >= 0 && totalDecodedFrameCount >= 0
  }
}

public struct TransformedSampleGateDecisionContext: Codable, Sendable, Equatable {
  public static let currentSchemaVersion = 1

  public let schemaVersion: Int
  public let containsOnlySyntheticAugmentation: Bool
  public let realProducerSplits: [TransformedSampleCorpusSplit]
  public let manifestEntryCount: Int
  public let evaluationCount: Int
  public let heldOutRealEntryCount: Int
  public let heldOutRealNegativeCount: Int
  public let evaluatedHeldOutRealEntryCount: Int
  public let evaluatedHeldOutRealNegativeCount: Int
  public let heldOutTransforms: [TransformedSampleGateTransformEvidence]
  public let resources: TransformedSampleGateResourceEvidence?
  public let totalFalsePositiveCount: Int?

  public init(
    containsOnlySyntheticAugmentation: Bool,
    realProducerSplits: [TransformedSampleCorpusSplit],
    manifestEntryCount: Int,
    evaluationCount: Int,
    heldOutRealEntryCount: Int,
    heldOutRealNegativeCount: Int,
    evaluatedHeldOutRealEntryCount: Int,
    evaluatedHeldOutRealNegativeCount: Int,
    heldOutTransforms: [TransformedSampleGateTransformEvidence],
    resources: TransformedSampleGateResourceEvidence?,
    totalFalsePositiveCount: Int?
  ) {
    schemaVersion = Self.currentSchemaVersion
    self.containsOnlySyntheticAugmentation = containsOnlySyntheticAugmentation
    self.realProducerSplits = Array(Set(realProducerSplits)).sorted { $0.rawValue < $1.rawValue }
    self.manifestEntryCount = manifestEntryCount
    self.evaluationCount = evaluationCount
    self.heldOutRealEntryCount = heldOutRealEntryCount
    self.heldOutRealNegativeCount = heldOutRealNegativeCount
    self.evaluatedHeldOutRealEntryCount = evaluatedHeldOutRealEntryCount
    self.evaluatedHeldOutRealNegativeCount = evaluatedHeldOutRealNegativeCount
    self.heldOutTransforms = heldOutTransforms.sorted { $0.family.rawValue < $1.family.rawValue }
    self.resources = resources
    self.totalFalsePositiveCount = totalFalsePositiveCount
  }

  fileprivate var isWellFormed: Bool {
    schemaVersion == Self.currentSchemaVersion
      && manifestEntryCount > 0 && evaluationCount >= 0
      && manifestEntryCount <= TransformedSampleCorpusManifest.maximumEntryCount
      && evaluationCount <= manifestEntryCount
      && heldOutRealEntryCount >= 0 && heldOutRealEntryCount <= manifestEntryCount
      && heldOutRealNegativeCount >= 0
      && heldOutRealNegativeCount <= heldOutRealEntryCount
      && evaluatedHeldOutRealEntryCount >= 0
      && evaluatedHeldOutRealEntryCount <= heldOutRealEntryCount
      && evaluatedHeldOutRealNegativeCount >= 0
      && evaluatedHeldOutRealNegativeCount <= heldOutRealNegativeCount
      && Set(realProducerSplits).count == realProducerSplits.count
      && Set(heldOutTransforms.map(\.family)) == Set(TransformedSampleTransformFamily.allCases)
      && heldOutTransforms.count == TransformedSampleTransformFamily.allCases.count
      && heldOutTransforms.allSatisfy(\.isWellFormed)
      && (resources?.isWellFormed ?? true)
      && resources.map { $0.evaluatedEntryCount == evaluationCount } ?? true
      && totalFalsePositiveCount.map { $0 >= 0 } ?? true
  }
}

public struct TransformedSampleCorpusEvaluationReport: Codable, Sendable, Equatable {
  public static let currentSchemaVersion = 2

  public let schemaVersion: Int
  public let algorithmVersion: String
  public let manifestDigest: String
  public let evaluationDigest: String
  public let evaluationArtifactID: String
  public let activationAvailability: TransformedSampleActivationAvailability
  public let partitionIsolation: TransformedSamplePartitionIsolationStatus
  public let syntheticEntryCount: Int
  public let realProducerEntryCount: Int
  public let gateEvidence: TransformedSampleEvaluationGateEvidence
  public let gateDecisionContext: TransformedSampleGateDecisionContext
  public let gates: TransformedSampleEvaluationGates
  public let gateDecisionDigest: String
  public let reportArtifactID: String
  public let transformReports: [TransformedSampleTransformMetrics]

  fileprivate init(
    algorithmVersion: String,
    manifestDigest: String,
    evaluationDigest: String,
    evaluationArtifactID: String,
    syntheticEntryCount: Int,
    realProducerEntryCount: Int,
    gateEvidence: TransformedSampleEvaluationGateEvidence,
    gateDecisionContext: TransformedSampleGateDecisionContext,
    transformReports: [TransformedSampleTransformMetrics]
  ) throws {
    schemaVersion = Self.currentSchemaVersion
    self.algorithmVersion = algorithmVersion
    self.manifestDigest = manifestDigest
    self.evaluationDigest = evaluationDigest
    self.evaluationArtifactID = evaluationArtifactID
    activationAvailability = .unavailableResearchOnly
    partitionIsolation = .passed
    self.syntheticEntryCount = syntheticEntryCount
    self.realProducerEntryCount = realProducerEntryCount
    self.gateEvidence = gateEvidence
    self.gateDecisionContext = gateDecisionContext
    self.transformReports = transformReports.sorted { $0.family.rawValue < $1.family.rawValue }
    let binding = TransformedSampleEvaluationArtifactBinding(
      manifestDigest: manifestDigest,
      evaluationDigest: evaluationDigest,
      algorithmVersion: algorithmVersion,
      artifactID: evaluationArtifactID)
    gates = try deriveTransformedSampleEvaluationGates(
      evidence: gateEvidence,
      binding: binding,
      context: gateDecisionContext)
    gateDecisionDigest = try transformedSampleGateDecisionDigest(
      binding: binding,
      evidence: gateEvidence,
      context: gateDecisionContext,
      gates: gates,
      syntheticEntryCount: syntheticEntryCount,
      realProducerEntryCount: realProducerEntryCount,
      transformReports: self.transformReports)
    reportArtifactID = transformedSampleReportArtifactID(
      evaluationArtifactID: evaluationArtifactID,
      gateDecisionDigest: gateDecisionDigest)
    guard isWellFormedEvaluationArtifact else {
      throw TransformedSampleCorpusError.invalidGateEvidence("evaluationReport")
    }
  }

  public func deterministicData() throws -> Data {
    guard isWellFormedEvaluationArtifact else {
      throw TransformedSampleCorpusError.invalidGateEvidence("evaluationReport")
    }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(self)
  }

  public var isWellFormedEvaluationArtifact: Bool {
    let binding = TransformedSampleEvaluationArtifactBinding(
      manifestDigest: manifestDigest,
      evaluationDigest: evaluationDigest,
      algorithmVersion: algorithmVersion,
      artifactID: evaluationArtifactID)
    let entryCount = syntheticEntryCount.addingReportingOverflow(realProducerEntryCount)
    guard schemaVersion == Self.currentSchemaVersion,
      binding.isWellFormed,
      gateDecisionContext.isWellFormed,
      activationAvailability == .unavailableResearchOnly,
      partitionIsolation == .passed,
      syntheticEntryCount >= 0,
      realProducerEntryCount >= 0,
      !entryCount.overflow,
      entryCount.partialValue == gateDecisionContext.manifestEntryCount,
      transformReports.count == TransformedSampleTransformFamily.allCases.count,
      Set(transformReports.map(\.family)) == Set(TransformedSampleTransformFamily.allCases),
      transformReports.allSatisfy(\.isWellFormed),
      let derivedGates = try? deriveTransformedSampleEvaluationGates(
        evidence: gateEvidence,
        binding: binding,
        context: gateDecisionContext),
      derivedGates == gates,
      let expectedDigest = try? transformedSampleGateDecisionDigest(
        binding: binding,
        evidence: gateEvidence,
        context: gateDecisionContext,
        gates: derivedGates,
        syntheticEntryCount: syntheticEntryCount,
        realProducerEntryCount: realProducerEntryCount,
        transformReports: transformReports)
    else { return false }
    return gateDecisionDigest == expectedDigest
      && reportArtifactID
        == transformedSampleReportArtifactID(
          evaluationArtifactID: evaluationArtifactID,
          gateDecisionDigest: expectedDigest)
  }

  private enum CodingKeys: String, CodingKey {
    case schemaVersion
    case algorithmVersion
    case manifestDigest
    case evaluationDigest
    case evaluationArtifactID
    case activationAvailability
    case partitionIsolation
    case syntheticEntryCount
    case realProducerEntryCount
    case gateEvidence
    case gateDecisionContext
    case gates
    case gateDecisionDigest
    case reportArtifactID
    case transformReports
  }

  public func encode(to encoder: Encoder) throws {
    guard isWellFormedEvaluationArtifact else {
      throw EncodingError.invalidValue(
        self,
        EncodingError.Context(
          codingPath: encoder.codingPath,
          debugDescription: "Malformed transformed-sample evaluation report."))
    }
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(schemaVersion, forKey: .schemaVersion)
    try container.encode(algorithmVersion, forKey: .algorithmVersion)
    try container.encode(manifestDigest, forKey: .manifestDigest)
    try container.encode(evaluationDigest, forKey: .evaluationDigest)
    try container.encode(evaluationArtifactID, forKey: .evaluationArtifactID)
    try container.encode(activationAvailability, forKey: .activationAvailability)
    try container.encode(partitionIsolation, forKey: .partitionIsolation)
    try container.encode(syntheticEntryCount, forKey: .syntheticEntryCount)
    try container.encode(realProducerEntryCount, forKey: .realProducerEntryCount)
    try container.encode(gateEvidence, forKey: .gateEvidence)
    try container.encode(gateDecisionContext, forKey: .gateDecisionContext)
    try container.encode(gates, forKey: .gates)
    try container.encode(gateDecisionDigest, forKey: .gateDecisionDigest)
    try container.encode(reportArtifactID, forKey: .reportArtifactID)
    try container.encode(transformReports, forKey: .transformReports)
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
    algorithmVersion = try container.decode(String.self, forKey: .algorithmVersion)
    manifestDigest = try container.decode(String.self, forKey: .manifestDigest)
    evaluationDigest = try container.decode(String.self, forKey: .evaluationDigest)
    evaluationArtifactID = try container.decode(String.self, forKey: .evaluationArtifactID)
    activationAvailability = try container.decode(
      TransformedSampleActivationAvailability.self,
      forKey: .activationAvailability)
    partitionIsolation = try container.decode(
      TransformedSamplePartitionIsolationStatus.self,
      forKey: .partitionIsolation)
    syntheticEntryCount = try container.decode(Int.self, forKey: .syntheticEntryCount)
    realProducerEntryCount = try container.decode(Int.self, forKey: .realProducerEntryCount)
    gateEvidence = try container.decode(
      TransformedSampleEvaluationGateEvidence.self,
      forKey: .gateEvidence)
    gateDecisionContext = try container.decode(
      TransformedSampleGateDecisionContext.self,
      forKey: .gateDecisionContext)
    gates = try container.decode(TransformedSampleEvaluationGates.self, forKey: .gates)
    gateDecisionDigest = try container.decode(String.self, forKey: .gateDecisionDigest)
    reportArtifactID = try container.decode(String.self, forKey: .reportArtifactID)
    transformReports = try container.decode(
      [TransformedSampleTransformMetrics].self,
      forKey: .transformReports)
    guard isWellFormedEvaluationArtifact else {
      throw DecodingError.dataCorruptedError(
        forKey: .algorithmVersion,
        in: container,
        debugDescription: "Unsupported or mixed-version transformed-sample evaluation report.")
    }
  }
}

public struct TransformedSampleCorpusEvaluator: Sendable {
  public init() {}

  public func deterministicEvaluationDigest(
    for evaluations: [TransformedSampleCorpusEvaluation]
  ) throws -> String {
    guard Set(evaluations.map(\.entryID)).count == evaluations.count else {
      throw TransformedSampleCorpusError.duplicateEvaluationID
    }
    guard let malformed = evaluations.first(where: { !$0.isWellFormed }) else {
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
      let data = try encoder.encode(evaluations.sorted { $0.entryID < $1.entryID })
      return sha256(data)
    }
    throw TransformedSampleCorpusError.invalidEvaluation(malformed.entryID)
  }

  public func artifactBinding(
    manifest: TransformedSampleCorpusManifest,
    evaluations: [TransformedSampleCorpusEvaluation]
  ) throws -> TransformedSampleEvaluationArtifactBinding {
    let manifestDigest = try manifest.deterministicDigest()
    let evaluationDigest = try deterministicEvaluationDigest(for: evaluations)
    let algorithmVersion = TransformedSampleResearchCapability.algorithmVersion
    return TransformedSampleEvaluationArtifactBinding(
      manifestDigest: manifestDigest,
      evaluationDigest: evaluationDigest,
      algorithmVersion: algorithmVersion,
      artifactID: artifactID(
        manifestDigest: manifestDigest,
        evaluationDigest: evaluationDigest,
        algorithmVersion: algorithmVersion))
  }

  public func evaluate(
    manifest: TransformedSampleCorpusManifest,
    evaluations: [TransformedSampleCorpusEvaluation],
    evidence: TransformedSampleEvaluationGateEvidence = .notRun
  ) throws -> TransformedSampleCorpusEvaluationReport {
    let manifest = try manifest.validated()
    let digest = try manifest.deterministicDigest()
    guard Set(evaluations.map(\.entryID)).count == evaluations.count else {
      throw TransformedSampleCorpusError.duplicateEvaluationID
    }
    let entryIDs = Set(manifest.entries.map(\.id))
    for evaluation in evaluations {
      guard entryIDs.contains(evaluation.entryID) else {
        throw TransformedSampleCorpusError.unknownEvaluationEntry(evaluation.entryID)
      }
      guard evaluation.isWellFormed else {
        throw TransformedSampleCorpusError.invalidEvaluation(evaluation.entryID)
      }
    }
    let evaluationDigest = try deterministicEvaluationDigest(for: evaluations)
    let binding = TransformedSampleEvaluationArtifactBinding(
      manifestDigest: digest,
      evaluationDigest: evaluationDigest,
      algorithmVersion: TransformedSampleResearchCapability.algorithmVersion,
      artifactID: artifactID(
        manifestDigest: digest,
        evaluationDigest: evaluationDigest,
        algorithmVersion: TransformedSampleResearchCapability.algorithmVersion))
    let byID = Dictionary(uniqueKeysWithValues: evaluations.map { ($0.entryID, $0) })
    let reports = TransformedSampleTransformFamily.allCases.map { family in
      metrics(family: family, entries: manifest.entries, evaluations: byID)
    }
    let gateDecisionContext = gateDecisionContext(
      manifest: manifest,
      evaluations: evaluations,
      evaluationsByID: byID,
      reports: reports)
    return try TransformedSampleCorpusEvaluationReport(
      algorithmVersion: TransformedSampleResearchCapability.algorithmVersion,
      manifestDigest: digest,
      evaluationDigest: evaluationDigest,
      evaluationArtifactID: binding.artifactID,
      syntheticEntryCount: manifest.entries.count(where: {
        $0.origin.kind == .syntheticAugmentation
      }),
      realProducerEntryCount: manifest.entries.count(where: {
        $0.origin.kind == .realProducerLabel
      }),
      gateEvidence: evidence,
      gateDecisionContext: gateDecisionContext,
      transformReports: reports)
  }

  private func metrics(
    family: TransformedSampleTransformFamily,
    entries: [TransformedSampleCorpusEntry],
    evaluations: [String: TransformedSampleCorpusEvaluation]
  ) -> TransformedSampleTransformMetrics {
    let relevant = entries.filter {
      $0.expectedTransformFamilies.contains(family)
        || evaluations[$0.id]?.predictedTransformFamilies.contains(family) == true
    }
    let expectedPositive = relevant.filter {
      $0.expectedRelationship == .transformedUse
        && $0.expectedClassification != nil
        && $0.expectedClassification != .unknown
        && $0.expectedTransformFamilies.contains(family)
    }
    let expectedPositiveIDs = Set(expectedPositive.map(\.id))
    let predicted = relevant.filter {
      evaluations[$0.id]?.predictedTransformFamilies.contains(family) == true
    }
    let truePositive = predicted.filter { entry in
      expectedPositiveIDs.contains(entry.id)
        && evaluations[entry.id]?.classification == entry.expectedClassification
    }
    let truePositiveIDs = Set(truePositive.map(\.id))
    let falsePositive = predicted.filter { !truePositiveIDs.contains($0.id) }
    let falseNegative = expectedPositive.filter {
      !truePositiveIDs.contains($0.id)
    }
    let scored = relevant.map { entry -> (Double, Double) in
      let evaluation = evaluations[entry.id]
      let isExpectedPositive = expectedPositiveIDs.contains(entry.id)
      let classificationMatches = evaluation?.classification == entry.expectedClassification
      let confidence =
        isExpectedPositive && !classificationMatches
        ? 0 : evaluation?.confidence(for: family) ?? 0
      return (confidence, isExpectedPositive ? 1 : 0)
    }
    let resources = relevant.compactMap { evaluations[$0.id]?.resources }
    return TransformedSampleTransformMetrics(
      family: family,
      reviewedCount: relevant.count,
      truePositiveCount: truePositive.count,
      falsePositiveCount: falsePositive.count,
      falseNegativeCount: falseNegative.count,
      precision: ratio(truePositive.count, predicted.count),
      recall: ratio(
        truePositive.count,
        truePositive.count + falseNegative.count),
      brierScore: average(scored.map { pow($0.0 - $0.1, 2) }),
      meanAbsoluteCalibrationError: average(scored.map { abs($0.0 - $0.1) }),
      abstentionRate: ratio(
        relevant.count - predicted.count,
        relevant.count),
      coverage: ratio(predicted.count, relevant.count),
      resources: resourceSummary(resources))
  }

  private func resourceSummary(
    _ values: [TransformedSampleEvaluationResourceMeasurement]
  ) -> TransformedSampleMetricResources {
    TransformedSampleMetricResources(
      measuredCount: values.count,
      meanWallClockMilliseconds: average(values.map(\.wallClockMilliseconds)),
      meanCPUMilliseconds: average(values.map(\.cpuMilliseconds)),
      maximumPeakResidentMegabytes: values.map(\.peakResidentMegabytes).max(),
      totalBytesScanned: values.isEmpty ? nil : checkedSum(values.map(\.bytesScanned)),
      totalDecodedFrameCount: values.isEmpty ? nil : checkedSum(values.map(\.decodedFrameCount)),
      totalComparedCandidateCount: values.isEmpty
        ? nil : checkedSum(values.map(\.comparedCandidateCount)))
  }

  private func gateDecisionContext(
    manifest: TransformedSampleCorpusManifest,
    evaluations: [TransformedSampleCorpusEvaluation],
    evaluationsByID: [String: TransformedSampleCorpusEvaluation],
    reports: [TransformedSampleTransformMetrics]
  ) -> TransformedSampleGateDecisionContext {
    let realEntries = manifest.entries.filter { $0.origin.kind == .realProducerLabel }
    let heldOutReal = manifest.entries.filter {
      $0.split == .heldOut && $0.origin.kind == .realProducerLabel
    }
    let heldOutNegatives = heldOutReal.filter { $0.expectedRelationship != .transformedUse }
    let heldOutTransforms = TransformedSampleTransformFamily.allCases.map { family in
      let report = metrics(
        family: family,
        entries: heldOutReal,
        evaluations: evaluationsByID)
      return TransformedSampleGateTransformEvidence(
        family: family,
        heldOutExampleCount: heldOutReal.count(where: {
          $0.expectedTransformFamilies.contains(family)
        }),
        precision: report.precision,
        recall: report.recall,
        brierScore: report.brierScore)
    }
    let resourceValues = evaluations.compactMap(\.resources)
    let resources: TransformedSampleGateResourceEvidence? =
      if resourceValues.count == evaluations.count,
        !resourceValues.isEmpty,
        let wall = average(resourceValues.map(\.wallClockMilliseconds)),
        let cpu = average(resourceValues.map(\.cpuMilliseconds)),
        let memory = resourceValues.map(\.peakResidentMegabytes).max(),
        let bytes = checkedSum(resourceValues.map(\.bytesScanned)),
        let frames = checkedSum(resourceValues.map(\.decodedFrameCount))
      {
        TransformedSampleGateResourceEvidence(
          evaluatedEntryCount: evaluations.count,
          meanWallClockMilliseconds: wall,
          meanCPUMilliseconds: cpu,
          maximumPeakResidentMegabytes: memory,
          totalBytesScanned: bytes,
          totalDecodedFrameCount: frames)
      } else {
        nil
      }
    return TransformedSampleGateDecisionContext(
      containsOnlySyntheticAugmentation: manifest.containsOnlySyntheticAugmentation,
      realProducerSplits: realEntries.map(\.split),
      manifestEntryCount: manifest.entries.count,
      evaluationCount: evaluations.count,
      heldOutRealEntryCount: heldOutReal.count,
      heldOutRealNegativeCount: heldOutNegatives.count,
      evaluatedHeldOutRealEntryCount: heldOutReal.count(where: {
        evaluationsByID[$0.id] != nil
      }),
      evaluatedHeldOutRealNegativeCount: heldOutNegatives.count(where: {
        evaluationsByID[$0.id] != nil
      }),
      heldOutTransforms: heldOutTransforms,
      resources: resources,
      totalFalsePositiveCount: checkedSum(reports.map(\.falsePositiveCount)))
  }

  private func artifactID(
    manifestDigest: String,
    evaluationDigest: String,
    algorithmVersion: String
  ) -> String {
    transformedSampleArtifactID(
      manifestDigest: manifestDigest,
      evaluationDigest: evaluationDigest,
      algorithmVersion: algorithmVersion)
  }
}

private func deriveTransformedSampleEvaluationGates(
  evidence: TransformedSampleEvaluationGateEvidence,
  binding: TransformedSampleEvaluationArtifactBinding,
  context: TransformedSampleGateDecisionContext
) throws -> TransformedSampleEvaluationGates {
  try validateTransformedSampleGateEvidence(evidence, binding: binding)
  guard context.isWellFormed else {
    throw TransformedSampleCorpusError.invalidGateEvidence("decisionContext")
  }

  let labelled: TransformedSampleEvaluationGateStatus
  if let review = evidence.labelledCorpus {
    if context.containsOnlySyntheticAugmentation {
      labelled = .ineligible
    } else if Set(context.realProducerSplits) != Set(TransformedSampleCorpusSplit.allCases)
      || context.heldOutRealNegativeCount < review.minimumHeldOutNegativeCount
      || context.evaluatedHeldOutRealEntryCount != context.heldOutRealEntryCount
      || context.heldOutTransforms.contains(where: {
        $0.heldOutExampleCount < review.minimumHeldOutExamplesPerTransform
      })
    {
      labelled = .notRun
    } else if context.heldOutTransforms.allSatisfy({ transform in
      guard let precision = transform.precision,
        let recall = transform.recall,
        let brier = transform.brierScore
      else { return false }
      return precision >= review.minimumPrecision
        && recall >= review.minimumRecall
        && brier <= review.maximumBrierScore
    }) {
      labelled = .acceptedForResearchReview
    } else {
      labelled = .ineligible
    }
  } else {
    labelled = .notRun
  }

  let rights: TransformedSampleEvaluationGateStatus =
    if let review = evidence.rightsAndModel {
      review.corpusRightsAccepted && review.modelRightsAccepted
        ? .acceptedForResearchReview : .ineligible
    } else {
      .notRun
    }

  let resource: TransformedSampleEvaluationGateStatus
  if let budget = evidence.resourceBudget {
    if let measured = context.resources,
      budget.evaluatedEntryCount == context.manifestEntryCount,
      context.evaluationCount == context.manifestEntryCount,
      measured.evaluatedEntryCount == context.evaluationCount
    {
      resource =
        measured.meanWallClockMilliseconds <= budget.maximumMeanWallClockMilliseconds
          && measured.meanCPUMilliseconds <= budget.maximumMeanCPUMilliseconds
          && measured.maximumPeakResidentMegabytes <= budget.maximumPeakResidentMegabytes
          && measured.totalBytesScanned <= budget.maximumTotalBytesScanned
          && measured.totalDecodedFrameCount <= budget.maximumTotalDecodedFrameCount
        ? .acceptedForResearchReview : .ineligible
    } else {
      resource = .notRun
    }
  } else {
    resource = .notRun
  }

  let falsePositive: TransformedSampleEvaluationGateStatus
  if let budget = evidence.falsePositiveBudget {
    if budget.reviewedEvaluationCount == context.manifestEntryCount,
      context.evaluationCount == context.manifestEntryCount,
      context.heldOutRealNegativeCount >= budget.minimumReviewedNegativeCount,
      context.evaluatedHeldOutRealNegativeCount == context.heldOutRealNegativeCount,
      let observed = context.totalFalsePositiveCount
    {
      falsePositive =
        observed <= budget.maximumFalsePositiveCount
        ? .acceptedForResearchReview : .ineligible
    } else {
      falsePositive = .notRun
    }
  } else {
    falsePositive = .notRun
  }

  return TransformedSampleEvaluationGates(
    labelledRealProducerCorpus: labelled,
    rightsAndModelReview: rights,
    resourceBudgetReview: resource,
    falsePositiveBudgetReview: falsePositive)
}

private func validateTransformedSampleGateEvidence(
  _ evidence: TransformedSampleEvaluationGateEvidence,
  binding: TransformedSampleEvaluationArtifactBinding
) throws {
  guard binding.isWellFormed else {
    throw TransformedSampleCorpusError.invalidGateEvidence("artifactBinding")
  }
  if let labelled = evidence.labelledCorpus {
    guard labelled.artifactBinding == binding,
      labelled.minimumHeldOutExamplesPerTransform > 0,
      labelled.minimumHeldOutExamplesPerTransform
        <= TransformedSampleCorpusManifest.maximumEntryCount,
      labelled.minimumHeldOutNegativeCount > 0,
      labelled.minimumHeldOutNegativeCount <= TransformedSampleCorpusManifest.maximumEntryCount,
      validProbability(labelled.minimumPrecision),
      validProbability(labelled.minimumRecall),
      validProbability(labelled.maximumBrierScore)
    else { throw TransformedSampleCorpusError.invalidGateEvidence("labelledCorpus") }
  }
  if let rights = evidence.rightsAndModel {
    guard rights.artifactBinding == binding, validIdentifier(rights.reviewID) else {
      throw TransformedSampleCorpusError.invalidGateEvidence("rightsAndModel")
    }
  }
  if let resource = evidence.resourceBudget {
    guard resource.artifactBinding == binding,
      resource.evaluatedEntryCount > 0,
      resource.evaluatedEntryCount <= TransformedSampleCorpusManifest.maximumEntryCount,
      finiteNonnegative(resource.maximumMeanWallClockMilliseconds),
      finiteNonnegative(resource.maximumMeanCPUMilliseconds),
      finiteNonnegative(resource.maximumPeakResidentMegabytes),
      resource.maximumTotalBytesScanned >= 0,
      resource.maximumTotalDecodedFrameCount >= 0
    else { throw TransformedSampleCorpusError.invalidGateEvidence("resourceBudget") }
  }
  if let falsePositive = evidence.falsePositiveBudget {
    guard falsePositive.artifactBinding == binding,
      falsePositive.reviewedEvaluationCount > 0,
      falsePositive.reviewedEvaluationCount <= TransformedSampleCorpusManifest.maximumEntryCount,
      falsePositive.minimumReviewedNegativeCount > 0,
      falsePositive.minimumReviewedNegativeCount
        <= TransformedSampleCorpusManifest.maximumEntryCount,
      falsePositive.maximumFalsePositiveCount >= 0,
      validIdentifier(falsePositive.reviewID)
    else { throw TransformedSampleCorpusError.invalidGateEvidence("falsePositiveBudget") }
  }
  let reviewIDs = [
    evidence.rightsAndModel?.reviewID,
    evidence.falsePositiveBudget?.reviewID,
  ].compactMap { $0 }
  guard Set(reviewIDs).count == reviewIDs.count else {
    throw TransformedSampleCorpusError.invalidGateEvidence("duplicateReviewID")
  }
}

private struct TransformedSampleGateDecisionEnvelope: Encodable {
  let schemaVersion: Int
  let binding: TransformedSampleEvaluationArtifactBinding
  let evidence: TransformedSampleEvaluationGateEvidence
  let context: TransformedSampleGateDecisionContext
  let gates: TransformedSampleEvaluationGates
  let syntheticEntryCount: Int
  let realProducerEntryCount: Int
  let transformReports: [TransformedSampleTransformMetrics]
}

private func transformedSampleGateDecisionDigest(
  binding: TransformedSampleEvaluationArtifactBinding,
  evidence: TransformedSampleEvaluationGateEvidence,
  context: TransformedSampleGateDecisionContext,
  gates: TransformedSampleEvaluationGates,
  syntheticEntryCount: Int,
  realProducerEntryCount: Int,
  transformReports: [TransformedSampleTransformMetrics]
) throws -> String {
  let envelope = TransformedSampleGateDecisionEnvelope(
    schemaVersion: 1,
    binding: binding,
    evidence: evidence,
    context: context,
    gates: gates,
    syntheticEntryCount: syntheticEntryCount,
    realProducerEntryCount: realProducerEntryCount,
    transformReports: transformReports.sorted { $0.family.rawValue < $1.family.rawValue })
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
  return sha256(try encoder.encode(envelope))
}

private func transformedSampleReportArtifactID(
  evaluationArtifactID: String,
  gateDecisionDigest: String
) -> String {
  let data = Data("report-v2:\(evaluationArtifactID):\(gateDecisionDigest)".utf8)
  return "c8-report-v2-\(sha256(data).prefix(40))"
}

private func transformedSampleArtifactID(
  manifestDigest: String,
  evaluationDigest: String,
  algorithmVersion: String
) -> String {
  let data = Data("\(manifestDigest):\(evaluationDigest):\(algorithmVersion)".utf8)
  return "c8-\(sha256(data).prefix(40))"
}

private func validIdentifier(_ value: String) -> Bool {
  !value.isEmpty && value.count <= 128
    && value.unicodeScalars.allSatisfy { scalar in
      (scalar.value >= 0x30 && scalar.value <= 0x39)
        || (scalar.value >= 0x41 && scalar.value <= 0x5a)
        || (scalar.value >= 0x61 && scalar.value <= 0x7a)
        || [0x2d, 0x2e, 0x5f].contains(scalar.value)
    }
}

private func nonempty(_ value: String?) -> Bool {
  value.map(validIdentifier) == true
}

private func isDigest(_ value: String) -> Bool {
  value.count == 64 && value.allSatisfy(\.isHexDigit)
}

private func validProbability(_ value: Double) -> Bool {
  value.isFinite && (0...1).contains(value)
}

private func finiteNonnegative(_ value: Double) -> Bool {
  value.isFinite && value >= 0
}

private func ratio(_ numerator: Int, _ denominator: Int) -> Double? {
  denominator > 0 ? Double(numerator) / Double(denominator) : nil
}

private func average(_ values: [Double]) -> Double? {
  guard !values.isEmpty else { return nil }
  var total = 0.0
  for value in values {
    total += value
    guard total.isFinite else { return nil }
  }
  return total / Double(values.count)
}

private func checkedSum<T: FixedWidthInteger>(_ values: [T]) -> T? {
  var total = T.zero
  for value in values {
    let result = total.addingReportingOverflow(value)
    guard !result.overflow else { return nil }
    total = result.partialValue
  }
  return total
}

private func sha256(_ data: Data) -> String {
  SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}
