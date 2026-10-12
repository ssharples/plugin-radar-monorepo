import Darwin
import Foundation

public enum CalibrationWorkContainmentReviewAction: String, Codable, Sendable, CaseIterable {
  case sameSong
  case keepSeparate
  case assignedElsewhere
  case rejected
}

public enum CalibrationSessionRelationshipReviewAction: String, Codable, Sendable, CaseIterable {
  case duplicate
  case evolved
  case derivative
  case unrelated
}

public enum CalibrationExportAssociationReviewAction: String, Codable, Sendable, CaseIterable {
  case correct
  case incorrect
}

public enum CalibrationAudioMatchReviewAction: String, Codable, Sendable, CaseIterable {
  case sameRecording
  case transformedUse
  case falseMatch
}

public enum CalibrationTypedReviewAction: Codable, Sendable, Equatable {
  case workContainment(CalibrationWorkContainmentReviewAction)
  case sessionRelationship(CalibrationSessionRelationshipReviewAction)
  case exportAssociation(CalibrationExportAssociationReviewAction)
  case audioMatch(CalibrationAudioMatchReviewAction)
  case acceptedRelationship(CalibrationAcceptedRelationshipKind)

  public init?(label: CalibrationDecisionLabel) {
    switch label {
    case .sameSong:
      self = .workContainment(.sameSong)
    case .keepSeparate:
      self = .workContainment(.keepSeparate)
    case .assignedElsewhere:
      self = .workContainment(.assignedElsewhere)
    case .rejected:
      self = .workContainment(.rejected)
    case .duplicate:
      self = .sessionRelationship(.duplicate)
    case .evolved:
      self = .sessionRelationship(.evolved)
    case .derivative:
      self = .sessionRelationship(.derivative)
    case .unrelated:
      self = .sessionRelationship(.unrelated)
    case .correctExportAssociation:
      self = .exportAssociation(.correct)
    case .incorrectExportAssociation:
      self = .exportAssociation(.incorrect)
    case .sameRecording:
      self = .audioMatch(.sameRecording)
    case .transformedUse:
      self = .audioMatch(.transformedUse)
    case .falseMatch:
      self = .audioMatch(.falseMatch)
    case .acceptedArtistRelationship:
      self = .acceptedRelationship(.artist)
    case .acceptedVariantRelationship:
      self = .acceptedRelationship(.variant)
    case .acceptedBranchRelationship:
      self = .acceptedRelationship(.branch)
    }
  }

  public var label: CalibrationDecisionLabel {
    switch self {
    case .workContainment(let action):
      switch action {
      case .sameSong: .sameSong
      case .keepSeparate: .keepSeparate
      case .assignedElsewhere: .assignedElsewhere
      case .rejected: .rejected
      }
    case .sessionRelationship(let action):
      switch action {
      case .duplicate: .duplicate
      case .evolved: .evolved
      case .derivative: .derivative
      case .unrelated: .unrelated
      }
    case .exportAssociation(let action):
      switch action {
      case .correct: .correctExportAssociation
      case .incorrect: .incorrectExportAssociation
      }
    case .audioMatch(let action):
      switch action {
      case .sameRecording: .sameRecording
      case .transformedUse: .transformedUse
      case .falseMatch: .falseMatch
      }
    case .acceptedRelationship(let kind):
      kind.label
    }
  }
}

public struct CalibrationTypedReviewRequest: Sendable, Equatable {
  public let decisionID: String
  public let action: CalibrationTypedReviewAction
  public let observation: CalibrationObservationSnapshot
  public let reproductionFeatures: [CalibrationFeature]
  public let decidedAt: Date
  public let notes: String?

  public init(
    decisionID: String,
    action: CalibrationTypedReviewAction,
    observation: CalibrationObservationSnapshot,
    reproductionFeatures: [CalibrationFeature] = [
      CalibrationFeature(name: "reviewAuthority", value: "local-user")
    ],
    decidedAt: Date = Date(),
    notes: String? = nil
  ) {
    self.decisionID = decisionID
    self.action = action
    self.observation = observation
    self.reproductionFeatures = reproductionFeatures
    self.decidedAt = decidedAt
    self.notes = notes
  }
}

