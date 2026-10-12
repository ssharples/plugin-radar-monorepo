import CryptoKit
import Foundation

private func isLowercaseSHA256(_ value: String) -> Bool {
  value.count == 64 && value.allSatisfy { $0.isNumber || ("a"..."f").contains(String($0)) }
}

private func canonicalLegacyStateDigest(_ value: String) -> String {
  SHA256.hash(data: Data("studio-interchange-v1-state:\(value)".utf8))
    .map { String(format: "%02x", $0) }
    .joined()
}

private enum StudioProjectInterchangeFieldPresence: Equatable, Sendable {
  case missing
  case null
  case present
}

extension KeyedDecodingContainer {
  fileprivate func decodeMigratable<Value: Decodable>(
    _ type: Value.Type,
    forKey key: Key
  ) throws -> (presence: StudioProjectInterchangeFieldPresence, value: Value?) {
    guard contains(key) else { return (.missing, nil) }
    guard try !decodeNil(forKey: key) else { return (.null, nil) }
    return (.present, try decode(type, forKey: key))
  }
}

public enum StudioProjectInterchangeProvenance: String, Codable, Sendable, CaseIterable {
  case verified
  case parsed
  case derived
  case unsupported
  case unknown
}

public struct StudioProjectInterchangeField<Value: Codable & Equatable & Sendable>: Codable,
  Equatable, Sendable
{
  public let provenance: StudioProjectInterchangeProvenance
  public let value: Value?
  public let note: String?

  public init(
    provenance: StudioProjectInterchangeProvenance,
    value: Value?,
    note: String? = nil
  ) {
    self.provenance = provenance
    self.value = value
    self.note = note
  }

  public static func verified(_ value: Value, note: String? = nil) -> Self {
    Self(provenance: .verified, value: value, note: note)
  }

  public static func parsed(_ value: Value, note: String? = nil) -> Self {
    Self(provenance: .parsed, value: value, note: note)
  }

  public static func derived(_ value: Value, note: String? = nil) -> Self {
    Self(provenance: .derived, value: value, note: note)
  }

  public static func unsupported(note: String? = nil) -> Self {
    Self(provenance: .unsupported, value: nil, note: note)
  }

  public static func unknown(note: String? = nil) -> Self {
    Self(provenance: .unknown, value: nil, note: note)
  }

  private enum CodingKeys: String, CodingKey {
    case provenance
    case value
    case note
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    provenance = try container.decode(StudioProjectInterchangeProvenance.self, forKey: .provenance)
    value = try container.decodeIfPresent(Value.self, forKey: .value)
    note = try container.decodeIfPresent(String.self, forKey: .note)

    guard hasValidShape else {
      throw DecodingError.dataCorruptedError(
        forKey: .value,
        in: container,
        debugDescription:
          "Interchange provenance \(provenance.rawValue) has an invalid value shape."
      )
    }
  }

  public func encode(to encoder: Encoder) throws {
    guard hasValidShape else {
      throw EncodingError.invalidValue(
        self,
        EncodingError.Context(
          codingPath: encoder.codingPath,
          debugDescription:
            "Interchange provenance \(provenance.rawValue) has an invalid value shape."
        )
      )
    }
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(provenance, forKey: .provenance)
    try container.encodeIfPresent(value, forKey: .value)
    try container.encodeIfPresent(note, forKey: .note)
  }

  fileprivate var hasValidShape: Bool {
    switch provenance {
    case .verified, .parsed, .derived:
      value != nil
    case .unsupported, .unknown:
      value == nil
    }
  }
}

public struct StudioProjectInterchangeVersion: Codable, Equatable, Sendable {
  public static let historicalV1 = Self(major: 1, minor: 0)
  public static let current = Self(major: 2, minor: 0)

  public let major: Int
  public let minor: Int

  public init(major: Int, minor: Int) {
    self.major = major
    self.minor = minor
  }
}

public struct StudioProjectInterchangeMigration: Codable, Equatable, Sendable {
  public let fromVersion: StudioProjectInterchangeVersion
  public let appliedDefaults: [String]

  private init(
    fromVersion: StudioProjectInterchangeVersion,
    appliedDefaults: [String]
  ) {
    self.fromVersion = fromVersion
    self.appliedDefaults = appliedDefaults.sorted()
  }

  static let v1 = Self(
    fromVersion: .historicalV1,
    appliedDefaults: [
      "artifactMetadata",
      "automationIdentifiers",
      "automationParameterIdentifiers",
      "automationPoints",
      "deviceStateAvailability",
      "fadeCurves",
      "midiNotes",
      "routingTargets",
      "sendRouting",
      "tempoMap",
      "trackFoldState",
      "warpMarkers",
    ]
  )
}

public enum StudioProjectInterchangeValidationError: Error, Equatable, Sendable {
  case invalidVersion(StudioProjectInterchangeVersion)
  case unsupportedVersion(
    found: StudioProjectInterchangeVersion,
    supported: StudioProjectInterchangeVersion
  )
  case missingIdentifier(kind: String)
  case duplicateIdentifier(String)
  case invalidHierarchy(trackID: String, reason: String)
  case invalidRouting(trackID: String, reason: String)
  case invalidAutomation(laneID: String, reason: String)
  case invalidDependencyOwner(dependencyID: String, ownerID: String)
  case invalidDependency(dependencyID: String, reason: String)
  case invalidArtifact(identifier: String, reason: String)
  case invalidClip(identifier: String, reason: String)
  case invalidTimeline(String)
  case invalidDeviceState(deviceID: String, reason: String)
  case invalidMigration(String)
  case nondeterministicOrder(String)
  case invalidDAWExtension(String)
}

extension StudioProjectInterchangeValidationError: LocalizedError {
  public var errorDescription: String? {
    switch self {
    case .invalidVersion(let version):
      "Invalid StudioProjectInterchange version \(version.major).\(version.minor)."
    case .unsupportedVersion(let found, let supported):
      "Unsupported StudioProjectInterchange version \(found.major).\(found.minor); this build supports \(supported.major).\(supported.minor)."
    case .missingIdentifier(let kind):
      "A \(kind) is missing its interchange identifier."
    case .duplicateIdentifier(let identifier):
      "Duplicate interchange identifier \(identifier)."
    case .invalidHierarchy(let trackID, let reason):
      "Invalid hierarchy for track \(trackID): \(reason)"
    case .invalidRouting(let trackID, let reason):
      "Invalid routing for track \(trackID): \(reason)"
    case .invalidAutomation(let laneID, let reason):
      "Invalid automation lane \(laneID): \(reason)"
    case .invalidDependencyOwner(let dependencyID, let ownerID):
      "Dependency \(dependencyID) refers to unknown owner \(ownerID)."
    case .invalidDependency(let dependencyID, let reason):
      "Invalid dependency \(dependencyID): \(reason)"
    case .invalidArtifact(let identifier, let reason):
      "Invalid artifact \(identifier): \(reason)"
    case .invalidClip(let identifier, let reason):
      "Invalid clip \(identifier): \(reason)"
    case .invalidTimeline(let reason):
      "Invalid project timeline: \(reason)"
    case .invalidDeviceState(let deviceID, let reason):
      "Invalid device state for \(deviceID): \(reason)"
    case .invalidMigration(let reason):
      "Invalid StudioProjectInterchange migration: \(reason)"
    case .nondeterministicOrder(let collection):
      "Interchange collection \(collection) is not in canonical order."
    case .invalidDAWExtension(let reason):
      "Invalid DAW extension data: \(reason)"
    }
  }
}

public struct StudioProjectInterchange: Codable, Equatable, Sendable {
  public let version: StudioProjectInterchangeVersion
  public let migration: StudioProjectInterchangeMigration?
  public let identity: StudioProjectInterchangeIdentity
  public let timeline: StudioProjectInterchangeTimeline
  public let staticMetadata: StudioProjectInterchangeField<StudioProjectInterchangeStaticMetadata>
  public let tracks: StudioProjectInterchangeField<[StudioProjectInterchangeTrack]>
  public let mediaDependencies:
    StudioProjectInterchangeField<[StudioProjectInterchangeMediaDependency]>
  public let audioReferences:
    StudioProjectInterchangeField<[StudioProjectInterchangeAudioReference]>
  public let locators: StudioProjectInterchangeField<[StudioProjectInterchangeLocator]>
  public let previewReferences:
    StudioProjectInterchangeField<
      [StudioProjectInterchangeArtifactReference]
    >
  public let automationLanes:
    StudioProjectInterchangeField<[StudioProjectInterchangeAutomationLane]>
  public let exportReferences:
    StudioProjectInterchangeField<
      [StudioProjectInterchangeArtifactReference]
    >
  public let handoffReferences:
    StudioProjectInterchangeField<
      [StudioProjectInterchangeArtifactReference]
    >
  public let dawExtensions: StudioProjectInterchangeField<[StudioProjectInterchangeDAWExtension]>
  public let evidenceSummary: StudioProjectInterchangeEvidenceSummary

  public init(
    version: StudioProjectInterchangeVersion = .current,
    identity: StudioProjectInterchangeIdentity,
    timeline: StudioProjectInterchangeTimeline,
    staticMetadata: StudioProjectInterchangeField<StudioProjectInterchangeStaticMetadata>,
    tracks: StudioProjectInterchangeField<[StudioProjectInterchangeTrack]>,
    mediaDependencies: StudioProjectInterchangeField<[StudioProjectInterchangeMediaDependency]>,
    audioReferences: StudioProjectInterchangeField<[StudioProjectInterchangeAudioReference]>,
    locators: StudioProjectInterchangeField<[StudioProjectInterchangeLocator]>,
    previewReferences: StudioProjectInterchangeField<
      [StudioProjectInterchangeArtifactReference]
    >,
    automationLanes: StudioProjectInterchangeField<[StudioProjectInterchangeAutomationLane]>,
    exportReferences: StudioProjectInterchangeField<[StudioProjectInterchangeArtifactReference]>,
    handoffReferences: StudioProjectInterchangeField<[StudioProjectInterchangeArtifactReference]>,
    dawExtensions: StudioProjectInterchangeField<[StudioProjectInterchangeDAWExtension]> = .unknown(
      note: "No bounded DAW-specific extension data was supplied."
    ),
    evidenceSummary: StudioProjectInterchangeEvidenceSummary
  ) {
    self.version = version
    self.migration = nil
    self.identity = identity
    self.timeline = timeline
    self.staticMetadata = staticMetadata
    self.tracks = tracks
    self.mediaDependencies = mediaDependencies
    self.audioReferences = audioReferences
    self.locators = locators
    self.previewReferences = previewReferences
    self.automationLanes = automationLanes
    self.exportReferences = exportReferences
    self.handoffReferences = handoffReferences
    self.dawExtensions = dawExtensions
    self.evidenceSummary = evidenceSummary
  }

  private enum CodingKeys: String, CodingKey {
    case version
    case migration
    case identity
    case timeline
    case staticMetadata
    case tracks
    case mediaDependencies
    case audioReferences
    case locators
    case previewReferences
    case automationLanes
    case exportReferences
    case handoffReferences
    case dawExtensions
    case evidenceSummary
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedVersion = try container.decode(
      StudioProjectInterchangeVersion.self,
      forKey: .version
    )
    guard decodedVersion == .current || decodedVersion == .historicalV1 else {
      throw StudioProjectInterchangeValidationError.unsupportedVersion(
        found: decodedVersion,
        supported: .current
      )
    }
    if decodedVersion == .historicalV1 {
      guard !container.contains(.dawExtensions), !container.contains(.migration) else {
        throw StudioProjectInterchangeValidationError.invalidMigration(
          "historical v1 cannot contain extension or migration payloads"
        )
      }
    } else if container.contains(.migration) {
      throw StudioProjectInterchangeValidationError.invalidMigration(
        "schema v2 payloads cannot carry historical migration markers"
      )
    }
    version = .current
    migration = decodedVersion == .historicalV1 ? .v1 : nil
    identity = try container.decode(StudioProjectInterchangeIdentity.self, forKey: .identity)
    timeline = try container.decode(StudioProjectInterchangeTimeline.self, forKey: .timeline)
    if decodedVersion == .historicalV1 {
      staticMetadata =
        try container.decodeIfPresent(
          StudioProjectInterchangeField<StudioProjectInterchangeStaticMetadata>.self,
          forKey: .staticMetadata
        )
        ?? .unknown(note: "This persisted v1 payload predates static metadata preservation.")
    } else {
      staticMetadata = try container.decode(
        StudioProjectInterchangeField<StudioProjectInterchangeStaticMetadata>.self,
        forKey: .staticMetadata
      )
    }
    tracks = try container.decode(
      StudioProjectInterchangeField<[StudioProjectInterchangeTrack]>.self,
      forKey: .tracks
    )
    if decodedVersion == .historicalV1 {
      mediaDependencies =
        try container.decodeIfPresent(
          StudioProjectInterchangeField<[StudioProjectInterchangeMediaDependency]>.self,
          forKey: .mediaDependencies
        )
        ?? .unknown(note: "This persisted v1 payload predates dependency preservation.")
      audioReferences =
        try container.decodeIfPresent(
          StudioProjectInterchangeField<[StudioProjectInterchangeAudioReference]>.self,
          forKey: .audioReferences
        )
        ?? .unknown(
          note: "This persisted v1 payload predates session audio reference preservation.")
    } else {
      mediaDependencies = try container.decode(
        StudioProjectInterchangeField<[StudioProjectInterchangeMediaDependency]>.self,
        forKey: .mediaDependencies
      )
      audioReferences = try container.decode(
        StudioProjectInterchangeField<[StudioProjectInterchangeAudioReference]>.self,
        forKey: .audioReferences
      )
    }
    locators = try container.decode(
      StudioProjectInterchangeField<[StudioProjectInterchangeLocator]>.self,
      forKey: .locators
    )
    if decodedVersion == .historicalV1 {
      let legacyPreviews =
        try container.decodeIfPresent(
          StudioProjectInterchangeField<[StudioProjectInterchangeDocumentReference]>.self,
          forKey: .previewReferences
        )
        ?? .unknown(note: "This persisted v1 payload predates preview reference preservation.")
      previewReferences = Self.migrateArtifacts(legacyPreviews, kind: .preview)
    } else {
      previewReferences = try container.decode(
        StudioProjectInterchangeField<[StudioProjectInterchangeArtifactReference]>.self,
        forKey: .previewReferences
      )
    }
    automationLanes = try container.decode(
      StudioProjectInterchangeField<[StudioProjectInterchangeAutomationLane]>.self,
      forKey: .automationLanes
    )
    if decodedVersion == .historicalV1 {
      let legacyExports = try container.decode(
        StudioProjectInterchangeField<[StudioProjectInterchangeDocumentReference]>.self,
        forKey: .exportReferences
      )
      let legacyHandoffs = try container.decode(
        StudioProjectInterchangeField<[StudioProjectInterchangeDocumentReference]>.self,
        forKey: .handoffReferences
      )
      exportReferences = Self.migrateArtifacts(legacyExports, kind: .export)
      handoffReferences = Self.migrateArtifacts(legacyHandoffs, kind: .handoff)
      dawExtensions = .unknown(
        note: "Historical v1 did not support bounded DAW extension preservation."
      )
    } else {
      exportReferences = try container.decode(
        StudioProjectInterchangeField<[StudioProjectInterchangeArtifactReference]>.self,
        forKey: .exportReferences
      )
      handoffReferences = try container.decode(
        StudioProjectInterchangeField<[StudioProjectInterchangeArtifactReference]>.self,
        forKey: .handoffReferences
      )
      dawExtensions = try container.decode(
        StudioProjectInterchangeField<[StudioProjectInterchangeDAWExtension]>.self,
        forKey: .dawExtensions
      )
    }
    evidenceSummary = try container.decode(
      StudioProjectInterchangeEvidenceSummary.self,
      forKey: .evidenceSummary
    )
    try validate()
  }

