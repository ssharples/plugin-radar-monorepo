import Foundation

struct AudioMatchCoordinatorAuthorityReceipt: Sendable, Equatable {
  let sourceNodeID: String
  let targetNodeID: String
  let sourceURL: URL
  let targetURL: URL
  let sourceObservation: AudioMatchSourceObservation
  let targetObservation: AudioMatchSourceObservation
  let fingerprintDigest: String
  let targetFingerprintDigest: String
  let fingerprintVersion: String
  let algorithmFamily: String
  let algorithmVersion: String
  let materialClass: AudioMaterialClass
  let resourceUsage: AudioMatchResourceUsage

  fileprivate init?(
    observation: AudioMatchObservation,
    sourceBinding: AudioMatchAuthoritativeFileBinding,
    targetBinding: AudioMatchAuthoritativeFileBinding
  ) {
    guard let sourceObservation = observation.sourceObservation,
      let targetObservation = observation.targetObservation,
      let fingerprintDigest = observation.fingerprintDigest,
      let targetFingerprintDigest = observation.targetFingerprintDigest,
      let fingerprintVersion = observation.fingerprintVersion,
      let algorithmFamily = observation.algorithmFamily,
      let resourceUsage = observation.resourceUsage
    else { return nil }
    sourceNodeID = observation.sourceNodeID
    targetNodeID = observation.targetNodeID
    sourceURL = sourceBinding.fileURL.standardizedFileURL
    targetURL = targetBinding.fileURL.standardizedFileURL
    self.sourceObservation = sourceObservation
    self.targetObservation = targetObservation
    self.fingerprintDigest = fingerprintDigest
    self.targetFingerprintDigest = targetFingerprintDigest
    self.fingerprintVersion = fingerprintVersion
    self.algorithmFamily = algorithmFamily
    algorithmVersion = observation.algorithmVersion
    materialClass = observation.materialClass
    self.resourceUsage = resourceUsage
  }

  func matches(_ observation: AudioMatchObservation) -> Bool {
    observation.capability == .nearIdentity
      && sourceNodeID == observation.sourceNodeID
      && targetNodeID == observation.targetNodeID
      && sourceObservation == observation.sourceObservation
      && targetObservation == observation.targetObservation
      && fingerprintDigest == observation.fingerprintDigest
      && targetFingerprintDigest == observation.targetFingerprintDigest
      && fingerprintVersion == observation.fingerprintVersion
      && algorithmFamily == observation.algorithmFamily
      && algorithmVersion == observation.algorithmVersion
      && materialClass == observation.materialClass
      && resourceUsage == observation.resourceUsage
  }
}

public struct AudioMatchingResult: Sendable, Equatable {
  public let edges: [AudioLineageEdge]
  public let actionsByEdgeID: [String: Set<AudioLineageAutomationAction>]

  public init(
    edges: [AudioLineageEdge],
    actionsByEdgeID: [String: Set<AudioLineageAutomationAction>]
  ) {
    self.edges = edges
    self.actionsByEdgeID = actionsByEdgeID
  }
}

public struct AudioMatchingCoordinator: Sendable {
  private let engines: [any AudioMatchingEngine]
  private let nearIdentityRevalidator = LocalNearIdentityAudioMatcher()
  private let excerptRevalidator = LocalLandmarkAudioMatcher(
    minimumCoverage: 1.01,
    excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(),
    availability: .available)
  private let authoritativeCatalog: (any AudioMatchAuthoritativeCatalog)?
  private let lineageStore: AudioLineageStore
  private let proposalBuilder: AudioMatchProposalBuilder
  private let policy: AudioLineageAutomationPolicy

  public init(
    engines: [any AudioMatchingEngine],
    lineageStore: AudioLineageStore,
    calibration: AudioMatchingCalibration? = nil,
    authoritativeCatalog: (any AudioMatchAuthoritativeCatalog)? = nil,
    policy: AudioLineageAutomationPolicy = AudioLineageAutomationPolicy()
  ) {
    self.engines = engines
    self.lineageStore = lineageStore
    self.authoritativeCatalog = authoritativeCatalog
    proposalBuilder = AudioMatchProposalBuilder(calibration: calibration)
    self.policy = policy
  }