public enum CalibrationReviewRecordingError: Error, LocalizedError, Equatable {
  case actionObservationMismatch

  public var errorDescription: String? {
    switch self {
    case .actionObservationMismatch:
      "The typed review action does not match the immutable observation family."
    }
  }
}

public actor CalibrationReviewRecordingService {
  private let store: CalibrationReviewStore

  public init(store: CalibrationReviewStore) {
    self.store = store
  }

  @discardableResult
  public func record(
    _ request: CalibrationTypedReviewRequest
  ) async throws -> CalibrationReviewDecisionRecord {
    guard request.action.label.family == request.observation.taskFamily,
      request.action.label.family == request.observation.kind.taskFamily
    else {
      throw CalibrationReviewRecordingError.actionObservationMismatch
    }
    if case .acceptedRelationship(let requestedKind) = request.action {
      guard case .acceptedRelationship(let binding) = request.observation.binding,
        binding.relationshipKind == requestedKind
      else {
        throw CalibrationReviewRecordingError.actionObservationMismatch
      }
    }
    return try await store.append(
      CalibrationReviewDecisionDraft(
        id: request.decisionID,
        label: request.action.label,
        primaryObservationID: request.observation.id,
        observationInputs: [
          CalibrationObservationInput(
            observationID: request.observation.id,
            expectedFeatureDigest: request.observation.featureDigest)
        ],
        algorithmFamily: request.observation.algorithmFamily,
        algorithmVersion: request.observation.algorithmVersion,
        calibrationID: request.observation.calibrationID,
        reproductionFeatures: request.reproductionFeatures,
        decidedAt: request.decidedAt,
        corpusPartition: request.observation.corpusPartition,
        notes: request.notes),
      registry: CalibrationObservationRegistry(observations: [request.observation]))
  }
}

public struct CalibrationLocalReportService: Sendable {
  private let store: CalibrationReviewStore?
  private let testingBeforeInstall: (@Sendable () -> Void)?

  public init() {
    store = nil
    testingBeforeInstall = nil
  }

  public init(store: CalibrationReviewStore) {
    self.store = store
    testingBeforeInstall = nil
  }

  init(
    store: CalibrationReviewStore,
    testingBeforeInstall: @escaping @Sendable () -> Void
  ) {
    self.store = store
    self.testingBeforeInstall = testingBeforeInstall
  }

  public func generate(
    store: CalibrationReviewStore,
    generatedAt: Date = Date(),
    evidence: CalibrationEvaluationEvidence = .localPrototype
  ) async throws -> CalibrationEvaluationReport {
    let snapshot = try await store.snapshot()
    return try CalibrationEvaluationReportGenerator().generate(
      snapshot: snapshot,
      generatedAt: generatedAt,
      evidence: evidence)
  }

