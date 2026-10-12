import CryptoKit
import Foundation

public enum SetMapProvenance: String, Codable, Sendable {
  case reconstructed
}

public enum SetMapCompleteness: String, Codable, Sendable {
  case completeArrangement
  case structureOnly
  case unavailable
}

public enum SetMapMediaAvailability: String, Codable, Sendable {
  case notApplicable
  case available
  case missing
  case disconnected
  case unresolved
}

public struct SetMapLocator: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let name: String
  public let beatTime: Double

  public init(id: String, name: String, beatTime: Double) {
    self.id = id
    self.name = name
    self.beatTime = beatTime
  }
}

public struct SetMapClip: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let name: String
  public let kind: SetClipKind
  public let startBeat: Double
  public let endBeat: Double
  public let isLooped: Bool
  public let isWarped: Bool
  public let mediaAvailability: SetMapMediaAvailability

  public init(
    id: String,
    name: String,
    kind: SetClipKind,
    startBeat: Double,
    endBeat: Double,
    isLooped: Bool,
    isWarped: Bool,
    mediaAvailability: SetMapMediaAvailability
  ) {
    self.id = id
    self.name = name
    self.kind = kind
    self.startBeat = startBeat
    self.endBeat = endBeat
    self.isLooped = isLooped
    self.isWarped = isWarped
    self.mediaAvailability = mediaAvailability
  }
}

public struct SetMapLane: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let name: String
  public let kind: SetTrackKind
  public let colorIndex: Int?
  public let groupDepth: Int
  public let deviceCount: Int
  public let clips: [SetMapClip]

  public init(
    id: String,
    name: String,
    kind: SetTrackKind,
    colorIndex: Int?,
    groupDepth: Int,
    deviceCount: Int,
    clips: [SetMapClip]
  ) {
    self.id = id
    self.name = name
    self.kind = kind
    self.colorIndex = colorIndex
    self.groupDepth = groupDepth
    self.deviceCount = deviceCount
    self.clips = clips
  }
}

public struct SetMapSnapshot: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let setID: String
  public let setName: String
  public let provenance: SetMapProvenance
  public let completeness: SetMapCompleteness
  public let sourceDigest: String
  public let sourceModifiedAt: Date?
  public let generatedAt: Date
  public let tempo: Double?
  public let timeSignature: SetTimeSignature?
  public let startBeat: Double
  public let endBeat: Double
  public let lanes: [SetMapLane]
  public let locators: [SetMapLocator]
  public let sessionClipCount: Int
  public let takeLaneClipCount: Int
  public let missingMediaClipCount: Int

  public init(
    id: String,
    setID: String,
    setName: String,
    provenance: SetMapProvenance,
    completeness: SetMapCompleteness,
    sourceDigest: String,
    sourceModifiedAt: Date?,
    generatedAt: Date,
    tempo: Double?,
    timeSignature: SetTimeSignature?,
    startBeat: Double,
    endBeat: Double,
    lanes: [SetMapLane],
    locators: [SetMapLocator],
    sessionClipCount: Int,
    takeLaneClipCount: Int,
    missingMediaClipCount: Int
  ) {
    self.id = id
    self.setID = setID
    self.setName = setName
    self.provenance = provenance
    self.completeness = completeness
    self.sourceDigest = sourceDigest
    self.sourceModifiedAt = sourceModifiedAt
    self.generatedAt = generatedAt
    self.tempo = tempo
    self.timeSignature = timeSignature
    self.startBeat = startBeat
    self.endBeat = endBeat
    self.lanes = lanes
    self.locators = locators
    self.sessionClipCount = sessionClipCount
    self.takeLaneClipCount = takeLaneClipCount
    self.missingMediaClipCount = missingMediaClipCount
  }

  public var arrangementClipCount: Int {
    lanes.reduce(0) { $0 + $1.clips.count }
  }
}

/// Converts parsed Set evidence into a presentation-independent, immutable overview.
/// It never opens Live, reads plug-in code, or modifies the source Set.
public struct SetMapBuilder: Sendable {
  public init() {}

