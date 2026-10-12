import Foundation

public struct VerifiedAbletonExportFile: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let fileURL: URL
  public let bytes: Int64
  public let modifiedAt: Date
  public let format: String
  public let durationSeconds: Double?
  public let sampleRate: Double
  public let bitDepth: Int
  public let channelCount: Int
  public let physicalIdentity: String?
  public let contentDigest: String?

  public init(
    fileURL: URL,
    bytes: Int64,
    modifiedAt: Date,
    format: String,
    durationSeconds: Double?,
    sampleRate: Double,
    bitDepth: Int,
    channelCount: Int,
    physicalIdentity: String? = nil,
    contentDigest: String? = nil
  ) {
    self.fileURL = fileURL.standardizedFileURL
    self.bytes = bytes
    self.modifiedAt = modifiedAt
    self.format = format
    self.durationSeconds = durationSeconds
    self.sampleRate = sampleRate
    self.bitDepth = bitDepth
    self.channelCount = channelCount
    self.physicalIdentity = physicalIdentity
    self.contentDigest = contentDigest
    id = StableID.forValue(
      "verified-export:\(fileURL.standardizedFileURL.path):\(bytes):\(modifiedAt.timeIntervalSince1970)"
    )
  }
}

public enum AbletonExportExecutor: String, Codable, Sendable {
  case macOSAccessibility
  case computerUseRecovery
}

public struct AbletonExportEvidence: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let planID: String
  public let setID: String
  public let revisionID: String
  public let workID: String?
  public let workName: String?
  public let revisionReference: StudioRevisionReference?
  public let setURL: URL
  public let startedAt: Date
  public let completedAt: Date
  public let executor: AbletonExportExecutor
  public let adapterVersion: String
  public let source: AbletonExportSource
  public let arrangementRange: AbletonArrangementRange
  public let pcmFormat: AbletonExportPCMFormat
  public let sampleRate: AbletonExportSampleRate
  public let bitDepth: AbletonExportBitDepth
  public let normalize: Bool
  public let includeReturnAndMainEffects: Bool
  public let overwritePolicy: AbletonExportOverwritePolicy
  public let outputs: [VerifiedAbletonExportFile]
  public let explanation: String

  public init(
    plan: AbletonExportPlan,
    startedAt: Date,
    completedAt: Date,
    executor: AbletonExportExecutor,
    adapterVersion: String,
    outputs: [VerifiedAbletonExportFile],
    explanation: String
  ) {
    planID = plan.id
    setID = plan.setID
    revisionID = plan.revisionID
    workID = plan.workID
    workName = plan.workName
    revisionReference = plan.revisionReference
    setURL = plan.setURL
    self.startedAt = startedAt
    self.completedAt = completedAt
    self.executor = executor
    self.adapterVersion = adapterVersion
    source = plan.source
    arrangementRange = plan.arrangementRange
    pcmFormat = plan.pcmFormat
    sampleRate = plan.sampleRate
    bitDepth = plan.bitDepth
    normalize = plan.normalize
    includeReturnAndMainEffects = plan.includeReturnAndMainEffects
    overwritePolicy = plan.overwritePolicy
    self.outputs = outputs
    self.explanation = explanation
    id = StableID.forValue(
      "export-evidence:\(plan.id):\(outputs.map(\.id).joined(separator: ":"))")
  }
}

public enum AbletonExportVerificationError: Error, LocalizedError, Equatable {
  case missingOutputs(expected: Int?)
  case unexpectedFileCount(expected: Int, actual: Int)
  case emptyOutput(URL)
  case staleOutput(URL)
  case unreadableAudio(URL)
  case formatMismatch(URL, expected: String, actual: String)
  case sampleRateMismatch(URL, expected: Int, actual: Double)
  case bitDepthMismatch(URL, expected: Int, actual: Int)
  case outputChangedDuringVerification(URL)

