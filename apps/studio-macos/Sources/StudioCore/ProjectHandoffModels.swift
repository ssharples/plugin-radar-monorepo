import CryptoKit
import Foundation

public struct ProjectSourceSetFileObservation: Sendable, Equatable {
  public let bytes: Int64
  public let modifiedAtNanoseconds: Int64?
  public let resourceIdentifier: String?
  public let sha256: String

  public init(
    bytes: Int64,
    modifiedAtNanoseconds: Int64?,
    resourceIdentifier: String?,
    sha256: String
  ) {
    self.bytes = bytes
    self.modifiedAtNanoseconds = modifiedAtNanoseconds
    self.resourceIdentifier = resourceIdentifier
    self.sha256 = sha256
  }
}

enum ProjectSourceSetFileObservationError: Error {
  case unreadable
  case notRegularFile
  case empty
  case changedDuringObservation
}

struct ProjectSourceSetFileObserver: Sendable {
  func observe(at url: URL) throws -> ProjectSourceSetFileObservation {
    let canonicalURL = url.resolvingSymlinksInPath().standardizedFileURL
    let before = try snapshot(at: canonicalURL)
    guard before.type == .typeRegular else {
      throw ProjectSourceSetFileObservationError.notRegularFile
    }
    guard before.bytes > 0 else { throw ProjectSourceSetFileObservationError.empty }

    let handle: FileHandle
    do { handle = try FileHandle(forReadingFrom: canonicalURL) } catch {
      throw ProjectSourceSetFileObservationError.unreadable
    }
    defer { try? handle.close() }
    var hasher = SHA256()
    do {
      while let data = try handle.read(upToCount: 1_048_576), !data.isEmpty {
        hasher.update(data: data)
      }
    } catch {
      throw ProjectSourceSetFileObservationError.unreadable
    }

    let after = try snapshot(at: canonicalURL)
    guard before == after else {
      throw ProjectSourceSetFileObservationError.changedDuringObservation
    }
    return ProjectSourceSetFileObservation(
      bytes: before.bytes,
      modifiedAtNanoseconds: before.modifiedAtNanoseconds,
      resourceIdentifier: before.resourceIdentifier,
      sha256: FileContentDigest.hex(hasher.finalize())
    )
  }

  private struct Snapshot: Equatable {
    let type: FileAttributeType
    let bytes: Int64
    let modifiedAtNanoseconds: Int64?
    let resourceIdentifier: String?
  }

  private func snapshot(at url: URL) throws -> Snapshot {
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
      let type = attributes[.type] as? FileAttributeType
    else { throw ProjectSourceSetFileObservationError.unreadable }
    let system = (attributes[.systemNumber] as? NSNumber)?.uint64Value
    let file = (attributes[.systemFileNumber] as? NSNumber)?.uint64Value
    return Snapshot(
      type: type,
      bytes: (attributes[.size] as? NSNumber)?.int64Value ?? 0,
      modifiedAtNanoseconds: (attributes[.modificationDate] as? Date).map {
        Int64($0.timeIntervalSince1970 * 1_000_000_000)
      },
      resourceIdentifier: system.flatMap { system in file.map { "\(system):\($0)" } }
    )
  }
}

public enum ProjectHandoffMediaPolicy: String, Codable, Sendable {
  case requireAvailable
  case requireAvailableAndContained
}

public enum ProjectHandoffFallbackMode: String, Codable, Sendable {
  case none
  case requireExistingAudio
}

public struct ProjectHandoffFallbackPolicy: Codable, Sendable, Equatable {
  public let mode: ProjectHandoffFallbackMode

  public init(mode: ProjectHandoffFallbackMode) {
    self.mode = mode
  }
}

public enum ProjectHandoffPackageFormat: String, Codable, Sendable {
  case intactProjectFolder
}

public enum ProjectHandoffOverwritePolicy: String, Codable, Sendable {
  case never
}

/// Recipient-visible identity captured at the exact handoff review step.
public struct ProjectHandoffDisplaySnapshot: Codable, Sendable, Equatable {
  public let artist: String
  public let song: String
  public let version: String
  public let setDisplayName: String
  public let senderNote: String?

  public init(
    artist: String,
    song: String,
    version: String,
    setDisplayName: String,
    senderNote: String?
  ) {
    self.artist = artist
    self.song = song
    self.version = version
    self.setDisplayName = setDisplayName
    self.senderNote = senderNote
  }
}