  public func write(
    _ report: CalibrationEvaluationReport,
    jsonURL: URL?,
    markdownURL: URL?
  ) async throws {
    guard jsonURL != nil || markdownURL != nil else {
      throw CalibrationLocalReportError.missingDestination
    }
    guard report.hasCanonicalIntegrity, let store else {
      throw CalibrationLocalReportError.nonAuthoritativeReport
    }
    let snapshot = try await store.snapshot()
    guard report.sourceBinding?.storeIdentity == snapshot.storeIdentity,
      report.sourceBinding?.storeGeneration == snapshot.generation,
      report.sourceBinding?.storeContentDigest == snapshot.contentDigest
    else { throw CalibrationLocalReportError.staleReportSnapshot }
    let recomputed = try CalibrationEvaluationReportGenerator().generate(
      snapshot: snapshot,
      generatedAt: report.generatedAt,
      evidence: report.gates.evidence)
    guard recomputed == report else {
      throw CalibrationLocalReportError.reportIntegrityMismatch
    }
    guard report.schemaVersion == CalibrationEvaluationReport.currentSchemaVersion,
      report.ledgerSchemaVersion == CalibrationReviewStore.currentSchemaVersion,
      report.activationAuthority == .none
    else { throw CalibrationReviewStoreError.invalidValue("report.schema") }
    let evidence = report.gates.evidence
    let acceptedEvidence: [(CalibrationEvaluationGateStatus, Bool)] = [
      (report.gates.labelledCorpusEvaluation, evidence.labelledCorpus != nil),
      (report.gates.rightsAndModelReview, evidence.rightsAndModel != nil),
      (report.gates.resourceBudget, evidence.resourceBudget != nil),
      (report.gates.realDAWQualification, evidence.realDAWQualification != nil),
      (report.gates.packaging, evidence.packaging != nil),
      (report.gates.hostedService, evidence.hostedService != nil),
    ]
    guard acceptedEvidence.allSatisfy({ $0.0 != .accepted || $0.1 }) else {
      throw CalibrationReviewStoreError.invalidValue("report.gates")
    }
    let reviews = [
      evidence.labelledCorpus?.review,
      evidence.rightsAndModel?.review,
      evidence.resourceBudget?.review,
      evidence.realDAWQualification,
      evidence.packaging,
      evidence.hostedService,
    ].compactMap { $0 }
    for review in reviews {
      for value in [review.id, review.reviewAuthority] {
        if CalibrationPrivacy.containsPath(value) || CalibrationPrivacy.containsPersonalData(value)
        {
          throw CalibrationReviewStoreError.privacyViolation("report.gates")
        }
        guard !value.isEmpty,
          value.utf8.count <= CalibrationReviewLimits.maximumIdentifierLength
        else { throw CalibrationReviewStoreError.invalidValue("report.gates") }
      }
      guard review.digest.count == 64, review.digest.allSatisfy(\.isHexDigit) else {
        throw CalibrationReviewStoreError.invalidValue("report.gates")
      }
      guard review.reviewedAt.timeIntervalSince1970.isFinite,
        (0...CalibrationReviewLimits.maximumDateSeconds).contains(
          review.reviewedAt.timeIntervalSince1970),
        review.reviewedAt <= report.generatedAt
      else { throw CalibrationReviewStoreError.invalidValue("report.gates") }
    }
    let evidenceDigests = [
      evidence.labelledCorpus?.reviewedEvaluationReportDigest,
      evidence.rightsAndModel?.licenceEvidenceDigest,
      evidence.rightsAndModel?.modelArtifactDigest,
    ].compactMap { $0 }
    guard
      evidenceDigests.allSatisfy({
        $0.count == 64 && $0.allSatisfy(\.isHexDigit)
      })
    else {
      throw CalibrationReviewStoreError.invalidValue("report.gates")
    }
    for partitionReport in report.partitionReports {
      let partition = partitionReport.partition
      for value in [partition.artistGroupDigest, partition.songGroupDigest] {
        if CalibrationPrivacy.containsPath(value) || CalibrationPrivacy.containsPersonalData(value)
        {
          throw CalibrationReviewStoreError.privacyViolation("report.partition")
        }
        guard value.count == 64, value.allSatisfy(\.isHexDigit) else {
          throw CalibrationReviewStoreError.invalidValue("report.partition")
        }
      }
    }
    var payloads: [(Data, URL)] = []
    if let jsonURL {
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
      encoder.dateEncodingStrategy = .iso8601
      payloads.append((try encoder.encode(report), jsonURL))
    }
    if let markdownURL {
      payloads.append(
        (Data(CalibrationEvaluationReportRenderer.markdown(report).utf8), markdownURL))
    }
    for (data, _) in payloads {
      guard data.count <= CalibrationReviewLimits.maximumFileBytes else {
        throw CalibrationReviewStoreError.resourceLimitExceeded("report bytes")
      }
    }
    try CalibrationExclusiveReportWriter.write(
      payloads,
      beforeInstall: testingBeforeInstall)
  }
}

public enum CalibrationLocalReportError: Error, LocalizedError, Equatable {
  case missingDestination
  case parentDirectoryMissing(String)
  case destinationExists(String)
  case aliasedDestinations
  case symlinkPath(String)
  case pathRace(String)
  case notRegularFile(String)
  case ioFailure(Int32)
  case nonAuthoritativeReport
  case staleReportSnapshot
  case reportIntegrityMismatch

