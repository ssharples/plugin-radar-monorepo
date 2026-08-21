import AVFoundation
import Accelerate
import CryptoKit
import Foundation

public enum MusicalVersionDiscoveryAvailability: Sendable, Equatable {
  case unavailableResearchOnly(reason: String)
}

public struct MusicalVersionDiscoveryDescriptor: Sendable, Equatable {
  public let id: String
  public let displayName: String
  public let algorithmVersion: String
  public let availability: MusicalVersionDiscoveryAvailability
  public let runsAfterDeterministicSearch: Bool
}

public struct MusicalVersionDiscoveryConfiguration: Sendable, Equatable {
  public var minimumScore: Double
  public var minimumCoverage: Double
  public var minimumRunnerUpMargin: Double
  public var segmentDurationSeconds: Double
  public var segmentHopSeconds: Double
  public var maximumDurationSeconds: Double
  public var maximumFingerprintFrames: Int
  public var maximumCandidateCount: Int
  public var maximumFileBytes: Int64
  public var maximumTotalBytesScanned: Int64
  public var maximumWorkingMemoryBytes: Int64
  public var maximumComparedSegmentPairs: Int64

  public init(
    minimumScore: Double = 0.78,
    minimumCoverage: Double = 0.7,
    minimumRunnerUpMargin: Double = 0.05,
    segmentDurationSeconds: Double = 1,
    segmentHopSeconds: Double = 0.5,
    maximumDurationSeconds: Double = 900,
    maximumFingerprintFrames: Int = 3_600,
    maximumCandidateCount: Int = 128,
    maximumFileBytes: Int64 = 8_000_000_000,
    maximumTotalBytesScanned: Int64 = 16_000_000_000,
    maximumWorkingMemoryBytes: Int64 = 256 * 1_024 * 1_024,
    maximumComparedSegmentPairs: Int64 = 2_000_000
  ) {
    self.minimumScore = minimumScore
    self.minimumCoverage = minimumCoverage
    self.minimumRunnerUpMargin = minimumRunnerUpMargin
    self.segmentDurationSeconds = segmentDurationSeconds
    self.segmentHopSeconds = segmentHopSeconds
    self.maximumDurationSeconds = maximumDurationSeconds
    self.maximumFingerprintFrames = maximumFingerprintFrames
    self.maximumCandidateCount = maximumCandidateCount
    self.maximumFileBytes = maximumFileBytes
    self.maximumTotalBytesScanned = maximumTotalBytesScanned
    self.maximumWorkingMemoryBytes = maximumWorkingMemoryBytes
    self.maximumComparedSegmentPairs = maximumComparedSegmentPairs
  }

  var isValid: Bool {
    minimumScore.isFinite && (0...1).contains(minimumScore)
      && minimumCoverage.isFinite && (0...1).contains(minimumCoverage)
      && minimumRunnerUpMargin.isFinite && (0...1).contains(minimumRunnerUpMargin)
      && segmentDurationSeconds.isFinite && segmentDurationSeconds >= 0.5
      && segmentDurationSeconds <= 5
      && segmentHopSeconds.isFinite && segmentHopSeconds >= 0.1
      && segmentHopSeconds <= segmentDurationSeconds
      && maximumDurationSeconds.isFinite && maximumDurationSeconds > 0
      && maximumDurationSeconds <= 900
      && maximumFingerprintFrames > 0 && maximumFingerprintFrames <= 3_600
      && maximumCandidateCount > 0
      && maximumCandidateCount <= MusicalVersionDiscoveryIndex.hardMaximumEntries
      && maximumFileBytes > 0 && maximumFileBytes <= 8_000_000_000
      && maximumTotalBytesScanned > 0 && maximumTotalBytesScanned <= 32_000_000_000
      && maximumWorkingMemoryBytes > 0
      && maximumWorkingMemoryBytes <= 512 * 1_024 * 1_024
      && maximumComparedSegmentPairs > 0 && maximumComparedSegmentPairs <= 100_000_000
  }
}

public struct MusicalVersionDeterministicSearchCompletionReceipt: Sendable, Equatable {
  fileprivate let bindingDigest: String

  fileprivate func matches(
    query: String,
    deterministicResultAssetIDs: [String],
    searchGeneration: String
  ) -> Bool {
    MusicalVersionDeterministicSearchCompletion.isValidCompletion(
      query: query,
      deterministicResultAssetIDs: deterministicResultAssetIDs,
      searchGeneration: searchGeneration)
      && bindingDigest
        == MusicalVersionDeterministicSearchCompletion.bindingDigest(
          query: query,
          deterministicResultAssetIDs: deterministicResultAssetIDs,
          searchGeneration: searchGeneration)
  }
}

// Internal issuance prevents external callers from inventing a recall receipt. Search integration is
// intentionally deferred until the deterministic search owner can call this after completing a run.
enum MusicalVersionDeterministicSearchCompletion {
  fileprivate static func isValidCompletion(
    query: String,
    deterministicResultAssetIDs: [String],
    searchGeneration: String
  ) -> Bool {
    !normalizedQuery(query).isEmpty
      && !searchGeneration.isEmpty
      && deterministicResultAssetIDs.allSatisfy { !$0.isEmpty }
      && Set(deterministicResultAssetIDs).count == deterministicResultAssetIDs.count
  }

  static func issue(
    query: String,
    deterministicResultAssetIDs: [String],
    searchGeneration: String
  ) -> MusicalVersionDeterministicSearchCompletionReceipt {
    MusicalVersionDeterministicSearchCompletionReceipt(
      bindingDigest: bindingDigest(
        query: query,
        deterministicResultAssetIDs: deterministicResultAssetIDs,
        searchGeneration: searchGeneration))
  }

  fileprivate static func bindingDigest(
    query: String,
    deterministicResultAssetIDs: [String],
    searchGeneration: String
  ) -> String {
    let canonical = [
      "deterministic-search-complete-v1",
      normalizedQuery(query),
      deterministicResultAssetIDs.joined(separator: "\u{1f}"),
      searchGeneration,
    ].joined(separator: "\u{1e}")
    return SHA256.hash(data: Data(canonical.utf8))
      .map { String(format: "%02x", $0) }
      .joined()
  }

  private static func normalizedQuery(_ query: String) -> String {
    query.folding(
      options: [.caseInsensitive, .diacriticInsensitive],
      locale: Locale(identifier: "en_US_POSIX")
    )
    .lowercased()
    .split { !$0.isLetter && !$0.isNumber }
    .joined(separator: " ")
  }
}

