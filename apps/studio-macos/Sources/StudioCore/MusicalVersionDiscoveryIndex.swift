import CryptoKit
import Foundation

public struct MusicalVersionDiscoveryAsset: Sendable, Equatable {
  public let assetID: String
  public let fileURL: URL

  public init(assetID: String, fileURL: URL) {
    self.assetID = assetID
    self.fileURL = fileURL.standardizedFileURL
  }

  var isWellFormed: Bool {
    MusicalVersionDiscoveryIndex.isValidAssetID(assetID)
      && MusicalVersionDiscoveryIndex.isValidFileURL(fileURL)
  }
}

public struct MusicalVersionImmutableAssetObservation: Codable, Sendable, Equatable {
  public let assetID: String
  public let fileURL: URL
  public let contentSHA256: String
  public let bytes: Int64
  public let modifiedAtNanoseconds: Int64?
  public let resourceIdentity: String?

  init(asset: MusicalVersionDiscoveryAsset, observation: AudioMatchSourceObservation) {
    assetID = asset.assetID
    fileURL = asset.fileURL.standardizedFileURL
    contentSHA256 = observation.contentSHA256
    bytes = observation.bytes
    modifiedAtNanoseconds = observation.modifiedAtNanoseconds
    resourceIdentity = observation.resourceIdentity
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let assetID = try container.decode(String.self, forKey: .assetID)
    let fileURL = try container.decode(URL.self, forKey: .fileURL)
    let contentSHA256 = try container.decode(String.self, forKey: .contentSHA256)
    let bytes = try container.decode(Int64.self, forKey: .bytes)
    let modifiedAtNanoseconds = try container.decodeIfPresent(
      Int64.self,
      forKey: .modifiedAtNanoseconds)
    let resourceIdentity = try container.decodeIfPresent(String.self, forKey: .resourceIdentity)
    guard
      MusicalVersionDiscoveryIndex.isValidObservation(
        assetID: assetID,
        fileURL: fileURL,
        contentSHA256: contentSHA256,
        bytes: bytes,
        resourceIdentity: resourceIdentity)
    else {
      throw DecodingError.dataCorruptedError(
        forKey: .assetID,
        in: container,
        debugDescription: "Musical-version observation is malformed or outside string bounds.")
    }
    self.assetID = assetID
    self.fileURL = fileURL
    self.contentSHA256 = contentSHA256
    self.bytes = bytes
    self.modifiedAtNanoseconds = modifiedAtNanoseconds
    self.resourceIdentity = resourceIdentity
  }

  var fileObservation: AudioMatchSourceObservation {
    AudioMatchSourceObservation(
      contentSHA256: contentSHA256,
      bytes: bytes,
      modifiedAtNanoseconds: modifiedAtNanoseconds,
      resourceIdentity: resourceIdentity)
  }

  var isWellFormed: Bool {
    MusicalVersionDiscoveryIndex.isValidObservation(
      assetID: assetID,
      fileURL: fileURL,
      contentSHA256: contentSHA256,
      bytes: bytes,
      resourceIdentity: resourceIdentity)
  }

  private enum CodingKeys: String, CodingKey {
    case assetID
    case fileURL
    case contentSHA256
    case bytes
    case modifiedAtNanoseconds
    case resourceIdentity
  }
}

struct MusicalVersionFeatureEmbedding: Codable, Sendable, Equatable {
  let version: String
  let values: [Float]

  init(version: String, values: [Float]) {
    self.version = version
    self.values = values
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let version = try container.decode(String.self, forKey: .version)
    let values = try container.decode([Float].self, forKey: .values)
    guard version == LocalMusicalVersionDiscoveryPrototype.embeddingVersion,
      MusicalVersionDiscoveryIndex.validEmbeddingValues(values)
    else {
      throw DecodingError.dataCorruptedError(
        forKey: .version,
        in: container,
        debugDescription: "Musical-version embedding is incompatible or outside bounds.")
    }
    self.version = version
    self.values = values
  }

  private enum CodingKeys: String, CodingKey {
    case version
    case values
  }
}

struct MusicalVersionSegmentEmbedding: Codable, Sendable, Equatable {
  let range: AudioTimeRange
  let embedding: MusicalVersionFeatureEmbedding
}

