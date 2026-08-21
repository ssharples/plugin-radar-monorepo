import Foundation
import Testing
@testable import StudioCore

@Suite("Ableton export retargeting")
struct AbletonExportRetargeterTests {
  @Test("Retargets every identity field and filename to the active indexed revision")
  func retargetsToActiveRevision() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let oldSet = root.appending(path: "DEMO V2.als")
    let activeSet = root.appending(path: "DEMO SET.als")
    try Data("old".utf8).write(to: oldSet)
    try Data("active".utf8).write(to: activeSet)
    let destination = root.appending(path: "Exports", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
    let installation = AbletonLiveInstallation(
      id: "live", applicationURL: URL(fileURLWithPath: "/Applications/Live.app"),
      displayName: "Live", bundleIdentifier: "com.ableton.live", version: "12.4.2",
      majorVersion: 12)
    let plan = AbletonExportPlan(
      setID: "old-set", revisionID: "old-revision", workID: "work", workName: "Example",
      setURL: oldSet, installation: installation,
      source: .allIndividualTracks(expectedTrackCount: nil),
      arrangementRange: AbletonArrangementRange(startBeat: 0, endBeat: 64),
      pcmFormat: .wav, sampleRate: .hz48000, bitDepth: .int24, normalize: false,
      includeReturnAndMainEffects: true,
      destination: AbletonExportDestination(
        directoryURL: destination, baseName: "DEMO V2 Stems"))

    let retargeted = try AbletonExportRetargeter().retarget(
      plan,
      to: AbletonExportTarget(
        setID: "active-set", revisionID: "active-revision", workID: "work",
        workName: "Example", setURL: activeSet, setDisplayName: "DEMO SET",
        arrangementRange: AbletonArrangementRange(startBeat: 8, endBeat: 96)))

    #expect(retargeted.setID == "active-set")
    #expect(retargeted.revisionID == "active-revision")
    #expect(retargeted.setURL == activeSet.standardizedFileURL)
    #expect(retargeted.arrangementRange == AbletonArrangementRange(startBeat: 8, endBeat: 96))
    #expect(retargeted.destination.baseName == "DEMO SET Stems")
    #expect(retargeted.source == plan.source)
    #expect(retargeted.overwritePolicy == .never)
  }
}
