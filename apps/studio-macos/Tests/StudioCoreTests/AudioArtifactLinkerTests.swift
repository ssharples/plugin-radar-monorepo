import Foundation
import Testing

@testable import StudioCore

@Suite("Audio artifact to Set revision linking")
struct AudioArtifactLinkerTests {
  @Test("Raw observations remain suggestions even when several signals agree")
  func linksMaster() throws {
    let savedAt = Date(timeIntervalSince1970: 1_700_000_000)
    let artifact = AudioArtifactLineageInput(
      nodeID: "master-clean", kind: .master,
      contentAnchorIDs: ["vocal", "guitar", "drums"],
      durationSeconds: 180,
      createdAt: savedAt.addingTimeInterval(5 * 60),
      variant: .cleanEdit,
      exportObservation: try immutableExportObservation(exportDNA: nil))
    let matching = SetRevisionLineageInput(
      revisionNodeID: "mix-v12", workID: "song",
      contentAnchorIDs: ["vocal", "guitar", "drums", "bass"],
      durationSeconds: 180.5, savedAt: savedAt, variant: .cleanEdit)
    let unrelated = SetRevisionLineageInput(
      revisionNodeID: "other", workID: "other-song",
      contentAnchorIDs: ["drums"], durationSeconds: 240,
      savedAt: savedAt, variant: nil)

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      artifact: artifact, candidates: [unrelated, matching])