public struct MusicalVersionDiscoveryRequest: Sendable, Equatable {
  public let queryAssetID: String
  public let queryURL: URL
  public let semanticQuery: String
  public let deterministicResultAssetIDs: [String]
  public let deterministicSearchGeneration: String
  public let receipt: MusicalVersionDeterministicSearchCompletionReceipt?

  public init(
    queryAssetID: String,
    queryURL: URL,
    semanticQuery: String,
    deterministicResultAssetIDs: [String],
    deterministicSearchGeneration: String,
    receipt: MusicalVersionDeterministicSearchCompletionReceipt?
  ) {
    self.queryAssetID = queryAssetID
    self.queryURL = queryURL.standardizedFileURL
    self.semanticQuery = semanticQuery
    self.deterministicResultAssetIDs = deterministicResultAssetIDs
    self.deterministicSearchGeneration = deterministicSearchGeneration
    self.receipt = receipt
  }
}

public enum MusicalVersionManualConfirmationState: String, Sendable, Equatable {
  case required
}

public struct MusicalVersionDiscoveryResourceUsage: Sendable, Equatable {
  public let sourceDurationSeconds: Double
  public let targetDurationSeconds: Double
  public let sourceFingerprintFrames: Int
  public let targetFingerprintFrames: Int
  public let candidateCount: Int
  public let sourceFileBytes: Int64
  public let targetFileBytes: Int64
  public let bytesScanned: Int64
  public let comparedSegmentPairs: Int64
  public let comparedSegmentPairUpperBound: Int64
  public let sourceWorkingMemoryUpperBoundBytes: Int64
  public let sourceExtractionRetainedWorkingMemoryUpperBoundBytes: Int64
  public let sourceExtractionTransientWorkingMemoryUpperBoundBytes: Int64
  public let sourceExtractionPeakWorkingMemoryUpperBoundBytes: Int64
  public let persistentIndexWorkingMemoryUpperBoundBytes: Int64
  public let comparisonWorkingMemoryUpperBoundBytes: Int64
  public let workingMemoryUpperBoundBytes: Int64
}

public struct MusicalVersionDiscoveryResult: Sendable, Equatable {
  public let sourceAssetID: String
  public let targetAssetID: String
  public let sourceObservation: MusicalVersionImmutableAssetObservation
  public let targetObservation: MusicalVersionImmutableAssetObservation
  public let sourceRange: AudioTimeRange
  public let targetRange: AudioTimeRange
  public let scoreDistribution: AudioScoreDistribution
  public let coverage: Double
  public let runnerUpMargin: Double
  public let resourceUsage: MusicalVersionDiscoveryResourceUsage
  public let algorithmVersion: String
  public let embeddingVersion: String
  public let indexVersion: String
  public let manualConfirmationState: MusicalVersionManualConfirmationState

  public var label: String { "Musically related" }
}

public enum MusicalVersionDiscoveryAbstention: String, Error, Sendable, Equatable {
  case capabilityUnavailable
  case missingSearchReceipt
  case searchReceiptMismatch
  case invalidConfiguration
  case emptyIndex
  case duplicateAssetIdentity
  case invalidAssetMetadata
  case candidateLimitExceeded
  case sourceFileTooLarge
  case targetFileTooLarge
  case byteScanLimitExceeded
  case durationLimitExceeded
  case frameLimitExceeded
  case channelLimitExceeded
  case memoryLimitExceeded
  case comparisonLimitExceeded
  case unreadableAudio
  case silenceOrDegenerateAudio
  case staleSource
  case staleTarget
  case ambiguous
  case belowResearchThreshold
  case cancelled
}

public enum MusicalVersionDiscoveryOutcome: Sendable, Equatable {
  case results([MusicalVersionDiscoveryResult])
  case abstained(MusicalVersionDiscoveryAbstention)
}

public enum MusicalVersionDiscoveryIndexBuildOutcome: Sendable, Equatable {
  case built(MusicalVersionDiscoveryIndex)
  case abstained(MusicalVersionDiscoveryAbstention)
}

public struct LocalMusicalVersionDiscoveryPrototype: Sendable {
  public static let algorithmVersion = "local-musical-version-research-v1"
  public static let embeddingVersion = "local-log-frequency-sequence-v1"
  public static let embeddingDimension = 72
  // This research downmix supports mono through 7.1; wider layouts abstain before PCM allocation.
  static let maximumSupportedChannelCount: AVAudioChannelCount = 8
  // Covers the fixed top-alignment buffer and scalar scoring state with ample allocator overhead.
  static let comparisonWorkingMemoryUpperBoundBytes: Int64 = 64 * 1_024
  static let comparisonCheckpointInterval: Int64 = 64

  private static let analysisFrameCapacity: Int64 = 4_096
  // Includes decoder/DFT setup, observation hashing, windowing, and allocator/object overhead.
  private static let featureExtractionFixedWorkingMemoryUpperBoundBytes: Int64 = 1 * 1_024 * 1_024
  private static let operationPlanningWorkingMemoryUpperBoundBytes: Int64 =
    featureExtractionFixedWorkingMemoryUpperBoundBytes
  // At most five integer offsets are within +/-2 of the winner; six retain an independent runner-up.
  private static let topAlignmentCapacity = 6

  public let descriptor = MusicalVersionDiscoveryDescriptor(
    id: "local-musical-version-research",
    displayName: "Local musical-version discovery research prototype",
    algorithmVersion: Self.algorithmVersion,
    availability: .unavailableResearchOnly(
      reason: "Requires accepted real-corpus evaluation and product integration."),
    runsAfterDeterministicSearch: true)
  public let configuration: MusicalVersionDiscoveryConfiguration

  private let syntheticResearchAuthorization: Bool
  private let postQueryAnalysisHook: @Sendable (URL) throws -> Void
  private let beforeFinalValidationHook: @Sendable (URL) throws -> Void
  private let comparisonProgressHook: @Sendable (Int64) throws -> Void
  private let beforeFeatureExtractionHook: @Sendable (URL) throws -> Void

  public init(configuration: MusicalVersionDiscoveryConfiguration = .init()) {
    self.init(
      configuration: configuration,
      syntheticResearchAuthorization: false,
      postQueryAnalysisHook: { _ in },
      beforeFinalValidationHook: { _ in },
      comparisonProgressHook: { _ in },
      beforeFeatureExtractionHook: { _ in })
  }

