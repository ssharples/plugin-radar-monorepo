import CryptoKit
import Foundation

public enum SessionContentCandidateParityDisposition: String, Codable, Sendable, Equatable {
  case guaranteed
  case boundedExhaustiveFallback
  case abstainedUnproven
}

public enum SessionContentCandidateFallbackDisposition: String, Codable, Sendable, Equatable {
  case notRequired
  case denseOverlap
  case unprovenSketchCoverage
  case safetyCeilingExceeded
}

public enum SessionContentCandidateIndexCacheDisposition: String, Codable, Sendable, Equatable {
  case rebuilt
  case reused
}

public struct SessionContentCandidateIndexLoadCounters: Codable, Sendable, Equatable {
  public let indexedCandidateCount: Int
  public let candidateSketchBuildCount: Int
  public let cacheCandidateValidationCount: Int
  public let cacheSketchValidationCount: Int
  public let cacheIdentityPostingValidationCount: Int
  public let cacheBandPostingValidationCount: Int
  public let cacheIntegrityCheckCount: Int
  public let cachePostingReconstructionCount: Int
  public let identityPostingBuildCount: Int
  public let bandPostingBuildCount: Int

  fileprivate init(indexedCandidateCount: Int, work: SessionContentCandidateIndexLoadWork) {
    self.indexedCandidateCount = indexedCandidateCount
    self.candidateSketchBuildCount = work.candidateSketchBuildCount
    self.cacheCandidateValidationCount = work.cacheCandidateValidationCount
    self.cacheSketchValidationCount = work.cacheSketchValidationCount
    self.cacheIdentityPostingValidationCount = work.cacheIdentityPostingValidationCount
    self.cacheBandPostingValidationCount = work.cacheBandPostingValidationCount
    self.cacheIntegrityCheckCount = work.cacheIntegrityCheckCount
    self.cachePostingReconstructionCount = work.cachePostingReconstructionCount
    self.identityPostingBuildCount = work.identityPostingBuildCount
    self.bandPostingBuildCount = work.bandPostingBuildCount
  }
}

public struct SessionContentCandidateGenerationWorkCounters: Codable, Sendable, Equatable {
  public let indexedCandidateCount: Int
  public let sourceIdentityLookupCount: Int
  public let identityPostingVisitCount: Int
  public let sourceSketchBandLookupCount: Int
  public let sketchPostingVisitCount: Int
  public let queryActiveCountLookupCount: Int
  public let queryExcludedWorkCountLookupCount: Int
  public let queryEntryLookupCount: Int
  public let queryEntryScanCount: Int
  public let estimatedCandidateCount: Int
  public let fullPoolExactIntersectionCount: Int
  public let postingVisitLimit: Int
  public let postingVisitLimitExceeded: Bool

  public init(
    indexedCandidateCount: Int,
    sourceIdentityLookupCount: Int,
    identityPostingVisitCount: Int,
    sourceSketchBandLookupCount: Int,
    sketchPostingVisitCount: Int,
    estimatedCandidateCount: Int,
    fullPoolExactIntersectionCount: Int,
    postingVisitLimit: Int,
    postingVisitLimitExceeded: Bool,
    queryActiveCountLookupCount: Int = 0,
    queryExcludedWorkCountLookupCount: Int = 0,
    queryEntryLookupCount: Int = 0,
    queryEntryScanCount: Int = 0
  ) {
    self.indexedCandidateCount = indexedCandidateCount
    self.sourceIdentityLookupCount = sourceIdentityLookupCount
    self.identityPostingVisitCount = identityPostingVisitCount
    self.sourceSketchBandLookupCount = sourceSketchBandLookupCount
    self.sketchPostingVisitCount = sketchPostingVisitCount
    self.queryActiveCountLookupCount = queryActiveCountLookupCount
    self.queryExcludedWorkCountLookupCount = queryExcludedWorkCountLookupCount
    self.queryEntryLookupCount = queryEntryLookupCount
    self.queryEntryScanCount = queryEntryScanCount
    self.estimatedCandidateCount = estimatedCandidateCount
    self.fullPoolExactIntersectionCount = fullPoolExactIntersectionCount
    self.postingVisitLimit = postingVisitLimit
    self.postingVisitLimitExceeded = postingVisitLimitExceeded
  }
}

public struct SessionContentCandidateGenerationMetadata: Codable, Sendable, Equatable {
  public let algorithmFamily: String
  public let algorithmVersion: String
  public let candidatePoolCount: Int
  public let shortlistedCandidateCount: Int
  public let exactComparisonCandidateCount: Int
  public let exactComparisonCandidateLimit: Int
  public let deterministicOverlapCandidateCount: Int
  public let sketchBandCandidateCount: Int
  public let exhaustiveFallbackUsed: Bool
  public let fallbackDisposition: SessionContentCandidateFallbackDisposition?
  public let parityDisposition: SessionContentCandidateParityDisposition?
  public let sourceManifestToken: String
  public let candidatePoolToken: String
  public let invalidationToken: String
  public let indexCacheDisposition: SessionContentCandidateIndexCacheDisposition?
  public let workCounters: SessionContentCandidateGenerationWorkCounters?

