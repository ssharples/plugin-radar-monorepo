import AVFoundation
import Foundation

public struct SessionContentIdentityCacheEntry: Codable, Sendable, Equatable {
  public let fileURL: URL
  public let bytes: Int64
  public let modifiedAt: Date?
  public let contentIdentity: String
  public let modifiedAtNanoseconds: Int64?
  public let resourceIdentity: String?

  public init(
    fileURL: URL, bytes: Int64, modifiedAt: Date?, contentIdentity: String,
    modifiedAtNanoseconds: Int64? = nil, resourceIdentity: String? = nil
  ) {
    self.fileURL = fileURL.standardizedFileURL
    self.bytes = bytes
    self.modifiedAt = modifiedAt
    self.contentIdentity = contentIdentity
    self.modifiedAtNanoseconds =
      modifiedAtNanoseconds ?? modifiedAt.map { Int64($0.timeIntervalSince1970 * 1_000_000_000) }
    self.resourceIdentity = resourceIdentity
  }
}

public struct SessionContentIdentityCache: Codable, Sendable, Equatable {
  public let entries: [SessionContentIdentityCacheEntry]

  public init(entries: [SessionContentIdentityCacheEntry] = []) { self.entries = entries }
}

public struct SessionContentManifestBuildConfiguration: Sendable, Equatable {
  public let maximumHashedFileBytes: Int64
  public let maximumTotalHashedBytes: Int64
  public let evidenceScope: SessionContentEvidenceScope
  public let audioDurationPolicy: SessionContentAudioDurationPolicy

  public init(
    maximumHashedFileBytes: Int64 = 64 * 1_024 * 1_024,
    maximumTotalHashedBytes: Int64 = 256 * 1_024 * 1_024,
    evidenceScope: SessionContentEvidenceScope = .activeRevision,
    audioDurationPolicy: SessionContentAudioDurationPolicy = .completeFile
  ) {
    self.maximumHashedFileBytes = max(0, maximumHashedFileBytes)
    self.maximumTotalHashedBytes = max(0, maximumTotalHashedBytes)
    self.evidenceScope = evidenceScope
    self.audioDurationPolicy = audioDurationPolicy
  }
}

public struct SessionContentManifestBuildResult: Sendable, Equatable {
  public let manifests: [SessionContentManifest]
  public let identityCache: SessionContentIdentityCache
  public let corpusFrequency: [String: Int]
  public let hashedFileCount: Int
  public let reusedIdentityCount: Int
  public let skippedHashCount: Int

  public init(
    manifests: [SessionContentManifest], identityCache: SessionContentIdentityCache,
    corpusFrequency: [String: Int], hashedFileCount: Int, reusedIdentityCount: Int,
    skippedHashCount: Int
  ) {
    self.manifests = manifests
    self.identityCache = identityCache
    self.corpusFrequency = corpusFrequency
    self.hashedFileCount = hashedFileCount
    self.reusedIdentityCount = reusedIdentityCount
    self.skippedHashCount = skippedHashCount
  }
}

public struct SessionContentManifestBuilder: Sendable {
  public let configuration: SessionContentManifestBuildConfiguration
  public let fileAccess: any SessionContentFileAccess

  public init(
    configuration: SessionContentManifestBuildConfiguration = .init(),
    fileAccess: any SessionContentFileAccess = LocalSessionContentFileAccess()
  ) {
    self.configuration = configuration
    self.fileAccess = fileAccess
  }

