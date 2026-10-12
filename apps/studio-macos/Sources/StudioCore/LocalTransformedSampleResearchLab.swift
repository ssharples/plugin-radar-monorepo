import AVFoundation
import Foundation

public struct LocalTransformedSampleResearchLab: Sendable {
  public static let effectiveWindowSeconds = 5.0
  public static let effectiveHopSeconds = 2.5
  public static let hardMaximumCandidateCount = 16
  public static let hardMaximumFileBytes: Int64 = 64 * 1_024 * 1_024
  public static let hardMaximumDecodedFrames: Int64 = 4_000_000
  public static let hardMaximumWorkingMemoryBytes: Int64 = 96 * 1_024 * 1_024
  public static let hardMaximumSampleRate = 192_000.0
  public static let hardMaximumChannelCount = 8
  public static let hardMaximumWindowCount = 256
  public static let hardMaximumWindowPairCount = 65_536
  // These bounds include allocator slack plus retained and transient AVFoundation storage.
  private static let conservativeWindowBytes: Int64 = 4_096
  private static let conservativeComparisonScratchBytes: Int64 = 64 * 1_024
  private static let conservativeObservationScratchBytes: Int64 = 1 * 1_024 * 1_024
  private static let conservativeDecoderOverheadBytes: Int64 = 2 * 1_024 * 1_024
  private static let conservativeFeatureScratchBytes: Int64 = 512 * 1_024
  private static let conservativeDecodedAudioOverheadBytes: Int64 = 256 * 1_024
  private static let conservativeArrayCapacityOverheadBytes: Int64 = 64 * 1_024
  private static let decodeChunkFrameCount: Int64 = 16_384

  public let capability: TransformedSampleResearchCapability
  public let maximumCandidateCount: Int
  public let maximumFileBytes: Int64
  public let maximumDecodedFrames: Int64
  public let maximumWorkingMemoryBytes: Int64
  public let minimumScore: Double
  public let minimumRunnerUpMargin: Double

  private let postDecodeHook: @Sendable (URL) throws -> Void
  private let finalRevalidationHook: @Sendable () throws -> Void
  private let comparisonProgressHook: @Sendable (Int) throws -> Void

  static func conservativeMemoryEstimate(
    frameCount: Int64,
    sampleRate: Double,
    channelCount: Int
  ) -> TransformedSampleResearchMemoryEstimate? {
    guard frameCount > 0, frameCount <= hardMaximumDecodedFrames,
      sampleRate.isFinite, sampleRate > 0, sampleRate <= hardMaximumSampleRate,
      channelCount > 0, channelCount <= hardMaximumChannelCount
    else { return nil }
    let windowFrames = Int64((effectiveWindowSeconds * sampleRate).rounded())
    let hopFrames = Int64((effectiveHopSeconds * sampleRate).rounded())
    guard windowFrames > 0, hopFrames > 0, frameCount >= windowFrames else { return nil }
    let windowCount = ((frameCount - windowFrames) / hopFrames) + 1
    guard windowCount > 0, windowCount <= Int64(hardMaximumWindowCount),
      windowCount <= Int64(Int.max)
    else { return nil }
    let bufferFrames = min(frameCount, decodeChunkFrameCount)
    guard
      let monoBytes = checkedMultiply(frameCount, Int64(MemoryLayout<Float>.size)),
      let windowBytes = checkedMultiply(windowCount, conservativeWindowBytes),
      let residentWithWindows = checkedAdd(monoBytes, windowBytes),
      let residentWithModel = checkedAdd(
        residentWithWindows, conservativeDecodedAudioOverheadBytes),
      let residentBytes = checkedAdd(
        residentWithModel, conservativeArrayCapacityOverheadBytes),
      let channelFrames = checkedMultiply(bufferFrames, Int64(channelCount)),
      let decodeBufferBytes = checkedMultiply(
        channelFrames, Int64(MemoryLayout<Float>.size)),
      let decodeInfrastructure = checkedAdd(
        conservativeDecoderOverheadBytes, conservativeObservationScratchBytes),
      let decodeWithFeatures = checkedAdd(
        decodeInfrastructure, conservativeFeatureScratchBytes),
      let decodeWithBuffer = checkedAdd(decodeWithFeatures, decodeBufferBytes),
      let decodePeakBytes = checkedAdd(residentBytes, decodeWithBuffer)
    else { return nil }
    return TransformedSampleResearchMemoryEstimate(
      residentBytes: residentBytes,
      decodePeakBytes: decodePeakBytes,
      preflightScratchBytes: decodeInfrastructure,
      windowCount: Int(windowCount))
  }

  public init(
    capability: TransformedSampleResearchCapability = TransformedSampleResearchCapability(),
    maximumCandidateCount: Int = Self.hardMaximumCandidateCount,
    maximumFileBytes: Int64 = Self.hardMaximumFileBytes,
    maximumDecodedFrames: Int64 = Self.hardMaximumDecodedFrames,
    maximumWorkingMemoryBytes: Int64 = Self.hardMaximumWorkingMemoryBytes,
    minimumScore: Double = 0.62,
    minimumRunnerUpMargin: Double = 0.04
  ) {
    self.init(
      capability: capability,
      maximumCandidateCount: maximumCandidateCount,
      maximumFileBytes: maximumFileBytes,
      maximumDecodedFrames: maximumDecodedFrames,
      maximumWorkingMemoryBytes: maximumWorkingMemoryBytes,
      minimumScore: minimumScore,
      minimumRunnerUpMargin: minimumRunnerUpMargin,
      postDecodeHook: { _ in },
      finalRevalidationHook: {},
      comparisonProgressHook: { _ in })
  }

  init(
    capability: TransformedSampleResearchCapability,
    maximumCandidateCount: Int = Self.hardMaximumCandidateCount,
    maximumFileBytes: Int64 = Self.hardMaximumFileBytes,
    maximumDecodedFrames: Int64 = Self.hardMaximumDecodedFrames,
    maximumWorkingMemoryBytes: Int64 = Self.hardMaximumWorkingMemoryBytes,
    minimumScore: Double = 0.62,
    minimumRunnerUpMargin: Double = 0.04,
    postDecodeHook: @escaping @Sendable (URL) throws -> Void = { _ in },
    finalRevalidationHook: @escaping @Sendable () throws -> Void = {},
    comparisonProgressHook: @escaping @Sendable (Int) throws -> Void = { _ in }
  ) {
    self.capability = capability
    self.maximumCandidateCount = min(Self.hardMaximumCandidateCount, max(1, maximumCandidateCount))
    self.maximumFileBytes = min(Self.hardMaximumFileBytes, max(1, maximumFileBytes))
    self.maximumDecodedFrames = min(
      Self.hardMaximumDecodedFrames,
      max(1, maximumDecodedFrames))
    self.maximumWorkingMemoryBytes = min(
      Self.hardMaximumWorkingMemoryBytes,
      max(1, maximumWorkingMemoryBytes))
    self.minimumScore = min(1, max(0.5, minimumScore.isFinite ? minimumScore : 0.62))
    self.minimumRunnerUpMargin = min(
      1,
      max(0, minimumRunnerUpMargin.isFinite ? minimumRunnerUpMargin : 0.04))
    self.postDecodeHook = postDecodeHook
    self.finalRevalidationHook = finalRevalidationHook
    self.comparisonProgressHook = comparisonProgressHook
  }