  public init(
    algorithmFamily: String,
    algorithmVersion: String,
    candidatePoolCount: Int,
    shortlistedCandidateCount: Int,
    exactComparisonCandidateCount: Int,
    exactComparisonCandidateLimit: Int,
    deterministicOverlapCandidateCount: Int,
    sketchBandCandidateCount: Int,
    exhaustiveFallbackUsed: Bool,
    fallbackDisposition: SessionContentCandidateFallbackDisposition = .notRequired,
    parityDisposition: SessionContentCandidateParityDisposition = .guaranteed,
    sourceManifestToken: String,
    candidatePoolToken: String,
    invalidationToken: String,
    indexCacheDisposition: SessionContentCandidateIndexCacheDisposition? = nil,
    workCounters: SessionContentCandidateGenerationWorkCounters? = nil
  ) {
    self.algorithmFamily = algorithmFamily
    self.algorithmVersion = algorithmVersion
    self.candidatePoolCount = candidatePoolCount
    self.shortlistedCandidateCount = shortlistedCandidateCount
    self.exactComparisonCandidateCount = exactComparisonCandidateCount
    self.exactComparisonCandidateLimit = exactComparisonCandidateLimit
    self.deterministicOverlapCandidateCount = deterministicOverlapCandidateCount
    self.sketchBandCandidateCount = sketchBandCandidateCount
    self.exhaustiveFallbackUsed = exhaustiveFallbackUsed
    self.fallbackDisposition = fallbackDisposition
    self.parityDisposition = parityDisposition
    self.sourceManifestToken = sourceManifestToken
    self.candidatePoolToken = candidatePoolToken
    self.invalidationToken = invalidationToken
    self.indexCacheDisposition = indexCacheDisposition
    self.workCounters = workCounters
  }
}

public struct SessionContentCandidateIndexCache: Codable, Sendable, Equatable {
  public let schemaVersion: Int
  public let algorithmFamily: String
  public let algorithmVersion: String
  public let resolverAlgorithmVersion: String
  public let eligibilityWeightVersion: String
  public let configurationToken: String
  public let candidatePoolToken: String
  public let integrityToken: String
  public let candidateCount: Int
  public let identityPostingCount: Int
  public let bandPostingCount: Int
  fileprivate let orderedCandidateKeys: [String]
  fileprivate let entriesByKey: [String: SessionContentCachedCandidateIndexEntry]
  fileprivate let identityPostings: [String: [String]]
  fileprivate let sketchBandPostings: [String: [String]]
  fileprivate let candidateKeysByWorkID: [String: [String]]
  fileprivate let candidateCountByWorkID: [String: Int]

  fileprivate init(
    algorithmFamily: String,
    algorithmVersion: String,
    resolverAlgorithmVersion: String,
    eligibilityWeightVersion: String,
    configurationToken: String,
    candidatePoolToken: String,
    orderedCandidateKeys: [String],
    entriesByKey: [String: SessionContentCachedCandidateIndexEntry],
    identityPostings: [String: [String]],
    sketchBandPostings: [String: [String]],
    candidateKeysByWorkID: [String: [String]],
    candidateCountByWorkID: [String: Int]
  ) {
    self.schemaVersion = 2
    self.algorithmFamily = algorithmFamily
    self.algorithmVersion = algorithmVersion
    self.resolverAlgorithmVersion = resolverAlgorithmVersion
    self.eligibilityWeightVersion = eligibilityWeightVersion
    self.configurationToken = configurationToken
    self.candidatePoolToken = candidatePoolToken
    self.candidateCount = orderedCandidateKeys.count
    self.identityPostingCount = identityPostings.values.reduce(0) { $0 + $1.count }
    self.bandPostingCount = sketchBandPostings.values.reduce(0) { $0 + $1.count }
    self.orderedCandidateKeys = orderedCandidateKeys
    self.entriesByKey = entriesByKey
    self.identityPostings = identityPostings
    self.sketchBandPostings = sketchBandPostings
    self.candidateKeysByWorkID = candidateKeysByWorkID
    self.candidateCountByWorkID = candidateCountByWorkID
    self.integrityToken = Self.integrityDigest(
      algorithmFamily: algorithmFamily,
      algorithmVersion: algorithmVersion,
      resolverAlgorithmVersion: resolverAlgorithmVersion,
      eligibilityWeightVersion: eligibilityWeightVersion,
      configurationToken: configurationToken,
      candidatePoolToken: candidatePoolToken,
      orderedCandidateKeys: orderedCandidateKeys,
      entriesByKey: entriesByKey,
      identityPostings: identityPostings,
      sketchBandPostings: sketchBandPostings,
      candidateKeysByWorkID: candidateKeysByWorkID,
      candidateCountByWorkID: candidateCountByWorkID)
  }

  fileprivate func hasValidIntegrityToken() -> Bool {
    integrityToken
      == Self.integrityDigest(
        algorithmFamily: algorithmFamily,
        algorithmVersion: algorithmVersion,
        resolverAlgorithmVersion: resolverAlgorithmVersion,
        eligibilityWeightVersion: eligibilityWeightVersion,
        configurationToken: configurationToken,
        candidatePoolToken: candidatePoolToken,
        orderedCandidateKeys: orderedCandidateKeys,
        entriesByKey: entriesByKey,
        identityPostings: identityPostings,
        sketchBandPostings: sketchBandPostings,
        candidateKeysByWorkID: candidateKeysByWorkID,
        candidateCountByWorkID: candidateCountByWorkID)
  }

  private static func integrityDigest(
    algorithmFamily: String,
    algorithmVersion: String,
    resolverAlgorithmVersion: String,
    eligibilityWeightVersion: String,
    configurationToken: String,
    candidatePoolToken: String,
    orderedCandidateKeys: [String],
    entriesByKey: [String: SessionContentCachedCandidateIndexEntry],
    identityPostings: [String: [String]],
    sketchBandPostings: [String: [String]],
    candidateKeysByWorkID: [String: [String]],
    candidateCountByWorkID: [String: Int]
  ) -> String {
    let entryTokens = orderedCandidateKeys.compactMap { key in
      entriesByKey[key].map { entry in
        canonical([
          key,
          entry.canonicalToken,
          canonical(
            entry.weightedIdentities.sorted { $0.key < $1.key }.map {
              canonical([$0.key, canonicalDouble($0.value)])
            }),
          canonicalDouble(entry.sketch.weightTotal),
          canonical(entry.sketch.signature.map(String.init)),
          canonical(entry.sketch.bands.map(String.init)),
        ])
      }
    }
    return sha256(
      canonical([
        "schema=2",
        algorithmFamily,
        algorithmVersion,
        resolverAlgorithmVersion,
        eligibilityWeightVersion,
        configurationToken,
        candidatePoolToken,
        canonical(orderedCandidateKeys),
        canonical(entryTokens),
        canonicalPostingMap(identityPostings),
        canonicalPostingMap(sketchBandPostings),
        canonicalPostingMap(candidateKeysByWorkID),
        canonical(
          candidateCountByWorkID.sorted { $0.key < $1.key }.map {
            canonical([$0.key, String($0.value)])
          }),
      ]))
  }
}

