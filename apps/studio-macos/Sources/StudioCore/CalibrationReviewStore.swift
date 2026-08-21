import CryptoKit
import Darwin
import Foundation

public enum CalibrationReviewTaskFamily: String, Codable, Sendable, CaseIterable {
  case workContainment
  case sessionRelationship
  case exportAssociation
  case audioMatch
  case acceptedRelationship
}

public enum CalibrationDecisionLabel: String, Codable, Sendable, CaseIterable {
  case sameSong
  case keepSeparate
  case assignedElsewhere
  case rejected
  case duplicate
  case evolved
  case derivative
  case unrelated
  case correctExportAssociation
  case incorrectExportAssociation
  case sameRecording
  case transformedUse
  case falseMatch
  case acceptedArtistRelationship
  case acceptedVariantRelationship
  case acceptedBranchRelationship

  public var family: CalibrationReviewTaskFamily {
    switch self {
    case .sameSong, .keepSeparate, .assignedElsewhere, .rejected:
      .workContainment
    case .duplicate, .evolved, .derivative, .unrelated:
      .sessionRelationship
    case .correctExportAssociation, .incorrectExportAssociation:
      .exportAssociation
    case .sameRecording, .transformedUse, .falseMatch:
      .audioMatch
    case .acceptedArtistRelationship, .acceptedVariantRelationship,
      .acceptedBranchRelationship:
      .acceptedRelationship
    }
  }
}

public enum CalibrationObservationKind: String, Codable, Sendable, CaseIterable {
  case sessionContainmentSuggestion
  case sessionContainmentAutomaticAssignment
  case sessionRelationshipObservation
  case exportArtifactAssociation
  case audioMatchObservation
  case acceptedRelationshipObservation

  public var taskFamily: CalibrationReviewTaskFamily {
    switch self {
    case .sessionContainmentSuggestion, .sessionContainmentAutomaticAssignment:
      .workContainment
    case .sessionRelationshipObservation:
      .sessionRelationship
    case .exportArtifactAssociation:
      .exportAssociation
    case .audioMatchObservation:
      .audioMatch
    case .acceptedRelationshipObservation:
      .acceptedRelationship
    }
  }
}

public enum CalibrationPredictionDisposition: String, Codable, Sendable, CaseIterable {
  case automatic
  case suggested
  case abstained
}

public enum CalibrationEvidenceFamily: String, Codable, Sendable, CaseIterable {
  case exact
  case pcm
  case excerpt
  case placement
  case midiStructure
  case arrangement
  case exportDNA
  case immutableArtifactObservation
  case technicalMetadata
  case chronology
  case variantQualifier
  case nearIdentityFingerprint
  case transformedFingerprint
  case userAuthority
}

public enum CalibrationCorpusKind: String, Codable, Sendable, CaseIterable {
  case synthetic
  case realLabelled
}

public enum CalibrationCorpusSplit: String, Codable, Sendable, CaseIterable {
  case training
  case validation
  case heldOut
}

public struct CalibrationCorpusPartition: Codable, Sendable, Equatable, Hashable {
  public let corpusKind: CalibrationCorpusKind
  public let split: CalibrationCorpusSplit
  public let artistGroupDigest: String
  public let songGroupDigest: String

  public init(
    corpusKind: CalibrationCorpusKind,
    split: CalibrationCorpusSplit,
    artistGroupDigest: String,
    songGroupDigest: String
  ) {
    self.corpusKind = corpusKind
    self.split = split
    self.artistGroupDigest = artistGroupDigest.lowercased()
    self.songGroupDigest = songGroupDigest.lowercased()
  }

  public var stableKey: String {
    [
      corpusKind.rawValue,
      split.rawValue,
      artistGroupDigest,
      songGroupDigest,
    ].joined(separator: ":")
  }
}

public struct CalibrationFeature: Codable, Sendable, Equatable {
  public let name: String
  public let value: String