  public func analyze(
    _ request: TransformedSampleResearchRequest
  ) async throws -> TransformedSampleResearchResult {
    guard capability.permitsLocalResearch else {
      return result(abstaining: .capabilityUnavailable)
    }
    guard valid(request) else { return result(abstaining: .invalidRequest) }
    guard request.candidates.count <= maximumCandidateCount else {
      return result(abstaining: .candidateLimitExceeded)
    }
    if Task.isCancelled { throw CancellationError() }

    let sourcePreflight: PreflightResearchAudio
    let source: DecodedResearchAudio
    do {
      sourcePreflight = try preflightAndObserve(request.sourceURL, retainedMemoryBytes: 0)
      guard sourcePreflight.memory.decodePeakBytes <= maximumWorkingMemoryBytes else {
        return result(abstaining: .resourceLimitExceeded)
      }
      source = try decodeAndObserve(sourcePreflight)
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as ResearchDecodeError {
      return result(abstaining: error.abstentionReason)
    } catch {
      return result(abstaining: .unreadableAudio)
    }

    var candidates: [CandidateAnalysis] = []
    var abstentions: [TransformedSampleResearchAbstention] = []
    var observedTargets: [ObservedCandidateFile] = []
    var decodedFrameCount = source.observation.frameCount
    var comparedCandidateCount = 0
    var comparedWindowPairCount = 0
    guard let initialBytesScanned = checkedMultiply(source.observation.bytes, 3) else {
      return result(abstaining: .resourceLimitExceeded)
    }
    var bytesScanned = initialBytesScanned
    var workingMemoryUpperBoundBytes = source.memory.decodePeakBytes
    for candidate in request.candidates.sorted(by: { $0.candidateID < $1.candidateID }) {
      if Task.isCancelled { throw CancellationError() }
      do {
        let targetPreflight = try preflightAndObserve(
          candidate.fileURL,
          retainedMemoryBytes: source.memory.residentBytes)
        observedTargets.append(
          ObservedCandidateFile(
            candidateID: candidate.candidateID,
            fileURL: candidate.fileURL,
            observation: targetPreflight.observation))
        guard
          let scannedBytes = checkedAdd(bytesScanned, targetPreflight.observation.bytes),
          let preflightPeak = checkedAdd(
            source.memory.residentBytes, targetPreflight.memory.preflightScratchBytes)
        else { return result(abstaining: .resourceLimitExceeded) }
        bytesScanned = scannedBytes
        workingMemoryUpperBoundBytes = max(workingMemoryUpperBoundBytes, preflightPeak)
        guard source.observation.contentSHA256 != targetPreflight.observation.contentSHA256 else {
          abstentions.append(
            TransformedSampleResearchAbstention(
              candidateID: candidate.candidateID,
              reason: .byteIdenticalNotTransformedUse))
          continue
        }
        let pairCount = source.memory.windowCount.multipliedReportingOverflow(
          by: targetPreflight.memory.windowCount)
        guard !pairCount.overflow, pairCount.partialValue <= Self.hardMaximumWindowPairCount
        else {
          return result(abstaining: .resourceLimitExceeded)
        }
        let sourceAndTargetResident = checkedAdd(
          source.memory.residentBytes, targetPreflight.memory.residentBytes)
        let targetDecodePeak = checkedAdd(
          source.memory.residentBytes, targetPreflight.memory.decodePeakBytes)
        guard
          let sourceAndTargetResident,
          let comparisonPeak = checkedAdd(
            sourceAndTargetResident, Self.conservativeComparisonScratchBytes),
          let targetDecodePeak,
          let comparedCandidates = checkedAdd(comparedCandidateCount, 1),
          let comparedPairs = checkedAdd(comparedWindowPairCount, pairCount.partialValue)
        else {
          return result(abstaining: .resourceLimitExceeded)
        }
        let pairPeak = max(comparisonPeak, targetDecodePeak)
        guard pairPeak <= maximumWorkingMemoryBytes else {
          return result(abstaining: .resourceLimitExceeded)
        }
        let target = try decodeAndObserve(targetPreflight)
        guard
          let decodedFrames = checkedAdd(decodedFrameCount, target.observation.frameCount),
          let decodeAndObservationBytes = checkedMultiply(target.observation.bytes, 2),
          let fullyScannedBytes = checkedAdd(bytesScanned, decodeAndObservationBytes)
        else { return result(abstaining: .resourceLimitExceeded) }
        decodedFrameCount = decodedFrames
        bytesScanned = fullyScannedBytes
        comparedCandidateCount = comparedCandidates
        comparedWindowPairCount = comparedPairs
        workingMemoryUpperBoundBytes = max(workingMemoryUpperBoundBytes, pairPeak)
        let comparison = try compare(
          source: source,
          target: target,
          candidateID: candidate.candidateID)
        switch comparison {
        case .candidate(let analysis):
          candidates.append(analysis)
        case .abstained(let reason):
          abstentions.append(
            TransformedSampleResearchAbstention(
              candidateID: candidate.candidateID,
              reason: reason))
        }
      } catch is CancellationError {
        throw CancellationError()
      } catch let error as ResearchDecodeError {
        abstentions.append(
          TransformedSampleResearchAbstention(
            candidateID: candidate.candidateID,
            reason: error.abstentionReason))
      } catch {
        abstentions.append(
          TransformedSampleResearchAbstention(
            candidateID: candidate.candidateID,
            reason: .unreadableAudio))
      }
    }

    do {
      try finalRevalidationHook()
      try revalidate(
        sourceURL: request.sourceURL,
        sourceObservation: source.observation,
        targets: observedTargets)
      guard
        let sourceRevalidationBytes = checkedAdd(bytesScanned, source.observation.bytes),
        let allRevalidationBytes = checkedSum(observedTargets.map { $0.observation.bytes }),
        let finalBytesScanned = checkedAdd(sourceRevalidationBytes, allRevalidationBytes)
      else { return result(abstaining: .resourceLimitExceeded) }
      bytesScanned = finalBytesScanned
    } catch is CancellationError {
      throw CancellationError()
    } catch let error as FinalObservationError {
      abstentions.append(
        TransformedSampleResearchAbstention(
          candidateID: error.candidateID,
          reason: .immutableObservationChanged))
    } catch {
      abstentions.append(
        TransformedSampleResearchAbstention(reason: .immutableObservationChanged))
    }

    let incompleteRankingReasons: Set<TransformedSampleResearchAbstentionReason> = [
      .resourceLimitExceeded,
      .unreadableAudio,
      .immutableObservationChanged,
    ]
    if abstentions.contains(where: { incompleteRankingReasons.contains($0.reason) }) {
      return TransformedSampleResearchResult(
        capability: capability,
        matches: [],
        abstentions: abstentions)
    }

    let ranked = candidates.sorted {
      if $0.score != $1.score { return $0.score > $1.score }
      return $0.candidateID < $1.candidateID
    }
    guard let best = ranked.first else {
      return TransformedSampleResearchResult(
        capability: capability,
        matches: [],
        abstentions: abstentions)
    }
    let runnerUp = ranked.dropFirst().first?.score ?? 0
    let margin = max(0, best.score - runnerUp)
    guard ranked.count == 1 || margin >= minimumRunnerUpMargin else {
      abstentions.append(
        TransformedSampleResearchAbstention(reason: .ambiguousMatch))
      return TransformedSampleResearchResult(
        capability: capability,
        matches: [],
        abstentions: abstentions)
    }

    let match = TransformedSampleResearchMatch(
      candidateID: best.candidateID,
      classification: best.classification,
      score: best.score,
      runnerUpMargin: margin,
      sourceRange: best.sourceRange,
      targetRange: best.targetRange,
      hypotheses: best.hypotheses,
      relationshipEvidence: best.relationshipEvidence,
      sourceObservation: source.observation,
      targetObservation: best.targetObservation,
      algorithmVersion: capability.algorithmVersion,
      resourceUsage: TransformedSampleResearchResourceUsage(
        decodedFrameCount: decodedFrameCount,
        comparedCandidateCount: comparedCandidateCount,
        comparedWindowPairCount: comparedWindowPairCount,
        bytesScanned: bytesScanned,
        workingMemoryUpperBoundBytes: workingMemoryUpperBoundBytes))
    return TransformedSampleResearchResult(
      capability: capability,
      matches: [match],
      abstentions: abstentions)
  }

  private func valid(_ request: TransformedSampleResearchRequest) -> Bool {
    !request.sourceID.isEmpty
      && !request.candidates.isEmpty
      && request.candidates.allSatisfy { !$0.candidateID.isEmpty }
      && Set(request.candidates.map(\.candidateID)).count == request.candidates.count
      && request.candidates.allSatisfy { $0.fileURL != request.sourceURL }
      && Set(request.candidates.map { $0.fileURL.standardizedFileURL.path }).count
        == request.candidates.count
  }

  private func result(
    abstaining reason: TransformedSampleResearchAbstentionReason
  ) -> TransformedSampleResearchResult {
    TransformedSampleResearchResult(
      capability: capability,
      matches: [],
      abstentions: [TransformedSampleResearchAbstention(reason: reason)])
  }

  private func preflightAndObserve(
    _ url: URL,
    retainedMemoryBytes: Int64
  ) throws -> PreflightResearchAudio {
    if Task.isCancelled { throw CancellationError() }
    guard
      let preflightScratch = checkedAdd(
        Self.conservativeDecoderOverheadBytes,
        Self.conservativeObservationScratchBytes),
      let preflightPeak = checkedAdd(retainedMemoryBytes, preflightScratch),
      preflightPeak <= maximumWorkingMemoryBytes
    else { throw ResearchDecodeError.resource }
    let sourceObservation: AudioMatchSourceObservation
    do {
      sourceObservation = try AudioMatchSourceObservation.captureBounded(
        fileURL: url,
        maximumBytes: maximumFileBytes,
        progress: { _, _ in
          if Task.isCancelled { throw CancellationError() }
        })
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw ResearchDecodeError.resourceOrMutation(error)
    }

    let file: AVAudioFile
    do {
      file = try AVAudioFile(forReading: url)
    } catch {
      throw ResearchDecodeError.unreadable
    }
    let format = file.processingFormat
    let frameCount = Int64(file.length)
    guard frameCount <= maximumDecodedFrames,
      let memory = Self.conservativeMemoryEstimate(
        frameCount: frameCount,
        sampleRate: format.sampleRate,
        channelCount: Int(format.channelCount))
    else { throw ResearchDecodeError.resource }
    let duration = Double(file.length) / format.sampleRate
    guard duration.isFinite, duration >= Self.effectiveWindowSeconds else {
      throw ResearchDecodeError.insufficientDuration
    }
    let observation = TransformedSampleImmutableFileObservation(
      contentSHA256: sourceObservation.contentSHA256,
      bytes: sourceObservation.bytes,
      modifiedAtNanoseconds: sourceObservation.modifiedAtNanoseconds,
      resourceIdentity: sourceObservation.resourceIdentity,
      sampleRate: format.sampleRate,
      channelCount: Int(format.channelCount),
      frameCount: frameCount)
    guard observation.isWellFormed else { throw ResearchDecodeError.unreadable }
    return PreflightResearchAudio(
      fileURL: url,
      sourceObservation: sourceObservation,
      observation: observation,
      memory: memory)
  }

  private func decodeAndObserve(_ preflight: PreflightResearchAudio) throws
    -> DecodedResearchAudio
  {
    if Task.isCancelled { throw CancellationError() }
    let file: AVAudioFile
    do {
      file = try AVAudioFile(
        forReading: preflight.fileURL,
        commonFormat: .pcmFormatFloat32,
        interleaved: false)
    } catch {
      throw ResearchDecodeError.unreadable
    }
    let format = file.processingFormat
    guard format.sampleRate == preflight.observation.sampleRate,
      Int(format.channelCount) == preflight.observation.channelCount,
      Int64(file.length) == preflight.observation.frameCount,
      preflight.memory.decodePeakBytes <= maximumWorkingMemoryBytes,
      preflight.observation.frameCount <= Int64(Int.max)
    else { throw ResearchDecodeError.mutated }

    let frameCount = preflight.observation.frameCount
    var samples = [Float](repeating: 0, count: Int(frameCount))
    let chunkFrames = AVAudioFrameCount(min(Self.decodeChunkFrameCount, frameCount))
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: chunkFrames) else {
      throw ResearchDecodeError.resource
    }
    var sampleOffset = 0
    while file.framePosition < file.length {
      if Task.isCancelled { throw CancellationError() }
      let remaining = file.length - file.framePosition
      let count = AVAudioFrameCount(min(Int64(chunkFrames), remaining))
      do {
        try file.read(into: buffer, frameCount: count)
      } catch {
        throw ResearchDecodeError.unreadable
      }
      guard let channels = buffer.floatChannelData, buffer.frameLength > 0 else {
        throw ResearchDecodeError.unreadable
      }
      for frame in 0..<Int(buffer.frameLength) {
        var mono: Float = 0
        for channel in 0..<Int(format.channelCount) {
          mono += channels[channel][frame]
        }
        samples[sampleOffset + frame] = mono / Float(format.channelCount)
      }
      sampleOffset += Int(buffer.frameLength)
    }
    guard sampleOffset == Int(frameCount) else { throw ResearchDecodeError.unreadable }
    try postDecodeHook(preflight.fileURL)
    if Task.isCancelled { throw CancellationError() }

    let finalObservation: AudioMatchSourceObservation
    do {
      finalObservation = try AudioMatchSourceObservation.captureBounded(
        fileURL: preflight.fileURL,
        maximumBytes: maximumFileBytes,
        progress: { _, _ in
          if Task.isCancelled { throw CancellationError() }
        })
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw ResearchDecodeError.mutated
    }
    guard preflight.sourceObservation == finalObservation else {
      throw ResearchDecodeError.mutated
    }
    let windows = try makeWindows(samples: samples, sampleRate: format.sampleRate)
    guard windows.count == preflight.memory.windowCount else {
      throw ResearchDecodeError.resource
    }
    return DecodedResearchAudio(
      samples: samples,
      sampleRate: format.sampleRate,
      windows: windows,
      observation: preflight.observation,
      memory: preflight.memory)
  }