struct SessionContentLineageCandidateSelection: Sendable, Equatable {
  let candidates: [SessionLineageCandidate]
  let metadata: SessionContentCandidateGenerationMetadata
  let retrievalEvidence: [SessionContentCandidateRetrievalEvidence]
}

struct SessionContentCandidateRetrievalEvidence: Sendable, Equatable {
  let workID: String
  let sessionID: String
  let estimatedContainment: Double
  let bandMatchCount: Int
  let sharedIdentityCount: Int
}

struct SessionContentLineageCandidateGenerator: Sendable {
  static let algorithmFamily = "session-content-lineage-candidate-generation"
  static let algorithmVersion = "session-content-lineage-candidate-generation-v8"
  static let eligibilityWeightVersion =
    SessionContentLineageResolver.candidateGenerationEligibilityWeightVersion
  static let maximumSignatureCount = 256
  static let maximumBandSize = 64
  static let maximumExactComparisonLimit = 512
  static let maximumFallbackCandidateLimit = 4_096

  let signatureCount: Int
  let bandSize: Int
  let exhaustiveFallbackCandidateLimit: Int
  let maximumExactComparisonCandidates: Int

  init(
    signatureCount: Int = 32,
    bandSize: Int = 4,
    exhaustiveFallbackCandidateLimit: Int = 24,
    maximumExactComparisonCandidates: Int = 12
  ) {
    let clampedBandSize = clamped(bandSize, lower: 1, upper: Self.maximumBandSize)
    let clampedSignatureCount = clamped(
      signatureCount, lower: clampedBandSize, upper: Self.maximumSignatureCount)
    let normalizedSignatureCount =
      clampedSignatureCount
      - (clampedSignatureCount % clampedBandSize)
    self.bandSize = clampedBandSize
    self.signatureCount = max(clampedBandSize, normalizedSignatureCount)
    let exactLimit = clamped(
      maximumExactComparisonCandidates,
      lower: 2,
      upper: Self.maximumExactComparisonLimit)
    self.maximumExactComparisonCandidates = exactLimit
    self.exhaustiveFallbackCandidateLimit = max(
      exactLimit,
      clamped(
        exhaustiveFallbackCandidateLimit,
        lower: 2,
        upper: Self.maximumFallbackCandidateLimit))
  }

  func makeIndex(
    candidates: [SessionLineageCandidate],
    persistedCache: SessionContentCandidateIndexCache? = nil
  ) -> SessionContentLineageCandidateIndex {
    let canonicalCandidates = candidates.map { candidate in
      (candidate: candidate, token: canonicalCandidateToken(candidate))
    }.sorted {
      if $0.token != $1.token { return $0.token < $1.token }
      return canonicalCandidateBytes($0.candidate).lexicographicallyPrecedes(
        canonicalCandidateBytes($1.candidate))
    }
    let canonicalTokens = canonicalCandidates.map(\.token)
    let poolToken = sha256(canonical(canonicalTokens))
    let configurationToken = self.configurationToken()
    let validation = persistedCache.map {
      validate(
        cache: $0,
        canonicalCandidates: canonicalCandidates,
        poolToken: poolToken,
        configurationToken: configurationToken)
    }
    if let persistedCache, validation?.isValid == true {
      return SessionContentLineageCandidateIndex(
        generator: self,
        cacheDescriptor: persistedCache,
        currentEntriesByKey: currentEntries(
          cache: persistedCache, canonicalCandidates: canonicalCandidates),
        cacheDisposition: .reused,
        loadWork: validation?.work ?? .init())
    }

    let built = buildCache(
      canonicalCandidates: canonicalCandidates,
      poolToken: poolToken,
      configurationToken: configurationToken)
    var loadWork = validation?.work ?? .init()
    loadWork.candidateSketchBuildCount += built.work.candidateSketchBuildCount
    loadWork.identityPostingBuildCount += built.work.identityPostingBuildCount
    loadWork.bandPostingBuildCount += built.work.bandPostingBuildCount
    loadWork.cachePostingReconstructionCount += 1
    return SessionContentLineageCandidateIndex(
      generator: self,
      cacheDescriptor: built.cache,
      currentEntriesByKey: built.cache.entriesByKey,
      cacheDisposition: .rebuilt,
      loadWork: loadWork)
  }

  func generate(
    source: SessionContentManifest,
    sourceReference: StudioRevisionReference? = nil,
    sourceEvidenceRevisionReferences: [StudioRevisionReference] = [],
    sourceRevisionTimestamp: Date? = nil,
    candidates: [SessionLineageCandidate]
  ) -> SessionContentLineageCandidateSelection {
    makeIndex(candidates: candidates).generate(
      source: source,
      sourceReference: sourceReference,
      sourceEvidenceRevisionReferences: sourceEvidenceRevisionReferences,
      sourceRevisionTimestamp: sourceRevisionTimestamp)
  }

  fileprivate func weightedIdentities(in manifest: SessionContentManifest) -> [String: Double] {
    Dictionary(
      uniqueKeysWithValues: SessionContentLineageResolver.normalizedDecisionAnchors(in: manifest)
        .map { identity, anchor in
          (identity, SessionContentLineageResolver.candidateGenerationWeight(anchor))
        }.filter { $0.1 > 0 })
  }

