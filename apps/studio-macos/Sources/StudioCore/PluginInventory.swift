import Foundation

public struct InstalledPlugin: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let name: String
  public let manufacturer: String?
  public let format: PluginFormat
  public let version: String?
  public let bundleIdentifier: String?
  public let componentIdentifier: String?
  public let bundleURL: URL

  public init(
    id: String,
    name: String,
    manufacturer: String?,
    format: PluginFormat,
    version: String?,
    bundleIdentifier: String?,
    componentIdentifier: String?,
    bundleURL: URL
  ) {
    self.id = id
    self.name = name
    self.manufacturer = manufacturer
    self.format = format
    self.version = version
    self.bundleIdentifier = bundleIdentifier
    self.componentIdentifier = componentIdentifier
    self.bundleURL = bundleURL
  }
}

public struct PluginInventory: Codable, Sendable, Equatable {
  public let scannedAt: Date
  public let scannedFormats: Set<PluginFormat>
  public let plugins: [InstalledPlugin]

  public init(scannedAt: Date, scannedFormats: Set<PluginFormat>, plugins: [InstalledPlugin]) {
    self.scannedAt = scannedAt
    self.scannedFormats = scannedFormats
    self.plugins = plugins
  }
}

public struct PluginSearchRoot: Sendable, Equatable {
  public let fileURL: URL
  public let format: PluginFormat

  public init(fileURL: URL, format: PluginFormat) {
    self.fileURL = fileURL
    self.format = format
  }
}

public struct PluginInventoryScanner {
  public let searchRoots: [PluginSearchRoot]
  private let fileManager: FileManager

  public init(
    searchRoots: [PluginSearchRoot] = Self.defaultSearchRoots(),
    fileManager: FileManager = .default
  ) {
    self.searchRoots = searchRoots
    self.fileManager = fileManager
  }

  public static func defaultSearchRoots(
    homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
  ) -> [PluginSearchRoot] {
    let system = URL(fileURLWithPath: "/Library/Audio/Plug-Ins", isDirectory: true)
    let user = homeDirectory.appending(path: "Library/Audio/Plug-Ins", directoryHint: .isDirectory)
    return [
      PluginSearchRoot(fileURL: system.appending(path: "Components"), format: .audioUnit),
      PluginSearchRoot(fileURL: user.appending(path: "Components"), format: .audioUnit),
      PluginSearchRoot(fileURL: system.appending(path: "VST3"), format: .vst3),
      PluginSearchRoot(fileURL: user.appending(path: "VST3"), format: .vst3),
      PluginSearchRoot(fileURL: system.appending(path: "VST"), format: .vst2),
      PluginSearchRoot(fileURL: user.appending(path: "VST"), format: .vst2),
    ]
  }

  public func scan(scannedAt: Date = Date()) -> PluginInventory {
    var pluginsByID: [String: InstalledPlugin] = [:]
    for root in searchRoots {
      for pluginURL in pluginBundles(in: root.fileURL, format: root.format) {
        let plugin = installedPlugin(at: pluginURL, format: root.format)
        pluginsByID[plugin.id] = plugin
      }
    }
    return PluginInventory(
      scannedAt: scannedAt,
      scannedFormats: Set(searchRoots.map(\.format)),
      plugins: pluginsByID.values.sorted {
        $0.name.localizedStandardCompare($1.name) == .orderedAscending
      }
    )
  }

  private func pluginBundles(in rootURL: URL, format: PluginFormat) -> [URL] {
    guard fileManager.fileExists(atPath: rootURL.path) else { return [] }
    let expectedExtension: String
    switch format {
    case .audioUnit: expectedExtension = "component"
    case .vst2: expectedExtension = "vst"
    case .vst3: expectedExtension = "vst3"
    }
    guard
      let enumerator = fileManager.enumerator(
        at: rootURL,
        includingPropertiesForKeys: [.isDirectoryKey],
        options: [.skipsHiddenFiles]
      )
    else { return [] }

    var results: [URL] = []
    for case let url as URL in enumerator {
      if url.pathExtension.caseInsensitiveCompare(expectedExtension) == .orderedSame {
        results.append(url.standardizedFileURL)
        enumerator.skipDescendants()
      }
    }
    return results
  }

  private func installedPlugin(at bundleURL: URL, format: PluginFormat) -> InstalledPlugin {
    let info = infoDictionary(for: bundleURL)
    let bundleIdentifier = info?["CFBundleIdentifier"] as? String
    let version =
      (info?["CFBundleShortVersionString"] as? String)
      ?? (info?["CFBundleVersion"] as? String)
    let component = (info?["AudioComponents"] as? [[String: Any]])?.first
    let componentName = component?["name"] as? String
    let manufacturer =
      (component?["manufacturer"] as? String)
      ?? manufacturerFromComponentName(componentName)
      ?? info?["Manufacturer"] as? String
    let name =
      (info?["CFBundleDisplayName"] as? String)
      ?? (info?["CFBundleName"] as? String)
      ?? componentName?.split(separator: ":", maxSplits: 1).last.map(String.init)
      ?? bundleURL.deletingPathExtension().lastPathComponent
    let componentIdentifier = component.flatMap { component in
      let values = [component["type"], component["subtype"], component["manufacturer"]]
        .compactMap { $0 as? String }
      return values.isEmpty ? nil : values.joined(separator: ":")
    }
    let identity = bundleIdentifier ?? componentIdentifier ?? bundleURL.path
    return InstalledPlugin(
      id: StableID.forValue("plugin:\(format.rawValue):\(identity)"),
      name: name.trimmingCharacters(in: .whitespacesAndNewlines),
      manufacturer: manufacturer,
      format: format,
      version: version,
      bundleIdentifier: bundleIdentifier,
      componentIdentifier: componentIdentifier,
      bundleURL: bundleURL
    )
  }

