import Foundation

public enum ChainRecoveryCapability: String, Codable, Sendable {
  case inspectOnly
  case existingRackCandidate
}

public struct ChainOccurrence: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let signature: String
  public let projectID: String
  public let projectName: String
  public let timelineID: String
  public let setID: String
  public let setName: String
  public let trackID: String
  public let trackName: String
  public let trackKind: SetTrackKind
  public let modifiedAt: Date?
  public let devices: [SetDevice]
  public let compatibility: PluginCompatibilityReport?
  public let recoveryCapability: ChainRecoveryCapability

  public init(
    id: String,
    signature: String,
    projectID: String,
    projectName: String,
    timelineID: String,
    setID: String,
    setName: String,
    trackID: String,
    trackName: String,
    trackKind: SetTrackKind,
    modifiedAt: Date?,
    devices: [SetDevice],
    compatibility: PluginCompatibilityReport?,
    recoveryCapability: ChainRecoveryCapability
  ) {
    self.id = id
    self.signature = signature
    self.projectID = projectID
    self.projectName = projectName
    self.timelineID = timelineID
    self.setID = setID
    self.setName = setName
    self.trackID = trackID
    self.trackName = trackName
    self.trackKind = trackKind
    self.modifiedAt = modifiedAt
    self.devices = devices
    self.compatibility = compatibility
    self.recoveryCapability = recoveryCapability
  }
}

public struct ChainFamily: Codable, Identifiable, Sendable, Equatable {
  public var id: String { signature }
  public let signature: String
  public let displayName: String
  public let occurrences: [ChainOccurrence]
  public let stateVariationCount: Int
  public let projectCount: Int

  public init(
    signature: String,
    displayName: String,
    occurrences: [ChainOccurrence],
    stateVariationCount: Int,
    projectCount: Int
  ) {
    self.signature = signature
    self.displayName = displayName
    self.occurrences = occurrences
    self.stateVariationCount = stateVariationCount
    self.projectCount = projectCount
  }
}

public struct PluginUsageStatistic: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let plugin: PluginIdentity
  public let occurrenceCount: Int
  public let projectCount: Int
  public let trackNames: [String]

  public init(
    id: String,
    plugin: PluginIdentity,
    occurrenceCount: Int,
    projectCount: Int,
    trackNames: [String]
  ) {
    self.id = id
    self.plugin = plugin
    self.occurrenceCount = occurrenceCount
    self.projectCount = projectCount
    self.trackNames = trackNames
  }
}

public struct PersonalChainLibrary: Codable, Sendable, Equatable {
  public let families: [ChainFamily]
  public let occurrences: [ChainOccurrence]
  public let pluginUsage: [PluginUsageStatistic]

  public init(
    families: [ChainFamily],
    occurrences: [ChainOccurrence],
    pluginUsage: [PluginUsageStatistic]
  ) {
    self.families = families
    self.occurrences = occurrences
    self.pluginUsage = pluginUsage
  }

  public func search(_ query: String) -> [ChainOccurrence] {
    let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return occurrences }
    return occurrences.filter { occurrence in
      occurrence.projectName.localizedCaseInsensitiveContains(query)
        || occurrence.setName.localizedCaseInsensitiveContains(query)
        || occurrence.trackName.localizedCaseInsensitiveContains(query)
        || occurrence.devices.contains(where: { device in
          device.displayName.localizedCaseInsensitiveContains(query)
            || device.plugin?.name?.localizedCaseInsensitiveContains(query) == true
            || device.plugin?.manufacturer?.localizedCaseInsensitiveContains(query) == true
        })
    }
  }
}

public struct ChainIntelligenceBuilder: Sendable {
  public init() {}