  fileprivate func makeSketch(
    weightedIdentities: [String: Double]
  ) -> SessionContentWeightedMinHashSketch {
    let orderedWeights = weightedIdentities.sorted { $0.key < $1.key }
    let weightTotal = orderedWeights.reduce(0) { $0 + $1.value }
    guard !orderedWeights.isEmpty else {
      return SessionContentWeightedMinHashSketch(weightTotal: 0, signature: [], bands: [])
    }
    let signature = (0..<signatureCount).map { sampleIndex in
      weightedMinHashToken(weightedIdentities: orderedWeights, sampleIndex: sampleIndex)
    }
    let bands = stride(from: 0, to: signature.count, by: bandSize).map { offset in
      sha256UInt64(
        canonical(signature[offset..<min(signature.count, offset + bandSize)].map(String.init)))
    }
    return SessionContentWeightedMinHashSketch(
      weightTotal: weightTotal, signature: signature, bands: bands)
  }

  fileprivate func sourceManifestToken(
    _ manifest: SessionContentManifest,
    sourceReference: StudioRevisionReference? = nil,
    evidenceRevisionReferences: [StudioRevisionReference] = [],
    revisionTimestamp: Date? = nil
  ) -> String {
    manifestContextToken(
      manifest,
      reference: sourceReference,
      evidenceRevisionReferences: evidenceRevisionReferences,
      revisionTimestamp: revisionTimestamp)
  }

  fileprivate func canonicalCandidateToken(_ candidate: SessionLineageCandidate) -> String {
    sha256(
      canonical([
        candidate.workID,
        candidate.sessionID,
        candidate.artistID ?? "",
        manifestContextToken(
          candidate.manifest,
          reference: candidate.reviewRevisionReference,
          evidenceRevisionReferences: candidate.evidenceRevisionReferences,
          revisionTimestamp: candidate.revisionTimestamp),
      ]))
  }

  fileprivate func invalidationToken(
    sourceManifestToken: String,
    candidatePoolToken: String,
    excludedWorkID: String?
  ) -> String {
    sha256(
      canonical([
        Self.algorithmFamily,
        Self.algorithmVersion,
        SessionContentLineageResolver.algorithmFamily,
        SessionContentLineageResolver.algorithmVersion,
        Self.eligibilityWeightVersion,
        configurationToken(),
        sourceManifestToken,
        candidatePoolToken,
        excludedWorkID ?? "",
      ]))
  }

  fileprivate func estimate(
    entry: SessionContentCachedCandidateIndexEntry,
    sourceWeights: [String: Double],
    sourceSketch: SessionContentWeightedMinHashSketch
  ) -> SessionContentPreparedCandidate {
    let sharedIdentityCount = sourceWeights.keys.reduce(into: 0) { total, identity in
      if entry.weightedIdentities[identity] != nil { total += 1 }
    }
    let bandMatchCount = zip(sourceSketch.bands, entry.sketch.bands).reduce(into: 0) {
      total, pair in
      if pair.0 == pair.1 { total += 1 }
    }
    let equalityCount = zip(sourceSketch.signature, entry.sketch.signature).reduce(into: 0) {
      total, pair in
      if pair.0 == pair.1 { total += 1 }
    }
    let estimatedJaccard =
      sourceSketch.signature.isEmpty
      ? 0 : Double(equalityCount) / Double(sourceSketch.signature.count)
    let estimatedIntersection =
      estimatedJaccard > 0
      ? estimatedJaccard * (sourceSketch.weightTotal + entry.sketch.weightTotal)
        / (1 + estimatedJaccard)
      : 0
    return SessionContentPreparedCandidate(
      entry: entry,
      sharedIdentityCount: sharedIdentityCount,
      bandMatchCount: bandMatchCount,
      estimatedSourceContainsCandidate: entry.sketch.weightTotal > 0
        ? min(1, estimatedIntersection / entry.sketch.weightTotal) : 0,
      estimatedCandidateContainsSource: sourceSketch.weightTotal > 0
        ? min(1, estimatedIntersection / sourceSketch.weightTotal) : 0)
  }

  fileprivate func estimateSort(
    _ left: SessionContentPreparedCandidate,
    _ right: SessionContentPreparedCandidate
  ) -> Bool {
    let leftContainment = max(
      left.estimatedSourceContainsCandidate, left.estimatedCandidateContainsSource)
    let rightContainment = max(
      right.estimatedSourceContainsCandidate, right.estimatedCandidateContainsSource)
    if leftContainment != rightContainment { return leftContainment > rightContainment }
    if left.bandMatchCount != right.bandMatchCount {
      return left.bandMatchCount > right.bandMatchCount
    }
    if left.sharedIdentityCount != right.sharedIdentityCount {
      return left.sharedIdentityCount > right.sharedIdentityCount
    }
    let leftCandidate = left.entry.candidate
    let rightCandidate = right.entry.candidate
    if leftCandidate.workID != rightCandidate.workID
      || leftCandidate.sessionID != rightCandidate.sessionID
    {
      return sessionLineageCandidateIdentityPrecedes(
        workID: leftCandidate.workID,
        sessionID: leftCandidate.sessionID,
        otherWorkID: rightCandidate.workID,
        otherSessionID: rightCandidate.sessionID)
    }
    return left.entry.key < right.entry.key
  }

