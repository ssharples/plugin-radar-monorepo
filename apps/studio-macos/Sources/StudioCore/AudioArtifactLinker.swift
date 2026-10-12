import Foundation

public enum AudioArtifactKind: String, Codable, Sendable, CaseIterable {
  case mix
  case master
  case stem
  case bounce
  case reference
  case unknown
}

public struct AudioArtifactLineageInput: Codable, Sendable, Equatable {
  public let nodeID: String
  public let kind: AudioArtifactKind
  public let contentAnchorIDs: Set<String>
  public let durationSeconds: Double?
  public let createdAt: Date?
  public let variant: StudioVariantKind?
  public let exportObservation: ExportArtifactObservation?

  public init(
    nodeID: String,
    kind: AudioArtifactKind,
    contentAnchorIDs: Set<String>,
    durationSeconds: Double?,
    createdAt: Date?,
    variant: StudioVariantKind?,
    exportObservation: ExportArtifactObservation? = nil
  ) {
    self.nodeID = nodeID
    self.kind = kind
    self.contentAnchorIDs = contentAnchorIDs
    self.durationSeconds = durationSeconds
    self.createdAt = createdAt
    self.variant = variant
    self.exportObservation = exportObservation
  }
}

public struct SetRevisionLineageInput: Codable, Sendable, Equatable {
  public let revisionNodeID: String
  public let workID: String
  public let contentAnchorIDs: Set<String>
  public let durationSeconds: Double?
  public let savedAt: Date?
  public let variant: StudioVariantKind?
  public let exportContext: ExportRevisionEvidenceContext?
  public let revisionReference: StudioRevisionReference?

  public init(
    revisionNodeID: String,
    workID: String,
    contentAnchorIDs: Set<String>,
    durationSeconds: Double?,
    savedAt: Date?,
    variant: StudioVariantKind?,
    exportContext: ExportRevisionEvidenceContext? = nil,
    revisionReference: StudioRevisionReference? = nil
  ) {
    self.revisionNodeID = revisionNodeID
    self.workID = workID
    self.contentAnchorIDs = contentAnchorIDs
    self.durationSeconds = durationSeconds
    self.savedAt = savedAt
    self.variant = variant
    self.exportContext = exportContext
    self.revisionReference = revisionReference
  }
}

public struct AudioArtifactCandidateScore: Codable, Sendable, Equatable {
  public let revisionNodeID: String
  public let score: Double
  public let automaticEvidenceScore: Double
  public let matchedAnchorCount: Int
  public let anchorCoverage: Double
  public let durationCompatibility: Double
  public let chronologyCompatibility: Double
  public let variantCompatibility: Double
  public let exportCompatibility: Double
  public let exportMetadataSignalCount: Int
  public let exportNonMetadataSignalCount: Int
  public let hasImmutableSourceObservation: Bool
  public let hasDetectorIssuedAutomationAuthority: Bool
  public let independentStrongSignalCount: Int
  public let metadataConflictCount: Int

  public init(
    revisionNodeID: String,
    score: Double,
    automaticEvidenceScore: Double,
    matchedAnchorCount: Int,
    anchorCoverage: Double,
    durationCompatibility: Double,
    chronologyCompatibility: Double,
    variantCompatibility: Double,
    exportCompatibility: Double,
    exportMetadataSignalCount: Int,
    exportNonMetadataSignalCount: Int,
    hasImmutableSourceObservation: Bool,
    hasDetectorIssuedAutomationAuthority: Bool,
    independentStrongSignalCount: Int,
    metadataConflictCount: Int
  ) {
    self.revisionNodeID = revisionNodeID
    self.score = score
    self.automaticEvidenceScore = automaticEvidenceScore
    self.matchedAnchorCount = matchedAnchorCount
    self.anchorCoverage = anchorCoverage
    self.durationCompatibility = durationCompatibility
    self.chronologyCompatibility = chronologyCompatibility
    self.variantCompatibility = variantCompatibility
    self.exportCompatibility = exportCompatibility
    self.exportMetadataSignalCount = exportMetadataSignalCount
    self.exportNonMetadataSignalCount = exportNonMetadataSignalCount
    self.hasImmutableSourceObservation = hasImmutableSourceObservation
    self.hasDetectorIssuedAutomationAuthority = hasDetectorIssuedAutomationAuthority
    self.independentStrongSignalCount = independentStrongSignalCount
    self.metadataConflictCount = metadataConflictCount
  }
}

