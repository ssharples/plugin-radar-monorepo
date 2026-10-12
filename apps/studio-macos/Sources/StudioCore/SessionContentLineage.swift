import Foundation

public enum SessionContentAnchorKind: String, Codable, Sendable, CaseIterable {
  case projectRecording
  case derivedProjectAudio
  case midiPhrase
  case clipPlacement
  case externalLibrarySample
  case templateStructure
}

public enum SessionContentIdentityEvidence: String, Codable, Sendable, CaseIterable {
  case verifiedContent
  case mutableReference
  case structural
}

public enum SessionContentEvidenceScope: String, Codable, Sendable, CaseIterable {
  case fullSession
  case activeRevision
  case selectedRevision
}

public enum SessionContentAudioDurationPolicy: String, Codable, Sendable, CaseIterable {
  case completeFile
  case boundedPrefix
  case unknown
}

public struct SessionContentAnchor: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let contentIdentity: String
  public let kind: SessionContentAnchorKind
  public let arrangementPositionBeats: Double?
  public let corpusFrequency: Int
  public let sourceMaterialIdentity: String?
  public let identityEvidence: SessionContentIdentityEvidence
  public let measuredAudioDurationSeconds: Double?

  public init(
    id: String,
    contentIdentity: String,
    kind: SessionContentAnchorKind,
    arrangementPositionBeats: Double?,
    corpusFrequency: Int,
    sourceMaterialIdentity: String? = nil,
    identityEvidence: SessionContentIdentityEvidence = .verifiedContent,
    measuredAudioDurationSeconds: Double? = nil
  ) {
    self.id = id
    self.contentIdentity = contentIdentity
    self.kind = kind
    self.arrangementPositionBeats = arrangementPositionBeats
    self.corpusFrequency = max(1, corpusFrequency)
    self.sourceMaterialIdentity = sourceMaterialIdentity
    self.identityEvidence =
      contentIdentity.contains("reference:") ? .mutableReference : identityEvidence
    self.measuredAudioDurationSeconds = Self.validDuration(measuredAudioDurationSeconds)
  }

  private enum CodingKeys: String, CodingKey {
    case id, contentIdentity, kind, arrangementPositionBeats, corpusFrequency
    case sourceMaterialIdentity, identityEvidence, measuredAudioDurationSeconds
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(String.self, forKey: .id)
    contentIdentity = try container.decode(String.self, forKey: .contentIdentity)
    kind = try container.decode(SessionContentAnchorKind.self, forKey: .kind)
    arrangementPositionBeats = try container.decodeIfPresent(
      Double.self, forKey: .arrangementPositionBeats)
    corpusFrequency = max(1, try container.decode(Int.self, forKey: .corpusFrequency))
    sourceMaterialIdentity = try container.decodeIfPresent(
      String.self, forKey: .sourceMaterialIdentity)
    let decodedIdentityEvidence =
      try container.decodeIfPresent(SessionContentIdentityEvidence.self, forKey: .identityEvidence)
      ?? .verifiedContent
    identityEvidence =
      contentIdentity.contains("reference:") ? .mutableReference : decodedIdentityEvidence
    measuredAudioDurationSeconds = Self.validDuration(
      try container.decodeIfPresent(Double.self, forKey: .measuredAudioDurationSeconds))
  }

  private static func validDuration(_ value: Double?) -> Double? {
    guard let value, value.isFinite, value > 0 else { return nil }
    return value
  }
}

public struct SessionContentManifest: Codable, Sendable, Equatable {
  public let sessionID: String
  public let artistID: String?
  public let anchors: [SessionContentAnchor]
  public let algorithmVersion: String
  public let setRevisionContentIdentities: [String]
  public let setRevisionIDs: [String]
  public let evidenceScope: SessionContentEvidenceScope
  public let audioDurationPolicy: SessionContentAudioDurationPolicy
  public let measuredAudioDurationSeconds: Double?
  public let selectedRevisionID: String?

  public init(
    sessionID: String,
    artistID: String?,
    anchors: [SessionContentAnchor],
    setRevisionContentIdentities: [String] = [],
    setRevisionIDs: [String] = [],
    evidenceScope: SessionContentEvidenceScope = .selectedRevision,
    audioDurationPolicy: SessionContentAudioDurationPolicy = .completeFile,
    measuredAudioDurationSeconds: Double? = nil,
    selectedRevisionID: String? = nil,
    algorithmVersion: String = "session-content-manifest-v2"
  ) {
    self.sessionID = sessionID
    self.artistID = artistID
    self.anchors = anchors
    self.setRevisionContentIdentities = setRevisionContentIdentities
    self.setRevisionIDs = setRevisionIDs
    self.evidenceScope = evidenceScope
    self.audioDurationPolicy = audioDurationPolicy
    self.measuredAudioDurationSeconds = Self.validDuration(measuredAudioDurationSeconds)
    self.selectedRevisionID =
      selectedRevisionID ?? (setRevisionIDs.count == 1 ? setRevisionIDs.first : nil)
    self.algorithmVersion = algorithmVersion
  }

  private enum CodingKeys: String, CodingKey {
    case sessionID, artistID, anchors, algorithmVersion, setRevisionContentIdentities
    case setRevisionIDs
    case evidenceScope, audioDurationPolicy, measuredAudioDurationSeconds, selectedRevisionID
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    sessionID = try container.decode(String.self, forKey: .sessionID)
    artistID = try container.decodeIfPresent(String.self, forKey: .artistID)
    anchors = try container.decode([SessionContentAnchor].self, forKey: .anchors)
    algorithmVersion = try container.decode(String.self, forKey: .algorithmVersion)
    setRevisionContentIdentities =
      try container.decodeIfPresent([String].self, forKey: .setRevisionContentIdentities) ?? []
    setRevisionIDs =
      try container.decodeIfPresent([String].self, forKey: .setRevisionIDs) ?? []
    evidenceScope =
      try container.decodeIfPresent(SessionContentEvidenceScope.self, forKey: .evidenceScope)
      ?? .fullSession
    audioDurationPolicy =
      try container.decodeIfPresent(
        SessionContentAudioDurationPolicy.self, forKey: .audioDurationPolicy)
      ?? .unknown
    measuredAudioDurationSeconds = Self.validDuration(
      try container.decodeIfPresent(Double.self, forKey: .measuredAudioDurationSeconds))
    selectedRevisionID =
      try container.decodeIfPresent(String.self, forKey: .selectedRevisionID)
  }

  private static func validDuration(_ value: Double?) -> Double? {
    guard let value, value.isFinite, value > 0 else { return nil }
    return value
  }
}

public struct SessionLineageCandidate: Codable, Sendable, Equatable {
  public let workID: String
  public let sessionID: String
  public let artistID: String?
  public let manifest: SessionContentManifest
  public let reviewRevisionReference: StudioRevisionReference
  public let evidenceRevisionReferences: [StudioRevisionReference]
  public let revisionTimestamp: Date?

  public init(
    workID: String,
    sessionID: String,
    artistID: String?,
    manifest: SessionContentManifest,
    reviewRevisionReference: StudioRevisionReference,
    evidenceRevisionReferences: [StudioRevisionReference]? = nil,
    revisionTimestamp: Date?
  ) {
    self.workID = workID
    self.sessionID = sessionID
    self.artistID = artistID
    self.manifest = manifest
    self.reviewRevisionReference = reviewRevisionReference
    self.evidenceRevisionReferences =
      (evidenceRevisionReferences?.isEmpty == false
      ? evidenceRevisionReferences!
      : [reviewRevisionReference]).sorted { $0.revisionID < $1.revisionID }
    self.revisionTimestamp = revisionTimestamp
  }
}

public enum DirectionalContainmentEvidenceFamily: String, Codable, Sendable, CaseIterable {
  case exact
  case placement
  case midiStructure
  case arrangement
}

