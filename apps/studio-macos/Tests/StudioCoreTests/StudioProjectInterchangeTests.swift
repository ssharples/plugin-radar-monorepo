import Foundation
import Testing

@testable import StudioCore

@Suite("Studio Project Interchange")
struct StudioProjectInterchangeTests {
  @Test("Historical v1 fixture migrates to a deterministic canonical v2 payload")
  func roundTripsHistoricalV1Fixture() throws {
    let fixture = try String(contentsOf: goldenFixtureURL(), encoding: .utf8)
      .trimmingCharacters(in: .newlines)
    let decoded = try JSONDecoder().decode(
      StudioProjectInterchange.self,
      from: Data(fixture.utf8)
    )
    try decoded.validate()
    let firstEncoding = try encodedFixtureJSON(for: decoded)
    let roundTripped = try JSONDecoder().decode(
      StudioProjectInterchange.self,
      from: Data(firstEncoding.utf8)
    )

    #expect(decoded.migration == .v1)
    #expect(roundTripped.migration == nil)
    #expect(roundTripped.identity == decoded.identity)
    #expect(roundTripped.timeline.tempoMap == decoded.timeline.tempoMap)
    #expect(roundTripped.tracks.value?.map(\.id) == decoded.tracks.value?.map(\.id))
    #expect(roundTripped.mediaDependencies == decoded.mediaDependencies)
    #expect(!firstEncoding.contains("\"migration\""))
    #expect(try encodedFixtureJSON(for: roundTripped) == firstEncoding)
  }

  @Test("Logic mapping has a deterministic read-only Codable round trip")
  func roundTripsLogicMappingDeterministically() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let session = try logicFixtureSession(in: directory)
    let interchange = try session.projectInterchange()
    try interchange.validate()
    let firstEncoding = try encodedFixtureJSON(for: interchange)
    let decoded = try JSONDecoder().decode(
      StudioProjectInterchange.self,
      from: Data(firstEncoding.utf8)
    )

