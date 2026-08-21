import Foundation
import Testing

@testable import StudioCore

@Suite("Production Session content organisation")
struct SessionContentOrganisationEngineTests {
  @Test("A revisionless recording is ignored without hiding valid Songs")
  func revisionlessRecordingDoesNotAbortOrganisation() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("Artist/Song/Recorded/vocal.wav", bytes: [1, 2, 3])
    let song = fixture.project("Artist/Song Project", "Song", files: [vocal])
    let recordingRoot = fixture.root.appending(
      path: "Ableton/Live Recordings/2020-01-02 030405 Temp Project",
      directoryHint: .isDirectory)
    let revisionlessRecording = StudioProject(
      id: StableID.forURL(recordingRoot),
      rootURL: recordingRoot,
      displayName: recordingRoot.lastPathComponent,
      timelines: [],
      previewAssets: [])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([song, revisionlessRecording])], calibration: nil)

    #expect(result.catalog.works.contains { $0.displayName == "Song" })
    #expect(result.catalog.works.flatMap(\.sessions).contains { $0.id == revisionlessRecording.id })
    #expect(result.automaticAssignments.allSatisfy { $0.sessionID != revisionlessRecording.id })
    #expect(result.contentReviewCandidates.allSatisfy { $0.sessionID != revisionlessRecording.id })
  }

  @Test("idea005 joins the same Artist Work when distinctive audio and arrangement agree")
  func idea005AutoAttaches() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let shared = try fixture.audio("takes/vocal.wav", bytes: [1, 2, 3, 4])
    let derived = try fixture.audio("bounces/hook.wav", bytes: [5, 6, 7, 8])
    let known = fixture.project("Artist/Song Project", "Song", files: [shared, derived])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [shared, derived])
    let index = fixture.index([known, idea])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [index], calibration: calibration())

    #expect(result.catalog.works.count == 1)
    #expect(result.catalog.works[0].sessions.count == 2)
    #expect(result.automaticAssignments.count == 1)
    #expect(result.automaticAssignments[0].sessionID == idea.id)
    #expect(result.automaticAssignments[0].observationID != nil)
    #expect(result.automaticAssignments[0].rankedCandidateEvidence?.count == 1)
  }

  @Test("Sketch candidate-generation metadata stays separate from exact lineage decisions")
  func sketchMetadataPersistsSeparately() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let shared = try fixture.audio("takes/vocal.wav", bytes: [1, 2, 3, 4])
    let derived = try fixture.audio("bounces/hook.wav", bytes: [5, 6, 7, 8])
    let known = fixture.project("Artist/Song Project", "Song", files: [shared, derived])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [shared, derived])
    let unrelatedAudio = try fixture.audio("elsewhere/pad.wav", bytes: [9, 1, 9, 1])
    let unrelated = fixture.project("Artist/Other Project", "Other", files: [unrelatedAudio])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea, unrelated])], calibration: calibration())

    let assignment = try #require(result.automaticAssignments.first)
    let candidateGeneration = try #require(assignment.candidateGeneration)
    #expect(assignment.algorithmVersion == SessionContentLineageResolver.algorithmVersion)
    #expect(
      candidateGeneration.algorithmVersion
        == SessionContentLineageCandidateGenerator.algorithmVersion)
    #expect(candidateGeneration.candidatePoolCount == 2)
    #expect(
      candidateGeneration.shortlistedCandidateCount
        >= candidateGeneration.exactComparisonCandidateCount)
    #expect(candidateGeneration.exactComparisonCandidateLimit == 24)
    #expect(
      candidateGeneration.exactComparisonCandidateCount <= candidateGeneration.candidatePoolCount)
    #expect(candidateGeneration.exhaustiveFallbackUsed)
    #expect(candidateGeneration.fallbackDisposition == .unprovenSketchCoverage)
    #expect(candidateGeneration.parityDisposition == .boundedExhaustiveFallback)
    #expect(!candidateGeneration.invalidationToken.isEmpty)
  }

  @Test("Common samples cannot dominate content matching")
  func commonSamplesAbstain() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let common = try fixture.audio("Library/common.wav", bytes: [9, 9, 9])
    let source = fixture.project(
      "Artist/idea005 Project", "idea005", files: [common], collectFiles: false)
    let projects =
      [source]
      + (0..<6).map {
        fixture.project(
          "Artist/Song\($0) Project", "Song\($0)", files: [common], collectFiles: false)
      }

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index(projects)], calibration: calibration())

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.isEmpty)
  }

  @Test("Equal runner-up evidence remains review-only")
  func ambiguityRemainsReviewOnly() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("Artist/vocal.wav", bytes: [1, 3, 3, 7])
    let guitar = try fixture.audio("Artist/guitar.wav", bytes: [2, 4, 6, 8])
    let source = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, guitar])
    let left = fixture.project("Artist/Left Project", "Left", files: [vocal, guitar])
    let right = fixture.project("Artist/Right Project", "Right", files: [vocal, guitar])

    let storeURL = fixture.root.appending(path: "organisation.plist")
    let store = StudioOrganisationStore(storageURL: storeURL)
    let result = try await store.organiseByContent(
      indexes: [fixture.index([source, left, right])], calibration: calibration())
    let reloaded = try await StudioOrganisationStore(storageURL: storeURL).load()

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.contains { $0.sessionID == source.id })
    #expect(reloaded.contentReviewCandidates == result.contentReviewCandidates)
    #expect(reloaded.contentReviewCandidates.first?.observation != nil)
    #expect(reloaded.contentReviewCandidates.first?.rankedCandidateEvidence?.count == 2)
  }

  @Test("Conflicting known Artists cannot be attached")
  func artistConflictBlocksMatch() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("shared/vocal.wav", bytes: [4, 3, 2, 1])
    let bounce = try fixture.audio("shared/bounce.wav", bytes: [8, 7, 6, 5])
    let source = fixture.project("ArtistA/idea005 Project", "idea005", files: [vocal, bounce])
    let target = fixture.project("ArtistB/Song Project", "Song", files: [vocal, bounce])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([source, target])], calibration: calibration())

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.isEmpty)
  }

  @Test("Exact copied media is explained as a duplicate location")
  func exactCopiesAreDuplicateLocations() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let firstVocal = try fixture.audio(
      "Artist/Original/Recorded/vocal.wav", bytes: [1, 1, 2, 3, 5])
    let firstBounce = try fixture.audio("Artist/Original/Processed/hook.wav", bytes: [8, 13, 21])
    let copiedVocal = try fixture.audio(
      "Artist/Copy/Recorded/vocal-copy.wav", bytes: [1, 1, 2, 3, 5])
    let copiedBounce = try fixture.audio("Artist/Copy/Processed/hook-copy.wav", bytes: [8, 13, 21])
    let original = fixture.project(
      "Artist/Song Project", "Song", files: [firstVocal, firstBounce], setBytes: [1, 2, 3])
    let copy = fixture.project(
      "Artist/idea005 Project", "idea005", files: [copiedVocal, copiedBounce],
      setBytes: [1, 2, 3])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([original, copy])], calibration: calibration())

    #expect(result.automaticAssignments.first?.relationship == .duplicateLocation)
    #expect(result.manifestBuild.hashedFileCount == 6)
  }

  @Test("Directional observations bind review anchors to non-backup evidence scope")
  func reviewAnchorUsesEvidenceScope() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("Artist/Recorded/vocal.wav", bytes: [1, 4, 1, 4])
    let bounce = try fixture.audio("Artist/Processed/bounce.wav", bytes: [2, 5, 2, 5])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, bounce])
    let idea = fixture.projectWithBackup(
      "Artist/idea005 Project",
      currentSetName: "idea005",
      backupSetName: "idea005 Backup",
      files: [vocal, bounce]
    )

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], calibration: calibration())

    let observation = try #require(result.automaticAssignments.first?.observation)
    #expect(observation.sourceEvidenceRevisionReferences.count == 1)
    #expect(
      observation.sourceEvidenceRevisionReferences.first?.displaySnapshot.revisionName == "idea005")
    #expect(observation.sourceRevisionReference.displaySnapshot.revisionName == "idea005")
    #expect(observation.unavailableEvidenceFamilies == [.excerpt, .pcm])
    #expect(observation.pcmEvidenceCount == nil)
    #expect(observation.excerptEvidenceCount == nil)
  }

  @Test("Rejected candidate survives reload and remains authoritative on later organisation")
  func durableRejection() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("Artist/Recorded/reject-vocal.wav", bytes: [1, 4, 9])
    let bounce = try fixture.audio("Artist/Processed/reject-bounce.wav", bytes: [2, 5, 10])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, bounce])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, bounce])
    let index = fixture.index([known, idea])
    let storeURL = fixture.root.appending(path: "organisation.plist")
    let store = StudioOrganisationStore(storageURL: storeURL)
    let first = try await store.organiseByContent(indexes: [index], calibration: nil)
    let candidate = try #require(
      first.contentReviewCandidates.first(where: { $0.sessionID == idea.id }))
    let rejection = SessionContentMatchRejection(
      sessionID: candidate.sessionID, workID: candidate.candidateWorkID,
      rejectedAt: Date(timeIntervalSince1970: 1))

    _ = try await store.rejectContentMatch(rejection)
    let reloadedStore = StudioOrganisationStore(storageURL: storeURL)
    let reloaded = try await reloadedStore.load()
    let later = try await reloadedStore.organiseByContent(indexes: [index], calibration: nil)

    #expect(reloaded.contentMatchRejections == [rejection])
    #expect(later.contentReviewCandidates.allSatisfy { $0.sessionID != idea.id })
    #expect(later.automaticAssignments.allSatisfy { $0.sessionID != idea.id })
  }

  @Test("Manifest identity cache avoids rehashing unchanged project audio")
  func reusesBoundedContentIdentities() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("Artist/Song/Recorded/vocal.wav", bytes: [1, 2, 3])
    let bounce = try fixture.audio("Artist/Song/Processed/bounce.wav", bytes: [4, 5, 6])
    let index = fixture.index([
      fixture.project("Artist/Song Project", "Song", files: [vocal, bounce])
    ])
    let builder = SessionContentManifestBuilder()

    let first = try builder.build(indexes: [index])
    let second = try builder.build(indexes: [index], cache: first.identityCache)

    #expect(first.hashedFileCount == 2)
    #expect(second.hashedFileCount == 0)
    #expect(second.reusedIdentityCount == 2)
    #expect(second.manifests == first.manifests)
  }

  @Test("A calibration for another algorithm cannot auto-attach")
  func wrongCalibrationStaysReviewOnly() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("Artist/Recorded/vocal.wav", bytes: [2, 3, 5])
    let bounce = try fixture.audio("Artist/Processed/bounce.wav", bytes: [7, 11, 13])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, bounce])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, bounce])
    let wrong = AudioMatchingCalibration(
      id: "wrong", algorithmFamily: "semantic-audio", materialClass: .mixedCorpus,
      validatedExampleCount: 100, validatedAt: Date(timeIntervalSince1970: 0),
      automaticScoreThreshold: 0.1, minimumCoverage: 0.1, minimumRunnerUpMargin: 0)

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], calibration: wrong)

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.contains { $0.sessionID == idea.id })
  }

  @Test("Wrong version and invalid thresholds cannot authorize automatic attachment")
  func invalidCalibrationSemanticsStayReviewOnly() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("Artist/Recorded/vocal.wav", bytes: [8, 3, 1])
    let bounce = try fixture.audio("Artist/Processed/bounce.wav", bytes: [4, 1, 4])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, bounce])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, bounce])
    let wrongVersion = AudioMatchingCalibration(
      id: "stale", algorithmFamily: "session-content-lineage",
      algorithmVersion: "session-content-lineage-v0", materialClass: .mixedCorpus,
      validatedExampleCount: 100, validatedAt: Date(timeIntervalSince1970: 0),
      automaticScoreThreshold: 0.1, minimumCoverage: 0.1, minimumRunnerUpMargin: 0)
    let invalidThreshold = AudioMatchingCalibration(
      id: "invalid", algorithmFamily: "session-content-lineage",
      algorithmVersion: SessionContentLineageResolver.algorithmVersion,
      materialClass: .mixedCorpus, validatedExampleCount: 100,
      validatedAt: Date(timeIntervalSince1970: 0), automaticScoreThreshold: -1,
      minimumCoverage: 2, minimumRunnerUpMargin: .nan)

    let stale = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], calibration: wrongVersion)
    let invalid = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], calibration: invalidThreshold)

    #expect(stale.automaticAssignments.isEmpty)
    #expect(invalid.automaticAssignments.isEmpty)
    #expect(stale.contentReviewCandidates.contains { $0.sessionID == idea.id })
    #expect(invalid.contentReviewCandidates.contains { $0.sessionID == idea.id })
  }

  @Test("Explicit content-aware organisation includes lineage review candidates")
  func contentAwareOrganisationIncludesLineageReview() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [3, 1, 4])
    let drums = try fixture.audio("sources/drums.wav", bytes: [1, 5, 9])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])

    let catalog = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], calibration: nil
    ).catalog

    #expect(
      catalog.reviewQueue.contains { review in
        review.evidence.contains { $0.kind == .contentLineage }
          && review.contentObservation != nil
      })
  }

  @Test("A persisted automatic assignment is re-proven after content changes")
  func persistedAutomaticAssignmentIsRevalidated() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [2, 3, 8])
    let drums = try fixture.audio("sources/drums.wav", bytes: [4, 6, 2])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let index = fixture.index([known, idea])
    let calibrated = try SessionContentOrganisationEngine().organise(
      indexes: [index], calibration: calibration())
    let ideaAudio = try #require(
      idea.sets.first?.content.dependencies.first?.resolvedURL)
    try Data([0, 0, 0, 0, 0]).write(to: ideaAudio)
    let directory = StudioOrganisationDirectory(
      contentAutomaticAssignments: calibrated.automaticAssignments,
      contentIdentityCache: calibrated.manifestBuild.identityCache)

    let rescanned = try SessionContentOrganisationEngine().organise(
      indexes: [index], directory: directory, calibration: calibration())

    #expect(rescanned.currentAutomaticAssignments.isEmpty)
    #expect(rescanned.automaticAssignments.count == calibrated.automaticAssignments.count)
    #expect(rescanned.automaticAssignments.allSatisfy { !$0.isCurrent })
    #expect(rescanned.automaticAssignments.allSatisfy { $0.supersededAt != nil })
    #expect(rescanned.catalog.works.count == 2)
  }

  @Test("Reference fallback identities and their placements remain decision-zero")
  func fallbackReferencesCannotBecomeExactEvidence() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/fallback-vocal.wav", bytes: [1, 2, 3])
    let bounce = try fixture.audio("sources/fallback-bounce.wav", bytes: [4, 5, 6])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, bounce])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, bounce])
    let engine = SessionContentOrganisationEngine(
      manifestBuilder: SessionContentManifestBuilder(fileAccess: RejectingHashAccess()))

    let result = try engine.organise(
      indexes: [fixture.index([known, idea])], calibration: calibration())

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.isEmpty)
    #expect(
      result.manifestBuild.manifests.flatMap(\.anchors)
        .filter { $0.contentIdentity.contains("reference:") }
        .allSatisfy { $0.identityEvidence == .mutableReference })
  }

  @Test("Active revision scope does not union anchors from older non-backup revisions")
  func activeRevisionDoesNotCreateSyntheticLineage() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let oldVocal = try fixture.audio("sources/old-vocal.wav", bytes: [1, 1, 1])
    let oldBounce = try fixture.audio("sources/old-bounce.wav", bytes: [2, 2, 2])
    let newVocal = try fixture.audio("sources/new-vocal.wav", bytes: [3, 3, 3])
    let newBounce = try fixture.audio("sources/new-bounce.wav", bytes: [4, 4, 4])
    let known = fixture.project(
      "Artist/Song Project", "Song", files: [oldVocal, oldBounce])
    let idea = fixture.projectWithPriorRevision(
      "Artist/idea005 Project",
      currentSetName: "idea005 current",
      currentFiles: [newVocal, newBounce],
      priorSetName: "idea005 prior",
      priorFiles: [oldVocal, oldBounce])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], calibration: calibration())
    let manifest = try #require(
      result.manifestBuild.manifests.first { $0.sessionID == idea.id })

    #expect(manifest.evidenceScope == .activeRevision)
    #expect(manifest.setRevisionIDs.count == 1)
    #expect(
      manifest.selectedRevisionID == idea.sets.first { $0.displayName == "idea005 current" }?.id)
    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.isEmpty)
  }

  @Test("Selected and full evidence scopes are explicit and full unions remain review-only")
  func selectedAndFullEvidenceScopesAreExplicit() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let oldVocal = try fixture.audio("sources/select-old-vocal.wav", bytes: [1, 7, 1])
    let oldBounce = try fixture.audio("sources/select-old-bounce.wav", bytes: [2, 8, 2])
    let newVocal = try fixture.audio("sources/select-new-vocal.wav", bytes: [3, 9, 3])
    let project = fixture.projectWithPriorRevision(
      "Artist/idea005 Project",
      currentSetName: "current",
      currentFiles: [newVocal],
      priorSetName: "prior",
      priorFiles: [oldVocal, oldBounce])
    let index = fixture.index([project])
    let priorID = try #require(project.sets.first { $0.displayName == "prior" }?.id)
    let selected = try SessionContentManifestBuilder(
      configuration: .init(evidenceScope: .selectedRevision)
    ).build(
      indexes: [index],
      selectedRevisionIDsBySessionID: [project.id: priorID])
    let full = try SessionContentManifestBuilder(
      configuration: .init(evidenceScope: .fullSession)
    ).build(indexes: [index])

    #expect(selected.manifests.first?.evidenceScope == .selectedRevision)
    #expect(selected.manifests.first?.setRevisionIDs == [priorID])
    #expect(selected.manifests.first?.selectedRevisionID == priorID)
    #expect(selected.manifests.first?.audioDurationPolicy == .completeFile)
    #expect((selected.manifests.first?.measuredAudioDurationSeconds ?? 0) > 0)
    #expect(full.manifests.first?.evidenceScope == .fullSession)
    #expect(full.manifests.first?.setRevisionIDs.count == 2)
    #expect(full.manifests.first?.selectedRevisionID == nil)
    #expect(full.manifests.first?.audioDurationPolicy == .completeFile)
    #expect((full.manifests.first?.measuredAudioDurationSeconds ?? 0) > 0)
  }

  @Test("Coarse MIDI metadata remains review-only and cannot auto-attach")
  func midiMetadataCannotAutoAttach() throws {
    let midi = [
      SessionContentAnchor(
        id: "midi-1", contentIdentity: "midi:generic-1", kind: .midiPhrase,
        arrangementPositionBeats: 0, corpusFrequency: 1,
        sourceMaterialIdentity: "midi:generic-1"),
      SessionContentAnchor(
        id: "midi-2", contentIdentity: "midi:generic-2", kind: .midiPhrase,
        arrangementPositionBeats: 8, corpusFrequency: 1,
        sourceMaterialIdentity: "midi:generic-2"),
    ]
    let source = SessionContentManifest(sessionID: "idea", artistID: "artist", anchors: midi)
    let target = SessionLineageCandidate(
      workID: "song",
      sessionID: "known",
      artistID: "artist",
      manifest: SessionContentManifest(sessionID: "known", artistID: "artist", anchors: midi),
      reviewRevisionReference: testRevisionReference(
        sessionID: "known", workID: "song", revisionID: "rev-known"),
      revisionTimestamp: Date(timeIntervalSince1970: 100))

    let resolution = SessionContentLineageResolver(calibration: calibration()).resolve(
      source: source,
      sourceReference: testRevisionReference(
        sessionID: "idea", workID: "idea-work", revisionID: "rev-idea"),
      sourceRevisionTimestamp: Date(timeIntervalSince1970: 200),
      candidates: [target])

    #expect(resolution.selectedWorkID == nil)
    #expect(resolution.proposedWorkID == "song")
    #expect(resolution.confidence == .suggested)
  }

  @Test("Unreadable audio duration remains unknown and cannot authorize attachment")
  func unknownMeasuredDurationCannotAuthorize() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let source = try fixture.audio("sources/invalid-duration.wav", bytes: [1, 2, 3])
    try Data([1, 2, 3]).write(to: source)
    let project = fixture.project("Artist/idea005 Project", "idea005", files: [source])
    let build = try SessionContentManifestBuilder().build(indexes: [fixture.index([project])])
    let manifest = try #require(build.manifests.first)

    #expect(manifest.audioDurationPolicy == .unknown)
    #expect(manifest.measuredAudioDurationSeconds == nil)
    #expect(manifest.anchors.contains { $0.identityEvidence == .verifiedContent })
  }

  @Test("Legacy keep-separate and explicit overrides remain authoritative")
  func legacyOverridesPreventContentAttachment() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [2, 7, 1])
    let drums = try fixture.audio("sources/drums.wav", bytes: [8, 2, 8])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let overrides = OrganisationOverrides(sessionOverrides: [
      SessionOrganisationOverride(sessionID: idea.id, keepSeparate: true)
    ])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], overrides: overrides,
      calibration: calibration())

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.allSatisfy { $0.sessionID != idea.id })
    #expect(result.catalog.works.count == 2)
  }

  @Test("A keep-separate Work cannot attract another Session")
  func keepSeparatePreventsInboundContentAttachment() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [9, 4, 9])
    let drums = try fixture.audio("sources/drums.wav", bytes: [6, 1, 6])
    let protected = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let overrides = OrganisationOverrides(sessionOverrides: [
      SessionOrganisationOverride(sessionID: protected.id, keepSeparate: true)
    ])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([protected, idea])], overrides: overrides,
      calibration: calibration())

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.isEmpty)
    #expect(result.catalog.works.count == 2)
  }

  @Test("Persisted legacy overrides protect content organisation after reload")
  func persistedOverrideStoreFeedsContentOrganisation() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [3, 5, 3])
    let drums = try fixture.audio("sources/drums.wav", bytes: [8, 0, 8])
    let protected = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let overrideURL = fixture.root.appending(path: "overrides.plist")
    let overrideStore = OrganisationOverrideStore(storageURL: overrideURL)
    _ = try await overrideStore.upsert(
      SessionOrganisationOverride(sessionID: protected.id, keepSeparate: true))
    let reloaded = try await OrganisationOverrideStore(storageURL: overrideURL).load()

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([protected, idea])], overrides: reloaded,
      calibration: calibration())

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.isEmpty)
  }

  @Test("Managed directory assignment remains authoritative over content evidence")
  func managedAssignmentPreventsContentAttachment() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [5, 3, 5])
    let drums = try fixture.audio("sources/drums.wav", bytes: [8, 9, 7])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let artist = StudioArtistRecord(id: "managed-artist", displayName: "Artist")
    let work = StudioWorkRecord(id: "managed-work", artistID: artist.id, displayName: "Other Song")
    let directory = StudioOrganisationDirectory(
      artists: [artist], works: [work],
      sessionAssignments: [StudioSessionAssignment(sessionID: idea.id, workID: work.id)])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], directory: directory,
      calibration: calibration())

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.allSatisfy { $0.sessionID != idea.id })
    #expect(
      result.catalog.works.contains {
        $0.id == work.id && $0.sessions.map(\.id) == [idea.id]
      })
  }

  @Test("One audio file plus its correlated placement cannot auto-attach")
  func oneCorrelatedFileCannotAutoAttach() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [4, 2, 4, 2])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], calibration: calibration())

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.contains { $0.sessionID == idea.id })
    #expect(
      result.contentReviewCandidates.first { $0.sessionID == idea.id }?
        .independentSourceMaterialCount == 1)
  }

  @Test("Rare external mutable material remains decision-zero")
  func rareExternalMaterialCannotAutoAttach() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let rareOne = try fixture.audio("RareVendor/one.wav", bytes: [1, 7, 3])
    let rareTwo = try fixture.audio("RareVendor/two.wav", bytes: [9, 2, 6])
    let known = fixture.project(
      "Artist/Song Project", "Song", files: [rareOne, rareTwo], collectFiles: false)
    let idea = fixture.project(
      "Artist/idea005 Project", "idea005", files: [rareOne, rareTwo], collectFiles: false)

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], calibration: calibration())

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.isEmpty)
  }

  @Test("Weak Sessions cannot target each other or create reciprocal assignments")
  func weakToWeakCyclesArePrevented() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [6, 2, 6])
    let drums = try fixture.audio("sources/drums.wav", bytes: [4, 3, 3])
    let idea3 = fixture.project("Artist/idea003 Project", "idea003", files: [vocal, drums])
    let idea5 = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([idea3, idea5])], calibration: calibration())

    #expect(result.automaticAssignments.isEmpty)
    #expect(result.contentReviewCandidates.isEmpty)
    #expect(result.catalog.works.count == 2)
  }

  @Test("Several weak Sessions may independently join one stable Work")
  func multipleSourcesJoinStableTarget() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [1, 6, 1, 8])
    let drums = try fixture.audio("sources/drums.wav", bytes: [0, 3, 4, 5])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea3 = fixture.project("Artist/idea003 Project", "idea003", files: [vocal, drums])
    let idea5 = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea3, idea5])], calibration: calibration())

    #expect(result.automaticAssignments.count == 2)
    #expect(result.catalog.works.count == 1)
    #expect(result.catalog.works.first?.sessions.count == 3)
  }

  @Test("Shared media with different Set bytes is same Work, not duplicate location")
  func sharedMediaDoesNotProveDuplicateLocation() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [7, 7, 7])
    let drums = try fixture.audio("sources/drums.wav", bytes: [8, 8, 8])
    let known = fixture.project(
      "Artist/Song Project", "Song", files: [vocal, drums], setBytes: [1, 2, 3])
    let idea = fixture.project(
      "Artist/idea005 Project", "idea005", files: [vocal, drums], setBytes: [1, 2, 4])

    let result = try SessionContentOrganisationEngine().organise(
      indexes: [fixture.index([known, idea])], calibration: calibration())

    #expect(result.automaticAssignments.first?.relationship == .sameWork)
  }

  @Test("Replacing a file at the same path invalidates a preserved-metadata cache entry")
  func resourceIdentityInvalidatesCache() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let source = try fixture.audio("sources/original.wav", bytes: [1, 2, 3, 4])
    let project = fixture.project("Artist/Song Project", "Song", files: [source])
    let builder = SessionContentManifestBuilder()
    let first = try builder.build(indexes: [fixture.index([project])])
    let cachedFile = try #require(
      first.identityCache.entries.first { $0.fileURL.pathExtension == "wav" })
    let priorDate = cachedFile.modifiedAt
    let replacement = try fixture.audio("sources/replacement.wav", bytes: [4, 3, 2, 1])
    _ = try FileManager.default.replaceItemAt(cachedFile.fileURL, withItemAt: replacement)
    if let priorDate {
      try FileManager.default.setAttributes(
        [.modificationDate: priorDate], ofItemAtPath: cachedFile.fileURL.path)
    }

    let second = try builder.build(
      indexes: [fixture.index([project])], cache: first.identityCache)

    #expect(second.hashedFileCount == 1)
    #expect(second.reusedIdentityCount == 0)
    #expect(second.manifests != first.manifests)
  }

  @Test("Hash mutation and read failure fall back without caching false identity")
  func changingOrUnreadableHashIsDiscarded() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let source = try fixture.audio("sources/vocal.wav", bytes: [1, 2, 3])
    let project = fixture.project("Artist/Song Project", "Song", files: [source])
    let access = RejectingHashAccess()
    let result = try SessionContentManifestBuilder(fileAccess: access).build(
      indexes: [fixture.index([project])])

    #expect(result.hashedFileCount == 0)
    #expect(result.identityCache.entries.isEmpty)
    #expect(result.skippedHashCount >= 2)
  }

  @Test("Replacing the path during hashing discards the observation")
  func replacementDuringHashIsDiscarded() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let source = try fixture.audio("sources/vocal.wav", bytes: [1, 2, 3])
    let project = fixture.project("Artist/Song Project", "Song", files: [source])
    let result = try SessionContentManifestBuilder(fileAccess: ReplacingDuringHashAccess()).build(
      indexes: [fixture.index([project])])

    #expect(result.hashedFileCount == 0)
    #expect(result.identityCache.entries.isEmpty)
    #expect(result.skippedHashCount >= 2)
  }

  @Test("Per-file and total hash budgets are independently enforced")
  func hashingBudgetsAreEnforced() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let one = try fixture.audio("sources/one.wav", bytes: [1, 2, 3, 4])
    let two = try fixture.audio("sources/two.wav", bytes: [5, 6, 7, 8])
    let project = fixture.project("Artist/Song Project", "Song", files: [one, two])
    let index = fixture.index([project])

    let perFile = try SessionContentManifestBuilder(
      configuration: .init(maximumHashedFileBytes: 3, maximumTotalHashedBytes: 100)
    ).build(indexes: [index])
    let total = try SessionContentManifestBuilder(
      configuration: .init(maximumHashedFileBytes: 100, maximumTotalHashedBytes: 60)
    ).build(indexes: [index])

    #expect(perFile.hashedFileCount == 0)
    #expect(total.hashedFileCount == 1)
  }

  @Test("Pre-Task-3 schema-one directory decodes with empty content fields")
  func legacySchemaOneDecodes() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let storeURL = fixture.root.appending(path: "legacy.plist")
    let legacy: [String: Any] = [
      "schemaVersion": 1,
      "directory": ["artists": [], "works": [], "sessionAssignments": []],
    ]
    let data = try PropertyListSerialization.data(
      fromPropertyList: legacy, format: .binary, options: 0)
    try data.write(to: storeURL)

    let directory = try await StudioOrganisationStore(storageURL: storeURL).load()

    #expect(directory.contentReviewCandidates.isEmpty)
    #expect(directory.contentAutomaticAssignments.isEmpty)
    #expect(directory.pendingCalibrationReviewActions.isEmpty)
    #expect(directory.contentIdentityCache.entries.isEmpty)
    #expect(directory.contentCandidateIndexCache == nil)
  }

  @Test("Legacy entry-only candidate cache is discarded without rejecting the directory")
  func legacyCandidateCacheIsDiscarded() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let storeURL = fixture.root.appending(path: "legacy-candidate-cache.plist")
    let legacy: [String: Any] = [
      "schemaVersion": 1,
      "directory": [
        "artists": [],
        "works": [],
        "sessionAssignments": [],
        "contentCandidateIndexCache": [
          "schemaVersion": 1,
          "algorithmFamily": "session-content-lineage-candidate-generation",
          "algorithmVersion": "session-content-lineage-candidate-generation-v6",
          "entries": [],
        ],
      ],
    ]
    let data = try PropertyListSerialization.data(
      fromPropertyList: legacy, format: .binary, options: 0)
    try data.write(to: storeURL)

    let directory = try await StudioOrganisationStore(storageURL: storeURL).load()

    #expect(directory.contentCandidateIndexCache == nil)
  }

  @Test("Candidate index reuses stable evidence while emitting current review timestamps")
  func candidateIndexPersistsAcrossStoreInstances() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/index-vocal.wav", bytes: [1, 4, 1, 4])
    let guitar = try fixture.audio("sources/index-guitar.wav", bytes: [2, 5, 2, 5])
    let known = fixture.project(
      "Artist/Indexed Song Project", "Indexed Song", files: [vocal, guitar])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, guitar])
    let index = fixture.index([known, idea])
    let storeURL = fixture.root.appending(path: "candidate-index.plist")
    let firstGeneratedAt = Date(timeIntervalSince1970: 2_000)
    let secondGeneratedAt = Date(timeIntervalSince1970: 3_000)

    let first = try await StudioOrganisationStore(storageURL: storeURL).organiseByContent(
      indexes: [index], calibration: calibration(), generatedAt: firstGeneratedAt)
    let firstAssignment = try #require(first.currentAutomaticAssignments.first)
    let firstMetadata = try #require(firstAssignment.candidateGeneration)
    let firstObservation = try #require(firstAssignment.observation)
    let persisted = try await StudioOrganisationStore(storageURL: storeURL).load()
    let persistedCache = try #require(persisted.contentCandidateIndexCache)
    let second = try await StudioOrganisationStore(storageURL: storeURL).organiseByContent(
      indexes: [index], calibration: calibration(), generatedAt: secondGeneratedAt)
    let secondAssignment = try #require(second.currentAutomaticAssignments.first)
    let secondMetadata = try #require(secondAssignment.candidateGeneration)
    let secondObservation = try #require(secondAssignment.observation)

    #expect(firstMetadata.indexCacheDisposition == .rebuilt)
    #expect(
      first.candidateIndexLoadCounters.candidateSketchBuildCount == persistedCache.candidateCount)
    #expect(persistedCache.identityPostingCount > 0)
    #expect(persistedCache.bandPostingCount > 0)
    #expect(secondMetadata.indexCacheDisposition == .reused)
    #expect(second.candidateIndexLoadCounters.candidateSketchBuildCount == 0)
    #expect(
      second.candidateIndexLoadCounters.cacheCandidateValidationCount
        == persistedCache.candidateCount)
    #expect(
      second.candidateIndexLoadCounters.cacheSketchValidationCount == persistedCache.candidateCount)
    #expect(second.candidateIndexLoadCounters.cacheIdentityPostingValidationCount > 0)
    #expect(second.candidateIndexLoadCounters.cacheBandPostingValidationCount > 0)
    #expect(second.candidateIndexLoadCounters.cachePostingReconstructionCount == 0)
    #expect(secondMetadata.workCounters?.queryActiveCountLookupCount == 1)
    #expect(secondMetadata.workCounters?.queryEntryScanCount == 0)
    #expect(firstMetadata.candidatePoolToken == secondMetadata.candidatePoolToken)
    #expect(firstMetadata.invalidationToken == secondMetadata.invalidationToken)
    #expect(firstObservation.sourceRevisionReference.reviewedAt == firstGeneratedAt)
    #expect(firstObservation.candidateRevisionReference.reviewedAt == firstGeneratedAt)
    #expect(secondObservation.sourceRevisionReference.reviewedAt == secondGeneratedAt)
    #expect(secondObservation.candidateRevisionReference.reviewedAt == secondGeneratedAt)
  }

  @Test("Concurrent store instances preserve independent authority decisions")
  func concurrentStoresDoNotLoseUpdates() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let storeURL = fixture.root.appending(path: "concurrent.plist")
    let left = StudioOrganisationStore(storageURL: storeURL)
    let right = StudioOrganisationStore(storageURL: storeURL)
    let artist = try await left.createArtist(displayName: "Artist")
    let work = try await left.createWork(artistID: artist.id, displayName: "Song")
    let rejection = SessionContentMatchRejection(sessionID: "two", workID: work.id)

    async let leftWrite = left.assign(sessionID: "one", to: work.id)
    async let rightWrite = right.rejectContentMatch(rejection)
    _ = try await (leftWrite, rightWrite)
    let directory = try await StudioOrganisationStore(storageURL: storeURL).load()

    #expect(directory.assignmentsBySessionID["one"]?.workID == work.id)
    #expect(directory.contentMatchRejections == [rejection])
  }

  @Test("Review-only refresh supersedes prior automatic authority across store instances")
  func nilCalibrationSupersedesAutomaticAuthority() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [2, 4, 2])
    let drums = try fixture.audio("sources/drums.wav", bytes: [1, 0, 1])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let index = fixture.index([known, idea])
    let store = StudioOrganisationStore(storageURL: fixture.root.appending(path: "autos.plist"))

    let calibrated = try await store.organiseByContent(
      indexes: [index], calibration: calibration())
    let audited = calibrated.automaticAssignments
    let reviewOnly = try await store.organiseByContent(indexes: [index], calibration: nil)
    let directory = try await StudioOrganisationStore(
      storageURL: fixture.root.appending(path: "autos.plist")
    ).load()

    #expect(!audited.isEmpty)
    #expect(reviewOnly.automaticAssignments.count == audited.count)
    #expect(reviewOnly.automaticAssignments.allSatisfy { !$0.isCurrent })
    #expect(reviewOnly.currentAutomaticAssignments.isEmpty)
    #expect(directory.contentAutomaticAssignments.count == audited.count)
    #expect(directory.contentAutomaticAssignments.allSatisfy { !$0.isCurrent })
    #expect(directory.contentAutomaticAssignments.allSatisfy { $0.supersededAt != nil })
    #expect(
      reviewOnly.catalog.works.allSatisfy {
        !$0.sessions.contains(where: { $0.id == idea.id }) || $0.id != audited.first?.workID
      })
  }

  @Test("Changed automatic evidence persists as superseded history across store instances")
  func staleAutomaticEvidenceBecomesHistoricalAcrossInstances() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/history-vocal.wav", bytes: [2, 4, 6])
    let drums = try fixture.audio("sources/history-drums.wav", bytes: [1, 3, 5])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let index = fixture.index([known, idea])
    let storeURL = fixture.root.appending(path: "automatic-history.plist")
    let writer = StudioOrganisationStore(storageURL: storeURL)

    let first = try await writer.organiseByContent(
      indexes: [index],
      calibration: calibration(),
      generatedAt: Date(timeIntervalSince1970: 10))
    let firstAssignment = try #require(first.currentAutomaticAssignments.first)
    for (offset, dependency) in idea.sets.first!.content.dependencies.enumerated() {
      try Data([UInt8(20 + offset)]).write(to: dependency.resolvedURL!)
    }
    _ = try await writer.organiseByContent(
      indexes: [index],
      calibration: calibration(),
      generatedAt: Date(timeIntervalSince1970: 20))
    let reloaded = try await StudioOrganisationStore(storageURL: storeURL).load()
    let historical = try #require(
      reloaded.contentAutomaticAssignments.first {
        $0.observationID == firstAssignment.observationID
      })

    #expect(!historical.isCurrent)
    #expect(historical.supersededAt == Date(timeIntervalSince1970: 20))
    #expect(historical.rankedCandidateEvidence?.isEmpty == false)
    #expect(reloaded.contentAutomaticAssignments.allSatisfy { !$0.isCurrent })
  }

  @Test("A superseded generation cannot persist stale organisation state")
  func supersededGenerationCannotPersist() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let storeURL = fixture.root.appending(path: "generation.plist")
    let store = StudioOrganisationStore(storageURL: storeURL)
    let stale = UUID()
    let current = UUID()
    await store.beginOrganisation(generation: stale)
    await store.beginOrganisation(generation: current)

    await #expect(throws: StudioOrganisationStoreError.supersededOrganisation) {
      _ = try await store.organiseByContent(
        indexes: [], calibration: nil, generation: stale)
    }
    _ = try await store.organiseByContent(indexes: [], calibration: nil, generation: current)

    #expect(FileManager.default.fileExists(atPath: storeURL.path))
  }

  @Test("Manual assignment cancels an in-flight refresh before stale review activation")
  func assignmentInvalidatesInFlightOrganisation() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [1, 2, 7])
    let drums = try fixture.audio("sources/drums.wav", bytes: [3, 8, 4])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let index = fixture.index([known, idea])
    let storeURL = fixture.root.appending(path: "assignment-race.plist")
    let access = CancellationBlockingFileAccess()
    let store = StudioOrganisationStore(
      storageURL: storeURL,
      organisationEngine: SessionContentOrganisationEngine(
        manifestBuilder: SessionContentManifestBuilder(fileAccess: access)))
    let artist = try await store.createArtist(displayName: "Artist")
    let work = try await store.createWork(artistID: artist.id, displayName: "Chosen Song")
    let operation = Task {
      try await store.organiseByContent(indexes: [index], calibration: nil)
    }
    await access.waitUntilStarted()

    _ = try await store.assign(sessionID: idea.id, to: work.id)
    let wasInvalidated = await organisationWasInvalidated(operation)
    let directory = try await store.load()

    #expect(wasInvalidated)
    #expect(directory.assignmentsBySessionID[idea.id]?.workID == work.id)
    #expect(directory.contentReviewCandidates.allSatisfy { $0.sessionID != idea.id })
    #expect(directory.contentAutomaticAssignments.allSatisfy { $0.sessionID != idea.id })
  }

  @Test("Rejection cancels an in-flight refresh before stale candidate reintroduction")
  func rejectionInvalidatesInFlightOrganisation() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [2, 9, 2])
    let drums = try fixture.audio("sources/drums.wav", bytes: [6, 5, 3])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let index = fixture.index([known, idea])
    let storeURL = fixture.root.appending(path: "rejection-race.plist")
    let seedStore = StudioOrganisationStore(storageURL: storeURL)
    let seeded = try await seedStore.organiseByContent(indexes: [index], calibration: nil)
    let candidate = try #require(
      seeded.contentReviewCandidates.first { $0.sessionID == idea.id })
    let rejection = SessionContentMatchRejection(
      sessionID: candidate.sessionID, workID: candidate.candidateWorkID)
    let access = CancellationBlockingFileAccess()
    let store = StudioOrganisationStore(
      storageURL: storeURL,
      organisationEngine: SessionContentOrganisationEngine(
        manifestBuilder: SessionContentManifestBuilder(fileAccess: access)))
    let operation = Task {
      try await store.organiseByContent(indexes: [index], calibration: nil)
    }
    await access.waitUntilStarted()

    _ = try await store.rejectContentMatch(rejection)
    let wasInvalidated = await organisationWasInvalidated(operation)
    let directory = try await store.load()

    #expect(wasInvalidated)
    #expect(directory.contentMatchRejections.contains(rejection))
    #expect(
      directory.contentReviewCandidates.allSatisfy {
        !($0.sessionID == rejection.sessionID && $0.candidateWorkID == rejection.workID)
      })
    #expect(
      directory.contentAutomaticAssignments.allSatisfy {
        !($0.sessionID == rejection.sessionID && $0.workID == rejection.workID)
      })
  }

  @Test("Cross-instance assignment rebuilds the returned catalogue from latest authority")
  func crossInstanceAssignmentRebuildsReturnedCatalogue() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [5, 8, 9])
    let drums = try fixture.audio("sources/drums.wav", bytes: [7, 9, 3])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let index = fixture.index([known, idea])
    let storeURL = fixture.root.appending(path: "cross-instance-assignment.plist")
    let authorityStore = StudioOrganisationStore(storageURL: storeURL)
    let artist = try await authorityStore.createArtist(displayName: "Chosen Artist")
    let work = try await authorityStore.createWork(artistID: artist.id, displayName: "Chosen Song")
    let access = SingleGateFileAccess()
    let refreshStore = StudioOrganisationStore(
      storageURL: storeURL,
      organisationEngine: SessionContentOrganisationEngine(
        manifestBuilder: SessionContentManifestBuilder(fileAccess: access)))
    let operation = Task {
      try await refreshStore.organiseByContent(indexes: [index], calibration: nil)
    }
    await access.waitUntilStarted()

    _ = try await authorityStore.assign(sessionID: idea.id, to: work.id)
    access.release()
    let result = try await operation.value
    let directory = try await refreshStore.load()

    #expect(
      result.catalog.works.first { $0.id == work.id }?.sessions.contains { $0.id == idea.id }
        == true)
    #expect(
      result.catalog.works.allSatisfy {
        $0.id == work.id || !$0.sessions.contains { $0.id == idea.id }
      })
    #expect(directory.assignmentsBySessionID[idea.id]?.workID == work.id)
  }

  @Test("Cross-instance rejection removes stale automatic grouping from returned catalogue")
  func crossInstanceRejectionRebuildsReturnedCatalogue() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let vocal = try fixture.audio("sources/vocal.wav", bytes: [4, 6, 8])
    let drums = try fixture.audio("sources/drums.wav", bytes: [1, 3, 9])
    let known = fixture.project("Artist/Song Project", "Song", files: [vocal, drums])
    let idea = fixture.project("Artist/idea005 Project", "idea005", files: [vocal, drums])
    let index = fixture.index([known, idea])
    let storeURL = fixture.root.appending(path: "cross-instance-rejection.plist")
    let authorityStore = StudioOrganisationStore(storageURL: storeURL)
    let seeded = try await authorityStore.organiseByContent(
      indexes: [index], calibration: calibration())
    let automatic = try #require(seeded.automaticAssignments.first { $0.sessionID == idea.id })
    let rejection = SessionContentMatchRejection(
      sessionID: automatic.sessionID, workID: automatic.workID)
    let access = SingleGateFileAccess()
    let refreshStore = StudioOrganisationStore(
      storageURL: storeURL,
      organisationEngine: SessionContentOrganisationEngine(
        manifestBuilder: SessionContentManifestBuilder(fileAccess: access)))
    let operation = Task {
      try await refreshStore.organiseByContent(indexes: [index], calibration: calibration())
    }
    await access.waitUntilStarted()

    _ = try await authorityStore.rejectContentMatch(rejection)
    access.release()
    let result = try await operation.value
    let directory = try await refreshStore.load()

    #expect(result.automaticAssignments.allSatisfy { $0.sessionID != idea.id })
    #expect(result.catalog.works.count == 2)
    #expect(result.catalog.works.allSatisfy { $0.sessions.count == 1 })
    #expect(directory.contentMatchRejections.contains(rejection))
  }

  @Test("Fresh override reload observes decisions written by another store instance")
  func freshOverrideReloadBypassesStaleCache() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let storeURL = fixture.root.appending(path: "cross-instance-overrides.plist")
    let productionStore = OrganisationOverrideStore(storageURL: storeURL)
    let writer = OrganisationOverrideStore(storageURL: storeURL)
    let sessionID = "session-written-elsewhere"
    let initiallyEmpty = try await productionStore.load()
    _ = try await writer.upsert(
      SessionOrganisationOverride(sessionID: sessionID, keepSeparate: true))

    let stale = try await productionStore.load()
    let fresh = try await productionStore.reload()

    #expect(initiallyEmpty.sessionOverrides.isEmpty)
    #expect(stale.sessionOverrides.isEmpty)
    #expect(fresh.sessionOverrides.first?.sessionID == sessionID)
    #expect(fresh.sessionOverrides.first?.keepSeparate == true)
  }

  @Test("Revision references use the overridden content-aware catalogue across every root")
  func revisionReferenceUsesAllRootOverrideCatalogue() throws {
    let first = try Fixture()
    let second = try Fixture()
    defer {
      first.remove()
      second.remove()
    }
    let oneAudio = try first.audio("sources/one.wav", bytes: [1, 8, 2])
    let twoAudio = try second.audio("sources/two.wav", bytes: [2, 8, 1])
    let one = first.project("Loose/idea003 Project", "idea003", files: [oneAudio])
    let two = second.project("Unsorted/idea005 Project", "idea005", files: [twoAudio])
    let overrides = OrganisationOverrides(sessionOverrides: [
      SessionOrganisationOverride(
        sessionID: two.id, artistName: "Demo Artist", workName: "Example Song",
        groupingKey: "managed:example-song")
    ])
    let result = try SessionContentOrganisationEngine().organise(
      indexes: [first.index([one]), second.index([two])], overrides: overrides,
      calibration: nil)
    let setURL = try #require(two.sets.first?.fileURL)

    let resolved = try StudioRevisionReferenceResolver().capture(
      setURL: setURL, in: result.catalog)

    #expect(result.catalog.sourceRoots.count == 2)
    #expect(resolved.reference.trackedRootURL == second.root.standardizedFileURL)
    #expect(resolved.reference.sessionID == two.id)
    #expect(resolved.reference.displaySnapshot.artistName == "Demo Artist")
    #expect(resolved.reference.displaySnapshot.workName == "Example Song")
  }
}

