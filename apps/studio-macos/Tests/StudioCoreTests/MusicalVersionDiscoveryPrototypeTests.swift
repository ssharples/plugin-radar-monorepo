import AVFoundation
import Foundation
import Testing

@testable import StudioCore

@Suite("Musical-version discovery research prototype")
struct MusicalVersionDiscoveryPrototypeTests {
  @Test("Capability is unavailable by default and recall requires deterministic search")
  func unavailableByDefaultAndReceiptRequired() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 6)

    let research = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      research,
      assets: [MusicalVersionDiscoveryAsset(assetID: "target", fileURL: target)])
    let request = MusicalVersionDiscoveryRequest(
      queryAssetID: "query",
      queryURL: query,
      semanticQuery: "unknown title",
      deterministicResultAssetIDs: [],
      deterministicSearchGeneration: "catalogue-1",
      receipt: nil)

    #expect(
      await LocalMusicalVersionDiscoveryPrototype().recall(request, in: index)
        == .abstained(.capabilityUnavailable))
    #expect(await research.recall(request, in: index) == .abstained(.missingSearchReceipt))
  }

  @Test("Alternate full recordings are labelled for manual confirmation only")
  func findsAlternateFullRecording() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let alternate = root.appending(path: "alternate.aiff")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 8, gain: 0.9)
    try TestSupport.writeGeneratedAudio(
      to: alternate,
      sampleRate: 48_000,
      signalDuration: 8,
      gain: 0.45,
      channels: 2,
      bitDepth: 16,
      transform: .pitchShifted(semitones: 2))

    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      prototype,
      assets: [MusicalVersionDiscoveryAsset(assetID: "alternate", fileURL: alternate)])
    let request = makeRequest(queryURL: query)
    let result = try #require(try await results(prototype.recall(request, in: index)).only)

    #expect(result.label == "Musically related")
    #expect(result.targetAssetID == "alternate")
    #expect(result.manualConfirmationState == .required)
    #expect(result.sourceRange.durationSeconds >= 7)
    #expect(result.targetRange.durationSeconds >= 7)
    #expect(result.sourceObservation.contentSHA256.count == 64)
    #expect(result.targetObservation.contentSHA256.count == 64)
    #expect(result.scoreDistribution.maximum >= result.scoreDistribution.minimum)
    #expect(result.coverage >= 0.8)
    #expect(result.runnerUpMargin >= 0.05)
    #expect(result.resourceUsage.candidateCount == 1)
    #expect(result.resourceUsage.bytesScanned > 0)
    #expect(result.resourceUsage.comparedSegmentPairs > 0)
    #expect(
      result.resourceUsage.comparedSegmentPairs
        <= result.resourceUsage.comparedSegmentPairUpperBound)
    #expect(
      result.resourceUsage.workingMemoryUpperBoundBytes
        == max(
          result.resourceUsage.sourceExtractionPeakWorkingMemoryUpperBoundBytes,
          result.resourceUsage.sourceWorkingMemoryUpperBoundBytes
            + result.resourceUsage.persistentIndexWorkingMemoryUpperBoundBytes
            + result.resourceUsage.comparisonWorkingMemoryUpperBoundBytes))
    #expect(
      result.resourceUsage.sourceExtractionPeakWorkingMemoryUpperBoundBytes
        == result.resourceUsage.persistentIndexWorkingMemoryUpperBoundBytes
        + result.resourceUsage.sourceExtractionRetainedWorkingMemoryUpperBoundBytes
        + result.resourceUsage.sourceExtractionTransientWorkingMemoryUpperBoundBytes)
    #expect(
      result.resourceUsage.workingMemoryUpperBoundBytes
        <= prototype.configuration.maximumWorkingMemoryBytes)
    #expect(result.algorithmVersion == LocalMusicalVersionDiscoveryPrototype.algorithmVersion)
    #expect(result.indexVersion == MusicalVersionDiscoveryIndex.indexVersion)
  }

  @Test("Receipt is bound to query, deterministic results, and catalogue generation")
  func receiptBinding() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 6)
    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      prototype,
      assets: [MusicalVersionDiscoveryAsset(assetID: "target", fileURL: target)])
    let valid = makeRequest(queryURL: query)
    let wrongReceipt = MusicalVersionDeterministicSearchCompletion.issue(
      query: "different query",
      deterministicResultAssetIDs: [],
      searchGeneration: "catalogue-1")
    let wrong = MusicalVersionDiscoveryRequest(
      queryAssetID: valid.queryAssetID,
      queryURL: valid.queryURL,
      semanticQuery: valid.semanticQuery,
      deterministicResultAssetIDs: valid.deterministicResultAssetIDs,
      deterministicSearchGeneration: valid.deterministicSearchGeneration,
      receipt: wrongReceipt)

    #expect(await prototype.recall(wrong, in: index) == .abstained(.searchReceiptMismatch))
    let resultReceipt = MusicalVersionDeterministicSearchCompletion.issue(
      query: valid.semanticQuery,
      deterministicResultAssetIDs: ["exact-result"],
      searchGeneration: valid.deterministicSearchGeneration)
    let wrongResults = MusicalVersionDiscoveryRequest(
      queryAssetID: valid.queryAssetID,
      queryURL: valid.queryURL,
      semanticQuery: valid.semanticQuery,
      deterministicResultAssetIDs: valid.deterministicResultAssetIDs,
      deterministicSearchGeneration: valid.deterministicSearchGeneration,
      receipt: resultReceipt)
    #expect(
      await prototype.recall(wrongResults, in: index) == .abstained(.searchReceiptMismatch))
    let generationReceipt = MusicalVersionDeterministicSearchCompletion.issue(
      query: valid.semanticQuery,
      deterministicResultAssetIDs: valid.deterministicResultAssetIDs,
      searchGeneration: "catalogue-2")
    let wrongGeneration = MusicalVersionDiscoveryRequest(
      queryAssetID: valid.queryAssetID,
      queryURL: valid.queryURL,
      semanticQuery: valid.semanticQuery,
      deterministicResultAssetIDs: valid.deterministicResultAssetIDs,
      deterministicSearchGeneration: valid.deterministicSearchGeneration,
      receipt: generationReceipt)
    #expect(
      await prototype.recall(wrongGeneration, in: index) == .abstained(.searchReceiptMismatch))
    #expect(try await results(prototype.recall(valid, in: index)).count == 1)
  }

  @Test("A segment-level version locates both query and target ranges")
  func findsSegmentVersion() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "segment.wav")
    let target = root.appending(path: "full.wav")
    try TestSupport.writeGeneratedAudio(
      to: query,
      signalDuration: 5,
      sourceOffset: 2,
      gain: 0.65)
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 10, gain: 0.9)

    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      prototype,
      assets: [MusicalVersionDiscoveryAsset(assetID: "full", fileURL: target)])
    let result = try #require(
      try await results(prototype.recall(makeRequest(queryURL: query), in: index)).only)

    #expect(result.sourceRange.startSeconds < 0.6)
    #expect(result.sourceRange.durationSeconds >= 4.5)
    #expect(abs(result.targetRange.startSeconds - 2) <= 0.75)
    #expect(result.targetRange.durationSeconds >= 4.5)
  }

  @Test("Unrelated recordings and close ties abstain")
  func unrelatedAndAmbiguousAbstain() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let unrelated = root.appending(path: "unrelated.wav")
    let tieA = root.appending(path: "tie-a.wav")
    let tieB = root.appending(path: "tie-b.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 7)
    try TestSupport.writeGeneratedAudio(
      to: unrelated,
      signalDuration: 7,
      transform: .unrelated)
    try TestSupport.writeGeneratedAudio(to: tieA, signalDuration: 7, gain: 0.6)
    try TestSupport.writeGeneratedAudio(to: tieB, signalDuration: 7, gain: 0.4)
    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let unrelatedIndex = try await builtIndex(
      prototype,
      assets: [MusicalVersionDiscoveryAsset(assetID: "unrelated", fileURL: unrelated)])
    let tiedIndex = try await builtIndex(
      prototype,
      assets: [
        MusicalVersionDiscoveryAsset(assetID: "tie-b", fileURL: tieB),
        MusicalVersionDiscoveryAsset(assetID: "tie-a", fileURL: tieA),
      ])

    #expect(
      await prototype.recall(makeRequest(queryURL: query), in: unrelatedIndex)
        == .abstained(.belowResearchThreshold))
    #expect(
      await prototype.recall(makeRequest(queryURL: query), in: tiedIndex)
        == .abstained(.ambiguous))
  }

  @Test("Repeated sections in one candidate abstain as ambiguous")
  func repeatedSectionAbstains() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let repeated = root.appending(path: "repeated.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 3)
    try writeRepeatedAudio(sourceURL: query, destinationURL: repeated, gapSeconds: 2)
    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      prototype,
      assets: [MusicalVersionDiscoveryAsset(assetID: "repeated", fileURL: repeated)])

    #expect(
      await prototype.recall(makeRequest(queryURL: query), in: index)
        == .abstained(.ambiguous))
  }

  @Test("Source and target mutation invalidate immutable observations")
  func mutationAbstains() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let source = root.appending(path: "source.wav")
    let target = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: source, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 6, gain: 0.6)
    let builder = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      builder,
      assets: [MusicalVersionDiscoveryAsset(assetID: "target", fileURL: target)])

    let sourceMutating = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
      postQueryAnalysisHook: { url in
        try TestSupport.replaceWithGeneratedAudio(
          at: url,
          signalDuration: 6,
          transform: .unrelated)
      })
    #expect(
      await sourceMutating.recall(makeRequest(queryURL: source), in: index)
        == .abstained(.staleSource))

    try TestSupport.writeGeneratedAudio(to: source, signalDuration: 6)
    let targetMutating = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
      beforeFinalValidationHook: { url in
        try TestSupport.replaceWithGeneratedAudio(
          at: url,
          signalDuration: 6,
          transform: .unrelated)
      })
    #expect(
      await targetMutating.recall(makeRequest(queryURL: source), in: index)
        == .abstained(.staleTarget))
  }

  @Test("A stale runner-up invalidates recall before it can affect ambiguity")
  func staleRunnerUpAbstains() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let source = root.appending(path: "source.wav")
    let best = root.appending(path: "best.wav")
    let runnerUp = root.appending(path: "runner-up.wav")
    try TestSupport.writeGeneratedAudio(to: source, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: best, signalDuration: 6, gain: 0.6)
    try TestSupport.writeGeneratedAudio(
      to: runnerUp,
      signalDuration: 6,
      transform: .unrelated)
    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      prototype,
      assets: [
        MusicalVersionDiscoveryAsset(assetID: "best", fileURL: best),
        MusicalVersionDiscoveryAsset(assetID: "runner-up", fileURL: runnerUp),
      ])
    try TestSupport.replaceWithGeneratedAudio(
      at: runnerUp,
      signalDuration: 6,
      transform: .reference)

    #expect(
      await prototype.recall(makeRequest(queryURL: source), in: index)
        == .abstained(.staleTarget))
  }

  @Test("Index encoding is insertion-independent and reloads cross-instance")
  func deterministicPersistence() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let first = root.appending(path: "first.wav")
    let second = root.appending(path: "second.wav")
    try TestSupport.writeGeneratedAudio(to: first, signalDuration: 4)
    try TestSupport.writeGeneratedAudio(
      to: second,
      signalDuration: 4,
      transform: .pitchShifted(semitones: 3))
    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let assets = [
      MusicalVersionDiscoveryAsset(assetID: "first", fileURL: first),
      MusicalVersionDiscoveryAsset(assetID: "second", fileURL: second),
    ]
    let forward = try await builtIndex(prototype, assets: assets)
    let reverse = try await builtIndex(prototype, assets: Array(assets.reversed()))
    let storage = root.appending(path: "musical-version.index.json")

    #expect(try forward.encoded() == reverse.encoded())
    try forward.write(to: storage)
    let loaded = try MusicalVersionDiscoveryIndex.load(from: storage)
    #expect(loaded == forward)
    #expect(loaded.assetCount == 2)
    #expect(try loaded.encoded() == forward.encoded())
  }

  @Test("An exact-bound asset identifier reloads and recalls cross-instance")
  func exactStringBoundReloadsAndRecalls() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    let storage = root.appending(path: "exact-bound.index.json")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 5)
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 5, gain: 0.6)
    let exactBoundID = String(
      repeating: "a",
      count: MusicalVersionDiscoveryIndex.hardMaximumAssetIDUTF8Bytes)
    let builder = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      builder,
      assets: [MusicalVersionDiscoveryAsset(assetID: exactBoundID, fileURL: target)])
    try index.write(to: storage)

    let loaded = try MusicalVersionDiscoveryIndex.load(from: storage)
    let result = try #require(
      try await results(builder.recall(makeRequest(queryURL: query), in: loaded)).only)
    #expect(result.targetAssetID == exactBoundID)
    #expect(
      loaded.residentWorkingMemoryUpperBoundBytes == index.residentWorkingMemoryUpperBoundBytes)
  }

  @Test("Checksum-valid oversized strings and malformed URLs fail closed")
  func persistedVariableFieldBounds() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let oversizedAssetID = String(
      repeating: "a",
      count: MusicalVersionDiscoveryIndex.hardMaximumAssetIDUTF8Bytes + 1)
    let oversizedPath =
      "/"
      + String(
        repeating: "p",
        count: MusicalVersionDiscoveryIndex.hardMaximumFilePathUTF8Bytes)
    let oversizedResourceIdentity = String(
      repeating: "r",
      count: MusicalVersionDiscoveryIndex.hardMaximumResourceIdentityUTF8Bytes + 1)
    let hostileEntries = [
      syntheticIndexedAsset(assetID: oversizedAssetID, segmentCount: 2),
      syntheticIndexedAsset(
        assetID: "oversized-path",
        segmentCount: 2,
        fileURL: URL(fileURLWithPath: oversizedPath)),
      syntheticIndexedAsset(
        assetID: "oversized-resource",
        segmentCount: 2,
        resourceIdentity: oversizedResourceIdentity),
      syntheticIndexedAsset(
        assetID: "non-file",
        segmentCount: 2,
        fileURL: URL(string: "https://example.invalid/audio.wav")),
      replacingEmbeddingVersions(
        in: syntheticIndexedAsset(assetID: "bad-version", segmentCount: 2),
        with: String(
          repeating: "v",
          count: MusicalVersionDiscoveryIndex.hardMaximumAssetIDUTF8Bytes + 1)),
    ]

    for (index, hostile) in hostileEntries.enumerated() {
      let storage = root.appending(path: "hostile-\(index).index.json")
      try MusicalVersionDiscoveryIndex.checksumValidEncodedFixture(entries: [hostile]).write(
        to: storage)
      #expect(throws: MusicalVersionDiscoveryIndexError.self) {
        try MusicalVersionDiscoveryIndex.load(from: storage)
      }
    }

    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    #expect(
      await prototype.buildIndex(
        assets: [
          MusicalVersionDiscoveryAsset(
            assetID: oversizedAssetID,
            fileURL: root.appending(path: "not-read.wav"))
        ])
        == .abstained(.invalidAssetMetadata))
  }

  @Test("Authenticated memory claims are recomputed from every retained field")
  func persistedMemoryClaimsAreRecomputed() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let maximumResourceIdentity = String(
      repeating: "r",
      count: MusicalVersionDiscoveryIndex.hardMaximumResourceIdentityUTF8Bytes)
    let exact = syntheticIndexedAsset(
      assetID: "large-string",
      segmentCount: 3,
      resourceIdentity: maximumResourceIdentity)
    let exactStorage = root.appending(path: "exact-memory.index.json")
    try MusicalVersionDiscoveryIndex.checksumValidEncodedFixture(entries: [exact]).write(
      to: exactStorage)
    let loaded = try MusicalVersionDiscoveryIndex.load(from: exactStorage)
    #expect(loaded.residentWorkingMemoryUpperBoundBytes == exact.workingMemoryUpperBoundBytes)

    let underclaimed = replacingWorkingMemory(
      in: exact,
      with: exact.workingMemoryUpperBoundBytes - 1)
    let underclaimedStorage = root.appending(path: "underclaimed-memory.index.json")
    try MusicalVersionDiscoveryIndex.checksumValidEncodedFixture(entries: [underclaimed]).write(
      to: underclaimedStorage)
    #expect(throws: MusicalVersionDiscoveryIndexError.self) {
      try MusicalVersionDiscoveryIndex.load(from: underclaimedStorage)
    }
    #expect(
      MusicalVersionDiscoveryIndex.maximumRetainedMemoryUpperBoundBytes(
        segmentCount: Int.max) == nil)
  }

  @Test("Corrupt and future indexes fail closed")
  func corruptAndFuturePersistence() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let target = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 4)
    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      prototype,
      assets: [MusicalVersionDiscoveryAsset(assetID: "target", fileURL: target)])
    let corruptURL = root.appending(path: "corrupt.index.json")
    var corrupt = try index.encoded()
    corrupt[corrupt.index(before: corrupt.endIndex)] ^= 0xff
    try corrupt.write(to: corruptURL)
    #expect(throws: MusicalVersionDiscoveryIndexError.self) {
      try MusicalVersionDiscoveryIndex.load(from: corruptURL)
    }

    let futureURL = root.appending(path: "future.index.json")
    var object = try #require(
      JSONSerialization.jsonObject(with: index.encoded()) as? [String: Any])
    var payload = try #require(object["payload"] as? [String: Any])
    payload["schemaVersion"] = 999
    object["payload"] = payload
    try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]).write(to: futureURL)
    do {
      _ = try MusicalVersionDiscoveryIndex.load(from: futureURL)
      Issue.record("Future index unexpectedly loaded")
    } catch let error as MusicalVersionDiscoveryIndexError {
      #expect(error == .futureSchema(999))
    }
  }

  @Test("Invalid, oversize, frame, memory, candidate, and cancellation bounds abstain")
  func boundedResearch() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let first = root.appending(path: "first.wav")
    let second = root.appending(path: "second.wav")
    let smallTarget = root.appending(path: "small-target.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: first, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(
      to: second,
      signalDuration: 6,
      transform: .pitchShifted(semitones: 2))
    try TestSupport.writeGeneratedAudio(to: smallTarget, signalDuration: 1)
    let builder = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      builder,
      assets: [
        MusicalVersionDiscoveryAsset(assetID: "first", fileURL: first),
        MusicalVersionDiscoveryAsset(assetID: "second", fileURL: second),
      ])
    let request = makeRequest(queryURL: query)
    let smallIndex = try await builtIndex(
      builder,
      assets: [MusicalVersionDiscoveryAsset(assetID: "small", fileURL: smallTarget)])

    var invalidConfiguration = MusicalVersionDiscoveryConfiguration()
    invalidConfiguration.minimumScore = .nan
    #expect(
      await LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
        configuration: invalidConfiguration
      ).recall(request, in: index) == .abstained(.invalidConfiguration))

    var byteConfiguration = MusicalVersionDiscoveryConfiguration()
    let queryBytes = try #require(
      FileManager.default.attributesOfItem(atPath: query.path)[.size] as? NSNumber
    )
    .int64Value
    let smallTargetBytes = try #require(
      FileManager.default.attributesOfItem(atPath: smallTarget.path)[.size] as? NSNumber
    )
    .int64Value
    byteConfiguration.maximumFileBytes = (queryBytes + smallTargetBytes) / 2
    #expect(
      await LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
        configuration: byteConfiguration
      ).recall(request, in: smallIndex) == .abstained(.sourceFileTooLarge))

    var frameConfiguration = MusicalVersionDiscoveryConfiguration()
    frameConfiguration.maximumFingerprintFrames = 2
    #expect(
      await LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
        configuration: frameConfiguration
      ).recall(request, in: index) == .abstained(.frameLimitExceeded))

    var memoryConfiguration = MusicalVersionDiscoveryConfiguration()
    memoryConfiguration.maximumWorkingMemoryBytes = 1
    #expect(
      await LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
        configuration: memoryConfiguration
      ).recall(request, in: index) == .abstained(.memoryLimitExceeded))

    var candidateConfiguration = MusicalVersionDiscoveryConfiguration()
    candidateConfiguration.maximumCandidateCount = 1
    #expect(
      await LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
        configuration: candidateConfiguration
      ).recall(request, in: index) == .abstained(.candidateLimitExceeded))

    var scanConfiguration = MusicalVersionDiscoveryConfiguration()
    scanConfiguration.maximumTotalBytesScanned = 1
    #expect(
      await LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
        configuration: scanConfiguration
      ).recall(request, in: index) == .abstained(.byteScanLimitExceeded))

    var comparisonConfiguration = MusicalVersionDiscoveryConfiguration()
    comparisonConfiguration.maximumComparedSegmentPairs = 1
    #expect(
      await LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
        configuration: comparisonConfiguration
      ).recall(request, in: index) == .abstained(.comparisonLimitExceeded))

    let cancelled = Task {
      await builder.recall(request, in: index)
    }
    cancelled.cancel()
    #expect(await cancelled.value == .abstained(.cancelled))
  }

  @Test("A persisted candidate outside the active byte budget abstains before comparison")
  func targetByteBound() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "large-target.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 2)
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 8)
    let builder = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      builder,
      assets: [MusicalVersionDiscoveryAsset(assetID: "target", fileURL: target)])
    let queryBytes = try #require(
      FileManager.default.attributesOfItem(atPath: query.path)[.size] as? NSNumber
    )
    .int64Value
    let targetBytes = try #require(
      FileManager.default.attributesOfItem(atPath: target.path)[.size] as? NSNumber
    )
    .int64Value
    #expect(queryBytes < targetBytes)
    var configuration = MusicalVersionDiscoveryConfiguration()
    configuration.maximumFileBytes = (queryBytes + targetBytes) / 2
    let bounded = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
      configuration: configuration)

    #expect(
      await bounded.recall(makeRequest(queryURL: query), in: index)
        == .abstained(.targetFileTooLarge))
  }

  @Test("Multichannel extraction is dynamically bounded and rejects more than eight channels")
  func multichannelExtractionBounds() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let mono = root.appending(path: "mono.wav")
    let eightChannel = root.appending(path: "eight-channel.wav")
    let nineChannel = root.appending(path: "nine-channel.wav")
    try TestSupport.writeGeneratedAudio(to: mono, signalDuration: 2)
    try writeMultichannelAudio(to: eightChannel, channelCount: 8, duration: 2)
    try writeMultichannelAudio(to: nineChannel, channelCount: 9, duration: 2)

    let counter = FeatureExtractionCounter()
    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
      beforeFeatureExtractionHook: counter.record)
    let monoPlan = try prototype.featureExtractionPlan(at: mono)
    let eightChannelPlan = try prototype.featureExtractionPlan(at: eightChannel)
    #expect(monoPlan.channelCount == 1)
    #expect(eightChannelPlan.channelCount == 8)
    #expect(
      eightChannelPlan.transientWorkingMemoryUpperBoundBytes
        > monoPlan.transientWorkingMemoryUpperBoundBytes)
    _ = try await builtIndex(
      prototype,
      assets: [MusicalVersionDiscoveryAsset(assetID: "eight", fileURL: eightChannel)])
    #expect(counter.count == 1)

    do {
      _ = try prototype.featureExtractionPlan(
        durationSeconds: 2,
        segmentCount: monoPlan.segmentCount,
        channelCount: 9,
        frameCapacity: monoPlan.frameCapacity)
      Issue.record("Nine-channel extraction unexpectedly received an allocation plan")
    } catch let error as MusicalVersionAnalysisError {
      #expect(error.abstention == .channelLimitExceeded)
    }
    #expect(
      await prototype.buildIndex(
        assets: [MusicalVersionDiscoveryAsset(assetID: "nine", fileURL: nineChannel)])
        == .abstained(.channelLimitExceeded))
    #expect(counter.count == 1)
  }

  @Test("Cumulative index memory admits the exact cap and rejects before the next extraction")
  func cumulativeIndexMemoryBound() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let first = root.appending(path: "first.wav")
    let second = root.appending(path: "second.wav")
    try TestSupport.writeGeneratedAudio(to: first, signalDuration: 2)
    try TestSupport.writeGeneratedAudio(to: second, signalDuration: 2, gain: 0.7)
    let planner = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let firstIndex = try await builtIndex(
      planner,
      assets: [MusicalVersionDiscoveryAsset(assetID: "first", fileURL: first)])
    let secondPlan = try planner.featureExtractionPlan(at: second)
    let exactCap = try #require(
      LocalMusicalVersionDiscoveryPrototype.checkedMemorySum(
        firstIndex.residentWorkingMemoryUpperBoundBytes,
        secondPlan.peakWorkingMemoryUpperBoundBytes))
    let assets = [
      MusicalVersionDiscoveryAsset(assetID: "first", fileURL: first),
      MusicalVersionDiscoveryAsset(assetID: "second", fileURL: second),
    ]

    var exactConfiguration = MusicalVersionDiscoveryConfiguration()
    exactConfiguration.maximumWorkingMemoryBytes = exactCap
    let exactCounter = FeatureExtractionCounter()
    let exact = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
      configuration: exactConfiguration,
      beforeFeatureExtractionHook: exactCounter.record)
    let index = try await builtIndex(exact, assets: assets)
    #expect(exactCounter.count == 2)
    #expect(index.residentWorkingMemoryUpperBoundBytes <= exactCap)

    var underConfiguration = exactConfiguration
    underConfiguration.maximumWorkingMemoryBytes = exactCap - 1
    let underCounter = FeatureExtractionCounter()
    let under = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
      configuration: underConfiguration,
      beforeFeatureExtractionHook: underCounter.record)
    #expect(await under.buildIndex(assets: assets) == .abstained(.memoryLimitExceeded))
    #expect(underCounter.count == 1)
  }

  @Test("Recall rejects resident-index plus source extraction peak before source allocation")
  func recallSourceExtractionPreflight() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 3)
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 3, gain: 0.7)
    let planner = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    let index = try await builtIndex(
      planner,
      assets: [MusicalVersionDiscoveryAsset(assetID: "target", fileURL: target)])
    let sourcePlan = try planner.featureExtractionPlan(at: query)
    let requiredPeak = try #require(
      LocalMusicalVersionDiscoveryPrototype.checkedMemorySum(
        index.residentWorkingMemoryUpperBoundBytes,
        sourcePlan.peakWorkingMemoryUpperBoundBytes))
    var configuration = MusicalVersionDiscoveryConfiguration()
    configuration.maximumWorkingMemoryBytes = requiredPeak - 1
    let counter = FeatureExtractionCounter()
    let bounded = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
      configuration: configuration,
      beforeFeatureExtractionHook: counter.record)

    #expect(
      await bounded.recall(makeRequest(queryURL: query), in: index)
        == .abstained(.memoryLimitExceeded))
    #expect(counter.count == 0)
  }

  @Test("Memory arithmetic overflow and noncanonical index claims fail closed")
  func memoryOverflowFailsClosed() throws {
    #expect(
      LocalMusicalVersionDiscoveryPrototype.checkedMemorySum(Int64.max, 1) == nil)
    let forged = syntheticIndexedAsset(
      assetID: "forged",
      segmentCount: 3,
      workingMemoryUpperBoundBytes: Int64.max)
    #expect(throws: MusicalVersionDiscoveryIndexError.outsideBounds) {
      try MusicalVersionDiscoveryIndex(entries: [forged])
    }
  }

  @Test("A 520-segment adversary streams below two MiB or refuses before scoring")
  func comparisonStreamsWithinTwoMiB() throws {
    let source = syntheticIndexedAsset(assetID: "source", segmentCount: 520)
    let target = syntheticIndexedAsset(assetID: "target", segmentCount: 520)
    let comparisonBudget = LocalMusicalVersionDiscoveryPrototype
      .comparisonWorkingMemoryUpperBoundBytes
    let totalBudget =
      source.workingMemoryUpperBoundBytes
      + target.workingMemoryUpperBoundBytes
      + comparisonBudget
    #expect(totalBudget < 2 * 1_024 * 1_024)
    #expect(Int64(520 * 520 * MemoryLayout<Double>.stride) > 2 * 1_024 * 1_024)

    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch()
    var evaluatedPairs: Int64 = 0
    let result = try prototype.compare(
      source: source,
      target: target,
      availableWorkingMemoryBytes: comparisonBudget,
      evaluatedSegmentPairs: &evaluatedPairs)
    #expect(result != nil)
    let pairUpperBound = Int64(520 * 520 * 13)
    let skippedShortOverlapPairs = Int64(2 * (1 + 2) * 13)
    #expect(evaluatedPairs == pairUpperBound - skippedShortOverlapPairs)

    var refusedPairs: Int64 = 0
    do {
      _ = try prototype.compare(
        source: source,
        target: target,
        availableWorkingMemoryBytes: comparisonBudget - 1,
        evaluatedSegmentPairs: &refusedPairs)
      Issue.record("Comparison unexpectedly exceeded its memory budget")
    } catch let error as MusicalVersionAnalysisError {
      #expect(error.abstention == .memoryLimitExceeded)
    }
    #expect(refusedPairs == 0)
  }

  @Test("In-flight comparison cancellation stops at its first bounded checkpoint")
  func inFlightComparisonCancellation() async throws {
    let probe = ComparisonCancellationProbe()
    let source = syntheticIndexedAsset(assetID: "source", segmentCount: 520)
    let target = syntheticIndexedAsset(assetID: "target", segmentCount: 520)
    let prototype = LocalMusicalVersionDiscoveryPrototype.deterministicSyntheticResearch(
      comparisonProgressHook: probe.checkpoint)
    let task = Task.detached {
      var evaluatedPairs: Int64 = 0
      do {
        _ = try prototype.compare(
          source: source,
          target: target,
          availableWorkingMemoryBytes: LocalMusicalVersionDiscoveryPrototype
            .comparisonWorkingMemoryUpperBoundBytes,
          evaluatedSegmentPairs: &evaluatedPairs)
        return ComparisonCancellationOutcome.completed(evaluatedPairs)
      } catch is CancellationError {
        return ComparisonCancellationOutcome.cancelled(evaluatedPairs)
      } catch {
        return ComparisonCancellationOutcome.failed
      }
    }

    for _ in 0..<3_000 where !probe.hasReachedCheckpoint {
      try await Task.sleep(nanoseconds: 1_000_000)
    }
    #expect(probe.hasReachedCheckpoint)
    task.cancel()
    #expect(await task.value == .cancelled(64))
    #expect(probe.callbackCount == 1)
    #expect(probe.lastCheckpoint == 64)
  }

  private func builtIndex(
    _ prototype: LocalMusicalVersionDiscoveryPrototype,
    assets: [MusicalVersionDiscoveryAsset]
  ) async throws -> MusicalVersionDiscoveryIndex {
    switch await prototype.buildIndex(assets: assets) {
    case .built(let index):
      return index
    case .abstained(let reason):
      Issue.record("Index build abstained: \(reason)")
      throw MusicalVersionTestError.unexpectedAbstention
    }
  }

  private func makeRequest(queryURL: URL) -> MusicalVersionDiscoveryRequest {
    let query = "unknown title"
    let deterministicIDs: [String] = []
    let generation = "catalogue-1"
    return MusicalVersionDiscoveryRequest(
      queryAssetID: "query",
      queryURL: queryURL,
      semanticQuery: query,
      deterministicResultAssetIDs: deterministicIDs,
      deterministicSearchGeneration: generation,
      receipt: MusicalVersionDeterministicSearchCompletion.issue(
        query: query,
        deterministicResultAssetIDs: deterministicIDs,
        searchGeneration: generation))
  }

  private func syntheticIndexedAsset(
    assetID: String,
    segmentCount: Int,
    fileURL: URL? = nil,
    resourceIdentity: String? = nil,
    workingMemoryUpperBoundBytes: Int64? = nil
  ) -> MusicalVersionIndexedAsset {
    let observation = AudioMatchSourceObservation(
      contentSHA256: String(repeating: "a", count: 64),
      bytes: 1,
      resourceIdentity: resourceIdentity)
    let asset = MusicalVersionDiscoveryAsset(
      assetID: assetID,
      fileURL: fileURL ?? URL(fileURLWithPath: "/tmp/\(assetID).wav"))
    let segments = (0..<segmentCount).map { index in
      var values = [Float](repeating: 0, count: 72)
      values[6 + index % 48] = 1
      return MusicalVersionSegmentEmbedding(
        range: AudioTimeRange(startSeconds: Double(index) * 0.5, durationSeconds: 1),
        embedding: MusicalVersionFeatureEmbedding(
          version: LocalMusicalVersionDiscoveryPrototype.embeddingVersion,
          values: values))
    }
    let immutableObservation = MusicalVersionImmutableAssetObservation(
      asset: asset,
      observation: observation)
    let wholeRecording = MusicalVersionFeatureEmbedding(
      version: LocalMusicalVersionDiscoveryPrototype.embeddingVersion,
      values: [Float](
        repeating: 1 / sqrt(Float(LocalMusicalVersionDiscoveryPrototype.embeddingDimension)),
        count: LocalMusicalVersionDiscoveryPrototype.embeddingDimension))
    let exactMemory = MusicalVersionDiscoveryIndex.retainedMemoryUpperBoundBytes(
      observation: immutableObservation,
      wholeRecording: wholeRecording,
      segments: segments)
    return MusicalVersionIndexedAsset(
      observation: immutableObservation,
      durationSeconds: Double(segmentCount) * 0.5 + 0.5,
      wholeRecording: wholeRecording,
      segments: segments,
      workingMemoryUpperBoundBytes:
        workingMemoryUpperBoundBytes
        ?? exactMemory
        ?? .max)
  }

  private func replacingWorkingMemory(
    in entry: MusicalVersionIndexedAsset,
    with workingMemoryUpperBoundBytes: Int64
  ) -> MusicalVersionIndexedAsset {
    MusicalVersionIndexedAsset(
      observation: entry.observation,
      durationSeconds: entry.durationSeconds,
      wholeRecording: entry.wholeRecording,
      segments: entry.segments,
      workingMemoryUpperBoundBytes: workingMemoryUpperBoundBytes)
  }

  private func replacingEmbeddingVersions(
    in entry: MusicalVersionIndexedAsset,
    with version: String
  ) -> MusicalVersionIndexedAsset {
    MusicalVersionIndexedAsset(
      observation: entry.observation,
      durationSeconds: entry.durationSeconds,
      wholeRecording: MusicalVersionFeatureEmbedding(
        version: version,
        values: entry.wholeRecording.values),
      segments: entry.segments.map {
        MusicalVersionSegmentEmbedding(
          range: $0.range,
          embedding: MusicalVersionFeatureEmbedding(
            version: version,
            values: $0.embedding.values))
      },
      workingMemoryUpperBoundBytes: entry.workingMemoryUpperBoundBytes)
  }

  private func results(_ outcome: MusicalVersionDiscoveryOutcome) throws
    -> [MusicalVersionDiscoveryResult]
  {
    switch outcome {
    case .results(let results):
      return results
    case .abstained(let reason):
      Issue.record("Recall abstained: \(reason)")
      throw MusicalVersionTestError.unexpectedAbstention
    }
  }

  private func writeRepeatedAudio(
    sourceURL: URL,
    destinationURL: URL,
    gapSeconds: Double
  ) throws {
    let source = try AVAudioFile(
      forReading: sourceURL,
      commonFormat: .pcmFormatFloat32,
      interleaved: false)
    let sourceFrames = AVAudioFrameCount(source.length)
    let sourceBuffer = try #require(
      AVAudioPCMBuffer(pcmFormat: source.processingFormat, frameCapacity: sourceFrames))
    try source.read(into: sourceBuffer)
    let gapFrames = AVAudioFrameCount((gapSeconds * source.processingFormat.sampleRate).rounded())
    let totalFrames = sourceFrames * 2 + gapFrames
    let output = try #require(
      AVAudioPCMBuffer(pcmFormat: source.processingFormat, frameCapacity: totalFrames))
    output.frameLength = totalFrames
    for channel in 0..<Int(source.processingFormat.channelCount) {
      let sourceSamples = try #require(sourceBuffer.floatChannelData?[channel])
      let destinationSamples = try #require(output.floatChannelData?[channel])
      for index in 0..<Int(sourceFrames) {
        destinationSamples[index] = sourceSamples[index]
        destinationSamples[Int(sourceFrames + gapFrames) + index] = sourceSamples[index]
      }
    }
    let file = try AVAudioFile(
      forWriting: destinationURL,
      settings: source.processingFormat.settings,
      commonFormat: .pcmFormatFloat32,
      interleaved: false)
    try file.write(from: output)
  }

  private func writeMultichannelAudio(
    to fileURL: URL,
    channelCount: Int,
    duration: Double
  ) throws {
    let sampleRate = 8_000.0
    let layout = try #require(
      AVAudioChannelLayout(
        layoutTag: AudioChannelLayoutTag(
          kAudioChannelLayoutTag_DiscreteInOrder | UInt32(channelCount))))
    let format = AVAudioFormat(
      standardFormatWithSampleRate: sampleRate,
      channelLayout: layout)
    var settings = format.settings
    settings[AVFormatIDKey] = kAudioFormatLinearPCM
    settings[AVLinearPCMIsNonInterleaved] = false
    let file = try AVAudioFile(forWriting: fileURL, settings: settings)
    let totalFrames = Int(duration * sampleRate)
    let chunkCapacity = 1_024
    var writtenFrames = 0
    while writtenFrames < totalFrames {
      let frameCount = min(chunkCapacity, totalFrames - writtenFrames)
      let buffer = try #require(
        AVAudioPCMBuffer(
          pcmFormat: format,
          frameCapacity: AVAudioFrameCount(chunkCapacity)))
      buffer.frameLength = AVAudioFrameCount(frameCount)
      let channels = try #require(buffer.floatChannelData)
      for channel in 0..<channelCount {
        for frame in 0..<frameCount {
          let time = Double(writtenFrames + frame) / sampleRate
          channels[channel][frame] = Float(
            sin(2 * .pi * Double(120 + channel * 11) * time) * 0.2)
        }
      }
      try file.write(from: buffer)
      writtenFrames += frameCount
    }
  }
}