    #expect(decoded == interchange)
    #expect(try encodedFixtureJSON(for: decoded) == firstEncoding)
  }

  @Test("Persisted v1 fixture decodes drift-prone fields truthfully")
  func decodesPersistedV1Fixture() throws {
    let interchange = try JSONDecoder().decode(
      StudioProjectInterchange.self,
      from: Data(try String(contentsOf: goldenFixtureURL(), encoding: .utf8).utf8)
    )

    #expect(interchange.version == .current)
    #expect(interchange.migration == .v1)
    #expect(
      interchange.identity.sourceDocument.value?.fileURL.absoluteString
        == "file:///Volumes/Example%20Archive%20Drive/Sets/Example%20Set.als")
    let tracks = try #require(interchange.tracks.value)
    #expect(tracks.count == 2)
    let groupTrack = try #require(tracks.first(where: { $0.id.value == "track-group-1" }))
    #expect(groupTrack.isFolded == .parsed(true))
    let leadTrack = try #require(tracks.first(where: { $0.id.value == "track-audio-1" }))
    let rack = try #require(leadTrack.devices.value?.first)
    let nested = try #require(rack.nestedDevices.value?.first)
    #expect(
      rack.resourceReferences.value?.first?.relativePath == .parsed("Presets/Nested Rack.adg"))
    #expect(nested.plugin.value?.identifier == .parsed("shaper.vst3"))
    #expect(nested.plugin.value?.version.provenance == .unknown)
    #expect(leadTrack.isFolded.provenance == .unknown)
    #expect(leadTrack.routing.value?.inputReference.provenance == .unknown)
    #expect(leadTrack.routing.value?.outputReference.provenance == .unknown)
    let dependencies = try #require(interchange.mediaDependencies.value)
    #expect(dependencies.count == 2)
    #expect(
      dependencies[0].resolvedURL.value?.absoluteString
        == "file:///Volumes/Example%20Archive%20Drive/Samples/Lead%20Vox.wav")
    #expect(dependencies[1].resolvedURL.provenance == .unknown)
    #expect(interchange.staticMetadata.provenance == .unknown)
    #expect(interchange.audioReferences.provenance == .unknown)
    #expect(interchange.previewReferences.provenance == .unknown)
    #expect(interchange.dawExtensions.provenance == .unknown)
    #expect(interchange.timeline.timeSignature.provenance == .unknown)
  }

  @Test("Legacy v1 payloads without new keys decode with truthful defaults")
  func decodesLegacyPayloadWithoutLosslessKeys() throws {
    let legacyJSON = """
      {
        "automationLanes" : {
          "note" : "No automation lane payload.",
          "provenance" : "unsupported"
        },
        "evidenceSummary" : {
          "automationEnvelopeCount" : {
            "provenance" : "parsed",
            "value" : 0
          },
          "deviceSummary" : {
            "provenance" : "parsed",
            "value" : {
              "maxForLiveDeviceCount" : 0,
              "rackDeviceCount" : 0,
              "thirdPartyDeviceCount" : 0
            }
          },
          "trackSummary" : {
            "provenance" : "parsed",
            "value" : {
              "audioTrackCount" : 1,
              "groupTrackCount" : 0,
              "midiTrackCount" : 0,
              "returnTrackCount" : 0
            }
          },
          "warpMarkerCount" : {
            "provenance" : "parsed",
            "value" : 0
          },
          "xmlBytes" : {
            "provenance" : "parsed",
            "value" : 128
          }
        },
        "exportReferences" : {
          "note" : "No export references.",
          "provenance" : "unknown"
        },
        "handoffReferences" : {
          "note" : "No handoff references.",
          "provenance" : "unknown"
        },
        "identity" : {
          "daw" : {
            "provenance" : "parsed",
            "value" : "abletonLive"
          },
          "displayName" : {
            "note" : "Derived from the Set filename, not the document body.",
            "provenance" : "derived",
            "value" : "Legacy"
          },
          "sourceApplication" : {
            "provenance" : "parsed",
            "value" : {
              "creator" : {
                "provenance" : "parsed",
                "value" : "Ableton Live 12"
              },
              "majorVersion" : {
                "provenance" : "parsed",
                "value" : "5"
              },
              "minorVersion" : {
                "provenance" : "parsed",
                "value" : "12.0"
              },
              "revision" : {
                "provenance" : "parsed",
                "value" : "legacy"
              },
              "schemaChangeCount" : {
                "provenance" : "parsed",
                "value" : 1
              }
            }
          },
          "sourceDocument" : {
            "note" : "Filesystem origin is derived from the adapter input.",
            "provenance" : "derived",
            "value" : {
              "fileURL" : "file:///tmp/Legacy.als"
            }
          }
        },
        "locators" : {
          "provenance" : "derived",
          "value" : [ ]
        },
        "timeline" : {
          "tempo" : {
            "provenance" : "parsed",
            "value" : 120
          },
          "timeSignature" : {
            "note" : "The current Ableton parser does not populate a project time signature.",
            "provenance" : "unknown"
          }
        },
        "tracks" : {
          "provenance" : "parsed",
          "value" : [
            {
              "clips" : {
                "provenance" : "parsed",
                "value" : [ ]
              },
              "colorIndex" : {
                "note" : "No track color index was parsed.",
                "provenance" : "unknown"
              },
              "devices" : {
                "provenance" : "parsed",
                "value" : [ ]
              },
              "hierarchy" : {
                "provenance" : "parsed",
                "value" : {
                  "parentTrackID" : {
                    "note" : "No parsed parent track identifier could be resolved.",
                    "provenance" : "unknown"
                  },
                  "sourceParentIdentifier" : {
                    "note" : "This track is not grouped under another parsed track.",
                    "provenance" : "unknown"
                  }
                }
              },
              "id" : {
                "note" : "Stable ID derived from the current parser's normalized track representation.",
                "provenance" : "derived",
                "value" : "legacy-track"
              },
              "kind" : {
                "provenance" : "parsed",
                "value" : "audio"
              },
              "mixer" : {
                "provenance" : "parsed",
                "value" : {
                  "pan" : {
                    "note" : "The current parser did not expose a pan value for this track.",
                    "provenance" : "unknown"
                  },
                  "volume" : {
                    "note" : "The current parser did not expose a volume value for this track.",
                    "provenance" : "unknown"
                  }
                }
              },
              "name" : {
                "note" : "Track names can include parser fallbacks when the Set omits a user-visible name.",
                "provenance" : "derived",
                "value" : "Legacy Track"
              },
              "routing" : {
                "provenance" : "parsed",
                "value" : {
                  "armEnabled" : {
                    "note" : "The current parser did not expose an arm state for this track.",
                    "provenance" : "unknown"
                  },
                  "monitoringMode" : {
                    "note" : "The current parser did not expose a monitoring mode for this track.",
                    "provenance" : "unknown"
                  },
                  "soloEnabled" : {
                    "note" : "The current parser did not expose a solo state for this track.",
                    "provenance" : "unknown"
                  },
                  "speakerEnabled" : {
                    "note" : "The current parser did not expose a speaker state for this track.",
                    "provenance" : "unknown"
                  }
                }
              },
              "sourceIdentifier" : {
                "provenance" : "parsed",
                "value" : "1"
              }
            }
          ]
        },
        "version" : {
          "major" : 1,
          "minor" : 0
        }
      }
      """

    let interchange = try JSONDecoder().decode(
      StudioProjectInterchange.self,
      from: Data(legacyJSON.utf8)
    )

    #expect(interchange.mediaDependencies.provenance == .unknown)
    #expect(
      interchange.mediaDependencies.note
        == "This persisted v1 payload predates dependency preservation.")
    #expect(interchange.staticMetadata.provenance == .unknown)
    #expect(
      interchange.staticMetadata.note
        == "This persisted v1 payload predates static metadata preservation.")
    #expect(interchange.audioReferences.provenance == .unknown)
    #expect(
      interchange.audioReferences.note
        == "This persisted v1 payload predates session audio reference preservation.")
    #expect(interchange.previewReferences.provenance == .unknown)
    #expect(
      interchange.previewReferences.note
        == "This persisted v1 payload predates preview reference preservation.")
    #expect(interchange.dawExtensions.provenance == .unknown)
    #expect(
      interchange.dawExtensions.note
        == "Historical v1 did not support bounded DAW extension preservation.")
    let track = try #require(interchange.tracks.value?.first)
    #expect(track.isFolded.provenance == .unknown)
    #expect(
      track.isFolded.note == "This persisted v1 payload predates track fold-state preservation.")
    #expect(track.routing.value?.inputReference.provenance == .unknown)
    #expect(
      track.routing.value?.outputReference.note
        == "This persisted v1 payload predates output routing preservation.")
  }

  @Test("Future and invalid schema versions fail closed")
  func rejectsUnsupportedSchemaVersions() throws {
    for version in [
      ["major": 1, "minor": 1],
      ["major": 2, "minor": 1],
      ["major": 3, "minor": 0],
      ["major": 0, "minor": 9],
      ["major": 1, "minor": -1],
    ] {
      var object = try fixtureJSONObject()
      object["version"] = version
      let data = try fixtureData(from: object)

      #expect(throws: StudioProjectInterchangeValidationError.self) {
        _ = try JSONDecoder().decode(StudioProjectInterchange.self, from: data)
      }
    }

    var invalidHistoricalPayload = try fixtureJSONObject()
    invalidHistoricalPayload["version"] = ["major": 1, "minor": 0]
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: invalidHistoricalPayload)
      )
    }

  }

  @Test("Schema v2 cannot spoof decoder-generated v1 migration provenance")
  func rejectsV2MigrationMarkerSpoof() throws {
    var markedV2 = try fixtureJSONObject()
    markedV2["migration"] = try historicalMigrationJSONObject()

    #expect(
      throws: StudioProjectInterchangeValidationError.invalidMigration(
        "schema v2 payloads cannot carry historical migration markers"
      )
    ) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: markedV2)
      )
    }

    var markedV2MissingRequiredField = markedV2
    var timeline = try #require(markedV2MissingRequiredField["timeline"] as? [String: Any])
    timeline.removeValue(forKey: "tempoMap")
    markedV2MissingRequiredField["timeline"] = timeline

    #expect(
      throws: StudioProjectInterchangeValidationError.invalidMigration(
        "schema v2 payloads cannot carry historical migration markers"
      )
    ) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: markedV2MissingRequiredField)
      )
    }
  }

  @Test("Malformed enums and provenance value shapes are rejected")
  func rejectsMalformedFields() throws {
    var malformedEnum = try fixtureJSONObject()
    var enumIdentity = try #require(malformedEnum["identity"] as? [String: Any])
    var enumDAW = try #require(enumIdentity["daw"] as? [String: Any])
    enumDAW["provenance"] = "futureEvidence"
    enumIdentity["daw"] = enumDAW
    malformedEnum["identity"] = enumIdentity

    #expect(throws: DecodingError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: malformedEnum)
      )
    }

    var contradictoryField = try fixtureJSONObject()
    var fieldIdentity = try #require(contradictoryField["identity"] as? [String: Any])
    var fieldDAW = try #require(fieldIdentity["daw"] as? [String: Any])
    fieldDAW["provenance"] = "unknown"
    fieldIdentity["daw"] = fieldDAW
    contradictoryField["identity"] = fieldIdentity

    #expect(throws: DecodingError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: contradictoryField)
      )
    }

    let invalidConstructedField = StudioProjectInterchangeField<String>(
      provenance: .unknown,
      value: "must not be serialized"
    )
    #expect(throws: EncodingError.self) {
      _ = try JSONEncoder().encode(invalidConstructedField)
    }
  }

  @Test("Duplicate stable identifiers are rejected")
  func rejectsDuplicateStableIdentifiers() throws {
    var object = try fixtureJSONObject()
    var tracks = try #require(object["tracks"] as? [String: Any])
    var values = try #require(tracks["value"] as? [[String: Any]])
    let firstID = try #require(values.first?["id"] as? [String: Any])
    values[1]["id"] = firstID
    tracks["value"] = values
    object["tracks"] = tracks

    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: object)
      )
    }
  }

  @Test("Contradictory hierarchy is rejected")
  func rejectsContradictoryHierarchy() throws {
    var object = try fixtureJSONObject()
    var tracks = try #require(object["tracks"] as? [String: Any])
    var values = try #require(tracks["value"] as? [[String: Any]])
    let childID = try #require((values[1]["id"] as? [String: Any])?["value"] as? String)
    var hierarchy = try #require(values[1]["hierarchy"] as? [String: Any])
    var hierarchyValue = try #require(hierarchy["value"] as? [String: Any])
    var parentTrackID = try #require(hierarchyValue["parentTrackID"] as? [String: Any])
    parentTrackID["value"] = childID
    hierarchyValue["parentTrackID"] = parentTrackID
    hierarchy["value"] = hierarchyValue
    values[1]["hierarchy"] = hierarchy
    tracks["value"] = values
    object["tracks"] = tracks

    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: object)
      )
    }
  }

  @Test("Hierarchy rejects a missing parent ID")
  func rejectsMissingHierarchyParent() throws {
    var object = try fixtureJSONObject()
    try mutateTrack(in: &object, index: 1) { track in
      var hierarchy = try #require(track["hierarchy"] as? [String: Any])
      var value = try #require(hierarchy["value"] as? [String: Any])
      value["parentTrackID"] = parsedField("missing-parent")
      hierarchy["value"] = value
      track["hierarchy"] = hierarchy
    }

    #expect(
      throws: StudioProjectInterchangeValidationError.invalidHierarchy(
        trackID: "track-audio-1",
        reason: "parent missing-parent does not exist"
      )
    ) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: object)
      )
    }
  }

  @Test("Hierarchy rejects an existing non-group parent")
  func rejectsNonGroupHierarchyParent() throws {
    var object = try fixtureJSONObject()
    try mutateTrack(in: &object, index: 0) { track in
      var hierarchy = try #require(track["hierarchy"] as? [String: Any])
      var value = try #require(hierarchy["value"] as? [String: Any])
      value["sourceParentIdentifier"] = parsedField("audio-1")
      value["parentTrackID"] = parsedField("track-audio-1")
      hierarchy["value"] = value
      track["hierarchy"] = hierarchy
    }

    #expect(
      throws: StudioProjectInterchangeValidationError.invalidHierarchy(
        trackID: "track-group-1",
        reason: "parent track-audio-1 is not a group track"
      )
    ) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: object)
      )
    }
  }

  @Test("DAW extension payloads are versioned, provenanced, and bounded")
  func validatesBoundedDAWExtensions() throws {
    let interchange = fixtureInterchange()
    let dawExtension = try #require(interchange.dawExtensions.value?.first)
    #expect(dawExtension.namespace == .abletonLive)
    #expect(dawExtension.version == StudioProjectInterchangeVersion(major: 1, minor: 0))
    #expect(dawExtension.fields.first?.key == .sourceRevision)
    #expect(dawExtension.fields.first?.field == .parsed("abc123"))

    var object = try fixtureJSONObject()
    var extensions = try #require(object["dawExtensions"] as? [String: Any])
    var values = try #require(extensions["value"] as? [[String: Any]])
    values[0]["namespace"] = " "
    extensions["value"] = values
    object["dawExtensions"] = extensions

    #expect(throws: DecodingError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: object)
      )
    }
  }

  @Test("Ableton mapping preserves proven parser structure and explicit gaps")
  func mapsParsedAbletonContentTruthfully() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let setURL = directory.appending(path: "Example.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: setURL)

    let parsed = try AbletonSetParser().parse(fileURL: setURL)
    let interchange = parsed.projectInterchange(sourceFileURL: setURL)

    #expect(interchange.version == .current)
    #expect(interchange.identity.daw == .parsed(.abletonLive))
    #expect(interchange.identity.displayName.provenance == .derived)
    #expect(interchange.identity.displayName.value == "Example")
    #expect(interchange.identity.sourceDocument.provenance == .derived)
    #expect(interchange.identity.sourceDocument.value?.fileURL == setURL.standardizedFileURL)
    #expect(interchange.identity.sourceApplication.value?.creator == .parsed("Ableton Live 12.1"))
    #expect(interchange.identity.sourceApplication.value?.majorVersion == .parsed("5"))
    #expect(interchange.timeline.tempo == .parsed(128))
    #expect(interchange.timeline.tempoMap.provenance == .derived)
    #expect(interchange.timeline.tempoMap.value?.first?.beat.provenance == .derived)
    #expect(interchange.timeline.tempoMap.value?.first?.beat.value == 0)
    #expect(interchange.timeline.tempoMap.value?.first?.beatsPerMinute == .parsed(128))
    #expect(interchange.timeline.timeSignature.provenance == .unsupported)
    #expect(interchange.staticMetadata.provenance == .unsupported)
    #expect(interchange.audioReferences.provenance == .unsupported)
    #expect(interchange.previewReferences.provenance == .unsupported)

    let tracks = try #require(interchange.tracks.value)
    #expect(tracks.count == 6)
    let lead = try #require(tracks.first(where: { $0.sourceIdentifier.value == "1" }))
    #expect(lead.kind == .parsed(.audio))
    #expect(lead.name.provenance == .derived)
    #expect(lead.colorIndex == .parsed(7))
    #expect(lead.isFolded.provenance == .unknown)
    #expect(lead.mixer.value?.volume == .parsed(0.75))
    #expect(lead.routing.value?.inputReference.provenance == .unsupported)
    #expect(lead.routing.value?.outputReference.provenance == .unsupported)
    #expect(lead.routing.value?.sends.provenance == .unsupported)
    #expect(lead.routing.value?.speakerEnabled == .parsed(true))
    #expect(lead.routing.value?.armEnabled == .parsed(true))
    #expect(lead.routing.value?.monitoringMode == .parsed(2))
    let leadDevice = try #require(lead.devices.value?.first)
    #expect(leadDevice.kind == .parsed(.vst3))
    #expect(leadDevice.displayName.provenance == .derived)
    #expect(leadDevice.plugin.value?.name == .parsed("Example EQ"))
    #expect(leadDevice.plugin.value?.manufacturer == .parsed("Example Audio"))
    #expect(leadDevice.plugin.value?.identifier == .parsed("eq-1"))
    #expect(leadDevice.stateDigest.provenance == .derived)
    #expect(leadDevice.stateAvailability.value == .digestOnly)
    let leadClip = try #require(lead.clips.value?.first)
    #expect(leadClip.kind == .parsed(.audio))
    #expect(leadClip.placement == .parsed(.arrangement))
    #expect(leadClip.startBeat.provenance == .derived)
    #expect(leadClip.startBeat.value == 4)
    #expect(leadClip.endBeat == .parsed(12))
    #expect(leadClip.loopEnabled == .parsed(false))
    #expect(leadClip.warp.value?.isWarped == .parsed(true))
    #expect(leadClip.warp.value?.mode == .parsed(3))
    #expect(leadClip.warp.value?.markerCount == .parsed(2))
    #expect(leadClip.warp.value?.markers.provenance == .unsupported)
    #expect(leadClip.midiNoteCount.provenance == .unsupported)
    #expect(leadClip.midiNotes.provenance == .unsupported)
    #expect(leadClip.fades.provenance == .unsupported)
    #expect(leadClip.sampleReference.value?.relativePath == .parsed("Samples/Recorded/verse.wav"))
    #expect(leadClip.sampleReference.value?.absolutePath == .parsed("/Audio/verse.wav"))
    #expect(leadClip.sampleReference.value?.assetIdentity.provenance == .unsupported)

    let midi = try #require(tracks.first(where: { $0.sourceIdentifier.value == "3" }))
    let midiClip = try #require(midi.clips.value?.first)
    #expect(midiClip.kind == .parsed(.midi))
    #expect(midiClip.midiNoteCount == .parsed(1))
    #expect(midiClip.midiNotes.provenance == .unsupported)
    #expect(midiClip.warp.provenance == .unsupported)
    #expect(midiClip.sampleReference.provenance == .unsupported)
    let midiDevice = try #require(midi.devices.value?.first)
    #expect(midiDevice.kind == .parsed(.maxForLive))
    #expect(midiDevice.plugin.provenance == .unknown)

    let dependencies = try #require(interchange.mediaDependencies.value)
    #expect(dependencies.count == 1)
    #expect(dependencies[0].kind == .parsed(.clipAudio))
    #expect(dependencies[0].availability == .parsed(.unresolved))
    #expect(dependencies[0].resolvedURL.provenance == .unknown)
    #expect(dependencies[0].ownerID.value == leadClip.id.value)

    let locators = try #require(interchange.locators.value)
    #expect(locators.count == 1)
    #expect(locators[0].name.provenance == .derived)
    #expect(locators[0].name.value == "Chorus")
    #expect(locators[0].beatTime.value == 16)

    #expect(interchange.automationLanes.provenance == .unsupported)
    #expect(interchange.exportReferences.provenance == .unsupported)
    #expect(interchange.handoffReferences.provenance == .unsupported)
    #expect(interchange.dawExtensions.provenance == .unsupported)
    #expect(interchange.evidenceSummary.xmlBytes.provenance == .parsed)
    #expect(interchange.evidenceSummary.trackSummary.value?.audioTrackCount == 2)
    #expect(interchange.evidenceSummary.trackSummary.value?.midiTrackCount == 1)
    #expect(interchange.evidenceSummary.deviceSummary.value?.thirdPartyDeviceCount == 1)
    #expect(interchange.evidenceSummary.deviceSummary.value?.maxForLiveDeviceCount == 1)
    #expect(interchange.evidenceSummary.deviceSummary.value?.rackDeviceCount == 1)
    #expect(interchange.evidenceSummary.warpMarkerCount == .parsed(2))
    #expect(interchange.evidenceSummary.automationEnvelopeCount == .parsed(1))
  }

  @Test("Logic mapping preserves truthful partial discovery fields and explicit gaps")
  func mapsDiscoveredLogicContentTruthfully() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let session = try logicFixtureSession(in: directory)
    let interchange = try session.projectInterchange()

    #expect(interchange.version == .current)
    #expect(
      interchange.identity.daw
        == .derived(.logicPro, note: "Derived from the Logic adapter's .logicx package discovery."))
    #expect(interchange.identity.displayName.provenance == .derived)
    #expect(interchange.identity.displayName.value == "Main Mix")
    #expect(interchange.identity.sourceDocument.value?.fileURL.lastPathComponent == "Song.logicx")
    #expect(interchange.identity.sourceApplication.provenance == .derived)
    #expect(
      interchange.identity.sourceApplication.value?.creator
        == .derived("Logic Pro", note: "Derived from the Logic metadata creator string."))
    #expect(interchange.identity.sourceApplication.value?.majorVersion.provenance == .derived)
    #expect(interchange.identity.sourceApplication.value?.minorVersion.provenance == .derived)
    #expect(interchange.timeline.tempo.provenance == .derived)
    #expect(
      interchange.timeline.timeSignature
        == .derived(
          SetTimeSignature(numerator: 4, denominator: 4),
          note:
            "Derived from read-only Logic package inspection; not parsed from DAW project events."))
    #expect(interchange.staticMetadata.value?.totalTrackCount.provenance == .derived)
    #expect(interchange.staticMetadata.value?.sampleRate.provenance == .derived)
    #expect(interchange.staticMetadata.value?.musicalKey.provenance == .derived)
    #expect(interchange.tracks.provenance == .unsupported)
    #expect(interchange.mediaDependencies.provenance == .unknown)
    let audioReferences = try #require(interchange.audioReferences.value)
    #expect(audioReferences.count == 4)
    #expect(audioReferences[0].relativePath.provenance == .derived)
    #expect(audioReferences[0].availability.provenance == .derived)
    #expect(audioReferences[0].usage.value == .used)
    #expect(audioReferences[3].usage.value == .unused)
    let previewReferences = try #require(interchange.previewReferences.value)
    #expect(previewReferences.count == 1)
    #expect(previewReferences[0].fileURL?.lastPathComponent == "WindowImage.jpg")
    #expect(previewReferences[0].kind.value == .preview)
    #expect(previewReferences[0].availability.value == .available)
    #expect(previewReferences[0].mediaType.value == "image")
    #expect(interchange.locators.provenance == .unsupported)
    #expect(interchange.automationLanes.provenance == .unsupported)
    #expect(interchange.exportReferences.provenance == .unsupported)
    #expect(interchange.handoffReferences.provenance == .unsupported)
    #expect(interchange.dawExtensions.provenance == .derived)
    #expect(interchange.dawExtensions.value?.first?.namespace == .logicPro)
    #expect(
      interchange.dawExtensions.value?.first?.fields.map(\.key) == [
        .inspectionProvenance, .selectedRevisionID,
      ])
    #expect(interchange.evidenceSummary.xmlBytes.provenance == .unsupported)
    #expect(interchange.evidenceSummary.trackSummary.provenance == .unknown)
    #expect(interchange.evidenceSummary.trackSummary.note?.contains("9 total tracks") == true)
  }

  @Test("Adapter preserves dependencies and fold state with deterministic resource order")
  func preservesLosslessParsedFields() {
    let projectURL = URL(filePath: "/Volumes/Example Archive Drive/Sets/Example Set.als")
    let sampleURL = URL(filePath: "/Volumes/Example Archive Drive/Samples/Lead Vox.wav")
    let presetURL = URL(filePath: "/Volumes/Example Archive Drive/Presets/Nested Rack.adg")
    let nestedDevice = SetDevice(
      id: "device-plugin-1",
      xmlID: nil,
      kind: .vst3,
      typeName: "PluginDevice",
      displayName: "Shaper",
      isEnabled: true,
      plugin: PluginIdentity(
        format: .vst3,
        name: "Shaper",
        manufacturer: "Acme Audio",
        identifier: "shaper.vst3",
        version: nil
      ),
      stateDigest: "def456",
      nestedDevices: [],
      resourceReferences: []
    )
    let rack = SetDevice(
      id: "device-rack-1",
      xmlID: "rack-1",
      kind: .rack,
      typeName: "AudioEffectGroupDevice",
      displayName: "Vocal Rack",
      isEnabled: nil,
      plugin: nil,
      stateDigest: "abc123",
      nestedDevices: [nestedDevice],
      resourceReferences: [
        MediaReference(absolutePath: nil, relativePath: "Presets/Nested Rack.adg"),
        MediaReference(absolutePath: nil, relativePath: "Presets/A First.adg"),
      ]
    )
    let clip = SetClip(
      id: "clip-1",
      xmlID: "101",
      kind: .audio,
      placement: .arrangement,
      name: "Lead Vox",
      startBeat: 4,
      endBeat: 12,
      loopStartBeat: 4,
      loopEndBeat: 12,
      loopEnabled: false,
      isWarped: true,
      warpMode: 3,
      warpMarkerCount: 2,
      midiNoteCount: 0,
      sampleReference: MediaReference(
        absolutePath: sampleURL.path(percentEncoded: false),
        relativePath: "Samples/Recorded/Lead Vox.wav"
      )
    )
    let group = SetTrack(
      id: "track-group-1",
      xmlID: "group-1",
      kind: .group,
      name: "Vocals",
      colorIndex: 3,
      groupTrackXMLID: nil,
      isFolded: true,
      mixer: TrackMixerState(),
      devices: [],
      clips: []
    )
    let track = SetTrack(
      id: "track-audio-1",
      xmlID: "audio-1",
      kind: .audio,
      name: "Lead Vocal",
      colorIndex: 7,
      groupTrackXMLID: "group-1",
      isFolded: nil,
      mixer: TrackMixerState(
        volume: 0.75,
        pan: -0.1,
        speakerOn: true,
        isSoloed: nil,
        isArmed: true,
        monitoringMode: 2
      ),
      devices: [rack],
      clips: [clip]
    )
    let dependencies = [
      MediaDependency(
        id: "dependency-1",
        kind: .clipAudio,
        reference: MediaReference(
          absolutePath: sampleURL.path(percentEncoded: false),
          relativePath: "Samples/Recorded/Lead Vox.wav"
        ),
        resolvedURL: sampleURL,
        availability: .available,
        ownerID: clip.id
      ),
      MediaDependency(
        id: "dependency-2",
        kind: .deviceResource,
        reference: MediaReference(
          absolutePath: nil,
          relativePath: "Presets/Nested Rack.adg"
        ),
        resolvedURL: presetURL,
        availability: .available,
        ownerID: rack.id
      ),
    ]
    let parsed = ParsedAbletonSet(
      xmlBytes: 4096,
      creator: "Ableton Live 12.1",
      format: AbletonFormat(
        majorVersion: "5",
        minorVersion: "12.0_12000",
        schemaChangeCount: 3,
        revision: "abc123"
      ),
      structure: SetStructure(),
      content: AbletonSetContent(
        tempo: 127.5,
        locators: [SetLocator(id: "locator-1", name: "Drop", beatTime: 32)],
        tracks: [group, track],
        dependencies: dependencies
      )
    )

    let interchange = parsed.projectInterchange(sourceFileURL: projectURL)

    let interchangeTracks = try! #require(interchange.tracks.value)
    let interchangeGroup = try! #require(
      interchangeTracks.first(where: { $0.id.value == "track-group-1" }))
    #expect(interchangeGroup.isFolded == .parsed(true))
    let interchangeTrack = try! #require(
      interchangeTracks.first(where: { $0.id.value == "track-audio-1" }))
    #expect(interchangeTrack.isFolded.provenance == .unknown)
    let dependencyValues = try! #require(interchange.mediaDependencies.value)
    #expect(dependencyValues.count == 2)
    #expect(dependencyValues[0].resolvedURL == .parsed(sampleURL.standardizedFileURL))
    #expect(dependencyValues[0].availability == .parsed(.available))
    #expect(dependencyValues[0].ownerID.value == "clip-1")
    #expect(dependencyValues[1].kind == .parsed(.deviceResource))
    #expect(dependencyValues[1].resolvedURL == .parsed(presetURL.standardizedFileURL))
    let rackDevice = try! #require(interchangeTrack.devices.value?.first)
    #expect(
      rackDevice.resourceReferences.value?.compactMap(\.relativePath.value) == [
        "Presets/A First.adg", "Presets/Nested Rack.adg",
      ])
    let nested = try! #require(rackDevice.nestedDevices.value?.first)
    #expect(nested.plugin.value?.identifier == .parsed("shaper.vst3"))
  }

  @Test("Duplicate Ableton source IDs do not fabricate hierarchy")
  func duplicateSourceIDsRemainUnresolved() throws {
    let parsed = ParsedAbletonSet(
      xmlBytes: 128,
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
          minimalTrack(id: "group-a", xmlID: "duplicate", kind: .group),
          minimalTrack(id: "group-b", xmlID: "duplicate", kind: .group),
          minimalTrack(
            id: "audio-child",
            xmlID: "child",
            kind: .audio,
            groupTrackXMLID: "duplicate"
          ),
        ]
      )
    )

    let interchange = parsed.projectInterchange()
    try interchange.validate()
    let child = try #require(
      interchange.tracks.value?.first(where: { $0.id.value == "audio-child" })
    )
    #expect(child.hierarchy.value?.sourceParentIdentifier == .parsed("duplicate"))
    #expect(child.hierarchy.value?.parentTrackID.provenance == .unknown)
    #expect(child.mixer.value?.volume.provenance == .unknown)
    #expect(interchange.identity.sourceDocument.provenance == .unknown)
  }

  @Test("V2 carries explicit event, state, automation, and artifact detail")
  func representsExplicitV2Content() throws {
    let interchange = fixtureInterchange()
    try interchange.validate()

    #expect(interchange.version == .current)
    #expect(interchange.migration == nil)
    #expect(interchange.timeline.tempoMap.value?.count == 1)
    let tracks = try #require(interchange.tracks.value)
    let audioClip = try #require(tracks[1].clips.value?.first)
    #expect(audioClip.warp.value?.markers.value?.count == 2)
    let midiClip = try #require(tracks[1].clips.value?.last)
    #expect(midiClip.midiNotes.value?.first?.pitch.value == 48)
    #expect(interchange.automationLanes.value?.first?.points.value?.count == 2)
    #expect(interchange.previewReferences.value?.first?.mediaType.value == "image/png")
    #expect(interchange.exportReferences.value?.first?.availability.value == .available)
    #expect(interchange.handoffReferences.value?.first?.label.value == "handoff.zip")
  }

  @Test("Malformed current V2 cannot use historical defaults")
  func rejectsMissingCurrentV2Fields() throws {
    var missingTempoMap = try fixtureJSONObject()
    var timeline = try #require(missingTempoMap["timeline"] as? [String: Any])
    timeline.removeValue(forKey: "tempoMap")
    missingTempoMap["timeline"] = timeline
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: missingTempoMap)
      )
    }

    var missingDeviceState = try fixtureJSONObject()
    try mutateFirstDevice(in: &missingDeviceState) { device in
      device.removeValue(forKey: "stateAvailability")
    }
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: missingDeviceState)
      )
    }

    var missingMIDINotes = try fixtureJSONObject()
    try mutateClip(in: &missingMIDINotes, index: 1) { clip in
      clip.removeValue(forKey: "midiNotes")
    }
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: missingMIDINotes)
      )
    }

    var missingWarpMarkers = try fixtureJSONObject()
    try mutateClip(in: &missingWarpMarkers, index: 0) { clip in
      var warp = try #require(clip["warp"] as? [String: Any])
      var value = try #require(warp["value"] as? [String: Any])
      value.removeValue(forKey: "markers")
      warp["value"] = value
      clip["warp"] = warp
    }
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: missingWarpMarkers)
      )
    }
  }

  @Test("Schema v2 rejects null for every migratable required field")
  func rejectsNullV2RequiredFields() throws {
    typealias Mutation = (inout [String: Any]) throws -> Void
    let cases: [(path: String, mutation: Mutation)] = [
      (
        "timeline.tempoMap",
        { object in
          var timeline = try #require(object["timeline"] as? [String: Any])
          timeline["tempoMap"] = NSNull()
          object["timeline"] = timeline
        }
      ),
      (
        "track.track-audio-1.isFolded",
        { object in
          try mutateTrack(in: &object, index: 1) { track in
            track["isFolded"] = NSNull()
          }
        }
      ),
      (
        "track.track-audio-1.routing.inputReference",
        { object in
          try mutateRouting(in: &object, trackIndex: 1) { routing in
            routing["inputReference"] = NSNull()
          }
        }
      ),
      (
        "track.track-audio-1.routing.outputReference",
        { object in
          try mutateRouting(in: &object, trackIndex: 1) { routing in
            routing["outputReference"] = NSNull()
          }
        }
      ),
      (
        "track.track-audio-1.routing.sends",
        { object in
          try mutateRouting(in: &object, trackIndex: 1) { routing in
            routing["sends"] = NSNull()
          }
        }
      ),
      (
        "device.device-rack-1.stateAvailability",
        { object in
          try mutateFirstDevice(in: &object) { device in
            device["stateAvailability"] = NSNull()
          }
        }
      ),
      (
        "clip.clip-midi-1.midiNotes",
        { object in
          try mutateClip(in: &object, index: 1) { clip in
            clip["midiNotes"] = NSNull()
          }
        }
      ),
      (
        "clip.clip-1.warp.markers",
        { object in
          try mutateClip(in: &object, index: 0) { clip in
            var warp = try #require(clip["warp"] as? [String: Any])
            var value = try #require(warp["value"] as? [String: Any])
            value["markers"] = NSNull()
            warp["value"] = value
            clip["warp"] = warp
          }
        }
      ),
      (
        "clip.clip-1.fades.fadeInCurve",
        { object in
          try mutateClip(in: &object, index: 0) { clip in
            var fades = try #require(clip["fades"] as? [String: Any])
            var value = try #require(fades["value"] as? [String: Any])
            value["fadeInCurve"] = NSNull()
            fades["value"] = value
            clip["fades"] = fades
          }
        }
      ),
      (
        "clip.clip-1.fades.fadeOutCurve",
        { object in
          try mutateClip(in: &object, index: 0) { clip in
            var fades = try #require(clip["fades"] as? [String: Any])
            var value = try #require(fades["value"] as? [String: Any])
            value["fadeOutCurve"] = NSNull()
            fades["value"] = value
            clip["fades"] = fades
          }
        }
      ),
      (
        "automationLane.id",
        { object in
          try mutateFirstAutomationLane(in: &object) { lane in
            lane["id"] = NSNull()
          }
        }
      ),
      (
        "automationLane.parameterIdentifier",
        { object in
          try mutateFirstAutomationLane(in: &object) { lane in
            lane["parameterIdentifier"] = NSNull()
          }
        }
      ),
      (
        "automationLane.points",
        { object in
          try mutateFirstAutomationLane(in: &object) { lane in
            lane["points"] = NSNull()
          }
        }
      ),
    ]

    for testCase in cases {
      var object = try fixtureJSONObject()
      try testCase.mutation(&object)
      #expect(
        throws: StudioProjectInterchangeValidationError.invalidMigration(
          "current v2 required field \(testCase.path) is explicitly null"
        )
      ) {
        _ = try JSONDecoder().decode(
          StudioProjectInterchange.self,
          from: fixtureData(from: object)
        )
      }
    }
  }

  @Test("Routing, automation, and dependency contradictions fail closed")
  func rejectsInvalidReferencesAndAvailability() throws {
    var invalidRouting = try fixtureJSONObject()
    try mutateTrack(in: &invalidRouting, index: 1) { track in
      var routing = try #require(track["routing"] as? [String: Any])
      var value = try #require(routing["value"] as? [String: Any])
      value["outputReference"] = parsedField([
        "kind": parsedField("track"),
        "trackID": parsedField("missing-track"),
        "label": unknownField(),
      ])
      routing["value"] = value
      track["routing"] = routing
    }
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: invalidRouting)
      )
    }

    var invalidAutomationOwner = try fixtureJSONObject()
    var lanes = try #require(invalidAutomationOwner["automationLanes"] as? [String: Any])
    var laneValues = try #require(lanes["value"] as? [[String: Any]])
    laneValues[0]["ownerID"] = parsedField("missing-owner")
    lanes["value"] = laneValues
    invalidAutomationOwner["automationLanes"] = lanes
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: invalidAutomationOwner)
      )
    }

    var invalidSend = try fixtureJSONObject()
    try mutateTrack(in: &invalidSend, index: 1) { track in
      var routing = try #require(track["routing"] as? [String: Any])
      var value = try #require(routing["value"] as? [String: Any])
      value["sends"] = parsedField([
        [
          "id": parsedField("send-1"),
          "targetTrackID": parsedField("missing-return"),
          "amount": parsedField(0.5),
          "isEnabled": parsedField(true),
        ]
      ])
      routing["value"] = value
      track["routing"] = routing
    }
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: invalidSend)
      )
    }

    var incompatibleDependency = try fixtureJSONObject()
    try mutateDependency(in: &incompatibleDependency, index: 0) { dependency in
      dependency["kind"] = parsedField("deviceResource")
    }
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: incompatibleDependency)
      )
    }

    var invalidAvailability = try fixtureJSONObject()
    try mutateDependency(in: &invalidAvailability, index: 0) { dependency in
      dependency["availability"] = parsedField("missing")
    }
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: invalidAvailability)
      )
    }

    var missingDependencyPaths = try fixtureJSONObject()
    try mutateDependency(in: &missingDependencyPaths, index: 0) { dependency in
      dependency["reference"] = parsedField([
        "absolutePath": unknownField(),
        "relativePath": unknownField(),
        "assetIdentity": unknownField(),
      ])
    }
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: missingDependencyPaths)
      )
    }
  }

  @Test("Device state, artifacts, hierarchy cycles, and extensions are bounded")
  func rejectsInvalidBoundedContent() throws {
    var invalidState = try fixtureJSONObject()
    try mutateFirstDevice(in: &invalidState) { device in
      device["stateAvailability"] = parsedField("identityOnly")
    }
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: invalidState)
      )
    }

    var invalidArtifact = try fixtureJSONObject()
    var previews = try #require(invalidArtifact["previewReferences"] as? [String: Any])
    var previewValues = try #require(previews["value"] as? [[String: Any]])
    previewValues[0]["document"] = parsedField(["fileURL": "https://example.com/preview.png"])
    previews["value"] = previewValues
    invalidArtifact["previewReferences"] = previews
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: invalidArtifact)
      )
    }

    var hierarchyCycle = try fixtureJSONObject()
    try mutateTrack(in: &hierarchyCycle, index: 0) { track in
      var hierarchy = try #require(track["hierarchy"] as? [String: Any])
      var value = try #require(hierarchy["value"] as? [String: Any])
      value["sourceParentIdentifier"] = parsedField("audio-1")
      value["parentTrackID"] = parsedField("track-audio-1")
      hierarchy["value"] = value
      track["hierarchy"] = hierarchy
    }
    try mutateTrack(in: &hierarchyCycle, index: 1) { track in
      track["kind"] = parsedField("group")
    }
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: hierarchyCycle)
      )
    }

    var wrongExtensionKey = try fixtureJSONObject()
    var extensions = try #require(wrongExtensionKey["dawExtensions"] as? [String: Any])
    var extensionValues = try #require(extensions["value"] as? [[String: Any]])
    extensionValues[0]["namespace"] = "com.apple.logic-pro"
    extensions["value"] = extensionValues
    wrongExtensionKey["dawExtensions"] = extensions
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: wrongExtensionKey)
      )
    }

    var wrongExtensionVersion = try fixtureJSONObject()
    extensions = try #require(wrongExtensionVersion["dawExtensions"] as? [String: Any])
    extensionValues = try #require(extensions["value"] as? [[String: Any]])
    extensionValues[0]["version"] = ["major": 2, "minor": 0]
    extensions["value"] = extensionValues
    wrongExtensionVersion["dawExtensions"] = extensions
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: wrongExtensionVersion)
      )
    }

    var oversizedExtension = try fixtureJSONObject()
    extensions = try #require(oversizedExtension["dawExtensions"] as? [String: Any])
    extensionValues = try #require(extensions["value"] as? [[String: Any]])
    var fields = try #require(extensionValues[0]["fields"] as? [[String: Any]])
    fields[0]["field"] = parsedField(String(repeating: "x", count: 4_097))
    extensionValues[0]["fields"] = fields
    extensions["value"] = extensionValues
    oversizedExtension["dawExtensions"] = extensions
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: oversizedExtension)
      )
    }
  }

  @Test("Logic rejects a revision from another session")
  func rejectsForeignLogicRevision() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let session = try logicFixtureSession(in: directory)
    let revision = try #require(session.revisions.first)
    let foreign = DAWSessionRevision(
      id: "foreign",
      fileURL: revision.fileURL,
      displayName: revision.displayName,
      kind: revision.kind,
      modifiedAt: revision.modifiedAt,
      inspection: revision.inspection
    )

    #expect(throws: StudioProjectInterchangeAdapterError.self) {
      _ = try session.projectInterchange(selectedRevision: foreign)
    }
  }

  @Test("Ableton mapping is deterministic across parser instances and dependency order")
  func mapsAbletonDeterministicallyAcrossInstances() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let setURL = directory.appending(path: "Deterministic.als")
    try TestSupport.writeGzip(TestSupport.liveSetXML, to: setURL)

    let first = try AbletonSetParser().parse(fileURL: setURL).projectInterchange(
      sourceFileURL: setURL
    )
    let second = try AbletonSetParser().parse(fileURL: setURL).projectInterchange(
      sourceFileURL: setURL
    )
    #expect(try encodedFixtureJSON(for: first) == encodedFixtureJSON(for: second))

    let ordered = dependencyOrderingFixture(reversed: false).projectInterchange()
    let reversed = dependencyOrderingFixture(reversed: true).projectInterchange()
    #expect(ordered.mediaDependencies == reversed.mediaDependencies)
    #expect(try encodedFixtureJSON(for: ordered) == encodedFixtureJSON(for: reversed))

    var noncanonical = try fixtureJSONObject()
    var dependencies = try #require(noncanonical["mediaDependencies"] as? [String: Any])
    let values = try #require(dependencies["value"] as? [[String: Any]])
    dependencies["value"] = Array(values.reversed())
    noncanonical["mediaDependencies"] = dependencies
    #expect(throws: StudioProjectInterchangeValidationError.self) {
      _ = try JSONDecoder().decode(
        StudioProjectInterchange.self,
        from: fixtureData(from: noncanonical)
      )
    }
  }
}

