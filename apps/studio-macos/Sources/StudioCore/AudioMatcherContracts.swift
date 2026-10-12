import CryptoKit
import Foundation

public enum AudioMatchingCapability: String, Codable, Sendable, CaseIterable {
  case nearIdentity
  case segment
  case excerptRetrieval
  case transformation
  case semantic
  case sourceSeparatedRetrieval
}

public enum AudioMaterialClass: String, Codable, Sendable, CaseIterable {
  case oneShot
  case loop
  case vocal
  case stem
  case fullMix
  case mixedCorpus
}

public enum AudioMatchingCalibrationAcceptance: String, Codable, Sendable, CaseIterable {
  case experimental
  case accepted
}

public enum AudioMatchingRightsReview: String, Codable, Sendable, CaseIterable {
  case pending
  case notRequired
  case approved
}

public struct AudioMatchingHeldOutEvaluation: Codable, Sendable, Equatable {
  public let id: String
  public let exampleCount: Int
  public let evaluatedAt: Date
  public let passed: Bool

  public init(id: String, exampleCount: Int, evaluatedAt: Date, passed: Bool) {
    self.id = id
    self.exampleCount = exampleCount
    self.evaluatedAt = evaluatedAt
    self.passed = passed
  }
}

public struct AudioMatchingResourceBudget: Codable, Sendable, Equatable {
  public let maximumDurationSeconds: Double
  public let maximumFingerprintFrames: Int
  public let maximumCandidateCount: Int
  public let maximumFileBytes: Int64
  public let maximumWorkingMemoryBytes: Int64

  public init(
    maximumDurationSeconds: Double,
    maximumFingerprintFrames: Int,
    maximumCandidateCount: Int,
    maximumFileBytes: Int64,
    maximumWorkingMemoryBytes: Int64
  ) {
    self.maximumDurationSeconds = maximumDurationSeconds
    self.maximumFingerprintFrames = maximumFingerprintFrames
    self.maximumCandidateCount = maximumCandidateCount
    self.maximumFileBytes = maximumFileBytes
    self.maximumWorkingMemoryBytes = maximumWorkingMemoryBytes
  }
}

public struct AudioMatchResourceUsage: Codable, Sendable, Equatable {
  public let sourceDurationSeconds: Double
  public let targetDurationSeconds: Double
  public let sourceFingerprintFrames: Int
  public let targetFingerprintFrames: Int
  public let candidateCount: Int
  public let sourceFileBytes: Int64
  public let targetFileBytes: Int64
  /// Deterministic matcher payload bytes at the peak phase; this is not process RSS.
  public let workingMemoryMeasuredBytes: Int64
  /// Conservative pre-allocation ceiling including capacity slack and fixed overhead.
  public let workingMemoryUpperBoundBytes: Int64

  public init(
    sourceDurationSeconds: Double,
    targetDurationSeconds: Double,
    sourceFingerprintFrames: Int,
    targetFingerprintFrames: Int,
    candidateCount: Int,
    sourceFileBytes: Int64,
    targetFileBytes: Int64,
    workingMemoryMeasuredBytes: Int64 = 0,
    workingMemoryUpperBoundBytes: Int64
  ) {
    self.sourceDurationSeconds = sourceDurationSeconds
    self.targetDurationSeconds = targetDurationSeconds
    self.sourceFingerprintFrames = sourceFingerprintFrames
    self.targetFingerprintFrames = targetFingerprintFrames
    self.candidateCount = candidateCount
    self.sourceFileBytes = sourceFileBytes
    self.targetFileBytes = targetFileBytes
    self.workingMemoryMeasuredBytes = workingMemoryMeasuredBytes
    self.workingMemoryUpperBoundBytes = workingMemoryUpperBoundBytes
  }

  private enum CodingKeys: String, CodingKey {
    case sourceDurationSeconds, targetDurationSeconds
    case sourceFingerprintFrames, targetFingerprintFrames, candidateCount
    case sourceFileBytes, targetFileBytes
    case workingMemoryMeasuredBytes, workingMemoryUpperBoundBytes
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      sourceDurationSeconds: try container.decode(Double.self, forKey: .sourceDurationSeconds),
      targetDurationSeconds: try container.decode(Double.self, forKey: .targetDurationSeconds),
      sourceFingerprintFrames: try container.decode(Int.self, forKey: .sourceFingerprintFrames),
      targetFingerprintFrames: try container.decode(Int.self, forKey: .targetFingerprintFrames),
      candidateCount: try container.decode(Int.self, forKey: .candidateCount),
      sourceFileBytes: try container.decode(Int64.self, forKey: .sourceFileBytes),
      targetFileBytes: try container.decode(Int64.self, forKey: .targetFileBytes),
      workingMemoryMeasuredBytes: try container.decodeIfPresent(
        Int64.self, forKey: .workingMemoryMeasuredBytes) ?? 0,
      workingMemoryUpperBoundBytes: try container.decode(
        Int64.self, forKey: .workingMemoryUpperBoundBytes))
  }
}

public struct AudioMatchingCalibration: Codable, Sendable, Equatable {
  public let id: String
  public let algorithmFamily: String
  public let algorithmVersion: String?
  public let materialClass: AudioMaterialClass
  public let validatedExampleCount: Int
  public let validatedAt: Date
  public let automaticScoreThreshold: Double
  public let minimumCoverage: Double
  public let minimumRunnerUpMargin: Double
  public let capability: AudioMatchingCapability?
  public let acceptance: AudioMatchingCalibrationAcceptance
  public let heldOutEvaluation: AudioMatchingHeldOutEvaluation?
  public let rightsReview: AudioMatchingRightsReview
  public let resourceBudget: AudioMatchingResourceBudget?

