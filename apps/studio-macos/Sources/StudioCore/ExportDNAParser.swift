import Foundation

public enum ExportDNAParserError: Error, Sendable, Equatable {
  case invalidContainer(String)
  case unsupportedFormType(String)
  case malformedRootSize
  case missingDS64
  case invalidChunkLength(String)
  case truncated(String)
  case integerOverflow
  case metadataTooLarge(String, maximumBytes: Int)
  case malformedXML(String)
  case invalidDS64(String)
  case unsupportedBroadcastWaveVersion(UInt16)
  case xmlComplexityLimit(String)
  case duplicateChunk(String)
}

public struct ExportDNAParser: Sendable {
  public let maximumMetadataChunkBytes: Int
  public let maximumXMLDepth: Int
  public let maximumXMLNodeCount: Int
  public let maximumXMLTextBytes: Int

  public init(
    maximumMetadataChunkBytes: Int = 1_048_576,
    maximumXMLDepth: Int = 64,
    maximumXMLNodeCount: Int = 8_192,
    maximumXMLTextBytes: Int = 1_048_576
  ) {
    self.maximumMetadataChunkBytes = max(0, maximumMetadataChunkBytes)
    self.maximumXMLDepth = max(0, maximumXMLDepth)
    self.maximumXMLNodeCount = max(0, maximumXMLNodeCount)
    self.maximumXMLTextBytes = max(0, maximumXMLTextBytes)
  }

  public func parse(fileURL: URL) throws -> ParsedExportDNA {
    let handle = try FileHandle(forReadingFrom: fileURL)
    defer { try? handle.close() }

    let fileSize = try handle.seekToEnd()
    try handle.seek(toOffset: 0)
    let header = try readExact(handle, count: 12, label: "RIFF header")
    let containerID = header.fourCC(at: 0)
    guard let kind = ExportWaveContainerKind(rawValue: containerID) else {
      throw ExportDNAParserError.invalidContainer(containerID)
    }
    let declaredRootSize = UInt64(header.uint32(at: 4))
    let formType = header.fourCC(at: 8)
    guard formType == "WAVE" else { throw ExportDNAParserError.unsupportedFormType(formType) }

    if kind == .riffWave {
      guard declaredRootSize == fileSize - 8 else {
        throw ExportDNAParserError.malformedRootSize
      }
    } else {
      guard declaredRootSize == UInt64(UInt32.max) else {
        throw ExportDNAParserError.malformedRootSize
      }
    }

    var ds64Chunk: RF64DataSizeChunk?
    var extendedSizeTable: [String: [UInt64]] = [:]
    var formatChunk: ExportWaveFormat?
    var bextChunk: BroadcastWaveMetadata?
    var ixmlChunk: ExportIXMLMetadata?
    var axmlChunk: ExportAXMLMetadata?
    var infoChunk: ExportRIFFInfoMetadata?
    var dataChunkSize: UInt64?
    var dataSizeConsumed = false
    var intrinsicContradictions: [ExportMetadataContradiction] = []
    var chunkTable: [ExportChunkDescriptor] = []
    var offset: UInt64 = 12

    while offset < fileSize {
      let remaining = fileSize - offset
      guard remaining >= 8 else { throw ExportDNAParserError.truncated("chunk header") }

      try handle.seek(toOffset: offset)
      let chunkHeader = try readExact(handle, count: 8, label: "chunk header")
      let chunkID = chunkHeader.fourCC(at: 0)
      let chunkSizeField = chunkHeader.uint32(at: 4)
      if kind != .riffWave, offset == 12, chunkID != "ds64" {
        throw ExportDNAParserError.missingDS64
      }
      let dataOffset = try adding(offset, 8)
      let (chunkSize, usesExtendedSize) = try resolveChunkSize(
        kind: kind,
        chunkID: chunkID,
        sizeField: chunkSizeField,
        ds64Chunk: ds64Chunk,
        extendedSizeTable: &extendedSizeTable,
        dataSizeConsumed: &dataSizeConsumed)
      let payloadEnd = try adding(dataOffset, chunkSize)
      guard payloadEnd <= fileSize else { throw ExportDNAParserError.invalidChunkLength(chunkID) }
      let paddedSize = try paddedChunkSize(for: chunkSize)
      let chunkEnd = try adding(dataOffset, paddedSize)
      guard chunkEnd <= fileSize else { throw ExportDNAParserError.truncated(chunkID) }

      chunkTable.append(
        ExportChunkDescriptor(
          id: chunkID,
          dataOffset: dataOffset,
          declaredSize: chunkSize,
          paddedSize: paddedSize,
          usesExtendedSize: usesExtendedSize))

      switch chunkID {
      case "ds64" where kind != .riffWave:
        guard ds64Chunk == nil else {
          throw ExportDNAParserError.invalidDS64("duplicate ds64 chunk")
        }
        let data = try readChunkData(handle, chunkID: chunkID, size: chunkSize)
        let parsed = try parseDS64(data)
        guard parsed.chunk.riffSize == fileSize - 8 else {
          throw ExportDNAParserError.malformedRootSize
        }
        ds64Chunk = parsed.chunk
        extendedSizeTable = parsed.extendedSizeTable
      case "fmt ":
        guard formatChunk == nil else { throw ExportDNAParserError.duplicateChunk("fmt ") }
        let data = try readChunkData(handle, chunkID: chunkID, size: chunkSize)
        formatChunk = try parseFormatChunk(data)
      case "bext":
        guard bextChunk == nil else { throw ExportDNAParserError.duplicateChunk("bext") }
        let data = try readChunkData(handle, chunkID: chunkID, size: chunkSize)
        bextChunk = try parseBroadcastWaveChunk(data, sampleRate: formatChunk?.sampleRate)
      case "iXML":
        guard ixmlChunk == nil else { throw ExportDNAParserError.duplicateChunk("iXML") }
        let data = try readChunkData(handle, chunkID: chunkID, size: chunkSize)
        let parsed = try parseIXMLChunk(data)
        ixmlChunk = parsed.metadata
        intrinsicContradictions.append(contentsOf: parsed.contradictions)
      case "axml":
        guard axmlChunk == nil else { throw ExportDNAParserError.duplicateChunk("axml") }
        let data = try readChunkData(handle, chunkID: chunkID, size: chunkSize)
        axmlChunk = try parseAXMLChunk(data)
      case "LIST":
        if let parsed = try parseLISTChunk(handle, dataOffset: dataOffset, size: chunkSize) {
          guard infoChunk == nil else {
            throw ExportDNAParserError.duplicateChunk("LIST/INFO")
          }
          infoChunk = parsed
        }
      case "data":
        guard dataChunkSize == nil else { throw ExportDNAParserError.duplicateChunk("data") }
        if kind != .riffWave, chunkSizeField != UInt32.max {
          throw ExportDNAParserError.invalidDS64(
            "RF64/BW64 data chunks must use the ds64 data size")
        }
        dataChunkSize = chunkSize
      default:
        break
      }

      offset = chunkEnd
    }

    try validateRootSize(
      kind: kind,
      declaredRootSize: declaredRootSize,
      ds64Chunk: ds64Chunk,
      fileSize: fileSize)
    if kind != .riffWave {
      guard dataSizeConsumed else {
        throw ExportDNAParserError.invalidDS64("ds64 dataSize was not consumed")
      }
      guard extendedSizeTable.isEmpty else {
        let unused = extendedSizeTable.keys.sorted().joined(separator: ",")
        throw ExportDNAParserError.invalidDS64("unused ds64 table entries: \(unused)")
      }
    }

    if let sampleRate = formatChunk?.sampleRate, let currentBext = bextChunk,
      currentBext.timeReference.sampleRate == nil
    {
      bextChunk = currentBext.backfillingSampleRate(sampleRate)
    }

    let contradictions =
      intrinsicContradictions
      + contradictions(format: formatChunk, bext: bextChunk, ixml: ixmlChunk)
    let container = ExportWaveContainer(
      kind: kind,
      formType: formType,
      riffSize: fileSize - 8,
      physicalFileSize: fileSize,
      ds64: ds64Chunk,
      format: formatChunk,
      dataChunkSize: dataChunkSize)
    return ParsedExportDNA(
      container: container,
      chunks: chunkTable,
      bext: bextChunk,
      ixml: ixmlChunk,
      axml: axmlChunk,
      info: infoChunk,
      contradictions: contradictions)
  }

