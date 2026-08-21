import Foundation
import Testing

@testable import StudioCore

@Suite("Studio search")
struct StudioSearchTests {
  @Test("Song search ranks Song names before Artist-only matches")
  func songFirstRanking() throws {
    let index = StudioWorkSearchIndex(works: [
      work(id: "artist-match", song: "Example House", artist: "Example Song"),
      work(id: "song-match", song: "Example Song", artist: "Demo Artist"),
      work(id: "prefix-match", song: "Example Song Clean", artist: "Demo Artist"),
    ])

    let hits = index.search("example song")
    #expect(hits.map(\.workID) == ["song-match", "prefix-match", "artist-match"])
    #expect(hits.first?.songName == "Example Song")
  }

  @Test("Song search matches Artist labels case- and diacritic-insensitively")
  func songSearchArtistAndDiacritics() throws {
    let index = StudioWorkSearchIndex(works: [
      work(id: "bjork", song: "Jóga", artist: "Björk"),
      work(id: "other", song: "Hunter", artist: "Portishead"),
    ])

    #expect(index.search("BJORK").map(\.workID) == ["bjork"])
    #expect(index.search("joga").map(\.workID) == ["bjork"])
  }

  @Test("Empty Song search puts recent Works first without adding indexed evidence")
  func recentSongsBeforeTyping() throws {
    let index = StudioWorkSearchIndex(works: [
      work(id: "a", song: "Alpha", artist: "Artist"),
      work(id: "b", song: "Beta", artist: "Artist"),
      work(id: "c", song: "Gamma", artist: "Artist"),
    ])

    let hits = index.search("", recentWorkIDs: ["c", "a"], limit: 3)
    #expect(hits.map(\.workID) == ["c", "a", "b"])
    #expect(hits.allSatisfy { $0.id.hasPrefix("work-search:") })
  }

  @Test("Asynchronous search results cannot be reused for a different query")
  func resultBatchRejectsStaleQuery() throws {
    let batch = StudioSearchResultBatch(query: "Jóga", results: ["song-joga"])

    #expect(batch.results(matching: "  JOGA  ") == ["song-joga"])
    #expect(batch.results(matching: "Hunter") == nil)
  }

  @Test("Finds projects, Sets, tracks, clips, plug-ins, locators, and audio with provenance")
  func searchesIndexedEvidence() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let project = root.appending(path: "Example Night Song", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true
    )
    try TestSupport.writeGzip(
      TestSupport.liveSetXML,
      to: project.appending(path: "Example Night Mix.als")
    )
    let render = project.appending(path: "Example Night master.wav")
    try Data("audio".utf8).write(to: render)
    let index = try StudioLibraryIndexer().index(rootURL: root)
    let search = StudioSearchIndex(index: index)

    let vocal = try #require(search.search("lead vocal", kinds: [.track]).first)
    #expect(vocal.kind == .track)
    #expect(vocal.projectID != nil)
    #expect(vocal.setID != nil)
    #expect(vocal.trackID != nil)

    #expect(search.search("example audio", kinds: [.device]).first?.title == "Vocal EQ")
    #expect(search.search("verse vocal", kinds: [.clip]).first?.kind == .clip)
    #expect(search.search("chorus", kinds: [.locator]).first?.kind == .locator)
    #expect(search.search("example night master", kinds: [.audio]).first?.fileURL == render)
    #expect(search.search("example night", kinds: [.project]).first?.title == "Example Night Song")
    #expect(search.search("nothing matches").isEmpty)
  }

  @Test("Searches every tracked root and preserves root provenance")
  func searchesMultipleTrackedRoots() throws {
    let engineeringRoot = try TestSupport.temporaryDirectory()
    let downloadsRoot = try TestSupport.temporaryDirectory()
    defer {
      try? FileManager.default.removeItem(at: engineeringRoot)
      try? FileManager.default.removeItem(at: downloadsRoot)
    }

    let engineeringProject = engineeringRoot.appending(
      path: "Main Catalogue", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: engineeringProject.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true
    )
    try TestSupport.writeGzip(
      TestSupport.liveSetXML,
      to: engineeringProject.appending(path: "Catalogue Vocal.als")
    )

    let transferFolder = downloadsRoot.appending(
      path: "Client Transfer", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: transferFolder, withIntermediateDirectories: true)
    try TestSupport.writeGzip(
      TestSupport.liveSetXML,
      to: transferFolder.appending(path: "Downloaded Vocal.als")
    )
    let reference = transferFolder.appending(path: "Downloaded Reference.wav")
    try Data("audio".utf8).write(to: reference)

    let indexes = try [engineeringRoot, downloadsRoot].map {
      try StudioLibraryIndexer().index(rootURL: $0)
    }
    let search = StudioSearchIndex(indexes: indexes)

    let downloadedSet = try #require(search.search("downloaded vocal", kinds: [.set]).first)
    #expect(downloadedSet.rootURL == downloadsRoot.standardizedFileURL)
    #expect(downloadedSet.fileURL?.lastPathComponent == "Downloaded Vocal.als")

    let catalogueSet = try #require(search.search("catalogue vocal", kinds: [.set]).first)
    #expect(catalogueSet.rootURL == engineeringRoot.standardizedFileURL)

    let audio = try #require(search.search("downloaded reference", kinds: [.audio]).first)
    #expect(audio.rootURL == downloadsRoot.standardizedFileURL)
    #expect(audio.fileURL == reference)

    let overlappingSearch = StudioSearchIndex(indexes: [
      try StudioLibraryIndexer().index(rootURL: downloadsRoot),
      try StudioLibraryIndexer().index(rootURL: transferFolder),
    ])
    let overlappingHits = overlappingSearch.search("downloaded vocal", kinds: [.set])
    #expect(overlappingHits.count == 1)
    #expect(overlappingHits.first?.rootURL == transferFolder.standardizedFileURL)
  }

  private func work(id: String, song: String, artist: String) -> StudioWork {
    StudioWork(
      id: id,
      artist: ArtistIdentity(
        id: "artist-\(id)",
        displayName: artist,
        confidence: .automatic,
        evidence: []
      ),
      displayName: song,
      canonicalKey: song.lowercased(),
      confidence: .automatic,
      evidence: [],
      sessions: []
    )
  }
}
