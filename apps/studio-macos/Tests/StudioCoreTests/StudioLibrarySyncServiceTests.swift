import Foundation
import Testing

@testable import StudioCore

@Suite("Studio library sync service")
struct StudioLibrarySyncServiceTests {
  @Test("Stable bounced audio is persisted once before library reconciliation")
  func detectsAndDeduplicatesStableBounce() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let library = root.appending(path: "Library", directoryHint: .isDirectory)
    let bounces = library.appending(path: "Bounces", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: bounces, withIntermediateDirectories: true)
    let bounce = bounces.appending(path: "Song Bounce.wav")
    try Data([1, 2, 3, 4]).write(to: bounce)

    let repository = StudioLibraryRepository(storageURL: root.appending(path: "Cache/index.plist"))
    _ = try await repository.registerRoot(library)
    let inboxURL = root.appending(path: "Export Inbox/inbox.plist")
    let service = StudioLibrarySyncService(
      repository: repository,
      snapshotStore: SnapshotStore(storageRoot: root.appending(path: "Snapshots")),
      exportInboxStore: ExportInboxStore(storageURL: inboxURL),
      exportDetectionTiming: ExportDetectionTiming(
        debounceInterval: 0,
        stabilityProbeInterval: 0,
        requiredMatchingProbes: 2),
      debounce: 60
    )
    let batch = LibraryFileEventBatch(
      events: [
        LibraryFileEvent(fileURL: bounce, kind: .created, isDirectory: false, eventID: 1)
      ],
      requiresFullRescan: false)

    let first = await service.processFileEvents(batch)
    let duplicate = await service.processFileEvents(batch)
    await service.stopMonitoring()