  public init(
    id: String,
    algorithmFamily: String,
    algorithmVersion: String? = nil,
    materialClass: AudioMaterialClass,
    validatedExampleCount: Int,
    validatedAt: Date,
    automaticScoreThreshold: Double,
    minimumCoverage: Double,
    minimumRunnerUpMargin: Double,
    capability: AudioMatchingCapability? = nil,
    acceptance: AudioMatchingCalibrationAcceptance = .experimental,
    heldOutEvaluation: AudioMatchingHeldOutEvaluation? = nil,
    rightsReview: AudioMatchingRightsReview = .pending,
    resourceBudget: AudioMatchingResourceBudget? = nil
  ) {
    self.id = id
    self.algorithmFamily = algorithmFamily
    self.algorithmVersion = algorithmVersion
    self.materialClass = materialClass
    self.validatedExampleCount = validatedExampleCount
    self.validatedAt = validatedAt
    self.automaticScoreThreshold = automaticScoreThreshold
    self.minimumCoverage = minimumCoverage
    self.minimumRunnerUpMargin = minimumRunnerUpMargin
    self.capability = capability
    self.acceptance = acceptance
    self.heldOutEvaluation = heldOutEvaluation
    self.rightsReview = rightsReview
    self.resourceBudget = resourceBudget
  }

  private enum CodingKeys: String, CodingKey {
    case id, algorithmFamily, algorithmVersion, materialClass, validatedExampleCount, validatedAt
    case automaticScoreThreshold, minimumCoverage, minimumRunnerUpMargin
    case capability, acceptance, heldOutEvaluation, rightsReview, resourceBudget
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    algorithmFamily = try container.decode(String.self, forKey: .algorithmFamily)
    algorithmVersion = try container.decodeIfPresent(String.self, forKey: .algorithmVersion)
    materialClass = try container.decode(AudioMaterialClass.self, forKey: .materialClass)
    validatedExampleCount = try container.decode(Int.self, forKey: .validatedExampleCount)
    validatedAt = try container.decode(Date.self, forKey: .validatedAt)
    automaticScoreThreshold = try container.decode(Double.self, forKey: .automaticScoreThreshold)
    minimumCoverage = try container.decode(Double.self, forKey: .minimumCoverage)
    minimumRunnerUpMargin = try container.decode(Double.self, forKey: .minimumRunnerUpMargin)
    capability = try container.decodeIfPresent(AudioMatchingCapability.self, forKey: .capability)
    acceptance =
      try container.decodeIfPresent(
        AudioMatchingCalibrationAcceptance.self,
        forKey: .acceptance) ?? .experimental
    heldOutEvaluation = try container.decodeIfPresent(
      AudioMatchingHeldOutEvaluation.self,
      forKey: .heldOutEvaluation)
    rightsReview =
      try container.decodeIfPresent(AudioMatchingRightsReview.self, forKey: .rightsReview)
      ?? .pending
    resourceBudget = try container.decodeIfPresent(
      AudioMatchingResourceBudget.self,
      forKey: .resourceBudget)
  }
}

public enum AudioMatcherAvailability: Codable, Sendable, Equatable {
  case available
  case unavailable(reason: String)
  case requiresLicense(reason: String)
}

public struct AudioMatcherDescriptor: Codable, Sendable, Equatable {
  public let id: String
  public let displayName: String
  public let algorithmVersion: String
  public let capabilities: Set<AudioMatchingCapability>
  public let availability: AudioMatcherAvailability

  public init(
    id: String,
    displayName: String,
    algorithmVersion: String,
    capabilities: Set<AudioMatchingCapability>,
    availability: AudioMatcherAvailability
  ) {
    self.id = id
    self.displayName = displayName
    self.algorithmVersion = algorithmVersion
    self.capabilities = capabilities
    self.availability = availability
  }
}

public struct AudioMatchCandidate: Sendable, Equatable {
  public let nodeID: String
  public let fileURL: URL

  public init(nodeID: String, fileURL: URL) {
    self.nodeID = nodeID
    self.fileURL = fileURL
  }
}

public struct AudioMatchRequest: Sendable, Equatable {
  public let sourceNodeID: String
  public let sourceURL: URL
  public let candidates: [AudioMatchCandidate]
  public let materialClass: AudioMaterialClass

  public init(
    sourceNodeID: String,
    sourceURL: URL,
    candidates: [AudioMatchCandidate],
    materialClass: AudioMaterialClass = .mixedCorpus
  ) {
    self.sourceNodeID = sourceNodeID
    self.sourceURL = sourceURL
    self.candidates = candidates
    self.materialClass = materialClass
  }
}

public protocol AudioMatchingEngine: Sendable {
  var descriptor: AudioMatcherDescriptor { get }
  func match(_ request: AudioMatchRequest) async throws -> [AudioMatchObservation]
}

public struct AudioMatchObservation: Codable, Sendable, Equatable {
  public let sourceNodeID: String
  public let targetNodeID: String
  public let capability: AudioMatchingCapability
  public let score: Double
  public let matchedCoverage: Double
  public let runnerUpMargin: Double
  public let sourceRange: AudioTimeRange?
  public let targetRange: AudioTimeRange?
  public let transform: AudioTransformEvidence?
  public let coveredDurationSeconds: Double?
  public let fingerprintDigest: String?
  public let targetFingerprintDigest: String?
  public let fingerprintVersion: String?
  public let sourceObservation: AudioMatchSourceObservation?
  public let targetObservation: AudioMatchSourceObservation?
  public let excerptRetrieval: AudioExcerptRetrievalDiagnostics?
  public let explanation: String
  public let algorithmVersion: String
  public let algorithmFamily: String?
  public let materialClass: AudioMaterialClass
  public let resourceUsage: AudioMatchResourceUsage?
  private var coordinatorAuthorityReceipt: AudioMatchCoordinatorAuthorityReceipt?