  private func validateRootSize(
    kind: ExportWaveContainerKind,
    declaredRootSize: UInt64,
    ds64Chunk: RF64DataSizeChunk?,
    fileSize: UInt64
  ) throws {
    let actualRootSize = fileSize - 8
    switch kind {
    case .riffWave:
      guard declaredRootSize == actualRootSize else {
        throw ExportDNAParserError.malformedRootSize
      }
    case .rf64Wave, .bw64Wave:
      guard let ds64Chunk else { throw ExportDNAParserError.missingDS64 }
      guard ds64Chunk.riffSize == actualRootSize else {
        throw ExportDNAParserError.malformedRootSize
      }
      guard declaredRootSize == UInt64(UInt32.max) else {
        throw ExportDNAParserError.malformedRootSize
      }
    }
  }

  private func resolveChunkSize(
    kind: ExportWaveContainerKind,
    chunkID: String,
    sizeField: UInt32,
    ds64Chunk: RF64DataSizeChunk?,
    extendedSizeTable: inout [String: [UInt64]],
    dataSizeConsumed: inout Bool
  ) throws -> (UInt64, Bool) {
    guard sizeField == UInt32.max else { return (UInt64(sizeField), false) }
    guard kind != .riffWave else {
      throw ExportDNAParserError.invalidChunkLength(chunkID)
    }
    guard ds64Chunk != nil else { throw ExportDNAParserError.missingDS64 }
    if chunkID == "data" {
      guard !dataSizeConsumed else {
        throw ExportDNAParserError.invalidDS64("ds64 dataSize cannot be reused")
      }
      dataSizeConsumed = true
      return (ds64Chunk?.dataSize ?? 0, true)
    }
    guard var entries = extendedSizeTable[chunkID], let size = entries.first else {
      throw ExportDNAParserError.invalidChunkLength(chunkID)
    }
    entries.removeFirst()
    if entries.isEmpty {
      extendedSizeTable.removeValue(forKey: chunkID)
    } else {
      extendedSizeTable[chunkID] = entries
    }
    return (size, true)
  }

  private func readChunkData(_ handle: FileHandle, chunkID: String, size: UInt64) throws -> Data {
    guard size <= UInt64(maximumMetadataChunkBytes) else {
      throw ExportDNAParserError.metadataTooLarge(chunkID, maximumBytes: maximumMetadataChunkBytes)
    }
    return try readExact(handle, count: Int(size), label: chunkID)
  }