private func minimalTrack(
  id: String,
  xmlID: String?,
  kind: SetTrackKind,
  groupTrackXMLID: String? = nil
) -> SetTrack {
  SetTrack(
    id: id,
    xmlID: xmlID,
    kind: kind,
    name: id,
    colorIndex: nil,
    groupTrackXMLID: groupTrackXMLID,
    isFolded: nil,
    mixer: TrackMixerState(),
    devices: [],
    clips: []
  )
}

private func parsedField(_ value: Any) -> [String: Any] {
  ["provenance": "parsed", "value": value]
}

private func unknownField() -> [String: Any] {
  ["provenance": "unknown"]
}

private func mutateTrack(
  in object: inout [String: Any],
  index: Int,
  mutation: (inout [String: Any]) throws -> Void
) throws {
  var tracks = try #require(object["tracks"] as? [String: Any])
  var values = try #require(tracks["value"] as? [[String: Any]])
  try mutation(&values[index])
  tracks["value"] = values
  object["tracks"] = tracks
}

private func mutateClip(
  in object: inout [String: Any],
  index: Int,
  mutation: (inout [String: Any]) throws -> Void
) throws {
  try mutateTrack(in: &object, index: 1) { track in
    var clips = try #require(track["clips"] as? [String: Any])
    var values = try #require(clips["value"] as? [[String: Any]])
    try mutation(&values[index])
    clips["value"] = values
    track["clips"] = clips
  }
}