  public var errorDescription: String? {
    switch self {
    case .missingDestination:
      "At least one local JSON or Markdown report destination is required."
    case .parentDirectoryMissing(let path):
      "The report parent directory does not exist: \(path)."
    case .destinationExists(let path):
      "The report destination already exists: \(path)."
    case .aliasedDestinations:
      "JSON and Markdown report destinations must be distinct files."
    case .symlinkPath(let path):
      "Report destinations cannot contain symbolic links: \(path)."
    case .pathRace(let path):
      "The report destination changed while it was being created: \(path)."
    case .notRegularFile(let path):
      "The report destination is not a regular file: \(path)."
    case .ioFailure(let code):
      "Local report delivery failed with POSIX error \(code)."
    case .nonAuthoritativeReport:
      "Only a report derived by the trusted local evaluation service can be written."
    case .staleReportSnapshot:
      "The calibration review store changed after this report was evaluated."
    case .reportIntegrityMismatch:
      "The calibration report no longer matches its deterministic local evaluation."
    }
  }
}

private enum CalibrationExclusiveReportWriter {
  private static let privateFileMode = mode_t(S_IRUSR | S_IWUSR)
  private static let permissionMask = mode_t(S_IRWXU | S_IRWXG | S_IRWXO)

  private struct PreparedPublication {
    let data: Data
    let url: URL
    let parentPath: String
    let finalName: String
    let temporaryName: String
    let parentDescriptor: Int32
    let temporaryDescriptor: Int32
    let parentDevice: dev_t
    let parentInode: ino_t
    let fileDevice: dev_t
    let fileInode: ino_t
    var installed: Bool
  }

  static func write(
    _ payloads: [(Data, URL)],
    beforeInstall: (@Sendable () -> Void)?
  ) throws {
    let canonical = payloads.map(\.1)
    if canonical.count == 2 {
      let firstParent = try parentIdentity(canonical[0])
      let secondParent = try parentIdentity(canonical[1])
      if canonical[0].path == canonical[1].path
        || (firstParent.device == secondParent.device
          && firstParent.inode == secondParent.inode
          && canonical[0].lastPathComponent.lowercased()
            == canonical[1].lastPathComponent.lowercased())
      {
        throw CalibrationLocalReportError.aliasedDestinations
      }
    }

    var prepared: [PreparedPublication] = []
    do {
      for (index, item) in payloads.enumerated() {
        prepared.append(try prepare(data: item.0, url: canonical[index]))
      }
      for publication in prepared {
        try writeAll(publication.data, to: publication.temporaryDescriptor)
        guard fsync(publication.temporaryDescriptor) == 0 else {
          throw CalibrationLocalReportError.ioFailure(errno)
        }
        var fileStatus = stat()
        guard fstat(publication.temporaryDescriptor, &fileStatus) == 0 else {
          throw CalibrationLocalReportError.ioFailure(errno)
        }
        guard fileStatus.st_mode & S_IFMT == S_IFREG else {
          throw CalibrationLocalReportError.notRegularFile(publication.url.path)
        }
      }
      beforeInstall?()
      for index in prepared.indices {
        try verifyParent(prepared[index])
        try verifyTemporary(prepared[index])
        try install(prepared[index])
        prepared[index].installed = true
        try verifyFinal(prepared[index])
        guard fsync(prepared[index].parentDescriptor) == 0 else {
          throw CalibrationLocalReportError.ioFailure(errno)
        }
        try verifyParent(prepared[index])
        try verifyFinal(prepared[index])
      }
      for publication in prepared {
        _ = close(publication.temporaryDescriptor)
        _ = close(publication.parentDescriptor)
      }
    } catch {
      for publication in prepared.reversed() {
        unlinkTemporaryIfStillPresent(publication)
        _ = close(publication.temporaryDescriptor)
        _ = close(publication.parentDescriptor)
      }
      throw error
    }
  }

