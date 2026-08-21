import Foundation

public struct LocalExcerptRetrievalPrototypeConfiguration: Sendable, Equatable {
  public static let hardMaximumFileBytes: Int64 = 512 * 1_024 * 1_024
  public static let hardMaximumFileDurationSeconds = 900.0
  public static let hardMaximumCandidateCount = 64
  public static let hardMaximumFingerprintFrames = 20_000
  public static let hardMaximumChannelCount = 16
  public static let hardMaximumWorkingMemoryBytes: Int64 = 64 * 1_024 * 1_024
  public static let safetyMinimumAverageWindowScore = 0.65
  public static let safetyMinimumMatchedWindowRatio = 0.75
  public static let safetyMinimumOffsetConsistency = 0.8
  public static let safetyMinimumRunnerUpMargin = 0.05
  public static let safetyMinimumExactWindowScore = 0.56

  public let windowDurationSeconds: Double
  public let hopDurationSeconds: Double
  public let minimumQueryDurationSeconds: Double
  public let maximumQueryDurationSeconds: Double
  public let minimumAverageWindowScore: Double
  public let minimumMatchedWindowRatio: Double
  public let minimumConsecutiveWindows: Int
  public let minimumConsecutiveDurationSeconds: Double
  public let maximumNeighborsPerWindow: Int
  public let offsetToleranceSeconds: Double
  public let minimumOffsetConsistency: Double
  public let minimumRunnerUpMargin: Double
  public let approximateMinimumWindowScore: Double
  public let exactMinimumWindowScore: Double
  public let maximumFileBytes: Int64
  public let maximumFileDurationSeconds: Double
  public let maximumCandidateCount: Int
  public let maximumFingerprintFrames: Int
  public let maximumChannelCount: Int
  public let maximumWorkingMemoryBytes: Int64

  public init(
    windowDurationSeconds: Double = 1,
    hopDurationSeconds: Double = 0.5,
    minimumQueryDurationSeconds: Double = 5,
    maximumQueryDurationSeconds: Double = 10,
    minimumAverageWindowScore: Double = 0.65,
    minimumMatchedWindowRatio: Double = 0.75,
    minimumConsecutiveWindows: Int = 1,
    minimumConsecutiveDurationSeconds: Double = 5,
    maximumNeighborsPerWindow: Int = 8,
    offsetToleranceSeconds: Double = 0.20,
    minimumOffsetConsistency: Double = 0.8,
    minimumRunnerUpMargin: Double = 0.05,
    approximateMinimumWindowScore: Double = 0.35,
    exactMinimumWindowScore: Double = 0.56,
    maximumFileBytes: Int64 = 512 * 1_024 * 1_024,
    maximumFileDurationSeconds: Double = 900,
    maximumCandidateCount: Int = 64,
    maximumFingerprintFrames: Int = 20_000,
    maximumChannelCount: Int = 16,
    maximumWorkingMemoryBytes: Int64 = 64 * 1_024 * 1_024
  ) {
    self.windowDurationSeconds = windowDurationSeconds
    self.hopDurationSeconds = hopDurationSeconds
    self.minimumQueryDurationSeconds = minimumQueryDurationSeconds
    self.maximumQueryDurationSeconds = maximumQueryDurationSeconds
    self.minimumAverageWindowScore = minimumAverageWindowScore
    self.minimumMatchedWindowRatio = minimumMatchedWindowRatio
    self.minimumConsecutiveWindows = minimumConsecutiveWindows
    self.minimumConsecutiveDurationSeconds = minimumConsecutiveDurationSeconds
    self.maximumNeighborsPerWindow = maximumNeighborsPerWindow
    self.offsetToleranceSeconds = offsetToleranceSeconds
    self.minimumOffsetConsistency = minimumOffsetConsistency
    self.minimumRunnerUpMargin = minimumRunnerUpMargin
    self.approximateMinimumWindowScore = approximateMinimumWindowScore
    self.exactMinimumWindowScore = exactMinimumWindowScore
    self.maximumFileBytes = maximumFileBytes
    self.maximumFileDurationSeconds = maximumFileDurationSeconds
    self.maximumCandidateCount = maximumCandidateCount
    self.maximumFingerprintFrames = maximumFingerprintFrames
    self.maximumChannelCount = maximumChannelCount
    self.maximumWorkingMemoryBytes = maximumWorkingMemoryBytes
  }

  public var validationError: String? {
    let finiteValues = [
      windowDurationSeconds, hopDurationSeconds, minimumQueryDurationSeconds,
      maximumQueryDurationSeconds, minimumAverageWindowScore, minimumMatchedWindowRatio,
      minimumConsecutiveDurationSeconds, offsetToleranceSeconds, minimumOffsetConsistency,
      minimumRunnerUpMargin, approximateMinimumWindowScore, exactMinimumWindowScore,
      maximumFileDurationSeconds,
    ]
    guard finiteValues.allSatisfy(\.isFinite) else {
      return "Excerpt retrieval configuration contains a non-finite value."
    }
    guard (0.75...1.25).contains(windowDurationSeconds),
      (0.35...0.65).contains(hopDurationSeconds),
      hopDurationSeconds <= windowDurationSeconds,
      minimumQueryDurationSeconds >= 5,
      maximumQueryDurationSeconds <= 10,
      maximumQueryDurationSeconds >= minimumQueryDurationSeconds,
      minimumConsecutiveDurationSeconds >= 5,
      minimumConsecutiveDurationSeconds <= maximumQueryDurationSeconds,
      (Self.safetyMinimumAverageWindowScore...1).contains(minimumAverageWindowScore),
      (Self.safetyMinimumMatchedWindowRatio...1).contains(minimumMatchedWindowRatio),
      (Self.safetyMinimumOffsetConsistency...1).contains(minimumOffsetConsistency),
      (Self.safetyMinimumRunnerUpMargin...1).contains(minimumRunnerUpMargin),
      (0...1).contains(approximateMinimumWindowScore),
      (Self.safetyMinimumExactWindowScore...1).contains(exactMinimumWindowScore),
      minimumConsecutiveWindows > 0,
      maximumNeighborsPerWindow > 0,
      maximumNeighborsPerWindow <= 32,
      (0.05...0.3).contains(offsetToleranceSeconds),
      maximumFileBytes > 0,
      maximumFileBytes <= Self.hardMaximumFileBytes,
      maximumFileDurationSeconds > 0,
      maximumFileDurationSeconds <= Self.hardMaximumFileDurationSeconds,
      maximumCandidateCount > 0,
      maximumCandidateCount <= Self.hardMaximumCandidateCount,
      maximumFingerprintFrames > 0,
      maximumFingerprintFrames <= Self.hardMaximumFingerprintFrames,
      maximumChannelCount > 0,
      maximumChannelCount <= Self.hardMaximumChannelCount,
      maximumWorkingMemoryBytes > 0,
      maximumWorkingMemoryBytes <= Self.hardMaximumWorkingMemoryBytes
    else {
      return "Excerpt retrieval configuration is outside its bounded research envelope."
    }
    return nil
  }
}

