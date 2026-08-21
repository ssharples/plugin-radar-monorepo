import Foundation

public struct ExportDNAMetadataConflictSummary: Codable, Sendable, Equatable {
  public let field: String
  public let metadataSource: ExportEmbeddedMetadataSource
  public let explanation: String

  public init(
    field: String,
    metadataSource: ExportEmbeddedMetadataSource,
    explanation: String
  ) {
    self.field = field
    self.metadataSource = metadataSource
    self.explanation = explanation
  }
}

public struct ExportSampleTimeReferenceEvidence: Codable, Sendable, Equatable {
  public let samplesSinceOrigin: UInt64
  public let sampleRate: UInt32?

  public init(samplesSinceOrigin: UInt64, sampleRate: UInt32?) {
    self.samplesSinceOrigin = samplesSinceOrigin
    self.sampleRate = sampleRate
  }
}

public struct ExportDNAAssociationEvidence: Codable, Sendable, Equatable {
  public let containerKind: ExportWaveContainerKind
  public let fileSampleRate: UInt32?
  public let dataChunkBytes: UInt64?
  public let originationTimestamp: Date?
  public let sampleTimeReference: ExportSampleTimeReferenceEvidence?
  public let ixmlProject: String?
  public let ixmlScene: String?
  public let ixmlTake: String?
  public let ixmlTape: String?
  public let ixmlNote: String?
  public let ixmlTimecode: String?
  public let ixmlTimecodeRate: String?
  public let ixmlTimecodeFlag: String?
  public let ixmlDeclaredFileSampleRate: UInt32?
  public let ixmlTimestamp: ExportIXMLTimestamp?
  public let ixmlTrackLabels: [String]
  public let ixmlTrackCount: Int?
  public let untrustedIXMLFields: [ExportUntrustedEmbeddedMetadataField]
  public let contradictions: [ExportDNAMetadataConflictSummary]
  public let includesUntrustedDescriptiveMetadata: Bool

  public init(
    containerKind: ExportWaveContainerKind,
    fileSampleRate: UInt32?,
    dataChunkBytes: UInt64?,
    originationTimestamp: Date?,
    sampleTimeReference: ExportSampleTimeReferenceEvidence?,
    ixmlProject: String?,
    ixmlScene: String? = nil,
    ixmlTake: String? = nil,
    ixmlTape: String? = nil,
    ixmlNote: String?,
    ixmlTimecode: String? = nil,
    ixmlTimecodeRate: String? = nil,
    ixmlTrackLabels: [String],
    ixmlTrackCount: Int?,
    contradictions: [ExportDNAMetadataConflictSummary],
    includesUntrustedDescriptiveMetadata: Bool,
    ixmlTimecodeFlag: String? = nil,
    ixmlDeclaredFileSampleRate: UInt32? = nil,
    ixmlTimestamp: ExportIXMLTimestamp? = nil,
    untrustedIXMLFields: [ExportUntrustedEmbeddedMetadataField] = []
  ) {
    self.containerKind = containerKind
    self.fileSampleRate = fileSampleRate
    self.dataChunkBytes = dataChunkBytes
    self.originationTimestamp = originationTimestamp
    self.sampleTimeReference = sampleTimeReference
    self.ixmlProject = ixmlProject
    self.ixmlScene = ixmlScene
    self.ixmlTake = ixmlTake
    self.ixmlTape = ixmlTape
    self.ixmlNote = ixmlNote
    self.ixmlTimecode = ixmlTimecode
    self.ixmlTimecodeRate = ixmlTimecodeRate
    self.ixmlTimecodeFlag = ixmlTimecodeFlag
    self.ixmlDeclaredFileSampleRate = ixmlDeclaredFileSampleRate
    self.ixmlTimestamp = ixmlTimestamp
    self.ixmlTrackLabels = ixmlTrackLabels
    self.ixmlTrackCount = ixmlTrackCount
    self.untrustedIXMLFields = untrustedIXMLFields
    self.contradictions = contradictions
    self.includesUntrustedDescriptiveMetadata = includesUntrustedDescriptiveMetadata
  }