  public func encode(to encoder: Encoder) throws {
    try validate()
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(version, forKey: .version)
    try container.encode(identity, forKey: .identity)
    try container.encode(timeline, forKey: .timeline)
    try container.encode(staticMetadata, forKey: .staticMetadata)
    try container.encode(tracks, forKey: .tracks)
    try container.encode(mediaDependencies, forKey: .mediaDependencies)
    try container.encode(audioReferences, forKey: .audioReferences)
    try container.encode(locators, forKey: .locators)
    try container.encode(previewReferences, forKey: .previewReferences)
    try container.encode(automationLanes, forKey: .automationLanes)
    try container.encode(exportReferences, forKey: .exportReferences)
    try container.encode(handoffReferences, forKey: .handoffReferences)
    try container.encode(dawExtensions, forKey: .dawExtensions)
    try container.encode(evidenceSummary, forKey: .evidenceSummary)
  }

  public func validate() throws {
    try Self.validateSupportedVersion(version)

    if let migration {
      guard migration == .v1 else {
        throw StudioProjectInterchangeValidationError.invalidMigration(
          "only the exact historical v1 migration marker is supported"
        )
      }
    }

    var identifiers = Set<String>()
    var tracksByID: [String: StudioProjectInterchangeTrack] = [:]
    var deviceIDs = Set<String>()
    var clipKindsByID: [String: StudioProjectInterchangeClipKind] = [:]

    func register(_ identifier: String?, kind: String) throws -> String {
      guard let identifier, !identifier.isEmpty else {
        throw StudioProjectInterchangeValidationError.missingIdentifier(kind: kind)
      }
      guard identifiers.insert(identifier).inserted else {
        throw StudioProjectInterchangeValidationError.duplicateIdentifier(identifier)
      }
      return identifier
    }

    func registerDevice(_ device: StudioProjectInterchangeDevice) throws {
      let deviceID = try register(device.id.value, kind: "device")
      deviceIDs.insert(deviceID)
      try validateDeviceState(device, id: deviceID)
      for nestedDevice in device.nestedDevices.value ?? [] {
        try registerDevice(nestedDevice)
      }
    }

    func validateDeviceState(
      _ device: StudioProjectInterchangeDevice,
      id: String
    ) throws {
      if migration == nil {
        try Self.requireV2Field(
          device.stateAvailabilityPresence,
          path: "device.\(id).stateAvailability"
        )
      }
      guard let availability = device.stateAvailability.value else {
        if migration == nil, device.stateDigest.value != nil {
          throw StudioProjectInterchangeValidationError.invalidDeviceState(
            deviceID: id,
            reason: "a state digest requires explicit state availability"
          )
        }
        return
      }
      switch availability {
      case .digestOnly:
        guard let digest = device.stateDigest.value, isLowercaseSHA256(digest) else {
          throw StudioProjectInterchangeValidationError.invalidDeviceState(
            deviceID: id,
            reason: "digestOnly requires a lowercase SHA-256 digest"
          )
        }
      case .identityOnly, .unavailable:
        guard device.stateDigest.value == nil else {
          throw StudioProjectInterchangeValidationError.invalidDeviceState(
            deviceID: id,
            reason: "\(availability.rawValue) cannot carry a state digest"
          )
        }
      }
    }

    let tempoEvents = timeline.tempoMap.value ?? []
    if migration == nil {
      try Self.requireV2Field(timeline.tempoMapPresence, path: "timeline.tempoMap")
    }
    try Self.requireCanonicalOrder(
      tempoEvents,
      keys: { String(format: "%020.9f:%@", $0.beat.value ?? -.infinity, $0.id.value ?? "") },
      collection: "timeline.tempoMap"
    )
    for event in tempoEvents {
      _ = try register(event.id.value, kind: "tempo event")
      guard let beat = event.beat.value, beat.isFinite, beat >= 0,
        let tempo = event.beatsPerMinute.value, tempo.isFinite, tempo > 0
      else {
        throw StudioProjectInterchangeValidationError.invalidTimeline(
          "tempo events require finite non-negative beats and positive BPM values"
        )
      }
    }

    for track in tracks.value ?? [] {
      let trackID = try register(track.id.value, kind: "track")
      if migration == nil {
        try Self.requireV2Field(track.isFoldedPresence, path: "track.\(trackID).isFolded")
      }
      tracksByID[trackID] = track
      for device in track.devices.value ?? [] {
        try registerDevice(device)
      }
      for clip in track.clips.value ?? [] {
        let clipID = try register(clip.id.value, kind: "clip")
        guard let clipKind = clip.kind.value else {
          throw StudioProjectInterchangeValidationError.invalidClip(
            identifier: clipID,
            reason: "clip kind is required"
          )
        }
        clipKindsByID[clipID] = clipKind
        try validateClip(clip, id: clipID)
      }
    }

    func validateClip(_ clip: StudioProjectInterchangeClip, id: String) throws {
      if migration == nil {
        try Self.requireV2Field(clip.midiNotesPresence, path: "clip.\(id).midiNotes")
      }
      let notes = clip.midiNotes.value ?? []
      try Self.requireCanonicalOrder(
        notes,
        keys: { String(format: "%020.9f:%@", $0.startBeat.value ?? -.infinity, $0.id.value ?? "") },
        collection: "clip.\(id).midiNotes"
      )
      for note in notes {
        _ = try register(note.id.value, kind: "MIDI note")
        guard let pitch = note.pitch.value, (0...127).contains(pitch),
          let velocity = note.velocity.value, velocity.isFinite, (0...1).contains(velocity),
          let start = note.startBeat.value, start.isFinite,
          let duration = note.durationBeats.value, duration.isFinite, duration >= 0,
          let channel = note.channel.value, (1...16).contains(channel)
        else {
          throw StudioProjectInterchangeValidationError.invalidClip(
            identifier: id,
            reason: "MIDI note values are outside their bounded ranges"
          )
        }
      }
      if let count = clip.midiNoteCount.value, let noteValues = clip.midiNotes.value,
        count != noteValues.count
      {
        throw StudioProjectInterchangeValidationError.invalidClip(
          identifier: id,
          reason: "MIDI note count disagrees with explicit notes"
        )
      }
      if let warp = clip.warp.value {
        if migration == nil {
          try Self.requireV2Field(warp.markersPresence, path: "clip.\(id).warp.markers")
        }
        let markers = warp.markers.value ?? []
        try Self.requireCanonicalOrder(
          markers,
          keys: { String(format: "%020.9f:%@", $0.beat.value ?? -.infinity, $0.id.value ?? "") },
          collection: "clip.\(id).warp.markers"
        )
        for marker in markers {
          _ = try register(marker.id.value, kind: "warp marker")
          guard let beat = marker.beat.value, beat.isFinite,
            let sampleTime = marker.sampleTimeSeconds.value, sampleTime.isFinite, sampleTime >= 0
          else {
            throw StudioProjectInterchangeValidationError.invalidClip(
              identifier: id,
              reason: "warp markers require finite beats and non-negative sample times"
            )
          }
        }
        if let count = warp.markerCount.value, let markerValues = warp.markers.value,
          count != markerValues.count
        {
          throw StudioProjectInterchangeValidationError.invalidClip(
            identifier: id,
            reason: "warp marker count disagrees with explicit markers"
          )
        }
      }
      if let fades = clip.fades.value {
        if migration == nil {
          try Self.requireV2Field(
            fades.fadeInCurvePresence,
            path: "clip.\(id).fades.fadeInCurve"
          )
          try Self.requireV2Field(
            fades.fadeOutCurvePresence,
            path: "clip.\(id).fades.fadeOutCurve"
          )
        }
        for value in [fades.fadeIn.value, fades.fadeOut.value].compactMap({ $0 })
        where !value.isFinite || value < 0 {
          throw StudioProjectInterchangeValidationError.invalidClip(
            identifier: id,
            reason: "fade durations must be finite and non-negative"
          )
        }
        for value in [fades.fadeInCurve.value, fades.fadeOutCurve.value].compactMap({ $0 })
        where !value.isFinite || !(-1...1).contains(value) {
          throw StudioProjectInterchangeValidationError.invalidClip(
            identifier: id,
            reason: "fade curves must be finite values between -1 and 1"
          )
        }
      }
    }

    var parentsByTrackID: [String: String] = [:]
    for (trackID, track) in tracksByID {
      guard let parentTrackID = track.hierarchy.value?.parentTrackID.value else { continue }
      guard parentTrackID != trackID else {
        throw StudioProjectInterchangeValidationError.invalidHierarchy(
          trackID: trackID,
          reason: "a track cannot be its own parent"
        )
      }
      guard let parentTrack = tracksByID[parentTrackID] else {
        throw StudioProjectInterchangeValidationError.invalidHierarchy(
          trackID: trackID,
          reason: "parent \(parentTrackID) does not exist"
        )
      }
      guard parentTrack.kind.value == .group else {
        throw StudioProjectInterchangeValidationError.invalidHierarchy(
          trackID: trackID,
          reason: "parent \(parentTrackID) is not a group track"
        )
      }
      if let sourceParentID = track.hierarchy.value?.sourceParentIdentifier.value,
        let parentSourceID = parentTrack.sourceIdentifier.value,
        sourceParentID != parentSourceID
      {
        throw StudioProjectInterchangeValidationError.invalidHierarchy(
          trackID: trackID,
          reason: "normalized and source parent identifiers disagree"
        )
      }
      parentsByTrackID[trackID] = parentTrackID
    }

    for (trackID, track) in tracksByID {
      if let routing = track.routing.value {
        try validateRouting(routing, trackID: trackID)
      }
    }

    func validateRouting(
      _ routing: StudioProjectInterchangeTrackRouting,
      trackID: String
    ) throws {
      if migration == nil {
        try Self.requireV2Field(
          routing.inputReferencePresence,
          path: "track.\(trackID).routing.inputReference"
        )
        try Self.requireV2Field(
          routing.outputReferencePresence,
          path: "track.\(trackID).routing.outputReference"
        )
        try Self.requireV2Field(
          routing.sendsPresence,
          path: "track.\(trackID).routing.sends"
        )
      }
      try validateTarget(routing.inputReference.value, trackID: trackID, role: "input")
      try validateTarget(routing.outputReference.value, trackID: trackID, role: "output")
      let sends = routing.sends.value ?? []
      try Self.requireCanonicalOrder(
        sends,
        keys: { $0.id.value ?? "" },
        collection: "track.\(trackID).routing.sends"
      )
      for send in sends {
        _ = try register(send.id.value, kind: "track send")
        guard let targetID = send.targetTrackID.value,
          let target = tracksByID[targetID], target.kind.value == .returnTrack,
          targetID != trackID
        else {
          throw StudioProjectInterchangeValidationError.invalidRouting(
            trackID: trackID,
            reason: "send targets must identify another return track"
          )
        }
        guard let amount = send.amount.value, amount.isFinite, (0...1).contains(amount) else {
          throw StudioProjectInterchangeValidationError.invalidRouting(
            trackID: trackID,
            reason: "send amount must be between 0 and 1"
          )
        }
      }
    }

    func validateTarget(
      _ target: StudioProjectInterchangeRoutingTarget?,
      trackID: String,
      role: String
    ) throws {
      guard let target else { return }
      guard let kind = target.kind.value else {
        throw StudioProjectInterchangeValidationError.invalidRouting(
          trackID: trackID,
          reason: "\(role) target kind is missing"
        )
      }
      switch kind {
      case .track:
        guard let targetID = target.trackID.value, tracksByID[targetID] != nil,
          targetID != trackID, target.label.value == nil
        else {
          throw StudioProjectInterchangeValidationError.invalidRouting(
            trackID: trackID,
            reason: "\(role) track target is missing, self-referential, or contradictory"
          )
        }
      case .external:
        guard target.trackID.value == nil, target.label.value?.isEmpty == false else {
          throw StudioProjectInterchangeValidationError.invalidRouting(
            trackID: trackID,
            reason: "\(role) external target requires only a non-empty label"
          )
        }
      case .main, .none:
        guard target.trackID.value == nil, target.label.value == nil else {
          throw StudioProjectInterchangeValidationError.invalidRouting(
            trackID: trackID,
            reason: "\(role) \(kind.rawValue) target cannot carry a track ID or label"
          )
        }
      }
    }

    for trackID in parentsByTrackID.keys {
      var visited = Set<String>()
      var currentID: String? = trackID
      while let candidate = currentID {
        guard visited.insert(candidate).inserted else {
          throw StudioProjectInterchangeValidationError.invalidHierarchy(
            trackID: trackID,
            reason: "the parent chain contains a cycle"
          )
        }
        currentID = parentsByTrackID[candidate]
      }
    }

    let dependencies = mediaDependencies.value ?? []
    try Self.requireCanonicalOrder(
      dependencies,
      keys: { $0.id.value ?? "" },
      collection: "mediaDependencies"
    )
    for dependency in dependencies {
      let dependencyID = try register(dependency.id.value, kind: "media dependency")
      guard let ownerID = dependency.ownerID.value else {
        throw StudioProjectInterchangeValidationError.invalidDependency(
          dependencyID: dependencyID,
          reason: "owner ID is required"
        )
      }
      guard let kind = dependency.kind.value else {
        throw StudioProjectInterchangeValidationError.invalidDependency(
          dependencyID: dependencyID,
          reason: "dependency kind is required"
        )
      }
      let ownerIsCompatible =
        switch kind {
        case .clipAudio: clipKindsByID[ownerID] == .audio
        case .deviceResource: deviceIDs.contains(ownerID)
        }
      guard ownerIsCompatible else {
        if !deviceIDs.contains(ownerID), clipKindsByID[ownerID] == nil {
          throw StudioProjectInterchangeValidationError.invalidDependencyOwner(
            dependencyID: dependencyID,
            ownerID: ownerID
          )
        }
        throw StudioProjectInterchangeValidationError.invalidDependency(
          dependencyID: dependencyID,
          reason: "kind \(kind.rawValue) is incompatible with owner \(ownerID)"
        )
      }
      guard let reference = dependency.reference.value,
        reference.absolutePath.value?.isEmpty == false
          || reference.relativePath.value?.isEmpty == false
      else {
        throw StudioProjectInterchangeValidationError.invalidDependency(
          dependencyID: dependencyID,
          reason: "at least one non-empty source path is required"
        )
      }
      try Self.validateAvailability(
        dependency.availability.value,
        resolvedURL: dependency.resolvedURL.value,
        identifier: dependencyID
      )
    }
    let audioReferenceValues = audioReferences.value ?? []
    try Self.requireCanonicalOrder(
      audioReferenceValues,
      keys: { "\($0.relativePath.value ?? ""):\($0.usage.value?.rawValue ?? "")" },
      collection: "audioReferences"
    )
    for reference in audioReferenceValues {
      guard reference.relativePath.value?.isEmpty == false else {
        throw StudioProjectInterchangeValidationError.invalidDependency(
          dependencyID: "session-audio-reference",
          reason: "relative path is required"
        )
      }
      try Self.validateAvailability(
        reference.availability.value,
        resolvedURL: reference.resolvedURL.value,
        identifier: reference.relativePath.value ?? "session-audio-reference"
      )
    }

    let locatorValues = locators.value ?? []
    try Self.requireCanonicalOrder(
      locatorValues,
      keys: { String(format: "%020.9f:%@", $0.beatTime.value ?? -.infinity, $0.id.value ?? "") },
      collection: "locators"
    )
    for locator in locatorValues {
      _ = try register(locator.id.value, kind: "locator")
    }

    for (kind, field) in [
      (StudioProjectInterchangeArtifactKind.preview, previewReferences),
      (.export, exportReferences),
      (.handoff, handoffReferences),
    ] {
      let artifacts = field.value ?? []
      try Self.requireCanonicalOrder(
        artifacts,
        keys: { $0.id.value ?? "" },
        collection: "\(kind.rawValue)References"
      )
      for artifact in artifacts {
        let artifactID = try register(artifact.id.value, kind: "\(kind.rawValue) artifact")
        guard artifact.kind.value == kind else {
          throw StudioProjectInterchangeValidationError.invalidArtifact(
            identifier: artifactID,
            reason: "artifact kind does not match its collection"
          )
        }
        guard let document = artifact.document.value, document.fileURL.isFileURL else {
          throw StudioProjectInterchangeValidationError.invalidArtifact(
            identifier: artifactID,
            reason: "a local file document reference is required"
          )
        }
        if artifact.availability.value == .available, artifact.document.value == nil {
          throw StudioProjectInterchangeValidationError.invalidArtifact(
            identifier: artifactID,
            reason: "available artifact has no document"
          )
        }
        if let checksum = artifact.checksumSHA256.value, !isLowercaseSHA256(checksum) {
          throw StudioProjectInterchangeValidationError.invalidArtifact(
            identifier: artifactID,
            reason: "checksum is not a lowercase SHA-256 digest"
          )
        }
      }
    }

    let lanes = automationLanes.value ?? []
    try Self.requireCanonicalOrder(
      lanes,
      keys: { $0.id.value ?? "" },
      collection: "automationLanes"
    )
    for lane in lanes {
      if migration == nil {
        try Self.requireV2Field(lane.idPresence, path: "automationLane.id")
        try Self.requireV2Field(
          lane.parameterIdentifierPresence,
          path: "automationLane.parameterIdentifier"
        )
        try Self.requireV2Field(lane.pointsPresence, path: "automationLane.points")
      }
      let laneID = try register(lane.id.value, kind: "automation lane")
      guard let ownerID = lane.ownerID.value,
        tracksByID[ownerID] != nil || deviceIDs.contains(ownerID) || clipKindsByID[ownerID] != nil
      else {
        throw StudioProjectInterchangeValidationError.invalidAutomation(
          laneID: laneID,
          reason: "owner is missing or does not exist"
        )
      }
      let points = lane.points.value ?? []
      try Self.requireCanonicalOrder(
        points,
        keys: { String(format: "%020.9f:%@", $0.beat.value ?? -.infinity, $0.id.value ?? "") },
        collection: "automationLane.\(laneID).points"
      )
      for point in points {
        _ = try register(point.id.value, kind: "automation point")
        guard let beat = point.beat.value, beat.isFinite,
          let value = point.value.value, value.isFinite
        else {
          throw StudioProjectInterchangeValidationError.invalidAutomation(
            laneID: laneID,
            reason: "points require finite beat and value fields"
          )
        }
      }
      if let count = lane.pointCount.value, let pointValues = lane.points.value,
        count != pointValues.count
      {
        throw StudioProjectInterchangeValidationError.invalidAutomation(
          laneID: laneID,
          reason: "point count disagrees with explicit points"
        )
      }
    }

    let extensions = dawExtensions.value ?? []
    guard extensions.count <= StudioProjectInterchangeDAWExtension.maximumExtensionCount else {
      throw StudioProjectInterchangeValidationError.invalidDAWExtension(
        "more than \(StudioProjectInterchangeDAWExtension.maximumExtensionCount) extension namespaces"
      )
    }
    try Self.requireCanonicalOrder(
      extensions,
      keys: { $0.namespace.rawValue },
      collection: "dawExtensions"
    )
    var extensionNamespaces = Set<StudioProjectInterchangeDAWExtensionNamespace>()
    for dawExtension in extensions {
      guard extensionNamespaces.insert(dawExtension.namespace).inserted else {
        throw StudioProjectInterchangeValidationError.invalidDAWExtension(
          "duplicate namespace \(dawExtension.namespace.rawValue)"
        )
      }
      try Self.requireCanonicalOrder(
        dawExtension.fields,
        keys: { $0.key.rawValue },
        collection: "dawExtensions.\(dawExtension.namespace.rawValue).fields"
      )
      try dawExtension.validate()
    }
  }

