import CSQLite
import Foundation

public enum SampleLibraryDatabaseError: Error, LocalizedError {
  case openFailed(String)
  case statementFailed(String)
  case executionFailed(String)

  public var errorDescription: String? {
    switch self {
    case .openFailed(let message): "Could not open the Samples database: \(message)"
    case .statementFailed(let message): "Could not prepare a Samples query: \(message)"
    case .executionFailed(let message): "Could not update the Samples database: \(message)"
    }
  }
}

public final class SampleLibraryDatabase: @unchecked Sendable {
  public let storageURL: URL

  private let lock = NSRecursiveLock()
  private var handle: OpaquePointer?
  private let encoder = JSONEncoder()
  private let decoder = JSONDecoder()

  public init(storageURL: URL) throws {
    self.storageURL = storageURL
    try FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    var database: OpaquePointer?
    let result = sqlite3_open_v2(
      storageURL.path, &database,
      SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX, nil)
    guard result == SQLITE_OK, let database else {
      let message = database.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown error"
      sqlite3_close(database)
      throw SampleLibraryDatabaseError.openFailed(message)
    }
    handle = database
    do {
      try configure()
      try migrate()
    } catch {
      sqlite3_close(database)
      handle = nil
      throw error
    }
  }

  deinit {
    sqlite3_close(handle)
  }

  public static func defaultStorageURL(fileManager: FileManager = .default) throws -> URL {
    let applicationSupport = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    return
      applicationSupport
      .appending(path: "Plugin Radar/Studio Time Machine", directoryHint: .isDirectory)
      .appending(path: "samples.sqlite")
  }

  @discardableResult
  public func registerLocation(_ url: URL, securityScopedBookmark: Data?) throws -> SampleLocation {
    try locked {
      let canonical = url.resolvingSymlinksInPath().standardizedFileURL
      let id = StableID.forURL(canonical)
      try execute(
        """
        INSERT INTO sample_locations(id, path, display_name, bookmark, availability)
        VALUES(?, ?, ?, ?, 'available')
        ON CONFLICT(path) DO UPDATE SET
          display_name = excluded.display_name,
          bookmark = COALESCE(excluded.bookmark, sample_locations.bookmark)
        """,
        bindings: [
          .text(id), .text(canonical.path), .text(canonical.lastPathComponent),
          securityScopedBookmark.map(SQLiteValue.blob) ?? .null,
        ]
      )
      return try locations().first { $0.fileURL.standardizedFileURL == canonical }!
    }
  }

  public func locations() throws -> [SampleLocation] {
    try locked {
      let rows = try query(
        """
        SELECT l.id, l.path, l.display_name, l.bookmark, l.last_scanned_at,
               COUNT(m.sample_id)
        FROM sample_locations l
        LEFT JOIN sample_memberships m ON m.location_id = l.id
        GROUP BY l.id
        ORDER BY l.display_name COLLATE NOCASE
        """)
      return rows.map { row in
        let storedURL = URL(fileURLWithPath: row.text(1), isDirectory: true)
        var resolvedURL = storedURL
        var stale = false
        var permissionFailed = false
        if let bookmark = row.blob(3) {
          do {
            resolvedURL = try URL(
              resolvingBookmarkData: bookmark,
              options: [.withSecurityScope],
              relativeTo: nil,
              bookmarkDataIsStale: &stale
            )
          } catch {
            permissionFailed = true
          }
        }
        let availability: SampleLocationAvailability
        if permissionFailed {
          availability = .permissionRequired
        } else if FileManager.default.fileExists(atPath: resolvedURL.path),
          FileManager.default.isReadableFile(atPath: resolvedURL.path)
        {
          availability = .available
        } else {
          availability = .unavailable
        }
        return SampleLocation(
          id: row.text(0),
          fileURL: resolvedURL,
          displayName: row.text(2),
          availability: availability,
          requiresBookmarkRefresh: stale,
          lastScannedAt: row.optionalDouble(4).map(Date.init(timeIntervalSince1970:)),
          sampleCount: row.int(5)
        )
      }
    }
  }