  public init(
    sourceNodeID: String,
    targetNodeID: String,
    capability: AudioMatchingCapability,
    score: Double,
    matchedCoverage: Double,
    runnerUpMargin: Double,
    sourceRange: AudioTimeRange? = nil,
    targetRange: AudioTimeRange? = nil,
    transform: AudioTransformEvidence? = nil,
    coveredDurationSeconds: Double? = nil,
    fingerprintDigest: String? = nil,
    targetFingerprintDigest: String? = nil,
    fingerprintVersion: String? = nil,
    sourceObservation: AudioMatchSourceObservation? = nil,
    targetObservation: AudioMatchSourceObservation? = nil,
    excerptRetrieval: AudioExcerptRetrievalDiagnostics? = nil,
    explanation: String,
    algorithmVersion: String,
    algorithmFamily: String? = nil,
    materialClass: AudioMaterialClass = .mixedCorpus,
    resourceUsage: AudioMatchResourceUsage? = nil
  ) {
    self.sourceNodeID = sourceNodeID
    self.targetNodeID = targetNodeID
    self.capability = capability
    self.score = score
    self.matchedCoverage = matchedCoverage
    self.runnerUpMargin = runnerUpMargin
    self.sourceRange = sourceRange
    self.targetRange = targetRange
    self.transform = transform
    self.coveredDurationSeconds = coveredDurationSeconds
    self.fingerprintDigest = fingerprintDigest
    self.targetFingerprintDigest = targetFingerprintDigest
    self.fingerprintVersion = fingerprintVersion
    self.sourceObservation = sourceObservation
    self.targetObservation = targetObservation
    self.excerptRetrieval = excerptRetrieval
    self.explanation = explanation
    self.algorithmVersion = algorithmVersion
    self.algorithmFamily = algorithmFamily
    self.materialClass = materialClass
    self.resourceUsage = resourceUsage
    coordinatorAuthorityReceipt = nil
  }

  func authorized(by receipt: AudioMatchCoordinatorAuthorityReceipt) -> AudioMatchObservation {
    var authorized = self
    authorized.coordinatorAuthorityReceipt = receipt
    return authorized
  }

  var hasValidCoordinatorAuthorityReceipt: Bool {
    coordinatorAuthorityReceipt?.matches(self) == true
  }
}

extension AudioMatchObservation {
  private enum CodingKeys: String, CodingKey {
    case sourceNodeID, targetNodeID, capability, score, matchedCoverage, runnerUpMargin
    case sourceRange, targetRange, transform, coveredDurationSeconds
    case fingerprintDigest, targetFingerprintDigest, fingerprintVersion
    case sourceObservation, targetObservation, excerptRetrieval
    case explanation, algorithmVersion, algorithmFamily, materialClass, resourceUsage
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      sourceNodeID: try container.decode(String.self, forKey: .sourceNodeID),
      targetNodeID: try container.decode(String.self, forKey: .targetNodeID),
      capability: try container.decode(AudioMatchingCapability.self, forKey: .capability),
      score: try container.decode(Double.self, forKey: .score),
      matchedCoverage: try container.decode(Double.self, forKey: .matchedCoverage),
      runnerUpMargin: try container.decode(Double.self, forKey: .runnerUpMargin),
      sourceRange: try container.decodeIfPresent(AudioTimeRange.self, forKey: .sourceRange),
      targetRange: try container.decodeIfPresent(AudioTimeRange.self, forKey: .targetRange),
      transform: try container.decodeIfPresent(AudioTransformEvidence.self, forKey: .transform),
      coveredDurationSeconds: try container.decodeIfPresent(
        Double.self,
        forKey: .coveredDurationSeconds),
      fingerprintDigest: try container.decodeIfPresent(String.self, forKey: .fingerprintDigest),
      targetFingerprintDigest: try container.decodeIfPresent(
        String.self,
        forKey: .targetFingerprintDigest),
      fingerprintVersion: try container.decodeIfPresent(String.self, forKey: .fingerprintVersion),
      sourceObservation: try container.decodeIfPresent(
        AudioMatchSourceObservation.self,
        forKey: .sourceObservation),
      targetObservation: try container.decodeIfPresent(
        AudioMatchSourceObservation.self,
        forKey: .targetObservation),
      excerptRetrieval: try container.decodeIfPresent(
        AudioExcerptRetrievalDiagnostics.self,
        forKey: .excerptRetrieval),
      explanation: try container.decode(String.self, forKey: .explanation),
      algorithmVersion: try container.decode(String.self, forKey: .algorithmVersion),
      algorithmFamily: try container.decodeIfPresent(String.self, forKey: .algorithmFamily),
      materialClass: try container.decodeIfPresent(AudioMaterialClass.self, forKey: .materialClass)
        ?? .mixedCorpus,
      resourceUsage: try container.decodeIfPresent(
        AudioMatchResourceUsage.self,
        forKey: .resourceUsage))
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(sourceNodeID, forKey: .sourceNodeID)
    try container.encode(targetNodeID, forKey: .targetNodeID)
    try container.encode(capability, forKey: .capability)
    try container.encode(score, forKey: .score)
    try container.encode(matchedCoverage, forKey: .matchedCoverage)
    try container.encode(runnerUpMargin, forKey: .runnerUpMargin)
    try container.encodeIfPresent(sourceRange, forKey: .sourceRange)
    try container.encodeIfPresent(targetRange, forKey: .targetRange)
    try container.encodeIfPresent(transform, forKey: .transform)
    try container.encodeIfPresent(coveredDurationSeconds, forKey: .coveredDurationSeconds)
    try container.encodeIfPresent(fingerprintDigest, forKey: .fingerprintDigest)
    try container.encodeIfPresent(targetFingerprintDigest, forKey: .targetFingerprintDigest)
    try container.encodeIfPresent(fingerprintVersion, forKey: .fingerprintVersion)
    try container.encodeIfPresent(sourceObservation, forKey: .sourceObservation)
    try container.encodeIfPresent(targetObservation, forKey: .targetObservation)
    try container.encodeIfPresent(excerptRetrieval, forKey: .excerptRetrieval)
    try container.encode(explanation, forKey: .explanation)
    try container.encode(algorithmVersion, forKey: .algorithmVersion)
    try container.encodeIfPresent(algorithmFamily, forKey: .algorithmFamily)
    try container.encode(materialClass, forKey: .materialClass)
    try container.encodeIfPresent(resourceUsage, forKey: .resourceUsage)
  }

  public static func == (lhs: AudioMatchObservation, rhs: AudioMatchObservation) -> Bool {
    lhs.sourceNodeID == rhs.sourceNodeID
      && lhs.targetNodeID == rhs.targetNodeID
      && lhs.capability == rhs.capability
      && lhs.score == rhs.score
      && lhs.matchedCoverage == rhs.matchedCoverage
      && lhs.runnerUpMargin == rhs.runnerUpMargin
      && lhs.sourceRange == rhs.sourceRange
      && lhs.targetRange == rhs.targetRange
      && lhs.transform == rhs.transform
      && lhs.coveredDurationSeconds == rhs.coveredDurationSeconds
      && lhs.fingerprintDigest == rhs.fingerprintDigest
      && lhs.targetFingerprintDigest == rhs.targetFingerprintDigest
      && lhs.fingerprintVersion == rhs.fingerprintVersion
      && lhs.sourceObservation == rhs.sourceObservation
      && lhs.targetObservation == rhs.targetObservation
      && lhs.excerptRetrieval == rhs.excerptRetrieval
      && lhs.explanation == rhs.explanation
      && lhs.algorithmVersion == rhs.algorithmVersion
      && lhs.algorithmFamily == rhs.algorithmFamily
      && lhs.materialClass == rhs.materialClass
      && lhs.resourceUsage == rhs.resourceUsage
  }
}

