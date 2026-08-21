import Foundation

public actor OrganisationOverrideStore {
  public let storageURL: URL

  private var cached: OrganisationOverrides?

  public init(storageURL: URL) {
    self.storageURL = storageURL
  }

  public static func defaultStorageURL(fileManager: FileManager = .default) throws -> URL {
    let applicationSupport = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    return
      applicationSupport
      .appending(path: "Plugin Radar/Studio Time Machine", directoryHint: .isDirectory)
      .appending(path: "organisation-overrides.plist")
  }

  public func load() throws -> OrganisationOverrides {
    if let cached { return cached }
    return try reload()
  }

  /// Reads the durable file even when this actor has a cached snapshot.
  /// Production catalogue rebuilds use this seam so decisions written by another app instance
  /// or process become authoritative on the next refresh.
  public func reload() throws -> OrganisationOverrides {
    guard FileManager.default.fileExists(atPath: storageURL.path) else {
      let empty = OrganisationOverrides()
      cached = empty
      return empty
    }
    let data = try Data(contentsOf: storageURL)
    let document = try PropertyListDecoder().decode(OrganisationOverrideDocument.self, from: data)
    guard document.schemaVersion == OrganisationOverrideDocument.currentSchemaVersion else {
      throw OrganisationOverrideStoreError.unsupportedSchema(document.schemaVersion)
    }
    cached = document.overrides
    return document.overrides
  }

  public func save(_ overrides: OrganisationOverrides) throws {
    let document = OrganisationOverrideDocument(overrides: overrides)
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    let data = try encoder.encode(document)
    try FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try data.write(to: storageURL, options: [.atomic])
    cached = overrides
  }

  @discardableResult
  public func upsert(_ override: SessionOrganisationOverride) throws -> OrganisationOverrides {
    var bySessionID: [String: SessionOrganisationOverride] = [:]
    for decision in try load().sessionOverrides {
      bySessionID[decision.sessionID] = decision
    }
    bySessionID[override.sessionID] = override
    let next = OrganisationOverrides(
      sessionOverrides: bySessionID.values.sorted { $0.sessionID < $1.sessionID },
      qualifierDecisions: try load().qualifierDecisions)
    try save(next)
    return next
  }

  @discardableResult
  public func remove(sessionID: String) throws -> OrganisationOverrides {
    let next = OrganisationOverrides(
      sessionOverrides: try load().sessionOverrides.filter { $0.sessionID != sessionID },
      qualifierDecisions: try load().qualifierDecisions)
    try save(next)
    return next
  }

  @discardableResult
  public func upsert(_ decision: RevisionQualifierDecision) throws -> OrganisationOverrides {
    let current = try load()
    var byID = Dictionary(uniqueKeysWithValues: current.qualifierDecisions.map { ($0.id, $0) })
    byID[decision.id] = decision
    let next = OrganisationOverrides(
      sessionOverrides: current.sessionOverrides,
      qualifierDecisions: byID.values.sorted { $0.id < $1.id })
    try save(next)
    return next
  }
}

public enum OrganisationOverrideStoreError: Error, Equatable {
  case unsupportedSchema(Int)
}

private struct OrganisationOverrideDocument: Codable {
  static let currentSchemaVersion = 1

  var schemaVersion = currentSchemaVersion
  let overrides: OrganisationOverrides
}