  public func build(set: AbletonSet, generatedAt: Date = Date()) -> SetMapSnapshot {
    let tracksByXMLID = Dictionary(
      uniqueKeysWithValues: set.content.tracks.compactMap { track in
        track.xmlID.map { ($0, track) }
      }
    )
    let dependenciesByOwnerID = Dictionary(
      grouping: set.content.dependencies.filter { $0.kind == .clipAudio },
      by: \MediaDependency.ownerID
    )

    let lanes = set.content.tracks.map { track in
      let clips = track.clips.compactMap { clip -> SetMapClip? in
        guard clip.placement == .arrangement,
          let startBeat = clip.startBeat,
          let endBeat = clip.endBeat,
          startBeat.isFinite,
          endBeat.isFinite,
          endBeat > startBeat
        else { return nil }

        return SetMapClip(
          id: clip.id,
          name: clip.name,
          kind: clip.kind,
          startBeat: startBeat,
          endBeat: endBeat,
          isLooped: clip.loopEnabled == true,
          isWarped: clip.isWarped == true,
          mediaAvailability: mediaAvailability(
            for: clip,
            dependencies: dependenciesByOwnerID[clip.id, default: []]
          )
        )
      }.sorted { lhs, rhs in
        if lhs.startBeat != rhs.startBeat { return lhs.startBeat < rhs.startBeat }
        if lhs.endBeat != rhs.endBeat { return lhs.endBeat < rhs.endBeat }
        return lhs.id < rhs.id
      }

      return SetMapLane(
        id: track.id,
        name: track.name,
        kind: track.kind,
        colorIndex: track.colorIndex,
        groupDepth: groupDepth(for: track, tracksByXMLID: tracksByXMLID),
        deviceCount: recursiveDeviceCount(track.devices),
        clips: clips
      )
    }

    let locators = set.content.locators
      .filter { $0.beatTime.isFinite }
      .sorted { lhs, rhs in
        if lhs.beatTime != rhs.beatTime { return lhs.beatTime < rhs.beatTime }
        return lhs.id < rhs.id
      }
      .map { SetMapLocator(id: $0.id, name: $0.name, beatTime: $0.beatTime) }
    let allClips = lanes.flatMap(\.clips)
    let minimumBeat = min(
      0,
      allClips.map(\.startBeat).min() ?? 0,
      locators.map(\.beatTime).min() ?? 0
    )
    let evidenceEndBeat = max(
      allClips.map(\.endBeat).max() ?? minimumBeat,
      locators.map(\.beatTime).max() ?? minimumBeat
    )
    let endBeat = max(evidenceEndBeat, minimumBeat + 16)
    let digest = sourceDigest(for: set)
    let completeness: SetMapCompleteness =
      !allClips.isEmpty ? .completeArrangement : (lanes.isEmpty ? .unavailable : .structureOnly)
    let sessionClipCount = set.content.tracks.reduce(0) { total, track in
      total + track.clips.count(where: { $0.placement == .session })
    }
    let takeLaneClipCount = set.content.tracks.reduce(0) { total, track in
      total + track.clips.count(where: { $0.placement == .takeLane })
    }
    let missingMediaClipCount = allClips.count(where: {
      $0.mediaAvailability == .missing || $0.mediaAvailability == .disconnected
    })

    return SetMapSnapshot(
      id: StableID.forValue("set-map:\(set.id):\(digest)"),
      setID: set.id,
      setName: set.displayName,
      provenance: .reconstructed,
      completeness: completeness,
      sourceDigest: digest,
      sourceModifiedAt: set.modifiedAt,
      generatedAt: generatedAt,
      tempo: set.content.tempo,
      timeSignature: set.content.timeSignature,
      startBeat: minimumBeat,
      endBeat: endBeat,
      lanes: lanes,
      locators: locators,
      sessionClipCount: sessionClipCount,
      takeLaneClipCount: takeLaneClipCount,
      missingMediaClipCount: missingMediaClipCount
    )
  }

  private func mediaAvailability(
    for clip: SetClip,
    dependencies: [MediaDependency]
  ) -> SetMapMediaAvailability {
    guard clip.kind == .audio else { return .notApplicable }
    guard clip.sampleReference != nil else { return .unresolved }
    let statuses = Set(dependencies.map(\.availability))
    if statuses.contains(.available) { return .available }
    if statuses.contains(.disconnected) { return .disconnected }
    if statuses.contains(.missing) { return .missing }
    return .unresolved
  }

  private func groupDepth(
    for track: SetTrack,
    tracksByXMLID: [String: SetTrack]
  ) -> Int {
    var depth = 0
    var parentID = track.groupTrackXMLID
    var visited: Set<String> = []
    while let currentID = parentID,
      visited.insert(currentID).inserted,
      let parent = tracksByXMLID[currentID]
    {
      depth += 1
      parentID = parent.groupTrackXMLID
    }
    return depth
  }

  private func recursiveDeviceCount(_ devices: [SetDevice]) -> Int {
    devices.reduce(0) { total, device in
      total + 1 + recursiveDeviceCount(device.nestedDevices)
    }
  }

  private func sourceDigest(for set: AbletonSet) -> String {
    let payload = SetMapDigestPayload(
      setID: set.id,
      modifiedAt: set.modifiedAt,
      compressedBytes: set.compressedBytes,
      xmlBytes: set.xmlBytes,
      content: set.content
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let data = (try? encoder.encode(payload)) ?? Data(set.id.utf8)
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

private struct SetMapDigestPayload: Encodable {
  let setID: String
  let modifiedAt: Date?
  let compressedBytes: Int64
  let xmlBytes: Int
  let content: AbletonSetContent
}
