import Foundation
import Testing

@testable import StudioCore

@Suite("Session Content Lineage resolution")
struct SessionContentLineageResolverTests {
  @Test("A larger later Session containing most of an older Session can attach automatically")
  func largerLaterSessionContainsOlderSession() throws {
    let sourcePrimary = reference(
      sessionID: "idea005", workID: "new-song", revisionID: "rev-source-primary")
    let candidatePrimary = reference(
      sessionID: "idea003", workID: "example-song", revisionID: "rev-candidate-primary")
    let source = manifest(
      sessionID: "idea005",
      artistID: "demo-artist",
      anchors: [
        anchor("lead-vocal-take", .projectRecording, at: 16, frequency: 1),
        anchor("guitar-print", .derivedProjectAudio, at: 32, frequency: 1),
        anchor("verse-clip-placement", .clipPlacement, at: 16, frequency: 1),
      ]
    )
    let candidate = lineageCandidate(
      workID: "example-song",
      sessionID: "idea003",
      artistID: "demo-artist",
      timestamp: .init(timeIntervalSince1970: 100),
      evidenceRevisionReferences: [candidatePrimary],
      anchors: [
        anchor("lead-vocal-take", .projectRecording, at: 8, frequency: 1),
        anchor("guitar-print", .derivedProjectAudio, at: 24, frequency: 1),
      ]
    )

    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: sourcePrimary,
      sourceEvidenceRevisionReferences: [sourcePrimary],
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [candidate]
    )