public struct AudioScoreDistribution: Codable, Sendable, Equatable {
  public let minimum: Double
  public let mean: Double
  public let maximum: Double

  public init(minimum: Double, mean: Double, maximum: Double) {
    self.minimum = minimum
    self.mean = mean
    self.maximum = maximum
  }
}

public struct AudioExcerptRetrievalDiagnostics: Codable, Sendable, Equatable {
  public let exactSequenceVerified: Bool
  public let requestedWindowDurationSeconds: Double
  public let requestedHopDurationSeconds: Double
  public let windowDurationSeconds: Double
  public let hopDurationSeconds: Double
  public let matchedWindowCount: Int
  public let consecutiveWindowCount: Int
  public let totalQueryWindowCount: Int
  public let candidateWindowCount: Int
  public let offsetConsistency: Double
  public let runnerUpMargin: Double
  public let queryRange: AudioTimeRange?
  public let referenceRange: AudioTimeRange?
  public let scoreDistribution: AudioScoreDistribution
  public let approximateCandidateVisitCount: Int
  public let exactSequenceComparisonCount: Int
  public let sourceFingerprintFrameCount: Int
  public let targetFingerprintFrameCount: Int
  /// Deterministic matcher payload bytes at the peak phase; this is not process RSS.
  public let workingMemoryMeasuredBytes: Int64
  /// Conservative pre-allocation ceiling including capacity slack and fixed overhead.
  public let workingMemoryUpperBoundBytes: Int64

  public init(
    windowDurationSeconds: Double,
    hopDurationSeconds: Double,
    matchedWindowCount: Int,
    consecutiveWindowCount: Int,
    totalQueryWindowCount: Int,
    candidateWindowCount: Int,
    offsetConsistency: Double,
    scoreDistribution: AudioScoreDistribution,
    exactSequenceVerified: Bool = false,
    requestedWindowDurationSeconds: Double? = nil,
    requestedHopDurationSeconds: Double? = nil,
    runnerUpMargin: Double = 0,
    queryRange: AudioTimeRange? = nil,
    referenceRange: AudioTimeRange? = nil,
    approximateCandidateVisitCount: Int = 0,
    exactSequenceComparisonCount: Int = 0,
    sourceFingerprintFrameCount: Int = 0,
    targetFingerprintFrameCount: Int = 0,
    workingMemoryMeasuredBytes: Int64 = 0,
    workingMemoryUpperBoundBytes: Int64 = 0
  ) {
    self.exactSequenceVerified = exactSequenceVerified
    self.requestedWindowDurationSeconds =
      requestedWindowDurationSeconds ?? windowDurationSeconds
    self.requestedHopDurationSeconds = requestedHopDurationSeconds ?? hopDurationSeconds
    self.windowDurationSeconds = windowDurationSeconds
    self.hopDurationSeconds = hopDurationSeconds
    self.matchedWindowCount = matchedWindowCount
    self.consecutiveWindowCount = consecutiveWindowCount
    self.totalQueryWindowCount = totalQueryWindowCount
    self.candidateWindowCount = candidateWindowCount
    self.offsetConsistency = offsetConsistency
    self.runnerUpMargin = runnerUpMargin
    self.queryRange = queryRange
    self.referenceRange = referenceRange
    self.scoreDistribution = scoreDistribution
    self.approximateCandidateVisitCount = approximateCandidateVisitCount
    self.exactSequenceComparisonCount = exactSequenceComparisonCount
    self.sourceFingerprintFrameCount = sourceFingerprintFrameCount
    self.targetFingerprintFrameCount = targetFingerprintFrameCount
    self.workingMemoryMeasuredBytes = workingMemoryMeasuredBytes
    self.workingMemoryUpperBoundBytes = workingMemoryUpperBoundBytes
  }

