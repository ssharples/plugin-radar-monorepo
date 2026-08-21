import Foundation
import Testing

@testable import StudioCore

@Suite("Export Inbox core")
struct ExportInboxCoreTests {
  @Test("Suppresses a partial render until two probes agree")
  func suppressesGrowingFile() async throws {
    let file = URL(fileURLWithPath: "/Studio/Exports/DEMO SET Master.wav")
    let scheduler = ControlledScheduler()
    let provider = FixtureProbeProvider(probes: [
      file: [probe(file, bytes: 128), probe(file, bytes: 256)]
    ])
    let service = ExportDetectionService(
      trackedRoots: [URL(fileURLWithPath: "/Studio")],
      probeProvider: provider,
      scheduler: scheduler,
      timing: ExportDetectionTiming(debounceInterval: 2, stabilityProbeInterval: 3))

    let detection = Task { try await service.detect(batch(events: [event(file)])) }
    await scheduler.waitUntilScheduled(count: 1)
    #expect(provider.probeCount == 0)
    await scheduler.releaseNext()
    await scheduler.waitUntilScheduled(count: 2)
    #expect(provider.probeCount == 1)
    await scheduler.releaseNext()

    let batches = try await detection.value

    #expect(batches.isEmpty)
    #expect(await scheduler.requestedIntervals == [2, 3])
  }

  @Test("Deduplicates repeated file events across a store relaunch")
  func persistsDeduplicationAcrossRelaunch() async throws {
    let root = try temporaryDirectory()
    let storage = root.appending(path: "export-inbox.plist")
    let file = URL(fileURLWithPath: "/Studio/Exports/DEMO SET Master.wav")
    let service = ExportDetectionService(
      trackedRoots: [URL(fileURLWithPath: "/Studio")],
      probeProvider: FixtureProbeProvider(probes: [file: [probe(file), probe(file)]]),
      scheduler: ImmediateScheduler())
    let detected = try #require(try await service.detect(batch(events: [event(file)])).first)

    let firstStore = ExportInboxStore(storageURL: storage)
    #expect(try await firstStore.ingest([detected, detected]).count == 1)
    #expect(try await firstStore.ingest([detected]).count == 0)

    let reopened = ExportInboxStore(storageURL: storage)
    #expect(try await reopened.ingest([detected]).count == 0)
    #expect(try await reopened.all().count == 1)
  }

  @Test("Suggests a manual export association from supplied filename evidence")
  func suggestsManualExportAssociation() async throws {
    let file = URL(fileURLWithPath: "/Studio/Exports/DEMO SET Stems.wav")
    let suggestion = ExportAssociationCandidate(
      workID: "work-demo-set",
      sessionID: "session-mix",
      revisionID: "revision-12",
      displayName: "DEMO SET")
    let service = ExportDetectionService(
      trackedRoots: [URL(fileURLWithPath: "/Studio")],
      probeProvider: FixtureProbeProvider(probes: [file: [probe(file), probe(file)]]),
      associationCandidates: [suggestion],
      scheduler: ImmediateScheduler())

    let detected = try #require(try await service.detect(batch(events: [event(file)])).first)

    #expect(detected.association?.confidence == .suggested)
    #expect(detected.association?.workID == "work-demo-set")
    #expect(detected.association?.evidence.contains { $0.kind == .filenameSemantic } == true)
  }

