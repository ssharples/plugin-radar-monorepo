import Foundation

public protocol ExportFileProbeProviding: Sendable {
  func probe(_ fileURL: URL) throws -> ExportFileProbe?
}

public protocol ExportDetectionScheduling: Sendable {
  func wait(for interval: TimeInterval) async throws
}

public struct TaskExportDetectionScheduler: ExportDetectionScheduling {
  public init() {}

  public func wait(for interval: TimeInterval) async throws {
    guard interval > 0 else { return }
    try await Task.sleep(for: .seconds(interval))
  }
}

public struct ExportDetectionTiming: Sendable, Equatable {
  public let debounceInterval: TimeInterval
  public let stabilityProbeInterval: TimeInterval
  public let creationWindow: TimeInterval
  public let requiredMatchingProbes: Int

  public init(
    debounceInterval: TimeInterval = 1.5,
    stabilityProbeInterval: TimeInterval = 1,
    creationWindow: TimeInterval = 5,
    requiredMatchingProbes: Int = 2
  ) {
    self.debounceInterval = debounceInterval
    self.stabilityProbeInterval = stabilityProbeInterval
    self.creationWindow = max(0.001, creationWindow)
    self.requiredMatchingProbes = max(2, requiredMatchingProbes)
  }
}

public struct FileSystemExportFileProbeProvider: ExportFileProbeProviding {
  public init() {}

  public func probe(_ fileURL: URL) throws -> ExportFileProbe? {
    let keys: Set<URLResourceKey> = [.creationDateKey, .isRegularFileKey]
    let values = try fileURL.resourceValues(forKeys: keys)
    guard values.isRegularFile == true else { return nil }
    let fingerprint = try FileFingerprint.read(from: fileURL, fileManager: .default)
    guard let modifiedAt = fingerprint.modifiedAt else { return nil }
    return ExportFileProbe(
      fileURL: fileURL,
      physicalIdentity: fingerprint.resourceIdentity,
      bytes: fingerprint.bytes,
      createdAt: values.creationDate,
      modifiedAt: modifiedAt,
      technicalFormat: ExportTechnicalFormat(fileExtension: fileURL.pathExtension))
  }
}

public final class ExportDetectionService: @unchecked Sendable {
  public static let supportedAudioExtensions: Set<String> = [
    "aif", "aiff", "flac", "m4a", "mp3", "ogg", "wav",
  ]

  private let trackedRoots: [URL]
  private let sampleLibraryRoots: [URL]
  private let probeProvider: any ExportFileProbeProviding
  private let verifiedAutomationOutputs: [ExportAutomationOutputEvidence]
  private let associationCandidates: [ExportAssociationCandidate]
  private let scheduler: any ExportDetectionScheduling
  public let timing: ExportDetectionTiming

  public init(
    trackedRoots: [URL],
    sampleLibraryRoots: [URL] = [],
    probeProvider: any ExportFileProbeProviding = FileSystemExportFileProbeProvider(),
    verifiedAutomationOutputs: [ExportAutomationOutputEvidence] = [],
    associationCandidates: [ExportAssociationCandidate] = [],
    scheduler: any ExportDetectionScheduling = TaskExportDetectionScheduler(),
    timing: ExportDetectionTiming = ExportDetectionTiming()
  ) {
    self.trackedRoots = trackedRoots.map(\.standardizedFileURL)
    self.sampleLibraryRoots = sampleLibraryRoots.map(\.standardizedFileURL)
    self.probeProvider = probeProvider
    self.verifiedAutomationOutputs = verifiedAutomationOutputs
    self.associationCandidates = associationCandidates
    self.scheduler = scheduler
    self.timing = timing
  }