  private func makeWindows(samples: [Float], sampleRate: Double) throws -> [ResearchWindow] {
    let windowFrames = max(1, Int((Self.effectiveWindowSeconds * sampleRate).rounded()))
    let hopFrames = max(1, Int((Self.effectiveHopSeconds * sampleRate).rounded()))
    guard samples.count >= windowFrames else { return [] }
    var windows: [ResearchWindow] = []
    var start = 0
    while start + windowFrames <= samples.count {
      if Task.isCancelled { throw CancellationError() }
      guard windows.count < Self.hardMaximumWindowCount else {
        throw ResearchDecodeError.resource
      }
      windows.append(
        ResearchWindow(
          startFrame: start,
          feature: try feature(
            samples[start..<(start + windowFrames)],
            sampleRate: sampleRate)))
      start += hopFrames
    }
    return windows
  }

  private func feature(
    _ samples: ArraySlice<Float>,
    sampleRate: Double
  ) throws -> ResearchWindowFeature {
    let binCount = 20
    let binSize = max(1, samples.count / binCount)
    var energy: [Double] = []
    var derivative: [Double] = []
    var crossings: [Double] = []
    var totalSquares = 0.0
    var peak = 0.0
    var silent = 0
    var uniqueLevels = Set<Int>()
    var previous = Double(samples.first ?? 0)
    var lowState = previous
    var lowSquares = 0.0
    var highSquares = 0.0
    let lowAlpha = min(1, 2 * Double.pi * 350 / sampleRate)
    for (index, sample) in samples.enumerated() {
      if index.isMultiple(of: 16_384), Task.isCancelled { throw CancellationError() }
      let value = Double(sample)
      totalSquares += value * value
      peak = max(peak, abs(value))
      if abs(value) < 0.0005 { silent += 1 }
      if index % max(1, samples.count / 4_096) == 0 {
        uniqueLevels.insert(Int((value * 32_768).rounded()))
      }
      lowState += lowAlpha * (value - lowState)
      lowSquares += lowState * lowState
      let high = value - lowState
      highSquares += high * high
      previous = value
    }
    for bin in 0..<binCount {
      if Task.isCancelled { throw CancellationError() }
      let lower = bin * binSize
      let upper = bin == binCount - 1 ? samples.count : min(samples.count, lower + binSize)
      guard lower < upper else {
        energy.append(0)
        derivative.append(0)
        crossings.append(0)
        continue
      }
      var sumSquares = 0.0
      var differenceSquares = 0.0
      var crossingCount = 0
      var prior = Double(samples[samples.startIndex + lower])
      for index in lower..<upper {
        let value = Double(samples[samples.startIndex + index])
        sumSquares += value * value
        let difference = value - prior
        differenceSquares += difference * difference
        if (value >= 0) != (prior >= 0) { crossingCount += 1 }
        prior = value
      }
      let count = Double(upper - lower)
      energy.append(sqrt(sumSquares / count))
      derivative.append(sqrt(differenceSquares / count))
      crossings.append(Double(crossingCount) / count)
    }
    let rms = sqrt(totalSquares / Double(max(1, samples.count)))
    let onset = energy.firstIndex(where: { $0 > max(0.002, rms * 0.12) }) ?? binCount
    let tailStart = max(0, energy.count - 4)
    let tailEnergy = energy[tailStart...].reduce(0, +) / Double(max(1, energy.count - tailStart))
    let echoCorrelation =
      [0.11, 0.29, 0.53]
      .map { lagCorrelation(samples, lagFrames: Int($0 * sampleRate)) }
      .max() ?? 0
    return ResearchWindowFeature(
      energy: normalized(energy),
      derivative: normalized(derivative),
      crossings: normalized(crossings),
      rawCrossings: crossings,
      rms: rms,
      peak: peak,
      silenceFraction: Double(silent) / Double(max(1, samples.count)),
      lowEnergy: lowSquares / Double(max(1, samples.count)),
      highEnergy: highSquares / Double(max(1, samples.count)),
      quantizedLevelCount: uniqueLevels.count,
      onsetSeconds: Double(onset) * Self.effectiveWindowSeconds / Double(binCount),
      tailEnergy: tailEnergy,
      echoCorrelation: echoCorrelation,
      dominantFrequency: try dominantFrequency(samples, sampleRate: sampleRate))
  }

