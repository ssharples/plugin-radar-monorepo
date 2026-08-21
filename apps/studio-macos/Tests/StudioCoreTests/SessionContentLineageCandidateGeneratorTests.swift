import Foundation
import Testing

@testable import StudioCore

@Suite("Session content MinHash candidate generation")
struct SessionContentLineageCandidateGeneratorTests {
  @Test("Prefiltered exact resolution matches the full exact decision for asymmetric containment")
  func exactDecisionParity() throws {
    let source = manifest(
      sessionID: "idea005",
      artistID: "artist",
      anchors: [
        anchor("vocal", .projectRecording, at: 0, frequency: 1),
        anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
        anchor("arrangement", .clipPlacement, at: 8, frequency: 1),
      ]
    )
    let ancestor = lineageCandidate(
      workID: "song",
      sessionID: "older",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [
        anchor("vocal", .projectRecording, at: 0, frequency: 1),
        anchor("guitar", .derivedProjectAudio, at: 16, frequency: 1),
      ]
    )
    let runnerUp = lineageCandidate(
      workID: "runner-up",
      sessionID: "runner",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [
        anchor("vocal", .projectRecording, at: 0, frequency: 1)
      ]
    )
    let unrelated = lineageCandidate(
      workID: "other",
      sessionID: "other",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [
        anchor("piano", .projectRecording, at: 0, frequency: 1),
        anchor("synth", .derivedProjectAudio, at: 4, frequency: 1),
      ]
    )
    let candidates = [ancestor, runnerUp, unrelated]
    let resolver = SessionContentLineageResolver(calibration: lineageCalibration())
    let exact = resolver.resolve(
      source: source,
      sourceReference: reference(sessionID: "idea005", workID: "idea", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: candidates
    )
    let selection = SessionContentLineageCandidateGenerator().generate(
      source: source,
      candidates: candidates
    )
    let prefiltered = resolver.resolve(
      source: source,
      sourceReference: reference(sessionID: "idea005", workID: "idea", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: selection.candidates
    )

    #expect(selection.metadata.candidatePoolCount == 3)
    #expect(selection.metadata.shortlistedCandidateCount == 3)
    #expect(selection.metadata.exactComparisonCandidateCount == 3)
    #expect(selection.metadata.exactComparisonCandidateLimit == 24)
    #expect(selection.metadata.exhaustiveFallbackUsed)
    #expect(selection.metadata.fallbackDisposition == .unprovenSketchCoverage)
    #expect(exact == prefiltered)
  }

  @Test("Dense overlap uses the explicit bounded exhaustive fallback before exact recomputation")
  func shortlistUsesBoundedExhaustiveFallback() {
    let source = manifest(
      sessionID: "idea-bounded",
      artistID: "artist",
      anchors: [
        anchor("shared-a", .projectRecording, at: 0, frequency: 1),
        anchor("shared-b", .derivedProjectAudio, at: 8, frequency: 1),
      ]
    )
    let generator = SessionContentLineageCandidateGenerator(
      signatureCount: 32,
      bandSize: 1,
      maximumExactComparisonCandidates: 3)
    let candidates: [SessionLineageCandidate] = (0..<8).map { index in
      let beat = Double(index)
      let midBeat = Double(index + 8)
      let trailingBeat = Double(index + 16)
      let variantID = "variant-\(index)"
      return lineageCandidate(
        workID: "song-\(index)",
        sessionID: "session-\(index)",
        artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100),
        anchors: [
          anchor("shared-a", .projectRecording, at: beat, frequency: 1),
          anchor("shared-b", .derivedProjectAudio, at: midBeat, frequency: 1),
          anchor(variantID, .clipPlacement, at: trailingBeat, frequency: 1),
        ]
      )
    }

    let selection = generator.generate(source: source, candidates: candidates)

    #expect(selection.metadata.exhaustiveFallbackUsed)
    #expect(selection.metadata.fallbackDisposition == .denseOverlap)
    #expect(selection.metadata.parityDisposition == .boundedExhaustiveFallback)
    #expect(selection.metadata.candidatePoolCount == 8)
    #expect(selection.metadata.deterministicOverlapCandidateCount == 8)
    #expect(selection.metadata.shortlistedCandidateCount == 8)
    #expect(selection.metadata.exactComparisonCandidateLimit == 24)
    #expect(selection.metadata.exactComparisonCandidateCount == 8)
    #expect(selection.candidates.count == 8)
  }

  @Test("A sketch miss uses explicit bounded exhaustive recovery")
  func sketchMissUsesBoundedExhaustiveRecovery() {
    let sourceAnchors = (0..<20).map { index in
      anchor("source-\(index)", .projectRecording, at: Double(index), frequency: 1)
    }
    let candidate = lineageCandidate(
      workID: "sparse-overlap",
      sessionID: "sparse-overlap-session",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [sourceAnchors[0]]
    )

    let selection = SessionContentLineageCandidateGenerator(
      signatureCount: 8,
      bandSize: 8
    ).generate(
      source: manifest(sessionID: "source", artistID: "artist", anchors: sourceAnchors),
      candidates: [candidate]
    )

    #expect(selection.metadata.deterministicOverlapCandidateCount == 1)
    #expect(selection.metadata.sketchBandCandidateCount == 0)
    #expect(selection.metadata.exhaustiveFallbackUsed)
    #expect(selection.metadata.fallbackDisposition == .unprovenSketchCoverage)
    #expect(selection.metadata.parityDisposition == .boundedExhaustiveFallback)
    #expect(selection.candidates.map(\.workID) == ["sparse-overlap"])
  }

  @Test("Dense overlap preserves the exact winner and runner-up inside the bound")
  func denseOverlapPreservesWinnerAndRunnerUp() throws {
    let source = manifest(
      sessionID: "dense-source",
      artistID: "artist",
      anchors: [
        anchor("shared-a", .projectRecording, at: 0, frequency: 1),
        anchor("shared-b", .derivedProjectAudio, at: 8, frequency: 1),
        anchor("shared-c", .clipPlacement, at: 16, frequency: 1),
      ]
    )
    let distractors = (0..<10).map { index in
      lineageCandidate(
        workID: "distractor-\(index)",
        sessionID: "distractor-session-\(index)",
        artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100),
        anchors: [
          anchor("shared-a", .projectRecording, at: Double(index), frequency: 1),
          anchor("noise-\(index)", .derivedProjectAudio, at: Double(index + 1), frequency: 1),
        ]
      )
    }
    let runner = lineageCandidate(
      workID: "runner",
      sessionID: "runner-session",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [
        anchor("shared-a", .projectRecording, at: 0, frequency: 1),
        anchor("shared-b", .derivedProjectAudio, at: 8, frequency: 1),
        anchor("runner-extra", .clipPlacement, at: 32, frequency: 1),
      ]
    )
    let winner = lineageCandidate(
      workID: "winner",
      sessionID: "winner-session",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: source.anchors
    )
    let candidates = distractors + [runner, winner]
    let resolver = SessionContentLineageResolver(calibration: lineageCalibration())
    let sourceReference = reference(
      sessionID: "dense-source", workID: "source-work", revisionID: "source-revision")
    let exact = resolver.resolve(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: candidates
    )
    let selection = SessionContentLineageCandidateGenerator(
      maximumExactComparisonCandidates: 2
    ).generate(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: candidates
    )
    let bounded = resolver.resolve(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: selection.candidates
    )

    #expect(Set(selection.candidates.map(\.workID)).isSuperset(of: ["winner", "runner"]))
    #expect(selection.metadata.parityDisposition == .boundedExhaustiveFallback)
    #expect(exact == bounded)
  }