  public init(parsed: ParsedExportDNA) {
    let labels =
      parsed.ixml?.tracks.flatMap { track -> [String] in
        [track.name, track.function].compactMap(Self.cleaned)
      } ?? []
    let sortedLabels = Array(Set(labels)).sorted()
    self.init(
      containerKind: parsed.container.kind,
      fileSampleRate: parsed.container.format?.sampleRate,
      dataChunkBytes: parsed.container.dataChunkSize,
      originationTimestamp: Self.originationTimestamp(from: parsed.bext),
      sampleTimeReference: parsed.bext.map {
        ExportSampleTimeReferenceEvidence(
          samplesSinceOrigin: $0.timeReference.samplesSinceOrigin,
          sampleRate: $0.timeReference.sampleRate)
      },
      ixmlProject: Self.cleaned(parsed.ixml?.project),
      ixmlScene: Self.cleaned(parsed.ixml?.scene),
      ixmlTake: Self.cleaned(parsed.ixml?.take),
      ixmlTape: Self.cleaned(parsed.ixml?.tape),
      ixmlNote: Self.cleaned(parsed.ixml?.note),
      ixmlTimecode: Self.cleaned(parsed.ixml?.timecode),
      ixmlTimecodeRate: Self.cleaned(parsed.ixml?.timecodeRate),
      ixmlTrackLabels: sortedLabels,
      ixmlTrackCount: parsed.ixml?.trackCount,
      contradictions: parsed.contradictions.map {
        ExportDNAMetadataConflictSummary(
          field: $0.field,
          metadataSource: $0.metadataSource,
          explanation: $0.explanation)
      },
      includesUntrustedDescriptiveMetadata: parsed.axml != nil || parsed.info != nil
        || parsed.ixml?.untrustedUnknownFields.isEmpty == false,
      ixmlTimecodeFlag: Self.cleaned(parsed.ixml?.timecodeFlag),
      ixmlDeclaredFileSampleRate: parsed.ixml?.fileSampleRate,
      ixmlTimestamp: parsed.ixml?.timestamp,
      untrustedIXMLFields: parsed.ixml?.untrustedUnknownFields ?? [])
  }

  private static func originationTimestamp(from metadata: BroadcastWaveMetadata?) -> Date? {
    guard let metadata else { return nil }
    let raw = "\(metadata.originationDate)T\(metadata.originationTime)"
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    return formatter.date(from: raw)
  }

  private static func cleaned(_ value: String?) -> String? {
    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty
    else { return nil }
    return value
  }
}

extension ExportDNAAssociationEvidence {
  private enum CodingKeys: String, CodingKey {
    case containerKind
    case fileSampleRate
    case dataChunkBytes
    case originationTimestamp
    case sampleTimeReference
    case ixmlProject
    case ixmlScene
    case ixmlTake
    case ixmlTape
    case ixmlNote
    case ixmlTimecode
    case ixmlTimecodeRate
    case ixmlTimecodeFlag
    case ixmlDeclaredFileSampleRate
    case ixmlTimestamp
    case ixmlTrackLabels
    case ixmlTrackCount
    case untrustedIXMLFields
    case contradictions
    case includesUntrustedDescriptiveMetadata
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      containerKind: try container.decode(ExportWaveContainerKind.self, forKey: .containerKind),
      fileSampleRate: try container.decodeIfPresent(UInt32.self, forKey: .fileSampleRate),
      dataChunkBytes: try container.decodeIfPresent(UInt64.self, forKey: .dataChunkBytes),
      originationTimestamp: try container.decodeIfPresent(Date.self, forKey: .originationTimestamp),
      sampleTimeReference: try container.decodeIfPresent(
        ExportSampleTimeReferenceEvidence.self, forKey: .sampleTimeReference),
      ixmlProject: try container.decodeIfPresent(String.self, forKey: .ixmlProject),
      ixmlScene: try container.decodeIfPresent(String.self, forKey: .ixmlScene),
      ixmlTake: try container.decodeIfPresent(String.self, forKey: .ixmlTake),
      ixmlTape: try container.decodeIfPresent(String.self, forKey: .ixmlTape),
      ixmlNote: try container.decodeIfPresent(String.self, forKey: .ixmlNote),
      ixmlTimecode: try container.decodeIfPresent(String.self, forKey: .ixmlTimecode),
      ixmlTimecodeRate: try container.decodeIfPresent(String.self, forKey: .ixmlTimecodeRate),
      ixmlTrackLabels: try container.decodeIfPresent([String].self, forKey: .ixmlTrackLabels) ?? [],
      ixmlTrackCount: try container.decodeIfPresent(Int.self, forKey: .ixmlTrackCount),
      contradictions: try container.decodeIfPresent(
        [ExportDNAMetadataConflictSummary].self, forKey: .contradictions) ?? [],
      includesUntrustedDescriptiveMetadata: try container.decodeIfPresent(
        Bool.self, forKey: .includesUntrustedDescriptiveMetadata) ?? false,
      ixmlTimecodeFlag: try container.decodeIfPresent(String.self, forKey: .ixmlTimecodeFlag),
      ixmlDeclaredFileSampleRate: try container.decodeIfPresent(
        UInt32.self, forKey: .ixmlDeclaredFileSampleRate),
      ixmlTimestamp: try container.decodeIfPresent(
        ExportIXMLTimestamp.self, forKey: .ixmlTimestamp),
      untrustedIXMLFields: try container.decodeIfPresent(
        [ExportUntrustedEmbeddedMetadataField].self, forKey: .untrustedIXMLFields) ?? [])
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(containerKind, forKey: .containerKind)
    try container.encodeIfPresent(fileSampleRate, forKey: .fileSampleRate)
    try container.encodeIfPresent(dataChunkBytes, forKey: .dataChunkBytes)
    try container.encodeIfPresent(originationTimestamp, forKey: .originationTimestamp)
    try container.encodeIfPresent(sampleTimeReference, forKey: .sampleTimeReference)
    try container.encodeIfPresent(ixmlProject, forKey: .ixmlProject)
    try container.encodeIfPresent(ixmlScene, forKey: .ixmlScene)
    try container.encodeIfPresent(ixmlTake, forKey: .ixmlTake)
    try container.encodeIfPresent(ixmlTape, forKey: .ixmlTape)
    try container.encodeIfPresent(ixmlNote, forKey: .ixmlNote)
    try container.encodeIfPresent(ixmlTimecode, forKey: .ixmlTimecode)
    try container.encodeIfPresent(ixmlTimecodeRate, forKey: .ixmlTimecodeRate)
    try container.encodeIfPresent(ixmlTimecodeFlag, forKey: .ixmlTimecodeFlag)
    try container.encodeIfPresent(ixmlDeclaredFileSampleRate, forKey: .ixmlDeclaredFileSampleRate)
    try container.encodeIfPresent(ixmlTimestamp, forKey: .ixmlTimestamp)
    try container.encode(ixmlTrackLabels, forKey: .ixmlTrackLabels)
    try container.encodeIfPresent(ixmlTrackCount, forKey: .ixmlTrackCount)
    try container.encode(untrustedIXMLFields, forKey: .untrustedIXMLFields)
    try container.encode(contradictions, forKey: .contradictions)
    try container.encode(
      includesUntrustedDescriptiveMetadata, forKey: .includesUntrustedDescriptiveMetadata)
  }
}