  init(
    configuration: MusicalVersionDiscoveryConfiguration,
    syntheticResearchAuthorization: Bool,
    postQueryAnalysisHook: @escaping @Sendable (URL) throws -> Void,
    beforeFinalValidationHook: @escaping @Sendable (URL) throws -> Void,
    comparisonProgressHook: @escaping @Sendable (Int64) throws -> Void,
    beforeFeatureExtractionHook: @escaping @Sendable (URL) throws -> Void
  ) {
    self.configuration = configuration
    self.syntheticResearchAuthorization = syntheticResearchAuthorization
    self.postQueryAnalysisHook = postQueryAnalysisHook
    self.beforeFinalValidationHook = beforeFinalValidationHook
    self.comparisonProgressHook = comparisonProgressHook
    self.beforeFeatureExtractionHook = beforeFeatureExtractionHook
  }

  static func deterministicSyntheticResearch(
    configuration: MusicalVersionDiscoveryConfiguration = .init(),
    postQueryAnalysisHook: @escaping @Sendable (URL) throws -> Void = { _ in },
    beforeFinalValidationHook: @escaping @Sendable (URL) throws -> Void = { _ in },
    comparisonProgressHook: @escaping @Sendable (Int64) throws -> Void = { _ in },
    beforeFeatureExtractionHook: @escaping @Sendable (URL) throws -> Void = { _ in }
  ) -> LocalMusicalVersionDiscoveryPrototype {
    LocalMusicalVersionDiscoveryPrototype(
      configuration: configuration,
      syntheticResearchAuthorization: true,
      postQueryAnalysisHook: postQueryAnalysisHook,
      beforeFinalValidationHook: beforeFinalValidationHook,
      comparisonProgressHook: comparisonProgressHook,
      beforeFeatureExtractionHook: beforeFeatureExtractionHook)
  }

  static func checkedMemorySum(_ lhs: Int64, _ rhs: Int64) -> Int64? {
    guard lhs >= 0, rhs >= 0 else { return nil }
    let (sum, overflow) = lhs.addingReportingOverflow(rhs)
    return overflow ? nil : sum
  }

  private static func checkedMemoryProduct(_ lhs: Int64, _ rhs: Int64) -> Int64? {
    guard lhs >= 0, rhs >= 0 else { return nil }
    let (product, overflow) = lhs.multipliedReportingOverflow(by: rhs)
    return overflow ? nil : product
  }

  static func minimumIndexedAssetMemoryUpperBoundBytes(segmentCount: Int) -> Int64 {
    MusicalVersionDiscoveryIndex.maximumRetainedMemoryUpperBoundBytes(
      segmentCount: segmentCount) ?? .max
  }

  func featureExtractionPlan(at fileURL: URL) throws -> MusicalVersionFeatureExtractionPlan {
    let audioFile: AVAudioFile
    do {
      audioFile = try AVAudioFile(
        forReading: fileURL,
        commonFormat: .pcmFormatFloat32,
        interleaved: false)
    } catch {
      throw MusicalVersionAnalysisError(.unreadableAudio)
    }
    return try featureExtractionPlan(for: audioFile)
  }

  private func featureExtractionPlan(
    for audioFile: AVAudioFile
  ) throws -> MusicalVersionFeatureExtractionPlan {
    let format = audioFile.processingFormat
    guard format.sampleRate.isFinite, format.sampleRate > 0,
      format.channelCount > 0,
      audioFile.length > 0
    else { throw MusicalVersionAnalysisError(.silenceOrDegenerateAudio) }
    let duration = Double(audioFile.length) / format.sampleRate
    guard duration.isFinite, duration > 0, duration <= configuration.maximumDurationSeconds else {
      throw MusicalVersionAnalysisError(.durationLimitExceeded)
    }
    let rawSegmentCount =
      floor(
        max(0, duration - configuration.segmentDurationSeconds)
          / configuration.segmentHopSeconds) + 1
    guard rawSegmentCount.isFinite, rawSegmentCount >= 1,
      rawSegmentCount <= Double(configuration.maximumFingerprintFrames),
      rawSegmentCount <= Double(Int.max)
    else { throw MusicalVersionAnalysisError(.frameLimitExceeded) }
    let segmentCount = Int(rawSegmentCount)
    return try featureExtractionPlan(
      durationSeconds: duration,
      segmentCount: segmentCount,
      channelCount: Int(format.channelCount),
      frameCapacity: Int(Self.analysisFrameCapacity))
  }

  func featureExtractionPlan(
    durationSeconds: Double,
    segmentCount: Int,
    channelCount: Int,
    frameCapacity: Int
  ) throws -> MusicalVersionFeatureExtractionPlan {
    guard durationSeconds.isFinite, durationSeconds > 0,
      durationSeconds <= configuration.maximumDurationSeconds,
      segmentCount > 0,
      segmentCount <= configuration.maximumFingerprintFrames
    else { throw MusicalVersionAnalysisError(.frameLimitExceeded) }
    guard channelCount > 0,
      channelCount <= Int(Self.maximumSupportedChannelCount)
    else { throw MusicalVersionAnalysisError(.channelLimitExceeded) }
    guard frameCapacity > 0, frameCapacity <= Int(AVAudioFrameCount.max) else {
      throw MusicalVersionAnalysisError(.memoryLimitExceeded)
    }
    let retainedMemory = Self.minimumIndexedAssetMemoryUpperBoundBytes(
      segmentCount: segmentCount)
    guard retainedMemory != .max,
      let decodeSamples = Self.checkedMemoryProduct(
        Int64(channelCount),
        Int64(frameCapacity)),
      let decodeBufferBytes = Self.checkedMemoryProduct(
        decodeSamples,
        Int64(MemoryLayout<Float>.stride)),
      let fftSamples = Self.checkedMemoryProduct(4, Int64(frameCapacity)),
      let fftBufferBytes = Self.checkedMemoryProduct(
        fftSamples,
        Int64(MemoryLayout<Float>.stride)),
      let featureScratchBytes = Self.checkedMemoryProduct(
        Int64(Self.embeddingDimension * 8),
        Int64(MemoryLayout<Float>.stride)),
      let fixedAndDecode = Self.checkedMemorySum(
        Self.featureExtractionFixedWorkingMemoryUpperBoundBytes,
        decodeBufferBytes),
      let withFFT = Self.checkedMemorySum(fixedAndDecode, fftBufferBytes),
      let transientMemory = Self.checkedMemorySum(withFFT, featureScratchBytes),
      let peakMemory = Self.checkedMemorySum(retainedMemory, transientMemory)
    else { throw MusicalVersionAnalysisError(.memoryLimitExceeded) }
    return MusicalVersionFeatureExtractionPlan(
      durationSeconds: durationSeconds,
      segmentCount: segmentCount,
      channelCount: channelCount,
      frameCapacity: frameCapacity,
      retainedWorkingMemoryUpperBoundBytes: retainedMemory,
      transientWorkingMemoryUpperBoundBytes: transientMemory,
      peakWorkingMemoryUpperBoundBytes: peakMemory)
  }

