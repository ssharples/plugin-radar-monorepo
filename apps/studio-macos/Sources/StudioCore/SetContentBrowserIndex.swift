import Foundation

/// A read-only, presentation-ready index of the content inside one Ableton Set.
public struct SetContentBrowserIndex: Sendable {
  public let tracks: [SetContentBrowserTrack]
  public let projectAudio: [PreviewAsset]

  public init(content: AbletonSetContent, projectAudio: [PreviewAsset] = []) {
    let dependencyByOwner = Dictionary(grouping: content.dependencies, by: \.ownerID)
    let trackByID = Dictionary(
      content.tracks.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    let trackByXMLID = Dictionary(
      content.tracks.compactMap { track in track.xmlID.map { ($0, track.id) } },
      uniquingKeysWith: { first, _ in first })
    let uniqueProjectAudio = Self.deduplicatedProjectAudio(projectAudio)
    let assetByURL = Dictionary(
      uniqueProjectAudio.map { ($0.fileURL.standardizedFileURL.absoluteString, $0) },
      uniquingKeysWith: { first, _ in first })
    var depthMemo: [String: Int] = [:]

    func depth(for track: SetTrack, path: Set<String> = []) -> Int {
      if let cached = depthMemo[track.id] { return cached }
      guard !path.contains(track.id),
        let parentXMLID = track.groupTrackXMLID,
        let parentID = trackByXMLID[parentXMLID], parentID != track.id,
        let parent = trackByID[parentID]
      else {
        depthMemo[track.id] = 0
        return 0
      }
      let result = min(
        depth(for: parent, path: path.union([track.id])) + 1,
        content.tracks.count
      )
      depthMemo[track.id] = result
      return result
    }

    tracks = content.tracks.map { track in
      SetContentBrowserTrack(
        track: track,
        depth: depth(for: track),
        audio: Self.audioItems(
          for: track, dependenciesByOwner: dependencyByOwner, assetByURL: assetByURL),
        deviceResources: Self.deviceResources(
          for: track.devices, dependenciesByOwner: dependencyByOwner)
      )
    }
    self.projectAudio = uniqueProjectAudio
  }

  private static func audioItems(
    for track: SetTrack,
    dependenciesByOwner: [String: [MediaDependency]],
    assetByURL: [String: PreviewAsset]
  ) -> [SetContentAudioItem] {
    var itemsByKey: [String: (dependency: MediaDependency, clips: [SetClip])] = [:]
    var orderedKeys: [String] = []
    for clip in track.clips where clip.kind == .audio {
      for dependency in dependenciesByOwner[clip.id, default: []]
      where dependency.kind == .clipAudio {
        let key = Self.audioKey(dependency)
        if itemsByKey[key] == nil {
          itemsByKey[key] = (dependency, [])
          orderedKeys.append(key)
        }
        if !itemsByKey[key]!.clips.contains(where: { $0.id == clip.id }) {
          itemsByKey[key]!.clips.append(clip)
        }
      }
    }
    return orderedKeys.compactMap { key in
      guard let item = itemsByKey[key] else { return nil }
      return SetContentAudioItem(
        dependency: item.dependency,
        clips: item.clips,
        indexedAsset: Self.asset(for: item.dependency, in: assetByURL)
      )
    }
  }

  private static func deviceResources(
    for devices: [SetDevice],
    dependenciesByOwner: [String: [MediaDependency]]
  ) -> [MediaDependency] {
    var result: [MediaDependency] = []
    func append(_ device: SetDevice) {
      result += dependenciesByOwner[device.id, default: []].filter {
        $0.kind == .deviceResource
      }
      device.nestedDevices.forEach(append)
    }
    devices.forEach(append)
    return result
  }

  private static func audioKey(_ dependency: MediaDependency) -> String {
    if let url = dependency.resolvedURL {
      return "url:\(url.standardizedFileURL.absoluteString)"
    }
    let reference =
      dependency.reference.absolutePath
      ?? dependency.reference.relativePath
      ?? "unknown"
    return "unresolved:\(dependency.ownerID):\(dependency.id):\(reference)"
  }

  private static func asset(
    for dependency: MediaDependency,
    in assets: [String: PreviewAsset]
  ) -> PreviewAsset? {
    guard let url = dependency.resolvedURL?.standardizedFileURL else { return nil }
    return assets[url.absoluteString]
  }

  private static func deduplicatedProjectAudio(_ assets: [PreviewAsset]) -> [PreviewAsset] {
    var seen = Set<String>()
    return assets.filter {
      seen.insert($0.fileURL.standardizedFileURL.absoluteString).inserted
    }
  }
}

public struct SetContentBrowserTrack: Identifiable, Sendable {
  public let track: SetTrack
  public let depth: Int
  public let audio: [SetContentAudioItem]
  public let deviceResources: [MediaDependency]

  public var id: String { track.id }
}

public struct SetContentAudioItem: Identifiable, Sendable {
  public let dependency: MediaDependency
  public let clips: [SetClip]
  public let indexedAsset: PreviewAsset?

  public var id: String {
    if let url = dependency.resolvedURL {
      return "audio:\(url.standardizedFileURL.absoluteString)"
    }
    let reference =
      dependency.reference.absolutePath
      ?? dependency.reference.relativePath
      ?? "unknown"
    return "unresolved:\(dependency.ownerID):\(dependency.id):\(reference)"
  }

  public var filename: String {
    if let url = dependency.resolvedURL { return url.lastPathComponent }
    let path = dependency.reference.absolutePath ?? dependency.reference.relativePath
    return path.map { URL(fileURLWithPath: $0).lastPathComponent } ?? "Unresolved audio"
  }

  public var sourceLabel: String {
    switch dependency.availability {
    case .available: "Available"
    case .missing: "Missing"
    case .disconnected: "Drive disconnected"
    case .unresolved: "Unresolved"
    }
  }

  public init(dependency: MediaDependency, clips: [SetClip], indexedAsset: PreviewAsset? = nil) {
    self.dependency = dependency
    self.clips = clips
    self.indexedAsset = indexedAsset
  }
}