  private static func migrateArtifacts(
    _ field: StudioProjectInterchangeField<[StudioProjectInterchangeDocumentReference]>,
    kind: StudioProjectInterchangeArtifactKind
  ) -> StudioProjectInterchangeField<[StudioProjectInterchangeArtifactReference]> {
    guard let documents = field.value else {
      return .init(provenance: field.provenance, value: nil, note: field.note)
    }
    let artifacts = documents.map { document in
      let canonicalURL = document.fileURL.standardizedFileURL
      return StudioProjectInterchangeArtifactReference(
        id: .derived(
          StableID.forValue(
            "v1-artifact:\(kind.rawValue):\(canonicalURL.absoluteString)"
          ),
          note: "Stable ID derived while migrating a historical v1 document reference."
        ),
        kind: .derived(kind, note: "Artifact kind derived from the historical v1 collection."),
        document: .init(
          provenance: field.provenance == .verified ? .verified : .derived,
          value: StudioProjectInterchangeDocumentReference(fileURL: canonicalURL),
          note: "Migrated from a historical v1 document reference."
        ),
        label: .unknown(note: "Historical v1 did not preserve an artifact label."),
        mediaType: .unknown(note: "Historical v1 did not preserve an artifact media type."),
        checksumSHA256: .unknown(note: "Historical v1 did not preserve an artifact checksum."),
        createdAt: .unknown(note: "Historical v1 did not preserve artifact creation time."),
        availability: .unknown(note: "Historical v1 did not preserve artifact availability.")
      )
    }.sorted { ($0.id.value ?? "") < ($1.id.value ?? "") }
    return .derived(artifacts, note: "Migrated from historical v1 document references.")
  }

  private static func validateAvailability(
    _ availability: MediaDependencyAvailability?,
    resolvedURL: URL?,
    identifier: String
  ) throws {
    guard let availability else {
      throw StudioProjectInterchangeValidationError.invalidDependency(
        dependencyID: identifier,
        reason: "availability is required"
      )
    }
    switch availability {
    case .available:
      guard let resolvedURL, resolvedURL.isFileURL else {
        throw StudioProjectInterchangeValidationError.invalidDependency(
          dependencyID: identifier,
          reason: "available references require a resolved local file URL"
        )
      }
    case .missing, .disconnected, .unresolved:
      guard resolvedURL == nil else {
        throw StudioProjectInterchangeValidationError.invalidDependency(
          dependencyID: identifier,
          reason: "non-available reference cannot carry a resolved URL"
        )
      }
    }
  }

  private static func requireV2Field(
    _ presence: StudioProjectInterchangeFieldPresence,
    path: String
  ) throws {
    switch presence {
    case .present:
      return
    case .missing:
      throw StudioProjectInterchangeValidationError.invalidMigration(
        "current v2 required field \(path) is missing"
      )
    case .null:
      throw StudioProjectInterchangeValidationError.invalidMigration(
        "current v2 required field \(path) is explicitly null"
      )
    }
  }

  private static func requireCanonicalOrder<Value>(
    _ values: [Value],
    keys: (Value) -> String,
    collection: String
  ) throws {
    let actual = values.map(keys)
    guard actual == actual.sorted() else {
      throw StudioProjectInterchangeValidationError.nondeterministicOrder(collection)
    }
  }

  private static func validateSupportedVersion(
    _ version: StudioProjectInterchangeVersion
  ) throws {
    guard version.major > 0, version.minor >= 0 else {
      throw StudioProjectInterchangeValidationError.invalidVersion(version)
    }
    guard version == .current else {
      throw StudioProjectInterchangeValidationError.unsupportedVersion(
        found: version,
        supported: .current
      )
    }
  }
}

public struct StudioProjectInterchangeIdentity: Codable, Equatable, Sendable {
  public let daw: StudioProjectInterchangeField<DAWKind>
  public let displayName: StudioProjectInterchangeField<String>
  public let sourceApplication: StudioProjectInterchangeField<StudioProjectInterchangeApplication>
  public let sourceDocument:
    StudioProjectInterchangeField<StudioProjectInterchangeDocumentReference>

  public init(
    daw: StudioProjectInterchangeField<DAWKind>,
    displayName: StudioProjectInterchangeField<String>,
    sourceApplication: StudioProjectInterchangeField<StudioProjectInterchangeApplication>,
    sourceDocument: StudioProjectInterchangeField<StudioProjectInterchangeDocumentReference>
  ) {
    self.daw = daw
    self.displayName = displayName
    self.sourceApplication = sourceApplication
    self.sourceDocument = sourceDocument
  }
}

public struct StudioProjectInterchangeApplication: Codable, Equatable, Sendable {
  public let creator: StudioProjectInterchangeField<String>
  public let majorVersion: StudioProjectInterchangeField<String>
  public let minorVersion: StudioProjectInterchangeField<String>
  public let schemaChangeCount: StudioProjectInterchangeField<Int>
  public let revision: StudioProjectInterchangeField<String>

  public init(
    creator: StudioProjectInterchangeField<String>,
    majorVersion: StudioProjectInterchangeField<String>,
    minorVersion: StudioProjectInterchangeField<String>,
    schemaChangeCount: StudioProjectInterchangeField<Int>,
    revision: StudioProjectInterchangeField<String>
  ) {
    self.creator = creator
    self.majorVersion = majorVersion
    self.minorVersion = minorVersion
    self.schemaChangeCount = schemaChangeCount
    self.revision = revision
  }
}

public struct StudioProjectInterchangeDocumentReference: Codable, Equatable, Sendable {
  public let fileURL: URL

  public init(fileURL: URL) {
    self.fileURL = fileURL
  }
}

public enum StudioProjectInterchangeArtifactKind: String, Codable, Equatable, Sendable {
  case preview
  case export
  case handoff
}

public enum StudioProjectInterchangeArtifactAvailability: String, Codable, Equatable, Sendable {
  case available
  case missing
}

public struct StudioProjectInterchangeArtifactReference: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let kind: StudioProjectInterchangeField<StudioProjectInterchangeArtifactKind>
  public let document: StudioProjectInterchangeField<StudioProjectInterchangeDocumentReference>
  public let label: StudioProjectInterchangeField<String>
  public let mediaType: StudioProjectInterchangeField<String>
  public let checksumSHA256: StudioProjectInterchangeField<String>
  public let createdAt: StudioProjectInterchangeField<Date>
  public let availability:
    StudioProjectInterchangeField<StudioProjectInterchangeArtifactAvailability>

  public var fileURL: URL? { document.value?.fileURL }

  public init(
    id: StudioProjectInterchangeField<String>,
    kind: StudioProjectInterchangeField<StudioProjectInterchangeArtifactKind>,
    document: StudioProjectInterchangeField<StudioProjectInterchangeDocumentReference>,
    label: StudioProjectInterchangeField<String>,
    mediaType: StudioProjectInterchangeField<String>,
    checksumSHA256: StudioProjectInterchangeField<String>,
    createdAt: StudioProjectInterchangeField<Date>,
    availability: StudioProjectInterchangeField<StudioProjectInterchangeArtifactAvailability>
  ) {
    self.id = id
    self.kind = kind
    self.document = document
    self.label = label
    self.mediaType = mediaType
    self.checksumSHA256 = checksumSHA256
    self.createdAt = createdAt
    self.availability = availability
  }
}

public enum StudioProjectInterchangeDAWExtensionNamespace: String, Codable, Hashable, Sendable {
  case abletonLive = "com.ableton.live"
  case logicPro = "com.apple.logic-pro"
}

public enum StudioProjectInterchangeDAWExtensionKey: String, Codable, Hashable, Sendable {
  case inspectionProvenance
  case liveSchemaVersion
  case selectedRevisionID
  case sourceRevision
}

public struct StudioProjectInterchangeDAWExtensionEntry: Codable, Equatable, Sendable {
  public let key: StudioProjectInterchangeDAWExtensionKey
  public let field: StudioProjectInterchangeField<String>

  public init(
    key: StudioProjectInterchangeDAWExtensionKey,
    field: StudioProjectInterchangeField<String>
  ) {
    self.key = key
    self.field = field
  }
}

public struct StudioProjectInterchangeDAWExtension: Codable, Equatable, Sendable {
  fileprivate static let maximumExtensionCount = 4
  private static let maximumFieldCount = 8
  private static let maximumFieldValueBytes = 4 * 1_024
  private static let maximumPayloadBytes = 16 * 1_024

  public let namespace: StudioProjectInterchangeDAWExtensionNamespace
  public let version: StudioProjectInterchangeVersion
  public let fields: [StudioProjectInterchangeDAWExtensionEntry]

  public init(
    namespace: StudioProjectInterchangeDAWExtensionNamespace,
    version: StudioProjectInterchangeVersion,
    fields: [StudioProjectInterchangeDAWExtensionEntry]
  ) {
    self.namespace = namespace
    self.version = version
    self.fields = fields.sorted { $0.key.rawValue < $1.key.rawValue }
  }

  private enum CodingKeys: String, CodingKey {
    case namespace
    case version
    case fields
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    namespace = try container.decode(
      StudioProjectInterchangeDAWExtensionNamespace.self,
      forKey: .namespace
    )
    version = try container.decode(StudioProjectInterchangeVersion.self, forKey: .version)
    fields = try container.decode(
      [StudioProjectInterchangeDAWExtensionEntry].self,
      forKey: .fields
    )
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(namespace, forKey: .namespace)
    try container.encode(version, forKey: .version)
    try container.encode(fields, forKey: .fields)
  }