  public func buildIndex(
    assets: [MusicalVersionDiscoveryAsset]
  ) async -> MusicalVersionDiscoveryIndexBuildOutcome {
    guard syntheticResearchAuthorization else { return .abstained(.capabilityUnavailable) }
    guard configuration.isValid else { return .abstained(.invalidConfiguration) }
    guard
      Self.operationPlanningWorkingMemoryUpperBoundBytes
        <= configuration.maximumWorkingMemoryBytes
    else { return .abstained(.memoryLimitExceeded) }
    guard !assets.isEmpty else { return .abstained(.emptyIndex) }
    guard assets.count <= configuration.maximumCandidateCount else {
      return .abstained(.candidateLimitExceeded)
    }
    guard Set(assets.map(\.assetID)).count == assets.count,
      Set(assets.map { $0.fileURL.standardizedFileURL }).count == assets.count
    else { return .abstained(.duplicateAssetIdentity) }
    guard assets.allSatisfy(\.isWellFormed) else {
      return .abstained(.invalidAssetMetadata)
    }
    if Task.isCancelled { return .abstained(.cancelled) }

    var buildBytes: Int64 = 0
    for asset in assets {
      guard let fingerprint = try? FileFingerprint.read(from: asset.fileURL, fileManager: .default)
      else { return .abstained(.unreadableAudio) }
      guard fingerprint.bytes <= configuration.maximumFileBytes else {
        return .abstained(.sourceFileTooLarge)
      }
      let (assetWork, multiplyOverflow) = fingerprint.bytes.multipliedReportingOverflow(by: 3)
      let (totalWork, additionOverflow) = buildBytes.addingReportingOverflow(assetWork)
      guard !multiplyOverflow, !additionOverflow,
        totalWork <= configuration.maximumTotalBytesScanned
      else { return .abstained(.byteScanLimitExceeded) }
      buildBytes = totalWork
    }

    var entries: [MusicalVersionIndexedAsset] = []
    var residentIndexMemory: Int64 = 0
    for asset in assets.sorted(by: { $0.assetID < $1.assetID }) {
      if Task.isCancelled { return .abstained(.cancelled) }
      guard
        let planningPeak = Self.checkedMemorySum(
          residentIndexMemory,
          Self.operationPlanningWorkingMemoryUpperBoundBytes),
        planningPeak <= configuration.maximumWorkingMemoryBytes
      else { return .abstained(.memoryLimitExceeded) }
      let plan: MusicalVersionFeatureExtractionPlan
      do {
        plan = try featureExtractionPlan(at: asset.fileURL)
      } catch is CancellationError {
        return .abstained(.cancelled)
      } catch let error as MusicalVersionAnalysisError {
        return .abstained(error.abstention)
      } catch {
        return .abstained(.unreadableAudio)
      }
      guard
        let extractionPeak = Self.checkedMemorySum(
          residentIndexMemory,
          plan.peakWorkingMemoryUpperBoundBytes),
        extractionPeak <= configuration.maximumWorkingMemoryBytes
      else { return .abstained(.memoryLimitExceeded) }
      switch auditedEmbedding(for: asset, plan: plan) {
      case .success(let entry):
        guard
          entry.workingMemoryUpperBoundBytes
            <= plan.retainedWorkingMemoryUpperBoundBytes,
          let resultingResidentMemory = Self.checkedMemorySum(
            residentIndexMemory,
            entry.workingMemoryUpperBoundBytes),
          resultingResidentMemory <= configuration.maximumWorkingMemoryBytes
        else { return .abstained(.memoryLimitExceeded) }
        entries.append(entry)
        residentIndexMemory = resultingResidentMemory
      case .failure(let abstention):
        return .abstained(abstention)
      }
    }
    guard
      let finalizationPeak = Self.checkedMemorySum(
        residentIndexMemory,
        Self.operationPlanningWorkingMemoryUpperBoundBytes),
      finalizationPeak <= configuration.maximumWorkingMemoryBytes
    else { return .abstained(.memoryLimitExceeded) }
    do {
      return .built(try MusicalVersionDiscoveryIndex(entries: entries))
    } catch {
      return .abstained(.memoryLimitExceeded)
    }
  }