struct MusicalVersionIndexedAsset: Codable, Sendable, Equatable {
  let observation: MusicalVersionImmutableAssetObservation
  let durationSeconds: Double
  let wholeRecording: MusicalVersionFeatureEmbedding
  let segments: [MusicalVersionSegmentEmbedding]
  let workingMemoryUpperBoundBytes: Int64

  init(
    observation: MusicalVersionImmutableAssetObservation,
    durationSeconds: Double,
    wholeRecording: MusicalVersionFeatureEmbedding,
    segments: [MusicalVersionSegmentEmbedding],
    workingMemoryUpperBoundBytes: Int64
  ) {
    self.observation = observation
    self.durationSeconds = durationSeconds
    self.wholeRecording = wholeRecording
    self.segments = segments
    self.workingMemoryUpperBoundBytes = workingMemoryUpperBoundBytes
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    observation = try container.decode(
      MusicalVersionImmutableAssetObservation.self,
      forKey: .observation)
    durationSeconds = try container.decode(Double.self, forKey: .durationSeconds)
    wholeRecording = try container.decode(
      MusicalVersionFeatureEmbedding.self,
      forKey: .wholeRecording)
    var encodedSegments = try container.nestedUnkeyedContainer(forKey: .segments)
    if let count = encodedSegments.count,
      count > MusicalVersionDiscoveryIndex.hardMaximumSegmentsPerAsset
    {
      throw DecodingError.dataCorruptedError(
        forKey: .segments,
        in: container,
        debugDescription: "Musical-version segment count exceeds its hard bound.")
    }
    var decodedSegments: [MusicalVersionSegmentEmbedding] = []
    decodedSegments.reserveCapacity(
      min(encodedSegments.count ?? 0, MusicalVersionDiscoveryIndex.hardMaximumSegmentsPerAsset))
    while !encodedSegments.isAtEnd {
      guard decodedSegments.count < MusicalVersionDiscoveryIndex.hardMaximumSegmentsPerAsset else {
        throw DecodingError.dataCorruptedError(
          forKey: .segments,
          in: container,
          debugDescription: "Musical-version segment count exceeds its hard bound.")
      }
      decodedSegments.append(try encodedSegments.decode(MusicalVersionSegmentEmbedding.self))
    }
    segments = decodedSegments
    workingMemoryUpperBoundBytes = try container.decode(
      Int64.self,
      forKey: .workingMemoryUpperBoundBytes)
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(observation, forKey: .observation)
    try container.encode(durationSeconds, forKey: .durationSeconds)
    try container.encode(wholeRecording, forKey: .wholeRecording)
    try container.encode(segments, forKey: .segments)
    try container.encode(workingMemoryUpperBoundBytes, forKey: .workingMemoryUpperBoundBytes)
  }

  private enum CodingKeys: String, CodingKey {
    case observation
    case durationSeconds
    case wholeRecording
    case segments
    case workingMemoryUpperBoundBytes
  }
}

public enum MusicalVersionDiscoveryIndexError: Error, Sendable, Equatable {
  case unreadable
  case corrupt
  case futureSchema(Int)
  case incompatibleVersion
  case outsideBounds
}

public struct MusicalVersionDiscoveryIndex: Sendable, Equatable {
  public static let schemaVersion = 1
  public static let indexVersion = "musical-version-index-v1"
  public static let hardMaximumEntries = 256
  public static let hardMaximumSegmentsPerAsset = 7_200
  public static let hardMaximumEncodedBytes = 64 * 1_024 * 1_024

  static let hardMaximumAssetIDUTF8Bytes = 1_024
  static let hardMaximumFileURLUTF8Bytes = 16 * 1_024
  static let hardMaximumFilePathUTF8Bytes = 4 * 1_024
  static let hardMaximumResourceIdentityUTF8Bytes = 4 * 1_024

  private static let magic = "studio-time-machine-musical-version-recall"
  private static let fixedEntryAndContainerMemoryUpperBoundBytes: Int64 = 64 * 1_024
  private static let stringObjectMemoryUpperBoundBytes: Int64 = 64
  private static let urlObjectMemoryUpperBoundBytes: Int64 = 256
  private static let arrayObjectMemoryUpperBoundBytes: Int64 = 64
  private static let retainedCapacityMultiplier: Int64 = 2
  private static let segmentContainerElementMemoryUpperBoundBytes: Int64 = 128
  private let entries: [MusicalVersionIndexedAsset]

