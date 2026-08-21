import Foundation

public enum ExportKind: String, Codable, Sendable, CaseIterable {
  case master
  case stems
  case bounce
  case render
  case unknown
}

public enum ExportBatchStatus: String, Codable, Sendable, CaseIterable {
  case new
  case reviewed
  case dismissed
  case packaging
  case ready
  case delivering
  case delivered
  case failed
  case quarantined
}

public enum ExportBatchQuarantineReason: String, Codable, Sendable, CaseIterable {
  case invalidLifecycle
  case invalidAssociation
  case packageEvidenceUnavailable
  case packageEvidenceMismatch
}

public enum ExportAssociationConfidence: String, Codable, Sendable, CaseIterable {
  case verified
  case suggested
  case reviewed
}

public enum ExportAssociationState: String, Codable, Sendable, CaseIterable {
  case suggested
  case current
  case stale
}

public enum ExportAssociationStaleReason: String, Codable, Sendable, CaseIterable {
  case missingReviewedReference
  case catalogueGenerationChanged
  case revisionUnavailable
  case workRegrouped
  case sessionChanged
  case setChanged
  case contentChanged
}

public enum ExportAssociationEvidenceKind: String, Codable, Sendable {
  case verifiedAutomationOutput
  case explicitExportFolder
  case filenameSemantic
  case userRelink
}

public enum ExportAssociationEvidence: Codable, Sendable, Equatable, Hashable {
  case verifiedAutomationOutput(planID: String?)
  case explicitExportFolder(folderName: String)
  case filenameSemantic(token: String)
  case userRelink

  public var kind: ExportAssociationEvidenceKind {
    switch self {
    case .verifiedAutomationOutput: .verifiedAutomationOutput
    case .explicitExportFolder: .explicitExportFolder
    case .filenameSemantic: .filenameSemantic
    case .userRelink: .userRelink
    }
  }
}

public struct ExportAssociation: Codable, Sendable, Equatable {
  public let workID: String?
  public let sessionID: String?
  public let revisionID: String?
  public let confidence: ExportAssociationConfidence
  public let evidence: [ExportAssociationEvidence]
  public let revisionReference: StudioRevisionReference?
  public let state: ExportAssociationState
  public let staleReason: ExportAssociationStaleReason?

  public init(
    suggestedWorkID workID: String?,
    suggestedSessionID sessionID: String?,
    suggestedRevisionID revisionID: String?,
    evidence: [ExportAssociationEvidence]
  ) {
    self.workID = workID
    self.sessionID = sessionID
    self.revisionID = revisionID
    confidence = .suggested
    self.evidence = evidence
    revisionReference = nil
    state = .suggested
    staleReason = nil
  }

  init(
    revisionReference: StudioRevisionReference,
    confidence: ExportAssociationConfidence,
    evidence: [ExportAssociationEvidence],
    state: ExportAssociationState = .current,
    staleReason: ExportAssociationStaleReason? = nil
  ) {
    workID = revisionReference.workID
    sessionID = revisionReference.sessionID
    revisionID = revisionReference.revisionID
    self.confidence = confidence
    self.evidence = evidence
    self.revisionReference = revisionReference
    self.state = state
    self.staleReason = staleReason
  }

  private enum CodingKeys: String, CodingKey {
    case workID
    case sessionID
    case revisionID
    case confidence
    case evidence
    case revisionReference
    case state
    case staleReason
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedReference = try container.decodeIfPresent(
      StudioRevisionReference.self, forKey: .revisionReference)
    let decodedConfidence = try container.decode(
      ExportAssociationConfidence.self, forKey: .confidence)
    workID =
      try (decodedReference?.workID ?? container.decodeIfPresent(String.self, forKey: .workID))
    sessionID =
      try
      (decodedReference?.sessionID ?? container.decodeIfPresent(String.self, forKey: .sessionID))
    revisionID =
      try
      (decodedReference?.revisionID ?? container.decodeIfPresent(String.self, forKey: .revisionID))
    evidence = try container.decode([ExportAssociationEvidence].self, forKey: .evidence)
    revisionReference = decodedReference
    if decodedReference == nil {
      confidence = .suggested
      state = decodedConfidence == .suggested ? .suggested : .stale
      staleReason = decodedConfidence == .suggested ? nil : .missingReviewedReference
    } else {
      confidence = decodedConfidence
      state =
        try container.decodeIfPresent(ExportAssociationState.self, forKey: .state)
        ?? (decodedReference == nil ? .suggested : .current)
      staleReason = try container.decodeIfPresent(
        ExportAssociationStaleReason.self, forKey: .staleReason)
    }
  }