  private func buildCache(
    canonicalCandidates: [(candidate: SessionLineageCandidate, token: String)],
    poolToken: String,
    configurationToken: String
  ) -> (cache: SessionContentCandidateIndexCache, work: SessionContentCandidateIndexLoadWork) {
    var orderedKeys: [String] = []
    var entries: [String: SessionContentCachedCandidateIndexEntry] = [:]
    var identityPostings: [String: [String]] = [:]
    var bandPostings: [String: [String]] = [:]
    var workKeys: [String: [String]] = [:]
    var work = SessionContentCandidateIndexLoadWork()
    for (offset, item) in canonicalCandidates.enumerated() {
      let key = canonical([item.token, String(offset)])
      let weights = weightedIdentities(in: item.candidate.manifest)
      let sketch = makeSketch(weightedIdentities: weights)
      let entry = SessionContentCachedCandidateIndexEntry(
        key: key,
        candidate: item.candidate,
        canonicalToken: item.token,
        weightedIdentities: weights,
        sketch: sketch)
      orderedKeys.append(key)
      entries[key] = entry
      workKeys[item.candidate.workID, default: []].append(key)
      work.candidateSketchBuildCount += 1
      for identity in weights.keys.sorted() {
        identityPostings[identity, default: []].append(key)
        work.identityPostingBuildCount += 1
      }
      for (bandOffset, value) in sketch.bands.enumerated() {
        bandPostings[sketchBandKey(offset: bandOffset, value: value), default: []].append(key)
        work.bandPostingBuildCount += 1
      }
    }
    let sortedIdentityPostings = identityPostings.mapValues { $0.sorted() }
    let sortedBandPostings = bandPostings.mapValues { $0.sorted() }
    let sortedWorkKeys = workKeys.mapValues { $0.sorted() }
    return (
      SessionContentCandidateIndexCache(
        algorithmFamily: Self.algorithmFamily,
        algorithmVersion: Self.algorithmVersion,
        resolverAlgorithmVersion: SessionContentLineageResolver.algorithmVersion,
        eligibilityWeightVersion: Self.eligibilityWeightVersion,
        configurationToken: configurationToken,
        candidatePoolToken: poolToken,
        orderedCandidateKeys: orderedKeys,
        entriesByKey: entries,
        identityPostings: sortedIdentityPostings,
        sketchBandPostings: sortedBandPostings,
        candidateKeysByWorkID: sortedWorkKeys,
        candidateCountByWorkID: sortedWorkKeys.mapValues(\.count)),
      work
    )
  }

  private func validate(
    cache: SessionContentCandidateIndexCache,
    canonicalCandidates: [(candidate: SessionLineageCandidate, token: String)],
    poolToken: String,
    configurationToken: String
  ) -> SessionContentCandidateIndexValidation {
    var work = SessionContentCandidateIndexLoadWork()
    guard cache.schemaVersion == 2,
      cache.algorithmFamily == Self.algorithmFamily,
      cache.algorithmVersion == Self.algorithmVersion,
      cache.resolverAlgorithmVersion == SessionContentLineageResolver.algorithmVersion,
      cache.eligibilityWeightVersion == Self.eligibilityWeightVersion,
      cache.configurationToken == configurationToken,
      cache.candidatePoolToken == poolToken,
      cache.candidateCount == canonicalCandidates.count,
      cache.orderedCandidateKeys.count == canonicalCandidates.count,
      cache.entriesByKey.count == canonicalCandidates.count
    else { return .init(isValid: false, work: work) }

    var expectedWorkKeys: [String: [String]] = [:]
    var expectedIdentityPostingCount = 0
    var expectedBandPostingCount = 0
    for (offset, item) in canonicalCandidates.enumerated() {
      let expectedKey = canonical([item.token, String(offset)])
      work.cacheCandidateValidationCount += 1
      guard cache.orderedCandidateKeys[offset] == expectedKey,
        let entry = cache.entriesByKey[expectedKey],
        entry.key == expectedKey,
        entry.canonicalToken == item.token,
        canonicalCandidateToken(entry.candidate) == item.token
      else { return .init(isValid: false, work: work) }
      let weights = weightedIdentities(in: item.candidate.manifest)
      let sketch = makeSketch(weightedIdentities: weights)
      work.cacheSketchValidationCount += 1
      guard entry.weightedIdentities == weights, entry.sketch == sketch else {
        return .init(isValid: false, work: work)
      }
      expectedIdentityPostingCount += weights.count
      expectedBandPostingCount += sketch.bands.count
      expectedWorkKeys[item.candidate.workID, default: []].append(expectedKey)
    }
    expectedWorkKeys = expectedWorkKeys.mapValues { $0.sorted() }
    guard cache.candidateKeysByWorkID == expectedWorkKeys,
      cache.candidateCountByWorkID == expectedWorkKeys.mapValues(\.count),
      cache.identityPostingCount == expectedIdentityPostingCount,
      cache.bandPostingCount == expectedBandPostingCount
    else { return .init(isValid: false, work: work) }
    guard
      let validatedIdentityPostingCount = validatedPostingCount(
        cache.identityPostings,
        entriesByKey: cache.entriesByKey,
        validates: { identity, entry in entry.weightedIdentities[identity] != nil }),
      validatedIdentityPostingCount == expectedIdentityPostingCount
    else { return .init(isValid: false, work: work) }
    work.cacheIdentityPostingValidationCount = validatedIdentityPostingCount
    guard
      let validatedBandPostingCount = validatedPostingCount(
        cache.sketchBandPostings,
        entriesByKey: cache.entriesByKey,
        validates: { bandKey, entry in
          entry.sketch.bands.enumerated().contains {
            sketchBandKey(offset: $0.offset, value: $0.element) == bandKey
          }
        }),
      validatedBandPostingCount == expectedBandPostingCount
    else { return .init(isValid: false, work: work) }
    work.cacheBandPostingValidationCount = validatedBandPostingCount
    work.cacheIntegrityCheckCount += 1
    guard cache.hasValidIntegrityToken() else {
      return .init(isValid: false, work: work)
    }
    return .init(isValid: true, work: work)
  }

  private func currentEntries(
    cache: SessionContentCandidateIndexCache,
    canonicalCandidates: [(candidate: SessionLineageCandidate, token: String)]
  ) -> [String: SessionContentCachedCandidateIndexEntry] {
    var entries: [String: SessionContentCachedCandidateIndexEntry] = [:]
    entries.reserveCapacity(canonicalCandidates.count)
    for (offset, item) in canonicalCandidates.enumerated() {
      let key = canonical([item.token, String(offset)])
      guard let cached = cache.entriesByKey[key] else { continue }
      entries[key] = SessionContentCachedCandidateIndexEntry(
        key: key,
        candidate: item.candidate,
        canonicalToken: item.token,
        weightedIdentities: cached.weightedIdentities,
        sketch: cached.sketch)
    }
    return entries
  }