  private enum CodingKeys: String, CodingKey {
    case exactSequenceVerified, requestedWindowDurationSeconds, requestedHopDurationSeconds
    case windowDurationSeconds, hopDurationSeconds
    case matchedWindowCount, consecutiveWindowCount, totalQueryWindowCount, candidateWindowCount
    case offsetConsistency, runnerUpMargin, queryRange, referenceRange, scoreDistribution
    case approximateCandidateVisitCount, exactSequenceComparisonCount
    case sourceFingerprintFrameCount, targetFingerprintFrameCount
    case workingMemoryMeasuredBytes, workingMemoryUpperBoundBytes
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let windowDurationSeconds = try container.decode(Double.self, forKey: .windowDurationSeconds)
    let hopDurationSeconds = try container.decode(Double.self, forKey: .hopDurationSeconds)
    self.init(
      windowDurationSeconds: windowDurationSeconds,
      hopDurationSeconds: hopDurationSeconds,
      matchedWindowCount: try container.decode(Int.self, forKey: .matchedWindowCount),
      consecutiveWindowCount: try container.decode(Int.self, forKey: .consecutiveWindowCount),
      totalQueryWindowCount: try container.decode(Int.self, forKey: .totalQueryWindowCount),
      candidateWindowCount: try container.decode(Int.self, forKey: .candidateWindowCount),
      offsetConsistency: try container.decode(Double.self, forKey: .offsetConsistency),
      scoreDistribution: try container.decode(
        AudioScoreDistribution.self, forKey: .scoreDistribution),
      exactSequenceVerified: try container.decodeIfPresent(
        Bool.self, forKey: .exactSequenceVerified) ?? false,
      requestedWindowDurationSeconds: try container.decodeIfPresent(
        Double.self, forKey: .requestedWindowDurationSeconds),
      requestedHopDurationSeconds: try container.decodeIfPresent(
        Double.self, forKey: .requestedHopDurationSeconds),
      runnerUpMargin: try container.decodeIfPresent(Double.self, forKey: .runnerUpMargin) ?? 0,
      queryRange: try container.decodeIfPresent(AudioTimeRange.self, forKey: .queryRange),
      referenceRange: try container.decodeIfPresent(AudioTimeRange.self, forKey: .referenceRange),
      approximateCandidateVisitCount: try container.decodeIfPresent(
        Int.self, forKey: .approximateCandidateVisitCount) ?? 0,
      exactSequenceComparisonCount: try container.decodeIfPresent(
        Int.self, forKey: .exactSequenceComparisonCount) ?? 0,
      sourceFingerprintFrameCount: try container.decodeIfPresent(
        Int.self, forKey: .sourceFingerprintFrameCount) ?? 0,
      targetFingerprintFrameCount: try container.decodeIfPresent(
        Int.self, forKey: .targetFingerprintFrameCount) ?? 0,
      workingMemoryMeasuredBytes: try container.decodeIfPresent(
        Int64.self, forKey: .workingMemoryMeasuredBytes) ?? 0,
      workingMemoryUpperBoundBytes: try container.decodeIfPresent(
        Int64.self, forKey: .workingMemoryUpperBoundBytes) ?? 0)
  }
}

public struct AudioMatchSourceObservation: Codable, Sendable, Equatable {
  public let contentSHA256: String
  public let bytes: Int64
  public let modifiedAtNanoseconds: Int64?
  public let resourceIdentity: String?

  public init(
    contentSHA256: String,
    bytes: Int64,
    modifiedAtNanoseconds: Int64? = nil,
    resourceIdentity: String? = nil
  ) {
    self.contentSHA256 = contentSHA256
    self.bytes = bytes
    self.modifiedAtNanoseconds = modifiedAtNanoseconds
    self.resourceIdentity = resourceIdentity
  }
}

public struct AudioMatchAuthoritativeFileBinding: Codable, Sendable, Equatable {
  public let nodeID: String
  public let fileURL: URL
  public let observation: AudioMatchSourceObservation

  public init(nodeID: String, fileURL: URL, observation: AudioMatchSourceObservation) {
    self.nodeID = nodeID
    self.fileURL = fileURL.standardizedFileURL
    self.observation = observation
  }
}

public protocol AudioMatchAuthoritativeCatalog: Sendable {
  func fileBinding(for nodeID: String) -> AudioMatchAuthoritativeFileBinding?
}

public struct AudioMatchPersistedBindingCatalog: AudioMatchAuthoritativeCatalog, Codable, Sendable,
  Equatable
{
  public let bindings: [AudioMatchAuthoritativeFileBinding]

  public init(bindings: [AudioMatchAuthoritativeFileBinding]) {
    self.bindings = bindings
  }

  public func fileBinding(for nodeID: String) -> AudioMatchAuthoritativeFileBinding? {
    guard !nodeID.isEmpty else { return nil }
    let matches = bindings.filter { $0.nodeID == nodeID }
    guard matches.count == 1 else { return nil }
    return matches[0]
  }
}

enum AudioMatchFileObservationError: Error, Sendable {
  case changedDuringObservation(URL)
  case outsideByteBound(URL)
}

extension AudioMatchSourceObservation {
  static func capture(
    fileURL: URL,
    fileManager: FileManager = .default
  ) throws -> AudioMatchSourceObservation {
    let before = try FileFingerprint.read(from: fileURL, fileManager: fileManager)
    let digest = try FileContentDigest.sha256(fileURL: fileURL)
    let after = try FileFingerprint.read(from: fileURL, fileManager: fileManager)
    guard before == after else {
      throw AudioMatchFileObservationError.changedDuringObservation(fileURL)
    }
    return AudioMatchSourceObservation(
      contentSHA256: digest,
      bytes: after.bytes,
      modifiedAtNanoseconds: after.modifiedAt.map {
        Int64($0.timeIntervalSince1970 * 1_000_000_000)
      },
      resourceIdentity: after.resourceIdentity)
  }

  func matchesCurrentFile(
    at fileURL: URL,
    fileManager: FileManager = .default
  ) -> Bool {
    (try? Self.capture(fileURL: fileURL, fileManager: fileManager)) == self
  }

  var isWellFormedImmutableObservation: Bool {
    contentSHA256.count == 64
      && contentSHA256.allSatisfy(\.isHexDigit)
      && bytes >= 0
  }

