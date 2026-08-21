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
      to: backupDirectory.appending(path: "Song [2020-01-02 030405].als")
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