/// An immutable record of the exact source and destination policy a user reviews before handoff.
public struct ProjectHandoffPlan: Identifiable, Sendable, Equatable {
  public let id: String
  public let revisionReference: StudioRevisionReference
  public let sourceSetURL: URL
  public let sourceSetFileObservation: ProjectSourceSetFileObservation
  public let sourceProjectURL: URL
  public let stagingRootURL: URL
  public let displaySnapshot: ProjectHandoffDisplaySnapshot
  public let mediaPolicy: ProjectHandoffMediaPolicy
  public let fallbackPolicy: ProjectHandoffFallbackPolicy
  public let selectedTrackIDs: [String]
  public let packageFormat: ProjectHandoffPackageFormat
  public let overwritePolicy: ProjectHandoffOverwritePolicy
  public let createdAt: Date

  public var workID: String { revisionReference.workID }
  public var sessionID: String { revisionReference.sessionID }
  public var revisionID: String { revisionReference.revisionID }

  public var fingerprint: String {
    let reviewedAtMilliseconds = Int64(
      (revisionReference.reviewedAt.timeIntervalSince1970 * 1_000).rounded(.towardZero))
    let createdAtMilliseconds = Int64(
      (createdAt.timeIntervalSince1970 * 1_000).rounded(.towardZero))
    let components: [String] = [
      id, revisionReference.id, workID, sessionID, revisionID, revisionReference.setID,
      revisionReference.setURL.path, revisionReference.trackedRootURL.path,
      revisionReference.contentObservation.reconstructedContentDigest,
      String(revisionReference.contentObservation.compressedBytes),
      revisionReference.contentObservation.modifiedAtNanoseconds.map(String.init) ?? "unknown",
      String(sourceSetFileObservation.bytes),
      sourceSetFileObservation.modifiedAtNanoseconds.map(String.init) ?? "unknown",
      sourceSetFileObservation.sha256,
      sourceSetFileObservation.resourceIdentifier ?? "unknown-resource",
      revisionReference.displaySnapshot.artistName,
      revisionReference.displaySnapshot.workName,
      revisionReference.displaySnapshot.sessionName,
      revisionReference.displaySnapshot.revisionName,
      revisionReference.catalogueAlgorithmVersion, revisionReference.catalogueGenerationID,
      String(reviewedAtMilliseconds), sourceSetURL.path, sourceProjectURL.path,
      stagingRootURL.path, displaySnapshot.artist, displaySnapshot.song,
      displaySnapshot.version, displaySnapshot.setDisplayName,
      displaySnapshot.senderNote ?? "<no-sender-note>",
      mediaPolicy.rawValue, fallbackPolicy.mode.rawValue,
      selectedTrackIDs.joined(separator: "\u{1f}"), packageFormat.rawValue,
      overwritePolicy.rawValue, String(createdAtMilliseconds),
    ]
    return StableID.forValue(components.joined(separator: "\u{1e}"))
  }

  fileprivate init(
    id: String,
    revisionReference: StudioRevisionReference,
    sourceSetFileObservation: ProjectSourceSetFileObservation,
    sourceProjectURL: URL,
    stagingRootURL: URL,
    displaySnapshot: ProjectHandoffDisplaySnapshot,
    mediaPolicy: ProjectHandoffMediaPolicy,
    fallbackPolicy: ProjectHandoffFallbackPolicy,
    selectedTrackIDs: [String],
    packageFormat: ProjectHandoffPackageFormat,
    overwritePolicy: ProjectHandoffOverwritePolicy,
    createdAt: Date
  ) {
    self.id = id
    self.revisionReference = revisionReference
    sourceSetURL = revisionReference.setURL.standardizedFileURL
    self.sourceSetFileObservation = sourceSetFileObservation
    self.sourceProjectURL = sourceProjectURL.standardizedFileURL
    self.stagingRootURL = stagingRootURL.standardizedFileURL
    self.displaySnapshot = displaySnapshot
    self.mediaPolicy = mediaPolicy
    self.fallbackPolicy = fallbackPolicy
    self.selectedTrackIDs = selectedTrackIDs.sorted()
    self.packageFormat = packageFormat
    self.overwritePolicy = overwritePolicy
    self.createdAt = createdAt
  }
}

public enum ProjectHandoffReferenceReviewReason: String, Codable, Sendable, Equatable {
  case catalogueRefreshInProgress
  case catalogueGenerationChanged
  case revisionMissing
  case revisionAmbiguous
  case trackedRootMissing
  case workRegrouped
  case sessionChanged
  case setIdentityChanged
  case setLocationChanged
  case setContentChanged
}

public enum ProjectHandoffReferenceValidationError: Error, Equatable {
  case requiresReview(ProjectHandoffReferenceReviewReason)
  case sourceProjectMismatch
  case sourceSetUnreadable
}

public struct ProjectHandoffPlanFactory: Sendable {
  public init() {}

