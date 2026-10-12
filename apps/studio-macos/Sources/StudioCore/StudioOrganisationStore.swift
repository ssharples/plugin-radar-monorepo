import Darwin
import Foundation

public struct StudioArtistRecord: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let displayName: String
  public let createdAt: Date

  public init(id: String = UUID().uuidString, displayName: String, createdAt: Date = Date()) {
    self.id = id
    self.displayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    self.createdAt = createdAt
  }
}

public struct StudioWorkRecord: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let artistID: String
  public let displayName: String
  public let createdAt: Date

  public init(
    id: String = UUID().uuidString,
    artistID: String,
    displayName: String,
    createdAt: Date = Date()
  ) {
    self.id = id
    self.artistID = artistID
    self.displayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    self.createdAt = createdAt
  }
}

public struct StudioSessionAssignment: Codable, Identifiable, Sendable, Equatable {
  public let sessionID: String
  public let workID: String
  public let assignedAt: Date

  public var id: String { sessionID }

  public init(sessionID: String, workID: String, assignedAt: Date = Date()) {
    self.sessionID = sessionID
    self.workID = workID
    self.assignedAt = assignedAt
  }
}

public struct SessionContentMatchRejection: Codable, Identifiable, Sendable, Equatable {
  public let sessionID: String
  public let workID: String
  public let rejectedAt: Date

  public var id: String { "\(sessionID):\(workID)" }

  public init(sessionID: String, workID: String, rejectedAt: Date = Date()) {
    self.sessionID = sessionID
    self.workID = workID
    self.rejectedAt = rejectedAt
  }
}

public struct SessionContentReviewedActionOutboxRecord: Codable, Identifiable, Sendable, Equatable {
  public let decisionID: String
  public let observation: CalibrationObservationSnapshot
  public let label: CalibrationDecisionLabel
  public let reproductionFeatures: [CalibrationFeature]
  public let decidedAt: Date
  public let notes: String?
  public let enqueuedAt: Date
  public let lastAttemptAt: Date?
  public let lastFailure: String?

  public var id: String { decisionID }

  public init(
    decisionID: String,
    observation: CalibrationObservationSnapshot,
    label: CalibrationDecisionLabel,
    reproductionFeatures: [CalibrationFeature],
    decidedAt: Date,
    notes: String?,
    enqueuedAt: Date,
    lastAttemptAt: Date? = nil,
    lastFailure: String? = nil
  ) {
    self.decisionID = decisionID
    self.observation = observation
    self.label = label
    self.reproductionFeatures = reproductionFeatures.sorted {
      if $0.name != $1.name { return $0.name < $1.name }
      return $0.value < $1.value
    }
    self.decidedAt = decidedAt
    self.notes = notes
    self.enqueuedAt = enqueuedAt
    self.lastAttemptAt = lastAttemptAt
    self.lastFailure = lastFailure
  }

  fileprivate func recordingFailure(_ reason: String, attemptedAt: Date)
    -> SessionContentReviewedActionOutboxRecord
  {
    SessionContentReviewedActionOutboxRecord(
      decisionID: decisionID,
      observation: observation,
      label: label,
      reproductionFeatures: reproductionFeatures,
      decidedAt: decidedAt,
      notes: notes,
      enqueuedAt: enqueuedAt,
      lastAttemptAt: attemptedAt,
      lastFailure: reason)
  }
}

public struct StudioOrganisationDirectory: Codable, Sendable, Equatable {
  public let artists: [StudioArtistRecord]
  public let works: [StudioWorkRecord]
  public let sessionAssignments: [StudioSessionAssignment]
  public let contentMatchRejections: [SessionContentMatchRejection]
  public let contentReviewCandidates: [SessionContentReviewCandidate]
  public let contentAutomaticAssignments: [SessionContentAutomaticAssignment]
  public let pendingCalibrationReviewActions: [SessionContentReviewedActionOutboxRecord]
  public let contentIdentityCache: SessionContentIdentityCache
  public let contentCandidateIndexCache: SessionContentCandidateIndexCache?

  public init(
    artists: [StudioArtistRecord] = [],
    works: [StudioWorkRecord] = [],
    sessionAssignments: [StudioSessionAssignment] = [],
    contentMatchRejections: [SessionContentMatchRejection] = [],
    contentReviewCandidates: [SessionContentReviewCandidate] = [],
    contentAutomaticAssignments: [SessionContentAutomaticAssignment] = [],
    pendingCalibrationReviewActions: [SessionContentReviewedActionOutboxRecord] = [],
    contentIdentityCache: SessionContentIdentityCache = .init(),
    contentCandidateIndexCache: SessionContentCandidateIndexCache? = nil
  ) {
    self.artists = artists
    self.works = works
    self.sessionAssignments = sessionAssignments
    self.contentMatchRejections = contentMatchRejections
    self.contentReviewCandidates = contentReviewCandidates
    self.contentAutomaticAssignments = contentAutomaticAssignments
    self.pendingCalibrationReviewActions = pendingCalibrationReviewActions.sorted {
      if $0.enqueuedAt != $1.enqueuedAt { return $0.enqueuedAt < $1.enqueuedAt }
      return $0.decisionID < $1.decisionID
    }
    self.contentIdentityCache = contentIdentityCache
    self.contentCandidateIndexCache = contentCandidateIndexCache
  }