  private func dominantFrequency(
    _ samples: ArraySlice<Float>,
    sampleRate: Double
  ) throws -> Double {
    let targetRate = 4_000.0
    let stride = max(1, Int((sampleRate / targetRate).rounded()))
    let maximum = min(samples.count, Int(sampleRate * 1.0))
    let reducedCount = (maximum + stride - 1) / stride
    let effectiveRate = sampleRate / Double(stride)
    guard reducedCount > 100 else { return 0 }
    let minimumLag = max(2, Int(effectiveRate / 1_500))
    let maximumLag = min(reducedCount / 3, Int(effectiveRate / 55))
    guard minimumLag < maximumLag else { return 0 }
    var bestLag = minimumLag
    var bestCorrelation = -Double.infinity
    for lag in minimumLag...maximumLag {
      if lag.isMultiple(of: 16), Task.isCancelled { throw CancellationError() }
      var correlation = 0.0
      for index in lag..<reducedCount {
        let left = Double(samples[samples.startIndex + index * stride])
        let right = Double(samples[samples.startIndex + (index - lag) * stride])
        correlation += left * right
      }
      if correlation > bestCorrelation {
        bestCorrelation = correlation
        bestLag = lag
      }
    }
    return effectiveRate / Double(bestLag)
  }

  private func compare(
    source: DecodedResearchAudio,
    target: DecodedResearchAudio,
    candidateID: String
  ) throws -> CandidateComparisonOutcome {
    var best: WindowComparison?
    var completedComparisonCount = 0
    for sourceWindow in source.windows {
      if Task.isCancelled { throw CancellationError() }
      for targetWindow in target.windows {
        if Task.isCancelled { throw CancellationError() }
        try comparisonProgressHook(completedComparisonCount)
        if Task.isCancelled { throw CancellationError() }
        let forward = similarity(sourceWindow.feature, targetWindow.feature)
        let reversed = reverseSimilarity(sourceWindow.feature, targetWindow.feature)
        let unordered = try unorderedSimilarity(
          sourceWindow.feature,
          targetWindow.feature)
        let unorderedCandidate = unordered >= 0.85 ? unordered * 0.94 : 0
        let score = max(forward, reversed * 0.98, unorderedCandidate)
        let comparison = WindowComparison(
          sourceWindow: sourceWindow,
          targetWindow: targetWindow,
          forwardScore: forward,
          reverseScore: reversed,
          unorderedScore: unordered,
          score: score)
        if best.map({ comparisonOrder(comparison, $0) }) ?? true {
          best = comparison
        }
        completedComparisonCount += 1
      }
    }
    guard let best, best.score >= minimumScore else {
      return .abstained(.noSpecificMatch)
    }
    let hypotheses = inferHypotheses(
      source: source,
      target: target,
      comparison: best)
    guard !hypotheses.isEmpty else { return .abstained(.noSpecificMatch) }

    let durationRatio = target.observation.durationSeconds / source.observation.durationSeconds
    let dominantFrequencyRatio =
      best.targetWindow.feature.dominantFrequency
      / max(best.sourceWindow.feature.dominantFrequency, 1e-9)
    let relationshipEvidence = TransformedSampleRelationshipEvidence(
      waveformCorrelation: waveformCorrelation(
        source: source,
        target: target,
        sourceStartFrame: best.sourceWindow.startFrame,
        targetStartFrame: best.targetWindow.startFrame),
      forwardFeatureSimilarity: best.forwardScore,
      reverseFeatureSimilarity: best.reverseScore,
      unorderedFeatureSimilarity: best.unorderedScore,
      durationRatio: durationRatio,
      dominantFrequencyRatio: dominantFrequencyRatio)
    let classification: TransformedSampleRelationshipClassification
    switch relationshipEvidence.conservativeClassificationDisposition {
    case .classified(let classified):
      classification = classified
    case .abstained(let reason):
      return .abstained(reason.researchAbstentionReason)
    }
    let sourceStart = Double(best.sourceWindow.startFrame) / source.sampleRate
    let targetStart = Double(best.targetWindow.startFrame) / target.sampleRate
    return .candidate(
      CandidateAnalysis(
        candidateID: candidateID,
        classification: classification,
        score: best.score,
        sourceRange: TransformedSampleTimeRange(
          startSeconds: sourceStart,
          durationSeconds: Self.effectiveWindowSeconds),
        targetRange: TransformedSampleTimeRange(
          startSeconds: targetStart,
          durationSeconds: Self.effectiveWindowSeconds),
        hypotheses: hypotheses,
        relationshipEvidence: relationshipEvidence,
        targetObservation: target.observation))
  }

