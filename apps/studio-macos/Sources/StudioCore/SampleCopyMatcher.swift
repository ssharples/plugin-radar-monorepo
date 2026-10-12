import CryptoKit
import Foundation

public struct SampleCopyMatcher: Sendable {
  public init() {}

  public func verifyCandidates(
    for sampleID: String,
    database: SampleLibraryDatabase,
    lineageStore: AudioLineageStore? = nil
  ) throws -> [SampleMatchReview] {
    guard let selected = try database.sampleMatchIdentity(for: sampleID),
      FileManager.default.fileExists(atPath: selected.url.path)
    else { return try database.matchReviews(for: sampleID) }
    let candidates = try database.exactMatchCandidates(for: sampleID)
    guard !candidates.isEmpty else { return [] }

    let selectedQuick = try selected.quickDigest ?? quickDigest(selected.url)
    try database.saveDigests(sampleID: sampleID, quickDigest: selectedQuick, fullSHA256: nil)
    for candidate in candidates {
      let ambiguousID = StableID.forValue("sample-evidence:possible:\(sampleID):\(candidate.id)")
      try database.saveEvidence(
        SampleFamilyEvidence(
          id: ambiguousID, sourceSampleID: sampleID, targetSampleID: candidate.id,
          relationship: .possibleSourceOf, score: 0.35,
          tier: .filenameFolderTimeSimilarity,
          explanation:
            "Same byte size. This is a candidate only until staged content verification succeeds; filenames may differ after collection or consolidation.",
          algorithmVersion: "samples-copy-v1"))
      let candidateQuick = try candidate.quickDigest ?? quickDigest(candidate.url)
      try database.saveDigests(
        sampleID: candidate.id, quickDigest: candidateQuick, fullSHA256: nil)
      guard candidateQuick == selectedQuick else { continue }

      let selectedSHA = try selected.fullSHA256 ?? fullDigest(selected.url)
      let candidateSHA = try candidate.fullSHA256 ?? fullDigest(candidate.url)
      try database.saveDigests(
        sampleID: sampleID, quickDigest: selectedQuick, fullSHA256: selectedSHA)
      try database.saveDigests(
        sampleID: candidate.id, quickDigest: candidateQuick, fullSHA256: candidateSHA)
      guard candidateSHA == selectedSHA else { continue }

      if let lineageStore {
        let identityService = AudioContentIdentityService()
        let selectedIdentity = try identityService.identify(selected.url, decodeAudio: false)
        let candidateIdentity = try identityService.identify(candidate.url, decodeAudio: false)
        _ = try lineageStore.register(
          selectedIdentity,
          provenance: lineageProvenance(selected.classification),
          provenanceExplanation: "Imported from the Samples index after verified identity.")
        _ = try lineageStore.register(
          candidateIdentity,
          provenance: lineageProvenance(candidate.classification),
          provenanceExplanation: "Imported from the Samples index after verified identity.")
        try lineageStore.save(
          AudioLineageEdge(
            id: StableID.forValue("audio-exact:\(sampleID):\(candidate.id)"),
            sourceNodeID: sampleID,
            targetNodeID: candidate.id,
            relationship: .exactBytes,
            confidence: .verifiedIdentity,
            explanation: "Full SHA-256 verified identical file bytes.",
            algorithmVersion: "samples-copy-v1",
            evidence: [
              AudioMatchEvidence(
                kind: .byteHash, score: 1,
                explanation: "Both complete byte streams have the same SHA-256 digest.")
            ]))
      }

      let exactID = StableID.forValue("sample-evidence:exact:\(sampleID):\(candidate.id)")
      try database.saveEvidence(
        SampleFamilyEvidence(
          id: exactID, sourceSampleID: sampleID, targetSampleID: candidate.id,
          relationship: .exactDuplicateOf, score: 1,
          tier: .stagedExactHash,
          explanation: "Quick digests matched and full SHA-256 verified identical file bytes.",
          algorithmVersion: "samples-copy-v1"))
      if selected.classification == .projectImported,
        candidate.classification == .externalLibraryOriginal
      {
        try saveCollectedCopyEvidence(
          collectedSampleID: sampleID, externalSampleID: candidate.id, database: database)
        try database.markCollectedCopy(sampleID: sampleID, externalSampleID: candidate.id)
      } else if candidate.classification == .projectImported,
        selected.classification == .externalLibraryOriginal
      {
        try saveCollectedCopyEvidence(
          collectedSampleID: candidate.id, externalSampleID: sampleID, database: database)
        try database.markCollectedCopy(sampleID: candidate.id, externalSampleID: sampleID)
      }
    }
    return try database.matchReviews(for: sampleID)
  }

  private func lineageProvenance(_ classification: SampleClassification)
    -> AudioLocationProvenance
  {
    switch classification {
    case .externalLibraryOriginal: .externalLibrary
    case .projectRecorded: .projectRecorded
    case .projectImported, .collectedProjectCopy: .projectCollected
    case .projectProcessed: .projectProcessed
    case .looseUnassigned: .loose
    case .missingReference: .unknown
    }
  }

  private func saveCollectedCopyEvidence(
    collectedSampleID: String,
    externalSampleID: String,
    database: SampleLibraryDatabase
  ) throws {
    try database.saveEvidence(
      SampleFamilyEvidence(
        id: StableID.forValue(
          "sample-evidence:collected:\(collectedSampleID):\(externalSampleID)"),
        sourceSampleID: collectedSampleID,
        targetSampleID: externalSampleID,
        relationship: .collectedCopyOf,
        score: 1,
        tier: .stagedExactHash,
        explanation:
          "Verified byte-identical project copy linked to the selected external-library resource; this does not claim which physical file historically came first.",
        algorithmVersion: "samples-copy-v1"))
  }

  private func quickDigest(_ url: URL, chunkSize: Int = 64 * 1_024) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    let size = try handle.seekToEnd()
    try handle.seek(toOffset: 0)
    var hasher = SHA256()
    hasher.update(data: try handle.read(upToCount: chunkSize) ?? Data())
    if size > UInt64(chunkSize) {
      try handle.seek(toOffset: max(UInt64(chunkSize), size - UInt64(chunkSize)))
      hasher.update(data: try handle.read(upToCount: chunkSize) ?? Data())
    }
    var byteCount = size.littleEndian
    withUnsafeBytes(of: &byteCount) { hasher.update(bufferPointer: $0) }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
  }

  private func fullDigest(_ url: URL, chunkSize: Int = 1_024 * 1_024) throws -> String {
    try FileContentDigest.sha256(fileURL: url, chunkSize: chunkSize)
  }
}