  public init(name: String, value: String) {
    self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    self.value = value.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

public struct CalibrationObservationPerformance: Codable, Sendable, Equatable {
  public let wallClockMilliseconds: Double?
  public let cpuMilliseconds: Double?
  public let peakResidentMegabytes: Double?
  public let bytesScanned: Int64?
  public let comparedCandidateCount: Int?

  public init(
    wallClockMilliseconds: Double? = nil,
    cpuMilliseconds: Double? = nil,
    peakResidentMegabytes: Double? = nil,
    bytesScanned: Int64? = nil,
    comparedCandidateCount: Int? = nil
  ) {
    self.wallClockMilliseconds = wallClockMilliseconds
    self.cpuMilliseconds = cpuMilliseconds
    self.peakResidentMegabytes = peakResidentMegabytes
    self.bytesScanned = bytesScanned
    self.comparedCandidateCount = comparedCandidateCount
  }
}

public struct CalibrationImmutableEntityReference: Codable, Sendable, Equatable, Hashable {
  public let identifier: String
  public let observationDigest: String

  public init(identifier: String, observationDigest: String) {
    self.identifier = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
    self.observationDigest = observationDigest.lowercased()
  }
}

public struct CalibrationSessionObservationBinding: Codable, Sendable, Equatable {
  public let source: CalibrationImmutableEntityReference
  public let candidate: CalibrationImmutableEntityReference

  public init(
    source: CalibrationImmutableEntityReference,
    candidate: CalibrationImmutableEntityReference
  ) {
    self.source = source
    self.candidate = candidate
  }
}

public struct CalibrationExportObservationBinding: Codable, Sendable, Equatable {
  public let artifact: CalibrationImmutableEntityReference
  public let revisionIdentifier: String

  public init(
    artifact: CalibrationImmutableEntityReference,
    revisionIdentifier: String
  ) {
    self.artifact = artifact
    self.revisionIdentifier = revisionIdentifier.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}

public struct CalibrationAudioObservationBinding: Codable, Sendable, Equatable {
  public let source: CalibrationImmutableEntityReference
  public let target: CalibrationImmutableEntityReference
  public let sourceFingerprintDigest: String
  public let targetFingerprintDigest: String
  public let fingerprintVersion: String
  public let materialClass: AudioMaterialClass
  public let resourceUsage: AudioMatchResourceUsage
  public let sourceRange: AudioTimeRange?
  public let targetRange: AudioTimeRange?
  public let transform: AudioTransformEvidence?
  public let excerptRetrieval: AudioExcerptRetrievalDiagnostics?

  public init(
    source: CalibrationImmutableEntityReference,
    target: CalibrationImmutableEntityReference,
    sourceFingerprintDigest: String,
    targetFingerprintDigest: String,
    fingerprintVersion: String,
    materialClass: AudioMaterialClass,
    resourceUsage: AudioMatchResourceUsage,
    sourceRange: AudioTimeRange? = nil,
    targetRange: AudioTimeRange? = nil,
    transform: AudioTransformEvidence? = nil,
    excerptRetrieval: AudioExcerptRetrievalDiagnostics? = nil
  ) {
    self.source = source
    self.target = target
    self.sourceFingerprintDigest = sourceFingerprintDigest.lowercased()
    self.targetFingerprintDigest = targetFingerprintDigest.lowercased()
    self.fingerprintVersion = fingerprintVersion.trimmingCharacters(in: .whitespacesAndNewlines)
    self.materialClass = materialClass
    self.resourceUsage = resourceUsage
    self.sourceRange = sourceRange
    self.targetRange = targetRange
    self.transform = transform
    self.excerptRetrieval = excerptRetrieval
  }
}

public struct CalibrationLegacyUnresolvedBinding: Codable, Sendable, Equatable {
  public let originalKind: CalibrationObservationKind
  public let legacyFeatureDigest: String
  public let provenanceDigests: [String]

  public init(
    originalKind: CalibrationObservationKind,
    legacyFeatureDigest: String,
    provenanceDigests: [String]
  ) {
    self.originalKind = originalKind
    self.legacyFeatureDigest = legacyFeatureDigest.lowercased()
    self.provenanceDigests = Array(Set(provenanceDigests.map { $0.lowercased() })).sorted()
  }
}

public enum CalibrationAcceptedRelationshipKind: String, Codable, Sendable, CaseIterable {
  case artist
  case variant
  case branch

  var label: CalibrationDecisionLabel {
    switch self {
    case .artist: .acceptedArtistRelationship
    case .variant: .acceptedVariantRelationship
    case .branch: .acceptedBranchRelationship
    }
  }
}

public struct CalibrationAcceptedRelationshipBinding: Codable, Sendable, Equatable {
  public let source: CalibrationImmutableEntityReference
  public let target: CalibrationImmutableEntityReference
  public let relationshipKind: CalibrationAcceptedRelationshipKind

  public init(
    source: CalibrationImmutableEntityReference,
    target: CalibrationImmutableEntityReference,
    relationshipKind: CalibrationAcceptedRelationshipKind
  ) {
    self.source = source
    self.target = target
    self.relationshipKind = relationshipKind
  }
}

public enum CalibrationObservationBinding: Codable, Sendable, Equatable {
  case session(CalibrationSessionObservationBinding)
  case export(CalibrationExportObservationBinding)
  case audio(CalibrationAudioObservationBinding)
  case acceptedRelationship(CalibrationAcceptedRelationshipBinding)
  case legacyUnresolved(CalibrationLegacyUnresolvedBinding)

  var subjectKey: String? {
    switch self {
    case .session(let binding):
      return [
        "session",
        binding.source.identifier,
        binding.source.observationDigest,
        binding.candidate.identifier,
        binding.candidate.observationDigest,
      ].joined(separator: ":")
    case .export(let binding):
      return [
        "export",
        binding.artifact.identifier,
        binding.artifact.observationDigest,
      ].joined(separator: ":")
    case .audio(let binding):
      return [
        "audio",
        binding.source.identifier,
        binding.source.observationDigest,
        binding.target.identifier,
        binding.target.observationDigest,
        binding.sourceFingerprintDigest,
        binding.targetFingerprintDigest,
      ].joined(separator: ":")
    case .acceptedRelationship(let binding):
      return [
        "relationship",
        binding.relationshipKind.rawValue,
        binding.source.identifier,
        binding.source.observationDigest,
        binding.target.identifier,
        binding.target.observationDigest,
      ].joined(separator: ":")
    case .legacyUnresolved:
      return nil
    }
  }
}

public struct CalibrationObservationSnapshot: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: CalibrationObservationKind
  public let taskFamily: CalibrationReviewTaskFamily
  public let algorithmFamily: String
  public let algorithmVersion: String
  public let calibrationID: String?
  public let predictionDisposition: CalibrationPredictionDisposition
  public let predictedLabel: CalibrationDecisionLabel?
  public let score: Double?
  public let binding: CalibrationObservationBinding?
  public let provenanceKeys: [String]
  public let evidenceFamilies: [CalibrationEvidenceFamily]
  public let unavailableEvidenceFamilies: [CalibrationEvidenceFamily]
  public let featureDigest: String
  public let features: [CalibrationFeature]
  public let corpusPartition: CalibrationCorpusPartition?
  public let performance: CalibrationObservationPerformance?
  public let observedAt: Date?
  private let suppliedFeatureDigestMatched: Bool

  public init(
    id: String,
    kind: CalibrationObservationKind,
    taskFamily: CalibrationReviewTaskFamily,
    algorithmFamily: String,
    algorithmVersion: String,
    calibrationID: String? = nil,
    predictionDisposition: CalibrationPredictionDisposition,
    predictedLabel: CalibrationDecisionLabel? = nil,
    score: Double? = nil,
    binding: CalibrationObservationBinding? = nil,
    provenanceKeys: [String] = [],
    evidenceFamilies: [CalibrationEvidenceFamily] = [],
    unavailableEvidenceFamilies: [CalibrationEvidenceFamily] = [],
    features: [CalibrationFeature] = [],
    corpusPartition: CalibrationCorpusPartition? = nil,
    performance: CalibrationObservationPerformance? = nil,
    observedAt: Date? = nil,
    featureDigest: String? = nil
  ) {
    self.id = id.trimmingCharacters(in: .whitespacesAndNewlines)
    self.kind = kind
    self.taskFamily = taskFamily
    self.algorithmFamily = algorithmFamily.trimmingCharacters(in: .whitespacesAndNewlines)
    self.algorithmVersion = algorithmVersion.trimmingCharacters(in: .whitespacesAndNewlines)
    self.calibrationID = Self.cleaned(calibrationID)
    self.predictionDisposition = predictionDisposition
    self.predictedLabel = predictedLabel
    self.score = score
    self.binding = binding
    self.provenanceKeys = Self.normalized(values: provenanceKeys)
    self.evidenceFamilies = Array(Set(evidenceFamilies)).sorted { $0.rawValue < $1.rawValue }
    self.unavailableEvidenceFamilies =
      Array(Set(unavailableEvidenceFamilies)).sorted { $0.rawValue < $1.rawValue }
    self.features = Self.normalized(features: features)
    self.corpusPartition = corpusPartition
    self.performance = performance
    self.observedAt = observedAt
    let canonicalDigest = Self.makeFeatureDigest(
      kind: kind,
      taskFamily: taskFamily,
      algorithmFamily: self.algorithmFamily,
      algorithmVersion: self.algorithmVersion,
      calibrationID: self.calibrationID,
      predictionDisposition: predictionDisposition,
      predictedLabel: predictedLabel,
      score: score,
      binding: binding,
      provenanceKeys: self.provenanceKeys,
      evidenceFamilies: self.evidenceFamilies,
      unavailableEvidenceFamilies: self.unavailableEvidenceFamilies,
      features: self.features,
      corpusPartition: corpusPartition,
      performance: performance,
      observedAt: observedAt)
    self.featureDigest = canonicalDigest
    suppliedFeatureDigestMatched = featureDigest == nil || featureDigest == canonicalDigest
  }

  var hasCanonicalFeatureDigest: Bool { suppliedFeatureDigestMatched }

  public var hasTruthfulProvenance: Bool {
    guard let binding else { return false }
    if case .legacyUnresolved = binding { return false }
    return provenanceKeys.allSatisfy {
      !CalibrationPrivacy.containsPath($0) && !CalibrationPrivacy.containsPersonalData($0)
    }
  }

  public static func from(
    reviewCandidate: SessionContentReviewCandidate,
    corpusPartition: CalibrationCorpusPartition? = nil,
    performance: CalibrationObservationPerformance? = nil
  ) -> CalibrationObservationSnapshot {
    let observation = reviewCandidate.observation
    let observationID =
      reviewCandidate.observationID
      ?? CalibrationDigest.sha256(
        [
          "session-content-review-observation",
          reviewCandidate.id,
          observation?.sourceRevisionReference.contentObservation.reconstructedContentDigest ?? "",
          observation?.candidateRevisionReference.contentObservation.reconstructedContentDigest
            ?? "",
          reviewCandidate.candidateGeneration?.invalidationToken ?? "",
          reviewCandidate.algorithmVersion,
        ].joined(separator: ":"))
    return CalibrationObservationSnapshot(
      id: observationID,
      kind: .sessionContainmentSuggestion,
      taskFamily: .workContainment,
      algorithmFamily: "session-content-lineage",
      algorithmVersion: reviewCandidate.algorithmVersion,
      calibrationID: reviewCandidate.calibrationID,
      predictionDisposition: .suggested,
      predictedLabel: .sameSong,
      score: reviewCandidate.score,
      binding: observation.map {
        .session(
          CalibrationSessionObservationBinding(
            source: entityReference(for: $0.sourceRevisionReference),
            candidate: entityReference(for: $0.candidateRevisionReference)))
      },
      provenanceKeys: hashedProvenance(
        [
          reviewCandidate.sessionID,
          reviewCandidate.sourceWorkID,
          reviewCandidate.candidateWorkID,
          reviewCandidate.candidateGeneration?.invalidationToken,
        ]),
      evidenceFamilies: observedEvidenceFamilies(from: observation),
      unavailableEvidenceFamilies: unavailableEvidenceFamilies(from: observation),
      features: [
        CalibrationFeature(
          name: "independentSourceMaterialCount",
          value: "\(reviewCandidate.independentSourceMaterialCount ?? 0)"),
        CalibrationFeature(
          name: "matchedAnchorCount",
          value: "\(reviewCandidate.matchedAnchorIDs.count)"),
        CalibrationFeature(
          name: "candidateGenerationTokenDigest",
          value: CalibrationDigest.sha256(
            reviewCandidate.candidateGeneration?.invalidationToken ?? "none")),
        CalibrationFeature(
          name: "sourceMeasuredAudioDurationSeconds",
          value: observation?.sourceMeasuredAudioDurationSeconds.map(doubleString) ?? "unknown"),
        CalibrationFeature(
          name: "candidateMeasuredAudioDurationSeconds",
          value: observation?.candidateMeasuredAudioDurationSeconds.map(doubleString) ?? "unknown"),
      ],
      corpusPartition: corpusPartition,
      performance: performance,
      observedAt: observation?.sourceRevisionReference.reviewedAt)
  }

  public static func from(
    automaticAssignment: SessionContentAutomaticAssignment,
    corpusPartition: CalibrationCorpusPartition? = nil,
    performance: CalibrationObservationPerformance? = nil
  ) -> CalibrationObservationSnapshot {
    let observation = automaticAssignment.observation
    let observationID =
      automaticAssignment.observationID
      ?? CalibrationDigest.sha256(
        [
          "session-content-auto-observation",
          automaticAssignment.sessionID,
          automaticAssignment.sourceWorkID,
          automaticAssignment.workID,
          observation?.sourceRevisionReference.contentObservation.reconstructedContentDigest ?? "",
          observation?.candidateRevisionReference.contentObservation.reconstructedContentDigest
            ?? "",
          automaticAssignment.candidateGeneration?.invalidationToken ?? "",
          automaticAssignment.algorithmVersion,
          automaticAssignment.calibrationID,
        ].joined(separator: ":"))
    return CalibrationObservationSnapshot(
      id: observationID,
      kind: .sessionContainmentAutomaticAssignment,
      taskFamily: .workContainment,
      algorithmFamily: "session-content-lineage",
      algorithmVersion: automaticAssignment.algorithmVersion,
      calibrationID: automaticAssignment.calibrationID,
      predictionDisposition: .automatic,
      predictedLabel: .sameSong,
      score: automaticAssignment.score,
      binding: observation.map {
        .session(
          CalibrationSessionObservationBinding(
            source: entityReference(for: $0.sourceRevisionReference),
            candidate: entityReference(for: $0.candidateRevisionReference)))
      },
      provenanceKeys: hashedProvenance(
        [
          automaticAssignment.sessionID,
          automaticAssignment.sourceWorkID,
          automaticAssignment.workID,
          automaticAssignment.candidateGeneration?.invalidationToken,
        ]),
      evidenceFamilies: observedEvidenceFamilies(from: observation),
      unavailableEvidenceFamilies: unavailableEvidenceFamilies(from: observation),
      features: [
        CalibrationFeature(
          name: "matchedAnchorCount",
          value: "\(automaticAssignment.matchedAnchorIDs.count)"),
        CalibrationFeature(
          name: "candidateGenerationTokenDigest",
          value: CalibrationDigest.sha256(
            automaticAssignment.candidateGeneration?.invalidationToken ?? "none")),
        CalibrationFeature(
          name: "sourceMeasuredAudioDurationSeconds",
          value: observation?.sourceMeasuredAudioDurationSeconds.map(doubleString) ?? "unknown"),
        CalibrationFeature(
          name: "candidateMeasuredAudioDurationSeconds",
          value: observation?.candidateMeasuredAudioDurationSeconds.map(doubleString) ?? "unknown"),
      ],
      corpusPartition: corpusPartition,
      performance: performance,
      observedAt: observation?.sourceRevisionReference.reviewedAt)
  }

  public static func sessionRelationship(
    id: String,
    source: StudioRevisionReference,
    candidate: StudioRevisionReference,
    predictedLabel: CalibrationDecisionLabel?,
    predictionDisposition: CalibrationPredictionDisposition,
    score: Double?,
    algorithmFamily: String,
    algorithmVersion: String,
    calibrationID: String? = nil,
    evidenceFamilies: [CalibrationEvidenceFamily] = [],
    unavailableEvidenceFamilies: [CalibrationEvidenceFamily] = [],
    features: [CalibrationFeature] = [],
    corpusPartition: CalibrationCorpusPartition? = nil,
    performance: CalibrationObservationPerformance? = nil,
    observedAt: Date? = nil
  ) -> CalibrationObservationSnapshot {
    CalibrationObservationSnapshot(
      id: id,
      kind: .sessionRelationshipObservation,
      taskFamily: .sessionRelationship,
      algorithmFamily: algorithmFamily,
      algorithmVersion: algorithmVersion,
      calibrationID: calibrationID,
      predictionDisposition: predictionDisposition,
      predictedLabel: predictedLabel,
      score: score,
      binding: .session(
        CalibrationSessionObservationBinding(
          source: entityReference(for: source),
          candidate: entityReference(for: candidate))),
      provenanceKeys: hashedProvenance([source.revisionID, candidate.revisionID]),
      evidenceFamilies: evidenceFamilies,
      unavailableEvidenceFamilies: unavailableEvidenceFamilies,
      features: features,
      corpusPartition: corpusPartition,
      performance: performance,
      observedAt: observedAt)
  }

  public static func from(
    artifact: AudioArtifactLineageInput,
    resolution: AudioArtifactLinkResolution,
    algorithmVersion: String = AudioArtifactLinker.algorithmVersion,
    calibrationID: String? = nil,
    corpusPartition: CalibrationCorpusPartition? = nil,
    performance: CalibrationObservationPerformance? = nil
  ) -> CalibrationObservationSnapshot {
    let best = resolution.bestCandidate
    let revisionNodeID = resolution.proposedRevisionNodeID ?? resolution.selectedRevisionNodeID
    let immutableFile = artifact.exportObservation?.immutableFileObservation
    let binding: CalibrationObservationBinding? =
      if let immutableFile, let revisionNodeID {
        .export(
          CalibrationExportObservationBinding(
            artifact: CalibrationImmutableEntityReference(
              identifier: CalibrationDigest.sha256("artifact:\(artifact.nodeID)"),
              observationDigest: CalibrationDigest.sha256(immutableFile.observationKey)),
            revisionIdentifier: CalibrationDigest.sha256("revision:\(revisionNodeID)")))
      } else {
        nil
      }
    let evidenceFamilies: [CalibrationEvidenceFamily] = [
      best?.anchorCoverage ?? 0 > 0 ? .arrangement : nil,
      (best?.exportCompatibility ?? 0) > 0 ? .exportDNA : nil,
      immutableFile == nil ? nil : .immutableArtifactObservation,
      (best?.durationCompatibility ?? 0) > 0 ? .technicalMetadata : nil,
      (best?.chronologyCompatibility ?? 0) > 0 ? .chronology : nil,
      (best?.variantCompatibility ?? 0) > 0 ? .variantQualifier : nil,
    ].compactMap { $0 }
    let predictedLabel: CalibrationDecisionLabel? =
      revisionNodeID == nil ? nil : .correctExportAssociation
    let disposition: CalibrationPredictionDisposition =
      switch resolution.confidence {
      case .highConfidenceDerivative: .automatic
      case .suggested: .suggested
      default: .abstained
      }
    return CalibrationObservationSnapshot(
      id: CalibrationDigest.sha256(
        [
          "artifact-association",
          artifact.nodeID,
          immutableFile?.observationKey ?? "missing-immutable-observation",
          revisionNodeID ?? "abstained",
          algorithmVersion,
        ].joined(separator: ":")),
      kind: .exportArtifactAssociation,
      taskFamily: .exportAssociation,
      algorithmFamily: "audio-artifact-association",
      algorithmVersion: algorithmVersion,
      calibrationID: calibrationID,
      predictionDisposition: disposition,
      predictedLabel: predictedLabel,
      score: best?.score,
      binding: binding,
      provenanceKeys: hashedProvenance([artifact.nodeID, revisionNodeID]),
      evidenceFamilies: evidenceFamilies,
      features: [
        CalibrationFeature(
          name: "matchedAnchorCount",
          value: "\(best?.matchedAnchorCount ?? 0)"),
        CalibrationFeature(
          name: "metadataConflictCount",
          value: "\(best?.metadataConflictCount ?? 0)"),
      ],
      corpusPartition: corpusPartition,
      performance: performance,
      observedAt: artifact.exportObservation?.revalidatedAt)
  }

  public static func from(
    audioMatch observation: AudioMatchObservation,
    corpusPartition: CalibrationCorpusPartition? = nil,
    performance: CalibrationObservationPerformance? = nil
  ) -> CalibrationObservationSnapshot {
    let predictedLabel: CalibrationDecisionLabel? =
      switch observation.capability {
      case .nearIdentity: .sameRecording
      case .transformation: .transformedUse
      default: nil
      }
    let evidenceFamilies: [CalibrationEvidenceFamily] = [
      observation.capability == .nearIdentity ? .nearIdentityFingerprint : nil,
      observation.capability == .transformation ? .transformedFingerprint : nil,
      observation.sourceObservation == nil || observation.targetObservation == nil
        ? nil : .technicalMetadata,
    ].compactMap { $0 }
    let binding: CalibrationObservationBinding? =
      if let sourceObservation = observation.sourceObservation,
        let targetObservation = observation.targetObservation,
        let sourceFingerprint = observation.fingerprintDigest,
        let targetFingerprint = observation.targetFingerprintDigest,
        let fingerprintVersion = observation.fingerprintVersion,
        let resourceUsage = observation.resourceUsage
      {
        .audio(
          CalibrationAudioObservationBinding(
            source: CalibrationImmutableEntityReference(
              identifier: CalibrationDigest.sha256("audio-node:\(observation.sourceNodeID)"),
              observationDigest: audioObservationDigest(sourceObservation)),
            target: CalibrationImmutableEntityReference(
              identifier: CalibrationDigest.sha256("audio-node:\(observation.targetNodeID)"),
              observationDigest: audioObservationDigest(targetObservation)),
            sourceFingerprintDigest: CalibrationDigest.sha256(sourceFingerprint),
            targetFingerprintDigest: CalibrationDigest.sha256(targetFingerprint),
            fingerprintVersion: fingerprintVersion,
            materialClass: observation.materialClass,
            resourceUsage: resourceUsage,
            sourceRange: observation.sourceRange,
            targetRange: observation.targetRange,
            transform: observation.transform,
            excerptRetrieval: observation.excerptRetrieval))
      } else {
        nil
      }
    return CalibrationObservationSnapshot(
      id: CalibrationDigest.sha256(
        [
          "audio-match",
          observation.sourceNodeID,
          observation.targetNodeID,
          observation.algorithmVersion,
          observation.capability.rawValue,
        ].joined(separator: ":")),
      kind: .audioMatchObservation,
      taskFamily: .audioMatch,
      algorithmFamily: observation.algorithmFamily ?? "audio-match",
      algorithmVersion: observation.algorithmVersion,
      predictionDisposition: predictedLabel == nil ? .abstained : .suggested,
      predictedLabel: predictedLabel,
      score: observation.score,
      binding: binding,
      provenanceKeys: hashedProvenance([observation.sourceNodeID, observation.targetNodeID]),
      evidenceFamilies: evidenceFamilies,
      features: [
        CalibrationFeature(
          name: "matchedCoverage", value: doubleString(observation.matchedCoverage)),
        CalibrationFeature(name: "runnerUpMargin", value: doubleString(observation.runnerUpMargin)),
        CalibrationFeature(
          name: "coveredDurationSeconds",
          value: observation.coveredDurationSeconds.map(doubleString) ?? "unknown"),
        CalibrationFeature(
          name: "sourceRange",
          value: rangeString(observation.sourceRange)),
        CalibrationFeature(
          name: "targetRange",
          value: rangeString(observation.targetRange)),
        CalibrationFeature(
          name: "transform",
          value: transformString(observation.transform)),
        CalibrationFeature(
          name: "excerptDiagnostics",
          value: excerptString(observation.excerptRetrieval)),
      ],
      corpusPartition: corpusPartition,
      performance: performance)
  }

  public static func acceptedRelationship(
    id: String,
    binding: CalibrationAcceptedRelationshipBinding,
    algorithmFamily: String,
    algorithmVersion: String,
    calibrationID: String? = nil,
    corpusPartition: CalibrationCorpusPartition? = nil,
    performance: CalibrationObservationPerformance? = nil,
    observedAt: Date? = nil
  ) -> CalibrationObservationSnapshot {
    CalibrationObservationSnapshot(
      id: id,
      kind: .acceptedRelationshipObservation,
      taskFamily: .acceptedRelationship,
      algorithmFamily: algorithmFamily,
      algorithmVersion: algorithmVersion,
      calibrationID: calibrationID,
      predictionDisposition: .suggested,
      predictedLabel: binding.relationshipKind.label,
      score: 1,
      binding: .acceptedRelationship(binding),
      provenanceKeys: hashedProvenance(
        [binding.source.identifier, binding.target.identifier]),
      evidenceFamilies: [.userAuthority],
      corpusPartition: corpusPartition,
      performance: performance,
      observedAt: observedAt)
  }

  private static func entityReference(
    for reference: StudioRevisionReference
  ) -> CalibrationImmutableEntityReference {
    let observation = reference.contentObservation
    return CalibrationImmutableEntityReference(
      identifier: CalibrationDigest.sha256("revision:\(reference.revisionID)"),
      observationDigest: CalibrationDigest.sha256(
        [
          observation.reconstructedContentDigest,
          String(observation.compressedBytes),
          observation.modifiedAtNanoseconds.map(String.init) ?? "unknown",
          reference.catalogueAlgorithmVersion,
          reference.catalogueGenerationID,
        ].joined(separator: ":")))
  }

  private static func audioObservationDigest(
    _ observation: AudioMatchSourceObservation
  ) -> String {
    CalibrationDigest.sha256(
      [
        observation.contentSHA256,
        String(observation.bytes),
        observation.modifiedAtNanoseconds.map(String.init) ?? "unknown",
        observation.resourceIdentity ?? "unknown",
      ].joined(separator: ":"))
  }

  private static func hashedProvenance(_ values: [String?]) -> [String] {
    normalized(
      values: values.compactMap(cleaned).map {
        "sha256:\(CalibrationDigest.sha256($0))"
      })
  }

  private static func observedEvidenceFamilies(
    from observation: DirectionalSessionContainmentObservation?
  ) -> [CalibrationEvidenceFamily] {
    guard let observation else { return [] }
    return observation.matchedEvidenceGroups.compactMap {
      CalibrationEvidenceFamily(rawValue: $0.family.rawValue)
    }
  }

  private static func unavailableEvidenceFamilies(
    from observation: DirectionalSessionContainmentObservation?
  ) -> [CalibrationEvidenceFamily] {
    guard let observation else { return [] }
    return observation.unavailableEvidenceFamilies.compactMap {
      CalibrationEvidenceFamily(rawValue: $0.rawValue)
    }
  }

  private static func normalized(values: [String]) -> [String] {
    Array(
      Set(values.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })
    ).sorted()
  }

  private static func normalized(features: [CalibrationFeature]) -> [CalibrationFeature] {
    features
      .filter { !$0.name.isEmpty }
      .sorted {
        if $0.name != $1.name { return $0.name < $1.name }
        return $0.value < $1.value
      }
  }

  private static func cleaned(_ value: String?) -> String? {
    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty
    else { return nil }
    return value
  }

  private static func doubleString(_ value: Double) -> String {
    String(format: "%.6f", value)
  }

  private static func rangeString(_ range: AudioTimeRange?) -> String {
    guard let range else { return "none" }
    return "\(doubleString(range.startSeconds)):\(doubleString(range.durationSeconds))"
  }

  private static func transformString(_ transform: AudioTransformEvidence?) -> String {
    guard let transform else { return "none" }
    return [
      transform.timeFactor.map(doubleString) ?? "none",
      transform.pitchSemitones.map(doubleString) ?? "none",
      transform.reversed ? "reversed" : "forward",
    ].joined(separator: ":")
  }

  private static func excerptString(_ diagnostics: AudioExcerptRetrievalDiagnostics?) -> String {
    guard let diagnostics else { return "none" }
    return [
      doubleString(diagnostics.windowDurationSeconds),
      doubleString(diagnostics.hopDurationSeconds),
      String(diagnostics.matchedWindowCount),
      String(diagnostics.consecutiveWindowCount),
      String(diagnostics.totalQueryWindowCount),
      String(diagnostics.candidateWindowCount),
      doubleString(diagnostics.offsetConsistency),
      doubleString(diagnostics.scoreDistribution.minimum),
      doubleString(diagnostics.scoreDistribution.mean),
      doubleString(diagnostics.scoreDistribution.maximum),
    ].joined(separator: ":")
  }

  private static func makeFeatureDigest(
    kind: CalibrationObservationKind,
    taskFamily: CalibrationReviewTaskFamily,
    algorithmFamily: String,
    algorithmVersion: String,
    calibrationID: String?,
    predictionDisposition: CalibrationPredictionDisposition,
    predictedLabel: CalibrationDecisionLabel?,
    score: Double?,
    binding: CalibrationObservationBinding?,
    provenanceKeys: [String],
    evidenceFamilies: [CalibrationEvidenceFamily],
    unavailableEvidenceFamilies: [CalibrationEvidenceFamily],
    features: [CalibrationFeature],
    corpusPartition: CalibrationCorpusPartition?,
    performance: CalibrationObservationPerformance?,
    observedAt: Date?
  ) -> String {
    struct DigestPayload: Encodable {
      let kind: CalibrationObservationKind
      let taskFamily: CalibrationReviewTaskFamily
      let algorithmFamily: String
      let algorithmVersion: String
      let calibrationID: String?
      let predictionDisposition: CalibrationPredictionDisposition
      let predictedLabel: CalibrationDecisionLabel?
      let score: Double?
      let binding: CalibrationObservationBinding?
      let provenanceKeys: [String]
      let evidenceFamilies: [CalibrationEvidenceFamily]
      let unavailableEvidenceFamilies: [CalibrationEvidenceFamily]
      let features: [CalibrationFeature]
      let corpusPartition: CalibrationCorpusPartition?
      let performance: CalibrationObservationPerformance?
      let observedAt: Date?
    }
    return CalibrationDigest.sha256(
      DigestPayload(
        kind: kind,
        taskFamily: taskFamily,
        algorithmFamily: algorithmFamily,
        algorithmVersion: algorithmVersion,
        calibrationID: calibrationID,
        predictionDisposition: predictionDisposition,
        predictedLabel: predictedLabel,
        score: score,
        binding: binding,
        provenanceKeys: provenanceKeys,
        evidenceFamilies: evidenceFamilies,
        unavailableEvidenceFamilies: unavailableEvidenceFamilies,
        features: features,
        corpusPartition: corpusPartition,
        performance: performance,
        observedAt: observedAt))
  }

  private enum CodingKeys: String, CodingKey {
    case id
    case kind
    case taskFamily
    case algorithmFamily
    case algorithmVersion
    case calibrationID
    case predictionDisposition
    case predictedLabel
    case score
    case binding
    case provenanceKeys
    case evidenceFamilies
    case unavailableEvidenceFamilies
    case featureDigest
    case features
    case corpusPartition
    case performance
    case observedAt
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      id: try container.decode(String.self, forKey: .id),
      kind: try container.decode(CalibrationObservationKind.self, forKey: .kind),
      taskFamily: try container.decode(CalibrationReviewTaskFamily.self, forKey: .taskFamily),
      algorithmFamily: try container.decode(String.self, forKey: .algorithmFamily),
      algorithmVersion: try container.decode(String.self, forKey: .algorithmVersion),
      calibrationID: try container.decodeIfPresent(String.self, forKey: .calibrationID),
      predictionDisposition: try container.decode(
        CalibrationPredictionDisposition.self,
        forKey: .predictionDisposition),
      predictedLabel: try container.decodeIfPresent(
        CalibrationDecisionLabel.self,
        forKey: .predictedLabel),
      score: try container.decodeIfPresent(Double.self, forKey: .score),
      binding: try container.decodeIfPresent(CalibrationObservationBinding.self, forKey: .binding),
      provenanceKeys: try container.decode([String].self, forKey: .provenanceKeys),
      evidenceFamilies: try container.decode(
        [CalibrationEvidenceFamily].self,
        forKey: .evidenceFamilies),
      unavailableEvidenceFamilies: try container.decode(
        [CalibrationEvidenceFamily].self,
        forKey: .unavailableEvidenceFamilies),
      features: try container.decode([CalibrationFeature].self, forKey: .features),
      corpusPartition: try container.decodeIfPresent(
        CalibrationCorpusPartition.self,
        forKey: .corpusPartition),
      performance: try container.decodeIfPresent(
        CalibrationObservationPerformance.self,
        forKey: .performance),
      observedAt: try container.decodeIfPresent(Date.self, forKey: .observedAt),
      featureDigest: try container.decode(String.self, forKey: .featureDigest))
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(id, forKey: .id)
    try container.encode(kind, forKey: .kind)
    try container.encode(taskFamily, forKey: .taskFamily)
    try container.encode(algorithmFamily, forKey: .algorithmFamily)
    try container.encode(algorithmVersion, forKey: .algorithmVersion)
    try container.encodeIfPresent(calibrationID, forKey: .calibrationID)
    try container.encode(predictionDisposition, forKey: .predictionDisposition)
    try container.encodeIfPresent(predictedLabel, forKey: .predictedLabel)
    try container.encodeIfPresent(score, forKey: .score)
    try container.encodeIfPresent(binding, forKey: .binding)
    try container.encode(provenanceKeys, forKey: .provenanceKeys)
    try container.encode(evidenceFamilies, forKey: .evidenceFamilies)
    try container.encode(unavailableEvidenceFamilies, forKey: .unavailableEvidenceFamilies)
    try container.encode(featureDigest, forKey: .featureDigest)
    try container.encode(features, forKey: .features)
    try container.encodeIfPresent(corpusPartition, forKey: .corpusPartition)
    try container.encodeIfPresent(performance, forKey: .performance)
    try container.encodeIfPresent(observedAt, forKey: .observedAt)
  }
}

