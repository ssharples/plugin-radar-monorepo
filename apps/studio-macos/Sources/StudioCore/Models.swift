import Foundation

public struct StudioLibraryIndex: Codable, Sendable {
  public let rootURL: URL
  public let scannedAt: Date
  public let projects: [StudioProject]
  public let unassignedAudioAssets: [PreviewAsset]
  public let issues: [IndexIssue]

  public init(
    rootURL: URL,
    scannedAt: Date,
    projects: [StudioProject],
    unassignedAudioAssets: [PreviewAsset],
    issues: [IndexIssue]
  ) {
    self.rootURL = rootURL
    self.scannedAt = scannedAt
    self.projects = projects
    self.unassignedAudioAssets = unassignedAudioAssets
    self.issues = issues
  }
}

public struct StudioProject: Codable, Identifiable, Sendable {
  public let id: String
  public let rootURL: URL
  public let displayName: String
  public let timelines: [SetTimeline]
  public let previewAssets: [PreviewAsset]

  public init(
    id: String,
    rootURL: URL,
    displayName: String,
    timelines: [SetTimeline],
    previewAssets: [PreviewAsset]
  ) {
    self.id = id
    self.rootURL = rootURL
    self.displayName = displayName
    self.timelines = timelines
    self.previewAssets = previewAssets
  }

  public var sets: [AbletonSet] {
    timelines.flatMap(\.versions)
  }
}

public struct SetTimeline: Codable, Identifiable, Sendable {
  public let id: String
  public let displayName: String
  public let versions: [AbletonSet]

  public init(id: String, displayName: String, versions: [AbletonSet]) {
    self.id = id
    self.displayName = displayName
    self.versions = versions
  }
}

public struct AbletonSet: Codable, Identifiable, Sendable {
  public let id: String
  public let fileURL: URL
  public let displayName: String
  public let isBackup: Bool
  public let modifiedAt: Date?
  public let compressedBytes: Int64
  public let xmlBytes: Int
  public let creator: String?
  public let format: AbletonFormat
  public let structure: SetStructure
  public let content: AbletonSetContent

  public init(
    id: String,
    fileURL: URL,
    displayName: String,
    isBackup: Bool,
    modifiedAt: Date?,
    compressedBytes: Int64,
    xmlBytes: Int,
    creator: String?,
    format: AbletonFormat,
    structure: SetStructure,
    content: AbletonSetContent = AbletonSetContent()
  ) {
    self.id = id
    self.fileURL = fileURL
    self.displayName = displayName
    self.isBackup = isBackup
    self.modifiedAt = modifiedAt
    self.compressedBytes = compressedBytes
    self.xmlBytes = xmlBytes
    self.creator = creator
    self.format = format
    self.structure = structure
    self.content = content
  }
}

public struct AbletonFormat: Codable, Sendable, Equatable {
  public let majorVersion: String?
  public let minorVersion: String?
  public let schemaChangeCount: Int?
  public let revision: String?

  public init(
    majorVersion: String?,
    minorVersion: String?,
    schemaChangeCount: Int?,
    revision: String?
  ) {
    self.majorVersion = majorVersion
    self.minorVersion = minorVersion
    self.schemaChangeCount = schemaChangeCount
    self.revision = revision
  }
}

public struct SetStructure: Codable, Sendable, Equatable {
  public var audioTrackCount = 0
  public var midiTrackCount = 0
  public var groupTrackCount = 0
  public var returnTrackCount = 0
  public var thirdPartyDeviceCount = 0
  public var maxForLiveDeviceCount = 0
  public var rackDeviceCount = 0
  public var warpMarkerCount = 0
  public var automationEnvelopeCount = 0

  public init() {}

  public var trackCount: Int {
    audioTrackCount + midiTrackCount + groupTrackCount + returnTrackCount
  }
}

public enum PreviewAssetCategory: String, Codable, CaseIterable, Sendable {
  case freeze
  case consolidated
  case crop
  case recorded
  case imported
  case reversed
  case otherAudio
}

public struct PreviewAsset: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let fileURL: URL
  public let category: PreviewAssetCategory
  public let isLikelyUserRender: Bool
  public let bytes: Int64
  public let modifiedAt: Date?

  public init(
    id: String,
    fileURL: URL,
    category: PreviewAssetCategory,
    isLikelyUserRender: Bool,
    bytes: Int64,
    modifiedAt: Date?
  ) {
    self.id = id
    self.fileURL = fileURL
    self.category = category
    self.isLikelyUserRender = isLikelyUserRender
    self.bytes = bytes
    self.modifiedAt = modifiedAt
  }
}

public struct IndexIssue: Codable, Identifiable, Sendable {
  public let id: String
  public let fileURL: URL
  public let message: String

  public init(id: String, fileURL: URL, message: String) {
    self.id = id
    self.fileURL = fileURL
    self.message = message
  }
}

public struct CorpusSummary: Codable, Sendable {
  public let projectCount: Int
  public let timelineCount: Int
  public let setCount: Int
  public let backupSetCount: Int
  public let previewAssetCount: Int
  public let unassignedAudioAssetCount: Int
  public let likelyUserRenderCount: Int
  public let issueCount: Int
  public let creatorCounts: [String: Int]
  public let previewCategoryCounts: [String: Int]
  public let extractedTrackCount: Int
  public let extractedDeviceCount: Int
  public let extractedClipCount: Int
  public let dependencyCount: Int
  public let dependencyAvailabilityCounts: [String: Int]

  public init(index: StudioLibraryIndex) {
    let sets = index.projects.flatMap(\.sets)
    let assets = index.projects.flatMap(\.previewAssets) + index.unassignedAudioAssets

    projectCount = index.projects.count
    timelineCount = index.projects.reduce(0) { $0 + $1.timelines.count }
    setCount = sets.count
    backupSetCount = sets.count(where: \.isBackup)
    previewAssetCount = assets.count
    unassignedAudioAssetCount = index.unassignedAudioAssets.count
    likelyUserRenderCount = assets.count(where: \.isLikelyUserRender)
    issueCount = index.issues.count
    creatorCounts = Dictionary(grouping: sets, by: { $0.creator ?? "Unknown" })
      .mapValues(\.count)
    previewCategoryCounts = Dictionary(grouping: assets, by: { $0.category.rawValue })
      .mapValues(\.count)
    let tracks = sets.flatMap { $0.content.tracks }
    let dependencies = sets.flatMap { $0.content.dependencies }
    extractedTrackCount = tracks.count
    extractedDeviceCount = tracks.reduce(0) { total, track in
      total + track.devices.reduce(0) { $0 + $1.recursiveDeviceCount }
    }
    extractedClipCount = tracks.reduce(0) { $0 + $1.clips.count }
    dependencyCount = dependencies.count
    dependencyAvailabilityCounts = Dictionary(
      grouping: dependencies,
      by: { $0.availability.rawValue }
    ).mapValues(\.count)
  }
}

extension SetDevice {
  fileprivate var recursiveDeviceCount: Int {
    1 + nestedDevices.reduce(0) { $0 + $1.recursiveDeviceCount }
  }
}