  public func build(
    index: StudioLibraryIndex,
    inventory: PluginInventory? = nil
  ) -> PersonalChainLibrary {
    var occurrences: [ChainOccurrence] = []
    for project in index.projects {
      for timeline in project.timelines {
        for set in timeline.versions {
          let compatibility = inventory.map {
            PluginCompatibilityEvaluator().evaluate(set: set, inventory: $0)
          }
          for track in set.content.tracks where !track.devices.isEmpty {
            let signature = chainSignature(track.devices)
            let deviceIDs = Set(track.devices.flatMap(\.flattened).map(\.id))
            let trackCompatibility = compatibility.map { report in
              PluginCompatibilityReport(
                evidence: report.evidence.filter { deviceIDs.contains($0.deviceID) }
              )
            }
            let occurrence = ChainOccurrence(
              id: StableID.forValue("chain:\(project.id):\(set.id):\(track.id)"),
              signature: signature,
              projectID: project.id,
              projectName: project.displayName,
              timelineID: timeline.id,
              setID: set.id,
              setName: set.displayName,
              trackID: track.id,
              trackName: track.name,
              trackKind: track.kind,
              modifiedAt: set.modifiedAt,
              devices: track.devices,
              compatibility: trackCompatibility,
              recoveryCapability: track.devices.contains(where: { $0.kind == .rack })
                ? .existingRackCandidate
                : .inspectOnly
            )
            occurrences.append(occurrence)
          }
        }
      }
    }
    occurrences.sort {
      switch ($0.modifiedAt, $1.modifiedAt) {
      case (let left?, let right?): left > right
      case (_?, nil): true
      case (nil, _?): false
      case (nil, nil): $0.trackName.localizedStandardCompare($1.trackName) == .orderedAscending
      }
    }
    return PersonalChainLibrary(
      families: buildFamilies(occurrences),
      occurrences: occurrences,
      pluginUsage: buildPluginUsage(occurrences)
    )
  }

  private func buildFamilies(_ occurrences: [ChainOccurrence]) -> [ChainFamily] {
    Dictionary(grouping: occurrences, by: \.signature)
      .map { signature, familyOccurrences in
        let stateSignatures = Set(
          familyOccurrences.map { occurrence in
            occurrence.devices.map(\.recursiveStateSignature).joined(separator: ":")
          }
        )
        let projects = Set(familyOccurrences.map(\.projectID))
        let first = familyOccurrences[0]
        return ChainFamily(
          signature: signature,
          displayName: chainDisplayName(first.devices),
          occurrences: familyOccurrences,
          stateVariationCount: stateSignatures.count,
          projectCount: projects.count
        )
      }
      .sorted {
        if $0.occurrences.count != $1.occurrences.count {
          return $0.occurrences.count > $1.occurrences.count
        }
        return $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending
      }
  }

  private func buildPluginUsage(_ occurrences: [ChainOccurrence]) -> [PluginUsageStatistic] {
    struct Usage {
      var plugin: PluginIdentity
      var count = 0
      var projects: Set<String> = []
      var trackNames: Set<String> = []
    }
    var usage: [String: Usage] = [:]
    for occurrence in occurrences {
      for device in occurrence.devices.flatMap(\.flattened) {
        guard let plugin = device.plugin else { continue }
        let key = pluginKey(plugin)
        var entry = usage[key] ?? Usage(plugin: plugin)
        entry.count += 1
        entry.projects.insert(occurrence.projectID)
        entry.trackNames.insert(occurrence.trackName)
        usage[key] = entry
      }
    }
    return usage.map { key, entry in
      PluginUsageStatistic(
        id: StableID.forValue("plugin-usage:\(key)"),
        plugin: entry.plugin,
        occurrenceCount: entry.count,
        projectCount: entry.projects.count,
        trackNames: entry.trackNames.sorted()
      )
    }
    .sorted { $0.occurrenceCount > $1.occurrenceCount }
  }

  private func chainSignature(_ devices: [SetDevice]) -> String {
    StableID.forValue("chain-signature:\(devices.map(deviceIdentity).joined(separator: "|"))")
  }

  private func deviceIdentity(_ device: SetDevice) -> String {
    let base =
      device.plugin.map(pluginKey)
      ?? "\(device.kind.rawValue):\(normalize(device.typeName))"
    guard !device.nestedDevices.isEmpty else { return base }
    return "\(base)[\(device.nestedDevices.map(deviceIdentity).joined(separator: ","))]"
  }

  private func chainDisplayName(_ devices: [SetDevice]) -> String {
    devices.map { $0.plugin?.name ?? $0.displayName }.joined(separator: " → ")
  }

  private func pluginKey(_ plugin: PluginIdentity) -> String {
    "\(plugin.format.rawValue):\(normalize(plugin.manufacturer ?? "")):\(normalize(plugin.name ?? plugin.identifier ?? "unknown"))"
  }

  private func normalize(_ value: String) -> String {
    value.lowercased().filter { $0.isLetter || $0.isNumber }
  }
}

extension SetDevice {
  fileprivate var flattened: [SetDevice] { [self] + nestedDevices.flatMap(\.flattened) }

  fileprivate var recursiveStateSignature: String {
    "\(stateDigest)[\(nestedDevices.map(\.recursiveStateSignature).joined(separator: ","))]"
  }
}
