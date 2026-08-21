import Foundation
import Testing

@testable import StudioCore

@Suite("Studio Live Insert search")
struct StudioLiveInsertSearchTests {
  @Test("Project and production-role terms rank the intended track")
  func ranksTrackFromNamedProject() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let hits = StudioLiveInsertSearchIndex(indexes: fixture.indexes).search(
      "lead vocal example set")

    let first = try #require(hits.first)
    #expect(first.kind == .track)
    #expect(first.title == "Lead Vocal")
    #expect(first.projectName == "Example Set Project")
    #expect(first.setName == "DEMO SET")
    #expect(first.delivery == .requiresLiveBrowser)
  }

  @Test("Studio vocabulary treats vox as vocal without weakening project provenance")
  func expandsStudioVocabulary() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let hits = StudioLiveInsertSearchIndex(indexes: fixture.indexes).search(
      "lead vox example set")

    let first = try #require(hits.first)
    #expect(first.title == "Lead Vocal")
    #expect(first.projectName == "Example Set Project")
    #expect(first.matchReasons.contains("Matched vocal vocabulary"))
  }

  @Test("Natural request phrasing does not become mandatory indexed evidence")
  func ignoresRequestScaffolding() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let hits = StudioLiveInsertSearchIndex(indexes: fixture.indexes).search(
      "bring me the lead vocal layer from example set")

    let first = try #require(hits.first)
    #expect(first.kind == .track)
    #expect(first.title == "Lead Vocal")
    #expect(first.projectName == "Example Set Project")
  }

  @Test("Explicit chain intent promotes the source track device chain")
  func promotesDeviceChainIntent() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let hits = StudioLiveInsertSearchIndex(indexes: fixture.indexes).search(
      "vocal eq chain example set")

    let first = try #require(hits.first)
    #expect(first.kind == .deviceChain)
    #expect(first.title == "Lead Vocal chain")
    #expect(first.trackID != nil)
    #expect(first.delivery == .requiresLiveBrowser)
    #expect(first.detail.contains("Vocal EQ"))
  }

  @Test("Resolved project audio is exposed only as a user-draggable file payload")
  func exposesResolvedClipAudio() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let hits = StudioLiveInsertSearchIndex(indexes: fixture.indexes).search(
      "verse vocal sample example set")

    let first = try #require(hits.first(where: { $0.kind == .audioClip }))
    #expect(first.title == "Verse vocal")
    #expect(first.fileURL?.lastPathComponent == "verse.wav")
    #expect(first.delivery == .userDraggableFile)
    #expect(first.delivery != .directInsertion)
  }
}

extension StudioLiveInsertSearchTests {
  fileprivate struct Fixture {
    let root: URL
    let indexes: [StudioLibraryIndex]

    init() throws {
      root = try TestSupport.temporaryDirectory()
      let artwork = root.appending(path: "Example Set Project", directoryHint: .isDirectory)
      let other = root.appending(path: "Another Song", directoryHint: .isDirectory)

      for project in [artwork, other] {
        try FileManager.default.createDirectory(
          at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
          withIntermediateDirectories: true)
        try FileManager.default.createDirectory(
          at: project.appending(path: "Samples/Recorded", directoryHint: .isDirectory),
          withIntermediateDirectories: true)
        try Data("audio".utf8).write(
          to: project.appending(path: "Samples/Recorded/verse.wav"))
      }

      try TestSupport.writeGzip(
        TestSupport.liveSetXML,
        to: artwork.appending(path: "DEMO SET.als"))
      try TestSupport.writeGzip(
        TestSupport.liveSetXML,
        to: other.appending(path: "ANOTHER SONG.als"))

      indexes = [try StudioLibraryIndexer().index(rootURL: root)]
    }

    func remove() {
      try? FileManager.default.removeItem(at: root)
    }
  }
}