  public var errorDescription: String? {
    switch self {
    case .missingOutputs(let expected):
      "No fresh export outputs were found\(expected.map { "; expected \($0)" } ?? "")."
    case .unexpectedFileCount(let expected, let actual):
      "Export produced \(actual) files; \(expected) were expected."
    case .emptyOutput(let url): "Export output is empty at \(url.path)."
    case .staleOutput(let url): "Export output is older than this automation run: \(url.path)."
    case .unreadableAudio(let url): "Export output is not readable audio: \(url.path)."
    case .formatMismatch(let url, let expected, let actual):
      "\(url.lastPathComponent) is \(actual), expected \(expected)."
    case .sampleRateMismatch(let url, let expected, let actual):
      "\(url.lastPathComponent) is \(actual) Hz, expected \(expected) Hz."
    case .bitDepthMismatch(let url, let expected, let actual):
      "\(url.lastPathComponent) is \(actual)-bit, expected \(expected)-bit."
    case .outputChangedDuringVerification(let url):
      "Export output changed while its immutable identity was being verified: \(url.path)."
    }
  }
}

public struct AbletonExportOutputVerifier: Sendable {
  public init() {}

  public func verify(
    plan: AbletonExportPlan,
    startedAt: Date,
    completedAt: Date = Date(),
    adapterVersion: String,
    fileManager: FileManager = .default
  ) throws -> AbletonExportEvidence {
    let urls = try outputURLs(for: plan, startedAt: startedAt, fileManager: fileManager)
    guard !urls.isEmpty else {
      throw AbletonExportVerificationError.missingOutputs(expected: plan.expectedFileCount)
    }
    if let expected = plan.expectedFileCount, urls.count != expected {
      throw AbletonExportVerificationError.unexpectedFileCount(
        expected: expected, actual: urls.count)
    }
    var outputs: [VerifiedAbletonExportFile] = []
    for url in urls.sorted(by: { $0.path < $1.path }) {
      let metadata: SampleTechnicalMetadata
      do {
        metadata = try SampleMetadataReader().read(url)
      } catch {
        throw AbletonExportVerificationError.unreadableAudio(url)
      }
      guard metadata.bytes > 0 else { throw AbletonExportVerificationError.emptyOutput(url) }
      guard let modifiedAt = metadata.modifiedAt,
        modifiedAt.timeIntervalSince(startedAt) >= -2
      else { throw AbletonExportVerificationError.staleOutput(url) }
      guard
        metadata.format.caseInsensitiveCompare(plan.pcmFormat.fileExtension) == .orderedSame
          || (plan.pcmFormat == .aiff
            && metadata.format.caseInsensitiveCompare("aif") == .orderedSame)
      else {
        throw AbletonExportVerificationError.formatMismatch(
          url, expected: plan.pcmFormat.fileExtension, actual: metadata.format)
      }
      guard let sampleRate = metadata.sampleRate else {
        throw AbletonExportVerificationError.unreadableAudio(url)
      }
      guard abs(sampleRate - Double(plan.sampleRate.rawValue)) < 1 else {
        throw AbletonExportVerificationError.sampleRateMismatch(
          url, expected: plan.sampleRate.rawValue, actual: sampleRate)
      }
      guard let bitDepth = metadata.bitDepth else {
        throw AbletonExportVerificationError.unreadableAudio(url)
      }
      guard bitDepth == plan.bitDepth.rawValue else {
        throw AbletonExportVerificationError.bitDepthMismatch(
          url, expected: plan.bitDepth.rawValue, actual: bitDepth)
      }
      guard let channelCount = metadata.channelCount, channelCount > 0 else {
        throw AbletonExportVerificationError.unreadableAudio(url)
      }
      let identity = try immutableIdentity(
        for: url,
        expectedBytes: metadata.bytes,
        expectedModifiedAt: modifiedAt,
        fileManager: fileManager)
      outputs.append(
        VerifiedAbletonExportFile(
          fileURL: url,
          bytes: metadata.bytes,
          modifiedAt: modifiedAt,
          format: metadata.format,
          durationSeconds: metadata.durationSeconds,
          sampleRate: sampleRate,
          bitDepth: bitDepth,
          channelCount: channelCount,
          physicalIdentity: identity.physicalIdentity,
          contentDigest: identity.contentDigest))
    }
    return AbletonExportEvidence(
      plan: plan,
      startedAt: startedAt,
      completedAt: completedAt,
      executor: .macOSAccessibility,
      adapterVersion: adapterVersion,
      outputs: outputs,
      explanation:
        "Verified fresh, non-empty, readable audio outputs and linked them to Set revision \(plan.revisionID)\(plan.workName.map { " in Work \($0)" } ?? ""). No source file was rewritten."
    )
  }

