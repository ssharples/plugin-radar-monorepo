import Foundation
import Testing

@testable import StudioCore

@Suite("Export DNA parser")
struct ExportDNAParserTests {
  @Test("Parses BWF v0, v1, and v2 fields with exact 64-bit time references")
  func parsesBWFVersions() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let cases: [(String, UInt16, String?, BroadcastWaveLoudnessMetadata?)] = [
      ("v0", 0, nil, nil),
      ("v1", 1, String(repeating: "01", count: 32), nil),
      (
        "v2",
        2,
        String(repeating: "01", count: 32),
        BroadcastWaveLoudnessMetadata(
          loudnessValue: 120,
          loudnessRange: 340,
          maxTruePeakLevel: 560,
          maxMomentaryLoudness: 780,
          maxShortTermLoudness: 900)
      ),
    ]

    for (name, version, expectedUMID, expectedLoudness) in cases {
      let fileURL = directory.appending(path: "\(name).wav")
      let sampleRate: UInt32 = 48_000
      let timeReference: UInt64 = 0x0000_0002_0000_0001
      let data = RIFFFixtureBuilder.riffWave(
        chunks: [
          RIFFFixtureBuilder.chunk(
            "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: sampleRate, channels: 2)),
          RIFFFixtureBuilder.chunk(
            "bext",
            RIFFFixtureBuilder.bextChunk(
              version: version,
              description: "Studio master \(name)",
              originator: "Studio Time Machine",
              originatorReference: "DEMO SET",
              originationDate: "2020-08-14",
              originationTime: "09:10:11",
              timeReference: timeReference,
              umidHex: expectedUMID,
              loudness: expectedLoudness,
              codingHistory: "A=PCM,F=48000,W=24,M=stereo")),
          RIFFFixtureBuilder.chunk("data", Data([0, 1, 2, 3])),
        ])
      try data.write(to: fileURL)

      let parsed = try ExportDNAParser().parse(fileURL: fileURL)

      #expect(parsed.container.kind == .riffWave)
      #expect(parsed.container.format?.sampleRate == sampleRate)
      #expect(parsed.container.format?.channelCount == 2)
      let bext = try #require(parsed.bext)
      #expect(bext.trust.source == .bext)
      #expect(bext.trust.level == .high)
      #expect(bext.description == "Studio master \(name)")
      #expect(bext.version == version)
      #expect(bext.timeReference.samplesSinceOrigin == timeReference)
      #expect(bext.timeReference.sampleRate == sampleRate)
      #expect(bext.umidHex == RIFFFixtureBuilder.paddedUMIDHex(expectedUMID))
      #expect(bext.loudness == expectedLoudness)
      #expect(bext.codingHistory == "A=PCM,F=48000,W=24,M=stereo")
    }
  }

  @Test("Backfills bext time-reference sample rate when bext appears before fmt")
  func backfillsBextSampleRateFromLaterFormatChunk() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let fileURL = directory.appending(path: "bext-before-fmt.wav")
    let timeReference: UInt64 = 0x0000_0002_0000_0001
    try RIFFFixtureBuilder.riffWave(
      chunks: [
        RIFFFixtureBuilder.chunk(
          "bext",
          RIFFFixtureBuilder.bextChunk(
            version: 2,
            description: "Out-of-order bext",
            originator: "Studio Time Machine",
            originatorReference: "DEMO SET",
            originationDate: "2020-08-14",
            originationTime: "09:10:11",
            timeReference: timeReference,
            umidHex: String(repeating: "01", count: 32),
            loudness: BroadcastWaveLoudnessMetadata(
              loudnessValue: 120,
              loudnessRange: 340,
              maxTruePeakLevel: 560,
              maxMomentaryLoudness: 780,
              maxShortTermLoudness: 900),
            codingHistory: "A=PCM,F=48000,W=24,M=stereo")),
        RIFFFixtureBuilder.chunk(
          "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)),
        RIFFFixtureBuilder.chunk("data", Data([0, 1, 2, 3])),
      ]).write(to: fileURL)

    let parsed = try ExportDNAParser().parse(fileURL: fileURL)

    #expect(parsed.container.format?.sampleRate == 48_000)
    #expect(parsed.bext?.timeReference.samplesSinceOrigin == timeReference)
    #expect(parsed.bext?.timeReference.sampleRate == 48_000)
  }

  @Test("Requires the complete bext fixed region and a specified BWF version")
  func rejectsInvalidBextLayoutAndVersion() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let shortURL = directory.appending(path: "short-bext.wav")
    let completeV0 = RIFFFixtureBuilder.bextChunk(
      version: 0,
      description: "Short",
      originator: "Fixture",
      originatorReference: "fixture-1",
      originationDate: "2020-08-14",
      originationTime: "10:11:12",
      timeReference: 1,
      umidHex: nil,
      loudness: nil,
      codingHistory: "")
    #expect(completeV0.count == 602)
    try RIFFFixtureBuilder.riffWave(chunks: [
      RIFFFixtureBuilder.chunk("bext", completeV0.prefix(601))
    ]).write(to: shortURL)