  private func waveformCorrelation(
    source: DecodedResearchAudio,
    target: DecodedResearchAudio,
    sourceStartFrame: Int,
    targetStartFrame: Int
  ) -> Double {
    let sampleCount = 4_096
    var sourceMean = 0.0
    var targetMean = 0.0
    for index in 0..<sampleCount {
      let time = Self.effectiveWindowSeconds * Double(index) / Double(sampleCount)
      sourceMean += Double(
        source.samples[sourceStartFrame + Int((time * source.sampleRate).rounded(.down))])
      targetMean += Double(
        target.samples[targetStartFrame + Int((time * target.sampleRate).rounded(.down))])
    }
    sourceMean /= Double(sampleCount)
    targetMean /= Double(sampleCount)
    var dot = 0.0
    var sourceSquares = 0.0
    var targetSquares = 0.0
    for index in 0..<sampleCount {
      let time = Self.effectiveWindowSeconds * Double(index) / Double(sampleCount)
      let sourceValue =
        Double(
          source.samples[sourceStartFrame + Int((time * source.sampleRate).rounded(.down))])
        - sourceMean
      let targetValue =
        Double(
          target.samples[targetStartFrame + Int((time * target.sampleRate).rounded(.down))])
        - targetMean
      dot += sourceValue * targetValue
      sourceSquares += sourceValue * sourceValue
      targetSquares += targetValue * targetValue
    }
    let denominator = sqrt(sourceSquares * targetSquares)
    return denominator > 1e-12 ? bounded(abs(dot / denominator)) : 0
  }

  private func comparisonOrder(_ left: WindowComparison, _ right: WindowComparison) -> Bool {
    if left.score != right.score { return left.score > right.score }
    if left.sourceWindow.startFrame != right.sourceWindow.startFrame {
      return left.sourceWindow.startFrame < right.sourceWindow.startFrame
    }
    return left.targetWindow.startFrame < right.targetWindow.startFrame
  }

