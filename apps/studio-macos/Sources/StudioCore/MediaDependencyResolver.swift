import Foundation

struct MediaDependencyResolver {
  let fileManager: FileManager

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
  }

  func resolve(
    content: AbletonSetContent,
    setURL: URL,
    projectRoot: URL
  ) -> AbletonSetContent {
    var resolved = content
    resolved.dependencies = content.dependencies.map { dependency in
      let resolution = resolve(
        reference: dependency.reference,
        setURL: setURL,
        projectRoot: projectRoot
      )
      return MediaDependency(
        id: dependency.id,
        kind: dependency.kind,
        reference: dependency.reference,
        resolvedURL: resolution.url,
        availability: resolution.availability,
        ownerID: dependency.ownerID
      )
    }
    return resolved
  }

  private func resolve(
    reference: MediaReference,
    setURL: URL,
    projectRoot: URL
  ) -> (url: URL?, availability: MediaDependencyAvailability) {
    let absoluteURL = reference.absolutePath
      .flatMap(cleanPath)
      .map { URL(fileURLWithPath: $0).standardizedFileURL }
    let relativePath = reference.relativePath.flatMap(cleanPath)
    let candidates = [
      absoluteURL,
      relativePath.map { projectRoot.appending(path: $0).standardizedFileURL },
      relativePath.map {
        setURL.deletingLastPathComponent().appending(path: $0).standardizedFileURL
      },
    ].compactMap { $0 }

    if let available = candidates.first(where: { fileManager.fileExists(atPath: $0.path) }) {
      return (available, .available)
    }
    if let absoluteURL, isOnDisconnectedVolume(absoluteURL) {
      return (absoluteURL, .disconnected)
    }
    if let candidate = candidates.first {
      return (candidate, .missing)
    }
    return (nil, .unresolved)
  }

  private func cleanPath(_ value: String) -> String? {
    let decoded = value.removingPercentEncoding ?? value
    let trimmed = decoded.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    return trimmed
  }

  private func isOnDisconnectedVolume(_ url: URL) -> Bool {
    let components = url.standardizedFileURL.pathComponents
    guard components.count >= 3, components[1] == "Volumes" else { return false }
    let volumeRoot = URL(fileURLWithPath: "/Volumes").appending(path: components[2])
    return !fileManager.fileExists(atPath: volumeRoot.path)
  }
}

extension AbletonSet {
  func resolvingDependencies(projectRoot: URL, fileManager: FileManager) -> AbletonSet {
    let resolvedContent = MediaDependencyResolver(fileManager: fileManager).resolve(
      content: content,
      setURL: fileURL,
      projectRoot: projectRoot
    )
    return AbletonSet(
      id: id,
      fileURL: fileURL,
      displayName: displayName,
      isBackup: isBackup,
      modifiedAt: modifiedAt,
      compressedBytes: compressedBytes,
      xmlBytes: xmlBytes,
      creator: creator,
      format: format,
      structure: structure,
      content: resolvedContent
    )
  }
}