  func markingStale(_ reason: ExportAssociationStaleReason) -> ExportAssociation {
    guard let revisionReference else { return self }
    return ExportAssociation(
      revisionReference: revisionReference,
      confidence: confidence,
      evidence: evidence,
      state: .stale,
      staleReason: reason)
  }
}

public struct ExportAssociationCandidate: Codable, Sendable, Equatable {
  public let workID: String
  public let sessionID: String?
  public let revisionID: String?
  public let displayName: String

  public init(workID: String, sessionID: String?, revisionID: String?, displayName: String) {
    self.workID = workID
    self.sessionID = sessionID
    self.revisionID = revisionID
    self.displayName = displayName
  }
}

public struct ExportAutomationOutputEvidence: Codable, Sendable, Equatable {
  public let fileURL: URL
  public let physicalIdentity: String?
  public let bytes: Int64
  public let modifiedAt: Date
  public let contentDigest: String?
  public let planID: String?
  public let workID: String?
  public let sessionID: String?
  public let revisionID: String
  public let revisionReference: StudioRevisionReference?

  public init(
    fileURL: URL,
    physicalIdentity: String?,
    bytes: Int64,
    modifiedAt: Date,
    contentDigest: String? = nil,
    planID: String? = nil,
    workID: String?,
    sessionID: String?,
    revisionID: String,
    revisionReference: StudioRevisionReference? = nil
  ) {
    self.fileURL = fileURL.standardizedFileURL
    self.physicalIdentity = physicalIdentity
    self.bytes = bytes
    self.modifiedAt = modifiedAt
    self.contentDigest = contentDigest
    self.planID = planID
    self.workID = revisionReference?.workID ?? workID
    self.sessionID = revisionReference?.sessionID ?? sessionID
    self.revisionID = revisionReference?.revisionID ?? revisionID
    self.revisionReference = revisionReference
  }
}

public struct ExportTechnicalFormat: Codable, Sendable, Equatable {
  public let fileExtension: String
  public let sampleRate: Double?
  public let bitDepth: Int?
  public let channelCount: Int?

  public init(
    fileExtension: String,
    sampleRate: Double? = nil,
    bitDepth: Int? = nil,
    channelCount: Int? = nil
  ) {
    self.fileExtension = fileExtension.lowercased()
    self.sampleRate = sampleRate
    self.bitDepth = bitDepth
    self.channelCount = channelCount
  }
}

public struct ExportFileProbe: Codable, Sendable, Equatable {
  public let fileURL: URL
  public let physicalIdentity: String?
  public let bytes: Int64
  public let createdAt: Date?
  public let modifiedAt: Date
  public let contentDigest: String?
  public let technicalFormat: ExportTechnicalFormat

  public init(
    fileURL: URL,
    physicalIdentity: String? = nil,
    bytes: Int64,
    createdAt: Date? = nil,
    modifiedAt: Date,
    contentDigest: String? = nil,
    technicalFormat: ExportTechnicalFormat
  ) {
    self.fileURL = fileURL.standardizedFileURL
    self.physicalIdentity = physicalIdentity
    self.bytes = bytes
    self.createdAt = createdAt
    self.modifiedAt = modifiedAt
    self.contentDigest = contentDigest
    self.technicalFormat = technicalFormat
  }

  public var deduplicationKey: String {
    [
      physicalIdentity ?? fileURL.path,
      String(bytes),
      String(modifiedAt.timeIntervalSince1970),
      contentDigest ?? "",
    ].joined(separator: "|")
  }
}