  public func make(
    id: String,
    setURL: URL,
    in catalog: WorkCatalog,
    catalogueGenerationID: String? = nil,
    sourceProjectURL: URL,
    stagingRootURL: URL,
    senderNote: String? = nil,
    mediaPolicy: ProjectHandoffMediaPolicy,
    fallbackPolicy: ProjectHandoffFallbackPolicy,
    selectedTrackIDs: [String],
    packageFormat: ProjectHandoffPackageFormat = .intactProjectFolder,
    overwritePolicy: ProjectHandoffOverwritePolicy = .never,
    createdAt: Date = Date()
  ) throws -> ProjectHandoffPlan {
    let captured: ResolvedStudioRevisionReference
    do {
      captured = try StudioRevisionReferenceResolver().capture(
        setURL: setURL,
        in: catalog,
        catalogueGenerationID: catalogueGenerationID,
        reviewedAt: createdAt)
    } catch let error as StudioRevisionReferenceError {
      throw ProjectHandoffReferenceValidationError.requiresReview(
        ProjectHandoffReferenceValidator().reviewReason(for: error))
    }
    return try make(
      id: id,
      revisionReference: captured.reference,
      in: catalog,
      catalogueGenerationID: catalogueGenerationID,
      sourceProjectURL: sourceProjectURL,
      stagingRootURL: stagingRootURL,
      senderNote: senderNote,
      mediaPolicy: mediaPolicy,
      fallbackPolicy: fallbackPolicy,
      selectedTrackIDs: selectedTrackIDs,
      packageFormat: packageFormat,
      overwritePolicy: overwritePolicy,
      createdAt: createdAt)
  }

  public func make(
    id: String,
    revisionReference: StudioRevisionReference,
    in catalog: WorkCatalog,
    catalogueGenerationID: String? = nil,
    sourceProjectURL: URL,
    stagingRootURL: URL,
    senderNote: String? = nil,
    mediaPolicy: ProjectHandoffMediaPolicy,
    fallbackPolicy: ProjectHandoffFallbackPolicy,
    selectedTrackIDs: [String],
    packageFormat: ProjectHandoffPackageFormat = .intactProjectFolder,
    overwritePolicy: ProjectHandoffOverwritePolicy = .never,
    createdAt: Date = Date()
  ) throws -> ProjectHandoffPlan {
    let resolved = try ProjectHandoffReferenceValidator().resolve(
      revisionReference, in: catalog, catalogueGenerationID: catalogueGenerationID)
    let project = sourceProjectURL.resolvingSymlinksInPath().standardizedFileURL
    let setURL = resolved.revision.set.fileURL.resolvingSymlinksInPath().standardizedFileURL
    guard setURL.path.hasPrefix(project.path + "/") else {
      throw ProjectHandoffReferenceValidationError.sourceProjectMismatch
    }
    let sourceSetFileObservation: ProjectSourceSetFileObservation
    do {
      sourceSetFileObservation = try ProjectSourceSetFileObserver().observe(at: setURL)
    } catch {
      throw ProjectHandoffReferenceValidationError.sourceSetUnreadable
    }
    return ProjectHandoffPlan(
      id: id,
      revisionReference: revisionReference,
      sourceSetFileObservation: sourceSetFileObservation,
      sourceProjectURL: sourceProjectURL,
      stagingRootURL: stagingRootURL,
      displaySnapshot: ProjectHandoffDisplaySnapshot(
        artist: revisionReference.displaySnapshot.artistName,
        song: revisionReference.displaySnapshot.workName,
        version: revisionReference.displaySnapshot.revisionName,
        setDisplayName: resolved.revision.set.displayName,
        senderNote: senderNote
      ),
      mediaPolicy: mediaPolicy,
      fallbackPolicy: fallbackPolicy,
      selectedTrackIDs: selectedTrackIDs,
      packageFormat: packageFormat,
      overwritePolicy: overwritePolicy,
      createdAt: createdAt
    )
  }
}

public struct ProjectHandoffReferenceValidator: Sendable {
  public init() {}

  public func resolve(
    _ reference: StudioRevisionReference,
    in catalog: WorkCatalog,
    catalogueGenerationID: String? = nil
  ) throws -> ResolvedStudioRevisionReference {
    do {
      return try StudioRevisionReferenceResolver().resolve(
        reference, in: catalog, catalogueGenerationID: catalogueGenerationID)
    } catch let error as StudioRevisionReferenceError {
      throw ProjectHandoffReferenceValidationError.requiresReview(reviewReason(for: error))
    }
  }

