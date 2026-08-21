import Foundation

/// Immutable indexed evidence for the Ableton Set represented by a reviewed revision reference.
/// This is catalogue evidence, not a claim that the file can never change on disk.
public struct StudioSetContentObservation: Codable, Sendable, Equatable {
  public let compressedBytes: Int64
  public let modifiedAtNanoseconds: Int64?
  public let reconstructedContentDigest: String

  init(
    compressedBytes: Int64,
    modifiedAtNanoseconds: Int64?,
    reconstructedContentDigest: String
  ) {
    self.compressedBytes = compressedBytes
    self.modifiedAtNanoseconds = modifiedAtNanoseconds
    self.reconstructedContentDigest = reconstructedContentDigest
  }

  public init(set: AbletonSet) {
    compressedBytes = set.compressedBytes
    modifiedAtNanoseconds = set.modifiedAt.map {
      Int64($0.timeIntervalSince1970 * 1_000_000_000)
    }
    reconstructedContentDigest = SetMapBuilder().build(set: set).sourceDigest
  }
}

/// Historical labels reviewed alongside a particular Work/Session/Set Revision relationship.
/// They are snapshots rather than mutable aliases for the current catalogue labels.
public struct StudioRevisionDisplaySnapshot: Codable, Sendable, Equatable {
  public let artistName: String
  public let workName: String
  public let sessionName: String
  public let revisionName: String

}

/// A reviewed cross-feature reference to one indexed Set Revision and its current creative identity.
/// Work membership is intentionally revalidated because content-aware organisation may regroup it.
public struct StudioRevisionReference: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let workID: String
  public let sessionID: String
  public let revisionID: String
  public let setID: String
  public let setURL: URL
  public let trackedRootURL: URL
  public let contentObservation: StudioSetContentObservation
  public let displaySnapshot: StudioRevisionDisplaySnapshot
  public let catalogueAlgorithmVersion: String
  public let catalogueGenerationID: String
  public let reviewedAt: Date

  init(
    workID: String,
    sessionID: String,
    revisionID: String,
    setID: String,
    setURL: URL,
    trackedRootURL: URL,
    contentObservation: StudioSetContentObservation,
    displaySnapshot: StudioRevisionDisplaySnapshot,
    catalogueAlgorithmVersion: String,
    catalogueGenerationID: String,
    reviewedAt: Date = Date()
  ) {
    self.workID = workID
    self.sessionID = sessionID
    self.revisionID = revisionID
    self.setID = setID
    self.setURL = setURL.standardizedFileURL
    self.trackedRootURL = trackedRootURL.standardizedFileURL
    self.contentObservation = contentObservation
    self.displaySnapshot = displaySnapshot
    self.catalogueAlgorithmVersion = catalogueAlgorithmVersion
    self.catalogueGenerationID = catalogueGenerationID
    self.reviewedAt = reviewedAt
    id = StableID.forValue(
      [
        "studio-revision-reference", workID, sessionID, revisionID, setID,
        setURL.standardizedFileURL.path, trackedRootURL.standardizedFileURL.path,
        contentObservation.reconstructedContentDigest,
        String(contentObservation.compressedBytes),
        contentObservation.modifiedAtNanoseconds.map(String.init) ?? "unknown",
        catalogueGenerationID,
      ].joined(separator: ":"))
  }
}

public struct ResolvedStudioRevisionReference: Sendable {
  public let reference: StudioRevisionReference
  public let work: StudioWork
  public let session: StudioSession
  public let revision: StudioSetRevision

}

public enum StudioRevisionReferenceError: Error, LocalizedError, Equatable {
  case catalogueRefreshInProgress
  case catalogueGenerationChanged
  case revisionNotFound(String)
  case ambiguousRevision(String)
  case setURLNotFound(URL)
  case ambiguousSetURL(URL)
  case untrackedSetURL(URL)
  case trackedRootMissing(URL)
  case workRegrouped(expectedWorkID: String, currentWorkID: String)
  case sessionMismatch(expectedSessionID: String, currentSessionID: String)
  case setIDMismatch(expectedSetID: String, currentSetID: String)
  case setURLMismatch(expected: URL, current: URL)
  case contentObservationChanged