public struct ExportBatchFile: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let fileURL: URL
  public let physicalIdentity: String?
  public let bytes: Int64
  public let modifiedAt: Date
  public let contentDigest: String?
  public let technicalFormat: ExportTechnicalFormat

  public init(probe: ExportFileProbe) {
    fileURL = probe.fileURL
    physicalIdentity = probe.physicalIdentity
    bytes = probe.bytes
    modifiedAt = probe.modifiedAt
    contentDigest = probe.contentDigest
    technicalFormat = probe.technicalFormat
    id = StableID.forValue("export-file:\(probe.deduplicationKey)")
  }

  public var deduplicationKey: String {
    ExportFileProbe(
      fileURL: fileURL,
      physicalIdentity: physicalIdentity,
      bytes: bytes,
      createdAt: nil,
      modifiedAt: modifiedAt,
      contentDigest: contentDigest,
      technicalFormat: technicalFormat
    ).deduplicationKey
  }
}

public struct ExportTechnicalSummary: Codable, Sendable, Equatable {
  public let totalBytes: Int64
  public let fileCount: Int
  public let formats: [String]
  public let sampleRates: [Double]
  public let bitDepths: [Int]

  public init(files: [ExportBatchFile]) {
    totalBytes = files.reduce(0) { $0 + $1.bytes }
    fileCount = files.count
    formats = Array(Set(files.map { $0.technicalFormat.fileExtension })).sorted()
    sampleRates = Array(Set(files.compactMap { $0.technicalFormat.sampleRate })).sorted()
    bitDepths = Array(Set(files.compactMap { $0.technicalFormat.bitDepth })).sorted()
  }
}

public struct ExportBatch: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let deduplicationKey: String
  public let detectedAt: Date
  public let completedAt: Date
  public let kind: ExportKind
  public let status: ExportBatchStatus
  public let association: ExportAssociation?
  public let files: [ExportBatchFile]
  public let technicalSummary: ExportTechnicalSummary
  public let evidence: [ExportAssociationEvidence]
  public let package: DeliveryPackage?
  public let deliveryAttempts: [DeliveryAttempt]
  public let quarantineReason: ExportBatchQuarantineReason?

  public static func detected(
    files: [ExportBatchFile],
    kind: ExportKind,
    completedAt: Date,
    evidence: [ExportAssociationEvidence],
    association: ExportAssociation? = nil,
    detectedAt: Date = Date()
  ) -> ExportBatch {
    let deduplicationKey = files.map(\.deduplicationKey).sorted().joined(separator: ";")
    return ExportBatch(
      id: StableID.forValue("export-batch:\(deduplicationKey)"),
      deduplicationKey: deduplicationKey,
      detectedAt: detectedAt,
      completedAt: completedAt,
      kind: kind,
      status: .new,
      association: association,
      files: files.sorted { $0.fileURL.path < $1.fileURL.path },
      technicalSummary: ExportTechnicalSummary(files: files),
      evidence: evidence,
      package: nil,
      deliveryAttempts: [],
      quarantineReason: nil)
  }

  func updating(
    status: ExportBatchStatus? = nil,
    association: ExportAssociation? = nil,
    replaceAssociation: Bool = false,
    package: DeliveryPackage? = nil,
    replacePackage: Bool = false,
    deliveryAttempts: [DeliveryAttempt]? = nil,
    quarantineReason: ExportBatchQuarantineReason? = nil,
    replaceQuarantineReason: Bool = false
  ) -> ExportBatch {
    ExportBatch(
      id: id,
      deduplicationKey: deduplicationKey,
      detectedAt: detectedAt,
      completedAt: completedAt,
      kind: kind,
      status: status ?? self.status,
      association: replaceAssociation ? association : self.association,
      files: files,
      technicalSummary: technicalSummary,
      evidence: evidence,
      package: replacePackage ? package : self.package,
      deliveryAttempts: deliveryAttempts ?? self.deliveryAttempts,
      quarantineReason: replaceQuarantineReason ? quarantineReason : self.quarantineReason)
  }
}