  public func validate(
    plan: ProjectHandoffPlan,
    in catalog: WorkCatalog,
    catalogueGenerationID: String? = nil
  ) throws -> ResolvedStudioRevisionReference {
    let resolved = try resolve(
      plan.revisionReference, in: catalog, catalogueGenerationID: catalogueGenerationID)
    guard plan.sourceSetURL == plan.revisionReference.setURL,
      plan.workID == resolved.work.id,
      plan.sessionID == resolved.session.id,
      plan.revisionID == resolved.revision.id,
      plan.displaySnapshot.artist == plan.revisionReference.displaySnapshot.artistName,
      plan.displaySnapshot.song == plan.revisionReference.displaySnapshot.workName,
      plan.displaySnapshot.version == plan.revisionReference.displaySnapshot.revisionName,
      plan.displaySnapshot.setDisplayName == resolved.revision.set.displayName
    else {
      throw ProjectHandoffReferenceValidationError.requiresReview(.setIdentityChanged)
    }
    return resolved
  }

  public func validate(set: AbletonSet, for plan: ProjectHandoffPlan) throws {
    do {
      try StudioRevisionReferenceResolver().validate(
        set: set, against: plan.revisionReference)
    } catch let error as StudioRevisionReferenceError {
      throw ProjectHandoffReferenceValidationError.requiresReview(reviewReason(for: error))
    }
  }

  func reviewReason(for error: StudioRevisionReferenceError)
    -> ProjectHandoffReferenceReviewReason
  {
    switch error {
    case .catalogueRefreshInProgress: .catalogueRefreshInProgress
    case .catalogueGenerationChanged: .catalogueGenerationChanged
    case .revisionNotFound, .setURLNotFound, .untrackedSetURL: .revisionMissing
    case .ambiguousRevision, .ambiguousSetURL: .revisionAmbiguous
    case .trackedRootMissing: .trackedRootMissing
    case .workRegrouped: .workRegrouped
    case .sessionMismatch: .sessionChanged
    case .setIDMismatch: .setIdentityChanged
    case .setURLMismatch: .setLocationChanged
    case .contentObservationChanged: .setContentChanged
    }
  }
}

public enum ProjectHandoffStatus: String, Codable, Sendable {
  case ready
  case readyWithLimitations
  case needsAttention
}

public enum ProjectHandoffAssuranceStatus: String, Codable, Sendable {
  case verified
  case availableAtSource
  case documented
  case included
  case notRequested
  case notIncluded
  case needsAttention
  case unknown
}

public struct ProjectHandoffAssuranceItem: Codable, Sendable, Equatable {
  public let status: ProjectHandoffAssuranceStatus
  public let summary: String

  public init(status: ProjectHandoffAssuranceStatus, summary: String) {
    self.status = status
    self.summary = summary
  }
}

public struct ProjectHandoffAssurance: Codable, Sendable, Equatable {
  public let media: ProjectHandoffAssuranceItem
  public let plugins: ProjectHandoffAssuranceItem
  public let fallbackAudio: ProjectHandoffAssuranceItem

  public init(
    media: ProjectHandoffAssuranceItem,
    plugins: ProjectHandoffAssuranceItem,
    fallbackAudio: ProjectHandoffAssuranceItem
  ) {
    self.media = media
    self.plugins = plugins
    self.fallbackAudio = fallbackAudio
  }
}

public enum ProjectMediaLocation: String, Codable, Sendable {
  case containedInProject
  case external
  case missing
  case disconnected
  case symlinkEscaped
  case cloudPlaceholder
  case permissionBlocked
  case removableVolumeDependent
  case invalidEmbeddedFile
  case unknown
}

public enum ProjectMediaVolumeState: String, Codable, Sendable {
  case availableLocal
  case availableRemovable
  case offline
  case unknown
}

public enum ProjectEmbeddedFileValidationStatus: String, Codable, Sendable {
  case verified
  case missing
  case unreadable
  case empty
  case notRegularFile
  case changedDuringAudit
  case notValidated
}

public struct ProjectMediaRequirement: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: MediaDependencyKind
  public let displayName: String
  public let ownerID: String
  public let availability: MediaDependencyAvailability
  public let location: ProjectMediaLocation
  public let volumeState: ProjectMediaVolumeState
  public let fileValidation: ProjectEmbeddedFileValidationStatus
  public let resolvedPath: String?
  public let evidence: String

  public init(
    id: String,
    kind: MediaDependencyKind,
    displayName: String,
    ownerID: String,
    availability: MediaDependencyAvailability,
    location: ProjectMediaLocation,
    volumeState: ProjectMediaVolumeState = .unknown,
    fileValidation: ProjectEmbeddedFileValidationStatus = .notValidated,
    resolvedPath: String?,
    evidence: String
  ) {
    self.id = id
    self.kind = kind
    self.displayName = displayName
    self.ownerID = ownerID
    self.availability = availability
    self.location = location
    self.volumeState = volumeState
    self.fileValidation = fileValidation
    self.resolvedPath = resolvedPath
    self.evidence = evidence
  }
}

