import Foundation

public enum OrganisationConfidence: String, Codable, Sendable, CaseIterable {
  case confirmed
  case automatic
  case suggested
  case unresolved
}

public enum OrganisationEvidenceKind: String, Codable, Sendable, CaseIterable {
  case ownerAncestor
  case canonicalTitle
  case sharedOwner
  case sharedCanonicalTitle
  case userOverride
  case conflictingOwner
  case similarTitle
  case contentLineage
}

public struct OrganisationEvidence: Codable, Identifiable, Sendable {
  public let id: String
  public let kind: OrganisationEvidenceKind
  public let score: Double
  public let explanation: String
  public let sourceURLs: [URL]
  public let isContradiction: Bool

  public init(
    id: String,
    kind: OrganisationEvidenceKind,
    score: Double,
    explanation: String,
    sourceURLs: [URL] = [],
    isContradiction: Bool = false
  ) {
    self.id = id
    self.kind = kind
    self.score = score
    self.explanation = explanation
    self.sourceURLs = sourceURLs
    self.isContradiction = isContradiction
  }
}

public enum TitleEvidenceSource: String, Codable, Sendable, CaseIterable {
  case projectFolder
  case currentSet
  case backupSet
  case ancestorFolder
  case userOverride
}

public struct CanonicalTitleEvidence: Codable, Identifiable, Sendable {
  public let id: String
  public let rawValue: String
  public let canonicalValue: String
  public let canonicalKey: String
  public let source: TitleEvidenceSource
  public let sourceURL: URL
  public let weight: Double
  public let removedContext: [String]

  public init(
    id: String,
    rawValue: String,
    canonicalValue: String,
    canonicalKey: String,
    source: TitleEvidenceSource,
    sourceURL: URL,
    weight: Double,
    removedContext: [String]
  ) {
    self.id = id
    self.rawValue = rawValue
    self.canonicalValue = canonicalValue
    self.canonicalKey = canonicalKey
    self.source = source
    self.sourceURL = sourceURL
    self.weight = weight
    self.removedContext = removedContext
  }
}

public struct ArtistIdentity: Codable, Identifiable, Sendable {
  public let id: String
  public let displayName: String
  public let confidence: OrganisationConfidence
  public let evidence: [OrganisationEvidence]

  public init(
    id: String,
    displayName: String,
    confidence: OrganisationConfidence,
    evidence: [OrganisationEvidence]
  ) {
    self.id = id
    self.displayName = displayName
    self.confidence = confidence
    self.evidence = evidence
  }
}

public enum SessionRole: String, Codable, Sendable, CaseIterable {
  case production
  case vocalEdit
  case stemPreparation
  case mix
  case master
  case live
  case unknown
}

public enum RevisionTimestampSource: String, Codable, Sendable, CaseIterable {
  case embeddedBackupFilename
  case explicitFilenameDate
  case fileModificationTime
  case unavailable
}

public struct RevisionTimestamp: Codable, Sendable {
  public let value: Date?
  public let source: RevisionTimestampSource
  public let confidence: OrganisationConfidence
  public let explanation: String

  public init(
    value: Date?,
    source: RevisionTimestampSource,
    confidence: OrganisationConfidence,
    explanation: String
  ) {
    self.value = value
    self.source = source
    self.confidence = confidence
    self.explanation = explanation
  }
}

public struct StudioSetRevision: Codable, Identifiable, Sendable {
  public let id: String
  public let set: AbletonSet
  public let revisionLabel: String?
  public let filenameInterpretation: StudioFilenameInterpretation?
  public let qualifierDecisions: [RevisionQualifierDecision]
  public let timestamp: RevisionTimestamp

  public init(
    id: String,
    set: AbletonSet,
    revisionLabel: String?,
    filenameInterpretation: StudioFilenameInterpretation? = nil,
    qualifierDecisions: [RevisionQualifierDecision] = [],
    timestamp: RevisionTimestamp
  ) {
    self.id = id
    self.set = set
    self.revisionLabel = revisionLabel
    self.filenameInterpretation = filenameInterpretation
    self.qualifierDecisions = qualifierDecisions
    self.timestamp = timestamp
  }
}

public enum RevisionQualifierFacet: String, Codable, Sendable, CaseIterable {
  case variant
  case sessionRole
  case workflowState
  case revisionIdentifier
}

public struct RevisionQualifierDecision: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let revisionID: String
  public let facet: RevisionQualifierFacet
  public let rawToken: String
  public let accepted: Bool
  public let replacementValue: String?
  public let parserVersion: String
  public let decidedAt: Date

  public init(
    id: String,
    revisionID: String,
    facet: RevisionQualifierFacet,
    rawToken: String,
    accepted: Bool,
    replacementValue: String? = nil,
    parserVersion: String,
    decidedAt: Date
  ) {
    self.id = id
    self.revisionID = revisionID
    self.facet = facet
    self.rawToken = rawToken
    self.accepted = accepted
    self.replacementValue = replacementValue
    self.parserVersion = parserVersion
    self.decidedAt = decidedAt
  }
}