public struct ReviewedArrangementSampleRange: Codable, Sendable, Equatable {
  public let startSample: UInt64
  public let endSample: UInt64
  public let sampleRate: UInt32

  public init(startSample: UInt64, endSample: UInt64, sampleRate: UInt32) {
    self.startSample = min(startSample, endSample)
    self.endSample = max(startSample, endSample)
    self.sampleRate = sampleRate
  }

  public func contains(_ sample: UInt64) -> Bool {
    sample >= startSample && sample <= endSample
  }
}

public struct ExportRevisionEvidenceContext: Codable, Sendable, Equatable {
  public let displayName: String?
  public let reviewedArrangementRange: ReviewedArrangementSampleRange?
  public let expectedTrackLabels: [String]
  public let expectedExportFolderNames: [String]
  public let expectedBatchFileCount: Int?

  public init(
    displayName: String?,
    reviewedArrangementRange: ReviewedArrangementSampleRange?,
    expectedTrackLabels: [String] = [],
    expectedExportFolderNames: [String] = [],
    expectedBatchFileCount: Int? = nil
  ) {
    self.displayName = displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.reviewedArrangementRange = reviewedArrangementRange
    self.expectedTrackLabels = Array(
      Set(
        expectedTrackLabels.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter {
          !$0.isEmpty
        })
    ).sorted()
    self.expectedExportFolderNames = Array(
      Set(
        expectedExportFolderNames.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
          .filter { !$0.isEmpty })
    ).sorted()
    self.expectedBatchFileCount = expectedBatchFileCount
  }
}

public struct ExportArtifactObservation: Codable, Sendable, Equatable {
  public let immutableObservationKey: String?
  public let immutableFileObservation: ExportArtifactImmutableFileObservation?
  public let revalidatedAt: Date?
  public let verifiedAutomationBinding: ExportVerifiedAutomationBinding?
  public let fileName: String?
  public let folderName: String?
  public let batchFileCount: Int?
  public let exportDNA: ExportDNAAssociationEvidence?

  public init(
    immutableObservationKey: String?,
    fileName: String?,
    folderName: String?,
    batchFileCount: Int?,
    exportDNA: ExportDNAAssociationEvidence?
  ) {
    self.immutableObservationKey = immutableObservationKey?.trimmingCharacters(
      in: .whitespacesAndNewlines)
    self.immutableFileObservation = nil
    self.revalidatedAt = nil
    self.verifiedAutomationBinding = nil
    self.fileName = fileName?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.folderName = folderName?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.batchFileCount = batchFileCount
    self.exportDNA = exportDNA
  }

  public init(
    immutableFileObservation: ExportArtifactImmutableFileObservation,
    revalidatedAt: Date,
    verifiedAutomationBinding: ExportVerifiedAutomationBinding? = nil,
    fileName: String?,
    folderName: String?,
    batchFileCount: Int?,
    exportDNA: ExportDNAAssociationEvidence?
  ) {
    self.immutableObservationKey = immutableFileObservation.observationKey
    self.immutableFileObservation = immutableFileObservation
    self.revalidatedAt = revalidatedAt
    self.verifiedAutomationBinding = verifiedAutomationBinding
    self.fileName = fileName?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.folderName = folderName?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.batchFileCount = batchFileCount
    self.exportDNA = exportDNA
  }