  private func validatedPostingCount(
    _ postings: [String: [String]],
    entriesByKey: [String: SessionContentCachedCandidateIndexEntry],
    validates: (String, SessionContentCachedCandidateIndexEntry) -> Bool
  ) -> Int? {
    var count = 0
    for (postingKey, keys) in postings {
      var previousKey: String?
      for key in keys {
        guard previousKey.map({ $0 < key }) ?? true,
          let entry = entriesByKey[key],
          validates(postingKey, entry)
        else { return nil }
        previousKey = key
        count += 1
      }
    }
    return count
  }

  private func configurationToken() -> String {
    sha256(
      canonical([
        "signatures=\(signatureCount)",
        "bandSize=\(bandSize)",
        "exactLimit=\(maximumExactComparisonCandidates)",
        "fallbackLimit=\(exhaustiveFallbackCandidateLimit)",
        "resolver=\(SessionContentLineageResolver.algorithmFamily):\(SessionContentLineageResolver.algorithmVersion)",
        "eligibility=\(Self.eligibilityWeightVersion)",
      ]))
  }

  private func manifestContextToken(
    _ manifest: SessionContentManifest,
    reference: StudioRevisionReference?,
    evidenceRevisionReferences: [StudioRevisionReference],
    revisionTimestamp: Date?
  ) -> String {
    sha256(
      canonical([
        manifest.sessionID,
        manifest.artistID ?? "",
        manifest.algorithmVersion,
        manifest.evidenceScope.rawValue,
        manifest.audioDurationPolicy.rawValue,
        canonicalDouble(manifest.measuredAudioDurationSeconds),
        manifest.selectedRevisionID ?? "",
        canonical(manifest.setRevisionIDs.sorted()),
        canonical(manifest.setRevisionContentIdentities.sorted()),
        canonical(manifest.anchors.map(anchorToken).sorted()),
        reference.map(revisionReferenceToken) ?? "",
        canonical(evidenceRevisionReferences.map(revisionReferenceToken).sorted()),
        canonicalDouble(revisionTimestamp?.timeIntervalSince1970),
      ]))
  }

  private func anchorToken(_ anchor: SessionContentAnchor) -> String {
    canonical([
      anchor.id,
      anchor.contentIdentity,
      anchor.kind.rawValue,
      canonicalDouble(anchor.arrangementPositionBeats),
      String(anchor.corpusFrequency),
      anchor.sourceMaterialIdentity ?? "",
      anchor.identityEvidence.rawValue,
      canonicalDouble(anchor.measuredAudioDurationSeconds),
    ])
  }

  private func revisionReferenceToken(_ reference: StudioRevisionReference) -> String {
    canonical([
      reference.workID,
      reference.sessionID,
      reference.revisionID,
      reference.setID,
      reference.setURL.standardizedFileURL.path,
      reference.trackedRootURL.standardizedFileURL.path,
      reference.contentObservation.reconstructedContentDigest,
      String(reference.contentObservation.compressedBytes),
      reference.contentObservation.modifiedAtNanoseconds.map(String.init) ?? "",
      reference.displaySnapshot.artistName,
      reference.displaySnapshot.workName,
      reference.displaySnapshot.sessionName,
      reference.displaySnapshot.revisionName,
      reference.catalogueAlgorithmVersion,
    ])
  }

  private func weightedMinHashToken(
    weightedIdentities: [(key: String, value: Double)], sampleIndex: Int
  ) -> UInt64 {
    var bestScore = Double.infinity
    var bestToken: UInt64 = 0
    for (identity, weight) in weightedIdentities where weight > 0 {
      var generator = SplitMix64(
        state: sha256UInt64(canonical([identity, "sample", String(sampleIndex)]))
          ^ 0x9E37_79B9_7F4A_7C15)
      let r = max(gamma2(&generator), Double.leastNonzeroMagnitude)
      let c = max(gamma2(&generator), Double.leastNonzeroMagnitude)
      let beta = min(max(generator.nextUnitDouble(), 0), 0.999_999_999_999_999_9)
      let t = floor(log(weight) / r + beta)
      let y = exp(r * (t - beta))
      let score = c / (y * exp(r))
      let token = sha256UInt64(canonical([identity, String(Int64(t))]))
      if score < bestScore || (score == bestScore && token < bestToken) {
        bestScore = score
        bestToken = token
      }
    }
    return bestToken
  }

  private func canonicalCandidateBytes(_ candidate: SessionLineageCandidate) -> Data {
    Data(
      canonical([
        candidate.workID,
        candidate.sessionID,
        candidate.artistID ?? "",
        manifestContextToken(
          candidate.manifest,
          reference: candidate.reviewRevisionReference,
          evidenceRevisionReferences: candidate.evidenceRevisionReferences,
          revisionTimestamp: candidate.revisionTimestamp),
      ]).utf8)
  }
}

struct SessionContentLineageCandidateIndex: Sendable {
  let generator: SessionContentLineageCandidateGenerator
  let candidatePoolToken: String
  let cacheDescriptor: SessionContentCandidateIndexCache
  let loadCounters: SessionContentCandidateIndexLoadCounters
  let cacheDisposition: SessionContentCandidateIndexCacheDisposition
  private let currentEntriesByKey: [String: SessionContentCachedCandidateIndexEntry]

  fileprivate init(
    generator: SessionContentLineageCandidateGenerator,
    cacheDescriptor: SessionContentCandidateIndexCache,
    currentEntriesByKey: [String: SessionContentCachedCandidateIndexEntry],
    cacheDisposition: SessionContentCandidateIndexCacheDisposition,
    loadWork: SessionContentCandidateIndexLoadWork
  ) {
    self.generator = generator
    self.candidatePoolToken = cacheDescriptor.candidatePoolToken
    self.cacheDescriptor = cacheDescriptor
    self.currentEntriesByKey = currentEntriesByKey
    self.loadCounters = SessionContentCandidateIndexLoadCounters(
      indexedCandidateCount: cacheDescriptor.candidateCount, work: loadWork)
    self.cacheDisposition = cacheDisposition
  }

