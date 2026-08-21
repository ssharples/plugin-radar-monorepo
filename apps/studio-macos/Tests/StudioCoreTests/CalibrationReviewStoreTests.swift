import CryptoKit
import Darwin
import Foundation
import Testing

@testable import StudioCore

private let heldOutPartition = CalibrationCorpusPartition(
  corpusKind: .synthetic,
  split: .heldOut,
  artistGroupDigest: String(repeating: "a", count: 64),
  songGroupDigest: String(repeating: "b", count: 64))

@Suite("Local calibration review storage")
struct CalibrationReviewStoreTests {
  @Test("Round-trips local reviewed decisions with supersession across store instances")
  func roundTripsWithSupersession() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let automatic = try fixture.automaticAssignmentObservation()
    let registry = CalibrationObservationRegistry(observations: [automatic])
    let storeURL = fixture.root.appending(path: "calibration-review.plist")
    let left = CalibrationReviewStore(storageURL: storeURL)
    let right = CalibrationReviewStore(storageURL: storeURL)

    let first = try await left.append(
      CalibrationReviewDecisionDraft(
        id: "decision-1",
        label: .sameSong,
        primaryObservationID: automatic.id,
        observationInputs: [
          CalibrationObservationInput(
            observationID: automatic.id,
            expectedFeatureDigest: automatic.featureDigest)
        ],
        algorithmFamily: automatic.algorithmFamily,
        algorithmVersion: automatic.algorithmVersion,
        calibrationID: automatic.calibrationID,
        reproductionFeatures: [
          CalibrationFeature(name: "reviewMode", value: "manual-local")
        ],
        decidedAt: Date(timeIntervalSince1970: 10),
        corpusPartition: heldOutPartition,
        notes: "Initial local acceptance"),
      registry: registry)

    let second = try await right.append(
      CalibrationReviewDecisionDraft(
        id: "decision-2",
        label: .keepSeparate,
        primaryObservationID: automatic.id,
        observationInputs: [
          CalibrationObservationInput(
            observationID: automatic.id,
            expectedFeatureDigest: automatic.featureDigest)
        ],
        algorithmFamily: automatic.algorithmFamily,
        algorithmVersion: automatic.algorithmVersion,
        calibrationID: automatic.calibrationID,
        reproductionFeatures: [
          CalibrationFeature(name: "reason", value: "manual-override")
        ],
        decidedAt: Date(timeIntervalSince1970: 20),
        corpusPartition: heldOutPartition,
        notes: "Supersedes incorrect auto-attachment",
        supersedesDecisionID: first.id),
      registry: registry)

    let reloaded = try await left.reload()

