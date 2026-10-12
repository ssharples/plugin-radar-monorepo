import AVFoundation
import CryptoKit
import Foundation

public enum AudioContentIdentityError: Error, LocalizedError, Sendable {
  case unavailable(URL)
  case unreadable(URL, String)
  case unsupportedPCM(URL)

  public var errorDescription: String? {
    switch self {
    case .unavailable(let url):
      "Audio identity source is unavailable: \(url.path)"
    case .unreadable(let url, let reason):
      "Could not read audio identity source at \(url.path): \(reason)"
    case .unsupportedPCM(let url):
      "The decoded PCM format is unsupported for deterministic identity: \(url.path)"
    }
  }
}

public struct CanonicalPCMIdentity: Codable, Sendable, Equatable {
  public let sha256: String
  public let sampleRate: Double
  public let channelCount: Int
  public let frameCount: Int64
  public let algorithmVersion: String

  public init(
    sha256: String,
    sampleRate: Double,
    channelCount: Int,
    frameCount: Int64,
    algorithmVersion: String
  ) {
    self.sha256 = sha256
    self.sampleRate = sampleRate
    self.channelCount = channelCount
    self.frameCount = frameCount
    self.algorithmVersion = algorithmVersion
  }
}

public struct AudioFileIdentity: Codable, Sendable, Equatable {
  public let fileURL: URL
  public let byteCount: Int64
  public let byteSHA256: String
  public let canonicalPCM: CanonicalPCMIdentity?
  public let contentAssetID: String
  public let algorithmVersion: String

  public init(
    fileURL: URL,
    byteCount: Int64,
    byteSHA256: String,
    canonicalPCM: CanonicalPCMIdentity?,
    contentAssetID: String,
    algorithmVersion: String
  ) {
    self.fileURL = fileURL
    self.byteCount = byteCount
    self.byteSHA256 = byteSHA256
    self.canonicalPCM = canonicalPCM
    self.contentAssetID = contentAssetID
    self.algorithmVersion = algorithmVersion
  }
}

public struct AudioContentIdentityService: @unchecked Sendable {
  public static let algorithmVersion = "audio-content-identity-v1"
  public static let canonicalPCMAlgorithmVersion = "pcm-f64-planar-lossless-v2"

  private let fileManager: FileManager

  public init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
  }

  public func identify(_ fileURL: URL, decodeAudio: Bool = true) throws -> AudioFileIdentity {
    let canonicalURL = fileURL.resolvingSymlinksInPath().standardizedFileURL
    guard fileManager.fileExists(atPath: canonicalURL.path),
      fileManager.isReadableFile(atPath: canonicalURL.path)
    else { throw AudioContentIdentityError.unavailable(canonicalURL) }

    let values = try canonicalURL.resourceValues(forKeys: [.fileSizeKey])
    let byteCount = Int64(values.fileSize ?? 0)
    let byteSHA256: String
    do {
      byteSHA256 = try FileContentDigest.sha256(fileURL: canonicalURL)
    } catch {
      throw AudioContentIdentityError.unreadable(canonicalURL, error.localizedDescription)
    }

    let canonicalPCM: CanonicalPCMIdentity?
    if decodeAudio {
      do {
        canonicalPCM = try decodedPCMIdentity(canonicalURL)
      } catch let error as AudioContentIdentityError {
        throw error
      } catch {
        throw AudioContentIdentityError.unreadable(canonicalURL, error.localizedDescription)
      }
    } else {
      canonicalPCM = nil
    }
    let identityKey = canonicalPCM.map { "pcm:\($0.sha256)" } ?? "bytes:\(byteSHA256)"
    return AudioFileIdentity(
      fileURL: canonicalURL,
      byteCount: byteCount,
      byteSHA256: byteSHA256,
      canonicalPCM: canonicalPCM,
      contentAssetID: StableID.forValue("content-asset:\(identityKey)"),
      algorithmVersion: Self.algorithmVersion
    )
  }

  private func decodedPCMIdentity(_ url: URL) throws -> CanonicalPCMIdentity {
    let file = try AVAudioFile(
      forReading: url,
      commonFormat: .pcmFormatFloat64,
      interleaved: false
    )
    let format = file.processingFormat
    guard format.commonFormat == .pcmFormatFloat64, !format.isInterleaved,
      format.channelCount > 0
    else { throw AudioContentIdentityError.unsupportedPCM(url) }

    var hasher = SHA256()
    hasher.update(data: Data(Self.canonicalPCMAlgorithmVersion.utf8))
    Self.update(UInt64(format.sampleRate.bitPattern), hasher: &hasher)
    Self.update(UInt64(format.channelCount), hasher: &hasher)
    Self.update(UInt64(file.length), hasher: &hasher)

    let capacity: AVAudioFrameCount = 16_384
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
      throw AudioContentIdentityError.unsupportedPCM(url)
    }
    var framesRead: Int64 = 0
    while file.framePosition < file.length {
      let remaining = file.length - file.framePosition
      let requested = AVAudioFrameCount(min(AVAudioFramePosition(capacity), remaining))
      guard requested > 0 else { break }
      try file.read(into: buffer, frameCount: requested)
      let frameLength = Int(buffer.frameLength)
      guard frameLength > 0 else { break }
      let audioBuffers = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
      guard audioBuffers.count == Int(format.channelCount) else {
        throw AudioContentIdentityError.unsupportedPCM(url)
      }
      for channel in 0..<audioBuffers.count {
        guard let data = audioBuffers[channel].mData else {
          throw AudioContentIdentityError.unsupportedPCM(url)
        }
        let samples = data.bindMemory(to: Double.self, capacity: frameLength)
        for frame in 0..<frameLength {
          Self.update(samples[frame].bitPattern, hasher: &hasher)
        }
      }
      framesRead += Int64(frameLength)
    }
    return CanonicalPCMIdentity(
      sha256: FileContentDigest.hex(hasher.finalize()),
      sampleRate: format.sampleRate,
      channelCount: Int(format.channelCount),
      frameCount: framesRead,
      algorithmVersion: Self.canonicalPCMAlgorithmVersion
    )
  }

  private static func update(_ value: UInt64, hasher: inout SHA256) {
    var littleEndian = value.littleEndian
    withUnsafeBytes(of: &littleEndian) { hasher.update(bufferPointer: $0) }
  }

}
