import Foundation
import Testing
@testable import StudioCore

@Suite("Renamed collected sample matching")
struct RenamedSampleCopyMatcherTests {
  @Test("Verifies an exact collected copy even when its filename changed")
  func renamedCollectedCopy() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let externalRoot = root.appending(path: "External", directoryHint: .isDirectory)
    let projectRoot = root.appending(path: "Song Project", directoryHint: .isDirectory)
    let importedRoot = projectRoot.appending(path: "Samples/Collected", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: externalRoot, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: importedRoot, withIntermediateDirectories: true)
    let bytes = minimalWAV() + Data(repeating: 19, count: 80_000)
    try bytes.write(to: externalRoot.appending(path: "Original Kick.wav"))
    try bytes.write(to: importedRoot.appending(path: "Audio 0007.wav"))
    let database = try SampleLibraryDatabase(storageURL: root.appending(path: "samples.sqlite"))
    let externalLocation = try database.registerLocation(externalRoot, securityScopedBookmark: nil)
    let projectLocation = try database.registerLocation(projectRoot, securityScopedBookmark: nil)
    _ = try SampleLibraryIndexer().scan(
      location: externalLocation, projectRoots: [projectRoot], database: database)
    _ = try SampleLibraryIndexer().scan(
      location: projectLocation, projectRoots: [projectRoot], database: database)
    let externalID = try #require(
      database.querySamples().rows.first { $0.classification == .externalLibraryOriginal }?.id)
    let lineageStore = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))

    let reviews = try SampleCopyMatcher().verifyCandidates(
      for: externalID, database: database, lineageStore: lineageStore)

    #expect(reviews.contains { $0.evidence.relationship == .exactDuplicateOf })
    #expect(reviews.contains { $0.evidence.relationship == .collectedCopyOf })
    #expect(
      try database.querySamples().rows.contains { $0.classification == .collectedProjectCopy })
    #expect(try lineageStore.contentAssets().count == 1)
    #expect(try lineageStore.locations(for: lineageStore.contentAssets()[0].id).count == 2)
    #expect(
      try lineageStore.edges(for: externalID).contains { $0.relationship == .exactBytes })
  }

  @Test("Never creates verified lineage for same-size files with different bytes")
  func rejectsSameSizeDifferentContent() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let externalRoot = root.appending(path: "External", directoryHint: .isDirectory)
    let projectRoot = root.appending(path: "Song Project", directoryHint: .isDirectory)
    let importedRoot = projectRoot.appending(path: "Samples/Collected", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: externalRoot, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: importedRoot, withIntermediateDirectories: true)
    try (minimalWAV() + Data(repeating: 19, count: 80_000))
      .write(to: externalRoot.appending(path: "Original.wav"))
    try (minimalWAV() + Data(repeating: 20, count: 80_000))
      .write(to: importedRoot.appending(path: "Collected.wav"))
    let database = try SampleLibraryDatabase(storageURL: root.appending(path: "samples.sqlite"))
    let externalLocation = try database.registerLocation(externalRoot, securityScopedBookmark: nil)
    let projectLocation = try database.registerLocation(projectRoot, securityScopedBookmark: nil)
    _ = try SampleLibraryIndexer().scan(
      location: externalLocation, projectRoots: [projectRoot], database: database)
    _ = try SampleLibraryIndexer().scan(
      location: projectLocation, projectRoots: [projectRoot], database: database)
    let externalID = try #require(
      database.querySamples().rows.first { $0.classification == .externalLibraryOriginal }?.id)
    let lineageStore = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))

    let reviews = try SampleCopyMatcher().verifyCandidates(
      for: externalID, database: database, lineageStore: lineageStore)

    #expect(!reviews.contains { $0.evidence.relationship == .exactDuplicateOf })
    #expect(try lineageStore.contentAssets().isEmpty)
    #expect(try lineageStore.edges(for: externalID).isEmpty)
  }

  private func minimalWAV() -> Data {
    Data([
      0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6D, 0x74, 0x20, 0x10, 0, 0, 0, 1, 0, 1, 0,
      0x44, 0xAC, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0,
      0x64, 0x61, 0x74, 0x61, 0, 0, 0, 0,
    ])
  }
}