    #expect(throws: ExportDNAParserError.invalidChunkLength("bext")) {
      _ = try ExportDNAParser().parse(fileURL: shortURL)
    }

    let futureURL = directory.appending(path: "future-bext.wav")
    try RIFFFixtureBuilder.riffWave(chunks: [
      RIFFFixtureBuilder.chunk(
        "bext",
        RIFFFixtureBuilder.bextChunk(
          version: 3,
          description: "Future",
          originator: "Fixture",
          originatorReference: "fixture-2",
          originationDate: "2020-08-14",
          originationTime: "10:11:12",
          timeReference: 2,
          umidHex: nil,
          loudness: nil,
          codingHistory: ""))
    ]).write(to: futureURL)

    #expect(throws: ExportDNAParserError.unsupportedBroadcastWaveVersion(3)) {
      _ = try ExportDNAParser().parse(fileURL: futureURL)
    }

    for (version, reservedOffset) in [(UInt16(0), 348), (UInt16(1), 500), (UInt16(2), 500)] {
      var invalidReserved = RIFFFixtureBuilder.bextChunk(
        version: version,
        description: "Reserved",
        originator: "Fixture",
        originatorReference: "fixture-reserved",
        originationDate: "2020-08-14",
        originationTime: "10:11:12",
        timeReference: 3,
        umidHex: nil,
        loudness: nil,
        codingHistory: "")
      invalidReserved[reservedOffset] = 1
      let reservedURL = directory.appending(path: "reserved-v\(version).wav")
      try RIFFFixtureBuilder.riffWave(chunks: [
        RIFFFixtureBuilder.chunk("bext", invalidReserved)
      ]).write(to: reservedURL)
      #expect(throws: ExportDNAParserError.invalidChunkLength("bext")) {
        _ = try ExportDNAParser().parse(fileURL: reservedURL)
      }
    }

    let malformedDateURL = directory.appending(path: "malformed-bext-date.wav")
    try RIFFFixtureBuilder.riffWave(chunks: [
      RIFFFixtureBuilder.chunk(
        "bext",
        RIFFFixtureBuilder.bextChunk(
          version: 0, description: "Date", originator: "Fixture",
          originatorReference: "fixture-date", originationDate: "2020-99-99",
          originationTime: "25:61:61", timeReference: 0, umidHex: nil, loudness: nil,
          codingHistory: ""))
    ]).write(to: malformedDateURL)
    let malformedDate = try ExportDNAParser().parse(fileURL: malformedDateURL)
    #expect(malformedDate.contradictions.contains { $0.field == "bextOriginationDateTime" })
  }

  @Test("Parses RF64 and BW64 chunk tables without reading full payloads")
  func parsesExtendedContainers() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    for kind in [ExportWaveContainerKind.rf64Wave, .bw64Wave] {
      let fileURL = directory.appending(path: "\(kind.rawValue).wav")
      let axml = """
        <?xml version="1.0" encoding="UTF-8"?>
        <ebuCoreMain><title>Export \(kind.rawValue)</title></ebuCoreMain>
        """
      let dataChunkBytes = Data([9, 8, 7, 6, 5])
      let fileData = RIFFFixtureBuilder.extendedWave(
        kind: kind,
        dataChunkSize: UInt64(dataChunkBytes.count),
        sampleCount: 96_000,
        otherExtendedSizes: [],
        chunks: [
          RIFFFixtureBuilder.chunk("JUNK", Data([0xaa, 0xbb, 0xcc])),
          RIFFFixtureBuilder.chunk(
            "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)),
          kind == .bw64Wave
            ? RIFFFixtureBuilder.chunk("axml", Data(axml.utf8))
            : RIFFFixtureBuilder.chunk("note", Data([0x41, 0x42, 0x43])),
          RIFFFixtureBuilder.chunk("data", dataChunkBytes, usesExtendedSize: true),
        ])
      try fileData.write(to: fileURL)

      let parsed = try ExportDNAParser().parse(fileURL: fileURL)

      #expect(parsed.container.kind == kind)
      #expect(parsed.container.ds64?.dataSize == UInt64(dataChunkBytes.count))
      #expect(parsed.container.ds64?.sampleCount == 96_000)
      let unknownChunk = try #require(parsed.chunks.first(where: { $0.id == "JUNK" }))
      #expect(unknownChunk.declaredSize == 3)
      #expect(unknownChunk.paddedSize == 4)
      let dataChunk = try #require(parsed.chunks.first(where: { $0.id == "data" }))
      #expect(dataChunk.declaredSize == UInt64(dataChunkBytes.count))
      #expect(dataChunk.usesExtendedSize == true)
      if kind == .bw64Wave {
        let axmlMetadata = try #require(parsed.axml)
        #expect(axmlMetadata.trust.source == .axml)
        #expect(axmlMetadata.trust.level == .low)
        #expect(axmlMetadata.rootElementName == "ebuCoreMain")
        #expect(axmlMetadata.textByPath["ebuCoreMain/title"] == ["Export BW64"])
      } else {
        #expect(parsed.axml == nil)
      }
    }
  }

  @Test("Validates RF64 and BW64 ds64 placement, tables, and data sizing")
  func rejectsInvalidDS64Contracts() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let prefixChunk = RIFFFixtureBuilder.chunk("JUNK", Data([0]))
    let notFirstURL = directory.appending(path: "ds64-not-first.rf64")
    try RIFFFixtureBuilder.extendedWave(
      kind: .rf64Wave,
      dataChunkSize: 1,
      sampleCount: 1,
      otherExtendedSizes: [],
      chunks: [RIFFFixtureBuilder.chunk("data", Data([0]), usesExtendedSize: true)],
      chunksBeforeDS64: [prefixChunk]
    ).write(to: notFirstURL)
    #expect(throws: ExportDNAParserError.missingDS64) {
      _ = try ExportDNAParser().parse(fileURL: notFirstURL)
    }

    let badRootURL = directory.appending(path: "bad-root.bw64")
    try RIFFFixtureBuilder.extendedWave(
      kind: .bw64Wave,
      dataChunkSize: 1,
      sampleCount: 1,
      otherExtendedSizes: [],
      chunks: [RIFFFixtureBuilder.chunk("data", Data([0]), usesExtendedSize: true)],
      rootSizeField: 128
    ).write(to: badRootURL)
    #expect(throws: ExportDNAParserError.malformedRootSize) {
      _ = try ExportDNAParser().parse(fileURL: badRootURL)
    }

    let trailingTableURL = directory.appending(path: "trailing-ds64.rf64")
    try RIFFFixtureBuilder.extendedWave(
      kind: .rf64Wave,
      dataChunkSize: 1,
      sampleCount: 1,
      otherExtendedSizes: [],
      chunks: [RIFFFixtureBuilder.chunk("data", Data([0]), usesExtendedSize: true)],
      ds64TrailingBytes: Data([0xaa, 0xbb])
    ).write(to: trailingTableURL)
    #expect(
      throws: ExportDNAParserError.invalidDS64(
        "ds64 table length does not match the chunk payload")
    ) {
      _ = try ExportDNAParser().parse(fileURL: trailingTableURL)
    }

    let dataTableURL = directory.appending(path: "data-table-entry.rf64")
    try RIFFFixtureBuilder.extendedWave(
      kind: .rf64Wave,
      dataChunkSize: 1,
      sampleCount: 1,
      otherExtendedSizes: [("data", 1)],
      chunks: [RIFFFixtureBuilder.chunk("data", Data([0]), usesExtendedSize: true)]
    ).write(to: dataTableURL)
    #expect(
      throws: ExportDNAParserError.invalidDS64(
        "ds64 table entries may only describe non-data chunks")
    ) {
      _ = try ExportDNAParser().parse(fileURL: dataTableURL)
    }

    let inlineDataSizeURL = directory.appending(path: "inline-data-size.rf64")
    try RIFFFixtureBuilder.extendedWave(
      kind: .rf64Wave,
      dataChunkSize: 1,
      sampleCount: 1,
      otherExtendedSizes: [],
      chunks: [RIFFFixtureBuilder.chunk("data", Data([0]))]
    ).write(to: inlineDataSizeURL)
    #expect(
      throws: ExportDNAParserError.invalidDS64(
        "RF64/BW64 data chunks must use the ds64 data size")
    ) {
      _ = try ExportDNAParser().parse(fileURL: inlineDataSizeURL)
    }
  }

  @Test("Rejects malformed lengths, integer overflow, and truncation")
  func rejectsMalformedInput() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let malformedLengthURL = directory.appending(path: "malformed-length.wav")
    try RIFFFixtureBuilder.riffWave(rawChunks: [
      RIFFFixtureBuilder.rawChunkHeader("fmt ", declaredSize: 16),
      RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2),
      RIFFFixtureBuilder.rawChunkHeader("data", declaredSize: 32),
      Data([0, 1, 2, 3]),
    ]).write(to: malformedLengthURL)

    #expect(throws: ExportDNAParserError.invalidChunkLength("data")) {
      _ = try ExportDNAParser().parse(fileURL: malformedLengthURL)
    }

    let overflowURL = directory.appending(path: "overflow.rf64")
    let overflowData = RIFFFixtureBuilder.extendedWave(
      kind: .rf64Wave,
      dataChunkSize: UInt64.max,
      sampleCount: 0,
      otherExtendedSizes: [],
      chunks: [
        RIFFFixtureBuilder.chunk(
          "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)),
        RIFFFixtureBuilder.chunk("data", Data(), usesExtendedSize: true),
      ])
    try overflowData.write(to: overflowURL)

    #expect(throws: ExportDNAParserError.integerOverflow) {
      _ = try ExportDNAParser().parse(fileURL: overflowURL)
    }

    let truncatedURL = directory.appending(path: "truncated.wav")
    var truncated = RIFFFixtureBuilder.riffWave(
      chunks: [
        RIFFFixtureBuilder.chunk(
          "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)),
        RIFFFixtureBuilder.chunk("JUNK", Data([0x01, 0x02, 0x03])),
      ])
    truncated.removeLast()
    RIFFFixtureBuilder.repairRIFFRootSize(&truncated)
    try truncated.write(to: truncatedURL)

    #expect(throws: ExportDNAParserError.truncated("JUNK")) {
      _ = try ExportDNAParser().parse(fileURL: truncatedURL)
    }
  }

  @Test("Parses iXML track metadata and Unicode deterministically")
  func parsesIXMLMetadata() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appending(path: "ixml.wav")
    let ixml = """
      <?xml version="1.0" encoding="UTF-8"?>
      <BWFXML>
        <PROJECT>EXAMPLE SONG</PROJECT>
        <SCENE>Night 3</SCENE>
        <TAKE>A12</TAKE>
        <TAPE>Roll β</TAPE>
        <NOTE>Vocal caf\u{00E9} \u{4F60}\u{597D}</NOTE>
        <TIMECODE>
          <TIMECODE_START>01:02:03:12</TIMECODE_START>
          <TIMECODE_RATE>25</TIMECODE_RATE>
        </TIMECODE>
        <SPEED><FILE_SAMPLE_RATE>48000</FILE_SAMPLE_RATE></SPEED>
        <TRACK_LIST>
          <TRACK_COUNT>2</TRACK_COUNT>
          <TRACK>
            <CHANNEL_INDEX>1</CHANNEL_INDEX>
            <NAME>Lead \u{4F60}\u{597D}</NAME>
            <FUNCTION>DX</FUNCTION>
          </TRACK>
          <TRACK>
            <CHANNEL_INDEX>2</CHANNEL_INDEX>
            <NAME>Room caf\u{00E9}</NAME>
            <FUNCTION>FX</FUNCTION>
          </TRACK>
        </TRACK_LIST>
      </BWFXML>
      """
    try RIFFFixtureBuilder.riffWave(
      chunks: [
        RIFFFixtureBuilder.chunk(
          "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)),
        RIFFFixtureBuilder.chunk("iXML", Data(ixml.utf8)),
        RIFFFixtureBuilder.chunk("data", Data([0, 1])),
      ]).write(to: fileURL)

    let parsed = try ExportDNAParser().parse(fileURL: fileURL)

    let ixmlMetadata = try #require(parsed.ixml)
    #expect(ixmlMetadata.trust.source == .iXML)
    #expect(ixmlMetadata.trust.level == .high)
    #expect(ixmlMetadata.project == "EXAMPLE SONG")
    #expect(ixmlMetadata.scene == "Night 3")
    #expect(ixmlMetadata.take == "A12")
    #expect(ixmlMetadata.tape == "Roll β")
    #expect(ixmlMetadata.note == "Vocal café 你好")
    #expect(ixmlMetadata.timecode == "01:02:03:12")
    #expect(ixmlMetadata.timecodeRate == "25")
    #expect(ixmlMetadata.fileSampleRate == 48_000)
    #expect(ixmlMetadata.trackCount == 2)
    #expect(ixmlMetadata.tracks.count == 2)
    #expect(ixmlMetadata.tracks[0].channelIndex == 1)
    #expect(ixmlMetadata.tracks[0].name == "Lead 你好")
    #expect(ixmlMetadata.tracks[1].name == "Room café")
  }

  @Test("Parses standard iXML 64-bit timestamps without promoting redundant format fields")
  func parsesIXMLTimestampFields() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appending(path: "ixml-timestamp.wav")
    let ixml = """
      <?xml version="1.0" encoding="UTF-8"?>
      <BWFXML>
        <IXML_VERSION>2.10</IXML_VERSION>
        <FILE_UID>fixture-uid</FILE_UID>
        <SPEED>
          <TIMECODE_RATE>30000/1001</TIMECODE_RATE>
          <TIMECODE_FLAG>DF</TIMECODE_FLAG>
          <FILE_SAMPLE_RATE>44100</FILE_SAMPLE_RATE>
          <TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI>2</TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI>
          <TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO>1</TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO>
          <TIMESTAMP_SAMPLE_RATE>48000</TIMESTAMP_SAMPLE_RATE>
        </SPEED>
      </BWFXML>
      """
    try RIFFFixtureBuilder.riffWave(chunks: [
      RIFFFixtureBuilder.chunk(
        "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 1)),
      RIFFFixtureBuilder.chunk("iXML", Data(ixml.utf8)),
      RIFFFixtureBuilder.chunk("data", Data([0, 1])),
    ]).write(to: fileURL)

    let parsed = try ExportDNAParser().parse(fileURL: fileURL)
    let metadata = try #require(parsed.ixml)
    #expect(metadata.ixmlVersion == "2.10")
    #expect(metadata.fileUID == "fixture-uid")
    #expect(metadata.timecodeRate == "30000/1001")
    #expect(metadata.timecodeFlag == "DF")
    #expect(metadata.timestamp?.samplesSinceMidnight == 0x0000_0002_0000_0001)
    #expect(metadata.timestamp?.sampleRate == 48_000)
    #expect(parsed.contradictions.contains { $0.field == "sampleRate" })

    let evidence = ExportDNAAssociationEvidence(parsed: parsed)
    #expect(evidence.fileSampleRate == 48_000)
    #expect(evidence.ixmlDeclaredFileSampleRate == 44_100)
    #expect(evidence.ixmlTimestamp == metadata.timestamp)
  }

  @Test("Rejects incomplete and invalid standard iXML timestamp words")
  func rejectsMalformedIXMLTimestampFields() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    for (name, timestampFields) in [
      (
        "missing-low",
        "<TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI>1</TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI>"
      ),
      (
        "overflow-high",
        "<TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI>4294967296</TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI><TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO>0</TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO>"
      ),
    ] {
      let fileURL = directory.appending(path: "\(name).wav")
      let ixml = "<BWFXML><SPEED>\(timestampFields)</SPEED></BWFXML>"
      try RIFFFixtureBuilder.riffWave(chunks: [
        RIFFFixtureBuilder.chunk("iXML", Data(ixml.utf8))
      ]).write(to: fileURL)
      #expect(throws: ExportDNAParserError.malformedXML("iXML")) {
        _ = try ExportDNAParser().parse(fileURL: fileURL)
      }
    }
  }

  @Test("Bounds XML depth, node count, and decoded text independently")
  func boundsXMLComplexity() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let cases: [(String, ExportDNAParser, String)] = [
      (
        "depth",
        ExportDNAParser(maximumXMLDepth: 3),
        "<BWFXML><USER><A><B>value</B></A></USER></BWFXML>"
      ),
      (
        "nodes",
        ExportDNAParser(maximumXMLNodeCount: 3),
        "<BWFXML><A>1</A><B>2</B><C>3</C></BWFXML>"
      ),
      (
        "text",
        ExportDNAParser(maximumXMLTextBytes: 8),
        "<BWFXML><USER>123456789</USER></BWFXML>"
      ),
    ]

    for (name, parser, xml) in cases {
      let fileURL = directory.appending(path: "xml-\(name).wav")
      try RIFFFixtureBuilder.riffWave(chunks: [
        RIFFFixtureBuilder.chunk("iXML", Data(xml.utf8))
      ]).write(to: fileURL)
      #expect(throws: ExportDNAParserError.xmlComplexityLimit("iXML")) {
        _ = try parser.parse(fileURL: fileURL)
      }
    }
  }

  @Test("Reports inconsistent iXML declared track count separately from explicit track entries")
  func reportsIXMLDeclaredTrackEntryMismatch() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let fileURL = directory.appending(path: "ixml-track-count-mismatch.wav")
    let ixml = """
      <?xml version="1.0" encoding="UTF-8"?>
      <BWFXML>
        <TRACK_LIST>
          <TRACK_COUNT>2</TRACK_COUNT>
          <TRACK><CHANNEL_INDEX>1</CHANNEL_INDEX><NAME>L</NAME></TRACK>
          <TRACK><CHANNEL_INDEX>2</CHANNEL_INDEX><NAME>R</NAME></TRACK>
          <TRACK><CHANNEL_INDEX>3</CHANNEL_INDEX><NAME>C</NAME></TRACK>
        </TRACK_LIST>
      </BWFXML>
      """
    try RIFFFixtureBuilder.riffWave(
      chunks: [
        RIFFFixtureBuilder.chunk(
          "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)),
        RIFFFixtureBuilder.chunk("iXML", Data(ixml.utf8)),
        RIFFFixtureBuilder.chunk("data", Data([0, 1])),
      ]).write(to: fileURL)

    let parsed = try ExportDNAParser().parse(fileURL: fileURL)

    #expect(parsed.contradictions.contains { $0.field == "trackList" })
    #expect(parsed.contradictions.contains { $0.field == "trackListCount" })
  }

  @Test("Reports absent and contradictory embedded metadata explicitly")
  func reportsContradictions() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let absentURL = directory.appending(path: "absent.wav")
    try RIFFFixtureBuilder.riffWave(
      chunks: [
        RIFFFixtureBuilder.chunk(
          "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)),
        RIFFFixtureBuilder.chunk("data", Data([0])),
      ]).write(to: absentURL)

    let absent = try ExportDNAParser().parse(fileURL: absentURL)
    #expect(absent.bext == nil)
    #expect(absent.ixml == nil)
    #expect(absent.axml == nil)
    #expect(absent.info == nil)
    #expect(absent.contradictions.isEmpty)

    let contradictoryURL = directory.appending(path: "contradictory.wav")
    let ixml = """
      <?xml version="1.0" encoding="UTF-8"?>
      <BWFXML>
        <SPEED><FILE_SAMPLE_RATE>44100</FILE_SAMPLE_RATE></SPEED>
        <TRACK_LIST>
          <TRACK_COUNT>3</TRACK_COUNT>
          <TRACK><CHANNEL_INDEX>1</CHANNEL_INDEX><NAME>L</NAME></TRACK>
          <TRACK><CHANNEL_INDEX>2</CHANNEL_INDEX><NAME>R</NAME></TRACK>
          <TRACK><CHANNEL_INDEX>3</CHANNEL_INDEX><NAME>C</NAME></TRACK>
        </TRACK_LIST>
      </BWFXML>
      """
    try RIFFFixtureBuilder.riffWave(
      chunks: [
        RIFFFixtureBuilder.chunk(
          "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)),
        RIFFFixtureBuilder.chunk("iXML", Data(ixml.utf8)),
        RIFFFixtureBuilder.listInfo(["INAM": "Mix Print", "IART": "Beyoncé"]),
        RIFFFixtureBuilder.chunk("data", Data([0, 1])),
      ]).write(to: contradictoryURL)

    let contradictory = try ExportDNAParser().parse(fileURL: contradictoryURL)

    let info = try #require(contradictory.info)
    #expect(info.trust.source == .riffInfo)
    #expect(info.trust.level == .low)
    #expect(info.fields["INAM"] == "Mix Print")
    #expect(info.fields["IART"] == "Beyoncé")
    #expect(contradictory.contradictions.count == 3)
    #expect(contradictory.contradictions.contains { $0.field == "sampleRate" })
    #expect(contradictory.contradictions.contains { $0.field == "trackCount" })
    #expect(contradictory.contradictions.contains { $0.field == "trackList" })
  }

  @Test("Tolerates non-INFO LIST chunks without reading them as metadata")
  func toleratesNonInfoListChunks() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let fileURL = directory.appending(path: "non-info-list.wav")
    let parser = ExportDNAParser(maximumMetadataChunkBytes: 16)
    var listPayload = Data("adtl".utf8)
    listPayload.append(Data(repeating: 0x2a, count: 64))
    try RIFFFixtureBuilder.riffWave(
      chunks: [
        RIFFFixtureBuilder.chunk(
          "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)),
        RIFFFixtureBuilder.chunk("LIST", listPayload),
        RIFFFixtureBuilder.chunk("data", Data([0, 1])),
      ]).write(to: fileURL)

    let parsed = try parser.parse(fileURL: fileURL)

    #expect(parsed.info == nil)
    #expect(
      parsed.chunks.contains { $0.id == "LIST" && $0.declaredSize == UInt64(listPayload.count) })
  }

  @Test("Association evidence carries structured iXML fields and redacts sensitive sidecar content")
  func sidecarSupportCarriesIXMLProductionFieldsWithRedaction() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let fileURL = directory.appending(path: "sidecar-support.wav")
    let ixml = """
      <?xml version="1.0" encoding="UTF-8"?>
      <BWFXML>
        <PROJECT>EXAMPLE SONG</PROJECT>
        <SCENE>Scene /Users/fixture/Music/Private</SCENE>
        <TAKE>Take 7</TAKE>
        <TAPE>person@example.com tape</TAPE>
        <NOTE>Send to person@example.com from /Users/fixture/Music/Private</NOTE>
        <TIMECODE>01:02:03:12</TIMECODE>
        <TIMECODE_RATE>25</TIMECODE_RATE>
        <USER><PRIVATE_NOTE>person@example.com at /Users/fixture/Music/Private</PRIVATE_NOTE></USER>
        <TRACK_LIST>
          <TRACK_COUNT>1</TRACK_COUNT>
          <TRACK>
            <CHANNEL_INDEX>1</CHANNEL_INDEX>
            <NAME>/Users/fixture/Music/Private/Lead Vocal.wav</NAME>
            <FUNCTION>Lead Vocal</FUNCTION>
          </TRACK>
        </TRACK_LIST>
      </BWFXML>
      """
    let axml = """
      <?xml version="1.0" encoding="UTF-8"?>
      <ebuCoreMain><title>Private Export</title></ebuCoreMain>
      """
    try RIFFFixtureBuilder.riffWave(
      chunks: [
        RIFFFixtureBuilder.chunk(
          "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 1)),
        RIFFFixtureBuilder.chunk("iXML", Data(ixml.utf8)),
        RIFFFixtureBuilder.chunk("axml", Data(axml.utf8)),
        RIFFFixtureBuilder.listInfo(["IART": "person@example.com"]),
        RIFFFixtureBuilder.chunk("data", Data([0, 1])),
      ]).write(to: fileURL)

    let parsed = try ExportDNAParser().parse(fileURL: fileURL)
    let evidence = ExportDNAAssociationEvidence(parsed: parsed)

    #expect(evidence.ixmlProject == "EXAMPLE SONG")
    #expect(evidence.ixmlScene == "Scene /Users/fixture/Music/Private")
    #expect(evidence.ixmlTake == "Take 7")
    #expect(evidence.ixmlTape == "person@example.com tape")
    #expect(evidence.ixmlTimecode == "01:02:03:12")
    #expect(evidence.ixmlTimecodeRate == "25")
    #expect(evidence.includesUntrustedDescriptiveMetadata == true)
    let unknown = try #require(evidence.untrustedIXMLFields.first)
    #expect(unknown.trust.source == .iXML)
    #expect(unknown.trust.level == .low)
    #expect(unknown.path == "BWFXML/USER/PRIVATE_NOTE")
    #expect(unknown.values == ["person@example.com at /Users/fixture/Music/Private"])

    let sidecar = StudioExportEvidenceSidecar(
      applicationVersion: "1.0-test",
      algorithmVersions: ["export-dna-parser-v1"],
      association: StudioExportEvidenceSidecarAssociation(
        confidence: "reviewed",
        reviewedRevisionID: "revision-1",
        reviewedWorkID: "work-1",
        reviewedSessionID: "session-1",
        evidence: ["Reviewed against /Users/fixture/Music/Private"]),
      observation: StudioExportEvidenceSidecarObservation(
        batchID: "batch-1",
        observedAt: Date(timeIntervalSince1970: 1_723_632_000),
        immutableObservationKeys: ["obs-1"],
        relativePaths: ["/Users/fixture/Music/Private/Master.wav"],
        exportDNA: evidence,
        notes: ["Contact person@example.com about /Users/fixture/Music/Private"]),
      files: [
        StudioExportEvidenceSidecarFile(
          relativePath: "/Users/fixture/Music/Private/Master.wav",
          bytes: 2,
          sha256: String(repeating: "a", count: 64))
      ])

    let rendered = try StudioExportEvidenceSidecarRenderer().render(sidecar)

    #expect(rendered.contains("<redacted path>"))
    #expect(rendered.contains("<redacted email>"))
    #expect(rendered.contains("/Users/fixture/Music/Private") == false)
    #expect(rendered.contains("person@example.com") == false)
    #expect(rendered.contains("PRIVATE_NOTE"))
  }

  @Test("Decodes schema-v1 association evidence without newer iXML fields")
  func decodesLegacyAssociationEvidence() throws {
    let legacy = Data(
      """
      {
        "containerKind": "RIFF",
        "ixmlTrackLabels": [],
        "contradictions": [],
        "includesUntrustedDescriptiveMetadata": false
      }
      """.utf8)

    let decoded = try JSONDecoder().decode(ExportDNAAssociationEvidence.self, from: legacy)

    #expect(decoded.containerKind == .riffWave)
    #expect(decoded.ixmlTimestamp == nil)
    #expect(decoded.untrustedIXMLFields.isEmpty)
  }

  @Test("Rejects duplicate singleton and INFO metadata chunks")
  func rejectsDuplicateMetadataChunks() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let format = RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)
    let bext = RIFFFixtureBuilder.bextChunk(
      version: 0, description: "", originator: "", originatorReference: "",
      originationDate: "2024-08-14", originationTime: "12:00:00", timeReference: 0,
      umidHex: nil, loudness: nil, codingHistory: "")
    let xml = Data("<BWFXML><PROJECT>A</PROJECT></BWFXML>".utf8)
    let axml = Data("<ebuCoreMain><title>A</title></ebuCoreMain>".utf8)
    let cases: [(String, [RIFFFixtureBuilder.ChunkSpec], ExportDNAParserError)] = [
      (
        "fmt",
        [RIFFFixtureBuilder.chunk("fmt ", format), RIFFFixtureBuilder.chunk("fmt ", format)],
        .duplicateChunk("fmt ")
      ),
      (
        "bext", [RIFFFixtureBuilder.chunk("bext", bext), RIFFFixtureBuilder.chunk("bext", bext)],
        .duplicateChunk("bext")
      ),
      (
        "ixml", [RIFFFixtureBuilder.chunk("iXML", xml), RIFFFixtureBuilder.chunk("iXML", xml)],
        .duplicateChunk("iXML")
      ),
      (
        "axml", [RIFFFixtureBuilder.chunk("axml", axml), RIFFFixtureBuilder.chunk("axml", axml)],
        .duplicateChunk("axml")
      ),
      (
        "info",
        [RIFFFixtureBuilder.listInfo(["IART": "A"]), RIFFFixtureBuilder.listInfo(["IART": "B"])],
        .duplicateChunk("LIST/INFO")
      ),
      (
        "info-field", [RIFFFixtureBuilder.listInfoPairs([("IART", "A"), ("IART", "B")])],
        .duplicateChunk("LIST/INFO/IART")
      ),
    ]
    for (name, metadataChunks, expectedError) in cases {
      let url = directory.appending(path: "duplicate-\(name).wav")
      try RIFFFixtureBuilder.riffWave(
        chunks: [RIFFFixtureBuilder.chunk("fmt ", format)] + metadataChunks
          + [RIFFFixtureBuilder.chunk("data", Data([0, 0]))]
      ).write(to: url)
      #expect(throws: expectedError) { _ = try ExportDNAParser().parse(fileURL: url) }
    }
  }

  @Test("Validates fmt invariants and exact extension length")
  func validatesFormatChunk() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let invalidFormats = [
      RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 0),
      RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 0, channels: 2),
      RIFFFixtureBuilder.pcmFormatChunk(
        sampleRate: 48_000, channels: 2, byteRate: 1),
      RIFFFixtureBuilder.pcmFormatChunk(
        sampleRate: 48_000, channels: 2, blockAlign: 1),
      RIFFFixtureBuilder.pcmFormatChunk(
        sampleRate: 48_000, channels: 2, declaredExtensionBytes: 2,
        extensionPayload: Data([0])),
      RIFFFixtureBuilder.pcmFormatChunk(
        sampleRate: 48_000, channels: 2, declaredExtensionBytes: 0,
        extensionPayload: Data([0])),
    ]
    for (index, format) in invalidFormats.enumerated() {
      let url = directory.appending(path: "invalid-fmt-\(index).wav")
      try RIFFFixtureBuilder.riffWave(
        chunks: [
          RIFFFixtureBuilder.chunk("fmt ", format),
          RIFFFixtureBuilder.chunk("data", Data([0, 0])),
        ]
      ).write(to: url)
      #expect(throws: ExportDNAParserError.invalidChunkLength("fmt ")) {
        _ = try ExportDNAParser().parse(fileURL: url)
      }
    }
  }

  @Test("Consumes each ds64 indirection exactly once including non-data chunks")
  func validatesDS64Consumption() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let format = RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)
    let positiveURL = directory.appending(path: "non-data-indirection.rf64")
    try RIFFFixtureBuilder.extendedWave(
      kind: .rf64Wave,
      dataChunkSize: 2,
      sampleCount: 1,
      otherExtendedSizes: [("JUNK", 3)],
      chunks: [
        RIFFFixtureBuilder.chunk("fmt ", format),
        RIFFFixtureBuilder.chunk("JUNK", Data([1, 2, 3]), usesExtendedSize: true),
        RIFFFixtureBuilder.chunk("data", Data([0, 0]), usesExtendedSize: true),
      ]
    ).write(to: positiveURL)
    let positive = try ExportDNAParser().parse(fileURL: positiveURL)
    #expect(positive.chunks.first { $0.id == "JUNK" }?.usesExtendedSize == true)
    #expect(positive.chunks.first { $0.id == "JUNK" }?.declaredSize == 3)

    let unusedURL = directory.appending(path: "unused-table.rf64")
    try RIFFFixtureBuilder.extendedWave(
      kind: .rf64Wave, dataChunkSize: 2, sampleCount: 1,
      otherExtendedSizes: [("JUNK", 3)],
      chunks: [
        RIFFFixtureBuilder.chunk("fmt ", format),
        RIFFFixtureBuilder.chunk("data", Data([0, 0]), usesExtendedSize: true),
      ]
    ).write(to: unusedURL)
    #expect(throws: ExportDNAParserError.invalidDS64("unused ds64 table entries: JUNK")) {
      _ = try ExportDNAParser().parse(fileURL: unusedURL)
    }

    let repeatedDataURL = directory.appending(path: "repeated-data.rf64")
    try RIFFFixtureBuilder.extendedWave(
      kind: .rf64Wave, dataChunkSize: 2, sampleCount: 1, otherExtendedSizes: [],
      chunks: [
        RIFFFixtureBuilder.chunk("fmt ", format),
        RIFFFixtureBuilder.chunk("data", Data([0, 0]), usesExtendedSize: true),
        RIFFFixtureBuilder.chunk("data", Data([0, 0]), usesExtendedSize: true),
      ]
    ).write(to: repeatedDataURL)
    #expect(throws: ExportDNAParserError.invalidDS64("ds64 dataSize cannot be reused")) {
      _ = try ExportDNAParser().parse(fileURL: repeatedDataURL)
    }
  }

  @Test("Preserves unknown iXML structure while reporting duplicate known conflicts")
  func preservesUnknownIXMLStructure() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appending(path: "structured-unknown.wav")
    let xml = """
      <BWFXML vendor="private@example.com">
        <PROJECT>ONE</PROJECT><PROJECT>TWO</PROJECT>
        <SPEED/><SPEED/>
        <TRACK_LIST><TRACK><CHANNEL_INDEX>1</CHANNEL_INDEX><CHANNEL_INDEX>2</CHANNEL_INDEX></TRACK></TRACK_LIST>
        <USER role="custom"><EMPTY/><TAG rank="1">A</TAG><TAG rank="2">B</TAG></USER>
      </BWFXML>
      """
    try RIFFFixtureBuilder.riffWave(chunks: [
      RIFFFixtureBuilder.chunk(
        "fmt ", RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)),
      RIFFFixtureBuilder.chunk("iXML", Data(xml.utf8)),
      RIFFFixtureBuilder.chunk("data", Data([0, 0])),
    ]).write(to: url)

    let parsed = try ExportDNAParser().parse(fileURL: url)
    #expect(parsed.contradictions.contains { $0.field == "duplicateIXML:PROJECT" })
    #expect(parsed.contradictions.contains { $0.field == "duplicateIXML:SPEED" })
    #expect(parsed.contradictions.contains { $0.field == "duplicateIXML:TRACK[1]/CHANNEL_INDEX" })
    let fields = try #require(parsed.ixml?.untrustedUnknownFields)
    #expect(fields.contains { $0.path == "BWFXML" && $0.attributes["vendor"] != nil })
    #expect(fields.contains { $0.path == "BWFXML/PROJECT[1]" && $0.values == ["ONE"] })
    #expect(fields.contains { $0.path == "BWFXML/USER" && $0.attributes["role"] == "custom" })
    #expect(fields.contains { $0.path == "BWFXML/USER/EMPTY" && $0.isEmptyElement })
    #expect(fields.contains { $0.path == "BWFXML/USER/TAG[2]" && $0.values == ["B"] })
  }

  @Test("Bounds metadata, rejects malformed XML, and skips a large audio payload")
  func handlesAdversarialMetadataAndLargePayload() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let format = RIFFFixtureBuilder.pcmFormatChunk(sampleRate: 48_000, channels: 2)
    let oversizedURL = directory.appending(path: "oversized-ixml.wav")
    try RIFFFixtureBuilder.riffWave(chunks: [
      RIFFFixtureBuilder.chunk("fmt ", format),
      RIFFFixtureBuilder.chunk("iXML", Data(repeating: 65, count: 65)),
      RIFFFixtureBuilder.chunk("data", Data([0, 0])),
    ]).write(to: oversizedURL)
    #expect(throws: ExportDNAParserError.metadataTooLarge("iXML", maximumBytes: 64)) {
      _ = try ExportDNAParser(maximumMetadataChunkBytes: 64).parse(fileURL: oversizedURL)
    }

    let malformedURL = directory.appending(path: "malformed-xml.wav")
    try RIFFFixtureBuilder.riffWave(chunks: [
      RIFFFixtureBuilder.chunk("fmt ", format),
      RIFFFixtureBuilder.chunk("iXML", Data("<BWFXML><PROJECT>broken</BWFXML>".utf8)),
      RIFFFixtureBuilder.chunk("data", Data([0, 0])),
    ]).write(to: malformedURL)
    #expect(throws: ExportDNAParserError.malformedXML("iXML")) {
      _ = try ExportDNAParser().parse(fileURL: malformedURL)
    }

    let negativeTrackURL = directory.appending(path: "negative-track.wav")
    try RIFFFixtureBuilder.riffWave(chunks: [
      RIFFFixtureBuilder.chunk("fmt ", format),
      RIFFFixtureBuilder.chunk(
        "iXML",
        Data(
          "<BWFXML><TRACK_LIST><TRACK><CHANNEL_INDEX>-1</CHANNEL_INDEX></TRACK></TRACK_LIST></BWFXML>"
            .utf8)),
      RIFFFixtureBuilder.chunk("data", Data([0, 0])),
    ]).write(to: negativeTrackURL)
    #expect(throws: ExportDNAParserError.malformedXML("iXML:CHANNEL_INDEX")) {
      _ = try ExportDNAParser().parse(fileURL: negativeTrackURL)
    }

    let largeURL = directory.appending(path: "large-audio.wav")
    let payload = Data(repeating: 0x5a, count: 8 * 1_024 * 1_024)
    try RIFFFixtureBuilder.riffWave(chunks: [
      RIFFFixtureBuilder.chunk("fmt ", format), RIFFFixtureBuilder.chunk("data", payload),
    ]).write(to: largeURL)
    let parsed = try ExportDNAParser(maximumMetadataChunkBytes: 64).parse(fileURL: largeURL)
    #expect(parsed.container.dataChunkSize == UInt64(payload.count))
  }

  @Test("Migrates sidecar schemas and enforces typed verified confidence")
  func validatesSidecarSchemaAndConfidence() throws {
    let digest = String(repeating: "a", count: 64)
    let binding = try ExportVerifiedAutomationBinding(
      planID: "plan", revisionNodeID: "revision", outputSHA256: digest)
    #expect(throws: StudioExportEvidenceSidecarError.verifiedAssociationEvidenceRequired) {
      _ = try StudioExportEvidenceSidecarAssociation(
        confidence: .verifiedAutomation, reviewedRevisionID: "revision",
        reviewedWorkID: nil, reviewedSessionID: nil, evidence: [])
    }
    #expect(throws: StudioExportEvidenceSidecarError.verifiedAssociationEvidenceRequired) {
      _ = try StudioExportVerifiedAssociationEvidence(
        automationBinding: binding, immutableObservationKey: "not-a-file-observation")
    }
    #expect(throws: StudioExportEvidenceSidecarError.verifiedAssociationEvidenceRequired) {
      _ = try StudioExportVerifiedAssociationEvidence(
        automationBinding: binding,
        immutableObservationKey: "sha256:\(digest):bytes:nope:mtime:0:resource:1:2")
    }
    let decodedOnlyEvidence = try StudioExportVerifiedAssociationEvidence(
      automationBinding: binding,
      immutableObservationKey: "sha256:\(digest):bytes:44:mtime:0:resource:1:2")
    #expect(decodedOnlyEvidence.authorityReceipt == nil)
    #expect(throws: StudioExportEvidenceSidecarError.verifiedAssociationEvidenceRequired) {
      _ = try StudioExportEvidenceSidecarAssociation(
        confidence: .verifiedAutomation, reviewedRevisionID: "revision",
        reviewedWorkID: nil, reviewedSessionID: nil, evidence: ["automation"],
        verifiedEvidence: decodedOnlyEvidence)
    }
    let verifiedReport = try StudioExportEvidenceSidecarAssociation(
      reportConfidence: .verifiedAutomation,
      reviewedRevisionID: "revision",
      reviewedWorkID: nil,
      reviewedSessionID: nil,
      evidence: ["persisted report only"],
      verifiedEvidence: decodedOnlyEvidence)
    #expect(
      StudioExportEvidenceSidecarAssociation(
        confidence: "verified", reviewedRevisionID: "revision", reviewedWorkID: nil,
        reviewedSessionID: nil, evidence: []
      ).confidence == .reviewed)

    let sidecar = StudioExportEvidenceSidecar(
      reportSchemaVersion: StudioExportEvidenceSidecar.currentSchemaVersion,
      migratedFromSchemaVersion: nil,
      applicationVersion: "1.0", algorithmVersions: ["parser-v1"],
      association: verifiedReport,
      observation: StudioExportEvidenceSidecarObservation(
        batchID: "batch", observedAt: Date(timeIntervalSince1970: 0),
        immutableObservationKeys: [decodedOnlyEvidence.immutableObservationKey], relativePaths: [],
        exportDNA: nil),
      files: [
        StudioExportEvidenceSidecarFile(relativePath: "Master.wav", bytes: 44, sha256: digest)
      ])
    let reconstructedSidecar = StudioExportEvidenceSidecar(
      applicationVersion: "1.0", algorithmVersions: [], association: verifiedReport,
      observation: StudioExportEvidenceSidecarObservation(
        batchID: "batch", observedAt: Date(timeIntervalSince1970: 0),
        immutableObservationKeys: [
          decodedOnlyEvidence.immutableObservationKey
        ], relativePaths: [], exportDNA: nil),
      files: [
        StudioExportEvidenceSidecarFile(relativePath: "Master.wav", bytes: 44, sha256: digest)
      ])
    #expect(reconstructedSidecar.association.confidence == .reviewed)
    let encoded = try JSONEncoder().encode(sidecar)
    let decoded = try JSONDecoder().decode(StudioExportEvidenceSidecar.self, from: encoded)
    #expect(decoded == sidecar)

    var future = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
    future["schemaVersion"] = StudioExportEvidenceSidecar.currentSchemaVersion + 1
    let futureData = try JSONSerialization.data(withJSONObject: future)
    #expect(
      throws: StudioExportEvidenceSidecarError.unsupportedSchemaVersion(
        StudioExportEvidenceSidecar.currentSchemaVersion + 1)
    ) {
      _ = try JSONDecoder().decode(StudioExportEvidenceSidecar.self, from: futureData)
    }

    var legacy = future
    legacy["schemaVersion"] = 1
    var association = try #require(legacy["association"] as? [String: Any])
    association["confidence"] = "verified"
    association.removeValue(forKey: "verifiedEvidence")
    legacy["association"] = association
    let migrated = try JSONDecoder().decode(
      StudioExportEvidenceSidecar.self,
      from: JSONSerialization.data(withJSONObject: legacy))
    #expect(migrated.schemaVersion == StudioExportEvidenceSidecar.currentSchemaVersion)
    #expect(migrated.migratedFromSchemaVersion == 1)
    #expect(migrated.association.confidence == .reviewed)
  }
}