struct LocalExcerptWorkingMemoryUsage: Sendable, Equatable {
  let measuredBytes: Int64
  let upperBoundBytes: Int64

  static let zero = LocalExcerptWorkingMemoryUsage(measuredBytes: 0, upperBoundBytes: 0)

  func conservativePeak(with other: LocalExcerptWorkingMemoryUsage)
    -> LocalExcerptWorkingMemoryUsage
  {
    LocalExcerptWorkingMemoryUsage(
      measuredBytes: max(measuredBytes, other.measuredBytes),
      upperBoundBytes: max(upperBoundBytes, other.upperBoundBytes))
  }
}

enum LocalExcerptWorkingMemoryPlanner {
  static let frameSize = 4_096
  static let featureCount = 24
  static let bandCount = 96
  static let maximumSignatureBandCount = 20

  private static let fixedFrameworkOverheadBytes: Int64 = 256 * 1_024
  private static let allocationOverheadBytes: Int64 = 64
  private static let excerptWindowUpperBoundBytes: Int64 = 640
  private static let offsetBucketUpperBoundBytes: Int64 = 128
  private static let exactHitUpperBoundBytes: Int64 = 256
  // Covers validation sets, sorted candidates, retained summaries, ranking copies, and output slots.
  private static let requestCandidateMeasuredBytes = 1_024
  private static let requestCandidateUpperBoundBytes = 4_096

  static func requestContainers(
    candidateCount: Int,
    metadataByteCount: Int
  ) -> LocalExcerptWorkingMemoryUsage? {
    guard candidateCount > 0, metadataByteCount >= 0 else { return nil }
    var measured = ByteCounter()
    guard measured.addProduct(candidateCount, requestCandidateMeasuredBytes),
      measured.addProduct(metadataByteCount, 2)
    else { return nil }

    var upper = ByteCounter()
    guard upper.addProduct(candidateCount, requestCandidateUpperBoundBytes),
      upper.addProduct(metadataByteCount, 4),
      upper.addProduct(candidateCount, Int(allocationOverheadBytes) * 12)
    else { return nil }
    return LocalExcerptWorkingMemoryUsage(
      measuredBytes: measured.total,
      upperBoundBytes: upper.total)
  }

  static func addingRequestContainers(
    to phase: LocalExcerptWorkingMemoryUsage,
    requestContainers: LocalExcerptWorkingMemoryUsage
  ) -> LocalExcerptWorkingMemoryUsage? {
    var measured = ByteCounter()
    var upper = ByteCounter()
    guard measured.add(phase.measuredBytes),
      measured.add(requestContainers.measuredBytes),
      upper.add(phase.upperBoundBytes),
      upper.add(requestContainers.upperBoundBytes)
    else { return nil }
    return LocalExcerptWorkingMemoryUsage(
      measuredBytes: measured.total,
      upperBoundBytes: upper.total)
  }

  static func fingerprint(
    frameCount: Int,
    channelCount: Int
  ) -> LocalExcerptWorkingMemoryUsage? {
    guard frameCount > 0, channelCount > 0 else { return nil }
    guard let resident = fingerprintResident(frameCount: frameCount) else { return nil }
    var measured = ByteCounter()
    guard measured.add(resident.measuredBytes),
      measured.addProduct(channelCount, frameSize * MemoryLayout<Float>.stride),
      measured.addProduct(4, frameSize * MemoryLayout<Float>.stride),
      measured.addProduct(bandCount, MemoryLayout<Float>.stride)
    else { return nil }

    var upper = ByteCounter()
    guard upper.add(resident.upperBoundBytes),
      upper.addProduct(channelCount, frameSize * MemoryLayout<Float>.stride),
      upper.addProduct(channelCount, Int(allocationOverheadBytes)),
      upper.addProduct(4, frameSize * MemoryLayout<Float>.stride),
      upper.addProduct(bandCount, MemoryLayout<Float>.stride),
      upper.addProduct(8, Int(allocationOverheadBytes)),
      upper.add(fixedFrameworkOverheadBytes)
    else { return nil }
    return LocalExcerptWorkingMemoryUsage(
      measuredBytes: measured.total,
      upperBoundBytes: upper.total)
  }

