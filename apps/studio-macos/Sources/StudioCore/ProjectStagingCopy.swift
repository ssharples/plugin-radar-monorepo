import CryptoKit
import Darwin
import Foundation

public enum ProjectStagingError: Error, Equatable {
  case sourceMissing
  case sourceIsNotDirectory
  case unsafeDestination
  case destinationCollision
  case noAbletonSet
  case missingProjectInfo
  case conflictingProjectInfo
  case invalidPlan
  case sourceChanged
  case verificationFailed
  case partialCopyRetained(URL)
  case promotedCopyNeedsReview(URL)
  case promotedCopyUnlabelled(URL)
}

/// A planner-issued value. Its initializer is intentionally not public and the executor still
/// validates every field immediately before mutation; decoding or hand construction is not trusted.
public struct ProjectStagingCopyPlan: Sendable, Equatable {
  public let planID: String
  public let handoffPlanFingerprint: String
  public let workID: String
  public let sessionID: String
  public let revisionID: String
  public let packageID: String
  public let sourceProjectURL: URL
  public let sourceSetRelativePath: String
  public let sourceSetSHA256: String
  public let stagingRootURL: URL
  public let indexedRootURLs: [URL]
  public let destinationContainerURL: URL
  public let destinationProjectURL: URL
  public let overwritePolicy: ProjectHandoffOverwritePolicy
  public let plannedAt: Date
  public let planFingerprint: String
  fileprivate let sourceIdentity: FileSystemIdentity
  fileprivate let stagingIdentity: FileSystemIdentity

  fileprivate init(
    handoff: ProjectHandoffPlan,
    packageID: String,
    sourceProjectURL: URL,
    sourceSetRelativePath: String,
    sourceSetSHA256: String,
    stagingRootURL: URL,
    indexedRootURLs: [URL],
    destinationContainerURL: URL,
    destinationProjectURL: URL,
    plannedAt: Date,
    sourceIdentity: FileSystemIdentity,
    stagingIdentity: FileSystemIdentity
  ) {
    planID = handoff.id
    handoffPlanFingerprint = handoff.fingerprint
    workID = handoff.workID
    sessionID = handoff.sessionID
    revisionID = handoff.revisionID
    self.packageID = packageID
    self.sourceProjectURL = sourceProjectURL
    self.sourceSetRelativePath = sourceSetRelativePath
    self.sourceSetSHA256 = sourceSetSHA256
    self.stagingRootURL = stagingRootURL
    self.indexedRootURLs = indexedRootURLs.sorted { $0.path < $1.path }
    self.destinationContainerURL = destinationContainerURL
    self.destinationProjectURL = destinationProjectURL
    overwritePolicy = .never
    self.plannedAt = plannedAt
    self.sourceIdentity = sourceIdentity
    self.stagingIdentity = stagingIdentity
    planFingerprint = ProjectStagingSecurity.planFingerprint(
      planID: handoff.id, handoffPlanFingerprint: handoff.fingerprint,
      workID: handoff.workID, sessionID: handoff.sessionID,
      revisionID: handoff.revisionID, packageID: packageID,
      sourceProjectURL: sourceProjectURL, sourceSetRelativePath: sourceSetRelativePath,
      sourceSetSHA256: sourceSetSHA256, stagingRootURL: stagingRootURL,
      indexedRootURLs: indexedRootURLs, destinationContainerURL: destinationContainerURL,
      destinationProjectURL: destinationProjectURL, plannedAt: plannedAt
    )
  }
}

public struct ProjectStagingCopyPlanner: Sendable {
  public init() {}