  @Test("Exact ties preserve winner and runner-up despite different retrieval rank evidence")
  func tiedWinnerAndRunnerUpParityWithDivergentRetrievalEvidence() throws {
    let anchors = [
      anchor("single-heavy", .projectRecording, at: nil, frequency: 1),
      anchor("split-light-a", .projectRecording, at: nil, frequency: 4),
      anchor("split-light-b", .projectRecording, at: nil, frequency: 4),
    ]
    let source = manifest(sessionID: "tie-source", artistID: "artist", anchors: anchors)
    let candidates = [
      lineageCandidate(
        workID: "z-third", sessionID: "session-z", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100),
        anchors: Array(anchors.dropFirst())),
      lineageCandidate(
        workID: "b-runner", sessionID: "session-b", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100),
        anchors: Array(anchors.dropFirst())),
      lineageCandidate(
        workID: "a-winner", sessionID: "session-a", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100),
        anchors: [anchors[0]]),
    ]
    let sourceReference = reference(
      sessionID: "tie-source", workID: "source-work", revisionID: "tie-revision")
    let resolver = SessionContentLineageResolver(calibration: lineageCalibration())
    let exhaustive = resolver.resolve(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: candidates)
    let selection = SessionContentLineageCandidateGenerator(
      maximumExactComparisonCandidates: 2
    ).generate(source: source, candidates: candidates)
    let bounded = resolver.resolve(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: selection.candidates)

    let retrievalByWork = Dictionary(
      uniqueKeysWithValues: selection.retrievalEvidence.map { ($0.workID, $0) })
    #expect(retrievalByWork["a-winner"]?.sharedIdentityCount == 1)
    #expect(retrievalByWork["b-runner"]?.sharedIdentityCount == 2)
    #expect(selection.metadata.parityDisposition == .boundedExhaustiveFallback)
    #expect(selection.metadata.candidatePoolCount == 3)
    #expect(selection.metadata.exactComparisonCandidateCount == 3)
    #expect(exhaustive.candidates.map(\.score).allSatisfy { $0 == exhaustive.candidates[0].score })
    #expect(exhaustive.candidates.prefix(2).map(\.workID) == ["a-winner", "b-runner"])
    #expect(exhaustive == bounded)
    #expect(exhaustive.bestCandidate?.observation.runnerUpMargin == 0)
    #expect(bounded.bestCandidate?.observation.runnerUpMargin == 0)
  }

  @Test("Unprovable overlap beyond the exhaustive ceiling abstains instead of truncating")
  func unprovableLargePoolAbstains() {
    let anchors = [
      anchor("shared-a", .projectRecording, at: 0, frequency: 1),
      anchor("shared-b", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let candidates = (0..<6).map { index in
      lineageCandidate(
        workID: "work-\(index)", sessionID: "session-\(index)", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100), anchors: anchors)
    }
    let selection = SessionContentLineageCandidateGenerator(
      exhaustiveFallbackCandidateLimit: 4,
      maximumExactComparisonCandidates: 2
    ).generate(
      source: manifest(sessionID: "source", artistID: "artist", anchors: anchors),
      candidates: candidates)

    #expect(selection.candidates.isEmpty)
    #expect(selection.metadata.shortlistedCandidateCount <= 5)
    #expect(selection.metadata.exactComparisonCandidateCount == 0)
    #expect(selection.metadata.exactComparisonCandidateLimit == 4)
    #expect(selection.metadata.fallbackDisposition == .safetyCeilingExceeded)
    #expect(selection.metadata.parityDisposition == .abstainedUnproven)
  }

  @Test("Decision-zero manifests preserve exhaustive ordering and durable rejection semantics")
  func suppressedAnchorsPreserveCompleteExactResolution() {
    let sourceAnchors = [
      anchor("common", .projectRecording, at: 0, frequency: 50),
      anchor("library", .externalLibrarySample, at: 8, frequency: 1),
      anchor("template", .templateStructure, at: nil, frequency: 1),
      anchor(
        "reference:/mutable.wav", .projectRecording, at: 16, frequency: 1,
        identityEvidence: .mutableReference),
    ]
    let source = manifest(sessionID: "source", artistID: "artist", anchors: sourceAnchors)
    let candidates = [
      lineageCandidate(
        workID: "a-common", sessionID: "common", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100), anchors: [sourceAnchors[0]]),
      lineageCandidate(
        workID: "b-library", sessionID: "library", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100), anchors: [sourceAnchors[1]]),
      lineageCandidate(
        workID: "c-template", sessionID: "template", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100), anchors: [sourceAnchors[2]]),
      lineageCandidate(
        workID: "d-mutable", sessionID: "mutable", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100), anchors: [sourceAnchors[3]]),
    ]
    let sourceReference = reference(
      sessionID: source.sessionID, workID: "source-work", revisionID: "source-revision")
    let rejectedWorkIDs: Set<String> = ["a-common"]
    let resolver = SessionContentLineageResolver(calibration: lineageCalibration())
    let exhaustive = resolver.resolve(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: candidates,
      rejectedWorkIDs: rejectedWorkIDs)
    let selection = SessionContentLineageCandidateGenerator().generate(
      source: source, candidates: candidates)
    let bounded = resolver.resolve(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: selection.candidates,
      rejectedWorkIDs: rejectedWorkIDs)

    #expect(selection.candidates.map(\.workID) == candidates.map(\.workID))
    #expect(selection.metadata.deterministicOverlapCandidateCount == 0)
    #expect(selection.metadata.sketchBandCandidateCount == 0)
    #expect(selection.metadata.exactComparisonCandidateCount == 4)
    #expect(selection.metadata.parityDisposition == .boundedExhaustiveFallback)
    #expect(selection.metadata.fallbackDisposition == .unprovenSketchCoverage)
    #expect(exhaustive.candidates.allSatisfy { $0.score == 0 })
    #expect(exhaustive.candidates.map(\.workID) == candidates.map(\.workID))
    #expect(exhaustive.confidence == .conflicted)
    #expect(exhaustive == bounded)
  }

  @Test("Full-session and unknown-duration evidence remains retrievable for review")
  func reviewOnlyEvidenceRemainsRetrievable() throws {
    let anchors = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let source = SessionContentManifest(
      sessionID: "source",
      artistID: "artist",
      anchors: anchors,
      setRevisionIDs: ["old", "new"],
      evidenceScope: .fullSession,
      audioDurationPolicy: .unknown)
    let selection = SessionContentLineageCandidateGenerator(
      maximumExactComparisonCandidates: 2
    ).generate(
      source: source,
      candidates: [
        lineageCandidate(
          workID: "target",
          sessionID: "target-session",
          artistID: "artist",
          timestamp: .init(timeIntervalSince1970: 100),
          anchors: anchors)
      ])

    #expect(selection.candidates.map(\.workID) == ["target"])
    #expect(selection.metadata.exactComparisonCandidateCount == 1)
    let resolution = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: reference(
        sessionID: "source", workID: "source-work", revisionID: "source-revision"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: selection.candidates
    )
    let best = try #require(resolution.bestCandidate)
    #expect(resolution.selectedWorkID == nil)
    #expect(resolution.proposedWorkID == "target")
    #expect(resolution.confidence == .suggested)
    #expect(best.observation.conflicts.contains(.incompatibleEvidenceScope))
  }

  @Test("Empty and tiny unrelated pools preserve the exhaustive decision")
  func emptyAndTinyPools() {
    let source = manifest(
      sessionID: "tiny-source",
      artistID: "artist",
      anchors: [anchor("source-only", .projectRecording, at: 0, frequency: 1)]
    )
    let sourceReference = reference(
      sessionID: "tiny-source", workID: "tiny-work", revisionID: "tiny-revision")
    let generator = SessionContentLineageCandidateGenerator()
    let empty = generator.generate(source: source, candidates: [])

    #expect(empty.candidates.isEmpty)
    #expect(empty.metadata.candidatePoolCount == 0)
    #expect(empty.metadata.shortlistedCandidateCount == 0)
    #expect(empty.metadata.exactComparisonCandidateCount == 0)
    #expect(empty.metadata.fallbackDisposition == .notRequired)
    #expect(empty.metadata.parityDisposition == .guaranteed)

    let unrelated = lineageCandidate(
      workID: "unrelated",
      sessionID: "unrelated-session",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [anchor("candidate-only", .projectRecording, at: 0, frequency: 1)]
    )
    let exhaustive = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [unrelated]
    )
    let tiny = generator.generate(source: source, candidates: [unrelated])
    let prefiltered = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: tiny.candidates
    )

    #expect(tiny.candidates == [unrelated])
    #expect(tiny.metadata.candidatePoolCount == 1)
    #expect(tiny.metadata.shortlistedCandidateCount == 1)
    #expect(tiny.metadata.exactComparisonCandidateCount == 1)
    #expect(tiny.metadata.fallbackDisposition == .unprovenSketchCoverage)
    #expect(exhaustive == prefiltered)
  }

  @Test("Close runner-up and chronology conflicts survive the sketch shortlist")
  func conflictParity() throws {
    let anchors = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let source = manifest(sessionID: "idea", artistID: "artist", anchors: anchors)
    let first = lineageCandidate(
      workID: "first",
      sessionID: "first",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: anchors
    )
    let second = lineageCandidate(
      workID: "second",
      sessionID: "second",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: anchors
    )
    let newerConflict = lineageCandidate(
      workID: "newer",
      sessionID: "newer",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 300),
      anchors: anchors
    )
    let unrelated = lineageCandidate(
      workID: "other",
      sessionID: "other",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [anchor("drums", .projectRecording, at: 0, frequency: 1)]
    )
    let candidates = [first, second, newerConflict, unrelated]
    let resolver = SessionContentLineageResolver(calibration: lineageCalibration())
    let exact = resolver.resolve(
      source: source,
      sourceReference: reference(sessionID: "idea", workID: "idea-work", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: candidates
    )
    let prefiltered = resolver.resolve(
      source: source,
      sourceReference: reference(sessionID: "idea", workID: "idea-work", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: SessionContentLineageCandidateGenerator().generate(
        source: source,
        candidates: candidates
      ).candidates
    )
    let exactChronologyConflict = try #require(
      exact.candidates.first { $0.workID == newerConflict.workID })
    let prefilteredChronologyConflict = try #require(
      prefiltered.candidates.first { $0.workID == newerConflict.workID })

    #expect(
      exact.bestCandidate?.observation.conflicts == prefiltered.bestCandidate?.observation.conflicts
    )
    #expect(
      exact.bestCandidate?.observation.runnerUpMargin
        == prefiltered.bestCandidate?.observation.runnerUpMargin)
    #expect(exactChronologyConflict.observation.conflicts.contains(.chronologyMismatch))
    #expect(exactChronologyConflict == prefilteredChronologyConflict)
    #expect(exact == prefiltered)
  }

  @Test("Candidate generation metadata round-trips without changing exact algorithm version")
  func candidateGenerationMetadataRoundTrips() throws {
    let metadata = SessionContentCandidateGenerationMetadata(
      algorithmFamily: SessionContentLineageCandidateGenerator.algorithmFamily,
      algorithmVersion: SessionContentLineageCandidateGenerator.algorithmVersion,
      candidatePoolCount: 9,
      shortlistedCandidateCount: 5,
      exactComparisonCandidateCount: 3,
      exactComparisonCandidateLimit: 4,
      deterministicOverlapCandidateCount: 2,
      sketchBandCandidateCount: 4,
      exhaustiveFallbackUsed: false,
      fallbackDisposition: .notRequired,
      sourceManifestToken: "source-token",
      candidatePoolToken: "pool-token",
      invalidationToken: "invalidate-token"
    )
    let review = SessionContentReviewCandidate(
      id: "review",
      sessionID: "idea",
      sourceWorkID: "source",
      candidateWorkID: "target",
      relationship: .sameWork,
      score: 0.9,
      matchedAnchorIDs: ["a"],
      explanation: "Review required.",
      calibrationID: "calibration",
      candidateGeneration: metadata
    )
    let assignment = SessionContentAutomaticAssignment(
      sessionID: "idea",
      sourceWorkID: "source",
      workID: "target",
      relationship: .sameWork,
      score: 0.95,
      calibrationID: "calibration",
      matchedAnchorIDs: ["a"],
      explanation: "Auto attached.",
      candidateGeneration: metadata,
      observationID: "observation-1",
      decisionRecordedAt: Date(timeIntervalSince1970: 10),
      rankedCandidateEvidence: []
    )
    let encoder = PropertyListEncoder()
    let decoder = PropertyListDecoder()

    let decodedReview = try decoder.decode(
      SessionContentReviewCandidate.self,
      from: try encoder.encode(review)
    )
    let decodedAssignment = try decoder.decode(
      SessionContentAutomaticAssignment.self,
      from: try encoder.encode(assignment)
    )

    #expect(decodedReview.algorithmVersion == SessionContentLineageResolver.algorithmVersion)
    #expect(decodedAssignment.algorithmVersion == SessionContentLineageResolver.algorithmVersion)
    #expect(decodedReview.candidateGeneration == metadata)
    #expect(decodedAssignment.candidateGeneration == metadata)
    #expect(decodedReview.candidateGeneration?.fallbackDisposition == .notRequired)
    #expect(decodedReview.candidateGeneration?.parityDisposition == .guaranteed)
    #expect(decodedAssignment.observationID == "observation-1")
    #expect(decodedAssignment.decisionRecordedAt == Date(timeIntervalSince1970: 10))
    #expect(decodedAssignment.rankedCandidateEvidence == [])
  }

  @Test("Tokens and retrieval order are deterministic across pool permutations")
  func tokensAndRetrievalAreDeterministicAcrossPoolPermutations() {
    let anchors = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
      anchor("placement", .clipPlacement, at: 16, frequency: 2),
    ]
    let source = manifest(sessionID: "deterministic-source", artistID: "artist", anchors: anchors)
    let candidates = [
      lineageCandidate(
        workID: "work-b", sessionID: "session-b", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100), anchors: Array(anchors.prefix(2))),
      lineageCandidate(
        workID: "work-a", sessionID: "session-a", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 90), anchors: anchors),
      lineageCandidate(
        workID: "work-c", sessionID: "session-c", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 80),
        anchors: [anchor("unrelated", .projectRecording, at: 0, frequency: 1)]),
    ]
    let generator = SessionContentLineageCandidateGenerator(
      maximumExactComparisonCandidates: 2)
    let forward = generator.generate(source: source, candidates: candidates)
    let reversed = generator.generate(source: source, candidates: Array(candidates.reversed()))

    #expect(forward.candidates == reversed.candidates)
    #expect(forward.retrievalEvidence == reversed.retrievalEvidence)
    #expect(forward.metadata == reversed.metadata)
  }

  @Test("Stable candidate evidence invalidates tokens while review time remains volatile")
  func candidateEvidenceChangeInvalidatesPersistedToken() {
    let anchors = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let source = manifest(sessionID: "token-source", artistID: "artist", anchors: anchors)
    let original = lineageCandidate(
      workID: "work", sessionID: "candidate", artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100), anchors: anchors)
    let changedReference = reference(
      sessionID: "candidate", workID: "work", revisionID: "changed-revision")
    let changed = SessionLineageCandidate(
      workID: original.workID,
      sessionID: original.sessionID,
      artistID: original.artistID,
      manifest: original.manifest,
      reviewRevisionReference: changedReference,
      evidenceRevisionReferences: [changedReference],
      revisionTimestamp: original.revisionTimestamp
    )
    let changedDisplaySnapshot = reference(
      sessionID: "candidate",
      workID: "work",
      revisionID: "rev-candidate",
      revisionName: "Renamed revision")
    let changedDisplayCandidate = SessionLineageCandidate(
      workID: original.workID,
      sessionID: original.sessionID,
      artistID: original.artistID,
      manifest: original.manifest,
      reviewRevisionReference: changedDisplaySnapshot,
      evidenceRevisionReferences: [changedDisplaySnapshot],
      revisionTimestamp: original.revisionTimestamp)
    let changedReviewedAt = reference(
      sessionID: "candidate",
      workID: "work",
      revisionID: "rev-candidate",
      reviewedAt: .init(timeIntervalSince1970: 99))
    let changedReviewedAtCandidate = SessionLineageCandidate(
      workID: original.workID,
      sessionID: original.sessionID,
      artistID: original.artistID,
      manifest: original.manifest,
      reviewRevisionReference: changedReviewedAt,
      evidenceRevisionReferences: [changedReviewedAt],
      revisionTimestamp: original.revisionTimestamp)
    let generator = SessionContentLineageCandidateGenerator()
    let baseline = generator.generate(source: source, candidates: [original]).metadata
    let refreshed = generator.generate(source: source, candidates: [changed]).metadata
    let displayRefreshed = generator.generate(
      source: source, candidates: [changedDisplayCandidate]
    ).metadata
    let reviewedAtRefreshed = generator.generate(
      source: source, candidates: [changedReviewedAtCandidate]
    ).metadata

    #expect(baseline.sourceManifestToken == refreshed.sourceManifestToken)
    #expect(baseline.candidatePoolToken != refreshed.candidatePoolToken)
    #expect(baseline.invalidationToken != refreshed.invalidationToken)
    #expect(baseline.candidatePoolToken != displayRefreshed.candidatePoolToken)
    #expect(baseline.invalidationToken != displayRefreshed.invalidationToken)
    #expect(baseline.candidatePoolToken == reviewedAtRefreshed.candidatePoolToken)
    #expect(baseline.invalidationToken == reviewedAtRefreshed.invalidationToken)
  }

  @Test("Seeded small corpora preserve exhaustive exact decisions and ordering")
  func seededSmallCorpusDecisionParity() {
    var random = CandidateGeneratorTestRandom(state: 0xB4C0_FFEE_1234_5678)
    let resolver = SessionContentLineageResolver(calibration: lineageCalibration())
    let generator = SessionContentLineageCandidateGenerator(
      signatureCount: 16,
      bandSize: 4,
      exhaustiveFallbackCandidateLimit: 12,
      maximumExactComparisonCandidates: 3
    )

    for iteration in 0..<80 {
      let sourceAnchors = (0..<(2 + random.nextInt(upperBound: 6))).map { index in
        randomEligibleAnchor(identity: "shared-\(index)", random: &random)
      }
      let source = manifest(
        sessionID: "random-source-\(iteration)",
        artistID: "artist",
        anchors: sourceAnchors
      )
      let sourceReference = reference(
        sessionID: source.sessionID,
        workID: "random-source-work-\(iteration)",
        revisionID: "random-source-revision-\(iteration)"
      )
      let candidateCount = random.nextInt(upperBound: 9)
      let candidates = (0..<candidateCount).map { candidateIndex in
        let shared = sourceAnchors.filter { _ in random.nextInt(upperBound: 3) != 0 }
        let extra = (0..<random.nextInt(upperBound: 3)).map { extraIndex in
          randomEligibleAnchor(
            identity: "extra-\(iteration)-\(candidateIndex)-\(extraIndex)",
            random: &random)
        }
        return lineageCandidate(
          workID: "work-\(candidateIndex)",
          sessionID: "session-\(candidateIndex)",
          artistID: random.nextInt(upperBound: 5) == 0 ? "other-artist" : "artist",
          timestamp: .init(
            timeIntervalSince1970: random.nextInt(upperBound: 5) == 0 ? 300 : 100),
          anchors: shared + extra
        )
      }
      let exhaustive = resolver.resolve(
        source: source,
        sourceReference: sourceReference,
        sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
        candidates: candidates
      )
      let selection = generator.generate(source: source, candidates: candidates)
      let prefiltered = resolver.resolve(
        source: source,
        sourceReference: sourceReference,
        sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
        candidates: selection.candidates
      )
      #expect(selection.metadata.parityDisposition != .abstainedUnproven)
      #expect(exhaustive == prefiltered, "iteration \(iteration)")
    }
  }

  @Test("Sketch invalidation token changes when manifest context or sketch version changes")
  func invalidationTokenChangesWhenContextChanges() {
    let source = manifest(
      sessionID: "idea",
      artistID: "artist",
      anchors: [
        anchor("vocal", .projectRecording, at: 0, frequency: 1),
        anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
      ]
    )
    let candidate = lineageCandidate(
      workID: "song",
      sessionID: "known",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [
        anchor("vocal", .projectRecording, at: 0, frequency: 1),
        anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
      ]
    )
    let sourceReference = reference(
      sessionID: "idea", workID: "idea-work", revisionID: "source-v1")
    let baseline = SessionContentLineageCandidateGenerator().generate(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: Date(timeIntervalSince1970: 200),
      candidates: [candidate]
    ).metadata
    let changedSource = manifest(
      sessionID: "idea",
      artistID: "artist",
      anchors: [
        anchor("vocal", .projectRecording, at: 0, frequency: 1),
        anchor("guitar-mutated", .derivedProjectAudio, at: 8, frequency: 1),
      ]
    )
    let changedManifestMetadata = SessionContentLineageCandidateGenerator().generate(
      source: changedSource,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: Date(timeIntervalSince1970: 200),
      candidates: [candidate]
    ).metadata
    let changedVersionMetadata = SessionContentLineageCandidateGenerator(
      signatureCount: 64,
      maximumExactComparisonCandidates: 12
    ).generate(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: Date(timeIntervalSince1970: 200),
      candidates: [candidate]
    ).metadata
    let changedReferenceMetadata = SessionContentLineageCandidateGenerator().generate(
      source: source,
      sourceReference: reference(
        sessionID: "idea", workID: "idea-work", revisionID: "source-v2"),
      sourceRevisionTimestamp: Date(timeIntervalSince1970: 200),
      candidates: [candidate]
    ).metadata
    let changedChronologyMetadata = SessionContentLineageCandidateGenerator().generate(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: Date(timeIntervalSince1970: 201),
      candidates: [candidate]
    ).metadata
    let changedScopeMetadata = SessionContentLineageCandidateGenerator().generate(
      source: SessionContentManifest(
        sessionID: source.sessionID,
        artistID: source.artistID,
        anchors: source.anchors,
        evidenceScope: .activeRevision,
        audioDurationPolicy: .completeFile),
      sourceReference: sourceReference,
      sourceRevisionTimestamp: Date(timeIntervalSince1970: 200),
      candidates: [candidate]
    ).metadata
    let changedDurationMetadata = SessionContentLineageCandidateGenerator().generate(
      source: SessionContentManifest(
        sessionID: source.sessionID,
        artistID: source.artistID,
        anchors: source.anchors,
        audioDurationPolicy: .completeFile,
        measuredAudioDurationSeconds: 99),
      sourceReference: sourceReference,
      sourceRevisionTimestamp: Date(timeIntervalSince1970: 200),
      candidates: [candidate]
    ).metadata

    #expect(baseline.algorithmVersion == SessionContentLineageCandidateGenerator.algorithmVersion)
    #expect(baseline.sourceManifestToken != changedManifestMetadata.sourceManifestToken)
    #expect(baseline.invalidationToken != changedManifestMetadata.invalidationToken)
    #expect(baseline.algorithmVersion == changedManifestMetadata.algorithmVersion)
    #expect(baseline.invalidationToken != changedVersionMetadata.invalidationToken)
    #expect(baseline.invalidationToken != changedReferenceMetadata.invalidationToken)
    #expect(baseline.invalidationToken != changedChronologyMetadata.invalidationToken)
    #expect(baseline.invalidationToken != changedScopeMetadata.invalidationToken)
    #expect(baseline.invalidationToken != changedDurationMetadata.invalidationToken)
    #expect(baseline.algorithmVersion == changedVersionMetadata.algorithmVersion)
    #expect(baseline.exactComparisonCandidateLimit == 12)
  }

  @Test(
    "Large sparse queries use bounded postings and abstain when zero-score parity is unprovable")
  func largeSparseIndexHasBoundedQueryWork() throws {
    let sourceAnchors = [
      anchor("shared-vocal", .projectRecording, at: 0, frequency: 1),
      anchor("shared-guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let candidates = (0..<512).map { index in
      lineageCandidate(
        workID: "work-\(index)",
        sessionID: "session-\(index)",
        artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100),
        anchors: index < 2
          ? sourceAnchors
          : [anchor("unique-\(index)", .projectRecording, at: 0, frequency: 1)])
    }
    let generator = SessionContentLineageCandidateGenerator(
      exhaustiveFallbackCandidateLimit: 24,
      maximumExactComparisonCandidates: 12)
    let index = generator.makeIndex(candidates: candidates)
    let selection = index.generate(
      source: manifest(sessionID: "large-source", artistID: "artist", anchors: sourceAnchors))
    let work = try #require(selection.metadata.workCounters)

    #expect(selection.metadata.parityDisposition == .abstainedUnproven)
    #expect(selection.metadata.fallbackDisposition == .unprovenSketchCoverage)
    #expect(selection.candidates.isEmpty)
    #expect(work.indexedCandidateCount == 512)
    #expect(index.loadCounters.candidateSketchBuildCount == 512)
    #expect(work.sourceIdentityLookupCount == 2)
    #expect(work.identityPostingVisitCount == 4)
    #expect(work.sourceSketchBandLookupCount == 8)
    #expect(work.sketchPostingVisitCount == 16)
    #expect(work.estimatedCandidateCount == 2)
    #expect(work.fullPoolExactIntersectionCount == 0)
    #expect(work.postingVisitLimit == 25)
    #expect(!work.postingVisitLimitExceeded)
    #expect(work.identityPostingVisitCount + work.sketchPostingVisitCount < 512)

    let encoder = PropertyListEncoder()
    let decodedCache = try PropertyListDecoder().decode(
      SessionContentCandidateIndexCache.self,
      from: encoder.encode(index.cacheDescriptor))
    let reused = generator.makeIndex(candidates: candidates, persistedCache: decodedCache)
    let reusedSelection = reused.generate(
      source: manifest(sessionID: "large-source", artistID: "artist", anchors: sourceAnchors))
    let reusedWork = try #require(reusedSelection.metadata.workCounters)
    #expect(reusedSelection.metadata.indexCacheDisposition == .reused)
    #expect(reused.loadCounters.candidateSketchBuildCount == 0)
    #expect(reused.loadCounters.cacheCandidateValidationCount == 512)
    #expect(reused.loadCounters.cacheSketchValidationCount == 512)
    #expect(reused.loadCounters.cachePostingReconstructionCount == 0)
    #expect(reusedWork.queryActiveCountLookupCount == 1)
    #expect(reusedWork.queryEntryScanCount == 0)
    #expect(reusedSelection.metadata.candidatePoolToken == selection.metadata.candidatePoolToken)
    #expect(reusedSelection.metadata.invalidationToken == selection.metadata.invalidationToken)
  }

  @Test("Persisted postings serve many queries with exact bounded work counters")
  func persistedPostingIndexBoundsManyQueries() throws {
    let candidateCount = 512
    let queryCount = 64
    let candidates = (0..<candidateCount).map { index in
      lineageCandidate(
        workID: "work-\(index)",
        sessionID: "candidate-session-\(index)",
        artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100),
        anchors: [anchor("identity-\(index)", .projectRecording, at: 0, frequency: 1)])
    }
    let generator = SessionContentLineageCandidateGenerator()
    let built = generator.makeIndex(candidates: candidates)
    let persisted = try PropertyListDecoder().decode(
      SessionContentCandidateIndexCache.self,
      from: PropertyListEncoder().encode(built.cacheDescriptor))
    let reused = generator.makeIndex(candidates: candidates, persistedCache: persisted)

    #expect(persisted.identityPostingCount == candidateCount)
    #expect(persisted.bandPostingCount == candidateCount * 8)
    #expect(reused.loadCounters.indexedCandidateCount == candidateCount)
    #expect(reused.loadCounters.candidateSketchBuildCount == 0)
    #expect(reused.loadCounters.cacheCandidateValidationCount == candidateCount)
    #expect(reused.loadCounters.cacheSketchValidationCount == candidateCount)
    #expect(reused.loadCounters.cacheIdentityPostingValidationCount == candidateCount)
    #expect(reused.loadCounters.cacheBandPostingValidationCount == candidateCount * 8)
    #expect(reused.loadCounters.cacheIntegrityCheckCount == 1)
    #expect(reused.loadCounters.cachePostingReconstructionCount == 0)
    var activeLookups = 0
    var sourceIdentityLookups = 0
    var identityVisits = 0
    var sourceBandLookups = 0
    var bandVisits = 0
    var entryLookups = 0
    for query in 0..<queryCount {
      let selection = reused.generate(
        source: manifest(
          sessionID: "query-session-\(query)",
          artistID: "artist",
          anchors: [anchor("identity-\(query)", .projectRecording, at: 0, frequency: 1)]))
      let work = try #require(selection.metadata.workCounters)
      #expect(selection.metadata.indexCacheDisposition == .reused)
      #expect(selection.metadata.parityDisposition == .abstainedUnproven)
      #expect(work.queryEntryScanCount == 0)
      #expect(work.identityPostingVisitCount + work.sketchPostingVisitCount < candidateCount)
      activeLookups += work.queryActiveCountLookupCount
      sourceIdentityLookups += work.sourceIdentityLookupCount
      identityVisits += work.identityPostingVisitCount
      sourceBandLookups += work.sourceSketchBandLookupCount
      bandVisits += work.sketchPostingVisitCount
      entryLookups += work.queryEntryLookupCount
    }

    #expect(activeLookups == queryCount)
    #expect(sourceIdentityLookups == queryCount)
    #expect(identityVisits == queryCount)
    #expect(sourceBandLookups == queryCount * 8)
    #expect(bandVisits == queryCount * 8)
    #expect(entryLookups == queryCount * 10)
  }

  @Test("Tampered or future persisted index payloads rebuild once at load")
  func tamperedPersistedIndexesAreRejected() throws {
    let candidates = (0..<4).map { index in
      lineageCandidate(
        workID: "work-\(index)", sessionID: "session-\(index)", artistID: "artist",
        timestamp: .init(timeIntervalSince1970: 100),
        anchors: [anchor("identity-\(index)", .projectRecording, at: 0, frequency: 1)])
    }
    let generator = SessionContentLineageCandidateGenerator()
    let cache = generator.makeIndex(candidates: candidates).cacheDescriptor
    let tamperedCaches = try [
      mutatedCache(cache) { $0["schemaVersion"] = 999 },
      mutatedCache(cache) { propertyList in
        var entries = propertyList["entriesByKey"] as! [String: Any]
        let key = entries.keys.sorted()[0]
        var entry = entries[key] as! [String: Any]
        entry["canonicalToken"] = "tampered-entry"
        entries[key] = entry
        propertyList["entriesByKey"] = entries
      },
      mutatedCache(cache) { propertyList in
        var entries = propertyList["entriesByKey"] as! [String: Any]
        let key = entries.keys.sorted()[0]
        var entry = entries[key] as! [String: Any]
        var sketch = entry["sketch"] as! [String: Any]
        sketch["weightTotal"] = 999.0
        entry["sketch"] = sketch
        entries[key] = entry
        propertyList["entriesByKey"] = entries
      },
      mutatedCache(cache) { propertyList in
        var postings = propertyList["identityPostings"] as! [String: Any]
        postings[postings.keys.sorted()[0]] = []
        propertyList["identityPostings"] = postings
      },
      mutatedCache(cache) { $0["integrityToken"] = "tampered-integrity" },
    ]

    for tampered in tamperedCaches {
      let rebuilt = generator.makeIndex(candidates: candidates, persistedCache: tampered)
      let selection = rebuilt.generate(
        source: manifest(
          sessionID: "source", artistID: "artist",
          anchors: [anchor("identity-0", .projectRecording, at: 0, frequency: 1)]))
      #expect(selection.metadata.indexCacheDisposition == .rebuilt)
      #expect(rebuilt.loadCounters.cachePostingReconstructionCount == 1)
      #expect(rebuilt.loadCounters.candidateSketchBuildCount == candidates.count)
    }
  }

  @Test("Extreme candidate-generator configuration is clamped before allocation")
  func extremeConfigurationIsClamped() {
    let maximum = SessionContentLineageCandidateGenerator(
      signatureCount: .max,
      bandSize: .max,
      exhaustiveFallbackCandidateLimit: .max,
      maximumExactComparisonCandidates: .max)
    let minimum = SessionContentLineageCandidateGenerator(
      signatureCount: .min,
      bandSize: .min,
      exhaustiveFallbackCandidateLimit: .min,
      maximumExactComparisonCandidates: .min)

    #expect(maximum.signatureCount == 256)
    #expect(maximum.bandSize == 64)
    #expect(maximum.exhaustiveFallbackCandidateLimit == 4_096)
    #expect(maximum.maximumExactComparisonCandidates == 512)
    #expect(minimum.signatureCount == 1)
    #expect(minimum.bandSize == 1)
    #expect(minimum.exhaustiveFallbackCandidateLimit == 2)
    #expect(minimum.maximumExactComparisonCandidates == 2)
    #expect(
      maximum.generate(
        source: manifest(sessionID: "empty", artistID: nil, anchors: []), candidates: []
      ).metadata.exactComparisonCandidateCount == 0)
  }

  @Test("Duplicate anchors normalize independently of order and SHA tokens bind relevant changes")
  func duplicateAnchorNormalizationAndTokens() {
    let weaker = SessionContentAnchor(
      id: "duplicate-weaker",
      contentIdentity: "duplicate",
      kind: .clipPlacement,
      arrangementPositionBeats: 16,
      corpusFrequency: 4,
      sourceMaterialIdentity: "placement",
      identityEvidence: .structural)
    let stronger = SessionContentAnchor(
      id: "duplicate-stronger",
      contentIdentity: "duplicate",
      kind: .projectRecording,
      arrangementPositionBeats: 0,
      corpusFrequency: 1,
      sourceMaterialIdentity: "recording",
      identityEvidence: .verifiedContent,
      measuredAudioDurationSeconds: 1)
    let changedStronger = SessionContentAnchor(
      id: "duplicate-stronger",
      contentIdentity: "duplicate",
      kind: .projectRecording,
      arrangementPositionBeats: 0,
      corpusFrequency: 2,
      sourceMaterialIdentity: "recording",
      identityEvidence: .verifiedContent,
      measuredAudioDurationSeconds: 1)
    let candidate = lineageCandidate(
      workID: "target",
      sessionID: "target-session",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [weaker, stronger])
    let generator = SessionContentLineageCandidateGenerator()
    let forwardSource = manifest(
      sessionID: "duplicate-source", artistID: "artist", anchors: [weaker, stronger])
    let reverseSource = manifest(
      sessionID: "duplicate-source", artistID: "artist", anchors: [stronger, weaker])
    let changedSource = manifest(
      sessionID: "duplicate-source", artistID: "artist", anchors: [weaker, changedStronger])
    let forward = generator.generate(source: forwardSource, candidates: [candidate])
    let reversed = generator.generate(source: reverseSource, candidates: [candidate])
    let changed = generator.generate(source: changedSource, candidates: [candidate])

    #expect(forward.candidates == reversed.candidates)
    #expect(forward.metadata.sourceManifestToken == reversed.metadata.sourceManifestToken)
    #expect(forward.metadata.invalidationToken == reversed.metadata.invalidationToken)
    #expect(forward.metadata.sourceManifestToken.count == 64)
    #expect(forward.metadata.candidatePoolToken.count == 64)
    #expect(forward.metadata.sourceManifestToken != changed.metadata.sourceManifestToken)
    #expect(forward.metadata.invalidationToken != changed.metadata.invalidationToken)
  }

  @Test("Zero-overlap durable rejection preserves complete exhaustive resolution")
  func zeroOverlapDurableRejectionParity() {
    let source = manifest(
      sessionID: "zero-source",
      artistID: "artist",
      anchors: [anchor("source-only", .projectRecording, at: 0, frequency: 1)])
    let rejected = lineageCandidate(
      workID: "a-rejected",
      sessionID: "rejected-session",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [anchor("candidate-only", .projectRecording, at: 0, frequency: 1)])
    let reference = reference(
      sessionID: "zero-source", workID: "source-work", revisionID: "zero-revision")
    let resolver = SessionContentLineageResolver(calibration: lineageCalibration())
    let exhaustive = resolver.resolve(
      source: source,
      sourceReference: reference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [rejected],
      rejectedWorkIDs: [rejected.workID])
    let selection = SessionContentLineageCandidateGenerator().generate(
      source: source, candidates: [rejected])
    let bounded = resolver.resolve(
      source: source,
      sourceReference: reference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: selection.candidates,
      rejectedWorkIDs: [rejected.workID])

    #expect(selection.metadata.parityDisposition == .boundedExhaustiveFallback)
    #expect(selection.candidates == [rejected])
    #expect(exhaustive.confidence == .conflicted)
    #expect(exhaustive == bounded)
  }

  @Test("Reviewed containment actions persist observation-bound supersession across instances")
  func reviewedActionsPersistWithObservationAuthority() async throws {
    let root = FileManager.default.temporaryDirectory.appending(
      path: "session-content-reviewed-actions-\(UUID().uuidString)",
      directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: root) }
    let anchors = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let source = manifest(sessionID: "idea", artistID: "artist", anchors: anchors)
    let candidate = lineageCandidate(
      workID: "song",
      sessionID: "known",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: anchors)
    let sourceReference = reference(
      sessionID: "idea", workID: "idea-work", revisionID: "source")
    let selection = SessionContentLineageCandidateGenerator().generate(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [candidate])
    let resolution = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: selection.candidates)
    let best = try #require(resolution.bestCandidate)
    let review = SessionContentReviewCandidate(
      id: "containment-observation",
      sessionID: source.sessionID,
      sourceWorkID: "idea-work",
      candidateWorkID: candidate.workID,
      relationship: .sameWork,
      score: best.score,
      matchedAnchorIDs: best.matchedAnchorIDs,
      explanation: best.observation.explanation,
      calibrationID: lineageCalibration().id,
      candidateGeneration: selection.metadata,
      independentSourceMaterialCount: best.distinctiveSourceMaterialCount,
      observation: best.observation,
      observationID: "containment-observation",
      decisionRecordedAt: Date(timeIntervalSince1970: 5),
      rankedCandidateEvidence: resolution.candidates)
    let snapshot = CalibrationObservationSnapshot.from(reviewCandidate: review)
    let registry = CalibrationObservationRegistry(observations: [snapshot])
    let storageURL = root.appending(path: "review-ledger.plist")
    let firstStore = CalibrationReviewStore(storageURL: storageURL)
    let secondStore = CalibrationReviewStore(storageURL: storageURL)
    let first = try await firstStore.append(
      CalibrationReviewDecisionDraft(
        id: "accept",
        label: .sameSong,
        primaryObservationID: snapshot.id,
        observationInputs: [
          CalibrationObservationInput(
            observationID: snapshot.id,
            expectedFeatureDigest: snapshot.featureDigest)
        ],
        algorithmFamily: snapshot.algorithmFamily,
        algorithmVersion: snapshot.algorithmVersion,
        calibrationID: snapshot.calibrationID,
        reproductionFeatures: [
          CalibrationFeature(
            name: "candidateGenerationToken",
            value: selection.metadata.invalidationToken)
        ],
        decidedAt: Date(timeIntervalSince1970: 10)),
      registry: registry)
    _ = try await secondStore.append(
      CalibrationReviewDecisionDraft(
        id: "keep-separate",
        label: .keepSeparate,
        primaryObservationID: snapshot.id,
        observationInputs: [
          CalibrationObservationInput(
            observationID: snapshot.id,
            expectedFeatureDigest: snapshot.featureDigest)
        ],
        algorithmFamily: snapshot.algorithmFamily,
        algorithmVersion: snapshot.algorithmVersion,
        calibrationID: snapshot.calibrationID,
        reproductionFeatures: [
          CalibrationFeature(name: "authority", value: "user-rejection")
        ],
        decidedAt: Date(timeIntervalSince1970: 20),
        supersedesDecisionID: first.id),
      registry: registry)
    let reloaded = try await firstStore.reload()

    #expect(reloaded.decisions.count == 2)
    #expect(
      reloaded.decisions.first { $0.id == first.id }?.supersededByDecisionID == "keep-separate")
    #expect(reloaded.decisions.first { $0.id == "keep-separate" }?.isActive == true)
    #expect(
      reloaded.decisions.first { $0.id == "keep-separate" }?.primaryObservationID == snapshot.id)
    #expect(
      reloaded.decisions.first { $0.id == "keep-separate" }?.observations.first?.featureDigest
        == snapshot.featureDigest)
  }
}