  func generate(
    source: SessionContentManifest,
    sourceReference: StudioRevisionReference? = nil,
    sourceEvidenceRevisionReferences: [StudioRevisionReference] = [],
    sourceRevisionTimestamp: Date? = nil,
    excludingWorkID: String? = nil
  ) -> SessionContentLineageCandidateSelection {
    let sourceToken = generator.sourceManifestToken(
      source,
      sourceReference: sourceReference,
      evidenceRevisionReferences: sourceEvidenceRevisionReferences,
      revisionTimestamp: sourceRevisionTimestamp)
    let sourceWeights = generator.weightedIdentities(in: source)
    let sourceSketch = generator.makeSketch(weightedIdentities: sourceWeights)
    let excludedCount =
      excludingWorkID.flatMap {
        cacheDescriptor.candidateCountByWorkID[$0]
      } ?? 0
    let eligibleCount = cacheDescriptor.candidateCount - excludedCount
    var overlapKeys: Set<String> = []
    var bandKeys: Set<String> = []
    var identityPostingVisits = 0
    var sketchPostingVisits = 0
    var queryEntryLookups = 0
    let safetyPostingVisitLimit = generator.exhaustiveFallbackCandidateLimit + 1
    let postingVisitLimit =
      eligibleCount <= generator.exhaustiveFallbackCandidateLimit
      ? max(
        safetyPostingVisitLimit,
        saturatingMultiply(
          eligibleCount,
          max(sourceWeights.count, sourceSketch.bands.count)))
      : safetyPostingVisitLimit
    var identityPostingLimitExceeded = false
    identityLookup: for identity in sourceWeights.keys.sorted() {
      let posting = cacheDescriptor.identityPostings[identity] ?? []
      for key in posting {
        guard identityPostingVisits < postingVisitLimit else {
          identityPostingLimitExceeded = true
          break identityLookup
        }
        identityPostingVisits += 1
        queryEntryLookups += 1
        guard currentEntriesByKey[key]?.candidate.workID != excludingWorkID else {
          continue
        }
        overlapKeys.insert(key)
        if overlapKeys.count >= safetyPostingVisitLimit
          && eligibleCount > generator.exhaustiveFallbackCandidateLimit
        {
          identityPostingLimitExceeded = true
          break identityLookup
        }
      }
    }
    var sketchPostingLimitExceeded = false
    sketchLookup: for (offset, band) in sourceSketch.bands.enumerated() {
      let posting =
        cacheDescriptor.sketchBandPostings[
          sketchBandKey(offset: offset, value: band)
        ] ?? []
      for key in posting {
        guard sketchPostingVisits < postingVisitLimit else {
          sketchPostingLimitExceeded = true
          break sketchLookup
        }
        sketchPostingVisits += 1
        queryEntryLookups += 1
        guard currentEntriesByKey[key]?.candidate.workID != excludingWorkID else {
          continue
        }
        bandKeys.insert(key)
      }
    }
    let estimated = overlapKeys.compactMap { key -> SessionContentPreparedCandidate? in
      queryEntryLookups += 1
      return currentEntriesByKey[key].map {
        generator.estimate(entry: $0, sourceWeights: sourceWeights, sourceSketch: sourceSketch)
      }
    }.sorted(by: generator.estimateSort)
    let sketchOverlap = estimated.filter { bandKeys.contains($0.entry.key) }
    let sketchCoverageIsComplete =
      !sketchPostingLimitExceeded && overlapKeys.isSubset(of: bandKeys)
    let completeResolverUniverse = overlapKeys.count == eligibleCount
    let canEnumerateBoundedUniverse =
      cacheDescriptor.candidateCount <= generator.exhaustiveFallbackCandidateLimit
    var boundedUniverse: [SessionContentPreparedCandidate] = []
    if canEnumerateBoundedUniverse {
      boundedUniverse = cacheDescriptor.orderedCandidateKeys.compactMap { key in
        queryEntryLookups += 1
        guard let entry = currentEntriesByKey[key],
          entry.candidate.workID != excludingWorkID
        else { return nil }
        return generator.estimate(
          entry: entry, sourceWeights: sourceWeights, sourceSketch: sourceSketch)
      }.sorted(by: generator.estimateSort)
    }

    let bounded: [SessionContentPreparedCandidate]
    let shortlist: [SessionContentPreparedCandidate]
    let parity: SessionContentCandidateParityDisposition
    let fallback: SessionContentCandidateFallbackDisposition
    let fallbackUsed: Bool
    let exactLimit: Int
    if identityPostingLimitExceeded {
      bounded = []
      shortlist = sketchOverlap
      parity = .abstainedUnproven
      fallback = .safetyCeilingExceeded
      fallbackUsed = false
      exactLimit = generator.exhaustiveFallbackCandidateLimit
    } else if eligibleCount == 0 {
      bounded = []
      shortlist = []
      parity = .guaranteed
      fallback = .notRequired
      fallbackUsed = false
      exactLimit = generator.maximumExactComparisonCandidates
    } else if completeResolverUniverse && sketchCoverageIsComplete
      && sketchOverlap.count <= generator.maximumExactComparisonCandidates
    {
      bounded = sketchOverlap
      shortlist = sketchOverlap
      parity = .guaranteed
      fallback = .notRequired
      fallbackUsed = false
      exactLimit = generator.maximumExactComparisonCandidates
    } else if eligibleCount <= generator.exhaustiveFallbackCandidateLimit
      && canEnumerateBoundedUniverse
    {
      bounded = boundedUniverse
      shortlist = boundedUniverse
      parity = .boundedExhaustiveFallback
      fallback =
        completeResolverUniverse && estimated.allSatisfy { $0.bandMatchCount > 0 }
        ? .denseOverlap : .unprovenSketchCoverage
      fallbackUsed = true
      exactLimit = generator.exhaustiveFallbackCandidateLimit
    } else {
      bounded = []
      shortlist = sketchOverlap
      parity = .abstainedUnproven
      fallback = completeResolverUniverse ? .safetyCeilingExceeded : .unprovenSketchCoverage
      fallbackUsed = false
      exactLimit = generator.exhaustiveFallbackCandidateLimit
    }
    let counters = SessionContentCandidateGenerationWorkCounters(
      indexedCandidateCount: cacheDescriptor.candidateCount,
      sourceIdentityLookupCount: sourceWeights.count,
      identityPostingVisitCount: identityPostingVisits,
      sourceSketchBandLookupCount: sourceSketch.bands.count,
      sketchPostingVisitCount: sketchPostingVisits,
      estimatedCandidateCount: estimated.count + (fallbackUsed ? boundedUniverse.count : 0),
      fullPoolExactIntersectionCount: 0,
      postingVisitLimit: postingVisitLimit,
      postingVisitLimitExceeded: identityPostingLimitExceeded || sketchPostingLimitExceeded,
      queryActiveCountLookupCount: 1,
      queryExcludedWorkCountLookupCount: excludingWorkID == nil ? 0 : 1,
      queryEntryLookupCount: queryEntryLookups,
      queryEntryScanCount: 0)
    let metadata = SessionContentCandidateGenerationMetadata(
      algorithmFamily: SessionContentLineageCandidateGenerator.algorithmFamily,
      algorithmVersion: SessionContentLineageCandidateGenerator.algorithmVersion,
      candidatePoolCount: eligibleCount,
      shortlistedCandidateCount: shortlist.count,
      exactComparisonCandidateCount: bounded.count,
      exactComparisonCandidateLimit: exactLimit,
      deterministicOverlapCandidateCount: overlapKeys.count,
      sketchBandCandidateCount: bandKeys.intersection(overlapKeys).count,
      exhaustiveFallbackUsed: fallbackUsed,
      fallbackDisposition: fallback,
      parityDisposition: parity,
      sourceManifestToken: sourceToken,
      candidatePoolToken: candidatePoolToken,
      invalidationToken: generator.invalidationToken(
        sourceManifestToken: sourceToken,
        candidatePoolToken: candidatePoolToken,
        excludedWorkID: excludingWorkID),
      indexCacheDisposition: cacheDisposition,
      workCounters: counters)
    return SessionContentLineageCandidateSelection(
      candidates: bounded.map(\.entry.candidate),
      metadata: metadata,
      retrievalEvidence: shortlist.map(\.retrievalEvidence))
  }
}