  public func recall(
    _ request: MusicalVersionDiscoveryRequest,
    in index: MusicalVersionDiscoveryIndex
  ) async -> MusicalVersionDiscoveryOutcome {
    guard syntheticResearchAuthorization else { return .abstained(.capabilityUnavailable) }
    guard configuration.isValid else { return .abstained(.invalidConfiguration) }
    guard let receipt = request.receipt else { return .abstained(.missingSearchReceipt) }
    guard
      receipt.matches(
        query: request.semanticQuery,
        deterministicResultAssetIDs: request.deterministicResultAssetIDs,
        searchGeneration: request.deterministicSearchGeneration)
    else { return .abstained(.searchReceiptMismatch) }
    let queryAsset = MusicalVersionDiscoveryAsset(
      assetID: request.queryAssetID,
      fileURL: request.queryURL)
    guard queryAsset.isWellFormed else { return .abstained(.invalidAssetMetadata) }
    let entries = index.indexedAssets()
    guard !entries.isEmpty else { return .abstained(.emptyIndex) }
    guard entries.count <= configuration.maximumCandidateCount else {
      return .abstained(.candidateLimitExceeded)
    }
    guard entries.allSatisfy({ $0.observation.bytes <= configuration.maximumFileBytes }) else {
      return .abstained(.targetFileTooLarge)
    }
    guard entries.allSatisfy({ $0.durationSeconds <= configuration.maximumDurationSeconds }) else {
      return .abstained(.durationLimitExceeded)
    }
    guard entries.allSatisfy({ $0.segments.count <= configuration.maximumFingerprintFrames }) else {
      return .abstained(.frameLimitExceeded)
    }
    let candidateMemory = index.residentWorkingMemoryUpperBoundBytes
    guard candidateMemory != .max,
      let candidatePlanningPeak = Self.checkedMemorySum(
        candidateMemory,
        Self.operationPlanningWorkingMemoryUpperBoundBytes),
      candidatePlanningPeak <= configuration.maximumWorkingMemoryBytes
    else { return .abstained(.memoryLimitExceeded) }
    guard !entries.contains(where: { $0.observation.assetID == request.queryAssetID }) else {
      return .abstained(.duplicateAssetIdentity)
    }
    if Task.isCancelled { return .abstained(.cancelled) }

    guard
      let sourcePreflight = try? FileFingerprint.read(
        from: request.queryURL,
        fileManager: .default)
    else { return .abstained(.unreadableAudio) }
    guard sourcePreflight.bytes <= configuration.maximumFileBytes else {
      return .abstained(.sourceFileTooLarge)
    }
    let candidateBytes = entries.reduce(Int64(0)) { partial, entry in
      let (sum, overflow) = partial.addingReportingOverflow(entry.observation.bytes)
      return overflow ? Int64.max : sum
    }
    let (sourceScanBytes, sourceMultiplyOverflow) = sourcePreflight.bytes
      .multipliedReportingOverflow(by: 4)
    let (candidateScanBytes, candidateMultiplyOverflow) =
      candidateBytes
      .multipliedReportingOverflow(by: 2)
    let (totalScanBytes, totalScanOverflow) = sourceScanBytes.addingReportingOverflow(
      candidateScanBytes)
    guard !sourceMultiplyOverflow, !candidateMultiplyOverflow, !totalScanOverflow,
      totalScanBytes <= configuration.maximumTotalBytesScanned
    else { return .abstained(.byteScanLimitExceeded) }

    let sourcePlan: MusicalVersionFeatureExtractionPlan
    do {
      sourcePlan = try featureExtractionPlan(at: request.queryURL)
    } catch is CancellationError {
      return .abstained(.cancelled)
    } catch let error as MusicalVersionAnalysisError {
      return .abstained(error.abstention)
    } catch {
      return .abstained(.unreadableAudio)
    }
    guard
      let sourceExtractionPeak = Self.checkedMemorySum(
        candidateMemory,
        sourcePlan.peakWorkingMemoryUpperBoundBytes),
      sourceExtractionPeak <= configuration.maximumWorkingMemoryBytes
    else { return .abstained(.memoryLimitExceeded) }

    for entry in entries {
      if Task.isCancelled { return .abstained(.cancelled) }
      do {
        guard
          try matchesCurrentObservation(
            entry.observation.fileObservation,
            at: entry.observation.fileURL)
        else { return .abstained(.staleTarget) }
      } catch is CancellationError {
        return .abstained(.cancelled)
      } catch {
        return .abstained(.staleTarget)
      }
    }

    let source: MusicalVersionIndexedAsset
    switch auditedEmbedding(for: queryAsset, plan: sourcePlan) {
    case .success(let value): source = value
    case .failure(let abstention): return .abstained(abstention)
    }
    do {
      try postQueryAnalysisHook(request.queryURL)
    } catch is CancellationError {
      return .abstained(.cancelled)
    } catch {
      return .abstained(.staleSource)
    }
    if Task.isCancelled { return .abstained(.cancelled) }

    guard
      source.workingMemoryUpperBoundBytes
        <= sourcePlan.retainedWorkingMemoryUpperBoundBytes,
      let sourceAndIndexMemory = Self.checkedMemorySum(
        candidateMemory,
        source.workingMemoryUpperBoundBytes),
      let comparisonPeak = Self.checkedMemorySum(
        sourceAndIndexMemory,
        Self.comparisonWorkingMemoryUpperBoundBytes),
      comparisonPeak <= configuration.maximumWorkingMemoryBytes
    else { return .abstained(.memoryLimitExceeded) }
    let availableComparisonMemory = configuration.maximumWorkingMemoryBytes - sourceAndIndexMemory
    let overallWorkingMemoryUpperBound = max(sourceExtractionPeak, comparisonPeak)

    var comparedSegmentPairUpperBound: Int64 = 0
    for entry in entries {
      let (pairs, multiplyOverflow) = Int64(source.segments.count)
        .multipliedReportingOverflow(by: Int64(entry.segments.count))
      let (shiftedPairs, shiftOverflow) = pairs.multipliedReportingOverflow(by: 13)
      let (totalPairs, additionOverflow) = comparedSegmentPairUpperBound.addingReportingOverflow(
        shiftedPairs)
      guard !multiplyOverflow, !shiftOverflow, !additionOverflow,
        totalPairs <= configuration.maximumComparedSegmentPairs
      else { return .abstained(.comparisonLimitExceeded) }
      comparedSegmentPairUpperBound = totalPairs
    }

    var evaluatedSegmentPairs: Int64 = 0
    var best: (MusicalVersionIndexedAsset, MusicalVersionComparison)?
    var runnerUp: (MusicalVersionIndexedAsset, MusicalVersionComparison)?
    for entry in entries {
      let comparison: MusicalVersionComparison?
      do {
        comparison = try compare(
          source: source,
          target: entry,
          availableWorkingMemoryBytes: availableComparisonMemory,
          evaluatedSegmentPairs: &evaluatedSegmentPairs)
      } catch is CancellationError {
        return .abstained(.cancelled)
      } catch let error as MusicalVersionAnalysisError {
        return .abstained(error.abstention)
      } catch {
        return .abstained(.memoryLimitExceeded)
      }
      guard let comparison else { continue }
      let candidate = (entry, comparison)
      if let currentBest = best {
        if Self.ranksBefore(candidate, currentBest) {
          runnerUp = currentBest
          best = candidate
        } else if let currentRunnerUp = runnerUp {
          if Self.ranksBefore(candidate, currentRunnerUp) { runnerUp = candidate }
        } else {
          runnerUp = candidate
        }
      } else {
        runnerUp = best
        best = candidate
      }
    }
    guard let best else { return .abstained(.belowResearchThreshold) }
    let otherCandidateScore = runnerUp?.1.score ?? 0
    let runnerUpScore = max(otherCandidateScore, best.1.sameTargetRunnerUpScore)
    let runnerUpMargin = max(0, best.1.score - runnerUpScore)
    guard best.1.score >= configuration.minimumScore,
      best.1.coverage >= configuration.minimumCoverage
    else { return .abstained(.belowResearchThreshold) }
    guard runnerUpMargin >= configuration.minimumRunnerUpMargin else {
      return .abstained(.ambiguous)
    }

    do {
      try beforeFinalValidationHook(best.0.observation.fileURL)
    } catch is CancellationError {
      return .abstained(.cancelled)
    } catch {
      return .abstained(.staleTarget)
    }
    if Task.isCancelled { return .abstained(.cancelled) }
    do {
      guard
        try matchesCurrentObservation(
          source.observation.fileObservation,
          at: source.observation.fileURL)
      else { return .abstained(.staleSource) }
    } catch is CancellationError {
      return .abstained(.cancelled)
    } catch {
      return .abstained(.staleSource)
    }
    for entry in entries {
      if Task.isCancelled { return .abstained(.cancelled) }
      do {
        guard
          try matchesCurrentObservation(
            entry.observation.fileObservation,
            at: entry.observation.fileURL)
        else { return .abstained(.staleTarget) }
      } catch is CancellationError {
        return .abstained(.cancelled)
      } catch {
        return .abstained(.staleTarget)
      }
    }

    return .results([
      MusicalVersionDiscoveryResult(
        sourceAssetID: source.observation.assetID,
        targetAssetID: best.0.observation.assetID,
        sourceObservation: source.observation,
        targetObservation: best.0.observation,
        sourceRange: best.1.sourceRange,
        targetRange: best.1.targetRange,
        scoreDistribution: best.1.scoreDistribution,
        coverage: best.1.coverage,
        runnerUpMargin: runnerUpMargin,
        resourceUsage: MusicalVersionDiscoveryResourceUsage(
          sourceDurationSeconds: source.durationSeconds,
          targetDurationSeconds: best.0.durationSeconds,
          sourceFingerprintFrames: source.segments.count,
          targetFingerprintFrames: best.0.segments.count,
          candidateCount: entries.count,
          sourceFileBytes: source.observation.bytes,
          targetFileBytes: best.0.observation.bytes,
          bytesScanned: totalScanBytes,
          comparedSegmentPairs: evaluatedSegmentPairs,
          comparedSegmentPairUpperBound: comparedSegmentPairUpperBound,
          sourceWorkingMemoryUpperBoundBytes: source.workingMemoryUpperBoundBytes,
          sourceExtractionRetainedWorkingMemoryUpperBoundBytes: sourcePlan
            .retainedWorkingMemoryUpperBoundBytes,
          sourceExtractionTransientWorkingMemoryUpperBoundBytes: sourcePlan
            .transientWorkingMemoryUpperBoundBytes,
          sourceExtractionPeakWorkingMemoryUpperBoundBytes: sourceExtractionPeak,
          persistentIndexWorkingMemoryUpperBoundBytes: candidateMemory,
          comparisonWorkingMemoryUpperBoundBytes: Self
            .comparisonWorkingMemoryUpperBoundBytes,
          workingMemoryUpperBoundBytes: overallWorkingMemoryUpperBound),
        algorithmVersion: Self.algorithmVersion,
        embeddingVersion: Self.embeddingVersion,
        indexVersion: MusicalVersionDiscoveryIndex.indexVersion,
        manualConfirmationState: .required)
    ])
  }

