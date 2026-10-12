import Foundation

public enum SampleLocationAvailability: String, Codable, Sendable, CaseIterable {
  case available
  case unavailable
  case permissionRequired
}

public struct SampleLocation: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let fileURL: URL
  public let displayName: String
  public let availability: SampleLocationAvailability
  public let requiresBookmarkRefresh: Bool
  public let lastScannedAt: Date?
  public let sampleCount: Int

  public init(
    id: String,
    fileURL: URL,
    displayName: String,
    availability: SampleLocationAvailability,
    requiresBookmarkRefresh: Bool,
    lastScannedAt: Date?,
    sampleCount: Int
  ) {
    self.id = id
    self.fileURL = fileURL
    self.displayName = displayName
    self.availability = availability
    self.requiresBookmarkRefresh = requiresBookmarkRefresh
    self.lastScannedAt = lastScannedAt
    self.sampleCount = sampleCount
  }
}

public enum SampleAvailability: String, Codable, Sendable, CaseIterable {
  case available
  case unavailable
  case missing
  case disconnected
}

public enum SampleClassification: String, Codable, Sendable, CaseIterable {
  case externalLibraryOriginal
  case projectRecorded
  case projectImported
  case projectProcessed
  case collectedProjectCopy
  case looseUnassigned
  case missingReference
}

public enum SampleFamilyRelationship: String, Codable, Sendable, CaseIterable {
  case exactDuplicateOf
  case collectedCopyOf
  case possibleSourceOf
  case usedBy
}

public enum SampleEvidenceTier: Int, Codable, Sendable, CaseIterable {
  case exactIdentity = 1
  case stagedExactHash = 2
  case technicalOrAudioFingerprint = 3
  case parsedDependencyPath = 4
  case filenameFolderTimeSimilarity = 5
}

public struct SampleFamilyEvidence: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let sourceSampleID: String
  public let targetSampleID: String
  public let relationship: SampleFamilyRelationship
  public let score: Double
  public let tier: SampleEvidenceTier
  public let explanation: String
  public let algorithmVersion: String
  public let userDecision: Bool?

  public init(
    id: String,
    sourceSampleID: String,
    targetSampleID: String,
    relationship: SampleFamilyRelationship,
    score: Double,
    tier: SampleEvidenceTier,
    explanation: String,
    algorithmVersion: String,
    userDecision: Bool? = nil
  ) {
    self.id = id
    self.sourceSampleID = sourceSampleID
    self.targetSampleID = targetSampleID
    self.relationship = relationship
    self.score = score
    self.tier = tier
    self.explanation = explanation
    self.algorithmVersion = algorithmVersion
    self.userDecision = userDecision
  }
}

public struct SampleMatchReview: Codable, Identifiable, Sendable, Equatable {
  public var id: String { evidence.id }
  public let evidence: SampleFamilyEvidence
  public let candidateName: String
  public let candidateURL: URL
  public let candidateClassification: SampleClassification

  public init(
    evidence: SampleFamilyEvidence,
    candidateName: String,
    candidateURL: URL,
    candidateClassification: SampleClassification
  ) {
    self.evidence = evidence
    self.candidateName = candidateName
    self.candidateURL = candidateURL
    self.candidateClassification = candidateClassification
  }
}

public struct SampleTechnicalMetadata: Codable, Sendable, Equatable {
  public let format: String
  public let bytes: Int64
  public let durationSeconds: Double?
  public let sampleRate: Double?
  public let bitDepth: Int?
  public let channelCount: Int?
  public let createdAt: Date?
  public let modifiedAt: Date?
  public let fileResourceIdentifier: String?

  public init(
    format: String,
    bytes: Int64,
    durationSeconds: Double?,
    sampleRate: Double?,
    bitDepth: Int?,
    channelCount: Int?,
    createdAt: Date?,
    modifiedAt: Date?,
    fileResourceIdentifier: String?
  ) {
    self.format = format
    self.bytes = bytes
    self.durationSeconds = durationSeconds
    self.sampleRate = sampleRate
    self.bitDepth = bitDepth
    self.channelCount = channelCount
    self.createdAt = createdAt
    self.modifiedAt = modifiedAt
    self.fileResourceIdentifier = fileResourceIdentifier
  }
}

public struct LogicalWorkIdentity: Codable, Sendable, Equatable {
  public let id: String
  public let displayName: String

  public init(id: String, displayName: String) {
    self.id = id
    self.displayName = displayName
  }
}

