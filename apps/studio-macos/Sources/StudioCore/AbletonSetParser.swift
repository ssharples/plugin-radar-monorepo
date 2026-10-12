import CZlib
import Foundation

public enum AbletonSetParserError: Error, LocalizedError {
  case cannotOpen(URL)
  case decompressionFailed(URL, String)
  case expandedFileTooLarge(URL, Int)
  case malformedXML(URL, String)

  public var errorDescription: String? {
    switch self {
    case .cannotOpen(let url):
      "Could not open Ableton Set at \(url.path(percentEncoded: false))"
    case .decompressionFailed(let url, let message):
      "Could not decompress \(url.lastPathComponent): \(message)"
    case .expandedFileTooLarge(let url, let limit):
      "Expanded Ableton Set \(url.lastPathComponent) exceeded the \(limit)-byte safety limit"
    case .malformedXML(let url, let message):
      "Could not parse \(url.lastPathComponent): \(message)"
    }
  }
}

public struct ParsedAbletonSet: Sendable {
  public let xmlBytes: Int
  public let creator: String?
  public let format: AbletonFormat
  public let structure: SetStructure
  public let content: AbletonSetContent
}

public struct AbletonSetParser: Sendable {
  public let expandedSizeLimit: Int

  public init(expandedSizeLimit: Int = 256 * 1_024 * 1_024) {
    self.expandedSizeLimit = expandedSizeLimit
  }

  public func parse(fileURL: URL) throws -> ParsedAbletonSet {
    let xml = try GzipReader.read(fileURL: fileURL, sizeLimit: expandedSizeLimit)
    let delegate = AbletonXMLDelegate()
    let parser = XMLParser(data: xml)
    parser.delegate = delegate
    parser.shouldProcessNamespaces = false
    parser.shouldReportNamespacePrefixes = false
    parser.shouldResolveExternalEntities = false

    guard parser.parse() else {
      throw AbletonSetParserError.malformedXML(
        fileURL,
        parser.parserError?.localizedDescription ?? "Unknown XML error"
      )
    }

    return ParsedAbletonSet(
      xmlBytes: xml.count,
      creator: delegate.creator,
      format: delegate.format,
      structure: delegate.structure,
      content: delegate.content
    )
  }

  public func parseInterchange(fileURL: URL) throws -> StudioProjectInterchange {
    try parse(fileURL: fileURL).projectInterchange(sourceFileURL: fileURL)
  }
}

private enum GzipReader {
  static func read(fileURL: URL, sizeLimit: Int) throws -> Data {
    let handle = fileURL.withUnsafeFileSystemRepresentation { path in
      path.flatMap { gzopen($0, "rb") }
    }

    guard let handle else {
      throw AbletonSetParserError.cannotOpen(fileURL)
    }
    defer { gzclose(handle) }

    var output = Data()
    output.reserveCapacity(min(sizeLimit, 4 * 1_024 * 1_024))
    var buffer = [UInt8](repeating: 0, count: 64 * 1_024)

    while true {
      let count = buffer.withUnsafeMutableBytes { rawBuffer in
        gzread(handle, rawBuffer.baseAddress, UInt32(rawBuffer.count))
      }

      if count < 0 {
        var errorCode: Int32 = 0
        let message =
          gzerror(handle, &errorCode).map(String.init(cString:)) ?? "zlib error \(errorCode)"
        throw AbletonSetParserError.decompressionFailed(fileURL, message)
      }
      if count == 0 {
        break
      }
      if output.count + Int(count) > sizeLimit {
        throw AbletonSetParserError.expandedFileTooLarge(fileURL, sizeLimit)
      }
      output.append(buffer, count: Int(count))
    }

    return output
  }
}

private final class AbletonXMLDelegate: NSObject, XMLParserDelegate {
  private let contentBuilder = AbletonContentBuilder()
  private(set) var creator: String?
  private(set) var format = AbletonFormat(
    majorVersion: nil,
    minorVersion: nil,
    schemaChangeCount: nil,
    revision: nil
  )
  private(set) var structure = SetStructure()
  var content: AbletonSetContent { contentBuilder.content }

  private static let thirdPartyDevices: Set<String> = [
    "PluginDevice",
    "AuPluginDevice",
  ]
  private static let maxForLiveDevices: Set<String> = [
    "MxDeviceAudioEffect",
    "MxDeviceInstrument",
    "MxDeviceMidiEffect",
  ]
  private static let rackDevices: Set<String> = [
    "AudioEffectGroupDevice",
    "InstrumentGroupDevice",
    "MidiEffectGroupDevice",
    "DrumGroupDevice",
  ]

  func parser(
    _ parser: XMLParser,
    didStartElement elementName: String,
    namespaceURI: String?,
    qualifiedName qName: String?,
    attributes attributeDict: [String: String] = [:]
  ) {
    contentBuilder.didStartElement(elementName, attributes: attributeDict)
    if elementName == "Ableton" {
      creator = attributeDict["Creator"]
      format = AbletonFormat(
        majorVersion: attributeDict["MajorVersion"],
        minorVersion: attributeDict["MinorVersion"],
        schemaChangeCount: attributeDict["SchemaChangeCount"].flatMap(Int.init),
        revision: attributeDict["Revision"]
      )
    }

    switch elementName {
    case "AudioTrack": structure.audioTrackCount += 1
    case "MidiTrack": structure.midiTrackCount += 1
    case "GroupTrack": structure.groupTrackCount += 1
    case "ReturnTrack": structure.returnTrackCount += 1
    case "WarpMarker": structure.warpMarkerCount += 1
    case "AutomationEnvelope": structure.automationEnvelopeCount += 1
    default: break
    }

    if Self.thirdPartyDevices.contains(elementName) {
      structure.thirdPartyDeviceCount += 1
    }
    if Self.maxForLiveDevices.contains(elementName) {
      structure.maxForLiveDeviceCount += 1
    }
    if Self.rackDevices.contains(elementName) {
      structure.rackDeviceCount += 1
    }
  }

  func parser(_ parser: XMLParser, foundCharacters string: String) {
    contentBuilder.foundCharacters(string)
  }

  func parser(
    _ parser: XMLParser,
    didEndElement elementName: String,
    namespaceURI: String?,
    qualifiedName qName: String?
  ) {
    contentBuilder.didEndElement(elementName)
  }
}