  public func build(
    indexes: [StudioLibraryIndex],
    artistIDsBySessionID: [String: String?] = [:],
    selectedRevisionIDsBySessionID: [String: String] = [:],
    cache: SessionContentIdentityCache = .init()
  ) throws -> SessionContentManifestBuildResult {
    try Task.checkCancellation()
    var cacheByPath: [String: SessionContentIdentityCacheEntry] = [:]
    for entry in cache.entries.sorted(by: cacheEntrySort) {
      cacheByPath[entry.fileURL.path] = entry
    }
    var anchorsBySession: [String: [SessionContentAnchor]] = [:]
    var revisionIdentitiesBySession: [String: [String]] = [:]
    var revisionIDsBySession: [String: [String]] = [:]
    var hashedBytes: Int64 = 0
    var hashedFileCount = 0
    var reusedIdentityCount = 0
    var skippedHashCount = 0

    let projects = deduplicatedProjects(indexes)
    for project in projects {
      try Task.checkCancellation()
      let evidenceSets = scopedSets(
        in: project,
        selectedRevisionID: selectedRevisionIDsBySessionID[project.id])
      var anchors: [SessionContentAnchor] = []
      var revisionIdentities: [String] = []
      var revisionIDs: [String] = []
      for set in evidenceSets {
        try Task.checkCancellation()
        revisionIDs.append(set.id)
        if let identity = contentIdentity(
          for: set.fileURL, permitHashing: true, cacheByPath: &cacheByPath,
          hashedBytes: &hashedBytes, hashedFileCount: &hashedFileCount,
          reusedIdentityCount: &reusedIdentityCount, skippedHashCount: &skippedHashCount)
        {
          revisionIdentities.append(identity)
        }
        try Task.checkCancellation()
        var identityByOwnerID: [String: String] = [:]
        var kindByOwnerID: [String: SessionContentAnchorKind] = [:]
        var identityEvidenceByOwnerID: [String: SessionContentIdentityEvidence] = [:]
        var durationByOwnerID: [String: Double] = [:]
        for dependency in set.content.dependencies where dependency.kind == .clipAudio {
          try Task.checkCancellation()
          let kind = anchorKind(dependency: dependency, sessionRoot: project.rootURL)
          let identity: String
          let identityEvidence: SessionContentIdentityEvidence
          let measuredDuration: Double?
          if let fileURL = dependency.resolvedURL?.standardizedFileURL,
            dependency.availability == .available,
            let observed = contentIdentity(
              for: fileURL, permitHashing: kind != .externalLibrarySample,
              cacheByPath: &cacheByPath, hashedBytes: &hashedBytes,
              hashedFileCount: &hashedFileCount, reusedIdentityCount: &reusedIdentityCount,
              skippedHashCount: &skippedHashCount)
          {
            identity = observed
            identityEvidence = .verifiedContent
            measuredDuration = measuredAudioDurationSeconds(
              at: fileURL,
              contentIdentity: observed,
              cacheByPath: cacheByPath)
          } else {
            identity = referenceIdentity(dependency.reference, resolvedURL: dependency.resolvedURL)
            identityEvidence = .mutableReference
            measuredDuration = nil
          }
          try Task.checkCancellation()
          identityByOwnerID[dependency.ownerID] = identity
          kindByOwnerID[dependency.ownerID] = kind
          identityEvidenceByOwnerID[dependency.ownerID] = identityEvidence
          durationByOwnerID[dependency.ownerID] = measuredDuration
          anchors.append(
            SessionContentAnchor(
              id: StableID.forValue("dependency:\(project.id):\(identity):\(kind.rawValue)"),
              contentIdentity: identity, kind: kind, arrangementPositionBeats: nil,
              corpusFrequency: 1, sourceMaterialIdentity: identity,
              identityEvidence: identityEvidence,
              measuredAudioDurationSeconds: measuredDuration))
        }

        for track in set.content.tracks {
          for clip in track.clips where clip.placement == .arrangement {
            if clip.kind == .audio,
              let identity = identityByOwnerID[clip.id]
                ?? clip.sampleReference.map({ referenceIdentity($0, resolvedURL: nil) }),
              kindByOwnerID[clip.id] != .externalLibrarySample
            {
              anchors.append(
                SessionContentAnchor(
                  id: StableID.forValue(
                    "placement:\(project.id):\(identity):\(clip.startBeat ?? -1)"),
                  contentIdentity: "placement:\(identity)", kind: .clipPlacement,
                  arrangementPositionBeats: clip.startBeat, corpusFrequency: 1,
                  sourceMaterialIdentity: identity,
                  identityEvidence: identityEvidenceByOwnerID[clip.id] ?? .mutableReference,
                  measuredAudioDurationSeconds: durationByOwnerID[clip.id]))
            } else if clip.kind == .midi {
              let duration = (clip.endBeat ?? 0) - (clip.startBeat ?? 0)
              let identity = StableID.forValue(
                "midi:\(normalized(clip.name)):\(clip.midiNoteCount):\(duration):\(clip.loopEnabled == true)"
              )
              anchors.append(
                SessionContentAnchor(
                  id: StableID.forValue("midi:\(project.id):\(clip.id)"),
                  contentIdentity: "midi:\(identity)", kind: .midiPhrase,
                  arrangementPositionBeats: clip.startBeat, corpusFrequency: 1,
                  sourceMaterialIdentity: "midi:\(identity)", identityEvidence: .structural))
            }
          }
        }
      }
      anchors.append(templateAnchor(project, sets: evidenceSets))
      anchorsBySession[project.id] = deduplicatedAnchors(anchors)
      revisionIdentitiesBySession[project.id] = revisionIdentities.sorted()
      revisionIDsBySession[project.id] = revisionIDs.sorted()
    }

    var sessionsByIdentity: [String: Set<String>] = [:]
    for (sessionID, anchors) in anchorsBySession {
      for identity in Set(anchors.map(\.contentIdentity)) {
        sessionsByIdentity[identity, default: []].insert(sessionID)
      }
    }
    let frequency = sessionsByIdentity.mapValues(\.count)
    let manifests = projects.map { project in
      let anchors = (anchorsBySession[project.id] ?? []).map { anchor in
        SessionContentAnchor(
          id: anchor.id, contentIdentity: anchor.contentIdentity, kind: anchor.kind,
          arrangementPositionBeats: anchor.arrangementPositionBeats,
          corpusFrequency: frequency[anchor.contentIdentity, default: 1],
          sourceMaterialIdentity: anchor.sourceMaterialIdentity,
          identityEvidence: anchor.identityEvidence,
          measuredAudioDurationSeconds: anchor.measuredAudioDurationSeconds)
      }.sorted { $0.id < $1.id }
      let duration = audioDurationEvidence(for: anchors)
      return SessionContentManifest(
        sessionID: project.id,
        artistID: artistIDsBySessionID[project.id] ?? nil,
        anchors: anchors,
        setRevisionContentIdentities: revisionIdentitiesBySession[project.id] ?? [],
        setRevisionIDs: revisionIDsBySession[project.id] ?? [],
        evidenceScope: configuration.evidenceScope,
        audioDurationPolicy: duration.policy,
        measuredAudioDurationSeconds: duration.total,
        selectedRevisionID:
          revisionIDsBySession[project.id]?.count == 1
          ? revisionIDsBySession[project.id]?.first : nil)
    }.sorted { $0.sessionID < $1.sessionID }

    return SessionContentManifestBuildResult(
      manifests: manifests,
      identityCache: SessionContentIdentityCache(
        entries: cacheByPath.values.sorted { $0.fileURL.path < $1.fileURL.path }),
      corpusFrequency: frequency, hashedFileCount: hashedFileCount,
      reusedIdentityCount: reusedIdentityCount, skippedHashCount: skippedHashCount)
  }