    #expect(result.selectedRevisionNodeID == nil)
    #expect(result.confidence == .suggested)
    #expect(result.edge?.relationship == .renderOf)
    #expect(result.edge?.targetNodeID == "mix-v12")
    #expect(result.bestCandidate?.matchedAnchorCount == 3)
  }

  @Test("Stem evidence is typed separately from a full render")
  func linksStem() throws {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let artifact = AudioArtifactLineageInput(
      nodeID: "lead-vocal-stem", kind: .stem,
      contentAnchorIDs: ["lead-vocal", "vocal-print"], durationSeconds: 120,
      createdAt: now.addingTimeInterval(60), variant: nil)
    let revision = SetRevisionLineageInput(
      revisionNodeID: "mix", workID: "song",
      contentAnchorIDs: ["lead-vocal", "vocal-print", "drums"],
      durationSeconds: 120, savedAt: now, variant: nil)

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      artifact: artifact, candidates: [revision])

    #expect(result.edge?.relationship == .stemOf)
  }

  @Test("Tied revision candidates remain suggestions")
  func tiedCandidates() {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let artifact = AudioArtifactLineageInput(
      nodeID: "rough", kind: .bounce, contentAnchorIDs: ["a", "b"],
      durationSeconds: 60, createdAt: now, variant: nil)
    let candidates = ["one", "two"].map {
      SetRevisionLineageInput(
        revisionNodeID: $0, workID: "song", contentAnchorIDs: ["a", "b"],
        durationSeconds: 60, savedAt: now, variant: nil)
    }

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      artifact: artifact, candidates: candidates)

    #expect(result.selectedRevisionNodeID == nil)
    #expect(result.proposedRevisionNodeID == "one")
    #expect(result.confidence == .suggested)
    #expect(result.edge?.confidence == .suggested)
  }

  @Test("One common anchor cannot attach an export")
  func sparseEvidenceAbstains() {
    let artifact = AudioArtifactLineageInput(
      nodeID: "unknown", kind: .unknown, contentAnchorIDs: ["common-loop"],
      durationSeconds: nil, createdAt: nil, variant: nil)
    let candidate = SetRevisionLineageInput(
      revisionNodeID: "candidate", workID: "song", contentAnchorIDs: ["common-loop"],
      durationSeconds: nil, savedAt: nil, variant: nil)

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      artifact: artifact, candidates: [candidate])

    #expect(result.selectedRevisionNodeID == nil)
    #expect(result.edge == nil)
  }

  @Test("Fabricated immutable Export DNA remains suggestion-only in raw resolution")
  func fabricatedImmutableObservationCannotAuthorizeRawResolution() throws {
    let savedAt = Date(timeIntervalSince1970: 1_723_630_800)
    let createdAt = savedAt.addingTimeInterval(15 * 60)
    let artifact = AudioArtifactLineageInput(
      nodeID: "lead-vocal-print", kind: .stem, contentAnchorIDs: [],
      durationSeconds: 121,
      createdAt: createdAt,
      variant: nil,
      exportObservation: try immutableExportObservation(
        fileName: "Lead Vocal Stem.wav",
        folderName: "Stems",
        batchFileCount: 1,
        exportDNA: ExportDNAAssociationEvidence(parsed: parsedExportDNA(createdAt: createdAt))))
    let matching = SetRevisionLineageInput(
      revisionNodeID: "mix-v12", workID: "song", contentAnchorIDs: [],
      durationSeconds: 121.2,
      savedAt: savedAt,
      variant: nil,
      exportContext: ExportRevisionEvidenceContext(
        displayName: "DEMO SET",
        reviewedArrangementRange: ReviewedArrangementSampleRange(
          startSample: 120_000,
          endSample: 260_000,
          sampleRate: 48_000),
        expectedTrackLabels: ["Lead Vocal"],
        expectedExportFolderNames: ["Stems"],
        expectedBatchFileCount: 1))
    let unrelated = SetRevisionLineageInput(
      revisionNodeID: "other", workID: "other", contentAnchorIDs: [],
      durationSeconds: 210,
      savedAt: savedAt,
      variant: nil,
      exportContext: ExportRevisionEvidenceContext(
        displayName: "OTHER SONG",
        reviewedArrangementRange: ReviewedArrangementSampleRange(
          startSample: 10,
          endSample: 2_000,
          sampleRate: 44_100),
        expectedTrackLabels: ["Drums"],
        expectedExportFolderNames: ["Masters"],
        expectedBatchFileCount: 2))

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      artifact: artifact, candidates: [unrelated, matching])

    #expect(result.selectedRevisionNodeID == nil)
    #expect(result.proposedRevisionNodeID == "mix-v12")
    #expect(result.confidence == .suggested)
    #expect(result.bestCandidate?.exportCompatibility ?? 0 > 0.85)
    #expect(
      result.edge?.evidence.contains { $0.explanation.contains("never verifies provenance") }
        == true)
  }

  @Test("Contradictory embedded metadata fails closed without anchor support")
  func contradictoryExportDNAAbstains() throws {
    let savedAt = Date(timeIntervalSince1970: 1_723_630_800)
    let createdAt = savedAt.addingTimeInterval(5 * 60)
    let artifact = AudioArtifactLineageInput(
      nodeID: "print", kind: .stem, contentAnchorIDs: [],
      durationSeconds: 60,
      createdAt: createdAt,
      variant: nil,
      exportObservation: try immutableExportObservation(
        fileName: "Lead Vocal Stem.wav",
        folderName: "Stems",
        batchFileCount: 1,
        exportDNA: ExportDNAAssociationEvidence(
          parsed: parsedExportDNA(
            createdAt: createdAt,
            contradictions: [
              ExportMetadataContradiction(
                field: "sampleRate",
                containerValue: "48000",
                metadataSource: .iXML,
                metadataValue: "44100",
                explanation: "iXML disagrees with the container sample rate.")
            ]))))
    let candidate = SetRevisionLineageInput(
      revisionNodeID: "mix-v12", workID: "song", contentAnchorIDs: [],
      durationSeconds: 60,
      savedAt: savedAt,
      variant: nil,
      exportContext: ExportRevisionEvidenceContext(
        displayName: "DEMO SET",
        reviewedArrangementRange: ReviewedArrangementSampleRange(
          startSample: 120_000,
          endSample: 260_000,
          sampleRate: 48_000),
        expectedTrackLabels: ["Lead Vocal"],
        expectedExportFolderNames: ["Stems"],
        expectedBatchFileCount: 1))

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      artifact: artifact, candidates: [candidate])

    #expect(result.proposedRevisionNodeID == nil)
    #expect(result.confidence == .unknown)
    #expect(result.edge == nil)
  }

  @Test("Contradictory Export DNA keeps a strong anchor match review-only")
  func contradictoryExportDNABlocksAutomaticSelection() throws {
    let savedAt = Date(timeIntervalSince1970: 1_723_630_800)
    let createdAt = savedAt.addingTimeInterval(5 * 60)
    let artifact = AudioArtifactLineageInput(
      nodeID: "master", kind: .master,
      contentAnchorIDs: ["vocal", "guitar", "drums"],
      durationSeconds: 180,
      createdAt: createdAt,
      variant: .cleanEdit,
      exportObservation: try immutableExportObservation(
        fileName: "DEMO SET Master.wav",
        folderName: "Masters",
        batchFileCount: 1,
        exportDNA: ExportDNAAssociationEvidence(
          parsed: parsedExportDNA(
            createdAt: createdAt,
            contradictions: [
              ExportMetadataContradiction(
                field: "sampleRate",
                containerValue: "48000",
                metadataSource: .iXML,
                metadataValue: "44100",
                explanation: "iXML disagrees with the container sample rate.")
            ]))))
    let matching = SetRevisionLineageInput(
      revisionNodeID: "mix-v12", workID: "song",
      contentAnchorIDs: ["vocal", "guitar", "drums", "bass"],
      durationSeconds: 180.5,
      savedAt: savedAt,
      variant: .cleanEdit,
      exportContext: ExportRevisionEvidenceContext(
        displayName: "DEMO SET",
        reviewedArrangementRange: ReviewedArrangementSampleRange(
          startSample: 120_000,
          endSample: 260_000,
          sampleRate: 48_000),
        expectedTrackLabels: ["Lead Vocal"],
        expectedExportFolderNames: ["Masters"],
        expectedBatchFileCount: 1))
    let unrelated = SetRevisionLineageInput(
      revisionNodeID: "other", workID: "other-song",
      contentAnchorIDs: ["drums"], durationSeconds: 240,
      savedAt: savedAt, variant: nil)

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      artifact: artifact, candidates: [unrelated, matching])

    #expect(result.selectedRevisionNodeID == nil)
    #expect(result.proposedRevisionNodeID == "mix-v12")
    #expect(result.confidence == .suggested)
    #expect(result.edge?.confidence == .suggested)
    #expect(result.bestCandidate?.metadataConflictCount == 1)
  }

  @Test("Only an exact detector-issued receipt authorizes automation association")
  func parsesFileInProductionLinkerFlow() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appending(path: "Master.wav")
    try writeLinkerWave(
      to: fileURL,
      ixml: "<BWFXML><PROJECT>SONG</PROJECT><NOTE>free-form note</NOTE></BWFXML>")
    let savedAt = Date(timeIntervalSince1970: 1_700_000_000)
    let artifact = AudioArtifactLineageInput(
      nodeID: "master", kind: .master, contentAnchorIDs: [], durationSeconds: 60,
      createdAt: savedAt, variant: nil)
    let revisionContext = try linkerRevisionContext(revisionID: "revision")
    let revisionReference = revisionContext.reference
    let revisionAuthority = linkerRevisionAuthority(for: revisionContext)
    let candidate = SetRevisionLineageInput(
      revisionNodeID: "revision", workID: "work", contentAnchorIDs: [],
      durationSeconds: 60, savedAt: savedAt, variant: nil,
      exportContext: ExportRevisionEvidenceContext(
        displayName: "SONG", reviewedArrangementRange: nil),
      revisionReference: revisionReference)
    let linker = AudioArtifactLinker(calibration: artifactCalibration())

    let inspected = linker.resolve(fileURL: fileURL, artifact: artifact, candidates: [candidate])
    #expect(inspected.status == .parsed)
    let observation = try #require(inspected.observation)
    #expect(observation.hasImmutableObservation)
    #expect(observation.exportDNA?.fileSampleRate == 48_000)
    #expect(inspected.resolution.selectedRevisionNodeID == nil)

    let immutable = try #require(observation.immutableFileObservation)
    let binding = try ExportVerifiedAutomationBinding(
      planID: "plan", revisionNodeID: "revision", outputSHA256: immutable.sha256)
    let boundObservation = ExportArtifactObservation(
      immutableFileObservation: immutable,
      revalidatedAt: Date(),
      verifiedAutomationBinding: binding,
      fileName: observation.fileName,
      folderName: observation.folderName,
      batchFileCount: observation.batchFileCount,
      exportDNA: observation.exportDNA)
    let boundArtifact = AudioArtifactLineageInput(
      nodeID: artifact.nodeID, kind: artifact.kind, contentAnchorIDs: [], durationSeconds: 60,
      createdAt: savedAt, variant: nil, exportObservation: boundObservation)
    let forged = linker.resolve(
      fileURL: fileURL, artifact: boundArtifact, candidates: [candidate])
    #expect(forged.status == .parsed)
    #expect(forged.resolution.selectedRevisionNodeID == nil)
    #expect(forged.resolution.bestCandidate?.hasDetectorIssuedAutomationAuthority == false)

    let detectorBatch = detectorIssuedBatch(
      fileURL: fileURL,
      observation: immutable,
      revisionReference: revisionReference,
      associationPlanID: "plan",
      receiptPlanID: "plan")
    let missingRevisionAuthority = linker.resolve(
      fileURL: fileURL, artifact: boundArtifact, candidates: [candidate],
      detectedBatch: detectorBatch)
    #expect(missingRevisionAuthority.resolution.selectedRevisionNodeID == nil)
    let verified = linker.resolve(
      fileURL: fileURL,
      artifact: boundArtifact,
      candidates: [candidate],
      detectedBatch: detectorBatch,
      revisionAuthority: revisionAuthority)
    #expect(verified.status == .parsed)
    #expect(verified.resolution.selectedRevisionNodeID == "revision")
    #expect(verified.resolution.confidence == .highConfidenceDerivative)
    #expect(verified.resolution.bestCandidate?.hasDetectorIssuedAutomationAuthority == true)

    let wrongBinding = try ExportVerifiedAutomationBinding(
      planID: "plan", revisionNodeID: "revision", outputSHA256: String(repeating: "b", count: 64))
    let mismatchedArtifact = AudioArtifactLineageInput(
      nodeID: artifact.nodeID, kind: artifact.kind, contentAnchorIDs: [], durationSeconds: 60,
      createdAt: savedAt, variant: nil,
      exportObservation: ExportArtifactObservation(
        immutableFileObservation: immutable,
        revalidatedAt: Date(),
        verifiedAutomationBinding: wrongBinding,
        fileName: observation.fileName,
        folderName: observation.folderName,
        batchFileCount: nil,
        exportDNA: observation.exportDNA))
    let mismatched = linker.resolve(
      fileURL: fileURL, artifact: mismatchedArtifact, candidates: [candidate])
    #expect(mismatched.status == .parsed)
    #expect(mismatched.resolution.selectedRevisionNodeID == nil)
    #expect(mismatched.resolution.bestCandidate?.hasDetectorIssuedAutomationAuthority == false)
  }

  @Test("Mismatched detector receipts cannot authorize a file association")
  func detectorReceiptMismatchesRemainNonAuthoritative() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appending(path: "Receipt.wav")
    try writeLinkerWave(to: fileURL)
    let linker = AudioArtifactLinker(calibration: artifactCalibration())
    let artifact = AudioArtifactLineageInput(
      nodeID: "receipt", kind: .master, contentAnchorIDs: [], durationSeconds: nil,
      createdAt: nil, variant: nil)
    let inspected = linker.resolve(fileURL: fileURL, artifact: artifact, candidates: [])
    let immutable = try #require(inspected.observation?.immutableFileObservation)
    let revisionContext = try linkerRevisionContext(revisionID: "revision")
    let reference = revisionContext.reference
    let revisionAuthority = linkerRevisionAuthority(for: revisionContext)
    let otherReference = try linkerRevisionContext(revisionID: "other-revision").reference
    let candidate = SetRevisionLineageInput(
      revisionNodeID: reference.revisionID, workID: reference.workID, contentAnchorIDs: [],
      durationSeconds: nil, savedAt: nil, variant: nil, revisionReference: reference)
    let mismatchedFile = try ExportArtifactImmutableFileObservation(
      sha256: String(repeating: "b", count: 64), bytes: immutable.bytes,
      modifiedAt: immutable.modifiedAt, resourceIdentity: immutable.resourceIdentity)
    let mismatches = [
      detectorIssuedBatch(
        fileURL: fileURL, observation: immutable, revisionReference: reference,
        associationPlanID: "plan", receiptPlanID: "other-plan"),
      detectorIssuedBatch(
        fileURL: fileURL, observation: immutable, revisionReference: reference,
        associationPlanID: "plan", receiptPlanID: "plan", receiptReference: otherReference),
      detectorIssuedBatch(
        fileURL: fileURL, observation: mismatchedFile, revisionReference: reference,
        associationPlanID: "plan", receiptPlanID: "plan"),
    ]

    for batch in mismatches {
      #expect(
        batch.artifactAutomationAuthority(
          fileURL: fileURL, observation: immutable, revisionAuthority: revisionAuthority) == nil)
      let result = linker.resolve(
        fileURL: fileURL, artifact: artifact, candidates: [candidate], detectedBatch: batch,
        revisionAuthority: revisionAuthority)
      #expect(result.status == .parsed)
      #expect(result.resolution.selectedRevisionNodeID == nil)
      #expect(result.resolution.bestCandidate?.hasDetectorIssuedAutomationAuthority == false)
    }
  }

  @Test("Decoding verified sidecar report state grants no linker authority")
  func decodedVerifiedSidecarCannotAuthorizeLinker() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appending(path: "Decoded.wav")
    try writeLinkerWave(to: fileURL)
    let linker = AudioArtifactLinker(calibration: artifactCalibration())
    let artifact = AudioArtifactLineageInput(
      nodeID: "decoded", kind: .master, contentAnchorIDs: [], durationSeconds: nil,
      createdAt: nil, variant: nil)
    let inspected = linker.resolve(fileURL: fileURL, artifact: artifact, candidates: [])
    let observation = try #require(inspected.observation)
    let immutable = try #require(observation.immutableFileObservation)
    let revisionContext = try linkerRevisionContext(revisionID: "revision")
    let reference = revisionContext.reference
    let revisionAuthority = linkerRevisionAuthority(for: revisionContext)
    let batch = detectorIssuedBatch(
      fileURL: fileURL, observation: immutable, revisionReference: reference,
      associationPlanID: "plan", receiptPlanID: "plan")
    let issuedAssociation = try #require(
      try batch.verifiedSidecarAssociation(
        fileURL: fileURL, observation: immutable, revisionAuthority: revisionAuthority,
        evidence: ["issued automation receipt"]))
    let sidecar = StudioExportEvidenceSidecar(
      applicationVersion: "test", algorithmVersions: [AudioArtifactLinker.algorithmVersion],
      association: issuedAssociation,
      observation: StudioExportEvidenceSidecarObservation(
        batchID: batch.id, observedAt: Date(),
        immutableObservationKeys: [immutable.observationKey], relativePaths: ["Decoded.wav"],
        exportDNA: observation.exportDNA),
      files: [
        StudioExportEvidenceSidecarFile(
          relativePath: "Decoded.wav", bytes: immutable.bytes, sha256: immutable.sha256)
      ])
    let decoded = try JSONDecoder().decode(
      StudioExportEvidenceSidecar.self, from: JSONEncoder().encode(sidecar))
    #expect(decoded.association.confidence == .verifiedAutomation)
    #expect(decoded.association.verifiedEvidence?.authorityReceipt == nil)
    let reconstructed = StudioExportEvidenceSidecar(
      applicationVersion: "test", algorithmVersions: [], association: decoded.association,
      observation: decoded.observation, files: decoded.files)
    #expect(reconstructed.association.confidence == .reviewed)

    let forgedObservation = ExportArtifactObservation(
      immutableFileObservation: immutable,
      revalidatedAt: Date(),
      verifiedAutomationBinding: decoded.association.verifiedEvidence?.automationBinding,
      fileName: nil, folderName: nil, batchFileCount: nil, exportDNA: nil)
    let forgedArtifact = AudioArtifactLineageInput(
      nodeID: artifact.nodeID, kind: artifact.kind, contentAnchorIDs: [], durationSeconds: nil,
      createdAt: nil, variant: nil, exportObservation: forgedObservation)
    let candidate = SetRevisionLineageInput(
      revisionNodeID: reference.revisionID, workID: reference.workID, contentAnchorIDs: [],
      durationSeconds: nil, savedAt: nil, variant: nil, revisionReference: reference)
    let result = linker.resolve(
      fileURL: fileURL, artifact: forgedArtifact, candidates: [candidate])
    #expect(result.status == .parsed)
    #expect(result.resolution.selectedRevisionNodeID == nil)
    #expect(result.resolution.bestCandidate?.hasDetectorIssuedAutomationAuthority == false)
  }

  @Test("In-call file revalidation permits calibrated independent-signal association")
  func revalidatedFileMultipleSignalsCanAssociateAutomatically() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appending(path: "Signals.wav")
    try writeLinkerWave(to: fileURL)
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let artifact = AudioArtifactLineageInput(
      nodeID: "signals", kind: .master, contentAnchorIDs: ["a", "b", "c"],
      durationSeconds: 60, createdAt: now, variant: nil)
    let candidate = SetRevisionLineageInput(
      revisionNodeID: "revision", workID: "work", contentAnchorIDs: ["a", "b", "c"],
      durationSeconds: 60, savedAt: now, variant: nil)

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      fileURL: fileURL, artifact: artifact, candidates: [candidate])

    #expect(result.status == .parsed)
    #expect(result.resolution.selectedRevisionNodeID == "revision")
    #expect(result.resolution.confidence == .highConfidenceDerivative)
    #expect(result.resolution.bestCandidate?.hasDetectorIssuedAutomationAuthority == false)
  }

  @Test("Parser failure abstains and reports without manufacturing provenance")
  func parserFailureAbstains() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appending(path: "broken.wav")
    try Data("broken".utf8).write(to: fileURL)
    let artifact = AudioArtifactLineageInput(
      nodeID: "broken", kind: .unknown, contentAnchorIDs: ["a", "b"],
      durationSeconds: 60, createdAt: Date(), variant: nil)
    let candidate = SetRevisionLineageInput(
      revisionNodeID: "revision", workID: "work", contentAnchorIDs: ["a", "b"],
      durationSeconds: 60, savedAt: Date(), variant: nil)

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      fileURL: fileURL, artifact: artifact, candidates: [candidate])

    #expect(result.status == .parseFailed(.truncated("RIFF header")))
    #expect(result.resolution.confidence == .unknown)
    #expect(result.resolution.edge == nil)
    #expect(result.observation == nil)
  }

  @Test("Same-path replacement invalidates immutable Export DNA evidence")
  func samePathReplacementInvalidatesEvidence() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let fileURL = directory.appending(path: "replace.wav")
    try writeLinkerWave(to: fileURL, audioByte: 1)
    let linker = AudioArtifactLinker(calibration: artifactCalibration())
    let artifact = AudioArtifactLineageInput(
      nodeID: "artifact", kind: .bounce, contentAnchorIDs: ["a", "b"],
      durationSeconds: 60, createdAt: Date(), variant: nil)
    let first = linker.resolve(fileURL: fileURL, artifact: artifact, candidates: [])
    let observation = try #require(first.observation)
    let immutable = try #require(observation.immutableFileObservation)

    try FileManager.default.removeItem(at: fileURL)
    try writeLinkerWave(to: fileURL, audioByte: 2)
    #expect(linker.revalidate(fileURL: fileURL, expected: immutable) == false)

    let staleArtifact = AudioArtifactLineageInput(
      nodeID: artifact.nodeID, kind: artifact.kind, contentAnchorIDs: artifact.contentAnchorIDs,
      durationSeconds: artifact.durationSeconds, createdAt: artifact.createdAt,
      variant: artifact.variant, exportObservation: observation)
    let result = linker.resolve(fileURL: fileURL, artifact: staleArtifact, candidates: [])
    #expect(result.status == .sourceChanged)
    #expect(result.resolution.edge == nil)
    #expect(result.observation == nil)
  }

  @Test("Free-form iXML NOTE contributes no association score")
  func freeFormNoteDoesNotScore() throws {
    let evidence = ExportDNAAssociationEvidence(
      containerKind: .riffWave,
      fileSampleRate: 48_000,
      dataChunkBytes: 100,
      originationTimestamp: nil,
      sampleTimeReference: nil,
      ixmlProject: nil,
      ixmlNote: "TARGET REVISION",
      ixmlTrackLabels: [],
      ixmlTrackCount: nil,
      contradictions: [],
      includesUntrustedDescriptiveMetadata: true)
    let artifact = AudioArtifactLineageInput(
      nodeID: "note", kind: .unknown, contentAnchorIDs: [], durationSeconds: nil,
      createdAt: nil, variant: nil,
      exportObservation: try immutableExportObservation(exportDNA: evidence))
    let candidate = SetRevisionLineageInput(
      revisionNodeID: "target", workID: "work", contentAnchorIDs: [], durationSeconds: nil,
      savedAt: nil, variant: nil,
      exportContext: ExportRevisionEvidenceContext(
        displayName: "TARGET REVISION", reviewedArrangementRange: nil))

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      artifact: artifact, candidates: [candidate])

    #expect(result.proposedRevisionNodeID == nil)
    #expect(result.bestCandidate?.exportCompatibility == 0)
    #expect(result.edge == nil)
  }

  @Test("Descriptive labels may suggest but cannot raise automatic evidence score")
  func descriptiveLabelsRemainReviewOnly() throws {
    let now = Date(timeIntervalSince1970: 1_700_000_000)
    let evidence = ExportDNAAssociationEvidence(
      containerKind: .riffWave,
      fileSampleRate: 48_000,
      dataChunkBytes: 100,
      originationTimestamp: nil,
      sampleTimeReference: nil,
      ixmlProject: "TARGET SONG",
      ixmlNote: nil,
      ixmlTrackLabels: ["Lead Vocal"],
      ixmlTrackCount: 1,
      contradictions: [],
      includesUntrustedDescriptiveMetadata: true)
    let artifact = AudioArtifactLineageInput(
      nodeID: "descriptive", kind: .stem, contentAnchorIDs: [], durationSeconds: 60,
      createdAt: now, variant: nil,
      exportObservation: try immutableExportObservation(
        fileName: "Lead Vocal.wav", folderName: "Stems", exportDNA: evidence))
    let candidate = SetRevisionLineageInput(
      revisionNodeID: "target", workID: "work", contentAnchorIDs: [], durationSeconds: 60,
      savedAt: now, variant: nil,
      exportContext: ExportRevisionEvidenceContext(
        displayName: "TARGET SONG", reviewedArrangementRange: nil,
        expectedTrackLabels: ["Lead Vocal"],
        expectedExportFolderNames: ["Stems"]))

    let result = AudioArtifactLinker(calibration: artifactCalibration()).resolve(
      artifact: artifact, candidates: [candidate])

    #expect(result.proposedRevisionNodeID == "target")
    #expect(result.selectedRevisionNodeID == nil)
    #expect(result.bestCandidate?.automaticEvidenceScore == 0)
    #expect(result.confidence == .suggested)
  }
}