  public var hasImmutableObservation: Bool {
    guard let immutableFileObservation, revalidatedAt != nil else { return false }
    return immutableObservationKey == immutableFileObservation.observationKey
  }
}

public enum ExportArtifactObservationValidationError: Error, Sendable, Equatable {
  case invalidSHA256
  case invalidByteCount
  case missingResourceIdentity
  case invalidAutomationBinding
}

public struct ExportArtifactImmutableFileObservation: Codable, Sendable, Equatable {
  public let sha256: String
  public let bytes: Int64
  public let modifiedAt: Date
  public let resourceIdentity: String

  public init(
    sha256: String,
    bytes: Int64,
    modifiedAt: Date,
    resourceIdentity: String
  ) throws {
    let digest = sha256.lowercased()
    guard digest.count == 64, digest.allSatisfy(\.isHexDigit) else {
      throw ExportArtifactObservationValidationError.invalidSHA256
    }
    guard bytes >= 0 else {
      throw ExportArtifactObservationValidationError.invalidByteCount
    }
    let identity = resourceIdentity.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !identity.isEmpty else {
      throw ExportArtifactObservationValidationError.missingResourceIdentity
    }
    self.sha256 = digest
    self.bytes = bytes
    self.modifiedAt = modifiedAt
    self.resourceIdentity = identity
  }

  public var observationKey: String {
    "sha256:\(sha256):bytes:\(bytes):mtime:\(modifiedAt.timeIntervalSince1970):resource:\(resourceIdentity)"
  }
}

extension ExportArtifactImmutableFileObservation {
  private enum CodingKeys: String, CodingKey {
    case sha256
    case bytes
    case modifiedAt
    case resourceIdentity
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    try self.init(
      sha256: container.decode(String.self, forKey: .sha256),
      bytes: container.decode(Int64.self, forKey: .bytes),
      modifiedAt: container.decode(Date.self, forKey: .modifiedAt),
      resourceIdentity: container.decode(String.self, forKey: .resourceIdentity))
  }
}

/// Persisted automation claim for reports and migration. This public Codable value is never
/// sufficient decision authority; automatic linking requires an opaque detector-issued receipt.
public struct ExportVerifiedAutomationBinding: Codable, Sendable, Equatable {
  public let planID: String
  public let revisionNodeID: String
  public let outputSHA256: String

  public init(planID: String, revisionNodeID: String, outputSHA256: String) throws {
    let planID = planID.trimmingCharacters(in: .whitespacesAndNewlines)
    let revisionNodeID = revisionNodeID.trimmingCharacters(in: .whitespacesAndNewlines)
    let outputSHA256 = outputSHA256.lowercased()
    guard !planID.isEmpty, !revisionNodeID.isEmpty,
      outputSHA256.count == 64, outputSHA256.allSatisfy(\.isHexDigit)
    else {
      throw ExportArtifactObservationValidationError.invalidAutomationBinding
    }
    self.planID = planID
    self.revisionNodeID = revisionNodeID
    self.outputSHA256 = outputSHA256
  }
}

extension ExportVerifiedAutomationBinding {
  private enum CodingKeys: String, CodingKey {
    case planID
    case revisionNodeID
    case outputSHA256
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    try self.init(
      planID: container.decode(String.self, forKey: .planID),
      revisionNodeID: container.decode(String.self, forKey: .revisionNodeID),
      outputSHA256: container.decode(String.self, forKey: .outputSHA256))
  }
}

public struct StudioExportEvidenceSidecarFile: Codable, Sendable, Equatable {
  public let relativePath: String
  public let bytes: Int64
  public let sha256: String

  public init(relativePath: String, bytes: Int64, sha256: String) {
    self.relativePath = relativePath
    self.bytes = bytes
    self.sha256 = sha256.lowercased()
  }
}

/// Persisted report state. Decoding `verifiedAutomation` never restores in-process authority.
public enum StudioExportAssociationConfidence: String, Codable, Sendable, CaseIterable {
  case suggested
  case reviewed
  case verifiedAutomation
}

public enum StudioExportEvidenceSidecarError: Error, Sendable, Equatable {
  case verifiedAssociationEvidenceRequired
  case verifiedAssociationRevisionMismatch
  case unsupportedSchemaVersion(Int)
}

public struct StudioExportVerifiedAssociationEvidence: Codable, Sendable, Equatable {
  public let automationBinding: ExportVerifiedAutomationBinding
  public let immutableObservationKey: String
  let authorityReceipt: ExportArtifactAutomationAuthorityReceipt?

