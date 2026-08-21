import Foundation
import Testing

@testable import StudioCore

@Suite("Preview resolver")
struct PreviewResolverTests {
  @Test("Prefers a likely existing user render")
  func prefersExistingRender() throws {
    let fixture = try makeSetFixture(resolveAudio: true)
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let renderURL = fixture.project.appending(path: "Song final mix.wav")
    try Data([0, 1]).write(to: renderURL)
    let asset = PreviewAsset(
      id: "render",
      fileURL: renderURL,
      category: .otherAudio,
      isLikelyUserRender: true,
      bytes: 2,
      modifiedAt: fixture.set.modifiedAt
    )
    let project = makeProject(set: fixture.set, assets: [asset], root: fixture.project)

    let decision = PreviewResolver().resolve(set: fixture.set, project: project)

    #expect(decision.sourceKind == .userRender)
    #expect(decision.fidelity == .existingArtifact)
    #expect(decision.asset?.id == asset.id)
    #expect(decision.dryPlan == nil)
  }

  @Test("Builds a truthfully partial dry plan from resolvable Arrangement audio")
  func buildsPartialDryPlan() throws {
    let fixture = try makeSetFixture(resolveAudio: true)
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let project = makeProject(set: fixture.set, assets: [], root: fixture.project)

    let decision = PreviewResolver().resolve(set: fixture.set, project: project)

    #expect(decision.sourceKind == .dryReconstruction)
    #expect(decision.fidelity == .approximate)
    #expect(decision.dryPlan?.segments.count == 1)
    #expect(decision.dryPlan?.coverage.coverage == .partial)
    #expect(decision.label.contains("Approximate"))
  }

  @Test("Refuses to invent a preview when media is unavailable")
  func reportsUnavailablePreview() throws {
    let fixture = try makeSetFixture(resolveAudio: false)
    defer { try? FileManager.default.removeItem(at: fixture.root) }
    let project = makeProject(set: fixture.set, assets: [], root: fixture.project)

    let decision = PreviewResolver().resolve(set: fixture.set, project: project)

    #expect(decision.sourceKind == .none)
    #expect(decision.fidelity == .unavailable)
    #expect(decision.dryPlan == nil)
  }

  private func makeSetFixture(resolveAudio: Bool) throws -> PreviewFixture {
    let root = try TestSupport.temporaryDirectory()
    let project = root.appending(path: "Project", directoryHint: .isDirectory)
    let setURL = project.appending(path: "Song.als")
    try FileManager.default.createDirectory(at: project, withIntermediateDirectories: true)
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: setURL)
    if resolveAudio {
      let audioURL = project.appending(path: "Samples/Recorded/verse.wav")
      try FileManager.default.createDirectory(
        at: audioURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      try Data([0, 1]).write(to: audioURL)
    }
    let parsed = try AbletonSetParser().parse(fileURL: setURL)
    let rawSet = AbletonSet(
      id: "set",
      fileURL: setURL,
      displayName: "Song",
      isBackup: false,
      modifiedAt: Date(),
      compressedBytes: 0,
      xmlBytes: parsed.xmlBytes,
      creator: parsed.creator,
      format: parsed.format,
      structure: parsed.structure,
      content: parsed.content
    )
    let set = rawSet.resolvingDependencies(projectRoot: project, fileManager: .default)
    return PreviewFixture(root: root, project: project, set: set)
  }

  private func makeProject(set: AbletonSet, assets: [PreviewAsset], root: URL) -> StudioProject {
    StudioProject(
      id: "project",
      rootURL: root,
      displayName: "Project",
      timelines: [SetTimeline(id: "timeline", displayName: "Song", versions: [set])],
      previewAssets: assets
    )
  }
}

private struct PreviewFixture {
  let root: URL
  let project: URL
  let set: AbletonSet
}
