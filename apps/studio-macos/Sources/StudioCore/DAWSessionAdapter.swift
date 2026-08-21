import Foundation

public enum DAWKind: String, Codable, Sendable, CaseIterable {
  case abletonLive
  case logicPro
  case proTools
  case flStudio
}

public enum InspectionProvenance: String, Codable, Sendable, CaseIterable {
  case nativeStatic
  case hostInspected
  case interchangeExport
  case filesystemInferred
  case userConfirmed
}

public struct DAWCapabilities: Codable, Sendable, Equatable {
  public let discoversSessions: Bool
  public let readsStaticMetadata: Bool
  public let resolvesAudioReferences: Bool
  public let readsTrackStructure: Bool
  public let readsDeviceChains: Bool
  public let requestsAuthoritativeRender: Bool

  public init(
    discoversSessions: Bool,
    readsStaticMetadata: Bool,
    resolvesAudioReferences: Bool,
    readsTrackStructure: Bool,
    readsDeviceChains: Bool,
    requestsAuthoritativeRender: Bool
  ) {
    self.discoversSessions = discoversSessions
    self.readsStaticMetadata = readsStaticMetadata
    self.resolvesAudioReferences = resolvesAudioReferences
    self.readsTrackStructure = readsTrackStructure
    self.readsDeviceChains = readsDeviceChains
    self.requestsAuthoritativeRender = requestsAuthoritativeRender
  }
}

public enum DAWRevisionKind: String, Codable, Sendable, CaseIterable {
  case primary
  case alternativeHead
  case backup
}

public struct SessionProjectMetadata: Codable, Sendable, Equatable {
  public let tempo: Double?
  public let trackCount: Int?
  public let sampleRate: Double?
  public let key: String?
  public let timeSignature: SetTimeSignature?

  public init(
    tempo: Double? = nil,
    trackCount: Int? = nil,
    sampleRate: Double? = nil,
    key: String? = nil,
    timeSignature: SetTimeSignature? = nil
  ) {
    self.tempo = tempo
    self.trackCount = trackCount
    self.sampleRate = sampleRate
    self.key = key
    self.timeSignature = timeSignature
  }
}

public struct DAWAudioReference: Codable, Sendable, Equatable {
  public let relativePath: String
  public let resolvedURL: URL?
  public let availability: MediaDependencyAvailability

  public init(
    relativePath: String,
    resolvedURL: URL?,
    availability: MediaDependencyAvailability
  ) {
    self.relativePath = relativePath
    self.resolvedURL = resolvedURL
    self.availability = availability
  }
}

public struct DAWSessionInspection: Codable, Sendable, Equatable {
  public let provenance: InspectionProvenance
  public let sourceURL: URL
  public let metadata: SessionProjectMetadata
  public let audioReferences: [DAWAudioReference]
  public let unusedAudioReferences: [DAWAudioReference]

  public init(
    provenance: InspectionProvenance,
    sourceURL: URL,
    metadata: SessionProjectMetadata,
    audioReferences: [DAWAudioReference] = [],
    unusedAudioReferences: [DAWAudioReference] = []
  ) {
    self.provenance = provenance
    self.sourceURL = sourceURL
    self.metadata = metadata
    self.audioReferences = audioReferences
    self.unusedAudioReferences = unusedAudioReferences
  }
}

public struct DAWSessionRevision: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let fileURL: URL
  public let displayName: String
  public let kind: DAWRevisionKind
  public let modifiedAt: Date?
  public let inspection: DAWSessionInspection

  public init(
    id: String,
    fileURL: URL,
    displayName: String,
    kind: DAWRevisionKind,
    modifiedAt: Date?,
    inspection: DAWSessionInspection
  ) {
    self.id = id
    self.fileURL = fileURL
    self.displayName = displayName
    self.kind = kind
    self.modifiedAt = modifiedAt
    self.inspection = inspection
  }
}

public struct DiscoveredDAWSession: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let daw: DAWKind
  public let rootURL: URL
  public let displayName: String
  public let creatorVersion: String?
  public let previewImageURL: URL?
  public let revisions: [DAWSessionRevision]

  public init(
    id: String,
    daw: DAWKind,
    rootURL: URL,
    displayName: String,
    creatorVersion: String?,
    previewImageURL: URL?,
    revisions: [DAWSessionRevision]
  ) {
    self.id = id
    self.daw = daw
    self.rootURL = rootURL
    self.displayName = displayName
    self.creatorVersion = creatorVersion
    self.previewImageURL = previewImageURL
    self.revisions = revisions
  }
}

public struct DAWAdapterIssue: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let daw: DAWKind
  public let fileURL: URL
  public let message: String

  public init(id: String, daw: DAWKind, fileURL: URL, message: String) {
    self.id = id
    self.daw = daw
    self.fileURL = fileURL
    self.message = message
  }
}

public struct DAWDiscoveryResult: Codable, Sendable, Equatable {
  public let sessions: [DiscoveredDAWSession]
  public let issues: [DAWAdapterIssue]

  public init(sessions: [DiscoveredDAWSession], issues: [DAWAdapterIssue]) {
    self.sessions = sessions
    self.issues = issues
  }
}

public protocol DAWSessionAdapter: Sendable {
  var daw: DAWKind { get }
  var capabilities: DAWCapabilities { get }

  /// Discovers and inspects supported sessions without modifying source projects.
  /// A malformed session is returned as an issue and must not abort sibling discovery.
  func discover(in rootURL: URL) throws -> DAWDiscoveryResult
}