private func artifactCalibration() -> AudioMatchingCalibration {
  AudioMatchingCalibration(
    id: "artifact-test-calibration", algorithmFamily: "audio-artifact-linker",
    materialClass: .fullMix, validatedExampleCount: 100,
    validatedAt: Date(timeIntervalSince1970: 0), automaticScoreThreshold: 0.8,
    minimumCoverage: 0.5, minimumRunnerUpMargin: 0.15)
}

private func parsedExportDNA(
  createdAt: Date,
  contradictions: [ExportMetadataContradiction] = []
) -> ParsedExportDNA {
  let formatter = DateFormatter()
  formatter.locale = Locale(identifier: "en_US_POSIX")
  formatter.timeZone = TimeZone(secondsFromGMT: 0)
  formatter.dateFormat = "yyyy-MM-dd"
  let timeFormatter = DateFormatter()
  timeFormatter.locale = Locale(identifier: "en_US_POSIX")
  timeFormatter.timeZone = TimeZone(secondsFromGMT: 0)
  timeFormatter.dateFormat = "HH:mm:ss"
  return ParsedExportDNA(
    container: ExportWaveContainer(
      kind: .riffWave,
      formType: "WAVE",
      riffSize: 1_024,
      physicalFileSize: 1_032,
      ds64: nil,
      format: ExportWaveFormat(
        formatTag: 1,
        channelCount: 2,
        sampleRate: 48_000,
        bytesPerSecond: 288_000,
        blockAlign: 6,
        bitsPerSample: 24,
        extensionBytes: nil),
      dataChunkSize: 512),
    chunks: [],
    bext: BroadcastWaveMetadata(
      trust: ExportEmbeddedMetadataTrust(
        source: .bext,
        level: .high,
        explanation: "fixture"),
      description: "Lead Vocal Stem",
      originator: "Studio Time Machine",
      originatorReference: "fixture",
      originationDate: formatter.string(from: createdAt),
      originationTime: timeFormatter.string(from: createdAt),
      timeReference: ExportSampleTimeReference(
        samplesSinceOrigin: 180_000,
        sampleRate: 48_000),
      version: 1,
      umidHex: nil,
      loudness: nil,
      codingHistory: nil),
    ixml: ExportIXMLMetadata(
      trust: ExportEmbeddedMetadataTrust(
        source: .iXML,
        level: .medium,
        explanation: "fixture"),
      rootElementName: "BWFXML",
      project: "DEMO SET",
      note: "Lead Vocal stem",
      fileSampleRate: 48_000,
      trackCount: 1,
      tracks: [
        ExportIXMLTrack(channelIndex: 1, interleaveIndex: 1, name: "Lead Vocal", function: "Stem")
      ]),
    axml: nil,
    info: nil,
    contradictions: contradictions)
}