  private func parseDS64(_ data: Data) throws -> (
    chunk: RF64DataSizeChunk, extendedSizeTable: [String: [UInt64]]
  ) {
    guard data.count >= 28 else { throw ExportDNAParserError.invalidChunkLength("ds64") }
    let riffSize = data.uint64(at: 0)
    let dataSize = data.uint64(at: 8)
    let sampleCount = data.uint64(at: 16)
    let tableCount = Int(data.uint32(at: 24))
    let expectedBytes = try adding(28, try multiplying(tableCount, 12))
    guard expectedBytes == data.count else {
      throw ExportDNAParserError.invalidDS64(
        "ds64 table length does not match the chunk payload")
    }

    var entries: [RF64ExtendedSizeEntry] = []
    entries.reserveCapacity(tableCount)
    var table: [String: [UInt64]] = [:]
    var offset = 28
    for _ in 0..<tableCount {
      let chunkID = data.fourCC(at: offset)
      guard chunkID != "data", chunkID != "ds64" else {
        throw ExportDNAParserError.invalidDS64(
          "ds64 table entries may only describe non-data chunks")
      }
      let size = data.uint64(at: offset + 4)
      entries.append(RF64ExtendedSizeEntry(chunkID: chunkID, size: size))
      table[chunkID, default: []].append(size)
      offset += 12
    }

    return (
      RF64DataSizeChunk(
        riffSize: riffSize,
        dataSize: dataSize,
        sampleCount: sampleCount,
        tableEntries: entries),
      table
    )
  }

  private func parseFormatChunk(_ data: Data) throws -> ExportWaveFormat {
    guard data.count >= 16 else { throw ExportDNAParserError.invalidChunkLength("fmt ") }
    let formatTag = data.uint16(at: 0)
    let channelCount = data.uint16(at: 2)
    let sampleRate = data.uint32(at: 4)
    let bytesPerSecond = data.uint32(at: 8)
    let blockAlign = data.uint16(at: 12)
    let bitsPerSample = data.count >= 16 ? data.uint16(at: 14) : nil
    let extensionBytes = data.count >= 18 ? data.uint16(at: 16) : nil
    guard formatTag != 0, channelCount > 0, sampleRate > 0, bytesPerSecond > 0,
      blockAlign > 0, let bitsPerSample, bitsPerSample > 0
    else {
      throw ExportDNAParserError.invalidChunkLength("fmt ")
    }
    if data.count != 16 {
      guard let extensionBytes else {
        throw ExportDNAParserError.invalidChunkLength("fmt ")
      }
      let requiredBytes = try adding(18, Int(extensionBytes))
      guard requiredBytes == data.count else {
        throw ExportDNAParserError.invalidChunkLength("fmt ")
      }
    }
    if formatTag == 0xfffe {
      guard let extensionBytes, extensionBytes >= 22, data.count >= 40 else {
        throw ExportDNAParserError.invalidChunkLength("fmt ")
      }
    }
    if formatTag == 1 || formatTag == 3 || formatTag == 0xfffe {
      let bytesPerSample = (UInt32(bitsPerSample) + 7) / 8
      let expectedBlockAlign = UInt32(channelCount) * bytesPerSample
      let expectedByteRate = UInt64(sampleRate) * UInt64(blockAlign)
      guard expectedBlockAlign == UInt32(blockAlign),
        expectedByteRate <= UInt64(UInt32.max), UInt32(expectedByteRate) == bytesPerSecond
      else {
        throw ExportDNAParserError.invalidChunkLength("fmt ")
      }
    }
    return ExportWaveFormat(
      formatTag: formatTag,
      channelCount: channelCount,
      sampleRate: sampleRate,
      bytesPerSecond: bytesPerSecond,
      blockAlign: blockAlign,
      bitsPerSample: bitsPerSample,
      extensionBytes: extensionBytes)
  }

  private func parseBroadcastWaveChunk(
    _ data: Data,
    sampleRate: UInt32?
  ) throws -> BroadcastWaveMetadata {
    guard data.count >= 602 else { throw ExportDNAParserError.invalidChunkLength("bext") }
    let description = data.fixedWidthString(at: 0, count: 256)
    let originator = data.fixedWidthString(at: 256, count: 32)
    let originatorReference = data.fixedWidthString(at: 288, count: 32)
    let originationDate = data.fixedWidthString(at: 320, count: 10)
    let originationTime = data.fixedWidthString(at: 330, count: 8)
    let timeReferenceLow = UInt64(data.uint32(at: 338))
    let timeReferenceHigh = UInt64(data.uint32(at: 342))
    let timeReference = ExportSampleTimeReference(
      samplesSinceOrigin: (timeReferenceHigh << 32) | timeReferenceLow,
      sampleRate: sampleRate)
    let version = data.uint16(at: 346)
    guard version <= 2 else {
      throw ExportDNAParserError.unsupportedBroadcastWaveVersion(version)
    }
    let reservedRange: Range<Int>
    switch version {
    case 0: reservedRange = 348..<602
    case 1: reservedRange = 412..<602
    default: reservedRange = 422..<602
    }
    guard !data[reservedRange].contains(where: { $0 != 0 }) else {
      throw ExportDNAParserError.invalidChunkLength("bext")
    }

    var umidHex: String?
    if version >= 1 {
      let umidData = data.subdata(in: 348..<412)
      if umidData.contains(where: { $0 != 0 }) {
        umidHex = umidData.map { String(format: "%02x", $0) }.joined()
      }
    }

    var loudness: BroadcastWaveLoudnessMetadata?
    if version >= 2 {
      loudness = BroadcastWaveLoudnessMetadata(
        loudnessValue: Int16(bitPattern: data.uint16(at: 412)),
        loudnessRange: Int16(bitPattern: data.uint16(at: 414)),
        maxTruePeakLevel: Int16(bitPattern: data.uint16(at: 416)),
        maxMomentaryLoudness: Int16(bitPattern: data.uint16(at: 418)),
        maxShortTermLoudness: Int16(bitPattern: data.uint16(at: 420)))
    }

    let codingHistoryOffset = min(data.count, 602)
    let codingHistory =
      codingHistoryOffset < data.count
      ? normalizedText(data.subdata(in: codingHistoryOffset..<data.count), trimWhitespace: true)
      : nil

    return BroadcastWaveMetadata(
      trust: .bext,
      description: description,
      originator: originator,
      originatorReference: originatorReference,
      originationDate: originationDate,
      originationTime: originationTime,
      timeReference: timeReference,
      version: version,
      umidHex: umidHex,
      loudness: loudness,
      codingHistory: codingHistory)
  }