  init(
    automationBinding: ExportVerifiedAutomationBinding,
    immutableObservationKey: String,
    authorityReceipt: ExportArtifactAutomationAuthorityReceipt? = nil
  ) throws {
    let key = immutableObservationKey.trimmingCharacters(in: .whitespacesAndNewlines)
    let components = key.split(separator: ":", omittingEmptySubsequences: false)
    guard components.count >= 8,
      components[0] == "sha256",
      components[1] == Substring(automationBinding.outputSHA256),
      components[2] == "bytes",
      let bytes = Int64(components[3]),
      components[4] == "mtime",
      let modifiedAt = Double(components[5]), modifiedAt.isFinite,
      components[6] == "resource"
    else {
      throw StudioExportEvidenceSidecarError.verifiedAssociationEvidenceRequired
    }
    let resourceIdentity = components.dropFirst(7).joined(separator: ":")
    guard
      (try? ExportArtifactImmutableFileObservation(
        sha256: automationBinding.outputSHA256,
        bytes: bytes,
        modifiedAt: Date(timeIntervalSince1970: modifiedAt),
        resourceIdentity: resourceIdentity)) != nil
    else { throw StudioExportEvidenceSidecarError.verifiedAssociationEvidenceRequired }
    self.automationBinding = automationBinding
    self.immutableObservationKey = key
    self.authorityReceipt = authorityReceipt
  }

  init(authorityReceipt: ExportArtifactAutomationAuthorityReceipt) throws {
    try self.init(
      automationBinding: ExportVerifiedAutomationBinding(
        planID: authorityReceipt.planID,
        revisionNodeID: authorityReceipt.revisionReference.revisionID,
        outputSHA256: authorityReceipt.fileObservation.sha256),
      immutableObservationKey: authorityReceipt.fileObservation.observationKey,
      authorityReceipt: authorityReceipt)
  }

  public static func == (
    lhs: StudioExportVerifiedAssociationEvidence,
    rhs: StudioExportVerifiedAssociationEvidence
  ) -> Bool {
    lhs.automationBinding == rhs.automationBinding
      && lhs.immutableObservationKey == rhs.immutableObservationKey
  }
}

extension StudioExportVerifiedAssociationEvidence {
  private enum CodingKeys: String, CodingKey {
    case automationBinding
    case immutableObservationKey
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    try self.init(
      automationBinding: container.decode(
        ExportVerifiedAutomationBinding.self, forKey: .automationBinding),
      immutableObservationKey: container.decode(String.self, forKey: .immutableObservationKey),
      authorityReceipt: nil)
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(automationBinding, forKey: .automationBinding)
    try container.encode(immutableObservationKey, forKey: .immutableObservationKey)
  }
}

public struct StudioExportEvidenceSidecarAssociation: Codable, Sendable, Equatable {
  public let confidence: StudioExportAssociationConfidence
  public let reviewedRevisionID: String
  public let reviewedWorkID: String?
  public let reviewedSessionID: String?
  public let evidence: [String]
  public let verifiedEvidence: StudioExportVerifiedAssociationEvidence?

  public init(
    confidence: String,
    reviewedRevisionID: String,
    reviewedWorkID: String?,
    reviewedSessionID: String?,
    evidence: [String]
  ) {
    let requested = StudioExportAssociationConfidence(rawValue: confidence)
    self.confidence = requested == .suggested ? .suggested : .reviewed
    self.reviewedRevisionID = reviewedRevisionID
    self.reviewedWorkID = reviewedWorkID
    self.reviewedSessionID = reviewedSessionID
    self.evidence = evidence.sorted()
    self.verifiedEvidence = nil
  }

  public init(
    confidence: StudioExportAssociationConfidence,
    reviewedRevisionID: String,
    reviewedWorkID: String?,
    reviewedSessionID: String?,
    evidence: [String],
    verifiedEvidence: StudioExportVerifiedAssociationEvidence? = nil
  ) throws {
    if confidence == .verifiedAutomation {
      guard let verifiedEvidence, verifiedEvidence.authorityReceipt != nil else {
        throw StudioExportEvidenceSidecarError.verifiedAssociationEvidenceRequired
      }
      guard verifiedEvidence.automationBinding.revisionNodeID == reviewedRevisionID else {
        throw StudioExportEvidenceSidecarError.verifiedAssociationRevisionMismatch
      }
    }
    self.confidence = confidence
    self.reviewedRevisionID = reviewedRevisionID
    self.reviewedWorkID = reviewedWorkID
    self.reviewedSessionID = reviewedSessionID
    self.evidence = evidence.sorted()
    self.verifiedEvidence = confidence == .verifiedAutomation ? verifiedEvidence : nil
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    try self.init(
      reportConfidence: container.decode(
        StudioExportAssociationConfidence.self, forKey: .confidence),
      reviewedRevisionID: container.decode(String.self, forKey: .reviewedRevisionID),
      reviewedWorkID: container.decodeIfPresent(String.self, forKey: .reviewedWorkID),
      reviewedSessionID: container.decodeIfPresent(String.self, forKey: .reviewedSessionID),
      evidence: container.decodeIfPresent([String].self, forKey: .evidence) ?? [],
      verifiedEvidence: container.decodeIfPresent(
        StudioExportVerifiedAssociationEvidence.self, forKey: .verifiedEvidence))
  }