private func immutableExportObservation(
  fileName: String? = nil,
  folderName: String? = nil,
  batchFileCount: Int? = nil,
  exportDNA: ExportDNAAssociationEvidence?
) throws -> ExportArtifactObservation {
  let immutable = try ExportArtifactImmutableFileObservation(
    sha256: String(repeating: "a", count: 64),
    bytes: 1_024,
    modifiedAt: Date(timeIntervalSince1970: 1_700_000_000),
    resourceIdentity: "fixture:1")
  return ExportArtifactObservation(
    immutableFileObservation: immutable,
    revalidatedAt: Date(timeIntervalSince1970: 1_700_000_001),
    fileName: fileName,
    folderName: folderName,
    batchFileCount: batchFileCount,
    exportDNA: exportDNA)
}

private func detectorIssuedBatch(
  fileURL: URL,
  observation: ExportArtifactImmutableFileObservation,
  revisionReference: StudioRevisionReference,
  associationPlanID: String,
  receiptPlanID: String,
  receiptReference: StudioRevisionReference? = nil
) -> DetectedExportBatch {
  let file = ExportBatchFile(
    probe: ExportFileProbe(
      fileURL: fileURL,
      physicalIdentity: observation.resourceIdentity,
      bytes: observation.bytes,
      modifiedAt: observation.modifiedAt,
      contentDigest: observation.sha256,
      technicalFormat: ExportTechnicalFormat(fileExtension: "wav")))
  let batch = ExportBatch.detected(
    files: [file],
    kind: .master,
    completedAt: observation.modifiedAt,
    evidence: [],
    association: ExportAssociation(
      revisionReference: revisionReference,
      confidence: .verified,
      evidence: [.verifiedAutomationOutput(planID: associationPlanID)]))
  return DetectedExportBatch(
    batch: batch,
    automationReceipt: ExportAutomationDetectionReceipt(
      revisionReferenceID: (receiptReference ?? revisionReference).id,
      fileObservationKeys: [file.deduplicationKey],
      planID: receiptPlanID))
}