  private func parseIXMLChunk(_ data: Data) throws -> (
    metadata: ExportIXMLMetadata, contradictions: [ExportMetadataContradiction]
  ) {
    let root = try parseXML(data, chunkID: "iXML")
    guard root.name == "BWFXML" else {
      throw ExportDNAParserError.malformedXML("iXML")
    }
    let speed = root.child(named: "SPEED")
    let timestamp = try parseIXMLTimestamp(speed)
    let tracks =
      try root.child(named: "TRACK_LIST")?.children(named: "TRACK").map {
        ExportIXMLTrack(
          channelIndex: try positiveInt(
            $0.child(named: "CHANNEL_INDEX")?.text, field: "CHANNEL_INDEX"),
          interleaveIndex: try positiveInt(
            $0.child(named: "INTERLEAVE_INDEX")?.text, field: "INTERLEAVE_INDEX"),
          name: $0.child(named: "NAME")?.text,
          function: $0.child(named: "FUNCTION")?.text)
      } ?? []

    let metadata = ExportIXMLMetadata(
      trust: .ixml,
      rootElementName: root.name,
      project: root.child(named: "PROJECT")?.text,
      note: root.child(named: "NOTE")?.text,
      scene: firstText(in: root, paths: [["SCENE"]]),
      take: firstText(in: root, paths: [["TAKE"]]),
      tape: firstText(in: root, paths: [["TAPE"]]),
      timecode: firstText(
        in: root,
        paths: [
          ["TIMECODE"],
          ["TIMECODE_START"],
          ["TIMECODE", "TIMECODE_START"],
          ["SPEED", "TIMECODE"],
        ]),
      timecodeRate: firstText(
        in: root,
        paths: [
          ["TIMECODE_RATE"],
          ["TIMECODE", "TIMECODE_RATE"],
          ["SPEED", "TIMECODE_RATE"],
        ]),
      fileSampleRate: try positiveUInt32(
        speed?.child(named: "FILE_SAMPLE_RATE")?.text,
        field: "FILE_SAMPLE_RATE"),
      trackCount: try positiveInt(
        root.child(path: ["TRACK_LIST", "TRACK_COUNT"])?.text,
        field: "TRACK_COUNT"),
      tracks: tracks,
      timecodeFlag: speed?.child(named: "TIMECODE_FLAG")?.text,
      timestamp: timestamp,
      ixmlVersion: root.child(named: "IXML_VERSION")?.text,
      fileUID: root.child(named: "FILE_UID")?.text,
      untrustedUnknownFields: untrustedIXMLFields(in: root))
    return (metadata, duplicateIXMLContradictions(in: root))
  }

  private func parseAXMLChunk(_ data: Data) throws -> ExportAXMLMetadata {
    let root = try parseXML(data, chunkID: "axml")
    return ExportAXMLMetadata(
      trust: .axml,
      rootElementName: root.name,
      textByPath: root.flattenedLeafText())
  }

  private func parseLISTInfoChunk(_ data: Data) throws -> ExportRIFFInfoMetadata? {
    guard data.count >= 4 else { throw ExportDNAParserError.invalidChunkLength("LIST") }
    guard data.fourCC(at: 0) == "INFO" else { return nil }

    var fields: [String: String] = [:]
    var seenFieldIDs: Set<String> = []
    var offset = 4
    while offset < data.count {
      let remaining = data.count - offset
      guard remaining >= 8 else { throw ExportDNAParserError.truncated("LIST") }
      let chunkID = data.fourCC(at: offset)
      guard seenFieldIDs.insert(chunkID).inserted else {
        throw ExportDNAParserError.duplicateChunk("LIST/INFO/\(chunkID)")
      }
      let chunkSize = Int(data.uint32(at: offset + 4))
      let payloadStart = try adding(offset, 8)
      let payloadEnd = try adding(payloadStart, chunkSize)
      guard payloadEnd <= data.count else {
        throw ExportDNAParserError.invalidChunkLength(chunkID)
      }
      let paddedEnd = try adding(payloadEnd, chunkSize.isMultiple(of: 2) ? 0 : 1)
      guard paddedEnd <= data.count else { throw ExportDNAParserError.truncated(chunkID) }
      let value = normalizedText(
        data.subdata(in: payloadStart..<payloadEnd),
        preferredEncoding: .isoLatin1,
        trimWhitespace: false)
      if let value { fields[chunkID] = value }
      offset = paddedEnd
    }

    return ExportRIFFInfoMetadata(trust: .riffInfo, fields: fields)
  }

  private func parseLISTChunk(
    _ handle: FileHandle,
    dataOffset: UInt64,
    size: UInt64
  ) throws -> ExportRIFFInfoMetadata? {
    guard size >= 4 else { throw ExportDNAParserError.invalidChunkLength("LIST") }
    let listTypeData = try readExact(handle, count: 4, label: "LIST")
    guard listTypeData.fourCC(at: 0) == "INFO" else { return nil }
    try handle.seek(toOffset: dataOffset)
    let data = try readChunkData(handle, chunkID: "LIST", size: size)
    return try parseLISTInfoChunk(data)
  }