public enum DirectionalContainmentUnavailableEvidenceFamily: String, Codable, Sendable,
  CaseIterable
{
  case pcm
  case excerpt
}

public enum DirectionalContainmentAnchorSide: String, Codable, Sendable, CaseIterable {
  case source
  case candidate
}

public enum DirectionalContainmentSuppressionReason: String, Codable, Sendable, CaseIterable {
  case commonCorpusMaterial
  case templateMaterial
  case externalLibraryMaterial
  case unverifiedMutableIdentity
}

public enum DirectionalContainmentChronologyCompatibility: String, Codable, Sendable,
  CaseIterable
{
  case compatible
  case conflict
  case unknown
}

public enum DirectionalContainmentArtistCompatibility: String, Codable, Sendable, CaseIterable {
  case compatible
  case conflict
  case unknown
}

public enum DirectionalContainmentConflict: String, Codable, Sendable, CaseIterable {
  case artistMismatch
  case chronologyMismatch
  case directionReversal
  case closeRunnerUp
  case insufficientIndependentEvidence
  case durableRejection
  case incompatibleEvidenceScope
}

public struct DirectionalContainmentEvidenceGroup: Codable, Identifiable, Sendable, Equatable {
  public let family: DirectionalContainmentEvidenceFamily
  public let sourceAnchorIDs: [String]
  public let candidateAnchorIDs: [String]

  public var id: String { family.rawValue }
  public var matchCount: Int { min(sourceAnchorIDs.count, candidateAnchorIDs.count) }

  public init(
    family: DirectionalContainmentEvidenceFamily,
    sourceAnchorIDs: [String],
    candidateAnchorIDs: [String]
  ) {
    self.family = family
    self.sourceAnchorIDs = sourceAnchorIDs.sorted()
    self.candidateAnchorIDs = candidateAnchorIDs.sorted()
  }
}

public struct DirectionalContainmentSuppressedAnchor: Codable, Identifiable, Sendable, Equatable {
  public let side: DirectionalContainmentAnchorSide
  public let anchorID: String
  public let contentIdentity: String
  public let kind: SessionContentAnchorKind
  public let corpusFrequency: Int
  public let reason: DirectionalContainmentSuppressionReason

  public var id: String { "\(side.rawValue):\(anchorID):\(reason.rawValue)" }

  public init(
    side: DirectionalContainmentAnchorSide,
    anchorID: String,
    contentIdentity: String,
    kind: SessionContentAnchorKind,
    corpusFrequency: Int,
    reason: DirectionalContainmentSuppressionReason
  ) {
    self.side = side
    self.anchorID = anchorID
    self.contentIdentity = contentIdentity
    self.kind = kind
    self.corpusFrequency = corpusFrequency
    self.reason = reason
  }
}

public struct DirectionalSessionContainmentObservation: Codable, Sendable, Equatable {
  public let sourceRevisionReference: StudioRevisionReference
  public let candidateRevisionReference: StudioRevisionReference
  public let sourceEvidenceRevisionReferences: [StudioRevisionReference]
  public let candidateEvidenceRevisionReferences: [StudioRevisionReference]
  public let sourceEvidenceScope: SessionContentEvidenceScope
  public let candidateEvidenceScope: SessionContentEvidenceScope
  public let sourceAudioDurationPolicy: SessionContentAudioDurationPolicy
  public let candidateAudioDurationPolicy: SessionContentAudioDurationPolicy
  public let sourceMeasuredAudioDurationSeconds: Double?
  public let candidateMeasuredAudioDurationSeconds: Double?
  public let sourceSelectedRevisionID: String?
  public let candidateSelectedRevisionID: String?
  public let algorithmFamily: String
  public let algorithmVersion: String
  public let calibrationID: String?
  public let sourceContainsCandidateScore: Double
  public let candidateContainsSourceScore: Double
  public let weightedIntersectionTotal: Double
  public let sourceMatchedWeightTotal: Double
  public let sourceWeightTotal: Double
  public let candidateMatchedWeightTotal: Double
  public let candidateWeightTotal: Double
  public let arrangementScore: Double
  public let matchedEvidenceGroups: [DirectionalContainmentEvidenceGroup]
  public let unavailableEvidenceFamilies: [DirectionalContainmentUnavailableEvidenceFamily]
  public let suppressedAnchors: [DirectionalContainmentSuppressedAnchor]
  public let exactEvidenceCount: Int
  public let pcmEvidenceCount: Int?
  public let excerptEvidenceCount: Int?
  public let placementEvidenceCount: Int
  public let midiStructureEvidenceCount: Int
  public let arrangementEvidenceCount: Int
  public let distinctiveAnchorCount: Int
  public let distinctiveEvidenceKindCount: Int
  public let independentSourceMaterialCount: Int
  public let runnerUpMargin: Double
  public let chronologyCompatibility: DirectionalContainmentChronologyCompatibility
  public let artistCompatibility: DirectionalContainmentArtistCompatibility
  public let conflicts: [DirectionalContainmentConflict]
  public let explanation: String

  public init(
    sourceRevisionReference: StudioRevisionReference,
    candidateRevisionReference: StudioRevisionReference,
    sourceEvidenceRevisionReferences: [StudioRevisionReference] = [],
    candidateEvidenceRevisionReferences: [StudioRevisionReference] = [],
    sourceEvidenceScope: SessionContentEvidenceScope = .selectedRevision,
    candidateEvidenceScope: SessionContentEvidenceScope = .selectedRevision,
    sourceAudioDurationPolicy: SessionContentAudioDurationPolicy = .completeFile,
    candidateAudioDurationPolicy: SessionContentAudioDurationPolicy = .completeFile,
    sourceMeasuredAudioDurationSeconds: Double? = nil,
    candidateMeasuredAudioDurationSeconds: Double? = nil,
    sourceSelectedRevisionID: String? = nil,
    candidateSelectedRevisionID: String? = nil,
    algorithmFamily: String,
    algorithmVersion: String,
    calibrationID: String?,
    sourceContainsCandidateScore: Double,
    candidateContainsSourceScore: Double,
    weightedIntersectionTotal: Double,
    sourceMatchedWeightTotal: Double,
    sourceWeightTotal: Double,
    candidateMatchedWeightTotal: Double,
    candidateWeightTotal: Double,
    arrangementScore: Double,
    matchedEvidenceGroups: [DirectionalContainmentEvidenceGroup],
    unavailableEvidenceFamilies: [DirectionalContainmentUnavailableEvidenceFamily] = [],
    suppressedAnchors: [DirectionalContainmentSuppressedAnchor],
    exactEvidenceCount: Int,
    pcmEvidenceCount: Int? = nil,
    excerptEvidenceCount: Int? = nil,
    placementEvidenceCount: Int,
    midiStructureEvidenceCount: Int,
    arrangementEvidenceCount: Int,
    distinctiveAnchorCount: Int,
    distinctiveEvidenceKindCount: Int,
    independentSourceMaterialCount: Int,
    runnerUpMargin: Double,
    chronologyCompatibility: DirectionalContainmentChronologyCompatibility,
    artistCompatibility: DirectionalContainmentArtistCompatibility,
    conflicts: [DirectionalContainmentConflict],
    explanation: String
  ) {
    self.sourceRevisionReference = sourceRevisionReference
    self.candidateRevisionReference = candidateRevisionReference
    self.sourceEvidenceRevisionReferences =
      (sourceEvidenceRevisionReferences.isEmpty
      ? [sourceRevisionReference] : sourceEvidenceRevisionReferences)
      .sorted { $0.revisionID < $1.revisionID }
    self.candidateEvidenceRevisionReferences =
      (candidateEvidenceRevisionReferences.isEmpty
      ? [candidateRevisionReference] : candidateEvidenceRevisionReferences)
      .sorted { $0.revisionID < $1.revisionID }
    self.sourceEvidenceScope = sourceEvidenceScope
    self.candidateEvidenceScope = candidateEvidenceScope
    self.sourceAudioDurationPolicy = sourceAudioDurationPolicy
    self.candidateAudioDurationPolicy = candidateAudioDurationPolicy
    self.sourceMeasuredAudioDurationSeconds = sourceMeasuredAudioDurationSeconds.flatMap {
      $0.isFinite && $0 > 0 ? $0 : nil
    }
    self.candidateMeasuredAudioDurationSeconds = candidateMeasuredAudioDurationSeconds.flatMap {
      $0.isFinite && $0 > 0 ? $0 : nil
    }
    self.sourceSelectedRevisionID = sourceSelectedRevisionID
    self.candidateSelectedRevisionID = candidateSelectedRevisionID
    self.algorithmFamily = algorithmFamily
    self.algorithmVersion = algorithmVersion
    self.calibrationID = calibrationID
    self.sourceContainsCandidateScore = sourceContainsCandidateScore
    self.candidateContainsSourceScore = candidateContainsSourceScore
    self.weightedIntersectionTotal = weightedIntersectionTotal
    self.sourceMatchedWeightTotal = sourceMatchedWeightTotal
    self.sourceWeightTotal = sourceWeightTotal
    self.candidateMatchedWeightTotal = candidateMatchedWeightTotal
    self.candidateWeightTotal = candidateWeightTotal
    self.arrangementScore = arrangementScore
    self.matchedEvidenceGroups = matchedEvidenceGroups.sorted {
      $0.family.rawValue < $1.family.rawValue
    }
    self.unavailableEvidenceFamilies = unavailableEvidenceFamilies.sorted {
      $0.rawValue < $1.rawValue
    }
    self.suppressedAnchors = suppressedAnchors.sorted { $0.id < $1.id }
    self.exactEvidenceCount = exactEvidenceCount
    self.pcmEvidenceCount = pcmEvidenceCount
    self.excerptEvidenceCount = excerptEvidenceCount
    self.placementEvidenceCount = placementEvidenceCount
    self.midiStructureEvidenceCount = midiStructureEvidenceCount
    self.arrangementEvidenceCount = arrangementEvidenceCount
    self.distinctiveAnchorCount = distinctiveAnchorCount
    self.distinctiveEvidenceKindCount = distinctiveEvidenceKindCount
    self.independentSourceMaterialCount = independentSourceMaterialCount
    self.runnerUpMargin = runnerUpMargin
    self.chronologyCompatibility = chronologyCompatibility
    self.artistCompatibility = artistCompatibility
    self.conflicts = conflicts.sorted { $0.rawValue < $1.rawValue }
    self.explanation = explanation
  }