  public func plan(
    handoff: ProjectHandoffPlan,
    in catalog: WorkCatalog,
    catalogueGenerationID: String? = nil,
    packageID: String,
    displayName: String,
    indexedRoots: [URL],
    plannedAt: Date = Date()
  ) throws -> ProjectStagingCopyPlan {
    _ = try ProjectHandoffReferenceValidator().validate(
      plan: handoff, in: catalog, catalogueGenerationID: catalogueGenerationID)
    let fm = FileManager.default
    let source = ProjectStagingSecurity.canonical(handoff.sourceProjectURL)
    let staging = ProjectStagingSecurity.canonical(handoff.stagingRootURL)
    guard source == handoff.sourceProjectURL.standardizedFileURL,
      staging == handoff.stagingRootURL.standardizedFileURL
    else { throw ProjectStagingError.unsafeDestination }
    guard ProjectStagingSecurity.isDirectory(source) else {
      if fm.fileExists(atPath: source.path) { throw ProjectStagingError.sourceIsNotDirectory }
      throw ProjectStagingError.sourceMissing
    }
    guard ProjectStagingSecurity.isDirectory(staging) else {
      throw ProjectStagingError.unsafeDestination
    }
    let selectedSet = ProjectStagingSecurity.canonical(handoff.sourceSetURL)
    guard selectedSet.pathExtension.lowercased() == "als",
      ProjectStagingSecurity.isRegularFile(selectedSet),
      ProjectStagingSecurity.isDescendant(selectedSet, of: source)
    else { throw ProjectStagingError.noAbletonSet }
    try ProjectStagingSecurity.rejectLinks(in: source)
    try validateProjectInfo(in: source)
    let roots = indexedRoots.map(ProjectStagingSecurity.canonical)
    try ProjectStagingSecurity.validateSeparation(source: source, staging: staging, roots: roots)
    let relative = String(selectedSet.path.dropFirst(source.path.count + 1))
    guard ProjectStagingSecurity.safeRelativePath(relative) else {
      throw ProjectStagingError.noAbletonSet
    }
    let safeName = sanitized(displayName)
    var suffix = 1
    var container: URL
    repeat {
      let name = suffix == 1 ? "\(safeName) - Handoff" : "\(safeName) - Handoff \(suffix)"
      container = staging.appending(path: name, directoryHint: .isDirectory)
      suffix += 1
    } while fm.fileExists(atPath: container.path)
    let project = container.appending(path: source.lastPathComponent, directoryHint: .isDirectory)
    return ProjectStagingCopyPlan(
      handoff: handoff, packageID: packageID, sourceProjectURL: source,
      sourceSetRelativePath: relative,
      sourceSetSHA256: try ProjectStagingSecurity.stableDigest(selectedSet).digest,
      stagingRootURL: staging, indexedRootURLs: roots,
      destinationContainerURL: container, destinationProjectURL: project,
      plannedAt: plannedAt, sourceIdentity: try ProjectStagingSecurity.identity(source),
      stagingIdentity: try ProjectStagingSecurity.identity(staging)
    )
  }

  private func sanitized(_ value: String) -> String {
    let candidate = value.components(
      separatedBy: CharacterSet(charactersIn: "/:\0").union(.newlines)
    )
    .joined(separator: "-").trimmingCharacters(in: .whitespacesAndNewlines)
    return candidate.isEmpty ? "Project" : candidate
  }

  private func validateProjectInfo(in source: URL) throws {
    switch AbletonProjectInfoInspector(fileManager: FileManager.default).inspect(
      projectRoot: source
    )
    .status
    {
    case .intact:
      return
    case .missing:
      throw ProjectStagingError.missingProjectInfo
    case .conflicting:
      throw ProjectStagingError.conflictingProjectInfo
    }
  }
}

public struct ProjectStagedFileEvidence: Codable, Identifiable, Sendable, Equatable {
  public var id: String { relativePath }
  public let relativePath: String
  public let bytes: Int64
  public let sha256: String
  public init(relativePath: String, bytes: Int64, sha256: String) {
    self.relativePath = relativePath
    self.bytes = bytes
    self.sha256 = sha256
  }
}