  fileprivate func validate() throws {
    guard version == StudioProjectInterchangeVersion(major: 1, minor: 0) else {
      throw StudioProjectInterchangeValidationError.invalidDAWExtension(
        "namespace \(namespace.rawValue) supports only extension version 1.0"
      )
    }
    guard fields.count <= Self.maximumFieldCount else {
      throw StudioProjectInterchangeValidationError.invalidDAWExtension(
        "namespace \(namespace.rawValue) exceeds \(Self.maximumFieldCount) fields"
      )
    }

    var payloadBytes = 0
    var seenKeys = Set<StudioProjectInterchangeDAWExtensionKey>()
    for entry in fields {
      guard seenKeys.insert(entry.key).inserted else {
        throw StudioProjectInterchangeValidationError.invalidDAWExtension(
          "namespace \(namespace.rawValue) repeats key \(entry.key.rawValue)"
        )
      }
      guard Self.allowedKeys[namespace, default: []].contains(entry.key) else {
        throw StudioProjectInterchangeValidationError.invalidDAWExtension(
          "key \(entry.key.rawValue) is not allowed for \(namespace.rawValue)"
        )
      }
      guard entry.field.hasValidShape else {
        throw StudioProjectInterchangeValidationError.invalidDAWExtension(
          "field \(entry.key.rawValue) has provenance inconsistent with its value"
        )
      }
      let valueBytes = entry.field.value?.utf8.count ?? 0
      guard valueBytes <= Self.maximumFieldValueBytes else {
        throw StudioProjectInterchangeValidationError.invalidDAWExtension(
          "field \(entry.key.rawValue) exceeds \(Self.maximumFieldValueBytes) UTF-8 bytes"
        )
      }
      payloadBytes +=
        entry.key.rawValue.utf8.count + valueBytes
        + (entry.field.note?.utf8.count ?? 0)
      guard payloadBytes <= Self.maximumPayloadBytes else {
        throw StudioProjectInterchangeValidationError.invalidDAWExtension(
          "namespace \(namespace.rawValue) exceeds \(Self.maximumPayloadBytes) UTF-8 bytes"
        )
      }
    }
  }

  private static let allowedKeys:
    [StudioProjectInterchangeDAWExtensionNamespace: Set<StudioProjectInterchangeDAWExtensionKey>] =
      [
        .abletonLive: [.liveSchemaVersion, .sourceRevision],
        .logicPro: [.inspectionProvenance, .selectedRevisionID],
      ]
}

public struct StudioProjectInterchangeTempoEvent: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let beat: StudioProjectInterchangeField<Double>
  public let beatsPerMinute: StudioProjectInterchangeField<Double>

  public init(
    id: StudioProjectInterchangeField<String>,
    beat: StudioProjectInterchangeField<Double>,
    beatsPerMinute: StudioProjectInterchangeField<Double>
  ) {
    self.id = id
    self.beat = beat
    self.beatsPerMinute = beatsPerMinute
  }
}

public struct StudioProjectInterchangeTimeline: Codable, Equatable, Sendable {
  public let tempo: StudioProjectInterchangeField<Double>
  public let tempoMap: StudioProjectInterchangeField<[StudioProjectInterchangeTempoEvent]>
  public let timeSignature: StudioProjectInterchangeField<SetTimeSignature>
  fileprivate let tempoMapPresence: StudioProjectInterchangeFieldPresence

  public init(
    tempo: StudioProjectInterchangeField<Double>,
    tempoMap: StudioProjectInterchangeField<[StudioProjectInterchangeTempoEvent]> = .unknown(
      note: "No tempo-map events were supplied."
    ),
    timeSignature: StudioProjectInterchangeField<SetTimeSignature>
  ) {
    self.tempo = tempo
    self.tempoMap = tempoMap
    self.timeSignature = timeSignature
    self.tempoMapPresence = .present
  }

  private enum CodingKeys: String, CodingKey {
    case tempo
    case tempoMap
    case timeSignature
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    tempo = try container.decode(StudioProjectInterchangeField<Double>.self, forKey: .tempo)
    let decodedTempoMap = try container.decodeMigratable(
      StudioProjectInterchangeField<[StudioProjectInterchangeTempoEvent]>.self,
      forKey: .tempoMap
    )
    tempoMapPresence = decodedTempoMap.presence
    tempoMap =
      decodedTempoMap.value
      ?? .unknown(note: "Migrated from v1: tempo-map events were not represented.")
    timeSignature = try container.decode(
      StudioProjectInterchangeField<SetTimeSignature>.self,
      forKey: .timeSignature
    )
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(tempo, forKey: .tempo)
    try container.encode(tempoMap, forKey: .tempoMap)
    try container.encode(timeSignature, forKey: .timeSignature)
  }
}

public struct StudioProjectInterchangeStaticMetadata: Codable, Equatable, Sendable {
  public let totalTrackCount: StudioProjectInterchangeField<Int>
  public let sampleRate: StudioProjectInterchangeField<Double>
  public let musicalKey: StudioProjectInterchangeField<String>

  public init(
    totalTrackCount: StudioProjectInterchangeField<Int>,
    sampleRate: StudioProjectInterchangeField<Double>,
    musicalKey: StudioProjectInterchangeField<String>
  ) {
    self.totalTrackCount = totalTrackCount
    self.sampleRate = sampleRate
    self.musicalKey = musicalKey
  }
}

public enum StudioProjectInterchangeTrackKind: String, Codable, Equatable, Sendable {
  case audio
  case midi
  case group
  case returnTrack
  case main
}

public struct StudioProjectInterchangeTrack: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let sourceIdentifier: StudioProjectInterchangeField<String>
  public let kind: StudioProjectInterchangeField<StudioProjectInterchangeTrackKind>
  public let name: StudioProjectInterchangeField<String>
  public let colorIndex: StudioProjectInterchangeField<Int>
  public let isFolded: StudioProjectInterchangeField<Bool>
  public let hierarchy: StudioProjectInterchangeField<StudioProjectInterchangeTrackHierarchy>
  public let mixer: StudioProjectInterchangeField<StudioProjectInterchangeTrackMixer>
  public let routing: StudioProjectInterchangeField<StudioProjectInterchangeTrackRouting>
  public let devices: StudioProjectInterchangeField<[StudioProjectInterchangeDevice]>
  public let clips: StudioProjectInterchangeField<[StudioProjectInterchangeClip]>
  fileprivate let isFoldedPresence: StudioProjectInterchangeFieldPresence

  public init(
    id: StudioProjectInterchangeField<String>,
    sourceIdentifier: StudioProjectInterchangeField<String>,
    kind: StudioProjectInterchangeField<StudioProjectInterchangeTrackKind>,
    name: StudioProjectInterchangeField<String>,
    colorIndex: StudioProjectInterchangeField<Int>,
    isFolded: StudioProjectInterchangeField<Bool>,
    hierarchy: StudioProjectInterchangeField<StudioProjectInterchangeTrackHierarchy>,
    mixer: StudioProjectInterchangeField<StudioProjectInterchangeTrackMixer>,
    routing: StudioProjectInterchangeField<StudioProjectInterchangeTrackRouting>,
    devices: StudioProjectInterchangeField<[StudioProjectInterchangeDevice]>,
    clips: StudioProjectInterchangeField<[StudioProjectInterchangeClip]>
  ) {
    self.id = id
    self.sourceIdentifier = sourceIdentifier
    self.kind = kind
    self.name = name
    self.colorIndex = colorIndex
    self.isFolded = isFolded
    self.hierarchy = hierarchy
    self.mixer = mixer
    self.routing = routing
    self.devices = devices
    self.clips = clips
    self.isFoldedPresence = .present
  }

  private enum CodingKeys: String, CodingKey {
    case id
    case sourceIdentifier
    case kind
    case name
    case colorIndex
    case isFolded
    case hierarchy
    case mixer
    case routing
    case devices
    case clips
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    id = try container.decode(StudioProjectInterchangeField<String>.self, forKey: .id)
    sourceIdentifier = try container.decode(
      StudioProjectInterchangeField<String>.self,
      forKey: .sourceIdentifier
    )
    kind = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangeTrackKind>.self,
      forKey: .kind
    )
    name = try container.decode(StudioProjectInterchangeField<String>.self, forKey: .name)
    colorIndex = try container.decode(StudioProjectInterchangeField<Int>.self, forKey: .colorIndex)
    let decodedIsFolded = try container.decodeMigratable(
      StudioProjectInterchangeField<Bool>.self,
      forKey: .isFolded
    )
    isFoldedPresence = decodedIsFolded.presence
    isFolded =
      decodedIsFolded.value
      ?? .unknown(note: "This persisted v1 payload predates track fold-state preservation.")
    hierarchy = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangeTrackHierarchy>.self,
      forKey: .hierarchy
    )
    mixer = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangeTrackMixer>.self,
      forKey: .mixer
    )
    routing = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangeTrackRouting>.self,
      forKey: .routing
    )
    devices = try container.decode(
      StudioProjectInterchangeField<[StudioProjectInterchangeDevice]>.self,
      forKey: .devices
    )
    clips = try container.decode(
      StudioProjectInterchangeField<[StudioProjectInterchangeClip]>.self,
      forKey: .clips
    )
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(sourceIdentifier, forKey: .sourceIdentifier)
    try container.encode(kind, forKey: .kind)
    try container.encode(name, forKey: .name)
    try container.encode(colorIndex, forKey: .colorIndex)
    try container.encode(isFolded, forKey: .isFolded)
    try container.encode(hierarchy, forKey: .hierarchy)
    try container.encode(mixer, forKey: .mixer)
    try container.encode(routing, forKey: .routing)
    try container.encode(devices, forKey: .devices)
    try container.encode(clips, forKey: .clips)
  }
}

public struct StudioProjectInterchangeTrackHierarchy: Codable, Equatable, Sendable {
  public let sourceParentIdentifier: StudioProjectInterchangeField<String>
  public let parentTrackID: StudioProjectInterchangeField<String>

  public init(
    sourceParentIdentifier: StudioProjectInterchangeField<String>,
    parentTrackID: StudioProjectInterchangeField<String>
  ) {
    self.sourceParentIdentifier = sourceParentIdentifier
    self.parentTrackID = parentTrackID
  }
}

public struct StudioProjectInterchangeTrackMixer: Codable, Equatable, Sendable {
  public let volume: StudioProjectInterchangeField<Double>
  public let pan: StudioProjectInterchangeField<Double>

  public init(
    volume: StudioProjectInterchangeField<Double>,
    pan: StudioProjectInterchangeField<Double>
  ) {
    self.volume = volume
    self.pan = pan
  }
}

public enum StudioProjectInterchangeRoutingTargetKind: String, Codable, Equatable, Sendable {
  case track
  case main
  case external
  case none
}

public struct StudioProjectInterchangeRoutingTarget: Codable, Equatable, Sendable {
  public let kind: StudioProjectInterchangeField<StudioProjectInterchangeRoutingTargetKind>
  public let trackID: StudioProjectInterchangeField<String>
  public let label: StudioProjectInterchangeField<String>

  public init(
    kind: StudioProjectInterchangeField<StudioProjectInterchangeRoutingTargetKind>,
    trackID: StudioProjectInterchangeField<String>,
    label: StudioProjectInterchangeField<String>
  ) {
    self.kind = kind
    self.trackID = trackID
    self.label = label
  }
}

public struct StudioProjectInterchangeTrackSend: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let targetTrackID: StudioProjectInterchangeField<String>
  public let amount: StudioProjectInterchangeField<Double>
  public let isEnabled: StudioProjectInterchangeField<Bool>

  public init(
    id: StudioProjectInterchangeField<String>,
    targetTrackID: StudioProjectInterchangeField<String>,
    amount: StudioProjectInterchangeField<Double>,
    isEnabled: StudioProjectInterchangeField<Bool>
  ) {
    self.id = id
    self.targetTrackID = targetTrackID
    self.amount = amount
    self.isEnabled = isEnabled
  }
}

public struct StudioProjectInterchangeTrackRouting: Codable, Equatable, Sendable {
  public let inputReference: StudioProjectInterchangeField<StudioProjectInterchangeRoutingTarget>
  public let outputReference: StudioProjectInterchangeField<StudioProjectInterchangeRoutingTarget>
  public let sends: StudioProjectInterchangeField<[StudioProjectInterchangeTrackSend]>
  public let speakerEnabled: StudioProjectInterchangeField<Bool>
  public let soloEnabled: StudioProjectInterchangeField<Bool>
  public let armEnabled: StudioProjectInterchangeField<Bool>
  public let monitoringMode: StudioProjectInterchangeField<Int>
  fileprivate let inputReferencePresence: StudioProjectInterchangeFieldPresence
  fileprivate let outputReferencePresence: StudioProjectInterchangeFieldPresence
  fileprivate let sendsPresence: StudioProjectInterchangeFieldPresence

  public init(
    inputReference: StudioProjectInterchangeField<StudioProjectInterchangeRoutingTarget> = .unknown(
      note: "No input routing reference was supplied."
    ),
    outputReference: StudioProjectInterchangeField<StudioProjectInterchangeRoutingTarget> =
      .unknown(
        note: "No output routing reference was supplied."
      ),
    sends: StudioProjectInterchangeField<[StudioProjectInterchangeTrackSend]> = .unknown(
      note: "No send routing was supplied."
    ),
    speakerEnabled: StudioProjectInterchangeField<Bool>,
    soloEnabled: StudioProjectInterchangeField<Bool>,
    armEnabled: StudioProjectInterchangeField<Bool>,
    monitoringMode: StudioProjectInterchangeField<Int>
  ) {
    self.inputReference = inputReference
    self.outputReference = outputReference
    self.sends = sends
    self.speakerEnabled = speakerEnabled
    self.soloEnabled = soloEnabled
    self.armEnabled = armEnabled
    self.monitoringMode = monitoringMode
    self.inputReferencePresence = .present
    self.outputReferencePresence = .present
    self.sendsPresence = .present
  }

  private enum CodingKeys: String, CodingKey {
    case inputReference
    case outputReference
    case sends
    case speakerEnabled
    case soloEnabled
    case armEnabled
    case monitoringMode
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedInputReference = try container.decodeMigratable(
      StudioProjectInterchangeField<StudioProjectInterchangeRoutingTarget>.self,
      forKey: .inputReference
    )
    inputReferencePresence = decodedInputReference.presence
    inputReference =
      decodedInputReference.value
      ?? .unknown(note: "This persisted v1 payload predates input routing preservation.")
    let decodedOutputReference = try container.decodeMigratable(
      StudioProjectInterchangeField<StudioProjectInterchangeRoutingTarget>.self,
      forKey: .outputReference
    )
    outputReferencePresence = decodedOutputReference.presence
    outputReference =
      decodedOutputReference.value
      ?? .unknown(note: "This persisted v1 payload predates output routing preservation.")
    let decodedSends = try container.decodeMigratable(
      StudioProjectInterchangeField<[StudioProjectInterchangeTrackSend]>.self,
      forKey: .sends
    )
    sendsPresence = decodedSends.presence
    sends =
      decodedSends.value
      ?? .unknown(note: "Migrated from v1: send routing was not represented.")
    speakerEnabled = try container.decode(
      StudioProjectInterchangeField<Bool>.self,
      forKey: .speakerEnabled
    )
    soloEnabled = try container.decode(
      StudioProjectInterchangeField<Bool>.self,
      forKey: .soloEnabled
    )
    armEnabled = try container.decode(
      StudioProjectInterchangeField<Bool>.self,
      forKey: .armEnabled
    )
    monitoringMode = try container.decode(
      StudioProjectInterchangeField<Int>.self,
      forKey: .monitoringMode
    )
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(inputReference, forKey: .inputReference)
    try container.encode(outputReference, forKey: .outputReference)
    try container.encode(sends, forKey: .sends)
    try container.encode(speakerEnabled, forKey: .speakerEnabled)
    try container.encode(soloEnabled, forKey: .soloEnabled)
    try container.encode(armEnabled, forKey: .armEnabled)
    try container.encode(monitoringMode, forKey: .monitoringMode)
  }
}