  public var errorDescription: String? {
    switch self {
    case .catalogueRefreshInProgress:
      "Studio organisation is still refreshing. Wait for the current all-root catalogue before reviewing this Set Revision."
    case .catalogueGenerationChanged:
      "Studio organisation changed after this Set Revision was reviewed. Review the current Song and Set again."
    case .revisionNotFound:
      "The reviewed Set Revision is no longer present in the current Studio catalogue."
    case .ambiguousRevision:
      "The reviewed Set Revision is ambiguous in the current Studio catalogue."
    case .setURLNotFound:
      "The selected Ableton Set is not present in the current all-root Studio catalogue."
    case .ambiguousSetURL:
      "More than one current Set Revision resolves to the selected Ableton Set path."
    case .untrackedSetURL:
      "The selected Ableton Set is not contained by a tracked root."
    case .trackedRootMissing:
      "The tracked root that supplied this reviewed Set Revision is no longer in the catalogue."
    case .workRegrouped:
      "This Session now belongs to a different Song. Review and relink before continuing."
    case .sessionMismatch:
      "This Set Revision now resolves to a different Session. Review and relink before continuing."
    case .setIDMismatch, .setURLMismatch:
      "The selected Set no longer matches the reviewed Set Revision."
    case .contentObservationChanged:
      "The indexed Set content changed after this revision reference was reviewed."
    }
  }
}

public struct StudioRevisionReferenceResolver: Sendable {
  public init() {}

  public func capture(
    setURL: URL,
    in catalog: WorkCatalog,
    catalogueGenerationID: String? = nil,
    reviewedAt: Date = Date()
  ) throws -> ResolvedStudioRevisionReference {
    let path = setURL.standardizedFileURL.path
    let matches = members(in: catalog).filter {
      $0.revision.set.fileURL.standardizedFileURL.path == path
    }
    guard !matches.isEmpty else { throw StudioRevisionReferenceError.setURLNotFound(setURL) }
    guard matches.count == 1, let member = matches.first else {
      throw StudioRevisionReferenceError.ambiguousSetURL(setURL)
    }
    return try captured(
      member, catalog: catalog, catalogueGenerationID: catalogueGenerationID,
      reviewedAt: reviewedAt)
  }

  public func capture(
    workID: String,
    sessionID: String,
    revisionID: String,
    in catalog: WorkCatalog,
    catalogueGenerationID: String? = nil,
    reviewedAt: Date = Date()
  ) throws -> ResolvedStudioRevisionReference {
    let matches = members(in: catalog).filter {
      $0.work.id == workID && $0.session.id == sessionID && $0.revision.id == revisionID
    }
    guard !matches.isEmpty else { throw StudioRevisionReferenceError.revisionNotFound(revisionID) }
    guard matches.count == 1, let member = matches.first else {
      throw StudioRevisionReferenceError.ambiguousRevision(revisionID)
    }
    return try captured(
      member, catalog: catalog, catalogueGenerationID: catalogueGenerationID,
      reviewedAt: reviewedAt)
  }

  public func resolve(
    _ reference: StudioRevisionReference,
    in catalog: WorkCatalog,
    catalogueGenerationID: String? = nil
  ) throws -> ResolvedStudioRevisionReference {
    if let catalogueGenerationID,
      catalogueGenerationID != reference.catalogueGenerationID
    {
      throw StudioRevisionReferenceError.catalogueGenerationChanged
    }
    guard catalog.sourceRoots.map(\.standardizedFileURL).contains(reference.trackedRootURL) else {
      throw StudioRevisionReferenceError.trackedRootMissing(reference.trackedRootURL)
    }
    let matches = members(in: catalog).filter { $0.revision.id == reference.revisionID }
    guard !matches.isEmpty else {
      throw StudioRevisionReferenceError.revisionNotFound(reference.revisionID)
    }
    guard matches.count == 1, let member = matches.first else {
      throw StudioRevisionReferenceError.ambiguousRevision(reference.revisionID)
    }
    guard member.work.id == reference.workID else {
      throw StudioRevisionReferenceError.workRegrouped(
        expectedWorkID: reference.workID, currentWorkID: member.work.id)
    }
    guard member.session.id == reference.sessionID else {
      throw StudioRevisionReferenceError.sessionMismatch(
        expectedSessionID: reference.sessionID, currentSessionID: member.session.id)
    }
    guard member.revision.set.id == reference.setID else {
      throw StudioRevisionReferenceError.setIDMismatch(
        expectedSetID: reference.setID, currentSetID: member.revision.set.id)
    }
    let currentURL = member.revision.set.fileURL.standardizedFileURL
    guard currentURL == reference.setURL else {
      throw StudioRevisionReferenceError.setURLMismatch(
        expected: reference.setURL, current: currentURL)
    }
    guard StudioSetContentObservation(set: member.revision.set) == reference.contentObservation
    else {
      throw StudioRevisionReferenceError.contentObservationChanged
    }
    return ResolvedStudioRevisionReference(
      reference: reference, work: member.work, session: member.session,
      revision: member.revision)
  }

  public func validate(
    set: AbletonSet,
    against reference: StudioRevisionReference
  ) throws {
    guard set.id == reference.setID else {
      throw StudioRevisionReferenceError.setIDMismatch(
        expectedSetID: reference.setID, currentSetID: set.id)
    }
    let currentURL = set.fileURL.standardizedFileURL
    guard currentURL == reference.setURL else {
      throw StudioRevisionReferenceError.setURLMismatch(
        expected: reference.setURL, current: currentURL)
    }
    guard StudioSetContentObservation(set: set) == reference.contentObservation else {
      throw StudioRevisionReferenceError.contentObservationChanged
    }
  }