  static func match(
    query: LocalLandmarkFingerprint,
    targetFrameCount: Int,
    targetChannelCount: Int,
    targetHopSeconds: Double,
    configuration: LocalExcerptRetrievalPrototypeConfiguration,
    requestContainers: LocalExcerptWorkingMemoryUsage = .zero
  ) -> LocalExcerptWorkingMemoryUsage? {
    guard query.channelCount > 0,
      query.channelCount <= configuration.maximumChannelCount,
      targetFrameCount > 0,
      targetChannelCount > 0,
      targetChannelCount <= configuration.maximumChannelCount,
      targetHopSeconds.isFinite, targetHopSeconds > 0,
      let queryResident = fingerprintResident(frameCount: query.frameFeatures.count),
      let targetBuild = fingerprint(
        frameCount: targetFrameCount,
        channelCount: targetChannelCount),
      let targetResident = fingerprintResident(frameCount: targetFrameCount),
      let queryWindowCount = windowCount(
        frameCount: query.frameFeatures.count,
        fingerprintHopSeconds: query.hopSeconds,
        configuration: configuration),
      let targetWindowCount = windowCount(
        frameCount: targetFrameCount,
        fingerprintHopSeconds: targetHopSeconds,
        configuration: configuration)
    else { return nil }

    var buildMeasured = ByteCounter()
    var buildUpper = ByteCounter()
    guard buildMeasured.add(queryResident.measuredBytes),
      buildMeasured.add(targetBuild.measuredBytes),
      buildUpper.add(queryResident.upperBoundBytes),
      buildUpper.add(targetBuild.upperBoundBytes)
    else { return nil }

    let maximumApproximateHits = queryWindowCount.multipliedReportingOverflow(
      by: configuration.maximumNeighborsPerWindow)
    guard !maximumApproximateHits.overflow else { return nil }

    var matchMeasured = ByteCounter()
    guard matchMeasured.add(queryResident.measuredBytes),
      matchMeasured.add(targetResident.measuredBytes),
      matchMeasured.addProduct(
        queryWindowCount,
        Int(excerptWindowUpperBoundBytes - allocationOverheadBytes)),
      matchMeasured.addProduct(
        targetWindowCount,
        Int(excerptWindowUpperBoundBytes - allocationOverheadBytes)),
      matchMeasured.addProduct(
        targetWindowCount,
        maximumSignatureBandCount * MemoryLayout<Int>.stride),
      matchMeasured.addProduct(
        maximumApproximateHits.partialValue,
        Int(offsetBucketUpperBoundBytes - allocationOverheadBytes)),
      matchMeasured.addProduct(
        targetWindowCount,
        MemoryLayout<UInt32>.stride + MemoryLayout<Int>.stride
          + MemoryLayout<RankedApproximateCandidate>.stride),
      matchMeasured.addProduct(
        configuration.maximumNeighborsPerWindow,
        MemoryLayout<ApproximateExcerptWindowHit>.stride),
      matchMeasured.addProduct(queryWindowCount, Int(exactHitUpperBoundBytes) * 2)
    else { return nil }

    var matchUpper = ByteCounter()
    guard matchUpper.add(queryResident.upperBoundBytes),
      matchUpper.add(targetResident.upperBoundBytes),
      matchUpper.addProduct(
        queryWindowCount,
        Int(excerptWindowUpperBoundBytes)),
      matchUpper.addProduct(
        targetWindowCount,
        Int(excerptWindowUpperBoundBytes)),
      matchUpper.addProduct(
        targetWindowCount,
        maximumSignatureBandCount * MemoryLayout<Int>.stride * 2
          + Int(allocationOverheadBytes) * 2),
      matchUpper.addProduct(
        maximumApproximateHits.partialValue,
        Int(offsetBucketUpperBoundBytes)),
      matchUpper.addProduct(
        targetWindowCount,
        (MemoryLayout<UInt32>.stride + MemoryLayout<Int>.stride
          + MemoryLayout<RankedApproximateCandidate>.stride) * 2),
      matchUpper.addProduct(
        configuration.maximumNeighborsPerWindow,
        MemoryLayout<ApproximateExcerptWindowHit>.stride * 2),
      matchUpper.addProduct(queryWindowCount, Int(exactHitUpperBoundBytes) * 2),
      matchUpper.addProduct(12, Int(allocationOverheadBytes)),
      matchUpper.add(fixedFrameworkOverheadBytes)
    else { return nil }

    return addingRequestContainers(
      to: LocalExcerptWorkingMemoryUsage(
        measuredBytes: max(buildMeasured.total, matchMeasured.total),
        upperBoundBytes: max(buildUpper.total, matchUpper.total)),
      requestContainers: requestContainers)
  }

  static func measuredMatchBytes(
    query: LocalLandmarkFingerprint,
    target: LocalLandmarkFingerprint,
    queryWindowCount: Int,
    targetWindowCount: Int,
    signaturePostingCount: Int,
    offsetBucketCount: Int,
    configuration: LocalExcerptRetrievalPrototypeConfiguration
  ) -> Int64? {
    guard let queryResident = fingerprintResident(frameCount: query.frameFeatures.count),
      let targetResident = fingerprintResident(frameCount: target.frameFeatures.count)
    else { return nil }

    var buildPeak = ByteCounter()
    guard buildPeak.add(queryResident.measuredBytes),
      buildPeak.add(target.workingMemoryMeasuredBytes)
    else { return nil }

    var matchPeak = ByteCounter()
    guard matchPeak.add(queryResident.measuredBytes),
      matchPeak.add(targetResident.measuredBytes),
      matchPeak.addProduct(
        queryWindowCount,
        MemoryLayout<ExcerptWindow>.stride + featureCount * MemoryLayout<Float>.stride),
      matchPeak.addProduct(
        targetWindowCount,
        MemoryLayout<ExcerptWindow>.stride + featureCount * MemoryLayout<Float>.stride),
      matchPeak.addProduct(signaturePostingCount, MemoryLayout<Int>.stride * 2),
      matchPeak.addProduct(
        targetWindowCount,
        MemoryLayout<UInt32>.stride + MemoryLayout<Int>.stride
          + MemoryLayout<RankedApproximateCandidate>.stride),
      matchPeak.addProduct(
        configuration.maximumNeighborsPerWindow,
        MemoryLayout<ApproximateExcerptWindowHit>.stride),
      matchPeak.addProduct(
        offsetBucketCount,
        MemoryLayout<Int>.stride + MemoryLayout<ApproximateOffsetAccumulator>.stride
          + MemoryLayout<Int>.stride),
      matchPeak.addProduct(queryWindowCount, MemoryLayout<ExactExcerptWindowHit>.stride * 2)
    else { return nil }
    return max(buildPeak.total, matchPeak.total)
  }

