import Foundation

public struct StudioLibraryIndexer {
  private static let audioExtensions: Set<String> = [
    "aif", "aiff", "flac", "m4a", "mp3", "ogg", "wav",
  ]

  private let parser: AbletonSetParser
  private let fileManager: FileManager

  public init(parser: AbletonSetParser = AbletonSetParser(), fileManager: FileManager = .default) {
    self.parser = parser
    self.fileManager = fileManager
  }

  public func index(rootURL: URL, scannedAt: Date = Date()) throws -> StudioLibraryIndex {
    try indexIncrementally(
      rootURL: rootURL,
      scannedAt: scannedAt,
      cachedSets: [],
      progress: { _ in }
    ).run.index
  }

  func indexIncrementally(
    rootURL: URL,
    scannedAt: Date = Date(),
    cachedSets: [CachedAbletonSet],
    progress: @escaping StudioLibraryRepository.ProgressHandler
  ) throws -> IncrementalIndexOutput {
    let startedAt = Date()
    let root = rootURL.standardizedFileURL
    progress(IndexingProgress(phase: .discovering, completed: 0, total: 1))
    let inventory = try inventory(rootURL: root)
    progress(IndexingProgress(phase: .discovering, completed: 1, total: 1))
    let projectRoots = inferredProjectRoots(from: inventory).sorted {
      $0.path.count > $1.path.count
    }

    var setsByProject: [URL: [AbletonSet]] = [:]
    var assetsByProject: [URL: [PreviewAsset]] = [:]
    var unassignedAudioAssets: [PreviewAsset] = []
    var issues: [IndexIssue] = []
    var nextCacheEntries: [CachedAbletonSet] = []

    let cachedByPath = Dictionary(
      uniqueKeysWithValues: cachedSets.map { ($0.set.fileURL.standardizedFileURL.path, $0) }
    )
    var cachedByResourceIdentity: [String: CachedAbletonSet] = [:]
    for entry in cachedSets {
      if let identity = entry.fingerprint.resourceIdentity {
        cachedByResourceIdentity[identity] = entry
      }
    }
    let cachedResourceEntries = cachedByResourceIdentity
    let setParser = parser

    let setWork = inventory.setURLs.compactMap { setURL -> SetIndexWork? in
      guard let projectRoot = closestProjectRoot(for: setURL, candidates: projectRoots) else {
        return nil
      }
      return SetIndexWork(setURL: setURL, projectRoot: projectRoot)
    }
    let accumulator = SetIndexAccumulator(count: setWork.count)
    let workerCount = min(4, max(1, setWork.count))
    DispatchQueue.concurrentPerform(iterations: workerCount) { worker in
      for offset in stride(from: worker, to: setWork.count, by: workerCount) {
        let work = setWork[offset]
        let record: SetIndexRecord
        do {
          let fileManager = FileManager.default
          let fingerprint = try FileFingerprint.read(
            from: work.setURL,
            fileManager: fileManager
          )
          let exactEntry = cachedByPath[work.setURL.standardizedFileURL.path]
          let movedEntry = fingerprint.resourceIdentity.flatMap { cachedResourceEntries[$0] }
          let reusableEntry = [exactEntry, movedEntry]
            .compactMap { $0 }
            .first(where: { entry in
              entry.fingerprint.hasSameContentMetadata(as: fingerprint)
                && fingerprintsHaveMatchingIdentity(entry.fingerprint, fingerprint)
            })

          let set: AbletonSet
          let reused: Bool
          if let reusableEntry {
            set = reusableEntry.set.relocating(to: work.setURL, fingerprint: fingerprint)
            reused = true
          } else {
            // XMLParser bridges a large number of short-lived Foundation objects. A CLI or
            // background scan has no event-loop pool to drain them, so bound their lifetime
            // to one Set instead of allowing a multi-gigabyte archive to accumulate them.
            let parsed = try autoreleasepool {
              try setParser.parse(fileURL: work.setURL)
            }
            set = AbletonSet(
              id: StableID.forFile(work.setURL, fingerprint: fingerprint),
              fileURL: work.setURL,
              displayName: work.setURL.deletingPathExtension().lastPathComponent,
              isBackup: work.setURL.pathComponents.contains(where: {
                $0.caseInsensitiveCompare("Backup") == .orderedSame
              }),
              modifiedAt: fingerprint.modifiedAt,
              compressedBytes: fingerprint.bytes,
              xmlBytes: parsed.xmlBytes,
              creator: parsed.creator,
              format: parsed.format,
              structure: parsed.structure,
              content: parsed.content
            )
            reused = false
          }
          let resolvedSet = set.resolvingDependencies(
            projectRoot: work.projectRoot,
            fileManager: fileManager
          )
          record = SetIndexRecord(
            projectRoot: work.projectRoot,
            fingerprint: fingerprint,
            set: resolvedSet,
            issue: nil,
            reused: reused
          )
        } catch {
          record = SetIndexRecord(
            projectRoot: work.projectRoot,
            fingerprint: nil,
            set: nil,
            issue: IndexIssue(
              id: StableID.forValue(
                "\(work.setURL.path(percentEncoded: false)):\(error.localizedDescription)"),
              fileURL: work.setURL,
              message: error.localizedDescription
            ),
            reused: false
          )
        }
        accumulator.store(record, at: offset, progress: progress)
      }
    }

    let setResults = accumulator.results
    for record in setResults.records {
      if let set = record.set, let fingerprint = record.fingerprint {
        setsByProject[record.projectRoot, default: []].append(set)
        nextCacheEntries.append(CachedAbletonSet(fingerprint: fingerprint, set: set))
      }
      if let issue = record.issue { issues.append(issue) }
    }
    let parsedSetCount = setResults.parsedCount
    let reusedSetCount = setResults.reusedCount

    for (offset, audioURL) in inventory.audioURLs.enumerated() {
      let fingerprint = try? FileFingerprint.read(from: audioURL, fileManager: fileManager)
      let classification = PreviewAssetClassifier.classification(for: audioURL)
      let asset = PreviewAsset(
        id: fingerprint.map { StableID.forFile(audioURL, fingerprint: $0) }
          ?? StableID.forURL(audioURL),
        fileURL: audioURL,
        category: classification.category,
        isLikelyUserRender: classification.isLikelyUserRender,
        bytes: fingerprint?.bytes ?? 0,
        modifiedAt: fingerprint?.modifiedAt
      )
      if let projectRoot = closestProjectRoot(for: audioURL, candidates: projectRoots)
        ?? namedExportProjectRoot(
          for: audioURL,
          candidates: projectRoots,
          setsByProject: setsByProject,
          isLikelyUserRender: classification.isLikelyUserRender)
        ?? siblingExportProjectRoot(
          for: audioURL,
          candidates: projectRoots,
          isLikelyUserRender: classification.isLikelyUserRender)
      {
        assetsByProject[projectRoot, default: []].append(asset)
      } else {
        unassignedAudioAssets.append(asset)
      }

      if offset.isMultiple(of: 100) || offset == inventory.audioURLs.count - 1 {
        progress(
          IndexingProgress(
            phase: .classifyingAudio,
            completed: offset + 1,
            total: inventory.audioURLs.count,
            reused: reusedSetCount
          )
        )
      }
    }

    progress(
      IndexingProgress(phase: .finalizing, completed: 0, total: 1, reused: reusedSetCount)
    )
    let projects = projectRoots.map { projectRoot in
      StudioProject(
        id: StableID.forURL(projectRoot),
        rootURL: projectRoot,
        displayName: projectRoot.lastPathComponent,
        timelines: TimelineBuilder.build(from: setsByProject[projectRoot, default: []]),
        previewAssets: assetsByProject[projectRoot, default: []].sorted(by: previewAssetSort)
      )
    }
    .sorted { $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending }

    let completedAt = Date()
    let index = StudioLibraryIndex(
      rootURL: root,
      scannedAt: scannedAt,
      projects: projects,
      unassignedAudioAssets: unassignedAudioAssets.sorted(by: previewAssetSort),
      issues: issues
    )
    let statistics = IndexingStatistics(
      projectCount: projects.count,
      setCount: inventory.setURLs.count,
      parsedSetCount: parsedSetCount,
      reusedSetCount: reusedSetCount,
      audioAssetCount: inventory.audioURLs.count,
      issueCount: issues.count,
      startedAt: startedAt,
      completedAt: completedAt
    )
    progress(
      IndexingProgress(phase: .finalizing, completed: 1, total: 1, reused: reusedSetCount)
    )
    progress(IndexingProgress(phase: .complete, completed: 1, total: 1, reused: reusedSetCount))
    return IncrementalIndexOutput(
      run: IndexingRun(index: index, statistics: statistics),
      cacheEntries: nextCacheEntries
    )
  }