private enum MusicalVersionTestError: Error {
  case unexpectedAbstention
}

private enum ComparisonCancellationOutcome: Sendable, Equatable {
  case completed(Int64)
  case cancelled(Int64)
  case failed
}

private final class ComparisonCancellationProbe: @unchecked Sendable {
  private let lock = NSLock()
  private var storedCallbackCount = 0
  private var storedLastCheckpoint: Int64 = 0

  var hasReachedCheckpoint: Bool {
    lock.withLock { storedCallbackCount > 0 }
  }

  var callbackCount: Int {
    lock.withLock { storedCallbackCount }
  }

  var lastCheckpoint: Int64 {
    lock.withLock { storedLastCheckpoint }
  }

  func checkpoint(_ evaluatedPairs: Int64) throws {
    lock.withLock {
      storedCallbackCount += 1
      storedLastCheckpoint = evaluatedPairs
    }
    while !Task.isCancelled {
      Thread.sleep(forTimeInterval: 0.001)
    }
  }
}

private final class FeatureExtractionCounter: @unchecked Sendable {
  private let lock = NSLock()
  private var storedCount = 0

  var count: Int {
    lock.withLock { storedCount }
  }

  func record(_: URL) throws {
    lock.withLock { storedCount += 1 }
  }
}

extension Array {
  fileprivate var only: Element? { count == 1 ? first : nil }
}
