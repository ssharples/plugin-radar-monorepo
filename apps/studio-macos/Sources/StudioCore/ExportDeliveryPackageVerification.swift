import CryptoKit
import Foundation

public struct DeliveryPackageManifestFile: Codable, Sendable, Equatable {
  public let archivePath: String
  public let sourceObservationKey: String
  public let bytes: Int64
  public let sha256: String

  public init(
    archivePath: String,
    sourceObservationKey: String,
    bytes: Int64,
    sha256: String
  ) {
    self.archivePath = archivePath
    self.sourceObservationKey = sourceObservationKey
    self.bytes = bytes
    self.sha256 = sha256.lowercased()
  }
}

public struct DeliveryPackageManifest: Codable, Sendable, Equatable {
  public static let currentSchemaVersion = 1
  public static let archivePath = "StudioTimeMachineManifest.json"

  public let schemaVersion: Int
  public let batchID: String
  public let files: [DeliveryPackageManifestFile]

  public init(
    schemaVersion: Int = Self.currentSchemaVersion,
    batchID: String,
    files: [DeliveryPackageManifestFile]
  ) {
    self.schemaVersion = schemaVersion
    self.batchID = batchID
    self.files = files
  }
}

public struct DeliveryArchiveEntryObservation: Sendable, Equatable {
  public let bytes: Int64
  public let sha256: String
}

public protocol DeliveryArchiveInspecting: Sendable {
  func entryNames(in archiveURL: URL) throws -> [String]
  func data(for entry: String, in archiveURL: URL, maximumBytes: Int) throws -> Data
  func observation(for entry: String, in archiveURL: URL) throws
    -> DeliveryArchiveEntryObservation
}

public enum DeliveryPackageVerificationError: Error, Equatable {
  case missingArchive(URL)
  case invalidArchive
  case archiveChanged
  case missingManifest
  case oversizedManifest
  case malformedManifest
  case unsupportedManifestSchema(Int)
  case wrongBatch(expected: String, actual: String)
  case unsafeArchivePath(String)
  case duplicateArchiveEntry(String)
  case duplicateSourceObservation(String)
  case manifestFileMismatch
  case sourceObservationMismatch(String)
  case archiveEntryMismatch(String)
}

public struct VerifiedDeliveryPackage: Sendable {
  public let package: DeliveryPackage
  public let batchID: String
  let archiveObservation: DeliveryArchiveObservation
}

public protocol DeliveryPackageVerifying: Sendable {
  func verify(
    archiveURL: URL,
    for batch: ExportBatch,
    verifiedAt: Date
  ) throws -> VerifiedDeliveryPackage

  func revalidate(_ verifiedPackage: VerifiedDeliveryPackage) throws
}

public struct LocalDeliveryPackageVerifier: DeliveryPackageVerifying, @unchecked Sendable {
  private let inspector: any DeliveryArchiveInspecting
  private let fileManager: FileManager

  public init(
    inspector: any DeliveryArchiveInspecting = SystemZipArchiveInspector(),
    fileManager: FileManager = .default
  ) {
    self.inspector = inspector
    self.fileManager = fileManager
  }

  public func verify(
    archiveURL: URL,
    for batch: ExportBatch,
    verifiedAt: Date = Date()
  ) throws -> VerifiedDeliveryPackage {
    let archiveURL = archiveURL.standardizedFileURL
    guard fileManager.fileExists(atPath: archiveURL.path) else {
      throw DeliveryPackageVerificationError.missingArchive(archiveURL)
    }
    let before = try observeArchive(archiveURL)
    let entries = try inspector.entryNames(in: archiveURL)
    try validateEntryNames(entries)
    guard entries.contains(DeliveryPackageManifest.archivePath) else {
      throw DeliveryPackageVerificationError.missingManifest
    }
    let manifestData: Data
    do {
      manifestData = try inspector.data(
        for: DeliveryPackageManifest.archivePath,
        in: archiveURL,
        maximumBytes: 1_048_576)
    } catch DeliveryPackageVerificationError.oversizedManifest {
      throw DeliveryPackageVerificationError.oversizedManifest
    } catch {
      throw DeliveryPackageVerificationError.invalidArchive
    }
    let manifest: DeliveryPackageManifest
    do {
      manifest = try JSONDecoder().decode(DeliveryPackageManifest.self, from: manifestData)
    } catch {
      throw DeliveryPackageVerificationError.malformedManifest
    }
    guard manifest.schemaVersion == DeliveryPackageManifest.currentSchemaVersion else {
      throw DeliveryPackageVerificationError.unsupportedManifestSchema(manifest.schemaVersion)
    }
    guard manifest.batchID == batch.id else {
      throw DeliveryPackageVerificationError.wrongBatch(
        expected: batch.id, actual: manifest.batchID)
    }
    try validate(manifest: manifest, entries: entries, batch: batch, archiveURL: archiveURL)

    let after = try observeArchive(archiveURL)
    guard before == after else { throw DeliveryPackageVerificationError.archiveChanged }
    guard let manifestText = String(data: manifestData, encoding: .utf8) else {
      throw DeliveryPackageVerificationError.malformedManifest
    }
    let createdAt =
      try archiveURL.resourceValues(forKeys: [.creationDateKey]).creationDate
      ?? verifiedAt
    let package = DeliveryPackage(
      archiveURL: archiveURL,
      files: batch.files,
      bytes: after.bytes,
      sha256: after.sha256,
      verifiedAt: verifiedAt,
      manifest: manifestText,
      createdAt: createdAt)
    return VerifiedDeliveryPackage(
      package: package,
      batchID: batch.id,
      archiveObservation: after)
  }

