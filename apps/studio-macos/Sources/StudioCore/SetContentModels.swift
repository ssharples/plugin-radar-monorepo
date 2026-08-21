import Foundation

public struct AbletonSetContent: Codable, Sendable, Equatable {
  public var tempo: Double?
  public var timeSignature: SetTimeSignature?
  public var locators: [SetLocator]
  public var tracks: [SetTrack]
  public var dependencies: [MediaDependency]

  public init(
    tempo: Double? = nil,
    timeSignature: SetTimeSignature? = nil,
    locators: [SetLocator] = [],
    tracks: [SetTrack] = [],
    dependencies: [MediaDependency] = []
  ) {
    self.tempo = tempo
    self.timeSignature = timeSignature
    self.locators = locators
    self.tracks = tracks
    self.dependencies = dependencies
  }
}

public struct SetTimeSignature: Codable, Sendable, Equatable {
  public let numerator: Int
  public let denominator: Int

  public init(numerator: Int, denominator: Int) {
    self.numerator = numerator
    self.denominator = denominator
  }
}

public struct SetLocator: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let name: String
  public let beatTime: Double

  public init(id: String, name: String, beatTime: Double) {
    self.id = id
    self.name = name
    self.beatTime = beatTime
  }
}

public enum SetTrackKind: String, Codable, Sendable {
  case audio
  case midi
  case group
  case returnTrack
  case main
}

public struct SetTrack: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let xmlID: String?
  public let kind: SetTrackKind
  public let name: String
  public let colorIndex: Int?
  public let groupTrackXMLID: String?
  public let isFolded: Bool?
  public let mixer: TrackMixerState
  public let devices: [SetDevice]
  public let clips: [SetClip]

  public init(
    id: String,
    xmlID: String?,
    kind: SetTrackKind,
    name: String,
    colorIndex: Int?,
    groupTrackXMLID: String?,
    isFolded: Bool?,
    mixer: TrackMixerState,
    devices: [SetDevice],
    clips: [SetClip]
  ) {
    self.id = id
    self.xmlID = xmlID
    self.kind = kind
    self.name = name
    self.colorIndex = colorIndex
    self.groupTrackXMLID = groupTrackXMLID
    self.isFolded = isFolded
    self.mixer = mixer
    self.devices = devices
    self.clips = clips
  }
}

public struct TrackMixerState: Codable, Sendable, Equatable {
  public let volume: Double?
  public let pan: Double?
  public let speakerOn: Bool?
  public let isSoloed: Bool?
  public let isArmed: Bool?
  public let monitoringMode: Int?

  public init(
    volume: Double? = nil,
    pan: Double? = nil,
    speakerOn: Bool? = nil,
    isSoloed: Bool? = nil,
    isArmed: Bool? = nil,
    monitoringMode: Int? = nil
  ) {
    self.volume = volume
    self.pan = pan
    self.speakerOn = speakerOn
    self.isSoloed = isSoloed
    self.isArmed = isArmed
    self.monitoringMode = monitoringMode
  }
}

public enum SetDeviceKind: String, Codable, Sendable {
  case native
  case audioUnit
  case vst2
  case vst3
  case maxForLive
  case rack
  case placeholder
  case unknown
}

public enum PluginFormat: String, Codable, Sendable {
  case audioUnit
  case vst2
  case vst3
}

public struct PluginIdentity: Codable, Sendable, Equatable {
  public let format: PluginFormat
  public let name: String?
  public let manufacturer: String?
  public let identifier: String?
  public let version: String?

  public init(
    format: PluginFormat,
    name: String?,
    manufacturer: String?,
    identifier: String?,
    version: String? = nil
  ) {
    self.format = format
    self.name = name
    self.manufacturer = manufacturer
    self.identifier = identifier
    self.version = version
  }
}

public struct SetDevice: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let xmlID: String?
  public let kind: SetDeviceKind
  public let typeName: String
  public let displayName: String
  public let isEnabled: Bool?
  public let plugin: PluginIdentity?
  public let stateDigest: String
  public let nestedDevices: [SetDevice]
  public let resourceReferences: [MediaReference]

  public init(
    id: String,
    xmlID: String?,
    kind: SetDeviceKind,
    typeName: String,
    displayName: String,
    isEnabled: Bool?,
    plugin: PluginIdentity?,
    stateDigest: String,
    nestedDevices: [SetDevice],
    resourceReferences: [MediaReference]
  ) {
    self.id = id
    self.xmlID = xmlID
    self.kind = kind
    self.typeName = typeName
    self.displayName = displayName
    self.isEnabled = isEnabled
    self.plugin = plugin
    self.stateDigest = stateDigest
    self.nestedDevices = nestedDevices
    self.resourceReferences = resourceReferences
  }
}

public enum SetClipKind: String, Codable, Sendable {
  case audio
  case midi
}

public enum SetClipPlacement: String, Codable, Sendable {
  case arrangement
  case session
  case takeLane
  case unknown
}

public struct SetClip: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let xmlID: String?
  public let kind: SetClipKind
  public let placement: SetClipPlacement
  public let name: String
  public let startBeat: Double?
  public let endBeat: Double?
  public let loopStartBeat: Double?
  public let loopEndBeat: Double?
  public let loopEnabled: Bool?
  public let isWarped: Bool?
  public let warpMode: Int?
  public let warpMarkerCount: Int
  public let midiNoteCount: Int
  public let sampleReference: MediaReference?

  public init(
    id: String,
    xmlID: String?,
    kind: SetClipKind,
    placement: SetClipPlacement,
    name: String,
    startBeat: Double?,
    endBeat: Double?,
    loopStartBeat: Double?,
    loopEndBeat: Double?,
    loopEnabled: Bool?,
    isWarped: Bool?,
    warpMode: Int?,
    warpMarkerCount: Int,
    midiNoteCount: Int,
    sampleReference: MediaReference?
  ) {
    self.id = id
    self.xmlID = xmlID
    self.kind = kind
    self.placement = placement
    self.name = name
    self.startBeat = startBeat
    self.endBeat = endBeat
    self.loopStartBeat = loopStartBeat
    self.loopEndBeat = loopEndBeat
    self.loopEnabled = loopEnabled
    self.isWarped = isWarped
    self.warpMode = warpMode
    self.warpMarkerCount = warpMarkerCount
    self.midiNoteCount = midiNoteCount
    self.sampleReference = sampleReference
  }
}

public struct MediaReference: Codable, Sendable, Equatable, Hashable {
  public let absolutePath: String?
  public let relativePath: String?

  public init(absolutePath: String?, relativePath: String?) {
    self.absolutePath = absolutePath
    self.relativePath = relativePath
  }
}

public enum MediaDependencyKind: String, Codable, Sendable {
  case clipAudio
  case deviceResource
}

public enum MediaDependencyAvailability: String, Codable, Sendable {
  case available
  case missing
  case disconnected
  case unresolved
}

public struct MediaDependency: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: MediaDependencyKind
  public let reference: MediaReference
  public let resolvedURL: URL?
  public let availability: MediaDependencyAvailability
  public let ownerID: String

  public init(
    id: String,
    kind: MediaDependencyKind,
    reference: MediaReference,
    resolvedURL: URL?,
    availability: MediaDependencyAvailability,
    ownerID: String
  ) {
    self.id = id
    self.kind = kind
    self.reference = reference
    self.resolvedURL = resolvedURL
    self.availability = availability
    self.ownerID = ownerID
  }
}