  init(
    reportConfidence confidence: StudioExportAssociationConfidence,
    reviewedRevisionID: String,
    reviewedWorkID: String?,
    reviewedSessionID: String?,
    evidence: [String],
    verifiedEvidence: StudioExportVerifiedAssociationEvidence?
  ) throws {
    if confidence == .verifiedAutomation {
      guard let verifiedEvidence else {
        throw StudioExportEvidenceSidecarError.verifiedAssociationEvidenceRequired
      }
      guard verifiedEvidence.automationBinding.revisionNodeID == reviewedRevisionID else {
        throw StudioExportEvidenceSidecarError.verifiedAssociationRevisionMismatch
      }
    }
    self.confidence = confidence
    self.reviewedRevisionID = reviewedRevisionID
    self.reviewedWorkID = reviewedWorkID
    self.reviewedSessionID = reviewedSessionID
    self.evidence = evidence.sorted()
    self.verifiedEvidence = confidence == .verifiedAutomation ? verifiedEvidence : nil
  }
}

public struct StudioExportEvidenceSidecarObservation: Codable, Sendable, Equatable {
  public let batchID: String
  public let observedAt: Date
  public let immutableObservationKeys: [String]
  public let relativePaths: [String]
  public let exportDNA: ExportDNAAssociationEvidence?
  public let notes: [String]

  public init(
    batchID: String,
    observedAt: Date,
    immutableObservationKeys: [String],
    relativePaths: [String],
    exportDNA: ExportDNAAssociationEvidence?,
    notes: [String] = []
  ) {
    self.batchID = batchID
    self.observedAt = observedAt
    self.immutableObservationKeys = immutableObservationKeys.sorted()
    self.relativePaths = relativePaths.sorted()
    self.exportDNA = exportDNA
    self.notes = notes.sorted()
  }
}

public struct StudioExportEvidenceSidecar: Codable, Sendable, Equatable {
  public static let currentSchemaVersion = 2

  public let schemaVersion: Int
  public let migratedFromSchemaVersion: Int?
  public let applicationVersion: String
  public let algorithmVersions: [String]
  public let association: StudioExportEvidenceSidecarAssociation
  public let observation: StudioExportEvidenceSidecarObservation
  public let files: [StudioExportEvidenceSidecarFile]

  public init(
    schemaVersion: Int = Self.currentSchemaVersion,
    applicationVersion: String,
    algorithmVersions: [String],
    association: StudioExportEvidenceSidecarAssociation,
    observation: StudioExportEvidenceSidecarObservation,
    files: [StudioExportEvidenceSidecarFile]
  ) {
    self.schemaVersion = Self.currentSchemaVersion
    self.migratedFromSchemaVersion =
      schemaVersion == Self.currentSchemaVersion ? nil : schemaVersion
    self.applicationVersion = applicationVersion
    self.algorithmVersions = algorithmVersions.sorted()
    self.observation = observation
    let sortedFiles = files.sorted { lhs, rhs in
      if lhs.relativePath != rhs.relativePath { return lhs.relativePath < rhs.relativePath }
      return lhs.sha256 < rhs.sha256
    }
    self.files = sortedFiles
    self.association =
      Self.hasIssuedVerifiedAssociationEvidence(
        association, observation: observation, files: sortedFiles)
      ? association
      : Self.reviewOnly(association)
  }