private enum RIFFFixtureBuilder {
  struct ChunkSpec {
    let id: String
    let data: Data
    let usesExtendedSize: Bool
  }

  static func chunk(_ id: String, _ data: Data, usesExtendedSize: Bool = false) -> ChunkSpec {
    ChunkSpec(id: id, data: data, usesExtendedSize: usesExtendedSize)
  }

  static func listInfo(_ fields: [String: String]) -> ChunkSpec {
    var payload = Data("INFO".utf8)
    for key in fields.keys.sorted() {
      let text = fields[key] ?? ""
      let encoded = text.data(using: .isoLatin1) ?? Data(text.utf8)
      payload.append(rawChunk(id: key, data: encoded))
    }
    return chunk("LIST", payload)
  }

  static func listInfoPairs(_ fields: [(String, String)]) -> ChunkSpec {
    var payload = Data("INFO".utf8)
    for (key, text) in fields {
      payload.append(rawChunk(id: key, data: Data(text.utf8)))
    }
    return chunk("LIST", payload)
  }

  static func riffWave(chunks: [ChunkSpec]) -> Data {
    var body = Data("WAVE".utf8)
    for chunk in chunks {
      body.append(rawChunk(id: chunk.id, data: chunk.data))
    }
    return file(kind: "RIFF", sizeField: UInt32(body.count), body: body)
  }

