import AppKit
import CoreGraphics
import CoreText
import CryptoKit
import Foundation

public enum ProjectHandoffReportError: Error, Equatable {
  case identityMismatch
  case invalidAudit
  case invalidStagingEvidence
  case pdfGenerationFailed
}

public struct ProjectHandoffReportInput: Sendable {
  public let handoffPlan: ProjectHandoffPlan
  public let catalog: WorkCatalog
  public let catalogueGenerationID: String?
  public let audit: ProjectReadinessAudit
  public let stagingEvidence: ProjectStagingEvidence?
  public let stagingPlan: ProjectStagingCopyPlan?
  public let generatedAt: Date

  public init(
    handoffPlan: ProjectHandoffPlan,
    catalog: WorkCatalog,
    catalogueGenerationID: String? = nil,
    audit: ProjectReadinessAudit,
    stagingEvidence: ProjectStagingEvidence?,
    stagingPlan: ProjectStagingCopyPlan?,
    generatedAt: Date
  ) {
    self.handoffPlan = handoffPlan
    self.catalog = catalog
    self.catalogueGenerationID = catalogueGenerationID
    self.audit = audit
    self.stagingEvidence = stagingEvidence
    self.stagingPlan = stagingPlan
    self.generatedAt = generatedAt
  }
}

public struct ProjectHandoffReports: Sendable, Equatable {
  public let json: Data
  public let text: Data
  public let pdf: Data

  public init(json: Data, text: Data, pdf: Data) {
    self.json = json
    self.text = text
    self.pdf = pdf
  }
}

private struct RecipientHandoffReport: Codable {
  struct Assurance: Codable {
    let media: String
    let plugins: String
    let fallbackAudio: String
  }

  struct Boundary: Codable {
    let projectLeaf: String
    let projectInfoStatus: String
    let sourceContainment: String
    let portability: String
  }

  struct Live: Codable {
    let creator: String?
    let version: String?
    let edition: String?
    let requiresMaxForLive: Bool
    let maxForLiveDeviceCount: Int
    let nativeDevices: [String]
    let packs: [String]
  }

  struct Plugin: Codable {
    let name: String
    let manufacturer: String?
    let format: String
    let requiredVersion: String
    let tracks: [String]
    let senderStatus: String
    let managedLibraryStatus: String
    let managedLibraryEvidence: String
    let fallbackAvailable: Bool
  }

  struct Package: Codable {
    let estimatedStagedBytes: Int64
    let availableDiskBytes: Int64?
    let destinationCapacityStatus: String
    let fileCount: Int?
    let totalBytes: Int64?
    let manifestSHA256: String?
    let verificationMethod: String?
  }

  let schemaVersion: Int
  let artist: String
  let song: String
  let version: String
  let packageID: String
  let reviewCapturedAt: Date
  let auditedAt: Date
  let generatedAt: Date
  let sourceRevisionDate: Date?
  let senderNote: String?
  let status: String
  let assurance: Assurance
  let boundary: Boundary
  let live: Live
  let plugins: [Plugin]
  let warnings: [String]
  let package: Package
  let openingInstructions: [String]
  let caveats: [String]
}

public struct ProjectHandoffReportGenerator: Sendable {
  private let redactor: RecipientDataRedactor

  public init(redactor: RecipientDataRedactor = RecipientDataRedactor()) {
    self.redactor = redactor
  }

  public func generate(_ input: ProjectHandoffReportInput) throws -> ProjectHandoffReports {
    do {
      _ = try ProjectHandoffReferenceValidator().validate(
        plan: input.handoffPlan,
        in: input.catalog,
        catalogueGenerationID: input.catalogueGenerationID)
    } catch let error as ProjectHandoffReferenceValidationError {
      throw error
    }
    do { try input.audit.validate() } catch { throw ProjectHandoffReportError.invalidAudit }
    guard input.audit.planID == input.handoffPlan.id,
      input.audit.planFingerprint == input.handoffPlan.fingerprint,
      input.audit.workID == input.handoffPlan.workID,
      input.audit.sessionID == input.handoffPlan.sessionID,
      input.audit.revisionID == input.handoffPlan.revisionID
    else { throw ProjectHandoffReportError.identityMismatch }
    if let evidence = input.stagingEvidence {
      guard let stagingPlan = input.stagingPlan,
        stagingPlan.planID == input.handoffPlan.id,
        stagingPlan.handoffPlanFingerprint == input.handoffPlan.fingerprint,
        stagingPlan.handoffPlanFingerprint == input.audit.planFingerprint,
        stagingPlan.workID == input.handoffPlan.workID,
        stagingPlan.sessionID == input.handoffPlan.sessionID,
        stagingPlan.revisionID == input.handoffPlan.revisionID,
        stagingPlan.sourceProjectURL
          == input.handoffPlan.sourceProjectURL.resolvingSymlinksInPath().standardizedFileURL,
        stagingPlan.stagingRootURL
          == input.handoffPlan.stagingRootURL.resolvingSymlinksInPath().standardizedFileURL,
        stagingPlan.sourceProjectURL.appending(path: stagingPlan.sourceSetRelativePath)
          == input.handoffPlan.sourceSetURL.resolvingSymlinksInPath().standardizedFileURL
      else { throw ProjectHandoffReportError.identityMismatch }
      do { _ = try ProjectStagingVerifier().verify(evidence, against: stagingPlan) } catch {
        throw ProjectHandoffReportError.invalidStagingEvidence
      }
    } else if input.stagingPlan != nil {
      throw ProjectHandoffReportError.identityMismatch
    }
    let report = recipientReport(input)
    let json = try jsonEncoder().encode(report)
    let textString = plainText(report)
    let text = Data(textString.utf8)
    guard let pdf = UnicodePDFDocument.make(text: textString, generatedAt: input.generatedAt) else {
      throw ProjectHandoffReportError.pdfGenerationFailed
    }
    return ProjectHandoffReports(json: json, text: text, pdf: pdf)
  }