  @Test("Links a verified automation output directly to its revision")
  func directlyAssociatesVerifiedOutput() async throws {
    let file = URL(fileURLWithPath: "/Studio/Exports/DEMO SET Master.wav")
    let context = try revisionContext()
    let evidence = ExportAutomationOutputEvidence(
      fileURL: file,
      physicalIdentity: "inode-17",
      bytes: 512,
      modifiedAt: Date(timeIntervalSince1970: 100),
      workID: "work-demo-set",
      sessionID: "session-mix",
      revisionID: "revision-12",
      revisionReference: context.reference)
    let service = ExportDetectionService(
      trackedRoots: [URL(fileURLWithPath: "/Studio")],
      probeProvider: FixtureProbeProvider(probes: [file: [probe(file), probe(file)]]),
      verifiedAutomationOutputs: [evidence],
      scheduler: ImmediateScheduler())

    let detected = try #require(try await service.detect(batch(events: [event(file)])).first)

    #expect(detected.association?.confidence == .verified)
    #expect(detected.association?.revisionID == "revision-12")
    #expect(
      detected.association?.evidence.contains { $0.kind == .verifiedAutomationOutput } == true)
  }

  @Test("Keeps nearby manual output separate from a verified automation batch")
  func doesNotContaminateManualOutputWithVerifiedEvidence() async throws {
    let verified = URL(fileURLWithPath: "/Studio/Exports/DEMO SET Master.wav")
    let manual = URL(fileURLWithPath: "/Studio/Exports/CLIENT REF Master.wav")
    let context = try revisionContext()
    let automation = ExportAutomationOutputEvidence(
      fileURL: verified,
      physicalIdentity: "verified-inode",
      bytes: 512,
      modifiedAt: Date(timeIntervalSince1970: 100),
      workID: "work-demo-set",
      sessionID: "session-mix",
      revisionID: "revision-12",
      revisionReference: context.reference)
    let verifiedProbe = probe(verified, physicalIdentity: "verified-inode")
    let manualProbe = probe(manual, physicalIdentity: "manual-inode")
    let service = ExportDetectionService(
      trackedRoots: [URL(fileURLWithPath: "/Studio")],
      probeProvider: FixtureProbeProvider(probes: [
        verified: [verifiedProbe, verifiedProbe],
        manual: [manualProbe, manualProbe],
      ]),
      verifiedAutomationOutputs: [automation],
      scheduler: ImmediateScheduler())

    let batches = try await service.detect(batch(events: [event(verified), event(manual)]))

    #expect(batches.count == 2)
    #expect(
      batches.first(where: { $0.files.contains { $0.fileURL == verified } })?.association?
        .confidence == .verified)
    #expect(
      batches.first(where: { $0.files.contains { $0.fileURL == manual } })?.association?.confidence
        != .verified)
  }

  @Test("Historical automation evidence never wildcard-verifies a replacement at the same path")
  func rejectsWeakOrChangedAutomationIdentity() async throws {
    let file = URL(fileURLWithPath: "/Studio/Exports/DEMO SET Master.wav")
    let context = try revisionContext()
    let current = probe(file, physicalIdentity: "new-inode")
    let historical = ExportAutomationOutputEvidence(
      fileURL: file,
      physicalIdentity: nil,
      bytes: current.bytes,
      modifiedAt: current.modifiedAt,
      workID: "work-demo-set",
      sessionID: "session-mix",
      revisionID: "revision-12",
      revisionReference: context.reference)
    let replacement = ExportAutomationOutputEvidence(
      fileURL: file,
      physicalIdentity: "old-inode",
      bytes: current.bytes,
      modifiedAt: current.modifiedAt,
      workID: "work-demo-set",
      sessionID: "session-mix",
      revisionID: "revision-12",
      revisionReference: context.reference)

    for evidence in [historical, replacement] {
      let service = ExportDetectionService(
        trackedRoots: [URL(fileURLWithPath: "/Studio")],
        probeProvider: FixtureProbeProvider(probes: [file: [current, current]]),
        verifiedAutomationOutputs: [evidence],
        scheduler: ImmediateScheduler())
      let detected = try #require(try await service.detect(batch(events: [event(file)])).first)
      #expect(detected.association?.confidence != .verified)
    }
  }

  @Test("Automation verification requires unchanged identity, bytes, and modification time")
  func requiresCompleteAutomationObservation() async throws {
    let file = URL(fileURLWithPath: "/Studio/Exports/DEMO SET Master.wav")
    let current = probe(file, physicalIdentity: "stable-inode")
    let context = try revisionContext(workID: "work", sessionID: "session", revisionID: "revision")
    let observations = [
      ExportAutomationOutputEvidence(
        fileURL: file, physicalIdentity: "stable-inode", bytes: current.bytes + 1,
        modifiedAt: current.modifiedAt, workID: "work", sessionID: nil, revisionID: "revision"),
      ExportAutomationOutputEvidence(
        fileURL: file, physicalIdentity: "stable-inode", bytes: current.bytes,
        modifiedAt: current.modifiedAt.addingTimeInterval(0.000_001), workID: "work",
        sessionID: nil, revisionID: "revision"),
      ExportAutomationOutputEvidence(
        fileURL: file, physicalIdentity: "stable-inode", bytes: current.bytes,
        modifiedAt: current.modifiedAt, workID: "work", sessionID: nil,
        revisionID: "revision",
        revisionReference: context.reference),
    ]

    for (index, evidence) in observations.enumerated() {
      let service = ExportDetectionService(
        trackedRoots: [URL(fileURLWithPath: "/Studio")],
        probeProvider: FixtureProbeProvider(probes: [file: [current, current]]),
        verifiedAutomationOutputs: [evidence], scheduler: ImmediateScheduler())
      let detected = try #require(try await service.detect(batch(events: [event(file)])).first)
      #expect((detected.association?.confidence == .verified) == (index == 2))
    }
  }

  @Test("Ableton evidence adapter preserves immutable output observation")
  func adaptsAbletonExportEvidence() throws {
    let file = URL(fileURLWithPath: "/Studio/Exports/Master.wav")
    let context = try revisionContext(workID: "work", sessionID: "session", revisionID: "revision")
    let plan = abletonPlan(output: file, revisionReference: context.reference)
    let output = VerifiedAbletonExportFile(
      fileURL: file,
      bytes: 512,
      modifiedAt: Date(timeIntervalSince1970: 100),
      format: "wav",
      durationSeconds: 1,
      sampleRate: 48_000,
      bitDepth: 24,
      channelCount: 2,
      physicalIdentity: "volume:file",
      contentDigest: String(repeating: "a", count: 64))
    let evidence = AbletonExportEvidence(
      plan: plan,
      startedAt: Date(timeIntervalSince1970: 90),
      completedAt: Date(timeIntervalSince1970: 100),
      executor: .macOSAccessibility,
      adapterVersion: "test",
      outputs: [output],
      explanation: "fixture")

    let adapted = try #require(AbletonExportInboxEvidenceAdapter().adapt(evidence).first)

    #expect(adapted.physicalIdentity == "volume:file")
    #expect(adapted.bytes == 512)
    #expect(adapted.modifiedAt == Date(timeIntervalSince1970: 100))
    #expect(adapted.contentDigest == String(repeating: "a", count: 64))
    #expect(adapted.planID == plan.id)
    #expect(adapted.revisionReference == context.reference)
    #expect(adapted.sessionID == "session")
  }

  @Test("Separates matching files created outside the configured creation window")
  func enforcesCreationWindowGrouping() async throws {
    let first = URL(fileURLWithPath: "/Studio/Exports/Kick Stem.wav")
    let second = URL(fileURLWithPath: "/Studio/Exports/Snare Stem.wav")
    let firstProbe = probe(first, createdAt: Date(timeIntervalSince1970: 100))
    let secondProbe = probe(second, createdAt: Date(timeIntervalSince1970: 106))
    let service = ExportDetectionService(
      trackedRoots: [URL(fileURLWithPath: "/Studio")],
      probeProvider: FixtureProbeProvider(probes: [
        first: [firstProbe, firstProbe], second: [secondProbe, secondProbe],
      ]),
      scheduler: ImmediateScheduler(),
      timing: ExportDetectionTiming(creationWindow: 5))

    let batches = try await service.detect(batch(events: [event(first), event(second)]))

    #expect(batches.count == 2)
  }

  @Test("Groups actual timestamps across epoch boundaries without transitive chaining")
  func clustersCreationWindowFromEarliestFile() async throws {
    let first = URL(fileURLWithPath: "/Studio/Exports/Kick Stem.wav")
    let second = URL(fileURLWithPath: "/Studio/Exports/Snare Stem.wav")
    let chained = URL(fileURLWithPath: "/Studio/Exports/Bass Stem.wav")
    let firstProbe = probe(
      first, physicalIdentity: "kick", createdAt: Date(timeIntervalSince1970: 99))
    let secondProbe = probe(
      second, physicalIdentity: "snare", createdAt: Date(timeIntervalSince1970: 103))
    let chainedProbe = probe(
      chained, physicalIdentity: "bass", createdAt: Date(timeIntervalSince1970: 107))
    let service = ExportDetectionService(
      trackedRoots: [URL(fileURLWithPath: "/Studio")],
      probeProvider: FixtureProbeProvider(probes: [
        first: [firstProbe, firstProbe],
        second: [secondProbe, secondProbe],
        chained: [chainedProbe, chainedProbe],
      ]),
      scheduler: ImmediateScheduler(),
      timing: ExportDetectionTiming(creationWindow: 5))

    let batches = try await service.detect(
      batch(events: [event(chained), event(second), event(first)]))

    #expect(batches.count == 2)
    #expect(
      batches.contains { batch in
        Set(batch.files.map(\.fileURL)) == Set([first, second])
      })
    #expect(batches.contains { $0.files.map(\.fileURL) == [chained] })
  }

  @Test("Excludes recordings, freeze, consolidate, crop, reverse and sample library material")
  func excludesNonExports() async throws {
    let root = URL(fileURLWithPath: "/Studio")
    let excluded = [
      "/Studio/Samples/Recorded/take.wav",
      "/Studio/Samples/Processed/Freeze/track.wav",
      "/Studio/Samples/Processed/Consolidate/clip.wav",
      "/Studio/Samples/Processed/Crop/clip.wav",
      "/Studio/Samples/Processed/Reverse/clip.wav",
      "/Studio/Sample Library/Kick.wav",
    ].map(URL.init(fileURLWithPath:))
    let probes = Dictionary(uniqueKeysWithValues: excluded.map { ($0, [probe($0), probe($0)]) })
    let service = ExportDetectionService(
      trackedRoots: [root], probeProvider: FixtureProbeProvider(probes: probes),
      scheduler: ImmediateScheduler())

    #expect(try await service.detect(batch(events: excluded.map(event))).isEmpty)
  }

  @Test("Rejects unsupported and malformed persisted documents")
  func rejectsIncompatiblePersistence() async throws {
    let root = try temporaryDirectory()
    let unsupported = root.appending(path: "unsupported.plist")
    let unsupportedData = try PropertyListSerialization.data(
      fromPropertyList: ["schemaVersion": 999, "batches": []],
      format: .binary,
      options: 0)
    try unsupportedData.write(to: unsupported)
    let unsupportedStore = ExportInboxStore(storageURL: unsupported)
    await #expect(throws: ExportInboxStoreError.unsupportedSchema(999)) {
      _ = try await unsupportedStore.all()
    }

    let malformed = root.appending(path: "malformed.plist")
    try Data("not a plist".utf8).write(to: malformed)
    let malformedStore = ExportInboxStore(storageURL: malformed)
    await #expect(throws: ExportInboxStoreError.malformedDocument) {
      _ = try await malformedStore.all()
    }
  }

  @Test("Transitions review, relink and dismiss decisions durably")
  func persistsReviewTransitions() async throws {
    let root = try temporaryDirectory()
    let storage = root.appending(path: "export-inbox.plist")
    let file = URL(fileURLWithPath: "/Studio/Exports/Mix.wav")
    let batch = ExportBatch.detected(
      files: [ExportBatchFile(probe: probe(file))],
      kind: .master,
      completedAt: Date(timeIntervalSince1970: 100),
      evidence: [.explicitExportFolder(folderName: "Exports")])
    let context = try revisionContext(
      workID: "work", sessionID: "session", revisionID: "revision")
    let authority = revisionAuthority(for: context)
    let store = ExportInboxStore(storageURL: storage, revisionAuthority: authority)
    let id = try #require(try await store.ingest([candidate(batch)]).first?.id)

    #expect((try await store.review(id: id)).status == .reviewed)
    let relinked = try await store.relink(
      id: id,
      to: context.reference)
    #expect(relinked.association?.confidence == .reviewed)
    #expect(relinked.association?.state == .current)
    #expect(relinked.association?.revisionReference == context.reference)
    #expect(relinked.association?.evidence.contains(.userRelink) == true)
    #expect((try await store.dismiss(id: id)).status == .dismissed)

    let reopened = ExportInboxStore(storageURL: storage)
    #expect(try await reopened.batch(id: id)?.status == .dismissed)
  }

  @Test("Relink validates Work Session Revision containment and rejects stale references")
  func validatesRelinkReference() async throws {
    let root = try temporaryDirectory()
    let batch = detectedBatch(file: URL(fileURLWithPath: "/Studio/Exports/Mix.wav"))
    let context = try revisionContext(
      workID: "work", sessionID: "session", revisionID: "revision")
    let authority = revisionAuthority(for: context)
    let store = ExportInboxStore(
      storageURL: root.appending(path: "inbox.plist"), revisionAuthority: authority)
    _ = try await store.ingest([candidate(batch)])
    let unrelated = try revisionContext(
      workID: "other-work", sessionID: "other-session", revisionID: "other-revision")

    await #expect(throws: StudioRevisionReferenceError.revisionNotFound("other-revision")) {
      _ = try await store.relink(
        id: batch.id,
        to: unrelated.reference)
    }
    let relinked = try await store.relink(
      id: batch.id,
      to: context.reference)
    #expect(relinked.association?.workID == "work")
    #expect(relinked.association?.sessionID == "session")
    #expect(relinked.association?.revisionID == "revision")
  }

  @Test("Regrouping marks an association stale without silently changing its Work")
  func marksRegroupedAssociationStale() async throws {
    let root = try temporaryDirectory()
    let batch = detectedBatch(file: URL(fileURLWithPath: "/Studio/Exports/Mix.wav"))
    let context = try revisionContext(
      workID: "work-original", sessionID: "session", revisionID: "revision")
    let authority = revisionAuthority(for: context)
    let store = ExportInboxStore(
      storageURL: root.appending(path: "inbox.plist"), revisionAuthority: authority)
    _ = try await store.ingest([candidate(batch)])
    _ = try await store.relink(
      id: batch.id,
      to: context.reference)

    let regrouped = replacingWorkID(in: context.catalog, with: "work-current")
    authority.activate(generationID: "generation-1", catalog: regrouped)
    let stale = try await store.revalidateAssociation(id: batch.id)

    #expect(stale.association?.state == .stale)
    #expect(stale.association?.staleReason == .workRegrouped)
    #expect(stale.association?.workID == "work-original")
    await #expect(throws: ExportInboxStoreError.associationRequiresRelink) {
      _ = try await store.beginPackaging(id: batch.id)
    }
    let reopened = try #require(
      try await ExportInboxStore(
        storageURL: root.appending(path: "inbox.plist")
      ).batch(id: batch.id))
    #expect(reopened.association?.state == .stale)
    #expect(reopened.association?.workID == "work-original")
  }

  @Test("Ingestion rejects caller supplied lifecycle state and reviewed identity")
  func rejectsDirectIngestionBypass() async throws {
    let root = try temporaryDirectory()
    let batch = detectedBatch(file: URL(fileURLWithPath: "/Studio/Exports/Mix.wav"))
    let context = try revisionContext()
    let forgedAssociation = ExportAssociation(
      revisionReference: context.reference,
      confidence: .reviewed,
      evidence: [.userRelink])
    let staleAssociation = ExportAssociation(
      revisionReference: context.reference,
      confidence: .verified,
      evidence: [.verifiedAutomationOutput(planID: "plan")],
      state: .stale,
      staleReason: .workRegrouped)
    let lifecycleForgeries = [
      ExportBatchStatus.reviewed, .packaging, .ready, .delivering, .delivered, .failed,
      .quarantined,
    ].map { status in
      batch.updating(
        status: status,
        association: forgedAssociation,
        replaceAssociation: true)
    }
    let staleForgery = batch.updating(
      association: forgedAssociation,
      replaceAssociation: true)
    let store = ExportInboxStore(storageURL: root.appending(path: "inbox.plist"))

    for forged in lifecycleForgeries + [
      staleForgery.updating(
        association: staleAssociation,
        replaceAssociation: true,
      )
    ] {
      await #expect(throws: ExportInboxStoreError.invalidDetectionCandidate) {
        _ = try await store.ingest([candidate(forged)])
      }
    }
    #expect(try await store.all().isEmpty)
  }

  @Test("Verified new ingestion requires detector-issued proof bound to exact observations")
  func rejectsForgedVerifiedNewCandidate() async throws {
    let root = try temporaryDirectory()
    let file = URL(fileURLWithPath: "/Studio/Exports/Verified Master.wav")
    let context = try revisionContext()
    let authority = revisionAuthority(for: context)
    let store = ExportInboxStore(
      storageURL: root.appending(path: "inbox.plist"), revisionAuthority: authority)
    let verifiedAssociation = ExportAssociation(
      revisionReference: context.reference,
      confidence: .verified,
      evidence: [.verifiedAutomationOutput(planID: "plan-1")])
    let forged = ExportBatch.detected(
      files: [ExportBatchFile(probe: probe(file))],
      kind: .master,
      completedAt: Date(timeIntervalSince1970: 100),
      evidence: [.explicitExportFolder(folderName: "Exports")],
      association: verifiedAssociation)

    await #expect(throws: ExportInboxStoreError.invalidDetectionCandidate) {
      _ = try await store.ingest([candidate(forged)])
    }

    let automation = ExportAutomationOutputEvidence(
      fileURL: file,
      physicalIdentity: "inode-17",
      bytes: 512,
      modifiedAt: Date(timeIntervalSince1970: 100),
      planID: "plan-1",
      workID: context.reference.workID,
      sessionID: context.reference.sessionID,
      revisionID: context.reference.revisionID,
      revisionReference: context.reference)
    let service = ExportDetectionService(
      trackedRoots: [URL(fileURLWithPath: "/Studio")],
      probeProvider: FixtureProbeProvider(probes: [file: [probe(file), probe(file)]]),
      verifiedAutomationOutputs: [automation],
      scheduler: ImmediateScheduler())
    let detectorIssued = try #require(
      try await service.detect(batch(events: [event(file)])).first)

    let accepted = try await store.ingest([detectorIssued])
    #expect(accepted.first?.association?.confidence == .verified)
  }

  @Test("Detector-issued receipt binds linker and sidecar authority to exact file evidence")
  func issuesExactArtifactAuthorityFromDetectorReceipt() async throws {
    let file = URL(fileURLWithPath: "/Studio/Exports/Receipt Master.wav")
    let context = try revisionContext(revisionID: "revision-receipt")
    let digest = String(repeating: "a", count: 64)
    let exactProbe = probe(file, contentDigest: digest)
    let automation = ExportAutomationOutputEvidence(
      fileURL: file,
      physicalIdentity: exactProbe.physicalIdentity,
      bytes: exactProbe.bytes,
      modifiedAt: exactProbe.modifiedAt,
      contentDigest: digest,
      planID: "plan-receipt",
      workID: context.reference.workID,
      sessionID: context.reference.sessionID,
      revisionID: context.reference.revisionID,
      revisionReference: context.reference)
    let service = ExportDetectionService(
      trackedRoots: [URL(fileURLWithPath: "/Studio")],
      probeProvider: FixtureProbeProvider(probes: [file: [exactProbe, exactProbe]]),
      verifiedAutomationOutputs: [automation],
      scheduler: ImmediateScheduler())
    let detected = try #require(
      try await service.detect(batch(events: [event(file)])).first)
    let revisionAuthority = revisionAuthority(for: context)
    let observation = try ExportArtifactImmutableFileObservation(
      sha256: digest,
      bytes: exactProbe.bytes,
      modifiedAt: exactProbe.modifiedAt,
      resourceIdentity: try #require(exactProbe.physicalIdentity))

    let receipt = try #require(
      detected.artifactAutomationAuthority(
        fileURL: file, observation: observation, revisionAuthority: revisionAuthority))
    #expect(receipt.planID == "plan-receipt")
    #expect(receipt.revisionReference == context.reference)
    #expect(receipt.fileObservation == observation)
    let sidecarAssociation = try #require(
      try detected.verifiedSidecarAssociation(
        fileURL: file, observation: observation, revisionAuthority: revisionAuthority,
        evidence: ["detector receipt"]))
    #expect(sidecarAssociation.confidence == .verifiedAutomation)
    #expect(sidecarAssociation.verifiedEvidence?.authorityReceipt == receipt)

    let wrongDigest = try ExportArtifactImmutableFileObservation(
      sha256: String(repeating: "b", count: 64),
      bytes: observation.bytes,
      modifiedAt: observation.modifiedAt,
      resourceIdentity: observation.resourceIdentity)
    #expect(
      detected.artifactAutomationAuthority(
        fileURL: file, observation: wrongDigest, revisionAuthority: revisionAuthority) == nil)
    revisionAuthority.invalidate()
    #expect(
      detected.artifactAutomationAuthority(
        fileURL: file, observation: observation, revisionAuthority: revisionAuthority) == nil)
  }

  @Test("Packaging fails closed for invalidated or superseded catalogue authority")
  func rejectsNoncurrentRevisionAuthority() async throws {
    let root = try temporaryDirectory()
    let context = try revisionContext()

    let mutations: [(StudioRevisionExecutionAuthority) -> Void] = [
      { (authority: StudioRevisionExecutionAuthority) in authority.invalidate() },
      { (authority: StudioRevisionExecutionAuthority) in
        authority.activate(generationID: "generation-2", catalog: context.catalog)
      },
    ]
    for (index, mutateAuthority) in mutations.enumerated() {
      let batch = detectedBatch(
        file: URL(fileURLWithPath: "/Studio/Exports/Authority-\(index).wav"),
        physicalIdentity: "authority-\(index)")
      let authority = revisionAuthority(for: context)
      let store = ExportInboxStore(
        storageURL: root.appending(path: "authority-\(index).plist"),
        revisionAuthority: authority)
      _ = try await store.ingest([candidate(batch)])
      _ = try await store.relink(id: batch.id, to: context.reference)
      mutateAuthority(authority)

      await #expect(throws: ExportInboxStoreError.associationRequiresRelink) {
        _ = try await store.beginPackaging(id: batch.id)
      }
      let stale = try #require(try await store.batch(id: batch.id))
      #expect(stale.status == .reviewed)
      #expect(stale.association?.state == .stale)
      #expect(stale.association?.staleReason == .catalogueGenerationChanged)
    }
  }

  @Test("Packaging revalidates current catalogue authority after review")
  func rejectsRegroupBeforePackaging() async throws {
    let root = try temporaryDirectory()
    let batch = detectedBatch(file: URL(fileURLWithPath: "/Studio/Exports/Mix.wav"))
    let context = try revisionContext(
      workID: "work-original", sessionID: "session", revisionID: "revision")
    let authority = revisionAuthority(for: context)
    let store = ExportInboxStore(
      storageURL: root.appending(path: "inbox.plist"), revisionAuthority: authority)
    _ = try await store.ingest([candidate(batch)])
    _ = try await store.relink(id: batch.id, to: context.reference)
    let regrouped = replacingWorkID(in: context.catalog, with: "work-current")
    authority.activate(generationID: "generation-1", catalog: regrouped)

    await #expect(throws: ExportInboxStoreError.associationRequiresRelink) {
      _ = try await store.beginPackaging(id: batch.id)
    }
    let stale = try #require(try await store.batch(id: batch.id))
    #expect(stale.status == .reviewed)
    #expect(stale.association?.state == .stale)
    #expect(stale.association?.staleReason == .workRegrouped)
  }

  @Test("Packaging rejects changed Set content and location after review")
  func rejectsSetChangesBeforePackaging() async throws {
    let root = try temporaryDirectory()
    let context = try revisionContext()
    let changes: [(WorkCatalog, ExportAssociationStaleReason)] = [
      (replacingSet(in: context.catalog, compressedBytesDelta: 1), .contentChanged),
      (
        replacingSet(
          in: context.catalog,
          fileURL: URL(fileURLWithPath: "/Studio/session-mix/Moved.als")),
        .setChanged
      ),
    ]

    for (index, change) in changes.enumerated() {
      let batch = detectedBatch(
        file: URL(fileURLWithPath: "/Studio/Exports/Mix-\(index).wav"),
        physicalIdentity: "inode-\(index)")
      let authority = revisionAuthority(for: context)
      let store = ExportInboxStore(
        storageURL: root.appending(path: "inbox-\(index).plist"),
        revisionAuthority: authority)
      _ = try await store.ingest([candidate(batch)])
      _ = try await store.relink(id: batch.id, to: context.reference)
      authority.activate(generationID: "generation-1", catalog: change.0)

      await #expect(throws: ExportInboxStoreError.associationRequiresRelink) {
        _ = try await store.beginPackaging(id: batch.id)
      }
      let stale = try #require(try await store.batch(id: batch.id))
      #expect(stale.association?.staleReason == change.1)
      #expect(stale.status == .reviewed)
    }
  }

  @Test("Package attachment revalidates authority after packaging began")
  func rejectsRegroupBeforePackageAttachment() async throws {
    let root = try temporaryDirectory()
    let batch = try packageBatch(in: root)
    let archive = try makeArchive(in: root, for: batch, name: "Regrouped")
    let context = try revisionContext(
      workID: "work-original", sessionID: "session", revisionID: "revision")
    let authority = revisionAuthority(for: context)
    let store = ExportInboxStore(
      storageURL: root.appending(path: "inbox.plist"), revisionAuthority: authority)
    _ = try await store.ingest([candidate(batch)])
    _ = try await store.relink(id: batch.id, to: context.reference)
    _ = try await store.beginPackaging(id: batch.id)
    let regrouped = replacingWorkID(in: context.catalog, with: "work-current")
    authority.activate(generationID: "generation-1", catalog: regrouped)

    await #expect(throws: ExportInboxStoreError.associationRequiresRelink) {
      _ = try await store.attachVerifiedPackage(
        id: batch.id,
        archiveURL: archive)
    }
    let stale = try #require(try await store.batch(id: batch.id))
    #expect(stale.status == .reviewed)
    #expect(stale.association?.state == .stale)
    #expect(stale.package == nil)

    let currentReference = try StudioRevisionReferenceResolver().capture(
      setURL: context.reference.setURL,
      in: regrouped,
      catalogueGenerationID: "generation-2",
      reviewedAt: Date(timeIntervalSince1970: 300)
    ).reference
    authority.activate(generationID: "generation-2", catalog: regrouped)
    _ = try await store.relink(id: batch.id, to: currentReference)
    _ = try await store.beginPackaging(id: batch.id)
    let recovered = try await store.attachVerifiedPackage(
      id: batch.id,
      archiveURL: archive)
    #expect(recovered.status == .ready)
    #expect(recovered.association?.revisionReference == currentReference)
  }

  @Test("Decoded duplicate observations and impossible delivery histories quarantine safely")
  func quarantinesDuplicateObservationsAndImpossibleHistories() async throws {
    let root = try temporaryDirectory()
    let base = try packageBatch(in: root)
    let file = try #require(base.files.first)
    let duplicate = ExportBatch.detected(
      files: [file, file],
      kind: base.kind,
      completedAt: base.completedAt,
      evidence: base.evidence)
    let duplicateStorage = root.appending(path: "duplicate.plist")
    try encodeDocument([duplicate], to: duplicateStorage)

    let duplicateResult = try #require(
      try await ExportInboxStore(storageURL: duplicateStorage).batch(id: duplicate.id))
    #expect(duplicateResult.status == .quarantined)
    #expect(duplicateResult.quarantineReason == .invalidLifecycle)

    let context = try revisionContext()
    let association = ExportAssociation(
      revisionReference: context.reference,
      confidence: .reviewed,
      evidence: [.userRelink])
    let package = DeliveryPackage(
      archiveURL: root.appending(path: "ForgedHistory.zip"),
      files: base.files,
      bytes: 1,
      sha256: String(repeating: "a", count: 64),
      manifest: "{}",
      createdAt: Date(timeIntervalSince1970: 200))
    let pending = DeliveryAttempt(
      id: "duplicate-event",
      attemptID: "attempt-1",
      packageID: package.id,
      method: .nativeShare,
      recipient: nil,
      startedAt: Date(timeIntervalSince1970: 210),
      result: .pending)
    let forgedTerminal = DeliveryAttempt(
      id: "duplicate-event",
      attemptID: "attempt-1",
      packageID: package.id,
      method: .nativeMail,
      recipient: nil,
      startedAt: pending.startedAt,
      completedAt: Date(timeIntervalSince1970: 220),
      result: .delivered)
    let impossible = base.updating(
      status: .delivered,
      association: association,
      replaceAssociation: true,
      package: package,
      replacePackage: true,
      deliveryAttempts: [pending, forgedTerminal])
    let historyStorage = root.appending(path: "history.plist")
    try encodeDocument([impossible], to: historyStorage)

    let historyResult = try #require(
      try await ExportInboxStore(storageURL: historyStorage).batch(id: impossible.id))
    #expect(historyResult.status == .quarantined)
    #expect(historyResult.quarantineReason == .invalidLifecycle)
    let reopened = try #require(
      try await ExportInboxStore(storageURL: historyStorage).batch(id: impossible.id))
    #expect(reopened == historyResult)
  }

  @Test("Decoded forged ready state is durably quarantined")
  func quarantinesDecodedForgedReadyBatch() async throws {
    let root = try temporaryDirectory()
    let storage = root.appending(path: "inbox.plist")
    let batch = try packageBatch(in: root)
    let context = try revisionContext()
    let association = ExportAssociation(
      revisionReference: context.reference,
      confidence: .reviewed,
      evidence: [.userRelink])
    let nonexistentArchive = root.appending(path: "Forged.zip")
    let package = DeliveryPackage(
      archiveURL: nonexistentArchive,
      files: batch.files,
      bytes: 1_024,
      sha256: String(repeating: "a", count: 64),
      verifiedAt: Date(timeIntervalSince1970: 200),
      manifest: "{}",
      createdAt: Date(timeIntervalSince1970: 200))
    let forged = batch.updating(
      status: .ready,
      association: association,
      replaceAssociation: true,
      package: package,
      replacePackage: true)
    let document = FixtureExportInboxDocument(schemaVersion: 1, batches: [forged])
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    try encoder.encode(document).write(to: storage)

    let store = ExportInboxStore(storageURL: storage)
    let quarantined = try #require(try await store.batch(id: batch.id))
    #expect(quarantined.status == .quarantined)
    #expect(quarantined.quarantineReason == .packageEvidenceUnavailable)
    await #expect(
      throws: ExportInboxStoreError.invalidStatusTransition(
        from: .quarantined, to: .delivering)
    ) {
      _ = try await store.beginDelivery(
        id: batch.id,
        packageID: package.id,
        method: .nativeShare,
        recipient: nil)
    }
    let reopened = try #require(try await ExportInboxStore(storageURL: storage).batch(id: batch.id))
    #expect(reopened.status == .quarantined)
  }

  @Test("Persists verified package and append-only delivery transitions")
  func persistsDeliveryStateMachine() async throws {
    let root = try temporaryDirectory()
    let storage = root.appending(path: "export-inbox.plist")
    let batch = try packageBatch(in: root)
    let archive = try makeArchive(in: root, for: batch)
    let context = try revisionContext()
    let authority = revisionAuthority(for: context)
    let store = ExportInboxStore(storageURL: storage, revisionAuthority: authority)
    _ = try await store.ingest([candidate(batch)])
    _ = try await store.review(id: batch.id)
    _ = try await store.relink(id: batch.id, to: context.reference)
    _ = try await store.beginPackaging(id: batch.id)
    let ready = try await store.attachVerifiedPackage(
      id: batch.id,
      archiveURL: archive,
      verifiedAt: Date(timeIntervalSince1970: 200))
    #expect(ready.status == .ready)
    let package = try #require(ready.package)

    let delivering = try await store.beginDelivery(
      id: batch.id,
      packageID: package.id,
      method: .nativeShare,
      recipient: nil,
      startedAt: Date(timeIntervalSince1970: 210),
      attemptID: "attempt-1")
    #expect(delivering.deliveryAttempts.map(\.result) == [.pending])
    let handedOff = try await store.recordDeliveryTransition(
      id: batch.id,
      attemptID: "attempt-1",
      result: .handedToUser,
      completedAt: Date(timeIntervalSince1970: 220))
    #expect(handedOff.deliveryAttempts.map(\.result) == [.pending, .handedToUser])
    let delivered = try await store.recordDeliveryTransition(
      id: batch.id,
      attemptID: "attempt-1",
      result: .delivered,
      completedAt: Date(timeIntervalSince1970: 230))
    #expect(delivered.status == .delivered)
    #expect(delivered.deliveryAttempts.map(\.result) == [.pending, .handedToUser, .delivered])

    let reopened = try #require(try await ExportInboxStore(storageURL: storage).batch(id: batch.id))
    #expect(reopened.package == package)
    #expect(reopened.deliveryAttempts == delivered.deliveryAttempts)
  }

  @Test("Delivery re-verifies and quarantines an archive changed after ready")
  func rejectsArchiveMutationBeforeDelivery() async throws {
    let root = try temporaryDirectory()
    let batch = try packageBatch(in: root)
    let archive = try makeArchive(in: root, for: batch, name: "Mutable")
    let context = try revisionContext()
    let authority = revisionAuthority(for: context)
    let store = ExportInboxStore(
      storageURL: root.appending(path: "inbox.plist"), revisionAuthority: authority)
    _ = try await store.ingest([candidate(batch)])
    _ = try await store.relink(id: batch.id, to: context.reference)
    _ = try await store.beginPackaging(id: batch.id)
    let ready = try await store.attachVerifiedPackage(
      id: batch.id,
      archiveURL: archive)
    let package = try #require(ready.package)
    let handle = try FileHandle(forWritingTo: archive)
    try handle.seekToEnd()
    try handle.write(contentsOf: Data([0]))
    try handle.close()

    var rejected = false
    do {
      _ = try await store.beginDelivery(
        id: batch.id,
        packageID: package.id,
        method: .nativeShare,
        recipient: nil)
    } catch {
      rejected = true
    }
    #expect(rejected)
    let quarantined = try #require(try await store.batch(id: batch.id))
    #expect(quarantined.status == .quarantined)
    #expect(quarantined.quarantineReason == .packageEvidenceMismatch)
    #expect(quarantined.deliveryAttempts.isEmpty)
  }

  @Test("Rejects stale or mismatched package and delivery mutations")
  func rejectsInvalidDeliveryState() async throws {
    let root = try temporaryDirectory()
    let batch = try packageBatch(in: root)
    let context = try revisionContext()
    let authority = revisionAuthority(for: context)
    let store = ExportInboxStore(
      storageURL: root.appending(path: "inbox.plist"), revisionAuthority: authority)
    _ = try await store.ingest([candidate(batch)])
    _ = try await store.review(id: batch.id)
    _ = try await store.relink(id: batch.id, to: context.reference)
    _ = try await store.beginPackaging(id: batch.id)
    let missing = root.appending(path: "Missing.zip")
    await #expect(throws: DeliveryPackageVerificationError.missingArchive(missing)) {
      _ = try await store.attachVerifiedPackage(
        id: batch.id, archiveURL: missing)
    }
    let validArchive = try makeArchive(in: root, for: batch, name: "Valid")
    let ready = try await store.attachVerifiedPackage(
      id: batch.id, archiveURL: validArchive)
    let validPackage = try #require(ready.package)
    await #expect(throws: ExportInboxStoreError.packageMismatch) {
      _ = try await store.beginDelivery(
        id: batch.id, packageID: "stale-package", method: .nativeMail, recipient: nil)
    }
    #expect(validPackage.verifiedAt != nil)
  }

  @Test("Verifier rejects tampered archive content and manifest checksums")
  func rejectsTamperedDeliveryPackages() throws {
    let root = try temporaryDirectory()
    let batch = try packageBatch(in: root)
    let verifier = LocalDeliveryPackageVerifier()
    let tamperedArchive = try makeArchive(
      in: root,
      for: batch,
      name: "TamperedArchive",
      archiveByte: 0x7f,
      manifestByte: 0x2a)
    let tamperedManifest = try makeArchive(
      in: root,
      for: batch,
      name: "TamperedManifest",
      manifestDigest: String(repeating: "f", count: 64))

    #expect(
      throws: DeliveryPackageVerificationError.archiveEntryMismatch("Mix.wav")
    ) {
      _ = try verifier.verify(archiveURL: tamperedArchive, for: batch)
    }
    #expect(
      throws: DeliveryPackageVerificationError.archiveEntryMismatch("Mix.wav")
    ) {
      _ = try verifier.verify(archiveURL: tamperedManifest, for: batch)
    }
  }

  @Test("Verifier rejects an archive manifest for another batch")
  func rejectsWrongBatchPackage() throws {
    let root = try temporaryDirectory()
    let batch = try packageBatch(in: root)
    let other = try packageBatch(in: root, name: "Other")
    let archive = try makeArchive(
      in: root,
      for: batch,
      name: "WrongBatch",
      manifestBatchID: other.id)

    #expect(
      throws: DeliveryPackageVerificationError.wrongBatch(
        expected: batch.id, actual: other.id)
    ) {
      _ = try LocalDeliveryPackageVerifier().verify(archiveURL: archive, for: batch)
    }
  }

  @Test("Verifier detects an archive changed after verification")
  func detectsPackageMutationAfterVerification() throws {
    let root = try temporaryDirectory()
    let batch = try packageBatch(in: root)
    let archive = try makeArchive(in: root, for: batch, name: "Changed")
    let verifier = LocalDeliveryPackageVerifier()
    let verified = try verifier.verify(archiveURL: archive, for: batch)

    let handle = try FileHandle(forWritingTo: archive)
    try handle.seekToEnd()
    try handle.write(contentsOf: Data([0]))
    try handle.close()

    #expect(throws: DeliveryPackageVerificationError.archiveChanged) {
      try verifier.revalidate(verified)
    }
  }

  @Test("Verifier fails closed when an observed source export changed before packaging")
  func rejectsChangedSourceObservation() throws {
    let root = try temporaryDirectory()
    let batch = try packageBatch(in: root)
    let archive = try makeArchive(in: root, for: batch, name: "SourceChanged")
    let source = try #require(batch.files.first?.fileURL)
    try Data(repeating: 0x2a, count: 513).write(to: source)

    #expect(
      throws: DeliveryPackageVerificationError.sourceObservationMismatch(source.path)
    ) {
      _ = try LocalDeliveryPackageVerifier().verify(archiveURL: archive, for: batch)
    }
  }

  @Test("Coordinates mutations and fresh reads across store instances")
  func coordinatesMultipleStoreInstances() async throws {
    let root = try temporaryDirectory()
    let storage = root.appending(path: "inbox.plist")
    let first = detectedBatch(file: URL(fileURLWithPath: "/Studio/Exports/First Master.wav"))
    let second = detectedBatch(
      file: URL(fileURLWithPath: "/Studio/Exports/Second Master.wav"),
      physicalIdentity: "inode-18")
    let firstStore = ExportInboxStore(storageURL: storage)
    let secondStore = ExportInboxStore(storageURL: storage)

    async let firstIngest = firstStore.ingest([candidate(first)])
    async let secondIngest = secondStore.ingest([candidate(second)])
    _ = try await (firstIngest, secondIngest)
    _ = try await firstStore.review(id: first.id)

    let fresh = try await secondStore.all()
    #expect(fresh.count == 2)
    #expect(fresh.first(where: { $0.id == first.id })?.status == .reviewed)
  }

  @Test("Allocates a collision-safe package filename without creating an archive")
  func allocatesCollisionSafePackageName() {
    let allocator = DeliveryPackageNameAllocator()

    let result = allocator.nextAvailableName(
      preferred: "DEMO_ARTIST_DEMO_SET_STEMS_2020-08-13.zip",
      occupied: ["DEMO_ARTIST_DEMO_SET_STEMS_2020-08-13.zip"])

    #expect(result == "DEMO_ARTIST_DEMO_SET_STEMS_2020-08-13-2.zip")
  }

  @Test("Export evidence sidecar is deterministic and redacts paths and personal data")
  func exportEvidenceSidecarRedactsSensitiveData() throws {
    let createdAt = Date(timeIntervalSince1970: 1_600_800_000)
    let renderer = StudioExportEvidenceSidecarRenderer()
    let sidecar = StudioExportEvidenceSidecar(
      applicationVersion: "1.0-test",
      algorithmVersions: ["audio-artifact-linker-v1", "export-dna-parser-v1"],
      association: StudioExportEvidenceSidecarAssociation(
        confidence: "reviewed",
        reviewedRevisionID: "revision-12",
        reviewedWorkID: "work-demo-set",
        reviewedSessionID: "session-mix",
        evidence: [
          "Reviewed against /Users/fixture/Music/Private/Exports",
          "Coordinator: person@example.com",
        ]),
      observation: StudioExportEvidenceSidecarObservation(
        batchID: "batch-1",
        observedAt: createdAt,
        immutableObservationKeys: ["obs-1"],
        relativePaths: ["Exports/Master.wav", "/Users/fixture/Music/Private/Master.wav"],
        exportDNA: ExportDNAAssociationEvidence(
          containerKind: .riffWave,
          fileSampleRate: 48_000,
          dataChunkBytes: 512,
          originationTimestamp: createdAt,
          sampleTimeReference: ExportSampleTimeReferenceEvidence(
            samplesSinceOrigin: 180_000,
            sampleRate: 48_000),
          ixmlProject: "DEMO SET",
          ixmlNote: "Send to person@example.com from /Users/fixture/Music/Private",
          ixmlTrackLabels: ["Lead Vocal", "/Users/fixture/Music/Private/Lead Vocal.wav"],
          ixmlTrackCount: 1,
          contradictions: [],
          includesUntrustedDescriptiveMetadata: false),
        notes: ["file:///Users/fixture/Music/Private/Master.wav"]),
      files: [
        StudioExportEvidenceSidecarFile(
          relativePath: "Exports/Master.wav",
          bytes: 512,
          sha256: String(repeating: "a", count: 64)),
        StudioExportEvidenceSidecarFile(
          relativePath: "/Users/fixture/Music/Private/Master.wav",
          bytes: 512,
          sha256: String(repeating: "b", count: 64)),
      ])

    let first = try renderer.render(sidecar)
    let second = try renderer.render(sidecar)

    #expect(first == second)
    #expect(first.contains("Exports/Master.wav"))
    #expect(first.contains("<redacted path>"))
    #expect(first.contains("<redacted email>"))
    #expect(first.contains("/Users/fixture/Music/Private") == false)
    #expect(first.contains("person@example.com") == false)
  }

  private func batch(events: [LibraryFileEvent]) -> LibraryFileEventBatch {
    LibraryFileEventBatch(events: events, requiresFullRescan: false)
  }

  private func event(_ file: URL) -> LibraryFileEvent {
    LibraryFileEvent(fileURL: file, kind: .modified, isDirectory: false, eventID: 1)
  }

  private func probe(
    _ file: URL,
    physicalIdentity: String = "inode-17",
    bytes: Int64 = 512,
    createdAt: Date? = Date(timeIntervalSince1970: 100),
    contentDigest: String? = nil
  ) -> ExportFileProbe {
    ExportFileProbe(
      fileURL: file,
      physicalIdentity: physicalIdentity,
      bytes: bytes,
      createdAt: createdAt,
      modifiedAt: Date(timeIntervalSince1970: 100),
      contentDigest: contentDigest,
      technicalFormat: ExportTechnicalFormat(fileExtension: file.pathExtension))
  }

  private func temporaryDirectory() throws -> URL {
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }

  private func encodeDocument(_ batches: [ExportBatch], to storageURL: URL) throws {
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    try encoder.encode(FixtureExportInboxDocument(schemaVersion: 1, batches: batches)).write(
      to: storageURL)
  }

  private func detectedBatch(
    file: URL,
    physicalIdentity: String = "inode-17"
  ) -> ExportBatch {
    ExportBatch.detected(
      files: [ExportBatchFile(probe: probe(file, physicalIdentity: physicalIdentity))],
      kind: .master,
      completedAt: Date(timeIntervalSince1970: 100),
      evidence: [.explicitExportFolder(folderName: "Exports")])
  }

  private func candidate(_ batch: ExportBatch) -> DetectedExportBatch {
    DetectedExportBatch(batch: batch)
  }

  private func revisionAuthority(
    for context: (reference: StudioRevisionReference, catalog: WorkCatalog)
  ) -> StudioRevisionExecutionAuthority {
    let authority = StudioRevisionExecutionAuthority()
    authority.activate(
      generationID: context.reference.catalogueGenerationID,
      catalog: context.catalog)
    return authority
  }

  private func packageBatch(in root: URL, name: String = "Mix") throws -> ExportBatch {
    let file = root.appending(path: "\(name).wav")
    try Data(repeating: 0x2a, count: 512).write(to: file)
    let fingerprint = try FileFingerprint.read(from: file, fileManager: .default)
    let probe = ExportFileProbe(
      fileURL: file,
      physicalIdentity: fingerprint.resourceIdentity,
      bytes: fingerprint.bytes,
      createdAt: fingerprint.modifiedAt,
      modifiedAt: try #require(fingerprint.modifiedAt),
      contentDigest: try FileContentDigest.sha256(fileURL: file),
      technicalFormat: ExportTechnicalFormat(fileExtension: "wav"))
    return ExportBatch.detected(
      files: [ExportBatchFile(probe: probe)],
      kind: .master,
      completedAt: probe.modifiedAt,
      evidence: [.explicitExportFolder(folderName: "Exports")])
  }

  private func revisionContext(
    workID: String = "work-demo-set",
    sessionID: String = "session-mix",
    revisionID: String = "revision-12"
  ) throws -> (reference: StudioRevisionReference, catalog: WorkCatalog) {
    let root = URL(fileURLWithPath: "/Studio")
    let sessionRoot = root.appending(path: sessionID, directoryHint: .isDirectory)
    let set = AbletonSet(
      id: "set-\(revisionID)",
      fileURL: sessionRoot.appending(path: "Song.als"),
      displayName: "Song",
      isBackup: false,
      modifiedAt: Date(timeIntervalSince1970: 90),
      compressedBytes: 128,
      xmlBytes: 256,
      creator: "Ableton Live 12",
      format: AbletonFormat(
        majorVersion: "5", minorVersion: "12", schemaChangeCount: 1, revision: nil),
      structure: SetStructure())
    let revision = StudioSetRevision(
      id: revisionID,
      set: set,
      revisionLabel: "1.0",
      timestamp: RevisionTimestamp(
        value: set.modifiedAt,
        source: .fileModificationTime,
        confidence: .automatic,
        explanation: "fixture"))
    let session = StudioSession(
      id: sessionID,
      rootURL: sessionRoot,
      displayName: "Session",
      role: .production,
      canonicalTitle: "Song",
      canonicalTitleKey: "song",
      titleEvidence: [],
      revisions: [revision],
      previewAssets: [])
    let work = StudioWork(
      id: workID,
      artist: ArtistIdentity(
        id: "artist", displayName: "Artist", confidence: .automatic, evidence: []),
      displayName: "Song",
      canonicalKey: "song",
      confidence: .automatic,
      evidence: [],
      sessions: [session])
    let catalog = WorkCatalog(
      generatedAt: Date(timeIntervalSince1970: 100),
      algorithmVersion: "test-v1",
      sourceRoots: [root],
      works: [work],
      reviewQueue: [])
    let reference = try StudioRevisionReferenceResolver().capture(
      setURL: set.fileURL,
      in: catalog,
      catalogueGenerationID: "generation-1",
      reviewedAt: Date(timeIntervalSince1970: 100)
    ).reference
    return (reference, catalog)
  }

  private func replacingWorkID(in catalog: WorkCatalog, with workID: String) -> WorkCatalog {
    let works = catalog.works.map { work in
      StudioWork(
        id: workID,
        artist: work.artist,
        displayName: work.displayName,
        canonicalKey: work.canonicalKey,
        confidence: work.confidence,
        evidence: work.evidence,
        sessions: work.sessions)
    }
    return WorkCatalog(
      generatedAt: catalog.generatedAt,
      algorithmVersion: catalog.algorithmVersion,
      sourceRoots: catalog.sourceRoots,
      works: works,
      reviewQueue: catalog.reviewQueue)
  }

  private func replacingSet(
    in catalog: WorkCatalog,
    fileURL: URL? = nil,
    compressedBytesDelta: Int64 = 0
  ) -> WorkCatalog {
    let works = catalog.works.map { work in
      StudioWork(
        id: work.id,
        artist: work.artist,
        displayName: work.displayName,
        canonicalKey: work.canonicalKey,
        confidence: work.confidence,
        evidence: work.evidence,
        sessions: work.sessions.map { session in
          StudioSession(
            id: session.id,
            rootURL: session.rootURL,
            displayName: session.displayName,
            role: session.role,
            canonicalTitle: session.canonicalTitle,
            canonicalTitleKey: session.canonicalTitleKey,
            titleEvidence: session.titleEvidence,
            revisions: session.revisions.map { revision in
              let set = revision.set
              let changedSet = AbletonSet(
                id: set.id,
                fileURL: fileURL ?? set.fileURL,
                displayName: set.displayName,
                isBackup: set.isBackup,
                modifiedAt: set.modifiedAt,
                compressedBytes: set.compressedBytes + compressedBytesDelta,
                xmlBytes: set.xmlBytes,
                creator: set.creator,
                format: set.format,
                structure: set.structure,
                content: set.content)
              return StudioSetRevision(
                id: revision.id,
                set: changedSet,
                revisionLabel: revision.revisionLabel,
                filenameInterpretation: revision.filenameInterpretation,
                qualifierDecisions: revision.qualifierDecisions,
                timestamp: revision.timestamp)
            },
            previewAssets: session.previewAssets)
        })
    }
    return WorkCatalog(
      generatedAt: catalog.generatedAt,
      algorithmVersion: catalog.algorithmVersion,
      sourceRoots: catalog.sourceRoots,
      works: works,
      reviewQueue: catalog.reviewQueue)
  }

  private func makeArchive(
    in root: URL,
    for batch: ExportBatch,
    name: String = "Package",
    archiveByte: UInt8 = 0x2a,
    manifestByte: UInt8 = 0x2a,
    manifestDigest: String? = nil,
    manifestBatchID: String? = nil
  ) throws -> URL {
    let staging = root.appending(path: "\(name)-staging", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
    var manifestFiles: [DeliveryPackageManifestFile] = []
    for batchFile in batch.files {
      let archivePath = batchFile.fileURL.lastPathComponent
      let entryURL = staging.appending(path: archivePath)
      try Data(repeating: archiveByte, count: Int(batchFile.bytes)).write(to: entryURL)
      let digestFile = staging.appending(path: ".digest-\(archivePath)")
      try Data(repeating: manifestByte, count: Int(batchFile.bytes)).write(to: digestFile)
      let digest = try (manifestDigest ?? FileContentDigest.sha256(fileURL: digestFile))
      try FileManager.default.removeItem(at: digestFile)
      manifestFiles.append(
        DeliveryPackageManifestFile(
          archivePath: archivePath,
          sourceObservationKey: batchFile.deduplicationKey,
          bytes: batchFile.bytes,
          sha256: digest))
    }
    let manifest = DeliveryPackageManifest(
      batchID: manifestBatchID ?? batch.id,
      files: manifestFiles)
    let manifestURL = staging.appending(path: DeliveryPackageManifest.archivePath)
    try JSONEncoder().encode(manifest).write(to: manifestURL)
    let archiveURL = root.appending(path: "\(name).zip")
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/zip")
    process.currentDirectoryURL = staging
    process.arguments =
      ["-q", archiveURL.path] + manifestFiles.map(\.archivePath)
      + [DeliveryPackageManifest.archivePath]
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    try process.run()
    process.waitUntilExit()
    guard process.terminationStatus == 0 else {
      throw NSError(domain: "ExportInboxCoreTests.zip", code: Int(process.terminationStatus))
    }
    return archiveURL
  }

  private func abletonPlan(
    output: URL,
    revisionReference: StudioRevisionReference? = nil
  ) -> AbletonExportPlan {
    AbletonExportPlan(
      setID: "set",
      revisionID: "revision",
      workID: "work",
      workName: "Work",
      setURL: URL(fileURLWithPath: "/Studio/Work.als"),
      installation: AbletonLiveInstallation(
        id: "live",
        applicationURL: URL(fileURLWithPath: "/Applications/Live.app"),
        displayName: "Live",
        bundleIdentifier: "com.ableton.live",
        version: "12.4.2",
        majorVersion: 12),
      source: .main,
      arrangementRange: AbletonArrangementRange(startBeat: 0, endBeat: 16),
      pcmFormat: .wav,
      sampleRate: .hz48000,
      bitDepth: .int24,
      normalize: false,
      includeReturnAndMainEffects: true,
      destination: AbletonExportDestination(
        directoryURL: output.deletingLastPathComponent(),
        baseName: output.deletingPathExtension().lastPathComponent,
        expectedOutputFileNames: [output.lastPathComponent]),
      revisionReference: revisionReference)
  }
}