private func mutateRouting(
  in object: inout [String: Any],
  trackIndex: Int,
  mutation: (inout [String: Any]) throws -> Void
) throws {
  try mutateTrack(in: &object, index: trackIndex) { track in
    var routing = try #require(track["routing"] as? [String: Any])
    var value = try #require(routing["value"] as? [String: Any])
    try mutation(&value)
    routing["value"] = value
    track["routing"] = routing
  }
}

private func mutateFirstDevice(
  in object: inout [String: Any],
  mutation: (inout [String: Any]) throws -> Void
) throws {
  try mutateTrack(in: &object, index: 1) { track in
    var devices = try #require(track["devices"] as? [String: Any])
    var values = try #require(devices["value"] as? [[String: Any]])
    try mutation(&values[0])
    devices["value"] = values
    track["devices"] = devices
  }
}

private func mutateFirstAutomationLane(
  in object: inout [String: Any],
  mutation: (inout [String: Any]) throws -> Void
) throws {
  var lanes = try #require(object["automationLanes"] as? [String: Any])
  var values = try #require(lanes["value"] as? [[String: Any]])
  try mutation(&values[0])
  lanes["value"] = values
  object["automationLanes"] = lanes
}

private func mutateDependency(
  in object: inout [String: Any],
  index: Int,
  mutation: (inout [String: Any]) throws -> Void
) throws {
  var dependencies = try #require(object["mediaDependencies"] as? [String: Any])
  var values = try #require(dependencies["value"] as? [[String: Any]])
  try mutation(&values[index])
  dependencies["value"] = values
  object["mediaDependencies"] = dependencies
}

