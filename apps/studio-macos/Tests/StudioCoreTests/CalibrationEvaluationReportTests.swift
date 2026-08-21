import Foundation
import Testing

@testable import StudioCore

@Suite("Calibration evaluation reports")
struct CalibrationEvaluationReportTests {
  @Test("Reports complete metrics per observed evidence family and explicit gates")
  func reportsCompleteMetrics() throws {
    let heldOut = partition(
      kind: .synthetic,
      split: .heldOut,
      artist: "a",
      song: "b")
    let automatic = observation(
      id: "automatic-observation",
      kind: .sessionContainmentAutomaticAssignment,
      disposition: .automatic,
      predictedLabel: .sameSong,
      score: 0.9,
      evidence: [.exact],
      unavailable: [.pcm],
      partition: heldOut,
      performance: CalibrationObservationPerformance(
        wallClockMilliseconds: 10,
        cpuMilliseconds: 8,
        peakResidentMegabytes: 40,
        bytesScanned: 100,
        comparedCandidateCount: 2))
    let session = observation(
      id: "session-observation",
      kind: .sessionRelationshipObservation,
      disposition: .suggested,
      predictedLabel: .evolved,
      score: 0.8,
      evidence: [.arrangement],
      partition: heldOut,
      performance: CalibrationObservationPerformance(
        wallClockMilliseconds: 20,
        cpuMilliseconds: 12,
        peakResidentMegabytes: 60,
        bytesScanned: 200,
        comparedCandidateCount: 3))
    let export = observation(
      id: "export-observation",
      kind: .exportArtifactAssociation,
      disposition: .abstained,
      predictedLabel: nil,
      score: 0.99,
      evidence: [.exportDNA, .immutableArtifactObservation],
      partition: heldOut)
    let audio = observation(
      id: "audio-observation",
      kind: .audioMatchObservation,
      disposition: .suggested,
      predictedLabel: .sameRecording,
      score: 0.75,
      evidence: [.nearIdentityFingerprint, .technicalMetadata],
      partition: heldOut,
      performance: CalibrationObservationPerformance(
        wallClockMilliseconds: 30,
        cpuMilliseconds: 16,
        peakResidentMegabytes: 50,
        bytesScanned: 300,
        comparedCandidateCount: 4))
    let directory = CalibrationReviewDirectory(decisions: [
      decision(id: "d1", label: .keepSeparate, observation: automatic, at: 10),
      decision(id: "d2", label: .evolved, observation: session, at: 11),
      decision(id: "d3", label: .incorrectExportAssociation, observation: export, at: 12),
      decision(id: "d4", label: .sameRecording, observation: audio, at: 13),
    ])
    let generatedAt = Date(timeIntervalSince1970: 100)
    let report = try CalibrationEvaluationReportGenerator().generate(
      directory: directory,
      generatedAt: generatedAt)

    #expect(report.schemaVersion == CalibrationEvaluationReport.currentSchemaVersion)
    #expect(report.ledgerSchemaVersion == 2)
    #expect(report.activationAuthority == .none)
    #expect(report.partitionIsolation == .notRun)
    #expect(report.gates.labelledCorpusEvaluation == .notRun)
    #expect(report.gates.realDAWQualification == .notRun)
    #expect(report.gates.packaging == .notRun)
    #expect(report.gates.hostedService == .notRun)
    #expect(report.overall.reviewedDecisionCount == 4)
    #expect(report.overall.predictedObservationCount == 3)
    #expect(report.overall.correctPredictionCount == 2)
    #expect(report.overall.precision == 2.0 / 3.0)
    #expect(report.overall.recall == 0.5)
    #expect(report.overall.abstentionRate == 0.25)
    #expect(report.overall.coverage == 0.75)
    #expect(report.overall.falseAutomaticDecisionCount == 1)
    #expect(report.overall.scoreSummary.scoredObservationCount == 3)
    #expect(report.overall.performance.measuredObservationCount == 3)
    #expect(report.overall.performance.meanWallClockMilliseconds == nil)
    #expect(report.overall.performance.meanCPUMilliseconds == nil)
    #expect(report.overall.performance.maximumPeakResidentMegabytes == nil)
    #expect(report.overall.performance.totalBytesScanned == nil)
    #expect(report.overall.performance.totalComparedCandidateCount == nil)

    let exact = report.evidenceFamilyReports.first { $0.evidenceFamily == .exact }
    #expect(exact?.summary.reviewedDecisionCount == 1)
    #expect(exact?.summary.falseAutomaticDecisionCount == 1)
    #expect(exact?.summary.performance.totalBytesScanned == 100)
    #expect(!report.evidenceFamilyReports.contains { $0.evidenceFamily == .pcm })
    #expect(report.partitionReports.count == 1)

    let markdown = CalibrationEvaluationReportRenderer.markdown(report)
    #expect(markdown.contains("Activation authority: none"))
    #expect(markdown.contains("False automatic decisions"))
    #expect(markdown.contains("## Evidence families"))
    #expect(markdown.contains("Reports are local evaluation evidence only"))
    #expect(!markdown.contains("/Users/"))
  }

