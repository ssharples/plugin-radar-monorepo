import CryptoKit
import Foundation

enum StableID {
  static func forURL(_ url: URL) -> String {
    let path = url.standardizedFileURL.path(percentEncoded: false)
    let digest = SHA256.hash(data: Data(path.utf8))
    return digest.prefix(12).map { String(format: "%02x", $0) }.joined()
  }

  static func forValue(_ value: String) -> String {
    let digest = SHA256.hash(data: Data(value.utf8))
    return digest.prefix(12).map { String(format: "%02x", $0) }.joined()
  }

  static func forFile(_ url: URL, fingerprint: FileFingerprint) -> String {
    if let resourceIdentity = fingerprint.resourceIdentity {
      return forValue("file:\(resourceIdentity)")
    }
    return forURL(url)
  }
}