  static func captureBounded(
    fileURL: URL,
    maximumBytes: Int64,
    fileManager: FileManager = .default,
    progress: @Sendable (URL, Int64) throws -> Void = { _, _ in }
  ) throws -> AudioMatchSourceObservation {
    guard maximumBytes > 0 else {
      throw AudioMatchFileObservationError.outsideByteBound(fileURL)
    }
    let before = try FileFingerprint.read(from: fileURL, fileManager: fileManager)
    guard before.bytes >= 0, before.bytes <= maximumBytes else {
      throw AudioMatchFileObservationError.outsideByteBound(fileURL)
    }

    let handle = try FileHandle(forReadingFrom: fileURL)
    defer { try? handle.close() }
    var hasher = SHA256()
    var bytesRead: Int64 = 0
    let chunkBytes: Int64 = 64 * 1_024
    while bytesRead < before.bytes {
      let remainingFileBytes = before.bytes - bytesRead
      let remainingBoundBytes = maximumBytes - bytesRead
      let requested = Int(min(chunkBytes, remainingFileBytes, remainingBoundBytes))
      guard requested > 0, let data = try handle.read(upToCount: requested), !data.isEmpty else {
        throw AudioMatchFileObservationError.changedDuringObservation(fileURL)
      }
      bytesRead += Int64(data.count)
      hasher.update(data: data)
      try progress(fileURL, bytesRead)
    }

    let after = try FileFingerprint.read(from: fileURL, fileManager: fileManager)
    guard before == after, bytesRead == before.bytes, after.bytes <= maximumBytes else {
      throw AudioMatchFileObservationError.changedDuringObservation(fileURL)
    }
    let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
    return AudioMatchSourceObservation(
      contentSHA256: digest,
      bytes: after.bytes,
      modifiedAtNanoseconds: after.modifiedAt.map {
        Int64($0.timeIntervalSince1970 * 1_000_000_000)
      },
      resourceIdentity: after.resourceIdentity)
  }

  func matchesCurrentFileBounded(
    at fileURL: URL,
    maximumBytes: Int64,
    fileManager: FileManager = .default
  ) -> Bool {
    (try? Self.captureBounded(
      fileURL: fileURL,
      maximumBytes: maximumBytes,
      fileManager: fileManager)) == self
  }
}

public struct AudioMatchProposalBuilder: Sendable {
  public let calibration: AudioMatchingCalibration?

  public init(calibration: AudioMatchingCalibration? = nil) {
    self.calibration = calibration
  }

  public func edge(from observation: AudioMatchObservation) -> AudioLineageEdge? {
    let relationship: AudioLineageRelationship
    let evidenceKind: AudioMatchEvidenceKind
    let confidence: AudioLineageConfidence
    let acceptedCalibration = applicableCalibration(for: observation)

    switch observation.capability {
    case .nearIdentity:
      guard isStrong(observation, calibration: acceptedCalibration),
        hasRequiredNearIdentityProvenance(observation)
      else { return nil }
      relationship = .nearIdenticalRecording
      evidenceKind = .nearIdentityFingerprint
      confidence =
        acceptedCalibration != nil && observation.hasValidCoordinatorAuthorityReceipt
        ? .highConfidenceDerivative : .suggested
    case .segment:
      guard isStrong(observation, calibration: acceptedCalibration),
        max(
          observation.sourceRange?.durationSeconds ?? 0,
          observation.targetRange?.durationSeconds ?? 0) >= 3
      else { return nil }
      relationship = .containedSegment
      evidenceKind = .landmarkFingerprint
      confidence = acceptedCalibration == nil ? .suggested : .highConfidenceDerivative
    case .excerptRetrieval:
      guard hasRequiredExcerptEvidence(observation)
      else { return nil }
      relationship = .containedSegment
      evidenceKind = .excerptSequenceAlignment
      confidence = .suggested
    case .transformation:
      guard isStrong(observation, calibration: acceptedCalibration), observation.transform != nil
      else { return nil }
      relationship = .transformedFrom
      evidenceKind = .transformedFingerprint
      confidence = .suggested
    case .semantic:
      guard observation.score >= 0.5 else { return nil }
      relationship = .semanticallySimilarTo
      evidenceKind = .semanticEmbedding
      confidence = .suggested
    case .sourceSeparatedRetrieval:
      guard observation.score >= 0.5 else { return nil }
      relationship = .semanticallySimilarTo
      evidenceKind = .semanticEmbedding
      confidence = .suggested
    }

    var evidence: [AudioMatchEvidence] = [
      AudioMatchEvidence(
        kind: evidenceKind,
        score: observation.score,
        explanation: primaryEvidenceExplanation(for: observation))
    ]
    if let sourceObservation = observation.sourceObservation {
      evidence.append(
        AudioMatchEvidence(
          kind: .technicalMetadata,
          score: 1,
          explanation: fileObservationExplanation(sourceObservation, label: "Source")))
    }
    if let targetObservation = observation.targetObservation {
      evidence.append(
        AudioMatchEvidence(
          kind: .technicalMetadata,
          score: 1,
          explanation: fileObservationExplanation(targetObservation, label: "Target")))
    }

    return AudioLineageEdge(
      id: StableID.forValue(
        "audio-match:\(observation.algorithmVersion):\(observation.sourceNodeID):\(observation.targetNodeID):\(observation.capability.rawValue)"
      ),
      sourceNodeID: observation.sourceNodeID,
      targetNodeID: observation.targetNodeID,
      relationship: relationship,
      confidence: confidence,
      explanation: observation.explanation,
      algorithmVersion: observation.algorithmVersion,
      calibrationID: confidence == .highConfidenceDerivative ? acceptedCalibration?.id : nil,
      sourceRange: observation.sourceRange,
      targetRange: observation.targetRange,
      transform: observation.transform,
      evidence: evidence)
  }

  private func isStrong(
    _ observation: AudioMatchObservation,
    calibration: AudioMatchingCalibration?
  ) -> Bool {
    let score = calibration?.automaticScoreThreshold ?? 0.9
    let coverage = calibration?.minimumCoverage ?? 0.8
    let margin = calibration?.minimumRunnerUpMargin ?? 0.15
    return observation.score >= score
      && observation.matchedCoverage >= coverage
      && observation.runnerUpMargin >= margin
  }