  private func contradictions(
    format: ExportWaveFormat?,
    bext: BroadcastWaveMetadata?,
    ixml: ExportIXMLMetadata?
  ) -> [ExportMetadataContradiction] {
    var contradictions: [ExportMetadataContradiction] = []
    if let bext, !validBextOrigination(date: bext.originationDate, time: bext.originationTime) {
      contradictions.append(
        ExportMetadataContradiction(
          field: "bextOriginationDateTime",
          containerValue: "unavailable",
          metadataSource: .bext,
          metadataValue: "\(bext.originationDate)T\(bext.originationTime)",
          explanation: "The bext origination date or time is malformed and was not promoted."))
    }
    guard let ixml else { return contradictions }
    if let timestamp = ixml.timestamp, let bext,
      timestamp.samplesSinceMidnight != bext.timeReference.samplesSinceOrigin
    {
      contradictions.append(
        ExportMetadataContradiction(
          field: "timeReference",
          containerValue: String(bext.timeReference.samplesSinceOrigin),
          metadataSource: .iXML,
          metadataValue: String(timestamp.samplesSinceMidnight),
          explanation:
            "The authoritative bext time reference disagrees with the redundant iXML timestamp."))
    }
    if let format {
      if let fileSampleRate = ixml.fileSampleRate, fileSampleRate != format.sampleRate {
        contradictions.append(
          ExportMetadataContradiction(
            field: "sampleRate",
            containerValue: String(format.sampleRate),
            metadataSource: .iXML,
            metadataValue: String(fileSampleRate),
            explanation: "The container fmt sample rate disagrees with iXML FILE_SAMPLE_RATE."))
      }
      if let trackCount = ixml.trackCount, trackCount != Int(format.channelCount) {
        contradictions.append(
          ExportMetadataContradiction(
            field: "trackCount",
            containerValue: String(format.channelCount),
            metadataSource: .iXML,
            metadataValue: String(trackCount),
            explanation: "The container channel count disagrees with the declared iXML track count."
          ))
      }
      if !ixml.tracks.isEmpty, ixml.tracks.count != Int(format.channelCount) {
        contradictions.append(
          ExportMetadataContradiction(
            field: "trackList",
            containerValue: String(format.channelCount),
            metadataSource: .iXML,
            metadataValue: String(ixml.tracks.count),
            explanation:
              "The number of explicit iXML track entries disagrees with the fmt channel count."))
      }
    }
    if let trackCount = ixml.trackCount, trackCount != ixml.tracks.count, !ixml.tracks.isEmpty {
      contradictions.append(
        ExportMetadataContradiction(
          field: "trackListCount",
          containerValue: String(trackCount),
          metadataSource: .iXML,
          metadataValue: String(ixml.tracks.count),
          explanation:
            "The declared iXML track count disagrees with the number of explicit iXML track entries."
        ))
    }
    return contradictions
  }

  private func validBextOrigination(date: String, time: String) -> Bool {
    if date.isEmpty && time.isEmpty { return true }
    guard date.count == 10, time.count == 8 else { return false }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
    formatter.isLenient = false
    let raw = "\(date)T\(time)"
    guard let parsed = formatter.date(from: raw) else { return false }
    return formatter.string(from: parsed) == raw
  }

  private func firstText(in root: XMLNode, paths: [[String]]) -> String? {
    for path in paths {
      if let value = root.child(path: path)?.text {
        return value
      }
    }
    return nil
  }

  private func parseXML(_ data: Data, chunkID: String) throws -> XMLNode {
    try XMLTreeParser.parse(
      data: data,
      chunkID: chunkID,
      limits: XMLTreeParser.Limits(
        maximumDepth: maximumXMLDepth,
        maximumNodeCount: maximumXMLNodeCount,
        maximumTextBytes: maximumXMLTextBytes))
  }

  private func parseIXMLTimestamp(_ speed: XMLNode?) throws -> ExportIXMLTimestamp? {
    let highText = speed?.child(named: "TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI")?.text
    let lowText = speed?.child(named: "TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO")?.text
    guard highText != nil || lowText != nil else { return nil }
    guard let highText, let lowText,
      let high = UInt32(highText), let low = UInt32(lowText)
    else {
      throw ExportDNAParserError.malformedXML("iXML")
    }
    let sampleRate = try positiveUInt32(
      speed?.child(named: "TIMESTAMP_SAMPLE_RATE")?.text,
      field: "TIMESTAMP_SAMPLE_RATE")
    return ExportIXMLTimestamp(
      samplesSinceMidnight: (UInt64(high) << 32) | UInt64(low),
      sampleRate: sampleRate)
  }

  private func positiveUInt32(_ text: String?, field: String) throws -> UInt32? {
    guard let text else { return nil }
    guard let value = UInt32(text), value > 0 else {
      throw ExportDNAParserError.malformedXML("iXML:\(field)")
    }
    return value
  }

  private func positiveInt(_ text: String?, field: String) throws -> Int? {
    guard let text else { return nil }
    guard let value = Int(text), value > 0 else {
      throw ExportDNAParserError.malformedXML("iXML:\(field)")
    }
    return value
  }

