import Foundation
import Testing

@testable import StudioCore

@Suite("Media dependency resolver")
struct MediaDependencyResolverTests {
  @Test("Resolves project-relative media and distinguishes missing dependencies")
  func resolvesRelativeMedia() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let project = root.appending(path: "Project", directoryHint: .isDirectory)
    let setURL = project.appending(path: "Song.als")
    let audioURL = project.appending(path: "Samples/Recorded/verse.wav")
    try FileManager.default.createDirectory(
      at: audioURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try Data([0, 1]).write(to: audioURL)

    let dependencies = [
      dependency(id: "available", relativePath: "Samples/Recorded/verse.wav"),
      dependency(id: "missing", relativePath: "Samples/Recorded/missing.wav"),
      dependency(id: "unresolved", relativePath: nil),
    ]
    let content = AbletonSetContent(dependencies: dependencies)

    let resolved = MediaDependencyResolver().resolve(
      content: content,
      setURL: setURL,
      projectRoot: project
    )

    #expect(resolved.dependencies[0].availability == .available)
    #expect(resolved.dependencies[0].resolvedURL == audioURL)
    #expect(resolved.dependencies[1].availability == .missing)
    #expect(resolved.dependencies[2].availability == .unresolved)
  }

  @Test("Recognizes references on a disconnected volume")
  func recognizesDisconnectedVolume() {
    let dependency = MediaDependency(
      id: "external",
      kind: .clipAudio,
      reference: MediaReference(
        absolutePath: "/Volumes/Fixture Studio-Time-Machine-Definitely-Missing/Audio.wav",
        relativePath: nil
      ),
      resolvedURL: nil,
      availability: .unresolved,
      ownerID: "clip"
    )

    let resolved = MediaDependencyResolver().resolve(
      content: AbletonSetContent(dependencies: [dependency]),
      setURL: URL(fileURLWithPath: "/Project/Song.als"),
      projectRoot: URL(fileURLWithPath: "/Project")
    )

    #expect(resolved.dependencies[0].availability == .disconnected)
  }

  private func dependency(id: String, relativePath: String?) -> MediaDependency {
    MediaDependency(
      id: id,
      kind: .clipAudio,
      reference: MediaReference(absolutePath: nil, relativePath: relativePath),
      resolvedURL: nil,
      availability: .unresolved,
      ownerID: "clip"
    )
  }
}