private func dependencyOrderingFixture(reversed: Bool) -> ParsedAbletonSet {
  let clip = SetClip(
    id: "clip-ordering",
    xmlID: "clip-xml",
    kind: .audio,
    placement: .arrangement,
    name: "Audio",
    startBeat: 0,
    endBeat: 1,
    loopStartBeat: 0,
    loopEndBeat: 1,
    loopEnabled: false,
    isWarped: false,
    warpMode: nil,
    warpMarkerCount: 0,
    midiNoteCount: 0,
    sampleReference: MediaReference(absolutePath: "/tmp/audio.wav", relativePath: "audio.wav")
  )
  let device = SetDevice(
    id: "device-ordering",
    xmlID: "device-xml",
    kind: .native,
    typeName: "Utility",
    displayName: "Utility",
    isEnabled: true,
    plugin: nil,
    stateDigest: String(repeating: "d", count: 64),
    nestedDevices: [],
    resourceReferences: []
  )
  let dependencies = [
    MediaDependency(
      id: "dependency-a",
      kind: .clipAudio,
      reference: MediaReference(absolutePath: "/tmp/audio.wav", relativePath: "audio.wav"),
      resolvedURL: URL(filePath: "/tmp/audio.wav"),
      availability: .available,
      ownerID: clip.id
    ),
    MediaDependency(
      id: "dependency-b",
      kind: .deviceResource,
      reference: MediaReference(absolutePath: nil, relativePath: "preset.adv"),
      resolvedURL: nil,
      availability: .unresolved,
      ownerID: device.id
    ),
  ]
  let track = SetTrack(
    id: "track-ordering",
    xmlID: "track-xml",
    kind: .audio,
    name: "Track",
    colorIndex: nil,
    groupTrackXMLID: nil,
    isFolded: nil,
    mixer: TrackMixerState(),
    devices: [device],
    clips: [clip]
  )
  return ParsedAbletonSet(
    xmlBytes: 256,
    creator: nil,
    format: AbletonFormat(
      majorVersion: nil,
      minorVersion: nil,
      schemaChangeCount: nil,
      revision: nil
    ),
    structure: SetStructure(),
    content: AbletonSetContent(
      tracks: [track],
      dependencies: reversed ? Array(dependencies.reversed()) : dependencies
    )
  )
}