  public var assetCount: Int { entries.count }
  var residentWorkingMemoryUpperBoundBytes: Int64 {
    var total: Int64 = 0
    for entry in entries {
      guard let next = Self.checkedSum(total, entry.workingMemoryUpperBoundBytes) else {
        return .max
      }
      total = next
    }
    return total
  }

  init(entries: [MusicalVersionIndexedAsset]) throws {
    let sorted = entries.sorted { $0.observation.assetID < $1.observation.assetID }
    guard Self.validate(sorted) else { throw MusicalVersionDiscoveryIndexError.outsideBounds }
    self.entries = sorted
  }

  func indexedAssets() -> [MusicalVersionIndexedAsset] {
    entries
  }

  public func encoded() throws -> Data {
    try Self.encodedEnvelope(entries: entries)
  }

  public func write(to fileURL: URL) throws {
    try encoded().write(to: fileURL, options: .atomic)
  }

  public static func load(from fileURL: URL) throws -> MusicalVersionDiscoveryIndex {
    guard isValidFileURL(fileURL.standardizedFileURL) else {
      throw MusicalVersionDiscoveryIndexError.unreadable
    }
    let attributes: [FileAttributeKey: Any]
    do {
      attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
    } catch {
      throw MusicalVersionDiscoveryIndexError.unreadable
    }
    let byteCount = (attributes[.size] as? NSNumber)?.intValue ?? 0
    guard byteCount > 0, byteCount <= hardMaximumEncodedBytes else {
      throw MusicalVersionDiscoveryIndexError.outsideBounds
    }
    let data: Data
    do {
      data = try Data(contentsOf: fileURL, options: .mappedIfSafe)
    } catch {
      throw MusicalVersionDiscoveryIndexError.unreadable
    }
    let header: MusicalVersionIndexHeader
    do {
      header = try JSONDecoder().decode(MusicalVersionIndexHeader.self, from: data)
    } catch {
      throw MusicalVersionDiscoveryIndexError.corrupt
    }
    guard header.payload.schemaVersion <= schemaVersion else {
      throw MusicalVersionDiscoveryIndexError.futureSchema(header.payload.schemaVersion)
    }
    guard header.payload.schemaVersion == schemaVersion else {
      throw MusicalVersionDiscoveryIndexError.incompatibleVersion
    }
    let envelope: MusicalVersionIndexEnvelope
    do {
      envelope = try JSONDecoder().decode(MusicalVersionIndexEnvelope.self, from: data)
    } catch {
      throw MusicalVersionDiscoveryIndexError.corrupt
    }
    let payload = envelope.payload
    guard payload.magic == magic,
      payload.indexVersion == indexVersion,
      payload.embeddingVersion == LocalMusicalVersionDiscoveryPrototype.embeddingVersion,
      isValidSHA256(envelope.payloadSHA256),
      sha256(try encode(payload)) == envelope.payloadSHA256,
      validate(payload.entries)
    else { throw MusicalVersionDiscoveryIndexError.corrupt }
    return try MusicalVersionDiscoveryIndex(entries: payload.entries)
  }

  static func retainedMemoryUpperBoundBytes(
    observation: MusicalVersionImmutableAssetObservation,
    wholeRecording: MusicalVersionFeatureEmbedding,
    segments: [MusicalVersionSegmentEmbedding]
  ) -> Int64? {
    guard observation.isWellFormed,
      wholeRecording.version == LocalMusicalVersionDiscoveryPrototype.embeddingVersion,
      validEmbeddingValues(wholeRecording.values),
      !segments.isEmpty,
      segments.count <= hardMaximumSegmentsPerAsset,
      segments.allSatisfy({
        $0.embedding.version == LocalMusicalVersionDiscoveryPrototype.embeddingVersion
          && validEmbeddingValues($0.embedding.values)
      })
    else { return nil }
    return retainedMemoryUpperBoundBytes(
      segmentCount: segments.count,
      assetIDUTF8Bytes: observation.assetID.utf8.count,
      fileURLUTF8Bytes: observation.fileURL.absoluteString.utf8.count,
      filePathUTF8Bytes: observation.fileURL.path.utf8.count,
      contentSHA256UTF8Bytes: observation.contentSHA256.utf8.count,
      resourceIdentityUTF8Bytes: observation.resourceIdentity?.utf8.count,
      embeddingVersionUTF8Bytes: wholeRecording.version.utf8.count)
  }