private func linkerRevisionContext(
  revisionID: String
) throws -> (reference: StudioRevisionReference, catalog: WorkCatalog) {
  let root = URL(fileURLWithPath: "/Studio")
  let sessionRoot = root.appending(path: "session", directoryHint: .isDirectory)
  let set = AbletonSet(
    id: "set-\(revisionID)",
    fileURL: sessionRoot.appending(path: "\(revisionID).als"),
    displayName: revisionID,
    isBackup: false,
    modifiedAt: Date(timeIntervalSince1970: 90),
    compressedBytes: 100,
    xmlBytes: 200,
    creator: "Ableton Live 12",
    format: AbletonFormat(
      majorVersion: "5", minorVersion: "12", schemaChangeCount: 1, revision: nil),
    structure: SetStructure())
  let revision = StudioSetRevision(
    id: revisionID,
    set: set,
    revisionLabel: revisionID,
    timestamp: RevisionTimestamp(
      value: set.modifiedAt,
      source: .fileModificationTime,
      confidence: .automatic,
      explanation: "fixture"))
  let session = StudioSession(
    id: "session",
    rootURL: sessionRoot,
    displayName: "Session",
    role: .production,
    canonicalTitle: "Work",
    canonicalTitleKey: "work",
    titleEvidence: [],
    revisions: [revision],
    previewAssets: [])
  let work = StudioWork(
    id: "work",
    artist: ArtistIdentity(
      id: "artist", displayName: "Artist", confidence: .automatic, evidence: []),
    displayName: "Work",
    canonicalKey: "work",
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

private func linkerRevisionAuthority(
  for context: (reference: StudioRevisionReference, catalog: WorkCatalog)
) -> StudioRevisionExecutionAuthority {
  let authority = StudioRevisionExecutionAuthority()
  authority.activate(
    generationID: context.reference.catalogueGenerationID,
    catalog: context.catalog)
  return authority
}

private func writeLinkerWave(
  to fileURL: URL,
  ixml: String? = nil,
  audioByte: UInt8 = 0
) throws {
  var format = Data()
  format.append(linkerLittleEndian(UInt16(1)))
  format.append(linkerLittleEndian(UInt16(1)))
  format.append(linkerLittleEndian(UInt32(48_000)))
  format.append(linkerLittleEndian(UInt32(144_000)))
  format.append(linkerLittleEndian(UInt16(3)))
  format.append(linkerLittleEndian(UInt16(24)))

  var body = Data("WAVE".utf8)
  body.append(linkerChunk(id: "fmt ", data: format))
  if let ixml { body.append(linkerChunk(id: "iXML", data: Data(ixml.utf8))) }
  body.append(linkerChunk(id: "data", data: Data(repeating: audioByte, count: 3)))
  var file = Data("RIFF".utf8)
  file.append(linkerLittleEndian(UInt32(body.count)))
  file.append(body)
  try file.write(to: fileURL)
}

private func linkerChunk(id: String, data: Data) -> Data {
  var chunk = Data(id.utf8)
  chunk.append(linkerLittleEndian(UInt32(data.count)))
  chunk.append(data)
  if !data.count.isMultiple(of: 2) { chunk.append(0) }
  return chunk
}

private func linkerLittleEndian<T: FixedWidthInteger>(_ value: T) -> Data {
  withUnsafeBytes(of: value.littleEndian) { Data($0) }
}