public enum ProjectManagedLibraryStatus: String, Codable, Sendable {
  case known
  case notDetected
  case unknown
}

public struct ProjectManagedLibraryInventoryRecord: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let pluginIdentifier: String?
  public let pluginName: String?
  public let manufacturer: String?
  public let format: PluginFormat?
  public let status: ProjectManagedLibraryStatus
  public let explanation: String

  public init(
    id: String,
    pluginIdentifier: String? = nil,
    pluginName: String? = nil,
    manufacturer: String? = nil,
    format: PluginFormat? = nil,
    status: ProjectManagedLibraryStatus,
    explanation: String
  ) {
    self.id = id
    self.pluginIdentifier = pluginIdentifier
    self.pluginName = pluginName
    self.manufacturer = manufacturer
    self.format = format
    self.status = status
    self.explanation = explanation
  }
}

public struct ProjectManagedLibraryInventory: Codable, Sendable, Equatable {
  public let assessedAt: Date?
  public let records: [ProjectManagedLibraryInventoryRecord]

  public init(assessedAt: Date?, records: [ProjectManagedLibraryInventoryRecord]) {
    self.assessedAt = assessedAt
    self.records = records.sorted { $0.id < $1.id }
  }

  public static let unknown = ProjectManagedLibraryInventory(assessedAt: nil, records: [])
}

public struct ProjectPluginRequirement: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let name: String
  public let manufacturer: String?
  public let format: PluginFormat
  public let requiredVersion: String?
  public let trackNames: [String]
  public let trackIDs: [String]
  public let senderStatus: PluginCompatibilityStatus
  public let installedVersion: String?
  public let managedLibraryStatus: ProjectManagedLibraryStatus
  public let managedLibraryEvidence: String
  public let fallbackAvailable: Bool

  public init(
    id: String,
    name: String,
    manufacturer: String?,
    format: PluginFormat,
    requiredVersion: String?,
    trackNames: [String],
    trackIDs: [String],
    senderStatus: PluginCompatibilityStatus,
    installedVersion: String?,
    managedLibraryStatus: ProjectManagedLibraryStatus = .unknown,
    managedLibraryEvidence: String = "No explicit managed-library inventory evidence was supplied.",
    fallbackAvailable: Bool
  ) {
    self.id = id
    self.name = name
    self.manufacturer = manufacturer
    self.format = format
    self.requiredVersion = requiredVersion
    self.trackNames = trackNames.sorted()
    self.trackIDs = trackIDs.sorted()
    self.senderStatus = senderStatus
    self.installedVersion = installedVersion
    self.managedLibraryStatus = managedLibraryStatus
    self.managedLibraryEvidence = managedLibraryEvidence
    self.fallbackAvailable = fallbackAvailable
  }
}

/// Read-only evidence for fallback audio that already exists; this core never creates it.
public struct ProjectFallbackAudioEvidence: Codable, Identifiable, Sendable, Equatable {
  public var id: String { trackID }
  public let trackID: String
  public let fileURL: URL

  public init(trackID: String, fileURL: URL) {
    self.trackID = trackID
    self.fileURL = fileURL.standardizedFileURL
  }
}

public struct ProjectVerifiedFallbackAudio: Codable, Identifiable, Sendable, Equatable {
  public var id: String { trackID }
  public let trackID: String
  public let relativePath: String
  public let bytes: Int64
  public let sha256: String

  public init(trackID: String, relativePath: String, bytes: Int64, sha256: String) {
    self.trackID = trackID
    self.relativePath = relativePath
    self.bytes = bytes
    self.sha256 = sha256
  }
}

public struct ProjectLiveRequirement: Codable, Sendable, Equatable {
  public let creator: String?
  public let version: String?
  public let edition: String?
  public let requiresMaxForLive: Bool
  public let maxForLiveDeviceCount: Int
  public let maxForLiveDeviceNames: [String]
  public let nativeDeviceNames: [String]
  public let packNames: [String]