public enum StudioProjectInterchangeDeviceKind: String, Codable, Equatable, Sendable {
  case native
  case audioUnit
  case vst2
  case vst3
  case maxForLive
  case rack
  case placeholder
  case unknown
}

public enum StudioProjectInterchangeDeviceStateAvailability: String, Codable, Equatable, Sendable {
  case digestOnly
  case identityOnly
  case unavailable
}

public struct StudioProjectInterchangeDevice: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let sourceIdentifier: StudioProjectInterchangeField<String>
  public let kind: StudioProjectInterchangeField<StudioProjectInterchangeDeviceKind>
  public let typeName: StudioProjectInterchangeField<String>
  public let displayName: StudioProjectInterchangeField<String>
  public let isEnabled: StudioProjectInterchangeField<Bool>
  public let plugin: StudioProjectInterchangeField<StudioProjectInterchangePlugin>
  public let stateDigest: StudioProjectInterchangeField<String>
  public let stateAvailability:
    StudioProjectInterchangeField<StudioProjectInterchangeDeviceStateAvailability>
  public let nestedDevices: StudioProjectInterchangeField<[StudioProjectInterchangeDevice]>
  public let resourceReferences:
    StudioProjectInterchangeField<
      [StudioProjectInterchangeMediaReference]
    >
  fileprivate let stateAvailabilityPresence: StudioProjectInterchangeFieldPresence

  public init(
    id: StudioProjectInterchangeField<String>,
    sourceIdentifier: StudioProjectInterchangeField<String>,
    kind: StudioProjectInterchangeField<StudioProjectInterchangeDeviceKind>,
    typeName: StudioProjectInterchangeField<String>,
    displayName: StudioProjectInterchangeField<String>,
    isEnabled: StudioProjectInterchangeField<Bool>,
    plugin: StudioProjectInterchangeField<StudioProjectInterchangePlugin>,
    stateDigest: StudioProjectInterchangeField<String>,
    stateAvailability: StudioProjectInterchangeField<
      StudioProjectInterchangeDeviceStateAvailability
    > = .unknown(note: "No device-state availability was supplied."),
    nestedDevices: StudioProjectInterchangeField<[StudioProjectInterchangeDevice]>,
    resourceReferences: StudioProjectInterchangeField<[StudioProjectInterchangeMediaReference]>
  ) {
    self.id = id
    self.sourceIdentifier = sourceIdentifier
    self.kind = kind
    self.typeName = typeName
    self.displayName = displayName
    self.isEnabled = isEnabled
    self.plugin = plugin
    self.stateDigest = stateDigest
    self.stateAvailability = stateAvailability
    self.nestedDevices = nestedDevices
    self.resourceReferences = resourceReferences
    self.stateAvailabilityPresence = .present
  }

  private enum CodingKeys: String, CodingKey {
    case id
    case sourceIdentifier
    case kind
    case typeName
    case displayName
    case isEnabled
    case plugin
    case stateDigest
    case stateAvailability
    case nestedDevices
    case resourceReferences
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedStateAvailability = try container.decodeMigratable(
      StudioProjectInterchangeField<StudioProjectInterchangeDeviceStateAvailability>.self,
      forKey: .stateAvailability
    )
    stateAvailabilityPresence = decodedStateAvailability.presence
    id = try container.decode(StudioProjectInterchangeField<String>.self, forKey: .id)
    sourceIdentifier = try container.decode(
      StudioProjectInterchangeField<String>.self,
      forKey: .sourceIdentifier
    )
    kind = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangeDeviceKind>.self,
      forKey: .kind
    )
    typeName = try container.decode(StudioProjectInterchangeField<String>.self, forKey: .typeName)
    displayName = try container.decode(
      StudioProjectInterchangeField<String>.self,
      forKey: .displayName
    )
    isEnabled = try container.decode(
      StudioProjectInterchangeField<Bool>.self,
      forKey: .isEnabled
    )
    plugin = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangePlugin>.self,
      forKey: .plugin
    )
    let decodedStateDigest = try container.decode(
      StudioProjectInterchangeField<String>.self,
      forKey: .stateDigest
    )
    if stateAvailabilityPresence != .present, let legacyDigest = decodedStateDigest.value,
      !isLowercaseSHA256(legacyDigest)
    {
      stateDigest = .derived(
        canonicalLegacyStateDigest(legacyDigest),
        note: "Migrated from v1: canonical SHA-256 derived from the preserved legacy digest."
      )
    } else {
      stateDigest = decodedStateDigest
    }
    if let stateAvailabilityValue = decodedStateAvailability.value {
      stateAvailability = stateAvailabilityValue
    } else if stateDigest.value != nil {
      stateAvailability = .derived(
        .digestOnly,
        note: "Migrated from v1: digest-only availability derived from the preserved digest."
      )
    } else {
      stateAvailability = .unknown(
        note: "Migrated from v1: device-state availability was not represented."
      )
    }
    nestedDevices = try container.decode(
      StudioProjectInterchangeField<[StudioProjectInterchangeDevice]>.self,
      forKey: .nestedDevices
    )
    resourceReferences = try container.decode(
      StudioProjectInterchangeField<[StudioProjectInterchangeMediaReference]>.self,
      forKey: .resourceReferences
    )
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(sourceIdentifier, forKey: .sourceIdentifier)
    try container.encode(kind, forKey: .kind)
    try container.encode(typeName, forKey: .typeName)
    try container.encode(displayName, forKey: .displayName)
    try container.encode(isEnabled, forKey: .isEnabled)
    try container.encode(plugin, forKey: .plugin)
    try container.encode(stateDigest, forKey: .stateDigest)
    try container.encode(stateAvailability, forKey: .stateAvailability)
    try container.encode(nestedDevices, forKey: .nestedDevices)
    try container.encode(resourceReferences, forKey: .resourceReferences)
  }
}

public struct StudioProjectInterchangePlugin: Codable, Equatable, Sendable {
  public let format: StudioProjectInterchangeField<PluginFormat>
  public let name: StudioProjectInterchangeField<String>
  public let manufacturer: StudioProjectInterchangeField<String>
  public let identifier: StudioProjectInterchangeField<String>
  public let version: StudioProjectInterchangeField<String>

  public init(
    format: StudioProjectInterchangeField<PluginFormat>,
    name: StudioProjectInterchangeField<String>,
    manufacturer: StudioProjectInterchangeField<String>,
    identifier: StudioProjectInterchangeField<String>,
    version: StudioProjectInterchangeField<String>
  ) {
    self.format = format
    self.name = name
    self.manufacturer = manufacturer
    self.identifier = identifier
    self.version = version
  }
}

public enum StudioProjectInterchangeClipKind: String, Codable, Equatable, Sendable {
  case audio
  case midi
}

public enum StudioProjectInterchangeClipPlacement: String, Codable, Equatable, Sendable {
  case arrangement
  case session
  case takeLane
  case unknown
}

public struct StudioProjectInterchangeMIDINote: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let pitch: StudioProjectInterchangeField<Int>
  public let velocity: StudioProjectInterchangeField<Double>
  public let startBeat: StudioProjectInterchangeField<Double>
  public let durationBeats: StudioProjectInterchangeField<Double>
  public let channel: StudioProjectInterchangeField<Int>

  public init(
    id: StudioProjectInterchangeField<String>,
    pitch: StudioProjectInterchangeField<Int>,
    velocity: StudioProjectInterchangeField<Double>,
    startBeat: StudioProjectInterchangeField<Double>,
    durationBeats: StudioProjectInterchangeField<Double>,
    channel: StudioProjectInterchangeField<Int>
  ) {
    self.id = id
    self.pitch = pitch
    self.velocity = velocity
    self.startBeat = startBeat
    self.durationBeats = durationBeats
    self.channel = channel
  }
}

public struct StudioProjectInterchangeWarpMarker: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let beat: StudioProjectInterchangeField<Double>
  public let sampleTimeSeconds: StudioProjectInterchangeField<Double>

  public init(
    id: StudioProjectInterchangeField<String>,
    beat: StudioProjectInterchangeField<Double>,
    sampleTimeSeconds: StudioProjectInterchangeField<Double>
  ) {
    self.id = id
    self.beat = beat
    self.sampleTimeSeconds = sampleTimeSeconds
  }
}

public struct StudioProjectInterchangeClip: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let sourceIdentifier: StudioProjectInterchangeField<String>
  public let kind: StudioProjectInterchangeField<StudioProjectInterchangeClipKind>
  public let placement: StudioProjectInterchangeField<StudioProjectInterchangeClipPlacement>
  public let name: StudioProjectInterchangeField<String>
  public let startBeat: StudioProjectInterchangeField<Double>
  public let endBeat: StudioProjectInterchangeField<Double>
  public let loopStartBeat: StudioProjectInterchangeField<Double>
  public let loopEndBeat: StudioProjectInterchangeField<Double>
  public let loopEnabled: StudioProjectInterchangeField<Bool>
  public let warp: StudioProjectInterchangeField<StudioProjectInterchangeWarp>
  public let midiNoteCount: StudioProjectInterchangeField<Int>
  public let midiNotes: StudioProjectInterchangeField<[StudioProjectInterchangeMIDINote]>
  public let fades: StudioProjectInterchangeField<StudioProjectInterchangeClipFades>
  public let sampleReference: StudioProjectInterchangeField<StudioProjectInterchangeMediaReference>
  fileprivate let midiNotesPresence: StudioProjectInterchangeFieldPresence

  public init(
    id: StudioProjectInterchangeField<String>,
    sourceIdentifier: StudioProjectInterchangeField<String>,
    kind: StudioProjectInterchangeField<StudioProjectInterchangeClipKind>,
    placement: StudioProjectInterchangeField<StudioProjectInterchangeClipPlacement>,
    name: StudioProjectInterchangeField<String>,
    startBeat: StudioProjectInterchangeField<Double>,
    endBeat: StudioProjectInterchangeField<Double>,
    loopStartBeat: StudioProjectInterchangeField<Double>,
    loopEndBeat: StudioProjectInterchangeField<Double>,
    loopEnabled: StudioProjectInterchangeField<Bool>,
    warp: StudioProjectInterchangeField<StudioProjectInterchangeWarp>,
    midiNoteCount: StudioProjectInterchangeField<Int>,
    midiNotes: StudioProjectInterchangeField<[StudioProjectInterchangeMIDINote]> = .unknown(
      note: "No MIDI note events were supplied."
    ),
    fades: StudioProjectInterchangeField<StudioProjectInterchangeClipFades>,
    sampleReference: StudioProjectInterchangeField<StudioProjectInterchangeMediaReference>
  ) {
    self.id = id
    self.sourceIdentifier = sourceIdentifier
    self.kind = kind
    self.placement = placement
    self.name = name
    self.startBeat = startBeat
    self.endBeat = endBeat
    self.loopStartBeat = loopStartBeat
    self.loopEndBeat = loopEndBeat
    self.loopEnabled = loopEnabled
    self.warp = warp
    self.midiNoteCount = midiNoteCount
    self.midiNotes = midiNotes
    self.fades = fades
    self.sampleReference = sampleReference
    self.midiNotesPresence = .present
  }

  private enum CodingKeys: String, CodingKey {
    case id
    case sourceIdentifier
    case kind
    case placement
    case name
    case startBeat
    case endBeat
    case loopStartBeat
    case loopEndBeat
    case loopEnabled
    case warp
    case midiNoteCount
    case midiNotes
    case fades
    case sampleReference
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedMIDINotes = try container.decodeMigratable(
      StudioProjectInterchangeField<[StudioProjectInterchangeMIDINote]>.self,
      forKey: .midiNotes
    )
    midiNotesPresence = decodedMIDINotes.presence
    id = try container.decode(StudioProjectInterchangeField<String>.self, forKey: .id)
    sourceIdentifier = try container.decode(
      StudioProjectInterchangeField<String>.self,
      forKey: .sourceIdentifier
    )
    kind = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangeClipKind>.self,
      forKey: .kind
    )
    placement = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangeClipPlacement>.self,
      forKey: .placement
    )
    name = try container.decode(StudioProjectInterchangeField<String>.self, forKey: .name)
    startBeat = try container.decode(StudioProjectInterchangeField<Double>.self, forKey: .startBeat)
    endBeat = try container.decode(StudioProjectInterchangeField<Double>.self, forKey: .endBeat)
    loopStartBeat = try container.decode(
      StudioProjectInterchangeField<Double>.self,
      forKey: .loopStartBeat
    )
    loopEndBeat = try container.decode(
      StudioProjectInterchangeField<Double>.self,
      forKey: .loopEndBeat
    )
    loopEnabled = try container.decode(
      StudioProjectInterchangeField<Bool>.self,
      forKey: .loopEnabled
    )
    warp = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangeWarp>.self,
      forKey: .warp
    )
    midiNoteCount = try container.decode(
      StudioProjectInterchangeField<Int>.self,
      forKey: .midiNoteCount
    )
    midiNotes =
      decodedMIDINotes.value
      ?? .unknown(note: "Migrated from v1: MIDI note events were not represented.")
    fades = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangeClipFades>.self,
      forKey: .fades
    )
    sampleReference = try container.decode(
      StudioProjectInterchangeField<StudioProjectInterchangeMediaReference>.self,
      forKey: .sampleReference
    )
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(sourceIdentifier, forKey: .sourceIdentifier)
    try container.encode(kind, forKey: .kind)
    try container.encode(placement, forKey: .placement)
    try container.encode(name, forKey: .name)
    try container.encode(startBeat, forKey: .startBeat)
    try container.encode(endBeat, forKey: .endBeat)
    try container.encode(loopStartBeat, forKey: .loopStartBeat)
    try container.encode(loopEndBeat, forKey: .loopEndBeat)
    try container.encode(loopEnabled, forKey: .loopEnabled)
    try container.encode(warp, forKey: .warp)
    try container.encode(midiNoteCount, forKey: .midiNoteCount)
    try container.encode(midiNotes, forKey: .midiNotes)
    try container.encode(fades, forKey: .fades)
    try container.encode(sampleReference, forKey: .sampleReference)
  }
}