  public func detect(
    _ batch: LibraryFileEventBatch,
    observedAt: Date = Date()
  ) async throws -> [DetectedExportBatch] {
    let candidateURLs = batch.events
      .filter(isCandidateEvent)
      .map(\.fileURL)
      .map(\.standardizedFileURL)
      .reduce(into: [URL]()) { urls, url in
        if !urls.contains(url) { urls.append(url) }
      }
    guard !candidateURLs.isEmpty else { return [] }

    try await scheduler.wait(for: timing.debounceInterval)
    var observations = candidateURLs.reduce(into: [URL: [ExportFileProbe]]()) { result, url in
      if let probe = try? probeProvider.probe(url) { result[url] = [probe] }
    }
    for _ in 1..<timing.requiredMatchingProbes {
      try await scheduler.wait(for: timing.stabilityProbeInterval)
      for url in candidateURLs where observations[url] != nil {
        guard let probe = try? probeProvider.probe(url) else {
          observations[url] = nil
          continue
        }
        observations[url, default: []].append(probe)
      }
    }
    let files = observations.compactMap { url, probes in stableFile(for: url, probes: probes) }

    let compatibleGroups = Dictionary(grouping: files, by: groupingKey(for:))
    let creationWindowGroups = compatibleGroups.values.flatMap(clusterByCreationWindow)
    return creationWindowGroups.compactMap { files in
      let sorted = files.sorted { $0.probe.fileURL.path < $1.probe.fileURL.path }
      guard let first = sorted.first else { return nil }
      let association = association(for: sorted.map(\.probe))
      let detected = ExportBatch.detected(
        files: sorted.map { ExportBatchFile(probe: $0.probe) },
        kind: first.kind,
        completedAt: sorted.map { $0.probe.modifiedAt }.max() ?? observedAt,
        evidence: Array(Set(sorted.flatMap(\.evidence))).sorted {
          String(describing: $0) < String(describing: $1)
        },
        association: association,
        detectedAt: observedAt)
      let receipt = association.flatMap { association -> ExportAutomationDetectionReceipt? in
        guard association.confidence == .verified,
          let reference = association.revisionReference
        else { return nil }
        let planID = association.evidence.lazy.compactMap { evidence -> String? in
          guard case .verifiedAutomationOutput(let planID) = evidence else { return nil }
          return planID
        }.first
        return ExportAutomationDetectionReceipt(
          revisionReferenceID: reference.id,
          fileObservationKeys: detected.files.map(\.deduplicationKey).sorted(),
          planID: planID)
      }
      return DetectedExportBatch(batch: detected, automationReceipt: receipt)
    }
    .sorted { $0.id < $1.id }
  }

  private func groupingKey(for file: ClassifiedFile) -> String {
    let format = file.probe.technicalFormat
    let directory = file.probe.fileURL.deletingLastPathComponent().path
    let sampleRate = format.sampleRate.map { String($0) } ?? ""
    let bitDepth = format.bitDepth.map { String($0) } ?? ""
    let channelCount = format.channelCount.map { String($0) } ?? ""
    return
      "\(directory)|\(file.kind.rawValue)|\(format.fileExtension)|\(sampleRate)|\(bitDepth)|\(channelCount)|\(automationGroupingKey(for: file.probe))"
  }

  /// Each cluster is anchored to its earliest file. This groups actual timestamps within the
  /// configured interval without epoch-boundary artifacts or unbounded transitive chaining.
  private func clusterByCreationWindow(_ files: [ClassifiedFile]) -> [[ClassifiedFile]] {
    let sorted = files.sorted { lhs, rhs in
      let lhsDate = lhs.probe.createdAt ?? lhs.probe.modifiedAt
      let rhsDate = rhs.probe.createdAt ?? rhs.probe.modifiedAt
      if lhsDate != rhsDate { return lhsDate < rhsDate }
      return lhs.probe.fileURL.path < rhs.probe.fileURL.path
    }
    var clusters: [[ClassifiedFile]] = []
    var anchor: Date?
    for file in sorted {
      let creationDate = file.probe.createdAt ?? file.probe.modifiedAt
      if let anchor, creationDate.timeIntervalSince(anchor) <= timing.creationWindow {
        clusters[clusters.count - 1].append(file)
      } else {
        clusters.append([file])
        anchor = creationDate
      }
    }
    return clusters
  }

  private func isCandidateEvent(_ event: LibraryFileEvent) -> Bool {
    guard !event.isDirectory,
      event.kind == .created || event.kind == .modified,
      Self.supportedAudioExtensions.contains(event.fileURL.pathExtension.lowercased()),
      isWithinTrackedRoot(event.fileURL),
      !isExcluded(event.fileURL)
    else { return false }
    return true
  }

  private func stableFile(for url: URL, probes: [ExportFileProbe]) -> ClassifiedFile? {
    guard let stableProbe = probes.first,
      probes.count == timing.requiredMatchingProbes,
      probes.dropFirst().allSatisfy({ $0 == stableProbe }),
      stableProbe.bytes > 0,
      let classification = classify(stableProbe.fileURL)
    else { return nil }
    return ClassifiedFile(
      probe: stableProbe, kind: classification.kind, evidence: classification.evidence)
  }