extension AudioArtifactCandidateScore {
  private enum CodingKeys: String, CodingKey {
    case revisionNodeID
    case score
    case automaticEvidenceScore
    case matchedAnchorCount
    case anchorCoverage
    case durationCompatibility
    case chronologyCompatibility
    case variantCompatibility
    case exportCompatibility
    case exportMetadataSignalCount
    case exportNonMetadataSignalCount
    case hasImmutableSourceObservation
    case hasDetectorIssuedAutomationAuthority
    case independentStrongSignalCount
    case metadataConflictCount
  }

  private enum LegacyCodingKeys: String, CodingKey {
    case hasVerifiedAutomationBinding
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let legacyContainer = try decoder.container(keyedBy: LegacyCodingKeys.self)
    self.init(
      revisionNodeID: try container.decode(String.self, forKey: .revisionNodeID),
      score: try container.decode(Double.self, forKey: .score),
      automaticEvidenceScore: try container.decodeIfPresent(
        Double.self, forKey: .automaticEvidenceScore) ?? 0,
      matchedAnchorCount: try container.decode(Int.self, forKey: .matchedAnchorCount),
      anchorCoverage: try container.decode(Double.self, forKey: .anchorCoverage),
      durationCompatibility: try container.decode(Double.self, forKey: .durationCompatibility),
      chronologyCompatibility: try container.decode(Double.self, forKey: .chronologyCompatibility),
      variantCompatibility: try container.decode(Double.self, forKey: .variantCompatibility),
      exportCompatibility: try container.decode(Double.self, forKey: .exportCompatibility),
      exportMetadataSignalCount: try container.decode(
        Int.self, forKey: .exportMetadataSignalCount),
      exportNonMetadataSignalCount: try container.decode(
        Int.self, forKey: .exportNonMetadataSignalCount),
      hasImmutableSourceObservation: try container.decode(
        Bool.self, forKey: .hasImmutableSourceObservation),
      hasDetectorIssuedAutomationAuthority: try container.decodeIfPresent(
        Bool.self, forKey: .hasDetectorIssuedAutomationAuthority)
        ?? legacyContainer.decodeIfPresent(Bool.self, forKey: .hasVerifiedAutomationBinding)
        ?? false,
      independentStrongSignalCount: try container.decodeIfPresent(
        Int.self, forKey: .independentStrongSignalCount) ?? 0,
      metadataConflictCount: try container.decode(Int.self, forKey: .metadataConflictCount))
  }
}

public enum AudioArtifactFileInspectionStatus: Sendable, Equatable {
  case parsed
  case ineligibleFileType
  case unavailable
  case parseFailed(ExportDNAParserError)
  case sourceChanged
  case immutableObservationUnavailable
}

public struct AudioArtifactFileLinkResult: Sendable, Equatable {
  public let resolution: AudioArtifactLinkResolution
  public let status: AudioArtifactFileInspectionStatus
  public let observation: ExportArtifactObservation?

  public init(
    resolution: AudioArtifactLinkResolution,
    status: AudioArtifactFileInspectionStatus,
    observation: ExportArtifactObservation?
  ) {
    self.resolution = resolution
    self.status = status
    self.observation = observation
  }
}

public struct AudioArtifactLinkResolution: Codable, Sendable, Equatable {
  public let selectedRevisionNodeID: String?
  public let proposedRevisionNodeID: String?
  public let confidence: AudioLineageConfidence
  public let bestCandidate: AudioArtifactCandidateScore?
  public let candidates: [AudioArtifactCandidateScore]
  public let edge: AudioLineageEdge?