  private func applicableCalibration(
    for observation: AudioMatchObservation
  ) -> AudioMatchingCalibration? {
    guard let calibration,
      calibration.acceptance == .accepted,
      calibration.capability == observation.capability,
      calibration.algorithmFamily == observation.algorithmFamily,
      calibration.algorithmVersion == observation.algorithmVersion,
      calibration.materialClass == observation.materialClass,
      calibration.validatedExampleCount > 0,
      let heldOutEvaluation = calibration.heldOutEvaluation,
      heldOutEvaluation.passed,
      !heldOutEvaluation.id.isEmpty,
      heldOutEvaluation.exampleCount > 0,
      calibration.validatedExampleCount >= heldOutEvaluation.exampleCount,
      rightsReviewIsSufficient(calibration.rightsReview, for: observation.capability),
      let resourceBudget = calibration.resourceBudget,
      let resourceUsage = observation.resourceUsage,
      resourceBudgetCovers(resourceUsage, budget: resourceBudget),
      calibration.automaticScoreThreshold.isFinite,
      (0...1).contains(calibration.automaticScoreThreshold),
      calibration.minimumCoverage.isFinite,
      (0...1).contains(calibration.minimumCoverage),
      calibration.minimumRunnerUpMargin.isFinite,
      (0...1).contains(calibration.minimumRunnerUpMargin)
    else { return nil }
    return calibration
  }

  private func hasRequiredNearIdentityProvenance(_ observation: AudioMatchObservation) -> Bool {
    guard observation.capability == .nearIdentity else { return true }
    guard let coveredDurationSeconds = observation.coveredDurationSeconds,
      coveredDurationSeconds.isFinite,
      coveredDurationSeconds > 0,
      let fingerprintDigest = observation.fingerprintDigest,
      isSHA256(fingerprintDigest),
      let targetFingerprintDigest = observation.targetFingerprintDigest,
      isSHA256(targetFingerprintDigest),
      let fingerprintVersion = observation.fingerprintVersion,
      !fingerprintVersion.isEmpty,
      let sourceObservation = observation.sourceObservation,
      sourceObservation.isWellFormedImmutableObservation,
      let targetObservation = observation.targetObservation,
      targetObservation.isWellFormedImmutableObservation,
      let algorithmFamily = observation.algorithmFamily,
      !algorithmFamily.isEmpty,
      observation.resourceUsage != nil
    else { return false }
    return true
  }

  private func hasRequiredExcerptEvidence(_ observation: AudioMatchObservation) -> Bool {
    guard observation.capability == .excerptRetrieval,
      observation.score.isFinite,
      (0...1).contains(observation.score),
      observation.matchedCoverage.isFinite,
      (0.75...1).contains(observation.matchedCoverage),
      observation.score >= 0.7,
      observation.runnerUpMargin.isFinite,
      observation.runnerUpMargin >= 0.05,
      let sourceRange = observation.sourceRange,
      let targetRange = observation.targetRange,
      sourceRange.startSeconds.isFinite,
      sourceRange.startSeconds >= 0,
      sourceRange.durationSeconds.isFinite,
      (5...10).contains(sourceRange.durationSeconds),
      targetRange.startSeconds.isFinite,
      targetRange.startSeconds >= 0,
      targetRange.durationSeconds.isFinite,
      abs(sourceRange.durationSeconds - targetRange.durationSeconds) <= 0.1,
      let sourceObservation = observation.sourceObservation,
      sourceObservation.isWellFormedImmutableObservation,
      let targetObservation = observation.targetObservation,
      targetObservation.isWellFormedImmutableObservation,
      let fingerprintDigest = observation.fingerprintDigest,
      isSHA256(fingerprintDigest),
      let targetFingerprintDigest = observation.targetFingerprintDigest,
      isSHA256(targetFingerprintDigest),
      let fingerprintVersion = observation.fingerprintVersion,
      !fingerprintVersion.isEmpty,
      let algorithmFamily = observation.algorithmFamily,
      !algorithmFamily.isEmpty,
      let coveredDurationSeconds = observation.coveredDurationSeconds,
      coveredDurationSeconds == sourceRange.durationSeconds,
      let diagnostics = observation.excerptRetrieval,
      diagnostics.exactSequenceVerified,
      diagnostics.queryRange == sourceRange,
      diagnostics.referenceRange == targetRange,
      diagnostics.runnerUpMargin == observation.runnerUpMargin,
      diagnostics.windowDurationSeconds.isFinite,
      diagnostics.windowDurationSeconds > 0,
      diagnostics.hopDurationSeconds.isFinite,
      diagnostics.hopDurationSeconds > 0,
      diagnostics.requestedWindowDurationSeconds.isFinite,
      diagnostics.requestedWindowDurationSeconds > 0,
      diagnostics.requestedHopDurationSeconds.isFinite,
      diagnostics.requestedHopDurationSeconds > 0,
      diagnostics.consecutiveWindowCount == diagnostics.matchedWindowCount,
      diagnostics.matchedWindowCount > 0,
      diagnostics.matchedWindowCount <= diagnostics.totalQueryWindowCount,
      diagnostics.offsetConsistency.isFinite,
      diagnostics.offsetConsistency >= 0.8,
      diagnostics.scoreDistribution.minimum.isFinite,
      diagnostics.scoreDistribution.mean.isFinite,
      diagnostics.scoreDistribution.maximum.isFinite,
      (0...1).contains(diagnostics.scoreDistribution.minimum),
      (0...1).contains(diagnostics.scoreDistribution.mean),
      (0...1).contains(diagnostics.scoreDistribution.maximum),
      diagnostics.scoreDistribution.minimum <= diagnostics.scoreDistribution.mean,
      diagnostics.scoreDistribution.mean <= diagnostics.scoreDistribution.maximum,
      diagnostics.scoreDistribution.mean
        >= LocalExcerptRetrievalPrototypeConfiguration.safetyMinimumAverageWindowScore,
      diagnostics.approximateCandidateVisitCount > 0,
      diagnostics.exactSequenceComparisonCount >= diagnostics.matchedWindowCount,
      diagnostics.sourceFingerprintFrameCount > 0,
      diagnostics.targetFingerprintFrameCount > 0,
      diagnostics.workingMemoryMeasuredBytes > 0,
      diagnostics.workingMemoryUpperBoundBytes > 0,
      diagnostics.workingMemoryMeasuredBytes <= diagnostics.workingMemoryUpperBoundBytes,
      let resourceUsage = observation.resourceUsage,
      resourceUsage.sourceFingerprintFrames == diagnostics.sourceFingerprintFrameCount,
      resourceUsage.targetFingerprintFrames == diagnostics.targetFingerprintFrameCount,
      resourceUsage.workingMemoryMeasuredBytes == diagnostics.workingMemoryMeasuredBytes,
      resourceUsage.workingMemoryUpperBoundBytes == diagnostics.workingMemoryUpperBoundBytes,
      resourceUsage.candidateCount > 0,
      sourceRange.startSeconds + sourceRange.durationSeconds
        <= resourceUsage.sourceDurationSeconds + diagnostics.hopDurationSeconds,
      targetRange.startSeconds + targetRange.durationSeconds
        <= resourceUsage.targetDurationSeconds + diagnostics.hopDurationSeconds,
      abs(
        observation.matchedCoverage
          - Double(diagnostics.matchedWindowCount) / Double(diagnostics.totalQueryWindowCount))
        <= 1e-12
    else { return false }
    return true
  }