  public func removeLocation(id: String) throws {
    try transaction {
      try execute("DELETE FROM sample_memberships WHERE location_id = ?", bindings: [.text(id)])
      try execute("DELETE FROM sample_locations WHERE id = ?", bindings: [.text(id)])
      try execute(
        "DELETE FROM samples WHERE id NOT IN (SELECT sample_id FROM sample_memberships) AND id NOT IN (SELECT sample_id FROM sample_occurrences)"
      )
    }
  }

  func fingerprint(forPath path: String) throws -> (bytes: Int64, modifiedAt: Date?)? {
    try locked {
      let rows = try query(
        "SELECT bytes, modified_at FROM samples WHERE path = ? LIMIT 1", bindings: [.text(path)])
      guard let row = rows.first else { return nil }
      return (row.int64(0), row.optionalDouble(1).map(Date.init(timeIntervalSince1970:)))
    }
  }

  @discardableResult
  func upsertSample(
    _ seed: SampleResourceSeed,
    locationID: String?,
    quickDigest: String? = nil,
    fullSHA256: String? = nil
  ) throws -> String {
    try locked {
      let path = seed.fileURL.resolvingSymlinksInPath().standardizedFileURL.path
      let existingID: String? = try {
        if let resourceID = seed.metadata.fileResourceIdentifier {
          return try query(
            "SELECT id FROM samples WHERE resource_id = ? OR path = ? LIMIT 1",
            bindings: [.text(resourceID), .text(path)]
          ).first?.text(0)
        }
        return try query("SELECT id FROM samples WHERE path = ? LIMIT 1", bindings: [.text(path)])
          .first?.text(0)
      }()
      let id = existingID ?? StableID.forValue("sample:\(path)")
      try execute(
        """
        INSERT INTO samples(
          id, path, name, pack_name, classification, classification_explanation,
          availability, format, bytes, duration, sample_rate, bit_depth, channels,
          created_at, modified_at, resource_id, quick_digest, full_sha256
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          path=excluded.path, name=excluded.name, pack_name=excluded.pack_name,
          classification=excluded.classification,
          classification_explanation=excluded.classification_explanation,
          availability=excluded.availability, format=excluded.format, bytes=excluded.bytes,
          duration=excluded.duration, sample_rate=excluded.sample_rate,
          bit_depth=excluded.bit_depth, channels=excluded.channels,
          created_at=excluded.created_at, modified_at=excluded.modified_at,
          resource_id=COALESCE(excluded.resource_id, samples.resource_id),
          quick_digest=COALESCE(excluded.quick_digest, samples.quick_digest),
          full_sha256=COALESCE(excluded.full_sha256, samples.full_sha256)
        """,
        bindings: [
          .text(id), .text(path), .text(seed.name), .text(seed.packName),
          .text(seed.classification.rawValue), .text(seed.classificationExplanation),
          .text(seed.availability.rawValue), .text(seed.metadata.format),
          .int64(seed.metadata.bytes),
          seed.metadata.durationSeconds.map(SQLiteValue.double) ?? .null,
          seed.metadata.sampleRate.map(SQLiteValue.double) ?? .null,
          seed.metadata.bitDepth.map { .int64(Int64($0)) } ?? .null,
          seed.metadata.channelCount.map { .int64(Int64($0)) } ?? .null,
          seed.metadata.createdAt.map { .double($0.timeIntervalSince1970) } ?? .null,
          seed.metadata.modifiedAt.map { .double($0.timeIntervalSince1970) } ?? .null,
          seed.metadata.fileResourceIdentifier.map(SQLiteValue.text) ?? .null,
          quickDigest.map(SQLiteValue.text) ?? .null,
          fullSHA256.map(SQLiteValue.text) ?? .null,
        ]
      )
      if let locationID {
        try execute(
          "INSERT OR IGNORE INTO sample_memberships(location_id, sample_id) VALUES(?, ?)",
          bindings: [.text(locationID), .text(id)])
      }
      try execute("DELETE FROM sample_search WHERE sample_id = ?", bindings: [.text(id)])
      try execute(
        "INSERT INTO sample_search(sample_id, name, path, pack) VALUES(?, ?, ?, ?)",
        bindings: [.text(id), .text(seed.name), .text(path), .text(seed.packName)])
      return id
    }
  }