public struct SampleUsageOccurrence: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let sampleID: String
  public let workID: String?
  public let workName: String?
  public let sessionID: String
  public let sessionName: String
  public let timelineID: String
  public let setID: String
  public let setName: String
  public let setURL: URL
  public let setModifiedAt: Date?
  public let trackID: String
  public let trackName: String
  public let clipID: String
  public let clipName: String
  public let placement: SetClipPlacement
  public let isWarped: Bool?
  public let warpMode: Int?
  public let warpMarkerCount: Int
  public let deviceChain: [SetDevice]

  public init(
    id: String,
    sampleID: String,
    workID: String?,
    workName: String?,
    sessionID: String,
    sessionName: String,
    timelineID: String,
    setID: String,
    setName: String,
    setURL: URL,
    setModifiedAt: Date?,
    trackID: String,
    trackName: String,
    clipID: String,
    clipName: String,
    placement: SetClipPlacement,
    isWarped: Bool?,
    warpMode: Int?,
    warpMarkerCount: Int,
    deviceChain: [SetDevice]
  ) {
    self.id = id
    self.sampleID = sampleID
    self.workID = workID
    self.workName = workName
    self.sessionID = sessionID
    self.sessionName = sessionName
    self.timelineID = timelineID
    self.setID = setID
    self.setName = setName
    self.setURL = setURL
    self.setModifiedAt = setModifiedAt
    self.trackID = trackID
    self.trackName = trackName
    self.clipID = clipID
    self.clipName = clipName
    self.placement = placement
    self.isWarped = isWarped
    self.warpMode = warpMode
    self.warpMarkerCount = warpMarkerCount
    self.deviceChain = deviceChain
  }
}

public enum SampleSortField: String, Codable, Sendable, CaseIterable {
  case name
  case location
  case workCount
  case sessionCount
  case setCount
  case occurrenceCount
  case lastUsed
  case size
  case duration
  case format
  case availability
}

public enum SampleSortDirection: String, Codable, Sendable {
  case ascending
  case descending
}

public struct SampleQuery: Sendable, Equatable {
  public var searchText: String
  public var sortField: SampleSortField
  public var direction: SampleSortDirection
  public var limit: Int
  public var offset: Int

  public init(
    searchText: String = "",
    sortField: SampleSortField = .name,
    direction: SampleSortDirection = .ascending,
    limit: Int = 500,
    offset: Int = 0
  ) {
    self.searchText = searchText
    self.sortField = sortField
    self.direction = direction
    self.limit = limit
    self.offset = offset
  }
}

public struct SampleListRow: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let fileURL: URL
  public let name: String
  public let locationName: String
  public let packName: String
  public let classification: SampleClassification
  public let classificationExplanation: String
  public let availability: SampleAvailability
  public let metadata: SampleTechnicalMetadata
  public let workCount: Int?
  public let sessionCount: Int
  public let setCount: Int
  public let occurrenceCount: Int
  public let lastUsedAt: Date?

  public init(
    id: String,
    fileURL: URL,
    name: String,
    locationName: String,
    packName: String,
    classification: SampleClassification,
    classificationExplanation: String,
    availability: SampleAvailability,
    metadata: SampleTechnicalMetadata,
    workCount: Int?,
    sessionCount: Int,
    setCount: Int,
    occurrenceCount: Int,
    lastUsedAt: Date?
  ) {
    self.id = id
    self.fileURL = fileURL
    self.name = name
    self.locationName = locationName
    self.packName = packName
    self.classification = classification
    self.classificationExplanation = classificationExplanation
    self.availability = availability
    self.metadata = metadata
    self.workCount = workCount
    self.sessionCount = sessionCount
    self.setCount = setCount
    self.occurrenceCount = occurrenceCount
    self.lastUsedAt = lastUsedAt
  }
}

public struct SampleQueryResult: Sendable, Equatable {
  public let rows: [SampleListRow]
  public let totalCount: Int
  public let usageCoverageComplete: Bool

  public init(rows: [SampleListRow], totalCount: Int, usageCoverageComplete: Bool) {
    self.rows = rows
    self.totalCount = totalCount
    self.usageCoverageComplete = usageCoverageComplete
  }
}

public struct SampleIndexingStatistics: Sendable, Equatable {
  public let discoveredFileCount: Int
  public let metadataReadCount: Int
  public let reusedMetadataCount: Int
  public let removedMembershipCount: Int
  public let startedAt: Date
  public let completedAt: Date

  public init(
    discoveredFileCount: Int,
    metadataReadCount: Int,
    reusedMetadataCount: Int,
    removedMembershipCount: Int,
    startedAt: Date,
    completedAt: Date
  ) {
    self.discoveredFileCount = discoveredFileCount
    self.metadataReadCount = metadataReadCount
    self.reusedMetadataCount = reusedMetadataCount
    self.removedMembershipCount = removedMembershipCount
    self.startedAt = startedAt
    self.completedAt = completedAt
  }
}

public enum SampleLibraryStatus: String, Codable, Sendable {
  case idle
  case indexing
  case monitoring
  case stopped
}

public enum SampleLibraryEvent: Sendable {
  case statusChanged(SampleLibraryStatus)
  case locationsChanged([SampleLocation])
  case indexCompleted(locationID: String, statistics: SampleIndexingStatistics)
  case usageUpdated
  case failed(message: String)
}

struct SampleResourceSeed: Sendable, Equatable {
  let fileURL: URL
  let name: String
  let locationName: String
  let packName: String
  let classification: SampleClassification
  let classificationExplanation: String
  let availability: SampleAvailability
  let metadata: SampleTechnicalMetadata
}

struct SampleUsageAggregation: Sendable {
  let occurrences: [SampleUsageOccurrence]
  let referencedSamples: [SampleResourceSeed]
}
