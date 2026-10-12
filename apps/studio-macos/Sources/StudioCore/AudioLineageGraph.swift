import CSQLite
import Foundation

public enum AudioIdentityKind: String, Codable, Sendable, CaseIterable {
  case byteSHA256
  case canonicalPCM
}

public enum AudioLocationProvenance: String, Codable, Sendable, CaseIterable {
  case externalLibrary
  case projectRecorded
  case projectImported
  case projectProcessed
  case projectCollected
  case exportArtifact
  case loose
  case unknown
}

public struct AudioContentAsset: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let identityKind: AudioIdentityKind
  public let identityDigest: String
  public let createdAt: Date

  public init(
    id: String,
    identityKind: AudioIdentityKind,
    identityDigest: String,
    createdAt: Date
  ) {
    self.id = id
    self.identityKind = identityKind
    self.identityDigest = identityDigest
    self.createdAt = createdAt
  }
}

public struct AudioPhysicalLocation: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let contentAssetID: String
  public let fileURL: URL
  public let provenance: AudioLocationProvenance
  public let provenanceExplanation: String
  public let byteCount: Int64
  public let byteSHA256: String
  public let canonicalPCMSHA256: String?
  public let registeredAt: Date

  public init(
    id: String,
    contentAssetID: String,
    fileURL: URL,
    provenance: AudioLocationProvenance,
    provenanceExplanation: String,
    byteCount: Int64,
    byteSHA256: String,
    canonicalPCMSHA256: String?,
    registeredAt: Date
  ) {
    self.id = id
    self.contentAssetID = contentAssetID
    self.fileURL = fileURL
    self.provenance = provenance
    self.provenanceExplanation = provenanceExplanation
    self.byteCount = byteCount
    self.byteSHA256 = byteSHA256
    self.canonicalPCMSHA256 = canonicalPCMSHA256
    self.registeredAt = registeredAt
  }
}

public struct CollectedCopyLink: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let contentAssetID: String
  public let externalLocation: AudioPhysicalLocation
  public let collectedLocation: AudioPhysicalLocation

  public init(
    id: String,
    contentAssetID: String,
    externalLocation: AudioPhysicalLocation,
    collectedLocation: AudioPhysicalLocation
  ) {
    self.id = id
    self.contentAssetID = contentAssetID
    self.externalLocation = externalLocation
    self.collectedLocation = collectedLocation
  }
}

public enum AudioLineageRelationship: String, Codable, Sendable, CaseIterable {
  case exactBytes
  case exactDecodedAudio
  case collectedCopyOf
  case nearIdenticalRecording
  case containedSegment
  case transformedFrom
  case usedBy
  case renderOf
  case stemOf
  case sessionDerivedFrom
  case variantDerivedFrom
  case musicallySimilarTo
  case semanticallySimilarTo
}

public enum AudioLineageConfidence: String, Codable, Sendable, CaseIterable {
  case verifiedIdentity
  case highConfidenceDerivative
  case highConfidenceSessionLineage
  case suggested
  case unknown
  case conflicted
}

public enum AudioMatchEvidenceKind: String, Codable, Sendable, CaseIterable {
  case byteHash
  case canonicalPCMHash
  case nearIdentityFingerprint
  case landmarkFingerprint
  case excerptSequenceAlignment
  case transformedFingerprint
  case projectDependency
  case arrangementAnchor
  case filenameQualifier
  case chronology
  case technicalMetadata
  case semanticEmbedding
  case userDecision
}

public struct AudioMatchEvidence: Codable, Sendable, Equatable {
  public let kind: AudioMatchEvidenceKind
  public let score: Double
  public let explanation: String

  public init(kind: AudioMatchEvidenceKind, score: Double, explanation: String) {
    self.kind = kind
    self.score = score
    self.explanation = explanation
  }
}

public struct AudioTimeRange: Codable, Sendable, Equatable {
  public let startSeconds: Double
  public let durationSeconds: Double

  public init(startSeconds: Double, durationSeconds: Double) {
    self.startSeconds = startSeconds
    self.durationSeconds = durationSeconds
  }
}