  public func match(_ request: AudioMatchRequest) async throws -> AudioMatchingResult {
    var edges: [AudioLineageEdge] = []
    for engine in engines where engine.descriptor.availability == .available {
      let observations = try await engine.match(request)
      for observation in observations {
        guard engine.descriptor.capabilities.contains(observation.capability),
          observation.sourceNodeID == request.sourceNodeID
        else { continue }
        let authorizedObservation: AudioMatchObservation
        if observation.capability == .nearIdentity {
          guard
            let revalidated = await independentlyAuthorize(observation, request: request)
          else {
            continue
          }
          authorizedObservation = revalidated
        } else if observation.capability == .excerptRetrieval {
          guard
            let revalidated = await independentlyRevalidateExcerpt(
              observation,
              request: request)
          else {
            continue
          }
          authorizedObservation = revalidated
        } else {
          authorizedObservation = observation
        }
        guard let edge = proposalBuilder.edge(from: authorizedObservation) else { continue }
        try lineageStore.save(edge)
        edges.append(edge)
      }
    }
    edges.sort { left, right in
      let leftScore = left.evidence.map(\.score).max() ?? 0
      let rightScore = right.evidence.map(\.score).max() ?? 0
      if leftScore != rightScore { return leftScore > rightScore }
      return left.id < right.id
    }
    return AudioMatchingResult(
      edges: edges,
      actionsByEdgeID: Dictionary(
        uniqueKeysWithValues: edges.map {
          ($0.id, policy.allowedActions(for: $0))
        }))
  }

  private func independentlyAuthorize(
    _ observation: AudioMatchObservation,
    request: AudioMatchRequest
  ) async -> AudioMatchObservation? {
    guard observation.capability == .nearIdentity,
      let sourceObservation = observation.sourceObservation,
      let targetObservation = observation.targetObservation
    else { return nil }
    let matchingCandidates = request.candidates.filter { $0.nodeID == observation.targetNodeID }
    guard matchingCandidates.count == 1, let candidate = matchingCandidates.first else {
      return nil
    }
    guard
      let independentObservations = try? await nearIdentityRevalidator.match(request),
      independentObservations.count == 1,
      independentObservations.first == observation,
      let currentSource = try? AudioMatchSourceObservation.captureBounded(
        fileURL: request.sourceURL,
        maximumBytes: LocalNearIdentityAudioMatcher.hardMaximumFileBytes),
      let currentTarget = try? AudioMatchSourceObservation.captureBounded(
        fileURL: candidate.fileURL,
        maximumBytes: LocalNearIdentityAudioMatcher.hardMaximumFileBytes),
      currentSource == sourceObservation,
      currentTarget == targetObservation,
      sourceObservation.matchesCurrentFileBounded(
        at: request.sourceURL,
        maximumBytes: LocalNearIdentityAudioMatcher.hardMaximumFileBytes),
      targetObservation.matchesCurrentFileBounded(
        at: candidate.fileURL,
        maximumBytes: LocalNearIdentityAudioMatcher.hardMaximumFileBytes)
    else { return nil }

    guard let authoritativeCatalog,
      !observation.sourceNodeID.isEmpty,
      !observation.targetNodeID.isEmpty,
      let sourceBinding = authoritativeCatalog.fileBinding(for: observation.sourceNodeID),
      let targetBinding = authoritativeCatalog.fileBinding(for: observation.targetNodeID),
      sourceBinding.nodeID == observation.sourceNodeID,
      targetBinding.nodeID == observation.targetNodeID,
      sourceBinding.fileURL.standardizedFileURL == request.sourceURL.standardizedFileURL,
      targetBinding.fileURL.standardizedFileURL == candidate.fileURL.standardizedFileURL,
      sourceBinding.observation == currentSource,
      targetBinding.observation == currentTarget,
      let receipt = AudioMatchCoordinatorAuthorityReceipt(
        observation: observation,
        sourceBinding: sourceBinding,
        targetBinding: targetBinding)
    else {
      return observation
    }
    return observation.authorized(by: receipt)
  }