    #expect(reloaded.decisions.count == 2)
    #expect(
      reloaded.decisions.first(where: { $0.id == first.id })?.supersededByDecisionID == second.id)
    #expect(
      reloaded.decisions.first(where: { $0.id == first.id })?.supersededAt
        == Date(timeIntervalSince1970: 20))
    #expect(
      reloaded.decisions.first(where: { $0.id == second.id })?.supersedesDecisionID == first.id)
    #expect(reloaded.decisions.first(where: { $0.id == second.id })?.isActive == true)
    #expect(
      reloaded.decisions.first(where: { $0.id == second.id })?.primaryObservation?.id
        == automatic.id)
  }

  @Test("Missing observation identifiers fail truthfully")
  func missingObservationFails() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let store = CalibrationReviewStore(storageURL: fixture.root.appending(path: "missing.plist"))
    let registry = CalibrationObservationRegistry(observations: [])

    await #expect(throws: CalibrationReviewStoreError.missingObservation("missing-observation")) {
      try await store.append(
        CalibrationReviewDecisionDraft(
          id: "missing-decision",
          label: .sameSong,
          primaryObservationID: "missing-observation",
          observationInputs: [
            CalibrationObservationInput(
              observationID: "missing-observation",
              expectedFeatureDigest: String(repeating: "c", count: 64))
          ],
          algorithmFamily: "session-content-lineage",
          algorithmVersion: "session-content-lineage-v1"),
        registry: registry)
    }
  }

  @Test("Stale observation digests fail truthfully")
  func staleObservationFails() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let observation = try fixture.reviewCandidateObservation()
    let store = CalibrationReviewStore(storageURL: fixture.root.appending(path: "stale.plist"))
    let registry = CalibrationObservationRegistry(observations: [observation])

    await #expect(throws: CalibrationReviewStoreError.staleObservationIdentifier(observation.id)) {
      try await store.append(
        CalibrationReviewDecisionDraft(
          id: "stale-decision",
          label: .sameSong,
          primaryObservationID: observation.id,
          observationInputs: [
            CalibrationObservationInput(
              observationID: observation.id,
              expectedFeatureDigest: String(repeating: "d", count: 64))
          ],
          algorithmFamily: observation.algorithmFamily,
          algorithmVersion: observation.algorithmVersion),
        registry: registry)
    }
  }

  @Test("Path-only observation identities are rejected")
  func pathOnlyObservationFails() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let store = CalibrationReviewStore(storageURL: fixture.root.appending(path: "path-only.plist"))
    let observation = CalibrationObservationSnapshot(
      id: "path-only",
      kind: .audioMatchObservation,
      taskFamily: .audioMatch,
      algorithmFamily: "audio-match",
      algorithmVersion: "audio-match-v1",
      predictionDisposition: .suggested,
      predictedLabel: .sameRecording,
      score: 0.9,
      provenanceKeys: ["/Users/fixture/Music/only-path.wav"],
      evidenceFamilies: [.nearIdentityFingerprint])
    let registry = CalibrationObservationRegistry(observations: [observation])

    await #expect(throws: CalibrationReviewStoreError.privacyViolation("observation.provenance")) {
      try await store.append(
        CalibrationReviewDecisionDraft(
          id: "path-only-decision",
          label: .sameRecording,
          primaryObservationID: observation.id,
          observationInputs: [
            CalibrationObservationInput(
              observationID: observation.id,
              expectedFeatureDigest: observation.featureDigest)
          ],
          algorithmFamily: observation.algorithmFamily,
          algorithmVersion: observation.algorithmVersion),
        registry: registry)
    }
  }

  @Test("Unsupported schema is rejected during reload")
  func unsupportedSchemaFails() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    struct UnsupportedDocument: Codable {
      let schemaVersion: Int
      let directory: CalibrationReviewDirectory
    }

    let storeURL = fixture.root.appending(path: "unsupported.plist")
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    let data = try encoder.encode(
      UnsupportedDocument(schemaVersion: 999, directory: CalibrationReviewDirectory()))
    try data.write(to: storeURL, options: .atomic)

    await #expect(throws: CalibrationReviewStoreError.unsupportedSchema(999)) {
      _ = try await CalibrationReviewStore(storageURL: storeURL).reload()
    }
  }

  @Test("Content snapshot factories bind identity and digest to changed evidence")
  func contentSnapshotIdentityTracksEvidence() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let first = try fixture.reviewCandidate(
      id: "stable-review", observationID: "content-observation-a", token: "token-a")
    let changed = try fixture.reviewCandidate(
      id: "stable-review", observationID: "content-observation-b", token: "token-b")
    let firstSnapshot = CalibrationObservationSnapshot.from(reviewCandidate: first)
    let changedSnapshot = CalibrationObservationSnapshot.from(reviewCandidate: changed)

    #expect(firstSnapshot.id == "content-observation-a")
    #expect(changedSnapshot.id == "content-observation-b")
    #expect(firstSnapshot.featureDigest != changedSnapshot.featureDigest)

    let legacyFirst = try fixture.reviewCandidate(
      id: "legacy-review", observationID: nil, token: "legacy-token-a")
    let legacyChanged = try fixture.reviewCandidate(
      id: "legacy-review", observationID: nil, token: "legacy-token-b")
    #expect(
      CalibrationObservationSnapshot.from(reviewCandidate: legacyFirst).id
        != CalibrationObservationSnapshot.from(reviewCandidate: legacyChanged).id)

    let firstAutomatic = fixture.automaticAssignment(
      observationID: "automatic-observation-a", token: "automatic-token-a")
    let changedAutomatic = fixture.automaticAssignment(
      observationID: "automatic-observation-b", token: "automatic-token-b")
    #expect(
      CalibrationObservationSnapshot.from(automaticAssignment: firstAutomatic).id
        == "automatic-observation-a")
    #expect(
      CalibrationObservationSnapshot.from(automaticAssignment: changedAutomatic).id
        == "automatic-observation-b")
    #expect(
      CalibrationObservationSnapshot.from(
        automaticAssignment: fixture.automaticAssignment(
          observationID: nil, token: "legacy-automatic-a")
      ).id
        != CalibrationObservationSnapshot.from(
          automaticAssignment: fixture.automaticAssignment(
            observationID: nil, token: "legacy-automatic-b")
        ).id)
  }

  @Test("Audio snapshots retain transformed and excerpt reproduction evidence")
  func audioSnapshotRetainsReproductionEvidence() throws {
    func observation(
      targetStart: Double,
      pitch: Double
    ) -> AudioMatchObservation {
      AudioMatchObservation(
        sourceNodeID: "source-node",
        targetNodeID: "target-node",
        capability: .transformation,
        score: 0.91,
        matchedCoverage: 0.75,
        runnerUpMargin: 0.2,
        sourceRange: AudioTimeRange(startSeconds: 1, durationSeconds: 8),
        targetRange: AudioTimeRange(startSeconds: targetStart, durationSeconds: 8),
        transform: AudioTransformEvidence(
          timeFactor: 1.05,
          pitchSemitones: pitch,
          reversed: true),
        coveredDurationSeconds: 8,
        fingerprintDigest: "source-fingerprint",
        targetFingerprintDigest: "target-fingerprint",
        fingerprintVersion: "fingerprint-v1",
        sourceObservation: AudioMatchSourceObservation(
          contentSHA256: String(repeating: "1", count: 64), bytes: 1_000),
        targetObservation: AudioMatchSourceObservation(
          contentSHA256: String(repeating: "2", count: 64), bytes: 2_000),
        excerptRetrieval: AudioExcerptRetrievalDiagnostics(
          windowDurationSeconds: 2,
          hopDurationSeconds: 0.5,
          matchedWindowCount: 10,
          consecutiveWindowCount: 8,
          totalQueryWindowCount: 12,
          candidateWindowCount: 40,
          offsetConsistency: 0.97,
          scoreDistribution: AudioScoreDistribution(minimum: 0.7, mean: 0.85, maximum: 0.95)),
        explanation: "deterministic fixture",
        algorithmVersion: "transform-v1",
        algorithmFamily: "transformed-audio",
        materialClass: .mixedCorpus,
        resourceUsage: AudioMatchResourceUsage(
          sourceDurationSeconds: 10,
          targetDurationSeconds: 20,
          sourceFingerprintFrames: 100,
          targetFingerprintFrames: 200,
          candidateCount: 1,
          sourceFileBytes: 1_000,
          targetFileBytes: 2_000,
          workingMemoryUpperBoundBytes: 4_096))
    }

    let first = CalibrationObservationSnapshot.from(
      audioMatch: observation(targetStart: 42, pitch: -2))
    let moved = CalibrationObservationSnapshot.from(
      audioMatch: observation(targetStart: 43, pitch: -2))
    let repitched = CalibrationObservationSnapshot.from(
      audioMatch: observation(targetStart: 42, pitch: -1))
    let binding = try #require(first.binding)
    guard case .audio(let audio) = binding else {
      Issue.record("Expected an audio binding")
      return
    }

    #expect(audio.sourceRange == AudioTimeRange(startSeconds: 1, durationSeconds: 8))
    #expect(audio.targetRange == AudioTimeRange(startSeconds: 42, durationSeconds: 8))
    #expect(audio.transform?.pitchSemitones == -2)
    #expect(audio.excerptRetrieval?.matchedWindowCount == 10)
    #expect(first.featureDigest != moved.featureDigest)
    #expect(first.featureDigest != repitched.featureDigest)
  }

  @Test("All reviewed organisation actions persist authority and calibration across instances")
  func reviewedActionsPersistAcrossInstances() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let cases: [(SessionContentReviewedAction, CalibrationDecisionLabel, String)] = [
      (.accept, .sameSong, "suggested-work"),
      (.keepSeparate, .keepSeparate, "none"),
      (.assignElsewhere(workID: "elsewhere-work"), .assignedElsewhere, "elsewhere-work"),
      (.reject, .rejected, "none"),
    ]

    for (offset, item) in cases.enumerated() {
      let organisationURL = fixture.root.appending(path: "organisation-\(offset).plist")
      let calibrationURL = fixture.root.appending(path: "calibration-\(offset).plist")
      let candidate = try fixture.reviewCandidate(
        id: "review-\(offset)",
        observationID: "content-observation-\(offset)",
        token: "token-\(offset)")
      try fixture.seedOrganisation(at: organisationURL, candidate: candidate)
      let service = SessionContentReviewedActionService(
        organisationStore: StudioOrganisationStore(storageURL: organisationURL),
        calibrationStore: CalibrationReviewStore(storageURL: calibrationURL))

      let record = try await service.apply(
        SessionContentReviewedActionRequest(
          reviewCandidateID: candidate.id,
          expectedObservation: CalibrationObservationSnapshot.from(reviewCandidate: candidate),
          action: item.0,
          decisionID: "decision-\(offset)",
          decidedAt: Date(timeIntervalSince1970: Double(100 + offset))))
      let organisation = try await StudioOrganisationStore(storageURL: organisationURL).load()
      let calibration = try await CalibrationReviewStore(storageURL: calibrationURL).reload()

      #expect(record.label == item.1)
      #expect(record.primaryObservationID == candidate.observationID)
      #expect(calibration.decisions == [record])
      #expect(organisation.pendingCalibrationReviewActions.isEmpty)
      #expect(record.reproductionFeatures.contains { $0.name == "reviewAction" })
      if item.2 == "none" {
        #expect(
          organisation.contentMatchRejections.contains {
            $0.sessionID == candidate.sessionID && $0.workID == candidate.candidateWorkID
          })
      } else {
        #expect(organisation.assignmentsBySessionID[candidate.sessionID]?.workID == item.2)
      }
    }
  }

  @Test("A candidate replaced under the same ID is rejected before authority mutation")
  func staleCandidateIsRejectedDuringServicePreflight() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let organisationURL = fixture.root.appending(path: "stale-preflight-organisation.plist")
    let calibrationURL = fixture.root.appending(path: "stale-preflight-calibration.plist")
    let shown = try fixture.reviewCandidate(
      id: "stable-review-id",
      observationID: "shown-observation",
      token: "shown-token")
    let replacement = try fixture.reviewCandidate(
      id: shown.id,
      observationID: "replacement-observation",
      token: "replacement-token")
    try fixture.seedOrganisation(at: organisationURL, candidate: replacement)

    await #expect(
      throws: SessionContentReviewedActionError.staleReviewCandidate(shown.id)
    ) {
      try await SessionContentReviewedActionService(
        organisationStore: StudioOrganisationStore(storageURL: organisationURL),
        calibrationStore: CalibrationReviewStore(storageURL: calibrationURL)
      ).apply(
        SessionContentReviewedActionRequest(
          reviewCandidateID: shown.id,
          expectedObservation: CalibrationObservationSnapshot.from(reviewCandidate: shown),
          action: .accept,
          decisionID: "stale-preflight-decision"))
    }
    let organisation = try await StudioOrganisationStore(storageURL: organisationURL).load()
    let calibration = try await CalibrationReviewStore(storageURL: calibrationURL).reload()

    #expect(organisation.sessionAssignments.isEmpty)
    #expect(organisation.contentMatchRejections.isEmpty)
    #expect(organisation.contentAutomaticAssignments.isEmpty)
    #expect(organisation.pendingCalibrationReviewActions.isEmpty)
    #expect(organisation.contentReviewCandidates == [replacement])
    #expect(calibration.decisions.isEmpty)
  }

  @Test("A candidate replaced after preflight is rejected inside the locked mutation")
  func staleCandidateIsRejectedInsideAuthorityTransaction() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let organisationURL = fixture.root.appending(path: "stale-transaction-organisation.plist")
    let calibrationURL = fixture.root.appending(path: "stale-transaction-calibration.plist")
    let shown = try fixture.reviewCandidate(
      id: "stable-review-id",
      observationID: "transaction-shown-observation",
      token: "transaction-shown-token")
    let replacement = try fixture.reviewCandidate(
      id: shown.id,
      observationID: "transaction-replacement-observation",
      token: "transaction-replacement-token")
    try fixture.seedOrganisation(at: organisationURL, candidate: shown)
    let service = SessionContentReviewedActionService(
      organisationStore: StudioOrganisationStore(storageURL: organisationURL),
      calibrationStore: CalibrationReviewStore(storageURL: calibrationURL),
      beforeAuthorityMutation: {
        try fixture.seedOrganisation(at: organisationURL, candidate: replacement)
      })

    await #expect(
      throws: SessionContentReviewedActionError.staleReviewCandidate(shown.id)
    ) {
      try await service.apply(
        SessionContentReviewedActionRequest(
          reviewCandidateID: shown.id,
          expectedObservation: CalibrationObservationSnapshot.from(reviewCandidate: shown),
          action: .reject,
          decisionID: "stale-transaction-decision"))
    }
    let organisation = try await StudioOrganisationStore(storageURL: organisationURL).load()
    let calibration = try await CalibrationReviewStore(storageURL: calibrationURL).reload()

    #expect(organisation.sessionAssignments.isEmpty)
    #expect(organisation.contentMatchRejections.isEmpty)
    #expect(organisation.contentAutomaticAssignments.isEmpty)
    #expect(organisation.pendingCalibrationReviewActions.isEmpty)
    #expect(organisation.contentReviewCandidates == [replacement])
    #expect(calibration.decisions.isEmpty)
  }

  @Test("Calibration failure persists an outbox and recovers across store instances")
  func calibrationFailureDoesNotRollBackAuthority() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let organisationURL = fixture.root.appending(path: "authority.plist")
    let calibrationURL = fixture.root.appending(path: "authority-calibration.plist")
    let candidate = try fixture.reviewCandidate(
      id: "authority-review", observationID: "authority-observation", token: "authority-token")
    try fixture.seedOrganisation(at: organisationURL, candidate: candidate)
    try FileManager.default.createDirectory(at: calibrationURL, withIntermediateDirectories: true)
    let service = SessionContentReviewedActionService(
      organisationStore: StudioOrganisationStore(storageURL: organisationURL),
      calibrationStore: CalibrationReviewStore(storageURL: calibrationURL))

    await #expect(throws: SessionContentReviewedActionError.self) {
      try await service.apply(
        SessionContentReviewedActionRequest(
          reviewCandidateID: candidate.id,
          expectedObservation: CalibrationObservationSnapshot.from(reviewCandidate: candidate),
          action: .assignElsewhere(workID: "elsewhere-work"),
          decisionID: "recoverable-decision",
          decidedAt: Date(timeIntervalSince1970: 30)))
    }
    let persisted = try await StudioOrganisationStore(storageURL: organisationURL).load()
    let pending = try #require(persisted.pendingCalibrationReviewActions.first)
    #expect(persisted.assignmentsBySessionID[candidate.sessionID]?.workID == "elsewhere-work")
    #expect(pending.label == .assignedElsewhere)
    #expect(pending.observation.id == candidate.observationID)
    #expect(pending.lastFailure != nil)

    try FileManager.default.removeItem(at: calibrationURL)
    let recovered = try await SessionContentReviewedActionService(
      organisationStore: StudioOrganisationStore(storageURL: organisationURL),
      calibrationStore: CalibrationReviewStore(storageURL: calibrationURL)
    ).retryPendingCalibrationActions()
    let reloadedOrganisation = try await StudioOrganisationStore(
      storageURL: organisationURL
    ).load()
    let ledger = try await CalibrationReviewStore(storageURL: calibrationURL).reload()

    #expect(recovered.map(\.id) == ["recoverable-decision"])
    #expect(reloadedOrganisation.pendingCalibrationReviewActions.isEmpty)
    #expect(ledger.decisions.first?.label == .assignedElsewhere)
  }

  @Test("Reviewed action service supersedes prior decisions for the same content observation")
  func reviewedActionSupersessionPersists() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let organisationURL = fixture.root.appending(path: "supersession-organisation.plist")
    let calibrationURL = fixture.root.appending(path: "supersession-calibration.plist")
    let candidate = try fixture.reviewCandidate(
      id: "supersession-review",
      observationID: "supersession-observation",
      token: "supersession-token")
    try fixture.seedOrganisation(at: organisationURL, candidate: candidate)
    let firstService = SessionContentReviewedActionService(
      organisationStore: StudioOrganisationStore(storageURL: organisationURL),
      calibrationStore: CalibrationReviewStore(storageURL: calibrationURL))
    let first = try await firstService.apply(
      SessionContentReviewedActionRequest(
        reviewCandidateID: candidate.id,
        expectedObservation: CalibrationObservationSnapshot.from(reviewCandidate: candidate),
        action: .keepSeparate,
        decisionID: "supersession-first",
        decidedAt: Date(timeIntervalSince1970: 10)))

    try fixture.seedOrganisation(at: organisationURL, candidate: candidate)
    let second = try await SessionContentReviewedActionService(
      organisationStore: StudioOrganisationStore(storageURL: organisationURL),
      calibrationStore: CalibrationReviewStore(storageURL: calibrationURL)
    ).apply(
      SessionContentReviewedActionRequest(
        reviewCandidateID: candidate.id,
        expectedObservation: CalibrationObservationSnapshot.from(reviewCandidate: candidate),
        action: .accept,
        decisionID: "supersession-second",
        decidedAt: Date(timeIntervalSince1970: 20)))
    let reloaded = try await CalibrationReviewStore(storageURL: calibrationURL).reload()

    #expect(second.supersedesDecisionID == first.id)
    #expect(reloaded.decisions.first { $0.id == first.id }?.supersededByDecisionID == second.id)
    #expect(reloaded.decisions.first { $0.id == second.id }?.isActive == true)
  }

  @Test("Retry clears an outbox already delivered before a prior process stopped")
  func retryIsIdempotentAfterLedgerDelivery() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let organisationURL = fixture.root.appending(path: "idempotent-organisation.plist")
    let calibrationURL = fixture.root.appending(path: "idempotent-calibration.plist")
    let candidate = try fixture.reviewCandidate(
      id: "idempotent-review",
      observationID: "idempotent-observation",
      token: "idempotent-token")
    let snapshot = CalibrationObservationSnapshot.from(reviewCandidate: candidate)
    let pending = SessionContentReviewedActionOutboxRecord(
      decisionID: "idempotent-decision",
      observation: snapshot,
      label: .sameSong,
      reproductionFeatures: [CalibrationFeature(name: "reviewAction", value: "accept")],
      decidedAt: Date(timeIntervalSince1970: 40),
      notes: nil,
      enqueuedAt: Date(timeIntervalSince1970: 40))
    try fixture.seedOrganisation(
      at: organisationURL,
      candidate: candidate,
      assignments: [
        StudioSessionAssignment(
          sessionID: candidate.sessionID,
          workID: candidate.candidateWorkID,
          assignedAt: pending.decidedAt)
      ],
      pending: [pending])
    let calibrationStore = CalibrationReviewStore(storageURL: calibrationURL)
    _ = try await calibrationStore.append(
      CalibrationReviewDecisionDraft(
        id: pending.decisionID,
        label: pending.label,
        primaryObservationID: snapshot.id,
        observationInputs: [
          CalibrationObservationInput(
            observationID: snapshot.id,
            expectedFeatureDigest: snapshot.featureDigest)
        ],
        algorithmFamily: snapshot.algorithmFamily,
        algorithmVersion: snapshot.algorithmVersion,
        calibrationID: snapshot.calibrationID,
        reproductionFeatures: pending.reproductionFeatures,
        decidedAt: pending.decidedAt),
      registry: CalibrationObservationRegistry(observations: [snapshot]))

    let delivered = try await SessionContentReviewedActionService(
      organisationStore: StudioOrganisationStore(storageURL: organisationURL),
      calibrationStore: CalibrationReviewStore(storageURL: calibrationURL)
    ).retryPendingCalibrationDecision(pending.decisionID)
    let organisation = try await StudioOrganisationStore(storageURL: organisationURL).load()
    let calibration = try await CalibrationReviewStore(storageURL: calibrationURL).reload()

    #expect(delivered.id == pending.decisionID)
    #expect(organisation.pendingCalibrationReviewActions.isEmpty)
    #expect(organisation.assignmentsBySessionID[candidate.sessionID]?.workID == "suggested-work")
    #expect(calibration.decisions.count == 1)
  }

  @Test("Retry validates and preserves a delivered supersession chain")
  func retryAcceptsEquivalentDeliveredSupersession() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let organisationURL = fixture.root.appending(path: "retry-supersession-organisation.plist")
    let calibrationURL = fixture.root.appending(path: "retry-supersession-calibration.plist")
    let candidate = try fixture.reviewCandidate(
      id: "retry-supersession-review",
      observationID: "retry-supersession-observation",
      token: "retry-supersession-token")
    let snapshot = CalibrationObservationSnapshot.from(reviewCandidate: candidate)
    let calibrationStore = CalibrationReviewStore(storageURL: calibrationURL)
    let prior = try await calibrationStore.append(
      CalibrationReviewDecisionDraft(
        id: "retry-supersession-prior",
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
        reproductionFeatures: [CalibrationFeature(name: "reviewAction", value: "keepSeparate")],
        decidedAt: Date(timeIntervalSince1970: 40)),
      registry: CalibrationObservationRegistry(observations: [snapshot]))
    let pending = SessionContentReviewedActionOutboxRecord(
      decisionID: "retry-supersession-current",
      observation: snapshot,
      label: .sameSong,
      reproductionFeatures: [CalibrationFeature(name: "reviewAction", value: "accept")],
      decidedAt: Date(timeIntervalSince1970: 50),
      notes: "superseding action",
      enqueuedAt: Date(timeIntervalSince1970: 50))
    try fixture.seedOrganisation(
      at: organisationURL,
      candidate: candidate,
      assignments: [
        StudioSessionAssignment(
          sessionID: candidate.sessionID,
          workID: candidate.candidateWorkID,
          assignedAt: pending.decidedAt)
      ],
      pending: [pending])
    _ = try await calibrationStore.append(
      CalibrationReviewDecisionDraft(
        id: pending.decisionID,
        label: pending.label,
        primaryObservationID: snapshot.id,
        observationInputs: [
          CalibrationObservationInput(
            observationID: snapshot.id,
            expectedFeatureDigest: snapshot.featureDigest)
        ],
        algorithmFamily: snapshot.algorithmFamily,
        algorithmVersion: snapshot.algorithmVersion,
        calibrationID: snapshot.calibrationID,
        reproductionFeatures: pending.reproductionFeatures,
        decidedAt: pending.decidedAt,
        notes: pending.notes,
        supersedesDecisionID: prior.id),
      registry: CalibrationObservationRegistry(observations: [snapshot]))

    let delivered = try await SessionContentReviewedActionService(
      organisationStore: StudioOrganisationStore(storageURL: organisationURL),
      calibrationStore: CalibrationReviewStore(storageURL: calibrationURL)
    ).retryPendingCalibrationDecision(pending.decisionID)
    let organisation = try await StudioOrganisationStore(storageURL: organisationURL).load()
    let calibration = try await calibrationStore.reload()

    #expect(delivered.supersedesDecisionID == prior.id)
    #expect(
      calibration.decisions.first { $0.id == prior.id }?.supersededByDecisionID == delivered.id)
    #expect(organisation.pendingCalibrationReviewActions.isEmpty)
  }

  @Test("Retry preserves the outbox when any authoritative decision payload differs")
  func retryRejectsPartialDecisionEquivalence() async throws {
    struct ConflictVariation {
      let name: String
      let features: [CalibrationFeature]
      let decidedAt: Date
      let notes: String?
    }

    let fixture = try Fixture()
    defer { fixture.remove() }
    let candidate = try fixture.reviewCandidate(
      id: "partial-equivalence-review",
      observationID: "partial-equivalence-observation",
      token: "partial-equivalence-token")
    let snapshot = CalibrationObservationSnapshot.from(reviewCandidate: candidate)
    let authoritativeFeatures = [
      CalibrationFeature(name: "reviewAction", value: "assignElsewhere"),
      CalibrationFeature(name: "reviewCandidateID", value: candidate.id),
      CalibrationFeature(name: "sessionID", value: candidate.sessionID),
      CalibrationFeature(name: "suggestedWorkID", value: candidate.candidateWorkID),
      CalibrationFeature(name: "targetWorkID", value: "elsewhere-work"),
      CalibrationFeature(name: "candidateGenerationToken", value: "partial-equivalence-token"),
    ]
    let decisionTime = Date(timeIntervalSince1970: 50)
    let variations = [
      ConflictVariation(
        name: "target-work",
        features: authoritativeFeatures.map {
          $0.name == "targetWorkID"
            ? CalibrationFeature(name: $0.name, value: "different-work") : $0
        },
        decidedAt: decisionTime,
        notes: "authoritative note"),
      ConflictVariation(
        name: "session",
        features: authoritativeFeatures.map {
          $0.name == "sessionID"
            ? CalibrationFeature(name: $0.name, value: "different-session") : $0
        },
        decidedAt: decisionTime,
        notes: "authoritative note"),
      ConflictVariation(
        name: "features",
        features: authoritativeFeatures
          + [CalibrationFeature(name: "unexpectedAuthority", value: "different")],
        decidedAt: decisionTime,
        notes: "authoritative note"),
      ConflictVariation(
        name: "notes",
        features: authoritativeFeatures,
        decidedAt: decisionTime,
        notes: "different note"),
      ConflictVariation(
        name: "decision-time",
        features: authoritativeFeatures,
        decidedAt: Date(timeIntervalSince1970: 51),
        notes: "authoritative note"),
    ]

    for variation in variations {
      let organisationURL = fixture.root.appending(
        path: "partial-equivalence-\(variation.name)-organisation.plist")
      let calibrationURL = fixture.root.appending(
        path: "partial-equivalence-\(variation.name)-calibration.plist")
      let pending = SessionContentReviewedActionOutboxRecord(
        decisionID: "partial-equivalence-\(variation.name)",
        observation: snapshot,
        label: .assignedElsewhere,
        reproductionFeatures: authoritativeFeatures,
        decidedAt: decisionTime,
        notes: "authoritative note",
        enqueuedAt: decisionTime)
      try fixture.seedOrganisation(
        at: organisationURL,
        candidate: candidate,
        assignments: [
          StudioSessionAssignment(
            sessionID: candidate.sessionID,
            workID: "elsewhere-work",
            assignedAt: decisionTime)
        ],
        pending: [pending])
      _ = try await CalibrationReviewStore(storageURL: calibrationURL).append(
        CalibrationReviewDecisionDraft(
          id: pending.decisionID,
          label: pending.label,
          primaryObservationID: snapshot.id,
          observationInputs: [
            CalibrationObservationInput(
              observationID: snapshot.id,
              expectedFeatureDigest: snapshot.featureDigest)
          ],
          algorithmFamily: snapshot.algorithmFamily,
          algorithmVersion: snapshot.algorithmVersion,
          calibrationID: snapshot.calibrationID,
          reproductionFeatures: variation.features,
          decidedAt: variation.decidedAt,
          notes: variation.notes),
        registry: CalibrationObservationRegistry(observations: [snapshot]))

      await #expect(throws: SessionContentReviewedActionError.self) {
        try await SessionContentReviewedActionService(
          organisationStore: StudioOrganisationStore(storageURL: organisationURL),
          calibrationStore: CalibrationReviewStore(storageURL: calibrationURL)
        ).retryPendingCalibrationDecision(pending.decisionID)
      }
      let organisation = try await StudioOrganisationStore(storageURL: organisationURL).load()

      #expect(
        organisation.pendingCalibrationReviewActions.map(\.decisionID) == [pending.decisionID])
      #expect(organisation.pendingCalibrationReviewActions.first?.lastFailure != nil)
      #expect(
        organisation.assignmentsBySessionID[candidate.sessionID]?.workID == "elsewhere-work")
    }
  }

  @Test("Concurrent cross-instance retries converge on one equivalent decision")
  func concurrentRetriesConvergeIdempotently() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let organisationURL = fixture.root.appending(path: "concurrent-retry-organisation.plist")
    let calibrationURL = fixture.root.appending(path: "concurrent-retry-calibration.plist")
    let candidate = try fixture.reviewCandidate(
      id: "concurrent-retry-review",
      observationID: "concurrent-retry-observation",
      token: "concurrent-retry-token")
    let snapshot = CalibrationObservationSnapshot.from(reviewCandidate: candidate)
    let decisionTime = Date(timeIntervalSince1970: 60)
    let pending = SessionContentReviewedActionOutboxRecord(
      decisionID: "concurrent-retry-decision",
      observation: snapshot,
      label: .sameSong,
      reproductionFeatures: [
        CalibrationFeature(name: "reviewAction", value: "accept"),
        CalibrationFeature(name: "reviewCandidateID", value: candidate.id),
        CalibrationFeature(name: "sessionID", value: candidate.sessionID),
        CalibrationFeature(name: "suggestedWorkID", value: candidate.candidateWorkID),
        CalibrationFeature(name: "targetWorkID", value: candidate.candidateWorkID),
        CalibrationFeature(name: "candidateGenerationToken", value: "concurrent-retry-token"),
      ],
      decidedAt: decisionTime,
      notes: "concurrent retry",
      enqueuedAt: decisionTime)
    try fixture.seedOrganisation(
      at: organisationURL,
      candidate: candidate,
      assignments: [
        StudioSessionAssignment(
          sessionID: candidate.sessionID,
          workID: candidate.candidateWorkID,
          assignedAt: decisionTime)
      ],
      pending: [pending])
    let barrier = AsyncTestBarrier(participantCount: 2)
    let left = SessionContentReviewedActionService(
      organisationStore: StudioOrganisationStore(storageURL: organisationURL),
      calibrationStore: CalibrationReviewStore(storageURL: calibrationURL),
      beforeCalibrationAppend: { await barrier.wait() })
    let right = SessionContentReviewedActionService(
      organisationStore: StudioOrganisationStore(storageURL: organisationURL),
      calibrationStore: CalibrationReviewStore(storageURL: calibrationURL),
      beforeCalibrationAppend: { await barrier.wait() })

    async let leftResult = left.retryPendingCalibrationDecision(pending.decisionID)
    async let rightResult = right.retryPendingCalibrationDecision(pending.decisionID)
    let delivered = try await (leftResult, rightResult)
    let organisation = try await StudioOrganisationStore(storageURL: organisationURL).load()
    let calibration = try await CalibrationReviewStore(storageURL: calibrationURL).reload()

    #expect(delivered.0 == delivered.1)
    #expect(calibration.decisions == [delivered.0])
    #expect(organisation.pendingCalibrationReviewActions.isEmpty)
    #expect(organisation.assignmentsBySessionID[candidate.sessionID]?.workID == "suggested-work")
  }
}