  static func maximumRetainedMemoryUpperBoundBytes(segmentCount: Int) -> Int64? {
    retainedMemoryUpperBoundBytes(
      segmentCount: segmentCount,
      assetIDUTF8Bytes: hardMaximumAssetIDUTF8Bytes,
      fileURLUTF8Bytes: hardMaximumFileURLUTF8Bytes,
      filePathUTF8Bytes: hardMaximumFilePathUTF8Bytes,
      contentSHA256UTF8Bytes: 64,
      resourceIdentityUTF8Bytes: hardMaximumResourceIdentityUTF8Bytes,
      embeddingVersionUTF8Bytes: LocalMusicalVersionDiscoveryPrototype.embeddingVersion.utf8.count)
  }

  static func isValidAssetID(_ assetID: String) -> Bool {
    isValidBoundedString(
      assetID,
      maximumUTF8Bytes: hardMaximumAssetIDUTF8Bytes,
      mayBeEmpty: false)
  }

  static func isValidFileURL(_ fileURL: URL) -> Bool {
    let absoluteString = fileURL.absoluteString
    let path = fileURL.path
    return fileURL.isFileURL
      && fileURL.baseURL == nil
      && fileURL.host == nil
      && fileURL.user == nil
      && fileURL.password == nil
      && fileURL.port == nil
      && fileURL.query == nil
      && fileURL.fragment == nil
      && path.hasPrefix("/")
      && isValidBoundedString(
        absoluteString,
        maximumUTF8Bytes: hardMaximumFileURLUTF8Bytes,
        mayBeEmpty: false)
      && isValidBoundedString(
        path,
        maximumUTF8Bytes: hardMaximumFilePathUTF8Bytes,
        mayBeEmpty: false)
      && fileURL.standardizedFileURL.absoluteString == absoluteString
  }

  static func isValidObservation(
    assetID: String,
    fileURL: URL,
    contentSHA256: String,
    bytes: Int64,
    resourceIdentity: String?
  ) -> Bool {
    isValidAssetID(assetID)
      && isValidFileURL(fileURL)
      && isValidSHA256(contentSHA256)
      && bytes >= 0
      && resourceIdentity.map {
        isValidBoundedString(
          $0,
          maximumUTF8Bytes: hardMaximumResourceIdentityUTF8Bytes,
          mayBeEmpty: false)
      } ?? true
  }

  static func validEmbeddingValues(_ values: [Float]) -> Bool {
    values.count == LocalMusicalVersionDiscoveryPrototype.embeddingDimension
      && values.allSatisfy { $0.isFinite && $0 >= 0 && $0 <= 1.000_001 }
      && values.contains(where: { $0 > 0 })
  }

  // Produces authenticated hostile fixtures without weakening the production index initializer.
  static func checksumValidEncodedFixture(entries: [MusicalVersionIndexedAsset]) throws -> Data {
    try encodedEnvelope(entries: entries)
  }

  private static func retainedMemoryUpperBoundBytes(
    segmentCount: Int,
    assetIDUTF8Bytes: Int,
    fileURLUTF8Bytes: Int,
    filePathUTF8Bytes: Int,
    contentSHA256UTF8Bytes: Int,
    resourceIdentityUTF8Bytes: Int?,
    embeddingVersionUTF8Bytes: Int
  ) -> Int64? {
    let resourceIdentityIsWithinBounds =
      resourceIdentityUTF8Bytes.map {
        (0...hardMaximumResourceIdentityUTF8Bytes).contains($0)
      } ?? true
    guard segmentCount >= 0, segmentCount <= hardMaximumSegmentsPerAsset,
      (0...hardMaximumAssetIDUTF8Bytes).contains(assetIDUTF8Bytes),
      (0...hardMaximumFileURLUTF8Bytes).contains(fileURLUTF8Bytes),
      (0...hardMaximumFilePathUTF8Bytes).contains(filePathUTF8Bytes),
      contentSHA256UTF8Bytes == 64,
      embeddingVersionUTF8Bytes
        == LocalMusicalVersionDiscoveryPrototype.embeddingVersion.utf8.count,
      resourceIdentityIsWithinBounds
    else { return nil }

    var total = fixedEntryAndContainerMemoryUpperBoundBytes
    guard appendStringStorage(assetIDUTF8Bytes, to: &total),
      append(urlObjectMemoryUpperBoundBytes, to: &total),
      appendStringStorage(fileURLUTF8Bytes, to: &total),
      appendStringStorage(filePathUTF8Bytes, to: &total),
      appendStringStorage(contentSHA256UTF8Bytes, to: &total)
    else { return nil }
    if let resourceIdentityUTF8Bytes {
      guard appendStringStorage(resourceIdentityUTF8Bytes, to: &total) else { return nil }
    }
    guard appendStringStorage(embeddingVersionUTF8Bytes, to: &total),
      appendArrayStorage(
        count: LocalMusicalVersionDiscoveryPrototype.embeddingDimension,
        elementMemoryBytes: MemoryLayout<Float>.stride,
        to: &total),
      appendArrayStorage(
        count: segmentCount,
        elementMemoryBytes: Int(segmentContainerElementMemoryUpperBoundBytes),
        to: &total)
    else { return nil }

    var perSegment: Int64 = 0
    guard appendStringStorage(embeddingVersionUTF8Bytes, to: &perSegment),
      appendArrayStorage(
        count: LocalMusicalVersionDiscoveryPrototype.embeddingDimension,
        elementMemoryBytes: MemoryLayout<Float>.stride,
        to: &perSegment),
      let allSegmentStorage = checkedProduct(Int64(segmentCount), perSegment),
      append(allSegmentStorage, to: &total)
    else { return nil }
    return total
  }