public struct ProjectStagingManifest: Codable, Sendable, Equatable {
  public let schemaVersion: Int
  public let planID: String
  public let handoffPlanFingerprint: String
  public let workID: String
  public let sessionID: String
  public let revisionID: String
  public let packageID: String
  public let planFingerprint: String
  public let sourceProjectName: String
  public let stagedProjectName: String
  public let selectedSetRelativePath: String
  public let selectedSetSHA256: String
  public let files: [ProjectStagedFileEvidence]
  public let totalBytes: Int64
  public let generatedAt: Date
}

public struct ProjectStagingEvidence: Codable, Sendable, Equatable {
  public let planID: String
  public let handoffPlanFingerprint: String
  public let workID: String
  public let sessionID: String
  public let revisionID: String
  public let packageID: String
  public let planFingerprint: String
  public let projectURL: URL
  public let manifestURL: URL
  public let manifestSHA256: String
  public let manifest: ProjectStagingManifest
  public let verifiedAt: Date

  fileprivate init(
    plan: ProjectStagingCopyPlan, manifestURL: URL, manifestSHA256: String,
    manifest: ProjectStagingManifest, verifiedAt: Date
  ) {
    planID = plan.planID
    handoffPlanFingerprint = plan.handoffPlanFingerprint
    workID = plan.workID
    sessionID = plan.sessionID
    revisionID = plan.revisionID
    packageID = plan.packageID
    planFingerprint = plan.planFingerprint
    projectURL = plan.destinationProjectURL
    self.manifestURL = manifestURL
    self.manifestSHA256 = manifestSHA256
    self.manifest = manifest
    self.verifiedAt = verifiedAt
  }
}

public enum ProjectStagingRecoveryStatus: String, Codable, Sendable {
  case copying, verified, needsAttention
}
public struct ProjectStagingRecoveryRecord: Codable, Sendable, Equatable {
  public let planID: String
  public let planFingerprint: String
  public let status: ProjectStagingRecoveryStatus
  public let containerURL: URL
  public let updatedAt: Date
}

struct AbletonProjectInfoInspection: Equatable {
  let topLevelProjectInfoURL: URL?
  let projectInfoURLs: [URL]
  let conflictingProjectInfoURLs: [URL]

  var status: ProjectProjectInfoStatus {
    guard let topLevelProjectInfoURL else { return .missing }
    return conflictingProjectInfoURLs.isEmpty && projectInfoURLs == [topLevelProjectInfoURL]
      ? .intact : .conflicting
  }
}

struct AbletonProjectInfoInspector {
  private let fileManager: FileManager

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
  }

  func inspect(projectRoot: URL) -> AbletonProjectInfoInspection {
    let root = projectRoot.standardizedFileURL
    let topLevel = root.appending(path: "Ableton Project Info", directoryHint: .isDirectory)
    let urls = projectInfoDirectories(in: root)
    let topLevelURL = urls.first(where: { $0.standardizedFileURL == topLevel.standardizedFileURL })
    let conflicts = urls.filter { $0.standardizedFileURL != topLevel.standardizedFileURL }
    return AbletonProjectInfoInspection(
      topLevelProjectInfoURL: topLevelURL,
      projectInfoURLs: urls,
      conflictingProjectInfoURLs: conflicts
    )
  }

  private func projectInfoDirectories(in root: URL) -> [URL] {
    guard
      let enumerator = fileManager.enumerator(
        at: root,
        includingPropertiesForKeys: [.isDirectoryKey],
        options: [.skipsHiddenFiles]
      )
    else { return [] }

    var results: [URL] = []
    for case let url as URL in enumerator {
      guard
        let values = try? url.resourceValues(forKeys: [.isDirectoryKey]),
        values.isDirectory == true,
        url.lastPathComponent == "Ableton Project Info"
      else { continue }
      results.append(url.standardizedFileURL)
      enumerator.skipDescendants()
    }
    return results.sorted { $0.path < $1.path }
  }
}