  private func deduplicatedProjects(_ indexes: [StudioLibraryIndex]) -> [StudioProject] {
    var seen: Set<String> = []
    return indexes.sorted { $0.rootURL.path.count > $1.rootURL.path.count }
      .flatMap(\.projects).filter { seen.insert($0.id).inserted }
  }

  private func anchorKind(
    dependency: MediaDependency, sessionRoot: URL
  ) -> SessionContentAnchorKind {
    let path =
      (dependency.resolvedURL?.path ?? dependency.reference.absolutePath
      ?? dependency.reference.relativePath ?? "").lowercased()
    if ["/library/", "/packs/", "/splice/", "/samples/imported/"].contains(where: path.contains) {
      return .externalLibrarySample
    }
    if ["/processed/", "/freeze/", "/consolidated/", "/resampling/"].contains(where: path.contains)
    {
      return .derivedProjectAudio
    }
    if path.hasPrefix(sessionRoot.standardizedFileURL.path.lowercased()) {
      return .projectRecording
    }
    return .externalLibrarySample
  }

  private func contentIdentity(
    for fileURL: URL,
    permitHashing: Bool,
    cacheByPath: inout [String: SessionContentIdentityCacheEntry],
    hashedBytes: inout Int64,
    hashedFileCount: inout Int,
    reusedIdentityCount: inout Int,
    skippedHashCount: inout Int
  ) -> String? {
    let fileURL = fileURL.standardizedFileURL
    guard let metadata = try? fileAccess.metadata(at: fileURL) else {
      skippedHashCount += 1
      return nil
    }
    if let cached = cacheByPath[fileURL.path], cacheEntry(cached, matches: metadata) {
      reusedIdentityCount += 1
      return cached.contentIdentity
    }
    let remainingBudget = max(0, configuration.maximumTotalHashedBytes - hashedBytes)
    let permittedBytes = min(configuration.maximumHashedFileBytes, remainingBudget)
    guard permitHashing, metadata.bytes <= permittedBytes else {
      skippedHashCount += 1
      return nil
    }
    guard let observation = try? fileAccess.sha256(at: fileURL, maximumBytes: permittedBytes),
      observation.metadata == metadata,
      let finalMetadata = try? fileAccess.metadata(at: fileURL),
      finalMetadata == observation.metadata,
      observation.metadata.bytes <= permittedBytes
    else {
      skippedHashCount += 1
      return nil
    }
    let identity = "sha256:\(observation.sha256)"
    hashedBytes += observation.metadata.bytes
    hashedFileCount += 1
    cacheByPath[fileURL.path] = SessionContentIdentityCacheEntry(
      fileURL: fileURL, bytes: observation.metadata.bytes,
      modifiedAt: observation.metadata.modifiedAt, contentIdentity: identity,
      modifiedAtNanoseconds: observation.metadata.modifiedAtNanoseconds,
      resourceIdentity: observation.metadata.resourceIdentity)
    return identity
  }

  private func cacheEntry(
    _ entry: SessionContentIdentityCacheEntry, matches metadata: SessionContentFileMetadata
  ) -> Bool {
    entry.bytes == metadata.bytes
      && entry.modifiedAtNanoseconds == metadata.modifiedAtNanoseconds
      && entry.resourceIdentity == metadata.resourceIdentity
  }

  private func measuredAudioDurationSeconds(
    at fileURL: URL,
    contentIdentity: String,
    cacheByPath: [String: SessionContentIdentityCacheEntry]
  ) -> Double? {
    guard let cached = cacheByPath[fileURL.path], cached.contentIdentity == contentIdentity,
      let before = try? fileAccess.metadata(at: fileURL),
      cacheEntry(cached, matches: before),
      let file = try? AVAudioFile(forReading: fileURL),
      let after = try? fileAccess.metadata(at: fileURL),
      after == before
    else { return nil }
    let sampleRate = file.processingFormat.sampleRate
    guard sampleRate.isFinite, sampleRate > 0, file.length > 0 else { return nil }
    let duration = Double(file.length) / sampleRate
    return duration.isFinite && duration > 0 ? duration : nil
  }

