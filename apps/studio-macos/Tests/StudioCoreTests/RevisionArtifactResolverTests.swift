import Foundation
import Testing

@testable import StudioCore

@Suite("Revision export artifacts")
struct RevisionArtifactResolverTests {
  @Test("Recognises a stems folder and associates its batch with the nearest prior revision")
  func linksStemBatch() {
    let project = URL(fileURLWithPath: "/Studio/Example Set Project")
    let revision = setRevision(
      id: "demo-set", name: "DEMO SET",
      url: project.appending(path: "DEMO SET.als"),
      modifiedAt: Date(timeIntervalSince1970: 1_000))
    let assets = ["Kick.wav", "Vocal.wav", "Bass.wav"].enumerated().map { offset, name in
      PreviewAsset(
        id: "stem-\(offset)", fileURL: project.appending(path: "Stems/\(name)"),
        category: .otherAudio, isLikelyUserRender: false, bytes: 1_024,
        modifiedAt: Date(timeIntervalSince1970: 1_060 + Double(offset)))
    }

    let result = RevisionArtifactResolver().resolve(assets: assets, revisions: [revision])

    #expect(result.count == 3)
    #expect(result.allSatisfy { $0.kind == .stem })
    #expect(result.allSatisfy { $0.revisionID == revision.id })
    #expect(result.allSatisfy { $0.confidence == .suggested })
  }

  @Test("Uses explicit revision-name evidence for a master")
  func linksNamedMaster() {
    let root = URL(fileURLWithPath: "/Studio/Example")
    let older = setRevision(
      id: "v2", name: "DEMO V2", url: root.appending(path: "DEMO V2.als"),
      modifiedAt: Date(timeIntervalSince1970: 1_000))
    let target = setRevision(
      id: "demo-set", name: "DEMO SET",
      url: root.appending(path: "DEMO SET.als"),
      modifiedAt: Date(timeIntervalSince1970: 900))
    let asset = PreviewAsset(
      id: "master", fileURL: root.appending(path: "Masters/DEMO SET MASTER.wav"),
      category: .otherAudio, isLikelyUserRender: true, bytes: 4_096,
      modifiedAt: Date(timeIntervalSince1970: 1_100))

    let result = RevisionArtifactResolver().resolve(assets: [asset], revisions: [older, target])

    #expect(result.first?.kind == .master)
    #expect(result.first?.revisionID == target.id)
    #expect(result.first?.confidence == .automatic)
  }

  @Test("Links a mixed bounce to the exactly named revision")
  func linksNamedMixedBounce() {
    let root = URL(fileURLWithPath: "/Studio/DEMOSET")
    let older = setRevision(
      id: "v2",
      name: "DEMO V2",
      url: root.appending(path: "DEMO V2 Project/DEMO V2.als"),
      modifiedAt: Date(timeIntervalSince1970: 900))
    let target = setRevision(
      id: "mixed-new-vocals",
      name: "DEMO V2.1 mixed_new_vocals",
      url: root.appending(path: "DEMO V2 Project/DEMO V2.1 mixed_new_vocals.als"),
      modifiedAt: Date(timeIntervalSince1970: 1_000))
    let asset = PreviewAsset(
      id: "mixed-bounce",
      fileURL: root.appending(path: "DEMO V2.1 mixed_new_vocals.wav"),
      category: .otherAudio,
      isLikelyUserRender: true,
      bytes: 4_096,
      modifiedAt: Date(timeIntervalSince1970: 1_100))

    let result = RevisionArtifactResolver().resolve(assets: [asset], revisions: [older, target])

    #expect(result.first?.kind == .mix)
    #expect(result.first?.revisionID == target.id)
    #expect(result.first?.confidence == .automatic)
  }

  @Test("Leaves unrelated recorded audio out of the export history")
  func ignoresRawRecording() {
    let revision = setRevision(
      id: "set", name: "Song", url: URL(fileURLWithPath: "/Studio/Song.als"),
      modifiedAt: Date(timeIntervalSince1970: 1_000))
    let recording = PreviewAsset(
      id: "take", fileURL: URL(fileURLWithPath: "/Studio/Samples/Recorded/Take.wav"),
      category: .recorded, isLikelyUserRender: false, bytes: 100,
      modifiedAt: Date(timeIntervalSince1970: 1_100))

    #expect(RevisionArtifactResolver().resolve(assets: [recording], revisions: [revision]).isEmpty)
  }

  private func setRevision(
    id: String, name: String, url: URL, modifiedAt: Date
  ) -> StudioSetRevision {
    StudioSetRevision(
      id: id,
      set: AbletonSet(
        id: "set-\(id)", fileURL: url, displayName: name, isBackup: false,
        modifiedAt: modifiedAt, compressedBytes: 1, xmlBytes: 1, creator: nil,
        format: AbletonFormat(
          majorVersion: nil, minorVersion: nil, schemaChangeCount: nil, revision: nil),
        structure: SetStructure(), content: AbletonSetContent()),
      revisionLabel: nil,
      timestamp: RevisionTimestamp(
        value: modifiedAt, source: .fileModificationTime, confidence: .automatic,
        explanation: "File modification time"))
  }
}
