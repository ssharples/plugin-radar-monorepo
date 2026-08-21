import CryptoKit
import Foundation

public struct AudioRecoveryItem: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let dependencyID: String
  public let sourceURL: URL
  public let destinationURL: URL
  public let bytes: Int64

  public init(
    id: String,
    dependencyID: String,
    sourceURL: URL,
    destinationURL: URL,
    bytes: Int64
  ) {
    self.id = id
    self.dependencyID = dependencyID
    self.sourceURL = sourceURL
    self.destinationURL = destinationURL
    self.bytes = bytes
  }
}

public struct AudioRecoveryPlan: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let destinationDirectory: URL
  public let items: [AudioRecoveryItem]
  public let totalBytes: Int64

  public init(id: String, destinationDirectory: URL, items: [AudioRecoveryItem]) {
    self.id = id
    self.destinationDirectory = destinationDirectory
    self.items = items
    totalBytes = items.reduce(0) { $0 + $1.bytes }
  }
}

public enum AudioRecoveryError: Error, LocalizedError {
  case noAvailableAudio
  case sourceUnavailable(URL)
  case destinationExists(URL)
  case copyVerificationFailed(URL)

  public var errorDescription: String? {
    switch self {
    case .noAvailableAudio: "None of the selected audio files are currently available"
    case .sourceUnavailable(let url): "The source audio is unavailable at \(url.path)"
    case .destinationExists(let url):
      "Recovery stopped because \(url.lastPathComponent) already exists"
    case .copyVerificationFailed(let url):
      "The recovered copy of \(url.lastPathComponent) failed verification"
    }
  }
}

/// Safely copies audio referenced by an older Set into a new recovery folder.
/// It deliberately does not rewrite `.als` files or overwrite project media.
public struct AudioRecoveryService {
  private let fileManager: FileManager

  public init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
  }

  public func plan(
    dependencies: [MediaDependency],
    destinationProjectURL: URL,
    folderName: String = "Recovered Audio"
  ) throws -> AudioRecoveryPlan {
    let directoryName = sanitizedFolderName(folderName)
    let destinationDirectory =
      destinationProjectURL
      .appending(path: directoryName, directoryHint: .isDirectory)
    var reservedPaths: Set<String> = []
    var seenSources: Set<String> = []
    var items: [AudioRecoveryItem] = []

    for dependency in dependencies where dependency.kind == .clipAudio {
      guard dependency.availability == .available, let sourceURL = dependency.resolvedURL else {
        continue
      }
      let source = sourceURL.standardizedFileURL
      guard fileManager.fileExists(atPath: source.path), seenSources.insert(source.path).inserted
      else {
        continue
      }
      let destination = uniqueDestination(
        for: source.lastPathComponent,
        in: destinationDirectory,
        reservedPaths: &reservedPaths
      )
      let attributes = try fileManager.attributesOfItem(atPath: source.path)
      let bytes = (attributes[.size] as? NSNumber)?.int64Value ?? 0
      items.append(
        AudioRecoveryItem(
          id: StableID.forValue("audio-recovery:\(dependency.id):\(destination.path)"),
          dependencyID: dependency.id,
          sourceURL: source,
          destinationURL: destination,
          bytes: bytes
        )
      )
    }
    guard !items.isEmpty else { throw AudioRecoveryError.noAvailableAudio }
    return AudioRecoveryPlan(
      id: StableID.forValue("audio-recovery-plan:\(items.map(\.id).joined(separator: ":"))"),
      destinationDirectory: destinationDirectory,
      items: items
    )
  }

  @discardableResult
  public func execute(_ plan: AudioRecoveryPlan) throws -> [URL] {
    for item in plan.items {
      guard fileManager.fileExists(atPath: item.sourceURL.path) else {
        throw AudioRecoveryError.sourceUnavailable(item.sourceURL)
      }
      guard !fileManager.fileExists(atPath: item.destinationURL.path) else {
        throw AudioRecoveryError.destinationExists(item.destinationURL)
      }
    }
    try fileManager.createDirectory(
      at: plan.destinationDirectory,
      withIntermediateDirectories: true
    )

    var recovered: [URL] = []
    for item in plan.items {
      let temporaryURL = plan.destinationDirectory
        .appending(path: ".\(UUID().uuidString).recovering")
      do {
        try fileManager.copyItem(at: item.sourceURL, to: temporaryURL)
        guard try contentDigest(item.sourceURL) == contentDigest(temporaryURL) else {
          throw AudioRecoveryError.copyVerificationFailed(item.destinationURL)
        }
        try fileManager.moveItem(at: temporaryURL, to: item.destinationURL)
        recovered.append(item.destinationURL)
      } catch {
        try? fileManager.removeItem(at: temporaryURL)
        throw error
      }
    }
    return recovered
  }

  private func uniqueDestination(
    for filename: String,
    in directory: URL,
    reservedPaths: inout Set<String>
  ) -> URL {
    let sourceURL = URL(fileURLWithPath: filename)
    let stem = sourceURL.deletingPathExtension().lastPathComponent
    let pathExtension = sourceURL.pathExtension
    var suffix = 1
    while true {
      let candidateStem = suffix == 1 ? stem : "\(stem) \(suffix)"
      let candidateName =
        pathExtension.isEmpty
        ? candidateStem
        : "\(candidateStem).\(pathExtension)"
      let candidate = directory.appending(path: candidateName)
      if !fileManager.fileExists(atPath: candidate.path),
        reservedPaths.insert(candidate.path).inserted
      {
        return candidate
      }
      suffix += 1
    }
  }

  private func sanitizedFolderName(_ value: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    let safe = trimmed.replacingOccurrences(of: "/", with: "-")
    return safe.isEmpty ? "Recovered Audio" : safe
  }

  private func contentDigest(_ url: URL) throws -> SHA256.Digest {
    SHA256.hash(data: try Data(contentsOf: url, options: .mappedIfSafe))
  }
}