  private func inventory(rootURL: URL) throws -> Inventory {
    let keys: Set<URLResourceKey> = [.isDirectoryKey, .isSymbolicLinkKey]
    guard
      let enumerator = fileManager.enumerator(
        at: rootURL,
        includingPropertiesForKeys: Array(keys),
        options: [.skipsHiddenFiles]
      )
    else {
      throw CocoaError(.fileReadNoSuchFile)
    }

    var inventory = Inventory()
    for case let url as URL in enumerator {
      let values = try? url.resourceValues(forKeys: keys)
      if values?.isSymbolicLink == true {
        if values?.isDirectory == true {
          enumerator.skipDescendants()
        }
        continue
      }
      if values?.isDirectory == true, url.lastPathComponent == "Ableton Project Info" {
        inventory.projectRoots.insert(url.deletingLastPathComponent().standardizedFileURL)
        continue
      }
      guard values?.isDirectory != true else { continue }

      let ext = url.pathExtension.lowercased()
      if ext == "als" {
        inventory.setURLs.append(url.standardizedFileURL)
      } else if Self.audioExtensions.contains(ext) {
        inventory.audioURLs.append(url.standardizedFileURL)
      }
    }
    return inventory
  }

  private func closestProjectRoot(for url: URL, candidates: [URL]) -> URL? {
    let path = url.standardizedFileURL.path
    return candidates.first { candidate in
      let projectPath = candidate.path
      return path == projectPath || path.hasPrefix(projectPath + "/")
    }
  }

