import Foundation

public actor StudioLibraryRepository {
  public typealias ProgressHandler = @Sendable (IndexingProgress) -> Void

  public let storageURL: URL

  private var document: IndexCacheDocument?

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
      .appending(path: "index-cache.plist")
  }

  public func cachedIndex(for rootURL: URL) throws -> StudioLibraryIndex? {
    try loadIfNeeded()
    return rootCache(matching: rootURL)?.value.lastIndex
  }

  /// Returns an exact cached index or a read-only subcatalogue when `scopeURL` sits beneath a
  /// registered root. This never persists the derived view and is useful for reports or searches
  /// whose domain is narrower than the folder the user granted permission to index.
  public func cachedIndex(containing scopeURL: URL) throws -> StudioLibraryIndex? {
    try loadIfNeeded()
    let scope = scopeURL.standardizedFileURL
    if let exact = rootCache(matching: scope)?.value.lastIndex { return exact }

    let containing = document?.roots.values
      .filter { cache in
        let rootPath = cache.rootURL.standardizedFileURL.path
        return scope.path.hasPrefix(rootPath + "/") && cache.lastIndex != nil
      }
      .max { $0.rootURL.path.count < $1.rootURL.path.count }
    guard let source = containing?.lastIndex else { return nil }

    func isInScope(_ url: URL) -> Bool {
      let path = url.standardizedFileURL.path
      return path == scope.path || path.hasPrefix(scope.path + "/")
    }
    return StudioLibraryIndex(
      rootURL: scope,
      scannedAt: source.scannedAt,
      projects: source.projects.filter { isInScope($0.rootURL) },
      unassignedAudioAssets: source.unassignedAudioAssets.filter { isInScope($0.fileURL) },
      issues: source.issues.filter { isInScope($0.fileURL) }
    )
  }

  @discardableResult
  public func registerRoot(_ rootURL: URL, securityScopedBookmark: Data? = nil) throws
    -> RegisteredLibraryRoot
  {
    try loadIfNeeded()
    let root = rootURL.standardizedFileURL
    let existing = rootCache(matching: root)
    let rootID = existing?.key ?? rootIdentifier(for: root)
    var nextDocument = document ?? IndexCacheDocument()
    let prior = existing?.value
    nextDocument.roots[rootID] = RootIndexCache(
      rootURL: root,
      securityScopedBookmark: securityScopedBookmark ?? prior?.securityScopedBookmark,
      setFingerprints: prior?.setFingerprints ?? [:],
      lastIndex: prior?.lastIndex,
      lastScannedAt: prior?.lastScannedAt
    )
    try save(nextDocument)
    document = nextDocument
    return makeRegisteredRoot(id: rootID, cache: nextDocument.roots[rootID]!)
  }

  public func registeredRoots() throws -> [RegisteredLibraryRoot] {
    try loadIfNeeded()
    return (document?.roots ?? [:])
      .map { makeRegisteredRoot(id: $0.key, cache: $0.value) }
      .sorted { $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending }
  }

  public func scan(
    rootURL: URL,
    progress: @escaping ProgressHandler = { _ in }
  ) throws -> IndexingRun {
    try loadIfNeeded()
    let root = rootURL.standardizedFileURL
    let existing = rootCache(matching: root)
    let rootID = existing?.key ?? rootIdentifier(for: root)
    let priorEntries = existing?.value.cachedSets ?? []
    let output = try StudioLibraryIndexer().indexIncrementally(
      rootURL: root,
      cachedSets: priorEntries,
      progress: progress
    )

    var nextDocument = document ?? IndexCacheDocument()
    nextDocument.roots[rootID] = RootIndexCache(
      rootURL: root,
      securityScopedBookmark: existing?.value.securityScopedBookmark,
      setFingerprints: Dictionary(
        uniqueKeysWithValues: output.cacheEntries.map { ($0.set.id, $0.fingerprint) }
      ),
      lastIndex: output.run.index,
      lastScannedAt: output.run.statistics.completedAt
    )
    try save(nextDocument)
    document = nextDocument
    return output.run
  }

  public func scanRegisteredRoots(
    progress: @escaping @Sendable (_ rootID: String, _ progress: IndexingProgress) -> Void = {
      _, _ in
    }
  ) throws -> [RegisteredRootIndexingRun] {
    try loadIfNeeded()
    let roots = try registeredRoots()
    var results: [RegisteredRootIndexingRun] = []

    for root in roots where root.availability == .available {
      let hasSecurityScope = root.fileURL.startAccessingSecurityScopedResource()
      defer {
        if hasSecurityScope { root.fileURL.stopAccessingSecurityScopedResource() }
      }
      let run = try scan(rootURL: root.fileURL) { update in
        progress(root.id, update)
      }
      let refreshedRoot = try registeredRoots().first(where: { $0.id == root.id }) ?? root
      results.append(RegisteredRootIndexingRun(root: refreshedRoot, run: run))
    }
    return results
  }

  public func removeCachedRoot(_ rootURL: URL) throws {
    try loadIfNeeded()
    guard let rootID = rootCache(matching: rootURL)?.key else { return }
    guard var nextDocument = document else { return }
    nextDocument.roots.removeValue(forKey: rootID)
    try save(nextDocument)
    document = nextDocument
  }

  public func removeAllCachedData() throws {
    document = IndexCacheDocument()
    if FileManager.default.fileExists(atPath: storageURL.path) {
      try FileManager.default.removeItem(at: storageURL)
    }
  }

  private func loadIfNeeded() throws {
    guard document == nil else { return }
    guard FileManager.default.fileExists(atPath: storageURL.path) else {
      document = IndexCacheDocument()
      return
    }

    do {
      let data = try Data(contentsOf: storageURL)
      let decoded = try PropertyListDecoder().decode(IndexCacheDocument.self, from: data)
      document =
        decoded.schemaVersion == IndexCacheDocument.currentSchemaVersion
        ? decoded
        : IndexCacheDocument()
    } catch {
      document = IndexCacheDocument()
    }
  }

  private func save(_ document: IndexCacheDocument) throws {
    let parent = storageURL.deletingLastPathComponent()
    try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    let data = try encoder.encode(document)
    try data.write(to: storageURL, options: [.atomic])
  }

  private func rootIdentifier(for rootURL: URL) -> String {
    if let fingerprint = try? FileFingerprint.read(from: rootURL, fileManager: .default) {
      return StableID.forFile(rootURL, fingerprint: fingerprint)
    }
    return StableID.forURL(rootURL)
  }

  private func rootCache(matching rootURL: URL) -> (key: String, value: RootIndexCache)? {
    let path = rootURL.standardizedFileURL.path
    return document?.roots.first(where: { $0.value.rootURL.standardizedFileURL.path == path })
  }

  private func makeRegisteredRoot(id: String, cache: RootIndexCache) -> RegisteredLibraryRoot {
    var rootURL = cache.rootURL
    var requiresBookmarkRefresh = false
    var bookmarkResolutionFailed = false

    if let bookmark = cache.securityScopedBookmark {
      do {
        rootURL = try URL(
          resolvingBookmarkData: bookmark,
          options: [.withSecurityScope],
          relativeTo: nil,
          bookmarkDataIsStale: &requiresBookmarkRefresh
        )
      } catch {
        bookmarkResolutionFailed = true
      }
    }

    let fileManager = FileManager.default
    let availability: LibraryRootAvailability
    if bookmarkResolutionFailed {
      availability = .permissionRequired
    } else if fileManager.fileExists(atPath: rootURL.path),
      fileManager.isReadableFile(atPath: rootURL.path)
    {
      availability = .available
    } else {
      availability = .unavailable
    }

    let sets = cache.lastIndex?.projects.reduce(0) { $0 + $1.sets.count } ?? 0
    return RegisteredLibraryRoot(
      id: id,
      fileURL: rootURL,
      displayName: rootURL.lastPathComponent,
      availability: availability,
      requiresBookmarkRefresh: requiresBookmarkRefresh,
      lastScannedAt: cache.lastScannedAt,
      projectCount: cache.lastIndex?.projects.count ?? 0,
      setCount: sets
    )
  }
}

struct CachedAbletonSet: Codable, Sendable {
  let fingerprint: FileFingerprint
  let set: AbletonSet
}

struct IncrementalIndexOutput {
  let run: IndexingRun
  let cacheEntries: [CachedAbletonSet]
}

private struct RootIndexCache: Codable {
  let rootURL: URL
  let securityScopedBookmark: Data?
  let setFingerprints: [String: FileFingerprint]
  let lastIndex: StudioLibraryIndex?
  let lastScannedAt: Date?

  var cachedSets: [CachedAbletonSet] {
    let setsByID = Dictionary(
      uniqueKeysWithValues: (lastIndex?.projects.flatMap(\.sets) ?? []).map { ($0.id, $0) }
    )
    return setFingerprints.compactMap { setID, fingerprint in
      setsByID[setID].map { CachedAbletonSet(fingerprint: fingerprint, set: $0) }
    }
  }
}

private struct IndexCacheDocument: Codable {
  static let currentSchemaVersion = 4

  var schemaVersion = currentSchemaVersion
  var roots: [String: RootIndexCache] = [:]
}
