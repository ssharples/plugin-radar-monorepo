import Foundation

public enum ExportWaveContainerKind: String, Codable, Sendable, CaseIterable {
  case riffWave = "RIFF"
  case rf64Wave = "RF64"
  case bw64Wave = "BW64"
}

public enum ExportEmbeddedMetadataSource: String, Codable, Sendable, CaseIterable {
  case bext
  case iXML
  case axml
  case riffInfo
}

public enum ExportEmbeddedMetadataTrustLevel: String, Codable, Sendable, CaseIterable {
  case high
  case medium
  case low
}

public struct ExportEmbeddedMetadataTrust: Codable, Sendable, Equatable {
  public let source: ExportEmbeddedMetadataSource
  public let level: ExportEmbeddedMetadataTrustLevel
  public let explanation: String

  public init(
    source: ExportEmbeddedMetadataSource,
    level: ExportEmbeddedMetadataTrustLevel,
    explanation: String
  ) {
    self.source = source
    self.level = level
    self.explanation = explanation
  }
}

public struct ParsedExportDNA: Sendable, Equatable {
  public let container: ExportWaveContainer
  public let chunks: [ExportChunkDescriptor]
  public let bext: BroadcastWaveMetadata?
  public let ixml: ExportIXMLMetadata?
  public let axml: ExportAXMLMetadata?
  public let info: ExportRIFFInfoMetadata?
  public let contradictions: [ExportMetadataContradiction]

  public init(
    container: ExportWaveContainer,
    chunks: [ExportChunkDescriptor],
    bext: BroadcastWaveMetadata?,
    ixml: ExportIXMLMetadata?,
    axml: ExportAXMLMetadata?,
    info: ExportRIFFInfoMetadata?,
    contradictions: [ExportMetadataContradiction]
  ) {
    self.container = container
    self.chunks = chunks
    self.bext = bext
    self.ixml = ixml
    self.axml = axml
    self.info = info
    self.contradictions = contradictions
  }
}

public struct ExportWaveContainer: Sendable, Equatable {
  public let kind: ExportWaveContainerKind
  public let formType: String
  public let riffSize: UInt64
  public let physicalFileSize: UInt64
  public let ds64: RF64DataSizeChunk?
  public let format: ExportWaveFormat?
  public let dataChunkSize: UInt64?

  public init(
    kind: ExportWaveContainerKind,
    formType: String,
    riffSize: UInt64,
    physicalFileSize: UInt64,
    ds64: RF64DataSizeChunk?,
    format: ExportWaveFormat?,
    dataChunkSize: UInt64?
  ) {
    self.kind = kind
    self.formType = formType
    self.riffSize = riffSize
    self.physicalFileSize = physicalFileSize
    self.ds64 = ds64
    self.format = format
    self.dataChunkSize = dataChunkSize
  }
}

public struct RF64DataSizeChunk: Sendable, Equatable {
  public let riffSize: UInt64
  public let dataSize: UInt64
  public let sampleCount: UInt64
  public let tableEntries: [RF64ExtendedSizeEntry]

  public init(
    riffSize: UInt64,
    dataSize: UInt64,
    sampleCount: UInt64,
    tableEntries: [RF64ExtendedSizeEntry]
  ) {
    self.riffSize = riffSize
    self.dataSize = dataSize
    self.sampleCount = sampleCount
    self.tableEntries = tableEntries
  }
}

public struct RF64ExtendedSizeEntry: Sendable, Equatable {
  public let chunkID: String
  public let size: UInt64

  public init(chunkID: String, size: UInt64) {
    self.chunkID = chunkID
    self.size = size
  }
}

public struct ExportWaveFormat: Sendable, Equatable {
  public let formatTag: UInt16
  public let channelCount: UInt16
  public let sampleRate: UInt32
  public let bytesPerSecond: UInt32
  public let blockAlign: UInt16
  public let bitsPerSample: UInt16?
  public let extensionBytes: UInt16?

  public init(
    formatTag: UInt16,
    channelCount: UInt16,
    sampleRate: UInt32,
    bytesPerSecond: UInt32,
    blockAlign: UInt16,
    bitsPerSample: UInt16?,
    extensionBytes: UInt16?
  ) {
    self.formatTag = formatTag
    self.channelCount = channelCount
    self.sampleRate = sampleRate
    self.bytesPerSecond = bytesPerSecond
    self.blockAlign = blockAlign
    self.bitsPerSample = bitsPerSample
    self.extensionBytes = extensionBytes
  }
}

