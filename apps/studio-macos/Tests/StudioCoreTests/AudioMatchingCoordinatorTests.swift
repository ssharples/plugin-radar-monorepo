import Foundation
import Testing

@testable import StudioCore

@Suite("Audio matching orchestration")
struct AudioMatchingCoordinatorTests {
  @Test("Persists matcher proposals while respecting the review policy")
  func persistsProposals() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))
    let engine = FixtureMatcher(
      observation: AudioMatchObservation(
        sourceNodeID: "query", targetNodeID: "candidate", capability: .semantic,
        score: 0.99, matchedCoverage: 1, runnerUpMargin: 0.8,
        explanation: "Semantic neighbour.", algorithmVersion: "fixture-v1"))
    let coordinator = AudioMatchingCoordinator(
      engines: [engine], lineageStore: store)

    let result = try await coordinator.match(
      AudioMatchRequest(
        sourceNodeID: "query", sourceURL: root.appending(path: "query.wav"),
        candidates: [
          AudioMatchCandidate(
            nodeID: "candidate", fileURL: root.appending(path: "candidate.wav"))
        ]))

    #expect(result.edges.count == 1)
    #expect(result.edges[0].confidence == .suggested)
    #expect(result.actionsByEdgeID[result.edges[0].id] == [.queueForReview])
    #expect(try store.edges(for: "query") == result.edges)
  }

  @Test("Only coordinator revalidation can promote near-identity evidence")
  func coordinatorOwnsNearIdentityAuthority() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let sourceURL = root.appending(path: "source.wav")
    let targetURL = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: sourceURL, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: targetURL, signalDuration: 6, gain: 0.7)
    let observation = try await nearIdentityObservation(
      sourceURL: sourceURL,
      targetURL: targetURL)
    let resourceUsage = try #require(observation.resourceUsage)
    #expect(resourceUsage.workingMemoryMeasuredBytes > 0)
    #expect(
      resourceUsage.workingMemoryMeasuredBytes <= resourceUsage.workingMemoryUpperBoundBytes)
    let direct = try #require(
      AudioMatchProposalBuilder(calibration: acceptedNearIdentityCalibration())
        .edge(from: observation))
    #expect(direct.confidence == .suggested)

    let store = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))
    let unboundCoordinator = AudioMatchingCoordinator(
      engines: [NearIdentityFixtureMatcher(observation: observation)],
      lineageStore: store,
      calibration: acceptedNearIdentityCalibration())
    let unboundResult = try await unboundCoordinator.match(
      AudioMatchRequest(
        sourceNodeID: "query", sourceURL: sourceURL,
        candidates: [AudioMatchCandidate(nodeID: "candidate", fileURL: targetURL)]))
    #expect(unboundResult.edges.first?.confidence == .suggested)

    let persistedCatalog = try persistedCatalog(
      observation: observation,
      sourceURL: sourceURL,
      targetURL: targetURL)
    let decodedCatalog = try JSONDecoder().decode(
      AudioMatchPersistedBindingCatalog.self,
      from: JSONEncoder().encode(persistedCatalog))
    let authoritativeStore = try AudioLineageStore(
      storageURL: root.appending(path: "authoritative.sqlite"))
    let coordinator = AudioMatchingCoordinator(
      engines: [NearIdentityFixtureMatcher(observation: observation)],
      lineageStore: authoritativeStore,
      calibration: acceptedNearIdentityCalibration(),
      authoritativeCatalog: decodedCatalog)
    let result = try await coordinator.match(
      AudioMatchRequest(
        sourceNodeID: "query", sourceURL: sourceURL,
        candidates: [AudioMatchCandidate(nodeID: "candidate", fileURL: targetURL)]))

    #expect(result.edges.count == 1)
    let edge = try #require(result.edges.first)
    #expect(edge.relationship == .nearIdenticalRecording)
    #expect(edge.confidence == .highConfidenceDerivative)
    #expect(edge.confidence != .verifiedIdentity)
    #expect(edge.calibrationID == "accepted-near-identity")
  }

  @Test("Arbitrary, empty, and mismatched node bindings cannot authorize matching files")
  func rejectsNonAuthoritativeNodeBindings() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let sourceURL = root.appending(path: "source.wav")
    let targetURL = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: sourceURL, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: targetURL, signalDuration: 6, gain: 0.7)
    let validObservation = try await nearIdentityObservation(
      sourceURL: sourceURL,
      targetURL: targetURL)
    let validCatalog = try persistedCatalog(
      observation: validObservation,
      sourceURL: sourceURL,
      targetURL: targetURL)

    let arbitraryObservation = try await nearIdentityObservation(
      sourceURL: sourceURL,
      targetURL: targetURL,
      sourceNodeID: "arbitrary-source",
      targetNodeID: "arbitrary-target")
    let emptyObservation = try await nearIdentityObservation(
      sourceURL: sourceURL,
      targetURL: targetURL,
      sourceNodeID: "",
      targetNodeID: "")
    let mismatchedCatalog = AudioMatchPersistedBindingCatalog(bindings: [
      AudioMatchAuthoritativeFileBinding(
        nodeID: "query",
        fileURL: targetURL,
        observation: try #require(validObservation.sourceObservation)),
      AudioMatchAuthoritativeFileBinding(
        nodeID: "candidate",
        fileURL: sourceURL,
        observation: try #require(validObservation.targetObservation)),
    ])

    let cases = [
      (arbitraryObservation, validCatalog, "arbitrary-source", "arbitrary-target"),
      (emptyObservation, validCatalog, "", ""),
      (validObservation, mismatchedCatalog, "query", "candidate"),
    ]
    for (index, testCase) in cases.enumerated() {
      let store = try AudioLineageStore(
        storageURL: root.appending(path: "unauthorized-\(index).sqlite"))
      let result = try await AudioMatchingCoordinator(
        engines: [NearIdentityFixtureMatcher(observation: testCase.0)],
        lineageStore: store,
        calibration: acceptedNearIdentityCalibration(),
        authoritativeCatalog: testCase.1
      ).match(
        AudioMatchRequest(
          sourceNodeID: testCase.2,
          sourceURL: sourceURL,
          candidates: [AudioMatchCandidate(nodeID: testCase.3, fileURL: targetURL)]))

      #expect(result.edges.first?.confidence == .suggested)
      #expect(result.edges.first?.calibrationID == nil)
    }
  }

  @Test("Available research engines remain suggestion-only with accepted calibration")
  func availableResearchEngineCannotPromote() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))
    let observation = AudioMatchObservation(
      sourceNodeID: "query", targetNodeID: "candidate", capability: .transformation,
      score: 0.99, matchedCoverage: 0.99, runnerUpMargin: 0.8,
      sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 8),
      targetRange: AudioTimeRange(startSeconds: 0, durationSeconds: 8),
      transform: AudioTransformEvidence(timeFactor: 0.99, pitchSemitones: 1),
      explanation: "Available research fixture.", algorithmVersion: "research-v1",
      algorithmFamily: "research", resourceUsage: fixtureResourceUsage())
    let calibration = AudioMatchingCalibration(
      id: "accepted-research", algorithmFamily: "research", algorithmVersion: "research-v1",
      materialClass: .mixedCorpus, validatedExampleCount: 100,
      validatedAt: Date(timeIntervalSince1970: 0), automaticScoreThreshold: 0.9,
      minimumCoverage: 0.8, minimumRunnerUpMargin: 0.15,
      capability: .transformation, acceptance: .accepted,
      heldOutEvaluation: AudioMatchingHeldOutEvaluation(
        id: "held-out", exampleCount: 100, evaluatedAt: Date(timeIntervalSince1970: 0),
        passed: true),
      rightsReview: .approved,
      resourceBudget: fixtureResourceBudget())
    let result = try await AudioMatchingCoordinator(
      engines: [ResearchFixtureMatcher(observation: observation)],
      lineageStore: store,
      calibration: calibration
    ).match(
      AudioMatchRequest(
        sourceNodeID: "query", sourceURL: root.appending(path: "unused-source.wav"),
        candidates: [
          AudioMatchCandidate(
            nodeID: "candidate", fileURL: root.appending(path: "unused-target.wav"))
        ]))

    #expect(result.edges.first?.confidence == .suggested)
    #expect(result.edges.first?.calibrationID == nil)
  }

  @Test("Revalidates matcher-captured files before persisting near-identity evidence")
  func rejectsReplacedMatcherObservation() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let sourceURL = root.appending(path: "source.wav")
    let targetURL = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: sourceURL, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: targetURL, signalDuration: 6)
    let observation = try await nearIdentityObservation(
      sourceURL: sourceURL,
      targetURL: targetURL)
    let store = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))
    let coordinator = AudioMatchingCoordinator(
      engines: [ReplacingFixtureMatcher(observation: observation, replacementURL: targetURL)],
      lineageStore: store)

    let result = try await coordinator.match(
      AudioMatchRequest(
        sourceNodeID: "query", sourceURL: sourceURL,
        candidates: [AudioMatchCandidate(nodeID: "candidate", fileURL: targetURL)]))

    #expect(result.edges.isEmpty)
    #expect(try store.edges(for: "query").isEmpty)
  }

  @Test("Rejects a source replaced between engine observation and coordinator revalidation")
  func rejectsReplacedSourceObservation() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let sourceURL = root.appending(path: "source.wav")
    let targetURL = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: sourceURL, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: targetURL, signalDuration: 6)
    let observation = try await nearIdentityObservation(
      sourceURL: sourceURL,
      targetURL: targetURL)
    let store = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))
    let coordinator = AudioMatchingCoordinator(
      engines: [ReplacingFixtureMatcher(observation: observation, replacementURL: sourceURL)],
      lineageStore: store)

    let result = try await coordinator.match(
      AudioMatchRequest(
        sourceNodeID: "query", sourceURL: sourceURL,
        candidates: [AudioMatchCandidate(nodeID: "candidate", fileURL: targetURL)]))

    #expect(result.edges.isEmpty)
    #expect(try store.edges(for: "query").isEmpty)
  }

  @Test("Excerpt persistence requires an independent exact rerun and remains review-only")
  func excerptPersistenceIsRevalidatedAndReviewOnly() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let sourceURL = root.appending(path: "source.wav")
    let targetURL = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: sourceURL, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(
      to: targetURL,
      signalDuration: 6,
      leadingSilence: 2)
    let store = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))
    let engine = LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(),
      availability: .available)
    let coordinator = AudioMatchingCoordinator(
      engines: [engine],
      lineageStore: store,
      calibration: acceptedExcerptCalibration())

    let result = try await coordinator.match(
      AudioMatchRequest(
        sourceNodeID: "query",
        sourceURL: sourceURL,
        candidates: [AudioMatchCandidate(nodeID: "candidate", fileURL: targetURL)]))
    let edge = try #require(result.edges.first)

    #expect(result.edges.count == 1)
    #expect(edge.confidence == .suggested)
    #expect(edge.calibrationID == nil)
    #expect(edge.evidence.first?.kind == .excerptSequenceAlignment)
    #expect(!edge.evidence.contains { $0.kind == .semanticEmbedding })
    #expect(result.actionsByEdgeID[edge.id] == [.queueForReview])
    #expect(try store.edges(for: "query") == [edge])
  }

  @Test("Source and target replacement after excerpt capture are rejected before persistence")
  func excerptMutationBeforePersistenceIsRejected() async throws {
    for replaceSource in [true, false] {
      let root = try TestSupport.temporaryDirectory()
      defer { try? FileManager.default.removeItem(at: root) }
      let sourceURL = root.appending(path: "source.wav")
      let targetURL = root.appending(path: "target.wav")
      try TestSupport.writeGeneratedAudio(to: sourceURL, signalDuration: 6)
      try TestSupport.writeGeneratedAudio(
        to: targetURL,
        signalDuration: 6,
        leadingSilence: 2)
      let store = try AudioLineageStore(storageURL: root.appending(path: "lineage.sqlite"))
      let coordinator = AudioMatchingCoordinator(
        engines: [
          ReplacingExcerptFixtureMatcher(
            replacementURL: replaceSource ? sourceURL : targetURL)
        ],
        lineageStore: store)

      let result = try await coordinator.match(
        AudioMatchRequest(
          sourceNodeID: "query",
          sourceURL: sourceURL,
          candidates: [AudioMatchCandidate(nodeID: "candidate", fileURL: targetURL)]))

      #expect(result.edges.isEmpty)
      #expect(try store.edges(for: "query").isEmpty)
    }
  }

  @Test("Production registry keeps unlicensed transformation and semantic engines explicit")
  func productionCapabilitiesAreExplicit() {
    let registry = AudioMatcherRegistry.production()

    #expect(
      registry.descriptors.contains {
        $0.id == "local-near-identity"
          && $0.capabilities == [.nearIdentity]
          && $0.availability == .available
      })
    #expect(
      registry.descriptors.contains {
        $0.capabilities == [.segment] && $0.availability == .available
      })
    #expect(
      registry.descriptors.contains {
        guard $0.id == "local-landmark-excerpt-prototype",
          $0.capabilities == [.excerptRetrieval]
        else { return false }
        if case .unavailable = $0.availability { return true }
        return false
      })
    #expect(
      registry.descriptors.contains {
        guard $0.capabilities.contains(.transformation) else { return false }
        if case .unavailable = $0.availability { return true }
        return false
      })
    #expect(
      registry.descriptors.contains {
        guard $0.capabilities.contains(.semantic) else { return false }
        if case .unavailable = $0.availability { return true }
        return false
      })
    let activeCapabilities = registry.engines
      .filter { $0.descriptor.availability == .available }
      .reduce(into: Set<AudioMatchingCapability>()) { result, engine in
        result.formUnion(engine.descriptor.capabilities)
      }
    #expect(!activeCapabilities.contains(.excerptRetrieval))
    #expect(!activeCapabilities.contains(.transformation))
    #expect(!activeCapabilities.contains(.semantic))
    #expect(!activeCapabilities.contains(.sourceSeparatedRetrieval))
  }
}

