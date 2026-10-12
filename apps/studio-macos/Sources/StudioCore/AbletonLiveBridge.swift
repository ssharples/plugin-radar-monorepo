import AppKit
import Foundation

public struct AbletonLiveInstallation: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let applicationURL: URL
  public let displayName: String
  public let bundleIdentifier: String?
  public let version: String?
  public let majorVersion: Int?

  public init(
    id: String,
    applicationURL: URL,
    displayName: String,
    bundleIdentifier: String?,
    version: String?,
    majorVersion: Int?
  ) {
    self.id = id
    self.applicationURL = applicationURL
    self.displayName = displayName
    self.bundleIdentifier = bundleIdentifier
    self.version = version
    self.majorVersion = majorVersion
  }
}

public struct AbletonLiveOpenPlan: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let setURL: URL
  public let installation: AbletonLiveInstallation
  public let explanation: String
  public let requiresUserControlledExport: Bool

  public init(
    id: String,
    setURL: URL,
    installation: AbletonLiveInstallation,
    explanation: String,
    requiresUserControlledExport: Bool = true
  ) {
    self.id = id
    self.setURL = setURL
    self.installation = installation
    self.explanation = explanation
    self.requiresUserControlledExport = requiresUserControlledExport
  }
}

public enum AbletonLiveBridgeError: Error, LocalizedError {
  case setUnavailable(URL)
  case noInstallation
  case launchFailed(String)

  public var errorDescription: String? {
    switch self {
    case .setUnavailable(let url): "The Ableton Set is unavailable at \(url.path)"
    case .noInstallation: "No installed copy of Ableton Live was found"
    case .launchFailed(let message): "Ableton Live could not open the Set: \(message)"
    }
  }
}

public struct AbletonLiveLocator: Sendable {
  public init() {}

  public func installedApplications(
    searchRoots: [URL]? = nil,
    fileManager: FileManager = .default
  ) -> [AbletonLiveInstallation] {
    let roots =
      searchRoots ?? [
        URL(fileURLWithPath: "/Applications", isDirectory: true),
        fileManager.homeDirectoryForCurrentUser.appending(
          path: "Applications", directoryHint: .isDirectory),
      ]
    var installations: [AbletonLiveInstallation] = []
    for root in roots {
      guard
        let children = try? fileManager.contentsOfDirectory(
          at: root,
          includingPropertiesForKeys: [.isApplicationKey],
          options: [.skipsHiddenFiles]
        )
      else { continue }
      for applicationURL in children where applicationURL.pathExtension == "app" {
        guard let installation = installation(at: applicationURL) else { continue }
        installations.append(installation)
      }
    }
    return installations.sorted { left, right in
      switch (left.version, right.version) {
      case (let leftVersion?, let rightVersion?):
        return leftVersion.compare(rightVersion, options: .numeric) == .orderedDescending
      case (_?, nil): return true
      case (nil, _?): return false
      case (nil, nil):
        return left.displayName.localizedStandardCompare(right.displayName) == .orderedAscending
      }
    }
  }

  private func installation(at applicationURL: URL) -> AbletonLiveInstallation? {
    let infoURL = applicationURL.appending(path: "Contents/Info.plist")
    guard let data = try? Data(contentsOf: infoURL),
      let info = try? PropertyListSerialization.propertyList(from: data, format: nil)
        as? [String: Any]
    else { return nil }
    let bundleIdentifier = info["CFBundleIdentifier"] as? String
    let name =
      (info["CFBundleDisplayName"] as? String)
      ?? (info["CFBundleName"] as? String)
      ?? applicationURL.deletingPathExtension().lastPathComponent
    let identity = "\(bundleIdentifier ?? "") \(name)".lowercased()
    guard identity.contains("ableton"), identity.contains("live") else { return nil }
    let version =
      (info["CFBundleShortVersionString"] as? String)
      ?? (info["CFBundleVersion"] as? String)
    return AbletonLiveInstallation(
      id: StableID.forURL(applicationURL),
      applicationURL: applicationURL,
      displayName: name,
      bundleIdentifier: bundleIdentifier,
      version: version,
      majorVersion: version.flatMap(Self.majorVersion)
        ?? Self.majorVersion(name)
    )
  }

  private static func majorVersion(_ value: String) -> Int? {
    value.split { !$0.isNumber }.compactMap { Int($0) }.first
  }
}

public struct AbletonLiveBridge: Sendable {
  public init() {}

  public func planOpen(
    set: AbletonSet,
    installations: [AbletonLiveInstallation]
  ) throws -> AbletonLiveOpenPlan {
    guard FileManager.default.fileExists(atPath: set.fileURL.path) else {
      throw AbletonLiveBridgeError.setUnavailable(set.fileURL)
    }
    guard !installations.isEmpty else { throw AbletonLiveBridgeError.noInstallation }
    let creatorMajor = set.creator.flatMap(Self.majorVersion)
    let matching = creatorMajor.flatMap { major in
      installations.first(where: { $0.majorVersion == major })
    }
    let selected = matching ?? installations[0]
    let explanation: String
    if let creatorMajor, selected.majorVersion == creatorMajor {
      explanation =
        "Open in installed Live \(creatorMajor), matching the Set's creator version. Export remains user-controlled in Live."
    } else {
      explanation =
        "Open in \(selected.displayName). Compatibility is not guaranteed; export remains user-controlled in Live."
    }
    return AbletonLiveOpenPlan(
      id: StableID.forValue("live-open:\(set.id):\(selected.id)"),
      setURL: set.fileURL,
      installation: selected,
      explanation: explanation
    )
  }

  @MainActor
  public func execute(_ plan: AbletonLiveOpenPlan) async throws {
    guard FileManager.default.fileExists(atPath: plan.setURL.path) else {
      throw AbletonLiveBridgeError.setUnavailable(plan.setURL)
    }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = true
    configuration.addsToRecentItems = true
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
      NSWorkspace.shared.open(
        [plan.setURL],
        withApplicationAt: plan.installation.applicationURL,
        configuration: configuration
      ) { _, error in
        if let error {
          continuation.resume(
            throwing: AbletonLiveBridgeError.launchFailed(error.localizedDescription))
        } else {
          continuation.resume(returning: ())
        }
      }
    }
  }

  private static func majorVersion(_ value: String) -> Int? {
    value.split { !$0.isNumber }.compactMap { Int($0) }.first
  }
}
