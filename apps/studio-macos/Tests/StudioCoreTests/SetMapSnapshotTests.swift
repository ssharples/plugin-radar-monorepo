import Foundation
import Testing

@testable import StudioCore

@Suite("Reconstructed Set maps")
struct SetMapSnapshotTests {
  @Test("Builds a full-song Arrangement map from saved Set evidence")
  func buildsArrangementMap() throws {
    let setURL = URL(fileURLWithPath: "/Studio/Song Project/Song.als")
    let availableReference = MediaReference(
      absolutePath: "/Samples/kick.wav",
      relativePath: "Samples/Imported/kick.wav"
    )
    let missingReference = MediaReference(
      absolutePath: "/Missing/vocal.wav",
      relativePath: "Samples/Imported/vocal.wav"
    )
    let group = track(
      id: "group",
      xmlID: "10",
      kind: .group,
      name: "DRUMS",
      colorIndex: 4,
      groupTrackXMLID: nil,
      devices: 0,
      clips: []
    )
    let drums = track(
      id: "drums",
      xmlID: "11",
      kind: .audio,
      name: "Kick",
      colorIndex: 4,
      groupTrackXMLID: "10",
      devices: 2,
      clips: [
        clip(
          id: "arrangement-kick",
          kind: .audio,
          placement: .arrangement,
          name: "Kick loop",
          start: 8,
          end: 24,
          reference: availableReference
        ),
        clip(
          id: "session-kick",
          kind: .audio,
          placement: .session,
          name: "Session idea",
          start: nil,
          end: nil,
          reference: availableReference
        ),
      ]
    )
    let vocal = track(
      id: "vocal",
      xmlID: "20",
      kind: .audio,
      name: "Lead Vocal",
      colorIndex: 12,
      groupTrackXMLID: nil,
      devices: 1,
      clips: [
        clip(
          id: "arrangement-vocal",
          kind: .audio,
          placement: .arrangement,
          name: "Verse",
          start: 32,
          end: 48,
          reference: missingReference
        ),
        clip(
          id: "take-vocal",
          kind: .audio,
          placement: .takeLane,
          name: "Comp source",
          start: 32,
          end: 40,
          reference: missingReference
        ),
      ]
    )
    let set = AbletonSet(
      id: "set-1",
      fileURL: setURL,
      displayName: "Song",
      isBackup: false,
      modifiedAt: Date(timeIntervalSince1970: 100),
      compressedBytes: 1_024,
      xmlBytes: 4_096,
      creator: "Ableton Live 12",
      format: AbletonFormat(
        majorVersion: "5",
        minorVersion: "12.0",
        schemaChangeCount: 1,
        revision: "abc"
      ),
      structure: SetStructure(),
      content: AbletonSetContent(
        tempo: 128,
        timeSignature: SetTimeSignature(numerator: 4, denominator: 4),
        locators: [
          SetLocator(id: "intro", name: "INTRO", beatTime: 0),
          SetLocator(id: "verse", name: "VERSE", beatTime: 32),
          SetLocator(id: "outro", name: "OUTRO", beatTime: 64),
        ],
        tracks: [group, drums, vocal],
        dependencies: [
          MediaDependency(
            id: "dep-kick",
            kind: .clipAudio,
            reference: availableReference,
            resolvedURL: URL(fileURLWithPath: "/Samples/kick.wav"),
            availability: .available,
            ownerID: "arrangement-kick"
          ),
          MediaDependency(
            id: "dep-vocal",
            kind: .clipAudio,
            reference: missingReference,
            resolvedURL: nil,
            availability: .missing,
            ownerID: "arrangement-vocal"
          ),
        ]
      )
    )

    let snapshot = SetMapBuilder().build(
      set: set,
      generatedAt: Date(timeIntervalSince1970: 200)
    )

    #expect(snapshot.setID == "set-1")
    #expect(snapshot.provenance == .reconstructed)
    #expect(snapshot.completeness == .completeArrangement)
    #expect(snapshot.startBeat == 0)
    #expect(snapshot.endBeat == 64)
    #expect(snapshot.lanes.count == 3)
    #expect(snapshot.lanes[1].groupDepth == 1)
    #expect(snapshot.lanes[1].deviceCount == 2)
    #expect(snapshot.lanes.flatMap(\.clips).count == 2)
    #expect(snapshot.sessionClipCount == 1)
    #expect(snapshot.takeLaneClipCount == 1)
    #expect(snapshot.missingMediaClipCount == 1)
    #expect(snapshot.lanes[2].clips[0].mediaAvailability == .missing)
    #expect(snapshot.locators.map(\.name) == ["INTRO", "VERSE", "OUTRO"])
    #expect(!snapshot.sourceDigest.isEmpty)
  }