  private func immutableIdentity(
    for url: URL,
    expectedBytes: Int64,
    expectedModifiedAt: Date,
    fileManager: FileManager
  ) throws -> (physicalIdentity: String?, contentDigest: String) {
    let before = try FileFingerprint.read(from: url, fileManager: fileManager)
    let digest: String
    do {
      digest = try FileContentDigest.sha256(fileURL: url)
    } catch {
      throw AbletonExportVerificationError.unreadableAudio(url)
    }
    let after = try FileFingerprint.read(from: url, fileManager: fileManager)
    guard before == after, after.bytes == expectedBytes, after.modifiedAt == expectedModifiedAt
    else {
      throw AbletonExportVerificationError.outputChangedDuringVerification(url)
    }
    return (after.resourceIdentity, digest)
  }

  private func outputURLs(
    for plan: AbletonExportPlan,
    startedAt: Date,
    fileManager: FileManager
  ) throws -> [URL] {
    if !plan.destination.expectedOutputFileNames.isEmpty {
      return plan.destination.expectedOutputFileNames.map {
        plan.destination.directoryURL.appending(path: $0)
      }.filter { fileManager.fileExists(atPath: $0.path) }
    }
    if plan.source.expectedFileCount == 1 {
      return fileManager.fileExists(atPath: plan.primaryOutputURL.path)
        ? [plan.primaryOutputURL] : []
    }
    let contents = try fileManager.contentsOfDirectory(
      at: plan.destination.directoryURL,
      includingPropertiesForKeys: [.contentModificationDateKey, .isRegularFileKey],
      options: [.skipsHiddenFiles])
    return contents.filter { url in
      guard
        url.pathExtension.caseInsensitiveCompare(plan.pcmFormat.fileExtension) == .orderedSame
          || (plan.pcmFormat == .aiff
            && url.pathExtension.caseInsensitiveCompare("aif") == .orderedSame)
      else { return false }
      let values = try? url.resourceValues(forKeys: [
        .contentModificationDateKey, .isRegularFileKey,
      ])
      return values?.isRegularFile == true
        && (values?.contentModificationDate?.timeIntervalSince(startedAt) ?? -.infinity) >= -2
    }
  }
}

public struct AbletonExportInboxEvidenceAdapter: Sendable {
  public init() {}

  public func adapt(_ evidence: AbletonExportEvidence) -> [ExportAutomationOutputEvidence] {
    evidence.outputs.map { output in
      ExportAutomationOutputEvidence(
        fileURL: output.fileURL,
        physicalIdentity: output.physicalIdentity,
        bytes: output.bytes,
        modifiedAt: output.modifiedAt,
        contentDigest: output.contentDigest,
        planID: evidence.planID,
        workID: evidence.workID,
        sessionID: evidence.revisionReference?.sessionID,
        revisionID: evidence.revisionID,
        revisionReference: evidence.revisionReference)
    }
  }
}

public actor AbletonExportEvidenceStore {
  public let storageURL: URL

  public init(storageURL: URL) {
    self.storageURL = storageURL
  }

  public static func defaultStorageURL(fileManager: FileManager = .default) throws -> URL {
    let support = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true)
    return
      support
      .appending(path: "Plugin Radar/Studio Time Machine", directoryHint: .isDirectory)
      .appending(path: "ableton-export-evidence.plist")
  }

  public func all() throws -> [AbletonExportEvidence] {
    guard FileManager.default.fileExists(atPath: storageURL.path) else { return [] }
    let data = try Data(contentsOf: storageURL)
    return try PropertyListDecoder().decode(ExportEvidenceDocument.self, from: data).evidence
  }

  public func append(_ evidence: AbletonExportEvidence) throws {
    var existing = try all().filter { $0.id != evidence.id }
    existing.append(evidence)
    existing.sort { $0.completedAt > $1.completedAt }
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    let data = try encoder.encode(ExportEvidenceDocument(evidence: existing))
    try FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try data.write(to: storageURL, options: [.atomic])
  }
}

private struct ExportEvidenceDocument: Codable {
  var schemaVersion = 1
  let evidence: [AbletonExportEvidence]
}