  static func riffWave(rawChunks: [Data]) -> Data {
    var body = Data("WAVE".utf8)
    for rawChunk in rawChunks {
      body.append(rawChunk)
    }
    return file(kind: "RIFF", sizeField: UInt32(body.count), body: body)
  }

  static func extendedWave(
    kind: ExportWaveContainerKind,
    dataChunkSize: UInt64,
    sampleCount: UInt64,
    otherExtendedSizes: [(String, UInt64)],
    chunks: [ChunkSpec],
    chunksBeforeDS64: [ChunkSpec] = [],
    rootSizeField: UInt32 = UInt32.max,
    ds64TrailingBytes: Data = Data()
  ) -> Data {
    var ds64Payload = ds64Chunk(
      dataChunkSize: dataChunkSize,
      sampleCount: sampleCount,
      otherExtendedSizes: otherExtendedSizes)
    ds64Payload.append(ds64TrailingBytes)

    var body = Data("WAVE".utf8)
    for chunk in chunksBeforeDS64 {
      body.append(rawChunk(id: chunk.id, data: chunk.data))
    }
    body.append(rawChunk(id: "ds64", data: ds64Payload))

    for chunk in chunks {
      let declaredSize = chunk.usesExtendedSize ? UInt32.max : UInt32(chunk.data.count)
      body.append(rawChunkHeader(chunk.id, declaredSize: declaredSize))
      body.append(chunk.data)
      if chunk.data.count.isMultiple(of: 2) == false {
        body.append(0)
      }
    }

    return file(
      kind: kind.rawValue,
      sizeField: rootSizeField,
      body: body,
      overrideBodySize: UInt64(body.count))
  }