struct ProjectStagingExecutionHooks: Sendable {
  var afterSourceSnapshot: @Sendable () throws -> Void = {}
  var beforePromotion: @Sendable () throws -> Void = {}
  var afterPromotion: @Sendable () throws -> Void = {}
  var beforeNeedsAttentionReceipt: @Sendable () throws -> Void = {}
  var duringStableDigest: @Sendable (URL) throws -> Void = { _ in }
}

public struct ProjectStagingCopyExecutor: Sendable {
  private let hooks: ProjectStagingExecutionHooks
  public init() { hooks = ProjectStagingExecutionHooks() }
  init(hooks: ProjectStagingExecutionHooks) { self.hooks = hooks }

  public func execute(_ plan: ProjectStagingCopyPlan, verifiedAt: Date = Date()) throws
    -> ProjectStagingEvidence
  {
    let fm = FileManager.default
    try ProjectStagingSecurity.validate(plan)
    guard !fm.fileExists(atPath: plan.destinationContainerURL.path) else {
      throw ProjectStagingError.destinationCollision
    }
    let normalized = Date(
      timeIntervalSince1970: floor(verifiedAt.timeIntervalSince1970 * 1_000) / 1_000)
    let partial = plan.stagingRootURL.appending(
      path: ".\(plan.destinationContainerURL.lastPathComponent).partial-\(UUID().uuidString)",
      directoryHint: .isDirectory)
    let temporaryProject = partial.appending(
      path: plan.destinationProjectURL.lastPathComponent, directoryHint: .isDirectory)
    var promoted = false
    do {
      try fm.createDirectory(at: partial, withIntermediateDirectories: false)
      try writeRecovery(plan: plan, status: .copying, container: partial, date: normalized)
      let before = try ProjectStagingSecurity.manifestFiles(
        in: plan.sourceProjectURL, duringStableDigest: hooks.duringStableDigest)
      try hooks.afterSourceSnapshot()
      try fm.copyItem(at: plan.sourceProjectURL, to: temporaryProject)
      let after = try ProjectStagingSecurity.manifestFiles(in: plan.sourceProjectURL)
      guard before == after else { throw ProjectStagingError.sourceChanged }
      let staged = try ProjectStagingSecurity.manifestFiles(in: temporaryProject)
      guard before == staged else { throw ProjectStagingError.verificationFailed }
      guard let selected = staged.first(where: { $0.relativePath == plan.sourceSetRelativePath }),
        selected.sha256 == plan.sourceSetSHA256
      else { throw ProjectStagingError.noAbletonSet }
      try validateProjectInfo(in: temporaryProject)
      let manifest = ProjectStagingManifest(
        schemaVersion: 1, planID: plan.planID,
        handoffPlanFingerprint: plan.handoffPlanFingerprint, workID: plan.workID,
        sessionID: plan.sessionID, revisionID: plan.revisionID, packageID: plan.packageID,
        planFingerprint: plan.planFingerprint,
        sourceProjectName: plan.sourceProjectURL.lastPathComponent,
        stagedProjectName: plan.destinationProjectURL.lastPathComponent,
        selectedSetRelativePath: plan.sourceSetRelativePath,
        selectedSetSHA256: plan.sourceSetSHA256,
        files: staged, totalBytes: staged.reduce(0) { $0 + $1.bytes }, generatedAt: normalized
      )
      let manifestData = try deterministicEncoder().encode(manifest)
      let tempManifest = partial.appending(path: "staging-manifest.json")
      try manifestData.write(to: tempManifest, options: .withoutOverwriting)
      try ProjectStagingSecurity.validate(plan)
      try hooks.beforePromotion()
      try ProjectStagingSecurity.validate(plan)
      try ProjectStagingSecurity.atomicNoReplace(from: partial, to: plan.destinationContainerURL)
      promoted = true
      try hooks.afterPromotion()
      let finalManifest = plan.destinationContainerURL.appending(path: "staging-manifest.json")
      let evidence = ProjectStagingEvidence(
        plan: plan, manifestURL: finalManifest,
        manifestSHA256: sha256(manifestData), manifest: manifest, verifiedAt: normalized)
      _ = try ProjectStagingVerifier().verify(evidence, against: plan)
      try writeRecovery(
        plan: plan, status: .verified, container: plan.destinationContainerURL, date: normalized)
      return evidence
    } catch {
      if promoted {
        do {
          try hooks.beforeNeedsAttentionReceipt()
          try writeRecovery(
            plan: plan, status: .needsAttention, container: plan.destinationContainerURL,
            date: normalized)
        } catch {
          throw ProjectStagingError.promotedCopyUnlabelled(plan.destinationContainerURL)
        }
        throw ProjectStagingError.promotedCopyNeedsReview(plan.destinationContainerURL)
      }
      if fm.fileExists(atPath: partial.path) {
        do { try fm.removeItem(at: partial) } catch {
          throw ProjectStagingError.partialCopyRetained(partial)
        }
      }
      throw error
    }
  }

