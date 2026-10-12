import Foundation
import Testing

@testable import StudioCore

@Suite("Immutable Set snapshot store")
struct SnapshotStoreTests {
  @Test("Deduplicates unchanged Set content and restores to a new file")
  func capturesAndRestores() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let setURL = root.appending(path: "Project/Song.als")
    try FileManager.default.createDirectory(
      at: setURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: setURL)
    let set = try indexedSet(at: setURL)
    let store = SnapshotStore(storageRoot: root.appending(path: "Snapshots"))

    let first = try await store.capture(
      set: set,
      projectID: "project",
      reason: .initialIndex
    )
    let duplicate = try await store.capture(
      set: set,
      projectID: "project",
      reason: .stableSave
    )
    #expect(first.id == duplicate.id)
    #expect(try await store.snapshots(projectID: "project").count == 1)

    let plan = try await store.planRestore(
      snapshotID: first.id,
      destinationDirectory: setURL.deletingLastPathComponent()
    )
    #expect(plan.destinationURL != setURL)
    #expect(plan.willCreateNewFile)
    let restoredURL = try await store.execute(plan)
    #expect(FileManager.default.fileExists(atPath: restoredURL.path))
    #expect(try Data(contentsOf: restoredURL) == Data(contentsOf: setURL))
  }

  @Test("Refuses to overwrite if the planned destination appears before execution")
  func refusesOverwrite() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let setURL = root.appending(path: "Song.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: setURL)
    let store = SnapshotStore(storageRoot: root.appending(path: "Snapshots"))
    let snapshot = try await store.capture(
      set: indexedSet(at: setURL),
      projectID: "project",
      reason: .manual
    )
    let plan = try await store.planRestore(
      snapshotID: snapshot.id,
      destinationDirectory: root,
      operation: .branch,
      preferredName: "Alternate"
    )
    try Data("existing".utf8).write(to: plan.destinationURL)

    await #expect(throws: SnapshotStoreError.self) {
      try await store.execute(plan)
    }
    #expect(try String(contentsOf: plan.destinationURL, encoding: .utf8) == "existing")
  }

  private func indexedSet(at url: URL) throws -> AbletonSet {
    let parsed = try AbletonSetParser().parse(fileURL: url)
    return AbletonSet(
      id: "set",
      fileURL: url,
      displayName: "Song",
      isBackup: false,
      modifiedAt: nil,
      compressedBytes: 0,
      xmlBytes: parsed.xmlBytes,
      creator: parsed.creator,
      format: parsed.format,
      structure: parsed.structure,
      content: parsed.content
    )
  }
}