private func fixtureInterchange() -> StudioProjectInterchange {
  let projectURL = URL(filePath: "/Volumes/Example Archive Drive/Sets/Example Set.als")
  let sampleURL = URL(filePath: "/Volumes/Example Archive Drive/Samples/Lead Vox.wav")

  return StudioProjectInterchange(
    identity: StudioProjectInterchangeIdentity(
      daw: .parsed(.abletonLive),
      displayName: .derived(
        "Example Set",
        note: "Derived from the Set filename, not the document body."
      ),
      sourceApplication: .parsed(
        StudioProjectInterchangeApplication(
          creator: .parsed("Ableton Live 12.1"),
          majorVersion: .parsed("5"),
          minorVersion: .parsed("12.0_12000"),
          schemaChangeCount: .parsed(3),
          revision: .parsed("abc123")
        )
      ),
      sourceDocument: .derived(
        StudioProjectInterchangeDocumentReference(fileURL: projectURL),
        note: "Filesystem origin is derived from the adapter input."
      )
    ),
    timeline: StudioProjectInterchangeTimeline(
      tempo: .parsed(127.5),
      tempoMap: .derived([
        StudioProjectInterchangeTempoEvent(
          id: .derived("tempo-event-1"),
          beat: .derived(0),
          beatsPerMinute: .parsed(127.5)
        )
      ]),
      timeSignature: .unsupported(
        note: "The current Ableton parser does not populate a project time signature."
      )
    ),
    staticMetadata: .unsupported(
      note: "The current Ableton parser does not expose additional project-level static metadata."
    ),
    tracks: .parsed([
      StudioProjectInterchangeTrack(
        id: .derived(
          "track-group-1",
          note: "Stable ID derived from the current parser's normalized track representation."
        ),
        sourceIdentifier: .parsed("group-1"),
        kind: .parsed(.group),
        name: .derived(
          "Vocals",
          note: "Track names can include parser fallbacks when the Set omits a user-visible name."
        ),
        colorIndex: .parsed(3),
        isFolded: .parsed(true),
        hierarchy: .parsed(
          StudioProjectInterchangeTrackHierarchy(
            sourceParentIdentifier: .unknown(
              note: "This track is not grouped under another parsed track."
            ),
            parentTrackID: .unknown(
              note: "No parsed parent track identifier could be resolved."
            )
          )
        ),
        mixer: .parsed(
          StudioProjectInterchangeTrackMixer(
            volume: .unknown(
              note: "The current parser did not expose a volume value for this track."),
            pan: .unknown(note: "The current parser did not expose a pan value for this track.")
          )
        ),
        routing: .parsed(
          StudioProjectInterchangeTrackRouting(
            sends: .parsed([]),
            speakerEnabled: .unknown(
              note: "The current parser did not expose a speaker state for this track."),
            soloEnabled: .unknown(
              note: "The current parser did not expose a solo state for this track."),
            armEnabled: .unknown(
              note: "The current parser did not expose an arm state for this track."),
            monitoringMode: .unknown(
              note: "The current parser did not expose a monitoring mode for this track.")
          )
        ),
        devices: .parsed([]),
        clips: .parsed([])
      ),
      StudioProjectInterchangeTrack(
        id: .derived(
          "track-audio-1",
          note: "Stable ID derived from the current parser's normalized track representation."
        ),
        sourceIdentifier: .parsed("audio-1"),
        kind: .parsed(.audio),
        name: .derived(
          "Lead Vocal",
          note: "Track names can include parser fallbacks when the Set omits a user-visible name."
        ),
        colorIndex: .parsed(7),
        isFolded: .unknown(note: "The current parser did not expose a fold-state for this track."),
        hierarchy: .parsed(
          StudioProjectInterchangeTrackHierarchy(
            sourceParentIdentifier: .parsed("group-1"),
            parentTrackID: .derived(
              "track-group-1",
              note: "Resolved from the parsed group track XML identifier."
            )
          )
        ),
        mixer: .parsed(
          StudioProjectInterchangeTrackMixer(
            volume: .parsed(0.75),
            pan: .parsed(-0.1)
          )
        ),
        routing: .parsed(
          StudioProjectInterchangeTrackRouting(
            sends: .parsed([]),
            speakerEnabled: .parsed(true),
            soloEnabled: .unknown(
              note: "The current parser did not expose a solo state for this track."),
            armEnabled: .parsed(true),
            monitoringMode: .parsed(2)
          )
        ),
        devices: .parsed([
          StudioProjectInterchangeDevice(
            id: .derived(
              "device-rack-1",
              note: "Stable ID derived from the current parser's normalized device representation."
            ),
            sourceIdentifier: .parsed("rack-1"),
            kind: .parsed(.rack),
            typeName: .parsed("AudioEffectGroupDevice"),
            displayName: .derived(
              "Vocal Rack",
              note:
                "Display names can fall back to plug-in or element names when Live omits a custom label."
            ),
            isEnabled: .unknown(
              note: "The current parser did not expose an enabled state for this device."),
            plugin: .unknown(
              note: "This device did not expose third-party plug-in identity metadata."),
            stateDigest: .derived(
              String(repeating: "a", count: 64),
              note: "The digest is computed from the parsed device XML subtree."
            ),
            stateAvailability: .derived(.digestOnly),
            nestedDevices: .parsed([
              StudioProjectInterchangeDevice(
                id: .derived(
                  "device-plugin-1",
                  note:
                    "Stable ID derived from the current parser's normalized device representation."
                ),
                sourceIdentifier: .unknown(
                  note: "This parsed device did not expose an Ableton XML identifier."
                ),
                kind: .parsed(.vst3),
                typeName: .parsed("PluginDevice"),
                displayName: .derived(
                  "Shaper",
                  note:
                    "Display names can fall back to plug-in or element names when Live omits a custom label."
                ),
                isEnabled: .parsed(true),
                plugin: .parsed(
                  StudioProjectInterchangePlugin(
                    format: .parsed(.vst3),
                    name: .parsed("Shaper"),
                    manufacturer: .parsed("Acme Audio"),
                    identifier: .parsed("shaper.vst3"),
                    version: .unknown(
                      note: "The parser exposed plug-in hosting but not a version string.")
                  )
                ),
                stateDigest: .derived(
                  String(repeating: "b", count: 64),
                  note: "The digest is computed from the parsed device XML subtree."
                ),
                stateAvailability: .derived(.digestOnly),
                nestedDevices: .parsed([]),
                resourceReferences: .parsed([])
              )
            ]),
            resourceReferences: .parsed([
              StudioProjectInterchangeMediaReference(
                absolutePath: .unknown(note: "The parser did not expose an absolute media path."),
                relativePath: .parsed("Presets/Nested Rack.adg"),
                assetIdentity: .unsupported(
                  note:
                    "Content-asset identity is not available in the current Ableton parser output."
                )
              )
            ])
          )
        ]),
        clips: .parsed([
          StudioProjectInterchangeClip(
            id: .derived(
              "clip-1",
              note: "Stable ID derived from the current parser's normalized clip representation."
            ),
            sourceIdentifier: .parsed("101"),
            kind: .parsed(.audio),
            placement: .parsed(.arrangement),
            name: .derived(
              "Lead Vox",
              note: "Clip names can include parser fallbacks when the Set omits a clip label."
            ),
            startBeat: .derived(
              4,
              note:
                "Clip starts can fall back to event-time evidence when no explicit start value is retained."
            ),
            endBeat: .parsed(12),
            loopStartBeat: .parsed(4),
            loopEndBeat: .parsed(12),
            loopEnabled: .parsed(false),
            warp: .parsed(
              StudioProjectInterchangeWarp(
                isWarped: .parsed(true),
                mode: .parsed(3),
                markerCount: .parsed(2),
                markers: .parsed([
                  StudioProjectInterchangeWarpMarker(
                    id: .derived("warp-marker-1"),
                    beat: .parsed(4),
                    sampleTimeSeconds: .parsed(0)
                  ),
                  StudioProjectInterchangeWarpMarker(
                    id: .derived("warp-marker-2"),
                    beat: .parsed(8),
                    sampleTimeSeconds: .parsed(2)
                  ),
                ])
              )
            ),
            midiNoteCount: .unsupported(note: "MIDI note counts do not apply to audio clips."),
            midiNotes: .unsupported(note: "MIDI note events do not apply to audio clips."),
            fades: .parsed(
              StudioProjectInterchangeClipFades(
                fadeIn: .parsed(0.25),
                fadeOut: .parsed(0.5),
                fadeInCurve: .parsed(0),
                fadeOutCurve: .parsed(-0.25)
              )
            ),
            sampleReference: .parsed(
              StudioProjectInterchangeMediaReference(
                absolutePath: .parsed(sampleURL.path(percentEncoded: false)),
                relativePath: .parsed("Samples/Recorded/Lead Vox.wav"),
                assetIdentity: .unsupported(
                  note:
                    "Content-asset identity is not available in the current Ableton parser output."
                )
              )
            )
          ),
          StudioProjectInterchangeClip(
            id: .derived("clip-midi-1"),
            sourceIdentifier: .parsed("102"),
            kind: .parsed(.midi),
            placement: .parsed(.session),
            name: .parsed("Bass MIDI"),
            startBeat: .parsed(0),
            endBeat: .parsed(4),
            loopStartBeat: .parsed(0),
            loopEndBeat: .parsed(4),
            loopEnabled: .parsed(true),
            warp: .unsupported(note: "Audio warp metadata does not apply to MIDI clips."),
            midiNoteCount: .parsed(1),
            midiNotes: .parsed([
              StudioProjectInterchangeMIDINote(
                id: .derived("midi-note-1"),
                pitch: .parsed(48),
                velocity: .parsed(0.8),
                startBeat: .parsed(0),
                durationBeats: .parsed(1),
                channel: .parsed(1)
              )
            ]),
            fades: .unsupported(note: "Audio fades do not apply to MIDI clips."),
            sampleReference: .unsupported(
              note: "Audio media references do not apply to MIDI clips."
            )
          ),
        ])
      ),
    ]),
    mediaDependencies: .parsed([
      StudioProjectInterchangeMediaDependency(
        id: .derived(
          "dependency-1",
          note: "Stable dependency ID derived from the normalized parsed dependency representation."
        ),
        kind: .parsed(.clipAudio),
        reference: .parsed(
          StudioProjectInterchangeMediaReference(
            absolutePath: .parsed(sampleURL.path(percentEncoded: false)),
            relativePath: .parsed("Samples/Recorded/Lead Vox.wav"),
            assetIdentity: .unsupported(
              note: "Content-asset identity is not available in the current Ableton parser output."
            )
          )
        ),
        resolvedURL: .parsed(sampleURL),
        availability: .parsed(.available),
        ownerID: .derived(
          "clip-1",
          note: "Owner IDs reference normalized parsed clip or device identifiers."
        )
      ),
      StudioProjectInterchangeMediaDependency(
        id: .derived(
          "dependency-2",
          note: "Stable dependency ID derived from the normalized parsed dependency representation."
        ),
        kind: .parsed(.deviceResource),
        reference: .parsed(
          StudioProjectInterchangeMediaReference(
            absolutePath: .unknown(note: "The parser did not expose an absolute media path."),
            relativePath: .parsed("Presets/Nested Rack.adg"),
            assetIdentity: .unsupported(
              note: "Content-asset identity is not available in the current Ableton parser output."
            )
          )
        ),
        resolvedURL: .unknown(
          note: "This dependency does not currently resolve to a concrete local file URL."
        ),
        availability: .parsed(.unresolved),
        ownerID: .derived(
          "device-rack-1",
          note: "Owner IDs reference normalized parsed clip or device identifiers."
        )
      ),
    ]),
    audioReferences: .unsupported(
      note: "The current Ableton parser does not expose a session-level audio reference inventory."
    ),
    locators: .derived(
      [
        StudioProjectInterchangeLocator(
          id: .derived(
            "locator-1",
            note: "Stable ID derived from the current parser's normalized locator representation."
          ),
          name: .derived(
            "Drop",
            note: "Locator names can include parser fallbacks when the Set omits a locator label."
          ),
          beatTime: .derived(
            32,
            note:
              "Locator beat times can include a parser fallback when the Set omits a locator time."
          )
        )
      ],
      note:
        "Locator names and times may include parser fallbacks when the source document omits them."
    ),
    previewReferences: .derived([
      fixtureArtifact(kind: .preview, id: "artifact-preview-1", path: "/tmp/preview.png")
    ]),
    automationLanes: .parsed([
      StudioProjectInterchangeAutomationLane(
        ownerID: .derived("clip-midi-1"),
        parameterName: .parsed("Expression"),
        pointCount: .parsed(2),
        id: .derived("automation-lane-1"),
        parameterIdentifier: .parsed("midi.expression"),
        points: .parsed([
          StudioProjectInterchangeAutomationPoint(
            id: .derived("automation-point-1"),
            beat: .parsed(0),
            value: .parsed(0.25),
            interpolation: .parsed(.linear)
          ),
          StudioProjectInterchangeAutomationPoint(
            id: .derived("automation-point-2"),
            beat: .parsed(2),
            value: .parsed(0.75),
            interpolation: .parsed(.bezier)
          ),
        ])
      )
    ]),
    exportReferences: .derived([
      fixtureArtifact(kind: .export, id: "artifact-export-1", path: "/tmp/export.wav")
    ]),
    handoffReferences: .derived([
      fixtureArtifact(kind: .handoff, id: "artifact-handoff-1", path: "/tmp/handoff.zip")
    ]),
    dawExtensions: .parsed([
      StudioProjectInterchangeDAWExtension(
        namespace: .abletonLive,
        version: StudioProjectInterchangeVersion(major: 1, minor: 0),
        fields: [
          StudioProjectInterchangeDAWExtensionEntry(
            key: .sourceRevision,
            field: .parsed("abc123")
          )
        ]
      )
    ]),
    evidenceSummary: StudioProjectInterchangeEvidenceSummary(
      xmlBytes: .parsed(4096),
      trackSummary: .parsed(
        StudioProjectInterchangeTrackSummary(
          audioTrackCount: 1,
          midiTrackCount: 0,
          groupTrackCount: 1,
          returnTrackCount: 0
        )
      ),
      deviceSummary: .parsed(
        StudioProjectInterchangeDeviceSummary(
          thirdPartyDeviceCount: 1,
          maxForLiveDeviceCount: 0,
          rackDeviceCount: 1
        )
      ),
      warpMarkerCount: .parsed(2),
      automationEnvelopeCount: .parsed(0)
    )
  )
}