private func lineageCalibration() -> AudioMatchingCalibration {
  AudioMatchingCalibration(
    id: "lineage-test-calibration",
    algorithmFamily: "session-content-lineage",
    algorithmVersion: SessionContentLineageResolver.algorithmVersion,
    materialClass: .mixedCorpus,
    validatedExampleCount: 100,
    validatedAt: Date(timeIntervalSince1970: 0),
    automaticScoreThreshold: 0.78,
    minimumCoverage: 0.5,
    minimumRunnerUpMargin: 0.15
  )
}

private func manifest(
  sessionID: String,
  artistID: String?,
  anchors: [SessionContentAnchor]
) -> SessionContentManifest {
  SessionContentManifest(
    sessionID: sessionID,
    artistID: artistID,
    anchors: anchors,
    setRevisionIDs: ["selected-\(sessionID)"],
    measuredAudioDurationSeconds: measuredDuration(in: anchors))
}

private func lineageCandidate(
  workID: String,
  sessionID: String,
  artistID: String?,
  timestamp: Date,
  anchors: [SessionContentAnchor]
) -> SessionLineageCandidate {
  let reviewReference = reference(
    sessionID: sessionID, workID: workID, revisionID: "rev-\(sessionID)")
  return SessionLineageCandidate(
    workID: workID,
    sessionID: sessionID,
    artistID: artistID,
    manifest: SessionContentManifest(
      sessionID: sessionID,
      artistID: artistID,
      anchors: anchors,
      setRevisionIDs: ["selected-\(sessionID)"],
      measuredAudioDurationSeconds: measuredDuration(in: anchors)),
    reviewRevisionReference: reviewReference,
    evidenceRevisionReferences: [reviewReference],
    revisionTimestamp: timestamp
  )
}

