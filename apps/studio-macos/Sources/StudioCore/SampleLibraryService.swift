import Foundation

/// Coordinates the dedicated sample-location database, incremental metadata scans,
/// recursive FSEvents monitoring, and joins to parsed Ableton clip evidence.
/// Source audio is only read; all writes are confined to Application Support.
public actor SampleLibraryService {
  public let database: SampleLibraryDatabase
  public let lineageStore: AudioLineageStore

  private let indexer: SampleLibraryIndexer
  private let usageAggregator: SampleUsageAggregator
  private let audioAnalyzer: SampleAudioAnalyzer
  private let monitor: StudioLibraryMonitor
  private var status: SampleLibraryStatus = .idle
  private var projectRoots: [URL] = []
  private var monitorTask: Task<Void, Never>?
  private var rescanTask: Task<Void, Never>?
  private var subscribers: [UUID: AsyncStream<SampleLibraryEvent>.Continuation] = [:]

  public init(
    database: SampleLibraryDatabase,
    lineageStore: AudioLineageStore? = nil,
    indexer: SampleLibraryIndexer = SampleLibraryIndexer(),
    usageAggregator: SampleUsageAggregator = SampleUsageAggregator(),
    audioAnalyzer: SampleAudioAnalyzer = SampleAudioAnalyzer(),
    monitor: StudioLibraryMonitor = StudioLibraryMonitor()
  ) throws {
    self.database = database
    self.lineageStore = try lineageStore ?? AudioLineageStore(
      storageURL: database.storageURL.deletingLastPathComponent()
        .appending(path: "audio-lineage.sqlite"))
    self.indexer = indexer
    self.usageAggregator = usageAggregator
    self.audioAnalyzer = audioAnalyzer
    self.monitor = monitor
  }

  public static func applicationSupportService(fileManager: FileManager = .default) throws
    -> SampleLibraryService
  {
    try SampleLibraryService(
      database: SampleLibraryDatabase(
        storageURL: SampleLibraryDatabase.defaultStorageURL(fileManager: fileManager)),
      lineageStore: AudioLineageStore(
        storageURL: AudioLineageStore.defaultStorageURL(fileManager: fileManager)))
  }

  deinit {
    monitorTask?.cancel()
    rescanTask?.cancel()
    monitor.stop()
  }

  public func events() -> AsyncStream<SampleLibraryEvent> {
    let id = UUID()
    let stream = AsyncStream<SampleLibraryEvent>.makeStream(bufferingPolicy: .bufferingNewest(64))
    subscribers[id] = stream.continuation
    stream.continuation.onTermination = { [weak self] _ in
      Task { await self?.removeSubscriber(id) }
    }
    stream.continuation.yield(.statusChanged(status))
    return stream.stream
  }

  public func locations() throws -> [SampleLocation] {
    try database.locations()
  }

  @discardableResult
  public func registerLocation(_ url: URL, securityScopedBookmark: Data?) throws -> SampleLocation {
    let location = try database.registerLocation(
      url, securityScopedBookmark: securityScopedBookmark)
    emit(.locationsChanged(try database.locations()))
    return location
  }

  public func removeLocation(id: String) throws {
    try database.removeLocation(id: id)
    emit(.locationsChanged(try database.locations()))
  }

  public func start(projectRoots: [URL]) async throws {
    self.projectRoots = projectRoots
    try startMonitoring()
    _ = try await scanAll()
  }

  public func startMonitoring() throws {
    stopMonitoring()
    let available = try database.locations().filter { $0.availability == .available }
    guard !available.isEmpty else {
      setStatus(.idle)
      return
    }
    let stream = try monitor.events(watching: available.map(\.fileURL))
    setStatus(.monitoring)
    monitorTask = Task { [weak self] in
      for await batch in stream {
        guard !Task.isCancelled else { return }
        guard batch.containsIndexableChanges else { continue }
        await self?.scheduleRescan()
      }
    }
  }

  public func stopMonitoring() {
    monitorTask?.cancel()
    monitorTask = nil
    rescanTask?.cancel()
    rescanTask = nil
    monitor.stop()
    setStatus(.stopped)
  }

  @discardableResult
  public func scanAll() async throws -> [String: SampleIndexingStatistics] {
    let locations = try database.locations().filter { $0.availability == .available }
    guard !locations.isEmpty else {
      emit(.locationsChanged(try database.locations()))
      return [:]
    }
    setStatus(.indexing)
    var results: [String: SampleIndexingStatistics] = [:]
    for location in locations {
      let accessed = location.fileURL.startAccessingSecurityScopedResource()
      defer { if accessed { location.fileURL.stopAccessingSecurityScopedResource() } }
      let indexer = indexer
      let roots = projectRoots
      let database = database
      let statistics = try await Task.detached(priority: .utility) {
        try indexer.scan(location: location, projectRoots: roots, database: database)
      }.value
      results[location.id] = statistics
      emit(.indexCompleted(locationID: location.id, statistics: statistics))
    }
    emit(.locationsChanged(try database.locations()))
    setStatus(.monitoring)
    return results
  }

  public func replaceUsage(
    indexes: [StudioLibraryIndex],
    worksBySessionID: [String: LogicalWorkIdentity] = [:],
    coverageComplete: Bool
  ) async throws {
    let paths = try database.allSampleIDsByPath()
    let aggregator = usageAggregator
    let aggregation = await Task.detached(priority: .utility) {
      aggregator.aggregate(
        indexes: indexes, sampleIDsByPath: paths, worksBySessionID: worksBySessionID)
    }.value
    try database.replaceUsage(aggregation, coverageComplete: coverageComplete)
    emit(.usageUpdated)
  }

  public func query(_ query: SampleQuery = SampleQuery()) throws -> SampleQueryResult {
    try database.querySamples(query)
  }

  public func occurrences(for sampleID: String) throws -> [SampleUsageOccurrence] {
    try database.occurrences(for: sampleID)
  }

  public func verifyCopyCandidates(for sampleID: String) async throws -> [SampleMatchReview] {
    let database = database
    let lineageStore = lineageStore
    return try await Task.detached(priority: .utility) {
      try SampleCopyMatcher().verifyCandidates(
        for: sampleID, database: database, lineageStore: lineageStore)
    }.value
  }

  public func matchReviews(for sampleID: String) throws -> [SampleMatchReview] {
    try database.matchReviews(for: sampleID)
  }

  public func saveReviewDecision(evidenceID: String, accepted: Bool) throws {
    try database.saveReviewDecision(evidenceID: evidenceID, accepted: accepted)
  }

  public func audioAnalysis(for sample: SampleListRow, force: Bool = false) async throws
    -> SampleAudioAnalysis
  {
    if !force, let cached = try database.audioAnalysis(for: sample.id), cached.matches(sample) {
      return cached
    }
    let analyzer = audioAnalyzer
    let analysis = try await Task.detached(priority: .utility) {
      try await analyzer.analyze(sample)
    }.value
    try database.saveAudioAnalysis(analysis)
    return analysis
  }

  private func scheduleRescan() {
    rescanTask?.cancel()
    rescanTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(1.25))
      guard !Task.isCancelled else { return }
      do {
        _ = try await self?.scanAll()
      } catch {
        await self?.emit(.failed(message: error.localizedDescription))
      }
    }
  }

  private func setStatus(_ next: SampleLibraryStatus) {
    status = next
    emit(.statusChanged(next))
  }

  private func emit(_ event: SampleLibraryEvent) {
    for continuation in subscribers.values { continuation.yield(event) }
  }

  private func removeSubscriber(_ id: UUID) {
    subscribers.removeValue(forKey: id)
  }
}