private actor AsyncTestBarrier {
  private let participantCount: Int
  private var continuations: [CheckedContinuation<Void, Never>] = []

  init(participantCount: Int) {
    self.participantCount = participantCount
  }

  func wait() async {
    await withCheckedContinuation { continuation in
      continuations.append(continuation)
      guard continuations.count == participantCount else { return }
      let waiting = continuations
      continuations.removeAll()
      for continuation in waiting {
        continuation.resume()
      }
    }
  }
}

extension CalibrationReviewStoreTests {
  fileprivate struct Fixture: Sendable {
    let root: URL

    init() throws {
      root = FileManager.default.temporaryDirectory.appending(
        path: "CalibrationReviewStoreTests-\(UUID().uuidString)",
        directoryHint: .isDirectory)
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    func remove() {
      try? FileManager.default.removeItem(at: root)
    }

    func reviewCandidateObservation() throws -> CalibrationObservationSnapshot {
      CalibrationObservationSnapshot.from(
        reviewCandidate: try reviewCandidate(
          id: "review-candidate",
          observationID: "review-content-observation",
          token: "invalidation-review"),
        corpusPartition: heldOutPartition)
    }

    func reviewCandidate(
      id: String,
      observationID: String?,
      token: String
    ) throws -> SessionContentReviewCandidate {
      let evidenceKey = observationID ?? token
      let observation = try containmentObservation(
        sourceID: "source-\(evidenceKey)",
        candidateID: "candidate-\(evidenceKey)")
      return SessionContentReviewCandidate(
        id: id,
        sessionID: "session-review",
        sourceWorkID: "work-source",
        candidateWorkID: "suggested-work",
        relationship: .sameWork,
        score: 0.74,
        matchedAnchorIDs: ["anchor-a", "anchor-b"],
        explanation: "Distinctive evidence suggests the same Song.",
        calibrationID: "calibration-a",
        candidateGeneration: SessionContentCandidateGenerationMetadata(
          algorithmFamily: "session-content-lineage-candidate-generation",
          algorithmVersion: "session-content-lineage-candidate-generation-v2",
          candidatePoolCount: 9,
          shortlistedCandidateCount: 4,
          exactComparisonCandidateCount: 4,
          exactComparisonCandidateLimit: 12,
          deterministicOverlapCandidateCount: 2,
          sketchBandCandidateCount: 3,
          exhaustiveFallbackUsed: false,
          sourceManifestToken: "source-manifest",
          candidatePoolToken: "candidate-pool",
          invalidationToken: token),
        independentSourceMaterialCount: 2,
        observation: observation,
        observationID: observationID)
    }

    func automaticAssignmentObservation() throws -> CalibrationObservationSnapshot {
      let observation = try containmentObservation(
        sourceID: "source-auto",
        candidateID: "candidate-auto")
      let assignment = SessionContentAutomaticAssignment(
        sessionID: "session-auto",
        sourceWorkID: "work-source",
        workID: "work-target",
        relationship: .sameWork,
        score: 0.93,
        calibrationID: "calibration-auto",
        matchedAnchorIDs: ["anchor-a", "anchor-b", "anchor-c"],
        explanation: "Distinctive evidence auto-attached the Session.",
        candidateGeneration: SessionContentCandidateGenerationMetadata(
          algorithmFamily: "session-content-lineage-candidate-generation",
          algorithmVersion: "session-content-lineage-candidate-generation-v2",
          candidatePoolCount: 11,
          shortlistedCandidateCount: 5,
          exactComparisonCandidateCount: 5,
          exactComparisonCandidateLimit: 12,
          deterministicOverlapCandidateCount: 3,
          sketchBandCandidateCount: 4,
          exhaustiveFallbackUsed: false,
          sourceManifestToken: "source-manifest",
          candidatePoolToken: "candidate-pool",
          invalidationToken: "invalidation-auto"),
        observation: observation)
      return CalibrationObservationSnapshot.from(
        automaticAssignment: assignment,
        corpusPartition: heldOutPartition,
        performance: CalibrationObservationPerformance(
          wallClockMilliseconds: 12,
          cpuMilliseconds: 9,
          peakResidentMegabytes: 48,
          bytesScanned: 9_216,
          comparedCandidateCount: 5))
    }

    func automaticAssignment(
      observationID: String?,
      token: String
    ) -> SessionContentAutomaticAssignment {
      SessionContentAutomaticAssignment(
        sessionID: "session-auto",
        sourceWorkID: "work-source",
        workID: "suggested-work",
        relationship: .sameWork,
        score: 0.93,
        calibrationID: "calibration-auto",
        matchedAnchorIDs: ["anchor-a", "anchor-b"],
        explanation: "Automatic assignment.",
        candidateGeneration: SessionContentCandidateGenerationMetadata(
          algorithmFamily: "candidate-generation",
          algorithmVersion: "candidate-generation-v3",
          candidatePoolCount: 2,
          shortlistedCandidateCount: 2,
          exactComparisonCandidateCount: 2,
          exactComparisonCandidateLimit: 2,
          deterministicOverlapCandidateCount: 2,
          sketchBandCandidateCount: 2,
          exhaustiveFallbackUsed: false,
          sourceManifestToken: "source",
          candidatePoolToken: "pool",
          invalidationToken: token),
        observationID: observationID)
    }

    func seedOrganisation(
      at storageURL: URL,
      candidate: SessionContentReviewCandidate,
      assignments: [StudioSessionAssignment] = [],
      pending: [SessionContentReviewedActionOutboxRecord] = []
    ) throws {
      struct Document: Codable {
        let schemaVersion: Int
        let directory: StudioOrganisationDirectory
      }
      let artist = StudioArtistRecord(id: "artist", displayName: "Artist")
      let works = [
        StudioWorkRecord(id: "source-work", artistID: artist.id, displayName: "Source"),
        StudioWorkRecord(id: "suggested-work", artistID: artist.id, displayName: "Suggested"),
        StudioWorkRecord(id: "elsewhere-work", artistID: artist.id, displayName: "Elsewhere"),
      ]
      let data = try PropertyListEncoder().encode(
        Document(
          schemaVersion: 1,
          directory: StudioOrganisationDirectory(
            artists: [artist], works: works,
            sessionAssignments: assignments,
            contentReviewCandidates: [candidate],
            pendingCalibrationReviewActions: pending)))
      try data.write(to: storageURL, options: .atomic)
    }

    func containmentObservation(
      sourceID: String,
      candidateID: String
    ) throws -> DirectionalSessionContainmentObservation {
      let source = try revisionReference(id: sourceID)
      let candidate = try revisionReference(id: candidateID)
      return DirectionalSessionContainmentObservation(
        sourceRevisionReference: source,
        candidateRevisionReference: candidate,
        sourceEvidenceRevisionReferences: [source],
        candidateEvidenceRevisionReferences: [candidate],
        algorithmFamily: "session-content-lineage",
        algorithmVersion: "session-content-lineage-v1",
        calibrationID: "calibration-a",
        sourceContainsCandidateScore: 0.82,
        candidateContainsSourceScore: 0.78,
        weightedIntersectionTotal: 6,
        sourceMatchedWeightTotal: 6,
        sourceWeightTotal: 7,
        candidateMatchedWeightTotal: 6,
        candidateWeightTotal: 8,
        arrangementScore: 0.75,
        matchedEvidenceGroups: [
          DirectionalContainmentEvidenceGroup(
            family: .exact,
            sourceAnchorIDs: ["exact-source"],
            candidateAnchorIDs: ["exact-candidate"]),
          DirectionalContainmentEvidenceGroup(
            family: .placement,
            sourceAnchorIDs: ["placement-source"],
            candidateAnchorIDs: ["placement-candidate"]),
        ],
        unavailableEvidenceFamilies: [.excerpt, .pcm],
        suppressedAnchors: [],
        exactEvidenceCount: 1,
        pcmEvidenceCount: nil,
        excerptEvidenceCount: nil,
        placementEvidenceCount: 1,
        midiStructureEvidenceCount: 0,
        arrangementEvidenceCount: 1,
        distinctiveAnchorCount: 3,
        distinctiveEvidenceKindCount: 2,
        independentSourceMaterialCount: 2,
        runnerUpMargin: 0.19,
        chronologyCompatibility: .compatible,
        artistCompatibility: .compatible,
        conflicts: [],
        explanation: "Directional containment is distinctive and chronology-compatible.")
    }

    func revisionReference(id: String) throws -> StudioRevisionReference {
      let trackedRoot = root.appending(path: "Tracked", directoryHint: .isDirectory)
      try FileManager.default.createDirectory(at: trackedRoot, withIntermediateDirectories: true)
      let sessionRoot = trackedRoot.appending(path: id, directoryHint: .isDirectory)
      try FileManager.default.createDirectory(at: sessionRoot, withIntermediateDirectories: true)
      let setURL = sessionRoot.appending(path: "\(id).als")
      try Data([1, 2, 3, 4]).write(to: setURL)
      let set = AbletonSet(
        id: "set-\(id)",
        fileURL: setURL,
        displayName: id,
        isBackup: false,
        modifiedAt: Date(timeIntervalSince1970: 1),
        compressedBytes: 4,
        xmlBytes: 4,
        creator: "Ableton Live 12",
        format: AbletonFormat(
          majorVersion: "5",
          minorVersion: "12",
          schemaChangeCount: 1,
          revision: nil),
        structure: SetStructure(),
        content: AbletonSetContent())
      return StudioRevisionReference(
        workID: "work-\(id)",
        sessionID: "session-\(id)",
        revisionID: "revision-\(id)",
        setID: set.id,
        setURL: setURL,
        trackedRootURL: trackedRoot,
        contentObservation: StudioSetContentObservation(set: set),
        displaySnapshot: StudioRevisionDisplaySnapshot(
          artistName: "Artist \(id)",
          workName: "Song \(id)",
          sessionName: "Session \(id)",
          revisionName: id),
        catalogueAlgorithmVersion: "catalog-v1",
        catalogueGenerationID: "generation-1",
        reviewedAt: Date(timeIntervalSince1970: 2))
    }
  }
}

@Suite("Calibration review storage v2 adversaries")
struct CalibrationReviewStoreV2Tests {
  @Test("Typed recording covers every authoritative label family")
  func allTypedLabelsPersist() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let store = CalibrationReviewStore(storageURL: fixture.storeURL)
    let service = CalibrationReviewRecordingService(store: store)