public struct StudioSession: Codable, Identifiable, Sendable {
  public let id: String
  public let rootURL: URL
  public let displayName: String
  public let role: SessionRole
  public let canonicalTitle: String
  public let canonicalTitleKey: String
  public let titleEvidence: [CanonicalTitleEvidence]
  public let revisions: [StudioSetRevision]
  public let previewAssets: [PreviewAsset]

  public init(
    id: String,
    rootURL: URL,
    displayName: String,
    role: SessionRole,
    canonicalTitle: String,
    canonicalTitleKey: String,
    titleEvidence: [CanonicalTitleEvidence],
    revisions: [StudioSetRevision],
    previewAssets: [PreviewAsset]
  ) {
    self.id = id
    self.rootURL = rootURL
    self.displayName = displayName
    self.role = role
    self.canonicalTitle = canonicalTitle
    self.canonicalTitleKey = canonicalTitleKey
    self.titleEvidence = titleEvidence
    self.revisions = revisions
    self.previewAssets = previewAssets
  }
}

public struct StudioWork: Codable, Identifiable, Sendable {
  public let id: String
  public let artist: ArtistIdentity
  public let displayName: String
  public let canonicalKey: String
  public let confidence: OrganisationConfidence
  public let evidence: [OrganisationEvidence]
  public let sessions: [StudioSession]

  public init(
    id: String,
    artist: ArtistIdentity,
    displayName: String,
    canonicalKey: String,
    confidence: OrganisationConfidence,
    evidence: [OrganisationEvidence],
    sessions: [StudioSession]
  ) {
    self.id = id
    self.artist = artist
    self.displayName = displayName
    self.canonicalKey = canonicalKey
    self.confidence = confidence
    self.evidence = evidence
    self.sessions = sessions
  }
}

public struct WorkMatchReview: Codable, Identifiable, Sendable {
  public let id: String
  public let sourceWorkID: String
  public let candidateWorkID: String
  public let confidence: OrganisationConfidence
  public let score: Double
  public let evidence: [OrganisationEvidence]
  public let contentObservation: DirectionalSessionContainmentObservation?

  public init(
    id: String,
    sourceWorkID: String,
    candidateWorkID: String,
    confidence: OrganisationConfidence,
    score: Double,
    evidence: [OrganisationEvidence],
    contentObservation: DirectionalSessionContainmentObservation? = nil
  ) {
    self.id = id
    self.sourceWorkID = sourceWorkID
    self.candidateWorkID = candidateWorkID
    self.confidence = confidence
    self.score = score
    self.evidence = evidence
    self.contentObservation = contentObservation
  }
}

public struct SessionOrganisationOverride: Codable, Sendable {
  public let sessionID: String
  public let artistName: String?
  public let workName: String?
  public let groupingKey: String?
  public let keepSeparate: Bool

  public init(
    sessionID: String,
    artistName: String? = nil,
    workName: String? = nil,
    groupingKey: String? = nil,
    keepSeparate: Bool = false
  ) {
    self.sessionID = sessionID
    self.artistName = artistName
    self.workName = workName
    self.groupingKey = groupingKey
    self.keepSeparate = keepSeparate
  }
}

public struct OrganisationOverrides: Codable, Sendable {
  public let sessionOverrides: [SessionOrganisationOverride]
  public let qualifierDecisions: [RevisionQualifierDecision]

  public init(
    sessionOverrides: [SessionOrganisationOverride] = [],
    qualifierDecisions: [RevisionQualifierDecision] = []
  ) {
    self.sessionOverrides = sessionOverrides
    self.qualifierDecisions = qualifierDecisions
  }

  private enum CodingKeys: String, CodingKey {
    case sessionOverrides
    case qualifierDecisions
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    sessionOverrides =
      try container.decodeIfPresent(
        [SessionOrganisationOverride].self, forKey: .sessionOverrides) ?? []
    qualifierDecisions =
      try container.decodeIfPresent(
        [RevisionQualifierDecision].self, forKey: .qualifierDecisions) ?? []
  }
}

public struct WorkCatalog: Codable, Sendable {
  public let generatedAt: Date
  public let algorithmVersion: String
  public let sourceRoots: [URL]
  public let works: [StudioWork]
  public let reviewQueue: [WorkMatchReview]

  public init(
    generatedAt: Date,
    algorithmVersion: String,
    sourceRoots: [URL],
    works: [StudioWork],
    reviewQueue: [WorkMatchReview]
  ) {
    self.generatedAt = generatedAt
    self.algorithmVersion = algorithmVersion
    self.sourceRoots = sourceRoots
    self.works = works
    self.reviewQueue = reviewQueue
  }

  public var sessionsByID: [String: StudioSession] {
    Dictionary(uniqueKeysWithValues: works.flatMap(\.sessions).map { ($0.id, $0) })
  }

  public var workIdentitiesBySessionID: [String: LogicalWorkIdentity] {
    Dictionary(
      uniqueKeysWithValues: works.flatMap { work in
        work.sessions.map {
          ($0.id, LogicalWorkIdentity(id: work.id, displayName: work.displayName))
        }
      })
  }
}