public struct CalibrationObservationInput: Codable, Sendable, Equatable {
  public let observationID: String
  public let expectedFeatureDigest: String

  public init(observationID: String, expectedFeatureDigest: String) {
    self.observationID = observationID.trimmingCharacters(in: .whitespacesAndNewlines)
    self.expectedFeatureDigest = expectedFeatureDigest.lowercased()
  }
}

public struct CalibrationObservationRegistry: Sendable, Equatable {
  public let observations: [CalibrationObservationSnapshot]

  public init(observations: [CalibrationObservationSnapshot]) {
    self.observations = observations.sorted { $0.id < $1.id }
  }

  var uniqueByID: [String: CalibrationObservationSnapshot]? {
    var result: [String: CalibrationObservationSnapshot] = [:]
    for observation in observations {
      guard result.updateValue(observation, forKey: observation.id) == nil else { return nil }
    }
    return result
  }
}

public struct CalibrationReviewDecisionDraft: Codable, Sendable, Equatable {
  public let id: String
  public let label: CalibrationDecisionLabel
  public let primaryObservationID: String
  public let observationInputs: [CalibrationObservationInput]
  public let algorithmFamily: String
  public let algorithmVersion: String
  public let calibrationID: String?
  public let reproductionFeatures: [CalibrationFeature]
  public let decidedAt: Date
  public let corpusPartition: CalibrationCorpusPartition?
  public let notes: String?
  public let supersedesDecisionID: String?