    for (index, label) in CalibrationDecisionLabel.allCases.enumerated() {
      let action = try #require(CalibrationTypedReviewAction(label: label))
      let observation = fixture.observation(for: action, suffix: "\(index)")
      let record = try await service.record(
        CalibrationTypedReviewRequest(
          decisionID: "decision-\(index)",
          action: action,
          observation: observation,
          decidedAt: Date(timeIntervalSince1970: TimeInterval(index + 1))))
      #expect(record.label == label)
      #expect(record.primaryObservation?.binding != nil)
    }

    let directory = try await store.load()
    #expect(directory.decisions.count == CalibrationDecisionLabel.allCases.count)
    #expect(Set(directory.decisions.map(\.label)) == Set(CalibrationDecisionLabel.allCases))
    let allDecisionsAreActive = directory.decisions.allSatisfy { $0.isActive }
    #expect(allDecisionsAreActive)
  }

  @Test("A later decision automatically supersedes the one active immutable subject")
  func automaticSupersession() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let store = CalibrationReviewStore(storageURL: fixture.storeURL)
    let service = CalibrationReviewRecordingService(store: store)
    let observation = fixture.observation(
      for: .workContainment(.sameSong),
      suffix: "same-subject")
    let first = try await service.record(
      CalibrationTypedReviewRequest(
        decisionID: "first",
        action: .workContainment(.sameSong),
        observation: observation,
        decidedAt: Date(timeIntervalSince1970: 10)))
    let second = try await service.record(
      CalibrationTypedReviewRequest(
        decisionID: "second",
        action: .workContainment(.keepSeparate),
        observation: observation,
        decidedAt: Date(timeIntervalSince1970: 20)))