  private func audioDurationEvidence(
    for anchors: [SessionContentAnchor]
  ) -> (policy: SessionContentAudioDurationPolicy, total: Double?) {
    guard configuration.audioDurationPolicy == .completeFile else {
      return (configuration.audioDurationPolicy, nil)
    }
    let material = Dictionary(
      grouping: anchors.filter {
        ($0.kind == .projectRecording || $0.kind == .derivedProjectAudio)
          && $0.identityEvidence == .verifiedContent
      },
      by: { $0.sourceMaterialIdentity ?? $0.contentIdentity }
    ).compactMapValues(\.first)
    guard !material.isEmpty,
      material.values.allSatisfy({ $0.measuredAudioDurationSeconds != nil })
    else { return (.unknown, nil) }
    return (
      .completeFile,
      material.values.compactMap(\.measuredAudioDurationSeconds).reduce(0, +)
    )
  }

  private func cacheEntrySort(
    _ left: SessionContentIdentityCacheEntry, _ right: SessionContentIdentityCacheEntry
  ) -> Bool {
    if left.fileURL.path != right.fileURL.path { return left.fileURL.path < right.fileURL.path }
    if left.modifiedAtNanoseconds != right.modifiedAtNanoseconds {
      return (left.modifiedAtNanoseconds ?? .min) < (right.modifiedAtNanoseconds ?? .min)
    }
    return left.contentIdentity < right.contentIdentity
  }

  private func referenceIdentity(_ reference: MediaReference, resolvedURL: URL?) -> String {
    let value =
      resolvedURL?.standardizedFileURL.path ?? reference.absolutePath
      ?? reference.relativePath ?? "unresolved"
    return "reference:\(normalized(value))"
  }

  private func templateAnchor(_ project: StudioProject, sets: [AbletonSet]) -> SessionContentAnchor
  {
    let signatures = sets.flatMap { set in
      set.content.tracks.map { track in
        "\(track.kind.rawValue):\(track.devices.map(\.typeName).joined(separator: ","))"
      }
    }.sorted().joined(separator: "|")
    return SessionContentAnchor(
      id: StableID.forValue("template:\(project.id)"),
      contentIdentity: "template:\(StableID.forValue(signatures))", kind: .templateStructure,
      arrangementPositionBeats: nil, corpusFrequency: 1, identityEvidence: .structural)
  }

  private func scopedSets(
    in project: StudioProject,
    selectedRevisionID: String?
  ) -> [AbletonSet] {
    let available = project.sets.filter { !$0.isBackup }
    switch configuration.evidenceScope {
    case .fullSession:
      return available.sorted { $0.id < $1.id }
    case .activeRevision:
      return preferredSet(from: available).map { [$0] } ?? []
    case .selectedRevision:
      guard let selectedRevisionID else { return [] }
      return available.filter { $0.id == selectedRevisionID }
    }
  }

  private func preferredSet(from sets: [AbletonSet]) -> AbletonSet? {
    sets.max { left, right in
      let leftDate = left.modifiedAt ?? .distantPast
      let rightDate = right.modifiedAt ?? .distantPast
      if leftDate != rightDate { return leftDate < rightDate }
      return left.id < right.id
    }
  }

  private func deduplicatedAnchors(_ anchors: [SessionContentAnchor]) -> [SessionContentAnchor] {
    var seen: Set<String> = []
    return anchors.filter {
      seen.insert("\($0.kind.rawValue):\($0.contentIdentity):\($0.arrangementPositionBeats ?? -1)")
        .inserted
    }
  }

  private func normalized(_ value: String) -> String {
    value.folding(
      options: [.caseInsensitive, .diacriticInsensitive],
      locale: Locale(identifier: "en_US_POSIX")
    )
    .replacingOccurrences(of: "\\", with: "/")
  }
}

public enum SessionContentOrganisationRelationship: String, Codable, Sendable, Equatable {
  case sameWork
  case duplicateLocation
}

public enum SessionContentAutomaticAssignmentState: String, Codable, Sendable, Equatable {
  case current
  case superseded
}