  public init(
    id: String,
    label: CalibrationDecisionLabel,
    primaryObservationID: String,
    observationInputs: [CalibrationObservationInput],
    algorithmFamily: String,
    algorithmVersion: String,
    calibrationID: String? = nil,
    reproductionFeatures: [CalibrationFeature] = [],
    decidedAt: Date = Date(),
    corpusPartition: CalibrationCorpusPartition? = nil,
    notes: String? = nil,
    supersedesDecisionID: String? = nil
  ) {
    self.id = id.trimmingCharacters(in: .whitespacesAndNewlines)
    self.label = label
    self.primaryObservationID = primaryObservationID.trimmingCharacters(
      in: .whitespacesAndNewlines)
    self.observationInputs = observationInputs.sorted { $0.observationID < $1.observationID }
    self.algorithmFamily = algorithmFamily.trimmingCharacters(in: .whitespacesAndNewlines)
    self.algorithmVersion = algorithmVersion.trimmingCharacters(in: .whitespacesAndNewlines)
    self.calibrationID = calibrationID?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.reproductionFeatures = reproductionFeatures.sorted {
      if $0.name != $1.name { return $0.name < $1.name }
      return $0.value < $1.value
    }
    self.decidedAt = decidedAt
    self.corpusPartition = corpusPartition
    self.notes = notes?.trimmingCharacters(in: .whitespacesAndNewlines)
    self.supersedesDecisionID = supersedesDecisionID?.trimmingCharacters(
      in: .whitespacesAndNewlines)
  }
}

public struct CalibrationReviewDecisionRecord: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let label: CalibrationDecisionLabel
  public let primaryObservationID: String
  public let observations: [CalibrationObservationSnapshot]
  public let algorithmFamily: String
  public let algorithmVersion: String
  public let calibrationID: String?
  public let reproductionFeatures: [CalibrationFeature]
  public let decidedAt: Date
  public let corpusPartition: CalibrationCorpusPartition?
  public let notes: String?
  public let supersedesDecisionID: String?
  public let supersededByDecisionID: String?
  public let supersededAt: Date?

  public init(
    id: String,
    label: CalibrationDecisionLabel,
    primaryObservationID: String,
    observations: [CalibrationObservationSnapshot],
    algorithmFamily: String,
    algorithmVersion: String,
    calibrationID: String?,
    reproductionFeatures: [CalibrationFeature],
    decidedAt: Date,
    corpusPartition: CalibrationCorpusPartition?,
    notes: String?,
    supersedesDecisionID: String?,
    supersededByDecisionID: String? = nil,
    supersededAt: Date? = nil
  ) {
    self.id = id
    self.label = label
    self.primaryObservationID = primaryObservationID
    self.observations = observations.sorted { $0.id < $1.id }
    self.algorithmFamily = algorithmFamily
    self.algorithmVersion = algorithmVersion
    self.calibrationID = calibrationID
    self.reproductionFeatures = reproductionFeatures.sorted {
      if $0.name != $1.name { return $0.name < $1.name }
      return $0.value < $1.value
    }
    self.decidedAt = decidedAt
    self.corpusPartition = corpusPartition
    self.notes = notes
    self.supersedesDecisionID = supersedesDecisionID
    self.supersededByDecisionID = supersededByDecisionID
    self.supersededAt = supersededAt
  }

  public var family: CalibrationReviewTaskFamily { label.family }
  public var isActive: Bool { supersededByDecisionID == nil }
  public var isAuthoritative: Bool {
    guard let binding = primaryObservation?.binding else { return false }
    if case .legacyUnresolved = binding { return false }
    return true
  }
  public var isEvaluationEligible: Bool { isAuthoritative }

  public var primaryObservation: CalibrationObservationSnapshot? {
    observations.first { $0.id == primaryObservationID }
  }

  var subjectKey: String? { primaryObservation?.binding?.subjectKey }

  func superseded(by decisionID: String, at date: Date) -> CalibrationReviewDecisionRecord {
    CalibrationReviewDecisionRecord(
      id: id,
      label: label,
      primaryObservationID: primaryObservationID,
      observations: observations,
      algorithmFamily: algorithmFamily,
      algorithmVersion: algorithmVersion,
      calibrationID: calibrationID,
      reproductionFeatures: reproductionFeatures,
      decidedAt: decidedAt,
      corpusPartition: corpusPartition,
      notes: notes,
      supersedesDecisionID: supersedesDecisionID,
      supersededByDecisionID: decisionID,
      supersededAt: date)
  }
}

public struct CalibrationReviewDirectory: Codable, Sendable, Equatable {
  public let decisions: [CalibrationReviewDecisionRecord]

  public init(decisions: [CalibrationReviewDecisionRecord] = []) {
    self.decisions = decisions.sorted {
      $0.decidedAt < $1.decidedAt || ($0.decidedAt == $1.decidedAt && $0.id < $1.id)
    }
  }
}

public enum CalibrationReviewStoreError: Error, LocalizedError, Equatable {
  case unsupportedSchema(Int)
  case duplicateDecision(String)
  case duplicateObservation(String)
  case missingPrimaryObservation(String)
  case missingObservation(String)
  case staleObservationIdentifier(String)
  case invalidObservationBinding(String)
  case pathOnlyObservationIdentity(String)
  case observationFamilyMismatch(String)
  case invalidValue(String)
  case corruptLedger(String)
  case privacyViolation(String)
  case resourceLimitExceeded(String)
  case missingSupersededDecision(String)
  case alreadySuperseded(String)
  case supersededDecisionScopeMismatch(String)
  case ambiguousActiveDecision(String)
  case coordinationFailed(Int32)
  case unsafeLocalFile(String)
  case localFileChanged(String)

  public var errorDescription: String? {
    switch self {
    case .unsupportedSchema(let schema):
      "The calibration review ledger uses unsupported schema \(schema)."
    case .duplicateDecision(let id):
      "A calibration review decision with id \(id) already exists."
    case .duplicateObservation(let id):
      "Observation \(id) appears more than once."
    case .missingPrimaryObservation(let id):
      "Primary observation \(id) was not provided."
    case .missingObservation(let id):
      "Observation \(id) is missing from the current registry."
    case .staleObservationIdentifier(let id):
      "Observation \(id) no longer matches its canonical reproducibility digest."
    case .invalidObservationBinding(let id):
      "Observation \(id) lacks the required immutable kind-specific binding."
    case .pathOnlyObservationIdentity(let id):
      "Observation \(id) contains mutable path authority."
    case .observationFamilyMismatch(let id):
      "Observation \(id) does not belong to the decision label's task family."
    case .invalidValue(let field):
      "Calibration value \(field) is invalid."
    case .corruptLedger(let reason):
      "The calibration review ledger is corrupt: \(reason)."
    case .privacyViolation(let field):
      "Calibration value \(field) contains disallowed private data."
    case .resourceLimitExceeded(let resource):
      "Calibration resource limit exceeded: \(resource)."
    case .missingSupersededDecision(let id):
      "Superseded decision \(id) no longer exists."
    case .alreadySuperseded(let id):
      "Decision \(id) has already been superseded."
    case .supersededDecisionScopeMismatch(let id):
      "Decision \(id) cannot be superseded by a different immutable review subject."
    case .ambiguousActiveDecision(let subject):
      "More than one active decision exists for immutable subject \(subject)."
    case .coordinationFailed(let code):
      "The calibration review ledger could not be locked (errno \(code))."
    case .unsafeLocalFile(let reason):
      "The local calibration input is unsafe: \(reason)."
    case .localFileChanged(let reason):
      "The local calibration input changed while being read: \(reason)."
    }
  }
}

public enum CalibrationBoundedLocalFileReader {
  public static func read(_ url: URL, maximumBytes: Int) throws -> Data {
    guard
      let result = try readIfExists(
        url,
        maximumBytes: maximumBytes,
        resourceName: "local input bytes",
        enforcePrivatePermissions: false,
        testingAfterOpen: nil)
    else { throw CalibrationReviewStoreError.unsafeLocalFile("missing file") }
    return result.data
  }

