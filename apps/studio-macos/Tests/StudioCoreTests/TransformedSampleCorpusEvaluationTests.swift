import Foundation
import Testing

@testable import StudioCore

@Suite("Transformed-sample labelled corpus evaluation")
struct TransformedSampleCorpusEvaluationTests {
  @Test("Synthetic manifest covers all transform families and remains non-activating")
  func syntheticCorpusIsResearchOnly() throws {
    let manifest = syntheticManifest()
    let evaluations = manifest.entries.map { entry in
      TransformedSampleResearchTestSupport.evaluation(
        entryID: entry.id,
        family: entry.expectedTransformFamilies.first)
    }
    let evaluator = TransformedSampleCorpusEvaluator()
    let binding = try evaluator.artifactBinding(manifest: manifest, evaluations: evaluations)
    let report = try evaluator.evaluate(
      manifest: manifest,
      evaluations: evaluations,
      evidence: TransformedSampleEvaluationGateEvidence(
        labelledCorpus: TransformedSampleLabelledCorpusGateEvidence(
          artifactBinding: binding,
          minimumHeldOutExamplesPerTransform: 1,
          minimumHeldOutNegativeCount: 1,
          minimumPrecision: 0.8,
          minimumRecall: 0.8,
          maximumBrierScore: 0.2)))

    #expect(report.transformReports.count == 16)
    #expect(report.transformReports.allSatisfy { $0.reviewedCount == 1 })
    #expect(report.transformReports.allSatisfy { $0.precision == 1 })
    #expect(report.transformReports.allSatisfy { $0.recall == 1 })
    #expect(
      report.transformReports.allSatisfy {
        abs(($0.brierScore ?? .infinity) - 0.01) < 0.000_001
      })
    #expect(report.gates.labelledRealProducerCorpus == .ineligible)
    #expect(report.gates.rightsAndModelReview == .notRun)
    #expect(report.gates.resourceBudgetReview == .notRun)
    #expect(report.gates.falsePositiveBudgetReview == .notRun)
    #expect(report.activationAvailability == .unavailableResearchOnly)
    #expect(report.partitionIsolation == .passed)
    #expect(report.syntheticEntryCount == 16)
    #expect(report.realProducerEntryCount == 0)
  }

  @Test("Unknown transformed-use ground truth is rejected before metrics or gates")
  func rejectsUnknownPositiveGroundTruth() throws {
    let invalid = TransformedSampleResearchTestSupport.corpusEntry(
      id: "unknown-positive",
      split: .heldOut,
      family: .pitch,
      origin: .realProducerLabel,
      classification: .unknown)
    let manifest = TransformedSampleCorpusManifest(
      corpusID: "unknown-positive",
      entries: [invalid])
    let evaluations = [
      TransformedSampleResearchTestSupport.evaluation(
        entryID: invalid.id,
        family: .pitch)
    ]
    let evaluator = TransformedSampleCorpusEvaluator()

    #expect(throws: TransformedSampleCorpusError.invalidEntry(invalid.id)) {
      try manifest.validated()
    }
    #expect(throws: TransformedSampleCorpusError.invalidEntry(invalid.id)) {
      try evaluator.artifactBinding(manifest: manifest, evaluations: evaluations)
    }
    #expect(throws: TransformedSampleCorpusError.invalidEntry(invalid.id)) {
      try evaluator.evaluate(manifest: manifest, evaluations: evaluations)
    }

    let explicitNegative = TransformedSampleResearchTestSupport.corpusEntry(
      id: "explicit-negative",
      split: .heldOut,
      family: nil,
      origin: .realProducerLabel,
      relationship: .unrelated)
    let validatedNegative = try TransformedSampleCorpusManifest(
      corpusID: "explicit-negative",
      entries: [explicitNegative]
    ).validated()
    #expect(validatedNegative.entries[0].expectedClassification == nil)
    #expect(validatedNegative.entries[0].expectedRelationship == .unrelated)
  }

  @Test("Metrics require both transform family and classified relationship agreement")
  func classificationAwareMetrics() throws {
    let classifications: [TransformedSampleRelationshipClassification] = [
      .directReuse,
      .possibleInterpolation,
      .possibleReperformance,
    ]
    let validEntries = classifications.enumerated().map { index, classification in
      TransformedSampleResearchTestSupport.corpusEntry(
        id: "valid-\(index)",
        split: .heldOut,
        family: .pitch,
        classification: classification)
    }
    let validEvaluations = zip(validEntries, classifications).map { entry, classification in
      TransformedSampleResearchTestSupport.evaluation(
        entryID: entry.id,
        family: .pitch,
        classification: classification)
    }
    let evaluator = TransformedSampleCorpusEvaluator()
    let validReport = try evaluator.evaluate(
      manifest: TransformedSampleCorpusManifest(
        corpusID: "three-classes",
        entries: validEntries),
      evaluations: validEvaluations)
    let validPitch = try #require(
      validReport.transformReports.first(where: { $0.family == .pitch }))
    #expect(validPitch.truePositiveCount == 3)
    #expect(validPitch.falsePositiveCount == 0)
    #expect(validPitch.falseNegativeCount == 0)
    #expect(validPitch.coverage == 1)

    let mismatch = TransformedSampleResearchTestSupport.corpusEntry(
      id: "classification-mismatch",
      split: .heldOut,
      family: .pitch,
      classification: .possibleInterpolation)
    let mismatchReport = try evaluator.evaluate(
      manifest: TransformedSampleCorpusManifest(
        corpusID: "classification-mismatch",
        entries: [mismatch]),
      evaluations: [
        TransformedSampleResearchTestSupport.evaluation(
          entryID: mismatch.id,
          family: .pitch,
          classification: .directReuse)
      ])
    let mismatchPitch = try #require(
      mismatchReport.transformReports.first(where: { $0.family == .pitch }))
    #expect(mismatchPitch.truePositiveCount == 0)
    #expect(mismatchPitch.falsePositiveCount == 1)
    #expect(mismatchPitch.falseNegativeCount == 1)
    #expect(mismatchPitch.brierScore == 1)

    let abstained = TransformedSampleResearchTestSupport.corpusEntry(
      id: "classified-abstention",
      split: .heldOut,
      family: .pitch)
    let abstainedReport = try evaluator.evaluate(
      manifest: TransformedSampleCorpusManifest(
        corpusID: "classified-abstention",
        entries: [abstained]),
      evaluations: [
        TransformedSampleResearchTestSupport.evaluation(
          entryID: abstained.id,
          family: nil,
          abstentionReason: .relationshipIndeterminate)
      ])
    let abstainedPitch = try #require(
      abstainedReport.transformReports.first(where: { $0.family == .pitch }))
    #expect(abstainedPitch.truePositiveCount == 0)
    #expect(abstainedPitch.falsePositiveCount == 0)
    #expect(abstainedPitch.falseNegativeCount == 1)
    #expect(abstainedPitch.coverage == 0)
    #expect(abstainedPitch.abstentionRate == 1)

    let negative = TransformedSampleResearchTestSupport.corpusEntry(
      id: "heldout-negative",
      split: .heldOut,
      family: nil,
      origin: .realProducerLabel,
      relationship: .unrelated)
    let negativeReport = try evaluator.evaluate(
      manifest: TransformedSampleCorpusManifest(
        corpusID: "heldout-negative",
        entries: [negative]),
      evaluations: [
        TransformedSampleResearchTestSupport.evaluation(
          entryID: negative.id,
          family: .pitch,
          classification: .directReuse)
      ])
    let negativePitch = try #require(
      negativeReport.transformReports.first(where: { $0.family == .pitch }))
    #expect(negativePitch.truePositiveCount == 0)
    #expect(negativePitch.falsePositiveCount == 1)
    #expect(negativePitch.falseNegativeCount == 0)
  }

  @Test("Real held-out evaluation can satisfy research review gates but cannot activate")
  func evidenceBoundResearchGates() throws {
    var entries = TransformedSampleTransformFamily.allCases.enumerated().map { index, family in
      TransformedSampleResearchTestSupport.corpusEntry(
        id: "heldout-\(index)",
        split: .heldOut,
        family: family,
        origin: .realProducerLabel)
    }
    entries.append(
      TransformedSampleResearchTestSupport.corpusEntry(
        id: "heldout-negative",
        split: .heldOut,
        family: nil,
        origin: .realProducerLabel,
        relationship: .independentReperformance))
    entries.append(
      TransformedSampleResearchTestSupport.corpusEntry(
        id: "training",
        split: .training,
        family: .pitch,
        origin: .realProducerLabel))
    entries.append(
      TransformedSampleResearchTestSupport.corpusEntry(
        id: "validation",
        split: .validation,
        family: .pitch,
        origin: .realProducerLabel))
    let manifest = TransformedSampleCorpusManifest(corpusID: "real-producer-v1", entries: entries)
    let evaluations = entries.map { entry in
      TransformedSampleResearchTestSupport.evaluation(
        entryID: entry.id,
        family: entry.expectedTransformFamilies.first)
    }
    let evaluator = TransformedSampleCorpusEvaluator()
    let binding = try evaluator.artifactBinding(manifest: manifest, evaluations: evaluations)
    let evidence = TransformedSampleEvaluationGateEvidence(
      labelledCorpus: TransformedSampleLabelledCorpusGateEvidence(
        artifactBinding: binding,
        minimumHeldOutExamplesPerTransform: 1,
        minimumHeldOutNegativeCount: 1,
        minimumPrecision: 0.8,
        minimumRecall: 0.8,
        maximumBrierScore: 0.2),
      rightsAndModel: TransformedSampleRightsModelGateEvidence(
        artifactBinding: binding,
        reviewID: "rights-model-review",
        corpusRightsAccepted: true,
        modelRightsAccepted: true),
      resourceBudget: TransformedSampleResourceGateEvidence(
        artifactBinding: binding,
        evaluatedEntryCount: evaluations.count,
        maximumMeanWallClockMilliseconds: 20,
        maximumMeanCPUMilliseconds: 20,
        maximumPeakResidentMegabytes: 30,
        maximumTotalBytesScanned: Int64(evaluations.count * 5_000),
        maximumTotalDecodedFrameCount: Int64(evaluations.count * 50_000)),
      falsePositiveBudget: TransformedSampleFalsePositiveGateEvidence(
        artifactBinding: binding,
        reviewedEvaluationCount: evaluations.count,
        minimumReviewedNegativeCount: 1,
        maximumFalsePositiveCount: 0,
        reviewID: "false-positive-review"))
    let report = try evaluator.evaluate(
      manifest: manifest,
      evaluations: evaluations,
      evidence: evidence)

    #expect(report.gates.labelledRealProducerCorpus == .acceptedForResearchReview)
    #expect(report.gates.rightsAndModelReview == .acceptedForResearchReview)
    #expect(report.gates.resourceBudgetReview == .acceptedForResearchReview)
    #expect(report.gates.falsePositiveBudgetReview == .acceptedForResearchReview)
    #expect(report.activationAvailability == .unavailableResearchOnly)
    #expect(report.gateEvidence == evidence)
    #expect(report.isWellFormedEvaluationArtifact)
    #expect(report.gateDecisionDigest.count == 64)
    #expect(report.reportArtifactID.hasPrefix("c8-report-v2-"))
    #expect(
      try JSONDecoder().decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: report.deterministicData()) == report)
  }

  @Test("Artist and Song split leakage are rejected independently")
  func rejectsPartitionLeakage() throws {
    let artist = "shared-artist"
    let song = "shared-song"
    let artistLeak = TransformedSampleCorpusManifest(
      corpusID: "artist-leak",
      entries: [
        TransformedSampleResearchTestSupport.corpusEntry(
          id: "a", split: .training, artist: artist),
        TransformedSampleResearchTestSupport.corpusEntry(
          id: "b", split: .heldOut, artist: artist),
      ])
    #expect(
      throws: TransformedSampleCorpusError.artistSplitLeakage(
        TransformedSampleResearchTestSupport.digest(artist))
    ) {
      try artistLeak.validated()
    }

    let songLeak = TransformedSampleCorpusManifest(
      corpusID: "song-leak",
      entries: [
        TransformedSampleResearchTestSupport.corpusEntry(
          id: "a", split: .training, song: song),
        TransformedSampleResearchTestSupport.corpusEntry(
          id: "b", split: .heldOut, song: song),
      ])
    #expect(
      throws: TransformedSampleCorpusError.songSplitLeakage(
        TransformedSampleResearchTestSupport.digest(song))
    ) {
      try songLeak.validated()
    }
  }

  @Test("Deterministic encoding ignores insertion order")
  func deterministicEncoding() throws {
    let first = syntheticManifest()
    let second = TransformedSampleCorpusManifest(
      corpusID: first.corpusID,
      entries: first.entries.reversed())
    #expect(try first.deterministicData() == second.deterministicData())

    let evaluations = first.entries.map { entry in
      TransformedSampleResearchTestSupport.evaluation(
        entryID: entry.id,
        family: entry.expectedTransformFamilies.first)
    }
    let evaluator = TransformedSampleCorpusEvaluator()
    let firstReport = try evaluator.evaluate(manifest: first, evaluations: evaluations)
    let secondReport = try evaluator.evaluate(
      manifest: second,
      evaluations: evaluations.reversed())
    #expect(try firstReport.deterministicData() == secondReport.deterministicData())
    #expect(firstReport.evaluationDigest == secondReport.evaluationDigest)
    #expect(firstReport.evaluationArtifactID == secondReport.evaluationArtifactID)
  }

  @Test("Evaluation and gate artifacts require the exact current algorithm binding")
  func evaluationArtifactsRejectUnsupportedVersions() throws {
    let entry = TransformedSampleResearchTestSupport.corpusEntry(
      id: "versioned-evaluation",
      split: .heldOut,
      family: .pitch)
    let manifest = TransformedSampleCorpusManifest(
      corpusID: "versioned-evaluation",
      entries: [entry])
    let current = TransformedSampleResearchTestSupport.evaluation(
      entryID: entry.id,
      family: .pitch)
    let evaluator = TransformedSampleCorpusEvaluator()
    let decoder = JSONDecoder()

    #expect(
      try decoder.decode(
        TransformedSampleCorpusEvaluation.self,
        from: JSONEncoder().encode(current)) == current)
    let currentBinding = try evaluator.artifactBinding(
      manifest: manifest,
      evaluations: [current])
    #expect(currentBinding.isWellFormed)
    #expect(
      try decoder.decode(
        TransformedSampleEvaluationArtifactBinding.self,
        from: JSONEncoder().encode(currentBinding)) == currentBinding)
    let currentReport = try evaluator.evaluate(
      manifest: manifest,
      evaluations: [current])
    #expect(currentReport.isWellFormedEvaluationArtifact)
    #expect(
      try decoder.decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: JSONEncoder().encode(currentReport)) == currentReport)

    for version in ["", "local-transformed-sample-research-v3", "unknown-algorithm"] {
      let stale = TransformedSampleResearchTestSupport.evaluation(
        entryID: entry.id,
        family: .pitch,
        algorithmVersion: version)
      #expect(throws: TransformedSampleCorpusError.invalidEvaluation(entry.id)) {
        try evaluator.deterministicEvaluationDigest(for: [stale])
      }
      #expect(throws: TransformedSampleCorpusError.invalidEvaluation(entry.id)) {
        try evaluator.evaluate(manifest: manifest, evaluations: [stale])
      }
      #expect(throws: (any Error).self) {
        try decoder.decode(
          TransformedSampleCorpusEvaluation.self,
          from: JSONEncoder().encode(stale))
      }

      let staleBinding = TransformedSampleEvaluationArtifactBinding(
        manifestDigest: currentBinding.manifestDigest,
        evaluationDigest: currentBinding.evaluationDigest,
        algorithmVersion: version,
        artifactID: currentBinding.artifactID)
      #expect(!staleBinding.isWellFormed)
      #expect(throws: (any Error).self) {
        try decoder.decode(
          TransformedSampleEvaluationArtifactBinding.self,
          from: JSONEncoder().encode(staleBinding))
      }
    }

    let staleReportData = try mutatedReportData(currentReport) { document in
      document["algorithmVersion"] = "local-transformed-sample-research-v3"
    }
    #expect(throws: (any Error).self) {
      try decoder.decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: staleReportData)
    }
  }

  @Test("Gate evidence deterministically derives and binds every persisted decision")
  func gateDecisionIntegrity() throws {
    let entry = TransformedSampleResearchTestSupport.corpusEntry(
      id: "gate-decision",
      split: .heldOut,
      family: .pitch)
    let manifest = TransformedSampleCorpusManifest(
      corpusID: "gate-decision",
      entries: [entry])
    let evaluation = TransformedSampleResearchTestSupport.evaluation(
      entryID: entry.id,
      family: .pitch)
    let evaluator = TransformedSampleCorpusEvaluator()
    let binding = try evaluator.artifactBinding(
      manifest: manifest,
      evaluations: [evaluation])
    let notRun = try evaluator.evaluate(
      manifest: manifest,
      evaluations: [evaluation])
    let decoder = JSONDecoder()

    let forgedAccepted = try mutatedReportData(notRun) { document in
      document["gates"] = [
        "labelledRealProducerCorpus": "acceptedForResearchReview",
        "rightsAndModelReview": "acceptedForResearchReview",
        "resourceBudgetReview": "acceptedForResearchReview",
        "falsePositiveBudgetReview": "acceptedForResearchReview",
      ]
    }
    #expect(throws: (any Error).self) {
      try decoder.decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: forgedAccepted)
    }

    let acceptedRightsEvidence = TransformedSampleEvaluationGateEvidence(
      rightsAndModel: TransformedSampleRightsModelGateEvidence(
        artifactBinding: binding,
        reviewID: "rights-review-a",
        corpusRightsAccepted: true,
        modelRightsAccepted: true))
    let acceptedRights = try evaluator.evaluate(
      manifest: manifest,
      evaluations: [evaluation],
      evidence: acceptedRightsEvidence)
    #expect(acceptedRights.gates.rightsAndModelReview == .acceptedForResearchReview)
    #expect(acceptedRights.activationAvailability == .unavailableResearchOnly)
    #expect(acceptedRights.isWellFormedEvaluationArtifact)
    #expect(acceptedRights.gateDecisionDigest.count == 64)
    #expect(acceptedRights.reportArtifactID.hasPrefix("c8-report-v2-"))
    #expect(acceptedRights.reportArtifactID.count <= 128)

    let changedReviewID = try evaluator.evaluate(
      manifest: manifest,
      evaluations: [evaluation],
      evidence: TransformedSampleEvaluationGateEvidence(
        rightsAndModel: TransformedSampleRightsModelGateEvidence(
          artifactBinding: binding,
          reviewID: "rights-review-b",
          corpusRightsAccepted: true,
          modelRightsAccepted: true)))
    #expect(changedReviewID.gates == acceptedRights.gates)
    #expect(changedReviewID.gateDecisionDigest != acceptedRights.gateDecisionDigest)
    #expect(changedReviewID.reportArtifactID != acceptedRights.reportArtifactID)

    let rejectedRights = try evaluator.evaluate(
      manifest: manifest,
      evaluations: [evaluation],
      evidence: TransformedSampleEvaluationGateEvidence(
        rightsAndModel: TransformedSampleRightsModelGateEvidence(
          artifactBinding: binding,
          reviewID: "rights-review-a",
          corpusRightsAccepted: false,
          modelRightsAccepted: true)))
    #expect(rejectedRights.gates.rightsAndModelReview == .ineligible)
    #expect(rejectedRights.gateDecisionDigest != acceptedRights.gateDecisionDigest)
    #expect(rejectedRights.reportArtifactID != acceptedRights.reportArtifactID)

    let mutatedReviewID = try mutatedReportData(acceptedRights) { document in
      var gateEvidence = document["gateEvidence"] as? [String: Any] ?? [:]
      var rights = gateEvidence["rightsAndModel"] as? [String: Any] ?? [:]
      rights["reviewID"] = "rights-review-b"
      gateEvidence["rightsAndModel"] = rights
      document["gateEvidence"] = gateEvidence
    }
    #expect(throws: (any Error).self) {
      try decoder.decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: mutatedReviewID)
    }
    let mutatedEvidence = try mutatedReportData(acceptedRights) { document in
      var gateEvidence = document["gateEvidence"] as? [String: Any] ?? [:]
      var rights = gateEvidence["rightsAndModel"] as? [String: Any] ?? [:]
      rights["corpusRightsAccepted"] = false
      gateEvidence["rightsAndModel"] = rights
      document["gateEvidence"] = gateEvidence
    }
    #expect(throws: (any Error).self) {
      try decoder.decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: mutatedEvidence)
    }
    let mutatedGate = try mutatedReportData(acceptedRights) { document in
      var gates = document["gates"] as? [String: Any] ?? [:]
      gates["rightsAndModelReview"] = "ineligible"
      document["gates"] = gates
    }
    #expect(throws: (any Error).self) {
      try decoder.decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: mutatedGate)
    }
    let mutatedReportID = try mutatedReportData(acceptedRights) { document in
      document["reportArtifactID"] = "c8-report-v2-forged"
    }
    #expect(throws: (any Error).self) {
      try decoder.decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: mutatedReportID)
    }
    let staleNestedBinding = try mutatedReportData(acceptedRights) { document in
      var gateEvidence = document["gateEvidence"] as? [String: Any] ?? [:]
      var rights = gateEvidence["rightsAndModel"] as? [String: Any] ?? [:]
      var nestedBinding = rights["artifactBinding"] as? [String: Any] ?? [:]
      nestedBinding["evaluationDigest"] = String(repeating: "0", count: 64)
      rights["artifactBinding"] = nestedBinding
      gateEvidence["rightsAndModel"] = rights
      document["gateEvidence"] = gateEvidence
    }
    #expect(throws: (any Error).self) {
      try decoder.decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: staleNestedBinding)
    }
    let overflowingCounts = try mutatedReportData(acceptedRights) { document in
      document["syntheticEntryCount"] = Int.max
      document["realProducerEntryCount"] = 1
    }
    #expect(throws: (any Error).self) {
      try decoder.decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: overflowingCounts)
    }

    for reviewID in ["", String(repeating: "a", count: 129)] {
      #expect(throws: TransformedSampleCorpusError.invalidGateEvidence("rightsAndModel")) {
        try evaluator.evaluate(
          manifest: manifest,
          evaluations: [evaluation],
          evidence: TransformedSampleEvaluationGateEvidence(
            rightsAndModel: TransformedSampleRightsModelGateEvidence(
              artifactBinding: binding,
              reviewID: reviewID,
              corpusRightsAccepted: true,
              modelRightsAccepted: true)))
      }
      #expect(throws: TransformedSampleCorpusError.invalidGateEvidence("falsePositiveBudget")) {
        try evaluator.evaluate(
          manifest: manifest,
          evaluations: [evaluation],
          evidence: TransformedSampleEvaluationGateEvidence(
            falsePositiveBudget: TransformedSampleFalsePositiveGateEvidence(
              artifactBinding: binding,
              reviewedEvaluationCount: 1,
              minimumReviewedNegativeCount: 1,
              maximumFalsePositiveCount: 0,
              reviewID: reviewID)))
      }
    }
    #expect(throws: TransformedSampleCorpusError.invalidGateEvidence("duplicateReviewID")) {
      try evaluator.evaluate(
        manifest: manifest,
        evaluations: [evaluation],
        evidence: TransformedSampleEvaluationGateEvidence(
          rightsAndModel: TransformedSampleRightsModelGateEvidence(
            artifactBinding: binding,
            reviewID: "duplicate-review",
            corpusRightsAccepted: true,
            modelRightsAccepted: true),
          falsePositiveBudget: TransformedSampleFalsePositiveGateEvidence(
            artifactBinding: binding,
            reviewedEvaluationCount: 1,
            minimumReviewedNegativeCount: 1,
            maximumFalsePositiveCount: 0,
            reviewID: "duplicate-review")))
    }
    #expect(throws: TransformedSampleCorpusError.invalidGateEvidence("resourceBudget")) {
      try evaluator.evaluate(
        manifest: manifest,
        evaluations: [evaluation],
        evidence: TransformedSampleEvaluationGateEvidence(
          resourceBudget: TransformedSampleResourceGateEvidence(
            artifactBinding: binding,
            evaluatedEntryCount: 0,
            maximumMeanWallClockMilliseconds: 1,
            maximumMeanCPUMilliseconds: 1,
            maximumPeakResidentMegabytes: 1,
            maximumTotalBytesScanned: 1,
            maximumTotalDecodedFrameCount: 1)))
    }

    let legacyV4 = try mutatedReportData(notRun) { document in
      document["schemaVersion"] = 1
      document.removeValue(forKey: "gateDecisionContext")
      document.removeValue(forKey: "gateDecisionDigest")
      document.removeValue(forKey: "reportArtifactID")
    }
    #expect(throws: (any Error).self) {
      try decoder.decode(
        TransformedSampleCorpusEvaluationReport.self,
        from: legacyV4)
    }
  }

  @Test("Calibration and Brier use the confidence for each transform family")
  func familySpecificCalibration() throws {
    let entry = TransformedSampleResearchTestSupport.corpusEntry(
      id: "pitch-labelled",
      split: .heldOut,
      family: .pitch)
    let evaluation = TransformedSampleCorpusEvaluation(
      entryID: entry.id,
      emittedLabel: TransformedSampleResearchMatch.externalLabel,
      score: 0.95,
      classification: .directReuse,
      familyPredictions: [
        TransformedSampleFamilyPrediction(family: .gain, confidence: 0.8)
      ],
      abstentionReason: nil,
      resources: TransformedSampleResearchTestSupport.evaluation(
        entryID: "resource", family: .gain
      ).resources)
    let report = try TransformedSampleCorpusEvaluator().evaluate(
      manifest: TransformedSampleCorpusManifest(corpusID: "family-score", entries: [entry]),
      evaluations: [evaluation])
    let pitch = try #require(report.transformReports.first(where: { $0.family == .pitch }))
    let gain = try #require(report.transformReports.first(where: { $0.family == .gain }))

    #expect(pitch.brierScore == 1)
    #expect(pitch.meanAbsoluteCalibrationError == 1)
    #expect(pitch.falseNegativeCount == 1)
    #expect(abs((gain.brierScore ?? .infinity) - 0.64) < 0.000_001)
    #expect(gain.meanAbsoluteCalibrationError == 0.8)
    #expect(gain.falsePositiveCount == 1)
  }

  @Test("False positives and abstentions are reported per transform")
  func reportsFalsePositivesAndAbstention() throws {
    let positive = TransformedSampleResearchTestSupport.corpusEntry(
      id: "positive",
      split: .heldOut,
      family: .pitch)
    let missed = TransformedSampleResearchTestSupport.corpusEntry(
      id: "missed",
      split: .heldOut,
      family: .pitch)
    let negative = TransformedSampleResearchTestSupport.corpusEntry(
      id: "negative",
      split: .heldOut,
      family: nil,
      relationship: .independentReperformance)
    let manifest = TransformedSampleCorpusManifest(
      corpusID: "metrics",
      entries: [positive, missed, negative])
    let evaluations = [
      TransformedSampleResearchTestSupport.evaluation(entryID: positive.id, family: .pitch),
      TransformedSampleResearchTestSupport.evaluation(
        entryID: missed.id,
        family: nil,
        abstentionReason: .relationshipIndeterminate),
      TransformedSampleResearchTestSupport.evaluation(entryID: negative.id, family: .pitch),
    ]
    let report = try TransformedSampleCorpusEvaluator().evaluate(
      manifest: manifest,
      evaluations: evaluations)
    let pitch = try #require(report.transformReports.first(where: { $0.family == .pitch }))

    #expect(pitch.reviewedCount == 3)
    #expect(pitch.truePositiveCount == 1)
    #expect(pitch.falsePositiveCount == 1)
    #expect(pitch.falseNegativeCount == 1)
    #expect(pitch.precision == 0.5)
    #expect(pitch.recall == 0.5)
    #expect(pitch.coverage == 2.0 / 3.0)
    #expect(pitch.abstentionRate == 1.0 / 3.0)
  }

  @Test("Incomplete resource and false-positive reviews remain not run")
  func incompleteGateEvidenceIsNotRun() throws {
    let entries = [
      TransformedSampleResearchTestSupport.corpusEntry(
        id: "one",
        split: .heldOut,
        family: .pitch),
      TransformedSampleResearchTestSupport.corpusEntry(
        id: "two",
        split: .heldOut,
        family: .gain),
    ]
    let manifest = TransformedSampleCorpusManifest(corpusID: "partial", entries: entries)
    let evaluations = [
      TransformedSampleResearchTestSupport.evaluation(entryID: "one", family: .pitch)
    ]
    let evaluator = TransformedSampleCorpusEvaluator()
    let binding = try evaluator.artifactBinding(manifest: manifest, evaluations: evaluations)
    let report = try evaluator.evaluate(
      manifest: manifest,
      evaluations: evaluations,
      evidence: TransformedSampleEvaluationGateEvidence(
        resourceBudget: TransformedSampleResourceGateEvidence(
          artifactBinding: binding,
          evaluatedEntryCount: entries.count,
          maximumMeanWallClockMilliseconds: 20,
          maximumMeanCPUMilliseconds: 20,
          maximumPeakResidentMegabytes: 30,
          maximumTotalBytesScanned: 10_000,
          maximumTotalDecodedFrameCount: 100_000),
        falsePositiveBudget: TransformedSampleFalsePositiveGateEvidence(
          artifactBinding: binding,
          reviewedEvaluationCount: entries.count,
          minimumReviewedNegativeCount: 1,
          maximumFalsePositiveCount: 0,
          reviewID: "partial-review")))

    #expect(report.gates.resourceBudgetReview == .notRun)
    #expect(report.gates.falsePositiveBudgetReview == .notRun)
    #expect(report.activationAvailability == .unavailableResearchOnly)
  }

  @Test("False-positive review cannot pass without real held-out negatives")
  func falsePositiveGateRequiresNegatives() throws {
    let entry = TransformedSampleResearchTestSupport.corpusEntry(
      id: "positive-only",
      split: .heldOut,
      family: .pitch,
      origin: .realProducerLabel)
    let manifest = TransformedSampleCorpusManifest(corpusID: "no-negatives", entries: [entry])
    let evaluations = [
      TransformedSampleResearchTestSupport.evaluation(entryID: entry.id, family: .pitch)
    ]
    let evaluator = TransformedSampleCorpusEvaluator()
    let binding = try evaluator.artifactBinding(manifest: manifest, evaluations: evaluations)
    let report = try evaluator.evaluate(
      manifest: manifest,
      evaluations: evaluations,
      evidence: TransformedSampleEvaluationGateEvidence(
        falsePositiveBudget: TransformedSampleFalsePositiveGateEvidence(
          artifactBinding: binding,
          reviewedEvaluationCount: 1,
          minimumReviewedNegativeCount: 1,
          maximumFalsePositiveCount: 0,
          reviewID: "no-negative-review")))

    #expect(report.gates.falsePositiveBudgetReview == .notRun)
    #expect(report.activationAvailability == .unavailableResearchOnly)
  }

  @Test("Resource aggregation overflow fails closed without trapping")
  func resourceOverflowIsNotRun() throws {
    let entries = [
      TransformedSampleResearchTestSupport.corpusEntry(
        id: "overflow-a", split: .heldOut, family: .gain),
      TransformedSampleResearchTestSupport.corpusEntry(
        id: "overflow-b", split: .heldOut, family: .gain),
    ]
    let resources = TransformedSampleEvaluationResourceMeasurement(
      wallClockMilliseconds: Double.greatestFiniteMagnitude,
      cpuMilliseconds: Double.greatestFiniteMagnitude,
      peakResidentMegabytes: 1,
      bytesScanned: Int64.max,
      decodedFrameCount: Int64.max,
      comparedCandidateCount: Int.max)
    let evaluations = entries.map { entry in
      TransformedSampleCorpusEvaluation(
        entryID: entry.id,
        emittedLabel: TransformedSampleResearchMatch.externalLabel,
        score: 0.9,
        classification: .directReuse,
        familyPredictions: [
          TransformedSampleFamilyPrediction(family: .gain, confidence: 0.9)
        ],
        abstentionReason: nil,
        resources: resources)
    }
    let manifest = TransformedSampleCorpusManifest(corpusID: "overflow", entries: entries)
    let evaluator = TransformedSampleCorpusEvaluator()
    let binding = try evaluator.artifactBinding(manifest: manifest, evaluations: evaluations)
    let report = try evaluator.evaluate(
      manifest: manifest,
      evaluations: evaluations,
      evidence: TransformedSampleEvaluationGateEvidence(
        resourceBudget: TransformedSampleResourceGateEvidence(
          artifactBinding: binding,
          evaluatedEntryCount: evaluations.count,
          maximumMeanWallClockMilliseconds: Double.greatestFiniteMagnitude,
          maximumMeanCPUMilliseconds: Double.greatestFiniteMagnitude,
          maximumPeakResidentMegabytes: Double.greatestFiniteMagnitude,
          maximumTotalBytesScanned: Int64.max,
          maximumTotalDecodedFrameCount: Int64.max)))
    let gain = try #require(report.transformReports.first(where: { $0.family == .gain }))

    #expect(gain.resources.totalBytesScanned == nil)
    #expect(gain.resources.totalDecodedFrameCount == nil)
    #expect(gain.resources.totalComparedCandidateCount == nil)
    #expect(report.gates.resourceBudgetReview == .notRun)
  }

  @Test("Gate evidence rejects stale evaluation, algorithm, and artifact bindings")
  func rejectsStaleArtifactBindings() throws {
    let entry = TransformedSampleResearchTestSupport.corpusEntry(
      id: "bound", split: .heldOut, family: .pitch)
    let manifest = TransformedSampleCorpusManifest(corpusID: "binding", entries: [entry])
    let evaluations = [
      TransformedSampleResearchTestSupport.evaluation(entryID: entry.id, family: .pitch)
    ]
    let evaluator = TransformedSampleCorpusEvaluator()
    let binding = try evaluator.artifactBinding(manifest: manifest, evaluations: evaluations)
    let staleBindings = [
      TransformedSampleEvaluationArtifactBinding(
        manifestDigest: binding.manifestDigest,
        evaluationDigest: String(repeating: "0", count: 64),
        algorithmVersion: binding.algorithmVersion,
        artifactID: binding.artifactID),
      TransformedSampleEvaluationArtifactBinding(
        manifestDigest: binding.manifestDigest,
        evaluationDigest: binding.evaluationDigest,
        algorithmVersion: "different-algorithm",
        artifactID: binding.artifactID),
      TransformedSampleEvaluationArtifactBinding(
        manifestDigest: binding.manifestDigest,
        evaluationDigest: binding.evaluationDigest,
        algorithmVersion: binding.algorithmVersion,
        artifactID: "different-artifact"),
    ]
    for stale in staleBindings {
      #expect(throws: TransformedSampleCorpusError.invalidGateEvidence("rightsAndModel")) {
        try evaluator.evaluate(
          manifest: manifest,
          evaluations: evaluations,
          evidence: TransformedSampleEvaluationGateEvidence(
            rightsAndModel: TransformedSampleRightsModelGateEvidence(
              artifactBinding: stale,
              reviewID: "stale-binding",
              corpusRightsAccepted: true,
              modelRightsAccepted: true)))
      }
    }
  }

  @Test("Malformed schemas, origins, entries, evaluations, and gate bindings fail closed")
  func rejectsMalformedInputs() throws {
    let valid = TransformedSampleResearchTestSupport.corpusEntry(
      id: "valid",
      split: .heldOut)
    #expect(throws: TransformedSampleCorpusError.unsupportedSchemaVersion(999)) {
      try TransformedSampleCorpusManifest(
        schemaVersion: 999,
        corpusID: "future",
        entries: [valid]
      ).validated()
    }
    #expect(throws: TransformedSampleCorpusError.duplicateEntryID) {
      try TransformedSampleCorpusManifest(
        corpusID: "duplicates",
        entries: [valid, valid]
      ).validated()
    }
    #expect(throws: TransformedSampleCorpusError.invalidManifest("corpus bounds")) {
      try TransformedSampleCorpusManifest(
        corpusID: "oversized",
        entries: Array(
          repeating: valid,
          count: TransformedSampleCorpusManifest.maximumEntryCount + 1)
      ).validated()
    }
    #expect(throws: TransformedSampleCorpusError.invalidManifest("corpus bounds")) {
      try TransformedSampleCorpusManifest(
        corpusID: "/private/music/corpus",
        entries: [valid]
      ).validated()
    }

    let malformedOrigin = TransformedSampleCorpusEntry(
      id: "bad-origin",
      artistGroupDigest: TransformedSampleResearchTestSupport.digest("artist"),
      songGroupDigest: TransformedSampleResearchTestSupport.digest("song"),
      sourceObservationDigest: TransformedSampleResearchTestSupport.digest("source"),
      targetObservationDigest: TransformedSampleResearchTestSupport.digest("target"),
      origin: TransformedSampleCorpusOrigin(kind: .syntheticAugmentation),
      split: .heldOut,
      expectedRelationship: .transformedUse,
      expectedClassification: .directReuse,
      expectedTransformFamilies: [.pitch])
    #expect(throws: TransformedSampleCorpusError.invalidEntry("bad-origin")) {
      try TransformedSampleCorpusManifest(
        corpusID: "malformed-origin",
        entries: [malformedOrigin]
      ).validated()
    }

    let identicalDigest = TransformedSampleCorpusEntry(
      id: "identical-transform",
      artistGroupDigest: TransformedSampleResearchTestSupport.digest("artist-identical"),
      songGroupDigest: TransformedSampleResearchTestSupport.digest("song-identical"),
      sourceObservationDigest: TransformedSampleResearchTestSupport.digest("same-audio"),
      targetObservationDigest: TransformedSampleResearchTestSupport.digest("same-audio"),
      origin: TransformedSampleCorpusOrigin(
        kind: .syntheticAugmentation,
        generatorVersion: "fixture-v1",
        augmentationSeed: 1),
      split: .heldOut,
      expectedRelationship: .transformedUse,
      expectedClassification: .directReuse,
      expectedTransformFamilies: [.gain])
    #expect(throws: TransformedSampleCorpusError.invalidEntry("identical-transform")) {
      try TransformedSampleCorpusManifest(
        corpusID: "identical-transform",
        entries: [identicalDigest]
      ).validated()
    }

    let manifest = TransformedSampleCorpusManifest(corpusID: "valid", entries: [valid])
    let invalidEvaluation = TransformedSampleCorpusEvaluation(
      entryID: valid.id,
      emittedLabel: "Possible transformed use",
      score: .nan,
      classification: .directReuse,
      familyPredictions: [
        TransformedSampleFamilyPrediction(family: .pitch, confidence: 0.9)
      ],
      abstentionReason: nil,
      resources: nil)
    #expect(throws: TransformedSampleCorpusError.invalidEvaluation(valid.id)) {
      try TransformedSampleCorpusEvaluator().evaluate(
        manifest: manifest,
        evaluations: [invalidEvaluation])
    }
    let unknownPositive = TransformedSampleCorpusEvaluation(
      entryID: valid.id,
      emittedLabel: TransformedSampleResearchMatch.externalLabel,
      score: 0.9,
      classification: .unknown,
      familyPredictions: [
        TransformedSampleFamilyPrediction(family: .pitch, confidence: 0.9)
      ],
      abstentionReason: nil,
      resources: TransformedSampleResearchTestSupport.evaluation(
        entryID: "resource", family: .pitch
      ).resources)
    #expect(throws: TransformedSampleCorpusError.invalidEvaluation(valid.id)) {
      try TransformedSampleCorpusEvaluator().evaluate(
        manifest: manifest,
        evaluations: [unknownPositive])
    }
    let invalidFamilyConfidence = TransformedSampleCorpusEvaluation(
      entryID: valid.id,
      emittedLabel: TransformedSampleResearchMatch.externalLabel,
      score: 0.9,
      classification: .directReuse,
      familyPredictions: [
        TransformedSampleFamilyPrediction(family: .pitch, confidence: .nan)
      ],
      abstentionReason: nil,
      resources: TransformedSampleResearchTestSupport.evaluation(
        entryID: "resource", family: .pitch
      ).resources)
    #expect(throws: TransformedSampleCorpusError.invalidEvaluation(valid.id)) {
      try TransformedSampleCorpusEvaluator().evaluate(
        manifest: manifest,
        evaluations: [invalidFamilyConfidence])
    }

    let validEvaluations = [
      TransformedSampleResearchTestSupport.evaluation(entryID: valid.id)
    ]
    let binding = try TransformedSampleCorpusEvaluator().artifactBinding(
      manifest: manifest,
      evaluations: validEvaluations)
    let staleBinding = TransformedSampleEvaluationArtifactBinding(
      manifestDigest: String(repeating: "0", count: 64),
      evaluationDigest: binding.evaluationDigest,
      algorithmVersion: binding.algorithmVersion,
      artifactID: binding.artifactID)
    let staleEvidence = TransformedSampleEvaluationGateEvidence(
      labelledCorpus: TransformedSampleLabelledCorpusGateEvidence(
        artifactBinding: staleBinding,
        minimumHeldOutExamplesPerTransform: 1,
        minimumHeldOutNegativeCount: 1,
        minimumPrecision: 0.8,
        minimumRecall: 0.8,
        maximumBrierScore: 0.2))
    #expect(throws: TransformedSampleCorpusError.invalidGateEvidence("labelledCorpus")) {
      try TransformedSampleCorpusEvaluator().evaluate(
        manifest: manifest,
        evaluations: validEvaluations,
        evidence: staleEvidence)
    }
  }

  @Test("Parameter families reject mismatched ranges and non-finite confidence")
  func validatesTypedHypotheses() {
    let mismatched = TransformedSampleTransformHypothesis(
      family: .pitch,
      parameters: [
        TransformedSampleParameterRange(
          name: .wetMix,
          lowerBound: 0.1,
          upperBound: 0.2,
          unit: .ratio)
      ],
      confidence: 0.9)
    let nonfinite = TransformedSampleTransformHypothesis(
      family: .gain,
      parameters: [
        TransformedSampleParameterRange(
          name: .gainDB,
          lowerBound: -2,
          upperBound: 2,
          unit: .decibels)
      ],
      confidence: .infinity)

    #expect(!mismatched.isWellFormed)
    #expect(!nonfinite.isWellFormed)
  }

  private func syntheticManifest() -> TransformedSampleCorpusManifest {
    let entries = TransformedSampleTransformFamily.allCases.enumerated().map { index, family in
      TransformedSampleResearchTestSupport.corpusEntry(
        id: "synthetic-\(index)",
        split: .heldOut,
        family: family)
    }
    return TransformedSampleCorpusManifest(corpusID: "synthetic-transform-v1", entries: entries)
  }

  private func mutatedReportData(
    _ report: TransformedSampleCorpusEvaluationReport,
    mutation: (inout [String: Any]) throws -> Void
  ) throws -> Data {
    let data = try JSONEncoder().encode(report)
    guard var document = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw CocoaError(.coderInvalidValue)
    }
    try mutation(&document)
    return try JSONSerialization.data(withJSONObject: document, options: [.sortedKeys])
  }
}