  private func rightsReviewIsSufficient(
    _ review: AudioMatchingRightsReview,
    for capability: AudioMatchingCapability
  ) -> Bool {
    switch capability {
    case .nearIdentity, .segment:
      return review == .notRequired || review == .approved
    case .excerptRetrieval, .transformation, .semantic, .sourceSeparatedRetrieval:
      return review == .approved
    }
  }

  private func resourceBudgetCovers(
    _ usage: AudioMatchResourceUsage,
    budget: AudioMatchingResourceBudget
  ) -> Bool {
    let valuesAreValid =
      budget.maximumDurationSeconds.isFinite
      && budget.maximumDurationSeconds > 0
      && budget.maximumFingerprintFrames > 0
      && budget.maximumCandidateCount > 0
      && budget.maximumFileBytes > 0
      && budget.maximumWorkingMemoryBytes > 0
      && usage.sourceDurationSeconds.isFinite
      && usage.sourceDurationSeconds > 0
      && usage.targetDurationSeconds.isFinite
      && usage.targetDurationSeconds > 0
      && usage.sourceFingerprintFrames > 0
      && usage.targetFingerprintFrames > 0
      && usage.candidateCount > 0
      && usage.sourceFileBytes > 0
      && usage.targetFileBytes > 0
      && usage.workingMemoryMeasuredBytes > 0
      && usage.workingMemoryUpperBoundBytes > 0
      && usage.workingMemoryMeasuredBytes <= usage.workingMemoryUpperBoundBytes
    guard valuesAreValid else { return false }
    return max(usage.sourceDurationSeconds, usage.targetDurationSeconds)
      <= budget.maximumDurationSeconds
      && max(usage.sourceFingerprintFrames, usage.targetFingerprintFrames)
        <= budget.maximumFingerprintFrames
      && usage.candidateCount <= budget.maximumCandidateCount
      && max(usage.sourceFileBytes, usage.targetFileBytes) <= budget.maximumFileBytes
      && usage.workingMemoryUpperBoundBytes <= budget.maximumWorkingMemoryBytes
  }

  private func isSHA256(_ value: String) -> Bool {
    value.count == 64 && value.allSatisfy(\.isHexDigit)
  }

  private func primaryEvidenceExplanation(for observation: AudioMatchObservation) -> String {
    var parts = [observation.explanation]
    if observation.capability == .nearIdentity {
      if let coveredDurationSeconds = observation.coveredDurationSeconds {
        parts.append(
          "Fingerprint covered \(seconds(coveredDurationSeconds)) of decoded source audio.")
      }
      if let fingerprintDigest = observation.fingerprintDigest {
        parts.append("Source fingerprint digest \(fingerprintDigest).")
      }
      if let targetFingerprintDigest = observation.targetFingerprintDigest {
        parts.append("Target fingerprint digest \(targetFingerprintDigest).")
      }
      if let fingerprintVersion = observation.fingerprintVersion {
        parts.append("Fingerprint version \(fingerprintVersion).")
      }
    } else if observation.capability == .excerptRetrieval,
      let excerptRetrieval = observation.excerptRetrieval
    {
      parts.append(
        "Approximate retrieval shortlisted local candidates; exact sequence verification matched \(excerptRetrieval.matchedWindowCount)/\(excerptRetrieval.totalQueryWindowCount) query windows with \(percent(excerptRetrieval.offsetConsistency)) offset consistency."
      )
      parts.append(
        "Window scores ranged \(percent(excerptRetrieval.scoreDistribution.minimum))-\(percent(excerptRetrieval.scoreDistribution.maximum)) with mean \(percent(excerptRetrieval.scoreDistribution.mean))."
      )
    }
    parts.append(
      "Coverage \(percent(observation.matchedCoverage)); runner-up margin \(percent(observation.runnerUpMargin))."
    )
    return parts.joined(separator: " ")
  }

  private func fileObservationExplanation(
    _ observation: AudioMatchSourceObservation,
    label: String
  ) -> String {
    var parts = [
      "\(label) observation sha256 \(observation.contentSHA256).",
      "Bytes \(observation.bytes).",
    ]
    if let modifiedAtNanoseconds = observation.modifiedAtNanoseconds {
      parts.append("Modified \(modifiedAtNanoseconds) ns.")
    }
    if let resourceIdentity = observation.resourceIdentity {
      parts.append("Resource identity \(resourceIdentity).")
    }
    return parts.joined(separator: " ")
  }

  private func percent(_ value: Double) -> String {
    "\(Int((min(1, max(0, value)) * 100).rounded()))%"
  }

  private func seconds(_ value: Double) -> String {
    String(format: "%.2fs", value)
  }
}