public struct AudioTransformEvidence: Codable, Sendable, Equatable {
  public let timeFactor: Double?
  public let pitchSemitones: Double?
  public let reversed: Bool

  public init(timeFactor: Double? = nil, pitchSemitones: Double? = nil, reversed: Bool = false) {
    self.timeFactor = timeFactor
    self.pitchSemitones = pitchSemitones
    self.reversed = reversed
  }
}

public struct AudioLineageEdge: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let sourceNodeID: String
  public let targetNodeID: String
  public let relationship: AudioLineageRelationship
  public let confidence: AudioLineageConfidence
  public let explanation: String
  public let algorithmVersion: String
  public let calibrationID: String?
  public let sourceRange: AudioTimeRange?
  public let targetRange: AudioTimeRange?
  public let transform: AudioTransformEvidence?
  public let evidence: [AudioMatchEvidence]
  public let userDecision: Bool?

  public init(
    id: String,
    sourceNodeID: String,
    targetNodeID: String,
    relationship: AudioLineageRelationship,
    confidence: AudioLineageConfidence,
    explanation: String,
    algorithmVersion: String,
    calibrationID: String? = nil,
    sourceRange: AudioTimeRange? = nil,
    targetRange: AudioTimeRange? = nil,
    transform: AudioTransformEvidence? = nil,
    evidence: [AudioMatchEvidence] = [],
    userDecision: Bool? = nil
  ) {
    self.id = id
    self.sourceNodeID = sourceNodeID
    self.targetNodeID = targetNodeID
    self.relationship = relationship
    self.confidence = confidence
    self.explanation = explanation
    self.algorithmVersion = algorithmVersion
    self.calibrationID = calibrationID
    self.sourceRange = sourceRange
    self.targetRange = targetRange
    self.transform = transform
    self.evidence = evidence
    self.userDecision = userDecision
  }
}

public enum AudioLineageAutomationAction: String, Codable, Sendable, Hashable, CaseIterable {
  case uniteContentLocations
  case preselectMissingFileCandidate
  case createReversibleLineageLink
  case attachSessionToWork
  case queueForReview
  case moveFile
  case deleteFile
  case rewriteDAWProject
}

public struct AudioLineageAutomationPolicy: Sendable {
  public init() {}

  public func allowedActions(for edge: AudioLineageEdge) -> Set<AudioLineageAutomationAction> {
    if edge.userDecision == false { return [] }
    switch edge.confidence {
    case .verifiedIdentity:
      switch edge.relationship {
      case .exactBytes, .exactDecodedAudio, .collectedCopyOf:
        return [.uniteContentLocations, .preselectMissingFileCandidate]
      default:
        return [.createReversibleLineageLink]
      }
    case .highConfidenceDerivative:
      return [.createReversibleLineageLink]
    case .highConfidenceSessionLineage:
      return [.createReversibleLineageLink, .attachSessionToWork]
    case .suggested:
      return [.queueForReview]
    case .unknown, .conflicted:
      return []
    }
  }
}

public enum AudioLineageStoreError: Error, LocalizedError {
  case openFailed(String)
  case databaseFailed(String)
  case encodingFailed(String)

  public var errorDescription: String? {
    switch self {
    case .openFailed(let message): "Could not open the audio lineage graph: \(message)"
    case .databaseFailed(let message): "Could not update the audio lineage graph: \(message)"
    case .encodingFailed(let message): "Could not encode audio lineage evidence: \(message)"
    }
  }
}

public final class AudioLineageStore: @unchecked Sendable {
  public let storageURL: URL

  private let lock = NSRecursiveLock()
  private var database: OpaquePointer?
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  public init(storageURL: URL) throws {
    self.storageURL = storageURL
    try FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    var handle: OpaquePointer?
    let result = sqlite3_open_v2(
      storageURL.path, &handle,
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil)
    guard result == SQLITE_OK, let handle else {
      let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown error"
      sqlite3_close(handle)
      throw AudioLineageStoreError.openFailed(message)
    }
    database = handle
    sqlite3_busy_timeout(handle, 5_000)
    do {
      try execute("PRAGMA journal_mode=WAL")
      try execute("PRAGMA foreign_keys=ON")
      try migrate()
    } catch {
      sqlite3_close(handle)
      database = nil
      throw error
    }
  }