    let directory = try await store.load()
    #expect(first.supersedesDecisionID == nil)
    #expect(second.supersedesDecisionID == first.id)
    #expect(directory.decisions.first { $0.id == first.id }?.supersededByDecisionID == second.id)
    #expect(directory.decisions.filter(\.isActive).map(\.id) == [second.id])
  }

  @Test("Distinct Session label families retain independent active authority")
  func independentSessionFamiliesRemainActive() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let store = CalibrationReviewStore(storageURL: fixture.storeURL)
    let service = CalibrationReviewRecordingService(store: store)
    let containment = fixture.observation(
      for: .workContainment(.sameSong),
      suffix: "shared-session-pair")
    let relationshipFixture = fixture.observation(
      for: .sessionRelationship(.evolved),
      suffix: "shared-session-pair")
    let relationship = CalibrationObservationSnapshot(
      id: "session-relationship-observation",
      kind: relationshipFixture.kind,
      taskFamily: relationshipFixture.taskFamily,
      algorithmFamily: relationshipFixture.algorithmFamily,
      algorithmVersion: relationshipFixture.algorithmVersion,
      predictionDisposition: relationshipFixture.predictionDisposition,
      predictedLabel: relationshipFixture.predictedLabel,
      score: relationshipFixture.score,
      binding: relationshipFixture.binding,
      provenanceKeys: relationshipFixture.provenanceKeys,
      evidenceFamilies: relationshipFixture.evidenceFamilies,
      features: relationshipFixture.features,
      observedAt: relationshipFixture.observedAt)

    _ = try await service.record(
      CalibrationTypedReviewRequest(
        decisionID: "containment-decision",
        action: .workContainment(.sameSong),
        observation: containment,
        decidedAt: Date(timeIntervalSince1970: 10)))
    _ = try await service.record(
      CalibrationTypedReviewRequest(
        decisionID: "relationship-decision",
        action: .sessionRelationship(.evolved),
        observation: relationship,
        decidedAt: Date(timeIntervalSince1970: 20)))

    let directory = try await store.load()
    #expect(
      directory.decisions.filter(\.isActive).map(\.id) == [
        "containment-decision", "relationship-decision",
      ])
  }

  @Test("Observation IDs cannot be rebound to different immutable evidence")
  func observationIDRebindingFails() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let store = CalibrationReviewStore(storageURL: fixture.storeURL)
    let service = CalibrationReviewRecordingService(store: store)
    let first = fixture.observation(for: .workContainment(.sameSong), suffix: "first")
    let replacementFixture = fixture.observation(
      for: .workContainment(.sameSong),
      suffix: "replacement")
    let replacement = CalibrationObservationSnapshot(
      id: first.id,
      kind: replacementFixture.kind,
      taskFamily: replacementFixture.taskFamily,
      algorithmFamily: replacementFixture.algorithmFamily,
      algorithmVersion: replacementFixture.algorithmVersion,
      predictionDisposition: replacementFixture.predictionDisposition,
      predictedLabel: replacementFixture.predictedLabel,
      score: replacementFixture.score,
      binding: replacementFixture.binding,
      provenanceKeys: replacementFixture.provenanceKeys,
      evidenceFamilies: replacementFixture.evidenceFamilies,
      features: replacementFixture.features,
      observedAt: replacementFixture.observedAt)

    _ = try await service.record(
      CalibrationTypedReviewRequest(
        decisionID: "first-decision",
        action: .workContainment(.sameSong),
        observation: first,
        decidedAt: Date(timeIntervalSince1970: 10)))
    await #expect(throws: CalibrationReviewStoreError.staleObservationIdentifier(first.id)) {
      try await service.record(
        CalibrationTypedReviewRequest(
          decisionID: "replacement-decision",
          action: .workContainment(.sameSong),
          observation: replacement,
          decidedAt: Date(timeIntervalSince1970: 20)))
    }
  }

  @Test("Normal load converges after another store instance writes")
  func normalLoadIsCrossInstanceFresh() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let reader = CalibrationReviewStore(storageURL: fixture.storeURL)
    let writer = CalibrationReviewStore(storageURL: fixture.storeURL)
    #expect(try await reader.load().decisions.isEmpty)
    let observation = fixture.observation(
      for: .workContainment(.sameSong),
      suffix: "fresh")
    _ = try await CalibrationReviewRecordingService(store: writer).record(
      CalibrationTypedReviewRequest(
        decisionID: "fresh-decision",
        action: .workContainment(.sameSong),
        observation: observation,
        decidedAt: Date(timeIntervalSince1970: 10)))
    #expect(try await reader.load().decisions.map(\.id) == ["fresh-decision"])
  }

  @Test("Caller-supplied feature digest mismatch is rejected")
  func suppliedDigestMismatchFails() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let valid = fixture.observation(
      for: .workContainment(.sameSong),
      suffix: "digest")
    let mismatched = CalibrationObservationSnapshot(
      id: valid.id,
      kind: valid.kind,
      taskFamily: valid.taskFamily,
      algorithmFamily: valid.algorithmFamily,
      algorithmVersion: valid.algorithmVersion,
      predictionDisposition: valid.predictionDisposition,
      predictedLabel: valid.predictedLabel,
      score: valid.score,
      binding: valid.binding,
      provenanceKeys: valid.provenanceKeys,
      evidenceFamilies: valid.evidenceFamilies,
      features: valid.features,
      observedAt: valid.observedAt,
      featureDigest: String(repeating: "f", count: 64))
    let store = CalibrationReviewStore(storageURL: fixture.storeURL)

    await #expect(throws: CalibrationReviewStoreError.staleObservationIdentifier(valid.id)) {
      try await store.append(
        fixture.draft(id: "digest-decision", label: .sameSong, observation: mismatched),
        registry: CalibrationObservationRegistry(observations: [mismatched]))
    }
  }

  @Test("Nonfinite scores and mismatched reproduction metadata fail")
  func invalidMeasurementsFail() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let base = fixture.observation(
      for: .audioMatch(.sameRecording),
      suffix: "invalid")
    let nonfinite = CalibrationObservationSnapshot(
      id: base.id,
      kind: base.kind,
      taskFamily: base.taskFamily,
      algorithmFamily: base.algorithmFamily,
      algorithmVersion: base.algorithmVersion,
      predictionDisposition: base.predictionDisposition,
      predictedLabel: base.predictedLabel,
      score: .nan,
      binding: base.binding,
      provenanceKeys: base.provenanceKeys,
      evidenceFamilies: base.evidenceFamilies,
      features: base.features,
      observedAt: base.observedAt)
    let store = CalibrationReviewStore(storageURL: fixture.storeURL)
    await #expect(throws: CalibrationReviewStoreError.invalidValue("observation.score")) {
      try await store.append(
        fixture.draft(id: "nonfinite", label: .sameRecording, observation: nonfinite),
        registry: CalibrationObservationRegistry(observations: [nonfinite]))
    }

    var wrongAlgorithm = fixture.draft(
      id: "wrong-algorithm",
      label: .sameRecording,
      observation: base)
    wrongAlgorithm = CalibrationReviewDecisionDraft(
      id: wrongAlgorithm.id,
      label: wrongAlgorithm.label,
      primaryObservationID: wrongAlgorithm.primaryObservationID,
      observationInputs: wrongAlgorithm.observationInputs,
      algorithmFamily: "different-algorithm",
      algorithmVersion: wrongAlgorithm.algorithmVersion,
      reproductionFeatures: wrongAlgorithm.reproductionFeatures,
      decidedAt: wrongAlgorithm.decidedAt)
    await #expect(
      throws: CalibrationReviewStoreError.invalidValue("decision.reproductionMetadata")
    ) {
      try await store.append(
        wrongAlgorithm,
        registry: CalibrationObservationRegistry(observations: [base]))
    }

    let unboundedPerformance = CalibrationObservationSnapshot(
      id: "unbounded-performance",
      kind: base.kind,
      taskFamily: base.taskFamily,
      algorithmFamily: base.algorithmFamily,
      algorithmVersion: base.algorithmVersion,
      predictionDisposition: base.predictionDisposition,
      predictedLabel: base.predictedLabel,
      score: base.score,
      binding: base.binding,
      provenanceKeys: base.provenanceKeys,
      evidenceFamilies: base.evidenceFamilies,
      features: base.features,
      performance: CalibrationObservationPerformance(bytesScanned: .max),
      observedAt: base.observedAt)
    let performanceStore = CalibrationReviewStore(
      storageURL: fixture.root.appending(path: "performance.plist"))
    await #expect(
      throws: CalibrationReviewStoreError.invalidValue("performance.bytesScanned")
    ) {
      try await performanceStore.append(
        fixture.draft(
          id: "unbounded-performance-decision",
          label: .sameRecording,
          observation: unboundedPerformance),
        registry: CalibrationObservationRegistry(observations: [unboundedPerformance]))
    }

    let dateStore = CalibrationReviewStore(
      storageURL: fixture.root.appending(path: "date.plist"))
    await #expect(throws: CalibrationReviewStoreError.invalidValue("decision.decidedAt")) {
      try await dateStore.append(
        CalibrationReviewDecisionDraft(
          id: "unbounded-date",
          label: .sameRecording,
          primaryObservationID: base.id,
          observationInputs: [
            CalibrationObservationInput(
              observationID: base.id,
              expectedFeatureDigest: base.featureDigest)
          ],
          algorithmFamily: base.algorithmFamily,
          algorithmVersion: base.algorithmVersion,
          reproductionFeatures: [
            CalibrationFeature(name: "authority", value: "local-user")
          ],
          decidedAt: Date(timeIntervalSince1970: 253_402_300_800)),
        registry: CalibrationObservationRegistry(observations: [base]))
    }
  }

  @Test("Strict v1 migration preserves unresolved history and requires explicit direction")
  func migratesV1() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let legacyObservation = LegacyObservation(
      id: "legacy-observation",
      kind: .sessionContainmentSuggestion,
      taskFamily: .workContainment,
      algorithmFamily: "legacy-algorithm",
      algorithmVersion: "legacy-v1",
      calibrationID: nil,
      predictionDisposition: .suggested,
      predictedLabel: .sameSong,
      score: 0.8,
      provenanceKeys: [
        "candidate-generation-token", "candidate-revision", "candidate-session",
        "candidate-work", "legacy-observation", "source-revision", "source-session",
        "source-work",
      ],
      evidenceFamilies: ["exact"],
      featureDigest: StableID.forValue("historical-v1-feature-payload"),
      features: [CalibrationFeature(name: "legacy", value: "safe")],
      corpusPartition: "heldout",
      performance: nil,
      observedAt: Date(timeIntervalSince1970: 2))
    let legacyDecision = LegacyDecision(
      id: "legacy-decision",
      label: .sameSong,
      primaryObservationID: legacyObservation.id,
      observations: [legacyObservation],
      algorithmFamily: legacyObservation.algorithmFamily,
      algorithmVersion: legacyObservation.algorithmVersion,
      calibrationID: nil,
      reproductionFeatures: [CalibrationFeature(name: "authority", value: "local-user")],
      decidedAt: Date(timeIntervalSince1970: 3),
      corpusPartition: "heldout",
      notes: nil,
      supersedesDecisionID: nil,
      supersededByDecisionID: nil,
      supersededAt: nil)
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    try encoder.encode(
      LegacyDocument(
        schemaVersion: 1,
        directory: LegacyDirectory(decisions: [legacyDecision]))
    ).write(to: fixture.storeURL)

    let directory = try await CalibrationReviewStore(storageURL: fixture.storeURL).load()
    #expect(directory.decisions.map(\.id) == ["legacy-decision"])
    #expect(directory.decisions[0].corpusPartition == nil)
    #expect(directory.decisions[0].isAuthoritative == false)
    #expect(directory.decisions[0].isEvaluationEligible == false)
    guard
      case .legacyUnresolved(let unresolved) = directory.decisions[0].primaryObservation?.binding
    else {
      Issue.record("Expected unresolved legacy history")
      return
    }
    #expect(unresolved.legacyFeatureDigest == StableID.forValue("historical-v1-feature-payload"))
    #expect(unresolved.provenanceDigests.count == 8)
    let envelope = try PropertyListDecoder().decode(
      SchemaEnvelope.self,
      from: Data(contentsOf: fixture.storeURL))
    #expect(envelope.schemaVersion == 2)

    let unsafeObservation = LegacyObservation(
      id: "unsafe-observation",
      kind: .sessionContainmentSuggestion,
      taskFamily: .workContainment,
      algorithmFamily: "legacy-algorithm",
      algorithmVersion: "legacy-v1",
      calibrationID: nil,
      predictionDisposition: .suggested,
      predictedLabel: .sameSong,
      score: 0.8,
      provenanceKeys: ["/Users/example/private.wav", "descriptive-target"],
      evidenceFamilies: ["exact"],
      featureDigest: String(repeating: "d", count: 24),
      features: [CalibrationFeature(name: "legacy", value: "unsafe")],
      corpusPartition: nil,
      performance: nil,
      observedAt: Date(timeIntervalSince1970: 2))
    let unsafeDecision = LegacyDecision(
      id: "unsafe-decision",
      label: .sameSong,
      primaryObservationID: unsafeObservation.id,
      observations: [unsafeObservation],
      algorithmFamily: unsafeObservation.algorithmFamily,
      algorithmVersion: unsafeObservation.algorithmVersion,
      calibrationID: nil,
      reproductionFeatures: [CalibrationFeature(name: "authority", value: "local-user")],
      decidedAt: Date(timeIntervalSince1970: 3),
      corpusPartition: nil,
      notes: nil,
      supersedesDecisionID: nil,
      supersededByDecisionID: nil,
      supersededAt: nil)
    let unsafeURL = fixture.root.appending(path: "unsafe-v1.plist")
    try encoder.encode(
      LegacyDocument(
        schemaVersion: 1,
        directory: LegacyDirectory(decisions: [unsafeDecision]))
    ).write(to: unsafeURL)
    await #expect(
      throws: CalibrationReviewStoreError.invalidObservationBinding(unsafeObservation.id)
    ) {
      _ = try await CalibrationReviewStore(storageURL: unsafeURL).load()
    }

    let directionalObservation = LegacyObservation(
      id: "legacy-directional-observation",
      kind: .sessionContainmentSuggestion,
      taskFamily: .workContainment,
      algorithmFamily: "legacy-session",
      algorithmVersion: "legacy-v1",
      calibrationID: nil,
      predictionDisposition: .suggested,
      predictedLabel: .sameSong,
      score: 0.8,
      provenanceKeys: ["z-candidate", "a-source"],
      evidenceFamilies: ["exact"],
      featureDigest: String(repeating: "f", count: 24),
      features: [
        CalibrationFeature(name: "directionalSourceIdentifier", value: "source-explicit"),
        CalibrationFeature(
          name: "directionalSourceObservationDigest", value: String(repeating: "1", count: 64)),
        CalibrationFeature(name: "directionalCandidateIdentifier", value: "candidate-explicit"),
        CalibrationFeature(
          name: "directionalCandidateObservationDigest", value: String(repeating: "2", count: 64)),
      ],
      corpusPartition: nil,
      performance: nil,
      observedAt: Date(timeIntervalSince1970: 2))
    let directionalDecision = LegacyDecision(
      id: "legacy-directional-decision",
      label: .sameSong,
      primaryObservationID: directionalObservation.id,
      observations: [directionalObservation],
      algorithmFamily: directionalObservation.algorithmFamily,
      algorithmVersion: directionalObservation.algorithmVersion,
      calibrationID: nil,
      reproductionFeatures: [CalibrationFeature(name: "authority", value: "local-user")],
      decidedAt: Date(timeIntervalSince1970: 3),
      corpusPartition: nil,
      notes: nil,
      supersedesDecisionID: nil,
      supersededByDecisionID: nil,
      supersededAt: nil)
    let directionalURL = fixture.root.appending(path: "directional-v1.plist")
    try encoder.encode(
      LegacyDocument(
        schemaVersion: 1, directory: LegacyDirectory(decisions: [directionalDecision]))
    ).write(to: directionalURL)
    let directional = try await CalibrationReviewStore(storageURL: directionalURL).load()
    guard case .session(let migrated) = directional.decisions[0].primaryObservation?.binding else {
      Issue.record("Expected explicitly directional migration")
      return
    }
    #expect(migrated.source.identifier == "source-explicit")
    #expect(migrated.candidate.identifier == "candidate-explicit")
  }

  @Test("Current ledger integrity and semantic corruption fail closed")
  func currentCorruptionFails() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let observation = fixture.observation(
      for: .workContainment(.sameSong),
      suffix: "corrupt")
    let record = CalibrationReviewDecisionRecord(
      id: "duplicate",
      label: .sameSong,
      primaryObservationID: observation.id,
      observations: [observation],
      algorithmFamily: observation.algorithmFamily,
      algorithmVersion: observation.algorithmVersion,
      calibrationID: nil,
      reproductionFeatures: [CalibrationFeature(name: "authority", value: "local-user")],
      decidedAt: Date(timeIntervalSince1970: 10),
      corpusPartition: nil,
      notes: nil,
      supersedesDecisionID: nil)
    let directory = CalibrationReviewDirectory(decisions: [record, record])
    let document = CurrentDocument(
      schemaVersion: 2,
      payloadDigest: digest(directory),
      directory: directory)
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    try encoder.encode(document).write(to: fixture.storeURL)

    await #expect(throws: CalibrationReviewStoreError.duplicateDecision("duplicate")) {
      _ = try await CalibrationReviewStore(storageURL: fixture.storeURL).load()
    }

    let tampered = CurrentDocument(
      schemaVersion: 2,
      payloadDigest: String(repeating: "0", count: 64),
      directory: CalibrationReviewDirectory())
    try encoder.encode(tampered).write(to: fixture.storeURL)
    await #expect(
      throws: CalibrationReviewStoreError.corruptLedger("payload integrity mismatch")
    ) {
      _ = try await CalibrationReviewStore(storageURL: fixture.storeURL).load()
    }

    let accepted = fixture.observation(
      for: .acceptedRelationship(.artist), suffix: "accepted-corrupt")
    let wrongLabel = CalibrationReviewDecisionRecord(
      id: "wrong-accepted-label",
      label: .acceptedVariantRelationship,
      primaryObservationID: accepted.id,
      observations: [accepted],
      algorithmFamily: accepted.algorithmFamily,
      algorithmVersion: accepted.algorithmVersion,
      calibrationID: nil,
      reproductionFeatures: [CalibrationFeature(name: "authority", value: "local-user")],
      decidedAt: Date(timeIntervalSince1970: 10),
      corpusPartition: nil,
      notes: nil,
      supersedesDecisionID: nil)
    let wrongDirectory = CalibrationReviewDirectory(decisions: [wrongLabel])
    try encoder.encode(
      CurrentDocument(
        schemaVersion: 2,
        payloadDigest: digest(wrongDirectory),
        directory: wrongDirectory)
    ).write(to: fixture.storeURL)
    await #expect(
      throws: CalibrationReviewStoreError.observationFamilyMismatch(accepted.id)
    ) {
      _ = try await CalibrationReviewStore(storageURL: fixture.storeURL).load()
    }

    let partitioned = CalibrationObservationSnapshot(
      id: observation.id,
      kind: observation.kind,
      taskFamily: observation.taskFamily,
      algorithmFamily: observation.algorithmFamily,
      algorithmVersion: observation.algorithmVersion,
      predictionDisposition: observation.predictionDisposition,
      predictedLabel: observation.predictedLabel,
      score: observation.score,
      binding: observation.binding,
      provenanceKeys: observation.provenanceKeys,
      evidenceFamilies: observation.evidenceFamilies,
      features: observation.features,
      corpusPartition: CalibrationCorpusPartition(
        corpusKind: .synthetic,
        split: .training,
        artistGroupDigest: String(repeating: "a", count: 64),
        songGroupDigest: String(repeating: "b", count: 64)),
      observedAt: observation.observedAt)
    let nilPartitionRecord = CalibrationReviewDecisionRecord(
      id: "nil-partition",
      label: .sameSong,
      primaryObservationID: partitioned.id,
      observations: [partitioned],
      algorithmFamily: partitioned.algorithmFamily,
      algorithmVersion: partitioned.algorithmVersion,
      calibrationID: nil,
      reproductionFeatures: [CalibrationFeature(name: "authority", value: "local-user")],
      decidedAt: Date(timeIntervalSince1970: 10),
      corpusPartition: nil,
      notes: nil,
      supersedesDecisionID: nil)
    let nilPartitionDirectory = CalibrationReviewDirectory(decisions: [nilPartitionRecord])
    try encoder.encode(
      CurrentDocument(
        schemaVersion: 2,
        payloadDigest: digest(nilPartitionDirectory),
        directory: nilPartitionDirectory)
    ).write(to: fixture.storeURL)
    await #expect(throws: CalibrationReviewStoreError.corruptLedger("partition mismatch")) {
      _ = try await CalibrationReviewStore(storageURL: fixture.storeURL).load()
    }
  }

  @Test("Privacy, file bounds, and private permissions are enforced")
  func privacyAndBounds() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    try FileManager.default.setAttributes(
      [.posixPermissions: 0o755],
      ofItemAtPath: fixture.root.path)
    let base = fixture.observation(
      for: .workContainment(.sameSong),
      suffix: "privacy")
    let privateObservation = CalibrationObservationSnapshot(
      id: base.id,
      kind: base.kind,
      taskFamily: base.taskFamily,
      algorithmFamily: base.algorithmFamily,
      algorithmVersion: base.algorithmVersion,
      predictionDisposition: base.predictionDisposition,
      predictedLabel: base.predictedLabel,
      score: base.score,
      binding: base.binding,
      provenanceKeys: ["/Users/example/private.wav"],
      evidenceFamilies: base.evidenceFamilies,
      features: base.features,
      observedAt: base.observedAt)
    let store = CalibrationReviewStore(storageURL: fixture.storeURL)
    await #expect(
      throws: CalibrationReviewStoreError.privacyViolation("observation.provenance")
    ) {
      try await store.append(
        fixture.draft(id: "private", label: .sameSong, observation: privateObservation),
        registry: CalibrationObservationRegistry(observations: [privateObservation]))
    }

    let adversaries = [
      "C:\\Music\\take.wav", "D:/Music/take.wav", "\\\\server\\share\\take.wav",
      "//server/share/take.wav", "file:///private/take.wav", "https://host/private/take.wav",
      "~/Music/take.wav", "~artist/Music/take.wav", "$HOME/Music/take.wav",
      "${HOME}/Music/take.wav", "%USERPROFILE%\\Music\\take.wav",
      "metadata path=/Volumes/Fixture Studio/take.wav",
      "path:/Volumes/Fixture Studio/take.wav",
      "path=D:/Music/take.wav",
      "path=\\\\server\\share\\take.wav",
      "url=https://host/private/take.wav",
      "source:\"/private/var/take.wav\"",
      "location='C:\\Music\\take.wav'",
    ]
    for (index, value) in adversaries.enumerated() {
      let adversarial = CalibrationObservationSnapshot(
        id: "adversarial-\(index)",
        kind: base.kind,
        taskFamily: base.taskFamily,
        algorithmFamily: base.algorithmFamily,
        algorithmVersion: base.algorithmVersion,
        predictionDisposition: base.predictionDisposition,
        predictedLabel: base.predictedLabel,
        score: base.score,
        binding: base.binding,
        provenanceKeys: base.provenanceKeys,
        evidenceFamilies: base.evidenceFamilies,
        features: [CalibrationFeature(name: "adversary", value: value)],
        observedAt: base.observedAt)
      await #expect(
        throws: CalibrationReviewStoreError.privacyViolation("observation.features.value")
      ) {
        try await store.append(
          fixture.draft(id: "adversarial-\(index)", label: .sameSong, observation: adversarial),
          registry: CalibrationObservationRegistry(observations: [adversarial]))
      }
    }
    for benign in [
      "sha256:\(String(repeating: "a", count: 64))",
      "session:source", "scope:value/with/slash", "urn:studio:asset", "algorithm:v2",
      "https://host", "url=https://host", "url:https://host",
    ] {
      #expect(!CalibrationPrivacy.containsPath(benign))
    }

    let urlProvenance = CalibrationObservationSnapshot(
      id: "url-provenance",
      kind: base.kind,
      taskFamily: base.taskFamily,
      algorithmFamily: base.algorithmFamily,
      algorithmVersion: base.algorithmVersion,
      predictionDisposition: base.predictionDisposition,
      predictedLabel: base.predictedLabel,
      score: base.score,
      binding: base.binding,
      provenanceKeys: ["https://host/private/take.wav"],
      evidenceFamilies: base.evidenceFamilies,
      features: base.features,
      observedAt: base.observedAt)
    await #expect(
      throws: CalibrationReviewStoreError.privacyViolation("observation.provenance")
    ) {
      try await store.append(
        fixture.draft(id: "url-provenance", label: .sameSong, observation: urlProvenance),
        registry: CalibrationObservationRegistry(observations: [urlProvenance]))
    }

    let privateNotes = CalibrationReviewDecisionDraft(
      id: "private-notes",
      label: .sameSong,
      primaryObservationID: base.id,
      observationInputs: [
        CalibrationObservationInput(
          observationID: base.id,
          expectedFeatureDigest: base.featureDigest)
      ],
      algorithmFamily: base.algorithmFamily,
      algorithmVersion: base.algorithmVersion,
      reproductionFeatures: [CalibrationFeature(name: "authority", value: "local-user")],
      decidedAt: Date(timeIntervalSince1970: 10),
      notes: "found under ${HOME}/Music/take.wav")
    await #expect(throws: CalibrationReviewStoreError.privacyViolation("decision.notes")) {
      try await store.append(
        privateNotes,
        registry: CalibrationObservationRegistry(observations: [base]))
    }

    let privatePartition = CalibrationCorpusPartition(
      corpusKind: .realLabelled,
      split: .heldOut,
      artistGroupDigest: "/Users/private/artist",
      songGroupDigest: String(repeating: "a", count: 64))
    let partitioned = CalibrationObservationSnapshot(
      id: "private-partition",
      kind: base.kind,
      taskFamily: base.taskFamily,
      algorithmFamily: base.algorithmFamily,
      algorithmVersion: base.algorithmVersion,
      predictionDisposition: base.predictionDisposition,
      predictedLabel: base.predictedLabel,
      score: base.score,
      binding: base.binding,
      provenanceKeys: base.provenanceKeys,
      evidenceFamilies: base.evidenceFamilies,
      features: base.features,
      corpusPartition: privatePartition,
      observedAt: base.observedAt)
    await #expect(
      throws: CalibrationReviewStoreError.invalidValue("partition.artistGroupDigest")
    ) {
      try await store.append(
        fixture.draft(id: "private-partition", label: .sameSong, observation: partitioned),
        registry: CalibrationObservationRegistry(observations: [partitioned]))
    }

    _ = try await CalibrationReviewRecordingService(store: store).record(
      CalibrationTypedReviewRequest(
        decisionID: "private-mode",
        action: .workContainment(.sameSong),
        observation: base,
        decidedAt: Date(timeIntervalSince1970: 10)))
    let fileMode = try #require(
      FileManager.default.attributesOfItem(atPath: fixture.storeURL.path)[.posixPermissions]
        as? NSNumber)
    let lockMode = try #require(
      FileManager.default.attributesOfItem(
        atPath: fixture.storeURL.appendingPathExtension("lock").path
      )[.posixPermissions] as? NSNumber)
    #expect(fileMode.intValue & 0o777 == 0o600)
    #expect(lockMode.intValue & 0o777 == 0o600)
    let parentMode = try #require(
      FileManager.default.attributesOfItem(atPath: fixture.root.path)[.posixPermissions]
        as? NSNumber)
    #expect(parentMode.intValue & 0o777 == 0o755)

    try FileManager.default.setAttributes(
      [.posixPermissions: 0o644],
      ofItemAtPath: fixture.storeURL.path)
    _ = try await store.load()
    let repairedMode = try #require(
      FileManager.default.attributesOfItem(atPath: fixture.storeURL.path)[.posixPermissions]
        as? NSNumber)
    #expect(repairedMode.intValue & 0o777 == 0o600)

    let oversized = fixture.root.appending(path: "oversized.plist")
    try Data(count: CalibrationReviewLimits.maximumFileBytes + 1).write(to: oversized)
    await #expect(
      throws: CalibrationReviewStoreError.resourceLimitExceeded("ledger file bytes")
    ) {
      _ = try await CalibrationReviewStore(storageURL: oversized).load()
    }
  }

  @Test("Bounded local reads accept the exact cap and reject aliases and nonregular inputs")
  func boundedLocalReaderFileKindsAndLimits() throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let exact = fixture.root.appending(path: "exact.bin")
    let exactData = Data((0..<64).map(UInt8.init))
    try exactData.write(to: exact)
    #expect(try CalibrationBoundedLocalFileReader.read(exact, maximumBytes: 64) == exactData)

    let oversized = fixture.root.appending(path: "oversized.bin")
    try Data(count: 65).write(to: oversized)
    #expect(throws: CalibrationReviewStoreError.resourceLimitExceeded("local input bytes")) {
      _ = try CalibrationBoundedLocalFileReader.read(oversized, maximumBytes: 64)
    }

    let symlink = fixture.root.appending(path: "symlink.bin")
    try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: exact)
    #expect(throws: CalibrationReviewStoreError.self) {
      _ = try CalibrationBoundedLocalFileReader.read(symlink, maximumBytes: 64)
    }

    let hardLink = fixture.root.appending(path: "hard-link.bin")
    try FileManager.default.linkItem(at: exact, to: hardLink)
    #expect(throws: CalibrationReviewStoreError.unsafeLocalFile("aliased file")) {
      _ = try CalibrationBoundedLocalFileReader.read(hardLink, maximumBytes: 64)
    }

    let fifo = fixture.root.appending(path: "input.fifo")
    #expect(mkfifo(fifo.path, mode_t(S_IRUSR | S_IWUSR)) == 0)
    #expect(throws: CalibrationReviewStoreError.unsafeLocalFile("not a regular file")) {
      _ = try CalibrationBoundedLocalFileReader.read(fifo, maximumBytes: 64)
    }

    let realParent = fixture.root.appending(path: "real-parent", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: realParent, withIntermediateDirectories: false)
    let linkedParent = fixture.root.appending(path: "linked-parent", directoryHint: .isDirectory)
    try FileManager.default.createSymbolicLink(at: linkedParent, withDestinationURL: realParent)
    let linkedInput = linkedParent.appending(path: "input.bin")
    try Data([1]).write(to: realParent.appending(path: "input.bin"))
    #expect(throws: CalibrationReviewStoreError.unsafeLocalFile("symbolic-link component")) {
      _ = try CalibrationBoundedLocalFileReader.read(linkedInput, maximumBytes: 64)
    }
  }

  @Test("Bounded local reads reject replacement growth truncation and same-size mutation")
  func boundedLocalReaderMutationAdversaries() throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }

    func read(
      _ url: URL,
      afterOpen: @escaping () -> Void
    ) throws -> CalibrationBoundedLocalFileRead? {
      try CalibrationBoundedLocalFileReader.readIfExists(
        url,
        maximumBytes: 64,
        resourceName: "test bytes",
        enforcePrivatePermissions: false,
        testingAfterOpen: afterOpen)
    }

    let replaced = fixture.root.appending(path: "replaced.bin")
    let replacement = fixture.root.appending(path: "replacement.bin")
    try Data(repeating: 1, count: 64).write(to: replaced)
    try Data(repeating: 2, count: 64).write(to: replacement)
    #expect(throws: CalibrationReviewStoreError.self) {
      _ = try read(replaced) {
        try? FileManager.default.removeItem(at: replaced)
        try? FileManager.default.moveItem(at: replacement, to: replaced)
      }
    }

    let symlinkSwap = fixture.root.appending(path: "symlink-swap.bin")
    let symlinkTarget = fixture.root.appending(path: "symlink-target.bin")
    try Data(repeating: 3, count: 64).write(to: symlinkSwap)
    try Data(repeating: 4, count: 64).write(to: symlinkTarget)
    #expect(throws: CalibrationReviewStoreError.self) {
      _ = try read(symlinkSwap) {
        try? FileManager.default.removeItem(at: symlinkSwap)
        try? FileManager.default.createSymbolicLink(
          at: symlinkSwap,
          withDestinationURL: symlinkTarget)
      }
    }

    let growing = fixture.root.appending(path: "growing.bin")
    try Data(repeating: 5, count: 32).write(to: growing)
    #expect(throws: CalibrationReviewStoreError.localFileChanged("grew during read")) {
      _ = try read(growing) {
        guard let handle = try? FileHandle(forWritingTo: growing) else { return }
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: Data(repeating: 6, count: 32))
      }
    }

    let truncated = fixture.root.appending(path: "truncated.bin")
    try Data(repeating: 7, count: 64).write(to: truncated)
    #expect(throws: CalibrationReviewStoreError.localFileChanged("truncated during read")) {
      _ = try read(truncated) {
        guard let handle = try? FileHandle(forWritingTo: truncated) else { return }
        defer { try? handle.close() }
        try? handle.truncate(atOffset: 16)
      }
    }

    let sameSize = fixture.root.appending(path: "same-size.bin")
    try Data(repeating: 8, count: 64).write(to: sameSize)
    #expect(throws: CalibrationReviewStoreError.self) {
      _ = try read(sameSize) {
        guard let handle = try? FileHandle(forWritingTo: sameSize) else { return }
        defer { try? handle.close() }
        try? handle.truncate(atOffset: 0)
        try? handle.write(contentsOf: Data(repeating: 9, count: 64))
      }
    }
  }

  @Test("studio-index uses bounded no-follow observation input")
  func studioIndexBoundedObservationInput() throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let executable = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
      .appending(path: ".build/debug/studio-index")
    let observation = fixture.observation(
      for: .workContainment(.sameSong),
      suffix: "bounded-cli")
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    encoder.dateEncodingStrategy = .iso8601
    let encoded = try encoder.encode(observation)
    let maximumBytes = 8 * 1_024 * 1_024

    func run(_ input: URL, decisionID: String) throws -> Int32 {
      let process = Process()
      process.executableURL = executable
      process.arguments = [
        "calibration-review",
        "--store", fixture.storeURL.path,
        "--observation", input.path,
        "--label", CalibrationDecisionLabel.sameSong.rawValue,
        "--decision-id", decisionID,
        "--decided-at", "2026-08-14T10:00:00Z",
      ]
      process.standardOutput = Pipe()
      process.standardError = Pipe()
      try process.run()
      process.waitUntilExit()
      return process.terminationStatus
    }

    let exact = fixture.root.appending(path: "exact-observation.json")
    var exactData = encoded
    exactData.append(Data(repeating: 0x20, count: maximumBytes - encoded.count))
    try exactData.write(to: exact)
    #expect(try run(exact, decisionID: "exact-bound") == 0)

    let oneOver = fixture.root.appending(path: "over-observation.json")
    var oversizedData = exactData
    oversizedData.append(0x20)
    try oversizedData.write(to: oneOver)
    #expect(try run(oneOver, decisionID: "one-over") != 0)

    let symlink = fixture.root.appending(path: "symlink-observation.json")
    try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: exact)
    #expect(try run(symlink, decisionID: "symlink") != 0)

    let fifo = fixture.root.appending(path: "observation.fifo")
    #expect(mkfifo(fifo.path, mode_t(S_IRUSR | S_IWUSR)) == 0)
    #expect(try run(fifo, decisionID: "fifo") != 0)
  }

  @Test("Store snapshot identity is stable and generation advances across instances")
  func storeSnapshotGeneration() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let firstStore = CalibrationReviewStore(storageURL: fixture.storeURL)
    let initial = try await firstStore.snapshot()
    #expect(initial.generation == 1)
    #expect(initial.directory.decisions.isEmpty)

    let secondStore = CalibrationReviewStore(storageURL: fixture.storeURL)
    let observation = fixture.observation(
      for: .workContainment(.sameSong),
      suffix: "snapshot-generation")
    _ = try await secondStore.append(
      fixture.draft(id: "snapshot-generation", label: .sameSong, observation: observation),
      registry: CalibrationObservationRegistry(observations: [observation]))
    let updated = try await firstStore.snapshot()
    #expect(updated.storeIdentity == initial.storeIdentity)
    #expect(updated.generation == 2)
    #expect(updated.contentDigest != initial.contentDigest)
    #expect(updated.directory.decisions.map(\.id) == ["snapshot-generation"])
  }

  @Test("Two child processes coordinate reviews and converge")
  func childProcessCoordination() async throws {
    let fixture = try V2Fixture()
    defer { fixture.remove() }
    let executable = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
      .appending(path: ".build/debug/studio-index")
    #expect(FileManager.default.isExecutableFile(atPath: executable.path))
    let observation = fixture.observation(
      for: .workContainment(.sameSong),
      suffix: "child")
    let observationURL = fixture.root.appending(path: "observation.json")
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    encoder.dateEncodingStrategy = .iso8601
    try encoder.encode(observation).write(to: observationURL)
    let decidedAt = "2026-08-14T10:00:00Z"

    let processes = ["child-a", "child-b"].map { decisionID -> Process in
      let process = Process()
      process.executableURL = executable
      process.arguments = [
        "calibration-review",
        "--store", fixture.storeURL.path,
        "--observation", observationURL.path,
        "--label", CalibrationDecisionLabel.sameSong.rawValue,
        "--decision-id", decisionID,
        "--decided-at", decidedAt,
      ]
      process.standardOutput = Pipe()
      process.standardError = Pipe()
      return process
    }
    for process in processes { try process.run() }
    for process in processes { process.waitUntilExit() }
    #expect(processes.allSatisfy { $0.terminationStatus == 0 })

    let directory = try await CalibrationReviewStore(storageURL: fixture.storeURL).load()
    #expect(directory.decisions.count == 2)
    #expect(directory.decisions.filter(\.isActive).count == 1)
    #expect(Set(directory.decisions.map(\.id)) == ["child-a", "child-b"])
  }

  private func digest(_ directory: CalibrationReviewDirectory) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .millisecondsSince1970
    let data = try! encoder.encode(directory)
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private struct SchemaEnvelope: Codable {
    let schemaVersion: Int
  }

  private struct CurrentDocument: Codable {
    let schemaVersion: Int
    let payloadDigest: String
    let directory: CalibrationReviewDirectory
  }

  private struct LegacyDocument: Codable {
    let schemaVersion: Int
    let directory: LegacyDirectory
  }

  private struct LegacyDirectory: Codable {
    let decisions: [LegacyDecision]
  }

  private struct LegacyDecision: Codable {
    let id: String
    let label: CalibrationDecisionLabel
    let primaryObservationID: String
    let observations: [LegacyObservation]
    let algorithmFamily: String
    let algorithmVersion: String
    let calibrationID: String?
    let reproductionFeatures: [CalibrationFeature]
    let decidedAt: Date
    let corpusPartition: String?
    let notes: String?
    let supersedesDecisionID: String?
    let supersededByDecisionID: String?
    let supersededAt: Date?
  }

  private struct LegacyObservation: Codable {
    let id: String
    let kind: CalibrationObservationKind
    let taskFamily: CalibrationReviewTaskFamily
    let algorithmFamily: String
    let algorithmVersion: String
    let calibrationID: String?
    let predictionDisposition: CalibrationPredictionDisposition
    let predictedLabel: CalibrationDecisionLabel?
    let score: Double?
    let provenanceKeys: [String]
    let evidenceFamilies: [String]
    let featureDigest: String
    let features: [CalibrationFeature]
    let corpusPartition: String?
    let performance: CalibrationObservationPerformance?
    let observedAt: Date?
  }

  private struct V2Fixture {
    let root: URL
    let storeURL: URL

    init() throws {
      root = FileManager.default.temporaryDirectory.appending(
        path: "CalibrationReviewV2Tests-\(UUID().uuidString)",
        directoryHint: .isDirectory)
      storeURL = root.appending(path: "calibration-review.plist")
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    func remove() {
      try? FileManager.default.removeItem(at: root)
    }

    func draft(
      id: String,
      label: CalibrationDecisionLabel,
      observation: CalibrationObservationSnapshot
    ) -> CalibrationReviewDecisionDraft {
      CalibrationReviewDecisionDraft(
        id: id,
        label: label,
        primaryObservationID: observation.id,
        observationInputs: [
          CalibrationObservationInput(
            observationID: observation.id,
            expectedFeatureDigest: observation.featureDigest)
        ],
        algorithmFamily: observation.algorithmFamily,
        algorithmVersion: observation.algorithmVersion,
        calibrationID: observation.calibrationID,
        reproductionFeatures: [
          CalibrationFeature(name: "authority", value: "local-user")
        ],
        decidedAt: Date(timeIntervalSince1970: 10),
        corpusPartition: observation.corpusPartition)
    }

    func observation(
      for action: CalibrationTypedReviewAction,
      suffix: String
    ) -> CalibrationObservationSnapshot {
      let kind: CalibrationObservationKind
      let binding: CalibrationObservationBinding
      let evidence: [CalibrationEvidenceFamily]
      let source = CalibrationImmutableEntityReference(
        identifier: "source-\(suffix)",
        observationDigest: String(repeating: "1", count: 64))
      let target = CalibrationImmutableEntityReference(
        identifier: "target-\(suffix)",
        observationDigest: String(repeating: "2", count: 64))
      switch action {
      case .workContainment:
        kind = .sessionContainmentSuggestion
        binding = .session(
          CalibrationSessionObservationBinding(source: source, candidate: target))
        evidence = [.exact]
      case .sessionRelationship:
        kind = .sessionRelationshipObservation
        binding = .session(
          CalibrationSessionObservationBinding(source: source, candidate: target))
        evidence = [.arrangement]
      case .exportAssociation:
        kind = .exportArtifactAssociation
        binding = .export(
          CalibrationExportObservationBinding(
            artifact: source,
            revisionIdentifier: "revision-\(suffix)"))
        evidence = [.exportDNA, .immutableArtifactObservation]
      case .audioMatch:
        kind = .audioMatchObservation
        binding = .audio(
          CalibrationAudioObservationBinding(
            source: source,
            target: target,
            sourceFingerprintDigest: String(repeating: "3", count: 64),
            targetFingerprintDigest: String(repeating: "4", count: 64),
            fingerprintVersion: "fingerprint-v1",
            materialClass: .mixedCorpus,
            resourceUsage: AudioMatchResourceUsage(
              sourceDurationSeconds: 10,
              targetDurationSeconds: 10,
              sourceFingerprintFrames: 20,
              targetFingerprintFrames: 20,
              candidateCount: 1,
              sourceFileBytes: 1_000,
              targetFileBytes: 1_000,
              workingMemoryUpperBoundBytes: 4_096)))
        evidence = [.nearIdentityFingerprint, .technicalMetadata]
      case .acceptedRelationship(let relationshipKind):
        kind = .acceptedRelationshipObservation
        binding = .acceptedRelationship(
          CalibrationAcceptedRelationshipBinding(
            source: source,
            target: target,
            relationshipKind: relationshipKind))
        evidence = [.userAuthority]
      }
      return CalibrationObservationSnapshot(
        id: "observation-\(suffix)",
        kind: kind,
        taskFamily: kind.taskFamily,
        algorithmFamily: "fixture-algorithm",
        algorithmVersion: "fixture-v1",
        predictionDisposition: .suggested,
        predictedLabel: action.label,
        score: 0.8,
        binding: binding,
        provenanceKeys: ["sha256:\(String(repeating: "a", count: 64))"],
        evidenceFamilies: evidence,
        features: [CalibrationFeature(name: "fixture", value: "deterministic")],
        observedAt: Date(timeIntervalSince1970: 1))
    }
  }
}