  public init(
    creator: String?,
    version: String?,
    edition: String?,
    requiresMaxForLive: Bool,
    maxForLiveDeviceCount: Int,
    maxForLiveDeviceNames: [String],
    nativeDeviceNames: [String],
    packNames: [String]
  ) {
    self.creator = creator
    self.version = version
    self.edition = edition
    self.requiresMaxForLive = requiresMaxForLive
    self.maxForLiveDeviceCount = maxForLiveDeviceCount
    self.maxForLiveDeviceNames = maxForLiveDeviceNames.sorted()
    self.nativeDeviceNames = nativeDeviceNames.sorted()
    self.packNames = packNames.sorted()
  }
}

public enum ProjectProjectInfoStatus: String, Codable, Sendable {
  case intact
  case missing
  case conflicting
}

public struct ProjectBoundaryEvidence: Codable, Sendable, Equatable {
  public let projectLeafName: String
  public let selectedSetRelativePath: String
  public let projectInfoStatus: ProjectProjectInfoStatus
  public let projectInfoRelativePaths: [String]
  public let conflictingProjectInfoRelativePaths: [String]
  public let containedOnThisMac: Bool
  public let portableToAnotherMac: Bool
  public let projectLeafSummary: String
  public let sourceContainmentSummary: String
  public let portabilitySummary: String

  public init(
    projectLeafName: String,
    selectedSetRelativePath: String,
    projectInfoStatus: ProjectProjectInfoStatus,
    projectInfoRelativePaths: [String],
    conflictingProjectInfoRelativePaths: [String],
    containedOnThisMac: Bool,
    portableToAnotherMac: Bool,
    projectLeafSummary: String,
    sourceContainmentSummary: String,
    portabilitySummary: String
  ) {
    self.projectLeafName = projectLeafName
    self.selectedSetRelativePath = selectedSetRelativePath
    self.projectInfoStatus = projectInfoStatus
    self.projectInfoRelativePaths = projectInfoRelativePaths.sorted()
    self.conflictingProjectInfoRelativePaths = conflictingProjectInfoRelativePaths.sorted()
    self.containedOnThisMac = containedOnThisMac
    self.portableToAnotherMac = portableToAnotherMac
    self.projectLeafSummary = projectLeafSummary
    self.sourceContainmentSummary = sourceContainmentSummary
    self.portabilitySummary = portabilitySummary
  }
}

public enum ProjectHandoffRiskKind: String, Codable, Sendable {
  case sourceSetMismatch
  case projectBoundaryConflict
  case missingMedia
  case disconnectedMedia
  case unresolvedMedia
  case externalMedia
  case symlinkEscapedMedia
  case cloudPlaceholderMedia
  case permissionBlockedMedia
  case removableVolumeMedia
  case invalidEmbeddedMedia
  case unknownMedia
  case missingPlugin
  case pluginVersionMismatch
  case unscannedPluginFormat
  case pluginManagedLibrary
  case maxForLiveRequirement
  case insufficientDiskSpace
  case unknownDiskSpace
  case missingFallback
  case unknown
}

public enum ProjectHandoffRiskSeverity: String, Codable, Sendable {
  case note
  case warning
  case blocking
}

public struct ProjectHandoffRisk: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: ProjectHandoffRiskKind
  public let severity: ProjectHandoffRiskSeverity
  public let summary: String

  public init(
    id: String,
    kind: ProjectHandoffRiskKind,
    severity: ProjectHandoffRiskSeverity,
    summary: String
  ) {
    self.id = id
    self.kind = kind
    self.severity = severity
    self.summary = summary
  }
}

public enum ProjectReadinessAuditError: Error, Equatable {
  case contradictoryStatus
  case contradictoryMediaAssurance
  case contradictoryFallbackAssurance
  case contradictoryPluginFallback
  case contradictoryDestinationCapacity
}

public enum ProjectDestinationCapacityStatus: String, Codable, Sendable {
  case sufficient
  case insufficient
  case unknown
}

public struct ProjectReadinessAudit: Sendable, Equatable {
  public let planID: String
  public let planFingerprint: String
  public let workID: String
  public let sessionID: String
  public let revisionID: String
  public let setDisplayName: String
  public let sourceModifiedAt: Date?
  public let auditedAt: Date
  public let estimatedStagedBytes: Int64
  public let availableDiskBytes: Int64?
  public let destinationCapacityStatus: ProjectDestinationCapacityStatus
  public let boundaryEvidence: ProjectBoundaryEvidence
  public let mediaRequirements: [ProjectMediaRequirement]
  public let pluginRequirements: [ProjectPluginRequirement]
  public let verifiedFallbackAudio: [ProjectVerifiedFallbackAudio]
  public let liveRequirement: ProjectLiveRequirement
  public let risks: [ProjectHandoffRisk]
  public let assurance: ProjectHandoffAssurance
  public let status: ProjectHandoffStatus