  private enum CodingKeys: String, CodingKey {
    case sourceRevisionReference, candidateRevisionReference
    case sourceEvidenceRevisionReferences, candidateEvidenceRevisionReferences
    case sourceEvidenceScope, candidateEvidenceScope
    case sourceAudioDurationPolicy, candidateAudioDurationPolicy
    case sourceMeasuredAudioDurationSeconds, candidateMeasuredAudioDurationSeconds
    case sourceSelectedRevisionID, candidateSelectedRevisionID
    case algorithmFamily, algorithmVersion, calibrationID
    case sourceContainsCandidateScore, candidateContainsSourceScore
    case weightedIntersectionTotal, sourceMatchedWeightTotal, sourceWeightTotal
    case candidateMatchedWeightTotal, candidateWeightTotal, arrangementScore
    case matchedEvidenceGroups, unavailableEvidenceFamilies, suppressedAnchors
    case exactEvidenceCount, pcmEvidenceCount, excerptEvidenceCount
    case placementEvidenceCount, midiStructureEvidenceCount, arrangementEvidenceCount
    case distinctiveAnchorCount, distinctiveEvidenceKindCount, independentSourceMaterialCount
    case runnerUpMargin, chronologyCompatibility, artistCompatibility, conflicts, explanation
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let sourceRevisionReference =
      try container.decode(StudioRevisionReference.self, forKey: .sourceRevisionReference)
    let candidateRevisionReference =
      try container.decode(StudioRevisionReference.self, forKey: .candidateRevisionReference)
    self.init(
      sourceRevisionReference: sourceRevisionReference,
      candidateRevisionReference: candidateRevisionReference,
      sourceEvidenceRevisionReferences:
        try container.decodeIfPresent(
          [StudioRevisionReference].self, forKey: .sourceEvidenceRevisionReferences) ?? [],
      candidateEvidenceRevisionReferences:
        try container.decodeIfPresent(
          [StudioRevisionReference].self, forKey: .candidateEvidenceRevisionReferences) ?? [],
      sourceEvidenceScope:
        try container.decodeIfPresent(
          SessionContentEvidenceScope.self, forKey: .sourceEvidenceScope) ?? .fullSession,
      candidateEvidenceScope:
        try container.decodeIfPresent(
          SessionContentEvidenceScope.self, forKey: .candidateEvidenceScope) ?? .fullSession,
      sourceAudioDurationPolicy:
        try container.decodeIfPresent(
          SessionContentAudioDurationPolicy.self, forKey: .sourceAudioDurationPolicy) ?? .unknown,
      candidateAudioDurationPolicy:
        try container.decodeIfPresent(
          SessionContentAudioDurationPolicy.self, forKey: .candidateAudioDurationPolicy)
        ?? .unknown,
      sourceMeasuredAudioDurationSeconds:
        try container.decodeIfPresent(Double.self, forKey: .sourceMeasuredAudioDurationSeconds),
      candidateMeasuredAudioDurationSeconds:
        try container.decodeIfPresent(Double.self, forKey: .candidateMeasuredAudioDurationSeconds),
      sourceSelectedRevisionID:
        try container.decodeIfPresent(String.self, forKey: .sourceSelectedRevisionID),
      candidateSelectedRevisionID:
        try container.decodeIfPresent(String.self, forKey: .candidateSelectedRevisionID),
      algorithmFamily: try container.decode(String.self, forKey: .algorithmFamily),
      algorithmVersion: try container.decode(String.self, forKey: .algorithmVersion),
      calibrationID: try container.decodeIfPresent(String.self, forKey: .calibrationID),
      sourceContainsCandidateScore:
        try container.decode(Double.self, forKey: .sourceContainsCandidateScore),
      candidateContainsSourceScore:
        try container.decode(Double.self, forKey: .candidateContainsSourceScore),
      weightedIntersectionTotal:
        try container.decode(Double.self, forKey: .weightedIntersectionTotal),
      sourceMatchedWeightTotal:
        try container.decode(Double.self, forKey: .sourceMatchedWeightTotal),
      sourceWeightTotal:
        try container.decode(Double.self, forKey: .sourceWeightTotal),
      candidateMatchedWeightTotal:
        try container.decode(Double.self, forKey: .candidateMatchedWeightTotal),
      candidateWeightTotal:
        try container.decode(Double.self, forKey: .candidateWeightTotal),
      arrangementScore: try container.decode(Double.self, forKey: .arrangementScore),
      matchedEvidenceGroups:
        try container.decode(
          [DirectionalContainmentEvidenceGroup].self, forKey: .matchedEvidenceGroups),
      unavailableEvidenceFamilies:
        try container.decodeIfPresent(
          [DirectionalContainmentUnavailableEvidenceFamily].self,
          forKey: .unavailableEvidenceFamilies) ?? [.pcm, .excerpt],
      suppressedAnchors:
        try container.decodeIfPresent(
          [DirectionalContainmentSuppressedAnchor].self, forKey: .suppressedAnchors) ?? [],
      exactEvidenceCount: try container.decode(Int.self, forKey: .exactEvidenceCount),
      pcmEvidenceCount: try container.decodeIfPresent(Int.self, forKey: .pcmEvidenceCount),
      excerptEvidenceCount: try container.decodeIfPresent(Int.self, forKey: .excerptEvidenceCount),
      placementEvidenceCount:
        try container.decode(Int.self, forKey: .placementEvidenceCount),
      midiStructureEvidenceCount:
        try container.decode(Int.self, forKey: .midiStructureEvidenceCount),
      arrangementEvidenceCount:
        try container.decode(Int.self, forKey: .arrangementEvidenceCount),
      distinctiveAnchorCount:
        try container.decode(Int.self, forKey: .distinctiveAnchorCount),
      distinctiveEvidenceKindCount:
        try container.decode(Int.self, forKey: .distinctiveEvidenceKindCount),
      independentSourceMaterialCount:
        try container.decode(Int.self, forKey: .independentSourceMaterialCount),
      runnerUpMargin: try container.decode(Double.self, forKey: .runnerUpMargin),
      chronologyCompatibility:
        try container.decode(
          DirectionalContainmentChronologyCompatibility.self,
          forKey: .chronologyCompatibility),
      artistCompatibility:
        try container.decode(
          DirectionalContainmentArtistCompatibility.self,
          forKey: .artistCompatibility),
      conflicts:
        try container.decodeIfPresent([DirectionalContainmentConflict].self, forKey: .conflicts)
        ?? [],
      explanation: try container.decode(String.self, forKey: .explanation)
    )
  }