public struct StudioProjectInterchangeWarp: Codable, Equatable, Sendable {
  public let isWarped: StudioProjectInterchangeField<Bool>
  public let mode: StudioProjectInterchangeField<Int>
  public let markerCount: StudioProjectInterchangeField<Int>
  public let markers: StudioProjectInterchangeField<[StudioProjectInterchangeWarpMarker]>
  fileprivate let markersPresence: StudioProjectInterchangeFieldPresence

  public init(
    isWarped: StudioProjectInterchangeField<Bool>,
    mode: StudioProjectInterchangeField<Int>,
    markerCount: StudioProjectInterchangeField<Int>,
    markers: StudioProjectInterchangeField<[StudioProjectInterchangeWarpMarker]> = .unknown(
      note: "No warp-marker events were supplied."
    )
  ) {
    self.isWarped = isWarped
    self.mode = mode
    self.markerCount = markerCount
    self.markers = markers
    self.markersPresence = .present
  }

  private enum CodingKeys: String, CodingKey {
    case isWarped
    case mode
    case markerCount
    case markers
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedMarkers = try container.decodeMigratable(
      StudioProjectInterchangeField<[StudioProjectInterchangeWarpMarker]>.self,
      forKey: .markers
    )
    markersPresence = decodedMarkers.presence
    isWarped = try container.decode(StudioProjectInterchangeField<Bool>.self, forKey: .isWarped)
    mode = try container.decode(StudioProjectInterchangeField<Int>.self, forKey: .mode)
    markerCount = try container.decode(
      StudioProjectInterchangeField<Int>.self,
      forKey: .markerCount
    )
    markers =
      decodedMarkers.value
      ?? .unknown(note: "Migrated from v1: warp-marker events were not represented.")
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(isWarped, forKey: .isWarped)
    try container.encode(mode, forKey: .mode)
    try container.encode(markerCount, forKey: .markerCount)
    try container.encode(markers, forKey: .markers)
  }
}

public struct StudioProjectInterchangeClipFades: Codable, Equatable, Sendable {
  public let fadeIn: StudioProjectInterchangeField<Double>
  public let fadeOut: StudioProjectInterchangeField<Double>
  public let fadeInCurve: StudioProjectInterchangeField<Double>
  public let fadeOutCurve: StudioProjectInterchangeField<Double>
  fileprivate let fadeInCurvePresence: StudioProjectInterchangeFieldPresence
  fileprivate let fadeOutCurvePresence: StudioProjectInterchangeFieldPresence

  public init(
    fadeIn: StudioProjectInterchangeField<Double>,
    fadeOut: StudioProjectInterchangeField<Double>,
    fadeInCurve: StudioProjectInterchangeField<Double> = .unknown(
      note: "No fade-in curve was supplied."
    ),
    fadeOutCurve: StudioProjectInterchangeField<Double> = .unknown(
      note: "No fade-out curve was supplied."
    )
  ) {
    self.fadeIn = fadeIn
    self.fadeOut = fadeOut
    self.fadeInCurve = fadeInCurve
    self.fadeOutCurve = fadeOutCurve
    self.fadeInCurvePresence = .present
    self.fadeOutCurvePresence = .present
  }

  private enum CodingKeys: String, CodingKey {
    case fadeIn
    case fadeOut
    case fadeInCurve
    case fadeOutCurve
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedFadeInCurve = try container.decodeMigratable(
      StudioProjectInterchangeField<Double>.self,
      forKey: .fadeInCurve
    )
    fadeInCurvePresence = decodedFadeInCurve.presence
    let decodedFadeOutCurve = try container.decodeMigratable(
      StudioProjectInterchangeField<Double>.self,
      forKey: .fadeOutCurve
    )
    fadeOutCurvePresence = decodedFadeOutCurve.presence
    fadeIn = try container.decode(StudioProjectInterchangeField<Double>.self, forKey: .fadeIn)
    fadeOut = try container.decode(StudioProjectInterchangeField<Double>.self, forKey: .fadeOut)
    fadeInCurve =
      decodedFadeInCurve.value
      ?? .unknown(note: "Migrated from v1: fade-in curve was not represented.")
    fadeOutCurve =
      decodedFadeOutCurve.value
      ?? .unknown(note: "Migrated from v1: fade-out curve was not represented.")
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(fadeIn, forKey: .fadeIn)
    try container.encode(fadeOut, forKey: .fadeOut)
    try container.encode(fadeInCurve, forKey: .fadeInCurve)
    try container.encode(fadeOutCurve, forKey: .fadeOutCurve)
  }
}

public struct StudioProjectInterchangeMediaReference: Codable, Equatable, Sendable {
  public let absolutePath: StudioProjectInterchangeField<String>
  public let relativePath: StudioProjectInterchangeField<String>
  public let assetIdentity: StudioProjectInterchangeField<String>

  public init(
    absolutePath: StudioProjectInterchangeField<String>,
    relativePath: StudioProjectInterchangeField<String>,
    assetIdentity: StudioProjectInterchangeField<String>
  ) {
    self.absolutePath = absolutePath
    self.relativePath = relativePath
    self.assetIdentity = assetIdentity
  }
}

public struct StudioProjectInterchangeMediaDependency: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let kind: StudioProjectInterchangeField<MediaDependencyKind>
  public let reference: StudioProjectInterchangeField<StudioProjectInterchangeMediaReference>
  public let resolvedURL: StudioProjectInterchangeField<URL>
  public let availability: StudioProjectInterchangeField<MediaDependencyAvailability>
  public let ownerID: StudioProjectInterchangeField<String>

  public init(
    id: StudioProjectInterchangeField<String>,
    kind: StudioProjectInterchangeField<MediaDependencyKind>,
    reference: StudioProjectInterchangeField<StudioProjectInterchangeMediaReference>,
    resolvedURL: StudioProjectInterchangeField<URL>,
    availability: StudioProjectInterchangeField<MediaDependencyAvailability>,
    ownerID: StudioProjectInterchangeField<String>
  ) {
    self.id = id
    self.kind = kind
    self.reference = reference
    self.resolvedURL = resolvedURL
    self.availability = availability
    self.ownerID = ownerID
  }
}

public enum StudioProjectInterchangeAudioReferenceUsage: String, Codable, Equatable, Sendable {
  case used
  case unused
}

public struct StudioProjectInterchangeAudioReference: Codable, Equatable, Sendable {
  public let relativePath: StudioProjectInterchangeField<String>
  public let resolvedURL: StudioProjectInterchangeField<URL>
  public let availability: StudioProjectInterchangeField<MediaDependencyAvailability>
  public let usage: StudioProjectInterchangeField<StudioProjectInterchangeAudioReferenceUsage>

  public init(
    relativePath: StudioProjectInterchangeField<String>,
    resolvedURL: StudioProjectInterchangeField<URL>,
    availability: StudioProjectInterchangeField<MediaDependencyAvailability>,
    usage: StudioProjectInterchangeField<StudioProjectInterchangeAudioReferenceUsage>
  ) {
    self.relativePath = relativePath
    self.resolvedURL = resolvedURL
    self.availability = availability
    self.usage = usage
  }
}

public struct StudioProjectInterchangeLocator: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let name: StudioProjectInterchangeField<String>
  public let beatTime: StudioProjectInterchangeField<Double>

  public init(
    id: StudioProjectInterchangeField<String>,
    name: StudioProjectInterchangeField<String>,
    beatTime: StudioProjectInterchangeField<Double>
  ) {
    self.id = id
    self.name = name
    self.beatTime = beatTime
  }
}

public enum StudioProjectInterchangeAutomationInterpolation: String, Codable, Equatable, Sendable {
  case step
  case linear
  case bezier
}

public struct StudioProjectInterchangeAutomationPoint: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let beat: StudioProjectInterchangeField<Double>
  public let value: StudioProjectInterchangeField<Double>
  public let interpolation:
    StudioProjectInterchangeField<StudioProjectInterchangeAutomationInterpolation>

  public init(
    id: StudioProjectInterchangeField<String>,
    beat: StudioProjectInterchangeField<Double>,
    value: StudioProjectInterchangeField<Double>,
    interpolation: StudioProjectInterchangeField<StudioProjectInterchangeAutomationInterpolation>
  ) {
    self.id = id
    self.beat = beat
    self.value = value
    self.interpolation = interpolation
  }
}

public struct StudioProjectInterchangeAutomationLane: Codable, Equatable, Sendable {
  public let id: StudioProjectInterchangeField<String>
  public let ownerID: StudioProjectInterchangeField<String>
  public let parameterIdentifier: StudioProjectInterchangeField<String>
  public let parameterName: StudioProjectInterchangeField<String>
  public let pointCount: StudioProjectInterchangeField<Int>
  public let points: StudioProjectInterchangeField<[StudioProjectInterchangeAutomationPoint]>
  fileprivate let idPresence: StudioProjectInterchangeFieldPresence
  fileprivate let parameterIdentifierPresence: StudioProjectInterchangeFieldPresence
  fileprivate let pointsPresence: StudioProjectInterchangeFieldPresence

  public init(
    ownerID: StudioProjectInterchangeField<String>,
    parameterName: StudioProjectInterchangeField<String>,
    pointCount: StudioProjectInterchangeField<Int>,
    id: StudioProjectInterchangeField<String> = .unknown(
      note: "No automation lane identifier was supplied."
    ),
    parameterIdentifier: StudioProjectInterchangeField<String> = .unknown(
      note: "No automation parameter identifier was supplied."
    ),
    points: StudioProjectInterchangeField<[StudioProjectInterchangeAutomationPoint]> = .unknown(
      note: "No automation points were supplied."
    )
  ) {
    self.id = id
    self.ownerID = ownerID
    self.parameterIdentifier = parameterIdentifier
    self.parameterName = parameterName
    self.pointCount = pointCount
    self.points = points
    self.idPresence = .present
    self.parameterIdentifierPresence = .present
    self.pointsPresence = .present
  }

  private enum CodingKeys: String, CodingKey {
    case id
    case ownerID
    case parameterIdentifier
    case parameterName
    case pointCount
    case points
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let decodedID = try container.decodeMigratable(
      StudioProjectInterchangeField<String>.self,
      forKey: .id
    )
    idPresence = decodedID.presence
    let decodedParameterIdentifier = try container.decodeMigratable(
      StudioProjectInterchangeField<String>.self,
      forKey: .parameterIdentifier
    )
    parameterIdentifierPresence = decodedParameterIdentifier.presence
    let decodedPoints = try container.decodeMigratable(
      StudioProjectInterchangeField<[StudioProjectInterchangeAutomationPoint]>.self,
      forKey: .points
    )
    pointsPresence = decodedPoints.presence
    ownerID = try container.decode(StudioProjectInterchangeField<String>.self, forKey: .ownerID)
    parameterName = try container.decode(
      StudioProjectInterchangeField<String>.self,
      forKey: .parameterName
    )
    id =
      decodedID.value
      ?? .derived(
        StableID.forValue(
          "v1-automation:\(ownerID.value ?? "unknown"):\(parameterName.value ?? "unknown")"
        ),
        note: "Migrated from v1: automation lane ID was derived from bounded lane fields."
      )
    parameterIdentifier =
      decodedParameterIdentifier.value
      ?? .unknown(note: "Migrated from v1: automation parameter IDs were not represented.")
    pointCount = try container.decode(
      StudioProjectInterchangeField<Int>.self,
      forKey: .pointCount
    )
    points =
      decodedPoints.value
      ?? .unknown(note: "Migrated from v1: automation points were not represented.")
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(ownerID, forKey: .ownerID)
    try container.encode(parameterIdentifier, forKey: .parameterIdentifier)
    try container.encode(parameterName, forKey: .parameterName)
    try container.encode(pointCount, forKey: .pointCount)
    try container.encode(points, forKey: .points)
  }
}

public struct StudioProjectInterchangeEvidenceSummary: Codable, Equatable, Sendable {
  public let xmlBytes: StudioProjectInterchangeField<Int>
  public let trackSummary: StudioProjectInterchangeField<StudioProjectInterchangeTrackSummary>
  public let deviceSummary: StudioProjectInterchangeField<StudioProjectInterchangeDeviceSummary>
  public let warpMarkerCount: StudioProjectInterchangeField<Int>
  public let automationEnvelopeCount: StudioProjectInterchangeField<Int>

  public init(
    xmlBytes: StudioProjectInterchangeField<Int>,
    trackSummary: StudioProjectInterchangeField<StudioProjectInterchangeTrackSummary>,
    deviceSummary: StudioProjectInterchangeField<StudioProjectInterchangeDeviceSummary>,
    warpMarkerCount: StudioProjectInterchangeField<Int>,
    automationEnvelopeCount: StudioProjectInterchangeField<Int>
  ) {
    self.xmlBytes = xmlBytes
    self.trackSummary = trackSummary
    self.deviceSummary = deviceSummary
    self.warpMarkerCount = warpMarkerCount
    self.automationEnvelopeCount = automationEnvelopeCount
  }
}

public struct StudioProjectInterchangeTrackSummary: Codable, Equatable, Sendable {
  public let audioTrackCount: Int
  public let midiTrackCount: Int
  public let groupTrackCount: Int
  public let returnTrackCount: Int

  public init(
    audioTrackCount: Int,
    midiTrackCount: Int,
    groupTrackCount: Int,
    returnTrackCount: Int
  ) {
    self.audioTrackCount = audioTrackCount
    self.midiTrackCount = midiTrackCount
    self.groupTrackCount = groupTrackCount
    self.returnTrackCount = returnTrackCount
  }
}

public struct StudioProjectInterchangeDeviceSummary: Codable, Equatable, Sendable {
  public let thirdPartyDeviceCount: Int
  public let maxForLiveDeviceCount: Int
  public let rackDeviceCount: Int

  public init(
    thirdPartyDeviceCount: Int,
    maxForLiveDeviceCount: Int,
    rackDeviceCount: Int
  ) {
    self.thirdPartyDeviceCount = thirdPartyDeviceCount
    self.maxForLiveDeviceCount = maxForLiveDeviceCount
    self.rackDeviceCount = rackDeviceCount
  }
}

public struct StudioProjectInterchangeAbletonAdapter: Sendable {
  public init() {}