private struct FixtureExportInboxDocument: Codable {
  let schemaVersion: Int
  let batches: [ExportBatch]
}

private final class FixtureProbeProvider: ExportFileProbeProviding, @unchecked Sendable {
  private let lock = NSLock()
  private var probes: [URL: [ExportFileProbe]]
  private var _probeCount = 0

  var probeCount: Int {
    lock.withLock { _probeCount }
  }

  init(probes: [URL: [ExportFileProbe]]) {
    self.probes = probes
  }

  func probe(_ fileURL: URL) throws -> ExportFileProbe? {
    lock.lock()
    defer { lock.unlock() }
    _probeCount += 1
    guard var values = probes[fileURL], !values.isEmpty else { return nil }
    let next = values.removeFirst()
    probes[fileURL] = values.isEmpty ? [next] : values
    return next
  }
}

private struct ImmediateScheduler: ExportDetectionScheduling {
  func wait(for interval: TimeInterval) async throws {}
}

private actor ControlledScheduler: ExportDetectionScheduling {
  private var intervals: [TimeInterval] = []
  private var gates: [CheckedContinuation<Void, Never>] = []
  private var observers: [(count: Int, continuation: CheckedContinuation<Void, Never>)] = []

  var requestedIntervals: [TimeInterval] { intervals }

  func wait(for interval: TimeInterval) async throws {
    intervals.append(interval)
    let ready = observers.filter { $0.count <= intervals.count }
    observers.removeAll { $0.count <= intervals.count }
    for observer in ready {
      observer.continuation.resume()
    }
    await withCheckedContinuation { gates.append($0) }
  }

  func waitUntilScheduled(count: Int) async {
    guard intervals.count < count else { return }
    await withCheckedContinuation { observers.append((count, $0)) }
  }

  func releaseNext() {
    guard !gates.isEmpty else { return }
    gates.removeFirst().resume()
  }
}