  private func similarity(
    _ source: ResearchWindowFeature,
    _ target: ResearchWindowFeature
  ) -> Double {
    let envelope = cosine(source.energy, target.energy)
    let derivative = cosine(source.derivative, target.derivative)
    let crossing = cosine(source.crossings, target.crossings)
    let pitchContour = max(0, correlation(source.rawCrossings, target.rawCrossings))
    let band = ratioSimilarity(
      source.lowEnergy / max(source.highEnergy, 1e-12),
      target.lowEnergy / max(target.highEnergy, 1e-12))
    return bounded(
      0.25 * envelope + 0.1 * derivative + 0.1 * crossing + 0.1 * band
        + 0.45 * pitchContour)
  }

  private func reverseSimilarity(
    _ source: ResearchWindowFeature,
    _ target: ResearchWindowFeature
  ) -> Double {
    let envelope = cosine(source.energy, Array(target.energy.reversed()))
    let derivative = cosine(source.derivative, Array(target.derivative.reversed()))
    let crossing = cosine(source.crossings, Array(target.crossings.reversed()))
    let pitchContour = max(
      0,
      correlation(source.rawCrossings, Array(target.rawCrossings.reversed())))
    return bounded(
      0.25 * envelope + 0.1 * derivative + 0.1 * crossing + 0.55 * pitchContour)
  }

  private func inferHypotheses(
    source: DecodedResearchAudio,
    target: DecodedResearchAudio,
    comparison: WindowComparison
  ) -> [TransformedSampleTransformHypothesis] {
    let lhs = comparison.sourceWindow.feature
    let rhs = comparison.targetWindow.feature
    var values: [TransformedSampleTransformHypothesis] = []
    let localFrequencyRatios = zip(lhs.rawCrossings, rhs.rawCrossings).compactMap {
      sourceCrossings, targetCrossings -> Double? in
      guard sourceCrossings > 0.002, targetCrossings > 0.002 else { return nil }
      return targetCrossings / sourceCrossings
    }.sorted()
    let frequencyRatio =
      median(localFrequencyRatios)
      ?? rhs.dominantFrequency / max(lhs.dominantFrequency, 1e-9)
    let semitones = 12 * log2(max(frequencyRatio, 1e-9))
    if abs(semitones) >= 0.45, abs(semitones) <= 24 {
      values.append(hypothesis(.pitch, .semitones, semitones, .semitones, comparison.score))
    } else if abs(semitones) >= 0.015 {
      values.append(
        hypothesis(.microtonal, .cents, semitones * 100, .cents, comparison.score))
    }

    let durationRatio = target.observation.durationSeconds / source.observation.durationSeconds
    if abs(durationRatio - 1) >= 0.018, (0.45...2.2).contains(durationRatio) {
      values.append(
        hypothesis(.timeStretch, .timeFactor, durationRatio, .factor, comparison.score))
      let durationDelta = abs(
        target.observation.durationSeconds - source.observation.durationSeconds)
      if durationRatio > 1.12 {
        values.append(
          hypothesis(
            .duplication, .durationSeconds, durationDelta, .seconds, comparison.score * 0.8))
      } else if durationRatio < 0.88 {
        values.append(
          hypothesis(.removal, .durationSeconds, durationDelta, .seconds, comparison.score * 0.8))
      }
    }

    let gainDB = 20 * log10(max(rhs.rms, 1e-9) / max(lhs.rms, 1e-9))
    if abs(gainDB) >= 0.45 {
      values.append(hypothesis(.gain, .gainDB, gainDB, .decibels, comparison.score))
    }
    let sourceBandRatio = lhs.highEnergy / max(lhs.lowEnergy, 1e-12)
    let targetBandRatio = rhs.highEnergy / max(rhs.lowEnergy, 1e-12)
    let bandDeltaDB = 10 * log10(max(targetBandRatio, 1e-12) / max(sourceBandRatio, 1e-12))
    if abs(bandDeltaDB) >= 0.7 {
      values.append(
        TransformedSampleTransformHypothesis(
          family: .equalization,
          parameters: [
            range(.lowGainDB, -bandDeltaDB / 2, .decibels),
            range(.midGainDB, 0, .decibels),
            range(.highGainDB, bandDeltaDB / 2, .decibels),
          ],
          confidence: bounded(comparison.score * 0.9)))
    }
    if bandDeltaDB < -0.8 {
      values.append(
        TransformedSampleTransformHypothesis(
          family: .filtering,
          parameters: [
            range(.cutoffHz, 3_500, .hertz, tolerance: 1_500),
            range(.resonance, 0.2, .ratio, tolerance: 0.2),
          ],
          confidence: bounded(comparison.score * 0.85)))
    }

    let sourceCrest = lhs.peak / max(lhs.rms, 1e-9)
    let targetCrest = rhs.peak / max(rhs.rms, 1e-9)
    if targetCrest < sourceCrest * 0.9 {
      values.append(
        TransformedSampleTransformHypothesis(
          family: .compression,
          parameters: [
            range(.thresholdDB, -18, .decibels, tolerance: 8),
            range(.ratio, sourceCrest / max(targetCrest, 1e-9), .ratio, tolerance: 0.5),
          ],
          confidence: bounded(comparison.score * 0.8)))
    }
    if rhs.quantizedLevelCount < max(24, lhs.quantizedLevelCount / 2) {
      let bits = max(2, log2(Double(max(2, rhs.quantizedLevelCount))))
      values.append(hypothesis(.bitcrush, .bitDepth, bits, .bits, comparison.score * 0.85))
    }
    if rhs.onsetSeconds > lhs.onsetSeconds + 0.08 {
      values.append(
        TransformedSampleTransformHypothesis(
          family: .delay,
          parameters: [
            range(
              .delayMilliseconds,
              (rhs.onsetSeconds - lhs.onsetSeconds) * 1_000,
              .milliseconds,
              tolerance: 80),
            range(.feedback, 0.25, .ratio, tolerance: 0.2),
          ],
          confidence: bounded(comparison.score * 0.8)))
    }
    let sourceTailRatio = lhs.tailEnergy / max(lhs.rms, 1e-9)
    let targetTailRatio = rhs.tailEnergy / max(rhs.rms, 1e-9)
    if targetTailRatio > sourceTailRatio * 1.08
      || rhs.echoCorrelation > lhs.echoCorrelation + 0.025
    {
      values.append(
        TransformedSampleTransformHypothesis(
          family: .reverb,
          parameters: [
            range(.wetMix, 0.3, .ratio, tolerance: 0.2),
            range(.decaySeconds, 1.2, .seconds, tolerance: 0.8),
          ],
          confidence: bounded(comparison.score * 0.78)))
    }
    if rhs.silenceFraction > lhs.silenceFraction + 0.025 {
      let duration = (rhs.silenceFraction - lhs.silenceFraction) * Self.effectiveWindowSeconds
      values.append(hypothesis(.silence, .durationSeconds, duration, .seconds, comparison.score))
    }
    if comparison.reverseScore > comparison.forwardScore + 0.04 {
      values.append(hypothesis(.reversal, .reversedFraction, 1, .fraction, comparison.reverseScore))
    }
    if comparison.unorderedScore > comparison.forwardScore + 0.035 {
      values.append(
        TransformedSampleTransformHypothesis(
          family: .chopping,
          parameters: [
            range(.segmentSeconds, 0.75, .seconds, tolerance: 0.5),
            range(.reorderedFraction, 0.6, .fraction, tolerance: 0.3),
          ],
          confidence: bounded(comparison.unorderedScore)))
    }

    let sourceCrestRatio = lhs.peak / max(lhs.rms, 1e-9)
    let targetCrestRatio = rhs.peak / max(rhs.rms, 1e-9)
    let nonlinearDelta = abs(rhs.peak - lhs.peak) + abs(rhs.highEnergy - lhs.highEnergy)
    if nonlinearDelta > 0.015
      || abs(targetCrestRatio / max(sourceCrestRatio, 1e-9) - 1) > 0.12
    {
      values.append(hypothesis(.distortion, .drive, 2.5, .factor, comparison.score * 0.75))
    }
    if values.isEmpty, comparison.score >= max(minimumScore, 0.72) {
      values.append(
        TransformedSampleTransformHypothesis(
          family: .delay,
          parameters: [
            range(.delayMilliseconds, 120, .milliseconds, tolerance: 120),
            range(.feedback, 0.2, .ratio, tolerance: 0.2),
          ],
          confidence: bounded(comparison.score * 0.55)))
    }
    return Dictionary(grouping: values, by: \.family)
      .compactMap { _, hypotheses in hypotheses.max(by: { $0.confidence < $1.confidence }) }
      .sorted { $0.family.rawValue < $1.family.rawValue }
  }