  public static func defaultStorageURL(fileManager: FileManager = .default) throws -> URL {
    let support = try fileManager.url(
      for: .applicationSupportDirectory, in: .userDomainMask,
      appropriateFor: nil, create: true)
    return
      support
      .appending(path: "Plugin Radar/Studio Time Machine", directoryHint: .isDirectory)
      .appending(path: "audio-lineage.sqlite")
  }

  deinit { sqlite3_close(database) }

  @discardableResult
  public func register(
    _ identity: AudioFileIdentity,
    provenance: AudioLocationProvenance,
    provenanceExplanation: String,
    registeredAt: Date = Date()
  ) throws -> AudioPhysicalLocation {
    try locked {
      let identityKind: AudioIdentityKind =
        identity.canonicalPCM == nil ? .byteSHA256 : .canonicalPCM
      let identityDigest = identity.canonicalPCM?.sha256 ?? identity.byteSHA256
      try execute(
        """
        INSERT INTO audio_content_assets(id, identity_kind, identity_digest, created_at)
        VALUES(?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          identity_kind=excluded.identity_kind,
          identity_digest=excluded.identity_digest
        """,
        [
          .text(identity.contentAssetID), .text(identityKind.rawValue), .text(identityDigest),
          .double(registeredAt.timeIntervalSince1970),
        ]
      )
      let locationID = StableID.forValue("audio-location:\(identity.fileURL.path)")
      try execute(
        """
        INSERT INTO audio_physical_locations(
          id, asset_id, path, provenance, provenance_explanation, byte_count,
          byte_sha256, pcm_sha256, registered_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
          asset_id=excluded.asset_id, provenance=excluded.provenance,
          provenance_explanation=excluded.provenance_explanation,
          byte_count=excluded.byte_count, byte_sha256=excluded.byte_sha256,
          pcm_sha256=excluded.pcm_sha256
        """,
        [
          .text(locationID), .text(identity.contentAssetID), .text(identity.fileURL.path),
          .text(provenance.rawValue), .text(provenanceExplanation), .int64(identity.byteCount),
          .text(identity.byteSHA256), identity.canonicalPCM.map { .text($0.sha256) } ?? .null,
          .double(registeredAt.timeIntervalSince1970),
        ]
      )
      return AudioPhysicalLocation(
        id: locationID,
        contentAssetID: identity.contentAssetID,
        fileURL: identity.fileURL,
        provenance: provenance,
        provenanceExplanation: provenanceExplanation,
        byteCount: identity.byteCount,
        byteSHA256: identity.byteSHA256,
        canonicalPCMSHA256: identity.canonicalPCM?.sha256,
        registeredAt: registeredAt
      )
    }
  }

  public func contentAssets() throws -> [AudioContentAsset] {
    try locked {
      try query(
        "SELECT id, identity_kind, identity_digest, created_at FROM audio_content_assets ORDER BY created_at, id"
      ).map { row in
        AudioContentAsset(
          id: row.text(0),
          identityKind: AudioIdentityKind(rawValue: row.text(1)) ?? .byteSHA256,
          identityDigest: row.text(2),
          createdAt: Date(timeIntervalSince1970: row.double(3)))
      }
    }
  }

  public func locations(for contentAssetID: String) throws -> [AudioPhysicalLocation] {
    try locked {
      try query(
        """
        SELECT id, asset_id, path, provenance, provenance_explanation, byte_count,
               byte_sha256, pcm_sha256, registered_at
        FROM audio_physical_locations WHERE asset_id = ? ORDER BY path COLLATE NOCASE
        """, [.text(contentAssetID)]
      ).map(Self.location)
    }
  }

  public func location(at fileURL: URL) throws -> AudioPhysicalLocation? {
    let path = fileURL.resolvingSymlinksInPath().standardizedFileURL.path
    return try locked {
      try query(
        """
        SELECT id, asset_id, path, provenance, provenance_explanation, byte_count,
               byte_sha256, pcm_sha256, registered_at
        FROM audio_physical_locations WHERE path = ? LIMIT 1
        """, [.text(path)]
      ).first.map(Self.location)
    }
  }