    let best = try #require(result.bestCandidate)
    #expect(result.selectedWorkID == "example-song")
    #expect(result.confidence == .highConfidenceSessionLineage)
    #expect(best.observation.sourceContainsCandidateScore == 1)
    #expect(best.observation.candidateContainsSourceScore < 1)
    #expect(best.observation.chronologyCompatibility == .compatible)
    #expect(best.observation.sourceEvidenceRevisionReferences.count == 1)
    #expect(best.observation.candidateEvidenceRevisionReferences.count == 1)
    #expect(best.observation.sourceRevisionReference.revisionID == "rev-source-primary")
    #expect(best.observation.unavailableEvidenceFamilies == [.excerpt, .pcm])
    #expect(best.observation.pcmEvidenceCount == nil)
    #expect(best.observation.excerptEvidenceCount == nil)
  }

  @Test("Directional attachment does not require the larger Session to fit inside its ancestor")
  func directionalCoverageUsesAncestorToDescendantDirection() throws {
    let source = manifest(
      sessionID: "later",
      artistID: "artist",
      anchors: [
        anchor("vocal", .projectRecording, at: 0, frequency: 1),
        anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
      ]
        + (0..<8).map {
          anchor("new-\($0)", .clipPlacement, at: Double($0 + 2) * 8, frequency: 1)
        }
    )
    let older = lineageCandidate(
      workID: "song",
      sessionID: "older",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [
        anchor("vocal", .projectRecording, at: 0, frequency: 1),
        anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
      ]
    )

    let result = SessionContentLineageResolver(
      automaticThreshold: 0.5,
      calibration: lineageCalibration(automaticScoreThreshold: 0.5)
    ).resolve(
      source: source,
      sourceReference: reference(sessionID: "later", workID: "idea", revisionID: "rev-later"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [older]
    )

    let best = try #require(result.bestCandidate)
    #expect(best.observation.sourceContainsCandidateScore == 1)
    #expect(best.observation.candidateContainsSourceScore < 0.5)
    #expect(result.selectedWorkID == "song")
  }

  @Test("Unknown Artist or chronology remains review-only")
  func unknownCompatibilityCannotAuthorizeAttachment() throws {
    let anchors = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: manifest(sessionID: "idea", artistID: nil, anchors: anchors),
      sourceReference: reference(sessionID: "idea", workID: "idea", revisionID: "rev-idea"),
      sourceRevisionTimestamp: nil,
      candidates: [
        lineageCandidate(
          workID: "song",
          sessionID: "known",
          artistID: nil,
          timestamp: .init(timeIntervalSince1970: 100),
          anchors: anchors
        )
      ]
    )

    let best = try #require(result.bestCandidate)
    #expect(best.observation.artistCompatibility == .unknown)
    #expect(best.observation.chronologyCompatibility == .unknown)
    #expect(result.selectedWorkID == nil)
    #expect(result.proposedWorkID == "song")
    #expect(result.confidence == .suggested)
  }

  @Test("Mutable reference identities are never exact or automatic evidence")
  func mutableReferenceIdentityIsDecisionZero() throws {
    let anchors = [
      anchor(
        "reference:/recorded/vocal.wav", .projectRecording, at: 0, frequency: 1,
        identityEvidence: .mutableReference),
      anchor(
        "reference:/processed/hook.wav", .derivedProjectAudio, at: 8, frequency: 1,
        identityEvidence: .mutableReference),
    ]
    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: manifest(sessionID: "idea", artistID: "artist", anchors: anchors),
      sourceReference: reference(sessionID: "idea", workID: "idea", revisionID: "rev-idea"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [
        lineageCandidate(
          workID: "song",
          sessionID: "known",
          artistID: "artist",
          timestamp: .init(timeIntervalSince1970: 100),
          anchors: anchors
        )
      ]
    )

    let best = try #require(result.bestCandidate)
    #expect(best.observation.exactEvidenceCount == 0)
    #expect(best.observation.distinctiveAnchorCount == 0)
    #expect(best.observation.sourceWeightTotal == 0)
    #expect(best.observation.candidateWeightTotal == 0)
    #expect(
      best.observation.suppressedAnchors.allSatisfy { $0.reason == .unverifiedMutableIdentity })
    #expect(result.selectedWorkID == nil)
    #expect(result.proposedWorkID == nil)

    let malformedData = try PropertyListSerialization.data(
      fromPropertyList: [
        "id": "malformed-reference",
        "contentIdentity": "reference:/mutable/path.wav",
        "kind": "projectRecording",
        "corpusFrequency": 1,
        "identityEvidence": "verifiedContent",
      ],
      format: .binary,
      options: 0)
    let decoded = try PropertyListDecoder().decode(
      SessionContentAnchor.self, from: malformedData)
    #expect(decoded.identityEvidence == .mutableReference)
  }

  @Test("Suppressed common material cannot change a rare-anchor decision")
  func mixedRareAndCommonMaterialHasZeroSuppressedContribution() throws {
    let rare = [
      anchor("rare-vocal", .projectRecording, at: 0, frequency: 1),
      anchor("rare-guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let common = [
      anchor("common-kick", .projectRecording, at: 16, frequency: 40),
      anchor("pack-loop", .externalLibrarySample, at: 24, frequency: 1),
      anchor("template", .templateStructure, at: nil, frequency: 1),
    ]
    let sourceReference = reference(
      sessionID: "idea", workID: "idea", revisionID: "rev-idea")
    let candidate = lineageCandidate(
      workID: "song",
      sessionID: "known",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: rare + common
    )
    let resolver = SessionContentLineageResolver(calibration: lineageCalibration())
    let mixed = resolver.resolve(
      source: manifest(sessionID: "idea", artistID: "artist", anchors: rare + common),
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [candidate]
    )
    let rareOnly = resolver.resolve(
      source: manifest(sessionID: "idea", artistID: "artist", anchors: rare),
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [
        lineageCandidate(
          workID: "song",
          sessionID: "known",
          artistID: "artist",
          timestamp: .init(timeIntervalSince1970: 100),
          anchors: rare
        )
      ]
    )

    let mixedBest = try #require(mixed.bestCandidate)
    let rareBest = try #require(rareOnly.bestCandidate)
    #expect(mixedBest.score == rareBest.score)
    #expect(mixedBest.observation.sourceWeightTotal == rareBest.observation.sourceWeightTotal)
    #expect(mixedBest.observation.exactEvidenceCount == rareBest.observation.exactEvidenceCount)
    #expect(mixedBest.observation.matchedAnchorIDs == rareBest.observation.matchedAnchorIDs)
  }

  @Test("Full-session unions and incomplete duration policy cannot authorize attachment")
  func incompatibleEvidenceScopeStaysReviewOnly() throws {
    let anchors = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: manifest(
        sessionID: "idea",
        artistID: "artist",
        anchors: anchors,
        evidenceScope: .fullSession,
        audioDurationPolicy: .unknown),
      sourceReference: reference(sessionID: "idea", workID: "idea", revisionID: "rev-idea"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [
        lineageCandidate(
          workID: "song",
          sessionID: "known",
          artistID: "artist",
          timestamp: .init(timeIntervalSince1970: 100),
          anchors: anchors
        )
      ]
    )

    let best = try #require(result.bestCandidate)
    #expect(best.observation.sourceEvidenceScope == .fullSession)
    #expect(best.observation.sourceAudioDurationPolicy == .unknown)
    #expect(best.observation.sourceMeasuredAudioDurationSeconds == 2)
    #expect(best.observation.exactEvidenceCount == 2)
    #expect(best.score > 0)
    #expect(best.observation.conflicts.contains(.incompatibleEvidenceScope))
    #expect(result.selectedWorkID == nil)
    #expect(result.proposedWorkID == "song")
  }

  @Test("Common sample pack material produces no lineage match")
  func commonMaterialAbstains() {
    let source = manifest(
      sessionID: "idea099",
      artistID: nil,
      anchors: [
        anchor("splice-loop", .externalLibrarySample, at: 0, frequency: 70),
        anchor("default-template", .templateStructure, at: nil, frequency: 120),
      ]
    )
    let candidate = lineageCandidate(
      workID: "wrong-song",
      sessionID: "other",
      artistID: nil,
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: source.anchors
    )

    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: reference(sessionID: "idea099", workID: "idea", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [candidate]
    )

    #expect(result.selectedWorkID == nil)
    #expect(result.proposedWorkID == nil)
    #expect(result.confidence == .unknown)
    #expect(result.edge == nil)
  }

  @Test("One rare external sample is suppressed rather than promoted to Session evidence")
  func rareSharedSampleStaysDecisionZero() throws {
    let source = manifest(
      sessionID: "idea010",
      artistID: "artist",
      anchors: [anchor("rare-sample", .externalLibrarySample, at: 0, frequency: 1)]
    )
    let candidate = lineageCandidate(
      workID: "song",
      sessionID: "older",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: [anchor("rare-sample", .externalLibrarySample, at: 0, frequency: 1)]
    )

    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: reference(sessionID: "idea010", workID: "idea", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [candidate]
    )

    #expect(result.selectedWorkID == nil)
    #expect(result.proposedWorkID == nil)
    #expect(result.confidence == .unknown)
    #expect(result.bestCandidate?.observation.exactEvidenceCount == 0)
    #expect(
      result.bestCandidate?.observation.suppressedAnchors.allSatisfy {
        $0.reason == .externalLibraryMaterial
      } == true)
  }

  @Test("A close runner-up remains a review suggestion")
  func ambiguousRunnerUp() throws {
    let shared = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let source = manifest(sessionID: "idea", artistID: "artist", anchors: shared)
    let first = lineageCandidate(
      workID: "first",
      sessionID: "a",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: shared
    )
    let second = lineageCandidate(
      workID: "second",
      sessionID: "b",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: shared
    )

    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: reference(sessionID: "idea", workID: "idea-work", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [first, second]
    )

    let best = try #require(result.bestCandidate)
    #expect(result.selectedWorkID == nil)
    #expect(result.proposedWorkID == "first")
    #expect(result.confidence == .suggested)
    #expect(best.observation.conflicts.contains(.closeRunnerUp))
  }

  @Test("Artist conflicts block lineage attachment")
  func artistConflictBlocksMatch() throws {
    let anchors = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: manifest(sessionID: "idea", artistID: "artist-a", anchors: anchors),
      sourceReference: reference(sessionID: "idea", workID: "idea-work", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [
        lineageCandidate(
          workID: "song",
          sessionID: "older",
          artistID: "artist-b",
          timestamp: .init(timeIntervalSince1970: 100),
          anchors: anchors
        )
      ]
    )

    let best = try #require(result.bestCandidate)
    #expect(result.selectedWorkID == nil)
    #expect(result.proposedWorkID == nil)
    #expect(best.artistConflict)
  }

  @Test("Direction reversal blocks attachment when the candidate is the larger descendant")
  func directionReversalBlocksMatch() throws {
    let source = manifest(
      sessionID: "older",
      artistID: "artist",
      anchors: [
        anchor("vocal", .projectRecording, at: 0, frequency: 1),
        anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
      ]
    )
    let candidate = lineageCandidate(
      workID: "song",
      sessionID: "newer",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 200),
      anchors: [
        anchor("vocal", .projectRecording, at: 0, frequency: 1),
        anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
        anchor("extra", .clipPlacement, at: 16, frequency: 1),
      ]
    )

    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: reference(sessionID: "older", workID: "idea-work", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 100),
      candidates: [candidate]
    )

    let best = try #require(result.bestCandidate)
    #expect(result.selectedWorkID == nil)
    #expect(result.proposedWorkID == nil)
    #expect(best.directionReversal)
  }

  @Test("Chronology conflicts block attachment when the candidate appears newer than the source")
  func chronologyConflictBlocksMatch() throws {
    let anchors = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 1),
    ]
    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: manifest(sessionID: "idea", artistID: "artist", anchors: anchors),
      sourceReference: reference(sessionID: "idea", workID: "idea-work", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 100),
      candidates: [
        lineageCandidate(
          workID: "song",
          sessionID: "newer",
          artistID: "artist",
          timestamp: .init(timeIntervalSince1970: 200),
          anchors: anchors
        )
      ]
    )

    let best = try #require(result.bestCandidate)
    #expect(result.selectedWorkID == nil)
    #expect(result.proposedWorkID == nil)
    #expect(best.chronologyConflict)
  }

  @Test("A durable rejection prevents automatic attachment")
  func rejectionOverridesMatching() throws {
    let anchors = [
      anchor("vocal", .projectRecording, at: 0, frequency: 1),
      anchor("placement", .clipPlacement, at: 8, frequency: 1),
    ]
    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: manifest(sessionID: "idea", artistID: "artist", anchors: anchors),
      sourceReference: reference(sessionID: "idea", workID: "idea-work", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [
        lineageCandidate(
          workID: "rejected",
          sessionID: "older",
          artistID: "artist",
          timestamp: .init(timeIntervalSince1970: 100),
          anchors: anchors
        )
      ],
      rejectedWorkIDs: ["rejected"]
    )

    let best = try #require(result.bestCandidate)
    #expect(result.selectedWorkID == nil)
    #expect(result.proposedWorkID == nil)
    #expect(result.confidence == .conflicted)
    #expect(best.observation.conflicts.contains(.durableRejection))
  }

  @Test("Explanation distinguishes distinctive evidence from suppressed common and library anchors")
  func explanationCallsOutSuppressedEvidence() throws {
    let source = manifest(
      sessionID: "idea020",
      artistID: "artist",
      anchors: [
        anchor("rare-vocal", .projectRecording, at: 0, frequency: 1),
        anchor("common-kick", .projectRecording, at: 4, frequency: 8),
        anchor("rare-pack", .externalLibrarySample, at: 8, frequency: 1),
        anchor("template-layout", .templateStructure, at: nil, frequency: 1),
      ]
    )
    let candidate = lineageCandidate(
      workID: "song",
      sessionID: "older",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: source.anchors
    )

    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: reference(sessionID: "idea020", workID: "idea", revisionID: "rev-source"),
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [candidate]
    )

    let best = try #require(result.bestCandidate)
    #expect(best.observation.suppressedAnchors.count == 6)
    #expect(best.observation.explanation.contains("Distinctive evidence contributes 1 anchor"))
    #expect(best.observation.explanation.contains("Suppressed anchors include"))
    #expect(best.observation.explanation.contains("common-corpus anchor"))
    #expect(best.observation.explanation.contains("external-library anchor"))
    #expect(best.observation.explanation.contains("template anchor"))
  }

  @Test("Containment observations round-trip with evidence scopes and suppression metadata")
  func observationRoundTrips() throws {
    let sourcePrimary = reference(
      sessionID: "idea021", workID: "idea", revisionID: "rev-source-primary")
    let sourceSecondary = reference(
      sessionID: "idea021", workID: "idea", revisionID: "rev-source-secondary")
    let candidatePrimary = reference(
      sessionID: "idea018", workID: "song", revisionID: "rev-candidate-primary")
    let candidateSecondary = reference(
      sessionID: "idea018", workID: "song", revisionID: "rev-candidate-secondary")
    let source = manifest(
      sessionID: "idea021",
      artistID: "artist",
      anchors: [
        anchor("rare-vocal", .projectRecording, at: 0, frequency: 1),
        anchor("common-kick", .projectRecording, at: 4, frequency: 7),
      ]
    )
    let candidate = lineageCandidate(
      workID: "song",
      sessionID: "idea018",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      evidenceRevisionReferences: [candidatePrimary, candidateSecondary],
      anchors: source.anchors
    )

    let result = SessionContentLineageResolver(calibration: lineageCalibration()).resolve(
      source: source,
      sourceReference: sourcePrimary,
      sourceEvidenceRevisionReferences: [sourcePrimary, sourceSecondary],
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [candidate]
    )
    let observation = try #require(result.bestCandidate?.observation)
    let encoder = PropertyListEncoder()
    let decoder = PropertyListDecoder()
    let decoded = try decoder.decode(
      DirectionalSessionContainmentObservation.self,
      from: try encoder.encode(observation)
    )

    #expect(
      decoded.sourceEvidenceRevisionReferences.map(\.revisionID) == [
        "rev-source-primary", "rev-source-secondary",
      ])
    #expect(
      decoded.candidateEvidenceRevisionReferences.map(\.revisionID) == [
        "rev-candidate-primary", "rev-candidate-secondary",
      ])
    #expect(decoded.suppressedAnchors.map(\.reason).contains(.commonCorpusMaterial))
    #expect(decoded.sourceEvidenceScope == .selectedRevision)
    #expect(decoded.candidateEvidenceScope == .selectedRevision)
    #expect(decoded.sourceAudioDurationPolicy == .completeFile)
    #expect(decoded.sourceSelectedRevisionID == "selected-idea021")
    #expect(decoded.candidateSelectedRevisionID == "selected-idea018")
    #expect(decoded.explanation == observation.explanation)
  }

  @Test("Canonical anchor permutations preserve numeric bit patterns and encoded bytes")
  func canonicalPermutationBitDeterminism() throws {
    let duplicateWeak = SessionContentAnchor(
      id: "duplicate-weak",
      contentIdentity: "duplicate",
      kind: .clipPlacement,
      arrangementPositionBeats: 24,
      corpusFrequency: 4,
      sourceMaterialIdentity: "placement",
      identityEvidence: .structural)
    let duplicateStrong = SessionContentAnchor(
      id: "duplicate-strong",
      contentIdentity: "duplicate",
      kind: .projectRecording,
      arrangementPositionBeats: 0,
      corpusFrequency: 1,
      sourceMaterialIdentity: "recording",
      identityEvidence: .verifiedContent,
      measuredAudioDurationSeconds: 1)
    let otherAnchors = [
      anchor("guitar", .derivedProjectAudio, at: 8, frequency: 2),
      anchor("placement", .clipPlacement, at: 16, frequency: 3),
      anchor("midi", .midiPhrase, at: 32, frequency: 2),
    ]
    let sourceAnchors = [duplicateWeak, duplicateStrong] + otherAnchors
    let firstCandidate = lineageCandidate(
      workID: "work-b",
      sessionID: "session-b",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: sourceAnchors)
    let secondCandidate = lineageCandidate(
      workID: "work-a",
      sessionID: "session-a",
      artistID: "artist",
      timestamp: .init(timeIntervalSince1970: 100),
      anchors: Array(sourceAnchors.dropLast()))
    let sourceReference = reference(
      sessionID: "permuted", workID: "source", revisionID: "permuted-revision")
    let resolver = SessionContentLineageResolver(calibration: lineageCalibration())
    let forward = resolver.resolve(
      source: manifest(sessionID: "permuted", artistID: "artist", anchors: sourceAnchors),
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [firstCandidate, secondCandidate])
    let reversed = resolver.resolve(
      source: manifest(
        sessionID: "permuted", artistID: "artist", anchors: Array(sourceAnchors.reversed())),
      sourceReference: sourceReference,
      sourceRevisionTimestamp: .init(timeIntervalSince1970: 200),
      candidates: [secondCandidate, firstCandidate])

    #expect(forward == reversed)
    #expect(
      forward.candidates.map(numericBitPatterns)
        == reversed.candidates.map(numericBitPatterns))
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    #expect(try encoder.encode(forward) == encoder.encode(reversed))
  }
}