  private func hypothesis(
    _ family: TransformedSampleTransformFamily,
    _ name: TransformedSampleParameterName,
    _ value: Double,
    _ unit: TransformedSampleParameterUnit,
    _ confidence: Double
  ) -> TransformedSampleTransformHypothesis {
    TransformedSampleTransformHypothesis(
      family: family,
      parameters: [range(name, value, unit)],
      confidence: bounded(confidence))
  }

  private func range(
    _ name: TransformedSampleParameterName,
    _ value: Double,
    _ unit: TransformedSampleParameterUnit,
    tolerance: Double? = nil
  ) -> TransformedSampleParameterRange {
    let delta = tolerance ?? max(abs(value) * 0.08, 0.01)
    let rawLower = value - delta
    let rawUpper = value + delta
    let lower: Double
    let upper: Double
    switch name {
    case .reversedFraction, .reorderedFraction, .feedback, .wetMix, .resonance:
      lower = max(0, rawLower)
      upper = min(1, rawUpper)
    case .timeFactor, .ratio, .cutoffHz, .bitDepth, .delayMilliseconds, .drive,
      .decaySeconds, .durationSeconds, .occurrenceCount, .segmentSeconds:
      lower = max(0, rawLower)
      upper = max(0, rawUpper)
    case .semitones, .cents, .lowGainDB, .midGainDB, .highGainDB, .thresholdDB,
      .gainDB:
      lower = rawLower
      upper = rawUpper
    }
    return TransformedSampleParameterRange(
      name: name,
      lowerBound: lower,
      upperBound: upper,
      unit: unit)
  }

  private func normalized(_ values: [Double]) -> [Double] {
    let norm = sqrt(values.reduce(0) { $0 + $1 * $1 })
    guard norm > 1e-12 else { return values }
    return values.map { $0 / norm }
  }

  private func cosine(_ lhs: [Double], _ rhs: [Double]) -> Double {
    guard lhs.count == rhs.count, !lhs.isEmpty else { return 0 }
    let dot = zip(lhs, rhs).reduce(0) { $0 + $1.0 * $1.1 }
    let leftNorm = sqrt(lhs.reduce(0) { $0 + $1 * $1 })
    let rightNorm = sqrt(rhs.reduce(0) { $0 + $1 * $1 })
    guard leftNorm > 1e-12, rightNorm > 1e-12 else { return 0 }
    return bounded(dot / (leftNorm * rightNorm))
  }

  private func correlation(_ lhs: [Double], _ rhs: [Double]) -> Double {
    guard lhs.count == rhs.count, lhs.count > 1 else { return 0 }
    let leftMean = lhs.reduce(0, +) / Double(lhs.count)
    let rightMean = rhs.reduce(0, +) / Double(rhs.count)
    let left = lhs.map { $0 - leftMean }
    let right = rhs.map { $0 - rightMean }
    let denominator =
      sqrt(left.reduce(0) { $0 + $1 * $1 })
      * sqrt(right.reduce(0) { $0 + $1 * $1 })
    guard denominator > 1e-12 else { return 0 }
    return zip(left, right).reduce(0) { $0 + $1.0 * $1.1 } / denominator
  }

  private func unorderedSimilarity(
    _ source: ResearchWindowFeature,
    _ target: ResearchWindowFeature
  ) throws -> Double {
    guard source.energy.count == target.energy.count else { return 0 }
    var pairs: [(distance: Double, source: Int, target: Int)] = []
    for sourceIndex in source.energy.indices {
      if Task.isCancelled { throw CancellationError() }
      for targetIndex in target.energy.indices {
        if Task.isCancelled { throw CancellationError() }
        let energy = source.energy[sourceIndex] - target.energy[targetIndex]
        let derivative = source.derivative[sourceIndex] - target.derivative[targetIndex]
        let crossing = source.crossings[sourceIndex] - target.crossings[targetIndex]
        pairs.append(
          (
            energy * energy + derivative * derivative + crossing * crossing,
            sourceIndex,
            targetIndex
          ))
      }
    }
    pairs.sort {
      ($0.distance, $0.source, $0.target) < ($1.distance, $1.source, $1.target)
    }
    var usedSource = Set<Int>()
    var usedTarget = Set<Int>()
    var similarities: [Double] = []
    for pair in pairs where !usedSource.contains(pair.source) && !usedTarget.contains(pair.target) {
      if Task.isCancelled { throw CancellationError() }
      usedSource.insert(pair.source)
      usedTarget.insert(pair.target)
      similarities.append(exp(-24 * pair.distance))
    }
    return average(similarities) ?? 0
  }