  private static func fingerprintResident(frameCount: Int) -> LocalExcerptWorkingMemoryUsage? {
    var measured = ByteCounter()
    guard measured.addProduct(frameCount, MemoryLayout<UInt64>.stride),
      measured.addProduct(frameCount, MemoryLayout<[Float]>.stride),
      measured.addProduct(frameCount, featureCount * MemoryLayout<Float>.stride)
    else { return nil }

    var upper = ByteCounter()
    guard upper.add(measured.total),
      upper.add(measured.total),
      upper.addProduct(frameCount, Int(allocationOverheadBytes)),
      upper.addProduct(3, Int(allocationOverheadBytes)),
      upper.add(256)
    else { return nil }
    return LocalExcerptWorkingMemoryUsage(
      measuredBytes: measured.total,
      upperBoundBytes: upper.total)
  }

  private static func windowCount(
    frameCount: Int,
    fingerprintHopSeconds: Double,
    configuration: LocalExcerptRetrievalPrototypeConfiguration
  ) -> Int? {
    guard frameCount > 0, fingerprintHopSeconds.isFinite, fingerprintHopSeconds > 0 else {
      return nil
    }
    let rawFramesPerWindow = configuration.windowDurationSeconds / fingerprintHopSeconds
    let rawHopFrames = configuration.hopDurationSeconds / fingerprintHopSeconds
    guard rawFramesPerWindow.isFinite, rawHopFrames.isFinite,
      rawFramesPerWindow <= Double(Int.max), rawHopFrames <= Double(Int.max)
    else { return nil }
    let framesPerWindow = max(1, Int(rawFramesPerWindow.rounded()))
    let hopFrames = max(1, Int(rawHopFrames.rounded()))
    guard frameCount >= framesPerWindow else { return 0 }
    return ((frameCount - framesPerWindow) / hopFrames) + 1
  }
}

private struct ByteCounter {
  private(set) var total: Int64 = 0

  mutating func add(_ value: Int64) -> Bool {
    guard value >= 0 else { return false }
    let result = total.addingReportingOverflow(value)
    guard !result.overflow else { return false }
    total = result.partialValue
    return true
  }

  mutating func addProduct(_ count: Int, _ bytesPerElement: Int) -> Bool {
    guard count >= 0, bytesPerElement >= 0,
      let count = Int64(exactly: count),
      let bytesPerElement = Int64(exactly: bytesPerElement)
    else { return false }
    let product = count.multipliedReportingOverflow(by: bytesPerElement)
    guard !product.overflow else { return false }
    return add(product.partialValue)
  }
}

struct LocalExcerptRetrievalMatch {
  let score: Double
  let matchedCoverage: Double
  let runnerUpScore: Double
  let queryRange: AudioTimeRange
  let targetRange: AudioTimeRange
  let effectiveWindowDurationSeconds: Double
  let effectiveHopDurationSeconds: Double
  let matchedWindowCount: Int
  let totalQueryWindowCount: Int
  let candidateWindowCount: Int
  let offsetConsistency: Double
  let scoreDistribution: AudioScoreDistribution
  let approximateCandidateVisitCount: Int
  let exactSequenceComparisonCount: Int
  let workingMemoryUsage: LocalExcerptWorkingMemoryUsage

  func replacingWorkingMemoryUsage(
    _ usage: LocalExcerptWorkingMemoryUsage
  ) -> LocalExcerptRetrievalMatch {
    LocalExcerptRetrievalMatch(
      score: score,
      matchedCoverage: matchedCoverage,
      runnerUpScore: runnerUpScore,
      queryRange: queryRange,
      targetRange: targetRange,
      effectiveWindowDurationSeconds: effectiveWindowDurationSeconds,
      effectiveHopDurationSeconds: effectiveHopDurationSeconds,
      matchedWindowCount: matchedWindowCount,
      totalQueryWindowCount: totalQueryWindowCount,
      candidateWindowCount: candidateWindowCount,
      offsetConsistency: offsetConsistency,
      scoreDistribution: scoreDistribution,
      approximateCandidateVisitCount: approximateCandidateVisitCount,
      exactSequenceComparisonCount: exactSequenceComparisonCount,
      workingMemoryUsage: usage)
  }

  func diagnostics(
    configuration: LocalExcerptRetrievalPrototypeConfiguration,
    runnerUpMargin: Double,
    sourceFingerprintFrameCount: Int,
    targetFingerprintFrameCount: Int
  ) -> AudioExcerptRetrievalDiagnostics {
    AudioExcerptRetrievalDiagnostics(
      windowDurationSeconds: effectiveWindowDurationSeconds,
      hopDurationSeconds: effectiveHopDurationSeconds,
      matchedWindowCount: matchedWindowCount,
      consecutiveWindowCount: matchedWindowCount,
      totalQueryWindowCount: totalQueryWindowCount,
      candidateWindowCount: candidateWindowCount,
      offsetConsistency: offsetConsistency,
      scoreDistribution: scoreDistribution,
      exactSequenceVerified: true,
      requestedWindowDurationSeconds: configuration.windowDurationSeconds,
      requestedHopDurationSeconds: configuration.hopDurationSeconds,
      runnerUpMargin: runnerUpMargin,
      queryRange: queryRange,
      referenceRange: targetRange,
      approximateCandidateVisitCount: approximateCandidateVisitCount,
      exactSequenceComparisonCount: exactSequenceComparisonCount,
      sourceFingerprintFrameCount: sourceFingerprintFrameCount,
      targetFingerprintFrameCount: targetFingerprintFrameCount,
      workingMemoryMeasuredBytes: workingMemoryUsage.measuredBytes,
      workingMemoryUpperBoundBytes: workingMemoryUsage.upperBoundBytes)
  }
}