  static func pcmFormatChunk(
    sampleRate: UInt32,
    channels: UInt16,
    byteRate: UInt32? = nil,
    blockAlign: UInt16? = nil,
    declaredExtensionBytes: UInt16? = nil,
    extensionPayload: Data = Data()
  ) -> Data {
    var data = Data()
    data.append(littleEndian(channels == 0 ? UInt16(1) : UInt16(1)))
    data.append(littleEndian(channels))
    data.append(littleEndian(sampleRate))
    let calculatedByteRate = sampleRate * UInt32(channels) * 3
    data.append(littleEndian(byteRate ?? calculatedByteRate))
    data.append(littleEndian(blockAlign ?? UInt16(channels * 3)))
    data.append(littleEndian(UInt16(24)))
    if let declaredExtensionBytes {
      data.append(littleEndian(declaredExtensionBytes))
      data.append(extensionPayload)
    }
    return data
  }

  static func repairRIFFRootSize(_ data: inout Data) {
    data.replaceSubrange(4..<8, with: littleEndian(UInt32(data.count - 8)))
  }

  static func bextChunk(
    version: UInt16,
    description: String,
    originator: String,
    originatorReference: String,
    originationDate: String,
    originationTime: String,
    timeReference: UInt64,
    umidHex: String?,
    loudness: BroadcastWaveLoudnessMetadata?,
    codingHistory: String
  ) -> Data {
    var data = Data()
    data.append(fixedString(description, count: 256))
    data.append(fixedString(originator, count: 32))
    data.append(fixedString(originatorReference, count: 32))
    data.append(fixedString(originationDate, count: 10))
    data.append(fixedString(originationTime, count: 8))
    data.append(littleEndian(UInt32(truncatingIfNeeded: timeReference)))
    data.append(littleEndian(UInt32(truncatingIfNeeded: timeReference >> 32)))
    data.append(littleEndian(version))
    if version >= 1 {
      data.append(umidBytes(hex: umidHex))
    }
    if version >= 2 {
      let value =
        loudness
        ?? BroadcastWaveLoudnessMetadata(
          loudnessValue: 0,
          loudnessRange: 0,
          maxTruePeakLevel: 0,
          maxMomentaryLoudness: 0,
          maxShortTermLoudness: 0)
      data.append(littleEndian(UInt16(bitPattern: value.loudnessValue)))
      data.append(littleEndian(UInt16(bitPattern: value.loudnessRange)))
      data.append(littleEndian(UInt16(bitPattern: value.maxTruePeakLevel)))
      data.append(littleEndian(UInt16(bitPattern: value.maxMomentaryLoudness)))
      data.append(littleEndian(UInt16(bitPattern: value.maxShortTermLoudness)))
    }
    let reservedBytes = max(0, 602 - data.count)
    data.append(Data(repeating: 0, count: reservedBytes))
    data.append(Data(codingHistory.utf8))
    return data
  }

