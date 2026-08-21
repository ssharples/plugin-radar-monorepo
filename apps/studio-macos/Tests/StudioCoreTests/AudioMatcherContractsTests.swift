import Foundation
import Testing

@testable import StudioCore

@Suite("Pluggable audio matcher contracts")
struct AudioMatcherContractsTests {
  @Test("A well-covered segment match can create only a reversible derivative link")
  func segmentProposal() throws {
    let observation = AudioMatchObservation(
      sourceNodeID: "vocal-take", targetNodeID: "full-bounce",
      capability: .segment, score: 0.97, matchedCoverage: 0.96,
      runnerUpMargin: 0.32,
      sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 8),
      targetRange: AudioTimeRange(startSeconds: 41, durationSeconds: 8),
      explanation: "Landmarks align for the full query.", algorithmVersion: "landmark-v1",
      algorithmFamily: "landmark",
      resourceUsage: fixtureResourceUsage())

    let edge = try #require(
      AudioMatchProposalBuilder(
        calibration: acceptedCalibration(
          capability: .segment,
          family: "landmark",
          version: "landmark-v1")
      )
      .edge(from: observation))

    #expect(edge.relationship == .containedSegment)
    #expect(edge.confidence == .highConfidenceDerivative)
    #expect(
      AudioLineageAutomationPolicy().allowedActions(for: edge)
        == [.createReversibleLineageLink])
  }

  @Test("Transformation evidence records pitch and time without claiming identity")
  func transformedProposal() throws {
    let observation = AudioMatchObservation(
      sourceNodeID: "loop", targetNodeID: "resample",
      capability: .transformation, score: 0.94, matchedCoverage: 0.9,
      runnerUpMargin: 0.21,
      sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 12),
      targetRange: AudioTimeRange(startSeconds: 0, durationSeconds: 10.9),
      transform: AudioTransformEvidence(timeFactor: 0.91, pitchSemitones: -2),
      explanation: "Pitch/time tolerant landmarks align.", algorithmVersion: "transform-v1",
      algorithmFamily: "transform",
      resourceUsage: fixtureResourceUsage())

    let edge = try #require(
      AudioMatchProposalBuilder(
        calibration: acceptedCalibration(
          capability: .transformation,
          family: "transform",
          version: "transform-v1")
      )
      .edge(from: observation))

    #expect(edge.relationship == .transformedFrom)
    #expect(edge.confidence == .suggested)
    #expect(edge.calibrationID == nil)
    #expect(edge.transform?.pitchSemitones == -2)
  }

  @Test("Near-identical recording evidence stays derivative and records fingerprint details")
  func nearIdentityProposal() throws {
    let observation = AudioMatchObservation(
      sourceNodeID: "mix-print", targetNodeID: "aiff-conversion",
      capability: .nearIdentity, score: 0.99, matchedCoverage: 0.98,
      runnerUpMargin: 0.22,
      sourceRange: AudioTimeRange(startSeconds: 0.5, durationSeconds: 12.0),
      targetRange: AudioTimeRange(startSeconds: 0, durationSeconds: 12.0),
      coveredDurationSeconds: 12.0,
      fingerprintDigest: String(repeating: "1", count: 64),
      targetFingerprintDigest: String(repeating: "2", count: 64),
      fingerprintVersion: "fingerprint-v2",
      sourceObservation: AudioMatchSourceObservation(
        contentSHA256: String(repeating: "a", count: 64), bytes: 44_100,
        modifiedAtNanoseconds: 1234,
        resourceIdentity: "12:34"),
      targetObservation: AudioMatchSourceObservation(
        contentSHA256: String(repeating: "b", count: 64), bytes: 88_200,
        modifiedAtNanoseconds: 5678,
        resourceIdentity: "12:56"),
      explanation: "Trimmed full-recording fingerprints remained sequence-consistent.",
      algorithmVersion: "near-identity-v2",
      algorithmFamily: "near-identity",
      resourceUsage: fixtureResourceUsage())

    let edge = try #require(AudioMatchProposalBuilder().edge(from: observation))

    #expect(edge.relationship == .nearIdenticalRecording)
    #expect(edge.confidence == .suggested)
    #expect(edge.confidence != .verifiedIdentity)
    #expect(AudioLineageAutomationPolicy().allowedActions(for: edge) == [.queueForReview])
    #expect(
      edge.evidence.contains {
        $0.kind == .nearIdentityFingerprint
          && $0.explanation.contains(String(repeating: "1", count: 64))
          && $0.explanation.contains("12.00s")
      })
    #expect(
      edge.evidence.contains {
        $0.kind == .technicalMetadata
          && $0.explanation.contains(String(repeating: "a", count: 64))
          && $0.explanation.contains("12:34")
      })
    #expect(
      edge.evidence.contains {
        $0.kind == .technicalMetadata
          && $0.explanation.contains(String(repeating: "b", count: 64))
          && $0.explanation.contains("12:56")
      })
  }

  @Test("Caller-fabricated near-identity provenance remains suggestion-only")
  func nearIdentityRequiresMatcherAuthority() {
    let observation = AudioMatchObservation(
      sourceNodeID: "mix-print", targetNodeID: "aiff-conversion",
      capability: .nearIdentity, score: 0.99, matchedCoverage: 0.98,
      runnerUpMargin: 0.22,
      sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 12.0),
      targetRange: AudioTimeRange(startSeconds: 0, durationSeconds: 12.0),
      coveredDurationSeconds: 12,
      fingerprintDigest: String(repeating: "1", count: 64),
      targetFingerprintDigest: String(repeating: "2", count: 64),
      fingerprintVersion: "caller-fingerprint-v1",
      sourceObservation: AudioMatchSourceObservation(
        contentSHA256: String(repeating: "a", count: 64), bytes: 1),
      targetObservation: AudioMatchSourceObservation(
        contentSHA256: String(repeating: "b", count: 64), bytes: 1),
      explanation: "Caller supplied values without a matcher authority receipt.",
      algorithmVersion: "near-identity-v2",
      algorithmFamily: "near-identity",
      resourceUsage: fixtureResourceUsage())

    let edge = AudioMatchProposalBuilder(
      calibration: acceptedCalibration(
        capability: .nearIdentity,
        family: "near-identity",
        version: "near-identity-v2")
    )
    .edge(from: observation)
    #expect(edge?.confidence == .suggested)
    #expect(edge?.calibrationID == nil)
  }

  @Test("Only an accepted capability, family, and version calibration can promote evidence")
  func calibrationScopeMustMatch() throws {
    let observation = capturedNearIdentityObservation()
    let calibrations = [
      AudioMatchingCalibration(
        id: "generic", algorithmFamily: "near-identity",
        algorithmVersion: "near-identity-v2", materialClass: .mixedCorpus,
        validatedExampleCount: 100, validatedAt: Date(timeIntervalSince1970: 0),
        automaticScoreThreshold: 0.9, minimumCoverage: 0.8,
        minimumRunnerUpMargin: 0.15),
      acceptedCalibration(
        capability: .transformation,
        family: "near-identity",
        version: "near-identity-v2"),
      acceptedCalibration(
        capability: .nearIdentity,
        family: "different-family",
        version: "near-identity-v2"),
      acceptedCalibration(
        capability: .nearIdentity,
        family: "near-identity",
        version: "different-version"),
    ]

    for calibration in calibrations {
      let edge = try #require(
        AudioMatchProposalBuilder(calibration: calibration).edge(from: observation))
      #expect(edge.confidence == .suggested)
      #expect(edge.calibrationID == nil)
    }

    let accepted = try #require(
      AudioMatchProposalBuilder(
        calibration: acceptedCalibration(
          capability: .nearIdentity,
          family: "near-identity",
          version: "near-identity-v2")
      )
      .edge(from: observation))
    #expect(accepted.confidence == .suggested)
    #expect(accepted.calibrationID == nil)
    #expect(accepted.confidence != .verifiedIdentity)
  }

  @Test("Promotion requires held-out, rights, material, and resource acceptance")
  func calibrationAcceptanceGates() throws {
    let observation = AudioMatchObservation(
      sourceNodeID: "take", targetNodeID: "bounce", capability: .segment,
      score: 0.99, matchedCoverage: 0.99, runnerUpMargin: 0.8,
      sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 8),
      targetRange: AudioTimeRange(startSeconds: 12, durationSeconds: 8),
      explanation: "Held-out segment fixture.", algorithmVersion: "landmark-v1",
      algorithmFamily: "landmark", materialClass: .vocal,
      resourceUsage: fixtureResourceUsage())
    let invalid = [
      acceptedCalibration(
        capability: .segment, family: "landmark", version: "landmark-v1",
        materialClass: .fullMix),
      acceptedCalibration(
        capability: .segment, family: "landmark", version: "landmark-v1",
        materialClass: .vocal, heldOutPassed: false),
      acceptedCalibration(
        capability: .segment, family: "landmark", version: "landmark-v1",
        materialClass: .vocal, rightsReview: .pending),
      acceptedCalibration(
        capability: .segment, family: "landmark", version: "landmark-v1",
        materialClass: .vocal, maximumDurationSeconds: 4),
    ]

    for calibration in invalid {
      let edge = try #require(
        AudioMatchProposalBuilder(calibration: calibration).edge(from: observation))
      #expect(edge.confidence == .suggested)
      #expect(edge.calibrationID == nil)
    }

    let accepted = try #require(
      AudioMatchProposalBuilder(
        calibration: acceptedCalibration(
          capability: .segment, family: "landmark", version: "landmark-v1",
          materialClass: .vocal)
      ).edge(from: observation))
    #expect(accepted.confidence == .highConfidenceDerivative)
  }

  @Test("Codable observations persist evidence but never restore authority")
  func observationPersistenceDoesNotRestoreAuthority() throws {
    let observation = capturedNearIdentityObservation()
    let data = try JSONEncoder().encode(observation)
    let decoded = try JSONDecoder().decode(AudioMatchObservation.self, from: data)

    #expect(decoded == observation)
    #expect(decoded.sourceObservation == observation.sourceObservation)
    #expect(decoded.targetObservation == observation.targetObservation)
    #expect(decoded.fingerprintVersion == observation.fingerprintVersion)
    #expect(AudioMatchProposalBuilder().edge(from: decoded)?.confidence == .suggested)

    let calibration = acceptedCalibration(
      capability: .nearIdentity,
      family: "near-identity",
      version: "near-identity-v2")
    #expect(
      try JSONDecoder().decode(
        AudioMatchingCalibration.self,
        from: JSONEncoder().encode(calibration)) == calibration)
  }

  @Test("Accepted research calibrations remain suggestion-only")
  func semanticIsReviewOnly() throws {
    for capability in [
      AudioMatchingCapability.semantic,
      .sourceSeparatedRetrieval,
      .excerptRetrieval,
    ] {
      let observation = AudioMatchObservation(
        sourceNodeID: "query", targetNodeID: "candidate", capability: capability,
        score: 0.999,
        matchedCoverage: capability == .excerptRetrieval ? 9.0 / 11.0 : 1,
        runnerUpMargin: 0.9,
        sourceRange: capability == .excerptRetrieval
          ? AudioTimeRange(startSeconds: 0, durationSeconds: 6)
          : nil,
        targetRange: capability == .excerptRetrieval
          ? AudioTimeRange(startSeconds: 4, durationSeconds: 6)
          : nil,
        coveredDurationSeconds: capability == .excerptRetrieval ? 6 : nil,
        fingerprintDigest: capability == .excerptRetrieval
          ? String(repeating: "3", count: 64) : nil,
        targetFingerprintDigest: capability == .excerptRetrieval
          ? String(repeating: "4", count: 64) : nil,
        fingerprintVersion: capability == .excerptRetrieval ? "excerpt-v2" : nil,
        sourceObservation: capability == .excerptRetrieval
          ? AudioMatchSourceObservation(
            contentSHA256: String(repeating: "1", count: 64), bytes: 44_100)
          : nil,
        targetObservation: capability == .excerptRetrieval
          ? AudioMatchSourceObservation(
            contentSHA256: String(repeating: "2", count: 64), bytes: 88_200)
          : nil,
        excerptRetrieval: capability == .excerptRetrieval
          ? AudioExcerptRetrievalDiagnostics(
            windowDurationSeconds: 1.02,
            hopDurationSeconds: 0.51,
            matchedWindowCount: 9,
            consecutiveWindowCount: 9,
            totalQueryWindowCount: 11,
            candidateWindowCount: 26,
            offsetConsistency: 0.91,
            scoreDistribution: AudioScoreDistribution(
              minimum: 0.76, mean: 0.84, maximum: 0.92),
            exactSequenceVerified: true,
            requestedWindowDurationSeconds: 1,
            requestedHopDurationSeconds: 0.5,
            runnerUpMargin: 0.9,
            queryRange: AudioTimeRange(startSeconds: 0, durationSeconds: 6),
            referenceRange: AudioTimeRange(startSeconds: 4, durationSeconds: 6),
            approximateCandidateVisitCount: 44,
            exactSequenceComparisonCount: 30,
            sourceFingerprintFrameCount: 120,
            targetFingerprintFrameCount: 120,
            workingMemoryMeasuredBytes: 1_000_000,
            workingMemoryUpperBoundBytes: 2_000_000)
          : nil,
        explanation: "Embedding neighbours.", algorithmVersion: "embedding-v1",
        algorithmFamily: "embedding",
        resourceUsage: fixtureResourceUsage())
      let edge = try #require(
        AudioMatchProposalBuilder(
          calibration: acceptedCalibration(
            capability: capability,
            family: "embedding",
            version: "embedding-v1",
            rightsReview: .approved)
        ).edge(from: observation))

      #expect(edge.confidence == .suggested)
      #expect(edge.calibrationID == nil)
      #expect(AudioLineageAutomationPolicy().allowedActions(for: edge) == [.queueForReview])
      if capability == .excerptRetrieval {
        #expect(edge.evidence.first?.kind == .excerptSequenceAlignment)
        #expect(!edge.evidence.contains { $0.kind == .semanticEmbedding })
      }
    }
  }

  @Test("Excerpt proposals require exact sequence and immutable evidence")
  func excerptEvidenceFailsClosed() {
    let range = AudioTimeRange(startSeconds: 0, durationSeconds: 6)
    let observation = AudioMatchObservation(
      sourceNodeID: "query", targetNodeID: "candidate", capability: .excerptRetrieval,
      score: 0.99, matchedCoverage: 1, runnerUpMargin: 0.9,
      sourceRange: range,
      targetRange: AudioTimeRange(startSeconds: 12, durationSeconds: 6),
      excerptRetrieval: AudioExcerptRetrievalDiagnostics(
        windowDurationSeconds: 1.02, hopDurationSeconds: 0.51,
        matchedWindowCount: 10, consecutiveWindowCount: 10,
        totalQueryWindowCount: 10, candidateWindowCount: 20,
        offsetConsistency: 1,
        scoreDistribution: AudioScoreDistribution(minimum: 0.9, mean: 0.95, maximum: 1)),
      explanation: "Approximate-only evidence.",
      algorithmVersion: LocalLandmarkAudioMatcher.excerptRetrievalAlgorithmVersion,
      algorithmFamily: LocalLandmarkAudioMatcher.excerptRetrievalAlgorithmFamily,
      resourceUsage: fixtureResourceUsage())

    #expect(AudioMatchProposalBuilder().edge(from: observation) == nil)
  }

  @Test("Legacy excerpt diagnostics decode without fabricating exact sequence proof")
  func legacyExcerptDiagnosticsFailClosed() throws {
    let data = Data(
      """
      {
        "windowDurationSeconds": 1.0,
        "hopDurationSeconds": 0.5,
        "matchedWindowCount": 9,
        "consecutiveWindowCount": 9,
        "totalQueryWindowCount": 11,
        "candidateWindowCount": 24,
        "offsetConsistency": 0.9,
        "scoreDistribution": {"minimum": 0.7, "mean": 0.8, "maximum": 0.9}
      }
      """.utf8)

    let decoded = try JSONDecoder().decode(AudioExcerptRetrievalDiagnostics.self, from: data)

    #expect(!decoded.exactSequenceVerified)
    #expect(decoded.requestedWindowDurationSeconds == 1)
    #expect(decoded.requestedHopDurationSeconds == 0.5)
    #expect(decoded.exactSequenceComparisonCount == 0)
    #expect(decoded.queryRange == nil)
    #expect(decoded.referenceRange == nil)
  }

  @Test("Legacy resource usage decodes without inventing measured memory")
  func legacyResourceUsageDecodesMeasuredMemoryAsUnknown() throws {
    let data = Data(
      """
      {
        "sourceDurationSeconds": 6,
        "targetDurationSeconds": 8,
        "sourceFingerprintFrames": 120,
        "targetFingerprintFrames": 160,
        "candidateCount": 1,
        "sourceFileBytes": 1000,
        "targetFileBytes": 2000,
        "workingMemoryUpperBoundBytes": 3000000
      }
      """.utf8)

    let decoded = try JSONDecoder().decode(AudioMatchResourceUsage.self, from: data)

    #expect(decoded.workingMemoryMeasuredBytes == 0)
    #expect(decoded.workingMemoryUpperBoundBytes == 3_000_000)
  }

  @Test("Calibration rejects absent or zero measured memory evidence")
  func calibrationRejectsUnknownMemoryMeasurement() throws {
    let calibration = acceptedCalibration(
      capability: .segment,
      family: "landmark",
      version: "landmark-v1",
      materialClass: .vocal)
    let zeroMeasurement = AudioMatchResourceUsage(
      sourceDurationSeconds: 8,
      targetDurationSeconds: 8,
      sourceFingerprintFrames: 120,
      targetFingerprintFrames: 120,
      candidateCount: 1,
      sourceFileBytes: 1_000,
      targetFileBytes: 2_000,
      workingMemoryMeasuredBytes: 0,
      workingMemoryUpperBoundBytes: 2_000_000)

    for usage in [zeroMeasurement, nil] {
      let observation = AudioMatchObservation(
        sourceNodeID: "take",
        targetNodeID: "bounce",
        capability: .segment,
        score: 0.99,
        matchedCoverage: 0.99,
        runnerUpMargin: 0.8,
        sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 8),
        targetRange: AudioTimeRange(startSeconds: 12, durationSeconds: 8),
        explanation: "Unknown memory fixture.",
        algorithmVersion: "landmark-v1",
        algorithmFamily: "landmark",
        materialClass: .vocal,
        resourceUsage: usage)
      let edge = try #require(
        AudioMatchProposalBuilder(calibration: calibration).edge(from: observation))
      #expect(edge.confidence == .suggested)
      #expect(edge.calibrationID == nil)
    }
  }

  @Test("Generic calibration cannot promote transformed or musical similarity")
  func genericCalibrationCannotPromoteResearchSimilarity() throws {
    let calibration = AudioMatchingCalibration(
      id: "generic", algorithmFamily: "generic", materialClass: .mixedCorpus,
      validatedExampleCount: 1_000, validatedAt: Date(timeIntervalSince1970: 0),
      automaticScoreThreshold: 0.5, minimumCoverage: 0.5,
      minimumRunnerUpMargin: 0)
    let transformed = AudioMatchObservation(
      sourceNodeID: "query", targetNodeID: "transformed", capability: .transformation,
      score: 0.99, matchedCoverage: 0.99, runnerUpMargin: 0.9,
      sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 8),
      targetRange: AudioTimeRange(startSeconds: 0, durationSeconds: 8),
      transform: AudioTransformEvidence(timeFactor: 0.92, pitchSemitones: 2),
      explanation: "Research transformation match.", algorithmVersion: "transform-v1",
      algorithmFamily: "transform")
    let semantic = AudioMatchObservation(
      sourceNodeID: "query", targetNodeID: "musical", capability: .semantic,
      score: 0.99, matchedCoverage: 0.99, runnerUpMargin: 0.9,
      explanation: "Musical similarity.", algorithmVersion: "semantic-v1",
      algorithmFamily: "semantic")

    let transformedEdge = try #require(
      AudioMatchProposalBuilder(calibration: calibration).edge(from: transformed))
    let semanticEdge = try #require(
      AudioMatchProposalBuilder(calibration: calibration).edge(from: semantic))
    #expect(transformedEdge.confidence == .suggested)
    #expect(semanticEdge.confidence == .suggested)
    #expect(transformedEdge.calibrationID == nil)
    #expect(semanticEdge.calibrationID == nil)
  }

  @Test("Weak or ambiguous observations abstain")
  func abstains() {
    let observation = AudioMatchObservation(
      sourceNodeID: "short-hit", targetNodeID: "candidate", capability: .segment,
      score: 0.7, matchedCoverage: 0.2, runnerUpMargin: 0.01,
      explanation: "One common transient matched.", algorithmVersion: "landmark-v1")

    #expect(AudioMatchProposalBuilder().edge(from: observation) == nil)
  }

  @Test("Strong observations remain suggestions without corpus calibration")
  func uncalibratedIsReviewOnly() throws {
    let observation = AudioMatchObservation(
      sourceNodeID: "query", targetNodeID: "candidate", capability: .segment,
      score: 0.99, matchedCoverage: 0.99, runnerUpMargin: 0.8,
      sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 10),
      targetRange: AudioTimeRange(startSeconds: 12, durationSeconds: 10),
      explanation: "Strong but uncalibrated match.", algorithmVersion: "experimental-v1")

    let edge = try #require(AudioMatchProposalBuilder().edge(from: observation))
    #expect(edge.confidence == .suggested)
    #expect(edge.calibrationID == nil)
  }
}