struct LocalExcerptRetrievalPrototype {
  let configuration: LocalExcerptRetrievalPrototypeConfiguration

  func match(
    query: LocalLandmarkFingerprint,
    target: LocalLandmarkFingerprint,
    requestContainers: LocalExcerptWorkingMemoryUsage = .zero
  )
    throws -> LocalExcerptRetrievalMatch?
  {
    guard configuration.validationError == nil,
      query.durationSeconds >= configuration.minimumQueryDurationSeconds,
      query.durationSeconds <= configuration.maximumQueryDurationSeconds,
      let plannedWorkingMemoryUsage = LocalExcerptWorkingMemoryPlanner.match(
        query: query,
        targetFrameCount: target.frameFeatures.count,
        targetChannelCount: target.channelCount,
        targetHopSeconds: target.hopSeconds,
        configuration: configuration,
        requestContainers: requestContainers),
      plannedWorkingMemoryUsage.upperBoundBytes <= configuration.maximumWorkingMemoryBytes
    else { return nil }
    if Task.isCancelled { throw CancellationError() }

    let queryWindowSet = makeWindows(from: query)
    let targetWindowSet = makeWindows(from: target)
    let requiredWindowCount = max(
      configuration.minimumConsecutiveWindows,
      windowCount(
        covering: configuration.minimumConsecutiveDurationSeconds,
        windowDuration: queryWindowSet.effectiveWindowDurationSeconds,
        hopDuration: queryWindowSet.effectiveHopDurationSeconds))
    guard queryWindowSet.windows.count >= requiredWindowCount,
      !targetWindowSet.windows.isEmpty
    else { return nil }

    let index = LocalApproximateExcerptWindowIndex(windows: targetWindowSet.windows)
    var neighborScratch = LocalApproximateExcerptWindowScratch(
      windowCount: targetWindowSet.windows.count,
      hitCapacity: configuration.maximumNeighborsPerWindow)
    var offsetBuckets: [Int: ApproximateOffsetAccumulator] = [:]
    var approximateCandidateVisitCount = 0
    for queryWindow in queryWindowSet.windows {
      if Task.isCancelled { throw CancellationError() }
      approximateCandidateVisitCount += index.neighbors(
        for: queryWindow,
        limit: configuration.maximumNeighborsPerWindow,
        minimumScore: configuration.approximateMinimumWindowScore,
        scratch: &neighborScratch)
      for hit in neighborScratch.hits {
        let bucket = Int((hit.offsetSeconds / configuration.offsetToleranceSeconds).rounded())
        offsetBuckets[bucket, default: ApproximateOffsetAccumulator()].add(hit.offsetSeconds)
      }
    }
    guard !offsetBuckets.isEmpty else { return nil }

    let candidateOffsets = offsetBuckets.keys.sorted().compactMap { bucket in
      offsetBuckets[bucket]?.averageOffsetSeconds
    }
    var exactSequenceComparisonCount = 0
    var best: ExactExcerptWindowChain?
    for candidateOffset in candidateOffsets {
      if Task.isCancelled { throw CancellationError() }
      let result = exactChain(
        queryWindows: queryWindowSet.windows,
        targetWindows: targetWindowSet.windows,
        queryFeatures: query.frameFeatures,
        targetFeatures: target.frameFeatures,
        candidateOffsetSeconds: candidateOffset,
        targetHopDurationSeconds: targetWindowSet.effectiveHopDurationSeconds)
      exactSequenceComparisonCount += result.comparisonCount
      if let chain = result.chain,
        best == nil || chainRanksBefore(chain, best!)
      {
        best = chain
      }
    }
    guard let best else { return nil }

    let distinctOffset = max(
      configuration.offsetToleranceSeconds * 2,
      queryWindowSet.effectiveHopDurationSeconds)
    var distinctRunnerUp: ExactExcerptWindowChain?
    for candidateOffset in candidateOffsets
    where abs(candidateOffset - best.averageOffsetSeconds) >= distinctOffset {
      if Task.isCancelled { throw CancellationError() }
      let result = exactChain(
        queryWindows: queryWindowSet.windows,
        targetWindows: targetWindowSet.windows,
        queryFeatures: query.frameFeatures,
        targetFeatures: target.frameFeatures,
        candidateOffsetSeconds: candidateOffset,
        targetHopDurationSeconds: targetWindowSet.effectiveHopDurationSeconds)
      exactSequenceComparisonCount += result.comparisonCount
      if let chain = result.chain,
        distinctRunnerUp == nil || chainRanksBefore(chain, distinctRunnerUp!)
      {
        distinctRunnerUp = chain
      }
    }
    let runnerUpScore = distinctRunnerUp?.finalScore ?? 0
    let runnerUpMargin = max(0, best.finalScore - runnerUpScore)
    let matchedCoverage = Double(best.hits.count) / Double(queryWindowSet.windows.count)
    let sourceStart = best.hits.first?.queryWindow.startSeconds ?? 0
    let sourceEnd =
      best.hits.last.map {
        $0.queryWindow.startSeconds + queryWindowSet.effectiveWindowDurationSeconds
      } ?? sourceStart
    let targetStart = best.hits.first?.targetWindow.startSeconds ?? 0
    let targetEnd =
      best.hits.last.map {
        $0.targetWindow.startSeconds + targetWindowSet.effectiveWindowDurationSeconds
      } ?? targetStart
    let coveredDuration = min(sourceEnd - sourceStart, targetEnd - targetStart)
    let averageScore = mean(best.windowScores)

    guard best.hits.count >= requiredWindowCount,
      coveredDuration >= configuration.minimumConsecutiveDurationSeconds,
      coveredDuration <= configuration.maximumQueryDurationSeconds + 0.1,
      averageScore >= configuration.minimumAverageWindowScore,
      matchedCoverage >= configuration.minimumMatchedWindowRatio,
      best.offsetConsistency >= configuration.minimumOffsetConsistency,
      runnerUpMargin >= configuration.minimumRunnerUpMargin
    else { return nil }
    guard
      let pairMeasuredWorkingMemoryBytes = LocalExcerptWorkingMemoryPlanner.measuredMatchBytes(
        query: query,
        target: target,
        queryWindowCount: queryWindowSet.windows.count,
        targetWindowCount: targetWindowSet.windows.count,
        signaturePostingCount: index.postingCount,
        offsetBucketCount: offsetBuckets.count,
        configuration: configuration),
      let measuredWorkingMemoryUsage = LocalExcerptWorkingMemoryPlanner.addingRequestContainers(
        to: LocalExcerptWorkingMemoryUsage(
          measuredBytes: pairMeasuredWorkingMemoryBytes,
          upperBoundBytes: 0),
        requestContainers: requestContainers),
      measuredWorkingMemoryUsage.measuredBytes <= plannedWorkingMemoryUsage.upperBoundBytes
    else { return nil }

    return LocalExcerptRetrievalMatch(
      score: best.finalScore,
      matchedCoverage: matchedCoverage,
      runnerUpScore: runnerUpScore,
      queryRange: AudioTimeRange(startSeconds: sourceStart, durationSeconds: coveredDuration),
      targetRange: AudioTimeRange(startSeconds: targetStart, durationSeconds: coveredDuration),
      effectiveWindowDurationSeconds: queryWindowSet.effectiveWindowDurationSeconds,
      effectiveHopDurationSeconds: queryWindowSet.effectiveHopDurationSeconds,
      matchedWindowCount: best.hits.count,
      totalQueryWindowCount: queryWindowSet.windows.count,
      candidateWindowCount: targetWindowSet.windows.count,
      offsetConsistency: best.offsetConsistency,
      scoreDistribution: AudioScoreDistribution(
        minimum: best.windowScores.min() ?? 0,
        mean: averageScore,
        maximum: best.windowScores.max() ?? 0),
      approximateCandidateVisitCount: approximateCandidateVisitCount,
      exactSequenceComparisonCount: exactSequenceComparisonCount,
      workingMemoryUsage: LocalExcerptWorkingMemoryUsage(
        measuredBytes: measuredWorkingMemoryUsage.measuredBytes,
        upperBoundBytes: plannedWorkingMemoryUsage.upperBoundBytes))
  }