  /// Some real studios wrap one Ableton Project leaf and sibling delivery files or folders in a
  /// Session envelope, for example `DEMOSET/{DEMO Project, Stems}`. Associate only
  /// render-like audio and only when the envelope has one Project.
  private func siblingExportProjectRoot(
    for audioURL: URL,
    candidates: [URL],
    isLikelyUserRender: Bool
  ) -> URL? {
    guard isLikelyUserRender else { return nil }
    let audioPath = audioURL.standardizedFileURL.path
    let allowedFolders: Set<String> = [
      "export", "exports", "stem", "stems", "master", "masters", "bounce", "bounces",
      "render", "renders", "mix", "mixes", "mixdown",
    ]
    let matches = candidates.filter { candidate in
      let envelope = candidate.deletingLastPathComponent().standardizedFileURL
      guard audioPath.hasPrefix(envelope.path + "/"),
        !audioPath.hasPrefix(candidate.standardizedFileURL.path + "/")
      else { return false }
      let relative = String(audioPath.dropFirst(envelope.path.count + 1))
      let components = relative.split(separator: "/").map(String.init)
      if components.count == 1 { return false }
      let folder = components[0].lowercased().filter { $0.isLetter || $0.isNumber }
      return allowedFolders.contains(folder)
    }
    guard matches.count == 1 else { return nil }
    let envelope = matches[0].deletingLastPathComponent().standardizedFileURL
    let projectsInEnvelope = candidates.filter {
      $0.deletingLastPathComponent().standardizedFileURL == envelope
    }
    return projectsInEnvelope.count == 1 ? matches[0] : nil
  }