/// A detector-issued candidate for persistence. The opaque automation receipt is intentionally
/// non-Codable so a decoded `ExportBatch` cannot manufacture verified provenance at ingestion.
public struct DetectedExportBatch: Sendable {
  let batch: ExportBatch
  let automationReceipt: ExportAutomationDetectionReceipt?

  init(batch: ExportBatch, automationReceipt: ExportAutomationDetectionReceipt? = nil) {
    self.batch = batch
    self.automationReceipt = automationReceipt
  }

  public var id: String { batch.id }
  public var association: ExportAssociation? { batch.association }
  public var files: [ExportBatchFile] { batch.files }
  public var kind: ExportKind { batch.kind }
  public var status: ExportBatchStatus { batch.status }
  public var evidence: [ExportAssociationEvidence] { batch.evidence }

  func artifactAutomationAuthority(
    fileURL: URL,
    observation: ExportArtifactImmutableFileObservation,
    revisionAuthority: StudioRevisionExecutionAuthority
  ) -> ExportArtifactAutomationAuthorityReceipt? {
    guard let detectorReceipt = automationReceipt,
      let planID = detectorReceipt.planID?.trimmingCharacters(in: .whitespacesAndNewlines),
      !planID.isEmpty,
      let association = batch.association,
      association.confidence == .verified,
      association.state == .current,
      association.staleReason == nil,
      let revisionReference = association.revisionReference,
      detectorReceipt.revisionReferenceID == revisionReference.id,
      detectorReceipt.fileObservationKeys == batch.files.map(\.deduplicationKey).sorted(),
      association.evidence.contains(.verifiedAutomationOutput(planID: planID))
    else { return nil }
    guard (try? revisionAuthority.resolve(revisionReference)) != nil else { return nil }

    let standardizedURL = fileURL.standardizedFileURL
    let matchingFiles = batch.files.filter { $0.fileURL.standardizedFileURL == standardizedURL }
    guard matchingFiles.count == 1, let file = matchingFiles.first,
      detectorReceipt.fileObservationKeys.contains(file.deduplicationKey),
      file.physicalIdentity == observation.resourceIdentity,
      file.bytes == observation.bytes,
      file.modifiedAt == observation.modifiedAt,
      file.contentDigest?.lowercased() == observation.sha256
    else { return nil }

    return ExportArtifactAutomationAuthorityReceipt(
      planID: planID,
      revisionReference: revisionReference,
      fileObservation: observation)
  }

  func verifiedSidecarAssociation(
    fileURL: URL,
    observation: ExportArtifactImmutableFileObservation,
    revisionAuthority: StudioRevisionExecutionAuthority,
    evidence: [String]
  ) throws -> StudioExportEvidenceSidecarAssociation? {
    guard
      let receipt = artifactAutomationAuthority(
        fileURL: fileURL,
        observation: observation,
        revisionAuthority: revisionAuthority)
    else { return nil }
    let verifiedEvidence = try StudioExportVerifiedAssociationEvidence(authorityReceipt: receipt)
    return try StudioExportEvidenceSidecarAssociation(
      confidence: .verifiedAutomation,
      reviewedRevisionID: receipt.revisionReference.revisionID,
      reviewedWorkID: receipt.revisionReference.workID,
      reviewedSessionID: receipt.revisionReference.sessionID,
      evidence: evidence,
      verifiedEvidence: verifiedEvidence)
  }
}

struct ExportAutomationDetectionReceipt: Sendable, Equatable {
  let revisionReferenceID: String
  let fileObservationKeys: [String]
  let planID: String?
}

/// In-process decision authority derived from a detector receipt and an exact current file
/// observation. It is intentionally internal and non-Codable.
struct ExportArtifactAutomationAuthorityReceipt: Sendable, Equatable {
  let planID: String
  let revisionReference: StudioRevisionReference
  let fileObservation: ExportArtifactImmutableFileObservation