  private func makeWindows(from fingerprint: LocalLandmarkFingerprint) -> ExcerptWindowSet {
    guard !fingerprint.frameFeatures.isEmpty, fingerprint.hopSeconds.isFinite,
      fingerprint.hopSeconds > 0
    else { return ExcerptWindowSet() }
    let framesPerWindow = max(
      1, Int((configuration.windowDurationSeconds / fingerprint.hopSeconds).rounded()))
    let hopFrames = max(
      1, Int((configuration.hopDurationSeconds / fingerprint.hopSeconds).rounded()))
    guard fingerprint.frameFeatures.count >= framesPerWindow else {
      return ExcerptWindowSet(
        effectiveWindowDurationSeconds: Double(framesPerWindow) * fingerprint.hopSeconds,
        effectiveHopDurationSeconds: Double(hopFrames) * fingerprint.hopSeconds)
    }

    var windows: [ExcerptWindow] = []
    windows.reserveCapacity(
      ((fingerprint.frameFeatures.count - framesPerWindow) / hopFrames) + 1)
    var startFrame = 0
    while startFrame + framesPerWindow <= fingerprint.frameFeatures.count {
      let frameRange = startFrame..<(startFrame + framesPerWindow)
      let features = fingerprint.frameFeatures[frameRange]
      let embedding = normalizedAverage(of: features)
      windows.append(
        ExcerptWindow(
          index: windows.count,
          startSeconds: Double(startFrame) * fingerprint.hopSeconds,
          frameRange: frameRange,
          embedding: embedding,
          signatureBands: signatureBands(in: embedding)))
      startFrame += hopFrames
    }
    return ExcerptWindowSet(
      windows: windows,
      effectiveWindowDurationSeconds: Double(framesPerWindow) * fingerprint.hopSeconds,
      effectiveHopDurationSeconds: Double(hopFrames) * fingerprint.hopSeconds)
  }

  private func exactChain(
    queryWindows: [ExcerptWindow],
    targetWindows: [ExcerptWindow],
    queryFeatures: [[Float]],
    targetFeatures: [[Float]],
    candidateOffsetSeconds: Double,
    targetHopDurationSeconds: Double
  ) -> (chain: ExactExcerptWindowChain?, comparisonCount: Int) {
    guard targetHopDurationSeconds > 0 else { return (nil, 0) }
    var currentRun: [ExactExcerptWindowHit] = []
    var bestRun: [ExactExcerptWindowHit] = []
    currentRun.reserveCapacity(queryWindows.count)
    bestRun.reserveCapacity(queryWindows.count)
    var comparisonCount = 0
    for queryWindow in queryWindows {
      let expectedStart = queryWindow.startSeconds + candidateOffsetSeconds
      let centerIndex = Int((expectedStart / targetHopDurationSeconds).rounded())
      var best: ExactExcerptWindowHit?
      for targetIndex in (centerIndex - 1)...(centerIndex + 1)
      where targetWindows.indices.contains(targetIndex) {
        comparisonCount += 1
        let targetWindow = targetWindows[targetIndex]
        let offset = targetWindow.startSeconds - queryWindow.startSeconds
        guard abs(offset - candidateOffsetSeconds) <= configuration.offsetToleranceSeconds * 1.5
        else { continue }
        let score = exactSequenceSimilarity(
          queryWindow,
          targetWindow,
          queryFeatures: queryFeatures,
          targetFeatures: targetFeatures)
        guard score >= configuration.exactMinimumWindowScore else { continue }
        let hit = ExactExcerptWindowHit(
          queryWindow: queryWindow,
          targetWindow: targetWindow,
          offsetSeconds: offset,
          score: score)
        if best == nil || exactHitRanksBefore(hit, best!) { best = hit }
      }
      guard let hit = best else {
        retainBetterRun(currentRun, in: &bestRun)
        currentRun.removeAll(keepingCapacity: true)
        continue
      }
      if let previous = currentRun.last {
        let consecutive =
          hit.queryWindow.index == previous.queryWindow.index + 1
          && hit.targetWindow.index == previous.targetWindow.index + 1
        let stableOffset =
          abs(hit.offsetSeconds - previous.offsetSeconds) <= configuration.offsetToleranceSeconds
        if consecutive && stableOffset {
          currentRun.append(hit)
        } else {
          retainBetterRun(currentRun, in: &bestRun)
          currentRun.removeAll(keepingCapacity: true)
          currentRun.append(hit)
        }
      } else {
        currentRun.append(hit)
      }
    }
    retainBetterRun(currentRun, in: &bestRun)
    guard !bestRun.isEmpty else { return (nil, comparisonCount) }

    let offsets = bestRun.map(\.offsetSeconds)
    let averageOffset = mean(offsets)
    let averageDeviation = mean(offsets.map { abs($0 - averageOffset) })
    let offsetConsistency = max(
      0, 1 - averageDeviation / configuration.offsetToleranceSeconds)
    let windowScores = bestRun.map(\.score)
    let averageScore = mean(windowScores)
    let coverage = Double(bestRun.count) / Double(queryWindows.count)
    let finalScore = min(1, averageScore * 0.65 + coverage * 0.2 + offsetConsistency * 0.15)
    return (
      ExactExcerptWindowChain(
        hits: bestRun,
        averageOffsetSeconds: averageOffset,
        offsetConsistency: offsetConsistency,
        windowScores: windowScores,
        finalScore: finalScore),
      comparisonCount
    )
  }