  private func writeRecovery(
    plan: ProjectStagingCopyPlan, status: ProjectStagingRecoveryStatus,
    container: URL, date: Date
  ) throws {
    let record = ProjectStagingRecoveryRecord(
      planID: plan.planID, planFingerprint: plan.planFingerprint,
      status: status, containerURL: container, updatedAt: date)
    let url = container.appending(path: ".studio-handoff-state.json")
    let data = try deterministicEncoder().encode(record)
    if FileManager.default.fileExists(atPath: url.path) {
      try data.write(to: url, options: .atomic)
    } else {
      try data.write(to: url, options: .withoutOverwriting)
    }
  }

  private func validateProjectInfo(in projectURL: URL) throws {
    switch AbletonProjectInfoInspector(fileManager: FileManager.default).inspect(
      projectRoot: projectURL
    )
    .status
    {
    case .intact:
      return
    case .missing:
      throw ProjectStagingError.missingProjectInfo
    case .conflicting:
      throw ProjectStagingError.conflictingProjectInfo
    }
  }
}

public struct ProjectStagingRecoveryScanner: Sendable {
  public init() {}
  public func records(
    in stagingRoot: URL,
    now: Date = Date(),
    staleAfter: TimeInterval = 60 * 60
  ) -> [ProjectStagingRecoveryRecord] {
    guard
      let children = try? FileManager.default.contentsOfDirectory(
        at: stagingRoot,
        includingPropertiesForKeys: [.isDirectoryKey], options: [])
    else { return [] }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    return children.compactMap { child in
      let url = child.appending(path: ".studio-handoff-state.json")
      guard let data = try? Data(contentsOf: url),
        let record = try? decoder.decode(ProjectStagingRecoveryRecord.self, from: data)
      else { return nil }
      let located = ProjectStagingRecoveryRecord(
        planID: record.planID,
        planFingerprint: record.planFingerprint,
        status: record.status,
        containerURL: child.standardizedFileURL,
        updatedAt: record.updatedAt
      )
      if located.status == .copying, now.timeIntervalSince(located.updatedAt) >= staleAfter {
        return ProjectStagingRecoveryRecord(
          planID: located.planID,
          planFingerprint: located.planFingerprint,
          status: .needsAttention,
          containerURL: located.containerURL,
          updatedAt: located.updatedAt
        )
      }
      return located
    }.sorted { $0.containerURL.path < $1.containerURL.path }
  }
}