  static func readIfExists(
    _ url: URL,
    maximumBytes: Int,
    resourceName: String,
    enforcePrivatePermissions: Bool,
    testingAfterOpen: (() -> Void)?
  ) throws -> CalibrationBoundedLocalFileRead? {
    guard url.isFileURL, maximumBytes >= 0 else {
      throw CalibrationReviewStoreError.unsafeLocalFile("invalid file URL or byte cap")
    }
    let normalizedPath = url.path.hasPrefix("/var/") ? "/private\(url.path)" : url.path
    let normalizedURL = URL(fileURLWithPath: normalizedPath)
    let parent = normalizedURL.deletingLastPathComponent()
    try rejectSymlinkComponents(parent)
    var parentPathStatus = stat()
    guard lstat(parent.path, &parentPathStatus) == 0,
      parentPathStatus.st_mode & S_IFMT == S_IFDIR
    else { throw CalibrationReviewStoreError.unsafeLocalFile("missing parent directory") }
    let parentDescriptor = Darwin.open(
      parent.path,
      O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
    guard parentDescriptor >= 0 else {
      throw CalibrationReviewStoreError.unsafeLocalFile("parent open failed (errno \(errno))")
    }
    defer { _ = Darwin.close(parentDescriptor) }
    var openedParentStatus = stat()
    guard fstat(parentDescriptor, &openedParentStatus) == 0,
      openedParentStatus.st_mode & S_IFMT == S_IFDIR,
      sameIdentity(openedParentStatus, parentPathStatus)
    else { throw CalibrationReviewStoreError.localFileChanged("parent directory identity") }

    let name = normalizedURL.lastPathComponent
    guard !name.isEmpty, name != ".", name != ".." else {
      throw CalibrationReviewStoreError.unsafeLocalFile("invalid file name")
    }
    let descriptor = openat(
      parentDescriptor,
      name,
      O_RDONLY | O_NOFOLLOW | O_NONBLOCK | O_CLOEXEC)
    if descriptor < 0, errno == ENOENT { return nil }
    guard descriptor >= 0 else {
      throw CalibrationReviewStoreError.unsafeLocalFile("file open failed (errno \(errno))")
    }
    defer { _ = Darwin.close(descriptor) }

    var initial = stat()
    guard fstat(descriptor, &initial) == 0 else {
      throw CalibrationReviewStoreError.unsafeLocalFile("file stat failed (errno \(errno))")
    }
    guard initial.st_mode & S_IFMT == S_IFREG else {
      throw CalibrationReviewStoreError.unsafeLocalFile("not a regular file")
    }
    guard initial.st_nlink == 1 else {
      throw CalibrationReviewStoreError.unsafeLocalFile("aliased file")
    }
    guard initial.st_size >= 0, initial.st_size <= off_t(maximumBytes) else {
      throw CalibrationReviewStoreError.resourceLimitExceeded(resourceName)
    }
    if enforcePrivatePermissions,
      fchmod(descriptor, mode_t(S_IRUSR | S_IWUSR)) != 0
    {
      throw CalibrationReviewStoreError.unsafeLocalFile("private permissions failed")
    }
    if enforcePrivatePermissions, fstat(descriptor, &initial) != 0 {
      throw CalibrationReviewStoreError.unsafeLocalFile("file restat failed (errno \(errno))")
    }
    guard initial.st_mode & S_IFMT == S_IFREG, initial.st_nlink == 1 else {
      throw CalibrationReviewStoreError.unsafeLocalFile("file changed during permission repair")
    }
    guard initial.st_size >= 0, initial.st_size <= off_t(maximumBytes) else {
      throw CalibrationReviewStoreError.resourceLimitExceeded(resourceName)
    }
    testingAfterOpen?()

    let expectedSize = Int(initial.st_size)
    var data = Data()
    data.reserveCapacity(expectedSize)
    var remaining = expectedSize
    var buffer = [UInt8](repeating: 0, count: min(64 * 1_024, max(remaining, 1)))
    while remaining > 0 {
      let requested = min(buffer.count, remaining)
      let count = buffer.withUnsafeMutableBytes { rawBuffer in
        Darwin.read(descriptor, rawBuffer.baseAddress, requested)
      }
      if count < 0, errno == EINTR { continue }
      guard count > 0 else {
        throw CalibrationReviewStoreError.localFileChanged("truncated during read")
      }
      data.append(contentsOf: buffer.prefix(count))
      remaining -= count
    }
    var extra: UInt8 = 0
    while true {
      let count = withUnsafeMutableBytes(of: &extra) { rawBuffer in
        Darwin.read(descriptor, rawBuffer.baseAddress, 1)
      }
      if count < 0, errno == EINTR { continue }
      guard count == 0 else {
        if count > 0 {
          throw CalibrationReviewStoreError.localFileChanged("grew during read")
        }
        throw CalibrationReviewStoreError.unsafeLocalFile("read failed (errno \(errno))")
      }
      break
    }

    var final = stat()
    guard fstat(descriptor, &final) == 0,
      final.st_mode & S_IFMT == S_IFREG,
      final.st_nlink == 1,
      sameIdentity(final, initial),
      final.st_size == initial.st_size,
      sameMutationTime(final, initial)
    else { throw CalibrationReviewStoreError.localFileChanged("descriptor identity or size") }
    var pathStatus = stat()
    guard fstatat(parentDescriptor, name, &pathStatus, AT_SYMLINK_NOFOLLOW) == 0,
      pathStatus.st_mode & S_IFMT == S_IFREG,
      pathStatus.st_nlink == 1,
      sameIdentity(pathStatus, initial),
      pathStatus.st_size == initial.st_size,
      sameMutationTime(pathStatus, initial)
    else { throw CalibrationReviewStoreError.localFileChanged("path identity") }
    var finalParentStatus = stat()
    guard lstat(parent.path, &finalParentStatus) == 0,
      finalParentStatus.st_mode & S_IFMT == S_IFDIR,
      sameIdentity(finalParentStatus, openedParentStatus)
    else { throw CalibrationReviewStoreError.localFileChanged("parent directory path") }
    return CalibrationBoundedLocalFileRead(
      data: data,
      device: UInt64(initial.st_dev),
      inode: UInt64(initial.st_ino),
      size: Int64(initial.st_size))
  }

  private static func rejectSymlinkComponents(_ url: URL) throws {
    var path = "/"
    for component in url.pathComponents.dropFirst() {
      path = URL(fileURLWithPath: path).appending(path: component).path
      var status = stat()
      guard lstat(path, &status) == 0 else {
        throw CalibrationReviewStoreError.unsafeLocalFile("missing path component")
      }
      guard status.st_mode & S_IFMT != S_IFLNK else {
        throw CalibrationReviewStoreError.unsafeLocalFile("symbolic-link component")
      }
    }
  }

  private static func sameIdentity(_ lhs: stat, _ rhs: stat) -> Bool {
    lhs.st_dev == rhs.st_dev && lhs.st_ino == rhs.st_ino
  }

  private static func sameMutationTime(_ lhs: stat, _ rhs: stat) -> Bool {
    lhs.st_mtimespec.tv_sec == rhs.st_mtimespec.tv_sec
      && lhs.st_mtimespec.tv_nsec == rhs.st_mtimespec.tv_nsec
      && lhs.st_ctimespec.tv_sec == rhs.st_ctimespec.tv_sec
      && lhs.st_ctimespec.tv_nsec == rhs.st_ctimespec.tv_nsec
  }
}

struct CalibrationBoundedLocalFileRead {
  let data: Data
  let device: UInt64
  let inode: UInt64
  let size: Int64
}

public struct CalibrationReviewStoreSnapshot: Sendable, Equatable {
  public let storeIdentity: String
  public let generation: UInt64
  public let contentDigest: String
  public let directory: CalibrationReviewDirectory

  init(
    storeIdentity: String,
    generation: UInt64,
    directory: CalibrationReviewDirectory
  ) {
    self.storeIdentity = storeIdentity
    self.generation = generation
    contentDigest = CalibrationDigest.sha256(directory)
    self.directory = directory
  }
}

public actor CalibrationReviewStore {
  public static let currentSchemaVersion = 2
  public let storageURL: URL
  private let testingAfterReadOpen: (() -> Void)?

  public init(storageURL: URL) {
    self.storageURL = storageURL
    testingAfterReadOpen = nil
  }

  init(storageURL: URL, testingAfterReadOpen: @escaping () -> Void) {
    self.storageURL = storageURL
    self.testingAfterReadOpen = testingAfterReadOpen
  }

  public static func defaultStorageURL(fileManager: FileManager = .default) throws -> URL {
    let support = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true)
    return
      support
      .appending(path: "Plugin Radar/Studio Time Machine", directoryHint: .isDirectory)
      .appending(path: "calibration-review.plist")
  }

  public func load() throws -> CalibrationReviewDirectory {
    try reload()
  }

  public func reload() throws -> CalibrationReviewDirectory {
    try withFileLock(exclusive: true) {
      let loaded = try loadUnlocked()
      if loaded.needsRewrite {
        try saveUnlocked(
          loaded.directory,
          storeIdentity: loaded.storeIdentity,
          generation: max(loaded.generation, 1))
      }
      return loaded.directory
    }
  }

  public func snapshot() throws -> CalibrationReviewStoreSnapshot {
    try withFileLock(exclusive: true) {
      let loaded = try loadUnlocked()
      let generation = max(loaded.generation, 1)
      if loaded.needsRewrite || loaded.generation == 0 {
        try saveUnlocked(
          loaded.directory,
          storeIdentity: loaded.storeIdentity,
          generation: generation)
      }
      return CalibrationReviewStoreSnapshot(
        storeIdentity: loaded.storeIdentity,
        generation: generation,
        directory: loaded.directory)
    }
  }

  @discardableResult
  public func append(
    _ draft: CalibrationReviewDecisionDraft,
    registry: CalibrationObservationRegistry
  ) throws -> CalibrationReviewDecisionRecord {
    try withFileLock(exclusive: true) {
      let loaded = try loadUnlocked()
      var directory = loaded.directory
      if directory.decisions.contains(where: { $0.id == draft.id }) {
        throw CalibrationReviewStoreError.duplicateDecision(draft.id)
      }
      try CalibrationReviewValidator.validate(draft: draft)
      guard let registryByID = registry.uniqueByID else {
        throw CalibrationReviewStoreError.duplicateObservation("registry")
      }
      let inputIDs = draft.observationInputs.map(\.observationID)
      guard Set(inputIDs).count == inputIDs.count else {
        throw CalibrationReviewStoreError.duplicateObservation("draft")
      }
      guard inputIDs.contains(draft.primaryObservationID) else {
        throw CalibrationReviewStoreError.missingPrimaryObservation(draft.primaryObservationID)
      }
      let resolved = try draft.observationInputs.map { input in
        guard let snapshot = registryByID[input.observationID] else {
          throw CalibrationReviewStoreError.missingObservation(input.observationID)
        }
        try CalibrationReviewValidator.validate(observation: snapshot)
        guard snapshot.featureDigest == input.expectedFeatureDigest,
          snapshot.hasCanonicalFeatureDigest
        else {
          throw CalibrationReviewStoreError.staleObservationIdentifier(input.observationID)
        }
        guard snapshot.taskFamily == draft.label.family,
          snapshot.kind.taskFamily == draft.label.family
        else {
          throw CalibrationReviewStoreError.observationFamilyMismatch(snapshot.id)
        }
        return snapshot
      }
      guard let primary = resolved.first(where: { $0.id == draft.primaryObservationID }),
        let subjectKey = primary.binding?.subjectKey
      else {
        throw CalibrationReviewStoreError.missingPrimaryObservation(draft.primaryObservationID)
      }
      try CalibrationReviewValidator.validate(label: draft.label, for: primary)
      guard draft.algorithmFamily == primary.algorithmFamily,
        draft.algorithmVersion == primary.algorithmVersion,
        draft.calibrationID == primary.calibrationID,
        draft.corpusPartition == nil || draft.corpusPartition == primary.corpusPartition
      else {
        throw CalibrationReviewStoreError.invalidValue("decision.reproductionMetadata")
      }
      guard !draft.reproductionFeatures.isEmpty else {
        throw CalibrationReviewStoreError.invalidValue("decision.reproductionFeatures")
      }
      let activeMatches = directory.decisions.filter {
        $0.isActive && $0.family == draft.label.family && $0.subjectKey == subjectKey
      }
      guard activeMatches.count <= 1 else {
        throw CalibrationReviewStoreError.ambiguousActiveDecision(subjectKey)
      }
      let automaticSupersededID = activeMatches.first?.id
      let supersededID = draft.supersedesDecisionID ?? automaticSupersededID
      if let requested = draft.supersedesDecisionID, requested != automaticSupersededID {
        throw CalibrationReviewStoreError.supersededDecisionScopeMismatch(requested)
      }
      if let supersededID {
        guard let existingIndex = directory.decisions.firstIndex(where: { $0.id == supersededID })
        else { throw CalibrationReviewStoreError.missingSupersededDecision(supersededID) }
        let superseded = directory.decisions[existingIndex]
        guard superseded.isActive else {
          throw CalibrationReviewStoreError.alreadySuperseded(supersededID)
        }
        guard superseded.family == draft.label.family, superseded.subjectKey == subjectKey else {
          throw CalibrationReviewStoreError.supersededDecisionScopeMismatch(supersededID)
        }
        directory = CalibrationReviewDirectory(
          decisions: directory.decisions.enumerated().map { index, decision in
            index == existingIndex
              ? decision.superseded(by: draft.id, at: draft.decidedAt)
              : decision
          })
      }
      let record = CalibrationReviewDecisionRecord(
        id: draft.id,
        label: draft.label,
        primaryObservationID: draft.primaryObservationID,
        observations: resolved,
        algorithmFamily: draft.algorithmFamily,
        algorithmVersion: draft.algorithmVersion,
        calibrationID: draft.calibrationID,
        reproductionFeatures: draft.reproductionFeatures,
        decidedAt: draft.decidedAt,
        corpusPartition: draft.corpusPartition ?? primary.corpusPartition,
        notes: draft.notes,
        supersedesDecisionID: supersededID)
      directory = CalibrationReviewDirectory(decisions: directory.decisions + [record])
      try CalibrationReviewValidator.validate(directory: directory)
      guard loaded.generation < UInt64.max else {
        throw CalibrationReviewStoreError.corruptLedger("snapshot generation overflow")
      }
      try saveUnlocked(
        directory,
        storeIdentity: loaded.storeIdentity,
        generation: loaded.generation + 1)
      return record
    }
  }