private func fixtureArtifact(
  kind: StudioProjectInterchangeArtifactKind,
  id: String,
  path: String
) -> StudioProjectInterchangeArtifactReference {
  StudioProjectInterchangeArtifactReference(
    id: .derived(id),
    kind: .derived(kind),
    document: .derived(
      StudioProjectInterchangeDocumentReference(fileURL: URL(filePath: path))
    ),
    label: .derived(URL(filePath: path).lastPathComponent),
    mediaType: .derived(
      kind == .preview ? "image/png" : kind == .export ? "audio/wav" : "application/zip"
    ),
    checksumSHA256: .derived(String(repeating: "c", count: 64)),
    createdAt: .derived(Date(timeIntervalSince1970: 1_700_000_000)),
    availability: .derived(.available)
  )
}

private func encodedFixtureJSON(for interchange: StudioProjectInterchange) throws -> String {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
  let data = try encoder.encode(interchange)
  return try #require(String(data: data, encoding: .utf8))
}

private func fixtureJSONObject() throws -> [String: Any] {
  let data = try JSONEncoder().encode(fixtureInterchange())
  return try #require(
    JSONSerialization.jsonObject(with: data) as? [String: Any]
  )
}

private func historicalMigrationJSONObject() throws -> [String: Any] {
  let data = try JSONEncoder().encode(StudioProjectInterchangeMigration.v1)
  return try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
}