private func reference(
  sessionID: String,
  workID: String,
  revisionID: String,
  revisionName: String? = nil,
  reviewedAt: Date = Date(timeIntervalSince1970: 0)
)
  -> StudioRevisionReference
{
  let setURL = URL(fileURLWithPath: "/tmp/\(sessionID)-\(revisionID).als")
  return StudioRevisionReference(
    workID: workID,
    sessionID: sessionID,
    revisionID: revisionID,
    setID: "set-\(revisionID)",
    setURL: setURL,
    trackedRootURL: setURL.deletingLastPathComponent(),
    contentObservation: StudioSetContentObservation(
      compressedBytes: 1,
      modifiedAtNanoseconds: 1,
      reconstructedContentDigest: "digest-\(revisionID)"
    ),
    displaySnapshot: StudioRevisionDisplaySnapshot(
      artistName: "Artist",
      workName: workID,
      sessionName: sessionID,
      revisionName: revisionName ?? revisionID
    ),
    catalogueAlgorithmVersion: "test-catalog",
    catalogueGenerationID: "test-generation",
    reviewedAt: reviewedAt
  )
}

private func mutatedCache(
  _ cache: SessionContentCandidateIndexCache,
  mutation: (inout [String: Any]) -> Void
) throws -> SessionContentCandidateIndexCache {
  let encoded = try PropertyListEncoder().encode(cache)
  var propertyList = try #require(
    PropertyListSerialization.propertyList(from: encoded, options: [], format: nil)
      as? [String: Any])
  mutation(&propertyList)
  let mutated = try PropertyListSerialization.data(
    fromPropertyList: propertyList, format: .binary, options: 0)
  return try PropertyListDecoder().decode(SessionContentCandidateIndexCache.self, from: mutated)
}