  private func loadUnlocked() throws -> LoadedDirectory {
    guard
      let input = try CalibrationBoundedLocalFileReader.readIfExists(
        storageURL,
        maximumBytes: CalibrationReviewLimits.maximumFileBytes,
        resourceName: "ledger file bytes",
        enforcePrivatePermissions: true,
        testingAfterOpen: testingAfterReadOpen)
    else {
      return LoadedDirectory(
        directory: CalibrationReviewDirectory(),
        storeIdentity: CalibrationDigest.sha256(UUID().uuidString),
        generation: 0,
        needsRewrite: false)
    }
    let data = input.data
    let envelope = try PropertyListDecoder().decode(CalibrationReviewEnvelope.self, from: data)
    switch envelope.schemaVersion {
    case Self.currentSchemaVersion:
      let document = try PropertyListDecoder().decode(CalibrationReviewDocumentV2.self, from: data)
      let storeIdentity: String
      let generation: UInt64
      let needsRewrite: Bool
      switch (document.storeIdentity, document.generation) {
      case (.none, .none):
        guard document.payloadDigest == CalibrationDigest.sha256(document.directory) else {
          throw CalibrationReviewStoreError.corruptLedger("payload integrity mismatch")
        }
        storeIdentity = CalibrationDigest.sha256(UUID().uuidString)
        generation = 0
        needsRewrite = true
      case (.some(let identity), .some(let value)):
        guard identity.count == 64, identity.allSatisfy(\.isHexDigit), value > 0,
          document.payloadDigest
            == CalibrationDigest.sha256(
              CalibrationReviewPayloadV2(
                storeIdentity: identity,
                generation: value,
                directory: document.directory))
        else { throw CalibrationReviewStoreError.corruptLedger("payload integrity mismatch") }
        storeIdentity = identity
        generation = value
        needsRewrite = false
      default:
        throw CalibrationReviewStoreError.corruptLedger("incomplete snapshot identity")
      }
      try CalibrationReviewValidator.validate(directory: document.directory)
      return LoadedDirectory(
        directory: document.directory,
        storeIdentity: storeIdentity,
        generation: generation,
        needsRewrite: needsRewrite)
    case 1:
      let legacy = try PropertyListDecoder().decode(
        LegacyCalibrationReviewDocumentV1.self, from: data)
      let migrated = try CalibrationReviewMigrator.migrate(legacy.directory)
      try CalibrationReviewValidator.validate(directory: migrated)
      return LoadedDirectory(
        directory: migrated,
        storeIdentity: CalibrationDigest.sha256(UUID().uuidString),
        generation: 0,
        needsRewrite: true)
    default:
      throw CalibrationReviewStoreError.unsupportedSchema(envelope.schemaVersion)
    }
  }

  private func saveUnlocked(
    _ directory: CalibrationReviewDirectory,
    storeIdentity: String,
    generation: UInt64
  ) throws {
    try CalibrationReviewValidator.validate(directory: directory)
    guard storeIdentity.count == 64, storeIdentity.allSatisfy(\.isHexDigit), generation > 0 else {
      throw CalibrationReviewStoreError.corruptLedger("invalid snapshot identity")
    }
    let payload = CalibrationReviewPayloadV2(
      storeIdentity: storeIdentity,
      generation: generation,
      directory: directory)
    let document = CalibrationReviewDocumentV2(
      payloadDigest: CalibrationDigest.sha256(payload),
      storeIdentity: storeIdentity,
      generation: generation,
      directory: directory)
    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    let data = try encoder.encode(document)
    guard data.count <= CalibrationReviewLimits.maximumFileBytes else {
      throw CalibrationReviewStoreError.resourceLimitExceeded("encoded ledger bytes")
    }
    let parent = storageURL.deletingLastPathComponent()
    try createPrivateDirectoryIfNeeded(at: parent)
    try data.write(to: storageURL, options: [.atomic, .completeFileProtection])
    try FileManager.default.setAttributes(
      [.posixPermissions: 0o600],
      ofItemAtPath: storageURL.path)
  }

  private func withFileLock<T>(exclusive: Bool, _ body: () throws -> T) throws -> T {
    let processLock = CalibrationReviewProcessLockRegistry.shared.lock(for: storageURL.path)
    processLock.lock()
    defer { processLock.unlock() }
    let parent = storageURL.deletingLastPathComponent()
    try createPrivateDirectoryIfNeeded(at: parent)
    let lockURL = storageURL.appendingPathExtension("lock")
    let descriptor = Darwin.open(lockURL.path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    guard descriptor >= 0 else { throw CalibrationReviewStoreError.coordinationFailed(errno) }
    defer { Darwin.close(descriptor) }
    guard Darwin.fchmod(descriptor, S_IRUSR | S_IWUSR) == 0 else {
      throw CalibrationReviewStoreError.coordinationFailed(errno)
    }
    guard flock(descriptor, exclusive ? LOCK_EX : LOCK_SH) == 0 else {
      throw CalibrationReviewStoreError.coordinationFailed(errno)
    }
    defer { flock(descriptor, LOCK_UN) }
    return try body()
  }

  private func createPrivateDirectoryIfNeeded(at url: URL) throws {
    guard !FileManager.default.fileExists(atPath: url.path) else { return }
    try FileManager.default.createDirectory(
      at: url,
      withIntermediateDirectories: true,
      attributes: [.posixPermissions: 0o700])
  }
}

enum CalibrationReviewLimits {
  static let maximumFileBytes = 8 * 1_024 * 1_024
  static let maximumDecisions = 10_000
  static let maximumObservationsPerDecision = 16
  static let maximumFeatures = 64
  static let maximumProvenanceKeys = 32
  static let maximumEvidenceFamilies = CalibrationEvidenceFamily.allCases.count
  static let maximumIdentifierLength = 160
  static let maximumAlgorithmLength = 80
  static let maximumFeatureNameLength = 64
  static let maximumFeatureValueLength = 256
  static let maximumNoteLength = 2_048
  static let maximumDateSeconds = 253_402_300_799.0
  static let maximumElapsedMilliseconds = 604_800_000.0
  static let maximumPeakResidentMegabytes = 1_048_576.0
  static let maximumBytesScanned: Int64 = 1_099_511_627_776
  static let maximumComparedCandidateCount = 100_000_000
  static let maximumAudioDurationSeconds = 604_800.0
  static let maximumAudioFingerprintFrames = 100_000_000
  static let maximumAudioCandidateCount = 100_000
  static let maximumAudioFileBytes: Int64 = 1_099_511_627_776
  static let maximumAudioWorkingMemoryBytes: Int64 = 68_719_476_736
}

enum CalibrationPrivacy {
  static func validate(_ value: String, field: String, maximumLength: Int) throws {
    guard !value.isEmpty, value.utf8.count <= maximumLength else {
      throw CalibrationReviewStoreError.invalidValue(field)
    }
    guard !containsPath(value), !containsPersonalData(value) else {
      throw CalibrationReviewStoreError.privacyViolation(field)
    }
  }

  static func containsPath(_ value: String) -> Bool {
    let decoded = value.removingPercentEncoding ?? value
    var candidates = [decoded]
    let segments = decoded.split(whereSeparator: {
      $0.isWhitespace || "\"'()<>,;".contains($0)
    })
    for segmentValue in segments {
      let segment = String(segmentValue)
      candidates.append(segment)
      for separator in ["=", ":"] {
        var searchStart = segment.startIndex
        while let index = segment[searchStart...].firstIndex(of: Character(separator)) {
          let prefix = String(segment[..<index]).lowercased()
          let suffixStart = segment.index(after: index)
          if suffixStart < segment.endIndex {
            let suffix = String(segment[suffixStart...])
            let scheme = prefix.split(whereSeparator: { $0 == "=" || $0 == ":" }).last
            let isKnownURLScheme =
              separator == ":"
              && suffix.hasPrefix("//")
              && scheme.map {
                ["http", "https", "file", "smb", "afp", "ftp"].contains(String($0))
              }
                == true
            if !isKnownURLScheme {
              candidates.append(suffix)
            }
          }
          searchStart = suffixStart
        }
      }
    }
    return candidates.contains(where: isPathLikeCandidate)
  }

  private static func isPathLikeCandidate(_ value: String) -> Bool {
    let text = value.trimmingCharacters(
      in: CharacterSet(charactersIn: "\"'()[]{}<>,;"))
    let lower = text.lowercased()
    let homeForms = [
      "~/", "~\\", "$home/", "$home\\", "${home}/", "${home}\\",
      "$userprofile/", "$userprofile\\", "${userprofile}/", "${userprofile}\\",
      "%userprofile%/", "%userprofile%\\", "%homepath%/", "%homepath%\\",
    ]
    if lower.hasPrefix("file:") || homeForms.contains(where: lower.hasPrefix) {
      return true
    }
    if lower.hasPrefix("~"),
      lower.dropFirst().contains(where: { $0 == "/" || $0 == "\\" })
    {
      return true
    }
    if lower.hasPrefix("/") || lower.hasPrefix("\\\\") { return true }
    if text.count >= 3 {
      let characters = Array(text)
      if characters[0].isLetter, characters[1] == ":",
        characters[2] == "/" || characters[2] == "\\"
      {
        return true
      }
    }
    guard lower.contains("://"),
      let components = URLComponents(string: text),
      let scheme = components.scheme, !scheme.isEmpty
    else { return false }
    guard lower.hasPrefix("\(scheme.lowercased())://") else { return false }
    if scheme.lowercased() == "mailto" || scheme.lowercased() == "tel" { return false }
    return !components.path.isEmpty && components.path != "/"
  }

  static func containsPersonalData(_ value: String) -> Bool {
    let lower = value.lowercased()
    if lower.contains("mailto:") || lower.contains("tel:") { return true }
    let tokens = value.split(whereSeparator: { $0.isWhitespace || ",;()<>".contains($0) })
    return tokens.contains { token in
      let text = String(token)
      guard let at = text.firstIndex(of: "@") else { return false }
      return at != text.startIndex && text[text.index(after: at)...].contains(".")
    }
  }
}

private enum CalibrationReviewValidator {
  static func validate(
    label: CalibrationDecisionLabel,
    for observation: CalibrationObservationSnapshot
  ) throws {
    guard label.family == observation.taskFamily else {
      throw CalibrationReviewStoreError.observationFamilyMismatch(observation.id)
    }
    if case .acceptedRelationship(let binding) = observation.binding,
      label != binding.relationshipKind.label
    {
      throw CalibrationReviewStoreError.observationFamilyMismatch(observation.id)
    }
    if case .legacyUnresolved = observation.binding {
      throw CalibrationReviewStoreError.invalidObservationBinding(observation.id)
    }
  }

  static func validate(draft: CalibrationReviewDecisionDraft) throws {
    try identifier(draft.id, field: "decision.id")
    try identifier(draft.primaryObservationID, field: "decision.primaryObservationID")
    try algorithm(draft.algorithmFamily, field: "decision.algorithmFamily")
    try algorithm(draft.algorithmVersion, field: "decision.algorithmVersion")
    try optionalIdentifier(draft.calibrationID, field: "decision.calibrationID")
    try date(draft.decidedAt, field: "decision.decidedAt")
    try optionalIdentifier(draft.supersedesDecisionID, field: "decision.supersedesDecisionID")
    guard !draft.observationInputs.isEmpty,
      draft.observationInputs.count <= CalibrationReviewLimits.maximumObservationsPerDecision
    else {
      throw CalibrationReviewStoreError.resourceLimitExceeded("decision observations")
    }
    guard draft.reproductionFeatures.count <= CalibrationReviewLimits.maximumFeatures else {
      throw CalibrationReviewStoreError.resourceLimitExceeded("reproduction features")
    }
    for input in draft.observationInputs {
      try identifier(input.observationID, field: "observationInput.id")
      try digest(input.expectedFeatureDigest, field: "observationInput.digest")
    }
    try features(draft.reproductionFeatures, field: "decision.reproductionFeatures")
    if let notes = draft.notes {
      try CalibrationPrivacy.validate(
        notes,
        field: "decision.notes",
        maximumLength: CalibrationReviewLimits.maximumNoteLength)
    }
    if let partition = draft.corpusPartition { try validate(partition: partition) }
  }