  private func independentlyRevalidateExcerpt(
    _ observation: AudioMatchObservation,
    request: AudioMatchRequest
  ) async -> AudioMatchObservation? {
    guard observation.capability == .excerptRetrieval,
      observation.algorithmFamily == LocalLandmarkAudioMatcher.excerptRetrievalAlgorithmFamily,
      observation.algorithmVersion == LocalLandmarkAudioMatcher.excerptRetrievalAlgorithmVersion,
      let sourceObservation = observation.sourceObservation,
      let targetObservation = observation.targetObservation,
      observation.excerptRetrieval?.exactSequenceVerified == true
    else { return nil }
    let matchingCandidates = request.candidates.filter { $0.nodeID == observation.targetNodeID }
    guard matchingCandidates.count == 1, let candidate = matchingCandidates.first else {
      return nil
    }
    let maximumBytes = LocalExcerptRetrievalPrototypeConfiguration.hardMaximumFileBytes
    let cancellationAwareProgress: @Sendable (URL, Int64) throws -> Void = { _, _ in
      if Task.isCancelled { throw CancellationError() }
    }
    guard
      let currentSource = try? AudioMatchSourceObservation.captureBounded(
        fileURL: request.sourceURL,
        maximumBytes: maximumBytes,
        progress: cancellationAwareProgress),
      let currentTarget = try? AudioMatchSourceObservation.captureBounded(
        fileURL: candidate.fileURL,
        maximumBytes: maximumBytes,
        progress: cancellationAwareProgress),
      currentSource == sourceObservation,
      currentTarget == targetObservation,
      let independent = try? await excerptRevalidator.match(request),
      independent.contains(observation),
      let finalSource = try? AudioMatchSourceObservation.captureBounded(
        fileURL: request.sourceURL,
        maximumBytes: maximumBytes,
        progress: cancellationAwareProgress),
      let finalTarget = try? AudioMatchSourceObservation.captureBounded(
        fileURL: candidate.fileURL,
        maximumBytes: maximumBytes,
        progress: cancellationAwareProgress),
      finalSource == sourceObservation,
      finalTarget == targetObservation
    else { return nil }
    return observation
  }
}

public struct AudioMatcherRegistry: Sendable {
  public let engines: [any AudioMatchingEngine]
  public let descriptors: [AudioMatcherDescriptor]

  public init(engines: [any AudioMatchingEngine], descriptors: [AudioMatcherDescriptor] = []) {
    self.engines = engines
    self.descriptors = engines.map(\.descriptor) + descriptors
  }

  public static func production() -> AudioMatcherRegistry {
    AudioMatcherRegistry(
      engines: [LocalNearIdentityAudioMatcher(), ProductionLocalSegmentMatcher()],
      descriptors: [
        AudioMatcherDescriptor(
          id: "local-landmark-excerpt-prototype",
          displayName: "Local excerpt retrieval prototype",
          algorithmVersion: LocalLandmarkAudioMatcher.excerptRetrievalAlgorithmVersion,
          capabilities: [.excerptRetrieval],
          availability: .unavailable(
            reason:
              "Research prototype only; held-out corpus calibration and production acceptance are unavailable."
          )),
        AudioMatcherDescriptor(
          id: "transformation-fingerprint", displayName: "Pitch/time transformation matcher",
          algorithmVersion: "unavailable-v1", capabilities: [.transformation],
          availability: .unavailable(
            reason:
              "Research capability only; transformed-use calibration and licensing review are unavailable."
          )),
        AudioMatcherDescriptor(
          id: "semantic-audio", displayName: "Semantic and musical-version audio retrieval",
          algorithmVersion: "unavailable-v1",
          capabilities: [.semantic, .sourceSeparatedRetrieval],
          availability: .unavailable(
            reason:
              "Research capability only; model rights and musical-similarity calibration are unavailable."
          )),
      ])
  }
}

private struct ProductionLocalSegmentMatcher: AudioMatchingEngine {
  private let matcher = LocalLandmarkAudioMatcher()

  let descriptor = AudioMatcherDescriptor(
    id: "local-landmark-segment",
    displayName: "Local exact-segment landmark matcher",
    algorithmVersion: LocalLandmarkAudioMatcher.algorithmVersion,
    capabilities: [.segment],
    availability: .available)

  func match(_ request: AudioMatchRequest) async throws -> [AudioMatchObservation] {
    try await matcher.match(request).filter { $0.capability == .segment }
  }
}