  public func revalidate(_ verifiedPackage: VerifiedDeliveryPackage) throws {
    let current = try observeArchive(verifiedPackage.package.archiveURL)
    guard current == verifiedPackage.archiveObservation else {
      throw DeliveryPackageVerificationError.archiveChanged
    }
  }

  private func validate(
    manifest: DeliveryPackageManifest,
    entries: [String],
    batch: ExportBatch,
    archiveURL: URL
  ) throws {
    var batchFiles: [String: ExportBatchFile] = [:]
    for file in batch.files {
      guard batchFiles.updateValue(file, forKey: file.deduplicationKey) == nil else {
        throw DeliveryPackageVerificationError.duplicateSourceObservation(file.deduplicationKey)
      }
    }
    let manifestKeys = manifest.files.map(\.sourceObservationKey)
    guard Set(manifestKeys).count == manifestKeys.count,
      Set(manifestKeys) == Set(batchFiles.keys)
    else { throw DeliveryPackageVerificationError.manifestFileMismatch }

    let manifestPaths = manifest.files.map(\.archivePath)
    guard Set(manifestPaths).count == manifestPaths.count else {
      throw DeliveryPackageVerificationError.manifestFileMismatch
    }
    let expectedEntries = Set(manifestPaths + [DeliveryPackageManifest.archivePath])
    guard Set(entries) == expectedEntries else {
      throw DeliveryPackageVerificationError.manifestFileMismatch
    }

    for manifestFile in manifest.files {
      guard let batchFile = batchFiles[manifestFile.sourceObservationKey],
        manifestFile.bytes == batchFile.bytes,
        manifestFile.sha256.count == 64,
        manifestFile.sha256.allSatisfy(\.isHexDigit)
      else {
        throw DeliveryPackageVerificationError.sourceObservationMismatch(
          manifestFile.archivePath)
      }
      let sourceObservation = try observeSource(batchFile)
      let observation: DeliveryArchiveEntryObservation
      do {
        observation = try inspector.observation(
          for: manifestFile.archivePath, in: archiveURL)
      } catch {
        throw DeliveryPackageVerificationError.invalidArchive
      }
      guard observation.bytes == manifestFile.bytes,
        observation.sha256 == manifestFile.sha256,
        observation.sha256 == sourceObservation.sha256
      else {
        throw DeliveryPackageVerificationError.archiveEntryMismatch(manifestFile.archivePath)
      }
    }
  }

  private func observeSource(
    _ batchFile: ExportBatchFile
  ) throws -> DeliveryArchiveEntryObservation {
    let before: FileFingerprint
    do {
      before = try FileFingerprint.read(from: batchFile.fileURL, fileManager: fileManager)
    } catch {
      throw DeliveryPackageVerificationError.sourceObservationMismatch(batchFile.fileURL.path)
    }
    guard before.bytes == batchFile.bytes,
      before.modifiedAt == batchFile.modifiedAt,
      batchFile.physicalIdentity == nil || before.resourceIdentity == batchFile.physicalIdentity
    else {
      throw DeliveryPackageVerificationError.sourceObservationMismatch(batchFile.fileURL.path)
    }
    let digest: String
    do {
      digest = try FileContentDigest.sha256(fileURL: batchFile.fileURL)
    } catch {
      throw DeliveryPackageVerificationError.sourceObservationMismatch(batchFile.fileURL.path)
    }
    guard
      let after = try? FileFingerprint.read(
        from: batchFile.fileURL, fileManager: fileManager),
      before == after,
      batchFile.contentDigest == nil || batchFile.contentDigest == digest
    else {
      throw DeliveryPackageVerificationError.sourceObservationMismatch(batchFile.fileURL.path)
    }
    return DeliveryArchiveEntryObservation(bytes: after.bytes, sha256: digest)
  }