  public init(
    selectedRevisionNodeID: String?,
    proposedRevisionNodeID: String?,
    confidence: AudioLineageConfidence,
    bestCandidate: AudioArtifactCandidateScore?,
    candidates: [AudioArtifactCandidateScore],
    edge: AudioLineageEdge?
  ) {
    self.selectedRevisionNodeID = selectedRevisionNodeID
    self.proposedRevisionNodeID = proposedRevisionNodeID
    self.confidence = confidence
    self.bestCandidate = bestCandidate
    self.candidates = candidates
    self.edge = edge
  }
}

public struct AudioArtifactLinker: Sendable {
  public static let algorithmVersion = "audio-artifact-linker-v3"

  public let automaticThreshold: Double
  public let runnerUpMargin: Double
  public let calibration: AudioMatchingCalibration?

  public init(
    automaticThreshold: Double = 0.8,
    runnerUpMargin: Double = 0.15,
    calibration: AudioMatchingCalibration? = nil
  ) {
    self.automaticThreshold = automaticThreshold
    self.runnerUpMargin = runnerUpMargin
    self.calibration = calibration
  }

  public func resolve(
    artifact: AudioArtifactLineageInput,
    candidates: [SetRevisionLineageInput]
  ) -> AudioArtifactLinkResolution {
    resolve(
      artifact: artifact,
      candidates: candidates,
      decisionAuthority: .suggestionOnly)
  }

  private func resolve(
    artifact: AudioArtifactLineageInput,
    candidates: [SetRevisionLineageInput],
    decisionAuthority: ArtifactLinkDecisionAuthority
  ) -> AudioArtifactLinkResolution {
    let scored = candidates.map {
      score(artifact: artifact, candidate: $0, decisionAuthority: decisionAuthority)
    }.sorted {
      if $0.score != $1.score { return $0.score > $1.score }
      return $0.revisionNodeID < $1.revisionNodeID
    }
    let exportSuggestionThreshold = 0.7
    guard let best = scored.first,
      (best.matchedAnchorCount >= 2 && best.anchorCoverage >= 0.5 && best.score >= 0.55)
        || (best.hasImmutableSourceObservation
          && ((best.hasDetectorIssuedAutomationAuthority && best.automaticEvidenceScore >= 0.55)
            || (best.exportCompatibility >= exportSuggestionThreshold
              && best.exportMetadataSignalCount + best.exportNonMetadataSignalCount >= 2
              && best.score >= 0.55)))
    else {
      return AudioArtifactLinkResolution(
        selectedRevisionNodeID: nil, proposedRevisionNodeID: nil, confidence: .unknown,
        bestCandidate: scored.first, candidates: scored, edge: nil)
    }
    let automaticRunnerUp = scored.dropFirst().map(\.automaticEvidenceScore).max() ?? 0
    let automatic =
      calibration != nil
      && decisionAuthority.revalidates(artifact.exportObservation)
      && best.hasImmutableSourceObservation
      && best.metadataConflictCount == 0
      && (best.hasDetectorIssuedAutomationAuthority || best.independentStrongSignalCount >= 2)
      && best.automaticEvidenceScore
        >= (calibration?.automaticScoreThreshold ?? automaticThreshold)
      && best.automaticEvidenceScore - automaticRunnerUp
        >= (calibration?.minimumRunnerUpMargin ?? runnerUpMargin)
    let confidence: AudioLineageConfidence = automatic ? .highConfidenceDerivative : .suggested
    let relationship: AudioLineageRelationship = artifact.kind == .stem ? .stemOf : .renderOf
    var evidence = [
      AudioMatchEvidence(
        kind: .arrangementAnchor, score: best.anchorCoverage,
        explanation:
          "\(best.matchedAnchorCount) content anchors align with the candidate Set revision."),
      AudioMatchEvidence(
        kind: .technicalMetadata,
        score: max(best.durationCompatibility, best.exportCompatibility),
        explanation: Self.technicalMetadataExplanation(best)),
      AudioMatchEvidence(
        kind: .chronology, score: best.chronologyCompatibility,
        explanation: "Artifact creation and Set save times are compatible."),
      AudioMatchEvidence(
        kind: .filenameQualifier, score: best.variantCompatibility,
        explanation: "Filename-derived Variant evidence was compared without treating it as fact."),
    ]
    if best.exportCompatibility > 0 {
      evidence.append(
        AudioMatchEvidence(
          kind: .technicalMetadata,
          score: best.exportCompatibility,
          explanation: Self.exportDNAExplanation(best)))
    }
    let edge = AudioLineageEdge(
      id: StableID.forValue(
        "artifact-link:\(artifact.nodeID):\(best.revisionNodeID):\(relationship.rawValue)"),
      sourceNodeID: artifact.nodeID,
      targetNodeID: best.revisionNodeID,
      relationship: relationship,
      confidence: confidence,
      explanation:
        automatic
        ? "Several independent signals identify the most likely source Set revision."
        : "The artifact may come from this Set revision, but the evidence remains ambiguous.",
      algorithmVersion: Self.algorithmVersion,
      calibrationID: calibration?.id,
      evidence: evidence)
    return AudioArtifactLinkResolution(
      selectedRevisionNodeID: automatic ? best.revisionNodeID : nil,
      proposedRevisionNodeID: best.revisionNodeID,
      confidence: confidence,
      bestCandidate: best,
      candidates: scored,
      edge: edge)
  }