  static func rawChunkHeader(_ id: String, declaredSize: UInt32) -> Data {
    var data = Data(id.utf8)
    data.append(littleEndian(declaredSize))
    return data
  }

  private static func rawChunk(id: String, data: Data) -> Data {
    var result = rawChunkHeader(id, declaredSize: UInt32(data.count))
    result.append(data)
    if data.count.isMultiple(of: 2) == false {
      result.append(0)
    }
    return result
  }

  private static func ds64Chunk(
    dataChunkSize: UInt64,
    sampleCount: UInt64,
    otherExtendedSizes: [(String, UInt64)]
  ) -> Data {
    var payload = Data()
    payload.append(Data(repeating: 0, count: 8))
    payload.append(littleEndian(dataChunkSize))
    payload.append(littleEndian(sampleCount))
    payload.append(littleEndian(UInt32(otherExtendedSizes.count)))
    for (id, size) in otherExtendedSizes {
      payload.append(Data(id.utf8))
      payload.append(littleEndian(size))
    }
    return payload
  }

  private static func file(
    kind: String,
    sizeField: UInt32,
    body: Data,
    overrideBodySize: UInt64? = nil
  ) -> Data {
    var data = Data(kind.utf8)
    data.append(littleEndian(sizeField))
    data.append(body)
    if let overrideBodySize {
      var bytes = data
      let riffSize = overrideBodySize
      let encoded = littleEndian(riffSize)
      let ds64Offset = 12 + 8
      bytes.replaceSubrange(ds64Offset..<ds64Offset + 8, with: encoded)
      return bytes
    }
    return data
  }