  @Test("Keeps a truthful structure-only map when the Arrangement is empty")
  func structureOnlyMap() {
    let sessionClip = clip(
      id: "session",
      kind: .midi,
      placement: .session,
      name: "Idea",
      start: nil,
      end: nil,
      reference: nil
    )
    let set = AbletonSet(
      id: "session-set",
      fileURL: URL(fileURLWithPath: "/Studio/Ideas.als"),
      displayName: "Ideas",
      isBackup: false,
      modifiedAt: nil,
      compressedBytes: 10,
      xmlBytes: 20,
      creator: nil,
      format: AbletonFormat(
        majorVersion: nil,
        minorVersion: nil,
        schemaChangeCount: nil,
        revision: nil
      ),
      structure: SetStructure(),
      content: AbletonSetContent(
        tracks: [
          track(
            id: "midi",
            xmlID: "1",
            kind: .midi,
            name: "Keys",
            colorIndex: nil,
            groupTrackXMLID: nil,
            devices: 1,
            clips: [sessionClip]
          )
        ]
      )
    )

    let snapshot = SetMapBuilder().build(set: set)

    #expect(snapshot.completeness == .structureOnly)
    #expect(snapshot.startBeat == 0)
    #expect(snapshot.endBeat == 16)
    #expect(snapshot.lanes.count == 1)
    #expect(snapshot.lanes[0].clips.isEmpty)
    #expect(snapshot.sessionClipCount == 1)
  }

  private func track(
    id: String,
    xmlID: String?,
    kind: SetTrackKind,
    name: String,
    colorIndex: Int?,
    groupTrackXMLID: String?,
    devices: Int,
    clips: [SetClip]
  ) -> SetTrack {
    SetTrack(
      id: id,
      xmlID: xmlID,
      kind: kind,
      name: name,
      colorIndex: colorIndex,
      groupTrackXMLID: groupTrackXMLID,
      isFolded: false,
      mixer: TrackMixerState(),
      devices: (0..<devices).map { index in
        SetDevice(
          id: "\(id)-device-\(index)",
          xmlID: nil,
          kind: .native,
          typeName: "Device",
          displayName: "Device \(index)",
          isEnabled: true,
          plugin: nil,
          stateDigest: "digest-\(index)",
          nestedDevices: [],
          resourceReferences: []
        )
      },
      clips: clips
    )
  }

  private func clip(
    id: String,
    kind: SetClipKind,
    placement: SetClipPlacement,
    name: String,
    start: Double?,
    end: Double?,
    reference: MediaReference?
  ) -> SetClip {
    SetClip(
      id: id,
      xmlID: nil,
      kind: kind,
      placement: placement,
      name: name,
      startBeat: start,
      endBeat: end,
      loopStartBeat: nil,
      loopEndBeat: nil,
      loopEnabled: false,
      isWarped: false,
      warpMode: nil,
      warpMarkerCount: 0,
      midiNoteCount: kind == .midi ? 4 : 0,
      sampleReference: reference
    )
  }
}