private func fixtureData(from object: [String: Any]) throws -> Data {
  try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
}

private func goldenFixtureURL() -> URL {
  URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appendingPathComponent("Fixtures", isDirectory: true)
    .appendingPathComponent("studio-project-interchange-v1.json")
}

private func logicFixtureSession(in root: URL) throws -> DiscoveredDAWSession {
  let projectFolder = root.appending(path: "Song", directoryHint: .isDirectory)
  let package = projectFolder.appending(path: "Song.logicx", directoryHint: .isDirectory)
  let resources = package.appending(path: "Resources", directoryHint: .isDirectory)
  let alternative = package.appending(path: "Alternatives/000", directoryHint: .isDirectory)
  let backup = alternative.appending(path: "Project File Backups/00", directoryHint: .isDirectory)
  let audioFolder = projectFolder.appending(path: "Audio Files", directoryHint: .isDirectory)
  let packagedAudioFolder = package.appending(
    path: "Media/Audio Files",
    directoryHint: .isDirectory
  )
  try FileManager.default.createDirectory(at: resources, withIntermediateDirectories: true)
  try FileManager.default.createDirectory(at: backup, withIntermediateDirectories: true)
  try FileManager.default.createDirectory(at: audioFolder, withIntermediateDirectories: true)
  try FileManager.default.createDirectory(
    at: packagedAudioFolder,
    withIntermediateDirectories: true
  )

  try writeLogicFixturePlist(
    [
      "BundleVersion": 2,
      "LastSavedFrom": "Logic Pro 12.0",
      "VariantNames": ["0": "Main Mix"],
    ],
    to: resources.appending(path: "ProjectInformation.plist")
  )
  let metadata: [String: Any] = [
    "AudioFiles": [
      "Audio Files/Kick.wav", "Audio Files/Package.wav", "Audio Files/Missing.wav",
    ],
    "BeatsPerMinute": 95.0,
    "NumberOfTracks": 9,
    "SampleRate": 44_100.0,
    "SongKey": "C",
    "SongGenderKey": "major",
    "SongSignatureNumerator": 4,
    "SongSignatureDenominator": 4,
    "UnusedAudioFiles": ["Audio Files/Unused.wav"],
  ]
  try writeLogicFixturePlist(metadata, to: alternative.appending(path: "MetaData.plist"))
  try writeLogicFixturePlist(metadata, to: backup.appending(path: "MetaData.plist"))
  try Data([0x23, 0x47]).write(to: alternative.appending(path: "ProjectData"))
  try Data([0x23, 0x47]).write(to: backup.appending(path: "ProjectData"))
  try Data([0, 1, 2]).write(to: audioFolder.appending(path: "Kick.wav"))
  try Data([3, 4, 5]).write(to: packagedAudioFolder.appending(path: "Package.wav"))
  try Data([3]).write(to: alternative.appending(path: "WindowImage.jpg"))

  return try #require(LogicProSessionAdapter().discover(in: root).sessions.first)
}

private func writeLogicFixturePlist(_ value: Any, to url: URL) throws {
  let data = try PropertyListSerialization.data(
    fromPropertyList: value,
    format: .binary,
    options: 0
  )
  try data.write(to: url)
}