  private func duplicateIXMLContradictions(
    in root: XMLNode
  ) -> [ExportMetadataContradiction] {
    let knownScalarPaths: [([String], String)] = [
      (["IXML_VERSION"], "IXML_VERSION"),
      (["PROJECT"], "PROJECT"),
      (["SCENE"], "SCENE"),
      (["TAKE"], "TAKE"),
      (["TAPE"], "TAPE"),
      (["NOTE"], "NOTE"),
      (["FILE_UID"], "FILE_UID"),
      (["TIMECODE"], "TIMECODE"),
      (["TIMECODE_START"], "TIMECODE_START"),
      (["TIMECODE_RATE"], "TIMECODE_RATE"),
      (["TIMECODE", "TIMECODE_START"], "TIMECODE/TIMECODE_START"),
      (["TIMECODE", "TIMECODE_RATE"], "TIMECODE/TIMECODE_RATE"),
      (["SPEED", "TIMECODE"], "SPEED/TIMECODE"),
      (["SPEED", "TIMECODE_RATE"], "SPEED/TIMECODE_RATE"),
      (["SPEED", "TIMECODE_FLAG"], "SPEED/TIMECODE_FLAG"),
      (["SPEED", "FILE_SAMPLE_RATE"], "SPEED/FILE_SAMPLE_RATE"),
      (
        ["SPEED", "TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI"],
        "SPEED/TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI"
      ),
      (
        ["SPEED", "TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO"],
        "SPEED/TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO"
      ),
      (["SPEED", "TIMESTAMP_SAMPLE_RATE"], "SPEED/TIMESTAMP_SAMPLE_RATE"),
      (["TRACK_LIST", "TRACK_COUNT"], "TRACK_LIST/TRACK_COUNT"),
    ]
    var contradictions: [ExportMetadataContradiction] = knownScalarPaths.compactMap {
      path, field -> ExportMetadataContradiction? in
      let values = root.nodes(path: path).compactMap(\.text)
      guard values.count > 1, Set(values).count > 1, let first = values.first else { return nil }
      return ExportMetadataContradiction(
        field: "duplicateIXML:\(field)",
        containerValue: first,
        metadataSource: .iXML,
        metadataValue: values.dropFirst().joined(separator: " | "),
        explanation: "Duplicate known iXML field \(field) contains contradictory values.")
    }
    for (path, field) in [(["SPEED"], "SPEED"), (["TRACK_LIST"], "TRACK_LIST")] {
      let count = root.nodes(path: path).count
      if count > 1 {
        contradictions.append(
          ExportMetadataContradiction(
            field: "duplicateIXML:\(field)",
            containerValue: "1",
            metadataSource: .iXML,
            metadataValue: String(count),
            explanation: "Duplicate iXML \(field) containers are ambiguous."))
      }
    }
    let trackFields = ["CHANNEL_INDEX", "INTERLEAVE_INDEX", "NAME", "FUNCTION"]
    for (trackIndex, track) in root.nodes(path: ["TRACK_LIST", "TRACK"]).enumerated() {
      for field in trackFields {
        let values = track.nodes(path: [field]).compactMap(\.text)
        guard values.count > 1, Set(values).count > 1, let first = values.first else { continue }
        contradictions.append(
          ExportMetadataContradiction(
            field: "duplicateIXML:TRACK[\(trackIndex + 1)]/\(field)",
            containerValue: first,
            metadataSource: .iXML,
            metadataValue: values.dropFirst().joined(separator: " | "),
            explanation: "Duplicate known iXML track field \(field) contains contradictory values.")
        )
      }
    }
    return contradictions
  }

  private func untrustedIXMLFields(
    in root: XMLNode
  ) -> [ExportUntrustedEmbeddedMetadataField] {
    let knownPaths: Set<String> = [
      "BWFXML",
      "BWFXML/IXML_VERSION",
      "BWFXML/PROJECT",
      "BWFXML/SCENE",
      "BWFXML/TAKE",
      "BWFXML/TAPE",
      "BWFXML/NOTE",
      "BWFXML/FILE_UID",
      "BWFXML/TIMECODE",
      "BWFXML/TIMECODE_RATE",
      "BWFXML/TIMECODE_START",
      "BWFXML/TIMECODE/TIMECODE_START",
      "BWFXML/TIMECODE/TIMECODE_RATE",
      "BWFXML/SPEED",
      "BWFXML/SPEED/TIMECODE",
      "BWFXML/SPEED/TIMECODE_RATE",
      "BWFXML/SPEED/TIMECODE_FLAG",
      "BWFXML/SPEED/FILE_SAMPLE_RATE",
      "BWFXML/SPEED/TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_HI",
      "BWFXML/SPEED/TIMESTAMP_SAMPLES_SINCE_MIDNIGHT_LO",
      "BWFXML/SPEED/TIMESTAMP_SAMPLE_RATE",
      "BWFXML/TRACK_LIST",
      "BWFXML/TRACK_LIST/TRACK_COUNT",
      "BWFXML/TRACK_LIST/TRACK",
      "BWFXML/TRACK_LIST/TRACK/CHANNEL_INDEX",
      "BWFXML/TRACK_LIST/TRACK/INTERLEAVE_INDEX",
      "BWFXML/TRACK_LIST/TRACK/NAME",
      "BWFXML/TRACK_LIST/TRACK/FUNCTION",
    ]
    return root.untrustedFields(
      knownPaths: knownPaths,
      trust: .unknownIXML)
  }

  private func readExact(_ handle: FileHandle, count: Int, label: String) throws -> Data {
    guard let data = try handle.read(upToCount: count), data.count == count else {
      throw ExportDNAParserError.truncated(label)
    }
    return data
  }

  private func paddedChunkSize(for size: UInt64) throws -> UInt64 {
    try adding(size, size.isMultiple(of: 2) ? 0 : 1)
  }

  private func adding(_ lhs: UInt64, _ rhs: UInt64) throws -> UInt64 {
    let (result, overflow) = lhs.addingReportingOverflow(rhs)
    if overflow { throw ExportDNAParserError.integerOverflow }
    return result
  }

  private func adding(_ lhs: Int, _ rhs: Int) throws -> Int {
    let (result, overflow) = lhs.addingReportingOverflow(rhs)
    if overflow { throw ExportDNAParserError.integerOverflow }
    return result
  }

  private func multiplying(_ lhs: Int, _ rhs: Int) throws -> Int {
    let (result, overflow) = lhs.multipliedReportingOverflow(by: rhs)
    if overflow { throw ExportDNAParserError.integerOverflow }
    return result
  }
}