  init(
    reportSchemaVersion schemaVersion: Int,
    migratedFromSchemaVersion: Int?,
    applicationVersion: String,
    algorithmVersions: [String],
    association: StudioExportEvidenceSidecarAssociation,
    observation: StudioExportEvidenceSidecarObservation,
    files: [StudioExportEvidenceSidecarFile]
  ) {
    self.schemaVersion = schemaVersion
    self.migratedFromSchemaVersion = migratedFromSchemaVersion
    self.applicationVersion = applicationVersion
    self.algorithmVersions = algorithmVersions.sorted()
    self.association = association
    self.observation = observation
    self.files = files.sorted { lhs, rhs in
      if lhs.relativePath != rhs.relativePath { return lhs.relativePath < rhs.relativePath }
      return lhs.sha256 < rhs.sha256
    }
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let sourceVersion = try container.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
    guard sourceVersion == 1 || sourceVersion == Self.currentSchemaVersion else {
      throw StudioExportEvidenceSidecarError.unsupportedSchemaVersion(sourceVersion)
    }
    self.schemaVersion = Self.currentSchemaVersion
    self.migratedFromSchemaVersion = sourceVersion == 1 ? 1 : nil
    self.applicationVersion = try container.decode(String.self, forKey: .applicationVersion)
    self.algorithmVersions = try container.decode([String].self, forKey: .algorithmVersions)
      .sorted()
    if sourceVersion == 1 {
      let legacy = try container.decode(LegacyAssociation.self, forKey: .association)
      self.association = StudioExportEvidenceSidecarAssociation(
        confidence: legacy.confidence,
        reviewedRevisionID: legacy.reviewedRevisionID,
        reviewedWorkID: legacy.reviewedWorkID,
        reviewedSessionID: legacy.reviewedSessionID,
        evidence: legacy.evidence)
    } else {
      let association = try container.decode(
        StudioExportEvidenceSidecarAssociation.self, forKey: .association)
      self.association = association
    }
    self.observation = try container.decode(
      StudioExportEvidenceSidecarObservation.self, forKey: .observation)
    self.files = try container.decode([StudioExportEvidenceSidecarFile].self, forKey: .files)
      .sorted { lhs, rhs in
        if lhs.relativePath != rhs.relativePath { return lhs.relativePath < rhs.relativePath }
        return lhs.sha256 < rhs.sha256
      }
    if self.association.confidence == .verifiedAutomation,
      !Self.hasVerifiedAssociationEvidence(
        self.association, observation: self.observation, files: self.files)
    {
      throw StudioExportEvidenceSidecarError.verifiedAssociationEvidenceRequired
    }
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(Self.currentSchemaVersion, forKey: .schemaVersion)
    try container.encodeIfPresent(migratedFromSchemaVersion, forKey: .migratedFromSchemaVersion)
    try container.encode(applicationVersion, forKey: .applicationVersion)
    try container.encode(algorithmVersions, forKey: .algorithmVersions)
    try container.encode(association, forKey: .association)
    try container.encode(observation, forKey: .observation)
    try container.encode(files, forKey: .files)
  }

  private enum CodingKeys: String, CodingKey {
    case schemaVersion
    case migratedFromSchemaVersion
    case applicationVersion
    case algorithmVersions
    case association
    case observation
    case files
  }

  private struct LegacyAssociation: Decodable {
    let confidence: String
    let reviewedRevisionID: String
    let reviewedWorkID: String?
    let reviewedSessionID: String?
    let evidence: [String]
  }

  private static func hasVerifiedAssociationEvidence(
    _ association: StudioExportEvidenceSidecarAssociation,
    observation: StudioExportEvidenceSidecarObservation,
    files: [StudioExportEvidenceSidecarFile]
  ) -> Bool {
    guard association.confidence == .verifiedAutomation else { return true }
    guard let evidence = association.verifiedEvidence else { return false }
    return observation.immutableObservationKeys.contains(evidence.immutableObservationKey)
      && files.contains { $0.sha256 == evidence.automationBinding.outputSHA256 }
  }

  private static func hasIssuedVerifiedAssociationEvidence(
    _ association: StudioExportEvidenceSidecarAssociation,
    observation: StudioExportEvidenceSidecarObservation,
    files: [StudioExportEvidenceSidecarFile]
  ) -> Bool {
    guard association.confidence == .verifiedAutomation else { return true }
    return association.verifiedEvidence?.authorityReceipt != nil
      && hasVerifiedAssociationEvidence(association, observation: observation, files: files)
  }

  private static func reviewOnly(
    _ association: StudioExportEvidenceSidecarAssociation
  ) -> StudioExportEvidenceSidecarAssociation {
    StudioExportEvidenceSidecarAssociation(
      confidence: "reviewed",
      reviewedRevisionID: association.reviewedRevisionID,
      reviewedWorkID: association.reviewedWorkID,
      reviewedSessionID: association.reviewedSessionID,
      evidence: association.evidence)
  }
}

public struct StudioExportEvidenceSidecarRenderer: Sendable {
  private let redactor: RecipientDataRedactor

  public init(redactor: RecipientDataRedactor = RecipientDataRedactor()) {
    self.redactor = redactor
  }