  public func collectedCopyLinks(for contentAssetID: String) throws -> [CollectedCopyLink] {
    let locations = try locations(for: contentAssetID)
    let external = locations.filter { $0.provenance == .externalLibrary }
    let collected = locations.filter { $0.provenance == .projectCollected }
    return external.flatMap { source in
      collected.map { copy in
        CollectedCopyLink(
          id: StableID.forValue("collected-copy:\(source.id):\(copy.id)"),
          contentAssetID: contentAssetID,
          externalLocation: source,
          collectedLocation: copy)
      }
    }
  }

  public func save(_ edge: AudioLineageEdge) throws {
    let data: Data
    do { data = try encoder.encode(edge) } catch {
      throw AudioLineageStoreError.encodingFailed(error.localizedDescription)
    }
    try execute(
      """
      INSERT INTO audio_lineage_edges(id, source_node_id, target_node_id, relationship, confidence, payload)
      VALUES(?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        source_node_id=excluded.source_node_id, target_node_id=excluded.target_node_id,
        relationship=excluded.relationship, confidence=excluded.confidence, payload=excluded.payload
      """,
      [
        .text(edge.id), .text(edge.sourceNodeID), .text(edge.targetNodeID),
        .text(edge.relationship.rawValue), .text(edge.confidence.rawValue), .blob(data),
      ]
    )
  }

  public func edges(for nodeID: String) throws -> [AudioLineageEdge] {
    try locked {
      try query(
        """
        SELECT payload FROM audio_lineage_edges
        WHERE source_node_id = ? OR target_node_id = ?
        ORDER BY relationship, id
        """, [.text(nodeID), .text(nodeID)]
      ).compactMap { row in try? decoder.decode(AudioLineageEdge.self, from: row.blob(0)) }
    }
  }

  private func migrate() throws {
    try executeScript(
      """
      CREATE TABLE IF NOT EXISTS audio_content_assets(
        id TEXT PRIMARY KEY, identity_kind TEXT NOT NULL, identity_digest TEXT NOT NULL,
        created_at REAL NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS audio_asset_identity
        ON audio_content_assets(identity_kind, identity_digest);
      CREATE TABLE IF NOT EXISTS audio_physical_locations(
        id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES audio_content_assets(id),
        path TEXT NOT NULL UNIQUE, provenance TEXT NOT NULL,
        provenance_explanation TEXT NOT NULL, byte_count INTEGER NOT NULL,
        byte_sha256 TEXT NOT NULL, pcm_sha256 TEXT, registered_at REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audio_locations_asset ON audio_physical_locations(asset_id);
      CREATE INDEX IF NOT EXISTS audio_locations_byte_hash ON audio_physical_locations(byte_sha256);
      CREATE INDEX IF NOT EXISTS audio_locations_pcm_hash ON audio_physical_locations(pcm_sha256);
      CREATE TABLE IF NOT EXISTS audio_lineage_edges(
        id TEXT PRIMARY KEY, source_node_id TEXT NOT NULL, target_node_id TEXT NOT NULL,
        relationship TEXT NOT NULL, confidence TEXT NOT NULL, payload BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audio_edges_source ON audio_lineage_edges(source_node_id);
      CREATE INDEX IF NOT EXISTS audio_edges_target ON audio_lineage_edges(target_node_id);
      """)
  }

  private static func location(_ row: LineageRow) -> AudioPhysicalLocation {
    AudioPhysicalLocation(
      id: row.text(0), contentAssetID: row.text(1),
      fileURL: URL(fileURLWithPath: row.text(2)),
      provenance: AudioLocationProvenance(rawValue: row.text(3)) ?? .unknown,
      provenanceExplanation: row.text(4), byteCount: row.int64(5),
      byteSHA256: row.text(6), canonicalPCMSHA256: row.optionalText(7),
      registeredAt: Date(timeIntervalSince1970: row.double(8)))
  }

  private func locked<T>(_ body: () throws -> T) rethrows -> T {
    lock.lock()
    defer { lock.unlock() }
    return try body()
  }