  static func validate(observation: CalibrationObservationSnapshot) throws {
    try identifier(observation.id, field: "observation.id")
    guard observation.taskFamily == observation.kind.taskFamily else {
      throw CalibrationReviewStoreError.observationFamilyMismatch(observation.id)
    }
    if let predictedLabel = observation.predictedLabel,
      predictedLabel.family != observation.taskFamily
    {
      throw CalibrationReviewStoreError.observationFamilyMismatch(observation.id)
    }
    if observation.predictionDisposition == .abstained, observation.predictedLabel != nil {
      throw CalibrationReviewStoreError.invalidValue("observation.abstainedPrediction")
    }
    if observation.predictionDisposition != .abstained, observation.predictedLabel == nil {
      throw CalibrationReviewStoreError.invalidValue("observation.predictedLabel")
    }
    try algorithm(observation.algorithmFamily, field: "observation.algorithmFamily")
    try algorithm(observation.algorithmVersion, field: "observation.algorithmVersion")
    try optionalIdentifier(observation.calibrationID, field: "observation.calibrationID")
    if let score = observation.score {
      guard score.isFinite, (0...1).contains(score) else {
        throw CalibrationReviewStoreError.invalidValue("observation.score")
      }
    }
    if let observedAt = observation.observedAt {
      try date(observedAt, field: "observation.observedAt")
    }
    guard observation.hasCanonicalFeatureDigest else {
      throw CalibrationReviewStoreError.staleObservationIdentifier(observation.id)
    }
    try digest(observation.featureDigest, field: "observation.featureDigest")
    guard observation.provenanceKeys.count <= CalibrationReviewLimits.maximumProvenanceKeys else {
      throw CalibrationReviewStoreError.resourceLimitExceeded("observation provenance keys")
    }
    for value in observation.provenanceKeys {
      try CalibrationPrivacy.validate(
        value,
        field: "observation.provenance",
        maximumLength: CalibrationReviewLimits.maximumIdentifierLength)
    }
    guard observation.evidenceFamilies.count <= CalibrationReviewLimits.maximumEvidenceFamilies,
      observation.unavailableEvidenceFamilies.count
        <= CalibrationReviewLimits.maximumEvidenceFamilies
    else {
      throw CalibrationReviewStoreError.resourceLimitExceeded("evidence families")
    }
    guard
      Set(observation.evidenceFamilies).isDisjoint(
        with: Set(observation.unavailableEvidenceFamilies))
    else {
      throw CalibrationReviewStoreError.invalidValue("observation.evidenceAvailability")
    }
    try features(observation.features, field: "observation.features")
    if let partition = observation.corpusPartition { try validate(partition: partition) }
    if let performance = observation.performance {
      try validate(performance: performance)
    }
    guard let binding = observation.binding else {
      throw CalibrationReviewStoreError.invalidObservationBinding(observation.id)
    }
    try validate(binding: binding, for: observation)
  }

  static func validate(directory: CalibrationReviewDirectory) throws {
    guard directory.decisions.count <= CalibrationReviewLimits.maximumDecisions else {
      throw CalibrationReviewStoreError.resourceLimitExceeded("decision count")
    }
    var byID: [String: CalibrationReviewDecisionRecord] = [:]
    var observationDigestByID: [String: String] = [:]
    for decision in directory.decisions {
      guard byID.updateValue(decision, forKey: decision.id) == nil else {
        throw CalibrationReviewStoreError.duplicateDecision(decision.id)
      }
      try validate(record: decision)
      for observation in decision.observations {
        if let existing = observationDigestByID[observation.id],
          existing != observation.featureDigest
        {
          throw CalibrationReviewStoreError.staleObservationIdentifier(observation.id)
        }
        observationDigestByID[observation.id] = observation.featureDigest
      }
    }
    var activeBySubject: [String: String] = [:]
    for decision in directory.decisions where decision.isActive && decision.isAuthoritative {
      guard let subject = decision.subjectKey else {
        throw CalibrationReviewStoreError.corruptLedger("missing subject for \(decision.id)")
      }
      let authorityKey = "\(decision.family.rawValue):\(subject)"
      if activeBySubject.updateValue(decision.id, forKey: authorityKey) != nil {
        throw CalibrationReviewStoreError.ambiguousActiveDecision(subject)
      }
    }
    for decision in directory.decisions {
      if let previousID = decision.supersedesDecisionID {
        guard let previous = byID[previousID] else {
          throw CalibrationReviewStoreError.missingSupersededDecision(previousID)
        }
        guard previous.supersededByDecisionID == decision.id,
          previous.supersededAt == decision.decidedAt,
          previous.family == decision.family,
          previous.subjectKey == decision.subjectKey
        else {
          throw CalibrationReviewStoreError.corruptLedger(
            "broken supersession link \(previousID)")
        }
      }
      if let nextID = decision.supersededByDecisionID {
        guard let next = byID[nextID], next.supersedesDecisionID == decision.id else {
          throw CalibrationReviewStoreError.corruptLedger(
            "broken superseded-by link \(nextID)")
        }
      } else if decision.supersededAt != nil {
        throw CalibrationReviewStoreError.corruptLedger(
          "superseded date without successor \(decision.id)")
      }
      var visited = Set<String>()
      var current: CalibrationReviewDecisionRecord? = decision
      while let record = current, let nextID = record.supersededByDecisionID {
        guard visited.insert(record.id).inserted else {
          throw CalibrationReviewStoreError.corruptLedger("supersession cycle")
        }
        current = byID[nextID]
      }
    }
  }

  private static func validate(record: CalibrationReviewDecisionRecord) throws {
    try identifier(record.id, field: "decision.id")
    try identifier(record.primaryObservationID, field: "decision.primaryObservationID")
    try algorithm(record.algorithmFamily, field: "decision.algorithmFamily")
    try algorithm(record.algorithmVersion, field: "decision.algorithmVersion")
    try optionalIdentifier(record.calibrationID, field: "decision.calibrationID")
    try date(record.decidedAt, field: "decision.decidedAt")
    if let supersededAt = record.supersededAt {
      try date(supersededAt, field: "decision.supersededAt")
      guard supersededAt >= record.decidedAt else {
        throw CalibrationReviewStoreError.corruptLedger("supersession precedes decision")
      }
    }
    try optionalIdentifier(record.supersedesDecisionID, field: "decision.supersedesDecisionID")
    try optionalIdentifier(
      record.supersededByDecisionID,
      field: "decision.supersededByDecisionID")
    guard !record.observations.isEmpty,
      record.observations.count <= CalibrationReviewLimits.maximumObservationsPerDecision
    else {
      throw CalibrationReviewStoreError.resourceLimitExceeded("record observations")
    }
    var observationIDs = Set<String>()
    for observation in record.observations {
      guard observationIDs.insert(observation.id).inserted else {
        throw CalibrationReviewStoreError.duplicateObservation(observation.id)
      }
      try validate(observation: observation)
      guard observation.taskFamily == record.family else {
        throw CalibrationReviewStoreError.observationFamilyMismatch(observation.id)
      }
    }
    guard observationIDs.contains(record.primaryObservationID) else {
      throw CalibrationReviewStoreError.missingPrimaryObservation(record.primaryObservationID)
    }
    guard !record.reproductionFeatures.isEmpty,
      record.reproductionFeatures.count <= CalibrationReviewLimits.maximumFeatures
    else {
      throw CalibrationReviewStoreError.resourceLimitExceeded("reproduction features")
    }
    try features(record.reproductionFeatures, field: "decision.reproductionFeatures")
    guard let primary = record.primaryObservation,
      record.algorithmFamily == primary.algorithmFamily,
      record.algorithmVersion == primary.algorithmVersion,
      record.calibrationID == primary.calibrationID
    else {
      throw CalibrationReviewStoreError.corruptLedger("decision reproduction metadata mismatch")
    }
    if record.isAuthoritative {
      try validate(label: record.label, for: primary)
    } else {
      guard case .legacyUnresolved = primary.binding else {
        throw CalibrationReviewStoreError.corruptLedger("invalid unresolved legacy authority")
      }
    }
    if let observedAt = primary.observedAt, record.decidedAt < observedAt {
      throw CalibrationReviewStoreError.corruptLedger("decision precedes primary observation")
    }
    if let partition = record.corpusPartition { try validate(partition: partition) }
    guard record.corpusPartition == primary.corpusPartition else {
      throw CalibrationReviewStoreError.corruptLedger("partition mismatch")
    }
    if let notes = record.notes {
      try CalibrationPrivacy.validate(
        notes,
        field: "decision.notes",
        maximumLength: CalibrationReviewLimits.maximumNoteLength)
    }
  }

  private static func validate(
    binding: CalibrationObservationBinding,
    for observation: CalibrationObservationSnapshot
  ) throws {
    switch (observation.kind, binding) {
    case (.sessionContainmentSuggestion, .session(let value)),
      (.sessionContainmentAutomaticAssignment, .session(let value)),
      (.sessionRelationshipObservation, .session(let value)):
      try entity(value.source, field: "session.source")
      try entity(value.candidate, field: "session.candidate")
    case (.exportArtifactAssociation, .export(let value)):
      try entity(value.artifact, field: "export.artifact")
      try identifier(value.revisionIdentifier, field: "export.revision")
      guard observation.evidenceFamilies.contains(.immutableArtifactObservation) else {
        throw CalibrationReviewStoreError.invalidObservationBinding(observation.id)
      }
    case (.audioMatchObservation, .audio(let value)):
      try entity(value.source, field: "audio.source")
      try entity(value.target, field: "audio.target")
      try digest(value.sourceFingerprintDigest, field: "audio.sourceFingerprint")
      try digest(value.targetFingerprintDigest, field: "audio.targetFingerprint")
      try algorithm(value.fingerprintVersion, field: "audio.fingerprintVersion")
      try validate(resourceUsage: value.resourceUsage)
      try validate(range: value.sourceRange, field: "audio.sourceRange")
      try validate(range: value.targetRange, field: "audio.targetRange")
      try validate(transform: value.transform)
      try validate(excerpt: value.excerptRetrieval)
    case (.acceptedRelationshipObservation, .acceptedRelationship(let value)):
      try entity(value.source, field: "relationship.source")
      try entity(value.target, field: "relationship.target")
      guard observation.predictedLabel == value.relationshipKind.label else {
        throw CalibrationReviewStoreError.observationFamilyMismatch(observation.id)
      }
    case (_, .legacyUnresolved(let value)):
      guard value.originalKind == observation.kind,
        value.legacyFeatureDigest.count == 24,
        value.legacyFeatureDigest.allSatisfy(\.isHexDigit),
        !value.provenanceDigests.isEmpty,
        value.provenanceDigests.count <= CalibrationReviewLimits.maximumProvenanceKeys
      else {
        throw CalibrationReviewStoreError.invalidObservationBinding(observation.id)
      }
      for digestValue in value.provenanceDigests {
        try digest(digestValue, field: "legacy.provenanceDigest")
      }
    default:
      throw CalibrationReviewStoreError.invalidObservationBinding(observation.id)
    }
  }

  private static func validate(partition: CalibrationCorpusPartition) throws {
    try digest(partition.artistGroupDigest, field: "partition.artistGroupDigest")
    try digest(partition.songGroupDigest, field: "partition.songGroupDigest")
  }

  private static func validate(performance: CalibrationObservationPerformance) throws {
    for (field, value, maximum) in [
      (
        "performance.wallClockMilliseconds",
        performance.wallClockMilliseconds,
        CalibrationReviewLimits.maximumElapsedMilliseconds
      ),
      (
        "performance.cpuMilliseconds",
        performance.cpuMilliseconds,
        CalibrationReviewLimits.maximumElapsedMilliseconds
      ),
      (
        "performance.peakResidentMegabytes",
        performance.peakResidentMegabytes,
        CalibrationReviewLimits.maximumPeakResidentMegabytes
      ),
    ] {
      if let value, !value.isFinite || value < 0 || value > maximum {
        throw CalibrationReviewStoreError.invalidValue(field)
      }
    }
    if let bytes = performance.bytesScanned,
      bytes < 0 || bytes > CalibrationReviewLimits.maximumBytesScanned
    {
      throw CalibrationReviewStoreError.invalidValue("performance.bytesScanned")
    }
    if let count = performance.comparedCandidateCount,
      count < 0 || count > CalibrationReviewLimits.maximumComparedCandidateCount
    {
      throw CalibrationReviewStoreError.invalidValue("performance.comparedCandidateCount")
    }
  }

  private static func validate(resourceUsage: AudioMatchResourceUsage) throws {
    let durations = [resourceUsage.sourceDurationSeconds, resourceUsage.targetDurationSeconds]
    guard
      durations.allSatisfy({
        $0.isFinite && $0 >= 0 && $0 <= CalibrationReviewLimits.maximumAudioDurationSeconds
      }),
      (0...CalibrationReviewLimits.maximumAudioFingerprintFrames).contains(
        resourceUsage.sourceFingerprintFrames),
      (0...CalibrationReviewLimits.maximumAudioFingerprintFrames).contains(
        resourceUsage.targetFingerprintFrames),
      (0...CalibrationReviewLimits.maximumAudioCandidateCount).contains(
        resourceUsage.candidateCount),
      (0...CalibrationReviewLimits.maximumAudioFileBytes).contains(
        resourceUsage.sourceFileBytes),
      (0...CalibrationReviewLimits.maximumAudioFileBytes).contains(
        resourceUsage.targetFileBytes),
      (0...CalibrationReviewLimits.maximumAudioWorkingMemoryBytes).contains(
        resourceUsage.workingMemoryUpperBoundBytes)
    else {
      throw CalibrationReviewStoreError.invalidValue("audio.resourceUsage")
    }
  }