public struct ExportChunkDescriptor: Sendable, Equatable {
  public let id: String
  public let dataOffset: UInt64
  public let declaredSize: UInt64
  public let paddedSize: UInt64
  public let usesExtendedSize: Bool

  public init(
    id: String,
    dataOffset: UInt64,
    declaredSize: UInt64,
    paddedSize: UInt64,
    usesExtendedSize: Bool
  ) {
    self.id = id
    self.dataOffset = dataOffset
    self.declaredSize = declaredSize
    self.paddedSize = paddedSize
    self.usesExtendedSize = usesExtendedSize
  }
}

public struct ExportSampleTimeReference: Sendable, Equatable {
  public let samplesSinceOrigin: UInt64
  public let sampleRate: UInt32?

  public init(samplesSinceOrigin: UInt64, sampleRate: UInt32?) {
    self.samplesSinceOrigin = samplesSinceOrigin
    self.sampleRate = sampleRate
  }
}

public struct ExportIXMLTimestamp: Codable, Sendable, Equatable {
  public let samplesSinceMidnight: UInt64
  public let sampleRate: UInt32?

  public init(samplesSinceMidnight: UInt64, sampleRate: UInt32?) {
    self.samplesSinceMidnight = samplesSinceMidnight
    self.sampleRate = sampleRate
  }
}

public struct ExportUntrustedEmbeddedMetadataField: Codable, Sendable, Equatable {
  public let trust: ExportEmbeddedMetadataTrust
  public let path: String
  public let values: [String]
  public let attributes: [String: String]
  public let isEmptyElement: Bool

  public init(
    trust: ExportEmbeddedMetadataTrust,
    path: String,
    values: [String],
    attributes: [String: String] = [:],
    isEmptyElement: Bool = false
  ) {
    self.trust = trust
    self.path = path
    self.values = values
    self.attributes = attributes
    self.isEmptyElement = isEmptyElement
  }
}

extension ExportUntrustedEmbeddedMetadataField {
  private enum CodingKeys: String, CodingKey {
    case trust
    case path
    case values
    case attributes
    case isEmptyElement
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      trust: try container.decode(ExportEmbeddedMetadataTrust.self, forKey: .trust),
      path: try container.decode(String.self, forKey: .path),
      values: try container.decodeIfPresent([String].self, forKey: .values) ?? [],
      attributes: try container.decodeIfPresent([String: String].self, forKey: .attributes) ?? [:],
      isEmptyElement: try container.decodeIfPresent(Bool.self, forKey: .isEmptyElement) ?? false)
  }
}

public struct BroadcastWaveLoudnessMetadata: Codable, Sendable, Equatable {
  public let loudnessValue: Int16
  public let loudnessRange: Int16
  public let maxTruePeakLevel: Int16
  public let maxMomentaryLoudness: Int16
  public let maxShortTermLoudness: Int16

  public init(
    loudnessValue: Int16,
    loudnessRange: Int16,
    maxTruePeakLevel: Int16,
    maxMomentaryLoudness: Int16,
    maxShortTermLoudness: Int16
  ) {
    self.loudnessValue = loudnessValue
    self.loudnessRange = loudnessRange
    self.maxTruePeakLevel = maxTruePeakLevel
    self.maxMomentaryLoudness = maxMomentaryLoudness
    self.maxShortTermLoudness = maxShortTermLoudness
  }
}

public struct BroadcastWaveMetadata: Sendable, Equatable {
  public let trust: ExportEmbeddedMetadataTrust
  public let description: String
  public let originator: String
  public let originatorReference: String
  public let originationDate: String
  public let originationTime: String
  public let timeReference: ExportSampleTimeReference
  public let version: UInt16
  public let umidHex: String?
  public let loudness: BroadcastWaveLoudnessMetadata?
  public let codingHistory: String?