  @Test("Training and held-out Artist leakage fails")
  func artistLeakageFails() {
    let training = partition(kind: .synthetic, split: .training, artist: "a", song: "b")
    let heldOut = partition(kind: .synthetic, split: .heldOut, artist: "a", song: "c")
    let directory = CalibrationReviewDirectory(decisions: [
      decision(
        id: "training",
        label: .sameSong,
        observation: observation(
          id: "training-observation",
          kind: .sessionContainmentSuggestion,
          disposition: .suggested,
          predictedLabel: .sameSong,
          score: 0.8,
          evidence: [.exact],
          partition: training),
        at: 10),
      decision(
        id: "held-out",
        label: .sameSong,
        observation: observation(
          id: "held-out-observation",
          kind: .sessionContainmentSuggestion,
          disposition: .suggested,
          predictedLabel: .sameSong,
          score: 0.8,
          evidence: [.exact],
          partition: heldOut),
        at: 11),
    ])

    #expect(
      throws: CalibrationEvaluationError.artistPartitionLeakage(
        String(repeating: "a", count: 64))
    ) {
      try CalibrationEvaluationReportGenerator().generate(
        directory: directory,
        generatedAt: Date(timeIntervalSince1970: 100))
    }
  }

  @Test("Training and held-out Song leakage fails")
  func songLeakageFails() {
    let training = partition(kind: .synthetic, split: .training, artist: "a", song: "b")
    let heldOut = partition(kind: .synthetic, split: .heldOut, artist: "c", song: "b")
    let directory = CalibrationReviewDirectory(decisions: [
      decision(
        id: "training",
        label: .sameSong,
        observation: observation(
          id: "training-observation",
          kind: .sessionContainmentSuggestion,
          disposition: .suggested,
          predictedLabel: .sameSong,
          score: 0.8,
          evidence: [.exact],
          partition: training),
        at: 10),
      decision(
        id: "held-out",
        label: .sameSong,
        observation: observation(
          id: "held-out-observation",
          kind: .sessionContainmentSuggestion,
          disposition: .suggested,
          predictedLabel: .sameSong,
          score: 0.8,
          evidence: [.exact],
          partition: heldOut),
        at: 11),
    ])

    #expect(
      throws: CalibrationEvaluationError.songPartitionLeakage(
        String(repeating: "b", count: 64))
    ) {
      try CalibrationEvaluationReportGenerator().generate(
        directory: directory,
        generatedAt: Date(timeIntervalSince1970: 100))
    }
  }

  @Test("Validation and held-out Artist or Song leakage fails")
  func validationLeakageFails() {
    let validation = partition(kind: .realLabelled, split: .validation, artist: "a", song: "b")
    let artistLeak = partition(kind: .realLabelled, split: .heldOut, artist: "a", song: "c")
    let songLeak = partition(kind: .realLabelled, split: .heldOut, artist: "d", song: "b")
    let validationDecision = decision(
      id: "validation",
      label: .sameSong,
      observation: observation(
        id: "validation-observation",
        kind: .sessionContainmentSuggestion,
        disposition: .suggested,
        predictedLabel: .sameSong,
        score: 0.8,
        evidence: [.exact],
        partition: validation),
      at: 10)
    let artistLeakDirectory = CalibrationReviewDirectory(decisions: [
      validationDecision,
      decision(
        id: "artist-held-out",
        label: .sameSong,
        observation: observation(
          id: "artist-held-out-observation",
          kind: .sessionContainmentSuggestion,
          disposition: .suggested,
          predictedLabel: .sameSong,
          score: 0.8,
          evidence: [.exact],
          partition: artistLeak),
        at: 11),
    ])
    #expect(
      throws: CalibrationEvaluationError.artistPartitionLeakage(
        String(repeating: "a", count: 64))
    ) {
      try CalibrationEvaluationReportGenerator().generate(
        directory: artistLeakDirectory,
        generatedAt: Date(timeIntervalSince1970: 100))
    }

    let songLeakDirectory = CalibrationReviewDirectory(decisions: [
      validationDecision,
      decision(
        id: "song-held-out",
        label: .sameSong,
        observation: observation(
          id: "song-held-out-observation",
          kind: .sessionContainmentSuggestion,
          disposition: .suggested,
          predictedLabel: .sameSong,
          score: 0.8,
          evidence: [.exact],
          partition: songLeak),
        at: 11),
    ])
    #expect(
      throws: CalibrationEvaluationError.songPartitionLeakage(
        String(repeating: "b", count: 64))
    ) {
      try CalibrationEvaluationReportGenerator().generate(
        directory: songLeakDirectory,
        generatedAt: Date(timeIntervalSince1970: 100))
    }
  }

  @Test("Labelled-corpus acceptance is evidence-bound and requires sufficient isolated real splits")
  func acceptedGateRequiresReviewedRealPartitions() throws {
    let synthetic = partition(kind: .synthetic, split: .heldOut, artist: "a", song: "b")
    let syntheticDirectory = CalibrationReviewDirectory(decisions: [
      decision(
        id: "synthetic",
        label: .sameSong,
        observation: observation(
          id: "synthetic-observation",
          kind: .sessionContainmentSuggestion,
          disposition: .suggested,
          predictedLabel: .sameSong,
          score: 0.8,
          evidence: [.exact],
          partition: synthetic),
        at: 10)
    ])
    let evidence = CalibrationEvaluationEvidence(
      labelledCorpus: labelledCorpusEvidence())
    let syntheticReport = try CalibrationEvaluationReportGenerator().generate(
      directory: syntheticDirectory,
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: evidence)
    #expect(syntheticReport.gates.labelledCorpusEvaluation == .notRun)

    var decisions: [CalibrationReviewDecisionRecord] = []
    var index = 1
    for split in CalibrationCorpusSplit.allCases {
      for _ in 0..<CalibrationLabelledCorpusGateEvidence.minimumAcceptedReviewedPerSplit {
        let item = CalibrationCorpusPartition(
          corpusKind: .realLabelled,
          split: split,
          artistGroupDigest: String(format: "%064x", index),
          songGroupDigest: String(format: "%064x", index + 1_000))
        decisions.append(
          decision(
            id: "real-\(index)",
            label: .sameSong,
            observation: observation(
              id: "real-observation-\(index)",
              kind: .sessionContainmentSuggestion,
              disposition: .suggested,
              predictedLabel: .sameSong,
              score: 1,
              evidence: [.exact],
              partition: item,
              performance: CalibrationObservationPerformance(
                wallClockMilliseconds: 5,
                peakResidentMegabytes: 10,
                bytesScanned: 100,
                comparedCandidateCount: 1)),
            at: TimeInterval(10 + index)))
        index += 1
      }
    }
    let report = try CalibrationEvaluationReportGenerator().generate(
      directory: CalibrationReviewDirectory(decisions: decisions),
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: evidence)
    #expect(report.partitionIsolation == .passed)
    #expect(report.gates.labelledCorpusEvaluation == .accepted)
    #expect(report.gates.evidence.labelledCorpus?.review.id == "labelled-corpus-review")
    #expect(
      report.gates.evidence.labelledCorpus?.reviewedEvaluationReportDigest
        == String(repeating: "b", count: 64))
    #expect(report.activationAuthority == .none)

    let belowMinimumPartition = CalibrationCorpusPartition(
      corpusKind: .realLabelled,
      split: .heldOut,
      artistGroupDigest: String(repeating: "c", count: 64),
      songGroupDigest: String(repeating: "d", count: 64))
    let belowMinimum = try CalibrationEvaluationReportGenerator().generate(
      directory: CalibrationReviewDirectory(decisions: [
        decision(
          id: "below-minimum",
          label: .sameSong,
          observation: observation(
            id: "below-minimum-observation",
            kind: .sessionContainmentSuggestion,
            disposition: .suggested,
            predictedLabel: .sameSong,
            score: 1,
            evidence: [.exact],
            partition: belowMinimumPartition),
          at: 10)
      ]),
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: evidence)
    #expect(belowMinimum.partitionIsolation == .notRun)
    #expect(belowMinimum.gates.labelledCorpusEvaluation == .notRun)

    let failedDecisions = decisions.enumerated().map { offset, record in
      guard record.corpusPartition?.split == .heldOut, offset >= 40, offset < 42 else {
        return record
      }
      return CalibrationReviewDecisionRecord(
        id: record.id,
        label: .keepSeparate,
        primaryObservationID: record.primaryObservationID,
        observations: record.observations,
        algorithmFamily: record.algorithmFamily,
        algorithmVersion: record.algorithmVersion,
        calibrationID: record.calibrationID,
        reproductionFeatures: record.reproductionFeatures,
        decidedAt: record.decidedAt,
        corpusPartition: record.corpusPartition,
        notes: record.notes,
        supersedesDecisionID: nil)
    }
    let failed = try CalibrationEvaluationReportGenerator().generate(
      directory: CalibrationReviewDirectory(decisions: failedDecisions),
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: evidence)
    #expect(failed.gates.labelledCorpusEvaluation == .ineligible)
  }

  @Test("Rights and resource acceptance requires reviewed facts and measured budget compliance")
  func reviewedGateEvidence() throws {
    let heldOut = partition(kind: .realLabelled, split: .heldOut, artist: "a", song: "b")
    let measured = observation(
      id: "measured",
      kind: .sessionContainmentSuggestion,
      disposition: .suggested,
      predictedLabel: .sameSong,
      score: 1,
      evidence: [.exact],
      partition: heldOut,
      performance: CalibrationObservationPerformance(
        wallClockMilliseconds: 10,
        cpuMilliseconds: 8,
        peakResidentMegabytes: 20,
        bytesScanned: 100,
        comparedCandidateCount: 2))
    let measuredDirectory = CalibrationReviewDirectory(decisions: [
      decision(id: "measured-decision", label: .sameSong, observation: measured, at: 10)
    ])
    let evidence = CalibrationEvaluationEvidence(
      rightsAndModel: CalibrationRightsAndModelReviewEvidence(
        review: reviewedEvidence(id: "rights-review"),
        licenceEvidenceDigest: String(repeating: "c", count: 64),
        modelArtifactDigest: nil,
        licenceBasis: .noExternalModel,
        permitsLocalEvaluation: true,
        permitsProductionUse: true),
      resourceBudget: resourceBudgetEvidence(
        for: measuredDirectory,
        reviewID: "resource-review"))
    let report = try CalibrationEvaluationReportGenerator().generate(
      directory: measuredDirectory,
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: evidence)
    #expect(report.gates.rightsAndModelReview == .accepted)
    #expect(report.gates.resourceBudget == .accepted)

    let empty = try CalibrationEvaluationReportGenerator().generate(
      directory: CalibrationReviewDirectory(),
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: evidence)
    #expect(empty.partitionIsolation == .notRun)
    #expect(empty.gates.resourceBudget == .notRun)

    let unmeasured = observation(
      id: "unmeasured",
      kind: .sessionContainmentSuggestion,
      disposition: .suggested,
      predictedLabel: .sameSong,
      score: 1,
      evidence: [.exact],
      partition: heldOut)
    let partialDirectory = CalibrationReviewDirectory(decisions: [
      decision(id: "measured-decision", label: .sameSong, observation: measured, at: 10),
      decision(id: "unmeasured-decision", label: .sameSong, observation: unmeasured, at: 11),
    ])
    let partial = try CalibrationEvaluationReportGenerator().generate(
      directory: partialDirectory,
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: CalibrationEvaluationEvidence(
        resourceBudget: resourceBudgetEvidence(for: partialDirectory)))
    #expect(partial.gates.resourceBudget == .notRun)
    #expect(partial.overall.performance.measuredObservationCount == 1)
    #expect(partial.overall.performance.meanWallClockMilliseconds == nil)
    #expect(partial.overall.performance.meanCPUMilliseconds == nil)
    #expect(partial.overall.performance.maximumPeakResidentMegabytes == nil)
    #expect(partial.overall.performance.totalBytesScanned == nil)
    #expect(partial.overall.performance.totalComparedCandidateCount == nil)

    let failedBudgetEvidence = CalibrationEvaluationEvidence(
      resourceBudget: resourceBudgetEvidence(
        for: measuredDirectory,
        reviewID: "failed-resource-review",
        maximumMeanWallClockMilliseconds: 5))
    let failedBudget = try CalibrationEvaluationReportGenerator().generate(
      directory: measuredDirectory,
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: failedBudgetEvidence)
    #expect(failedBudget.gates.resourceBudget == .ineligible)
  }

  @Test("Resource budgets require complete finite measurement tuples")
  func resourceBudgetRequiresCompleteTuples() throws {
    let heldOut = partition(kind: .realLabelled, split: .heldOut, artist: "a", song: "b")
    let cases: [(String, CalibrationObservationPerformance?)] = [
      ("absent", nil),
      (
        "wall-clock",
        CalibrationObservationPerformance(
          cpuMilliseconds: 8, peakResidentMegabytes: 20, bytesScanned: 100,
          comparedCandidateCount: 2)
      ),
      (
        "cpu",
        CalibrationObservationPerformance(
          wallClockMilliseconds: 10, peakResidentMegabytes: 20, bytesScanned: 100,
          comparedCandidateCount: 2)
      ),
      (
        "peak-rss",
        CalibrationObservationPerformance(
          wallClockMilliseconds: 10, cpuMilliseconds: 8, bytesScanned: 100,
          comparedCandidateCount: 2)
      ),
      (
        "bytes",
        CalibrationObservationPerformance(
          wallClockMilliseconds: 10, cpuMilliseconds: 8, peakResidentMegabytes: 20,
          comparedCandidateCount: 2)
      ),
      (
        "candidate-count",
        CalibrationObservationPerformance(
          wallClockMilliseconds: 10, cpuMilliseconds: 8, peakResidentMegabytes: 20,
          bytesScanned: 100)
      ),
      (
        "nonfinite",
        CalibrationObservationPerformance(
          wallClockMilliseconds: .infinity, cpuMilliseconds: 8, peakResidentMegabytes: 20,
          bytesScanned: 100, comparedCandidateCount: 2)
      ),
      (
        "negative",
        CalibrationObservationPerformance(
          wallClockMilliseconds: 10, cpuMilliseconds: -1, peakResidentMegabytes: 20,
          bytesScanned: 100, comparedCandidateCount: 2)
      ),
      (
        "negative-bytes",
        CalibrationObservationPerformance(
          wallClockMilliseconds: 10, cpuMilliseconds: 8, peakResidentMegabytes: 20,
          bytesScanned: -1, comparedCandidateCount: 2)
      ),
      (
        "negative-candidate-count",
        CalibrationObservationPerformance(
          wallClockMilliseconds: 10, cpuMilliseconds: 8, peakResidentMegabytes: 20,
          bytesScanned: 100, comparedCandidateCount: -1)
      ),
    ]

    for (name, performance) in cases {
      let observed = observation(
        id: "partial-\(name)",
        kind: .sessionContainmentSuggestion,
        disposition: .suggested,
        predictedLabel: .sameSong,
        score: 1,
        evidence: [.exact],
        partition: heldOut,
        performance: performance)
      let directory = CalibrationReviewDirectory(decisions: [
        decision(id: "partial-decision-\(name)", label: .sameSong, observation: observed, at: 10)
      ])
      let report = try CalibrationEvaluationReportGenerator().generate(
        directory: directory,
        generatedAt: Date(timeIntervalSince1970: 100),
        evidence: CalibrationEvaluationEvidence(
          resourceBudget: resourceBudgetEvidence(for: directory)))
      #expect(report.gates.resourceBudget == .notRun, Comment(rawValue: name))
      switch name {
      case "absent":
        #expect(report.overall.performance.meanWallClockMilliseconds == nil)
        #expect(report.overall.performance.meanCPUMilliseconds == nil)
        #expect(report.overall.performance.maximumPeakResidentMegabytes == nil)
        #expect(report.overall.performance.totalBytesScanned == nil)
        #expect(report.overall.performance.totalComparedCandidateCount == nil)
      case "wall-clock", "nonfinite":
        #expect(report.overall.performance.meanWallClockMilliseconds == nil)
      case "cpu", "negative":
        #expect(report.overall.performance.meanCPUMilliseconds == nil)
      case "peak-rss":
        #expect(report.overall.performance.maximumPeakResidentMegabytes == nil)
      case "bytes", "negative-bytes":
        #expect(report.overall.performance.totalBytesScanned == nil)
      case "candidate-count", "negative-candidate-count":
        #expect(report.overall.performance.totalComparedCandidateCount == nil)
      default:
        Issue.record("Unhandled tuple test case \(name)")
      }
    }

    let zero = observation(
      id: "zero",
      kind: .sessionContainmentSuggestion,
      disposition: .suggested,
      predictedLabel: .sameSong,
      score: 1,
      evidence: [.exact],
      partition: heldOut,
      performance: CalibrationObservationPerformance(
        wallClockMilliseconds: 0,
        cpuMilliseconds: 0,
        peakResidentMegabytes: 0,
        bytesScanned: 0,
        comparedCandidateCount: 0))
    let zeroDirectory = CalibrationReviewDirectory(decisions: [
      decision(id: "zero-decision", label: .sameSong, observation: zero, at: 10)
    ])
    let zeroReport = try CalibrationEvaluationReportGenerator().generate(
      directory: zeroDirectory,
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: CalibrationEvaluationEvidence(
        resourceBudget: resourceBudgetEvidence(for: zeroDirectory)))
    #expect(zeroReport.gates.resourceBudget == .accepted)
    #expect(zeroReport.overall.performance.meanWallClockMilliseconds == 0)
    #expect(zeroReport.overall.performance.meanCPUMilliseconds == 0)
    #expect(zeroReport.overall.performance.maximumPeakResidentMegabytes == 0)
    #expect(zeroReport.overall.performance.totalBytesScanned == 0)
    #expect(zeroReport.overall.performance.totalComparedCandidateCount == 0)
  }

  @Test("Resource review must bind the complete evaluated corpus")
  func resourceReviewBindsEvaluatedCorpus() throws {
    let heldOut = partition(kind: .realLabelled, split: .heldOut, artist: "a", song: "b")
    func measured(_ id: String) -> CalibrationObservationSnapshot {
      observation(
        id: id,
        kind: .sessionContainmentSuggestion,
        disposition: .suggested,
        predictedLabel: .sameSong,
        score: 1,
        evidence: [.exact],
        partition: heldOut,
        performance: CalibrationObservationPerformance(
          wallClockMilliseconds: 10,
          cpuMilliseconds: 8,
          peakResidentMegabytes: 20,
          bytesScanned: 100,
          comparedCandidateCount: 2))
    }
    let first = measured("first")
    let firstOnly = CalibrationReviewDirectory(decisions: [
      decision(id: "first-decision", label: .sameSong, observation: first, at: 10)
    ])
    let complete = CalibrationReviewDirectory(decisions: [
      decision(id: "first-decision", label: .sameSong, observation: first, at: 10),
      decision(id: "second-decision", label: .sameSong, observation: measured("second"), at: 11),
    ])

    let staleEvidence = resourceBudgetEvidence(for: firstOnly)
    let stale = try CalibrationEvaluationReportGenerator().generate(
      directory: complete,
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: CalibrationEvaluationEvidence(resourceBudget: staleEvidence))
    #expect(stale.gates.resourceBudget == .notRun)

    let wrongDigest = resourceBudgetEvidence(
      for: complete,
      evaluatedCorpusDigest: String(repeating: "f", count: 64))
    let mismatched = try CalibrationEvaluationReportGenerator().generate(
      directory: complete,
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: CalibrationEvaluationEvidence(resourceBudget: wrongDigest))
    #expect(mismatched.gates.resourceBudget == .notRun)

    let accepted = try CalibrationEvaluationReportGenerator().generate(
      directory: complete,
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: CalibrationEvaluationEvidence(
        resourceBudget: resourceBudgetEvidence(for: complete)))
    #expect(accepted.gates.resourceBudget == .accepted)
  }

  @Test("Report JSON and Markdown are deterministic and private")
  func deterministicLocalFiles() async throws {
    let root = privateTemporaryDirectory.appending(
      path: "CalibrationReportTests-\(UUID().uuidString)",
      directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: root.path)
    let trusted = try await trustedReport(in: root)
    let report = trusted.report
    let jsonURL = root.appending(path: "report-a.json")
    let markdownURL = root.appending(path: "report-a.md")
    try await trusted.service.write(
      report,
      jsonURL: jsonURL,
      markdownURL: markdownURL)
    let firstJSON = try Data(contentsOf: jsonURL)
    let firstMarkdown = try Data(contentsOf: markdownURL)
    let secondJSONURL = root.appending(path: "report-b.json")
    let secondMarkdownURL = root.appending(path: "report-b.md")
    try await trusted.service.write(
      report,
      jsonURL: secondJSONURL,
      markdownURL: secondMarkdownURL)
    #expect(try Data(contentsOf: secondJSONURL) == firstJSON)
    #expect(try Data(contentsOf: secondMarkdownURL) == firstMarkdown)
    let jsonMode = try #require(
      FileManager.default.attributesOfItem(atPath: jsonURL.path)[.posixPermissions] as? NSNumber)
    let markdownMode = try #require(
      FileManager.default.attributesOfItem(atPath: markdownURL.path)[.posixPermissions] as? NSNumber
    )
    #expect(jsonMode.intValue & 0o777 == 0o600)
    #expect(markdownMode.intValue & 0o777 == 0o600)
    let directoryMode = try #require(
      FileManager.default.attributesOfItem(atPath: root.path)[.posixPermissions] as? NSNumber)
    #expect(directoryMode.intValue & 0o777 == 0o755)
  }

  @Test("Report delivery rejects overwrite, aliases, and symlinks")
  func exclusiveReportDelivery() async throws {
    let root = privateTemporaryDirectory.appending(
      path: "CalibrationExclusiveReportTests-\(UUID().uuidString)",
      directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let trusted = try await trustedReport(in: root)
    let report = trusted.report
    let existing = root.appending(path: "existing.json")
    try Data("sentinel".utf8).write(to: existing)
    await #expect(throws: CalibrationLocalReportError.destinationExists(existing.path)) {
      try await trusted.service.write(report, jsonURL: existing, markdownURL: nil)
    }
    #expect(try String(contentsOf: existing, encoding: .utf8) == "sentinel")

    let same = root.appending(path: "same-output")
    await #expect(throws: CalibrationLocalReportError.aliasedDestinations) {
      try await trusted.service.write(report, jsonURL: same, markdownURL: same)
    }

    let target = root.appending(path: "target")
    try Data("target".utf8).write(to: target)
    let symlink = root.appending(path: "symlink.json")
    try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: target)
    await #expect(throws: CalibrationLocalReportError.symlinkPath(symlink.path)) {
      try await trusted.service.write(report, jsonURL: symlink, markdownURL: nil)
    }

    let realParent = root.appending(path: "real-parent", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: realParent, withIntermediateDirectories: false)
    let linkedParent = root.appending(path: "linked-parent", directoryHint: .isDirectory)
    try FileManager.default.createSymbolicLink(at: linkedParent, withDestinationURL: realParent)
    let linkedDestination = linkedParent.appending(path: "report.json")
    await #expect(throws: CalibrationLocalReportError.symlinkPath(linkedParent.path)) {
      try await trusted.service.write(
        report, jsonURL: linkedDestination, markdownURL: nil)
    }

    let unsafePartition = CalibrationCorpusPartition(
      corpusKind: .realLabelled,
      split: .heldOut,
      artistGroupDigest: "/Users/private/artist",
      songGroupDigest: String(repeating: "a", count: 64))
    let unsafeReport = CalibrationEvaluationReport(
      generatedAt: report.generatedAt,
      partitionIsolation: report.partitionIsolation,
      gates: report.gates,
      overall: report.overall,
      familyReports: report.familyReports,
      evidenceFamilyReports: report.evidenceFamilyReports,
      partitionReports: [
        CalibrationPartitionEvaluationReport(
          partition: unsafePartition,
          summary: report.overall)
      ])
    let rendered = CalibrationEvaluationReportRenderer.markdown(unsafeReport)
    #expect(rendered.contains("[redacted]"))
    #expect(!rendered.contains("/Users/private"))
    await #expect(throws: CalibrationLocalReportError.nonAuthoritativeReport) {
      try await trusted.service.write(
        unsafeReport,
        jsonURL: root.appending(path: "unsafe.json"),
        markdownURL: nil)
    }
  }

  @Test("Concurrent report publishers expose one complete never-overwritten final file")
  func concurrentReportPublishers() async throws {
    let root = privateTemporaryDirectory.appending(
      path: "CalibrationConcurrentReportTests-\(UUID().uuidString)",
      directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let trusted = try await trustedReport(in: root)
    let report = trusted.report
    let destination = root.appending(path: "report.json")

    let outcomes = await withTaskGroup(of: Bool.self, returning: [Bool].self) { group in
      for _ in 0..<8 {
        group.addTask {
          do {
            try await trusted.service.write(
              report, jsonURL: destination, markdownURL: nil)
            return true
          } catch {
            return false
          }
        }
      }
      var values: [Bool] = []
      for await value in group { values.append(value) }
      return values
    }

    #expect(outcomes.filter { $0 }.count == 1)
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let decoded = try decoder.decode(
      CalibrationEvaluationReport.self,
      from: Data(contentsOf: destination))
    #expect(decoded == report)
    #expect(try temporaryPublicationNames(in: root).isEmpty)
  }

  @Test("Only fresh store-bound reports survive decoding and mutation checks")
  func reportIntegrityRejectsForgedAndLegacyValues() async throws {
    let root = privateTemporaryDirectory.appending(
      path: "CalibrationReportIntegrityTests-\(UUID().uuidString)",
      directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let trusted = try await trustedReport(in: root)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .iso8601
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601

    let roundTripped = try decoder.decode(
      CalibrationEvaluationReport.self,
      from: encoder.encode(trusted.report))
    try await trusted.service.write(
      roundTripped,
      jsonURL: root.appending(path: "round-trip.json"),
      markdownURL: nil)

    let direct = try CalibrationEvaluationReportGenerator().generate(
      directory: CalibrationReviewDirectory(),
      generatedAt: trusted.report.generatedAt)
    await #expect(throws: CalibrationLocalReportError.nonAuthoritativeReport) {
      try await trusted.service.write(
        direct,
        jsonURL: root.appending(path: "direct.json"),
        markdownURL: nil)
    }

    var legacyObject = try #require(
      JSONSerialization.jsonObject(with: encoder.encode(trusted.report)) as? [String: Any])
    legacyObject["schemaVersion"] = 2
    legacyObject.removeValue(forKey: "sourceBinding")
    legacyObject.removeValue(forKey: "integrityDigest")
    let legacy = try decoder.decode(
      CalibrationEvaluationReport.self,
      from: JSONSerialization.data(withJSONObject: legacyObject, options: [.sortedKeys]))
    await #expect(throws: CalibrationLocalReportError.nonAuthoritativeReport) {
      try await trusted.service.write(
        legacy,
        jsonURL: root.appending(path: "legacy.json"),
        markdownURL: nil)
    }

    var metricObject = try #require(
      JSONSerialization.jsonObject(with: encoder.encode(trusted.report)) as? [String: Any])
    var overall = try #require(metricObject["overall"] as? [String: Any])
    var performance = try #require(overall["performance"] as? [String: Any])
    performance["maximumPeakResidentMegabytes"] = 0
    overall["performance"] = performance
    metricObject["overall"] = overall
    let understatedData = try JSONSerialization.data(
      withJSONObject: metricObject,
      options: [.sortedKeys])
    #expect(throws: DecodingError.self) {
      _ = try decoder.decode(CalibrationEvaluationReport.self, from: understatedData)
    }

    var gateObject = try #require(
      JSONSerialization.jsonObject(with: encoder.encode(trusted.report)) as? [String: Any])
    var gates = try #require(gateObject["gates"] as? [String: Any])
    gates["resourceBudget"] = CalibrationEvaluationGateStatus.accepted.rawValue
    gateObject["gates"] = gates
    let forgedGateData = try JSONSerialization.data(
      withJSONObject: gateObject,
      options: [.sortedKeys])
    #expect(throws: DecodingError.self) {
      _ = try decoder.decode(CalibrationEvaluationReport.self, from: forgedGateData)
    }
  }

  @Test("A cross-instance review mutation invalidates a stale report")
  func crossInstanceSnapshotMutationInvalidatesReport() async throws {
    let root = privateTemporaryDirectory.appending(
      path: "CalibrationReportSnapshotTests-\(UUID().uuidString)",
      directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let trusted = try await trustedReport(in: root)
    let otherStore = CalibrationReviewStore(
      storageURL: root.appending(path: "calibration-review.plist"))
    let observed = observation(
      id: "snapshot-mutation",
      kind: .sessionContainmentSuggestion,
      disposition: .suggested,
      predictedLabel: .sameSong,
      score: 1,
      evidence: [.exact],
      partition: partition(
        kind: .synthetic,
        split: .heldOut,
        artist: "a",
        song: "b"))
    _ = try await CalibrationReviewRecordingService(store: otherStore).record(
      CalibrationTypedReviewRequest(
        decisionID: "snapshot-mutation-decision",
        action: .workContainment(.sameSong),
        observation: observed,
        decidedAt: Date(timeIntervalSince1970: 20)))

    await #expect(throws: CalibrationLocalReportError.staleReportSnapshot) {
      try await trusted.service.write(
        trusted.report,
        jsonURL: root.appending(path: "stale.json"),
        markdownURL: nil)
    }
    let refreshed = try await trusted.service.generate(
      store: trusted.store,
      generatedAt: Date(timeIntervalSince1970: 100),
      evidence: .localPrototype)
    try await trusted.service.write(
      refreshed,
      jsonURL: root.appending(path: "fresh.json"),
      markdownURL: nil)
    #expect(refreshed.sourceBinding?.storeGeneration == 2)
    #expect(refreshed.activationAuthority == .none)
  }

  @Test("Final report path stays absent until atomic installation")
  func finalPathIsNeverPartiallyVisible() async throws {
    let root = privateTemporaryDirectory.appending(
      path: "CalibrationVisibilityReportTests-\(UUID().uuidString)",
      directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let trusted = try await trustedReport(in: root)
    let report = trusted.report
    let destination = root.appending(path: "report.json")
    let allowInstall = DispatchSemaphore(value: 0)
    let service = CalibrationLocalReportService(
      store: trusted.store,
      testingBeforeInstall: {
        allowInstall.wait()
      })
    let publication = Task.detached {
      try await service.write(report, jsonURL: destination, markdownURL: nil)
    }

    for _ in 0..<500 {
      if try temporaryPublicationNames(in: root).count == 1 { break }
      try await Task.sleep(for: .milliseconds(10))
    }
    #expect(!FileManager.default.fileExists(atPath: destination.path))
    let temporaryNames = try temporaryPublicationNames(in: root)
    #expect(temporaryNames.count == 1)
    let temporaryName = try #require(temporaryNames.first)
    let temporaryAttributes = try FileManager.default.attributesOfItem(
      atPath: root.appending(path: temporaryName).path)
    #expect(temporaryAttributes[.type] as? FileAttributeType == .typeRegular)
    #expect((temporaryAttributes[.posixPermissions] as? NSNumber)?.intValue == 0o600)
    allowInstall.signal()
    try await publication.value
    #expect(FileManager.default.fileExists(atPath: destination.path))
    #expect(try temporaryPublicationNames(in: root).isEmpty)
  }

  @Test("A destination race preserves the competing file and cleans the private temporary")
  func destinationRaceCleansTemporary() async throws {
    let root = privateTemporaryDirectory.appending(
      path: "CalibrationRaceReportTests-\(UUID().uuidString)",
      directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let trusted = try await trustedReport(in: root)
    let report = trusted.report
    let destination = root.appending(path: "report.json")
    let service = CalibrationLocalReportService(
      store: trusted.store,
      testingBeforeInstall: {
        try? Data("competing-writer".utf8).write(to: destination, options: .withoutOverwriting)
      })

    await #expect(throws: CalibrationLocalReportError.destinationExists(destination.path)) {
      try await service.write(report, jsonURL: destination, markdownURL: nil)
    }
    #expect(try String(contentsOf: destination, encoding: .utf8) == "competing-writer")
    #expect(try temporaryPublicationNames(in: root).isEmpty)
  }

  @Test("studio-index writes a real local calibration report")
  func studioIndexReportEntryPoint() async throws {
    let root = privateTemporaryDirectory.appending(
      path: "CalibrationReportCLITests-\(UUID().uuidString)",
      directoryHint: .isDirectory)
    defer { try? FileManager.default.removeItem(at: root) }
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    let executable = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
      .appending(path: ".build/debug/studio-index")
    let storeURL = root.appending(path: "calibration-review.plist")
    let jsonURL = root.appending(path: "report.json")
    let markdownURL = root.appending(path: "report.md")
    let process = Process()
    process.executableURL = executable
    process.arguments = [
      "calibration-report",
      "--store", storeURL.path,
      "--json", jsonURL.path,
      "--markdown", markdownURL.path,
      "--generated-at", "2026-08-14T10:00:00Z",
    ]
    process.standardOutput = Pipe()
    process.standardError = Pipe()
    try process.run()
    process.waitUntilExit()

    #expect(process.terminationStatus == 0)
    #expect(FileManager.default.fileExists(atPath: jsonURL.path))
    #expect(FileManager.default.fileExists(atPath: markdownURL.path))
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    let report = try decoder.decode(
      CalibrationEvaluationReport.self,
      from: Data(contentsOf: jsonURL))
    #expect(report.schemaVersion == CalibrationEvaluationReport.currentSchemaVersion)
    #expect(report.activationAuthority == .none)
    let markdown = try String(contentsOf: markdownURL, encoding: .utf8)
    #expect(markdown.contains("never activate production ML"))

    let overwrite = Process()
    overwrite.executableURL = executable
    overwrite.arguments = process.arguments
    overwrite.standardOutput = Pipe()
    overwrite.standardError = Pipe()
    try overwrite.run()
    overwrite.waitUntilExit()
    #expect(overwrite.terminationStatus != 0)

    let symlinkJSON = root.appending(path: "symlink-report.json")
    try FileManager.default.createSymbolicLink(at: symlinkJSON, withDestinationURL: jsonURL)
    let symlinkProcess = Process()
    symlinkProcess.executableURL = executable
    symlinkProcess.arguments = [
      "calibration-report", "--store", storeURL.path,
      "--json", symlinkJSON.path,
      "--generated-at", "2026-08-14T10:00:00Z",
    ]
    symlinkProcess.standardOutput = Pipe()
    symlinkProcess.standardError = Pipe()
    try symlinkProcess.run()
    symlinkProcess.waitUntilExit()
    #expect(symlinkProcess.terminationStatus != 0)
  }

  private func reviewedEvidence(id: String) -> CalibrationReviewedEvidenceReference {
    CalibrationReviewedEvidenceReference(
      id: id,
      digest: String(repeating: "a", count: 64),
      reviewedAt: Date(timeIntervalSince1970: 50),
      reviewAuthority: "local-review-board")
  }

  private func trustedReport(
    in directory: URL,
    generatedAt: Date = Date(timeIntervalSince1970: 100)
  ) async throws -> (
    store: CalibrationReviewStore,
    service: CalibrationLocalReportService,
    report: CalibrationEvaluationReport
  ) {
    let store = CalibrationReviewStore(
      storageURL: directory.appending(path: "calibration-review.plist"))
    let service = CalibrationLocalReportService(store: store)
    let report = try await service.generate(
      store: store,
      generatedAt: generatedAt,
      evidence: .localPrototype)
    return (store, service, report)
  }

  private func resourceBudgetEvidence(
    for directory: CalibrationReviewDirectory,
    reviewID: String = "resource-review",
    evaluatedCorpusDigest: String? = nil,
    maximumMeanWallClockMilliseconds: Double = 20
  ) -> CalibrationResourceBudgetReviewEvidence {
    CalibrationResourceBudgetReviewEvidence(
      review: reviewedEvidence(id: reviewID),
      evaluatedCorpusDigest: evaluatedCorpusDigest
        ?? CalibrationEvaluationReportGenerator.resourceEvaluationCorpusDigest(for: directory),
      evaluatedObservationCount: directory.decisions.compactMap(\.primaryObservation).count,
      maximumMeanWallClockMilliseconds: maximumMeanWallClockMilliseconds,
      maximumMeanCPUMilliseconds: 20,
      maximumPeakResidentMegabytes: 30,
      maximumTotalBytesScanned: 1_000,
      maximumComparedCandidateCount: 10)
  }

  private var privateTemporaryDirectory: URL {
    let temporary = FileManager.default.temporaryDirectory.path
    return URL(fileURLWithPath: temporary.hasPrefix("/var/") ? "/private\(temporary)" : temporary)
  }

  private func temporaryPublicationNames(in directory: URL) throws -> [String] {
    try FileManager.default.contentsOfDirectory(atPath: directory.path).filter {
      $0.hasPrefix(".studio-time-machine-report-")
    }
  }

  private func labelledCorpusEvidence() -> CalibrationLabelledCorpusGateEvidence {
    CalibrationLabelledCorpusGateEvidence(
      review: reviewedEvidence(id: "labelled-corpus-review"),
      reviewedEvaluationReportDigest: String(repeating: "b", count: 64),
      minimumReviewedPerSplit: CalibrationLabelledCorpusGateEvidence
        .minimumAcceptedReviewedPerSplit,
      minimumPrecision: 0.95,
      minimumRecall: 0.9,
      maximumBrierScore: 0.05,
      maximumFalseAutomaticDecisionCount: 0)
  }

  private func decision(
    id: String,
    label: CalibrationDecisionLabel,
    observation: CalibrationObservationSnapshot,
    at: TimeInterval
  ) -> CalibrationReviewDecisionRecord {
    CalibrationReviewDecisionRecord(
      id: id,
      label: label,
      primaryObservationID: observation.id,
      observations: [observation],
      algorithmFamily: observation.algorithmFamily,
      algorithmVersion: observation.algorithmVersion,
      calibrationID: observation.calibrationID,
      reproductionFeatures: [
        CalibrationFeature(name: "reviewAuthority", value: "local-user")
      ],
      decidedAt: Date(timeIntervalSince1970: at),
      corpusPartition: observation.corpusPartition,
      notes: nil,
      supersedesDecisionID: nil)
  }

  private func observation(
    id: String,
    kind: CalibrationObservationKind,
    disposition: CalibrationPredictionDisposition,
    predictedLabel: CalibrationDecisionLabel?,
    score: Double?,
    evidence: [CalibrationEvidenceFamily],
    unavailable: [CalibrationEvidenceFamily] = [],
    partition: CalibrationCorpusPartition,
    performance: CalibrationObservationPerformance? = nil
  ) -> CalibrationObservationSnapshot {
    CalibrationObservationSnapshot(
      id: id,
      kind: kind,
      taskFamily: kind.taskFamily,
      algorithmFamily: "fixture-algorithm",
      algorithmVersion: "fixture-v1",
      predictionDisposition: disposition,
      predictedLabel: predictedLabel,
      score: score,
      binding: binding(for: kind, id: id),
      provenanceKeys: ["sha256:\(String(repeating: "e", count: 64))"],
      evidenceFamilies: evidence,
      unavailableEvidenceFamilies: unavailable,
      features: [
        CalibrationFeature(name: "fixture", value: "deterministic")
      ],
      corpusPartition: partition,
      performance: performance,
      observedAt: Date(timeIntervalSince1970: 5))
  }

  private func binding(
    for kind: CalibrationObservationKind,
    id: String
  ) -> CalibrationObservationBinding {
    let source = CalibrationImmutableEntityReference(
      identifier: "\(id)-source",
      observationDigest: String(repeating: "1", count: 64))
    let target = CalibrationImmutableEntityReference(
      identifier: "\(id)-target",
      observationDigest: String(repeating: "2", count: 64))
    switch kind {
    case .sessionContainmentSuggestion, .sessionContainmentAutomaticAssignment,
      .sessionRelationshipObservation:
      return .session(CalibrationSessionObservationBinding(source: source, candidate: target))
    case .exportArtifactAssociation:
      return .export(
        CalibrationExportObservationBinding(
          artifact: source,
          revisionIdentifier: "\(id)-revision"))
    case .audioMatchObservation:
      return .audio(
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
    case .acceptedRelationshipObservation:
      return .acceptedRelationship(
        CalibrationAcceptedRelationshipBinding(
          source: source,
          target: target,
          relationshipKind: .artist))
    }
  }

  private func partition(
    kind: CalibrationCorpusKind,
    split: CalibrationCorpusSplit,
    artist: Character,
    song: Character
  ) -> CalibrationCorpusPartition {
    CalibrationCorpusPartition(
      corpusKind: kind,
      split: split,
      artistGroupDigest: String(repeating: artist, count: 64),
      songGroupDigest: String(repeating: song, count: 64))
  }
}