public struct SessionContentReviewCandidate: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let sessionID: String
  public let sourceWorkID: String
  public let candidateWorkID: String
  public let relationship: SessionContentOrganisationRelationship
  public let score: Double
  public let matchedAnchorIDs: [String]
  public let explanation: String
  public let algorithmVersion: String
  public let calibrationID: String?
  public let candidateGeneration: SessionContentCandidateGenerationMetadata?
  public let independentSourceMaterialCount: Int?
  public let observation: DirectionalSessionContainmentObservation?
  public let observationID: String?
  public let decisionRecordedAt: Date?
  public let rankedCandidateEvidence: [SessionLineageCandidateScore]?

  public init(
    id: String, sessionID: String, sourceWorkID: String, candidateWorkID: String,
    relationship: SessionContentOrganisationRelationship, score: Double,
    matchedAnchorIDs: [String], explanation: String,
    algorithmVersion: String = SessionContentLineageResolver.algorithmVersion,
    calibrationID: String? = nil,
    candidateGeneration: SessionContentCandidateGenerationMetadata? = nil,
    independentSourceMaterialCount: Int? = nil,
    observation: DirectionalSessionContainmentObservation? = nil,
    observationID: String? = nil,
    decisionRecordedAt: Date? = nil,
    rankedCandidateEvidence: [SessionLineageCandidateScore]? = nil
  ) {
    self.id = id
    self.sessionID = sessionID
    self.sourceWorkID = sourceWorkID
    self.candidateWorkID = candidateWorkID
    self.relationship = relationship
    self.score = score
    self.matchedAnchorIDs = matchedAnchorIDs
    self.explanation = explanation
    self.algorithmVersion = algorithmVersion
    self.calibrationID = calibrationID
    self.candidateGeneration = candidateGeneration
    self.independentSourceMaterialCount = independentSourceMaterialCount
    self.observation = observation
    self.observationID = observationID
    self.decisionRecordedAt = decisionRecordedAt
    self.rankedCandidateEvidence = rankedCandidateEvidence
  }
}

public struct SessionContentAutomaticAssignment: Codable, Sendable, Equatable {
  public let sessionID: String
  public let sourceWorkID: String
  public let workID: String
  public let relationship: SessionContentOrganisationRelationship
  public let score: Double
  public let algorithmVersion: String
  public let calibrationID: String
  public let matchedAnchorIDs: [String]
  public let explanation: String
  public let candidateGeneration: SessionContentCandidateGenerationMetadata?
  public let observation: DirectionalSessionContainmentObservation?
  public let observationID: String?
  public let decisionRecordedAt: Date?
  public let rankedCandidateEvidence: [SessionLineageCandidateScore]?
  public let state: SessionContentAutomaticAssignmentState?
  public let supersededAt: Date?
  public let supersededByObservationID: String?

  public init(
    sessionID: String, sourceWorkID: String, workID: String,
    relationship: SessionContentOrganisationRelationship, score: Double,
    calibrationID: String, matchedAnchorIDs: [String], explanation: String,
    algorithmVersion: String = SessionContentLineageResolver.algorithmVersion,
    candidateGeneration: SessionContentCandidateGenerationMetadata? = nil,
    observation: DirectionalSessionContainmentObservation? = nil,
    observationID: String? = nil,
    decisionRecordedAt: Date? = nil,
    rankedCandidateEvidence: [SessionLineageCandidateScore]? = nil,
    state: SessionContentAutomaticAssignmentState? = .current,
    supersededAt: Date? = nil,
    supersededByObservationID: String? = nil
  ) {
    self.sessionID = sessionID
    self.sourceWorkID = sourceWorkID
    self.workID = workID
    self.relationship = relationship
    self.score = score
    self.algorithmVersion = algorithmVersion
    self.calibrationID = calibrationID
    self.matchedAnchorIDs = matchedAnchorIDs
    self.explanation = explanation
    self.candidateGeneration = candidateGeneration
    self.observation = observation
    self.observationID = observationID
    self.decisionRecordedAt = decisionRecordedAt
    self.rankedCandidateEvidence = rankedCandidateEvidence
    self.state = state
    self.supersededAt = supersededAt
    self.supersededByObservationID = supersededByObservationID
  }

  public var isCurrent: Bool { state == nil || state == .current }

  fileprivate func superseded(
    at date: Date,
    by observationID: String?
  ) -> SessionContentAutomaticAssignment {
    SessionContentAutomaticAssignment(
      sessionID: sessionID,
      sourceWorkID: sourceWorkID,
      workID: workID,
      relationship: relationship,
      score: score,
      calibrationID: calibrationID,
      matchedAnchorIDs: matchedAnchorIDs,
      explanation: explanation,
      algorithmVersion: algorithmVersion,
      candidateGeneration: candidateGeneration,
      observation: observation,
      observationID: self.observationID,
      decisionRecordedAt: decisionRecordedAt,
      rankedCandidateEvidence: rankedCandidateEvidence,
      state: .superseded,
      supersededAt: date,
      supersededByObservationID: observationID)
  }
}

public struct SessionContentOrganisationResult: Sendable {
  public let catalog: WorkCatalog
  public let manifestBuild: SessionContentManifestBuildResult
  public let contentReviewCandidates: [SessionContentReviewCandidate]
  public let automaticAssignments: [SessionContentAutomaticAssignment]
  public let candidateIndexCache: SessionContentCandidateIndexCache
  public let candidateIndexLoadCounters: SessionContentCandidateIndexLoadCounters

  public var currentAutomaticAssignments: [SessionContentAutomaticAssignment] {
    automaticAssignments.filter(\.isCurrent)
  }
}

public struct SessionContentOrganisationEngine: Sendable {
  public let manifestBuilder: SessionContentManifestBuilder

  public init(manifestBuilder: SessionContentManifestBuilder = .init()) {
    self.manifestBuilder = manifestBuilder
  }

