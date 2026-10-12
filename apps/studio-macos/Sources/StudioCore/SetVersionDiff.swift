import Foundation

public enum VersionChangeKind: String, Codable, Sendable {
  case added
  case removed
  case modified
}

public struct SetVersionDiff: Codable, Sendable, Equatable {
  public let olderSetID: String
  public let newerSetID: String
  public let tempoChange: ValueChange<Double>?
  public let trackChanges: [TrackChange]
  public let locatorChanges: [LocatorChange]
  public let dependencyChanges: [DependencyChange]

  public init(
    olderSetID: String,
    newerSetID: String,
    tempoChange: ValueChange<Double>?,
    trackChanges: [TrackChange],
    locatorChanges: [LocatorChange],
    dependencyChanges: [DependencyChange]
  ) {
    self.olderSetID = olderSetID
    self.newerSetID = newerSetID
    self.tempoChange = tempoChange
    self.trackChanges = trackChanges
    self.locatorChanges = locatorChanges
    self.dependencyChanges = dependencyChanges
  }

  public var hasChanges: Bool {
    tempoChange != nil || !trackChanges.isEmpty || !locatorChanges.isEmpty
      || !dependencyChanges.isEmpty
  }
}

public struct ValueChange<Value: Codable & Sendable & Equatable>: Codable, Sendable, Equatable {
  public let before: Value?
  public let after: Value?

  public init(before: Value?, after: Value?) {
    self.before = before
    self.after = after
  }
}

public struct TrackChange: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: VersionChangeKind
  public let trackID: String
  public let trackKind: SetTrackKind
  public let beforeName: String?
  public let afterName: String?
  public let mixerChanged: Bool
  public let deviceChanges: [DeviceChange]
  public let clipChanges: [ClipChange]

  public init(
    id: String,
    kind: VersionChangeKind,
    trackID: String,
    trackKind: SetTrackKind,
    beforeName: String?,
    afterName: String?,
    mixerChanged: Bool,
    deviceChanges: [DeviceChange],
    clipChanges: [ClipChange]
  ) {
    self.id = id
    self.kind = kind
    self.trackID = trackID
    self.trackKind = trackKind
    self.beforeName = beforeName
    self.afterName = afterName
    self.mixerChanged = mixerChanged
    self.deviceChanges = deviceChanges
    self.clipChanges = clipChanges
  }
}

public struct DeviceChange: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: VersionChangeKind
  public let deviceID: String
  public let beforeName: String?
  public let afterName: String?
  public let stateChanged: Bool
  public let enabledChanged: Bool

  public init(
    id: String,
    kind: VersionChangeKind,
    deviceID: String,
    beforeName: String?,
    afterName: String?,
    stateChanged: Bool,
    enabledChanged: Bool
  ) {
    self.id = id
    self.kind = kind
    self.deviceID = deviceID
    self.beforeName = beforeName
    self.afterName = afterName
    self.stateChanged = stateChanged
    self.enabledChanged = enabledChanged
  }
}

public struct ClipChange: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: VersionChangeKind
  public let clipID: String
  public let beforeName: String?
  public let afterName: String?
  public let timingChanged: Bool
  public let contentChanged: Bool

  public init(
    id: String,
    kind: VersionChangeKind,
    clipID: String,
    beforeName: String?,
    afterName: String?,
    timingChanged: Bool,
    contentChanged: Bool
  ) {
    self.id = id
    self.kind = kind
    self.clipID = clipID
    self.beforeName = beforeName
    self.afterName = afterName
    self.timingChanged = timingChanged
    self.contentChanged = contentChanged
  }
}

public struct LocatorChange: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: VersionChangeKind
  public let before: SetLocator?
  public let after: SetLocator?

  public init(id: String, kind: VersionChangeKind, before: SetLocator?, after: SetLocator?) {
    self.id = id
    self.kind = kind
    self.before = before
    self.after = after
  }
}

public struct DependencyChange: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: VersionChangeKind
  public let before: MediaDependency?
  public let after: MediaDependency?

  public init(
    id: String,
    kind: VersionChangeKind,
    before: MediaDependency?,
    after: MediaDependency?
  ) {
    self.id = id
    self.kind = kind
    self.before = before
    self.after = after
  }
}

public struct SetVersionDiffer: Sendable {
  public init() {}

