import CryptoKit
import Darwin
import Foundation

public struct SessionContentFileMetadata: Codable, Sendable, Equatable {
  public let bytes: Int64
  public let modifiedAtNanoseconds: Int64
  public let volumeNumber: UInt64?
  public let fileNumber: UInt64?

  public init(
    bytes: Int64, modifiedAtNanoseconds: Int64, volumeNumber: UInt64?, fileNumber: UInt64?
  ) {
    self.bytes = bytes
    self.modifiedAtNanoseconds = modifiedAtNanoseconds
    self.volumeNumber = volumeNumber
    self.fileNumber = fileNumber
  }

  public var modifiedAt: Date {
    Date(timeIntervalSince1970: Double(modifiedAtNanoseconds) / 1_000_000_000)
  }

  public var resourceIdentity: String? {
    guard let volumeNumber, let fileNumber else { return nil }
    return "\(volumeNumber):\(fileNumber)"
  }
}

public struct SessionContentDigestObservation: Sendable, Equatable {
  public let sha256: String
  public let metadata: SessionContentFileMetadata

  public init(sha256: String, metadata: SessionContentFileMetadata) {
    self.sha256 = sha256
    self.metadata = metadata
  }
}

public enum SessionContentFileAccessError: Error, Sendable, Equatable {
  case fileTooLarge(actualBytes: Int64, maximumBytes: Int64)
  case changedWhileReading
  case invalidFileDescriptor
}

public protocol SessionContentFileAccess: Sendable {
  func metadata(at url: URL) throws -> SessionContentFileMetadata
  func sha256(at url: URL, maximumBytes: Int64) throws -> SessionContentDigestObservation
}

public struct LocalSessionContentFileAccess: SessionContentFileAccess {
  public init() {}

  public func metadata(at url: URL) throws -> SessionContentFileMetadata {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    return try metadata(for: handle)
  }

  public func sha256(at url: URL, maximumBytes: Int64) throws
    -> SessionContentDigestObservation
  {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    let before = try metadata(for: handle)
    guard before.bytes <= maximumBytes else {
      throw SessionContentFileAccessError.fileTooLarge(
        actualBytes: before.bytes, maximumBytes: maximumBytes)
    }

    var hasher = SHA256()
    var bytesRead: Int64 = 0
    while bytesRead <= maximumBytes {
      let remainingWithSentinel = maximumBytes - bytesRead + 1
      let readSize = Int(min(1_048_576, max(1, remainingWithSentinel)))
      guard let data = try handle.read(upToCount: readSize), !data.isEmpty else { break }
      bytesRead += Int64(data.count)
      guard bytesRead <= maximumBytes else {
        throw SessionContentFileAccessError.fileTooLarge(
          actualBytes: bytesRead, maximumBytes: maximumBytes)
      }
      hasher.update(data: data)
    }
    let after = try metadata(for: handle)
    guard before == after, bytesRead == before.bytes else {
      throw SessionContentFileAccessError.changedWhileReading
    }
    return SessionContentDigestObservation(
      sha256: FileContentDigest.hex(hasher.finalize()), metadata: after)
  }

  private func metadata(for handle: FileHandle) throws -> SessionContentFileMetadata {
    var value = stat()
    guard fstat(handle.fileDescriptor, &value) == 0 else {
      throw SessionContentFileAccessError.invalidFileDescriptor
    }
    let seconds = Int64(value.st_mtimespec.tv_sec)
    let nanoseconds = Int64(value.st_mtimespec.tv_nsec)
    return SessionContentFileMetadata(
      bytes: Int64(value.st_size),
      modifiedAtNanoseconds: seconds * 1_000_000_000 + nanoseconds,
      volumeNumber: UInt64(value.st_dev), fileNumber: UInt64(value.st_ino))
  }
}