extension BroadcastWaveMetadata {
  fileprivate func backfillingSampleRate(_ sampleRate: UInt32) -> BroadcastWaveMetadata {
    BroadcastWaveMetadata(
      trust: trust,
      description: description,
      originator: originator,
      originatorReference: originatorReference,
      originationDate: originationDate,
      originationTime: originationTime,
      timeReference: ExportSampleTimeReference(
        samplesSinceOrigin: timeReference.samplesSinceOrigin,
        sampleRate: sampleRate),
      version: version,
      umidHex: umidHex,
      loudness: loudness,
      codingHistory: codingHistory)
  }
}

extension ExportEmbeddedMetadataTrust {
  fileprivate static let bext = ExportEmbeddedMetadataTrust(
    source: .bext,
    level: .high,
    explanation:
      "Broadcast extension metadata is a structured exporter assertion embedded in the container.")
  fileprivate static let ixml = ExportEmbeddedMetadataTrust(
    source: .iXML,
    level: .high,
    explanation:
      "iXML is structured production metadata embedded by the exporting workstation or DAW.")
  fileprivate static let unknownIXML = ExportEmbeddedMetadataTrust(
    source: .iXML,
    level: .low,
    explanation:
      "Unrecognised iXML fields are preserved as descriptive metadata and remain untrusted until independently corroborated."
  )
  fileprivate static let axml = ExportEmbeddedMetadataTrust(
    source: .axml,
    level: .low,
    explanation:
      "axml is embedded descriptive metadata and remains untrusted until corroborated by independent evidence."
  )
  fileprivate static let riffInfo = ExportEmbeddedMetadataTrust(
    source: .riffInfo,
    level: .low,
    explanation:
      "RIFF INFO tags are informal descriptive annotations and should not be treated as authoritative."
  )
}

extension Data {
  fileprivate func fourCC(at offset: Int) -> String {
    let range = offset..<(offset + 4)
    return String(decoding: self[range], as: UTF8.self)
  }

  fileprivate func uint16(at offset: Int) -> UInt16 {
    UInt16(self[offset]) | (UInt16(self[offset + 1]) << 8)
  }

  fileprivate func uint32(at offset: Int) -> UInt32 {
    UInt32(self[offset])
      | (UInt32(self[offset + 1]) << 8)
      | (UInt32(self[offset + 2]) << 16)
      | (UInt32(self[offset + 3]) << 24)
  }

  fileprivate func uint64(at offset: Int) -> UInt64 {
    UInt64(self[offset])
      | (UInt64(self[offset + 1]) << 8)
      | (UInt64(self[offset + 2]) << 16)
      | (UInt64(self[offset + 3]) << 24)
      | (UInt64(self[offset + 4]) << 32)
      | (UInt64(self[offset + 5]) << 40)
      | (UInt64(self[offset + 6]) << 48)
      | (UInt64(self[offset + 7]) << 56)
  }

  fileprivate func fixedWidthString(at offset: Int, count: Int) -> String {
    let range = offset..<(offset + count)
    let raw = self[range]
    let bytes = Data(raw.prefix { $0 != 0 })
    let decoded =
      String(data: bytes, encoding: .isoLatin1) ?? String(decoding: bytes, as: UTF8.self)
    return decoded.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
      .precomposedStringWithCanonicalMapping
  }
}

private func normalizedText(
  _ data: Data,
  preferredEncoding: String.Encoding? = nil,
  trimWhitespace: Bool
) -> String? {
  let trimmedData = Data(data.prefix { $0 != 0 })
  let candidateEncodings =
    [preferredEncoding, .utf8, .utf16LittleEndian, .isoLatin1]
    .compactMap { $0 }
  let decoded =
    candidateEncodings.lazy.compactMap { String(data: trimmedData, encoding: $0) }.first
    ?? String(decoding: trimmedData, as: UTF8.self)
  let value =
    trimWhitespace
    ? decoded.trimmingCharacters(in: .whitespacesAndNewlines)
    : decoded.trimmingCharacters(in: CharacterSet(charactersIn: "\0"))
  let normalized = value.precomposedStringWithCanonicalMapping
  return normalized.isEmpty ? nil : normalized
}

private struct XMLNode: Sendable, Equatable {
  let name: String
  let attributes: [String: String]
  let text: String?
  let children: [XMLNode]

  func child(named name: String) -> XMLNode? {
    children.first { $0.name == name }
  }

  func children(named name: String) -> [XMLNode] {
    children.filter { $0.name == name }
  }

  func child(path: [String]) -> XMLNode? {
    guard let first = path.first else { return self }
    guard let child = child(named: first) else { return nil }
    return child.child(path: Array(path.dropFirst()))
  }

  func nodes(path: [String]) -> [XMLNode] {
    guard let first = path.first else { return [self] }
    return children.filter { $0.name == first }.flatMap {
      $0.nodes(path: Array(path.dropFirst()))
    }
  }

  func untrustedFields(
    knownPaths: Set<String>,
    trust: ExportEmbeddedMetadataTrust
  ) -> [ExportUntrustedEmbeddedMetadataField] {
    var fields: [ExportUntrustedEmbeddedMetadataField] = []
    collectUntrustedFields(
      basePath: [], displayPath: [], displayComponent: nil, duplicateOccurrence: false,
      knownPaths: knownPaths, trust: trust, into: &fields)
    return fields.sorted { lhs, rhs in
      if lhs.path == rhs.path { return lhs.values.joined() < rhs.values.joined() }
      return lhs.path < rhs.path
    }
  }