  public var matchedAnchorIDs: [String] {
    Array(
      Set(
        matchedEvidenceGroups.flatMap { group in
          group.sourceAnchorIDs + group.candidateAnchorIDs
        }
      )
    ).sorted()
  }
}

public struct SessionLineageCandidateScore: Codable, Sendable, Equatable {
  public let workID: String
  public let sessionID: String
  public let score: Double
  public let reviewSignalCount: Int
  public let observation: DirectionalSessionContainmentObservation

  public init(
    workID: String,
    sessionID: String,
    score: Double,
    reviewSignalCount: Int,
    observation: DirectionalSessionContainmentObservation
  ) {
    self.workID = workID
    self.sessionID = sessionID
    self.score = score
    self.reviewSignalCount = reviewSignalCount
    self.observation = observation
  }

  public var weightedContainment: Double {
    max(observation.sourceContainsCandidateScore, observation.candidateContainsSourceScore)
  }

  public var arrangementOrderScore: Double { observation.arrangementScore }
  public var distinctiveAnchorCount: Int { observation.distinctiveAnchorCount }
  public var distinctiveEvidenceKindCount: Int { observation.distinctiveEvidenceKindCount }
  public var distinctiveSourceMaterialCount: Int { observation.independentSourceMaterialCount }
  public var matchedAnchorIDs: [String] { observation.matchedAnchorIDs }
  public var artistConflict: Bool { observation.artistCompatibility == .conflict }
  public var chronologyConflict: Bool { observation.chronologyCompatibility == .conflict }
  public var directionReversal: Bool { observation.conflicts.contains(.directionReversal) }

  fileprivate func updatingObservation(
    _ transform: (DirectionalSessionContainmentObservation) ->
      DirectionalSessionContainmentObservation
  ) -> SessionLineageCandidateScore {
    SessionLineageCandidateScore(
      workID: workID,
      sessionID: sessionID,
      score: score,
      reviewSignalCount: reviewSignalCount,
      observation: transform(observation)
    )
  }
}

public struct SessionLineageResolution: Codable, Sendable, Equatable {
  public let selectedWorkID: String?
  public let proposedWorkID: String?
  public let confidence: AudioLineageConfidence
  public let bestCandidate: SessionLineageCandidateScore?
  public let candidates: [SessionLineageCandidateScore]
  public let edge: AudioLineageEdge?

  public init(
    selectedWorkID: String?,
    proposedWorkID: String?,
    confidence: AudioLineageConfidence,
    bestCandidate: SessionLineageCandidateScore?,
    candidates: [SessionLineageCandidateScore],
    edge: AudioLineageEdge?
  ) {
    self.selectedWorkID = selectedWorkID
    self.proposedWorkID = proposedWorkID
    self.confidence = confidence
    self.bestCandidate = bestCandidate
    self.candidates = candidates
    self.edge = edge
  }
}

public struct SessionContentLineageResolver: Sendable {
  public static let algorithmFamily = "session-content-lineage"
  public static let algorithmVersion = "session-content-lineage-v3"
  static let candidateGenerationEligibilityWeightVersion =
    "session-content-lineage-eligibility-weight-v2"

  public let automaticThreshold: Double
  public let suggestionThreshold: Double
  public let runnerUpMargin: Double
  public let calibration: AudioMatchingCalibration?

  public init(
    automaticThreshold: Double = 0.78,
    suggestionThreshold: Double = 0.45,
    runnerUpMargin: Double = 0.15,
    calibration: AudioMatchingCalibration? = nil
  ) {
    self.automaticThreshold = automaticThreshold
    self.suggestionThreshold = suggestionThreshold
    self.runnerUpMargin = runnerUpMargin
    self.calibration = calibration
  }

  public func resolve(
    source: SessionContentManifest,
    sourceReference: StudioRevisionReference,
    sourceEvidenceRevisionReferences: [StudioRevisionReference]? = nil,
    sourceRevisionTimestamp: Date?,
    candidates: [SessionLineageCandidate],
    rejectedWorkIDs: Set<String> = []
  ) -> SessionLineageResolution {
    let scoredByWork = Dictionary(
      grouping: candidates.map {
        score(
          source: source,
          sourceReference: sourceReference,
          sourceEvidenceRevisionReferences: sourceEvidenceRevisionReferences ?? [sourceReference],
          sourceRevisionTimestamp: sourceRevisionTimestamp,
          candidate: $0
        )
      },
      by: \.workID
    ).compactMap { _, scores in
      scores.sorted(by: candidateSort).first
    }.sorted(by: candidateSort)
    let ranked = applyingRunnerUpMargins(to: scoredByWork)
    guard let best = ranked.first else {
      return SessionLineageResolution(
        selectedWorkID: nil,
        proposedWorkID: nil,
        confidence: .unknown,
        bestCandidate: nil,
        candidates: [],
        edge: nil
      )
    }

    if rejectedWorkIDs.contains(best.workID) {
      let conflicted = best.updatingObservation {
        let conflicts = Array(Set($0.conflicts + [.durableRejection])).sorted {
          $0.rawValue < $1.rawValue
        }
        return observation(
          from: $0,
          runnerUpMargin: $0.runnerUpMargin,
          conflicts: conflicts,
          explanation: explanation(for: $0, conflicts: conflicts)
        )
      }
      return SessionLineageResolution(
        selectedWorkID: nil,
        proposedWorkID: nil,
        confidence: .conflicted,
        bestCandidate: conflicted,
        candidates: ranked.replacing(workID: conflicted.workID, with: conflicted),
        edge: nil
      )
    }

    guard
      best.reviewSignalCount > 0,
      !best.artistConflict,
      !best.chronologyConflict,
      !best.directionReversal,
      best.score >= suggestionThreshold
    else {
      return SessionLineageResolution(
        selectedWorkID: nil,
        proposedWorkID: nil,
        confidence: .unknown,
        bestCandidate: best,
        candidates: ranked,
        edge: nil
      )
    }

    let hasApplicableCalibration = calibration.map(Self.isApplicableCalibration) ?? false
    let minimumCoverage = calibration?.minimumCoverage ?? 0.5
    let minimumRunnerUpMargin = calibration?.minimumRunnerUpMargin ?? runnerUpMargin
    let canAttachAutomatically =
      hasApplicableCalibration
      && best.score >= (calibration?.automaticScoreThreshold ?? automaticThreshold)
      && best.observation.sourceContainsCandidateScore >= minimumCoverage
      && best.distinctiveAnchorCount >= 2
      && best.distinctiveSourceMaterialCount >= 2
      && best.observation.runnerUpMargin >= minimumRunnerUpMargin
      && best.observation.chronologyCompatibility == .compatible
      && best.observation.artistCompatibility == .compatible
      && Self.hasAutomaticEvidenceScope(best.observation)
      && !best.observation.conflicts.contains(.insufficientIndependentEvidence)
      && !best.observation.conflicts.contains(.incompatibleEvidenceScope)
    let confidence: AudioLineageConfidence =
      canAttachAutomatically ? .highConfidenceSessionLineage : .suggested
    let edge = edge(
      for: best, confidence: confidence, canAttachAutomatically: canAttachAutomatically)
    return SessionLineageResolution(
      selectedWorkID: canAttachAutomatically ? best.workID : nil,
      proposedWorkID: best.workID,
      confidence: confidence,
      bestCandidate: best,
      candidates: ranked,
      edge: edge
    )
  }