  public init(
    trust: ExportEmbeddedMetadataTrust,
    description: String,
    originator: String,
    originatorReference: String,
    originationDate: String,
    originationTime: String,
    timeReference: ExportSampleTimeReference,
    version: UInt16,
    umidHex: String?,
    loudness: BroadcastWaveLoudnessMetadata?,
    codingHistory: String?
  ) {
    self.trust = trust
    self.description = description
    self.originator = originator
    self.originatorReference = originatorReference
    self.originationDate = originationDate
    self.originationTime = originationTime
    self.timeReference = timeReference
    self.version = version
    self.umidHex = umidHex
    self.loudness = loudness
    self.codingHistory = codingHistory
  }
}

public struct ExportIXMLTrack: Sendable, Equatable {
  public let channelIndex: Int?
  public let interleaveIndex: Int?
  public let name: String?
  public let function: String?

  public init(
    channelIndex: Int?,
    interleaveIndex: Int?,
    name: String?,
    function: String?
  ) {
    self.channelIndex = channelIndex
    self.interleaveIndex = interleaveIndex
    self.name = name
    self.function = function
  }
}

public struct ExportIXMLMetadata: Sendable, Equatable {
  public let trust: ExportEmbeddedMetadataTrust
  public let rootElementName: String
  public let project: String?
  public let scene: String?
  public let take: String?
  public let tape: String?
  public let note: String?
  public let timecode: String?
  public let timecodeRate: String?
  public let timecodeFlag: String?
  public let fileSampleRate: UInt32?
  public let timestamp: ExportIXMLTimestamp?
  public let trackCount: Int?
  public let tracks: [ExportIXMLTrack]
  public let ixmlVersion: String?
  public let fileUID: String?
  public let untrustedUnknownFields: [ExportUntrustedEmbeddedMetadataField]

  public init(
    trust: ExportEmbeddedMetadataTrust,
    rootElementName: String,
    project: String?,
    note: String?,
    scene: String? = nil,
    take: String? = nil,
    tape: String? = nil,
    timecode: String? = nil,
    timecodeRate: String? = nil,
    fileSampleRate: UInt32?,
    trackCount: Int?,
    tracks: [ExportIXMLTrack],
    timecodeFlag: String? = nil,
    timestamp: ExportIXMLTimestamp? = nil,
    ixmlVersion: String? = nil,
    fileUID: String? = nil,
    untrustedUnknownFields: [ExportUntrustedEmbeddedMetadataField] = []
  ) {
    self.trust = trust
    self.rootElementName = rootElementName
    self.project = project
    self.scene = scene
    self.take = take
    self.tape = tape
    self.note = note
    self.timecode = timecode
    self.timecodeRate = timecodeRate
    self.timecodeFlag = timecodeFlag
    self.fileSampleRate = fileSampleRate
    self.timestamp = timestamp
    self.trackCount = trackCount
    self.tracks = tracks
    self.ixmlVersion = ixmlVersion
    self.fileUID = fileUID
    self.untrustedUnknownFields = untrustedUnknownFields
  }
}

public struct ExportAXMLMetadata: Sendable, Equatable {
  public let trust: ExportEmbeddedMetadataTrust
  public let rootElementName: String
  public let textByPath: [String: [String]]

  public init(
    trust: ExportEmbeddedMetadataTrust,
    rootElementName: String,
    textByPath: [String: [String]]
  ) {
    self.trust = trust
    self.rootElementName = rootElementName
    self.textByPath = textByPath
  }
}

public struct ExportRIFFInfoMetadata: Sendable, Equatable {
  public let trust: ExportEmbeddedMetadataTrust
  public let fields: [String: String]

  public init(trust: ExportEmbeddedMetadataTrust, fields: [String: String]) {
    self.trust = trust
    self.fields = fields
  }
}

public struct ExportMetadataContradiction: Sendable, Equatable {
  public let field: String
  public let containerValue: String
  public let metadataSource: ExportEmbeddedMetadataSource
  public let metadataValue: String
  public let explanation: String

  public init(
    field: String,
    containerValue: String,
    metadataSource: ExportEmbeddedMetadataSource,
    metadataValue: String,
    explanation: String
  ) {
    self.field = field
    self.containerValue = containerValue
    self.metadataSource = metadataSource
    self.metadataValue = metadataValue
    self.explanation = explanation
  }
}