  private func collectUntrustedFields(
    basePath: [String],
    displayPath: [String],
    displayComponent: String?,
    duplicateOccurrence: Bool,
    knownPaths: Set<String>,
    trust: ExportEmbeddedMetadataTrust,
    into fields: inout [ExportUntrustedEmbeddedMetadataField]
  ) {
    let currentBasePath = basePath + [name]
    let currentDisplayPath = displayPath + [displayComponent ?? name]
    let canonicalPath = currentBasePath.joined(separator: "/")
    let isEmptyElement = text == nil && children.isEmpty
    let shouldPreserve =
      !attributes.isEmpty || duplicateOccurrence || isEmptyElement
      || (!knownPaths.contains(canonicalPath) && text != nil)
    if shouldPreserve {
      fields.append(
        ExportUntrustedEmbeddedMetadataField(
          trust: trust,
          path: currentDisplayPath.joined(separator: "/"),
          values: text.map { [$0] } ?? [],
          attributes: attributes,
          isEmptyElement: isEmptyElement))
    }

    let siblingCounts = Dictionary(grouping: children, by: \.name).mapValues(\.count)
    var siblingIndexes: [String: Int] = [:]
    for child in children {
      let nextIndex = siblingIndexes[child.name, default: 0] + 1
      siblingIndexes[child.name] = nextIndex
      let isDuplicate = siblingCounts[child.name, default: 0] > 1
      let displayName = isDuplicate ? "\(child.name)[\(nextIndex)]" : child.name
      child.collectUntrustedFields(
        basePath: currentBasePath,
        displayPath: currentDisplayPath,
        displayComponent: displayName,
        duplicateOccurrence: isDuplicate,
        knownPaths: knownPaths,
        trust: trust,
        into: &fields)
    }
  }

  func flattenedLeafText(path: [String] = []) -> [String: [String]] {
    let currentPath = path + [name]
    var result: [String: [String]] = [:]
    if let text {
      result[currentPath.joined(separator: "/"), default: []].append(text)
    }
    for child in children {
      for (key, values) in child.flattenedLeafText(path: currentPath) {
        result[key, default: []].append(contentsOf: values)
      }
    }
    return result
  }
}

private enum XMLTreeParser {
  struct Limits {
    let maximumDepth: Int
    let maximumNodeCount: Int
    let maximumTextBytes: Int
  }

  static func parse(data: Data, chunkID: String, limits: Limits) throws -> XMLNode {
    let delegate = Delegate(limits: limits)
    let parser = XMLParser(data: trimmingTrailingNulls(data))
    parser.delegate = delegate
    parser.shouldProcessNamespaces = false
    parser.shouldReportNamespacePrefixes = false
    parser.shouldResolveExternalEntities = false
    let parsed = parser.parse()
    if delegate.exceededLimit {
      throw ExportDNAParserError.xmlComplexityLimit(chunkID)
    }
    guard parsed, let root = delegate.root else {
      throw ExportDNAParserError.malformedXML(chunkID)
    }
    return root
  }

  private static func trimmingTrailingNulls(_ data: Data) -> Data {
    var end = data.endIndex
    while end > data.startIndex, data[data.index(before: end)] == 0 {
      end = data.index(before: end)
    }
    return Data(data[..<end])
  }

  private struct Frame {
    let name: String
    let attributes: [String: String]
    var text: String = ""
    var children: [XMLNode] = []
  }

  private final class Delegate: NSObject, XMLParserDelegate {
    let limits: Limits
    var stack: [Frame] = []
    var root: XMLNode?
    var nodeCount = 0
    var textBytes = 0
    var exceededLimit = false

    init(limits: Limits) {
      self.limits = limits
    }

    func parser(
      _ parser: XMLParser,
      didStartElement elementName: String,
      namespaceURI: String?,
      qualifiedName qName: String?,
      attributes attributeDict: [String: String] = [:]
    ) {
      guard !exceededLimit else { return }
      nodeCount += 1
      guard stack.count + 1 <= limits.maximumDepth,
        nodeCount <= limits.maximumNodeCount
      else {
        exceededLimit = true
        parser.abortParsing()
        return
      }
      for (name, value) in attributeDict {
        guard consumeTextBytes(name.utf8.count), consumeTextBytes(value.utf8.count) else {
          exceededLimit = true
          parser.abortParsing()
          return
        }
      }
      stack.append(Frame(name: elementName, attributes: attributeDict))
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
      guard !exceededLimit, !stack.isEmpty else { return }
      guard consumeTextBytes(string.utf8.count) else {
        exceededLimit = true
        parser.abortParsing()
        return
      }
      stack[stack.count - 1].text.append(string)
    }

    func parser(_ parser: XMLParser, foundCDATA cdataBlock: Data) {
      guard let text = String(data: cdataBlock, encoding: .utf8) else {
        parser.abortParsing()
        return
      }
      self.parser(parser, foundCharacters: text)
    }

    func parser(
      _ parser: XMLParser,
      didEndElement elementName: String,
      namespaceURI: String?,
      qualifiedName qName: String?
    ) {
      guard !exceededLimit else { return }
      guard let frame = stack.popLast() else { return }
      let text = frame.text.trimmingCharacters(in: .whitespacesAndNewlines)
      let node = XMLNode(
        name: frame.name,
        attributes: frame.attributes,
        text: text.isEmpty ? nil : text.precomposedStringWithCanonicalMapping,
        children: frame.children)
      if stack.isEmpty {
        root = node
      } else {
        stack[stack.count - 1].children.append(node)
      }
    }

    private func consumeTextBytes(_ count: Int) -> Bool {
      let (result, overflow) = textBytes.addingReportingOverflow(count)
      guard !overflow, result <= limits.maximumTextBytes else { return false }
      textBytes = result
      return true
    }
  }
}