private struct ReplacingFixtureMatcher: AudioMatchingEngine {
  let observation: AudioMatchObservation
  let replacementURL: URL
  let descriptor = AudioMatcherDescriptor(
    id: "replacing-fixture", displayName: "Replacing fixture",
    algorithmVersion: "fixture-near-identity-v1",
    capabilities: [.nearIdentity], availability: .available)

  func match(_ request: AudioMatchRequest) async throws -> [AudioMatchObservation] {
    try TestSupport.replaceWithGeneratedAudio(
      at: replacementURL,
      signalDuration: 6,
      transform: .unrelated)
    return [observation]
  }
}

private struct NearIdentityFixtureMatcher: AudioMatchingEngine {
  let observation: AudioMatchObservation
  let descriptor = AudioMatcherDescriptor(
    id: "near-fixture", displayName: "Near identity fixture",
    algorithmVersion: "fixture-near-identity-v1",
    capabilities: [.nearIdentity], availability: .available)

  func match(_ request: AudioMatchRequest) async throws -> [AudioMatchObservation] {
    [observation]
  }
}

private struct FixtureMatcher: AudioMatchingEngine {
  let observation: AudioMatchObservation
  let descriptor = AudioMatcherDescriptor(
    id: "fixture", displayName: "Fixture", algorithmVersion: "fixture-v1",
    capabilities: [.semantic], availability: .available)