  public func render(_ sidecar: StudioExportEvidenceSidecar) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .iso8601
    let data = try encoder.encode(sanitized(sidecar))
    return String(decoding: data, as: UTF8.self)
  }

  private func sanitized(_ sidecar: StudioExportEvidenceSidecar) throws
    -> StudioExportEvidenceSidecar
  {
    let sanitizedObservation = StudioExportEvidenceSidecarObservation(
      batchID: redactor.redact(sidecar.observation.batchID),
      observedAt: sidecar.observation.observedAt,
      immutableObservationKeys: sidecar.observation.immutableObservationKeys.map(redactor.redact),
      relativePaths: sidecar.observation.relativePaths.map(redactedPath),
      exportDNA: sanitized(sidecar.observation.exportDNA),
      notes: sidecar.observation.notes.map(redactor.redact))
    let sanitizedFiles = sidecar.files.map {
      StudioExportEvidenceSidecarFile(
        relativePath: redactedPath($0.relativePath),
        bytes: $0.bytes,
        sha256: redactor.redact($0.sha256))
    }
    let sanitizedVerifiedEvidence = try sidecar.association.verifiedEvidence.map { evidence in
      let binding = try ExportVerifiedAutomationBinding(
        planID: redactor.redact(evidence.automationBinding.planID),
        revisionNodeID: redactor.redact(evidence.automationBinding.revisionNodeID),
        outputSHA256: redactor.redact(evidence.automationBinding.outputSHA256))
      return try StudioExportVerifiedAssociationEvidence(
        automationBinding: binding,
        immutableObservationKey: redactor.redact(evidence.immutableObservationKey),
        authorityReceipt: nil)
    }
    let sanitizedAssociation = try StudioExportEvidenceSidecarAssociation(
      reportConfidence: sidecar.association.confidence,
      reviewedRevisionID: redactor.redact(sidecar.association.reviewedRevisionID),
      reviewedWorkID: sidecar.association.reviewedWorkID.map(redactor.redact),
      reviewedSessionID: sidecar.association.reviewedSessionID.map(redactor.redact),
      evidence: sidecar.association.evidence.map(redactor.redact),
      verifiedEvidence: sanitizedVerifiedEvidence)
    return StudioExportEvidenceSidecar(
      reportSchemaVersion: sidecar.schemaVersion,
      migratedFromSchemaVersion: sidecar.migratedFromSchemaVersion,
      applicationVersion: redactor.redact(sidecar.applicationVersion),
      algorithmVersions: sidecar.algorithmVersions.map(redactor.redact),
      association: sanitizedAssociation,
      observation: sanitizedObservation,
      files: sanitizedFiles)
  }

  private func sanitized(
    _ exportDNA: ExportDNAAssociationEvidence?
  ) -> ExportDNAAssociationEvidence? {
    guard let exportDNA else { return nil }
    return ExportDNAAssociationEvidence(
      containerKind: exportDNA.containerKind,
      fileSampleRate: exportDNA.fileSampleRate,
      dataChunkBytes: exportDNA.dataChunkBytes,
      originationTimestamp: exportDNA.originationTimestamp,
      sampleTimeReference: exportDNA.sampleTimeReference,
      ixmlProject: exportDNA.ixmlProject.map(redactor.redact),
      ixmlScene: exportDNA.ixmlScene.map(redactor.redact),
      ixmlTake: exportDNA.ixmlTake.map(redactor.redact),
      ixmlTape: exportDNA.ixmlTape.map(redactor.redact),
      ixmlNote: exportDNA.ixmlNote.map(redactor.redact),
      ixmlTimecode: exportDNA.ixmlTimecode.map(redactor.redact),
      ixmlTimecodeRate: exportDNA.ixmlTimecodeRate.map(redactor.redact),
      ixmlTrackLabels: exportDNA.ixmlTrackLabels.map(redactor.redact).sorted(),
      ixmlTrackCount: exportDNA.ixmlTrackCount,
      contradictions: exportDNA.contradictions.map {
        ExportDNAMetadataConflictSummary(
          field: redactor.redact($0.field),
          metadataSource: $0.metadataSource,
          explanation: redactor.redact($0.explanation))
      },
      includesUntrustedDescriptiveMetadata: exportDNA.includesUntrustedDescriptiveMetadata,
      ixmlTimecodeFlag: exportDNA.ixmlTimecodeFlag.map(redactor.redact),
      ixmlDeclaredFileSampleRate: exportDNA.ixmlDeclaredFileSampleRate,
      ixmlTimestamp: exportDNA.ixmlTimestamp,
      untrustedIXMLFields: exportDNA.untrustedIXMLFields.map { field in
        let sanitizedAttributes = field.attributes.reduce(into: [String: String]()) {
          result, attribute in
          result[redactor.redact(attribute.key)] = redactor.redact(attribute.value)
        }
        return ExportUntrustedEmbeddedMetadataField(
          trust: ExportEmbeddedMetadataTrust(
            source: field.trust.source,
            level: field.trust.level,
            explanation: redactor.redact(field.trust.explanation)),
          path: redactor.redact(field.path),
          values: field.values.map(redactor.redact),
          attributes: sanitizedAttributes,
          isEmptyElement: field.isEmptyElement)
      })
  }

  private func redactedPath(_ value: String) -> String {
    let redacted = redactor.redact(value)
    if redacted == value && !value.hasPrefix("/") && !value.lowercased().hasPrefix("file://") {
      return value
    }
    return redacted
  }
}
