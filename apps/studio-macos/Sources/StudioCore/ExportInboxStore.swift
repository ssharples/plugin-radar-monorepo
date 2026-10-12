import Darwin
import Foundation

public enum ExportInboxStoreError: Error, Equatable {
  case unsupportedSchema(Int)
  case malformedDocument
  case unknownBatch(String)
  case invalidDetectionCandidate
  case associationMissingReviewedReference
  case associationRequiresRelink
  case invalidStatusTransition(from: ExportBatchStatus, to: ExportBatchStatus)
  case packageAlreadyAttached
  case packageFileMismatch
  case packageMismatch
  case unknownDeliveryAttempt(String)
  case deliveryAttemptAlreadyFinished(String)
  case invalidDeliveryTransition(from: DeliveryAttemptResult, to: DeliveryAttemptResult)
  case coordinationFailed(Int32)
}

public actor ExportInboxStore {
  public let storageURL: URL
  private let packageVerifier: any DeliveryPackageVerifying
  private let revisionAuthority: StudioRevisionExecutionAuthority

  public init(
    storageURL: URL,
    revisionAuthority: StudioRevisionExecutionAuthority = StudioRevisionExecutionAuthority()
  ) {
    self.storageURL = storageURL.standardizedFileURL
    packageVerifier = LocalDeliveryPackageVerifier()
    self.revisionAuthority = revisionAuthority
  }

  init(
    storageURL: URL,
    packageVerifier: any DeliveryPackageVerifying,
    revisionAuthority: StudioRevisionExecutionAuthority = StudioRevisionExecutionAuthority()
  ) {
    self.storageURL = storageURL.standardizedFileURL
    self.packageVerifier = packageVerifier
    self.revisionAuthority = revisionAuthority
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
      .appending(path: "export-inbox.plist")
  }

  public func all() throws -> [ExportBatch] {
    try withFileLock(exclusive: true) {
      try loadUnlocked().batches.sorted { $0.completedAt > $1.completedAt }
    }
  }

  public func batch(id: String) throws -> ExportBatch? {
    try withFileLock(exclusive: true) {
      try loadUnlocked().batches.first { $0.id == id }
    }
  }

  @discardableResult
  public func ingest(
    _ detected: [DetectedExportBatch]
  ) throws -> [ExportBatch] {
    try withFileLock(exclusive: true) {
      var document = try loadUnlocked()
      var knownKeys = Set(document.batches.map(\.deduplicationKey))
      let candidates = try detected.map {
        try canonicalDetectionCandidate($0)
      }
      let additions = candidates.filter { knownKeys.insert($0.deduplicationKey).inserted }
      guard !additions.isEmpty else { return [] }
      document.batches.append(contentsOf: additions)
      try saveUnlocked(document)
      return additions
    }
  }

  @discardableResult
  public func review(id: String) throws -> ExportBatch {
    try update(id: id) { batch in
      guard batch.status == .new else {
        throw ExportInboxStoreError.invalidStatusTransition(
          from: batch.status, to: .reviewed)
      }
      return batch.updating(status: .reviewed)
    }
  }

  @discardableResult
  public func relink(
    id: String,
    to revisionReference: StudioRevisionReference
  ) throws -> ExportBatch {
    try update(id: id) { batch in
      guard batch.status == .new || batch.status == .reviewed else {
        throw ExportInboxStoreError.invalidStatusTransition(
          from: batch.status, to: .reviewed)
      }
      _ = try revisionAuthority.resolve(revisionReference)
      let existingEvidence = batch.association?.evidence ?? []
      let evidence =
        existingEvidence.contains(.userRelink)
        ? existingEvidence : existingEvidence + [.userRelink]
      let reviewedAssociation = ExportAssociation(
        revisionReference: revisionReference,
        confidence: .reviewed,
        evidence: evidence)
      return batch.updating(
        status: .reviewed, association: reviewedAssociation, replaceAssociation: true)
    }
  }

  @discardableResult
  public func revalidateAssociation(
    id: String
  ) throws -> ExportBatch {
    try update(id: id) { batch in
      guard let association = batch.association,
        let revisionReference = association.revisionReference
      else { throw ExportInboxStoreError.associationMissingReviewedReference }
      guard association.state != .stale else {
        throw ExportInboxStoreError.associationRequiresRelink
      }
      do {
        _ = try revisionAuthority.resolve(revisionReference)
        return batch
      } catch let error as StudioRevisionReferenceError {
        return batch.updating(
          association: association.markingStale(staleReason(for: error)),
          replaceAssociation: true)
      }
    }
  }

  @discardableResult
  public func dismiss(id: String) throws -> ExportBatch {
    try update(id: id) { batch in
      guard batch.status == .new || batch.status == .reviewed else {
        throw ExportInboxStoreError.invalidStatusTransition(
          from: batch.status, to: .dismissed)
      }
      return batch.updating(status: .dismissed)
    }
  }

  @discardableResult
  public func beginPackaging(
    id: String
  ) throws -> ExportBatch {
    try withFileLock(exclusive: true) {
      var document = try loadUnlocked()
      guard let index = document.batches.firstIndex(where: { $0.id == id }) else {
        throw ExportInboxStoreError.unknownBatch(id)
      }
      let batch = document.batches[index]
      guard batch.status == .reviewed else {
        throw ExportInboxStoreError.invalidStatusTransition(
          from: batch.status, to: .packaging)
      }
      guard batch.association?.state != .stale else {
        throw ExportInboxStoreError.associationRequiresRelink
      }
      guard batch.package == nil else { throw ExportInboxStoreError.packageAlreadyAttached }
      do {
        try resolveAssociation(for: batch)
      } catch let error as StudioRevisionReferenceError {
        document.batches[index] = stale(batch, for: error)
        try saveUnlocked(document)
        throw ExportInboxStoreError.associationRequiresRelink
      }
      let updated = batch.updating(status: .packaging)
      document.batches[index] = updated
      try saveUnlocked(document)
      return updated
    }
  }

  @discardableResult
  public func attachVerifiedPackage(
    id: String,
    archiveURL: URL,
    verifiedAt: Date = Date()
  ) throws -> ExportBatch {
    try withFileLock(exclusive: true) {
      var document = try loadUnlocked()
      guard let index = document.batches.firstIndex(where: { $0.id == id }) else {
        throw ExportInboxStoreError.unknownBatch(id)
      }
      let batch = document.batches[index]
      guard batch.status == .packaging else {
        throw ExportInboxStoreError.invalidStatusTransition(from: batch.status, to: .ready)
      }
      guard batch.package == nil else { throw ExportInboxStoreError.packageAlreadyAttached }
      do {
        try resolveAssociation(for: batch)
      } catch let error as StudioRevisionReferenceError {
        document.batches[index] = stale(batch, for: error).updating(status: .reviewed)
        try saveUnlocked(document)
        throw ExportInboxStoreError.associationRequiresRelink
      }
      let verifiedPackage = try packageVerifier.verify(
        archiveURL: archiveURL,
        for: batch,
        verifiedAt: verifiedAt)
      guard verifiedPackage.batchID == batch.id else {
        throw ExportInboxStoreError.packageFileMismatch
      }
      let package = verifiedPackage.package
      guard
        package.files.map(\.deduplicationKey).sorted()
          == batch.files.map(\.deduplicationKey).sorted()
      else { throw ExportInboxStoreError.packageFileMismatch }
      try packageVerifier.revalidate(verifiedPackage)
      let updated = batch.updating(status: .ready, package: package, replacePackage: true)
      document.batches[index] = updated
      try saveUnlocked(document)
      return updated
    }
  }

  @discardableResult
  public func beginDelivery(
    id: String,
    packageID: String,
    method: DeliveryMethod,
    recipient: String?,
    startedAt: Date = Date(),
    attemptID: String = UUID().uuidString
  ) throws -> ExportBatch {
    try withFileLock(exclusive: true) {
      var document = try loadUnlocked(validatePackages: false)
      guard let index = document.batches.firstIndex(where: { $0.id == id }) else {
        throw ExportInboxStoreError.unknownBatch(id)
      }
      let batch = document.batches[index]
      guard batch.status == .ready else {
        throw ExportInboxStoreError.invalidStatusTransition(
          from: batch.status, to: .delivering)
      }
      guard let package = batch.package, package.id == packageID else {
        throw ExportInboxStoreError.packageMismatch
      }
      do {
        let verifiedPackage = try packageVerifier.verify(
          archiveURL: package.archiveURL,
          for: batch,
          verifiedAt: package.verifiedAt ?? package.createdAt)
        guard verifiedPackage.package == package else {
          throw ExportInboxStoreError.packageMismatch
        }
        try packageVerifier.revalidate(verifiedPackage)
      } catch {
        document.batches[index] = quarantine(batch, reason: .packageEvidenceMismatch)
        try saveUnlocked(document)
        throw error
      }
      let attempt = DeliveryAttempt(
        attemptID: attemptID,
        packageID: packageID,
        method: method,
        recipient: recipient,
        startedAt: startedAt,
        result: .pending)
      let updated = batch.updating(
        status: .delivering, deliveryAttempts: batch.deliveryAttempts + [attempt])
      document.batches[index] = updated
      try saveUnlocked(document)
      return updated
    }
  }

  @discardableResult
  public func recordDeliveryTransition(
    id: String,
    attemptID: String,
    result: DeliveryAttemptResult,
    completedAt: Date = Date(),
    providerReference: String? = nil,
    expiresAt: Date? = nil
  ) throws -> ExportBatch {
    try update(id: id) { batch in
      guard batch.status == .delivering else {
        throw ExportInboxStoreError.invalidStatusTransition(
          from: batch.status, to: deliveryBatchStatus(for: result))
      }
      guard let prior = batch.deliveryAttempts.last(where: { $0.attemptID == attemptID }) else {
        throw ExportInboxStoreError.unknownDeliveryAttempt(attemptID)
      }
      guard prior.packageID == batch.package?.id else {
        throw ExportInboxStoreError.packageMismatch
      }
      guard prior.result == .pending || prior.result == .handedToUser else {
        throw ExportInboxStoreError.deliveryAttemptAlreadyFinished(attemptID)
      }
      guard validDeliveryTransition(from: prior.result, to: result) else {
        throw ExportInboxStoreError.invalidDeliveryTransition(from: prior.result, to: result)
      }
      let transition = DeliveryAttempt(
        attemptID: prior.attemptID,
        packageID: prior.packageID,
        method: prior.method,
        recipient: prior.recipient,
        startedAt: prior.startedAt,
        completedAt: result == .handedToUser ? nil : completedAt,
        providerReference: providerReference,
        expiresAt: expiresAt,
        result: result)
      return batch.updating(
        status: deliveryBatchStatus(for: result),
        deliveryAttempts: batch.deliveryAttempts + [transition])
    }
  }

  private func deliveryBatchStatus(for result: DeliveryAttemptResult) -> ExportBatchStatus {
    switch result {
    case .pending, .handedToUser: .delivering
    case .delivered: .delivered
    case .failed: .failed
    case .cancelled: .ready
    }
  }

  private func validDeliveryTransition(
    from: DeliveryAttemptResult,
    to: DeliveryAttemptResult
  ) -> Bool {
    switch (from, to) {
    case (.pending, .handedToUser), (.pending, .delivered), (.pending, .failed),
      (.pending, .cancelled), (.handedToUser, .delivered), (.handedToUser, .failed),
      (.handedToUser, .cancelled):
      true
    default: false
    }
  }

  private func canonicalDetectionCandidate(
    _ detected: DetectedExportBatch
  ) throws -> ExportBatch {
    let candidate = detected.batch
    let observationKeys = candidate.files.map(\.deduplicationKey)
    guard candidate.status == .new,
      candidate.package == nil,
      candidate.deliveryAttempts.isEmpty,
      candidate.quarantineReason == nil,
      !candidate.files.isEmpty,
      Set(observationKeys).count == observationKeys.count
    else { throw ExportInboxStoreError.invalidDetectionCandidate }

    let association: ExportAssociation?
    switch candidate.association?.confidence {
    case nil:
      association = nil
    case .suggested:
      guard let suggested = candidate.association,
        suggested.revisionReference == nil,
        suggested.state == .suggested,
        suggested.staleReason == nil
      else { throw ExportInboxStoreError.invalidDetectionCandidate }
      association = ExportAssociation(
        suggestedWorkID: suggested.workID,
        suggestedSessionID: suggested.sessionID,
        suggestedRevisionID: suggested.revisionID,
        evidence: suggested.evidence)
    case .verified:
      guard let verified = candidate.association,
        let reference = verified.revisionReference,
        verified.state == .current,
        verified.staleReason == nil,
        let receipt = detected.automationReceipt,
        receipt.revisionReferenceID == reference.id,
        receipt.fileObservationKeys == observationKeys.sorted(),
        verified.evidence.contains(where: { evidence in
          guard case .verifiedAutomationOutput(let planID) = evidence else { return false }
          return planID == receipt.planID
        })
      else { throw ExportInboxStoreError.invalidDetectionCandidate }
      _ = try revisionAuthority.resolve(reference)
      association = ExportAssociation(
        revisionReference: reference,
        confidence: .verified,
        evidence: verified.evidence)
    case .reviewed:
      throw ExportInboxStoreError.invalidDetectionCandidate
    }

    return ExportBatch.detected(
      files: candidate.files,
      kind: candidate.kind,
      completedAt: candidate.completedAt,
      evidence: candidate.evidence,
      association: association,
      detectedAt: candidate.detectedAt)
  }

  private func resolveAssociation(
    for batch: ExportBatch
  ) throws {
    guard let association = batch.association,
      let reference = association.revisionReference
    else { throw ExportInboxStoreError.associationMissingReviewedReference }
    guard association.state == .current else {
      throw ExportInboxStoreError.associationRequiresRelink
    }
    _ = try revisionAuthority.resolve(reference)
  }

  private func stale(
    _ batch: ExportBatch,
    for error: StudioRevisionReferenceError
  ) -> ExportBatch {
    guard let association = batch.association else { return batch }
    return batch.updating(
      association: association.markingStale(staleReason(for: error)),
      replaceAssociation: true)
  }

  private func quarantine(
    _ batch: ExportBatch,
    reason: ExportBatchQuarantineReason
  ) -> ExportBatch {
    batch.updating(
      status: .quarantined,
      quarantineReason: reason,
      replaceQuarantineReason: true)
  }

  private func staleReason(
    for error: StudioRevisionReferenceError
  ) -> ExportAssociationStaleReason {
    switch error {
    case .catalogueRefreshInProgress, .catalogueGenerationChanged:
      .catalogueGenerationChanged
    case .revisionNotFound, .ambiguousRevision, .setURLNotFound, .ambiguousSetURL,
      .untrackedSetURL, .trackedRootMissing:
      .revisionUnavailable
    case .workRegrouped:
      .workRegrouped
    case .sessionMismatch:
      .sessionChanged
    case .setIDMismatch, .setURLMismatch:
      .setChanged
    case .contentObservationChanged:
      .contentChanged
    }
  }

  private func update(
    id: String,
    transform: (ExportBatch) throws -> ExportBatch
  ) throws -> ExportBatch {
    try withFileLock(exclusive: true) {
      var document = try loadUnlocked()
      guard let index = document.batches.firstIndex(where: { $0.id == id }) else {
        throw ExportInboxStoreError.unknownBatch(id)
      }
      let updated = try transform(document.batches[index])
      document.batches[index] = updated
      try saveUnlocked(document)
      return updated
    }
  }

  private func loadUnlocked(validatePackages: Bool = true) throws -> ExportInboxDocument {
    guard FileManager.default.fileExists(atPath: storageURL.path) else {
      return ExportInboxDocument(batches: [])
    }
    var document: ExportInboxDocument
    do {
      document = try PropertyListDecoder().decode(
        ExportInboxDocument.self, from: Data(contentsOf: storageURL))
    } catch {
      throw ExportInboxStoreError.malformedDocument
    }
    guard document.schemaVersion == ExportInboxDocument.currentSchemaVersion else {
      throw ExportInboxStoreError.unsupportedSchema(document.schemaVersion)
    }
    var repaired = false
    document.batches = document.batches.map { batch in
      let validated = validatePersistedBatch(batch, validatePackage: validatePackages)
      repaired = repaired || validated != batch
      return validated
    }
    if repaired { try saveUnlocked(document) }
    return document
  }

  private func validatePersistedBatch(
    _ batch: ExportBatch,
    validatePackage: Bool
  ) -> ExportBatch {
    if batch.status == .quarantined {
      return batch.quarantineReason == nil
        ? quarantine(batch, reason: .invalidLifecycle) : batch
    }
    let canonical = ExportBatch.detected(
      files: batch.files,
      kind: batch.kind,
      completedAt: batch.completedAt,
      evidence: batch.evidence,
      association: batch.association,
      detectedAt: batch.detectedAt)
    let observationKeys = batch.files.map(\.deduplicationKey)
    guard !batch.files.isEmpty,
      Set(observationKeys).count == observationKeys.count,
      batch.id == canonical.id,
      batch.deduplicationKey == canonical.deduplicationKey,
      batch.technicalSummary == canonical.technicalSummary,
      validPersistedAssociation(batch.association)
    else { return quarantine(batch, reason: .invalidLifecycle) }

    switch batch.status {
    case .new, .reviewed, .dismissed:
      guard batch.package == nil, batch.deliveryAttempts.isEmpty else {
        return quarantine(batch, reason: .invalidLifecycle)
      }
    case .packaging:
      guard batch.package == nil,
        batch.deliveryAttempts.isEmpty,
        batch.association?.revisionReference != nil
      else { return quarantine(batch, reason: .invalidAssociation) }
      if batch.association?.state == .stale,
        batch.association?.staleReason != nil
      {
        return batch.updating(status: .reviewed)
      }
      guard batch.association?.state == .current else {
        return quarantine(batch, reason: .invalidAssociation)
      }
    case .ready:
      guard let package = batch.package,
        validDeliveryHistory(
          batch.deliveryAttempts, packageID: package.id, batchStatus: batch.status)
      else { return quarantine(batch, reason: .invalidLifecycle) }
    case .delivering:
      guard let package = batch.package,
        validDeliveryHistory(
          batch.deliveryAttempts, packageID: package.id, batchStatus: batch.status)
      else { return quarantine(batch, reason: .invalidLifecycle) }
    case .delivered:
      guard let package = batch.package,
        validDeliveryHistory(
          batch.deliveryAttempts, packageID: package.id, batchStatus: batch.status)
      else { return quarantine(batch, reason: .invalidLifecycle) }
    case .failed:
      guard let package = batch.package,
        validDeliveryHistory(
          batch.deliveryAttempts, packageID: package.id, batchStatus: batch.status)
      else { return quarantine(batch, reason: .invalidLifecycle) }
    case .quarantined:
      return batch
    }

    guard
      batch.status == .ready || batch.status == .delivering
        || batch.status == .delivered || batch.status == .failed
    else { return batch }
    guard batch.association?.revisionReference != nil,
      batch.association?.state == .current
    else { return quarantine(batch, reason: .invalidAssociation) }
    guard validatePackage else { return batch }
    guard let package = batch.package, let verifiedAt = package.verifiedAt else {
      return quarantine(batch, reason: .packageEvidenceUnavailable)
    }
    do {
      let verifiedPackage = try packageVerifier.verify(
        archiveURL: package.archiveURL,
        for: batch,
        verifiedAt: verifiedAt)
      guard verifiedPackage.package == package else {
        return quarantine(batch, reason: .packageEvidenceMismatch)
      }
      try packageVerifier.revalidate(verifiedPackage)
      return batch
    } catch {
      return quarantine(batch, reason: .packageEvidenceUnavailable)
    }
  }

  private func validPersistedAssociation(_ association: ExportAssociation?) -> Bool {
    guard let association else { return true }
    switch association.confidence {
    case .suggested:
      return association.revisionReference == nil && association.state == .suggested
        && association.staleReason == nil
    case .verified, .reviewed:
      return association.revisionReference != nil
        && (association.state == .current
          || (association.state == .stale && association.staleReason != nil))
    }
  }

  private func validDeliveryHistory(
    _ attempts: [DeliveryAttempt],
    packageID: String,
    batchStatus: ExportBatchStatus
  ) -> Bool {
    guard Set(attempts.map(\.id)).count == attempts.count else { return false }
    var latestByAttempt: [String: DeliveryAttempt] = [:]
    var closedAttemptIDs: Set<String> = []

    for attempt in attempts {
      guard !attempt.attemptID.isEmpty, attempt.packageID == packageID,
        !closedAttemptIDs.contains(attempt.attemptID)
      else { return false }

      if let prior = latestByAttempt[attempt.attemptID] {
        guard prior.packageID == attempt.packageID,
          prior.method == attempt.method,
          prior.recipient == attempt.recipient,
          prior.startedAt == attempt.startedAt,
          validDeliveryTransition(from: prior.result, to: attempt.result)
        else { return false }
      } else {
        guard attempt.result == .pending,
          latestByAttempt.values.allSatisfy({ $0.result == .cancelled })
        else { return false }
      }

      switch attempt.result {
      case .pending, .handedToUser:
        guard attempt.completedAt == nil else { return false }
      case .delivered, .failed, .cancelled:
        guard attempt.completedAt != nil else { return false }
        closedAttemptIDs.insert(attempt.attemptID)
      }
      latestByAttempt[attempt.attemptID] = attempt
    }

    switch batchStatus {
    case .ready:
      return attempts.isEmpty || attempts.last?.result == .cancelled
    case .delivering:
      return attempts.last?.result == .pending || attempts.last?.result == .handedToUser
    case .delivered:
      return attempts.last?.result == .delivered
    case .failed:
      return attempts.last?.result == .failed
    default:
      return false
    }
  }

  private func saveUnlocked(_ document: ExportInboxDocument) throws {
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    let data = try encoder.encode(document)
    try FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    let temporaryURL = storageURL.deletingLastPathComponent()
      .appending(path: ".\(storageURL.lastPathComponent).\(UUID().uuidString).tmp")
    do {
      try data.write(to: temporaryURL, options: .withoutOverwriting)
      let result = temporaryURL.withUnsafeFileSystemRepresentation { sourcePath in
        storageURL.withUnsafeFileSystemRepresentation { destinationPath in
          guard let sourcePath, let destinationPath else { return Int32(EINVAL) }
          return Darwin.rename(sourcePath, destinationPath) == 0 ? 0 : errno
        }
      }
      guard result == 0 else {
        throw POSIXError(POSIXErrorCode(rawValue: result) ?? .EIO)
      }
    } catch {
      try? FileManager.default.removeItem(at: temporaryURL)
      throw error
    }
  }

  private func withFileLock<T>(exclusive: Bool, _ body: () throws -> T) throws -> T {
    let processLock = ExportInboxProcessLockRegistry.shared.lock(for: storageURL.path)
    processLock.lock()
    defer { processLock.unlock() }
    try FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    let descriptor = Darwin.open(
      storageURL.appendingPathExtension("lock").path,
      O_CREAT | O_RDWR,
      S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else { throw ExportInboxStoreError.coordinationFailed(errno) }
    defer { Darwin.close(descriptor) }
    guard flock(descriptor, exclusive ? LOCK_EX : LOCK_SH) == 0 else {
      throw ExportInboxStoreError.coordinationFailed(errno)
    }
    defer { flock(descriptor, LOCK_UN) }
    return try body()
  }
}

private struct ExportInboxDocument: Codable {
  static let currentSchemaVersion = 1
  var schemaVersion = currentSchemaVersion
  var batches: [ExportBatch]
}

private final class ExportInboxProcessLockRegistry: @unchecked Sendable {
  static let shared = ExportInboxProcessLockRegistry()
  private let registryLock = NSLock()
  private var locks: [String: NSLock] = [:]

  func lock(for path: String) -> NSLock {
    registryLock.lock()
    defer { registryLock.unlock() }
    if let existing = locks[path] { return existing }
    let created = NSLock()
    locks[path] = created
    return created
  }
}