  func completeScan(locationID: String, seenSampleIDs: Set<String>, completedAt: Date) throws -> Int
  {
    try transaction {
      let prior = try query(
        "SELECT sample_id FROM sample_memberships WHERE location_id = ?",
        bindings: [.text(locationID)]
      ).map { $0.text(0) }
      let removed = prior.filter { !seenSampleIDs.contains($0) }
      for id in removed {
        try execute(
          "DELETE FROM sample_memberships WHERE location_id = ? AND sample_id = ?",
          bindings: [.text(locationID), .text(id)])
        try execute(
          "UPDATE samples SET availability = 'unavailable' WHERE id = ? AND id NOT IN (SELECT sample_id FROM sample_memberships)",
          bindings: [.text(id)])
      }
      try execute(
        "UPDATE sample_locations SET last_scanned_at = ?, availability = 'available' WHERE id = ?",
        bindings: [.double(completedAt.timeIntervalSince1970), .text(locationID)])
      return removed.count
    }
  }

  func allSampleIDsByPath() throws -> [String: String] {
    try locked {
      Dictionary(
        uniqueKeysWithValues: try query("SELECT path, id FROM samples").map {
          ($0.text(0), $0.text(1))
        })
    }
  }

  func addMembership(locationID: String, sampleID: String) throws {
    try execute(
      "INSERT OR IGNORE INTO sample_memberships(location_id, sample_id) VALUES(?, ?)",
      bindings: [.text(locationID), .text(sampleID)])
  }