  private static func fixedString(_ value: String, count: Int) -> Data {
    let latin1 = value.data(using: .isoLatin1) ?? Data(value.utf8.prefix(count))
    if latin1.count >= count {
      return latin1.prefix(count)
    }
    return latin1 + Data(repeating: 0, count: count - latin1.count)
  }

  private static func umidBytes(hex: String?) -> Data {
    guard let hex else { return Data(repeating: 0, count: 64) }
    var bytes = Data()
    var index = hex.startIndex
    while index < hex.endIndex {
      let next = hex.index(index, offsetBy: 2)
      bytes.append(UInt8(hex[index..<next], radix: 16) ?? 0)
      index = next
    }
    if bytes.count < 64 {
      bytes.append(Data(repeating: 0, count: 64 - bytes.count))
    }
    return bytes.prefix(64)
  }

  static func paddedUMIDHex(_ hex: String?) -> String? {
    guard let hex else { return nil }
    return umidBytes(hex: hex).map { String(format: "%02x", $0) }.joined()
  }

  private static func littleEndian(_ value: UInt16) -> Data {
    withUnsafeBytes(of: value.littleEndian) { Data($0) }
  }

  private static func littleEndian(_ value: UInt32) -> Data {
    withUnsafeBytes(of: value.littleEndian) { Data($0) }
  }

  private static func littleEndian(_ value: UInt64) -> Data {
    withUnsafeBytes(of: value.littleEndian) { Data($0) }
  }
}
