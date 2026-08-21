import CryptoKit
import Foundation

public enum CalibrationEvaluationGateStatus: String, Codable, Sendable, CaseIterable {
  case accepted
  case notRun
  case ineligible
  case unavailable
}

public struct CalibrationEvaluationGates: Codable, Sendable, Equatable {
  public let labelledCorpusEvaluation: CalibrationEvaluationGateStatus
  public let rightsAndModelReview: CalibrationEvaluationGateStatus
  public let resourceBudget: CalibrationEvaluationGateStatus
  public let realDAWQualification: CalibrationEvaluationGateStatus
  public let packaging: CalibrationEvaluationGateStatus
  public let hostedService: CalibrationEvaluationGateStatus
  public let evidence: CalibrationEvaluationEvidence

}

public struct CalibrationReviewedEvidenceReference: Codable, Sendable, Equatable {
  public let id: String
  public let digest: String
  public let reviewedAt: Date
  public let reviewAuthority: String

  public init(id: String, digest: String, reviewedAt: Date, reviewAuthority: String) {
    self.id = id.trimmingCharacters(in: .whitespacesAndNewlines)
    self.digest = digest.lowercased()
    self.reviewedAt = reviewedAt
    self.reviewAuthority = reviewAuthority.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

public struct CalibrationLabelledCorpusGateEvidence: Codable, Sendable, Equatable {
  public static let minimumAcceptedReviewedPerSplit = 20

  public let review: CalibrationReviewedEvidenceReference
  public let reviewedEvaluationReportDigest: String
  public let minimumReviewedPerSplit: Int
  public let minimumPrecision: Double
  public let minimumRecall: Double
  public let maximumBrierScore: Double
  public let maximumFalseAutomaticDecisionCount: Int

  public init(
    review: CalibrationReviewedEvidenceReference,
    reviewedEvaluationReportDigest: String,
    minimumReviewedPerSplit: Int,
    minimumPrecision: Double,
    minimumRecall: Double,
    maximumBrierScore: Double,
    maximumFalseAutomaticDecisionCount: Int
  ) {
    self.review = review
    self.reviewedEvaluationReportDigest = reviewedEvaluationReportDigest.lowercased()
    self.minimumReviewedPerSplit = minimumReviewedPerSplit
    self.minimumPrecision = minimumPrecision
    self.minimumRecall = minimumRecall
    self.maximumBrierScore = maximumBrierScore
    self.maximumFalseAutomaticDecisionCount = maximumFalseAutomaticDecisionCount
  }
}

public enum CalibrationLicenceBasis: String, Codable, Sendable, CaseIterable {
  case noExternalModel
  case ownedOrCommissioned
  case approvedThirdPartyLicence
}

public struct CalibrationRightsAndModelReviewEvidence: Codable, Sendable, Equatable {
  public let review: CalibrationReviewedEvidenceReference
  public let licenceEvidenceDigest: String
  public let modelArtifactDigest: String?
  public let licenceBasis: CalibrationLicenceBasis
  public let permitsLocalEvaluation: Bool
  public let permitsProductionUse: Bool

  public init(
    review: CalibrationReviewedEvidenceReference,
    licenceEvidenceDigest: String,
    modelArtifactDigest: String?,
    licenceBasis: CalibrationLicenceBasis,
    permitsLocalEvaluation: Bool,
    permitsProductionUse: Bool
  ) {
    self.review = review
    self.licenceEvidenceDigest = licenceEvidenceDigest.lowercased()
    self.modelArtifactDigest = modelArtifactDigest?.lowercased()
    self.licenceBasis = licenceBasis
    self.permitsLocalEvaluation = permitsLocalEvaluation
    self.permitsProductionUse = permitsProductionUse
  }
}

public struct CalibrationResourceBudgetReviewEvidence: Codable, Sendable, Equatable {
  public let review: CalibrationReviewedEvidenceReference
  public let evaluatedCorpusDigest: String?
  public let evaluatedObservationCount: Int?
  public let maximumMeanWallClockMilliseconds: Double
  public let maximumMeanCPUMilliseconds: Double?
  public let maximumPeakResidentMegabytes: Double
  public let maximumTotalBytesScanned: Int64
  public let maximumComparedCandidateCount: Int

  public init(
    review: CalibrationReviewedEvidenceReference,
    evaluatedCorpusDigest: String? = nil,
    evaluatedObservationCount: Int? = nil,
    maximumMeanWallClockMilliseconds: Double,
    maximumMeanCPUMilliseconds: Double? = nil,
    maximumPeakResidentMegabytes: Double,
    maximumTotalBytesScanned: Int64,
    maximumComparedCandidateCount: Int
  ) {
    self.review = review
    self.evaluatedCorpusDigest = evaluatedCorpusDigest?.lowercased()
    self.evaluatedObservationCount = evaluatedObservationCount
    self.maximumMeanWallClockMilliseconds = maximumMeanWallClockMilliseconds
    self.maximumMeanCPUMilliseconds = maximumMeanCPUMilliseconds
    self.maximumPeakResidentMegabytes = maximumPeakResidentMegabytes
    self.maximumTotalBytesScanned = maximumTotalBytesScanned
    self.maximumComparedCandidateCount = maximumComparedCandidateCount
  }
}

public struct CalibrationEvaluationEvidence: Codable, Sendable, Equatable {
  public let labelledCorpus: CalibrationLabelledCorpusGateEvidence?
  public let rightsAndModel: CalibrationRightsAndModelReviewEvidence?
  public let resourceBudget: CalibrationResourceBudgetReviewEvidence?
  public let realDAWQualification: CalibrationReviewedEvidenceReference?
  public let packaging: CalibrationReviewedEvidenceReference?
  public let hostedService: CalibrationReviewedEvidenceReference?

  public init(
    labelledCorpus: CalibrationLabelledCorpusGateEvidence? = nil,
    rightsAndModel: CalibrationRightsAndModelReviewEvidence? = nil,
    resourceBudget: CalibrationResourceBudgetReviewEvidence? = nil,
    realDAWQualification: CalibrationReviewedEvidenceReference? = nil,
    packaging: CalibrationReviewedEvidenceReference? = nil,
    hostedService: CalibrationReviewedEvidenceReference? = nil
  ) {
    self.labelledCorpus = labelledCorpus
    self.rightsAndModel = rightsAndModel
    self.resourceBudget = resourceBudget
    self.realDAWQualification = realDAWQualification
    self.packaging = packaging
    self.hostedService = hostedService
  }

  public static let localPrototype = CalibrationEvaluationEvidence()
}

public enum CalibrationReportActivationAuthority: String, Codable, Sendable {
  case none
}

public struct CalibrationPerformanceSummary: Codable, Sendable, Equatable {
  public let measuredObservationCount: Int
  public let meanWallClockMilliseconds: Double?
  public let meanCPUMilliseconds: Double?
  public let maximumPeakResidentMegabytes: Double?
  public let totalBytesScanned: Int64?
  public let totalComparedCandidateCount: Int?

  public init(
    measuredObservationCount: Int,
    meanWallClockMilliseconds: Double?,
    meanCPUMilliseconds: Double?,
    maximumPeakResidentMegabytes: Double?,
    totalBytesScanned: Int64?,
    totalComparedCandidateCount: Int?
  ) {
    self.measuredObservationCount = measuredObservationCount
    self.meanWallClockMilliseconds = meanWallClockMilliseconds
    self.meanCPUMilliseconds = meanCPUMilliseconds
    self.maximumPeakResidentMegabytes = maximumPeakResidentMegabytes
    self.totalBytesScanned = totalBytesScanned
    self.totalComparedCandidateCount = totalComparedCandidateCount
  }
}

public struct CalibrationScoreSummary: Codable, Sendable, Equatable {
  public let scoredObservationCount: Int
  public let brierScore: Double?
  public let meanAbsoluteCalibrationError: Double?

  public init(
    scoredObservationCount: Int,
    brierScore: Double?,
    meanAbsoluteCalibrationError: Double?
  ) {
    self.scoredObservationCount = scoredObservationCount
    self.brierScore = brierScore
    self.meanAbsoluteCalibrationError = meanAbsoluteCalibrationError
  }
}

public struct CalibrationEvaluationSummary: Codable, Sendable, Equatable {
  public let reviewedDecisionCount: Int
  public let predictedObservationCount: Int
  public let correctPredictionCount: Int
  public let precision: Double?
  public let recall: Double?
  public let abstentionRate: Double?
  public let coverage: Double?
  public let falseAutomaticDecisionCount: Int
  public let scoreSummary: CalibrationScoreSummary
  public let performance: CalibrationPerformanceSummary

  public init(
    reviewedDecisionCount: Int,
    predictedObservationCount: Int,
    correctPredictionCount: Int,
    precision: Double?,
    recall: Double?,
    abstentionRate: Double?,
    coverage: Double?,
    falseAutomaticDecisionCount: Int,
    scoreSummary: CalibrationScoreSummary,
    performance: CalibrationPerformanceSummary
  ) {
    self.reviewedDecisionCount = reviewedDecisionCount
    self.predictedObservationCount = predictedObservationCount
    self.correctPredictionCount = correctPredictionCount
    self.precision = precision
    self.recall = recall
    self.abstentionRate = abstentionRate
    self.coverage = coverage
    self.falseAutomaticDecisionCount = falseAutomaticDecisionCount
    self.scoreSummary = scoreSummary
    self.performance = performance
  }
}

public struct CalibrationFamilyEvaluationReport: Codable, Sendable, Equatable {
  public let family: CalibrationReviewTaskFamily
  public let summary: CalibrationEvaluationSummary

  public init(family: CalibrationReviewTaskFamily, summary: CalibrationEvaluationSummary) {
    self.family = family
    self.summary = summary
  }
}

public struct CalibrationEvidenceFamilyEvaluationReport: Codable, Sendable, Equatable {
  public let evidenceFamily: CalibrationEvidenceFamily
  public let summary: CalibrationEvaluationSummary

  public init(
    evidenceFamily: CalibrationEvidenceFamily,
    summary: CalibrationEvaluationSummary
  ) {
    self.evidenceFamily = evidenceFamily
    self.summary = summary
  }
}

public struct CalibrationPartitionEvaluationReport: Codable, Sendable, Equatable {
  public let partition: CalibrationCorpusPartition
  public let summary: CalibrationEvaluationSummary

  public init(
    partition: CalibrationCorpusPartition,
    summary: CalibrationEvaluationSummary
  ) {
    self.partition = partition
    self.summary = summary
  }
}

public struct CalibrationEvaluationSourceBinding: Codable, Sendable, Equatable {
  public static let currentSchemaVersion = 1

  public let schemaVersion: Int
  public let storeIdentity: String
  public let storeGeneration: UInt64
  public let storeContentDigest: String
  public let evaluationAlgorithm: String
  public let evaluationVersion: String
  public let evaluatedDecisionCount: Int
  public let evaluatedSourceFactsDigest: String

  init(
    storeIdentity: String,
    storeGeneration: UInt64,
    storeContentDigest: String,
    evaluationAlgorithm: String,
    evaluationVersion: String,
    evaluatedDecisionCount: Int,
    evaluatedSourceFactsDigest: String
  ) {
    schemaVersion = Self.currentSchemaVersion
    self.storeIdentity = storeIdentity
    self.storeGeneration = storeGeneration
    self.storeContentDigest = storeContentDigest
    self.evaluationAlgorithm = evaluationAlgorithm
    self.evaluationVersion = evaluationVersion
    self.evaluatedDecisionCount = evaluatedDecisionCount
    self.evaluatedSourceFactsDigest = evaluatedSourceFactsDigest
  }
}

public enum CalibrationPartitionIsolationStatus: String, Codable, Sendable {
  case passed
  case notRun
  case ineligible
}

public struct CalibrationEvaluationReport: Codable, Sendable, Equatable {
  public static let currentSchemaVersion = 3

  public let schemaVersion: Int
  public let ledgerSchemaVersion: Int
  public let generatedAt: Date
  public let activationAuthority: CalibrationReportActivationAuthority
  public let partitionIsolation: CalibrationPartitionIsolationStatus
  public let gates: CalibrationEvaluationGates
  public let overall: CalibrationEvaluationSummary
  public let familyReports: [CalibrationFamilyEvaluationReport]
  public let evidenceFamilyReports: [CalibrationEvidenceFamilyEvaluationReport]
  public let partitionReports: [CalibrationPartitionEvaluationReport]
  public let sourceBinding: CalibrationEvaluationSourceBinding?
  public let integrityDigest: String?

  public init(
    generatedAt: Date,
    partitionIsolation: CalibrationPartitionIsolationStatus,
    gates: CalibrationEvaluationGates,
    overall: CalibrationEvaluationSummary,
    familyReports: [CalibrationFamilyEvaluationReport],
    evidenceFamilyReports: [CalibrationEvidenceFamilyEvaluationReport],
    partitionReports: [CalibrationPartitionEvaluationReport]
  ) {
    self.init(
      generatedAt: generatedAt,
      partitionIsolation: partitionIsolation,
      gates: gates,
      overall: overall,
      familyReports: familyReports,
      evidenceFamilyReports: evidenceFamilyReports,
      partitionReports: partitionReports,
      sourceBinding: nil)
  }

  init(
    generatedAt: Date,
    partitionIsolation: CalibrationPartitionIsolationStatus,
    gates: CalibrationEvaluationGates,
    overall: CalibrationEvaluationSummary,
    familyReports: [CalibrationFamilyEvaluationReport],
    evidenceFamilyReports: [CalibrationEvidenceFamilyEvaluationReport],
    partitionReports: [CalibrationPartitionEvaluationReport],
    sourceBinding: CalibrationEvaluationSourceBinding?
  ) {
    let sortedFamilies = familyReports.sorted { $0.family.rawValue < $1.family.rawValue }
    let sortedEvidence = evidenceFamilyReports.sorted {
      $0.evidenceFamily.rawValue < $1.evidenceFamily.rawValue
    }
    let sortedPartitions = partitionReports.sorted {
      $0.partition.stableKey < $1.partition.stableKey
    }
    schemaVersion = Self.currentSchemaVersion
    ledgerSchemaVersion = CalibrationReviewStore.currentSchemaVersion
    self.generatedAt = generatedAt
    activationAuthority = .none
    self.partitionIsolation = partitionIsolation
    self.gates = gates
    self.overall = overall
    self.familyReports = sortedFamilies
    self.evidenceFamilyReports = sortedEvidence
    self.partitionReports = sortedPartitions
    self.sourceBinding = sourceBinding
    integrityDigest = sourceBinding.map {
      CalibrationReportIntegrity.digest(
        schemaVersion: Self.currentSchemaVersion,
        ledgerSchemaVersion: CalibrationReviewStore.currentSchemaVersion,
        generatedAt: generatedAt,
        activationAuthority: .none,
        partitionIsolation: partitionIsolation,
        gates: gates,
        overall: overall,
        familyReports: sortedFamilies,
        evidenceFamilyReports: sortedEvidence,
        partitionReports: sortedPartitions,
        sourceBinding: $0)
    }
  }

  var hasCanonicalIntegrity: Bool {
    guard schemaVersion == Self.currentSchemaVersion,
      ledgerSchemaVersion == CalibrationReviewStore.currentSchemaVersion,
      activationAuthority == .none,
      let sourceBinding,
      sourceBinding.schemaVersion == CalibrationEvaluationSourceBinding.currentSchemaVersion,
      sourceBinding.storeIdentity.count == 64,
      sourceBinding.storeIdentity.allSatisfy(\.isHexDigit),
      sourceBinding.storeGeneration > 0,
      sourceBinding.storeContentDigest.count == 64,
      sourceBinding.storeContentDigest.allSatisfy(\.isHexDigit),
      sourceBinding.evaluationAlgorithm == CalibrationEvaluationReportGenerator.evaluationAlgorithm,
      sourceBinding.evaluationVersion == CalibrationEvaluationReportGenerator.evaluationVersion,
      sourceBinding.evaluatedDecisionCount >= 0,
      sourceBinding.evaluatedSourceFactsDigest.count == 64,
      sourceBinding.evaluatedSourceFactsDigest.allSatisfy(\.isHexDigit),
      let integrityDigest
    else { return false }
    return integrityDigest
      == CalibrationReportIntegrity.digest(
        schemaVersion: schemaVersion,
        ledgerSchemaVersion: ledgerSchemaVersion,
        generatedAt: generatedAt,
        activationAuthority: activationAuthority,
        partitionIsolation: partitionIsolation,
        gates: gates,
        overall: overall,
        familyReports: familyReports,
        evidenceFamilyReports: evidenceFamilyReports,
        partitionReports: partitionReports,
        sourceBinding: sourceBinding)
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
    ledgerSchemaVersion = try container.decode(Int.self, forKey: .ledgerSchemaVersion)
    generatedAt = try container.decode(Date.self, forKey: .generatedAt)
    activationAuthority = try container.decode(
      CalibrationReportActivationAuthority.self,
      forKey: .activationAuthority)
    partitionIsolation = try container.decode(
      CalibrationPartitionIsolationStatus.self,
      forKey: .partitionIsolation)
    gates = try container.decode(CalibrationEvaluationGates.self, forKey: .gates)
    overall = try container.decode(CalibrationEvaluationSummary.self, forKey: .overall)
    familyReports = try container.decode(
      [CalibrationFamilyEvaluationReport].self,
      forKey: .familyReports)
    evidenceFamilyReports = try container.decode(
      [CalibrationEvidenceFamilyEvaluationReport].self,
      forKey: .evidenceFamilyReports)
    partitionReports = try container.decode(
      [CalibrationPartitionEvaluationReport].self,
      forKey: .partitionReports)
    sourceBinding = try container.decodeIfPresent(
      CalibrationEvaluationSourceBinding.self,
      forKey: .sourceBinding)
    integrityDigest = try container.decodeIfPresent(String.self, forKey: .integrityDigest)
    if sourceBinding != nil || integrityDigest != nil, !hasCanonicalIntegrity {
      throw DecodingError.dataCorrupted(
        .init(
          codingPath: decoder.codingPath,
          debugDescription: "Calibration report integrity validation failed."))
    }
  }

  private enum CodingKeys: String, CodingKey {
    case schemaVersion
    case ledgerSchemaVersion
    case generatedAt
    case activationAuthority
    case partitionIsolation
    case gates
    case overall
    case familyReports
    case evidenceFamilyReports
    case partitionReports
    case sourceBinding
    case integrityDigest
  }
}

private enum CalibrationReportIntegrity {
  private struct Payload: Encodable {
    let schemaVersion: Int
    let ledgerSchemaVersion: Int
    let generatedAt: Date
    let activationAuthority: CalibrationReportActivationAuthority
    let partitionIsolation: CalibrationPartitionIsolationStatus
    let gates: CalibrationEvaluationGates
    let overall: CalibrationEvaluationSummary
    let familyReports: [CalibrationFamilyEvaluationReport]
    let evidenceFamilyReports: [CalibrationEvidenceFamilyEvaluationReport]
    let partitionReports: [CalibrationPartitionEvaluationReport]
    let sourceBinding: CalibrationEvaluationSourceBinding
  }

  static func digest(
    schemaVersion: Int,
    ledgerSchemaVersion: Int,
    generatedAt: Date,
    activationAuthority: CalibrationReportActivationAuthority,
    partitionIsolation: CalibrationPartitionIsolationStatus,
    gates: CalibrationEvaluationGates,
    overall: CalibrationEvaluationSummary,
    familyReports: [CalibrationFamilyEvaluationReport],
    evidenceFamilyReports: [CalibrationEvidenceFamilyEvaluationReport],
    partitionReports: [CalibrationPartitionEvaluationReport],
    sourceBinding: CalibrationEvaluationSourceBinding
  ) -> String {
    let payload = Payload(
      schemaVersion: schemaVersion,
      ledgerSchemaVersion: ledgerSchemaVersion,
      generatedAt: generatedAt,
      activationAuthority: activationAuthority,
      partitionIsolation: partitionIsolation,
      gates: gates,
      overall: overall,
      familyReports: familyReports,
      evidenceFamilyReports: evidenceFamilyReports,
      partitionReports: partitionReports,
      sourceBinding: sourceBinding)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .millisecondsSince1970
    guard let data = try? encoder.encode(payload) else {
      preconditionFailure("Calibration report integrity payload must be encodable.")
    }
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  static func sourceFactsDigest(_ decisions: [CalibrationReviewDecisionRecord]) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .millisecondsSince1970
    guard let data = try? encoder.encode(decisions) else {
      preconditionFailure("Calibration report source facts must be encodable.")
    }
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

public enum CalibrationEvaluationError: Error, LocalizedError, Equatable {
  case artistPartitionLeakage(String)
  case songPartitionLeakage(String)
  case invalidGeneratedAt
  case invalidGateEvidence(String)

  public var errorDescription: String? {
    switch self {
    case .artistPartitionLeakage(let digest):
      "Artist group \(digest) appears in both training and held-out partitions."
    case .songPartitionLeakage(let digest):
      "Song group \(digest) appears in both training and held-out partitions."
    case .invalidGeneratedAt:
      "Report generation time must be finite and nonnegative."
    case .invalidGateEvidence(let field):
      "Calibration gate evidence is invalid: \(field)."
    }
  }
}

public struct CalibrationEvaluationReportGenerator: Sendable {
  static let evaluationAlgorithm = "studio-time-machine-local-calibration"
  static let evaluationVersion = "3"

  public init() {}

  public static func resourceEvaluationCorpusDigest(
    for directory: CalibrationReviewDirectory
  ) -> String {
    resourceEvaluationCorpusDigest(
      for: directory.decisions.filter { $0.isActive && $0.isEvaluationEligible })
  }

  public func generate(
    directory: CalibrationReviewDirectory,
    generatedAt: Date = Date(),
    evidence: CalibrationEvaluationEvidence = .localPrototype
  ) throws -> CalibrationEvaluationReport {
    try generate(
      directory: directory,
      generatedAt: generatedAt,
      evidence: evidence,
      sourceBinding: nil)
  }

  func generate(
    snapshot: CalibrationReviewStoreSnapshot,
    generatedAt: Date,
    evidence: CalibrationEvaluationEvidence
  ) throws -> CalibrationEvaluationReport {
    let evaluated = snapshot.directory.decisions.filter {
      $0.isActive && $0.isEvaluationEligible
    }
    let binding = CalibrationEvaluationSourceBinding(
      storeIdentity: snapshot.storeIdentity,
      storeGeneration: snapshot.generation,
      storeContentDigest: snapshot.contentDigest,
      evaluationAlgorithm: Self.evaluationAlgorithm,
      evaluationVersion: Self.evaluationVersion,
      evaluatedDecisionCount: evaluated.count,
      evaluatedSourceFactsDigest: CalibrationReportIntegrity.sourceFactsDigest(evaluated))
    return try generate(
      directory: snapshot.directory,
      generatedAt: generatedAt,
      evidence: evidence,
      sourceBinding: binding)
  }

  private func generate(
    directory: CalibrationReviewDirectory,
    generatedAt: Date,
    evidence: CalibrationEvaluationEvidence,
    sourceBinding: CalibrationEvaluationSourceBinding?
  ) throws -> CalibrationEvaluationReport {
    guard generatedAt.timeIntervalSince1970.isFinite,
      generatedAt.timeIntervalSince1970 >= 0
    else {
      throw CalibrationEvaluationError.invalidGeneratedAt
    }
    try validate(evidence: evidence, generatedAt: generatedAt)
    let decisions = directory.decisions.filter { $0.isActive && $0.isEvaluationEligible }
    let isolation = try validatePartitionIsolation(decisions)
    let familyReports: [CalibrationFamilyEvaluationReport] =
      CalibrationReviewTaskFamily.allCases.compactMap { family in
        let matches = decisions.filter { $0.family == family }
        guard !matches.isEmpty else { return nil }
        return CalibrationFamilyEvaluationReport(
          family: family,
          summary: summary(for: matches))
      }
    let observedFamilies = Set(
      decisions.compactMap(\.primaryObservation).flatMap(\.evidenceFamilies))
    let evidenceFamilyReports = observedFamilies.map { family in
      CalibrationEvidenceFamilyEvaluationReport(
        evidenceFamily: family,
        summary: summary(
          for: decisions.filter {
            $0.primaryObservation?.evidenceFamilies.contains(family) == true
          }))
    }
    let partitions = Set(decisions.compactMap(\.corpusPartition))
    let partitionReports = partitions.map { partition in
      CalibrationPartitionEvaluationReport(
        partition: partition,
        summary: summary(for: decisions.filter { $0.corpusPartition == partition }))
    }
    let overall = summary(for: decisions)
    let gates = resolveGates(
      evidence: evidence,
      decisions: decisions,
      overall: overall,
      isolation: isolation)
    return CalibrationEvaluationReport(
      generatedAt: generatedAt,
      partitionIsolation: isolation,
      gates: gates,
      overall: overall,
      familyReports: familyReports,
      evidenceFamilyReports: evidenceFamilyReports,
      partitionReports: partitionReports,
      sourceBinding: sourceBinding)
  }

  private func summary(
    for decisions: [CalibrationReviewDecisionRecord]
  ) -> CalibrationEvaluationSummary {
    let primaries = decisions.compactMap {
      decision -> (CalibrationReviewDecisionRecord, CalibrationObservationSnapshot)? in
      guard let primary = decision.primaryObservation else { return nil }
      return (decision, primary)
    }
    let predicted = primaries.filter {
      $0.1.predictionDisposition != .abstained && $0.1.predictedLabel != nil
    }
    let correct = predicted.filter { $0.0.label == $0.1.predictedLabel }
    let falseAutomatic = primaries.filter {
      $0.1.predictionDisposition == .automatic && $0.0.label != $0.1.predictedLabel
    }
    let reviewedCount = primaries.count
    let predictedCount = predicted.count
    return CalibrationEvaluationSummary(
      reviewedDecisionCount: reviewedCount,
      predictedObservationCount: predictedCount,
      correctPredictionCount: correct.count,
      precision: ratio(correct.count, predictedCount),
      recall: ratio(correct.count, reviewedCount),
      abstentionRate: ratio(reviewedCount - predictedCount, reviewedCount),
      coverage: ratio(predictedCount, reviewedCount),
      falseAutomaticDecisionCount: falseAutomatic.count,
      scoreSummary: scoreSummary(for: predicted),
      performance: performanceSummary(for: primaries.map(\.1)))
  }

  private func scoreSummary(
    for decisions: [(CalibrationReviewDecisionRecord, CalibrationObservationSnapshot)]
  ) -> CalibrationScoreSummary {
    let scored = decisions.compactMap { item -> (Double, Double)? in
      guard let score = item.1.score else { return nil }
      return (score, item.0.label == item.1.predictedLabel ? 1 : 0)
    }
    return CalibrationScoreSummary(
      scoredObservationCount: scored.count,
      brierScore: average(scored.map { pow($0.0 - $0.1, 2) }),
      meanAbsoluteCalibrationError: average(scored.map { abs($0.0 - $0.1) }))
  }

  private func performanceSummary(
    for observations: [CalibrationObservationSnapshot]
  ) -> CalibrationPerformanceSummary {
    let measurements = observations.compactMap(\.performance)
    let wallClock = completeFiniteNonnegativeValues(
      observations,
      keyPath: \.wallClockMilliseconds)
    let cpu = completeFiniteNonnegativeValues(observations, keyPath: \.cpuMilliseconds)
    let peakResident = completeFiniteNonnegativeValues(
      observations,
      keyPath: \.peakResidentMegabytes)
    let bytesScanned = completeNonnegativeValues(observations, keyPath: \.bytesScanned)
    let comparedCandidates = completeNonnegativeValues(
      observations,
      keyPath: \.comparedCandidateCount)
    return CalibrationPerformanceSummary(
      measuredObservationCount: measurements.count,
      meanWallClockMilliseconds: wallClock.flatMap(average),
      meanCPUMilliseconds: cpu.flatMap(average),
      maximumPeakResidentMegabytes: peakResident?.max(),
      totalBytesScanned: bytesScanned?.reduce(0, +),
      totalComparedCandidateCount: comparedCandidates?.reduce(0, +))
  }

  private func validatePartitionIsolation(
    _ decisions: [CalibrationReviewDecisionRecord]
  ) throws -> CalibrationPartitionIsolationStatus {
    let partitions = decisions.compactMap(\.corpusPartition)
    guard !partitions.isEmpty else { return .notRun }
    let byCorpus = Dictionary(grouping: partitions, by: \.corpusKind)
    for corpusPartitions in byCorpus.values {
      for lhs in CalibrationCorpusSplit.allCases {
        for rhs in CalibrationCorpusSplit.allCases where lhs.rawValue < rhs.rawValue {
          let left = corpusPartitions.filter { $0.split == lhs }
          let right = corpusPartitions.filter { $0.split == rhs }
          let leakedArtists = Set(left.map(\.artistGroupDigest))
            .intersection(Set(right.map(\.artistGroupDigest)))
          if let digest = leakedArtists.sorted().first {
            throw CalibrationEvaluationError.artistPartitionLeakage(digest)
          }
          let leakedSongs = Set(left.map(\.songGroupDigest))
            .intersection(Set(right.map(\.songGroupDigest)))
          if let digest = leakedSongs.sorted().first {
            throw CalibrationEvaluationError.songPartitionLeakage(digest)
          }
        }
      }
    }
    return byCorpus.values.contains {
      Set($0.map(\.split)) == Set(CalibrationCorpusSplit.allCases)
    }
      ? .passed : .notRun
  }

  private func resolveGates(
    evidence: CalibrationEvaluationEvidence,
    decisions: [CalibrationReviewDecisionRecord],
    overall: CalibrationEvaluationSummary,
    isolation: CalibrationPartitionIsolationStatus
  ) -> CalibrationEvaluationGates {
    let labelled = labelledCorpusStatus(
      evidence.labelledCorpus,
      decisions: decisions,
      isolation: isolation)
    let rights: CalibrationEvaluationGateStatus =
      if let rights = evidence.rightsAndModel {
        rights.permitsLocalEvaluation && rights.permitsProductionUse ? .accepted : .ineligible
      } else { .notRun }
    let resource: CalibrationEvaluationGateStatus =
      if let budget = evidence.resourceBudget {
        resourceBudgetStatus(budget, decisions: decisions, summary: overall)
      } else { .notRun }
    return CalibrationEvaluationGates(
      labelledCorpusEvaluation: labelled,
      rightsAndModelReview: rights,
      resourceBudget: resource,
      realDAWQualification: evidence.realDAWQualification == nil ? .notRun : .accepted,
      packaging: evidence.packaging == nil ? .notRun : .accepted,
      hostedService: evidence.hostedService == nil ? .notRun : .accepted,
      evidence: evidence)
  }

  private func labelledCorpusStatus(
    _ evidence: CalibrationLabelledCorpusGateEvidence?,
    decisions: [CalibrationReviewDecisionRecord],
    isolation: CalibrationPartitionIsolationStatus
  ) -> CalibrationEvaluationGateStatus {
    guard let evidence else { return .notRun }
    let real = decisions.filter { $0.corpusPartition?.corpusKind == .realLabelled }
    let counts = Dictionary(grouping: real, by: { $0.corpusPartition!.split }).mapValues(\.count)
    guard isolation == .passed else { return .notRun }
    guard
      CalibrationCorpusSplit.allCases.allSatisfy({
        counts[$0, default: 0] >= evidence.minimumReviewedPerSplit
      })
    else { return .notRun }
    let heldOut = real.filter { $0.corpusPartition?.split == .heldOut }
    let metrics = summary(for: heldOut)
    guard let precision = metrics.precision,
      let recall = metrics.recall,
      let brier = metrics.scoreSummary.brierScore
    else { return .notRun }
    return precision >= evidence.minimumPrecision
      && recall >= evidence.minimumRecall
      && brier <= evidence.maximumBrierScore
      && metrics.falseAutomaticDecisionCount <= evidence.maximumFalseAutomaticDecisionCount
      ? .accepted : .ineligible
  }

  private func resourceBudgetStatus(
    _ budget: CalibrationResourceBudgetReviewEvidence,
    decisions: [CalibrationReviewDecisionRecord],
    summary: CalibrationEvaluationSummary
  ) -> CalibrationEvaluationGateStatus {
    let observations = decisions.compactMap(\.primaryObservation)
    guard !observations.isEmpty,
      observations.count == decisions.count,
      budget.evaluatedObservationCount == observations.count,
      budget.evaluatedCorpusDigest == Self.resourceEvaluationCorpusDigest(for: decisions)
    else { return .notRun }
    guard
      observations.allSatisfy({ observation in
        guard let performance = observation.performance,
          validMeasurement(performance.wallClockMilliseconds),
          validMeasurement(performance.peakResidentMegabytes),
          validMeasurement(performance.bytesScanned),
          validMeasurement(performance.comparedCandidateCount)
        else { return false }
        return budget.maximumMeanCPUMilliseconds == nil
          || validMeasurement(performance.cpuMilliseconds)
      })
    else { return .notRun }
    let performance = summary.performance
    guard performance.measuredObservationCount == summary.reviewedDecisionCount,
      let wall = performance.meanWallClockMilliseconds,
      let memory = performance.maximumPeakResidentMegabytes,
      let bytes = performance.totalBytesScanned,
      let candidates = performance.totalComparedCandidateCount
    else { return .notRun }
    let cpuWithinBudget =
      if let maximumCPU = budget.maximumMeanCPUMilliseconds {
        performance.meanCPUMilliseconds.map { $0 <= maximumCPU } ?? false
      } else { true }
    return wall <= budget.maximumMeanWallClockMilliseconds && cpuWithinBudget
      && memory <= budget.maximumPeakResidentMegabytes
      && bytes <= budget.maximumTotalBytesScanned
      && candidates <= budget.maximumComparedCandidateCount
      ? .accepted : .ineligible
  }

  private static func resourceEvaluationCorpusDigest(
    for decisions: [CalibrationReviewDecisionRecord]
  ) -> String {
    struct Entry: Encodable {
      let decisionID: String
      let observationID: String
      let observationFeatureDigest: String
    }
    let entries = decisions.compactMap { decision -> Entry? in
      guard let observation = decision.primaryObservation else { return nil }
      return Entry(
        decisionID: decision.id,
        observationID: observation.id,
        observationFeatureDigest: observation.featureDigest)
    }.sorted {
      ($0.decisionID, $0.observationID, $0.observationFeatureDigest)
        < ($1.decisionID, $1.observationID, $1.observationFeatureDigest)
    }
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    guard let data = try? encoder.encode(entries) else {
      preconditionFailure("Resource evaluation corpus must be encodable.")
    }
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private func completeFiniteNonnegativeValues(
    _ observations: [CalibrationObservationSnapshot],
    keyPath: KeyPath<CalibrationObservationPerformance, Double?>
  ) -> [Double]? {
    guard !observations.isEmpty else { return nil }
    let values = observations.compactMap { $0.performance?[keyPath: keyPath] }
    guard values.count == observations.count,
      values.allSatisfy({ $0.isFinite && $0 >= 0 })
    else { return nil }
    return values
  }

  private func completeNonnegativeValues<T: FixedWidthInteger>(
    _ observations: [CalibrationObservationSnapshot],
    keyPath: KeyPath<CalibrationObservationPerformance, T?>
  ) -> [T]? {
    guard !observations.isEmpty else { return nil }
    let values = observations.compactMap { $0.performance?[keyPath: keyPath] }
    guard values.count == observations.count, values.allSatisfy({ $0 >= 0 }) else { return nil }
    return values
  }

  private func validMeasurement(_ value: Double?) -> Bool {
    value.map { $0.isFinite && $0 >= 0 } ?? false
  }

  private func validMeasurement<T: FixedWidthInteger>(_ value: T?) -> Bool {
    value.map { $0 >= 0 } ?? false
  }

  private func validate(
    evidence: CalibrationEvaluationEvidence,
    generatedAt: Date
  ) throws {
    let reviews = [
      evidence.labelledCorpus?.review,
      evidence.rightsAndModel?.review,
      evidence.resourceBudget?.review,
      evidence.realDAWQualification,
      evidence.packaging,
      evidence.hostedService,
    ].compactMap { $0 }
    for review in reviews {
      try validateReview(review, generatedAt: generatedAt)
    }
    if let labelled = evidence.labelledCorpus {
      guard validDigest(labelled.reviewedEvaluationReportDigest),
        labelled.minimumReviewedPerSplit
          >= CalibrationLabelledCorpusGateEvidence.minimumAcceptedReviewedPerSplit,
        labelled.minimumReviewedPerSplit <= 1_000_000,
        labelled.minimumPrecision.isFinite, (0.9...1).contains(labelled.minimumPrecision),
        labelled.minimumRecall.isFinite, (0.8...1).contains(labelled.minimumRecall),
        labelled.maximumBrierScore.isFinite, (0...0.1).contains(labelled.maximumBrierScore),
        labelled.maximumFalseAutomaticDecisionCount == 0
      else { throw CalibrationEvaluationError.invalidGateEvidence("labelledCorpus") }
    }
    if let rights = evidence.rightsAndModel {
      guard validDigest(rights.licenceEvidenceDigest),
        rights.modelArtifactDigest.map(validDigest) ?? true,
        rights.licenceBasis != .noExternalModel || rights.modelArtifactDigest == nil
      else { throw CalibrationEvaluationError.invalidGateEvidence("rightsAndModel") }
    }
    if let budget = evidence.resourceBudget {
      guard budget.evaluatedCorpusDigest.map(validDigest) ?? true,
        budget.evaluatedObservationCount.map({
          (1...CalibrationReviewLimits.maximumDecisions).contains($0)
        }) ?? true,
        budget.maximumMeanWallClockMilliseconds.isFinite,
        budget.maximumMeanWallClockMilliseconds > 0,
        budget.maximumMeanWallClockMilliseconds
          <= CalibrationReviewLimits.maximumElapsedMilliseconds,
        budget.maximumMeanCPUMilliseconds.map({
          $0.isFinite && $0 > 0 && $0 <= CalibrationReviewLimits.maximumElapsedMilliseconds
        }) ?? true,
        budget.maximumPeakResidentMegabytes.isFinite,
        budget.maximumPeakResidentMegabytes > 0,
        budget.maximumPeakResidentMegabytes <= CalibrationReviewLimits.maximumPeakResidentMegabytes,
        budget.maximumTotalBytesScanned > 0,
        budget.maximumTotalBytesScanned <= CalibrationReviewLimits.maximumBytesScanned,
        budget.maximumComparedCandidateCount > 0,
        budget.maximumComparedCandidateCount
          <= CalibrationReviewLimits.maximumComparedCandidateCount
      else { throw CalibrationEvaluationError.invalidGateEvidence("resourceBudget") }
    }
  }

  private func validateReview(
    _ review: CalibrationReviewedEvidenceReference,
    generatedAt: Date
  ) throws {
    guard !review.id.isEmpty,
      review.id.utf8.count <= CalibrationReviewLimits.maximumIdentifierLength,
      review.id.allSatisfy({ $0.isLetter || $0.isNumber || ":._-".contains($0) }),
      validDigest(review.digest),
      review.reviewedAt.timeIntervalSince1970.isFinite,
      (0...CalibrationReviewLimits.maximumDateSeconds).contains(
        review.reviewedAt.timeIntervalSince1970),
      review.reviewedAt <= generatedAt,
      !review.reviewAuthority.isEmpty,
      review.reviewAuthority.utf8.count <= CalibrationReviewLimits.maximumIdentifierLength,
      !CalibrationPrivacy.containsPath(review.reviewAuthority),
      !CalibrationPrivacy.containsPersonalData(review.reviewAuthority)
    else { throw CalibrationEvaluationError.invalidGateEvidence("review") }
  }

  private func validDigest(_ value: String) -> Bool {
    value.count == 64 && value.allSatisfy(\.isHexDigit)
  }

  private func ratio(_ numerator: Int, _ denominator: Int) -> Double? {
    guard denominator > 0 else { return nil }
    return Double(numerator) / Double(denominator)
  }

  private func average(_ values: [Double]) -> Double? {
    guard !values.isEmpty else { return nil }
    return values.reduce(0, +) / Double(values.count)
  }
}

public enum CalibrationEvaluationReportRenderer {
  public static func markdown(_ report: CalibrationEvaluationReport) -> String {
    var lines = [
      "# Studio Time Machine Calibration Evaluation",
      "",
      "- Report schema: \(report.schemaVersion)",
      "- Ledger schema: \(report.ledgerSchemaVersion)",
      "- Generated: \(iso8601(report.generatedAt))",
      "- Activation authority: \(report.activationAuthority.rawValue)",
      "- Partition isolation: \(report.partitionIsolation.rawValue)",
      "",
      "## Verification gates",
      "",
      "| Gate | Status |",
      "| --- | --- |",
      "| Labelled-corpus evaluation | \(report.gates.labelledCorpusEvaluation.rawValue) |",
      "| Rights and model review | \(report.gates.rightsAndModelReview.rawValue) |",
      "| Resource budget | \(report.gates.resourceBudget.rawValue) |",
      "| Real DAW qualification | \(report.gates.realDAWQualification.rawValue) |",
      "| Packaging | \(report.gates.packaging.rawValue) |",
      "| Hosted service | \(report.gates.hostedService.rawValue) |",
      "",
      "Reports are local evaluation evidence only and never activate production ML.",
      "",
      "## Overall",
      "",
    ]
    lines.append(contentsOf: summaryLines(report.overall))
    if !report.familyReports.isEmpty {
      lines.append(contentsOf: ["", "## Task families", ""])
      for family in report.familyReports {
        lines.append("### \(humanize(family.family.rawValue))")
        lines.append("")
        lines.append(contentsOf: summaryLines(family.summary))
        lines.append("")
      }
    }
    if !report.evidenceFamilyReports.isEmpty {
      lines.append(contentsOf: ["## Evidence families", ""])
      for family in report.evidenceFamilyReports {
        lines.append("### \(humanize(family.evidenceFamily.rawValue))")
        lines.append("")
        lines.append(contentsOf: summaryLines(family.summary))
        lines.append("")
      }
    }
    if !report.partitionReports.isEmpty {
      lines.append(contentsOf: ["## Corpus partitions", ""])
      for partition in report.partitionReports {
        let value = partition.partition
        lines.append(
          "### \(humanize(value.corpusKind.rawValue)) / \(humanize(value.split.rawValue))")
        lines.append("")
        lines.append(
          "- Artist group digest: \(safeDigest(value.artistGroupDigest))")
        lines.append(
          "- Song group digest: \(safeDigest(value.songGroupDigest))")
        lines.append("")
        lines.append(contentsOf: summaryLines(partition.summary))
        lines.append("")
      }
    }
    return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines) + "\n"
  }

  private static func summaryLines(_ summary: CalibrationEvaluationSummary) -> [String] {
    [
      "| Metric | Value |",
      "| --- | ---: |",
      "| Reviewed decisions | \(summary.reviewedDecisionCount) |",
      "| Predicted observations | \(summary.predictedObservationCount) |",
      "| Correct predictions | \(summary.correctPredictionCount) |",
      "| Precision | \(percent(summary.precision)) |",
      "| Recall | \(percent(summary.recall)) |",
      "| Abstention | \(percent(summary.abstentionRate)) |",
      "| Coverage | \(percent(summary.coverage)) |",
      "| False automatic decisions | \(summary.falseAutomaticDecisionCount) |",
      "| Scored observations | \(summary.scoreSummary.scoredObservationCount) |",
      "| Brier score | \(number(summary.scoreSummary.brierScore)) |",
      "| Mean absolute calibration error | \(number(summary.scoreSummary.meanAbsoluteCalibrationError)) |",
      "| Measured observations | \(summary.performance.measuredObservationCount) |",
      "| Mean wall clock ms | \(number(summary.performance.meanWallClockMilliseconds)) |",
      "| Mean CPU ms | \(number(summary.performance.meanCPUMilliseconds)) |",
      "| Maximum peak resident MB | \(number(summary.performance.maximumPeakResidentMegabytes)) |",
      "| Total bytes scanned | \(integer(summary.performance.totalBytesScanned)) |",
      "| Compared candidates | \(integer(summary.performance.totalComparedCandidateCount)) |",
    ]
  }

  private static func iso8601(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }

  private static func integer<T: BinaryInteger>(_ value: T?) -> String {
    guard let value else { return "Not measured" }
    return String(value)
  }

  private static func humanize(_ value: String) -> String {
    let separated = value.replacingOccurrences(
      of: "([a-z0-9])([A-Z])",
      with: "$1 $2",
      options: .regularExpression)
    return escapeMarkdown(separated.replacingOccurrences(of: "_", with: " ").capitalized)
  }

  private static func escapeMarkdown(_ value: String) -> String {
    value
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "|", with: "\\|")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
  }

  private static func safeDigest(_ value: String) -> String {
    guard value.count == 64, value.allSatisfy(\.isHexDigit),
      !CalibrationPrivacy.containsPath(value), !CalibrationPrivacy.containsPersonalData(value)
    else { return "[redacted]" }
    return escapeMarkdown(String(value.prefix(12)))
  }

  private static func percent(_ value: Double?) -> String {
    guard let value else { return "n/a" }
    return String(format: "%.2f%%", value * 100)
  }

  private static func number(_ value: Double?) -> String {
    guard let value else { return "n/a" }
    return String(format: "%.4f", value)
  }
}