  public func resolve(
    fileURL: URL,
    artifact: AudioArtifactLineageInput,
    candidates: [SetRevisionLineageInput],
    detectedBatch: DetectedExportBatch? = nil,
    revisionAuthority: StudioRevisionExecutionAuthority? = nil,
    parser: ExportDNAParser = ExportDNAParser(),
    fileManager: FileManager = .default
  ) -> AudioArtifactFileLinkResult {
    guard ["wav", "wave"].contains(fileURL.pathExtension.lowercased()) else {
      return abstainingFileResult(status: .ineligibleFileType)
    }
    if let expected = artifact.exportObservation?.immutableFileObservation,
      !revalidate(fileURL: fileURL, expected: expected, fileManager: fileManager)
    {
      return abstainingFileResult(status: .sourceChanged)
    }

    do {
      let before = try FileFingerprint.read(from: fileURL, fileManager: fileManager)
      guard let modifiedAt = before.modifiedAt, let resourceIdentity = before.resourceIdentity
      else {
        return abstainingFileResult(status: .immutableObservationUnavailable)
      }
      let parsed = try parser.parse(fileURL: fileURL)
      let digest = try FileContentDigest.sha256(fileURL: fileURL)
      let after = try FileFingerprint.read(from: fileURL, fileManager: fileManager)
      guard before == after else {
        return abstainingFileResult(status: .sourceChanged)
      }
      let immutable = try ExportArtifactImmutableFileObservation(
        sha256: digest,
        bytes: before.bytes,
        modifiedAt: modifiedAt,
        resourceIdentity: resourceIdentity)
      guard revalidate(fileURL: fileURL, expected: immutable, fileManager: fileManager) else {
        return abstainingFileResult(status: .sourceChanged)
      }

      let authorityReceipt: ExportArtifactAutomationAuthorityReceipt?
      if let detectedBatch, let revisionAuthority {
        authorityReceipt = detectedBatch.artifactAutomationAuthority(
          fileURL: fileURL,
          observation: immutable,
          revisionAuthority: revisionAuthority)
      } else {
        authorityReceipt = nil
      }
      let issuedBinding = authorityReceipt.flatMap { receipt in
        try? ExportVerifiedAutomationBinding(
          planID: receipt.planID,
          revisionNodeID: receipt.revisionReference.revisionID,
          outputSHA256: receipt.fileObservation.sha256)
      }

      let observation = ExportArtifactObservation(
        immutableFileObservation: immutable,
        revalidatedAt: Date(),
        verifiedAutomationBinding: issuedBinding
          ?? artifact.exportObservation?.verifiedAutomationBinding,
        fileName: fileURL.lastPathComponent,
        folderName: fileURL.deletingLastPathComponent().lastPathComponent,
        batchFileCount: artifact.exportObservation?.batchFileCount,
        exportDNA: ExportDNAAssociationEvidence(parsed: parsed))
      let inspectedArtifact = AudioArtifactLineageInput(
        nodeID: artifact.nodeID,
        kind: artifact.kind,
        contentAnchorIDs: artifact.contentAnchorIDs,
        durationSeconds: artifact.durationSeconds,
        createdAt: artifact.createdAt,
        variant: artifact.variant,
        exportObservation: observation)
      return AudioArtifactFileLinkResult(
        resolution: resolve(
          artifact: inspectedArtifact,
          candidates: candidates,
          decisionAuthority: ArtifactLinkDecisionAuthority(
            revalidatedObservationKey: immutable.observationKey,
            automationReceipt: authorityReceipt)),
        status: .parsed,
        observation: observation)
    } catch let error as ExportDNAParserError {
      return abstainingFileResult(status: .parseFailed(error))
    } catch {
      return abstainingFileResult(status: .unavailable)
    }
  }