  public func organise(
    indexes: [StudioLibraryIndex],
    overrides: OrganisationOverrides = .init(),
    directory: StudioOrganisationDirectory = .init(),
    calibration: AudioMatchingCalibration?,
    identityCache: SessionContentIdentityCache = .init(),
    generatedAt: Date = Date(),
    baselineCatalog: WorkCatalog? = nil
  ) throws -> SessionContentOrganisationResult {
    let baseline =
      baselineCatalog
      ?? WorkCatalogResolver().resolve(
        indexes: indexes, overrides: overrides, directory: directory, generatedAt: generatedAt)
    var workBySession: [String: StudioWork] = [:]
    for work in baseline.works {
      for session in work.sessions { workBySession[session.id] = work }
    }
    var artistIDs: [String: String?] = [:]
    for (sessionID, work) in workBySession {
      artistIDs[sessionID] = work.artist.displayName == "Unknown" ? nil : work.artist.id
    }
    let build = try manifestBuilder.build(
      indexes: indexes, artistIDsBySessionID: artistIDs, cache: identityCache)
    var manifestBySession: [String: SessionContentManifest] = [:]
    for manifest in build.manifests { manifestBySession[manifest.sessionID] = manifest }
    let manuallyAssigned = Set(directory.sessionAssignments.map(\.sessionID))
    let legacyOverrideSessions = Set(overrides.sessionOverrides.map(\.sessionID))
    let keepSeparateSessions = Set(
      overrides.sessionOverrides.filter(\.keepSeparate).map(\.sessionID))
    let userProtectedSessions = manuallyAssigned.union(legacyOverrideSessions)
    let rejectedBySession = Dictionary(
      grouping: directory.contentMatchRejections, by: \.sessionID
    ).mapValues {
      Set($0.map(\.workID))
    }
    let candidateGenerator = SessionContentLineageCandidateGenerator()
    var candidates: [SessionLineageCandidate] = []
    for work in baseline.works
    where isStableTarget(
      work,
      userProtectedSessions: userProtectedSessions,
      keepSeparateSessions: keepSeparateSessions
    ) {
      for session in work.sessions {
        guard let manifest = manifestBySession[session.id] else { continue }
        guard
          let context = revisionContext(
            for: session, manifest: manifest, in: work, catalog: baseline,
            reviewedAt: generatedAt)
        else { continue }
        candidates.append(
          SessionLineageCandidate(
            workID: work.id,
            sessionID: session.id,
            artistID: work.artist.displayName == "Unknown" ? nil : work.artist.id,
            manifest: manifest,
            reviewRevisionReference: context.reviewReference,
            evidenceRevisionReferences: context.evidenceReferences,
            revisionTimestamp: context.timestamp
          )
        )
      }
    }
    let candidateIndex = candidateGenerator.makeIndex(
      candidates: candidates,
      persistedCache: directory.contentCandidateIndexCache)
    var reviews: [SessionContentReviewCandidate] = []
    var assignments: [SessionContentAutomaticAssignment] = []

    for source in baseline.works.flatMap(\.sessions) {
      try Task.checkCancellation()
      guard !userProtectedSessions.contains(source.id),
        isWeak(source: source, in: workBySession[source.id]),
        let sourceManifest = manifestBySession[source.id], let sourceWork = workBySession[source.id]
      else { continue }
      guard
        let sourceContext = revisionContext(
          for: source,
          manifest: sourceManifest,
          in: sourceWork,
          catalog: baseline,
          reviewedAt: generatedAt
        )
      else { continue }
      let candidateSelection = candidateIndex.generate(
        source: sourceManifest,
        sourceReference: sourceContext.reviewReference,
        sourceEvidenceRevisionReferences: sourceContext.evidenceReferences,
        sourceRevisionTimestamp: sourceContext.timestamp,
        excludingWorkID: sourceWork.id
      )
      let resolution = SessionContentLineageResolver(calibration: calibration).resolve(
        source: sourceManifest,
        sourceReference: sourceContext.reviewReference,
        sourceEvidenceRevisionReferences: sourceContext.evidenceReferences,
        sourceRevisionTimestamp: sourceContext.timestamp,
        candidates: candidateSelection.candidates,
        rejectedWorkIDs: rejectedBySession[source.id] ?? [])
      guard let best = resolution.bestCandidate, let proposed = resolution.proposedWorkID,
        let targetWork = baseline.works.first(where: { $0.id == proposed })
      else { continue }
      let relationship = duplicateRelationship(
        source: sourceManifest, candidate: best.observation.candidateRevisionReference,
        manifests: manifestBySession)
      let observationID = contentObservationID(
        best.observation,
        candidateGeneration: candidateSelection.metadata)
      let rankedCandidateEvidence = Array(resolution.candidates.prefix(5))
      let knownCompatibleArtist =
        sourceWork.artist.displayName != "Unknown"
        && sourceWork.artist.id == targetWork.artist.id
      if resolution.selectedWorkID != nil, knownCompatibleArtist {
        guard let calibrationID = calibration?.id else { continue }
        assignments.append(
          SessionContentAutomaticAssignment(
            sessionID: source.id, sourceWorkID: sourceWork.id, workID: proposed,
            relationship: relationship, score: best.score,
            calibrationID: calibrationID, matchedAnchorIDs: best.matchedAnchorIDs,
            explanation:
              best.observation.explanation,
            candidateGeneration: candidateSelection.metadata,
            observation: best.observation,
            observationID: observationID,
            decisionRecordedAt: generatedAt,
            rankedCandidateEvidence: rankedCandidateEvidence
          ))
      } else {
        reviews.append(
          SessionContentReviewCandidate(
            id: StableID.forValue("content-review:\(source.id):\(proposed)"),
            sessionID: source.id, sourceWorkID: sourceWork.id, candidateWorkID: proposed,
            relationship: relationship, score: best.score,
            matchedAnchorIDs: best.matchedAnchorIDs,
            explanation: best.observation.explanation,
            calibrationID: calibration?.id,
            candidateGeneration: candidateSelection.metadata,
            independentSourceMaterialCount: best.distinctiveSourceMaterialCount,
            observation: best.observation,
            observationID: observationID,
            decisionRecordedAt: generatedAt,
            rankedCandidateEvidence: rankedCandidateEvidence
          ))
      }
    }

    let assignmentHistory = reconciledAssignments(
      previous: directory.contentAutomaticAssignments,
      current: assignments,
      reviews: reviews,
      generatedAt: generatedAt)
    let merged = merge(
      catalog: baseline, assignments: assignmentHistory.filter(\.isCurrent),
      reviews: reviews.sorted { $0.id < $1.id })
    return SessionContentOrganisationResult(
      catalog: merged, manifestBuild: build,
      contentReviewCandidates: reviews.sorted { $0.id < $1.id },
      automaticAssignments: assignmentHistory.sorted(by: assignmentSort),
      candidateIndexCache: candidateIndex.cacheDescriptor,
      candidateIndexLoadCounters: candidateIndex.loadCounters)
  }

