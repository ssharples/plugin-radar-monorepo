import Foundation
import Testing

@testable import StudioCore

@Suite("Audio recovery")
struct AudioRecoveryServiceTests {
  @Test("Plans verified copies without overwriting colliding filenames")
  func recoversAvailableAudio() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let first = root.appending(path: "Old/A/voice.wav")
    let second = root.appending(path: "Old/B/voice.wav")
    let destination = root.appending(path: "New Project", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(
      at: first.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try FileManager.default.createDirectory(
      at: second.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try Data("first audio".utf8).write(to: first)
    try Data("second audio".utf8).write(to: second)
    let service = AudioRecoveryService()

    let plan = try service.plan(
      dependencies: [dependency(id: "one", url: first), dependency(id: "two", url: second)],
      destinationProjectURL: destination
    )

    #expect(plan.items.count == 2)
    #expect(Set(plan.items.map(\.destinationURL.lastPathComponent)).count == 2)
    #expect(plan.items.allSatisfy { !$0.destinationURL.path.hasPrefix(first.path) })
    let recovered = try service.execute(plan)
    #expect(recovered.count == 2)
    #expect(
      try Set(recovered.map { try Data(contentsOf: $0) })
        == Set([Data("first audio".utf8), Data("second audio".utf8)]))
  }

  @Test("Refuses a destination that appears after planning")
  func refusesOverwrite() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let source = root.appending(path: "source.wav")
    try Data("audio".utf8).write(to: source)
    let service = AudioRecoveryService()
    let plan = try service.plan(
      dependencies: [dependency(id: "audio", url: source)],
      destinationProjectURL: root.appending(path: "Destination")
    )
    let target = try #require(plan.items.first?.destinationURL)
    try FileManager.default.createDirectory(
      at: target.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try Data("keep me".utf8).write(to: target)

    #expect(throws: AudioRecoveryError.self) {
      try service.execute(plan)
    }
    #expect(try String(contentsOf: target, encoding: .utf8) == "keep me")
  }

  private func dependency(id: String, url: URL) -> MediaDependency {
    MediaDependency(
      id: id,
      kind: .clipAudio,
      reference: MediaReference(absolutePath: url.path, relativePath: nil),
      resolvedURL: url,
      availability: .available,
      ownerID: "clip"
    )
  }
}