  private func classify(_ fileURL: URL) -> (
    kind: ExportKind, evidence: [ExportAssociationEvidence]
  )? {
    let components = fileURL.deletingLastPathComponent().pathComponents.map { $0.lowercased() }
    let name = fileURL.deletingPathExtension().lastPathComponent.lowercased()
    let folder: String? =
      if components.contains("stems") { "Stems" } else if components.contains("masters") {
        "Masters"
      } else if components.contains("exports") { "Exports" } else if components.contains("bounces")
      { "Bounces" } else if components.contains("renders") { "Renders" } else { nil }

    let kind: ExportKind? =
      if name.contains("stem") || folder == "Stems" {
        .stems
      } else if name.contains("master") || folder == "Masters" {
        .master
      } else if name.contains("bounce") || folder == "Bounces" {
        .bounce
      } else if name.contains("render") || folder == "Renders" { .render } else if folder != nil {
        .unknown
      } else { nil }
    guard let kind else { return nil }

    var evidence =
      folder.map { [ExportAssociationEvidence.explicitExportFolder(folderName: $0)] } ?? []
    for token in ["stems", "master", "bounce", "render"].filter(name.contains) {
      evidence.append(.filenameSemantic(token: token))
    }
    return (kind, evidence)
  }

  private func association(for probes: [ExportFileProbe]) -> ExportAssociation? {
    let automated = probes.compactMap(automationEvidence(for:))
    if automated.count == probes.count,
      let first = automated.first,
      let revisionReference = first.revisionReference,
      automated.dropFirst().allSatisfy({ compatibleAutomationEvidence($0, first) })
    {
      return ExportAssociation(
        revisionReference: revisionReference,
        confidence: .verified,
        evidence: [.verifiedAutomationOutput(planID: first.planID)])
    }

    let filename = probes.map { $0.fileURL.deletingPathExtension().lastPathComponent }.joined(
      separator: " ")
    let normalizedFilename = normalized(filename)
    guard
      let suggestion =
        associationCandidates
        .filter({ normalizedFilename.contains(normalized($0.displayName)) })
        .sorted(by: { $0.displayName.count > $1.displayName.count })
        .first
    else { return nil }
    return ExportAssociation(
      suggestedWorkID: suggestion.workID,
      suggestedSessionID: suggestion.sessionID,
      suggestedRevisionID: suggestion.revisionID,
      evidence: [.filenameSemantic(token: suggestion.displayName)])
  }

  private func automationEvidence(for probe: ExportFileProbe) -> ExportAutomationOutputEvidence? {
    verifiedAutomationOutputs.first { output in
      output.fileURL == probe.fileURL
        && output.physicalIdentity != nil
        && output.physicalIdentity == probe.physicalIdentity
        && output.bytes == probe.bytes
        && output.modifiedAt == probe.modifiedAt
        && (output.contentDigest == nil || probe.contentDigest == nil
          || output.contentDigest == probe.contentDigest)
    }
  }

  private func automationGroupingKey(for probe: ExportFileProbe) -> String {
    guard let output = automationEvidence(for: probe) else { return "manual" }
    return [
      "verified", output.workID ?? "", output.sessionID ?? "", output.revisionID,
      output.planID ?? "", output.revisionReference?.id ?? "unreviewed",
    ]
    .joined(separator: ":")
  }

  private func compatibleAutomationEvidence(
    _ lhs: ExportAutomationOutputEvidence,
    _ rhs: ExportAutomationOutputEvidence
  ) -> Bool {
    lhs.workID == rhs.workID && lhs.sessionID == rhs.sessionID && lhs.revisionID == rhs.revisionID
      && lhs.planID == rhs.planID && lhs.revisionReference?.id == rhs.revisionReference?.id
  }

  private func isWithinTrackedRoot(_ url: URL) -> Bool {
    trackedRoots.contains { root in
      url.standardizedFileURL.path == root.path
        || url.standardizedFileURL.path.hasPrefix(root.path + "/")
    }
  }

  private func isExcluded(_ url: URL) -> Bool {
    if sampleLibraryRoots.contains(where: {
      url.path == $0.path || url.path.hasPrefix($0.path + "/")
    }) {
      return true
    }
    let path = url.path.lowercased()
    return [
      "/samples/recorded/", "/recordings/", "/freeze/", "/consolidate/", "/crop/", "/reverse/",
      "/sample library/",
    ]
    .contains(where: path.contains)
  }

  private func normalized(_ value: String) -> String {
    value.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) }.map(
      String.init
    ).joined()
  }
}

private struct ClassifiedFile {
  let probe: ExportFileProbe
  let kind: ExportKind
  let evidence: [ExportAssociationEvidence]
}