  public func diff(older: AbletonSet, newer: AbletonSet) -> SetVersionDiff {
    SetVersionDiff(
      olderSetID: older.id,
      newerSetID: newer.id,
      tempoChange: valueChange(before: older.content.tempo, after: newer.content.tempo),
      trackChanges: diffTracks(older.content.tracks, newer.content.tracks),
      locatorChanges: diffLocators(older.content.locators, newer.content.locators),
      dependencyChanges: diffDependencies(
        older.content.dependencies,
        newer.content.dependencies
      )
    )
  }

  private func diffTracks(_ older: [SetTrack], _ newer: [SetTrack]) -> [TrackChange] {
    let pairs = match(older, newer, key: trackKey)
    return pairs.compactMap { pair in
      switch pair {
      case .removed(let track):
        return trackChange(kind: .removed, before: track, after: nil)
      case .added(let track):
        return trackChange(kind: .added, before: nil, after: track)
      case .matched(let before, let after):
        let devices = diffDevices(
          before.devices.flatMap(\.flattened), after.devices.flatMap(\.flattened))
        let clips = diffClips(before.clips, after.clips)
        guard
          before.name != after.name || before.mixer != after.mixer || !devices.isEmpty
            || !clips.isEmpty
        else { return nil }
        return trackChange(
          kind: .modified,
          before: before,
          after: after,
          deviceChanges: devices,
          clipChanges: clips
        )
      }
    }
  }

  private func trackChange(
    kind: VersionChangeKind,
    before: SetTrack?,
    after: SetTrack?,
    deviceChanges: [DeviceChange] = [],
    clipChanges: [ClipChange] = []
  ) -> TrackChange {
    let track = after ?? before!
    return TrackChange(
      id: StableID.forValue("track-change:\(kind.rawValue):\(track.id)"),
      kind: kind,
      trackID: track.id,
      trackKind: track.kind,
      beforeName: before?.name,
      afterName: after?.name,
      mixerChanged: before?.mixer != after?.mixer,
      deviceChanges: deviceChanges,
      clipChanges: clipChanges
    )
  }

  private func diffDevices(_ older: [SetDevice], _ newer: [SetDevice]) -> [DeviceChange] {
    match(older, newer, key: deviceKey).compactMap { pair in
      switch pair {
      case .removed(let device):
        return deviceChange(kind: .removed, before: device, after: nil)
      case .added(let device):
        return deviceChange(kind: .added, before: nil, after: device)
      case .matched(let before, let after):
        guard
          before.displayName != after.displayName || before.stateDigest != after.stateDigest
            || before.isEnabled != after.isEnabled
        else { return nil }
        return deviceChange(kind: .modified, before: before, after: after)
      }
    }
  }

  private func deviceChange(
    kind: VersionChangeKind,
    before: SetDevice?,
    after: SetDevice?
  ) -> DeviceChange {
    let device = after ?? before!
    return DeviceChange(
      id: StableID.forValue("device-change:\(kind.rawValue):\(device.id)"),
      kind: kind,
      deviceID: device.id,
      beforeName: before?.displayName,
      afterName: after?.displayName,
      stateChanged: before?.stateDigest != after?.stateDigest,
      enabledChanged: before?.isEnabled != after?.isEnabled
    )
  }

  private func diffClips(_ older: [SetClip], _ newer: [SetClip]) -> [ClipChange] {
    match(older, newer, key: clipKey).compactMap { pair in
      switch pair {
      case .removed(let clip):
        return clipChange(kind: .removed, before: clip, after: nil)
      case .added(let clip):
        return clipChange(kind: .added, before: nil, after: clip)
      case .matched(let before, let after):
        let timingChanged =
          before.startBeat != after.startBeat || before.endBeat != after.endBeat
          || before.loopStartBeat != after.loopStartBeat || before.loopEndBeat != after.loopEndBeat
        let contentChanged =
          before.name != after.name
          || before.sampleReference != after.sampleReference
          || before.midiNoteCount != after.midiNoteCount
          || before.warpMarkerCount != after.warpMarkerCount
          || before.warpMode != after.warpMode
        guard timingChanged || contentChanged else { return nil }
        return clipChange(kind: .modified, before: before, after: after)
      }
    }
  }