public struct ProjectStagingVerifier: Sendable {
  public init() {}
  public func verify(_ evidence: ProjectStagingEvidence, against plan: ProjectStagingCopyPlan)
    throws -> ProjectStagingManifest
  {
    try ProjectStagingSecurity.validate(plan)
    guard evidence.planID == plan.planID,
      evidence.handoffPlanFingerprint == plan.handoffPlanFingerprint,
      evidence.workID == plan.workID,
      evidence.sessionID == plan.sessionID, evidence.revisionID == plan.revisionID,
      evidence.packageID == plan.packageID, evidence.planFingerprint == plan.planFingerprint,
      ProjectStagingSecurity.canonical(evidence.projectURL)
        == ProjectStagingSecurity.canonical(plan.destinationProjectURL),
      ProjectStagingSecurity.canonical(evidence.manifestURL.deletingLastPathComponent())
        == ProjectStagingSecurity.canonical(plan.destinationContainerURL)
    else { throw ProjectStagingError.verificationFailed }
    let data = try Data(contentsOf: evidence.manifestURL)
    guard sha256(data) == evidence.manifestSHA256 else {
      throw ProjectStagingError.verificationFailed
    }
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    let decoded = try decoder.decode(ProjectStagingManifest.self, from: data)
    guard decoded == evidence.manifest, decoded.schemaVersion == 1,
      decoded.planID == plan.planID,
      decoded.handoffPlanFingerprint == plan.handoffPlanFingerprint,
      decoded.workID == plan.workID,
      decoded.sessionID == plan.sessionID, decoded.revisionID == plan.revisionID,
      decoded.packageID == plan.packageID, decoded.planFingerprint == plan.planFingerprint,
      decoded.sourceProjectName == plan.sourceProjectURL.lastPathComponent,
      decoded.stagedProjectName == plan.destinationProjectURL.lastPathComponent,
      decoded.selectedSetRelativePath == plan.sourceSetRelativePath,
      decoded.selectedSetSHA256 == plan.sourceSetSHA256,
      decoded.files.map(\.relativePath) == Set(decoded.files.map(\.relativePath)).sorted(),
      decoded.totalBytes == decoded.files.reduce(0, { $0 + $1.bytes })
    else { throw ProjectStagingError.verificationFailed }
    let actual = try ProjectStagingSecurity.manifestFiles(in: evidence.projectURL)
    guard actual == decoded.files,
      actual.first(where: { $0.relativePath == decoded.selectedSetRelativePath })?.sha256
        == decoded.selectedSetSHA256
    else { throw ProjectStagingError.verificationFailed }
    try validateProjectInfo(in: evidence.projectURL)
    return decoded
  }

  private func validateProjectInfo(in projectURL: URL) throws {
    switch AbletonProjectInfoInspector(fileManager: FileManager.default).inspect(
      projectRoot: projectURL
    )
    .status
    {
    case .intact:
      return
    case .missing:
      throw ProjectStagingError.missingProjectInfo
    case .conflicting:
      throw ProjectStagingError.conflictingProjectInfo
    }
  }
}

private struct FileSystemIdentity: Sendable, Equatable {
  let device: UInt64
  let inode: UInt64
}