  func match(_ request: AudioMatchRequest) async throws -> [AudioMatchObservation] {
    [observation]
  }
}

private struct ResearchFixtureMatcher: AudioMatchingEngine {
  let observation: AudioMatchObservation
  let descriptor = AudioMatcherDescriptor(
    id: "research-fixture", displayName: "Available research fixture",
    algorithmVersion: "research-v1", capabilities: [.transformation], availability: .available)

  func match(_ request: AudioMatchRequest) async throws -> [AudioMatchObservation] {
    [observation]
  }
}

private struct ReplacingExcerptFixtureMatcher: AudioMatchingEngine {
  let replacementURL: URL
  let descriptor = AudioMatcherDescriptor(
    id: "replacing-excerpt-fixture",
    displayName: "Replacing excerpt fixture",
    algorithmVersion: LocalLandmarkAudioMatcher.excerptRetrievalAlgorithmVersion,
    capabilities: [.excerptRetrieval],
    availability: .available)

  func match(_ request: AudioMatchRequest) async throws -> [AudioMatchObservation] {
    let observations = try await LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(),
      availability: .available
    ).match(request)
    try TestSupport.replaceWithGeneratedAudio(
      at: replacementURL,
      signalDuration: 8,
      transform: .unrelated)
    return observations
  }
}