  public func revalidate(
    fileURL: URL,
    expected: ExportArtifactImmutableFileObservation,
    fileManager: FileManager = .default
  ) -> Bool {
    do {
      let before = try FileFingerprint.read(from: fileURL, fileManager: fileManager)
      guard before.bytes == expected.bytes,
        before.modifiedAt == expected.modifiedAt,
        before.resourceIdentity == expected.resourceIdentity
      else { return false }
      let digest = try FileContentDigest.sha256(fileURL: fileURL)
      let after = try FileFingerprint.read(from: fileURL, fileManager: fileManager)
      return before == after && digest == expected.sha256
    } catch {
      return false
    }
  }

  private func abstainingFileResult(
    status: AudioArtifactFileInspectionStatus
  ) -> AudioArtifactFileLinkResult {
    AudioArtifactFileLinkResult(
      resolution: AudioArtifactLinkResolution(
        selectedRevisionNodeID: nil,
        proposedRevisionNodeID: nil,
        confidence: .unknown,
        bestCandidate: nil,
        candidates: [],
        edge: nil),
      status: status,
      observation: nil)
  }

  private func score(
    artifact: AudioArtifactLineageInput,
    candidate: SetRevisionLineageInput,
    decisionAuthority: ArtifactLinkDecisionAuthority
  ) -> AudioArtifactCandidateScore {
    let matched = artifact.contentAnchorIDs.intersection(candidate.contentAnchorIDs)
    let coverage =
      artifact.contentAnchorIDs.isEmpty
      ? 0 : Double(matched.count) / Double(artifact.contentAnchorIDs.count)
    let duration = Self.durationCompatibility(artifact.durationSeconds, candidate.durationSeconds)
    let chronology = Self.chronologyCompatibility(artifact.createdAt, candidate.savedAt)
    let variant = Self.variantCompatibility(artifact.variant, candidate.variant)
    let export = Self.exportAssessment(
      artifact: artifact,
      candidate: candidate,
      decisionAuthority: decisionAuthority)
    let independentStrongSignalCount =
      (matched.count >= 2 && coverage >= 0.5 ? 1 : 0)
      + (duration >= 0.8 ? 1 : 0)
      + (chronology >= 0.8 ? 1 : 0)
      + export.nonDescriptiveStrongSignalCount
    let anchorBase = coverage * 0.65 + duration * 0.15 + chronology * 0.15 + variant * 0.05
    let automaticAnchorBase = coverage * 0.68 + duration * 0.16 + chronology * 0.16
    let combined: Double
    let automaticEvidenceScore: Double
    if matched.count >= 2 {
      combined = export.hasSignals ? anchorBase * 0.82 + export.score * 0.18 : anchorBase
      automaticEvidenceScore =
        export.hasAutomaticSignals
        ? automaticAnchorBase * 0.82 + export.automaticScore * 0.18 : automaticAnchorBase
    } else if export.suggestionEligible {
      combined = export.score * 0.8 + duration * 0.1 + chronology * 0.07 + variant * 0.03
      automaticEvidenceScore =
        export.automaticSuggestionEligible
        ? export.automaticScore * 0.8 + duration * 0.12 + chronology * 0.08 : 0
    } else {
      combined = 0
      automaticEvidenceScore = 0
    }
    return AudioArtifactCandidateScore(
      revisionNodeID: candidate.revisionNodeID,
      score: combined,
      automaticEvidenceScore: automaticEvidenceScore,
      matchedAnchorCount: matched.count,
      anchorCoverage: coverage,
      durationCompatibility: duration,
      chronologyCompatibility: chronology,
      variantCompatibility: variant,
      exportCompatibility: export.score,
      exportMetadataSignalCount: export.metadataSignalCount,
      exportNonMetadataSignalCount: export.nonMetadataSignalCount,
      hasImmutableSourceObservation: export.hasImmutableSourceObservation,
      hasDetectorIssuedAutomationAuthority: export.hasDetectorIssuedAutomationAuthority,
      independentStrongSignalCount: independentStrongSignalCount,
      metadataConflictCount: export.metadataConflictCount)
  }

