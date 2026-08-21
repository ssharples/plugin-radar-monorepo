import Foundation
import StudioCore

extension PreviewAssetCategory {
  var displayName: String {
    switch self {
    case .freeze: "Freeze"
    case .consolidated: "Consolidated"
    case .crop: "Cropped"
    case .recorded: "Recorded"
    case .imported: "Imported"
    case .reversed: "Reversed"
    case .otherAudio: "Other audio"
    }
  }
}

extension PreviewAsset {
  var filename: String { fileURL.lastPathComponent }
  var sizeText: String { bytes.formatted(.byteCount(style: .file)) }
  var modifiedText: String {
    modifiedAt?.formatted(date: .abbreviated, time: .shortened) ?? "Date unavailable"
  }
  var isAvailableOnDisk: Bool { FileManager.default.fileExists(atPath: fileURL.path) }
}

extension AbletonSet {
  var modifiedText: String {
    modifiedAt?.formatted(date: .abbreviated, time: .shortened) ?? "Date unavailable"
  }

  var liveVersionText: String {
    let pieces = [format.majorVersion, format.minorVersion].compactMap { $0 }
    return pieces.isEmpty ? "Live version unknown" : "Live \(pieces.joined(separator: "."))"
  }

  var compressedSizeText: String {
    compressedBytes.formatted(.byteCount(style: .file))
  }

  var expandedSizeText: String {
    Int64(xmlBytes).formatted(.byteCount(style: .file))
  }
}

extension StudioProject {
  var setCount: Int { timelines.reduce(0) { $0 + $1.versions.count } }
  var latestModifiedAt: Date? { sets.compactMap(\.modifiedAt).max() }
  var latestModifiedText: String {
    latestModifiedAt?.formatted(date: .abbreviated, time: .omitted) ?? "No dated Sets"
  }
}