  private func retainBetterRun(
    _ candidate: [ExactExcerptWindowHit],
    in retained: inout [ExactExcerptWindowHit]
  ) {
    guard !candidate.isEmpty,
      retained.isEmpty || runRanksBefore(retained, candidate)
    else { return }
    retained = candidate
  }

  private func exactSequenceSimilarity(
    _ query: ExcerptWindow,
    _ target: ExcerptWindow,
    queryFeatures: [[Float]],
    targetFeatures: [[Float]]
  ) -> Double {
    guard !query.frameRange.isEmpty, !target.frameRange.isEmpty else { return 0 }
    let embeddingScore = cosineSimilarity(query.embedding, target.embedding)
    var frameScoreTotal = Double(0)
    for queryOffset in 0..<query.frameRange.count {
      let fraction = Double(queryOffset) / Double(max(1, query.frameRange.count - 1))
      let targetOffset = min(
        target.frameRange.count - 1,
        Int((fraction * Double(max(0, target.frameRange.count - 1))).rounded()))
      frameScoreTotal += cosineSimilarity(
        queryFeatures[query.frameRange.lowerBound + queryOffset],
        targetFeatures[target.frameRange.lowerBound + targetOffset])
    }
    let rankOverlap = signatureOverlap(query.signatureBands, target.signatureBands)
    let frameScore = frameScoreTotal / Double(query.frameRange.count)
    let cosineScore = embeddingScore * 0.45 + frameScore * 0.45 + rankOverlap * 0.1
    let harmonicRobustScore = embeddingScore * 0.2 + frameScore * 0.35 + rankOverlap * 0.45
    return min(1, max(cosineScore, harmonicRobustScore))
  }

  private func normalizedAverage(of vectors: ArraySlice<[Float]>) -> [Float] {
    guard let first = vectors.first else { return [] }
    var result = [Float](repeating: 0, count: first.count)
    for vector in vectors {
      for index in vector.indices { result[index] += vector[index] }
    }
    let scale = 1 / Float(vectors.count)
    for index in result.indices { result[index] *= scale }
    let norm = sqrt(result.reduce(Float(0)) { $0 + $1 * $1 })
    guard norm > 1e-6 else { return result }
    return result.map { $0 / norm }
  }

  private func signatureBands(in embedding: [Float], count: Int = 10) -> [Int] {
    let exact = embedding.indices.sorted {
      if embedding[$0] != embedding[$1] { return embedding[$0] > embedding[$1] }
      return $0 < $1
    }.prefix(count)
    return Array(Set(exact.flatMap { [$0, 100 + $0 / 4] })).sorted()
  }

  private func signatureOverlap(_ left: [Int], _ right: [Int]) -> Double {
    let left = Set(left.filter { $0 < 100 })
    let right = Set(right.filter { $0 < 100 })
    guard !left.isEmpty else { return 0 }
    return Double(left.intersection(right).count) / Double(left.count)
  }

  private func cosineSimilarity(_ left: [Float], _ right: [Float]) -> Double {
    guard left.count == right.count, !left.isEmpty else { return 0 }
    var dot = Double(0)
    var leftNorm = Double(0)
    var rightNorm = Double(0)
    for index in left.indices {
      let leftValue = Double(left[index])
      let rightValue = Double(right[index])
      dot += leftValue * rightValue
      leftNorm += leftValue * leftValue
      rightNorm += rightValue * rightValue
    }
    guard leftNorm > 1e-12, rightNorm > 1e-12 else { return 0 }
    return max(0, min(1, dot / sqrt(leftNorm * rightNorm)))
  }

  private func windowCount(
    covering duration: Double,
    windowDuration: Double,
    hopDuration: Double
  ) -> Int {
    guard duration > windowDuration else { return 1 }
    return Int(ceil((duration - windowDuration) / hopDuration)) + 1
  }

  private func mean(_ values: [Double]) -> Double {
    guard !values.isEmpty else { return 0 }
    return values.reduce(Double(0), +) / Double(values.count)
  }

  private func median(_ values: [Double]) -> Double {
    guard !values.isEmpty else { return 0 }
    let middle = values.count / 2
    if values.count.isMultiple(of: 2) {
      return (values[middle - 1] + values[middle]) / 2
    }
    return values[middle]
  }