  init(
    planID: String,
    planFingerprint: String,
    workID: String,
    sessionID: String,
    revisionID: String,
    setDisplayName: String,
    sourceModifiedAt: Date?,
    auditedAt: Date,
    estimatedStagedBytes: Int64,
    availableDiskBytes: Int64?,
    destinationCapacityStatus: ProjectDestinationCapacityStatus,
    boundaryEvidence: ProjectBoundaryEvidence,
    mediaRequirements: [ProjectMediaRequirement],
    pluginRequirements: [ProjectPluginRequirement],
    verifiedFallbackAudio: [ProjectVerifiedFallbackAudio],
    liveRequirement: ProjectLiveRequirement,
    risks: [ProjectHandoffRisk],
    assurance: ProjectHandoffAssurance,
    status: ProjectHandoffStatus
  ) {
    self.planID = planID
    self.planFingerprint = planFingerprint
    self.workID = workID
    self.sessionID = sessionID
    self.revisionID = revisionID
    self.setDisplayName = setDisplayName
    self.sourceModifiedAt = sourceModifiedAt
    self.auditedAt = auditedAt
    self.estimatedStagedBytes = estimatedStagedBytes
    self.availableDiskBytes = availableDiskBytes
    self.destinationCapacityStatus = destinationCapacityStatus
    self.boundaryEvidence = boundaryEvidence
    self.mediaRequirements = mediaRequirements.sorted { $0.id < $1.id }
    self.pluginRequirements = pluginRequirements.sorted { $0.id < $1.id }
    self.verifiedFallbackAudio = verifiedFallbackAudio.sorted { $0.trackID < $1.trackID }
    self.liveRequirement = liveRequirement
    self.risks = risks.sorted { $0.id < $1.id }
    self.assurance = assurance
    self.status = status
  }

  public func validate() throws {
    let hasBlockingRisk = risks.contains { $0.severity == .blocking }
    let hasWarningRisk = risks.contains { $0.severity == .warning }
    let expectedStatus: ProjectHandoffStatus
    if hasBlockingRisk {
      expectedStatus = .needsAttention
    } else if hasWarningRisk || !boundaryEvidence.portableToAnotherMac {
      expectedStatus = .readyWithLimitations
    } else {
      expectedStatus = .ready
    }
    guard status == expectedStatus else { throw ProjectReadinessAuditError.contradictoryStatus }

    let expectedCapacity: ProjectDestinationCapacityStatus
    if let availableDiskBytes {
      expectedCapacity = availableDiskBytes < estimatedStagedBytes ? .insufficient : .sufficient
    } else {
      expectedCapacity = .unknown
    }
    guard destinationCapacityStatus == expectedCapacity else {
      throw ProjectReadinessAuditError.contradictoryDestinationCapacity
    }
    let hasUnknownCapacityRisk = risks.contains { $0.kind == .unknownDiskSpace }
    let hasInsufficientCapacityRisk = risks.contains { $0.kind == .insufficientDiskSpace }
    guard hasUnknownCapacityRisk == (destinationCapacityStatus == .unknown),
      hasInsufficientCapacityRisk == (destinationCapacityStatus == .insufficient)
    else {
      throw ProjectReadinessAuditError.contradictoryDestinationCapacity
    }

    let mediaRiskKinds: Set<ProjectHandoffRiskKind> = [
      .sourceSetMismatch, .projectBoundaryConflict, .missingMedia, .disconnectedMedia,
      .unresolvedMedia, .externalMedia, .symlinkEscapedMedia, .cloudPlaceholderMedia,
      .permissionBlockedMedia, .removableVolumeMedia, .invalidEmbeddedMedia, .unknownMedia,
      .insufficientDiskSpace,
    ]
    let hasBlockingMediaRisk = risks.contains {
      $0.severity == .blocking && mediaRiskKinds.contains($0.kind)
    }
    guard assurance.media.status == (hasBlockingMediaRisk ? .needsAttention : .availableAtSource)
    else { throw ProjectReadinessAuditError.contradictoryMediaAssurance }

    let hasMissingFallback = risks.contains {
      $0.kind == .missingFallback && $0.severity == .blocking
    }
    if hasMissingFallback {
      guard assurance.fallbackAudio.status == .needsAttention else {
        throw ProjectReadinessAuditError.contradictoryFallbackAssurance
      }
    } else if assurance.fallbackAudio.status == .included {
      guard !verifiedFallbackAudio.isEmpty else {
        throw ProjectReadinessAuditError.contradictoryFallbackAssurance
      }
    } else if assurance.fallbackAudio.status != .notRequested {
      throw ProjectReadinessAuditError.contradictoryFallbackAssurance
    }

    let verifiedTracks = Set(verifiedFallbackAudio.map(\.trackID))
    for requirement in pluginRequirements {
      let expected =
        !requirement.trackIDs.isEmpty
        && Set(requirement.trackIDs).isSubset(of: verifiedTracks)
      guard requirement.fallbackAvailable == expected else {
        throw ProjectReadinessAuditError.contradictoryPluginFallback
      }
    }
  }