  private func contentObservationID(
    _ observation: DirectionalSessionContainmentObservation,
    candidateGeneration: SessionContentCandidateGenerationMetadata
  ) -> String {
    StableID.forValue(
      [
        "directional-session-containment-observation",
        observation.sourceRevisionReference.id,
        observation.candidateRevisionReference.id,
        candidateGeneration.invalidationToken,
        observation.algorithmVersion,
        observation.calibrationID ?? "uncalibrated",
      ].joined(separator: ":"))
  }

  private func reconciledAssignments(
    previous: [SessionContentAutomaticAssignment],
    current: [SessionContentAutomaticAssignment],
    reviews: [SessionContentReviewCandidate],
    generatedAt: Date
  ) -> [SessionContentAutomaticAssignment] {
    let currentObservationIDs = Set(current.compactMap(\.observationID))
    var replacementByPair: [String: String] = [:]
    for assignment in current {
      guard let observationID = assignment.observationID else { continue }
      replacementByPair[assignment.sessionID + ":" + assignment.workID] = observationID
    }
    for review in reviews {
      guard let observationID = review.observationID else { continue }
      replacementByPair[review.sessionID + ":" + review.candidateWorkID] = observationID
    }
    let historical = previous.compactMap { assignment -> SessionContentAutomaticAssignment? in
      if let observationID = assignment.observationID,
        currentObservationIDs.contains(observationID)
      {
        return assignment.isCurrent ? nil : assignment
      }
      guard assignment.isCurrent else { return assignment }
      return assignment.superseded(
        at: generatedAt,
        by: replacementByPair[assignment.sessionID + ":" + assignment.workID])
    }
    return historical + current
  }

  private func assignmentSort(
    _ left: SessionContentAutomaticAssignment,
    _ right: SessionContentAutomaticAssignment
  ) -> Bool {
    if left.sessionID != right.sessionID { return left.sessionID < right.sessionID }
    if left.isCurrent != right.isCurrent { return !left.isCurrent }
    let leftDate = left.decisionRecordedAt ?? .distantPast
    let rightDate = right.decisionRecordedAt ?? .distantPast
    if leftDate != rightDate { return leftDate < rightDate }
    return (left.observationID ?? "") < (right.observationID ?? "")
  }

  private func isWeak(source: StudioSession, in work: StudioWork?) -> Bool {
    guard let work, work.sessions.count == 1 else { return false }
    if work.confidence == .unresolved || work.confidence == .suggested { return true }
    return source.canonicalTitleKey.range(
      of: #"^(?:idea|untitled|new|test|project)(?:\s*\d+|\s*copy)?$"#,
      options: .regularExpression) != nil
  }

  private func isStableTarget(
    _ work: StudioWork, userProtectedSessions: Set<String>, keepSeparateSessions: Set<String>
  ) -> Bool {
    if work.sessions.contains(where: { keepSeparateSessions.contains($0.id) }) { return false }
    if work.sessions.contains(where: { userProtectedSessions.contains($0.id) }) { return true }
    guard work.sessions.count == 1, let session = work.sessions.first else { return true }
    return !isWeak(source: session, in: work)
  }