  private static func validate(range: AudioTimeRange?, field: String) throws {
    guard let range else { return }
    guard range.startSeconds.isFinite, range.startSeconds >= 0,
      range.startSeconds <= CalibrationReviewLimits.maximumAudioDurationSeconds,
      range.durationSeconds.isFinite, range.durationSeconds > 0,
      range.durationSeconds <= CalibrationReviewLimits.maximumAudioDurationSeconds
    else { throw CalibrationReviewStoreError.invalidValue(field) }
  }

  private static func validate(transform: AudioTransformEvidence?) throws {
    guard let transform else { return }
    if let factor = transform.timeFactor,
      !factor.isFinite || factor <= 0 || factor > 64
    {
      throw CalibrationReviewStoreError.invalidValue("audio.transform.timeFactor")
    }
    if let pitch = transform.pitchSemitones,
      !pitch.isFinite || abs(pitch) > 128
    {
      throw CalibrationReviewStoreError.invalidValue("audio.transform.pitchSemitones")
    }
  }

  private static func validate(excerpt: AudioExcerptRetrievalDiagnostics?) throws {
    guard let excerpt else { return }
    let durations = [excerpt.windowDurationSeconds, excerpt.hopDurationSeconds]
    let scores = [
      excerpt.offsetConsistency,
      excerpt.scoreDistribution.minimum,
      excerpt.scoreDistribution.mean,
      excerpt.scoreDistribution.maximum,
    ]
    guard durations.allSatisfy({ $0.isFinite && $0 > 0 && $0 <= 3_600 }),
      scores.allSatisfy({ $0.isFinite && (0...1).contains($0) }),
      excerpt.scoreDistribution.minimum <= excerpt.scoreDistribution.mean,
      excerpt.scoreDistribution.mean <= excerpt.scoreDistribution.maximum,
      [
        excerpt.matchedWindowCount, excerpt.consecutiveWindowCount,
        excerpt.totalQueryWindowCount, excerpt.candidateWindowCount,
      ].allSatisfy({ (0...CalibrationReviewLimits.maximumAudioFingerprintFrames).contains($0) }),
      excerpt.consecutiveWindowCount <= excerpt.matchedWindowCount,
      excerpt.matchedWindowCount <= excerpt.totalQueryWindowCount
    else { throw CalibrationReviewStoreError.invalidValue("audio.excerptRetrieval") }
  }

  private static func features(_ values: [CalibrationFeature], field: String) throws {
    var names = Set<String>()
    for feature in values {
      try CalibrationPrivacy.validate(
        feature.name,
        field: "\(field).name",
        maximumLength: CalibrationReviewLimits.maximumFeatureNameLength)
      try CalibrationPrivacy.validate(
        feature.value,
        field: "\(field).value",
        maximumLength: CalibrationReviewLimits.maximumFeatureValueLength)
      guard names.insert(feature.name).inserted else {
        throw CalibrationReviewStoreError.invalidValue("\(field).duplicateName")
      }
    }
  }

  private static func entity(_ value: CalibrationImmutableEntityReference, field: String) throws {
    try identifier(value.identifier, field: "\(field).identifier")
    try digest(value.observationDigest, field: "\(field).observationDigest")
  }

  private static func identifier(_ value: String, field: String) throws {
    try CalibrationPrivacy.validate(
      value,
      field: field,
      maximumLength: CalibrationReviewLimits.maximumIdentifierLength)
    guard value.allSatisfy({ $0.isLetter || $0.isNumber || ":._-".contains($0) }) else {
      throw CalibrationReviewStoreError.invalidValue(field)
    }
  }

  private static func optionalIdentifier(_ value: String?, field: String) throws {
    guard let value else { return }
    try identifier(value, field: field)
  }

  private static func algorithm(_ value: String, field: String) throws {
    try CalibrationPrivacy.validate(
      value,
      field: field,
      maximumLength: CalibrationReviewLimits.maximumAlgorithmLength)
    guard value.allSatisfy({ $0.isLetter || $0.isNumber || "._-".contains($0) }) else {
      throw CalibrationReviewStoreError.invalidValue(field)
    }
  }

  private static func digest(_ value: String, field: String) throws {
    guard value.count == 64, value.allSatisfy(\.isHexDigit) else {
      throw CalibrationReviewStoreError.invalidValue(field)
    }
  }

  private static func date(_ value: Date, field: String) throws {
    let seconds = value.timeIntervalSince1970
    guard seconds.isFinite,
      (0...CalibrationReviewLimits.maximumDateSeconds).contains(seconds)
    else {
      throw CalibrationReviewStoreError.invalidValue(field)
    }
  }
}

private final class CalibrationReviewProcessLockRegistry: @unchecked Sendable {
  static let shared = CalibrationReviewProcessLockRegistry()

  private let registryLock = NSLock()
  private var locksByPath: [String: NSRecursiveLock] = [:]

  func lock(for path: String) -> NSRecursiveLock {
    registryLock.lock()
    defer { registryLock.unlock() }
    if let existing = locksByPath[path] { return existing }
    let created = NSRecursiveLock()
    locksByPath[path] = created
    return created
  }
}

private struct CalibrationReviewEnvelope: Decodable {
  let schemaVersion: Int
}

private struct CalibrationReviewDocumentV2: Codable {
  let schemaVersion: Int
  let payloadDigest: String
  let storeIdentity: String?
  let generation: UInt64?
  let directory: CalibrationReviewDirectory

  init(
    payloadDigest: String,
    storeIdentity: String,
    generation: UInt64,
    directory: CalibrationReviewDirectory
  ) {
    schemaVersion = CalibrationReviewStore.currentSchemaVersion
    self.payloadDigest = payloadDigest
    self.storeIdentity = storeIdentity
    self.generation = generation
    self.directory = directory
  }
}

private struct CalibrationReviewPayloadV2: Codable {
  let storeIdentity: String
  let generation: UInt64
  let directory: CalibrationReviewDirectory
}

private struct LoadedDirectory {
  let directory: CalibrationReviewDirectory
  let storeIdentity: String
  let generation: UInt64
  let needsRewrite: Bool
}

private enum CalibrationDigest {
  static func sha256(_ value: String) -> String {
    sha256(Data(value.utf8))
  }

  static func sha256<T: Encodable>(_ value: T) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .millisecondsSince1970
    encoder.nonConformingFloatEncodingStrategy = .convertToString(
      positiveInfinity: "positive-infinity",
      negativeInfinity: "negative-infinity",
      nan: "not-a-number")
    guard let data = try? encoder.encode(value) else {
      preconditionFailure("Calibration digest payload must be encodable.")
    }
    return sha256(data)
  }

  private static func sha256(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }
}

private struct LegacyCalibrationReviewDocumentV1: Codable {
  let schemaVersion: Int
  let directory: LegacyCalibrationReviewDirectoryV1
}

private struct LegacyCalibrationReviewDirectoryV1: Codable {
  let decisions: [LegacyCalibrationReviewDecisionV1]
}

private struct LegacyCalibrationReviewDecisionV1: Codable {
  let id: String
  let label: CalibrationDecisionLabel
  let primaryObservationID: String
  let observations: [LegacyCalibrationObservationV1]
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

private struct LegacyCalibrationObservationV1: Codable {
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

private enum CalibrationReviewMigrator {
  static func migrate(
    _ legacy: LegacyCalibrationReviewDirectoryV1
  ) throws -> CalibrationReviewDirectory {
    let decisions = try legacy.decisions.map { legacyDecision in
      let observations = try legacyDecision.observations.map(migrate)
      return CalibrationReviewDecisionRecord(
        id: legacyDecision.id,
        label: legacyDecision.label,
        primaryObservationID: legacyDecision.primaryObservationID,
        observations: observations,
        algorithmFamily: legacyDecision.algorithmFamily,
        algorithmVersion: legacyDecision.algorithmVersion,
        calibrationID: legacyDecision.calibrationID,
        reproductionFeatures: legacyDecision.reproductionFeatures,
        decidedAt: legacyDecision.decidedAt,
        corpusPartition: nil,
        notes: legacyDecision.notes,
        supersedesDecisionID: legacyDecision.supersedesDecisionID,
        supersededByDecisionID: legacyDecision.supersededByDecisionID,
        supersededAt: legacyDecision.supersededAt)
    }
    return CalibrationReviewDirectory(decisions: decisions)
  }

  private static func migrate(
    _ legacy: LegacyCalibrationObservationV1
  ) throws -> CalibrationObservationSnapshot {
    guard legacy.featureDigest.count == 24,
      legacy.featureDigest.allSatisfy(\.isHexDigit)
    else {
      throw CalibrationReviewStoreError.invalidObservationBinding(legacy.id)
    }
    guard !legacy.provenanceKeys.isEmpty,
      legacy.provenanceKeys.count <= CalibrationReviewLimits.maximumProvenanceKeys
    else { throw CalibrationReviewStoreError.invalidObservationBinding(legacy.id) }
    let safeProvenance = try legacy.provenanceKeys.map { value -> String in
      let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !normalized.isEmpty,
        normalized.utf8.count <= CalibrationReviewLimits.maximumIdentifierLength,
        !CalibrationPrivacy.containsPath(normalized),
        !CalibrationPrivacy.containsPersonalData(normalized)
      else {
        throw CalibrationReviewStoreError.invalidObservationBinding(legacy.id)
      }
      return "sha256:\(CalibrationDigest.sha256(normalized))"
    }
    let evidence = legacy.evidenceFamilies.compactMap(CalibrationEvidenceFamily.init(rawValue:))
    guard evidence.count == legacy.evidenceFamilies.count else {
      throw CalibrationReviewStoreError.invalidObservationBinding(legacy.id)
    }
    let binding =
      try explicitDirectionalBinding(legacy)
      ?? .legacyUnresolved(
        CalibrationLegacyUnresolvedBinding(
          originalKind: legacy.kind,
          legacyFeatureDigest: legacy.featureDigest,
          provenanceDigests: safeProvenance.map {
            String($0.dropFirst("sha256:".count))
          }))
    return CalibrationObservationSnapshot(
      id: legacy.id,
      kind: legacy.kind,
      taskFamily: legacy.taskFamily,
      algorithmFamily: legacy.algorithmFamily,
      algorithmVersion: legacy.algorithmVersion,
      calibrationID: legacy.calibrationID,
      predictionDisposition: legacy.predictionDisposition,
      predictedLabel: legacy.predictedLabel,
      score: legacy.score,
      binding: binding,
      provenanceKeys: safeProvenance,
      evidenceFamilies: evidence,
      features: legacy.features,
      corpusPartition: nil,
      performance: legacy.performance,
      observedAt: legacy.observedAt)
  }

  private static func explicitDirectionalBinding(
    _ legacy: LegacyCalibrationObservationV1
  ) throws -> CalibrationObservationBinding? {
    guard
      [
        .sessionContainmentSuggestion, .sessionContainmentAutomaticAssignment,
        .sessionRelationshipObservation,
      ].contains(legacy.kind)
    else { return nil }
    var values: [String: String] = [:]
    for feature in legacy.features {
      guard values.updateValue(feature.value, forKey: feature.name) == nil else {
        throw CalibrationReviewStoreError.invalidObservationBinding(legacy.id)
      }
    }
    let keys = [
      "directionalSourceIdentifier", "directionalSourceObservationDigest",
      "directionalCandidateIdentifier", "directionalCandidateObservationDigest",
    ]
    let present = keys.filter { values[$0] != nil }
    guard !present.isEmpty else { return nil }
    guard present.count == keys.count,
      let sourceIdentifier = values[keys[0]],
      let sourceDigest = values[keys[1]],
      let candidateIdentifier = values[keys[2]],
      let candidateDigest = values[keys[3]],
      validIdentifier(sourceIdentifier), validIdentifier(candidateIdentifier),
      validDigest(sourceDigest), validDigest(candidateDigest)
    else { throw CalibrationReviewStoreError.invalidObservationBinding(legacy.id) }
    return .session(
      CalibrationSessionObservationBinding(
        source: CalibrationImmutableEntityReference(
          identifier: sourceIdentifier, observationDigest: sourceDigest),
        candidate: CalibrationImmutableEntityReference(
          identifier: candidateIdentifier, observationDigest: candidateDigest)))
  }

  private static func validIdentifier(_ value: String) -> Bool {
    !value.isEmpty && value.utf8.count <= CalibrationReviewLimits.maximumIdentifierLength
      && value.allSatisfy { $0.isLetter || $0.isNumber || ":._-".contains($0) }
      && !CalibrationPrivacy.containsPath(value)
      && !CalibrationPrivacy.containsPersonalData(value)
  }

  private static func validDigest(_ value: String) -> Bool {
    value.count == 64 && value.allSatisfy(\.isHexDigit)
  }
}