  private func recipientReport(_ input: ProjectHandoffReportInput) -> RecipientHandoffReport {
    let audit = input.audit
    let evidence = input.stagingEvidence
    return RecipientHandoffReport(
      schemaVersion: 2,
      artist: redactor.redact(input.handoffPlan.displaySnapshot.artist),
      song: redactor.redact(input.handoffPlan.displaySnapshot.song),
      version: redactor.redact(input.handoffPlan.displaySnapshot.version),
      packageID: redactor.redact(input.stagingEvidence?.packageID ?? input.handoffPlan.id),
      reviewCapturedAt: input.handoffPlan.createdAt,
      auditedAt: audit.auditedAt,
      generatedAt: input.generatedAt,
      sourceRevisionDate: audit.sourceModifiedAt,
      senderNote: input.handoffPlan.displaySnapshot.senderNote.map(redactor.redact),
      status: audit.status.recipientLabel,
      assurance: RecipientHandoffReport.Assurance(
        media: redactor.redact(audit.assurance.media.summary),
        plugins: redactor.redact(audit.assurance.plugins.summary),
        fallbackAudio: redactor.redact(audit.assurance.fallbackAudio.summary)
      ),
      boundary: RecipientHandoffReport.Boundary(
        projectLeaf: redactor.redact(audit.boundaryEvidence.projectLeafSummary),
        projectInfoStatus: audit.boundaryEvidence.projectInfoStatus.rawValue,
        sourceContainment: redactor.redact(audit.boundaryEvidence.sourceContainmentSummary),
        portability: redactor.redact(audit.boundaryEvidence.portabilitySummary)
      ),
      live: RecipientHandoffReport.Live(
        creator: audit.liveRequirement.creator.map(redactor.redact),
        version: audit.liveRequirement.version.map(redactor.redact),
        edition: audit.liveRequirement.edition.map(redactor.redact),
        requiresMaxForLive: audit.liveRequirement.requiresMaxForLive,
        maxForLiveDeviceCount: audit.liveRequirement.maxForLiveDeviceCount,
        nativeDevices: audit.liveRequirement.nativeDeviceNames.map(redactor.redact),
        packs: audit.liveRequirement.packNames.map(redactor.redact)
      ),
      plugins: audit.pluginRequirements.map { plugin in
        RecipientHandoffReport.Plugin(
          name: redactor.redact(plugin.name),
          manufacturer: plugin.manufacturer.map(redactor.redact),
          format: plugin.format.rawValue,
          requiredVersion: redactor.redact(plugin.requiredVersion ?? "Not encoded"),
          tracks: plugin.trackNames.map(redactor.redact),
          senderStatus: plugin.senderStatus.rawValue,
          managedLibraryStatus: plugin.managedLibraryStatus.rawValue,
          managedLibraryEvidence: redactor.redact(plugin.managedLibraryEvidence),
          fallbackAvailable: plugin.fallbackAvailable
        )
      },
      warnings: audit.risks.map { redactor.redact($0.summary) },
      package: RecipientHandoffReport.Package(
        estimatedStagedBytes: audit.estimatedStagedBytes,
        availableDiskBytes: audit.availableDiskBytes,
        destinationCapacityStatus: audit.destinationCapacityStatus.rawValue,
        fileCount: evidence?.manifest.files.count,
        totalBytes: evidence?.manifest.totalBytes,
        manifestSHA256: evidence?.manifestSHA256,
        verificationMethod: evidence.map { _ in
          "Byte count and SHA-256 verified against the staged copy manifest."
        }
      ),
      openingInstructions: [
        "Keep the complete Project folder together.",
        "Open the named Ableton Set inside the Project folder.",
        "Do not move files inside the Project before opening it.",
        "If this report marks fallback audio as included, use it when required devices are unavailable.",
      ],
      caveats: [
        "Plug-in documentation is not proof of recipient compatibility or licensing.",
        "Vendor-managed plug-in libraries may live outside Ableton's visible file references.",
        "Hardware and external instruments are not bundled.",
        "The sender remains responsible for sample redistribution rights.",
      ]
    )
  }

