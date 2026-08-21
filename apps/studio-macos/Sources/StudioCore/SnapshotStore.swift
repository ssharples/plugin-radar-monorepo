import CryptoKit
import Foundation

public enum SnapshotReason: String, Codable, Sendable {
  case initialIndex
  case stableSave
  case manual
}

public struct SetSnapshot: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let projectID: String
  public let sourceSetID: String
  public let sourceURL: URL
  public let originalFilename: String
  public let contentDigest: String
  public let bytes: Int64
  public let capturedAt: Date
  public let reason: SnapshotReason
  public let creator: String?

  public init(
    id: String,
    projectID: String,
    sourceSetID: String,
    sourceURL: URL,
    originalFilename: String,
    contentDigest: String,
    bytes: Int64,
    capturedAt: Date,
    reason: SnapshotReason,
    creator: String?
  ) {
    self.id = id
    self.projectID = projectID
    self.sourceSetID = sourceSetID
    self.sourceURL = sourceURL
    self.originalFilename = originalFilename
    self.contentDigest = contentDigest
    self.bytes = bytes
    self.capturedAt = capturedAt
    self.reason = reason
    self.creator = creator
  }
}

public enum RestoreOperation: String, Codable, Sendable {
  case restore
  case branch
}

public struct SetRestorePlan: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let snapshot: SetSnapshot
  public let operation: RestoreOperation
  public let destinationURL: URL
  public let willCreateNewFile: Bool

  public init(
    id: String,
    snapshot: SetSnapshot,
    operation: RestoreOperation,
    destinationURL: URL,
    willCreateNewFile: Bool
  ) {
    self.id = id
    self.snapshot = snapshot
    self.operation = operation
    self.destinationURL = destinationURL
    self.willCreateNewFile = willCreateNewFile
  }
}

public enum SnapshotStoreError: Error, LocalizedError {
  case sourceMissing(URL)
  case snapshotMissing(String)
  case destinationExists(URL)
  case digestMismatch

  public var errorDescription: String? {
    switch self {
    case .sourceMissing(let url): "The source Set is unavailable at \(url.path)"
    case .snapshotMissing(let id): "Snapshot \(id) is not available"
    case .destinationExists(let url):
      "Restore stopped because \(url.lastPathComponent) already exists"
    case .digestMismatch: "The stored snapshot failed its integrity check"
    }
  }
}