  private func infoDictionary(for bundleURL: URL) -> [String: Any]? {
    let infoURL = bundleURL.appending(path: "Contents/Info.plist")
    guard let data = try? Data(contentsOf: infoURL),
      let plist = try? PropertyListSerialization.propertyList(from: data, format: nil)
    else { return nil }
    return plist as? [String: Any]
  }

  private func manufacturerFromComponentName(_ value: String?) -> String? {
    guard let value, let separator = value.firstIndex(of: ":") else { return nil }
    let manufacturer = value[..<separator].trimmingCharacters(in: .whitespacesAndNewlines)
    return manufacturer.isEmpty ? nil : manufacturer
  }
}

public enum PluginCompatibilityStatus: String, Codable, Sendable {
  case installed
  case missing
  case versionMismatch
  case unknown
}

public struct PluginCompatibilityEvidence: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let deviceID: String
  public let requiredPlugin: PluginIdentity
  public let status: PluginCompatibilityStatus
  public let installedPlugin: InstalledPlugin?
  public let explanation: String

  public init(
    id: String,
    deviceID: String,
    requiredPlugin: PluginIdentity,
    status: PluginCompatibilityStatus,
    installedPlugin: InstalledPlugin?,
    explanation: String
  ) {
    self.id = id
    self.deviceID = deviceID
    self.requiredPlugin = requiredPlugin
    self.status = status
    self.installedPlugin = installedPlugin
    self.explanation = explanation
  }
}

public struct PluginCompatibilityReport: Codable, Sendable, Equatable {
  public let evidence: [PluginCompatibilityEvidence]

  public init(evidence: [PluginCompatibilityEvidence]) {
    self.evidence = evidence
  }

  public var missingCount: Int { evidence.count(where: { $0.status == .missing }) }
  public var versionMismatchCount: Int {
    evidence.count(where: { $0.status == .versionMismatch })
  }
  public var unknownCount: Int { evidence.count(where: { $0.status == .unknown }) }
}

public struct PluginCompatibilityEvaluator: Sendable {
  public init() {}

  public func evaluate(set: AbletonSet, inventory: PluginInventory) -> PluginCompatibilityReport {
    let devices = set.content.tracks.flatMap { track in
      track.devices.flatMap(\.flattened)
    }
    return PluginCompatibilityReport(
      evidence: devices.compactMap { device in
        guard let required = device.plugin else { return nil }
        return evaluate(deviceID: device.id, required: required, inventory: inventory)
      }
    )
  }

  private func evaluate(
    deviceID: String,
    required: PluginIdentity,
    inventory: PluginInventory
  ) -> PluginCompatibilityEvidence {
    let candidates = inventory.plugins.filter { $0.format == required.format }
    let match = candidates.first(where: { installed in
      if let identifier = required.identifier?.lowercased(),
        identifier == installed.bundleIdentifier?.lowercased()
          || identifier == installed.componentIdentifier?.lowercased()
      {
        return true
      }
      guard let requiredName = required.name else { return false }
      let sameName = normalize(requiredName) == normalize(installed.name)
      guard sameName else { return false }
      guard let requiredManufacturer = required.manufacturer,
        let installedManufacturer = installed.manufacturer
      else { return true }
      return normalize(requiredManufacturer) == normalize(installedManufacturer)
    })

    let status: PluginCompatibilityStatus
    let explanation: String
    if let match {
      if let requiredVersion = required.version,
        let installedVersion = match.version,
        requiredVersion != installedVersion
      {
        status = .versionMismatch
        explanation = "The plug-in is installed, but the indexed and installed versions differ."
      } else {
        status = .installed
        explanation = "A matching installed plug-in was found."
      }
    } else if inventory.scannedFormats.contains(required.format) {
      status = .missing
      explanation = "No matching installed plug-in was found in the scanned format."
    } else {
      status = .unknown
      explanation = "This plug-in format has not been scanned on this Mac."
    }

    return PluginCompatibilityEvidence(
      id: StableID.forValue("compatibility:\(deviceID)"),
      deviceID: deviceID,
      requiredPlugin: required,
      status: status,
      installedPlugin: match,
      explanation: explanation
    )
  }

  private func normalize(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      .reduce(into: "") { result, character in
        if character.isLetter || character.isNumber {
          result.append(character)
        }
      }
  }
}

extension SetDevice {
  fileprivate var flattened: [SetDevice] {
    [self] + nestedDevices.flatMap(\.flattened)
  }
}