  private func plainText(_ report: RecipientHandoffReport) -> String {
    var lines = [
      "PROJECT HANDOFF",
      "",
      "Artist: \(report.artist)",
      "Song: \(report.song)",
      "Version: \(report.version)",
      "Package ID: \(report.packageID)",
      "Plan reviewed: \(iso8601(report.reviewCapturedAt))",
      "Audit evidence: \(iso8601(report.auditedAt))",
      "Generated: \(iso8601(report.generatedAt))",
      "Source revision date: \(report.sourceRevisionDate.map(iso8601) ?? "Unknown")",
      "Status: \(report.status)",
      "",
      "READINESS",
      "Ableton media: \(report.assurance.media)",
      "Plug-ins: \(report.assurance.plugins)",
      "Fallback audio: \(report.assurance.fallbackAudio)",
      "",
      "PROJECT BOUNDARY",
      "Project leaf: \(report.boundary.projectLeaf)",
      "Project info: \(report.boundary.projectInfoStatus)",
      "Contained on this Mac: \(report.boundary.sourceContainment)",
      "Portable to another Mac: \(report.boundary.portability)",
      "",
      "ABLETON REQUIREMENTS",
      "Creator: \(report.live.creator ?? "Unknown")",
      "Version: \(report.live.version ?? "Unknown")",
      "Edition: \(report.live.edition ?? "Unknown")",
      "Max for Live: \(report.live.requiresMaxForLive ? "Required" : "Not identified")",
    ]
    if let note = report.senderNote, !note.isEmpty {
      lines += ["", "SENDER NOTE", note]
    }
    lines += ["", "PLUG-INS"]
    if report.plugins.isEmpty {
      lines.append("No third-party plug-in requirements were identified.")
    } else {
      for plugin in report.plugins {
        lines.append(
          "- \(plugin.name) | \(plugin.manufacturer ?? "Unknown vendor") | \(plugin.format) | "
            + "required \(plugin.requiredVersion) | tracks: \(plugin.tracks.joined(separator: ", ")) | "
            + "sender: \(plugin.senderStatus) | managed library: \(plugin.managedLibraryStatus) "
            + "(\(plugin.managedLibraryEvidence)) | fallback: \(plugin.fallbackAvailable ? "yes" : "no")"
        )
      }
    }
    lines += ["", "WARNINGS"]
    lines += report.warnings.isEmpty ? ["No known warnings."] : report.warnings.map { "- \($0)" }
    lines += [
      "",
      "PACKAGE VERIFICATION",
      "Estimated staged bytes: \(report.package.estimatedStagedBytes)",
      "Available destination bytes: \(report.package.availableDiskBytes.map(String.init) ?? "Unknown")",
      "Destination capacity: \(report.package.destinationCapacityStatus)",
      "Files: \(report.package.fileCount.map(String.init) ?? "Not staged")",
      "Bytes: \(report.package.totalBytes.map(String.init) ?? "Not staged")",
      "Manifest SHA-256: \(report.package.manifestSHA256 ?? "Not staged")",
      "Method: \(report.package.verificationMethod ?? "No staged-copy verification evidence supplied")",
      "",
      "OPENING INSTRUCTIONS",
    ]
    lines += report.openingInstructions.enumerated().map { "\($0.offset + 1). \($0.element)" }
    lines += ["", "CAVEATS"]
    lines += report.caveats.map { "- \($0)" }
    return lines.joined(separator: "\n") + "\n"
  }

  private func jsonEncoder() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .iso8601
    return encoder
  }

  private func iso8601(_ date: Date) -> String {
    ISO8601DateFormatter().string(from: date)
  }
}

public struct RecipientDataRedactor: Sendable {
  public init() {}