  private func auditedEmbedding(
    for asset: MusicalVersionDiscoveryAsset,
    plan: MusicalVersionFeatureExtractionPlan
  ) -> Result<MusicalVersionIndexedAsset, MusicalVersionDiscoveryAbstention> {
    if Task.isCancelled { return .failure(.cancelled) }
    let observation: AudioMatchSourceObservation
    do {
      observation = try AudioMatchSourceObservation.captureBounded(
        fileURL: asset.fileURL,
        maximumBytes: configuration.maximumFileBytes,
        progress: { _, _ in try Task.checkCancellation() })
    } catch is CancellationError {
      return .failure(.cancelled)
    } catch AudioMatchFileObservationError.outsideByteBound {
      return .failure(.sourceFileTooLarge)
    } catch {
      return .failure(.unreadableAudio)
    }
    let immutableObservation = MusicalVersionImmutableAssetObservation(
      asset: asset,
      observation: observation)
    guard immutableObservation.isWellFormed else {
      return .failure(.invalidAssetMetadata)
    }
    do {
      let features = try extractFeatures(at: asset.fileURL, plan: plan)
      guard try matchesCurrentObservation(observation, at: asset.fileURL) else {
        return .failure(.staleSource)
      }
      guard
        let retainedMemory = MusicalVersionDiscoveryIndex.retainedMemoryUpperBoundBytes(
          observation: immutableObservation,
          wholeRecording: features.wholeRecording,
          segments: features.segments),
        retainedMemory <= plan.retainedWorkingMemoryUpperBoundBytes
      else { return .failure(.memoryLimitExceeded) }
      return .success(
        MusicalVersionIndexedAsset(
          observation: immutableObservation,
          durationSeconds: features.durationSeconds,
          wholeRecording: features.wholeRecording,
          segments: features.segments,
          workingMemoryUpperBoundBytes: retainedMemory))
    } catch is CancellationError {
      return .failure(.cancelled)
    } catch let error as MusicalVersionAnalysisError {
      return .failure(error.abstention)
    } catch {
      return .failure(.unreadableAudio)
    }
  }

  private func matchesCurrentObservation(
    _ observation: AudioMatchSourceObservation,
    at fileURL: URL
  ) throws -> Bool {
    try AudioMatchSourceObservation.captureBounded(
      fileURL: fileURL,
      maximumBytes: configuration.maximumFileBytes,
      progress: { _, _ in try Task.checkCancellation() }) == observation
  }