  private enum CodingKeys: String, CodingKey {
    case artists, works, sessionAssignments, contentMatchRejections, contentReviewCandidates
    case contentAutomaticAssignments, pendingCalibrationReviewActions, contentIdentityCache
    case contentCandidateIndexCache
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    artists = try container.decodeIfPresent([StudioArtistRecord].self, forKey: .artists) ?? []
    works = try container.decodeIfPresent([StudioWorkRecord].self, forKey: .works) ?? []
    sessionAssignments =
      try container.decodeIfPresent(
        [StudioSessionAssignment].self, forKey: .sessionAssignments) ?? []
    contentMatchRejections =
      try container.decodeIfPresent(
        [SessionContentMatchRejection].self, forKey: .contentMatchRejections) ?? []
    contentReviewCandidates =
      try container.decodeIfPresent(
        [SessionContentReviewCandidate].self, forKey: .contentReviewCandidates) ?? []
    contentAutomaticAssignments =
      try container.decodeIfPresent(
        [SessionContentAutomaticAssignment].self, forKey: .contentAutomaticAssignments) ?? []
    pendingCalibrationReviewActions =
      try container.decodeIfPresent(
        [SessionContentReviewedActionOutboxRecord].self,
        forKey: .pendingCalibrationReviewActions)?.sorted {
        if $0.enqueuedAt != $1.enqueuedAt { return $0.enqueuedAt < $1.enqueuedAt }
        return $0.decisionID < $1.decisionID
      } ?? []
    contentIdentityCache =
      try container.decodeIfPresent(
        SessionContentIdentityCache.self, forKey: .contentIdentityCache) ?? .init()
    // Candidate indexes are derived evidence. Legacy or malformed cache payloads fail closed and
    // are rebuilt once by the organisation engine without preventing the directory from loading.
    contentCandidateIndexCache = try? container.decodeIfPresent(
      SessionContentCandidateIndexCache.self, forKey: .contentCandidateIndexCache)
  }

  public var artistsByID: [String: StudioArtistRecord] {
    artists.reduce(into: [:]) { $0[$1.id] = $1 }
  }

  public var worksByID: [String: StudioWorkRecord] {
    works.reduce(into: [:]) { $0[$1.id] = $1 }
  }

  public var assignmentsBySessionID: [String: StudioSessionAssignment] {
    sessionAssignments.reduce(into: [:]) { $0[$1.sessionID] = $1 }
  }
}

public enum StudioOrganisationStoreError: Error, LocalizedError, Equatable {
  case invalidName
  case duplicateArtist(String)
  case missingArtist(String)
  case duplicateWork(String)
  case missingWork(String)
  case unsupportedSchema(Int)
  case coordinationFailed(Int32)
  case supersededOrganisation

  public var errorDescription: String? {
    switch self {
    case .invalidName: "Names cannot be empty."
    case .duplicateArtist(let name): "An Artist named \(name) already exists."
    case .missingArtist: "The selected Artist no longer exists."
    case .duplicateWork(let name): "This Artist already has a Song named \(name)."
    case .missingWork: "The selected Song no longer exists."
    case .unsupportedSchema(let schema):
      "The studio organisation database uses unsupported schema \(schema)."
    case .coordinationFailed(let code):
      "The studio organisation database could not be locked (errno \(code))."
    case .supersededOrganisation:
      "A newer studio organisation refresh superseded this result."
    }
  }
}