  private static func durationCompatibility(_ left: Double?, _ right: Double?) -> Double {
    guard let left, let right, left > 0, right > 0 else { return 0.5 }
    return max(0, 1 - abs(left - right) / max(left, right))
  }

  private static func chronologyCompatibility(_ artifact: Date?, _ revision: Date?) -> Double {
    guard let artifact, let revision else { return 0.5 }
    let delta = artifact.timeIntervalSince(revision)
    guard delta >= -60, delta <= 86_400 else { return 0 }
    return max(0, 1 - max(0, delta) / 86_400)
  }

  private static func variantCompatibility(
    _ artifact: StudioVariantKind?,
    _ revision: StudioVariantKind?
  ) -> Double {
    switch (artifact, revision) {
    case (let artifact?, let revision?): artifact == revision ? 1 : 0
    case (nil, nil): 0.5
    case (nil, _?): 0.5
    case (_?, nil): 0.25
    }
  }

  private static func technicalMetadataExplanation(_ score: AudioArtifactCandidateScore) -> String {
    if score.exportCompatibility > 0 {
      return
        "Duration, embedded Export DNA, and review-plan signals were compared without treating descriptive metadata as verified provenance."
    }
    return "Artifact and candidate durations are compatible."
  }

  private static func exportDNAExplanation(_ score: AudioArtifactCandidateScore) -> String {
    let contradictionText =
      score.metadataConflictCount > 0
      ? " \(score.metadataConflictCount) embedded metadata contradiction(s) reduced trust."
      : ""
    return
      "Export DNA compatibility score \(percent(score.exportCompatibility)) from timestamp, sample-range, label, folder, and file-count checks. Embedded metadata only strengthens review evidence and never verifies provenance by itself.\(contradictionText)"
  }

  private static func percent(_ value: Double) -> String {
    let clamped = max(0, min(1, value))
    return "\(Int((clamped * 100).rounded()))%"
  }