private struct SessionContentCandidateIndexValidation {
  let isValid: Bool
  let work: SessionContentCandidateIndexLoadWork
}

private struct SessionContentCandidateIndexLoadWork: Sendable {
  var candidateSketchBuildCount = 0
  var cacheCandidateValidationCount = 0
  var cacheSketchValidationCount = 0
  var cacheIdentityPostingValidationCount = 0
  var cacheBandPostingValidationCount = 0
  var cacheIntegrityCheckCount = 0
  var cachePostingReconstructionCount = 0
  var identityPostingBuildCount = 0
  var bandPostingBuildCount = 0
}

private struct SessionContentCachedCandidateIndexEntry: Codable, Sendable, Equatable {
  let key: String
  let candidate: SessionLineageCandidate
  let canonicalToken: String
  let weightedIdentities: [String: Double]
  let sketch: SessionContentWeightedMinHashSketch
}

private struct SessionContentPreparedCandidate {
  let entry: SessionContentCachedCandidateIndexEntry
  let sharedIdentityCount: Int
  let bandMatchCount: Int
  let estimatedSourceContainsCandidate: Double
  let estimatedCandidateContainsSource: Double

  var retrievalEvidence: SessionContentCandidateRetrievalEvidence {
    SessionContentCandidateRetrievalEvidence(
      workID: entry.candidate.workID,
      sessionID: entry.candidate.sessionID,
      estimatedContainment: max(
        estimatedSourceContainsCandidate, estimatedCandidateContainsSource),
      bandMatchCount: bandMatchCount,
      sharedIdentityCount: sharedIdentityCount)
  }
}

private struct SessionContentWeightedMinHashSketch: Codable, Sendable, Equatable {
  let weightTotal: Double
  let signature: [UInt64]
  let bands: [UInt64]
}

private struct SplitMix64 {
  var state: UInt64

  mutating func next() -> UInt64 {
    state &+= 0x9E37_79B9_7F4A_7C15
    var value = state
    value = (value ^ (value >> 30)) &* 0xBF58_476D_1CE4_E5B9
    value = (value ^ (value >> 27)) &* 0x94D0_49BB_1331_11EB
    return value ^ (value >> 31)
  }

  mutating func nextUnitDouble() -> Double {
    Double(next() >> 11) / Double(1 << 53)
  }
}

private func gamma2(_ generator: inout SplitMix64) -> Double {
  let first = max(generator.nextUnitDouble(), Double.leastNonzeroMagnitude)
  let second = max(generator.nextUnitDouble(), Double.leastNonzeroMagnitude)
  return -log(first * second)
}

private func sketchBandKey(offset: Int, value: UInt64) -> String {
  canonical([String(offset), String(format: "%016llx", value)])
}

private func canonicalPostingMap(_ postings: [String: [String]]) -> String {
  canonical(postings.sorted { $0.key < $1.key }.map { canonical([$0.key, canonical($0.value)]) })
}

private func canonical(_ fields: [String]) -> String {
  fields.map { "\($0.utf8.count):\($0)" }.joined()
}

private func canonicalDouble(_ value: Double?) -> String {
  value.map { canonicalDouble($0) } ?? ""
}

private func canonicalDouble(_ value: Double) -> String {
  String(format: "%016llx", value.bitPattern)
}

private func sha256(_ value: String) -> String {
  SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
}

private func sha256UInt64(_ value: String) -> UInt64 {
  SHA256.hash(data: Data(value.utf8)).prefix(8).reduce(0) { ($0 << 8) | UInt64($1) }
}

private func clamped(_ value: Int, lower: Int, upper: Int) -> Int {
  min(max(value, lower), upper)
}

private func saturatingMultiply(_ left: Int, _ right: Int) -> Int {
  let (product, overflow) = left.multipliedReportingOverflow(by: right)
  return overflow ? Int.max : product
}