  private func duplicateRelationship(
    source: SessionContentManifest, candidate: StudioRevisionReference,
    manifests: [String: SessionContentManifest]
  ) -> SessionContentOrganisationRelationship {
    let sourceRevisions = source.setRevisionContentIdentities
    let candidateRevisions = manifests[candidate.sessionID]?.setRevisionContentIdentities ?? []
    return !sourceRevisions.isEmpty && sourceRevisions == candidateRevisions
      ? .duplicateLocation : .sameWork
  }

  private func merge(
    catalog: WorkCatalog, assignments: [SessionContentAutomaticAssignment],
    reviews: [SessionContentReviewCandidate]
  ) -> WorkCatalog {
    var worksByID = Dictionary(uniqueKeysWithValues: catalog.works.map { ($0.id, $0) })
    for assignment in assignments {
      guard let source = worksByID[assignment.sourceWorkID],
        let session = source.sessions.first(where: { $0.id == assignment.sessionID }),
        let target = worksByID[assignment.workID]
      else { continue }
      worksByID[assignment.sourceWorkID] = replacing(
        source, sessions: source.sessions.filter { $0.id != session.id })
      worksByID[assignment.workID] = replacing(target, sessions: target.sessions + [session])
    }
    let works = worksByID.values.filter { !$0.sessions.isEmpty }.sorted {
      if $0.artist.displayName != $1.artist.displayName {
        return $0.artist.displayName.localizedStandardCompare($1.artist.displayName)
          == .orderedAscending
      }
      return $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending
    }
    let contentReviews = reviews.map { review in
      WorkMatchReview(
        id: review.id, sourceWorkID: review.sourceWorkID,
        candidateWorkID: review.candidateWorkID, confidence: .suggested,
        score: review.score,
        evidence: [
          OrganisationEvidence(
            id: StableID.forValue("content-evidence:\(review.id)"), kind: .contentLineage,
            score: review.score, explanation: review.explanation)
        ],
        contentObservation: review.observation)
    }
    return WorkCatalog(
      generatedAt: catalog.generatedAt,
      algorithmVersion: "\(catalog.algorithmVersion)+session-content-v2",
      sourceRoots: catalog.sourceRoots, works: works,
      reviewQueue: (catalog.reviewQueue + contentReviews).sorted { $0.id < $1.id })
  }

  private func replacing(_ work: StudioWork, sessions: [StudioSession]) -> StudioWork {
    StudioWork(
      id: work.id, artist: work.artist, displayName: work.displayName,
      canonicalKey: work.canonicalKey, confidence: work.confidence,
      evidence: work.evidence, sessions: sessions.sorted { $0.rootURL.path < $1.rootURL.path })
  }

  private func revisionContext(
    for session: StudioSession,
    manifest: SessionContentManifest,
    in work: StudioWork,
    catalog: WorkCatalog,
    reviewedAt: Date
  ) -> (
    reviewReference: StudioRevisionReference,
    evidenceReferences: [StudioRevisionReference],
    timestamp: Date?
  )? {
    let evidenceRevisions = revisionsCoveredByManifest(session: session, manifest: manifest)
    guard let reviewRevision = preferredRevision(from: evidenceRevisions) else {
      return nil
    }
    guard
      let evidenceReferences = try? evidenceRevisions.map({ revision in
        try StudioRevisionReferenceResolver().capture(
          workID: work.id, sessionID: session.id, revisionID: revision.id, in: catalog,
          reviewedAt: reviewedAt
        ).reference
      }).sorted(by: { $0.revisionID < $1.revisionID }),
      let reviewReference = try? StudioRevisionReferenceResolver().capture(
        workID: work.id, sessionID: session.id, revisionID: reviewRevision.id, in: catalog,
        reviewedAt: reviewedAt
      ).reference
    else { return nil }
    let timestamp = evidenceRevisions.compactMap { $0.timestamp.value ?? $0.set.modifiedAt }.max()
    return (reviewReference, evidenceReferences, timestamp)
  }

  private func revisionsCoveredByManifest(
    session: StudioSession,
    manifest: SessionContentManifest
  ) -> [StudioSetRevision] {
    let manifestRevisionIDs = Set(manifest.setRevisionIDs)
    let matched = session.revisions.filter { manifestRevisionIDs.contains($0.set.id) }
    let nonBackupMatched = matched.filter { !$0.set.isBackup }
    if !nonBackupMatched.isEmpty { return nonBackupMatched }
    let nonBackupRevisions = session.revisions.filter { !$0.set.isBackup }
    return nonBackupRevisions.isEmpty ? session.revisions : nonBackupRevisions
  }

  private func preferredRevision(from revisions: [StudioSetRevision]) -> StudioSetRevision? {
    revisions.max { left, right in
      let leftDate = left.timestamp.value ?? left.set.modifiedAt ?? .distantPast
      let rightDate = right.timestamp.value ?? right.set.modifiedAt ?? .distantPast
      if leftDate != rightDate { return leftDate < rightDate }
      return left.id < right.id
    }
  }
}