  private static func exportAssessment(
    artifact: AudioArtifactLineageInput,
    candidate: SetRevisionLineageInput,
    decisionAuthority: ArtifactLinkDecisionAuthority
  ) -> ExportAssessment {
    guard let observation = artifact.exportObservation else { return ExportAssessment.none }

    var metadataScores: [Double] = []
    var nonMetadataScores: [Double] = []
    var automaticScores: [Double] = []
    var nonDescriptiveStrongSignalCount = 0

    if let exportDNA = observation.exportDNA {
      if let origination = exportDNA.originationTimestamp, let createdAt = artifact.createdAt {
        let score = originationCompatibility(origination, createdAt)
        metadataScores.append(score)
        automaticScores.append(score)
        if score >= 0.8 { nonDescriptiveStrongSignalCount += 1 }
      }
      if let timeReference = exportDNA.sampleTimeReference,
        let range = candidate.exportContext?.reviewedArrangementRange
      {
        let score = sampleRangeCompatibility(timeReference, range: range)
        metadataScores.append(score)
        automaticScores.append(score)
        if score >= 0.8 { nonDescriptiveStrongSignalCount += 1 }
      }
      let ixmlCompatibility = labelCompatibility(
        labels: [exportDNA.ixmlProject].compactMap { $0 } + exportDNA.ixmlTrackLabels,
        candidate: candidate.exportContext)
      if let ixmlCompatibility {
        metadataScores.append(ixmlCompatibility)
      }
    }

    if let fileName = observation.fileName,
      let fileNameCompatibility = labelCompatibility(
        labels: [fileName], candidate: candidate.exportContext)
    {
      nonMetadataScores.append(fileNameCompatibility)
    }
    if let folderName = observation.folderName,
      let folderCompatibility = folderCompatibility(folderName, candidate: candidate.exportContext)
    {
      nonMetadataScores.append(folderCompatibility)
    }
    if let batchFileCount = observation.batchFileCount,
      let fileCountCompatibility = fileCountCompatibility(
        batchFileCount, candidate: candidate.exportContext)
    {
      nonMetadataScores.append(fileCountCompatibility)
    }

    let hasDetectorIssuedAutomationAuthority = decisionAuthority.authorizes(
      candidate: candidate,
      observation: observation)
    if hasDetectorIssuedAutomationAuthority {
      nonMetadataScores.append(1)
      automaticScores.append(1)
    }
    let automationConflict =
      decisionAuthority.automationReceipt != nil
      && !hasDetectorIssuedAutomationAuthority
    let contradictionCount =
      (observation.exportDNA?.contradictions.count ?? 0)
      + (automationConflict ? 1 : 0)
    let availableScores = metadataScores + nonMetadataScores
    guard !availableScores.isEmpty else {
      return ExportAssessment(
        score: 0,
        automaticScore: 0,
        hasSignals: false,
        hasAutomaticSignals: false,
        suggestionEligible: false,
        automaticSuggestionEligible: false,
        metadataSignalCount: 0,
        nonMetadataSignalCount: 0,
        hasImmutableSourceObservation: observation.hasImmutableObservation,
        hasDetectorIssuedAutomationAuthority: false,
        nonDescriptiveStrongSignalCount: 0,
        metadataConflictCount: contradictionCount)
    }

    let strongMetadataSignalCount = metadataScores.filter { $0 >= 0.8 }.count
    let strongNonMetadataSignalCount = nonMetadataScores.filter { $0 >= 0.8 }.count
    var score = availableScores.reduce(0, +) / Double(availableScores.count)
    var automaticScore =
      automaticScores.isEmpty ? 0 : automaticScores.reduce(0, +) / Double(automaticScores.count)
    if contradictionCount > 0 {
      score *= 0.35
      automaticScore = 0
    }
    let suggestionEligible =
      observation.hasImmutableObservation
      && contradictionCount == 0
      && (hasDetectorIssuedAutomationAuthority
        || strongMetadataSignalCount + strongNonMetadataSignalCount >= 2)
    let automaticSuggestionEligible =
      observation.hasImmutableObservation
      && contradictionCount == 0
      && (hasDetectorIssuedAutomationAuthority || nonDescriptiveStrongSignalCount >= 2)
    return ExportAssessment(
      score: score,
      automaticScore: automaticScore,
      hasSignals: true,
      hasAutomaticSignals: !automaticScores.isEmpty,
      suggestionEligible: suggestionEligible,
      automaticSuggestionEligible: automaticSuggestionEligible,
      metadataSignalCount: strongMetadataSignalCount,
      nonMetadataSignalCount: strongNonMetadataSignalCount,
      hasImmutableSourceObservation: observation.hasImmutableObservation,
      hasDetectorIssuedAutomationAuthority: hasDetectorIssuedAutomationAuthority,
      nonDescriptiveStrongSignalCount: nonDescriptiveStrongSignalCount,
      metadataConflictCount: contradictionCount)
  }

  private static func originationCompatibility(_ left: Date, _ right: Date) -> Double {
    let delta = abs(left.timeIntervalSince(right))
    if delta <= 120 { return 1 }
    if delta >= 3600 { return 0 }
    return max(0, 1 - ((delta - 120) / (3600 - 120)))
  }