  fileprivate init(
    planID: String,
    revisionReference: StudioRevisionReference,
    fileObservation: ExportArtifactImmutableFileObservation
  ) {
    self.planID = planID
    self.revisionReference = revisionReference
    self.fileObservation = fileObservation
  }
}

public enum DeliveryMethod: String, Codable, Sendable, CaseIterable {
  case nativeShare
  case nativeMail
  case iCloudLink
  case hostedLink
  case googleDriveLink
}

public enum DeliveryAttemptResult: String, Codable, Sendable, CaseIterable {
  case pending
  case handedToUser
  case delivered
  case failed
  case cancelled
}

public struct DeliveryPackage: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let archiveURL: URL
  public let files: [ExportBatchFile]
  public let bytes: Int64
  public let sha256: String
  public let verifiedAt: Date?
  public let manifest: String?
  public let createdAt: Date

  init(
    archiveURL: URL,
    files: [ExportBatchFile],
    bytes: Int64,
    sha256: String,
    verifiedAt: Date? = nil,
    manifest: String?,
    createdAt: Date
  ) {
    self.archiveURL = archiveURL.standardizedFileURL
    self.files = files
    self.bytes = bytes
    self.sha256 = sha256
    self.verifiedAt = verifiedAt ?? createdAt
    self.manifest = manifest
    self.createdAt = createdAt
    id = StableID.forValue("delivery-package:\(archiveURL.standardizedFileURL.path):\(sha256)")
  }
}

public struct DeliveryAttempt: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let attemptID: String
  public let packageID: String
  public let method: DeliveryMethod
  public let recipient: String?
  public let startedAt: Date
  public let completedAt: Date?
  public let providerReference: String?
  public let expiresAt: Date?
  public let result: DeliveryAttemptResult

  public init(
    id: String = UUID().uuidString,
    attemptID: String = UUID().uuidString,
    packageID: String,
    method: DeliveryMethod,
    recipient: String?,
    startedAt: Date,
    completedAt: Date? = nil,
    providerReference: String? = nil,
    expiresAt: Date? = nil,
    result: DeliveryAttemptResult
  ) {
    self.id = id
    self.attemptID = attemptID
    self.packageID = packageID
    self.method = method
    self.recipient = recipient
    self.startedAt = startedAt
    self.completedAt = completedAt
    self.providerReference = providerReference
    self.expiresAt = expiresAt
    self.result = result
  }

  private enum CodingKeys: String, CodingKey {
    case id
    case attemptID
    case packageID
    case method
    case recipient
    case startedAt
    case completedAt
    case providerReference
    case expiresAt
    case result
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    attemptID = try container.decodeIfPresent(String.self, forKey: .attemptID) ?? id
    packageID = try container.decodeIfPresent(String.self, forKey: .packageID) ?? ""
    method = try container.decode(DeliveryMethod.self, forKey: .method)
    recipient = try container.decodeIfPresent(String.self, forKey: .recipient)
    startedAt = try container.decode(Date.self, forKey: .startedAt)
    completedAt = try container.decodeIfPresent(Date.self, forKey: .completedAt)
    providerReference = try container.decodeIfPresent(String.self, forKey: .providerReference)
    expiresAt = try container.decodeIfPresent(Date.self, forKey: .expiresAt)
    result = try container.decode(DeliveryAttemptResult.self, forKey: .result)
  }
}

public struct DeliveryPackageNameAllocator: Sendable {
  public init() {}

  public func nextAvailableName(preferred: String, occupied: some Sequence<String>) -> String {
    let occupied = Set(occupied.map { $0.lowercased() })
    guard occupied.contains(preferred.lowercased()) else { return preferred }
    let url = URL(fileURLWithPath: preferred)
    let base = url.deletingPathExtension().lastPathComponent
    let ext = url.pathExtension
    var suffix = 2
    while true {
      let candidate = "\(base)-\(suffix)\(ext.isEmpty ? "" : ".\(ext)")"
      if !occupied.contains(candidate.lowercased()) { return candidate }
      suffix += 1
    }
  }
}