private func acceptedCalibration(
  capability: AudioMatchingCapability,
  family: String,
  version: String,
  materialClass: AudioMaterialClass = .mixedCorpus,
  heldOutPassed: Bool = true,
  rightsReview: AudioMatchingRightsReview? = nil,
  maximumDurationSeconds: Double = 900
) -> AudioMatchingCalibration {
  AudioMatchingCalibration(
    id: "accepted-\(capability.rawValue)", algorithmFamily: family,
    algorithmVersion: version, materialClass: materialClass,
    validatedExampleCount: 100, validatedAt: Date(timeIntervalSince1970: 0),
    automaticScoreThreshold: 0.9, minimumCoverage: 0.8, minimumRunnerUpMargin: 0.15,
    capability: capability, acceptance: .accepted,
    heldOutEvaluation: AudioMatchingHeldOutEvaluation(
      id: "held-out-\(capability.rawValue)", exampleCount: 100,
      evaluatedAt: Date(timeIntervalSince1970: 0), passed: heldOutPassed),
    rightsReview: rightsReview
      ?? (capability == .transformation ? .approved : .notRequired),
    resourceBudget: AudioMatchingResourceBudget(
      maximumDurationSeconds: maximumDurationSeconds,
      maximumFingerprintFrames: 10_000,
      maximumCandidateCount: 64,
      maximumFileBytes: 8_000_000_000,
      maximumWorkingMemoryBytes: 64_000_000))
}