public actor SnapshotStore {
  public let storageRoot: URL

  private let fileManager: FileManager
  private var manifest: SnapshotManifest?

  public init(storageRoot: URL, fileManager: FileManager = .default) {
    self.storageRoot = storageRoot
    self.fileManager = fileManager
  }

  public func capture(
    set: AbletonSet,
    projectID: String,
    reason: SnapshotReason,
    capturedAt: Date = Date()
  ) throws -> SetSnapshot {
    guard fileManager.fileExists(atPath: set.fileURL.path) else {
      throw SnapshotStoreError.sourceMissing(set.fileURL)
    }
    try loadIfNeeded()
    let digest = try FileContentDigest.sha256(fileURL: set.fileURL)
    if let existing = manifest?.snapshots.first(where: {
      $0.projectID == projectID && $0.contentDigest == digest
    }) {
      return existing
    }

    let blobURL = blobURL(for: digest)
    try fileManager.createDirectory(
      at: blobURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    if !fileManager.fileExists(atPath: blobURL.path) {
      let temporaryURL = blobURL.deletingLastPathComponent()
        .appending(path: ".\(UUID().uuidString).tmp")
      try fileManager.copyItem(at: set.fileURL, to: temporaryURL)
      do {
        try fileManager.moveItem(at: temporaryURL, to: blobURL)
      } catch {
        try? fileManager.removeItem(at: temporaryURL)
        if !fileManager.fileExists(atPath: blobURL.path) { throw error }
      }
    }

    let attributes = try fileManager.attributesOfItem(atPath: set.fileURL.path)
    let snapshot = SetSnapshot(
      id: StableID.forValue("snapshot:\(projectID):\(digest)"),
      projectID: projectID,
      sourceSetID: set.id,
      sourceURL: set.fileURL,
      originalFilename: set.fileURL.lastPathComponent,
      contentDigest: digest,
      bytes: (attributes[.size] as? NSNumber)?.int64Value ?? set.compressedBytes,
      capturedAt: capturedAt,
      reason: reason,
      creator: set.creator
    )
    var nextManifest = manifest ?? SnapshotManifest()
    nextManifest.snapshots.append(snapshot)
    try save(nextManifest)
    manifest = nextManifest
    return snapshot
  }

  public func snapshots(projectID: String? = nil) throws -> [SetSnapshot] {
    try loadIfNeeded()
    let snapshots = manifest?.snapshots ?? []
    return
      snapshots
      .filter { projectID == nil || $0.projectID == projectID }
      .sorted { $0.capturedAt > $1.capturedAt }
  }

  public func planRestore(
    snapshotID: String,
    destinationDirectory: URL,
    operation: RestoreOperation = .restore,
    preferredName: String? = nil
  ) throws -> SetRestorePlan {
    try loadIfNeeded()
    guard let snapshot = manifest?.snapshots.first(where: { $0.id == snapshotID }) else {
      throw SnapshotStoreError.snapshotMissing(snapshotID)
    }
    let destination = uniqueDestination(
      directory: destinationDirectory,
      originalFilename: snapshot.originalFilename,
      operation: operation,
      preferredName: preferredName
    )
    return SetRestorePlan(
      id: StableID.forValue("restore:\(snapshotID):\(destination.path)"),
      snapshot: snapshot,
      operation: operation,
      destinationURL: destination,
      willCreateNewFile: true
    )
  }

  @discardableResult
  public func execute(_ plan: SetRestorePlan) throws -> URL {
    guard !fileManager.fileExists(atPath: plan.destinationURL.path) else {
      throw SnapshotStoreError.destinationExists(plan.destinationURL)
    }
    let source = blobURL(for: plan.snapshot.contentDigest)
    guard fileManager.fileExists(atPath: source.path) else {
      throw SnapshotStoreError.snapshotMissing(plan.snapshot.id)
    }
    guard try FileContentDigest.sha256(fileURL: source) == plan.snapshot.contentDigest else {
      throw SnapshotStoreError.digestMismatch
    }
    try fileManager.createDirectory(
      at: plan.destinationURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try fileManager.copyItem(at: source, to: plan.destinationURL)
    return plan.destinationURL
  }

  private func loadIfNeeded() throws {
    guard manifest == nil else { return }
    let url = manifestURL
    guard fileManager.fileExists(atPath: url.path) else {
      manifest = SnapshotManifest()
      return
    }
    manifest = try JSONDecoder().decode(SnapshotManifest.self, from: Data(contentsOf: url))
  }

  private func save(_ manifest: SnapshotManifest) throws {
    try fileManager.createDirectory(at: storageRoot, withIntermediateDirectories: true)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    try encoder.encode(manifest).write(to: manifestURL, options: [.atomic])
  }

  private var manifestURL: URL {
    storageRoot.appending(path: "snapshots.json")
  }

  private func blobURL(for digest: String) -> URL {
    let prefix = String(digest.prefix(2))
    return
      storageRoot
      .appending(path: "blobs/\(prefix)", directoryHint: .isDirectory)
      .appending(path: "\(digest).als")
  }

  private func uniqueDestination(
    directory: URL,
    originalFilename: String,
    operation: RestoreOperation,
    preferredName: String?
  ) -> URL {
    let originalStem = URL(fileURLWithPath: originalFilename).deletingPathExtension()
      .lastPathComponent
    let requestedStem = preferredName?.trimmingCharacters(in: .whitespacesAndNewlines)
    let operationLabel = operation == .restore ? "restored" : "branch"
    let baseStem =
      requestedStem?.isEmpty == false ? requestedStem! : "\(originalStem) \(operationLabel)"
    var destination = directory.appending(path: "\(baseStem).als")
    var suffix = 2
    while fileManager.fileExists(atPath: destination.path) {
      destination = directory.appending(path: "\(baseStem) \(suffix).als")
      suffix += 1
    }
    return destination
  }
}

private struct SnapshotManifest: Codable {
  var schemaVersion = 1
  var snapshots: [SetSnapshot] = []
}