  private static func validate(_ entries: [MusicalVersionIndexedAsset]) -> Bool {
    guard !entries.isEmpty,
      entries.count <= hardMaximumEntries,
      entries == entries.sorted(by: { $0.observation.assetID < $1.observation.assetID }),
      Set(entries.map(\.observation.assetID)).count == entries.count
    else { return false }
    return entries.allSatisfy { entry in
      guard
        let minimumMemory = retainedMemoryUpperBoundBytes(
          observation: entry.observation,
          wholeRecording: entry.wholeRecording,
          segments: entry.segments),
        let maximumMemory = maximumRetainedMemoryUpperBoundBytes(
          segmentCount: entry.segments.count)
      else { return false }
      return entry.durationSeconds.isFinite
        && entry.durationSeconds > 0
        && entry.workingMemoryUpperBoundBytes >= minimumMemory
        && entry.workingMemoryUpperBoundBytes <= maximumMemory
        && entry.segments.allSatisfy { segment in
          segment.range.startSeconds.isFinite
            && segment.range.startSeconds >= 0
            && segment.range.durationSeconds.isFinite
            && segment.range.durationSeconds > 0
            && segment.range.startSeconds + segment.range.durationSeconds
              <= entry.durationSeconds + 0.001
        }
    }
  }

  private static func encodedEnvelope(entries: [MusicalVersionIndexedAsset]) throws -> Data {
    let payload = MusicalVersionIndexPayload(
      magic: magic,
      schemaVersion: schemaVersion,
      indexVersion: indexVersion,
      embeddingVersion: LocalMusicalVersionDiscoveryPrototype.embeddingVersion,
      entries: entries)
    let payloadData = try encode(payload)
    let envelope = MusicalVersionIndexEnvelope(
      payload: payload,
      payloadSHA256: sha256(payloadData))
    let data = try encode(envelope)
    guard data.count <= hardMaximumEncodedBytes else {
      throw MusicalVersionDiscoveryIndexError.outsideBounds
    }
    return data
  }

  private static func isValidBoundedString(
    _ value: String,
    maximumUTF8Bytes: Int,
    mayBeEmpty: Bool
  ) -> Bool {
    let byteCount = value.utf8.count
    guard mayBeEmpty || byteCount > 0, byteCount <= maximumUTF8Bytes else { return false }
    return !value.unicodeScalars.contains { scalar in
      scalar.value < 0x20 || (0x7f...0x9f).contains(scalar.value)
    }
  }

  private static func isValidSHA256(_ value: String) -> Bool {
    value.utf8.count == 64
      && value.utf8.allSatisfy {
        (UInt8(ascii: "0")...UInt8(ascii: "9")).contains($0)
          || (UInt8(ascii: "a")...UInt8(ascii: "f")).contains($0)
      }
  }

  private static func appendStringStorage(_ utf8Bytes: Int, to total: inout Int64) -> Bool {
    guard utf8Bytes >= 0,
      let capacityBytes = checkedProduct(Int64(utf8Bytes), retainedCapacityMultiplier),
      let storage = checkedSum(stringObjectMemoryUpperBoundBytes, capacityBytes)
    else { return false }
    return append(storage, to: &total)
  }