private func anchor(
  _ identity: String,
  _ kind: SessionContentAnchorKind,
  at position: Double?,
  frequency: Int,
  identityEvidence: SessionContentIdentityEvidence = .verifiedContent
) -> SessionContentAnchor {
  SessionContentAnchor(
    id: "\(identity)-\(position.map { String($0) } ?? "none")",
    contentIdentity: identity,
    kind: kind,
    arrangementPositionBeats: position,
    corpusFrequency: frequency,
    sourceMaterialIdentity: identity,
    identityEvidence: identityEvidence,
    measuredAudioDurationSeconds:
      kind == .projectRecording || kind == .derivedProjectAudio ? 1 : nil
  )
}

private func measuredDuration(in anchors: [SessionContentAnchor]) -> Double? {
  let durations = Dictionary(
    grouping: anchors.filter {
      $0.kind == .projectRecording || $0.kind == .derivedProjectAudio
    },
    by: { $0.sourceMaterialIdentity ?? $0.contentIdentity }
  ).compactMapValues(\.first).values.compactMap(\.measuredAudioDurationSeconds)
  return durations.isEmpty ? nil : durations.reduce(0, +)
}

private func randomEligibleAnchor(
  identity: String,
  random: inout CandidateGeneratorTestRandom
) -> SessionContentAnchor {
  let kinds: [SessionContentAnchorKind] = [
    .projectRecording, .derivedProjectAudio, .midiPhrase, .clipPlacement,
  ]
  return anchor(
    identity,
    kinds[random.nextInt(upperBound: kinds.count)],
    at: Double(random.nextInt(upperBound: 32)),
    frequency: 1 + random.nextInt(upperBound: 4)
  )
}

private struct CandidateGeneratorTestRandom {
  var state: UInt64

  mutating func nextInt(upperBound: Int) -> Int {
    precondition(upperBound > 0)
    state &+= 0x9E37_79B9_7F4A_7C15
    var value = state
    value = (value ^ (value >> 30)) &* 0xBF58_476D_1CE4_E5B9
    value = (value ^ (value >> 27)) &* 0x94D0_49BB_1331_11EB
    value ^= value >> 31
    return Int(value % UInt64(upperBound))
  }
}