  private func score(
    source: SessionContentManifest,
    sourceReference: StudioRevisionReference,
    sourceEvidenceRevisionReferences: [StudioRevisionReference],
    sourceRevisionTimestamp: Date?,
    candidate: SessionLineageCandidate
  ) -> SessionLineageCandidateScore {
    // Scope and duration constrain automatic authority, not whether evidence is reviewable.
    let sourceByIdentity = Self.normalizedDecisionAnchors(in: source)
    let candidateByIdentity = Self.normalizedDecisionAnchors(in: candidate.manifest)
    let matchedPairs = Set(sourceByIdentity.keys).intersection(candidateByIdentity.keys).sorted()
      .compactMap { identity -> (source: SessionContentAnchor, candidate: SessionContentAnchor)? in
        guard let sourceAnchor = sourceByIdentity[identity],
          let candidateAnchor = candidateByIdentity[identity]
        else { return nil }
        return (source: sourceAnchor, candidate: candidateAnchor)
      }

    let sourceWeightTotal = sourceByIdentity.keys.sorted().reduce(0) {
      $0 + Self.weight(sourceByIdentity[$1]!)
    }
    let candidateWeightTotal = candidateByIdentity.keys.sorted().reduce(0) {
      $0 + Self.weight(candidateByIdentity[$1]!)
    }
    let sourceMatchedWeightTotal = matchedPairs.reduce(0) { $0 + Self.weight($1.source) }
    let candidateMatchedWeightTotal = matchedPairs.reduce(0) { $0 + Self.weight($1.candidate) }
    let sourceContainsCandidateScore =
      candidateWeightTotal > 0 ? candidateMatchedWeightTotal / candidateWeightTotal : 0
    let candidateContainsSourceScore =
      sourceWeightTotal > 0 ? sourceMatchedWeightTotal / sourceWeightTotal : 0
    let weightedIntersectionTotal = min(sourceMatchedWeightTotal, candidateMatchedWeightTotal)

    let arrangement = arrangementEvidence(for: matchedPairs)
    let evidenceGroups = evidenceGroups(for: matchedPairs, arrangement: arrangement)
    let suppressedAnchors =
      suppressedAnchors(in: source.anchors, side: .source)
      + suppressedAnchors(in: candidate.manifest.anchors, side: .candidate)
    let exactEvidenceCount =
      evidenceGroups.first(where: { $0.family == .exact })?.matchCount ?? 0
    let placementEvidenceCount =
      evidenceGroups.first(where: { $0.family == .placement })?.matchCount ?? 0
    let midiEvidenceCount =
      evidenceGroups.first(where: { $0.family == .midiStructure })?.matchCount ?? 0

    let distinctivePairs = matchedPairs.filter { Self.isDistinctive($0.source) }
    let distinctiveAnchorCount = Set(distinctivePairs.map(\.source.contentIdentity)).count
    let distinctiveEvidenceKindCount = Set(distinctivePairs.map(\.source.kind)).count
    let independentSourceMaterialCount = Set(
      distinctivePairs.compactMap { pair in
        pair.source.sourceMaterialIdentity ?? pair.source.contentIdentity
      }
    ).count
    let reviewSignalCount = matchedPairs.reduce(into: 0) { total, pair in
      guard isReviewSignal(pair.source) else { return }
      total += 1
    }

    let artistCompatibility = artistCompatibility(
      sourceArtistID: source.artistID, candidateArtistID: candidate.artistID)
    let chronologyCompatibility = chronologyCompatibility(
      sourceRevisionTimestamp: sourceRevisionTimestamp,
      candidateRevisionTimestamp: candidate.revisionTimestamp
    )
    let directionReversal =
      candidateContainsSourceScore > sourceContainsCandidateScore + 0.2
      && sourceContainsCandidateScore < 0.9
    var conflicts: [DirectionalContainmentConflict] = []
    if artistCompatibility == .conflict { conflicts.append(.artistMismatch) }
    if chronologyCompatibility == .conflict { conflicts.append(.chronologyMismatch) }
    if directionReversal { conflicts.append(.directionReversal) }
    if reviewSignalCount > 0 && independentSourceMaterialCount < 2 {
      conflicts.append(.insufficientIndependentEvidence)
    }
    if !Self.hasAutomaticEvidenceScope(
      sourceScope: source.evidenceScope,
      candidateScope: candidate.manifest.evidenceScope,
      sourceDurationPolicy: source.audioDurationPolicy,
      candidateDurationPolicy: candidate.manifest.audioDurationPolicy,
      sourceMeasuredDuration: source.measuredAudioDurationSeconds,
      candidateMeasuredDuration: candidate.manifest.measuredAudioDurationSeconds,
      sourceSelectedRevisionID: source.selectedRevisionID,
      candidateSelectedRevisionID: candidate.manifest.selectedRevisionID,
      sourceEvidenceRevisionCount: sourceEvidenceRevisionReferences.count,
      candidateEvidenceRevisionCount: candidate.evidenceRevisionReferences.count
    ) {
      conflicts.append(.incompatibleEvidenceScope)
    }

    let dominantContainment = sourceContainsCandidateScore
    let supportingContainment = candidateContainsSourceScore
    let combinedScore = min(
      1,
      max(
        0,
        dominantContainment * 0.6
          + supportingContainment * 0.25
          + arrangement.score * 0.15
      )
    )
    let provisional = DirectionalSessionContainmentObservation(
      sourceRevisionReference: sourceReference,
      candidateRevisionReference: candidate.reviewRevisionReference,
      sourceEvidenceRevisionReferences: sourceEvidenceRevisionReferences,
      candidateEvidenceRevisionReferences: candidate.evidenceRevisionReferences,
      sourceEvidenceScope: source.evidenceScope,
      candidateEvidenceScope: candidate.manifest.evidenceScope,
      sourceAudioDurationPolicy: source.audioDurationPolicy,
      candidateAudioDurationPolicy: candidate.manifest.audioDurationPolicy,
      sourceMeasuredAudioDurationSeconds: source.measuredAudioDurationSeconds,
      candidateMeasuredAudioDurationSeconds: candidate.manifest.measuredAudioDurationSeconds,
      sourceSelectedRevisionID: source.selectedRevisionID,
      candidateSelectedRevisionID: candidate.manifest.selectedRevisionID,
      algorithmFamily: Self.algorithmFamily,
      algorithmVersion: Self.algorithmVersion,
      calibrationID: calibration?.id,
      sourceContainsCandidateScore: sourceContainsCandidateScore,
      candidateContainsSourceScore: candidateContainsSourceScore,
      weightedIntersectionTotal: weightedIntersectionTotal,
      sourceMatchedWeightTotal: sourceMatchedWeightTotal,
      sourceWeightTotal: sourceWeightTotal,
      candidateMatchedWeightTotal: candidateMatchedWeightTotal,
      candidateWeightTotal: candidateWeightTotal,
      arrangementScore: arrangement.score,
      matchedEvidenceGroups: evidenceGroups,
      unavailableEvidenceFamilies: [.pcm, .excerpt],
      suppressedAnchors: suppressedAnchors,
      exactEvidenceCount: exactEvidenceCount,
      placementEvidenceCount: placementEvidenceCount,
      midiStructureEvidenceCount: midiEvidenceCount,
      arrangementEvidenceCount: arrangement.evidenceCount,
      distinctiveAnchorCount: distinctiveAnchorCount,
      distinctiveEvidenceKindCount: distinctiveEvidenceKindCount,
      independentSourceMaterialCount: independentSourceMaterialCount,
      runnerUpMargin: 0,
      chronologyCompatibility: chronologyCompatibility,
      artistCompatibility: artistCompatibility,
      conflicts: conflicts,
      explanation: ""
    )
    let explained = observation(
      from: provisional,
      runnerUpMargin: 0,
      conflicts: conflicts,
      explanation: explanation(for: provisional, conflicts: conflicts)
    )
    return SessionLineageCandidateScore(
      workID: candidate.workID,
      sessionID: candidate.sessionID,
      score: combinedScore,
      reviewSignalCount: reviewSignalCount,
      observation: explained
    )
  }

