import Foundation
import Testing
@testable import StudioCore

@Suite("Exact audio recovery resolution")
struct ExactAudioRecoveryResolverTests {
  @Test("Preselects only one available verified location")
  func uniqueVerifiedCandidate() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let missing = root.appending(path: "Project/Samples/Collected/Voice.wav")
    let library = root.appending(path: "Library/Voice.wav")
    try FileManager.default.createDirectory(
      at: missing.deletingLastPathComponent(), withIntermediateDirectories: true)
    try FileManager.default.createDirectory(
      at: library.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data("same-audio".utf8).write(to: missing)
    try Data("same-audio".utf8).write(to: library)
    let identity = AudioContentIdentityService()
    let store = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))
    _ = try store.register(
      identity.identify(missing, decodeAudio: false), provenance: .projectCollected,
      provenanceExplanation: "Fixture")
    _ = try store.register(
      identity.identify(library, decodeAudio: false), provenance: .externalLibrary,
      provenanceExplanation: "Fixture")
    try FileManager.default.removeItem(at: missing)

    let result = try ExactAudioRecoveryResolver(lineageStore: store).resolve(missingURL: missing)

    #expect(result.status == .uniqueVerifiedLocation)
    #expect(result.preselectedCandidate?.fileURL == library.standardizedFileURL)
  }

  @Test("Does not preselect when several verified locations are available")
  func ambiguousVerifiedCandidates() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let paths = ["Missing.wav", "A.wav", "B.wav"].map { root.appending(path: $0) }
    for path in paths { try Data("same-audio".utf8).write(to: path) }
    let identity = AudioContentIdentityService()
    let store = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))
    for path in paths {
      _ = try store.register(
        identity.identify(path, decodeAudio: false), provenance: .loose,
        provenanceExplanation: "Fixture")
    }
    try FileManager.default.removeItem(at: paths[0])

    let result = try ExactAudioRecoveryResolver(lineageStore: store).resolve(missingURL: paths[0])

    #expect(result.status == .multipleVerifiedLocations)
    #expect(result.candidates.count == 2)
    #expect(result.preselectedCandidate == nil)
  }

  @Test("Abstains when the missing path was never identified")
  func unknownMissingPath() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))

    let result = try ExactAudioRecoveryResolver(lineageStore: store)
      .resolve(missingURL: root.appending(path: "Unknown.wav"))

    #expect(result.status == .noIndexedIdentity)
    #expect(result.candidates.isEmpty)
  }
}