private func nearIdentityObservation(
  sourceURL: URL,
  targetURL: URL,
  sourceNodeID: String = "query",
  targetNodeID: String = "candidate"
) async throws
  -> AudioMatchObservation
{
  let observations = try await LocalNearIdentityAudioMatcher().match(
    AudioMatchRequest(
      sourceNodeID: sourceNodeID,
      sourceURL: sourceURL,
      candidates: [AudioMatchCandidate(nodeID: targetNodeID, fileURL: targetURL)]))
  #expect(observations.count == 1)
  return try #require(observations.first)
}

private func persistedCatalog(
  observation: AudioMatchObservation,
  sourceURL: URL,
  targetURL: URL
) throws -> AudioMatchPersistedBindingCatalog {
  AudioMatchPersistedBindingCatalog(bindings: [
    AudioMatchAuthoritativeFileBinding(
      nodeID: observation.sourceNodeID,
      fileURL: sourceURL,
      observation: try #require(observation.sourceObservation)),
    AudioMatchAuthoritativeFileBinding(
      nodeID: observation.targetNodeID,
      fileURL: targetURL,
      observation: try #require(observation.targetObservation)),
  ])
}

private func acceptedNearIdentityCalibration() -> AudioMatchingCalibration {
  AudioMatchingCalibration(
    id: "accepted-near-identity",
    algorithmFamily: LocalNearIdentityAudioMatcher.algorithmFamily,
    algorithmVersion: LocalNearIdentityAudioMatcher.algorithmVersion,
    materialClass: .mixedCorpus,
    validatedExampleCount: 100,
    validatedAt: Date(timeIntervalSince1970: 0),
    automaticScoreThreshold: 0.9,
    minimumCoverage: 0.8,
    minimumRunnerUpMargin: 0.15,
    capability: .nearIdentity,
    acceptance: .accepted,
    heldOutEvaluation: AudioMatchingHeldOutEvaluation(
      id: "near-held-out", exampleCount: 100,
      evaluatedAt: Date(timeIntervalSince1970: 0), passed: true),
    rightsReview: .notRequired,
    resourceBudget: AudioMatchingResourceBudget(
      maximumDurationSeconds: 900,
      maximumFingerprintFrames: 10_000,
      maximumCandidateCount: 64,
      maximumFileBytes: 8_000_000_000,
      maximumWorkingMemoryBytes: 64_000_000))
}

private func acceptedExcerptCalibration() -> AudioMatchingCalibration {
  AudioMatchingCalibration(
    id: "accepted-excerpt",
    algorithmFamily: LocalLandmarkAudioMatcher.excerptRetrievalAlgorithmFamily,
    algorithmVersion: LocalLandmarkAudioMatcher.excerptRetrievalAlgorithmVersion,
    materialClass: .mixedCorpus,
    validatedExampleCount: 100,
    validatedAt: Date(timeIntervalSince1970: 0),
    automaticScoreThreshold: 0.5,
    minimumCoverage: 0.5,
    minimumRunnerUpMargin: 0.05,
    capability: .excerptRetrieval,
    acceptance: .accepted,
    heldOutEvaluation: AudioMatchingHeldOutEvaluation(
      id: "held-out-excerpt",
      exampleCount: 100,
      evaluatedAt: Date(timeIntervalSince1970: 0),
      passed: true),
    rightsReview: .approved,
    resourceBudget: AudioMatchingResourceBudget(
      maximumDurationSeconds: 900,
      maximumFingerprintFrames: 20_000,
      maximumCandidateCount: 64,
      maximumFileBytes: 512 * 1_024 * 1_024,
      maximumWorkingMemoryBytes: 64 * 1_024 * 1_024))
}

private func fixtureResourceUsage() -> AudioMatchResourceUsage {
  AudioMatchResourceUsage(
    sourceDurationSeconds: 8, targetDurationSeconds: 8,
    sourceFingerprintFrames: 80, targetFingerprintFrames: 80,
    candidateCount: 1, sourceFileBytes: 100_000, targetFileBytes: 100_000,
    workingMemoryMeasuredBytes: 1_000_000,
    workingMemoryUpperBoundBytes: 2_000_000)
}

private func fixtureResourceBudget() -> AudioMatchingResourceBudget {
  AudioMatchingResourceBudget(
    maximumDurationSeconds: 900, maximumFingerprintFrames: 10_000,
    maximumCandidateCount: 64, maximumFileBytes: 8_000_000_000,
    maximumWorkingMemoryBytes: 64_000_000)
}