  private func applyingRunnerUpMargins(
    to candidates: [SessionLineageCandidateScore]
  ) -> [SessionLineageCandidateScore] {
    candidates.enumerated().map { index, candidate in
      let nextScore = candidates.dropFirst(index + 1).first?.score ?? 0
      let margin = max(0, candidate.score - nextScore)
      return candidate.updatingObservation { currentObservation in
        var conflicts = currentObservation.conflicts
        if margin < (calibration?.minimumRunnerUpMargin ?? runnerUpMargin)
          && candidate.reviewSignalCount > 0
        {
          conflicts.append(.closeRunnerUp)
        }
        let normalized = Array(Set(conflicts)).sorted { $0.rawValue < $1.rawValue }
        return self.observation(
          from: currentObservation,
          runnerUpMargin: margin,
          conflicts: normalized,
          explanation: explanation(
            for: currentObservation, conflicts: normalized, runnerUpMargin: margin)
        )
      }
    }
  }

  private func observation(
    from observation: DirectionalSessionContainmentObservation,
    runnerUpMargin: Double,
    conflicts: [DirectionalContainmentConflict],
    explanation: String
  ) -> DirectionalSessionContainmentObservation {
    DirectionalSessionContainmentObservation(
      sourceRevisionReference: observation.sourceRevisionReference,
      candidateRevisionReference: observation.candidateRevisionReference,
      sourceEvidenceRevisionReferences: observation.sourceEvidenceRevisionReferences,
      candidateEvidenceRevisionReferences: observation.candidateEvidenceRevisionReferences,
      sourceEvidenceScope: observation.sourceEvidenceScope,
      candidateEvidenceScope: observation.candidateEvidenceScope,
      sourceAudioDurationPolicy: observation.sourceAudioDurationPolicy,
      candidateAudioDurationPolicy: observation.candidateAudioDurationPolicy,
      sourceMeasuredAudioDurationSeconds: observation.sourceMeasuredAudioDurationSeconds,
      candidateMeasuredAudioDurationSeconds: observation.candidateMeasuredAudioDurationSeconds,
      sourceSelectedRevisionID: observation.sourceSelectedRevisionID,
      candidateSelectedRevisionID: observation.candidateSelectedRevisionID,
      algorithmFamily: observation.algorithmFamily,
      algorithmVersion: observation.algorithmVersion,
      calibrationID: observation.calibrationID,
      sourceContainsCandidateScore: observation.sourceContainsCandidateScore,
      candidateContainsSourceScore: observation.candidateContainsSourceScore,
      weightedIntersectionTotal: observation.weightedIntersectionTotal,
      sourceMatchedWeightTotal: observation.sourceMatchedWeightTotal,
      sourceWeightTotal: observation.sourceWeightTotal,
      candidateMatchedWeightTotal: observation.candidateMatchedWeightTotal,
      candidateWeightTotal: observation.candidateWeightTotal,
      arrangementScore: observation.arrangementScore,
      matchedEvidenceGroups: observation.matchedEvidenceGroups,
      unavailableEvidenceFamilies: observation.unavailableEvidenceFamilies,
      suppressedAnchors: observation.suppressedAnchors,
      exactEvidenceCount: observation.exactEvidenceCount,
      pcmEvidenceCount: observation.pcmEvidenceCount,
      excerptEvidenceCount: observation.excerptEvidenceCount,
      placementEvidenceCount: observation.placementEvidenceCount,
      midiStructureEvidenceCount: observation.midiStructureEvidenceCount,
      arrangementEvidenceCount: observation.arrangementEvidenceCount,
      distinctiveAnchorCount: observation.distinctiveAnchorCount,
      distinctiveEvidenceKindCount: observation.distinctiveEvidenceKindCount,
      independentSourceMaterialCount: observation.independentSourceMaterialCount,
      runnerUpMargin: runnerUpMargin,
      chronologyCompatibility: observation.chronologyCompatibility,
      artistCompatibility: observation.artistCompatibility,
      conflicts: conflicts,
      explanation: explanation
    )
  }

  private func edge(
    for candidate: SessionLineageCandidateScore,
    confidence: AudioLineageConfidence,
    canAttachAutomatically: Bool
  ) -> AudioLineageEdge {
    let observation = candidate.observation
    let evidence = [
      AudioMatchEvidence(
        kind: .arrangementAnchor,
        score: max(
          observation.sourceContainsCandidateScore,
          observation.candidateContainsSourceScore
        ),
        explanation:
          "Directional containment weighted \(Self.percent(observation.sourceContainsCandidateScore)) of the source and \(Self.percent(observation.candidateContainsSourceScore)) of the candidate."
      ),
      AudioMatchEvidence(
        kind: .arrangementAnchor,
        score: observation.arrangementScore,
        explanation:
          "Arrangement evidence preserved \(Self.percent(observation.arrangementScore)) of comparable ordering across \(observation.arrangementEvidenceCount) matched placements."
      ),
      AudioMatchEvidence(
        kind: .chronology,
        score: observation.runnerUpMargin,
        explanation:
          "Chronology is \(observation.chronologyCompatibility.rawValue); runner-up margin \(Self.percent(observation.runnerUpMargin))."
      ),
    ]
    return AudioLineageEdge(
      id: StableID.forValue(
        "session-lineage:\(observation.sourceRevisionReference.id):\(observation.candidateRevisionReference.id)"
      ),
      sourceNodeID: observation.sourceRevisionReference.sessionID,
      targetNodeID: candidate.workID,
      relationship: .sessionDerivedFrom,
      confidence: confidence,
      explanation:
        canAttachAutomatically
        ? observation.explanation
        : "Directional containment points at a likely ancestor Session, but review is still required.",
      algorithmVersion: Self.algorithmVersion,
      calibrationID: calibration?.id,
      evidence: evidence
    )
  }

  static func normalizedDecisionAnchors(
    in manifest: SessionContentManifest
  ) -> [String: SessionContentAnchor] {
    Dictionary(
      grouping: manifest.anchors.filter(Self.isDecisionEligible),
      by: \.contentIdentity
    ).compactMapValues { anchors in
      anchors.sorted(by: decisionAnchorPrecedes).first
    }
  }

  private static func decisionAnchorPrecedes(
    _ left: SessionContentAnchor,
    _ right: SessionContentAnchor
  ) -> Bool {
    let leftWeight = weight(left)
    let rightWeight = weight(right)
    if leftWeight != rightWeight { return leftWeight > rightWeight }
    let leftKey = decisionAnchorKey(left)
    let rightKey = decisionAnchorKey(right)
    return leftKey.lexicographicallyPrecedes(rightKey)
  }

