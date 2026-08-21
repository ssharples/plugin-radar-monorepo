import CryptoKit
import Foundation

enum FileContentDigest {
  static func sha256(fileURL: URL, chunkSize: Int = 1_048_576) throws -> String {
    let handle = try FileHandle(forReadingFrom: fileURL)
    defer { try? handle.close() }
    var hasher = SHA256()
    while let data = try handle.read(upToCount: chunkSize), !data.isEmpty {
      hasher.update(data: data)
    }
    return hex(hasher.finalize())
  }

  static func hex<D: Sequence>(_ digest: D) -> String where D.Element == UInt8 {
    digest.map { String(format: "%02x", $0) }.joined()
  }
}
