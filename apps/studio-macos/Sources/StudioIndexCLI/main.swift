import Foundation
import StudioCore

@main
enum StudioIndexCLI {
  static func main() async throws {
    let arguments = Array(CommandLine.arguments.dropFirst())
    if arguments.first == "calibration-report" {
      try await runCalibrationReport(Array(arguments.dropFirst()))
      return
    }
    if arguments.first == "calibration-review" {
      try await runCalibrationReview(Array(arguments.dropFirst()))
      return
    }
    guard let path = arguments.first, !path.hasPrefix("--") else {
      FileHandle.standardError.write(
        Data(
          """
          Usage:
            studio-index <music-folder> [--summary | --organisation-json] [--organisation-report <markdown-file>] [--cache <cache-file>] [--cached-only] [--samples-db <sqlite-file>]
            studio-index calibration-report --store <ledger.plist> [--json <report.json>] [--markdown <report.md>] [--generated-at <ISO-8601>]
            studio-index calibration-review --store <ledger.plist> --observation <observation.json> --label <label> --decision-id <id> [--decided-at <ISO-8601>]

          """.utf8)
      )
      throw ExitCode.usage
    }

    let rootURL = URL(fileURLWithPath: path, isDirectory: true)
    if let samplesFlag = arguments.firstIndex(of: "--samples-db") {
      guard arguments.indices.contains(samplesFlag + 1) else { throw ExitCode.usage }
      let database = try SampleLibraryDatabase(
        storageURL: URL(fileURLWithPath: arguments[samplesFlag + 1]))
      let location = try database.registerLocation(rootURL, securityScopedBookmark: nil)
      let statistics = try SampleLibraryIndexer().scan(
        location: location, projectRoots: [], database: database)
      let result = try database.querySamples(SampleQuery(limit: 1))
      try writeJSON(
        SampleIndexSummary(
          root: rootURL.path, sampleCount: result.totalCount,
          discovered: statistics.discoveredFileCount,
          metadataRead: statistics.metadataReadCount,
          metadataReused: statistics.reusedMetadataCount,
          removedMemberships: statistics.removedMembershipCount,
          durationSeconds: statistics.completedAt.timeIntervalSince(statistics.startedAt)))
      return
    }

    let index: StudioLibraryIndex
    if let cacheFlag = arguments.firstIndex(of: "--cache") {
      guard arguments.indices.contains(cacheFlag + 1) else { throw ExitCode.usage }
      let cacheURL = URL(fileURLWithPath: arguments[cacheFlag + 1])
      let repository = StudioLibraryRepository(storageURL: cacheURL)
      if arguments.contains("--cached-only") {
        guard let cached = try await repository.cachedIndex(containing: rootURL) else {
          FileHandle.standardError.write(
            Data("No cached index exists for \(rootURL.path).\n".utf8))
          throw ExitCode.missingCache
        }
        index = cached
      } else {
        index = try await repository.scan(rootURL: rootURL).index
      }
    } else {
      guard !arguments.contains("--cached-only") else { throw ExitCode.usage }
      index = try StudioLibraryIndexer().index(rootURL: rootURL)
    }

    if arguments.contains("--organisation-json")
      || arguments.contains("--organisation-report")
    {
      let catalog = try SessionContentOrganisationEngine().organise(
        indexes: [index], calibration: nil
      ).catalog
      if let reportFlag = arguments.firstIndex(of: "--organisation-report") {
        guard arguments.indices.contains(reportFlag + 1) else { throw ExitCode.usage }
        let reportURL = URL(fileURLWithPath: arguments[reportFlag + 1])
        try writeReport(WorkCatalogReport.markdown(catalog), to: reportURL)
      }
      let payload: any Encodable =
        arguments.contains("--organisation-json")
        ? catalog
        : OrganisationCorpusSummary(catalog: catalog)
      try writeJSON(payload)
      return
    }
    let payload: any Encodable =
      arguments.contains("--summary")
      ? CorpusSummary(index: index)
      : index

    try writeJSON(payload)
  }

  private static func runCalibrationReport(_ arguments: [String]) async throws {
    guard let storePath = option("--store", in: arguments) else { throw ExitCode.usage }
    let jsonURL = option("--json", in: arguments).map(URL.init(fileURLWithPath:))
    let markdownURL = option("--markdown", in: arguments).map(URL.init(fileURLWithPath:))
    guard jsonURL != nil || markdownURL != nil else { throw ExitCode.usage }
    let generatedAt = try option("--generated-at", in: arguments).map(parseDate) ?? Date()
    let store = CalibrationReviewStore(storageURL: URL(fileURLWithPath: storePath))
    let service = CalibrationLocalReportService(store: store)
    let report = try await service.generate(
      store: store,
      generatedAt: generatedAt,
      evidence: .localPrototype)
    try await service.write(report, jsonURL: jsonURL, markdownURL: markdownURL)
    try writeJSON(report)
  }

  private static func runCalibrationReview(_ arguments: [String]) async throws {
    guard let storePath = option("--store", in: arguments),
      let observationPath = option("--observation", in: arguments),
      let labelValue = option("--label", in: arguments),
      let label = CalibrationDecisionLabel(rawValue: labelValue),
      let action = CalibrationTypedReviewAction(label: label),
      let decisionID = option("--decision-id", in: arguments)
    else {
      throw ExitCode.usage
    }
    let observationURL = URL(fileURLWithPath: observationPath)
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let observation = try decoder.decode(
      CalibrationObservationSnapshot.self,
      from: CalibrationBoundedLocalFileReader.read(
        observationURL,
        maximumBytes: 8 * 1_024 * 1_024))
    let decidedAt = try option("--decided-at", in: arguments).map(parseDate) ?? Date()
    let record = try await CalibrationReviewRecordingService(
      store: CalibrationReviewStore(storageURL: URL(fileURLWithPath: storePath))
    ).record(
      CalibrationTypedReviewRequest(
        decisionID: decisionID,
        action: action,
        observation: observation,
        decidedAt: decidedAt))
    try writeJSON(record)
  }

  private static func option(_ name: String, in arguments: [String]) -> String? {
    guard let index = arguments.firstIndex(of: name),
      arguments.indices.contains(index + 1)
    else {
      return nil
    }
    return arguments[index + 1]
  }

  private static func parseDate(_ value: String) throws -> Date {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) { return date }
    formatter.formatOptions = [.withInternetDateTime]
    guard let date = formatter.date(from: value) else { throw ExitCode.invalidDate }
    return date
  }

  private static func writeJSON(_ payload: any Encodable) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .iso8601
    let data = try encoder.encode(AnyEncodable(payload))
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
  }

  private static func writeReport(_ report: String, to url: URL) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try Data(report.utf8).write(to: url, options: [.atomic])
  }
}

private struct SampleIndexSummary: Encodable {
  let root: String
  let sampleCount: Int
  let discovered: Int
  let metadataRead: Int
  let metadataReused: Int
  let removedMemberships: Int
  let durationSeconds: Double
}

private struct AnyEncodable: Encodable {
  private let encodeValue: (Encoder) throws -> Void

  init(_ value: any Encodable) {
    encodeValue = value.encode
  }

  func encode(to encoder: Encoder) throws {
    try encodeValue(encoder)
  }
}

private enum ExitCode: Error {
  case usage
  case missingCache
  case inputTooLarge
  case invalidDate
}