  private func chainRanksBefore(
    _ left: ExactExcerptWindowChain,
    _ right: ExactExcerptWindowChain
  ) -> Bool {
    if left.finalScore != right.finalScore { return left.finalScore > right.finalScore }
    if left.hits.count != right.hits.count { return left.hits.count > right.hits.count }
    return left.averageOffsetSeconds < right.averageOffsetSeconds
  }

  private func exactHitRanksBefore(
    _ left: ExactExcerptWindowHit,
    _ right: ExactExcerptWindowHit
  ) -> Bool {
    if left.score != right.score { return left.score > right.score }
    return left.targetWindow.index < right.targetWindow.index
  }

  private func runRanksBefore(
    _ left: [ExactExcerptWindowHit],
    _ right: [ExactExcerptWindowHit]
  ) -> Bool {
    if left.count != right.count { return left.count < right.count }
    let leftMean = mean(left.map(\.score))
    let rightMean = mean(right.map(\.score))
    if leftMean != rightMean { return leftMean < rightMean }
    return (left.first?.targetWindow.index ?? 0) > (right.first?.targetWindow.index ?? 0)
  }
}

private struct ExcerptWindowSet {
  let windows: [ExcerptWindow]
  let effectiveWindowDurationSeconds: Double
  let effectiveHopDurationSeconds: Double

  init(
    windows: [ExcerptWindow] = [],
    effectiveWindowDurationSeconds: Double = 0,
    effectiveHopDurationSeconds: Double = 0
  ) {
    self.windows = windows
    self.effectiveWindowDurationSeconds = effectiveWindowDurationSeconds
    self.effectiveHopDurationSeconds = effectiveHopDurationSeconds
  }
}

private struct ExcerptWindow {
  let index: Int
  let startSeconds: Double
  let frameRange: Range<Int>
  let embedding: [Float]
  let signatureBands: [Int]
}

private struct ApproximateExcerptWindowHit {
  let offsetSeconds: Double
}

private struct RankedApproximateCandidate {
  let index: Int
  let score: Double
}

private struct ApproximateOffsetAccumulator {
  private(set) var count = 0
  private(set) var offsetSum = Double(0)

  var averageOffsetSeconds: Double {
    count == 0 ? 0 : offsetSum / Double(count)
  }

  mutating func add(_ offsetSeconds: Double) {
    count += 1
    offsetSum += offsetSeconds
  }
}

private struct LocalApproximateExcerptWindowScratch {
  var seenGenerations: [UInt32]
  var generation: UInt32 = 0
  var candidateIndexes: [Int] = []
  var rankedCandidates: [RankedApproximateCandidate] = []
  var hits: [ApproximateExcerptWindowHit] = []

  init(windowCount: Int, hitCapacity: Int) {
    seenGenerations = [UInt32](repeating: 0, count: windowCount)
    candidateIndexes.reserveCapacity(windowCount)
    rankedCandidates.reserveCapacity(windowCount)
    hits.reserveCapacity(hitCapacity)
  }

  mutating func beginQuery() {
    if generation == .max {
      seenGenerations = [UInt32](repeating: 0, count: seenGenerations.count)
      generation = 1
    } else {
      generation += 1
    }
    candidateIndexes.removeAll(keepingCapacity: true)
    rankedCandidates.removeAll(keepingCapacity: true)
    hits.removeAll(keepingCapacity: true)
  }
}

private struct ExactExcerptWindowHit {
  let queryWindow: ExcerptWindow
  let targetWindow: ExcerptWindow
  let offsetSeconds: Double
  let score: Double
}

private struct ExactExcerptWindowChain {
  let hits: [ExactExcerptWindowHit]
  let averageOffsetSeconds: Double
  let offsetConsistency: Double
  let windowScores: [Double]
  let finalScore: Double
}

private struct LocalApproximateExcerptWindowIndex {
  let windows: [ExcerptWindow]
  let buckets: [Int: [Int]]

  var postingCount: Int {
    buckets.values.reduce(0) { $0 + $1.count }
  }

  init(windows: [ExcerptWindow]) {
    self.windows = windows
    var buckets: [Int: [Int]] = [:]
    for window in windows {
      for band in window.signatureBands {
        buckets[band, default: []].append(window.index)
      }
    }
    self.buckets = buckets
  }

  func neighbors(
    for query: ExcerptWindow,
    limit: Int,
    minimumScore: Double,
    scratch: inout LocalApproximateExcerptWindowScratch
  ) -> Int {
    scratch.beginQuery()
    for band in query.signatureBands {
      for candidateIndex in buckets[band, default: []]
      where scratch.seenGenerations[candidateIndex] != scratch.generation {
        scratch.seenGenerations[candidateIndex] = scratch.generation
        scratch.candidateIndexes.append(candidateIndex)
      }
    }
    scratch.candidateIndexes.sort()
    for candidateIndex in scratch.candidateIndexes {
      let candidate = windows[candidateIndex]
      let score = cosineSimilarity(query.embedding, candidate.embedding)
      if score >= minimumScore {
        scratch.rankedCandidates.append(
          RankedApproximateCandidate(index: candidateIndex, score: score))
      }
    }
    scratch.rankedCandidates.sort { left, right in
      if left.score != right.score { return left.score > right.score }
      return left.index < right.index
    }
    for ranked in scratch.rankedCandidates.prefix(limit) {
      let candidate = windows[ranked.index]
      scratch.hits.append(
        ApproximateExcerptWindowHit(
          offsetSeconds: candidate.startSeconds - query.startSeconds))
    }
    return scratch.candidateIndexes.count
  }

  private func cosineSimilarity(_ left: [Float], _ right: [Float]) -> Double {
    guard left.count == right.count, !left.isEmpty else { return 0 }
    var dot = Double(0)
    for index in left.indices { dot += Double(left[index]) * Double(right[index]) }
    return max(0, min(1, dot))
  }
}