  public func map(
    parsedSet: ParsedAbletonSet,
    sourceFileURL: URL? = nil
  ) -> StudioProjectInterchange {
    let tracksByXMLID = Dictionary(
      grouping: parsedSet.content.tracks.compactMap { track in
        track.xmlID.map { ($0, track.id) }
      },
      by: { $0.0 }
    )
    let trackIDsByXMLID = tracksByXMLID.compactMapValues { matches in
      matches.count == 1 ? matches[0].1 : nil
    }
    let tracks = parsedSet.content.tracks.map { track in
      map(track: track, trackIDsByXMLID: trackIDsByXMLID)
    }
    let sortedDependencies = parsedSet.content.dependencies.sorted(by: dependencyComesBefore)
    var uniqueDependencies: [MediaDependency] = []
    for dependency in sortedDependencies where uniqueDependencies.last != dependency {
      uniqueDependencies.append(dependency)
    }
    let mediaDependencies = uniqueDependencies.map(map(dependency:))
    let locators = parsedSet.content.locators
      .sorted(by: locatorComesBefore)
      .map(map(locator:))
    let tempoMap: StudioProjectInterchangeField<[StudioProjectInterchangeTempoEvent]>
    if let tempo = parsedSet.content.tempo {
      tempoMap = .derived(
        [
          StudioProjectInterchangeTempoEvent(
            id: .derived(
              StableID.forValue("ableton-tempo-event:0:\(tempo)"),
              note: "Stable ID derived from the parsed project tempo."
            ),
            beat: .derived(0, note: "A single project tempo applies from the timeline origin."),
            beatsPerMinute: .parsed(tempo)
          )
        ],
        note: "Derived as a single-event tempo map because the parser exposes only project tempo."
      )
    } else {
      tempoMap = .unknown(note: "The current parser did not expose project tempo events.")
    }

    return StudioProjectInterchange(
      identity: StudioProjectInterchangeIdentity(
        daw: .parsed(.abletonLive),
        displayName: sourceFileURL.map {
          .derived(
            $0.deletingPathExtension().lastPathComponent,
            note: "Derived from the Set filename, not the document body."
          )
        } ?? .unknown(note: "A Set display name is not preserved in the current parser output."),
        sourceApplication: .parsed(
          StudioProjectInterchangeApplication(
            creator: field(from: parsedSet.creator),
            majorVersion: field(from: parsedSet.format.majorVersion),
            minorVersion: field(from: parsedSet.format.minorVersion),
            schemaChangeCount: field(from: parsedSet.format.schemaChangeCount),
            revision: field(from: parsedSet.format.revision)
          )),
        sourceDocument: sourceFileURL.map {
          .derived(
            StudioProjectInterchangeDocumentReference(fileURL: $0.standardizedFileURL),
            note: "Filesystem origin is derived from the adapter input."
          )
        } ?? .unknown(note: "No source document URL was supplied to the adapter.")
      ),
      timeline: StudioProjectInterchangeTimeline(
        tempo: field(from: parsedSet.content.tempo),
        tempoMap: tempoMap,
        timeSignature: parsedSet.content.timeSignature.map { .parsed($0) }
          ?? .unsupported(
            note: "The current Ableton parser does not populate a project time signature."
          )
      ),
      staticMetadata: .unsupported(
        note: "The current Ableton parser does not expose additional project-level static metadata."
      ),
      tracks: .parsed(tracks),
      mediaDependencies: .parsed(mediaDependencies),
      audioReferences: .unsupported(
        note:
          "The current Ableton parser does not expose a session-level audio reference inventory."
      ),
      locators: .derived(
        locators,
        note:
          "Locator names and times may include parser fallbacks when the source document omits them."
      ),
      previewReferences: .unsupported(
        note: "The current Ableton parser does not expose preview image references."
      ),
      automationLanes: .unsupported(
        note:
          "The current Ableton parser counts automation envelopes but does not expose lane detail."
      ),
      exportReferences: .unsupported(
        note: "Ableton export references are outside the current parser contract."
      ),
      handoffReferences: .unsupported(
        note: "Handoff references are not represented in the current parser output."
      ),
      dawExtensions: .unsupported(
        note: "The Ableton adapter does not emit unbounded or unversioned DAW-specific payloads."
      ),
      evidenceSummary: StudioProjectInterchangeEvidenceSummary(
        xmlBytes: .parsed(parsedSet.xmlBytes),
        trackSummary: .parsed(
          StudioProjectInterchangeTrackSummary(
            audioTrackCount: parsedSet.structure.audioTrackCount,
            midiTrackCount: parsedSet.structure.midiTrackCount,
            groupTrackCount: parsedSet.structure.groupTrackCount,
            returnTrackCount: parsedSet.structure.returnTrackCount
          )),
        deviceSummary: .parsed(
          StudioProjectInterchangeDeviceSummary(
            thirdPartyDeviceCount: parsedSet.structure.thirdPartyDeviceCount,
            maxForLiveDeviceCount: parsedSet.structure.maxForLiveDeviceCount,
            rackDeviceCount: parsedSet.structure.rackDeviceCount
          )),
        warpMarkerCount: .parsed(parsedSet.structure.warpMarkerCount),
        automationEnvelopeCount: .parsed(parsedSet.structure.automationEnvelopeCount)
      )
    )
  }

  private func map(
    track: SetTrack,
    trackIDsByXMLID: [String: String]
  ) -> StudioProjectInterchangeTrack {
    let sourceParentID = field(
      from: track.groupTrackXMLID,
      noteWhenMissing: "This track is not grouped under another parsed track."
    )
    let parentTrackID: StudioProjectInterchangeField<String>
    if let sourceID = track.groupTrackXMLID, let parentID = trackIDsByXMLID[sourceID] {
      parentTrackID = .derived(
        parentID,
        note: "Resolved from the parsed group track XML identifier."
      )
    } else {
      parentTrackID = .unknown(
        note: "No parsed parent track identifier could be resolved."
      )
    }

    return StudioProjectInterchangeTrack(
      id: .derived(
        track.id,
        note: "Stable ID derived from the current parser's normalized track representation."
      ),
      sourceIdentifier: field(
        from: track.xmlID,
        noteWhenMissing: "This parsed track did not expose an Ableton XML identifier."
      ),
      kind: .parsed(track.kind.interchangeKind),
      name: .derived(
        track.name,
        note: "Track names can include parser fallbacks when the Set omits a user-visible name."
      ),
      colorIndex: field(
        from: track.colorIndex,
        noteWhenMissing: "No track color index was parsed."
      ),
      isFolded: field(
        from: track.isFolded,
        noteWhenMissing: "The current parser did not expose a fold-state for this track."
      ),
      hierarchy: .parsed(
        StudioProjectInterchangeTrackHierarchy(
          sourceParentIdentifier: sourceParentID,
          parentTrackID: parentTrackID
        )),
      mixer: .parsed(
        StudioProjectInterchangeTrackMixer(
          volume: field(
            from: track.mixer.volume,
            noteWhenMissing: "The current parser did not expose a volume value for this track."
          ),
          pan: field(
            from: track.mixer.pan,
            noteWhenMissing: "The current parser did not expose a pan value for this track."
          )
        )),
      routing: .parsed(
        StudioProjectInterchangeTrackRouting(
          inputReference: .unsupported(
            note: "The current Ableton parser does not expose track input routing."
          ),
          outputReference: .unsupported(
            note: "The current Ableton parser does not expose track output routing."
          ),
          sends: .unsupported(
            note: "The current Ableton parser does not expose send routing or send amounts."
          ),
          speakerEnabled: field(
            from: track.mixer.speakerOn,
            noteWhenMissing: "The current parser did not expose a speaker state for this track."
          ),
          soloEnabled: field(
            from: track.mixer.isSoloed,
            noteWhenMissing: "The current parser did not expose a solo state for this track."
          ),
          armEnabled: field(
            from: track.mixer.isArmed,
            noteWhenMissing: "The current parser did not expose an arm state for this track."
          ),
          monitoringMode: field(
            from: track.mixer.monitoringMode,
            noteWhenMissing: "The current parser did not expose a monitoring mode for this track."
          )
        )),
      devices: .parsed(track.devices.map(map(device:))),
      clips: .parsed(track.clips.map(map(clip:)))
    )
  }

  private func map(device: SetDevice) -> StudioProjectInterchangeDevice {
    StudioProjectInterchangeDevice(
      id: .derived(
        device.id,
        note: "Stable ID derived from the current parser's normalized device representation."
      ),
      sourceIdentifier: field(
        from: device.xmlID,
        noteWhenMissing: "This parsed device did not expose an Ableton XML identifier."
      ),
      kind: .parsed(device.kind.interchangeKind),
      typeName: .parsed(device.typeName),
      displayName: .derived(
        device.displayName,
        note:
          "Display names can fall back to plug-in or element names when Live omits a custom label."
      ),
      isEnabled: field(
        from: device.isEnabled,
        noteWhenMissing: "The current parser did not expose an enabled state for this device."
      ),
      plugin: map(plugin: device.plugin),
      stateDigest: .derived(
        device.stateDigest,
        note: "The digest is computed from the parsed device XML subtree."
      ),
      stateAvailability: .derived(
        .digestOnly,
        note: "The parser preserves only a digest of the read-only device XML subtree."
      ),
      nestedDevices: .parsed(device.nestedDevices.map(map(device:))),
      resourceReferences: .parsed(
        device.resourceReferences
          .sorted(by: mediaReferenceComesBefore)
          .map(map(reference:))
      )
    )
  }

  private func map(dependency: MediaDependency) -> StudioProjectInterchangeMediaDependency {
    StudioProjectInterchangeMediaDependency(
      id: .derived(
        dependency.id,
        note: "Stable dependency ID derived from the normalized parsed dependency representation."
      ),
      kind: .parsed(dependency.kind),
      reference: .parsed(map(reference: dependency.reference)),
      resolvedURL: field(
        from: dependency.resolvedURL?.standardizedFileURL,
        noteWhenMissing: "This dependency does not currently resolve to a concrete local file URL."
      ),
      availability: .parsed(dependency.availability),
      ownerID: .derived(
        dependency.ownerID,
        note: "Owner IDs reference normalized parsed clip or device identifiers."
      )
    )
  }

  private func map(plugin: PluginIdentity?) -> StudioProjectInterchangeField<
    StudioProjectInterchangePlugin
  > {
    guard let plugin else {
      return .unknown(note: "This device did not expose third-party plug-in identity metadata.")
    }

    return .parsed(
      StudioProjectInterchangePlugin(
        format: .parsed(plugin.format),
        name: field(
          from: plugin.name,
          noteWhenMissing: "The parser exposed plug-in hosting but not a plug-in name."
        ),
        manufacturer: field(
          from: plugin.manufacturer,
          noteWhenMissing: "The parser exposed plug-in hosting but not a manufacturer."
        ),
        identifier: field(
          from: plugin.identifier,
          noteWhenMissing: "The parser exposed plug-in hosting but not a stable identifier."
        ),
        version: field(
          from: plugin.version,
          noteWhenMissing: "The parser exposed plug-in hosting but not a version string."
        )
      ))
  }

  private func map(clip: SetClip) -> StudioProjectInterchangeClip {
    let warp: StudioProjectInterchangeField<StudioProjectInterchangeWarp>
    let midiNoteCount: StudioProjectInterchangeField<Int>
    let midiNotes: StudioProjectInterchangeField<[StudioProjectInterchangeMIDINote]>
    let sampleReference: StudioProjectInterchangeField<StudioProjectInterchangeMediaReference>
    switch clip.kind {
    case .audio:
      warp = .parsed(
        StudioProjectInterchangeWarp(
          isWarped: field(
            from: clip.isWarped,
            noteWhenMissing: "This audio clip did not expose warp state."
          ),
          mode: field(
            from: clip.warpMode,
            noteWhenMissing: "This audio clip did not expose a warp mode."
          ),
          markerCount: .parsed(clip.warpMarkerCount),
          markers: .unsupported(
            note: "The parser exposes only a warp-marker count, not marker positions."
          )
        )
      )
      midiNoteCount = .unsupported(note: "MIDI note counts do not apply to audio clips.")
      midiNotes = .unsupported(note: "MIDI note events do not apply to audio clips.")
      sampleReference = map(reference: clip.sampleReference)
    case .midi:
      warp = .unsupported(note: "Audio warp metadata does not apply to MIDI clips.")
      midiNoteCount = .parsed(clip.midiNoteCount)
      midiNotes = .unsupported(
        note: "The parser exposes only a MIDI note count, not note event detail."
      )
      sampleReference = .unsupported(note: "Audio media references do not apply to MIDI clips.")
    }

    return StudioProjectInterchangeClip(
      id: .derived(
        clip.id,
        note: "Stable ID derived from the current parser's normalized clip representation."
      ),
      sourceIdentifier: field(
        from: clip.xmlID,
        noteWhenMissing: "This parsed clip did not expose an Ableton XML identifier."
      ),
      kind: .parsed(clip.kind.interchangeKind),
      placement: .parsed(clip.placement.interchangePlacement),
      name: .derived(
        clip.name,
        note: "Clip names can include parser fallbacks when the Set omits a clip label."
      ),
      startBeat: field(
        from: clip.startBeat,
        provenance: .derived,
        noteWhenMissing: "The current parser did not expose a clip start beat."
      ),
      endBeat: field(
        from: clip.endBeat,
        noteWhenMissing: "The current parser did not expose a clip end beat."
      ),
      loopStartBeat: field(
        from: clip.loopStartBeat,
        noteWhenMissing: "This clip did not expose a loop start beat."
      ),
      loopEndBeat: field(
        from: clip.loopEndBeat,
        noteWhenMissing: "This clip did not expose a loop end beat."
      ),
      loopEnabled: field(
        from: clip.loopEnabled,
        noteWhenMissing: "This clip did not expose loop enablement."
      ),
      warp: warp,
      midiNoteCount: midiNoteCount,
      midiNotes: midiNotes,
      fades: .unsupported(
        note: "The current Ableton parser does not expose clip fade curves or durations."
      ),
      sampleReference: sampleReference
    )
  }

  private func map(reference: MediaReference?) -> StudioProjectInterchangeField<
    StudioProjectInterchangeMediaReference
  > {
    guard let reference else {
      return .unknown(note: "No media reference was exposed for this element.")
    }
    return .parsed(map(reference: reference))
  }

  private func map(reference: MediaReference) -> StudioProjectInterchangeMediaReference {
    StudioProjectInterchangeMediaReference(
      absolutePath: field(
        from: reference.absolutePath,
        noteWhenMissing: "The parser did not expose an absolute media path."
      ),
      relativePath: field(
        from: reference.relativePath,
        noteWhenMissing: "The parser did not expose a project-relative media path."
      ),
      assetIdentity: .unsupported(
        note: "Content-asset identity is not available in the current Ableton parser output."
      )
    )
  }

  private func map(locator: SetLocator) -> StudioProjectInterchangeLocator {
    StudioProjectInterchangeLocator(
      id: .derived(
        locator.id,
        note: "Stable ID derived from the current parser's normalized locator representation."
      ),
      name: .derived(
        locator.name,
        note: "Locator names can include parser fallbacks when the Set omits a locator label."
      ),
      beatTime: .derived(
        locator.beatTime,
        note: "Locator beat times can include a parser fallback when the Set omits a locator time."
      )
    )
  }

  private func mediaReferenceComesBefore(_ lhs: MediaReference, _ rhs: MediaReference) -> Bool {
    let lhsRelativePath = lhs.relativePath ?? ""
    let rhsRelativePath = rhs.relativePath ?? ""
    if lhsRelativePath != rhsRelativePath {
      return lhsRelativePath < rhsRelativePath
    }
    return (lhs.absolutePath ?? "") < (rhs.absolutePath ?? "")
  }

