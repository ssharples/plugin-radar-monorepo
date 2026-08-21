import Foundation

struct FileFingerprint: Codable, Sendable, Equatable {
  let bytes: Int64
  let modifiedAt: Date?
  let volumeNumber: UInt64?
  let fileNumber: UInt64?

  var resourceIdentity: String? {
    guard let volumeNumber, let fileNumber else { return nil }
    return "\(volumeNumber):\(fileNumber)"
  }

  func hasSameContentMetadata(as other: FileFingerprint) -> Bool {
    bytes == other.bytes && modifiedAt == other.modifiedAt
  }

  static func read(from url: URL, fileManager: FileManager) throws -> FileFingerprint {
    let attributes = try fileManager.attributesOfItem(atPath: url.path)
    let bytes = (attributes[.size] as? NSNumber)?.int64Value ?? 0
    let modifiedAt = attributes[.modificationDate] as? Date
    let volumeNumber = (attributes[.systemNumber] as? NSNumber)?.uint64Value
    let fileNumber = (attributes[.systemFileNumber] as? NSNumber)?.uint64Value
    return FileFingerprint(
      bytes: bytes,
      modifiedAt: modifiedAt,
      volumeNumber: volumeNumber,
      fileNumber: fileNumber
    )
  }
}

extension AbletonSet {
  func relocating(to fileURL: URL, fingerprint: FileFingerprint) -> AbletonSet {
    AbletonSet(
      id: id,
      fileURL: fileURL,
      displayName: fileURL.deletingPathExtension().lastPathComponent,
      isBackup: fileURL.pathComponents.contains(where: {
        $0.caseInsensitiveCompare("Backup") == .orderedSame
      }),
      modifiedAt: fingerprint.modifiedAt,
      compressedBytes: fingerprint.bytes,
      xmlBytes: xmlBytes,
      creator: creator,
      format: format,
      structure: structure,
      content: content
    )
  }
}
