import Foundation
import Testing

@testable import StudioCore

@Suite("Ableton Set parser")
struct AbletonSetParserTests {
  @Test("Reads gzip XML and extracts format and structural metadata")
  func parsesSetMetadata() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let setURL = directory.appending(path: "Example.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: setURL)

    let result = try AbletonSetParser().parse(fileURL: setURL)

    #expect(result.creator == "Ableton Live 12.1")
    #expect(result.format.majorVersion == "5")
    #expect(result.format.minorVersion == "12.0_12000")
    #expect(result.format.schemaChangeCount == 3)
    #expect(result.structure.audioTrackCount == 2)
    #expect(result.structure.midiTrackCount == 1)
    #expect(result.structure.groupTrackCount == 1)
    #expect(result.structure.returnTrackCount == 1)
    #expect(result.structure.thirdPartyDeviceCount == 1)
    #expect(result.structure.maxForLiveDeviceCount == 1)
    #expect(result.structure.rackDeviceCount == 1)
    #expect(result.structure.warpMarkerCount == 2)
    #expect(result.structure.automationEnvelopeCount == 1)
    #expect(result.content.tempo == 128)
    #expect(
      result.content.locators == [
        SetLocator(id: result.content.locators[0].id, name: "Chorus", beatTime: 16)
      ])
    #expect(result.content.tracks.count == 6)
    let lead = try #require(result.content.tracks.first(where: { $0.name == "Lead Vocal" }))
    #expect(lead.kind == .audio)
    #expect(lead.colorIndex == 7)
    #expect(lead.mixer.volume == 0.75)
    #expect(lead.mixer.pan == -0.1)
    #expect(lead.mixer.isArmed == true)
    #expect(lead.devices.count == 1)
    #expect(lead.devices[0].kind == .vst3)
    #expect(lead.devices[0].plugin?.name == "Example EQ")
    #expect(lead.devices[0].plugin?.manufacturer == "Example Audio")
    #expect(lead.clips.count == 1)
    #expect(lead.clips[0].placement == .arrangement)
    #expect(lead.clips[0].warpMarkerCount == 2)
    #expect(lead.clips[0].sampleReference?.relativePath == "Samples/Recorded/verse.wav")
    let midi = try #require(result.content.tracks.first(where: { $0.kind == .midi }))
    #expect(midi.clips.first?.midiNoteCount == 1)
    #expect(midi.devices.first?.kind == .maxForLive)
    #expect(result.content.dependencies.count == 1)
  }

  @Test("Rejects files that exceed the expanded safety limit")
  func enforcesExpandedSizeLimit() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let setURL = directory.appending(path: "Large.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: setURL)

    #expect(throws: AbletonSetParserError.self) {
      _ = try AbletonSetParser(expandedSizeLimit: 32).parse(fileURL: setURL)
    }
  }

  @Test("Maps a parsed Set into the interchange without changing parser output")
  func parsesInterchange() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let setURL = directory.appending(path: "Example.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: setURL)

    let interchange = try AbletonSetParser().parseInterchange(fileURL: setURL)

    #expect(interchange.version == .current)
    #expect(interchange.identity.daw.value == .abletonLive)
    #expect(interchange.identity.displayName.provenance == .derived)
    #expect(interchange.identity.displayName.value == "Example")
    #expect(interchange.timeline.tempo.value == 128)
    #expect(interchange.tracks.value?.count == 6)
    #expect(interchange.mediaDependencies.value?.count == 1)
    #expect(interchange.mediaDependencies.value?.first?.availability == .parsed(.unresolved))
    #expect(interchange.evidenceSummary.xmlBytes.provenance == .parsed)
  }
}