  func replaceUsage(_ aggregation: SampleUsageAggregation, coverageComplete: Bool) throws {
    try transaction {
      var pathIDs = try allSampleIDsByPath()
      for seed in aggregation.referencedSamples {
        let id = try upsertSample(seed, locationID: nil)
        pathIDs[seed.fileURL.standardizedFileURL.path] = id
      }
      try execute("DELETE FROM sample_occurrences")
      for occurrence in aggregation.occurrences {
        let devices = try encoder.encode(occurrence.deviceChain)
        try execute(
          """
          INSERT INTO sample_occurrences(
            id, sample_id, work_id, work_name, session_id, session_name, timeline_id,
            set_id, set_name, set_path, set_modified_at, track_id, track_name,
            clip_id, clip_name, placement, is_warped, warp_mode, warp_markers, devices_json
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          bindings: [
            .text(occurrence.id), .text(occurrence.sampleID),
            occurrence.workID.map(SQLiteValue.text) ?? .null,
            occurrence.workName.map(SQLiteValue.text) ?? .null,
            .text(occurrence.sessionID), .text(occurrence.sessionName),
            .text(occurrence.timelineID), .text(occurrence.setID), .text(occurrence.setName),
            .text(occurrence.setURL.path),
            occurrence.setModifiedAt.map { .double($0.timeIntervalSince1970) } ?? .null,
            .text(occurrence.trackID), .text(occurrence.trackName), .text(occurrence.clipID),
            .text(occurrence.clipName), .text(occurrence.placement.rawValue),
            occurrence.isWarped.map { .int64($0 ? 1 : 0) } ?? .null,
            occurrence.warpMode.map { .int64(Int64($0)) } ?? .null,
            .int64(Int64(occurrence.warpMarkerCount)), .blob(devices),
          ])
      }
      try execute(
        "INSERT INTO sample_meta(key, value) VALUES('usage_coverage_complete', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        bindings: [.text(coverageComplete ? "1" : "0")])
    }
  }

  public func querySamples(_ sampleQuery: SampleQuery = SampleQuery()) throws -> SampleQueryResult {
    try locked {
      let search = Self.ftsQuery(sampleQuery.searchText)
      let searchJoin = search == nil ? "" : "JOIN sample_search ON sample_search.sample_id = s.id"
      let searchWhere = search == nil ? "" : "WHERE sample_search MATCH ?"
      let sortColumn: String =
        switch sampleQuery.sortField {
        case .name: "s.name COLLATE NOCASE"
        case .location: "location_name COLLATE NOCASE"
        case .workCount: "work_count"
        case .sessionCount: "session_count"
        case .setCount: "set_count"
        case .occurrenceCount: "occurrence_count"
        case .lastUsed: "last_used_at"
        case .size: "s.bytes"
        case .duration: "s.duration"
        case .format: "s.format COLLATE NOCASE"
        case .availability: "s.availability COLLATE NOCASE"
        }
      let direction = sampleQuery.direction == .ascending ? "ASC" : "DESC"
      let baseBindings = search.map { [SQLiteValue.text($0)] } ?? []
      let total =
        try query(
          "SELECT COUNT(DISTINCT s.id) FROM samples s \(searchJoin) \(searchWhere)",
          bindings: baseBindings
        ).first?.int(0) ?? 0
      let rows = try query(
        """
        SELECT s.id, s.path, s.name,
          COALESCE((SELECT MIN(l.display_name) FROM sample_memberships m JOIN sample_locations l ON l.id=m.location_id WHERE m.sample_id=s.id), 'Referenced by Set') AS location_name,
          s.pack_name, s.classification, s.classification_explanation, s.availability,
          s.format, s.bytes, s.duration, s.sample_rate, s.bit_depth, s.channels,
          s.created_at, s.modified_at, s.resource_id,
          COUNT(DISTINCT o.work_id) AS work_count,
          SUM(CASE WHEN o.id IS NOT NULL AND o.work_id IS NULL THEN 1 ELSE 0 END) AS unknown_work_count,
          COUNT(DISTINCT o.session_id) AS session_count,
          COUNT(DISTINCT o.set_id) AS set_count,
          COUNT(o.id) AS occurrence_count,
          MAX(o.set_modified_at) AS last_used_at
        FROM samples s
        \(searchJoin)
        LEFT JOIN sample_occurrences o ON o.sample_id=s.id
        \(searchWhere)
        GROUP BY s.id
        ORDER BY \(sortColumn) \(direction), s.name COLLATE NOCASE ASC
        LIMIT ? OFFSET ?
        """,
        bindings: baseBindings + [
          .int64(Int64(max(1, min(sampleQuery.limit, 2_000)))),
          .int64(Int64(max(0, sampleQuery.offset))),
        ])
      let coverageComplete = try metaValue("usage_coverage_complete") == "1"
      return SampleQueryResult(
        rows: rows.map { row in
          let occurrenceCount = row.int(21)
          let unknownWorks = row.int(18)
          let workCount: Int? = occurrenceCount == 0 ? 0 : (unknownWorks == 0 ? row.int(17) : nil)
          return SampleListRow(
            id: row.text(0), fileURL: URL(fileURLWithPath: row.text(1)), name: row.text(2),
            locationName: row.text(3), packName: row.text(4),
            classification: SampleClassification(rawValue: row.text(5)) ?? .looseUnassigned,
            classificationExplanation: row.text(6),
            availability: SampleAvailability(rawValue: row.text(7)) ?? .unavailable,
            metadata: SampleTechnicalMetadata(
              format: row.text(8), bytes: row.int64(9), durationSeconds: row.optionalDouble(10),
              sampleRate: row.optionalDouble(11), bitDepth: row.optionalInt(12),
              channelCount: row.optionalInt(13),
              createdAt: row.optionalDouble(14).map(Date.init(timeIntervalSince1970:)),
              modifiedAt: row.optionalDouble(15).map(Date.init(timeIntervalSince1970:)),
              fileResourceIdentifier: row.optionalText(16)),
            workCount: workCount, sessionCount: row.int(19), setCount: row.int(20),
            occurrenceCount: occurrenceCount,
            lastUsedAt: row.optionalDouble(22).map(Date.init(timeIntervalSince1970:)))
        },
        totalCount: total,
        usageCoverageComplete: coverageComplete)
    }
  }

  public func occurrences(for sampleID: String) throws -> [SampleUsageOccurrence] {
    try locked {
      try query(
        """
        SELECT id, sample_id, work_id, work_name, session_id, session_name, timeline_id,
          set_id, set_name, set_path, set_modified_at, track_id, track_name, clip_id,
          clip_name, placement, is_warped, warp_mode, warp_markers, devices_json
        FROM sample_occurrences WHERE sample_id = ?
        ORDER BY set_modified_at DESC, session_name COLLATE NOCASE, track_name COLLATE NOCASE
        """, bindings: [.text(sampleID)]
      ).map { row in
        let devices = (try? decoder.decode([SetDevice].self, from: row.blob(19) ?? Data())) ?? []
        return SampleUsageOccurrence(
          id: row.text(0), sampleID: row.text(1), workID: row.optionalText(2),
          workName: row.optionalText(3), sessionID: row.text(4), sessionName: row.text(5),
          timelineID: row.text(6), setID: row.text(7), setName: row.text(8),
          setURL: URL(fileURLWithPath: row.text(9)),
          setModifiedAt: row.optionalDouble(10).map(Date.init(timeIntervalSince1970:)),
          trackID: row.text(11), trackName: row.text(12), clipID: row.text(13),
          clipName: row.text(14),
          placement: SetClipPlacement(rawValue: row.text(15)) ?? .unknown,
          isWarped: row.optionalInt(16).map { $0 != 0 }, warpMode: row.optionalInt(17),
          warpMarkerCount: row.int(18), deviceChain: devices)
      }
    }
  }

  public func audioAnalysis(for sampleID: String) throws -> SampleAudioAnalysis? {
    try locked {
      guard
        let data = try query(
          "SELECT analysis_json FROM sample_audio_analysis WHERE sample_id = ?",
          bindings: [.text(sampleID)]
        ).first?.blob(0)
      else { return nil }
      return try decoder.decode(SampleAudioAnalysis.self, from: data)
    }
  }

  public func saveAudioAnalysis(_ analysis: SampleAudioAnalysis) throws {
    let data = try encoder.encode(analysis)
    try execute(
      """
      INSERT INTO sample_audio_analysis(sample_id, source_bytes, source_modified_at, algorithm_version, analysis_json)
      VALUES(?, ?, ?, ?, ?)
      ON CONFLICT(sample_id) DO UPDATE SET
        source_bytes=excluded.source_bytes,
        source_modified_at=excluded.source_modified_at,
        algorithm_version=excluded.algorithm_version,
        analysis_json=excluded.analysis_json
      """,
      bindings: [
        .text(analysis.sampleID), .int64(analysis.sourceBytes),
        analysis.sourceModifiedAt.map { .double($0.timeIntervalSince1970) } ?? .null,
        .text(analysis.algorithmVersion), .blob(data),
      ])
  }

  public func saveReviewDecision(evidenceID: String, accepted: Bool) throws {
    try execute(
      """
      INSERT INTO sample_overrides(evidence_id, accepted, decided_at) VALUES(?, ?, ?)
      ON CONFLICT(evidence_id) DO UPDATE SET accepted=excluded.accepted, decided_at=excluded.decided_at
      """,
      bindings: [
        .text(evidenceID), .int64(accepted ? 1 : 0), .double(Date().timeIntervalSince1970),
      ])
  }

  func exactMatchCandidates(for sampleID: String) throws -> [(
    id: String, url: URL, name: String, classification: SampleClassification, bytes: Int64,
    quickDigest: String?, fullSHA256: String?
  )] {
    try locked {
      try query(
        """
        SELECT candidate.id, candidate.path, candidate.name, candidate.classification,
               candidate.bytes, candidate.quick_digest, candidate.full_sha256
        FROM samples selected
        JOIN samples candidate
          ON candidate.bytes = selected.bytes
         AND candidate.id != selected.id
        WHERE selected.id = ? AND candidate.availability = 'available'
        ORDER BY candidate.path COLLATE NOCASE
        """, bindings: [.text(sampleID)]
      ).map { row in
        (
          row.text(0), URL(fileURLWithPath: row.text(1)), row.text(2),
          SampleClassification(rawValue: row.text(3)) ?? .looseUnassigned,
          row.int64(4), row.optionalText(5), row.optionalText(6)
        )
      }
    }
  }

  func sampleMatchIdentity(for sampleID: String) throws -> (
    url: URL, name: String, classification: SampleClassification, bytes: Int64,
    quickDigest: String?, fullSHA256: String?
  )? {
    try locked {
      guard
        let row = try query(
          "SELECT path, name, classification, bytes, quick_digest, full_sha256 FROM samples WHERE id = ?",
          bindings: [.text(sampleID)]
        ).first
      else { return nil }
      return (
        URL(fileURLWithPath: row.text(0)), row.text(1),
        SampleClassification(rawValue: row.text(2)) ?? .looseUnassigned,
        row.int64(3), row.optionalText(4), row.optionalText(5)
      )
    }
  }

  func saveDigests(sampleID: String, quickDigest: String, fullSHA256: String?) throws {
    try execute(
      "UPDATE samples SET quick_digest = ?, full_sha256 = COALESCE(?, full_sha256) WHERE id = ?",
      bindings: [.text(quickDigest), fullSHA256.map(SQLiteValue.text) ?? .null, .text(sampleID)])
  }

  func saveEvidence(_ evidence: SampleFamilyEvidence) throws {
    try execute(
      """
      INSERT INTO sample_family_evidence(
        id, source_sample_id, target_sample_id, relationship, score, tier,
        explanation, algorithm_version
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET relationship=excluded.relationship, score=excluded.score,
        tier=excluded.tier, explanation=excluded.explanation,
        algorithm_version=excluded.algorithm_version
      """,
      bindings: [
        .text(evidence.id), .text(evidence.sourceSampleID), .text(evidence.targetSampleID),
        .text(evidence.relationship.rawValue), .double(evidence.score),
        .int64(Int64(evidence.tier.rawValue)), .text(evidence.explanation),
        .text(evidence.algorithmVersion),
      ])
  }

  func markCollectedCopy(sampleID: String, externalSampleID: String) throws {
    try execute(
      """
      UPDATE samples SET classification = 'collectedProjectCopy',
        classification_explanation =
          'Verified byte-identical to a selected external-library resource. This proves an exact copy, not which file was historically first.'
      WHERE id = ? AND classification = 'projectImported'
      """, bindings: [.text(sampleID)])
  }

  public func matchReviews(for sampleID: String) throws -> [SampleMatchReview] {
    try locked {
      try query(
        """
        SELECT e.id, e.source_sample_id, e.target_sample_id, e.relationship, e.score,
          e.tier, e.explanation, e.algorithm_version, o.accepted,
          candidate.name, candidate.path, candidate.classification
        FROM sample_family_evidence e
        JOIN samples candidate ON candidate.id = CASE
          WHEN e.source_sample_id = ? THEN e.target_sample_id ELSE e.source_sample_id END
        LEFT JOIN sample_overrides o ON o.evidence_id = e.id
        WHERE e.source_sample_id = ? OR e.target_sample_id = ?
        ORDER BY e.score DESC, candidate.name COLLATE NOCASE
        """, bindings: [.text(sampleID), .text(sampleID), .text(sampleID)]
      ).map { row in
        SampleMatchReview(
          evidence: SampleFamilyEvidence(
            id: row.text(0), sourceSampleID: row.text(1), targetSampleID: row.text(2),
            relationship: SampleFamilyRelationship(rawValue: row.text(3)) ?? .possibleSourceOf,
            score: row.optionalDouble(4) ?? 0,
            tier: SampleEvidenceTier(rawValue: row.int(5)) ?? .filenameFolderTimeSimilarity,
            explanation: row.text(6), algorithmVersion: row.text(7),
            userDecision: row.optionalInt(8).map { $0 != 0 }),
          candidateName: row.text(9), candidateURL: URL(fileURLWithPath: row.text(10)),
          candidateClassification: SampleClassification(rawValue: row.text(11)) ?? .looseUnassigned)
      }
    }
  }

  private func configure() throws {
    try execute("PRAGMA journal_mode=WAL")
    try execute("PRAGMA foreign_keys=ON")
    try execute("PRAGMA synchronous=NORMAL")
    sqlite3_busy_timeout(handle, 5_000)
  }

  private func migrate() throws {
    try executeScript(
      """
      CREATE TABLE IF NOT EXISTS sample_locations(
        id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
        bookmark BLOB, availability TEXT NOT NULL, last_scanned_at REAL
      );
      CREATE TABLE IF NOT EXISTS samples(
        id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        pack_name TEXT NOT NULL, classification TEXT NOT NULL,
        classification_explanation TEXT NOT NULL, availability TEXT NOT NULL,
        format TEXT NOT NULL, bytes INTEGER NOT NULL, duration REAL, sample_rate REAL,
        bit_depth INTEGER, channels INTEGER, created_at REAL, modified_at REAL,
        resource_id TEXT, quick_digest TEXT, full_sha256 TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS samples_resource_id ON samples(resource_id) WHERE resource_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS samples_name_size ON samples(name, bytes);
      CREATE INDEX IF NOT EXISTS samples_bytes ON samples(bytes);
      CREATE TABLE IF NOT EXISTS sample_memberships(
        location_id TEXT NOT NULL REFERENCES sample_locations(id) ON DELETE CASCADE,
        sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
        PRIMARY KEY(location_id, sample_id)
      );
      CREATE TABLE IF NOT EXISTS sample_occurrences(
        id TEXT PRIMARY KEY, sample_id TEXT NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
        work_id TEXT, work_name TEXT, session_id TEXT NOT NULL, session_name TEXT NOT NULL,
        timeline_id TEXT NOT NULL, set_id TEXT NOT NULL, set_name TEXT NOT NULL,
        set_path TEXT NOT NULL, set_modified_at REAL, track_id TEXT NOT NULL,
        track_name TEXT NOT NULL, clip_id TEXT NOT NULL, clip_name TEXT NOT NULL,
        placement TEXT NOT NULL, is_warped INTEGER, warp_mode INTEGER,
        warp_markers INTEGER NOT NULL, devices_json BLOB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS occurrences_sample ON sample_occurrences(sample_id);
      CREATE INDEX IF NOT EXISTS occurrences_usage ON sample_occurrences(work_id, session_id, set_id);
      CREATE TABLE IF NOT EXISTS sample_family_evidence(
        id TEXT PRIMARY KEY, source_sample_id TEXT NOT NULL, target_sample_id TEXT NOT NULL,
        relationship TEXT NOT NULL, score REAL NOT NULL, tier INTEGER NOT NULL,
        explanation TEXT NOT NULL, algorithm_version TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sample_overrides(
        evidence_id TEXT PRIMARY KEY, accepted INTEGER NOT NULL, decided_at REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sample_audio_analysis(
        sample_id TEXT PRIMARY KEY REFERENCES samples(id) ON DELETE CASCADE,
        source_bytes INTEGER NOT NULL, source_modified_at REAL,
        algorithm_version TEXT NOT NULL, analysis_json BLOB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sample_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS sample_search USING fts5(
        sample_id UNINDEXED, name, path, pack, tokenize='unicode61 remove_diacritics 2'
      );
      """)
  }

  private func metaValue(_ key: String) throws -> String? {
    try query("SELECT value FROM sample_meta WHERE key = ?", bindings: [.text(key)])
      .first?.optionalText(0)
  }

  private static func ftsQuery(_ value: String) -> String? {
    let tokens = value.lowercased().split { !$0.isLetter && !$0.isNumber }
    guard !tokens.isEmpty else { return nil }
    return tokens.map { "\($0)*" }.joined(separator: " AND ")
  }

  private func transaction<T>(_ body: () throws -> T) throws -> T {
    try locked {
      try execute("BEGIN IMMEDIATE")
      do {
        let value = try body()
        try execute("COMMIT")
        return value
      } catch {
        try? execute("ROLLBACK")
        throw error
      }
    }
  }

  private func locked<T>(_ body: () throws -> T) rethrows -> T {
    lock.lock()
    defer { lock.unlock() }
    return try body()
  }

  private func execute(_ sql: String, bindings: [SQLiteValue] = []) throws {
    try locked {
      let statement = try prepare(sql)
      defer { sqlite3_finalize(statement) }
      try bind(bindings, to: statement)
      var result = sqlite3_step(statement)
      while result == SQLITE_ROW { result = sqlite3_step(statement) }
      guard result == SQLITE_DONE else { throw databaseError(.executionFailed) }
    }
  }

  private func executeScript(_ sql: String) throws {
    try locked {
      var errorMessage: UnsafeMutablePointer<CChar>?
      let result = sqlite3_exec(handle, sql, nil, nil, &errorMessage)
      defer { sqlite3_free(errorMessage) }
      guard result == SQLITE_OK else {
        let message =
          errorMessage.map { String(cString: $0) }
          ?? handle.map { String(cString: sqlite3_errmsg($0)) }
          ?? "unknown database error"
        throw SampleLibraryDatabaseError.executionFailed(message)
      }
    }
  }

  private func query(_ sql: String, bindings: [SQLiteValue] = []) throws -> [SQLiteRow] {
    try locked {
      let statement = try prepare(sql)
      defer { sqlite3_finalize(statement) }
      try bind(bindings, to: statement)
      var rows: [SQLiteRow] = []
      while sqlite3_step(statement) == SQLITE_ROW {
        rows.append(SQLiteRow(statement: statement))
      }
      let result = sqlite3_errcode(handle)
      guard result == SQLITE_OK || result == SQLITE_DONE || result == SQLITE_ROW else {
        throw databaseError(.executionFailed)
      }
      return rows
    }
  }

  private func prepare(_ sql: String) throws -> OpaquePointer {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(handle, sql, -1, &statement, nil) == SQLITE_OK, let statement else {
      throw databaseError(.statementFailed)
    }
    return statement
  }

  private func bind(_ values: [SQLiteValue], to statement: OpaquePointer) throws {
    for (offset, value) in values.enumerated() {
      let index = Int32(offset + 1)
      let result: Int32 =
        switch value {
        case .null: sqlite3_bind_null(statement, index)
        case .text(let value):
          sqlite3_bind_text(statement, index, value, -1, Self.sqliteTransient)
        case .int64(let value): sqlite3_bind_int64(statement, index, value)
        case .double(let value): sqlite3_bind_double(statement, index, value)
        case .blob(let value):
          value.withUnsafeBytes { bytes in
            sqlite3_bind_blob(
              statement, index, bytes.baseAddress, Int32(bytes.count), Self.sqliteTransient)
          }
        }
      guard result == SQLITE_OK else { throw databaseError(.executionFailed) }
    }
  }

  private enum ErrorKind { case statementFailed, executionFailed }

  private func databaseError(_ kind: ErrorKind) -> SampleLibraryDatabaseError {
    let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "database unavailable"
    return switch kind {
    case .statementFailed: .statementFailed(message)
    case .executionFailed: .executionFailed(message)
    }
  }

  private static let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)
}

private enum SQLiteValue {
  case null
  case text(String)
  case int64(Int64)
  case double(Double)
  case blob(Data)
}

private struct SQLiteRow {
  let values: [Value]

  init(statement: OpaquePointer) {
    values = (0..<sqlite3_column_count(statement)).map { index in
      switch sqlite3_column_type(statement, index) {
      case SQLITE_INTEGER: .int64(sqlite3_column_int64(statement, index))
      case SQLITE_FLOAT: .double(sqlite3_column_double(statement, index))
      case SQLITE_TEXT:
        .text(sqlite3_column_text(statement, index).map { String(cString: $0) } ?? "")
      case SQLITE_BLOB:
        if let bytes = sqlite3_column_blob(statement, index) {
          .blob(Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, index))))
        } else {
          .blob(Data())
        }
      default: .null
      }
    }
  }

  func text(_ index: Int) -> String { optionalText(index) ?? "" }
  func optionalText(_ index: Int) -> String? {
    if case .text(let value) = values[index] { value } else { nil }
  }
  func int(_ index: Int) -> Int { Int(int64(index)) }
  func optionalInt(_ index: Int) -> Int? { optionalInt64(index).map(Int.init) }
  func int64(_ index: Int) -> Int64 { optionalInt64(index) ?? 0 }
  func optionalInt64(_ index: Int) -> Int64? {
    if case .int64(let value) = values[index] { value } else { nil }
  }
  func optionalDouble(_ index: Int) -> Double? {
    switch values[index] {
    case .double(let value): value
    case .int64(let value): Double(value)
    default: nil
    }
  }
  func blob(_ index: Int) -> Data? {
    if case .blob(let value) = values[index] { value } else { nil }
  }

  enum Value {
    case null
    case text(String)
    case int64(Int64)
    case double(Double)
    case blob(Data)
  }
}