public actor StudioOrganisationStore {
  public let storageURL: URL
  private let organisationEngine: SessionContentOrganisationEngine
  private var latestOrganisationGeneration: UUID?
  private var organisationComputation: Task<SessionContentOrganisationResult, Error>?

  public init(
    storageURL: URL,
    organisationEngine: SessionContentOrganisationEngine = .init()
  ) {
    self.storageURL = storageURL
    self.organisationEngine = organisationEngine
  }

  public static func defaultStorageURL(fileManager: FileManager = .default) throws -> URL {
    let support = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    return
      support
      .appending(path: "Plugin Radar/Studio Time Machine", directoryHint: .isDirectory)
      .appending(path: "studio-organisation.plist")
  }

  public func beginOrganisation(generation: UUID) {
    latestOrganisationGeneration = generation
    organisationComputation?.cancel()
    organisationComputation = nil
  }

  public func load() throws -> StudioOrganisationDirectory {
    try withFileLock(exclusive: false) { try loadUnlocked() }
  }

  private func loadUnlocked() throws -> StudioOrganisationDirectory {
    guard FileManager.default.fileExists(atPath: storageURL.path) else {
      return StudioOrganisationDirectory()
    }
    let data = try Data(contentsOf: storageURL)
    let document = try PropertyListDecoder().decode(StudioOrganisationDocument.self, from: data)
    guard document.schemaVersion == StudioOrganisationDocument.currentSchemaVersion else {
      throw StudioOrganisationStoreError.unsupportedSchema(document.schemaVersion)
    }
    return document.directory
  }

  @discardableResult
  public func createArtist(displayName: String) throws -> StudioArtistRecord {
    let name = try validatedName(displayName)
    return try withFileLock(exclusive: true) {
      var directory = try loadUnlocked()
      if directory.artists.contains(where: {
        $0.displayName.caseInsensitiveCompare(name) == .orderedSame
      }) {
        throw StudioOrganisationStoreError.duplicateArtist(name)
      }
      let artist = StudioArtistRecord(displayName: name)
      directory = StudioOrganisationDirectory(
        artists: (directory.artists + [artist]).sorted(by: artistSort),
        works: directory.works,
        sessionAssignments: directory.sessionAssignments,
        contentMatchRejections: directory.contentMatchRejections,
        contentReviewCandidates: directory.contentReviewCandidates,
        contentAutomaticAssignments: directory.contentAutomaticAssignments,
        pendingCalibrationReviewActions: directory.pendingCalibrationReviewActions,
        contentIdentityCache: directory.contentIdentityCache,
        contentCandidateIndexCache: directory.contentCandidateIndexCache
      )
      try saveUnlocked(directory)
      return artist
    }
  }

  @discardableResult
  public func createWork(artistID: String, displayName: String) throws -> StudioWorkRecord {
    let name = try validatedName(displayName)
    return try withFileLock(exclusive: true) {
      var directory = try loadUnlocked()
      guard directory.artists.contains(where: { $0.id == artistID }) else {
        throw StudioOrganisationStoreError.missingArtist(artistID)
      }
      if directory.works.contains(where: {
        $0.artistID == artistID && $0.displayName.caseInsensitiveCompare(name) == .orderedSame
      }) {
        throw StudioOrganisationStoreError.duplicateWork(name)
      }
      let work = StudioWorkRecord(artistID: artistID, displayName: name)
      directory = StudioOrganisationDirectory(
        artists: directory.artists,
        works: (directory.works + [work]).sorted(by: workSort),
        sessionAssignments: directory.sessionAssignments,
        contentMatchRejections: directory.contentMatchRejections,
        contentReviewCandidates: directory.contentReviewCandidates,
        contentAutomaticAssignments: directory.contentAutomaticAssignments,
        pendingCalibrationReviewActions: directory.pendingCalibrationReviewActions,
        contentIdentityCache: directory.contentIdentityCache,
        contentCandidateIndexCache: directory.contentCandidateIndexCache
      )
      try saveUnlocked(directory)
      return work
    }
  }

  @discardableResult
  public func assign(sessionID: String, to workID: String) throws -> StudioSessionAssignment {
    invalidateOrganisationForAuthorityChange()
    return try withFileLock(exclusive: true) {
      var directory = try loadUnlocked()
      guard directory.works.contains(where: { $0.id == workID }) else {
        throw StudioOrganisationStoreError.missingWork(workID)
      }
      let assignment = StudioSessionAssignment(sessionID: sessionID, workID: workID)
      directory = StudioOrganisationDirectory(
        artists: directory.artists,
        works: directory.works,
        sessionAssignments: (directory.sessionAssignments.filter { $0.sessionID != sessionID }
          + [assignment]).sorted { $0.sessionID < $1.sessionID },
        contentMatchRejections: directory.contentMatchRejections.filter {
          $0.sessionID != sessionID
        },
        contentReviewCandidates: directory.contentReviewCandidates.filter {
          $0.sessionID != sessionID
        },
        contentAutomaticAssignments: directory.contentAutomaticAssignments.filter {
          $0.sessionID != sessionID
        },
        pendingCalibrationReviewActions: directory.pendingCalibrationReviewActions,
        contentIdentityCache: directory.contentIdentityCache,
        contentCandidateIndexCache: directory.contentCandidateIndexCache
      )
      try saveUnlocked(directory)
      return assignment
    }
  }

  @discardableResult
  public func removeAssignment(sessionID: String) throws -> StudioOrganisationDirectory {
    invalidateOrganisationForAuthorityChange()
    return try withFileLock(exclusive: true) {
      let directory = try loadUnlocked()
      let next = StudioOrganisationDirectory(
        artists: directory.artists,
        works: directory.works,
        sessionAssignments: directory.sessionAssignments.filter { $0.sessionID != sessionID },
        contentMatchRejections: directory.contentMatchRejections,
        contentReviewCandidates: directory.contentReviewCandidates,
        contentAutomaticAssignments: directory.contentAutomaticAssignments,
        pendingCalibrationReviewActions: directory.pendingCalibrationReviewActions,
        contentIdentityCache: directory.contentIdentityCache,
        contentCandidateIndexCache: directory.contentCandidateIndexCache
      )
      try saveUnlocked(next)
      return next
    }
  }

  @discardableResult
  public func rejectContentMatch(_ rejection: SessionContentMatchRejection) throws
    -> StudioOrganisationDirectory
  {
    invalidateOrganisationForAuthorityChange()
    return try withFileLock(exclusive: true) {
      let directory = try loadUnlocked()
      let next = StudioOrganisationDirectory(
        artists: directory.artists,
        works: directory.works,
        sessionAssignments: directory.sessionAssignments,
        contentMatchRejections: (directory.contentMatchRejections.filter { $0.id != rejection.id }
          + [rejection]).sorted { $0.id < $1.id },
        contentReviewCandidates: directory.contentReviewCandidates.filter {
          !($0.sessionID == rejection.sessionID && $0.candidateWorkID == rejection.workID)
        },
        contentAutomaticAssignments: directory.contentAutomaticAssignments.filter {
          !($0.sessionID == rejection.sessionID && $0.workID == rejection.workID)
        },
        pendingCalibrationReviewActions: directory.pendingCalibrationReviewActions,
        contentIdentityCache: directory.contentIdentityCache,
        contentCandidateIndexCache: directory.contentCandidateIndexCache)
      try saveUnlocked(next)
      return next
    }
  }

  @discardableResult
  public func applyReviewedActionAuthority(
    reviewCandidateID: String,
    expectedObservation: CalibrationObservationSnapshot,
    action: SessionContentReviewedAction,
    outboxRecord: SessionContentReviewedActionOutboxRecord
  ) throws -> StudioOrganisationDirectory {
    invalidateOrganisationForAuthorityChange()
    return try withFileLock(exclusive: true) {
      let directory = try loadUnlocked()
      if let existing = directory.pendingCalibrationReviewActions.first(where: {
        $0.decisionID == outboxRecord.decisionID
      }) {
        guard existing == outboxRecord else {
          throw SessionContentReviewedActionError.pendingDecisionConflict(outboxRecord.decisionID)
        }
        return directory
      }
      guard
        let candidate = directory.contentReviewCandidates.first(where: {
          $0.id == reviewCandidateID
        })
      else {
        throw SessionContentReviewedActionError.missingReviewCandidate(reviewCandidateID)
      }
      let currentObservation = CalibrationObservationSnapshot.from(reviewCandidate: candidate)
      guard currentObservation == expectedObservation else {
        throw SessionContentReviewedActionError.staleReviewCandidate(reviewCandidateID)
      }
      guard outboxRecord.observation == expectedObservation else {
        throw SessionContentReviewedActionError.pendingObservationMismatch(outboxRecord.decisionID)
      }

      var assignments = directory.sessionAssignments
      var rejections = directory.contentMatchRejections
      var reviews = directory.contentReviewCandidates
      var automatic = directory.contentAutomaticAssignments
      switch action {
      case .accept:
        guard outboxRecord.label == .sameSong else {
          throw SessionContentReviewedActionError.pendingObservationMismatch(
            outboxRecord.decisionID)
        }
        try validateWork(candidate.candidateWorkID, in: directory)
        assignments = replacingAssignment(
          sessionID: candidate.sessionID,
          workID: candidate.candidateWorkID,
          assignedAt: outboxRecord.decidedAt,
          in: assignments)
        rejections.removeAll { $0.sessionID == candidate.sessionID }
        reviews.removeAll { $0.sessionID == candidate.sessionID }
        automatic.removeAll { $0.sessionID == candidate.sessionID }
      case .keepSeparate:
        guard outboxRecord.label == .keepSeparate else {
          throw SessionContentReviewedActionError.pendingObservationMismatch(
            outboxRecord.decisionID)
        }
        applyRejection(
          candidate: candidate,
          rejectedAt: outboxRecord.decidedAt,
          rejections: &rejections,
          reviews: &reviews,
          automatic: &automatic)
      case .assignElsewhere(let workID):
        guard outboxRecord.label == .assignedElsewhere else {
          throw SessionContentReviewedActionError.pendingObservationMismatch(
            outboxRecord.decisionID)
        }
        try validateWork(workID, in: directory)
        assignments = replacingAssignment(
          sessionID: candidate.sessionID,
          workID: workID,
          assignedAt: outboxRecord.decidedAt,
          in: assignments)
        rejections.removeAll { $0.sessionID == candidate.sessionID }
        reviews.removeAll { $0.sessionID == candidate.sessionID }
        automatic.removeAll { $0.sessionID == candidate.sessionID }
      case .reject:
        guard outboxRecord.label == .rejected else {
          throw SessionContentReviewedActionError.pendingObservationMismatch(
            outboxRecord.decisionID)
        }
        applyRejection(
          candidate: candidate,
          rejectedAt: outboxRecord.decidedAt,
          rejections: &rejections,
          reviews: &reviews,
          automatic: &automatic)
      }

      let next = StudioOrganisationDirectory(
        artists: directory.artists,
        works: directory.works,
        sessionAssignments: assignments,
        contentMatchRejections: rejections,
        contentReviewCandidates: reviews,
        contentAutomaticAssignments: automatic,
        pendingCalibrationReviewActions: directory.pendingCalibrationReviewActions
          + [outboxRecord],
        contentIdentityCache: directory.contentIdentityCache,
        contentCandidateIndexCache: directory.contentCandidateIndexCache)
      try saveUnlocked(next)
      return next
    }
  }

  public func clearPendingCalibrationDecision(_ decisionID: String) throws {
    try withFileLock(exclusive: true) {
      let directory = try loadUnlocked()
      guard
        directory.pendingCalibrationReviewActions.contains(where: {
          $0.decisionID == decisionID
        })
      else { return }
      try saveUnlocked(
        StudioOrganisationDirectory(
          artists: directory.artists,
          works: directory.works,
          sessionAssignments: directory.sessionAssignments,
          contentMatchRejections: directory.contentMatchRejections,
          contentReviewCandidates: directory.contentReviewCandidates,
          contentAutomaticAssignments: directory.contentAutomaticAssignments,
          pendingCalibrationReviewActions: directory.pendingCalibrationReviewActions.filter {
            $0.decisionID != decisionID
          },
          contentIdentityCache: directory.contentIdentityCache,
          contentCandidateIndexCache: directory.contentCandidateIndexCache))
    }
  }

  public func recordPendingCalibrationFailure(
    decisionID: String,
    reason: String,
    attemptedAt: Date
  ) throws {
    try withFileLock(exclusive: true) {
      let directory = try loadUnlocked()
      guard
        directory.pendingCalibrationReviewActions.contains(where: {
          $0.decisionID == decisionID
        })
      else { return }
      try saveUnlocked(
        StudioOrganisationDirectory(
          artists: directory.artists,
          works: directory.works,
          sessionAssignments: directory.sessionAssignments,
          contentMatchRejections: directory.contentMatchRejections,
          contentReviewCandidates: directory.contentReviewCandidates,
          contentAutomaticAssignments: directory.contentAutomaticAssignments,
          pendingCalibrationReviewActions: directory.pendingCalibrationReviewActions.map {
            $0.decisionID == decisionID
              ? $0.recordingFailure(reason, attemptedAt: attemptedAt) : $0
          },
          contentIdentityCache: directory.contentIdentityCache,
          contentCandidateIndexCache: directory.contentCandidateIndexCache))
    }
  }

  public func organiseByContent(
    indexes: [StudioLibraryIndex],
    overrides: OrganisationOverrides = .init(),
    calibration: AudioMatchingCalibration?,
    generatedAt: Date = Date()
  ) async throws -> SessionContentOrganisationResult {
    let generation = UUID()
    beginOrganisation(generation: generation)
    return try await organiseByContent(
      indexes: indexes, overrides: overrides, calibration: calibration,
      generation: generation, generatedAt: generatedAt)
  }

  public func organiseByContent(
    indexes: [StudioLibraryIndex],
    overrides: OrganisationOverrides = .init(),
    calibration: AudioMatchingCalibration?,
    generation: UUID,
    generatedAt: Date = Date()
  ) async throws -> SessionContentOrganisationResult {
    guard latestOrganisationGeneration == generation else {
      throw StudioOrganisationStoreError.supersededOrganisation
    }
    let directory = try load()
    let engine = organisationEngine
    let computation = Task.detached(priority: .utility) {
      try engine.organise(
        indexes: indexes, overrides: overrides, directory: directory,
        calibration: calibration, identityCache: directory.contentIdentityCache,
        generatedAt: generatedAt)
    }
    organisationComputation = computation
    let result = try await withTaskCancellationHandler {
      try await computation.value
    } onCancel: {
      computation.cancel()
    }
    try Task.checkCancellation()
    guard latestOrganisationGeneration == generation else {
      throw StudioOrganisationStoreError.supersededOrganisation
    }
    organisationComputation = nil
    return try withFileLock(exclusive: true) {
      try Task.checkCancellation()
      guard latestOrganisationGeneration == generation else {
        throw StudioOrganisationStoreError.supersededOrganisation
      }
      let current = try loadUnlocked()
      let effectiveResult: SessionContentOrganisationResult
      if authority(in: current, differsFrom: directory) {
        try Task.checkCancellation()
        effectiveResult = try engine.organise(
          indexes: indexes, overrides: overrides, directory: current,
          calibration: calibration, identityCache: result.manifestBuild.identityCache,
          generatedAt: generatedAt)
      } else {
        effectiveResult = result
      }
      try Task.checkCancellation()
      guard latestOrganisationGeneration == generation else {
        throw StudioOrganisationStoreError.supersededOrganisation
      }
      let manuallyAssigned = Set(current.sessionAssignments.map(\.sessionID))
      let rejectedPairs = Set(current.contentMatchRejections.map(\.id))
      let next = StudioOrganisationDirectory(
        artists: current.artists,
        works: current.works,
        sessionAssignments: current.sessionAssignments,
        contentMatchRejections: current.contentMatchRejections,
        contentReviewCandidates: effectiveResult.contentReviewCandidates.filter {
          !manuallyAssigned.contains($0.sessionID)
            && !rejectedPairs.contains("\($0.sessionID):\($0.candidateWorkID)")
        },
        contentAutomaticAssignments: effectiveResult.automaticAssignments.filter {
          !manuallyAssigned.contains($0.sessionID)
            && !rejectedPairs.contains("\($0.sessionID):\($0.workID)")
        },
        pendingCalibrationReviewActions: current.pendingCalibrationReviewActions,
        contentIdentityCache: effectiveResult.manifestBuild.identityCache,
        contentCandidateIndexCache: effectiveResult.candidateIndexCache)
      try saveUnlocked(next)
      return effectiveResult
    }
  }

  private func invalidateOrganisationForAuthorityChange() {
    latestOrganisationGeneration = nil
    organisationComputation?.cancel()
    organisationComputation = nil
  }

  private func authority(
    in current: StudioOrganisationDirectory,
    differsFrom initial: StudioOrganisationDirectory
  ) -> Bool {
    current.artists != initial.artists
      || current.works != initial.works
      || current.sessionAssignments != initial.sessionAssignments
      || current.contentMatchRejections != initial.contentMatchRejections
  }

  private func saveUnlocked(_ directory: StudioOrganisationDirectory) throws {
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    let data = try encoder.encode(StudioOrganisationDocument(directory: directory))
    try FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try data.write(to: storageURL, options: .atomic)
  }

  private func withFileLock<T>(exclusive: Bool, _ body: () throws -> T) throws -> T {
    let processLock = StudioOrganisationProcessLockRegistry.shared.lock(for: storageURL.path)
    processLock.lock()
    defer { processLock.unlock() }
    try FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    let lockURL = storageURL.appendingPathExtension("lock")
    let descriptor = Darwin.open(lockURL.path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else { throw StudioOrganisationStoreError.coordinationFailed(errno) }
    defer { Darwin.close(descriptor) }
    guard flock(descriptor, exclusive ? LOCK_EX : LOCK_SH) == 0 else {
      throw StudioOrganisationStoreError.coordinationFailed(errno)
    }
    defer { flock(descriptor, LOCK_UN) }
    return try body()
  }

  private func validatedName(_ value: String) throws -> String {
    let name = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { throw StudioOrganisationStoreError.invalidName }
    return name
  }

  private func validateWork(
    _ workID: String,
    in directory: StudioOrganisationDirectory
  ) throws {
    guard directory.works.contains(where: { $0.id == workID }) else {
      throw StudioOrganisationStoreError.missingWork(workID)
    }
  }

  private func replacingAssignment(
    sessionID: String,
    workID: String,
    assignedAt: Date,
    in assignments: [StudioSessionAssignment]
  ) -> [StudioSessionAssignment] {
    (assignments.filter { $0.sessionID != sessionID }
      + [StudioSessionAssignment(sessionID: sessionID, workID: workID, assignedAt: assignedAt)])
      .sorted { $0.sessionID < $1.sessionID }
  }

  private func applyRejection(
    candidate: SessionContentReviewCandidate,
    rejectedAt: Date,
    rejections: inout [SessionContentMatchRejection],
    reviews: inout [SessionContentReviewCandidate],
    automatic: inout [SessionContentAutomaticAssignment]
  ) {
    let rejection = SessionContentMatchRejection(
      sessionID: candidate.sessionID,
      workID: candidate.candidateWorkID,
      rejectedAt: rejectedAt)
    rejections = (rejections.filter { $0.id != rejection.id } + [rejection]).sorted {
      $0.id < $1.id
    }
    reviews.removeAll {
      $0.sessionID == candidate.sessionID && $0.candidateWorkID == candidate.candidateWorkID
    }
    automatic.removeAll {
      $0.sessionID == candidate.sessionID && $0.workID == candidate.candidateWorkID
    }
  }

  private func artistSort(_ left: StudioArtistRecord, _ right: StudioArtistRecord) -> Bool {
    left.displayName.localizedStandardCompare(right.displayName) == .orderedAscending
  }

  private func workSort(_ left: StudioWorkRecord, _ right: StudioWorkRecord) -> Bool {
    if left.artistID != right.artistID { return left.artistID < right.artistID }
    return left.displayName.localizedStandardCompare(right.displayName) == .orderedAscending
  }
}

public enum SessionContentReviewedAction: Sendable, Equatable {
  case accept
  case keepSeparate
  case assignElsewhere(workID: String)
  case reject
}

public struct SessionContentReviewedActionRequest: Sendable, Equatable {
  public let reviewCandidateID: String
  public let expectedObservation: CalibrationObservationSnapshot?
  public let action: SessionContentReviewedAction
  public let decisionID: String
  public let decidedAt: Date
  public let notes: String?

  public init(
    reviewCandidateID: String,
    expectedObservation: CalibrationObservationSnapshot,
    action: SessionContentReviewedAction,
    decisionID: String,
    decidedAt: Date = Date(),
    notes: String? = nil
  ) {
    self.reviewCandidateID = reviewCandidateID
    self.expectedObservation = expectedObservation
    self.action = action
    self.decisionID = decisionID
    self.decidedAt = decidedAt
    self.notes = notes
  }

  @available(
    *, deprecated,
    message: "Pass the complete observation snapshot shown with the review candidate."
  )
  public init(
    reviewCandidateID: String,
    action: SessionContentReviewedAction,
    decisionID: String,
    decidedAt: Date = Date(),
    notes: String? = nil
  ) {
    self.reviewCandidateID = reviewCandidateID
    expectedObservation = nil
    self.action = action
    self.decisionID = decisionID
    self.decidedAt = decidedAt
    self.notes = notes
  }
}

public enum SessionContentReviewedActionError: Error, LocalizedError, Equatable {
  case missingReviewCandidate(String)
  case staleReviewCandidate(String)
  case missingPendingDecision(String)
  case pendingDecisionConflict(String)
  case pendingObservationMismatch(String)
  case calibrationDecisionConflict(String)
  case calibrationWriteFailed(decisionID: String, reason: String)

  public var errorDescription: String? {
    switch self {
    case .missingReviewCandidate(let id):
      "Content review candidate \(id) no longer exists."
    case .staleReviewCandidate(let id):
      "Content review candidate \(id) changed since it was shown. No organisation or calibration action was saved."
    case .missingPendingDecision(let id):
      "Pending calibration decision \(id) no longer exists."
    case .pendingDecisionConflict(let id):
      "Pending calibration decision \(id) conflicts with a different local action."
    case .pendingObservationMismatch(let id):
      "Pending calibration decision \(id) does not match the reviewed content observation."
    case .calibrationDecisionConflict(let id):
      "Calibration decision \(id) already exists with different observation-bound evidence."
    case .calibrationWriteFailed(let decisionID, let reason):
      "Organisation action was saved, but calibration decision \(decisionID) failed: \(reason)"
    }
  }
}

public actor SessionContentReviewedActionService {
  private let organisationStore: StudioOrganisationStore
  private let calibrationStore: CalibrationReviewStore
  private let beforeAuthorityMutation: (@Sendable () async throws -> Void)?
  private let beforeCalibrationAppend: (@Sendable () async -> Void)?

  public init(
    organisationStore: StudioOrganisationStore,
    calibrationStore: CalibrationReviewStore
  ) {
    self.organisationStore = organisationStore
    self.calibrationStore = calibrationStore
    beforeAuthorityMutation = nil
    beforeCalibrationAppend = nil
  }

  init(
    organisationStore: StudioOrganisationStore,
    calibrationStore: CalibrationReviewStore,
    beforeAuthorityMutation: @escaping @Sendable () async throws -> Void
  ) {
    self.organisationStore = organisationStore
    self.calibrationStore = calibrationStore
    self.beforeAuthorityMutation = beforeAuthorityMutation
    beforeCalibrationAppend = nil
  }

  init(
    organisationStore: StudioOrganisationStore,
    calibrationStore: CalibrationReviewStore,
    beforeCalibrationAppend: @escaping @Sendable () async -> Void
  ) {
    self.organisationStore = organisationStore
    self.calibrationStore = calibrationStore
    beforeAuthorityMutation = nil
    self.beforeCalibrationAppend = beforeCalibrationAppend
  }

  @discardableResult
  public func apply(
    _ request: SessionContentReviewedActionRequest
  ) async throws -> CalibrationReviewDecisionRecord {
    guard let expectedObservation = request.expectedObservation else {
      throw SessionContentReviewedActionError.staleReviewCandidate(request.reviewCandidateID)
    }
    let directory = try await organisationStore.load()
    guard
      let candidate = directory.contentReviewCandidates.first(where: {
        $0.id == request.reviewCandidateID
      })
    else {
      throw SessionContentReviewedActionError.missingReviewCandidate(request.reviewCandidateID)
    }
    let currentObservation = CalibrationObservationSnapshot.from(reviewCandidate: candidate)
    guard currentObservation == expectedObservation else {
      throw SessionContentReviewedActionError.staleReviewCandidate(request.reviewCandidateID)
    }
    let label: CalibrationDecisionLabel
    let targetWorkID: String?
    switch request.action {
    case .accept:
      label = .sameSong
      targetWorkID = candidate.candidateWorkID
    case .keepSeparate:
      label = .keepSeparate
      targetWorkID = nil
    case .assignElsewhere(let workID):
      label = .assignedElsewhere
      targetWorkID = workID
    case .reject:
      label = .rejected
      targetWorkID = nil
    }
    let outboxRecord = SessionContentReviewedActionOutboxRecord(
      decisionID: request.decisionID,
      observation: expectedObservation,
      label: label,
      reproductionFeatures: reviewedActionFeatures(
        request.action,
        candidate: candidate,
        targetWorkID: targetWorkID),
      decidedAt: request.decidedAt,
      notes: request.notes,
      enqueuedAt: request.decidedAt)
    if let beforeAuthorityMutation { try await beforeAuthorityMutation() }
    _ = try await organisationStore.applyReviewedActionAuthority(
      reviewCandidateID: candidate.id,
      expectedObservation: expectedObservation,
      action: request.action,
      outboxRecord: outboxRecord)
    return try await deliverRecordingFailure(outboxRecord)
  }

  @discardableResult
  public func retryPendingCalibrationDecision(
    _ decisionID: String
  ) async throws -> CalibrationReviewDecisionRecord {
    let directory = try await organisationStore.load()
    guard
      let pending = directory.pendingCalibrationReviewActions.first(where: {
        $0.decisionID == decisionID
      })
    else { throw SessionContentReviewedActionError.missingPendingDecision(decisionID) }
    return try await deliverRecordingFailure(pending)
  }

  @discardableResult
  public func retryPendingCalibrationActions() async throws -> [CalibrationReviewDecisionRecord] {
    let pending = try await organisationStore.load().pendingCalibrationReviewActions
    var delivered: [CalibrationReviewDecisionRecord] = []
    for record in pending {
      delivered.append(try await deliverRecordingFailure(record))
    }
    return delivered
  }

  private func deliverRecordingFailure(
    _ pending: SessionContentReviewedActionOutboxRecord
  ) async throws -> CalibrationReviewDecisionRecord {
    do {
      return try await deliver(pending)
    } catch {
      try? await organisationStore.recordPendingCalibrationFailure(
        decisionID: pending.decisionID,
        reason: String(describing: error),
        attemptedAt: Date())
      if let reviewedError = error as? SessionContentReviewedActionError {
        throw reviewedError
      }
      throw SessionContentReviewedActionError.calibrationWriteFailed(
        decisionID: pending.decisionID,
        reason: String(describing: error))
    }
  }

  private func deliver(
    _ pending: SessionContentReviewedActionOutboxRecord
  ) async throws -> CalibrationReviewDecisionRecord {
    let calibrationDirectory = try await calibrationStore.reload()
    if let existing = calibrationDirectory.decisions.first(where: {
      $0.id == pending.decisionID
    }) {
      let expected = calibrationDecisionDraft(
        for: pending,
        supersedesDecisionID: existing.supersedesDecisionID)
      return try await acceptEquivalentDecision(
        existing,
        for: pending,
        expected: expected,
        in: calibrationDirectory)
    }

    let draft = calibrationDecisionDraft(for: pending, in: calibrationDirectory)
    if let beforeCalibrationAppend { await beforeCalibrationAppend() }
    do {
      let delivered = try await calibrationStore.append(
        draft,
        registry: CalibrationObservationRegistry(observations: [pending.observation]))
      try await organisationStore.clearPendingCalibrationDecision(pending.decisionID)
      return delivered
    } catch CalibrationReviewStoreError.duplicateDecision(let decisionID)
      where decisionID == pending.decisionID
    {
      let reloaded = try await calibrationStore.reload()
      guard let racedDecision = reloaded.decisions.first(where: { $0.id == decisionID }) else {
        throw CalibrationReviewStoreError.duplicateDecision(decisionID)
      }
      return try await acceptEquivalentDecision(
        racedDecision,
        for: pending,
        expected: draft,
        in: reloaded)
    }
  }

  private func calibrationDecisionDraft(
    for pending: SessionContentReviewedActionOutboxRecord,
    in directory: CalibrationReviewDirectory
  ) -> CalibrationReviewDecisionDraft {
    let prior = directory.decisions
      .filter {
        $0.id != pending.decisionID
          && $0.primaryObservationID == pending.observation.id
          && $0.isActive
      }
      .max {
        $0.decidedAt < $1.decidedAt
          || ($0.decidedAt == $1.decidedAt && $0.id < $1.id)
      }
    return calibrationDecisionDraft(for: pending, supersedesDecisionID: prior?.id)
  }

  private func calibrationDecisionDraft(
    for pending: SessionContentReviewedActionOutboxRecord,
    supersedesDecisionID: String?
  ) -> CalibrationReviewDecisionDraft {
    CalibrationReviewDecisionDraft(
      id: pending.decisionID,
      label: pending.label,
      primaryObservationID: pending.observation.id,
      observationInputs: [
        CalibrationObservationInput(
          observationID: pending.observation.id,
          expectedFeatureDigest: pending.observation.featureDigest)
      ],
      algorithmFamily: pending.observation.algorithmFamily,
      algorithmVersion: pending.observation.algorithmVersion,
      calibrationID: pending.observation.calibrationID,
      reproductionFeatures: pending.reproductionFeatures,
      decidedAt: pending.decidedAt,
      notes: pending.notes,
      supersedesDecisionID: supersedesDecisionID)
  }

  private func acceptEquivalentDecision(
    _ existing: CalibrationReviewDecisionRecord,
    for pending: SessionContentReviewedActionOutboxRecord,
    expected draft: CalibrationReviewDecisionDraft,
    in directory: CalibrationReviewDirectory
  ) async throws -> CalibrationReviewDecisionRecord {
    guard
      isEquivalent(
        existing,
        to: draft,
        observation: pending.observation,
        in: directory)
    else {
      throw SessionContentReviewedActionError.calibrationDecisionConflict(pending.decisionID)
    }
    try await organisationStore.clearPendingCalibrationDecision(pending.decisionID)
    return existing
  }

  private func isEquivalent(
    _ existing: CalibrationReviewDecisionRecord,
    to draft: CalibrationReviewDecisionDraft,
    observation: CalibrationObservationSnapshot,
    in directory: CalibrationReviewDirectory
  ) -> Bool {
    let payloadMatches =
      existing.id == draft.id
      && existing.label == draft.label
      && existing.primaryObservationID == draft.primaryObservationID
      && existing.observations == [observation]
      && existing.algorithmFamily == draft.algorithmFamily
      && existing.algorithmVersion == draft.algorithmVersion
      && existing.calibrationID == draft.calibrationID
      && existing.reproductionFeatures == draft.reproductionFeatures
      && existing.decidedAt == draft.decidedAt
      && existing.corpusPartition == draft.corpusPartition
      && existing.notes == draft.notes
      && existing.supersedesDecisionID == draft.supersedesDecisionID
    guard payloadMatches else { return false }
    guard let supersedesDecisionID = existing.supersedesDecisionID else { return true }
    guard
      let superseded = directory.decisions.first(where: { $0.id == supersedesDecisionID })
    else { return false }
    return superseded.family == existing.family
      && superseded.primaryObservationID == existing.primaryObservationID
      && superseded.supersededByDecisionID == existing.id
      && superseded.supersededAt == existing.decidedAt
  }

  private func reviewedActionFeatures(
    _ action: SessionContentReviewedAction,
    candidate: SessionContentReviewCandidate,
    targetWorkID: String?
  ) -> [CalibrationFeature] {
    let actionName: String =
      switch action {
      case .accept: "accept"
      case .keepSeparate: "keepSeparate"
      case .assignElsewhere: "assignElsewhere"
      case .reject: "reject"
      }
    return [
      CalibrationFeature(name: "reviewAction", value: actionName),
      CalibrationFeature(name: "reviewCandidateID", value: candidate.id),
      CalibrationFeature(name: "sessionID", value: candidate.sessionID),
      CalibrationFeature(name: "suggestedWorkID", value: candidate.candidateWorkID),
      CalibrationFeature(name: "targetWorkID", value: targetWorkID ?? "none"),
      CalibrationFeature(
        name: "candidateGenerationToken",
        value: candidate.candidateGeneration?.invalidationToken ?? "none"),
    ]
  }
}

private final class StudioOrganisationProcessLockRegistry: @unchecked Sendable {
  static let shared = StudioOrganisationProcessLockRegistry()

  private let registryLock = NSLock()
  private var locksByPath: [String: NSRecursiveLock] = [:]

  func lock(for path: String) -> NSRecursiveLock {
    registryLock.lock()
    defer { registryLock.unlock() }
    if let existing = locksByPath[path] { return existing }
    let created = NSRecursiveLock()
    locksByPath[path] = created
    return created
  }
}

private struct StudioOrganisationDocument: Codable {
  static let currentSchemaVersion = 1
  var schemaVersion = currentSchemaVersion
  let directory: StudioOrganisationDirectory
}