  private static func decisionAnchorKey(_ anchor: SessionContentAnchor) -> [String] {
    [
      anchor.contentIdentity,
      anchor.identityEvidence.rawValue,
      anchor.kind.rawValue,
      String(anchor.corpusFrequency),
      anchor.sourceMaterialIdentity ?? "",
      anchor.arrangementPositionBeats.map { String(format: "%016llx", $0.bitPattern) } ?? "",
      anchor.measuredAudioDurationSeconds.map { String(format: "%016llx", $0.bitPattern) } ?? "",
      anchor.id,
    ]
  }

  private func evidenceGroups(
    for matchedPairs: [(source: SessionContentAnchor, candidate: SessionContentAnchor)],
    arrangement: ArrangementEvidence
  ) -> [DirectionalContainmentEvidenceGroup] {
    var grouped: [DirectionalContainmentEvidenceFamily: (Set<String>, Set<String>)] = [:]
    for pair in matchedPairs {
      guard let family = evidenceFamily(for: pair.source) else { continue }
      guard family != .arrangement else { continue }
      grouped[family, default: ([], [])].0.insert(pair.source.id)
      grouped[family, default: ([], [])].1.insert(pair.candidate.id)
    }
    if !arrangement.sourceAnchorIDs.isEmpty || !arrangement.candidateAnchorIDs.isEmpty {
      grouped[.arrangement] = (
        Set(arrangement.sourceAnchorIDs), Set(arrangement.candidateAnchorIDs)
      )
    }
    return grouped.compactMap { family, anchors in
      guard !anchors.0.isEmpty || !anchors.1.isEmpty else { return nil }
      return DirectionalContainmentEvidenceGroup(
        family: family,
        sourceAnchorIDs: Array(anchors.0),
        candidateAnchorIDs: Array(anchors.1)
      )
    }.sorted { $0.family.rawValue < $1.family.rawValue }
  }

  private func evidenceFamily(
    for anchor: SessionContentAnchor
  ) -> DirectionalContainmentEvidenceFamily? {
    switch anchor.kind {
    case .projectRecording, .derivedProjectAudio, .externalLibrarySample:
      return anchor.identityEvidence == .verifiedContent ? .exact : nil
    case .midiPhrase:
      return .midiStructure
    case .clipPlacement:
      return .placement
    case .templateStructure:
      return .arrangement
    }
  }

  private func suppressedAnchors(
    in anchors: [SessionContentAnchor],
    side: DirectionalContainmentAnchorSide
  ) -> [DirectionalContainmentSuppressedAnchor] {
    anchors.compactMap { anchor in
      guard let reason = suppressionReason(for: anchor) else { return nil }
      return DirectionalContainmentSuppressedAnchor(
        side: side,
        anchorID: anchor.id,
        contentIdentity: anchor.contentIdentity,
        kind: anchor.kind,
        corpusFrequency: anchor.corpusFrequency,
        reason: reason
      )
    }
  }

  private func suppressionReason(
    for anchor: SessionContentAnchor
  ) -> DirectionalContainmentSuppressionReason? {
    if anchor.identityEvidence == .mutableReference { return .unverifiedMutableIdentity }
    if anchor.kind == .templateStructure { return .templateMaterial }
    if anchor.kind == .externalLibrarySample { return .externalLibraryMaterial }
    if anchor.corpusFrequency > 4 { return .commonCorpusMaterial }
    return nil
  }

  private func isReviewSignal(_ anchor: SessionContentAnchor) -> Bool {
    switch anchor.kind {
    case .projectRecording, .derivedProjectAudio, .clipPlacement:
      return anchor.corpusFrequency <= 4
    case .midiPhrase:
      return anchor.corpusFrequency <= 2
    case .externalLibrarySample:
      return anchor.corpusFrequency <= 2
    case .templateStructure:
      return false
    }
  }

  static func candidateGenerationWeight(_ anchor: SessionContentAnchor) -> Double {
    isDecisionEligible(anchor) ? weight(anchor) : 0
  }

  static func isDecisionEligible(_ anchor: SessionContentAnchor) -> Bool {
    guard anchor.identityEvidence != .mutableReference else { return false }
    guard anchor.kind != .templateStructure, anchor.kind != .externalLibrarySample else {
      return false
    }
    return anchor.corpusFrequency <= 4
  }

  private static func weight(_ anchor: SessionContentAnchor) -> Double {
    let base: Double =
      switch anchor.kind {
      case .projectRecording: 1
      case .derivedProjectAudio: 0.85
      case .midiPhrase: 0.75
      case .clipPlacement: 0.65
      case .externalLibrarySample: 0.15
      case .templateStructure: 0.05
      }
    return base / sqrt(Double(max(1, anchor.corpusFrequency)))
  }

  private static func isDistinctive(_ anchor: SessionContentAnchor) -> Bool {
    guard isDecisionEligible(anchor) else { return false }
    return switch anchor.kind {
    case .projectRecording, .derivedProjectAudio:
      anchor.identityEvidence == .verifiedContent
    case .clipPlacement:
      anchor.identityEvidence != .mutableReference
    case .midiPhrase, .externalLibrarySample, .templateStructure: false
    }
  }

  private func chronologyCompatibility(
    sourceRevisionTimestamp: Date?,
    candidateRevisionTimestamp: Date?
  ) -> DirectionalContainmentChronologyCompatibility {
    guard let sourceRevisionTimestamp, let candidateRevisionTimestamp else { return .unknown }
    return candidateRevisionTimestamp <= sourceRevisionTimestamp ? .compatible : .conflict
  }

  private func artistCompatibility(
    sourceArtistID: String?,
    candidateArtistID: String?
  ) -> DirectionalContainmentArtistCompatibility {
    guard let sourceArtistID, let candidateArtistID else { return .unknown }
    return sourceArtistID == candidateArtistID ? .compatible : .conflict
  }

  private func explanation(
    for observation: DirectionalSessionContainmentObservation,
    conflicts: [DirectionalContainmentConflict],
    runnerUpMargin: Double? = nil
  ) -> String {
    let margin = runnerUpMargin ?? observation.runnerUpMargin
    let distinctiveText =
      "Distinctive evidence contributes \(Self.counted(observation.distinctiveAnchorCount, singular: "anchor")) across \(Self.counted(observation.distinctiveEvidenceKindCount, singular: "evidence kind")) and \(Self.counted(observation.independentSourceMaterialCount, singular: "independent source material"))."
    let suppressionText = suppressionSummary(for: observation.suppressedAnchors)
    let conflictText =
      conflicts.isEmpty
      ? "No blocking conflicts were detected."
      : "Conflicts: \(conflicts.map(\.rawValue).sorted().joined(separator: ", "))."
    return
      "Review anchors are \(observation.sourceRevisionReference.revisionID) and \(observation.candidateRevisionReference.revisionID), while evidence spans \(Self.counted(observation.sourceEvidenceRevisionReferences.count, singular: "source revision")) and \(Self.counted(observation.candidateEvidenceRevisionReferences.count, singular: "candidate revision")). Evidence scope is \(observation.sourceEvidenceScope.rawValue)/\(observation.candidateEvidenceScope.rawValue) with \(observation.sourceAudioDurationPolicy.rawValue)/\(observation.candidateAudioDurationPolicy.rawValue) audio policy and measured duration \(Self.duration(observation.sourceMeasuredAudioDurationSeconds))/\(Self.duration(observation.candidateMeasuredAudioDurationSeconds)). The source contains \(Self.percent(observation.sourceContainsCandidateScore)) of the candidate's weighted material, while the candidate contains \(Self.percent(observation.candidateContainsSourceScore)) of the source. Matched evidence includes \(Self.counted(observation.exactEvidenceCount, singular: "exact anchor")), \(Self.counted(observation.placementEvidenceCount, singular: "placement")), \(Self.counted(observation.midiStructureEvidenceCount, singular: "MIDI-structure anchor")), and \(Self.counted(observation.arrangementEvidenceCount, singular: "arrangement comparison")). \(distinctiveText) \(suppressionText) PCM and excerpt evidence are unavailable for \(observation.algorithmVersion). Artist compatibility is \(observation.artistCompatibility.rawValue); chronology is \(observation.chronologyCompatibility.rawValue); runner-up margin is \(Self.percent(margin)). \(conflictText)"
  }