  private typealias Member = (
    work: StudioWork, session: StudioSession, revision: StudioSetRevision
  )

  private func members(in catalog: WorkCatalog) -> [Member] {
    catalog.works.flatMap { work in
      work.sessions.flatMap { session in
        session.revisions.map { (work: work, session: session, revision: $0) }
      }
    }
  }

  private func captured(
    _ member: Member,
    catalog: WorkCatalog,
    catalogueGenerationID: String?,
    reviewedAt: Date
  ) throws -> ResolvedStudioRevisionReference {
    let setURL = member.revision.set.fileURL.standardizedFileURL
    guard
      let root = catalog.sourceRoots.map(\.standardizedFileURL).filter({ root in
        setURL.path == root.path || setURL.path.hasPrefix(root.path + "/")
      }).max(by: { $0.path.count < $1.path.count })
    else {
      throw StudioRevisionReferenceError.untrackedSetURL(setURL)
    }
    let reference = StudioRevisionReference(
      workID: member.work.id, sessionID: member.session.id, revisionID: member.revision.id,
      setID: member.revision.set.id, setURL: setURL, trackedRootURL: root,
      contentObservation: StudioSetContentObservation(set: member.revision.set),
      displaySnapshot: StudioRevisionDisplaySnapshot(
        artistName: member.work.artist.displayName, workName: member.work.displayName,
        sessionName: member.session.displayName,
        revisionName: member.revision.revisionLabel ?? member.revision.set.displayName),
      catalogueAlgorithmVersion: catalog.algorithmVersion,
      catalogueGenerationID: catalogueGenerationID ?? generationID(for: catalog),
      reviewedAt: reviewedAt)
    return ResolvedStudioRevisionReference(
      reference: reference, work: member.work, session: member.session,
      revision: member.revision)
  }

  private func generationID(for catalog: WorkCatalog) -> String {
    StableID.forValue(
      [
        "work-catalogue-generation", catalog.algorithmVersion,
        String(catalog.generatedAt.timeIntervalSince1970),
        catalog.sourceRoots.map { $0.standardizedFileURL.path }.sorted().joined(separator: "|"),
      ].joined(separator: ":"))
  }
}

/// Synchronous generation authority checked immediately before deterministic Live actions.
/// Organisation rebuilds invalidate the prior generation before their asynchronous work begins.
public final class StudioRevisionExecutionAuthority: @unchecked Sendable {
  private let lock = NSLock()
  private var generationID: String?
  private var catalog: WorkCatalog?

  public init(generationID: String? = nil) {
    self.generationID = generationID
  }

  public func activate(generationID: String, catalog: WorkCatalog? = nil) {
    lock.withLock {
      self.generationID = generationID
      self.catalog = catalog
    }
  }

  public func invalidate() {
    lock.withLock {
      generationID = nil
      catalog = nil
    }
  }

  public func capture(setURL: URL, reviewedAt: Date = Date()) throws
    -> ResolvedStudioRevisionReference
  {
    let active = lock.withLock { generationID.flatMap { id in catalog.map { (id, $0) } } }
    guard let active else { throw StudioRevisionReferenceError.catalogueRefreshInProgress }
    return try StudioRevisionReferenceResolver().capture(
      setURL: setURL, in: active.1, catalogueGenerationID: active.0,
      reviewedAt: reviewedAt)
  }

  public func resolve(_ reference: StudioRevisionReference) throws
    -> ResolvedStudioRevisionReference
  {
    let active = lock.withLock { generationID.flatMap { id in catalog.map { (id, $0) } } }
    guard let active else { throw StudioRevisionReferenceError.catalogueRefreshInProgress }
    return try StudioRevisionReferenceResolver().resolve(
      reference, in: active.1, catalogueGenerationID: active.0)
  }

  public func validate(plan: AbletonExportPlan, fileManager: FileManager = .default) throws {
    let active = lock.withLock { generationID.flatMap { id in catalog.map { (id, $0) } } }
    guard let active else { throw StudioRevisionReferenceError.catalogueRefreshInProgress }
    try AbletonExportPlanValidator().validate(
      plan, in: active.1, catalogueGenerationID: active.0, fileManager: fileManager)
  }

  public func authorize(
    plan: AbletonExportPlan,
    approval: AbletonExportApproval
  ) throws {
    guard let reference = plan.revisionReference,
      let current = lock.withLock({ generationID }),
      reference.catalogueGenerationID == current,
      approval.catalogueGenerationID == current
    else { throw StudioRevisionReferenceError.catalogueGenerationChanged }
  }
}