private func fixtureResourceUsage() -> AudioMatchResourceUsage {
  AudioMatchResourceUsage(
    sourceDurationSeconds: 12,
    targetDurationSeconds: 12,
    sourceFingerprintFrames: 120,
    targetFingerprintFrames: 120,
    candidateCount: 1,
    sourceFileBytes: 44_100,
    targetFileBytes: 88_200,
    workingMemoryMeasuredBytes: 1_000_000,
    workingMemoryUpperBoundBytes: 2_000_000)
}

private func capturedNearIdentityObservation() -> AudioMatchObservation {
  AudioMatchObservation(
    sourceNodeID: "mix-print", targetNodeID: "aiff-conversion",
    capability: .nearIdentity, score: 0.99, matchedCoverage: 0.98,
    runnerUpMargin: 0.22,
    sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 12),
    targetRange: AudioTimeRange(startSeconds: 0, durationSeconds: 12),
    coveredDurationSeconds: 12,
    fingerprintDigest: String(repeating: "1", count: 64),
    targetFingerprintDigest: String(repeating: "2", count: 64),
    fingerprintVersion: "fingerprint-v2",
    sourceObservation: AudioMatchSourceObservation(
      contentSHA256: String(repeating: "a", count: 64), bytes: 44_100,
      modifiedAtNanoseconds: 1234, resourceIdentity: "12:34"),
    targetObservation: AudioMatchSourceObservation(
      contentSHA256: String(repeating: "b", count: 64), bytes: 88_200,
      modifiedAtNanoseconds: 5678, resourceIdentity: "12:56"),
    explanation: "Full-recording fingerprints remained sequence-consistent.",
    algorithmVersion: "near-identity-v2",
    algorithmFamily: "near-identity",
    resourceUsage: fixtureResourceUsage())
}