  /// A render may be stored outside its Ableton Project. Attach it only when one Project has the
  /// uniquely most-specific Set name contained in the audio filename.
  private func namedExportProjectRoot(
    for audioURL: URL,
    candidates: [URL],
    setsByProject: [URL: [AbletonSet]],
    isLikelyUserRender: Bool
  ) -> URL? {
    guard isLikelyUserRender else { return nil }
    let audioName = normalizedArtifactName(audioURL.deletingPathExtension().lastPathComponent)
    let matches = candidates.compactMap { candidate -> (url: URL, specificity: Int)? in
      let specificity = setsByProject[candidate, default: []]
        .map { normalizedArtifactName($0.displayName) }
        .filter { $0.count >= 4 && audioName.contains($0) }
        .map(\.count)
        .max()
      return specificity.map { (candidate, $0) }
    }
    guard let bestSpecificity = matches.map(\.specificity).max() else { return nil }
    let best = matches.filter { $0.specificity == bestSpecificity }
    return best.count == 1 ? best[0].url : nil
  }

  private func normalizedArtifactName(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      .lowercased()
      .filter { $0.isLetter || $0.isNumber }
  }

  /// Ableton's normal project layout includes an `Ableton Project Info` directory. Sets
  /// downloaded from a collaborator, exported to a transfer folder, or saved directly in a
  /// general-purpose location may not. Keep every discovered Set searchable by treating its
  /// containing directory as a project only when no marked Ableton project already contains it.
  private func inferredProjectRoots(from inventory: Inventory) -> Set<URL> {
    var roots = inventory.projectRoots
    let markedRoots = inventory.projectRoots.sorted { $0.path.count > $1.path.count }
    for setURL in inventory.setURLs
    where closestProjectRoot(for: setURL, candidates: markedRoots) == nil {
      roots.insert(setURL.deletingLastPathComponent().standardizedFileURL)
    }
    return roots
  }

}

private struct Inventory {
  var projectRoots: Set<URL> = []
  var setURLs: [URL] = []
  var audioURLs: [URL] = []
}

private struct SetIndexWork: Sendable {
  let setURL: URL
  let projectRoot: URL
}

private struct SetIndexRecord: Sendable {
  let projectRoot: URL
  let fingerprint: FileFingerprint?
  let set: AbletonSet?
  let issue: IndexIssue?
  let reused: Bool
}

private struct SetIndexResults: Sendable {
  let records: [SetIndexRecord]
  let parsedCount: Int
  let reusedCount: Int
}

private final class SetIndexAccumulator: @unchecked Sendable {
  private let lock = NSLock()
  private var records: [SetIndexRecord?]
  private var completed = 0
  private var reused = 0

  init(count: Int) {
    records = Array(repeating: nil, count: count)
  }

  func store(
    _ record: SetIndexRecord,
    at offset: Int,
    progress: StudioLibraryRepository.ProgressHandler
  ) {
    lock.lock()
    records[offset] = record
    completed += 1
    if record.reused { reused += 1 }
    let completedSnapshot = completed
    let reusedSnapshot = reused
    let total = records.count
    lock.unlock()

    if completedSnapshot.isMultiple(of: 10) || completedSnapshot == total {
      progress(
        IndexingProgress(
          phase: .parsingSets,
          completed: completedSnapshot,
          total: total,
          reused: reusedSnapshot
        )
      )
    }
  }

  var results: SetIndexResults {
    lock.lock()
    defer { lock.unlock() }
    let completedRecords = records.compactMap { $0 }
    return SetIndexResults(
      records: completedRecords,
      parsedCount: completedRecords.count(where: { $0.set != nil && !$0.reused }),
      reusedCount: completedRecords.count(where: \.reused)
    )
  }
}

private func fingerprintsHaveMatchingIdentity(
  _ lhs: FileFingerprint,
  _ rhs: FileFingerprint
) -> Bool {
  switch (lhs.resourceIdentity, rhs.resourceIdentity) {
  case (let left?, let right?): left == right
  case (nil, nil): true
  default: false
  }
}

enum PreviewAssetClassifier {
  private static let renderHint = try! NSRegularExpression(
    pattern: #"(?i)(^|[ _.-])(master|mix|mixed|mixdown|bounce|render|stem|preview|demo)([ _.-]|$)"#
  )

  struct Classification {
    let category: PreviewAssetCategory
    let isLikelyUserRender: Bool
  }

