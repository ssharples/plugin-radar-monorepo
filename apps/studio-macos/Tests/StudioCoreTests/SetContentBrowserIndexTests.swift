import Foundation
import Testing

@testable import StudioCore

@Suite("Set content browser index")
struct SetContentBrowserIndexTests {
  @Test("Groups repeated uses by canonical source and deduplicates project audio")
  func groupsRepeatedUses() {
    let source = URL(fileURLWithPath: "/Library/Kick.wav")
    let clips = [clip("clip-1", name: "Kick one"), clip("clip-2", name: "Kick two")]
    let dependency = MediaDependency(
      id: "audio-1", kind: .clipAudio,
      reference: MediaReference(absolutePath: source.path, relativePath: nil),
      resolvedURL: source, availability: .available, ownerID: "clip-1")
    let secondDependency = MediaDependency(
      id: "audio-2", kind: .clipAudio,
      reference: MediaReference(absolutePath: source.path, relativePath: nil),
      resolvedURL: source, availability: .available, ownerID: "clip-2")
    let asset = PreviewAsset(
      id: "asset-1", fileURL: source, category: .recorded, isLikelyUserRender: false,
      bytes: 10, modifiedAt: nil)
    let duplicateAsset = PreviewAsset(
      id: "asset-2", fileURL: URL(fileURLWithPath: "/Library/./Kick.wav"), category: .crop,
      isLikelyUserRender: false, bytes: 10, modifiedAt: nil)

    let index = SetContentBrowserIndex(
      content: AbletonSetContent(
        tracks: [track("track", clips: clips)],
        dependencies: [dependency, secondDependency]),
      projectAudio: [asset, duplicateAsset])

    #expect(index.tracks.count == 1)
    #expect(index.tracks[0].audio.count == 1)
    #expect(index.tracks[0].audio[0].clips.map(\.id) == ["clip-1", "clip-2"])
    #expect(index.tracks[0].audio[0].indexedAsset?.id == "asset-1")
    #expect(index.projectAudio.count == 1)
  }

  @Test("Keeps same filenames in different folders as separate audio items")
  func keepsDistinctFolders() {
    let first = URL(fileURLWithPath: "/A/voice.wav")
    let second = URL(fileURLWithPath: "/B/voice.wav")
    let content = AbletonSetContent(
      tracks: [track("track", clips: [clip("one"), clip("two")])],
      dependencies: [
        dependency("d1", owner: "one", url: first), dependency("d2", owner: "two", url: second),
      ])

    let audio = SetContentBrowserIndex(content: content).tracks[0].audio
    #expect(audio.count == 2)
    #expect(Set(audio.map(\.filename)) == ["voice.wav"])
    #expect(
      Set(audio.map { $0.dependency.resolvedURL?.standardizedFileURL.path }) == [
        first.path, second.path,
      ])
  }

  @Test("Maps nested device resources and preserves unresolved media")
  func mapsResourcesAndUnresolvedMedia() {
    let nested = device("nested")
    let root = device("root", nested: [nested])
    let missingOne = MediaDependency(
      id: "missing-1", kind: .clipAudio,
      reference: MediaReference(absolutePath: nil, relativePath: "Samples/missing.wav"),
      resolvedURL: nil, availability: .missing, ownerID: "clip-1")
    let missingTwo = MediaDependency(
      id: "missing-2", kind: .clipAudio,
      reference: MediaReference(absolutePath: nil, relativePath: "Samples/missing.wav"),
      resolvedURL: nil, availability: .unresolved, ownerID: "clip-2")
    let resource = MediaDependency(
      id: "resource", kind: .deviceResource,
      reference: MediaReference(absolutePath: "/Library/IR.wav", relativePath: nil),
      resolvedURL: URL(fileURLWithPath: "/Library/IR.wav"), availability: .available,
      ownerID: "nested")
    let content = AbletonSetContent(
      tracks: [track("track", devices: [root], clips: [clip("clip-1"), clip("clip-2")])],
      dependencies: [missingOne, missingTwo, resource])

    let result = SetContentBrowserIndex(content: content).tracks[0]
    #expect(result.deviceResources.map(\.id) == ["resource"])
    #expect(result.audio.count == 2)
    #expect(result.audio.allSatisfy { $0.indexedAsset == nil })
    #expect(Set(result.audio.map(\.sourceLabel)) == ["Missing", "Unresolved"])
  }

  @Test("Calculates bounded depth when group parents are missing or cyclic")
  func safeGroupDepth() {
    let cycleA = track("a", xmlID: "a", parent: "b")
    let cycleB = track("b", xmlID: "b", parent: "a")
    let missing = track("missing", parent: "does-not-exist")
    let result = SetContentBrowserIndex(
      content: AbletonSetContent(tracks: [cycleA, cycleB, missing]))

    #expect(result.tracks.map(\.depth).allSatisfy { $0 >= 0 && $0 <= 3 })
    #expect(result.tracks[2].depth == 0)
  }

  private func clip(_ id: String, name: String? = nil) -> SetClip {
    SetClip(
      id: id, xmlID: nil, kind: .audio, placement: .arrangement, name: name ?? id,
      startBeat: nil, endBeat: nil, loopStartBeat: nil, loopEndBeat: nil, loopEnabled: nil,
      isWarped: nil, warpMode: nil, warpMarkerCount: 0, midiNoteCount: 0, sampleReference: nil)
  }

  private func track(
    _ id: String,
    xmlID: String? = nil,
    parent: String? = nil,
    devices: [SetDevice] = [],
    clips: [SetClip] = []
  ) -> SetTrack {
    SetTrack(
      id: id, xmlID: xmlID, kind: .audio, name: id, colorIndex: nil,
      groupTrackXMLID: parent, isFolded: nil, mixer: TrackMixerState(), devices: devices,
      clips: clips)
  }

  private func device(_ id: String, nested: [SetDevice] = []) -> SetDevice {
    SetDevice(
      id: id, xmlID: nil, kind: .native, typeName: "Device", displayName: id,
      isEnabled: true, plugin: nil, stateDigest: id, nestedDevices: nested, resourceReferences: [])
  }

  private func dependency(_ id: String, owner: String, url: URL) -> MediaDependency {
    MediaDependency(
      id: id, kind: .clipAudio,
      reference: MediaReference(absolutePath: url.path, relativePath: nil),
      resolvedURL: url, availability: .available, ownerID: owner)
  }
}