  private func clipChange(
    kind: VersionChangeKind,
    before: SetClip?,
    after: SetClip?
  ) -> ClipChange {
    let clip = after ?? before!
    return ClipChange(
      id: StableID.forValue("clip-change:\(kind.rawValue):\(clip.id)"),
      kind: kind,
      clipID: clip.id,
      beforeName: before?.name,
      afterName: after?.name,
      timingChanged: before?.startBeat != after?.startBeat || before?.endBeat != after?.endBeat,
      contentChanged: before?.sampleReference != after?.sampleReference
        || before?.midiNoteCount != after?.midiNoteCount
        || before?.warpMarkerCount != after?.warpMarkerCount
    )
  }

  private func diffLocators(_ older: [SetLocator], _ newer: [SetLocator]) -> [LocatorChange] {
    match(older, newer, key: locatorKey).compactMap { pair in
      switch pair {
      case .removed(let locator):
        return LocatorChange(
          id: StableID.forValue("locator-removed:\(locator.id)"),
          kind: .removed,
          before: locator,
          after: nil
        )
      case .added(let locator):
        return LocatorChange(
          id: StableID.forValue("locator-added:\(locator.id)"),
          kind: .added,
          before: nil,
          after: locator
        )
      case .matched(let before, let after):
        guard before != after else { return nil }
        return LocatorChange(
          id: StableID.forValue("locator-modified:\(after.id)"),
          kind: .modified,
          before: before,
          after: after
        )
      }
    }
  }

  private func diffDependencies(
    _ older: [MediaDependency],
    _ newer: [MediaDependency]
  ) -> [DependencyChange] {
    match(older, newer, key: dependencyKey).compactMap { pair in
      switch pair {
      case .removed(let dependency):
        return DependencyChange(
          id: StableID.forValue("dependency-removed:\(dependency.id)"),
          kind: .removed,
          before: dependency,
          after: nil
        )
      case .added(let dependency):
        return DependencyChange(
          id: StableID.forValue("dependency-added:\(dependency.id)"),
          kind: .added,
          before: nil,
          after: dependency
        )
      case .matched(let before, let after):
        guard before != after else { return nil }
        return DependencyChange(
          id: StableID.forValue("dependency-modified:\(after.id)"),
          kind: .modified,
          before: before,
          after: after
        )
      }
    }
  }

  private func valueChange<Value: Equatable>(before: Value?, after: Value?) -> ValueChange<Value>? {
    before == after ? nil : ValueChange(before: before, after: after)
  }

  private func trackKey(_ track: SetTrack) -> String {
    track.xmlID.map { "id:\($0)" }
      ?? "fallback:\(track.kind.rawValue):\(track.name.lowercased())"
  }

  private func deviceKey(_ device: SetDevice) -> String {
    device.xmlID.map { "id:\($0)" }
      ?? "fallback:\(device.kind.rawValue):\(device.displayName.lowercased())"
  }

  private func clipKey(_ clip: SetClip) -> String {
    clip.xmlID.map { "id:\($0)" }
      ?? "fallback:\(clip.kind.rawValue):\(clip.name.lowercased()):\(clip.startBeat ?? 0)"
  }

  private func locatorKey(_ locator: SetLocator) -> String {
    "\(locator.name.lowercased()):\(locator.beatTime)"
  }

  private func dependencyKey(_ dependency: MediaDependency) -> String {
    "\(dependency.kind.rawValue):\(dependency.reference.absolutePath ?? ""):\(dependency.reference.relativePath ?? "")"
  }

  private func match<Value>(
    _ older: [Value],
    _ newer: [Value],
    key: (Value) -> String
  ) -> [Match<Value>] {
    var olderByKey = Dictionary(grouping: older, by: key).mapValues { $0[0] }
    var results: [Match<Value>] = []
    for value in newer {
      let valueKey = key(value)
      if let previous = olderByKey.removeValue(forKey: valueKey) {
        results.append(.matched(previous, value))
      } else {
        results.append(.added(value))
      }
    }
    results.append(contentsOf: olderByKey.values.map(Match.removed))
    return results
  }
}

private enum Match<Value> {
  case added(Value)
  case removed(Value)
  case matched(Value, Value)
}

extension SetDevice {
  fileprivate var flattened: [SetDevice] {
    [self] + nestedDevices.flatMap(\.flattened)
  }
}