  static func classification(for url: URL) -> Classification {
    let components = url.pathComponents.map { $0.lowercased() }
    let name = url.deletingPathExtension().lastPathComponent
    let range = NSRange(name.startIndex..., in: name)
    let renderPathTokens =
      components
      .flatMap { $0.split { !$0.isLetter && !$0.isNumber } }
    let isLikelyUserRender =
      renderHint.firstMatch(in: name, range: range) != nil
      || !Set(renderPathTokens).isDisjoint(with: [
        "export", "exports", "stem", "stems", "master", "masters", "bounce", "bounces",
        "render", "renders", "mix", "mixed", "mixes", "mixdown",
      ])

    let category: PreviewAssetCategory
    if hasPathSequence(["samples", "processed", "freeze"], in: components) {
      category = .freeze
    } else if hasPathSequence(["samples", "processed", "consolidate"], in: components) {
      category = .consolidated
    } else if hasPathSequence(["samples", "processed", "crop"], in: components) {
      category = .crop
    } else if hasPathSequence(["samples", "processed", "reverse"], in: components) {
      category = .reversed
    } else if hasPathSequence(["samples", "recorded"], in: components) {
      category = .recorded
    } else if hasPathSequence(["samples", "imported"], in: components) {
      category = .imported
    } else {
      category = .otherAudio
    }
    return Classification(category: category, isLikelyUserRender: isLikelyUserRender)
  }

  private static func hasPathSequence(_ sequence: [String], in components: [String]) -> Bool {
    guard sequence.count <= components.count else { return false }
    for start in 0...(components.count - sequence.count) {
      if Array(components[start..<(start + sequence.count)]) == sequence {
        return true
      }
    }
    return false
  }
}

private enum TimelineBuilder {
  private static let backupSuffix = try! NSRegularExpression(
    pattern: #"\s*\[[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}[^\]]*\]\s*$"#,
    options: [.caseInsensitive]
  )

  static func build(from sets: [AbletonSet]) -> [SetTimeline] {
    let grouped = Dictionary(grouping: sets, by: lineageKey)
    return grouped.map { key, versions in
      let ordered = versions.sorted { lhs, rhs in
        switch (lhs.modifiedAt, rhs.modifiedAt) {
        case (let left?, let right?): return left > right
        case (_?, nil): return true
        case (nil, _?): return false
        case (nil, nil):
          return lhs.displayName.localizedStandardCompare(rhs.displayName) == .orderedAscending
        }
      }
      let preferredName =
        ordered.first(where: { !$0.isBackup })?.displayName
        ?? stripBackupSuffix(ordered[0].displayName)
      return SetTimeline(
        id: StableID.forValue("\(key):\(ordered.map(\.id).joined(separator: ":"))"),
        displayName: preferredName,
        versions: ordered
      )
    }
    .sorted { $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending }
  }

  private static func lineageKey(_ set: AbletonSet) -> String {
    stripBackupSuffix(set.displayName)
      .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
  }

  private static func stripBackupSuffix(_ value: String) -> String {
    let range = NSRange(value.startIndex..., in: value)
    return backupSuffix.stringByReplacingMatches(in: value, range: range, withTemplate: "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

private func previewAssetSort(_ lhs: PreviewAsset, _ rhs: PreviewAsset) -> Bool {
  if lhs.isLikelyUserRender != rhs.isLikelyUserRender {
    return lhs.isLikelyUserRender
  }
  if lhs.category != rhs.category {
    return previewPriority(lhs.category) > previewPriority(rhs.category)
  }
  switch (lhs.modifiedAt, rhs.modifiedAt) {
  case (let left?, let right?): return left > right
  case (_?, nil): return true
  case (nil, _?): return false
  case (nil, nil):
    return lhs.fileURL.lastPathComponent.localizedStandardCompare(rhs.fileURL.lastPathComponent)
      == .orderedAscending
  }
}

private func previewPriority(_ category: PreviewAssetCategory) -> Int {
  switch category {
  case .freeze: 60
  case .consolidated: 50
  case .crop: 45
  case .recorded: 40
  case .imported: 30
  case .reversed: 20
  case .otherAudio: 10
  }
}