    #expect(first.count == 1)
    #expect(first.first?.kind == .bounce)
    #expect(first.first?.files.map(\.fileURL) == [bounce.standardizedFileURL])
    #expect(duplicate.isEmpty)
    let persisted = try await ExportInboxStore(storageURL: inboxURL).all()
    #expect(persisted.count == 1)
    #expect(persisted.first?.id == first.first?.id)
  }

  @Test("Resuming a cached library reconciles files created while the app was closed")
  func resumesCachedLibraryAndReconcilesChanges() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let library = root.appending(path: "Library", directoryHint: .isDirectory)
    let project = library.appending(path: "Song Project", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true)
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: project.appending(path: "Song.als"))
    let repository = StudioLibraryRepository(storageURL: root.appending(path: "Cache/index.plist"))
    _ = try await repository.registerRoot(library)
    _ = try await repository.scan(rootURL: library)
    try TestSupport.writeGzip(
      TestSupport.liveSetXML,
      to: project.appending(path: "Song mixed.als"))
    try Data([1, 2, 3]).write(to: project.appending(path: "Song mixed.wav"))
    let service = StudioLibrarySyncService(
      repository: repository,
      snapshotStore: SnapshotStore(storageRoot: root.appending(path: "Snapshots")),
      debounce: 0.1)
    let stream = await service.events()
    let collector = Task { () -> Bool in
      for await event in stream {
        if case .indexUpdated = event { return true }
        if Task.isCancelled { return false }
      }
      return false
    }
    defer { collector.cancel() }
    let deadline = Task {
      try? await Task.sleep(for: .seconds(5))
      if !Task.isCancelled { collector.cancel() }
    }
    defer { deadline.cancel() }

    try await service.resumeMonitoring()
    #expect(await service.currentStatus() == .monitoring)
    #expect(await collector.value)
    let cached = try await service.cachedIndexes()
    let indexedProject = try #require(cached.first?.index.projects.first)
    #expect(indexedProject.sets.contains(where: { $0.displayName == "Song mixed" }))
    #expect(
      indexedProject.previewAssets.contains(where: {
        $0.fileURL.lastPathComponent == "Song mixed.wav"
      }))
    await service.stopMonitoring()
  }

  @Test("Waits for an Ableton Set that appears after its file event")
  func waitsForDelayedSetCreation() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let library = root.appending(path: "Library", directoryHint: .isDirectory)
    let project = library.appending(path: "Song Project", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true)
    let setURL = project.appending(path: "Song.als")
    let repository = StudioLibraryRepository(storageURL: root.appending(path: "Cache/index.plist"))
    _ = try await repository.registerRoot(library)
    let service = StudioLibrarySyncService(
      repository: repository,
      snapshotStore: SnapshotStore(storageRoot: root.appending(path: "Snapshots")),
      debounce: 0.1)
    let stream = await service.events()
    let collector = Task { () -> Bool in
      for await event in stream {
        if case .indexUpdated = event { return true }
      }
      return false
    }
    defer { collector.cancel() }
    let deadline = Task {
      try? await Task.sleep(for: .seconds(5))
      if !Task.isCancelled { collector.cancel() }
    }
    defer { deadline.cancel() }

    try await service.startMonitoring()
    let event = LibraryFileEvent(fileURL: setURL, kind: .created, isDirectory: false, eventID: 1)
    let writer = Task {
      try await Task.sleep(nanoseconds: 500_000_000)
      try TestSupport.writeGzip(TestSupport.liveSetXML, to: setURL)
    }
    _ = await service.processFileEvents(
      LibraryFileEventBatch(events: [event], requiresFullRescan: false))

    #expect(await collector.value)
    try await writer.value
    let cached = try await service.cachedIndexes()
    #expect(
      cached.first?.index.projects.first?.sets.contains(where: { $0.fileURL == setURL }) == true)
    await service.stopMonitoring()
  }

  @Test("Retains Set paths when a newer save supersedes a debounce task")
  func retainsPathsAcrossSuccessiveSaveEvents() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let library = root.appending(path: "Library", directoryHint: .isDirectory)
    let project = library.appending(path: "Song Project", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true)
    let firstSet = project.appending(path: "Song v1.als")
    let secondSet = project.appending(path: "Song v2.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: firstSet)
    try TestSupport.writeGzip(
      TestSupport.liveSetXML.replacingOccurrences(of: "Lead Vocal", with: "Bass"),
      to: secondSet)
    let repository = StudioLibraryRepository(storageURL: root.appending(path: "Cache/index.plist"))
    _ = try await repository.registerRoot(library)
    let service = StudioLibrarySyncService(
      repository: repository,
      snapshotStore: SnapshotStore(storageRoot: root.appending(path: "Snapshots")),
      debounce: 0.1)

    try await service.startMonitoring()
    _ = await service.processFileEvents(
      LibraryFileEventBatch(
        events: [
          LibraryFileEvent(fileURL: firstSet, kind: .modified, isDirectory: false, eventID: 1)
        ],
        requiresFullRescan: false))
    try await Task.sleep(nanoseconds: 150_000_000)
    _ = await service.processFileEvents(
      LibraryFileEventBatch(
        events: [
          LibraryFileEvent(fileURL: secondSet, kind: .modified, isDirectory: false, eventID: 2)
        ],
        requiresFullRescan: false))

    for _ in 0..<20 {
      if try await service.snapshots().count >= 2 { break }
      try await Task.sleep(nanoseconds: 100_000_000)
    }
    #expect(try await service.snapshots().count == 2)
    await service.stopMonitoring()
  }

  @Test("Missing and changing files do not starve a stable Set snapshot")
  func stableSavesProgressIndependently() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let library = root.appending(path: "Library", directoryHint: .isDirectory)
    let project = library.appending(path: "Song Project", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true)
    let stableURL = project.appending(path: "Stable.als")
    let changingURL = project.appending(path: "Changing.als")
    let missingURL = project.appending(path: "Removed.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: stableURL)
    let repository = StudioLibraryRepository(storageURL: root.appending(path: "Cache/index.plist"))
    _ = try await repository.registerRoot(library)
    let service = StudioLibrarySyncService(
      repository: repository,
      snapshotStore: SnapshotStore(storageRoot: root.appending(path: "Snapshots")),
      debounce: 0.1)
    // Inject events directly to keep this regression independent of FSEvents coalescing.
    let writer = Task {
      for value in 0..<40 {
        try Task.checkCancellation()
        try Data(repeating: UInt8(value), count: 100 + value).write(to: changingURL)
        try await Task.sleep(for: .milliseconds(100))
      }
    }
    defer { writer.cancel() }
    _ = await service.processFileEvents(
      LibraryFileEventBatch(
        events: [stableURL, changingURL, missingURL].enumerated().map { index, url in
          LibraryFileEvent(
            fileURL: url, kind: .modified, isDirectory: false, eventID: UInt64(index))
        }, requiresFullRescan: false))
    var captured = false
    for _ in 0..<30 {
      if try await service.snapshots().count == 1 {
        captured = true
        break
      }
      try await Task.sleep(for: .milliseconds(100))
    }
    #expect(captured, "A stable Set should be captured while another file is still changing")
    let snapshots = try await service.snapshots()
    #expect(snapshots.count == 1)
    await service.stopMonitoring()
    #expect(await service.currentStatus() == .stopped)
    writer.cancel()
    _ = try? await writer.value
  }

  @Test("Publishes indexing events and captures initial snapshots")
  func scansAndSnapshots() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let library = root.appending(path: "Library", directoryHint: .isDirectory)
    let project = library.appending(path: "Song Project", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true
    )
    let setURL = project.appending(path: "Song.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: setURL)
    let backupDirectory = project.appending(path: "Backup", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: backupDirectory, withIntermediateDirectories: true)
    try TestSupport.writeGzip(
      TestSupport.liveSetXML,
      to: backupDirectory.appending(path: "Song [2026-08-01 120000].als")
    )

    let repository = StudioLibraryRepository(storageURL: root.appending(path: "Cache/index.json"))
    let service = StudioLibrarySyncService(
      repository: repository,
      snapshotStore: SnapshotStore(storageRoot: root.appending(path: "Snapshots")),
      debounce: 0.1
    )
    let eventStream = await service.events()
    let collector = Task { () -> Bool in
      for await event in eventStream {
        if case .snapshotCaptured = event { return true }
      }
      return false
    }

    let registered = try await service.registerRoot(library)
    try await service.startMonitoring()
    #expect(await service.currentStatus() == .monitoring)
    let runs = try await service.scanAll(snapshotReason: .initialIndex)

    #expect(runs.count == 1)
    #expect(runs.first?.root.id == registered.id)
    #expect(await service.currentStatus() == .monitoring)
    #expect(await collector.value)
    #expect(try await service.snapshots().count == 1)
    let cached = try await service.cachedIndexes()
    #expect(cached.count == 1)
    #expect(cached.first?.index.projects.first?.sets.count == 2)
    await service.stopMonitoring()
  }
}