private func organisationWasInvalidated(
  _ operation: Task<SessionContentOrganisationResult, Error>
) async -> Bool {
  do {
    _ = try await operation.value
    return false
  } catch is CancellationError {
    return true
  } catch StudioOrganisationStoreError.supersededOrganisation {
    return true
  } catch {
    return false
  }
}

private func calibration() -> AudioMatchingCalibration {
  AudioMatchingCalibration(
    id: "production-test", algorithmFamily: "session-content-lineage",
    algorithmVersion: SessionContentLineageResolver.algorithmVersion,
    materialClass: .mixedCorpus, validatedExampleCount: 100,
    validatedAt: Date(timeIntervalSince1970: 0), automaticScoreThreshold: 0.70,
    minimumCoverage: 0.5, minimumRunnerUpMargin: 0.15)
}

private func testRevisionReference(
  sessionID: String,
  workID: String,
  revisionID: String
) -> StudioRevisionReference {
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

private struct RejectingHashAccess: SessionContentFileAccess {
  private let local = LocalSessionContentFileAccess()

  func metadata(at url: URL) throws -> SessionContentFileMetadata {
    try local.metadata(at: url)
  }

  func sha256(at url: URL, maximumBytes: Int64) throws -> SessionContentDigestObservation {
    throw SessionContentFileAccessError.changedWhileReading
  }
}

private final class ReplacingDuringHashAccess: SessionContentFileAccess, @unchecked Sendable {
  private let lock = NSLock()
  private var metadataCallCount = 0

  func metadata(at url: URL) throws -> SessionContentFileMetadata {
    guard url.pathExtension.lowercased() == "wav" else {
      throw CocoaError(.fileReadNoSuchFile)
    }
    lock.lock()
    defer { lock.unlock() }
    metadataCallCount += 1
    return SessionContentFileMetadata(
      bytes: 3, modifiedAtNanoseconds: 1,
      volumeNumber: 1, fileNumber: metadataCallCount == 1 ? 1 : 2)
  }

  func sha256(at url: URL, maximumBytes: Int64) throws -> SessionContentDigestObservation {
    SessionContentDigestObservation(
      sha256: String(repeating: "0", count: 64),
      metadata: SessionContentFileMetadata(
        bytes: 3, modifiedAtNanoseconds: 1, volumeNumber: 1, fileNumber: 1))
  }
}

private final class CancellationBlockingFileAccess: SessionContentFileAccess, @unchecked Sendable {
  private let lock = NSLock()
  private var started = false

  func metadata(at url: URL) throws -> SessionContentFileMetadata {
    lock.withLock { started = true }
    while !Task.isCancelled {
      Thread.sleep(forTimeInterval: 0.001)
    }
    throw CancellationError()
  }

  func sha256(at url: URL, maximumBytes: Int64) throws -> SessionContentDigestObservation {
    throw CancellationError()
  }

  func waitUntilStarted() async {
    while !lock.withLock({ started }) {
      await Task.yield()
    }
  }
}

private final class SingleGateFileAccess: SessionContentFileAccess, @unchecked Sendable {
  private let local = LocalSessionContentFileAccess()
  private let lock = NSLock()
  private let gate = DispatchSemaphore(value: 0)
  private var hasStarted = false
  private var shouldBlock = true

  func metadata(at url: URL) throws -> SessionContentFileMetadata {
    let block = lock.withLock {
      hasStarted = true
      if shouldBlock {
        shouldBlock = false
        return true
      }
      return false
    }
    if block { gate.wait() }
    return try local.metadata(at: url)
  }

  func sha256(at url: URL, maximumBytes: Int64) throws -> SessionContentDigestObservation {
    try local.sha256(at: url, maximumBytes: maximumBytes)
  }

  func waitUntilStarted() async {
    while !lock.withLock({ hasStarted }) {
      await Task.yield()
    }
  }

  func release() { gate.signal() }
}

private final class Fixture {
  private let temporaryRoot: URL
  let root: URL

  init() throws {
    temporaryRoot = FileManager.default.temporaryDirectory
      .appending(
        path: "studio-content-organisation-\(UUID().uuidString)", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: temporaryRoot, withIntermediateDirectories: true)
    root = temporaryRoot.appending(path: "Engineering", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
  }
  func remove() { try? FileManager.default.removeItem(at: temporaryRoot) }

  func audio(_ path: String, bytes: [UInt8]) throws -> URL {
    let url = root.appending(path: path)
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    let sampleBytes = bytes.flatMap { littleEndian(UInt16($0) << 8) }
    var wav = Data("RIFF".utf8)
    wav.append(contentsOf: littleEndian(UInt32(36 + sampleBytes.count)))
    wav.append(Data("WAVEfmt ".utf8))
    wav.append(contentsOf: littleEndian(UInt32(16)))
    wav.append(contentsOf: littleEndian(UInt16(1)))
    wav.append(contentsOf: littleEndian(UInt16(1)))
    wav.append(contentsOf: littleEndian(UInt32(8_000)))
    wav.append(contentsOf: littleEndian(UInt32(16_000)))
    wav.append(contentsOf: littleEndian(UInt16(2)))
    wav.append(contentsOf: littleEndian(UInt16(16)))
    wav.append(Data("data".utf8))
    wav.append(contentsOf: littleEndian(UInt32(sampleBytes.count)))
    wav.append(contentsOf: sampleBytes)
    try wav.write(to: url)
    return url
  }

  private func littleEndian<T: FixedWidthInteger>(_ value: T) -> [UInt8] {
    let little = value.littleEndian
    return withUnsafeBytes(of: little) { Array($0) }
  }

  func project(
    _ path: String, _ setName: String, files: [URL], collectFiles: Bool = true,
    setBytes: [UInt8]? = nil
  ) -> StudioProject {
    let projectRoot = root.appending(path: path, directoryHint: .isDirectory)
    let setURL = projectRoot.appending(path: "\(setName).als")
    try! FileManager.default.createDirectory(at: projectRoot, withIntermediateDirectories: true)
    if let setBytes { try! Data(setBytes).write(to: setURL) }
    let projectFiles = files.enumerated().map { offset, file in
      guard collectFiles else { return file }
      let destination = projectRoot.appending(
        path: "Samples/Recorded/\(offset)-\(file.lastPathComponent)")
      try! FileManager.default.createDirectory(
        at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
      try! Data(contentsOf: file).write(to: destination)
      return destination
    }
    let clips = projectFiles.enumerated().map { offset, file in
      SetClip(
        id: "clip-\(StableID.forURL(projectRoot))-\(offset)", xmlID: nil, kind: .audio,
        placement: .arrangement, name: file.deletingPathExtension().lastPathComponent,
        startBeat: Double(offset * 8), endBeat: Double(offset * 8 + 4),
        loopStartBeat: nil, loopEndBeat: nil, loopEnabled: false, isWarped: false,
        warpMode: nil, warpMarkerCount: 0, midiNoteCount: 0,
        sampleReference: MediaReference(absolutePath: file.path, relativePath: nil))
    }
    let track = SetTrack(
      id: "track-\(StableID.forURL(projectRoot))", xmlID: nil, kind: .audio, name: "Audio",
      colorIndex: nil, groupTrackXMLID: nil, isFolded: nil, mixer: TrackMixerState(),
      devices: [], clips: clips)
    let dependencies = projectFiles.enumerated().map { offset, file in
      MediaDependency(
        id: "dep-\(StableID.forURL(projectRoot))-\(offset)", kind: .clipAudio,
        reference: MediaReference(absolutePath: file.path, relativePath: nil),
        resolvedURL: file, availability: .available, ownerID: clips[offset].id)
    }
    let set = AbletonSet(
      id: StableID.forURL(setURL), fileURL: setURL, displayName: setName,
      isBackup: false, modifiedAt: Date(timeIntervalSince1970: 10), compressedBytes: 1,
      xmlBytes: 1, creator: "Ableton Live 12",
      format: AbletonFormat(
        majorVersion: "5", minorVersion: "12", schemaChangeCount: 1, revision: nil),
      structure: SetStructure(),
      content: AbletonSetContent(tracks: [track], dependencies: dependencies))
    return StudioProject(
      id: StableID.forURL(projectRoot), rootURL: projectRoot,
      displayName: projectRoot.lastPathComponent,
      timelines: [
        SetTimeline(
          id: StableID.forValue("timeline:\(projectRoot.path)"), displayName: setName,
          versions: [set])
      ],
      previewAssets: [])
  }

  func projectWithBackup(
    _ path: String,
    currentSetName: String,
    backupSetName: String,
    files: [URL],
    setBytes: [UInt8]? = nil,
    backupSetBytes: [UInt8]? = nil
  ) -> StudioProject {
    let current = project(path, currentSetName, files: files, setBytes: setBytes)
    let projectRoot = current.rootURL
    let backupSetURL = projectRoot.appending(path: "\(backupSetName).als")
    if let backupSetBytes {
      try! Data(backupSetBytes).write(to: backupSetURL)
    }
    let currentSet = current.timelines.first!.versions.first!
    let backupSet = AbletonSet(
      id: StableID.forURL(backupSetURL),
      fileURL: backupSetURL,
      displayName: backupSetName,
      isBackup: true,
      modifiedAt: Date(timeIntervalSince1970: 5),
      compressedBytes: currentSet.compressedBytes,
      xmlBytes: currentSet.xmlBytes,
      creator: currentSet.creator,
      format: currentSet.format,
      structure: currentSet.structure,
      content: currentSet.content
    )
    return StudioProject(
      id: current.id,
      rootURL: current.rootURL,
      displayName: current.displayName,
      timelines: [
        SetTimeline(
          id: current.timelines.first!.id,
          displayName: currentSetName,
          versions: [currentSet, backupSet]
        )
      ],
      previewAssets: current.previewAssets
    )
  }

  func projectWithPriorRevision(
    _ path: String,
    currentSetName: String,
    currentFiles: [URL],
    priorSetName: String,
    priorFiles: [URL]
  ) -> StudioProject {
    let current = project(path, currentSetName, files: currentFiles)
    let priorProject = project(path, priorSetName, files: priorFiles)
    let currentSet = current.sets.first!
    let priorSource = priorProject.sets.first!
    let priorSet = AbletonSet(
      id: priorSource.id,
      fileURL: priorSource.fileURL,
      displayName: priorSource.displayName,
      isBackup: false,
      modifiedAt: Date(timeIntervalSince1970: 5),
      compressedBytes: priorSource.compressedBytes,
      xmlBytes: priorSource.xmlBytes,
      creator: priorSource.creator,
      format: priorSource.format,
      structure: priorSource.structure,
      content: priorSource.content)
    return StudioProject(
      id: current.id,
      rootURL: current.rootURL,
      displayName: current.displayName,
      timelines: [
        SetTimeline(
          id: current.timelines.first!.id,
          displayName: currentSetName,
          versions: [currentSet, priorSet])
      ],
      previewAssets: current.previewAssets)
  }

  func index(_ projects: [StudioProject]) -> StudioLibraryIndex {
    StudioLibraryIndex(
      rootURL: root, scannedAt: Date(timeIntervalSince1970: 20), projects: projects,
      unassignedAudioAssets: [], issues: [])
  }
}