  private static func appendArrayStorage(
    count: Int,
    elementMemoryBytes: Int,
    to total: inout Int64
  ) -> Bool {
    guard count >= 0, elementMemoryBytes >= 0,
      let elements = checkedProduct(Int64(count), Int64(elementMemoryBytes)),
      let capacityBytes = checkedProduct(elements, retainedCapacityMultiplier),
      let storage = checkedSum(arrayObjectMemoryUpperBoundBytes, capacityBytes)
    else { return false }
    return append(storage, to: &total)
  }

  private static func append(_ value: Int64, to total: inout Int64) -> Bool {
    guard let result = checkedSum(total, value) else { return false }
    total = result
    return true
  }

  private static func checkedSum(_ lhs: Int64, _ rhs: Int64) -> Int64? {
    guard lhs >= 0, rhs >= 0 else { return nil }
    let (sum, overflow) = lhs.addingReportingOverflow(rhs)
    return overflow ? nil : sum
  }

  private static func checkedProduct(_ lhs: Int64, _ rhs: Int64) -> Int64? {
    guard lhs >= 0, rhs >= 0 else { return nil }
    let (product, overflow) = lhs.multipliedReportingOverflow(by: rhs)
    return overflow ? nil : product
  }

  private static func encode<T: Encodable>(_ value: T) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try encoder.encode(value)
  }

  private static func sha256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

private struct MusicalVersionIndexPayload: Codable, Sendable, Equatable {
  let magic: String
  let schemaVersion: Int
  let indexVersion: String
  let embeddingVersion: String
  let entries: [MusicalVersionIndexedAsset]

  init(
    magic: String,
    schemaVersion: Int,
    indexVersion: String,
    embeddingVersion: String,
    entries: [MusicalVersionIndexedAsset]
  ) {
    self.magic = magic
    self.schemaVersion = schemaVersion
    self.indexVersion = indexVersion
    self.embeddingVersion = embeddingVersion
    self.entries = entries
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    magic = try container.decode(String.self, forKey: .magic)
    schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
    indexVersion = try container.decode(String.self, forKey: .indexVersion)
    embeddingVersion = try container.decode(String.self, forKey: .embeddingVersion)
    guard magic == "studio-time-machine-musical-version-recall",
      indexVersion == MusicalVersionDiscoveryIndex.indexVersion,
      embeddingVersion == LocalMusicalVersionDiscoveryPrototype.embeddingVersion
    else {
      throw DecodingError.dataCorruptedError(
        forKey: .magic,
        in: container,
        debugDescription: "Musical-version index metadata is incompatible.")
    }
    var encodedEntries = try container.nestedUnkeyedContainer(forKey: .entries)
    if let count = encodedEntries.count, count > MusicalVersionDiscoveryIndex.hardMaximumEntries {
      throw DecodingError.dataCorruptedError(
        forKey: .entries,
        in: container,
        debugDescription: "Musical-version index entry count exceeds its hard bound.")
    }
    var decodedEntries: [MusicalVersionIndexedAsset] = []
    decodedEntries.reserveCapacity(
      min(encodedEntries.count ?? 0, MusicalVersionDiscoveryIndex.hardMaximumEntries))
    while !encodedEntries.isAtEnd {
      guard decodedEntries.count < MusicalVersionDiscoveryIndex.hardMaximumEntries else {
        throw DecodingError.dataCorruptedError(
          forKey: .entries,
          in: container,
          debugDescription: "Musical-version index entry count exceeds its hard bound.")
      }
      decodedEntries.append(try encodedEntries.decode(MusicalVersionIndexedAsset.self))
    }
    entries = decodedEntries
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(magic, forKey: .magic)
    try container.encode(schemaVersion, forKey: .schemaVersion)
    try container.encode(indexVersion, forKey: .indexVersion)
    try container.encode(embeddingVersion, forKey: .embeddingVersion)
    try container.encode(entries, forKey: .entries)
  }

  private enum CodingKeys: String, CodingKey {
    case magic
    case schemaVersion
    case indexVersion
    case embeddingVersion
    case entries
  }
}

private struct MusicalVersionIndexEnvelope: Codable, Sendable, Equatable {
  let payload: MusicalVersionIndexPayload
  let payloadSHA256: String
}

private struct MusicalVersionIndexHeader: Decodable {
  struct Payload: Decodable {
    let schemaVersion: Int
  }

  let payload: Payload
}
