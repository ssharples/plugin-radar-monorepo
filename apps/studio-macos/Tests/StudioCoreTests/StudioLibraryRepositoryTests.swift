import Foundation
import Testing

@testable import StudioCore

@Suite("Persistent studio library repository")
struct StudioLibraryRepositoryTests {
  @Test("Registers multiple roots and reports their availability")
  func registersRoots() async throws {
    let first = try makeLibrary()
    let second = try makeLibrary()
    defer {
      try? FileManager.default.removeItem(at: first.root)
      try? FileManager.default.removeItem(at: second.root)
    }
    let repository = StudioLibraryRepository(
      storageURL: first.root.appending(path: "Cache/index.json")
    )

    let firstRoot = try await repository.registerRoot(first.library)
    let secondRoot = try await repository.registerRoot(second.library)
    #expect(firstRoot.id != secondRoot.id)
    #expect(firstRoot.availability == .available)

    let runs = try await repository.scanRegisteredRoots()
    #expect(runs.count == 2)
    let roots = try await repository.registeredRoots()
    #expect(roots.count == 2)
    #expect(roots.allSatisfy { $0.projectCount == 1 && $0.setCount == 2 })

    try FileManager.default.removeItem(at: second.library)
    let disconnected = try await repository.registeredRoots().first(where: {
      $0.id == secondRoot.id
    })
    #expect(disconnected?.availability == .unavailable)
  }

  @Test("Persists parsed Sets and reuses unchanged metadata")
  func persistsAndReusesSets() async throws {
    let fixture = try makeLibrary()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let cacheURL = fixture.root.appending(path: "Cache/index.json")
    let repository = StudioLibraryRepository(storageURL: cacheURL)

    let first = try await repository.scan(rootURL: fixture.library)
    #expect(first.statistics.parsedSetCount == 2)
    #expect(first.statistics.reusedSetCount == 0)
    #expect(FileManager.default.fileExists(atPath: cacheURL.path))

    let second = try await repository.scan(rootURL: fixture.library)
    #expect(second.statistics.parsedSetCount == 0)
    #expect(second.statistics.reusedSetCount == 2)

    let reloadedRepository = StudioLibraryRepository(storageURL: cacheURL)
    let cached = try await reloadedRepository.cachedIndex(for: fixture.library)
    #expect(cached?.projects.first?.sets.count == 2)

    let third = try await reloadedRepository.scan(rootURL: fixture.library)
    #expect(third.statistics.parsedSetCount == 0)
    #expect(third.statistics.reusedSetCount == 2)
  }

  @Test("Reparses changed Sets and prunes deleted cache entries")
  func reparsesChangesAndPrunesDeletedSets() async throws {
    let fixture = try makeLibrary()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let repository = StudioLibraryRepository(
      storageURL: fixture.root.appending(path: "Cache/index.json")
    )
    _ = try await repository.scan(rootURL: fixture.library)

    try TestSupport.writeGzip(
      TestSupport.liveSetXML.replacingOccurrences(
        of: "</LiveSet>", with: "<AudioTrack /></LiveSet>"),
      to: fixture.currentSet
    )
    try FileManager.default.removeItem(at: fixture.backupSet)

    let next = try await repository.scan(rootURL: fixture.library)
    #expect(next.statistics.parsedSetCount == 1)
    #expect(next.statistics.reusedSetCount == 0)
    #expect(next.index.projects.first?.sets.count == 1)

    let final = try await repository.scan(rootURL: fixture.library)
    #expect(final.statistics.parsedSetCount == 0)
    #expect(final.statistics.reusedSetCount == 1)
  }

  @Test("Keeps Set identity stable when a file is renamed on the same volume")
  func preservesIdentityAcrossRename() async throws {
    let fixture = try makeLibrary()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let repository = StudioLibraryRepository(
      storageURL: fixture.root.appending(path: "Cache/index.json")
    )
    let first = try await repository.scan(rootURL: fixture.library)
    let originalSet = try #require(
      first.index.projects.first?.sets.first(where: { !$0.isBackup })
    )

    let renamedURL = fixture.project.appending(path: "Song final.als")
    try FileManager.default.moveItem(at: fixture.currentSet, to: renamedURL)
    let second = try await repository.scan(rootURL: fixture.library)
    let renamedSet = try #require(
      second.index.projects.first?.sets.first(where: { !$0.isBackup })
    )

    #expect(second.statistics.reusedSetCount == 2)
    #expect(renamedSet.id == originalSet.id)
    #expect(renamedSet.fileURL == renamedURL)
  }

  @Test("Builds a read-only cached subcatalogue beneath a registered root")
  func scopesParentCache() async throws {
    let fixture = try makeLibrary()
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let repository = StudioLibraryRepository(
      storageURL: fixture.root.appending(path: "Cache/index.json")
    )
    _ = try await repository.scan(rootURL: fixture.library)

    let scoped = try #require(await repository.cachedIndex(containing: fixture.project))
    #expect(scoped.rootURL == fixture.project.standardizedFileURL)
    #expect(scoped.projects.count == 1)
    #expect(scoped.projects[0].rootURL == fixture.project.standardizedFileURL)
    let sibling = fixture.root.appending(path: "Outside", directoryHint: .isDirectory)
    #expect(try await repository.cachedIndex(containing: sibling) == nil)
  }

  private func makeLibrary() throws -> LibraryFixture {
    let root = try TestSupport.temporaryDirectory()
    let library = root.appending(path: "Library", directoryHint: .isDirectory)
    let project = library.appending(path: "Song Project", directoryHint: .isDirectory)
    let backupDirectory = project.appending(path: "Backup", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true
    )
    try FileManager.default.createDirectory(at: backupDirectory, withIntermediateDirectories: true)

    let currentSet = project.appending(path: "Song.als")
    let backupSet = backupDirectory.appending(path: "Song [2020-01-02 030405].als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: currentSet)
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: backupSet)
    return LibraryFixture(
      root: root,
      library: library,
      project: project,
      currentSet: currentSet,
      backupSet: backupSet
    )
  }
}

private struct LibraryFixture {
  let root: URL
  let library: URL
  let project: URL
  let currentSet: URL
  let backupSet: URL
}