private func numericBitPatterns(_ candidate: SessionLineageCandidateScore) -> [UInt64] {
  let observation = candidate.observation
  return [
    candidate.score.bitPattern,
    observation.sourceContainsCandidateScore.bitPattern,
    observation.candidateContainsSourceScore.bitPattern,
    observation.weightedIntersectionTotal.bitPattern,
    observation.sourceMatchedWeightTotal.bitPattern,
    observation.sourceWeightTotal.bitPattern,
    observation.candidateMatchedWeightTotal.bitPattern,
    observation.candidateWeightTotal.bitPattern,
    observation.arrangementScore.bitPattern,
    observation.runnerUpMargin.bitPattern,
  ]
}

private func lineageCalibration(automaticScoreThreshold: Double = 0.78) -> AudioMatchingCalibration
{
  AudioMatchingCalibration(
    id: "lineage-test-calibration",
    algorithmFamily: "session-content-lineage",
    algorithmVersion: SessionContentLineageResolver.algorithmVersion,
    materialClass: .mixedCorpus,
    validatedExampleCount: 100,
    validatedAt: Date(timeIntervalSince1970: 0),
    automaticScoreThreshold: automaticScoreThreshold,
    minimumCoverage: 0.5,
    minimumRunnerUpMargin: 0.15
  )
}

private func manifest(
  sessionID: String,
  artistID: String?,
  anchors: [SessionContentAnchor],
  evidenceScope: SessionContentEvidenceScope = .selectedRevision,
  audioDurationPolicy: SessionContentAudioDurationPolicy = .completeFile
) -> SessionContentManifest {
  SessionContentManifest(
    sessionID: sessionID,
    artistID: artistID,
    anchors: anchors,
    setRevisionIDs: ["selected-\(sessionID)"],
    evidenceScope: evidenceScope,
    audioDurationPolicy: audioDurationPolicy,
    measuredAudioDurationSeconds: measuredDuration(in: anchors))
}

private func lineageCandidate(
  workID: String,
  sessionID: String,
  artistID: String?,
  timestamp: Date,
  evidenceRevisionReferences: [StudioRevisionReference]? = nil,
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
    evidenceRevisionReferences: evidenceRevisionReferences ?? [reviewReference],
    revisionTimestamp: timestamp
  )
}

private func reference(sessionID: String, workID: String, revisionID: String)
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
      revisionName: revisionID
    ),
    catalogueAlgorithmVersion: "test-catalog",
    catalogueGenerationID: "test-generation",
    reviewedAt: Date(timeIntervalSince1970: 0)
  )
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
