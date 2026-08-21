import Foundation
import Testing

@testable import StudioCore

@Suite("Studio library indexer")
struct StudioLibraryIndexerTests {
  @Test("Discovers projects, groups backups, and classifies preview assets")
  func indexesProjectTimeline() throws {
    let library = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: library) }

    let project = library.appending(path: "Song", directoryHint: .isDirectory)
    let projectInfo = project.appending(path: "Ableton Project Info", directoryHint: .isDirectory)
    let backups = project.appending(path: "Backup", directoryHint: .isDirectory)
    let recorded = project.appending(path: "Samples/Recorded", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: projectInfo, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: backups, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: recorded, withIntermediateDirectories: true)

    try TestSupport.writeGzip(TestSupport.liveSetXML, to: project.appending(path: "Song.als"))
    try TestSupport.writeGzip(
      TestSupport.liveSetXML,
      to: backups.appending(path: "Song [2020-08-01 120000].als")
    )
    try Data([0, 1, 2]).write(to: project.appending(path: "Song mix.wav"))
    try Data([3, 4]).write(to: recorded.appending(path: "Audio 1.wav"))
    try Data([5]).write(to: library.appending(path: "Loose bounce.wav"))

    let result = try StudioLibraryIndexer().index(rootURL: library)

    #expect(result.projects.count == 1)
    let indexedProject = try #require(result.projects.first)
    #expect(indexedProject.timelines.count == 1)
    let timeline = try #require(indexedProject.timelines.first)
    #expect(timeline.versions.count == 2)
    #expect(timeline.versions.count(where: \.isBackup) == 1)
    #expect(indexedProject.previewAssets.count == 2)
    #expect(indexedProject.previewAssets[0].category == .otherAudio)
    #expect(indexedProject.previewAssets[0].isLikelyUserRender)
    #expect(indexedProject.previewAssets[1].category == .recorded)
    #expect(!indexedProject.previewAssets[1].isLikelyUserRender)
    #expect(result.unassignedAudioAssets.count == 1)
    #expect(result.unassignedAudioAssets[0].isLikelyUserRender)
    #expect(result.issues.isEmpty)
  }

  @Test("Records malformed Sets without aborting the project scan")
  func isolatesSetParseFailures() throws {
    let library = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: library) }

    let project = library.appending(path: "Song", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true
    )
    try Data("not gzip".utf8).write(to: project.appending(path: "Broken.als"))

    let result = try StudioLibraryIndexer().index(rootURL: library)

    #expect(result.projects.count == 1)
    #expect(result.projects[0].sets.isEmpty)
    #expect(result.issues.count == 1)
  }

  @Test("Indexes loose Sets and nearby audio in arbitrary tracked folders")
  func indexesLooseSetsWithoutProjectInfo() throws {
    let library = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: library) }

    let downloadsFolder = library.appending(path: "Downloaded Session", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: downloadsFolder, withIntermediateDirectories: true)
    try TestSupport.writeGzip(
      TestSupport.liveSetXML,
      to: downloadsFolder.appending(path: "Idea from collaborator.als")
    )
    try Data([0, 1, 2]).write(to: downloadsFolder.appending(path: "Reference bounce.wav"))
    try Data([3, 4]).write(to: library.appending(path: "Unrelated voice memo.m4a"))

    let result = try StudioLibraryIndexer().index(rootURL: library)

    #expect(result.projects.count == 1)
    let indexedProject = try #require(result.projects.first)
    #expect(indexedProject.rootURL == downloadsFolder.standardizedFileURL)
    #expect(indexedProject.displayName == "Downloaded Session")
    #expect(indexedProject.sets.map(\.displayName) == ["Idea from collaborator"])
    #expect(
      indexedProject.previewAssets.map(\.fileURL.lastPathComponent) == ["Reference bounce.wav"])
    #expect(
      result.unassignedAudioAssets.map(\.fileURL.lastPathComponent) == [
        "Unrelated voice memo.m4a"
      ])
  }

  @Test("Associates an unambiguous sibling Stems folder with its nested Ableton Project")
  func associatesSiblingStemExports() throws {
    let library = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: library) }
    let sessionEnvelope = library.appending(path: "DEMOSET", directoryHint: .isDirectory)
    let project = sessionEnvelope.appending(path: "DEMO Project", directoryHint: .isDirectory)
    let stems = sessionEnvelope.appending(path: "Stems", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: stems, withIntermediateDirectories: true)
    try TestSupport.writeGzip(
      TestSupport.liveSetXML, to: project.appending(path: "DEMO SET.als"))
    try Data([1, 2, 3]).write(to: stems.appending(path: "_ BEAT.wav"))
    try Data([4, 5, 6]).write(to: stems.appending(path: "_ Leads.wav"))
    try Data([7]).write(to: sessionEnvelope.appending(path: "voice memo.wav"))

    let result = try StudioLibraryIndexer().index(rootURL: library)

    let indexedProject = try #require(result.projects.first)
    #expect(indexedProject.rootURL == project.standardizedFileURL)
    #expect(
      Set(indexedProject.previewAssets.map(\.fileURL.lastPathComponent)) == [
        "_ BEAT.wav", "_ Leads.wav",
      ])
    #expect(result.unassignedAudioAssets.map(\.fileURL.lastPathComponent) == ["voice memo.wav"])
  }

  @Test("Associates a root-level mixed bounce with the only Project in its Session envelope")
  func associatesRootLevelMixedBounce() throws {
    let library = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: library) }
    let project = library.appending(
      path: "Final/DEMO V2 Project", directoryHint: .isDirectory)
    let delivery = library.appending(path: "DEMOSET", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
      withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: delivery, withIntermediateDirectories: true)
    try TestSupport.writeGzip(
      TestSupport.liveSetXML,
      to: project.appending(path: "DEMO V2.1 mixed_new_vocals.als"))
    let bounce = delivery.appending(path: "DEMO V2.1 mixed_new_vocals.wav")
    try Data([1, 2, 3]).write(to: bounce)

    let result = try StudioLibraryIndexer().index(rootURL: library)

    let indexedProject = try #require(result.projects.first)
    let asset = try #require(indexedProject.previewAssets.first)
    #expect(asset.fileURL == bounce.standardizedFileURL)
    #expect(asset.isLikelyUserRender)
    #expect(result.unassignedAudioAssets.isEmpty)
  }

  @Test("Does not guess a Project for a root-level mixed bounce in an ambiguous envelope")
  func leavesAmbiguousRootLevelMixedBounceUnassigned() throws {
    let library = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: library) }
    let envelope = library.appending(path: "Shared Session", directoryHint: .isDirectory)
    for name in ["Song A Project", "Song B Project"] {
      let project = envelope.appending(path: name, directoryHint: .isDirectory)
      try FileManager.default.createDirectory(
        at: project.appending(path: "Ableton Project Info", directoryHint: .isDirectory),
        withIntermediateDirectories: true)
      try TestSupport.writeGzip(
        TestSupport.liveSetXML,
        to: project.appending(path: "Song mixed.als"))
    }
    let bounce = envelope.appending(path: "Song mixed.wav")
    try Data([1, 2, 3]).write(to: bounce)

    let result = try StudioLibraryIndexer().index(rootURL: library)

    #expect(result.projects.allSatisfy { $0.previewAssets.isEmpty })
    #expect(result.unassignedAudioAssets.map(\.fileURL) == [bounce.standardizedFileURL])
  }
}