  private func validateEntryNames(_ entries: [String]) throws {
    guard !entries.isEmpty else { throw DeliveryPackageVerificationError.invalidArchive }
    var seen: Set<String> = []
    for entry in entries {
      let components = entry.split(separator: "/", omittingEmptySubsequences: false)
      guard !entry.hasPrefix("/"), !entry.hasSuffix("/"), !components.contains(".."),
        !entry.contains("\n"), !entry.contains("\r"),
        !entry.contains(where: { "*?[]\\".contains($0) })
      else { throw DeliveryPackageVerificationError.unsafeArchivePath(entry) }
      guard seen.insert(entry).inserted else {
        throw DeliveryPackageVerificationError.duplicateArchiveEntry(entry)
      }
    }
  }

  private func observeArchive(_ archiveURL: URL) throws -> DeliveryArchiveObservation {
    let before: FileFingerprint
    do {
      before = try FileFingerprint.read(from: archiveURL, fileManager: fileManager)
    } catch {
      throw DeliveryPackageVerificationError.missingArchive(archiveURL)
    }
    guard before.bytes > 0 else { throw DeliveryPackageVerificationError.invalidArchive }
    let digest: String
    do {
      digest = try FileContentDigest.sha256(fileURL: archiveURL)
    } catch {
      throw DeliveryPackageVerificationError.invalidArchive
    }
    guard let after = try? FileFingerprint.read(from: archiveURL, fileManager: fileManager),
      before == after
    else { throw DeliveryPackageVerificationError.archiveChanged }
    return DeliveryArchiveObservation(
      physicalIdentity: after.resourceIdentity,
      bytes: after.bytes,
      modifiedAt: after.modifiedAt,
      sha256: digest)
  }
}

public struct SystemZipArchiveInspector: DeliveryArchiveInspecting, Sendable {
  public init() {}

  public func entryNames(in archiveURL: URL) throws -> [String] {
    let data = try run(arguments: ["-Z1", archiveURL.path], maximumBytes: 1_048_576)
    guard let output = String(data: data, encoding: .utf8) else {
      throw DeliveryPackageVerificationError.invalidArchive
    }
    return output.split(separator: "\n", omittingEmptySubsequences: true).map(String.init)
  }

  public func data(for entry: String, in archiveURL: URL, maximumBytes: Int) throws -> Data {
    try run(arguments: ["-p", archiveURL.path, entry], maximumBytes: maximumBytes)
  }

  public func observation(
    for entry: String,
    in archiveURL: URL
  ) throws -> DeliveryArchiveEntryObservation {
    let process = try process(arguments: ["-p", archiveURL.path, entry])
    let pipe = try requirePipe(process.standardOutput)
    try process.run()
    var hasher = SHA256()
    var bytes: Int64 = 0
    while let chunk = try pipe.fileHandleForReading.read(upToCount: 1_048_576), !chunk.isEmpty {
      bytes += Int64(chunk.count)
      hasher.update(data: chunk)
    }
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
      throw DeliveryPackageVerificationError.invalidArchive
    }
    return DeliveryArchiveEntryObservation(
      bytes: bytes,
      sha256: FileContentDigest.hex(hasher.finalize()))
  }

  private func run(arguments: [String], maximumBytes: Int) throws -> Data {
    let process = try process(arguments: arguments)
    let pipe = try requirePipe(process.standardOutput)
    try process.run()
    var result = Data()
    while let chunk = try pipe.fileHandleForReading.read(upToCount: 64 * 1_024), !chunk.isEmpty {
      guard result.count + chunk.count <= maximumBytes else {
        process.terminate()
        process.waitUntilExit()
        throw DeliveryPackageVerificationError.oversizedManifest
      }
      result.append(chunk)
    }
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
      throw DeliveryPackageVerificationError.invalidArchive
    }
    return result
  }

  private func process(arguments: [String]) throws -> Process {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
    process.arguments = arguments
    process.standardOutput = Pipe()
    process.standardError = FileHandle.nullDevice
    return process
  }
}

struct DeliveryArchiveObservation: Sendable, Equatable {
  let physicalIdentity: String?
  let bytes: Int64
  let modifiedAt: Date?
  let sha256: String
}

private func requirePipe(_ value: Any?) throws -> Pipe {
  guard let pipe = value as? Pipe else {
    throw DeliveryPackageVerificationError.invalidArchive
  }
  return pipe
}
