import Foundation
import Testing

@testable import StudioCore

@Suite("Personal chain intelligence")
struct ChainIntelligenceTests {
  @Test("Groups matching chains while preserving state variations and provenance")
  func groupsMatchingChains() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let projectA = directory.appending(path: "Project A", directoryHint: .isDirectory)
    let projectB = directory.appending(path: "Project B", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: projectA, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: projectB, withIntermediateDirectories: true)

    let firstURL = projectA.appending(path: "Mix.als")
    let secondURL = projectB.appending(path: "Mix.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: firstURL)
    try TestSupport.writeGzip(
      TestSupport.liveSetXML.replacingOccurrences(of: "opaque-state", with: "alternate-state"),
      to: secondURL
    )

    let parser = AbletonSetParser()
    let first = makeSet(id: "first", url: firstURL, parsed: try parser.parse(fileURL: firstURL))
    let second = makeSet(id: "second", url: secondURL, parsed: try parser.parse(fileURL: secondURL))
    let index = StudioLibraryIndex(
      rootURL: directory,
      scannedAt: .now,
      projects: [
        makeProject(id: "project-a", url: projectA, set: first),
        makeProject(id: "project-b", url: projectB, set: second),
      ],
      unassignedAudioAssets: [],
      issues: []
    )

    let library = ChainIntelligenceBuilder().build(index: index)

    let vocalFamily = try #require(
      library.families.first(where: { $0.displayName.contains("Example EQ") })
    )
    #expect(vocalFamily.occurrences.count == 2)
    #expect(vocalFamily.projectCount == 2)
    #expect(vocalFamily.stateVariationCount == 2)
    #expect(vocalFamily.occurrences.allSatisfy { $0.recoveryCapability == .inspectOnly })
    #expect(library.search("Lead Vocal").count == 2)

    let usage = try #require(
      library.pluginUsage.first(where: { $0.plugin.name == "Example EQ" })
    )
    #expect(usage.occurrenceCount == 2)
    #expect(usage.projectCount == 2)
  }

  private func makeProject(id: String, url: URL, set: AbletonSet) -> StudioProject {
    StudioProject(
      id: id,
      rootURL: url,
      displayName: url.lastPathComponent,
      timelines: [SetTimeline(id: "timeline-\(id)", displayName: "Mix", versions: [set])],
      previewAssets: []
    )
  }

  private func makeSet(id: String, url: URL, parsed: ParsedAbletonSet) -> AbletonSet {
    AbletonSet(
      id: id,
      fileURL: url,
      displayName: "Mix",
      isBackup: false,
      modifiedAt: .now,
      compressedBytes: 0,
      xmlBytes: parsed.xmlBytes,
      creator: parsed.creator,
      format: parsed.format,
      structure: parsed.structure,
      content: parsed.content
    )
  }
}