private enum ProjectStagingSecurity {
  static func canonical(_ url: URL) -> URL { url.resolvingSymlinksInPath().standardizedFileURL }
  static func isDescendant(_ child: URL, of parent: URL) -> Bool {
    let c = canonical(child).path
    let p = canonical(parent).path
    return c == p || c.hasPrefix(p + "/")
  }
  static func isDirectory(_ url: URL) -> Bool {
    var value: ObjCBool = false
    return FileManager.default.fileExists(atPath: url.path, isDirectory: &value) && value.boolValue
  }
  static func isRegularFile(_ url: URL) -> Bool {
    (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
  }
  static func safeRelativePath(_ path: String) -> Bool {
    !path.isEmpty && !path.hasPrefix("/")
      && path.split(separator: "/").allSatisfy { $0 != "." && $0 != ".." }
  }
  static func identity(_ url: URL) throws -> FileSystemIdentity {
    var s = stat()
    guard lstat(url.path, &s) == 0 else { throw ProjectStagingError.verificationFailed }
    guard (s.st_mode & S_IFMT) != S_IFLNK else { throw ProjectStagingError.unsafeDestination }
    return FileSystemIdentity(device: UInt64(s.st_dev), inode: UInt64(s.st_ino))
  }
  static func validateSeparation(source: URL, staging: URL, roots: [URL]) throws {
    guard !isDescendant(staging, of: source), !isDescendant(source, of: staging),
      !roots.contains(where: { isDescendant(staging, of: $0) || isDescendant($0, of: staging) })
    else { throw ProjectStagingError.unsafeDestination }
  }
  static func validate(_ plan: ProjectStagingCopyPlan) throws {
    let source = canonical(plan.sourceProjectURL)
    let staging = canonical(plan.stagingRootURL)
    guard source == plan.sourceProjectURL, staging == plan.stagingRootURL,
      try identity(source) == plan.sourceIdentity, try identity(staging) == plan.stagingIdentity,
      safeRelativePath(plan.sourceSetRelativePath), plan.overwritePolicy == .never,
      canonical(plan.destinationContainerURL.deletingLastPathComponent()) == staging,
      canonical(plan.destinationProjectURL.deletingLastPathComponent())
        == canonical(plan.destinationContainerURL),
      plan.destinationProjectURL.lastPathComponent == source.lastPathComponent
    else { throw ProjectStagingError.invalidPlan }
    try validateSeparation(source: source, staging: staging, roots: plan.indexedRootURLs)
    let expected = planFingerprint(
      planID: plan.planID, handoffPlanFingerprint: plan.handoffPlanFingerprint,
      workID: plan.workID,
      sessionID: plan.sessionID, revisionID: plan.revisionID, packageID: plan.packageID,
      sourceProjectURL: source, sourceSetRelativePath: plan.sourceSetRelativePath,
      sourceSetSHA256: plan.sourceSetSHA256, stagingRootURL: staging,
      indexedRootURLs: plan.indexedRootURLs, destinationContainerURL: plan.destinationContainerURL,
      destinationProjectURL: plan.destinationProjectURL, plannedAt: plan.plannedAt)
    guard expected == plan.planFingerprint else { throw ProjectStagingError.invalidPlan }
    try rejectLinks(in: source)
    let setURL = source.appending(path: plan.sourceSetRelativePath)
    guard canonical(setURL) == setURL, try stableDigest(setURL).digest == plan.sourceSetSHA256
    else {
      throw ProjectStagingError.sourceChanged
    }
    switch AbletonProjectInfoInspector(fileManager: FileManager.default).inspect(
      projectRoot: source
    )
    .status
    {
    case .intact:
      return
    case .missing:
      throw ProjectStagingError.missingProjectInfo
    case .conflicting:
      throw ProjectStagingError.conflictingProjectInfo
    }
  }
  static func rejectLinks(in root: URL) throws {
    let keys: [URLResourceKey] = [.isSymbolicLinkKey]
    guard let e = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys) else {
      throw ProjectStagingError.verificationFailed
    }
    for case let url as URL in e
    where (try url.resourceValues(forKeys: Set(keys))).isSymbolicLink == true {
      throw ProjectStagingError.verificationFailed
    }
  }
  static func stableDigest(
    _ url: URL,
    duringRead: ((URL) throws -> Void)? = nil
  ) throws -> (digest: String, bytes: Int64) {
    let fd = open(url.path, O_RDONLY | O_NOFOLLOW)
    guard fd >= 0 else { throw ProjectStagingError.verificationFailed }
    defer { close(fd) }
    var before = stat()
    var after = stat()
    var pathAfter = stat()
    guard fstat(fd, &before) == 0, (before.st_mode & S_IFMT) == S_IFREG, before.st_size > 0 else {
      throw ProjectStagingError.verificationFailed
    }
    var hasher = SHA256()
    var buffer = [UInt8](repeating: 0, count: 1_048_576)
    var invokedReadHook = false
    while true {
      let count = Darwin.read(fd, &buffer, buffer.count)
      guard count >= 0 else { throw ProjectStagingError.verificationFailed }
      if count == 0 { break }
      hasher.update(data: Data(buffer[0..<count]))
      if !invokedReadHook {
        invokedReadHook = true
        try duringRead?(url)
      }
    }
    guard fstat(fd, &after) == 0, lstat(url.path, &pathAfter) == 0,
      (pathAfter.st_mode & S_IFMT) == S_IFREG,
      before.st_dev == after.st_dev, before.st_ino == after.st_ino,
      before.st_size == after.st_size, before.st_mtimespec.tv_sec == after.st_mtimespec.tv_sec,
      before.st_mtimespec.tv_nsec == after.st_mtimespec.tv_nsec,
      after.st_dev == pathAfter.st_dev, after.st_ino == pathAfter.st_ino,
      after.st_size == pathAfter.st_size,
      after.st_mtimespec.tv_sec == pathAfter.st_mtimespec.tv_sec,
      after.st_mtimespec.tv_nsec == pathAfter.st_mtimespec.tv_nsec
    else { throw ProjectStagingError.sourceChanged }
    return (FileContentDigest.hex(hasher.finalize()), Int64(after.st_size))
  }
  static func manifestFiles(
    in root: URL,
    duringStableDigest: ((URL) throws -> Void)? = nil
  ) throws -> [ProjectStagedFileEvidence] {
    let canonicalRoot = canonical(root)
    guard canonicalRoot == root.standardizedFileURL else {
      throw ProjectStagingError.verificationFailed
    }
    try rejectLinks(in: canonicalRoot)
    guard
      let e = FileManager.default.enumerator(
        at: canonicalRoot,
        includingPropertiesForKeys: [.isRegularFileKey, .isSymbolicLinkKey], options: [])
    else { throw ProjectStagingError.verificationFailed }
    var result: [ProjectStagedFileEvidence] = []
    for case let url as URL in e {
      let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
      guard values.isSymbolicLink != true else { throw ProjectStagingError.verificationFailed }
      guard values.isRegularFile == true else { continue }
      let c = canonical(url)
      guard isDescendant(c, of: canonicalRoot) else { throw ProjectStagingError.verificationFailed }
      let relative = String(c.path.dropFirst(canonicalRoot.path.count + 1))
      guard safeRelativePath(relative), relative != ".studio-handoff-state.json" else { continue }
      let value = try stableDigest(c, duringRead: duringStableDigest)
      result.append(
        ProjectStagedFileEvidence(relativePath: relative, bytes: value.bytes, sha256: value.digest))
    }
    return result.sorted { $0.relativePath < $1.relativePath }
  }
  static func atomicNoReplace(from: URL, to: URL) throws {
    if renameatx_np(AT_FDCWD, from.path, AT_FDCWD, to.path, UInt32(RENAME_EXCL)) == 0 { return }
    if errno == EEXIST { throw ProjectStagingError.destinationCollision }
    throw ProjectStagingError.verificationFailed
  }
  static func planFingerprint(
    planID: String, handoffPlanFingerprint: String, workID: String, sessionID: String,
    revisionID: String,
    packageID: String, sourceProjectURL: URL, sourceSetRelativePath: String,
    sourceSetSHA256: String, stagingRootURL: URL, indexedRootURLs: [URL],
    destinationContainerURL: URL, destinationProjectURL: URL, plannedAt: Date
  ) -> String {
    let fields = [
      planID, handoffPlanFingerprint, workID, sessionID, revisionID, packageID,
      sourceProjectURL.path,
      sourceSetRelativePath, sourceSetSHA256, stagingRootURL.path,
      indexedRootURLs.map(\.path).sorted().joined(separator: "\u{1f}"),
      destinationContainerURL.path, destinationProjectURL.path,
      String(Int64((plannedAt.timeIntervalSince1970 * 1_000).rounded(.towardZero))),
    ]
    return sha256(Data(fields.joined(separator: "\u{1e}").utf8))
  }
}

private func deterministicEncoder() -> JSONEncoder {
  let encoder = JSONEncoder()
  encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
  encoder.dateEncodingStrategy = .millisecondsSince1970
  return encoder
}
private func sha256(_ data: Data) -> String { FileContentDigest.hex(SHA256.hash(data: data)) }