  private static func sampleRangeCompatibility(
    _ timeReference: ExportSampleTimeReferenceEvidence,
    range: ReviewedArrangementSampleRange
  ) -> Double {
    guard let sampleRate = timeReference.sampleRate, sampleRate == range.sampleRate else {
      return 0
    }
    return range.contains(timeReference.samplesSinceOrigin) ? 1 : 0
  }

  private static func labelCompatibility(
    labels: [String],
    candidate: ExportRevisionEvidenceContext?
  ) -> Double? {
    guard let candidate else { return nil }
    let candidateTokens = Set(
      ([candidate.displayName].compactMap { $0 } + candidate.expectedTrackLabels).flatMap(
        normalizedTokens)
    )
    guard !candidateTokens.isEmpty else { return nil }
    let labelTokens = Set(labels.flatMap(normalizedTokens))
    guard !labelTokens.isEmpty else { return nil }
    let overlap = labelTokens.intersection(candidateTokens)
    return Double(overlap.count) / Double(labelTokens.count)
  }

  private static func folderCompatibility(
    _ folderName: String,
    candidate: ExportRevisionEvidenceContext?
  ) -> Double? {
    guard let candidate, !candidate.expectedExportFolderNames.isEmpty else { return nil }
    let folder = normalized(folderName)
    return candidate.expectedExportFolderNames.map(normalized).contains(folder) ? 1 : 0
  }

  private static func fileCountCompatibility(
    _ batchFileCount: Int,
    candidate: ExportRevisionEvidenceContext?
  ) -> Double? {
    guard let expected = candidate?.expectedBatchFileCount, expected > 0 else { return nil }
    return expected == batchFileCount ? 1 : 0
  }

  private static func normalizedTokens(_ value: String) -> [String] {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      .lowercased()
      .split { !$0.isLetter && !$0.isNumber }
      .map(String.init)
  }

  private static func normalized(_ value: String) -> String {
    normalizedTokens(value).joined()
  }
}

private struct ExportAssessment {
  static let none = ExportAssessment(
    score: 0,
    automaticScore: 0,
    hasSignals: false,
    hasAutomaticSignals: false,
    suggestionEligible: false,
    automaticSuggestionEligible: false,
    metadataSignalCount: 0,
    nonMetadataSignalCount: 0,
    hasImmutableSourceObservation: false,
    hasDetectorIssuedAutomationAuthority: false,
    nonDescriptiveStrongSignalCount: 0,
    metadataConflictCount: 0)

  let score: Double
  let automaticScore: Double
  let hasSignals: Bool
  let hasAutomaticSignals: Bool
  let suggestionEligible: Bool
  let automaticSuggestionEligible: Bool
  let metadataSignalCount: Int
  let nonMetadataSignalCount: Int
  let hasImmutableSourceObservation: Bool
  let hasDetectorIssuedAutomationAuthority: Bool
  let nonDescriptiveStrongSignalCount: Int
  let metadataConflictCount: Int
}

private struct ArtifactLinkDecisionAuthority {
  static let suggestionOnly = ArtifactLinkDecisionAuthority(
    revalidatedObservationKey: nil,
    automationReceipt: nil)

  let revalidatedObservationKey: String?
  let automationReceipt: ExportArtifactAutomationAuthorityReceipt?

  func revalidates(_ observation: ExportArtifactObservation?) -> Bool {
    guard let observation, observation.hasImmutableObservation,
      let revalidatedObservationKey
    else { return false }
    return observation.immutableObservationKey == revalidatedObservationKey
  }

  func authorizes(
    candidate: SetRevisionLineageInput,
    observation: ExportArtifactObservation
  ) -> Bool {
    guard revalidates(observation),
      let automationReceipt,
      automationReceipt.fileObservation.observationKey == revalidatedObservationKey,
      candidate.revisionNodeID == automationReceipt.revisionReference.revisionID,
      candidate.revisionReference == automationReceipt.revisionReference
    else { return false }
    return true
  }
}
