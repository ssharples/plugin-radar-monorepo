import Foundation
import Testing

@testable import StudioCore

@Suite("Semantic Set version diff")
struct SetVersionDiffTests {
  @Test("Explains tempo, track, device, clip, and dependency changes")
  func explainsStructuralChanges() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let olderURL = directory.appending(path: "Older.als")
    let newerURL = directory.appending(path: "Newer.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: olderURL)
    let newerXML = TestSupport.liveSetXML
      .replacingOccurrences(of: "Value=\"128\"", with: "Value=\"130\"")
      .replacingOccurrences(of: "Value=\"Lead Vocal\"", with: "Value=\"Lead Vocal Final\"")
      .replacingOccurrences(of: "opaque-state", with: "changed-state")
      .replacingOccurrences(of: "CurrentEnd Value=\"12\"", with: "CurrentEnd Value=\"16\"")
      .replacingOccurrences(of: "Samples/Recorded/verse.wav", with: "Samples/Recorded/final.wav")
      .replacingOccurrences(
        of: "</Tracks>",
        with:
          "<AudioTrack Id=\"6\"><Name><EffectiveName Value=\"Print\" /></Name></AudioTrack></Tracks>"
      )
    try TestSupport.writeGzip(newerXML, to: newerURL)

    let parser = AbletonSetParser()
    let older = makeSet(id: "older", url: olderURL, parsed: try parser.parse(fileURL: olderURL))
    let newer = makeSet(id: "newer", url: newerURL, parsed: try parser.parse(fileURL: newerURL))
    let result = SetVersionDiffer().diff(older: older, newer: newer)

    #expect(result.tempoChange == ValueChange(before: 128, after: 130))
    #expect(result.trackChanges.contains(where: { $0.kind == .added && $0.afterName == "Print" }))
    let vocal = try #require(
      result.trackChanges.first(where: { $0.afterName == "Lead Vocal Final" })
    )
    #expect(vocal.kind == .modified)
    #expect(vocal.deviceChanges.first?.stateChanged == true)
    #expect(vocal.clipChanges.first?.timingChanged == true)
    #expect(result.dependencyChanges.count == 2)
    #expect(result.hasChanges)
  }

  @Test("Returns an empty diff for identical semantic content")
  func identicalContentHasNoChanges() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appending(path: "Set.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: url)
    let parsed = try AbletonSetParser().parse(fileURL: url)
    let older = makeSet(id: "older", url: url, parsed: parsed)
    let newer = makeSet(id: "newer", url: url, parsed: parsed)

    let result = SetVersionDiffer().diff(older: older, newer: newer)

    #expect(!result.hasChanges)
  }

  private func makeSet(id: String, url: URL, parsed: ParsedAbletonSet) -> AbletonSet {
    AbletonSet(
      id: id,
      fileURL: url,
      displayName: id,
      isBackup: false,
      modifiedAt: nil,
      compressedBytes: 0,
      xmlBytes: parsed.xmlBytes,
      creator: parsed.creator,
      format: parsed.format,
      structure: parsed.structure,
      content: parsed.content
    )
  }
}