  private static func prepare(data: Data, url: URL) throws -> PreparedPublication {
    guard url.isFileURL else {
      throw CalibrationLocalReportError.notRegularFile(url.absoluteString)
    }
    let parent = url.deletingLastPathComponent()
    try rejectSymlinkComponents(parent)
    var parentStatus = stat()
    guard lstat(parent.path, &parentStatus) == 0 else {
      if errno == ENOENT {
        throw CalibrationLocalReportError.parentDirectoryMissing(parent.path)
      }
      throw CalibrationLocalReportError.ioFailure(errno)
    }
    guard parentStatus.st_mode & S_IFMT == S_IFDIR else {
      throw CalibrationLocalReportError.parentDirectoryMissing(parent.path)
    }
    var destinationStatus = stat()
    if lstat(url.path, &destinationStatus) == 0 {
      if destinationStatus.st_mode & S_IFMT == S_IFLNK {
        throw CalibrationLocalReportError.symlinkPath(url.path)
      }
      throw CalibrationLocalReportError.destinationExists(url.path)
    } else if errno != ENOENT {
      throw CalibrationLocalReportError.ioFailure(errno)
    }
    let parentDescriptor = Darwin.open(
      parent.path,
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
    guard parentDescriptor >= 0 else {
      if errno == ELOOP { throw CalibrationLocalReportError.symlinkPath(parent.path) }
      throw CalibrationLocalReportError.ioFailure(errno)
    }
    var openedParentStatus = stat()
    guard fstat(parentDescriptor, &openedParentStatus) == 0 else {
      let code = errno
      _ = close(parentDescriptor)
      throw CalibrationLocalReportError.ioFailure(code)
    }
    guard openedParentStatus.st_mode & S_IFMT == S_IFDIR,
      openedParentStatus.st_dev == parentStatus.st_dev,
      openedParentStatus.st_ino == parentStatus.st_ino
    else {
      _ = close(parentDescriptor)
      throw CalibrationLocalReportError.pathRace(parent.path)
    }
    let temporary = try createTemporary(in: parentDescriptor)
    var fileStatus = stat()
    guard fstat(temporary.descriptor, &fileStatus) == 0 else {
      let code = errno
      _ = unlinkat(parentDescriptor, temporary.name, 0)
      _ = close(temporary.descriptor)
      _ = close(parentDescriptor)
      throw CalibrationLocalReportError.ioFailure(code)
    }
    guard fileStatus.st_mode & S_IFMT == S_IFREG else {
      _ = unlinkat(parentDescriptor, temporary.name, 0)
      _ = close(temporary.descriptor)
      _ = close(parentDescriptor)
      throw CalibrationLocalReportError.notRegularFile(url.path)
    }
    return PreparedPublication(
      data: data,
      url: url,
      parentPath: parent.path,
      finalName: url.lastPathComponent,
      temporaryName: temporary.name,
      parentDescriptor: parentDescriptor,
      temporaryDescriptor: temporary.descriptor,
      parentDevice: parentStatus.st_dev,
      parentInode: parentStatus.st_ino,
      fileDevice: fileStatus.st_dev,
      fileInode: fileStatus.st_ino,
      installed: false)
  }

  private static func createTemporary(
    in parentDescriptor: Int32
  ) throws -> (name: String, descriptor: Int32) {
    for _ in 0..<8 {
      let name = ".studio-time-machine-report-\(UUID().uuidString).tmp"
      let descriptor = openat(
        parentDescriptor,
        name,
        O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC,
        privateFileMode)
      if descriptor >= 0 {
        guard fchmod(descriptor, privateFileMode) == 0 else {
          let code = errno
          _ = close(descriptor)
          _ = unlinkat(parentDescriptor, name, 0)
          throw CalibrationLocalReportError.ioFailure(code)
        }
        return (name, descriptor)
      }
      if errno != EEXIST { throw CalibrationLocalReportError.ioFailure(errno) }
    }
    throw CalibrationLocalReportError.ioFailure(EEXIST)
  }

  private static func rejectSymlinkComponents(_ url: URL) throws {
    var path = "/"
    for component in url.pathComponents.dropFirst() {
      path = URL(fileURLWithPath: path).appending(path: component).path
      var status = stat()
      guard lstat(path, &status) == 0 else {
        if errno == ENOENT {
          throw CalibrationLocalReportError.parentDirectoryMissing(path)
        }
        throw CalibrationLocalReportError.ioFailure(errno)
      }
      if status.st_mode & S_IFMT == S_IFLNK {
        throw CalibrationLocalReportError.symlinkPath(path)
      }
    }
  }

  private static func parentIdentity(_ url: URL) throws -> (device: dev_t, inode: ino_t) {
    let parent = url.deletingLastPathComponent()
    try rejectSymlinkComponents(parent)
    var status = stat()
    guard lstat(parent.path, &status) == 0, status.st_mode & S_IFMT == S_IFDIR else {
      throw CalibrationLocalReportError.parentDirectoryMissing(parent.path)
    }
    return (status.st_dev, status.st_ino)
  }

  private static func verifyParent(_ publication: PreparedPublication) throws {
    var status = stat()
    guard lstat(publication.parentPath, &status) == 0,
      status.st_mode & S_IFMT == S_IFDIR,
      status.st_dev == publication.parentDevice,
      status.st_ino == publication.parentInode
    else { throw CalibrationLocalReportError.pathRace(publication.parentPath) }
  }

  private static func install(_ publication: PreparedPublication) throws {
    guard
      renameatx_np(
        publication.parentDescriptor,
        publication.temporaryName,
        publication.parentDescriptor,
        publication.finalName,
        UInt32(RENAME_EXCL)) == 0
    else {
      let code = errno
      if code == EEXIST {
        var status = stat()
        if fstatat(
          publication.parentDescriptor,
          publication.finalName,
          &status,
          AT_SYMLINK_NOFOLLOW) == 0,
          status.st_mode & S_IFMT == S_IFLNK
        {
          throw CalibrationLocalReportError.symlinkPath(publication.url.path)
        }
        throw CalibrationLocalReportError.destinationExists(publication.url.path)
      }
      throw CalibrationLocalReportError.ioFailure(code)
    }
  }

  private static func verifyTemporary(_ publication: PreparedPublication) throws {
    var status = stat()
    guard
      fstatat(
        publication.parentDescriptor,
        publication.temporaryName,
        &status,
        AT_SYMLINK_NOFOLLOW) == 0,
      status.st_mode & S_IFMT == S_IFREG,
      status.st_mode & permissionMask == privateFileMode,
      status.st_dev == publication.fileDevice,
      status.st_ino == publication.fileInode,
      status.st_size == publication.data.count
    else { throw CalibrationLocalReportError.pathRace(publication.url.path) }
  }

  private static func verifyFinal(_ publication: PreparedPublication) throws {
    var status = stat()
    guard
      fstatat(
        publication.parentDescriptor,
        publication.finalName,
        &status,
        AT_SYMLINK_NOFOLLOW) == 0,
      status.st_mode & S_IFMT == S_IFREG,
      status.st_mode & permissionMask == privateFileMode,
      status.st_dev == publication.fileDevice,
      status.st_ino == publication.fileInode
    else { throw CalibrationLocalReportError.pathRace(publication.url.path) }
  }

  private static func unlinkTemporaryIfStillPresent(_ publication: PreparedPublication) {
    guard !publication.installed else { return }
    var status = stat()
    guard
      fstatat(
        publication.parentDescriptor,
        publication.temporaryName,
        &status,
        AT_SYMLINK_NOFOLLOW) == 0,
      status.st_dev == publication.fileDevice,
      status.st_ino == publication.fileInode
    else { return }
    _ = unlinkat(publication.parentDescriptor, publication.temporaryName, 0)
  }

  private static func writeAll(_ data: Data, to descriptor: Int32) throws {
    try data.withUnsafeBytes { rawBuffer in
      guard let base = rawBuffer.baseAddress else { return }
      var offset = 0
      while offset < rawBuffer.count {
        let written = Darwin.write(descriptor, base.advanced(by: offset), rawBuffer.count - offset)
        if written < 0, errno == EINTR { continue }
        guard written > 0 else { throw CalibrationLocalReportError.ioFailure(errno) }
        offset += written
      }
    }
  }
}