  public func addingRisk(_ risk: ProjectHandoffRisk) -> ProjectReadinessAudit {
    let updatedRisks = risks + [risk]
    let blocking = updatedRisks.contains { $0.severity == .blocking }
    let warning = updatedRisks.contains { $0.severity == .warning }
    var updatedAssurance = assurance
    if risk.severity == .blocking {
      if [
        .missingMedia, .disconnectedMedia, .unresolvedMedia, .externalMedia,
        .symlinkEscapedMedia, .cloudPlaceholderMedia, .permissionBlockedMedia,
        .removableVolumeMedia, .invalidEmbeddedMedia, .unknownMedia, .insufficientDiskSpace,
        .sourceSetMismatch, .projectBoundaryConflict,
      ].contains(risk.kind) {
        updatedAssurance = ProjectHandoffAssurance(
          media: ProjectHandoffAssuranceItem(
            status: .needsAttention,
            summary: "Ableton-visible media needs attention before handoff."
          ),
          plugins: assurance.plugins,
          fallbackAudio: assurance.fallbackAudio
        )
      } else if risk.kind == .missingFallback {
        updatedAssurance = ProjectHandoffAssurance(
          media: assurance.media,
          plugins: assurance.plugins,
          fallbackAudio: ProjectHandoffAssuranceItem(
            status: .needsAttention,
            summary: "Requested fallback audio has not been verified."
          )
        )
      }
    }
    return ProjectReadinessAudit(
      planID: planID,
      planFingerprint: planFingerprint,
      workID: workID,
      sessionID: sessionID,
      revisionID: revisionID,
      setDisplayName: setDisplayName,
      sourceModifiedAt: sourceModifiedAt,
      auditedAt: auditedAt,
      estimatedStagedBytes: estimatedStagedBytes,
      availableDiskBytes: availableDiskBytes,
      destinationCapacityStatus: destinationCapacityStatus,
      boundaryEvidence: boundaryEvidence,
      mediaRequirements: mediaRequirements,
      pluginRequirements: pluginRequirements,
      verifiedFallbackAudio: verifiedFallbackAudio,
      liveRequirement: liveRequirement,
      risks: updatedRisks,
      assurance: updatedAssurance,
      status: blocking
        ? .needsAttention
        : (warning || !boundaryEvidence.portableToAnotherMac ? .readyWithLimitations : .ready)
    )
  }
}

public enum ProjectPortabilityReviewActionKind: String, Codable, Sendable {
  case reviewProjectBoundary
  case collectExternalMediaInStagedCopy
  case replaceEscapedSymlinkInStagedCopy
  case downloadCloudMedia
  case restoreOfflineVolume
  case grantReadPermission
  case replaceInvalidMediaInStagedCopy
  case resolveUnknownReference
  case provideDestinationSpace
  case provideFallbackAudio
}

public struct ProjectPortabilityReviewAction: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: ProjectPortabilityReviewActionKind
  public let summary: String
  public let stagedCopyOnly: Bool
  public let requiresExplicitApproval: Bool

  public init(
    id: String,
    kind: ProjectPortabilityReviewActionKind,
    summary: String,
    stagedCopyOnly: Bool,
    requiresExplicitApproval: Bool = true
  ) {
    self.id = id
    self.kind = kind
    self.summary = summary
    self.stagedCopyOnly = stagedCopyOnly
    self.requiresExplicitApproval = requiresExplicitApproval
  }
}

/// A review artifact only. It deliberately has no execution API and grants no mutation authority.
public struct ProjectPortabilityReviewPlan: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let handoffPlanID: String
  public let handoffPlanFingerprint: String
  public let auditTimestamp: Date
  public let createdAt: Date
  public let actions: [ProjectPortabilityReviewAction]

  public var authorizesMutation: Bool { false }

  init(
    id: String,
    handoffPlanID: String,
    handoffPlanFingerprint: String,
    auditTimestamp: Date,
    createdAt: Date,
    actions: [ProjectPortabilityReviewAction]
  ) {
    self.id = id
    self.handoffPlanID = handoffPlanID
    self.handoffPlanFingerprint = handoffPlanFingerprint
    self.auditTimestamp = auditTimestamp
    self.createdAt = createdAt
    self.actions = actions.sorted { $0.id < $1.id }
  }
}