  private static func duration(_ value: Double?) -> String {
    guard let value, value.isFinite, value > 0 else { return "unknown" }
    return String(format: "%.3fs", value)
  }

  private static func percent(_ value: Double) -> String {
    "\(Int((min(1, max(0, value)) * 100).rounded()))%"
  }

  private func suppressionSummary(
    for anchors: [DirectionalContainmentSuppressedAnchor]
  ) -> String {
    guard !anchors.isEmpty else { return "No anchors were suppressed." }
    let counts = Dictionary(grouping: anchors, by: \.reason).map { reason, grouped in
      switch reason {
      case .commonCorpusMaterial:
        return Self.counted(grouped.count, singular: "common-corpus anchor")
      case .externalLibraryMaterial:
        return Self.counted(grouped.count, singular: "external-library anchor")
      case .templateMaterial:
        return Self.counted(grouped.count, singular: "template anchor")
      case .unverifiedMutableIdentity:
        return Self.counted(grouped.count, singular: "unverified mutable anchor")
      }
    }.sorted()
    return "Suppressed anchors include \(counts.joined(separator: ", "))."
  }

  private static func counted(
    _ count: Int,
    singular: String
  ) -> String {
    let plural =
      singular.hasSuffix("s")
      ? singular + "es"
      : singular + "s"
    return "\(count) \(count == 1 ? singular : plural)"
  }

  public static func isApplicableCalibration(_ calibration: AudioMatchingCalibration) -> Bool {
    calibration.algorithmFamily == algorithmFamily
      && calibration.algorithmVersion == algorithmVersion
      && calibration.materialClass == .mixedCorpus
      && calibration.validatedExampleCount > 0
      && !calibration.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && calibration.automaticScoreThreshold.isFinite
      && (0...1).contains(calibration.automaticScoreThreshold)
      && calibration.minimumCoverage.isFinite
      && (0...1).contains(calibration.minimumCoverage)
      && calibration.minimumRunnerUpMargin.isFinite
      && (0...1).contains(calibration.minimumRunnerUpMargin)
  }

  private static func hasAutomaticEvidenceScope(
    _ observation: DirectionalSessionContainmentObservation
  ) -> Bool {
    hasAutomaticEvidenceScope(
      sourceScope: observation.sourceEvidenceScope,
      candidateScope: observation.candidateEvidenceScope,
      sourceDurationPolicy: observation.sourceAudioDurationPolicy,
      candidateDurationPolicy: observation.candidateAudioDurationPolicy,
      sourceMeasuredDuration: observation.sourceMeasuredAudioDurationSeconds,
      candidateMeasuredDuration: observation.candidateMeasuredAudioDurationSeconds,
      sourceSelectedRevisionID: observation.sourceSelectedRevisionID,
      candidateSelectedRevisionID: observation.candidateSelectedRevisionID,
      sourceEvidenceRevisionCount: observation.sourceEvidenceRevisionReferences.count,
      candidateEvidenceRevisionCount: observation.candidateEvidenceRevisionReferences.count)
  }

  private static func hasAutomaticEvidenceScope(
    sourceScope: SessionContentEvidenceScope,
    candidateScope: SessionContentEvidenceScope,
    sourceDurationPolicy: SessionContentAudioDurationPolicy,
    candidateDurationPolicy: SessionContentAudioDurationPolicy,
    sourceMeasuredDuration: Double?,
    candidateMeasuredDuration: Double?,
    sourceSelectedRevisionID: String?,
    candidateSelectedRevisionID: String?,
    sourceEvidenceRevisionCount: Int,
    candidateEvidenceRevisionCount: Int
  ) -> Bool {
    sourceScope != .fullSession
      && candidateScope != .fullSession
      && sourceDurationPolicy == .completeFile
      && candidateDurationPolicy == .completeFile
      && sourceMeasuredDuration.map { $0.isFinite && $0 > 0 } == true
      && candidateMeasuredDuration.map { $0.isFinite && $0 > 0 } == true
      && sourceSelectedRevisionID?.isEmpty == false
      && candidateSelectedRevisionID?.isEmpty == false
      && sourceEvidenceRevisionCount == 1
      && candidateEvidenceRevisionCount == 1
  }
}

private struct ArrangementEvidence {
  let score: Double
  let evidenceCount: Int
  let sourceAnchorIDs: [String]
  let candidateAnchorIDs: [String]
}

private func arrangementEvidence(
  for matchedPairs: [(source: SessionContentAnchor, candidate: SessionContentAnchor)]
) -> ArrangementEvidence {
  let positioned = matchedPairs.compactMap {
    pair -> (SessionContentAnchor, SessionContentAnchor)? in
    guard pair.source.arrangementPositionBeats != nil,
      pair.candidate.arrangementPositionBeats != nil
    else { return nil }
    return (pair.source, pair.candidate)
  }
  guard !positioned.isEmpty else {
    return ArrangementEvidence(
      score: 0, evidenceCount: 0, sourceAnchorIDs: [], candidateAnchorIDs: [])
  }
  guard positioned.count > 1 else {
    return ArrangementEvidence(
      score: 1,
      evidenceCount: 1,
      sourceAnchorIDs: positioned.map(\.0.id),
      candidateAnchorIDs: positioned.map(\.1.id)
    )
  }
  var comparable = 0
  var agreeing = 0
  for left in 0..<(positioned.count - 1) {
    for right in (left + 1)..<positioned.count {
      comparable += 1
      let sourceOrder =
        positioned[left].0.arrangementPositionBeats == positioned[right].0.arrangementPositionBeats
        ? 0
        : (positioned[left].0.arrangementPositionBeats! < positioned[right].0
          .arrangementPositionBeats! ? -1 : 1)
      let candidateOrder =
        positioned[left].1.arrangementPositionBeats == positioned[right].1.arrangementPositionBeats
        ? 0
        : (positioned[left].1.arrangementPositionBeats! < positioned[right].1
          .arrangementPositionBeats! ? -1 : 1)
      if sourceOrder == candidateOrder { agreeing += 1 }
    }
  }
  return ArrangementEvidence(
    score: comparable > 0 ? Double(agreeing) / Double(comparable) : 0,
    evidenceCount: max(agreeing, positioned.count),
    sourceAnchorIDs: positioned.map(\.0.id),
    candidateAnchorIDs: positioned.map(\.1.id)
  )
}

private func candidateSort(
  _ left: SessionLineageCandidateScore, _ right: SessionLineageCandidateScore
) -> Bool {
  if left.score != right.score { return left.score > right.score }
  return sessionLineageCandidateIdentityPrecedes(
    workID: left.workID,
    sessionID: left.sessionID,
    otherWorkID: right.workID,
    otherSessionID: right.sessionID)
}

func sessionLineageCandidateIdentityPrecedes(
  workID: String,
  sessionID: String,
  otherWorkID: String,
  otherSessionID: String
) -> Bool {
  if workID != otherWorkID { return workID < otherWorkID }
  return sessionID < otherSessionID
}

extension Array where Element == SessionLineageCandidateScore {
  fileprivate func replacing(workID: String, with replacement: SessionLineageCandidateScore)
    -> [SessionLineageCandidateScore]
  {
    map { $0.workID == workID ? replacement : $0 }
  }
}