  private func lagCorrelation(_ values: ArraySlice<Float>, lagFrames: Int) -> Double {
    guard lagFrames > 0, lagFrames < values.count else { return 0 }
    var dot = 0.0
    var leftSquares = 0.0
    var rightSquares = 0.0
    for index in lagFrames..<values.count {
      let left = Double(values[values.startIndex + index])
      let right = Double(values[values.startIndex + index - lagFrames])
      dot += left * right
      leftSquares += left * left
      rightSquares += right * right
    }
    let denominator = sqrt(leftSquares * rightSquares)
    return denominator > 1e-12 ? dot / denominator : 0
  }

  private func median(_ values: [Double]) -> Double? {
    guard !values.isEmpty else { return nil }
    let middle = values.count / 2
    return values.count.isMultiple(of: 2)
      ? (values[middle - 1] + values[middle]) / 2
      : values[middle]
  }

  private func average(_ values: [Double]) -> Double? {
    values.isEmpty ? nil : values.reduce(0, +) / Double(values.count)
  }

  private func ratioSimilarity(_ lhs: Double, _ rhs: Double) -> Double {
    guard lhs.isFinite, rhs.isFinite, lhs > 0, rhs > 0 else { return 0 }
    return exp(-abs(log(lhs / rhs)))
  }

  private func bounded(_ value: Double) -> Double {
    min(1, max(0, value.isFinite ? value : 0))
  }

  private func revalidate(
    sourceURL: URL,
    sourceObservation: TransformedSampleImmutableFileObservation,
    targets: [ObservedCandidateFile]
  ) throws {
    do {
      guard try observationStillMatches(sourceURL, sourceObservation) else {
        throw FinalObservationError(candidateID: nil)
      }
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw FinalObservationError(candidateID: nil)
    }
    for target in targets {
      if Task.isCancelled { throw CancellationError() }
      do {
        guard try observationStillMatches(target.fileURL, target.observation) else {
          throw FinalObservationError(candidateID: target.candidateID)
        }
      } catch is CancellationError {
        throw CancellationError()
      } catch {
        throw FinalObservationError(candidateID: target.candidateID)
      }
    }
  }

  private func observationStillMatches(
    _ url: URL,
    _ expected: TransformedSampleImmutableFileObservation
  ) throws -> Bool {
    let current = try AudioMatchSourceObservation.captureBounded(
      fileURL: url,
      maximumBytes: maximumFileBytes,
      progress: { _, _ in
        if Task.isCancelled { throw CancellationError() }
      })
    return current.contentSHA256 == expected.contentSHA256
      && current.bytes == expected.bytes
      && current.modifiedAtNanoseconds == expected.modifiedAtNanoseconds
      && current.resourceIdentity == expected.resourceIdentity
  }
}

private func checkedAdd<T: FixedWidthInteger>(_ lhs: T, _ rhs: T) -> T? {
  let result = lhs.addingReportingOverflow(rhs)
  return result.overflow ? nil : result.partialValue
}

private func checkedMultiply<T: FixedWidthInteger>(_ lhs: T, _ rhs: T) -> T? {
  let result = lhs.multipliedReportingOverflow(by: rhs)
  return result.overflow ? nil : result.partialValue
}

private func checkedSum<T: FixedWidthInteger>(_ values: [T]) -> T? {
  var total = T.zero
  for value in values {
    guard let sum = checkedAdd(total, value) else { return nil }
    total = sum
  }
  return total
}

private enum ResearchDecodeError: Error {
  case unreadable
  case insufficientDuration
  case resource
  case mutated

  static func resourceOrMutation(_ error: Error) -> ResearchDecodeError {
    if case AudioMatchFileObservationError.changedDuringObservation = error {
      return .mutated
    }
    return .resource
  }

  var abstentionReason: TransformedSampleResearchAbstentionReason {
    switch self {
    case .unreadable: .unreadableAudio
    case .insufficientDuration: .insufficientDuration
    case .resource: .resourceLimitExceeded
    case .mutated: .immutableObservationChanged
    }
  }
}

private struct DecodedResearchAudio {
  let samples: [Float]
  let sampleRate: Double
  let windows: [ResearchWindow]
  let observation: TransformedSampleImmutableFileObservation
  let memory: TransformedSampleResearchMemoryEstimate
}

private struct PreflightResearchAudio {
  let fileURL: URL
  let sourceObservation: AudioMatchSourceObservation
  let observation: TransformedSampleImmutableFileObservation
  let memory: TransformedSampleResearchMemoryEstimate
}

private struct ResearchWindow {
  let startFrame: Int
  let feature: ResearchWindowFeature
}

private struct ResearchWindowFeature {
  let energy: [Double]
  let derivative: [Double]
  let crossings: [Double]
  let rawCrossings: [Double]
  let rms: Double
  let peak: Double
  let silenceFraction: Double
  let lowEnergy: Double
  let highEnergy: Double
  let quantizedLevelCount: Int
  let onsetSeconds: Double
  let tailEnergy: Double
  let echoCorrelation: Double
  let dominantFrequency: Double
}

private struct WindowComparison {
  let sourceWindow: ResearchWindow
  let targetWindow: ResearchWindow
  let forwardScore: Double
  let reverseScore: Double
  let unorderedScore: Double
  let score: Double
}

private struct CandidateAnalysis {
  let candidateID: String
  let classification: TransformedSampleRelationshipClassification
  let score: Double
  let sourceRange: TransformedSampleTimeRange
  let targetRange: TransformedSampleTimeRange
  let hypotheses: [TransformedSampleTransformHypothesis]
  let relationshipEvidence: TransformedSampleRelationshipEvidence
  let targetObservation: TransformedSampleImmutableFileObservation
}

private enum CandidateComparisonOutcome {
  case candidate(CandidateAnalysis)
  case abstained(TransformedSampleResearchAbstentionReason)
}

extension TransformedSampleRelationshipAbstentionReason {
  fileprivate var researchAbstentionReason: TransformedSampleResearchAbstentionReason {
    switch self {
    case .lowEvidence: .relationshipLowEvidence
    case .conflictingEvidence: .relationshipConflictingEvidence
    case .malformedEvidence: .relationshipMalformedEvidence
    case .indeterminate: .relationshipIndeterminate
    }
  }
}

private struct ObservedCandidateFile {
  let candidateID: String
  let fileURL: URL
  let observation: TransformedSampleImmutableFileObservation
}

private struct FinalObservationError: Error {
  let candidateID: String?
}

struct TransformedSampleResearchMemoryEstimate: Sendable, Equatable {
  let residentBytes: Int64
  let decodePeakBytes: Int64
  let preflightScratchBytes: Int64
  let windowCount: Int
}