  private func execute(_ sql: String, _ bindings: [LineageValue] = []) throws {
    try locked {
      let statement = try prepare(sql)
      defer { sqlite3_finalize(statement) }
      try bind(bindings, to: statement)
      var result = sqlite3_step(statement)
      while result == SQLITE_ROW { result = sqlite3_step(statement) }
      guard result == SQLITE_DONE else { throw databaseError() }
    }
  }

  private func executeScript(_ sql: String) throws {
    try locked {
      var message: UnsafeMutablePointer<CChar>?
      let result = sqlite3_exec(database, sql, nil, nil, &message)
      defer { sqlite3_free(message) }
      guard result == SQLITE_OK else {
        throw AudioLineageStoreError.databaseFailed(
          message.map { String(cString: $0) } ?? "unknown SQLite error")
      }
    }
  }

  private func query(_ sql: String, _ bindings: [LineageValue] = []) throws -> [LineageRow] {
    try locked {
      let statement = try prepare(sql)
      defer { sqlite3_finalize(statement) }
      try bind(bindings, to: statement)
      var rows: [LineageRow] = []
      while sqlite3_step(statement) == SQLITE_ROW { rows.append(LineageRow(statement)) }
      let result = sqlite3_errcode(database)
      guard result == SQLITE_OK || result == SQLITE_DONE || result == SQLITE_ROW else {
        throw databaseError()
      }
      return rows
    }
  }

  private func prepare(_ sql: String) throws -> OpaquePointer {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
      let statement
    else { throw databaseError() }
    return statement
  }

  private func bind(_ values: [LineageValue], to statement: OpaquePointer) throws {
    for (offset, value) in values.enumerated() {
      let index = Int32(offset + 1)
      let result: Int32 =
        switch value {
        case .null: sqlite3_bind_null(statement, index)
        case .text(let value): sqlite3_bind_text(statement, index, value, -1, Self.transient)
        case .int64(let value): sqlite3_bind_int64(statement, index, value)
        case .double(let value): sqlite3_bind_double(statement, index, value)
        case .blob(let data):
          data.withUnsafeBytes {
            sqlite3_bind_blob(statement, index, $0.baseAddress, Int32($0.count), Self.transient)
          }
        }
      guard result == SQLITE_OK else { throw databaseError() }
    }
  }

  private func databaseError() -> AudioLineageStoreError {
    AudioLineageStoreError.databaseFailed(
      database.map { String(cString: sqlite3_errmsg($0)) } ?? "database unavailable")
  }

  private static let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}

private enum LineageValue {
  case null
  case text(String)
  case int64(Int64)
  case double(Double)
  case blob(Data)
}

private struct LineageRow {
  private let values: [Value]

  init(_ statement: OpaquePointer) {
    values = (0..<sqlite3_column_count(statement)).map { index in
      switch sqlite3_column_type(statement, index) {
      case SQLITE_INTEGER: .int64(sqlite3_column_int64(statement, index))
      case SQLITE_FLOAT: .double(sqlite3_column_double(statement, index))
      case SQLITE_TEXT:
        .text(sqlite3_column_text(statement, index).map(String.init(cString:)) ?? "")
      case SQLITE_BLOB:
        .blob(
          sqlite3_column_blob(statement, index).map {
            Data(bytes: $0, count: Int(sqlite3_column_bytes(statement, index)))
          } ?? Data())
      default: .null
      }
    }
  }

  func text(_ index: Int) -> String {
    if case .text(let value) = values[index] { value } else { "" }
  }
  func optionalText(_ index: Int) -> String? {
    if case .text(let value) = values[index] { value } else { nil }
  }
  func int64(_ index: Int) -> Int64 {
    if case .int64(let value) = values[index] { value } else { 0 }
  }
  func double(_ index: Int) -> Double {
    switch values[index] {
    case .double(let value): value
    case .int64(let value): Double(value)
    default: 0
    }
  }
  func blob(_ index: Int) -> Data {
    if case .blob(let value) = values[index] { value } else { Data() }
  }

  private enum Value {
    case null
    case text(String)
    case int64(Int64)
    case double(Double)
    case blob(Data)
  }
}