  private func extractFeatures(
    at fileURL: URL,
    plan: MusicalVersionFeatureExtractionPlan
  ) throws -> MusicalVersionExtractedFeatures {
    let audioFile: AVAudioFile
    do {
      audioFile = try AVAudioFile(
        forReading: fileURL,
        commonFormat: .pcmFormatFloat32,
        interleaved: false)
    } catch {
      throw MusicalVersionAnalysisError(.unreadableAudio)
    }
    let currentPlan = try featureExtractionPlan(for: audioFile)
    guard currentPlan == plan else { throw MusicalVersionAnalysisError(.staleSource) }
    guard currentPlan.channelCount > 0,
      currentPlan.channelCount <= Int(Self.maximumSupportedChannelCount),
      currentPlan.frameCapacity > 0,
      currentPlan.frameCapacity <= Int(AVAudioFrameCount.max)
    else { throw MusicalVersionAnalysisError(.channelLimitExceeded) }
    try beforeFeatureExtractionHook(fileURL)
    try Task.checkCancellation()
    let format = audioFile.processingFormat
    let duration = currentPlan.durationSeconds
    let segmentCount = currentPlan.segmentCount
    guard
      let setup = vDSP_DFT_zop_CreateSetup(
        nil,
        vDSP_Length(currentPlan.frameCapacity),
        vDSP_DFT_Direction.FORWARD)
    else { throw MusicalVersionAnalysisError(.memoryLimitExceeded) }
    defer { vDSP_DFT_DestroySetup(setup) }
    guard
      let buffer = AVAudioPCMBuffer(
        pcmFormat: format,
        frameCapacity: AVAudioFrameCount(currentPlan.frameCapacity))
    else { throw MusicalVersionAnalysisError(.memoryLimitExceeded) }

    var segments: [MusicalVersionSegmentEmbedding] = []
    segments.reserveCapacity(segmentCount)
    for segmentIndex in 0..<segmentCount {
      try Task.checkCancellation()
      let start = Double(segmentIndex) * configuration.segmentHopSeconds
      let segmentDuration = min(configuration.segmentDurationSeconds, duration - start)
      guard segmentDuration > 0 else { continue }
      var accumulated = [Float](repeating: 0, count: Self.embeddingDimension)
      var sampledSlices = 0
      for fraction in [0.125, 0.375, 0.625, 0.875] {
        let center = min(duration, start + segmentDuration * fraction)
        let halfWindow = Double(currentPlan.frameCapacity) / format.sampleRate / 2
        let sampleStart = max(
          0,
          min(
            duration - Double(currentPlan.frameCapacity) / format.sampleRate,
            center - halfWindow))
        audioFile.framePosition = AVAudioFramePosition((sampleStart * format.sampleRate).rounded())
        buffer.frameLength = 0
        try audioFile.read(
          into: buffer,
          frameCount: AVAudioFrameCount(currentPlan.frameCapacity))
        guard buffer.frameLength > 0, let channels = buffer.floatChannelData else { continue }
        var input = [Float](repeating: 0, count: currentPlan.frameCapacity)
        let count = Int(buffer.frameLength)
        for channel in 0..<Int(format.channelCount) {
          for index in 0..<count {
            input[index] += channels[channel][index] / Float(format.channelCount)
          }
        }
        for index in 0..<count {
          input[index] *= 0.5 - 0.5 * cos(2 * Float.pi * Float(index) / Float(4_095))
        }
        let imaginary = [Float](repeating: 0, count: currentPlan.frameCapacity)
        var realOut = [Float](repeating: 0, count: currentPlan.frameCapacity)
        var imaginaryOut = [Float](repeating: 0, count: currentPlan.frameCapacity)
        vDSP_DFT_Execute(setup, input, imaginary, &realOut, &imaginaryOut)
        let slice = Self.logFrequencyEmbedding(
          real: realOut,
          imaginary: imaginaryOut,
          sampleRate: format.sampleRate)
        for index in accumulated.indices { accumulated[index] += slice[index] }
        sampledSlices += 1
      }
      guard sampledSlices > 0 else { continue }
      accumulated = Self.normalized(accumulated.map { $0 / Float(sampledSlices) })
      if accumulated.contains(where: { $0 > 0 }) {
        segments.append(
          MusicalVersionSegmentEmbedding(
            range: AudioTimeRange(startSeconds: start, durationSeconds: segmentDuration),
            embedding: MusicalVersionFeatureEmbedding(
              version: Self.embeddingVersion,
              values: accumulated)))
      }
    }
    guard !segments.isEmpty else {
      throw MusicalVersionAnalysisError(.silenceOrDegenerateAudio)
    }
    var whole = [Float](repeating: 0, count: Self.embeddingDimension)
    for segment in segments {
      for index in whole.indices { whole[index] += segment.embedding.values[index] }
    }
    whole = Self.normalized(whole.map { $0 / Float(segments.count) })
    return MusicalVersionExtractedFeatures(
      durationSeconds: duration,
      wholeRecording: MusicalVersionFeatureEmbedding(
        version: Self.embeddingVersion,
        values: whole),
      segments: segments)
  }

  func compare(
    source: MusicalVersionIndexedAsset,
    target: MusicalVersionIndexedAsset,
    availableWorkingMemoryBytes: Int64,
    evaluatedSegmentPairs: inout Int64
  ) throws -> MusicalVersionComparison? {
    guard availableWorkingMemoryBytes >= Self.comparisonWorkingMemoryUpperBoundBytes else {
      throw MusicalVersionAnalysisError(.memoryLimitExceeded)
    }
    try Task.checkCancellation()
    let query = source.segments
    let candidate = target.segments
    guard !query.isEmpty, !candidate.isEmpty else { return nil }
    var topAlignments: [MusicalVersionAlignment] = []
    topAlignments.reserveCapacity(Self.topAlignmentCapacity)
    let durationRatio =
      min(source.durationSeconds, target.durationSeconds)
      / max(source.durationSeconds, target.durationSeconds)
    var wholeScore = 0.0
    for shift in -6...6 {
      wholeScore = max(
        wholeScore,
        Self.cosine(
          source.wholeRecording.values,
          target.wholeRecording.values,
          semitoneShift: shift))
    }
    for offset in (-(query.count - 1))...candidate.count - 1 {
      let queryStart = max(0, -offset)
      let targetStart = max(0, offset)
      let overlap = min(query.count - queryStart, candidate.count - targetStart)
      guard overlap >= min(3, query.count) else { continue }
      var bestSummary: MusicalVersionScoreSummary?
      for shift in -6...6 {
        var summary = MusicalVersionScoreSummary()
        for index in 0..<overlap {
          summary.record(
            Self.cosine(
              query[queryStart + index].embedding.values,
              candidate[targetStart + index].embedding.values,
              semitoneShift: shift))
          evaluatedSegmentPairs += 1
          if evaluatedSegmentPairs % Self.comparisonCheckpointInterval == 0 {
            try Task.checkCancellation()
            try comparisonProgressHook(evaluatedSegmentPairs)
            try Task.checkCancellation()
          }
        }
        if summary.sum > (bestSummary?.sum ?? 0) { bestSummary = summary }
      }
      guard let bestSummary else { continue }
      let mean = bestSummary.mean
      let coverage = Double(overlap) / Double(query.count)
      let similarity = durationRatio >= 0.75 ? mean * 0.75 + wholeScore * 0.25 : mean
      let score = similarity * (0.7 + 0.3 * coverage)
      let alignment = MusicalVersionAlignment(
        offset: offset,
        queryStart: queryStart,
        targetStart: targetStart,
        overlap: overlap,
        scoreDistribution: bestSummary.distribution,
        score: score,
        coverage: coverage)
      if topAlignments.count < Self.topAlignmentCapacity {
        topAlignments.append(alignment)
        topAlignments.sort(by: Self.alignmentRanksBefore)
      } else if let lowestRanked = topAlignments.last,
        Self.alignmentRanksBefore(alignment, lowestRanked)
      {
        topAlignments[topAlignments.count - 1] = alignment
        topAlignments.sort(by: Self.alignmentRanksBefore)
      }
    }
    try Task.checkCancellation()
    guard let best = topAlignments.first else { return nil }
    let sameTargetRunnerUp =
      topAlignments.first(where: {
        abs($0.offset - best.offset) > 2
      })?.score ?? 0
    let queryRange = Self.range(
      segments: query,
      start: best.queryStart,
      count: best.overlap,
      duration: source.durationSeconds)
    let targetRange = Self.range(
      segments: candidate,
      start: best.targetStart,
      count: best.overlap,
      duration: target.durationSeconds)
    return MusicalVersionComparison(
      score: best.score,
      coverage: best.coverage,
      sourceRange: queryRange,
      targetRange: targetRange,
      scoreDistribution: best.scoreDistribution,
      sameTargetRunnerUpScore: sameTargetRunnerUp)
  }