  private func dependencyComesBefore(_ lhs: MediaDependency, _ rhs: MediaDependency) -> Bool {
    let lhsKey = [
      lhs.id,
      lhs.kind.rawValue,
      lhs.ownerID,
      lhs.reference.relativePath ?? "",
      lhs.reference.absolutePath ?? "",
      lhs.availability.rawValue,
      lhs.resolvedURL?.standardizedFileURL.absoluteString ?? "",
    ].joined(separator: "\u{1F}")
    let rhsKey = [
      rhs.id,
      rhs.kind.rawValue,
      rhs.ownerID,
      rhs.reference.relativePath ?? "",
      rhs.reference.absolutePath ?? "",
      rhs.availability.rawValue,
      rhs.resolvedURL?.standardizedFileURL.absoluteString ?? "",
    ].joined(separator: "\u{1F}")
    return lhsKey < rhsKey
  }

  private func locatorComesBefore(_ lhs: SetLocator, _ rhs: SetLocator) -> Bool {
    if lhs.beatTime != rhs.beatTime {
      return lhs.beatTime < rhs.beatTime
    }
    return lhs.id < rhs.id
  }

  private func field<Value: Codable & Equatable & Sendable>(
    from value: Value?,
    provenance: StudioProjectInterchangeProvenance = .parsed,
    noteWhenMissing: String? = nil
  ) -> StudioProjectInterchangeField<Value> {
    guard let value else {
      return .unknown(note: noteWhenMissing)
    }
    return .init(provenance: provenance, value: value)
  }
}

extension ParsedAbletonSet {
  public func projectInterchange(sourceFileURL: URL? = nil) -> StudioProjectInterchange {
    StudioProjectInterchangeAbletonAdapter().map(parsedSet: self, sourceFileURL: sourceFileURL)
  }
}

public enum StudioProjectInterchangeAdapterError: Error, Equatable, Sendable {
  case selectedRevisionDoesNotBelongToSession(String)
}

public struct StudioProjectInterchangeLogicAdapter: Sendable {
  public init() {}

  public func map(
    session: DiscoveredDAWSession,
    selectedRevision: DAWSessionRevision? = nil
  ) throws -> StudioProjectInterchange {
    if let selectedRevision, !session.revisions.contains(selectedRevision) {
      throw StudioProjectInterchangeAdapterError.selectedRevisionDoesNotBelongToSession(
        selectedRevision.id
      )
    }
    let revision = selectedRevision ?? session.revisions.first
    let metadata = revision?.inspection.metadata
    let displayName = revision?.displayName ?? session.displayName

    return StudioProjectInterchange(
      identity: StudioProjectInterchangeIdentity(
        daw: .derived(
          .logicPro,
          note: "Derived from the Logic adapter's .logicx package discovery."
        ),
        displayName: .derived(
          displayName,
          note: "Derived from the selected Logic alternative or backup label."
        ),
        sourceApplication: .derived(
          mapLogicApplication(creatorVersion: session.creatorVersion),
          note: "Derived from read-only Logic package metadata and adapter classification."
        ),
        sourceDocument: .derived(
          StudioProjectInterchangeDocumentReference(
            fileURL: session.rootURL.standardizedFileURL
          ),
          note: "Filesystem origin is derived from the discovered Logic session package."
        )
      ),
      timeline: StudioProjectInterchangeTimeline(
        tempo: field(
          from: metadata?.tempo,
          noteWhenMissing: "The selected Logic metadata did not expose a project tempo."
        ),
        tempoMap: mapLogicTempoMap(metadata?.tempo),
        timeSignature: field(
          from: metadata?.timeSignature,
          noteWhenMissing: "The selected Logic metadata did not expose a project time signature."
        )
      ),
      staticMetadata: .derived(
        StudioProjectInterchangeStaticMetadata(
          totalTrackCount: field(
            from: metadata?.trackCount,
            noteWhenMissing: "The selected Logic metadata did not expose a total track count."
          ),
          sampleRate: field(
            from: metadata?.sampleRate,
            noteWhenMissing: "The selected Logic metadata did not expose a sample rate."
          ),
          musicalKey: field(
            from: metadata?.key,
            noteWhenMissing: "The selected Logic metadata did not expose a musical key."
          )
        )
      ),
      tracks: .unsupported(
        note: "The current Logic adapter does not parse track structure, clips, or device chains."
      ),
      mediaDependencies: .unknown(
        note:
          "Readable Logic audio references are preserved separately because clip or device ownership is not currently provable."
      ),
      audioReferences: mapLogicAudioReferences(from: revision),
      locators: .unsupported(
        note: "The current Logic adapter does not parse marker or locator detail."
      ),
      previewReferences: mapLogicPreviewReferences(previewImageURL: session.previewImageURL),
      automationLanes: .unsupported(
        note: "The current Logic adapter does not parse automation lane detail."
      ),
      exportReferences: .unsupported(
        note: "The current Logic adapter does not enumerate Logic export documents."
      ),
      handoffReferences: .unsupported(
        note: "The current Logic adapter does not enumerate portable handoff documents."
      ),
      dawExtensions: mapLogicExtensions(from: revision),
      evidenceSummary: StudioProjectInterchangeEvidenceSummary(
        xmlBytes: .unsupported(note: "Logic discovery does not produce XML byte counts."),
        trackSummary: .unknown(
          note: logicTrackSummaryNote(from: metadata?.trackCount)
        ),
        deviceSummary: .unsupported(
          note: "The current Logic adapter does not inspect device chains."
        ),
        warpMarkerCount: .unsupported(
          note: "The current Logic adapter does not expose Flex or warp marker counts."
        ),
        automationEnvelopeCount: .unsupported(
          note: "The current Logic adapter does not expose automation envelope counts."
        )
      )
    )
  }

  private func mapLogicTempoMap(
    _ tempo: Double?
  ) -> StudioProjectInterchangeField<[StudioProjectInterchangeTempoEvent]> {
    guard let tempo else {
      return .unknown(note: "The selected Logic metadata did not expose tempo-map events.")
    }
    return .derived(
      [
        StudioProjectInterchangeTempoEvent(
          id: .derived(
            StableID.forValue("logic-tempo-event:0:\(tempo)"),
            note: "Stable ID derived from the selected revision's project tempo."
          ),
          beat: .derived(0, note: "A single metadata tempo applies from the timeline origin."),
          beatsPerMinute: .derived(
            tempo,
            note: "Derived from read-only Logic project metadata, not parsed event data."
          )
        )
      ],
      note: "Derived as a single-event map because Logic inspection exposes only project tempo."
    )
  }

  private func mapLogicApplication(
    creatorVersion: String?
  ) -> StudioProjectInterchangeApplication {
    let versionString = creatorVersion?.trimmingCharacters(in: .whitespacesAndNewlines)
    let parsedVersion = versionString.flatMap(parseLogicVersion)
    let creatorName =
      parsedVersion?.creator
      ?? (versionString?.isEmpty == false ? versionString : nil)
      ?? "Logic Pro"

    return StudioProjectInterchangeApplication(
      creator: parsedVersion.map { _ in
        .derived(
          creatorName,
          note: "Derived from the Logic metadata creator string."
        )
      }
        ?? .derived(
          creatorName,
          note: "Derived from the Logic adapter classification."
        ),
      majorVersion: field(
        from: parsedVersion?.majorVersion,
        noteWhenMissing: "The current Logic adapter did not isolate a major version string."
      ),
      minorVersion: field(
        from: parsedVersion?.minorVersion,
        noteWhenMissing: "The current Logic adapter did not isolate a minor version string."
      ),
      schemaChangeCount: .unknown(
        note: "The current Logic adapter does not expose a schema change count."
      ),
      revision: .unknown(
        note: "The current Logic adapter does not expose a document revision identifier."
      )
    )
  }

  private func mapLogicAudioReferences(
    from revision: DAWSessionRevision?
  ) -> StudioProjectInterchangeField<[StudioProjectInterchangeAudioReference]> {
    guard let revision else {
      return .unknown(note: "No Logic revision was available for audio reference mapping.")
    }

    let used = revision.inspection.audioReferences.sorted { lhs, rhs in
      lhs.relativePath < rhs.relativePath
    }.map {
      mapLogicAudioReference($0, usage: .used)
    }
    let unused = revision.inspection.unusedAudioReferences.sorted { lhs, rhs in
      lhs.relativePath < rhs.relativePath
    }.map {
      mapLogicAudioReference($0, usage: .unused)
    }

    let references = (used + unused).sorted {
      let lhs = "\($0.relativePath.value ?? ""):\($0.usage.value?.rawValue ?? "")"
      let rhs = "\($1.relativePath.value ?? ""):\($1.usage.value?.rawValue ?? "")"
      return lhs < rhs
    }
    return .derived(
      references,
      note:
        "Read-only Logic metadata preserves file-level audio references, but not clip or device ownership."
    )
  }

  private func mapLogicAudioReference(
    _ reference: DAWAudioReference,
    usage: StudioProjectInterchangeAudioReferenceUsage
  ) -> StudioProjectInterchangeAudioReference {
    let resolvedURL: StudioProjectInterchangeField<URL>
    if reference.availability == .available, let url = reference.resolvedURL {
      resolvedURL = .derived(
        url.standardizedFileURL,
        note: "Derived from successful filesystem resolution during read-only Logic inspection."
      )
    } else {
      resolvedURL = .unknown(
        note: "This reference is not available, so no resolved local URL is claimed."
      )
    }
    return StudioProjectInterchangeAudioReference(
      relativePath: .derived(
        reference.relativePath,
        note: "Derived from read-only Logic package inspection."
      ),
      resolvedURL: resolvedURL,
      availability: .derived(
        reference.availability,
        note: "Derived from filesystem resolution during read-only Logic inspection."
      ),
      usage: .derived(
        usage,
        note: "Usage reflects whether the Logic metadata listed this file as active or unused."
      )
    )
  }

  private func mapLogicPreviewReferences(
    previewImageURL: URL?
  ) -> StudioProjectInterchangeField<[StudioProjectInterchangeArtifactReference]> {
    guard let previewImageURL else {
      return .unknown(note: "No Logic preview image was discovered for this project.")
    }

    let document = StudioProjectInterchangeDocumentReference(
      fileURL: previewImageURL.standardizedFileURL
    )
    return .derived(
      [
        StudioProjectInterchangeArtifactReference(
          id: .derived(
            StableID.forValue("logic-preview:\(document.fileURL.absoluteString)"),
            note: "Stable ID derived from the discovered preview URL."
          ),
          kind: .derived(.preview, note: "Derived from the Logic WindowImage role."),
          document: .derived(document, note: "Derived from Logic package discovery."),
          label: .derived(
            document.fileURL.lastPathComponent,
            note: "Derived from the preview filename."
          ),
          mediaType: .derived("image", note: "Derived from the Logic preview artifact role."),
          checksumSHA256: .unknown(note: "Logic discovery does not hash preview artifacts."),
          createdAt: .unknown(note: "Logic discovery does not preserve preview creation time."),
          availability: .derived(
            .available,
            note: "The preview URL was returned by read-only package discovery."
          )
        )
      ],
      note: "Derived from the discovered Logic WindowImage preview artifact."
    )
  }

  private func mapLogicExtensions(
    from revision: DAWSessionRevision?
  ) -> StudioProjectInterchangeField<[StudioProjectInterchangeDAWExtension]> {
    guard let revision else {
      return .unknown(note: "No selected Logic revision was available for bounded extensions.")
    }
    return .derived(
      [
        StudioProjectInterchangeDAWExtension(
          namespace: .logicPro,
          version: .historicalV1,
          fields: [
            StudioProjectInterchangeDAWExtensionEntry(
              key: .inspectionProvenance,
              field: .derived(
                revision.inspection.provenance.rawValue,
                note: "Derived from the read-only Logic inspection record."
              )
            ),
            StudioProjectInterchangeDAWExtensionEntry(
              key: .selectedRevisionID,
              field: .derived(
                revision.id,
                note: "Selected revision ID derived from the validated session member."
              )
            ),
          ]
        )
      ],
      note: "Bounded, allowlisted Logic extension metadata."
    )
  }

  private func logicTrackSummaryNote(from totalTrackCount: Int?) -> String {
    guard let totalTrackCount else {
      return "The current Logic adapter does not expose typed track-family counts."
    }
    return
      "The current Logic adapter reports \(totalTrackCount) total tracks but does not expose audio, MIDI, group, or return-family counts."
  }

  private func parseLogicVersion(
    _ creatorVersion: String
  ) -> (creator: String, majorVersion: String, minorVersion: String)? {
    let pattern = #"^(.*?)(\d+(?:\.\d+)*)$"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
    let range = NSRange(creatorVersion.startIndex..<creatorVersion.endIndex, in: creatorVersion)
    guard let match = regex.firstMatch(in: creatorVersion, range: range) else { return nil }
    guard
      let creatorRange = Range(match.range(at: 1), in: creatorVersion),
      let versionRange = Range(match.range(at: 2), in: creatorVersion)
    else {
      return nil
    }

    let creator = creatorVersion[creatorRange].trimmingCharacters(in: .whitespacesAndNewlines)
    let version = String(creatorVersion[versionRange])
    let major = version.split(separator: ".").first.map(String.init) ?? version
    guard !creator.isEmpty else { return nil }
    return (creator: creator, majorVersion: major, minorVersion: version)
  }

  private func field<Value: Codable & Equatable & Sendable>(
    from value: Value?,
    noteWhenMissing: String
  ) -> StudioProjectInterchangeField<Value> {
    guard let value else {
      return .unknown(note: noteWhenMissing)
    }
    return .derived(
      value,
      note: "Derived from read-only Logic package inspection; not parsed from DAW project events."
    )
  }
}

extension DiscoveredDAWSession {
  public func projectInterchange(
    selectedRevision: DAWSessionRevision? = nil
  ) throws -> StudioProjectInterchange {
    try StudioProjectInterchangeLogicAdapter().map(
      session: self,
      selectedRevision: selectedRevision
    )
  }
}

extension SetTrackKind {
  fileprivate var interchangeKind: StudioProjectInterchangeTrackKind {
    switch self {
    case .audio: .audio
    case .midi: .midi
    case .group: .group
    case .returnTrack: .returnTrack
    case .main: .main
    }
  }
}

extension SetDeviceKind {
  fileprivate var interchangeKind: StudioProjectInterchangeDeviceKind {
    switch self {
    case .native: .native
    case .audioUnit: .audioUnit
    case .vst2: .vst2
    case .vst3: .vst3
    case .maxForLive: .maxForLive
    case .rack: .rack
    case .placeholder: .placeholder
    case .unknown: .unknown
    }
  }
}

extension SetClipKind {
  fileprivate var interchangeKind: StudioProjectInterchangeClipKind {
    switch self {
    case .audio: .audio
    case .midi: .midi
    }
  }
}

extension SetClipPlacement {
  fileprivate var interchangePlacement: StudioProjectInterchangeClipPlacement {
    switch self {
    case .arrangement: .arrangement
    case .session: .session
    case .takeLane: .takeLane
    case .unknown: .unknown
    }
  }
}