  public func redact(_ value: String) -> String {
    var result = value
    result = replacing(
      #"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"#,
      in: result,
      with: "<redacted email>"
    )
    result = replacing(#"(?i)file://[^\s,;]+"#, in: result, with: "<redacted path>")
    result = replacing(
      #"(?i)\b[A-Z]:/[^\n,;)]*"#,
      in: result,
      with: "<redacted path>"
    )
    result = replacing(
      #"(?:(?<=^)|(?<=[\s:(]))//[^/\s]+/[^\n,;)]*"#,
      in: result,
      with: "<redacted path>"
    )
    result = replacing(
      #"(?:(?<=^)|(?<=[\s:(]))/(?:Users|Volumes|private|var|home|mnt|media)/[^\n,;)]*"#,
      in: result,
      with: "<redacted path>"
    )
    result = replacing(
      #"(?:(?<=^)|(?<=[\s:(]))/(?!/)[^\n,;)]*"#,
      in: result,
      with: "<redacted path>"
    )
    result = replacing(
      #"(?i)\b[A-Z]:\\[^\n,;)]*"#,
      in: result,
      with: "<redacted path>"
    )
    result = replacing(
      #"\\\\[^\\\s]+\\[^\n,;)]*"#,
      in: result,
      with: "<redacted path>"
    )
    result = replacing(
      #"(?i)\b(?:serial|licen[cs]e)(?:\s+(?:number|key))?\s*[:=]\s*[^\s,;]+"#,
      in: result,
      with: "<redacted licence data>"
    )
    result = replacing(
      #"(?<!\w)(?:\+?\d[\d ()-]{8,}\d)(?!\w)"#,
      in: result,
      with: "<redacted phone>"
    )
    return result
  }

  private func replacing(_ pattern: String, in value: String, with replacement: String) -> String {
    guard let expression = try? NSRegularExpression(pattern: pattern) else { return value }
    let range = NSRange(value.startIndex..<value.endIndex, in: value)
    return expression.stringByReplacingMatches(
      in: value,
      range: range,
      withTemplate: replacement
    )
  }
}

extension ProjectHandoffStatus {
  fileprivate var recipientLabel: String {
    switch self {
    case .ready: "Ready"
    case .readyWithLimitations: "Ready with limitations"
    case .needsAttention: "Needs attention"
    }
  }
}

private enum UnicodePDFDocument {
  static func make(text: String, generatedAt: Date) -> Data? {
    let data = NSMutableData()
    guard let consumer = CGDataConsumer(data: data as CFMutableData) else { return nil }
    var mediaBox = CGRect(x: 0, y: 0, width: 612, height: 792)
    let metadata: [CFString: Any] = [
      kCGPDFContextCreator: "Studio Time Machine",
      "CreationDate" as CFString: generatedAt as CFDate,
      "ModDate" as CFString: generatedAt as CFDate,
    ]
    guard let context = CGContext(consumer: consumer, mediaBox: &mediaBox, metadata as CFDictionary)
    else { return nil }
    let style = NSMutableParagraphStyle()
    style.lineBreakMode = .byWordWrapping
    style.lineSpacing = 2
    let attributed = NSAttributedString(
      string: text,
      attributes: [
        .font: CTFontCreateWithName("Helvetica" as CFString, 9, nil),
        .paragraphStyle: style,
        .foregroundColor: CGColor(gray: 0.08, alpha: 1),
      ]
    )
    let framesetter = CTFramesetterCreateWithAttributedString(attributed)
    var location = 0
    repeat {
      context.beginPDFPage(nil)
      context.textMatrix = .identity
      let framePath = CGPath(rect: CGRect(x: 48, y: 44, width: 516, height: 704), transform: nil)
      let frame = CTFramesetterCreateFrame(
        framesetter, CFRange(location: location, length: 0), framePath, nil)
      CTFrameDraw(frame, context)
      let visible = CTFrameGetVisibleStringRange(frame)
      guard visible.length > 0 else {
        context.endPDFPage()
        context.closePDF()
        return nil
      }
      location += visible.length
      context.endPDFPage()
    } while location < attributed.length
    context.closePDF()
    return normalizedDocumentID(in: data as Data, seed: Data(text.utf8))
  }

  private static func normalizedDocumentID(in pdf: Data, seed: Data) -> Data {
    var result = pdf
    guard let marker = result.range(of: Data("/ID [ <".utf8)) else { return result }
    let identifier = Data(FileContentDigest.hex(SHA256.hash(data: seed)).prefix(32).utf8)
    let firstStart = marker.upperBound
    let firstEnd = firstStart + 32
    guard firstEnd <= result.endIndex else { return result }
    result.replaceSubrange(firstStart..<firstEnd, with: identifier)
    guard let secondMarker = result[firstEnd...].range(of: Data("<".utf8)) else { return result }
    let secondStart = secondMarker.upperBound
    let secondEnd = secondStart + 32
    guard secondEnd <= result.endIndex else { return result }
    result.replaceSubrange(secondStart..<secondEnd, with: identifier)
    return result
  }
}