  private static func alignmentRanksBefore(
    _ left: MusicalVersionAlignment,
    _ right: MusicalVersionAlignment
  ) -> Bool {
    if left.score != right.score { return left.score > right.score }
    if left.coverage != right.coverage { return left.coverage > right.coverage }
    return left.offset < right.offset
  }

  private static func ranksBefore(
    _ left: (MusicalVersionIndexedAsset, MusicalVersionComparison),
    _ right: (MusicalVersionIndexedAsset, MusicalVersionComparison)
  ) -> Bool {
    if left.1.score != right.1.score { return left.1.score > right.1.score }
    return left.0.observation.assetID < right.0.observation.assetID
  }

  private static func logFrequencyEmbedding(
    real: [Float],
    imaginary: [Float],
    sampleRate: Double
  ) -> [Float] {
    var bands = [Float](repeating: 0, count: embeddingDimension)
    let upperFrequency = min(3_520, sampleRate / 2)
    guard upperFrequency > 55 else { return bands }
    for index in 1..<(real.count / 2) {
      let frequency = Double(index) * sampleRate / Double(real.count)
      guard frequency >= 55, frequency <= upperFrequency else { continue }
      let band = Int(floor(12 * log2(frequency / 55)))
      guard bands.indices.contains(band) else { continue }
      bands[band] += real[index] * real[index] + imaginary[index] * imaginary[index]
    }
    return normalized(bands.map { log1p($0) })
  }

  private static func normalized(_ values: [Float]) -> [Float] {
    let norm = sqrt(values.reduce(Float(0)) { $0 + $1 * $1 })
    guard norm.isFinite, norm > 1e-8 else { return [Float](repeating: 0, count: values.count) }
    return values.map { min(1, max(0, $0 / norm)) }
  }

  private static func cosine(
    _ left: [Float],
    _ right: [Float],
    semitoneShift: Int
  ) -> Double {
    guard left.count == embeddingDimension, right.count == embeddingDimension else { return 0 }
    var dot = 0.0
    var leftNorm = 0.0
    var rightNorm = 0.0
    for index in left.indices {
      let shifted = index + semitoneShift
      guard right.indices.contains(shifted) else { continue }
      let lhs = Double(left[index])
      let rhs = Double(right[shifted])
      dot += lhs * rhs
      leftNorm += lhs * lhs
      rightNorm += rhs * rhs
    }
    guard leftNorm > 0, rightNorm > 0 else { return 0 }
    return min(1, max(0, dot / sqrt(leftNorm * rightNorm)))
  }

  private static func range(
    segments: [MusicalVersionSegmentEmbedding],
    start: Int,
    count: Int,
    duration: Double
  ) -> AudioTimeRange {
    let first = segments[start].range.startSeconds
    let last = segments[start + count - 1].range
    return AudioTimeRange(
      startSeconds: first,
      durationSeconds: min(duration - first, last.startSeconds + last.durationSeconds - first))
  }
}

struct MusicalVersionFeatureExtractionPlan: Sendable, Equatable {
  let durationSeconds: Double
  let segmentCount: Int
  let channelCount: Int
  let frameCapacity: Int
  let retainedWorkingMemoryUpperBoundBytes: Int64
  let transientWorkingMemoryUpperBoundBytes: Int64
  let peakWorkingMemoryUpperBoundBytes: Int64
}

private struct MusicalVersionExtractedFeatures {
  let durationSeconds: Double
  let wholeRecording: MusicalVersionFeatureEmbedding
  let segments: [MusicalVersionSegmentEmbedding]
}

private struct MusicalVersionAlignment {
  let offset: Int
  let queryStart: Int
  let targetStart: Int
  let overlap: Int
  let scoreDistribution: AudioScoreDistribution
  let score: Double
  let coverage: Double
}

private struct MusicalVersionScoreSummary {
  private(set) var minimum = Double.infinity
  private(set) var maximum = -Double.infinity
  private(set) var sum = 0.0
  private(set) var count = 0

  var mean: Double { count == 0 ? 0 : sum / Double(count) }
  var distribution: AudioScoreDistribution {
    AudioScoreDistribution(
      minimum: count == 0 ? 0 : minimum,
      mean: mean,
      maximum: count == 0 ? 0 : maximum)
  }

  mutating func record(_ score: Double) {
    minimum = min(minimum, score)
    maximum = max(maximum, score)
    sum += score
    count += 1
  }
}

struct MusicalVersionComparison {
  let score: Double
  let coverage: Double
  let sourceRange: AudioTimeRange
  let targetRange: AudioTimeRange
  let scoreDistribution: AudioScoreDistribution
  let sameTargetRunnerUpScore: Double
}

struct MusicalVersionAnalysisError: Error {
  let abstention: MusicalVersionDiscoveryAbstention

  init(_ abstention: MusicalVersionDiscoveryAbstention) {
    self.abstention = abstention
  }
}
