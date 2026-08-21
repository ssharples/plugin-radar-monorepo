import Foundation

public enum StudioLibrarySyncStatus: String, Codable, Sendable {
  case idle
  case indexing
  case monitoring
  case stopped
}

public struct RootLibraryIndex: Sendable {
  public let root: RegisteredLibraryRoot
  public let index: StudioLibraryIndex

  public init(root: RegisteredLibraryRoot, index: StudioLibraryIndex) {
    self.root = root
    self.index = index
  }
}

public enum StudioLibrarySyncEvent: Sendable {
  case statusChanged(StudioLibrarySyncStatus)
  case rootsChanged([RegisteredLibraryRoot])
  case progress(rootID: String, update: IndexingProgress)
  case indexUpdated(rootID: String, index: StudioLibraryIndex, statistics: IndexingStatistics)
  case snapshotCaptured(SetSnapshot)
  case exportsDetected([ExportBatch])
  case exportDetectionFailed(message: String)
  case restoreCompleted(URL)
  case failed(message: String)
}

/// Coordinates the persistent index, macOS file events, and immutable Set snapshots.
///
/// The service only reads watched project roots. Its cache and snapshots live in Application Support,
/// while a restore is only written after the caller explicitly executes a no-overwrite restore plan.
public actor StudioLibrarySyncService {
  public let repository: StudioLibraryRepository
  public let snapshotStore: SnapshotStore

  private let monitor: StudioLibraryMonitor
  private let exportInboxStore: ExportInboxStore?
  private let exportDetectionTiming: ExportDetectionTiming
  private let debounceNanoseconds: UInt64
  private var status: StudioLibrarySyncStatus = .idle
  private var monitorTask: Task<Void, Never>?
  private var rescanTask: Task<Void, Never>?
  private var pendingSetPaths: Set<String> = []
  private var subscribers: [UUID: AsyncStream<StudioLibrarySyncEvent>.Continuation] = [:]

  public init(
    repository: StudioLibraryRepository,
    snapshotStore: SnapshotStore,
    monitor: StudioLibraryMonitor = StudioLibraryMonitor(),
    exportInboxStore: ExportInboxStore? = nil,
    exportDetectionTiming: ExportDetectionTiming = ExportDetectionTiming(),
    debounce: TimeInterval = 1.25
  ) {
    self.repository = repository
    self.snapshotStore = snapshotStore
    self.monitor = monitor
    self.exportInboxStore = exportInboxStore
    self.exportDetectionTiming = exportDetectionTiming
    debounceNanoseconds = UInt64(max(0.1, debounce) * 1_000_000_000)
  }

  public static func applicationSupportService(fileManager: FileManager = .default) throws
    -> StudioLibrarySyncService
  {
    let cacheURL = try StudioLibraryRepository.defaultStorageURL(fileManager: fileManager)
    let snapshotsURL = cacheURL.deletingLastPathComponent()
      .appending(path: "Snapshots", directoryHint: .isDirectory)
    return StudioLibrarySyncService(
      repository: StudioLibraryRepository(storageURL: cacheURL),
      snapshotStore: SnapshotStore(storageRoot: snapshotsURL),
      exportInboxStore: ExportInboxStore(
        storageURL: try ExportInboxStore.defaultStorageURL(fileManager: fileManager))
    )
  }

  deinit {
    monitorTask?.cancel()
    rescanTask?.cancel()
    monitor.stop()
  }

  public func events() -> AsyncStream<StudioLibrarySyncEvent> {
    let subscriberID = UUID()
    let stream = AsyncStream<StudioLibrarySyncEvent>.makeStream(
      bufferingPolicy: .bufferingNewest(128)
    )
    subscribers[subscriberID] = stream.continuation
    stream.continuation.onTermination = { [weak self] _ in
      Task { await self?.removeSubscriber(subscriberID) }
    }
    stream.continuation.yield(.statusChanged(status))
    return stream.stream
  }

  public func currentStatus() -> StudioLibrarySyncStatus {
    status
  }

  @discardableResult
  public func registerRoot(_ rootURL: URL, securityScopedBookmark: Data? = nil) async throws
    -> RegisteredLibraryRoot
  {
    let root = try await repository.registerRoot(
      rootURL,
      securityScopedBookmark: securityScopedBookmark
    )
    emit(.rootsChanged(try await repository.registeredRoots()))
    return root
  }

  public func registeredRoots() async throws -> [RegisteredLibraryRoot] {
    try await repository.registeredRoots()
  }

  public func cachedIndexes() async throws -> [RootLibraryIndex] {
    let roots = try await repository.registeredRoots()
    var results: [RootLibraryIndex] = []
    for root in roots {
      if let index = try await repository.cachedIndex(for: root.fileURL) {
        results.append(RootLibraryIndex(root: root, index: index))
      }
    }
    return results
  }

  /// Starts recursive monitoring, performs an initial scan, and snapshots each distinct Set.
  public func start() async throws {
    try await startMonitoring()
    _ = try await scanAll(snapshotReason: .initialIndex)
  }

  /// Resumes file monitoring and incrementally reconciles changes made while the app was closed.
  /// Monitoring starts first so files created during reconciliation are not missed.
  public func resumeMonitoring() async throws {
    try await startMonitoring()
    _ = try await scanAll()
  }

  @discardableResult
  public func scanAll(snapshotReason: SnapshotReason? = nil) async throws
    -> [RegisteredRootIndexingRun]
  {
    try await scanAll(snapshotReason: snapshotReason, changedSetPaths: nil)
  }

  public func startMonitoring() async throws {
    stopMonitoring()
    let roots = try await repository.registeredRoots().filter { $0.availability == .available }
    guard !roots.isEmpty else { throw StudioLibraryMonitorError.noRoots }
    let eventStream = try monitor.events(watching: roots.map(\.fileURL))
    setStatus(.monitoring)
    monitorTask = Task { [weak self] in
      for await batch in eventStream {
        guard !Task.isCancelled else { break }
        await self?.processFileEvents(batch)
      }
    }
  }

  public func stopMonitoring() {
    monitorTask?.cancel()
    monitorTask = nil
    rescanTask?.cancel()
    rescanTask = nil
    pendingSetPaths.removeAll()
    monitor.stop()
    setStatus(.stopped)
  }

  public func snapshots(projectID: String? = nil) async throws -> [SetSnapshot] {
    try await snapshotStore.snapshots(projectID: projectID)
  }

  public func planRestore(
    snapshotID: String,
    destinationDirectory: URL,
    operation: RestoreOperation = .restore,
    preferredName: String? = nil
  ) async throws -> SetRestorePlan {
    try await snapshotStore.planRestore(
      snapshotID: snapshotID,
      destinationDirectory: destinationDirectory,
      operation: operation,
      preferredName: preferredName
    )
  }

  @discardableResult
  public func executeRestore(_ plan: SetRestorePlan) async throws -> URL {
    let restoredURL = try await snapshotStore.execute(plan)
    emit(.restoreCompleted(restoredURL))
    return restoredURL
  }

  @discardableResult
  func processFileEvents(_ batch: LibraryFileEventBatch) async -> [ExportBatch] {
    let additions = await detectExports(in: batch)
    guard batch.containsIndexableChanges else { return additions }
    for event in batch.events where !event.isDirectory {
      if event.fileURL.pathExtension.caseInsensitiveCompare("als") == .orderedSame,
        event.kind != .removed
      {
        pendingSetPaths.insert(event.fileURL.standardizedFileURL.path)
      }
    }
    scheduleRescan()
    return additions
  }

  private func detectExports(in batch: LibraryFileEventBatch) async -> [ExportBatch] {
    guard let exportInboxStore else { return [] }
    do {
      let roots = try await repository.registeredRoots()
        .filter { $0.availability == .available }
        .map(\.fileURL)
      guard !roots.isEmpty else { return [] }
      let detected = try await ExportDetectionService(
        trackedRoots: roots,
        timing: exportDetectionTiming
      ).detect(batch)
      let additions = try await exportInboxStore.ingest(detected)
      if !additions.isEmpty { emit(.exportsDetected(additions)) }
      return additions
    } catch is CancellationError {
      return []
    } catch {
      emit(.exportDetectionFailed(message: error.localizedDescription))
      return []
    }
  }

  private func scheduleRescan() {
    rescanTask?.cancel()
    rescanTask = Task { [weak self, debounceNanoseconds] in
      do {
        try await Task.sleep(nanoseconds: debounceNanoseconds)
        guard !Task.isCancelled else { return }
        await self?.performPendingRescan()
      } catch {
        // A newer file-event batch superseded this debounce window.
      }
    }
  }

  private func performPendingRescan() async {
    let changedPaths = pendingSetPaths
    pendingSetPaths.removeAll()
    await waitForStableFiles(paths: changedPaths)
    guard !Task.isCancelled else { return }
    do {
      _ = try await scanAll(snapshotReason: .stableSave, changedSetPaths: changedPaths)
      if status != .stopped { setStatus(.monitoring) }
    } catch {
      emit(.failed(message: error.localizedDescription))
      if status != .stopped { setStatus(.monitoring) }
    }
  }

  private func scanAll(
    snapshotReason: SnapshotReason?,
    changedSetPaths: Set<String>?
  ) async throws -> [RegisteredRootIndexingRun] {
    setStatus(.indexing)
    do {
      let runs = try await repository.scanRegisteredRoots { [weak self] rootID, progress in
        Task { await self?.emit(.progress(rootID: rootID, update: progress)) }
      }
      for result in runs {
        emit(
          .indexUpdated(
            rootID: result.root.id,
            index: result.run.index,
            statistics: result.run.statistics
          )
        )
        if let snapshotReason {
          try await captureSnapshots(
            in: result.run.index,
            reason: snapshotReason,
            matching: changedSetPaths
          )
        }
      }
      emit(.rootsChanged(try await repository.registeredRoots()))
      setStatus(monitorTask == nil ? .idle : .monitoring)
      return runs
    } catch {
      emit(.failed(message: error.localizedDescription))
      setStatus(monitorTask == nil ? .idle : .monitoring)
      throw error
    }
  }

  private func captureSnapshots(
    in index: StudioLibraryIndex,
    reason: SnapshotReason,
    matching changedSetPaths: Set<String>?
  ) async throws {
    for project in index.projects {
      for set in project.sets {
        // Ableton's Backup directory is already a source-controlled history. Initial
        // capture protects each current Set without immediately duplicating every
        // historical backup; later stable-save events are captured by changed path.
        if reason == .initialIndex, set.isBackup { continue }
        if let changedSetPaths,
          !changedSetPaths.contains(set.fileURL.standardizedFileURL.path)
        {
          continue
        }
        let snapshot = try await snapshotStore.capture(
          set: set,
          projectID: project.id,
          reason: reason
        )
        emit(.snapshotCaptured(snapshot))
      }
    }
  }

  private func waitForStableFiles(paths: Set<String>) async {
    guard !paths.isEmpty else { return }
    var previous = fingerprintMap(paths: paths)
    for _ in 0..<6 {
      do {
        try await Task.sleep(nanoseconds: 350_000_000)
      } catch {
        return
      }
      let current = fingerprintMap(paths: paths)
      if current == previous { return }
      previous = current
    }
  }

  private func fingerprintMap(paths: Set<String>) -> [String: FileFingerprint] {
    Dictionary(
      uniqueKeysWithValues: paths.compactMap { path in
        let url = URL(fileURLWithPath: path)
        return (try? FileFingerprint.read(from: url, fileManager: .default)).map { (path, $0) }
      })
  }

  private func setStatus(_ nextStatus: StudioLibrarySyncStatus) {
    guard status != nextStatus else { return }
    status = nextStatus
    emit(.statusChanged(nextStatus))
  }

  private func emit(_ event: StudioLibrarySyncEvent) {
    for continuation in subscribers.values {
      continuation.yield(event)
    }
  }

  private func removeSubscriber(_ id: UUID) {
    subscribers.removeValue(forKey: id)
  }
}
