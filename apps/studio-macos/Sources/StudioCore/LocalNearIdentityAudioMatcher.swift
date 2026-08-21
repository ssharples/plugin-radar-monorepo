import AVFoundation
import Accelerate
import CryptoKit
import Foundation

public struct LocalNearIdentityAudioMatcher: AudioMatchingEngine {
  public static let algorithmFamily = "local-near-identity"
  public static let algorithmVersion = "local-near-identity-v5"
  public static let fingerprintVersion = "spectral-sequence-11025-v4"
  public static let validatedPitchTransformBoundarySemitones = 0.10
  public static let diagnosticPitchProbeSemitones = 0.05
  public static let hardMaximumDurationSeconds = 900.0
  public static let hardMaximumFingerprintFrames = 10_000
  public static let hardMaximumCandidateCount = 64
  public static let hardMaximumFileBytes: Int64 = 8_000_000_000
  public static let hardMaximumWorkingMemoryBytes: Int64 = 512 * 1_024 * 1_024
  public static let hardMaximumLagSeconds = 8.0
  public static let safetyMinimumAverageSimilarity = 0.91
  public static let safetyMinimumFullRecordingCoverage = 0.8
  public static let safetyMinimumRunnerUpMargin = 0.05
  public static let safetyMinimumMatchedSpanSeconds = 4.0
  public static let safetyMinimumNonSilentRatio = 0.55
  public static let safetyMinimumDistinctTokenCount = 5
  public static let safetyMinimumActiveContentRatio = 0.55
  public static let safetyMaximumNearEqualDurationDeltaRatio = 0.004

  fileprivate static let canonicalSampleRate = 11_025.0
  fileprivate static let frameSize = 4_096
  fileprivate static let hopSize = 1_024
  fileprivate static let activityBlockSize = 128

  public let descriptor = AudioMatcherDescriptor(
    id: "local-near-identity",
    displayName: "Local near-identical recording matcher",
    algorithmVersion: Self.algorithmVersion,
    capabilities: [.nearIdentity],
    availability: .available)

  public let minimumAverageSimilarity: Double
  public let minimumFullRecordingCoverage: Double
  public let minimumRunnerUpMargin: Double
  public let maximumLagSeconds: Double
  public let minimumMatchedSpanSeconds: Double
  public let maximumDurationSeconds: Double
  public let maximumFingerprintFrames: Int
  public let maximumCandidateCount: Int
  public let maximumFileBytes: Int64
  public let maximumWorkingMemoryBytes: Int64
  public let minimumNonSilentRatio: Double
  public let minimumDistinctTokenCount: Int
  public let minimumActiveContentRatio: Double
  public let maximumNearEqualDurationDeltaRatio: Double

  private let willDigestHook: @Sendable (URL) throws -> Void
  private let digestProgressHook: @Sendable (URL, Int64) throws -> Void
  private let postFingerprintHook: @Sendable (URL) throws -> Void
  private let requestMemoryPreflightHook: @Sendable (Int64, Int64) throws -> Void

  public init(
    minimumAverageSimilarity: Double = 0.91,
    minimumFullRecordingCoverage: Double = 0.8,
    minimumRunnerUpMargin: Double = 0.05,
    maximumLagSeconds: Double = 8,
    minimumMatchedSpanSeconds: Double = 4,
    maximumDurationSeconds: Double = 900,
    maximumFingerprintFrames: Int = 10_000,
    maximumCandidateCount: Int = 64,
    maximumFileBytes: Int64 = 8_000_000_000,
    maximumWorkingMemoryBytes: Int64 = 512 * 1_024 * 1_024,
    minimumNonSilentRatio: Double = 0.55,
    minimumDistinctTokenCount: Int = 5,
    minimumActiveContentRatio: Double = 0.55,
    maximumNearEqualDurationDeltaRatio: Double = 0.004
  ) {
    self.init(
      minimumAverageSimilarity: minimumAverageSimilarity,
      minimumFullRecordingCoverage: minimumFullRecordingCoverage,
      minimumRunnerUpMargin: minimumRunnerUpMargin,
      maximumLagSeconds: maximumLagSeconds,
      minimumMatchedSpanSeconds: minimumMatchedSpanSeconds,
      maximumDurationSeconds: maximumDurationSeconds,
      maximumFingerprintFrames: maximumFingerprintFrames,
      maximumCandidateCount: maximumCandidateCount,
      maximumFileBytes: maximumFileBytes,
      maximumWorkingMemoryBytes: maximumWorkingMemoryBytes,
      minimumNonSilentRatio: minimumNonSilentRatio,
      minimumDistinctTokenCount: minimumDistinctTokenCount,
      minimumActiveContentRatio: minimumActiveContentRatio,
      maximumNearEqualDurationDeltaRatio: maximumNearEqualDurationDeltaRatio,
      willDigestHook: { _ in },
      digestProgressHook: { _, _ in },
      postFingerprintHook: { _ in },
      requestMemoryPreflightHook: { _, _ in })
  }

  init(
    minimumAverageSimilarity: Double = 0.91,
    minimumFullRecordingCoverage: Double = 0.8,
    minimumRunnerUpMargin: Double = 0.05,
    maximumLagSeconds: Double = 8,
    minimumMatchedSpanSeconds: Double = 4,
    maximumDurationSeconds: Double = 900,
    maximumFingerprintFrames: Int = 10_000,
    maximumCandidateCount: Int = 64,
    maximumFileBytes: Int64 = 8_000_000_000,
    maximumWorkingMemoryBytes: Int64 = 512 * 1_024 * 1_024,
    minimumNonSilentRatio: Double = 0.55,
    minimumDistinctTokenCount: Int = 5,
    minimumActiveContentRatio: Double = 0.55,
    maximumNearEqualDurationDeltaRatio: Double = 0.004,
    willDigestHook: @escaping @Sendable (URL) throws -> Void = { _ in },
    digestProgressHook: @escaping @Sendable (URL, Int64) throws -> Void = { _, _ in },
    postFingerprintHook: @escaping @Sendable (URL) throws -> Void,
    requestMemoryPreflightHook: @escaping @Sendable (Int64, Int64) throws -> Void = { _, _ in }
  ) {
    self.minimumAverageSimilarity = min(
      1,
      max(Self.safetyMinimumAverageSimilarity, minimumAverageSimilarity))
    self.minimumFullRecordingCoverage = min(
      1,
      max(Self.safetyMinimumFullRecordingCoverage, minimumFullRecordingCoverage))
    self.minimumRunnerUpMargin = min(
      1,
      max(Self.safetyMinimumRunnerUpMargin, minimumRunnerUpMargin))
    self.maximumLagSeconds = min(Self.hardMaximumLagSeconds, max(0, maximumLagSeconds))
    self.minimumMatchedSpanSeconds = max(
      Self.safetyMinimumMatchedSpanSeconds,
      minimumMatchedSpanSeconds)
    self.maximumDurationSeconds = min(
      Self.hardMaximumDurationSeconds,
      max(1, maximumDurationSeconds))
    self.maximumFingerprintFrames = min(
      Self.hardMaximumFingerprintFrames,
      max(1, maximumFingerprintFrames))
    self.maximumCandidateCount = min(
      Self.hardMaximumCandidateCount,
      max(1, maximumCandidateCount))
    self.maximumFileBytes = min(Self.hardMaximumFileBytes, max(1, maximumFileBytes))
    self.maximumWorkingMemoryBytes = min(
      Self.hardMaximumWorkingMemoryBytes,
      max(1, maximumWorkingMemoryBytes))
    self.minimumNonSilentRatio = min(
      1,
      max(Self.safetyMinimumNonSilentRatio, minimumNonSilentRatio))
    self.minimumDistinctTokenCount = max(
      Self.safetyMinimumDistinctTokenCount,
      minimumDistinctTokenCount)
    self.minimumActiveContentRatio = min(
      1,
      max(Self.safetyMinimumActiveContentRatio, minimumActiveContentRatio))
    self.maximumNearEqualDurationDeltaRatio = min(
      Self.safetyMaximumNearEqualDurationDeltaRatio,
      max(0, maximumNearEqualDurationDeltaRatio))
    self.willDigestHook = willDigestHook
    self.digestProgressHook = digestProgressHook
    self.postFingerprintHook = postFingerprintHook
    self.requestMemoryPreflightHook = requestMemoryPreflightHook
  }

  public func match(_ request: AudioMatchRequest) async throws -> [AudioMatchObservation] {
    guard !request.candidates.isEmpty,
      request.candidates.count <= maximumCandidateCount,
      Set(request.candidates.map(\.nodeID)).count == request.candidates.count
    else { return [] }
    if Task.isCancelled { throw CancellationError() }

    guard
      let requestContainers = LocalNearIdentityWorkingMemoryPlanner.requestContainers(
        candidateCount: request.candidates.count),
      requestContainers.upperBoundBytes <= maximumWorkingMemoryBytes
    else { return [] }

    let sourcePreflight: NearIdentityPreflight
    let candidatePreflights: [(AudioMatchCandidate, NearIdentityPreflight)]
    do {
      sourcePreflight = try preflight(request.sourceURL)
      candidatePreflights = try request.candidates.map { ($0, try preflight($0.fileURL)) }
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      return []
    }

    guard
      let requestMemory = LocalNearIdentityWorkingMemoryPlanner.requestPlan(
        source: sourcePreflight.workingMemoryPlan,
        candidates: candidatePreflights.map(\.1.workingMemoryPlan),
        containers: requestContainers),
      requestMemory.measuredBytes > 0,
      requestMemory.measuredBytes <= requestMemory.upperBoundBytes
    else { return [] }
    do {
      try requestMemoryPreflightHook(
        requestMemory.measuredBytes,
        requestMemory.upperBoundBytes)
    } catch {
      return []
    }
    guard requestMemory.upperBoundBytes <= maximumWorkingMemoryBytes else { return [] }

    let source: AuditedFingerprint
    do {
      guard requestMemory.upperBoundBytes <= maximumWorkingMemoryBytes else { return [] }
      guard let captured = try auditedFingerprint(at: request.sourceURL, preflight: sourcePreflight)
      else { return [] }
      source = captured
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      return []
    }

    var best: NearIdentityRankedMatch?
    var runnerUpScore: Double?
    for (candidate, candidatePreflight) in candidatePreflights {
      if Task.isCancelled { throw CancellationError() }
      do {
        guard requestMemory.upperBoundBytes <= maximumWorkingMemoryBytes else { return [] }
        guard
          let target = try auditedFingerprint(
            at: candidate.fileURL,
            preflight: candidatePreflight)
        else { continue }
        guard let comparison = compare(query: source.fingerprint, target: target.fingerprint)
        else { continue }
        let current = NearIdentityRankedMatch(
          candidate: candidate,
          target: target,
          match: comparison)
        if let retainedBest = best {
          if ranksBefore(current, retainedBest) {
            runnerUpScore = max(runnerUpScore ?? 0, retainedBest.match.score)
            best = current
          } else {
            runnerUpScore = max(runnerUpScore ?? 0, current.match.score)
          }
        } else {
          best = current
        }
      } catch is CancellationError {
        throw CancellationError()
      } catch {
        // A partial candidate ranking cannot establish a safe runner-up margin.
        return []
      }
    }

    guard let best else { return [] }
    let runnerUpMargin = max(0, best.match.score - (runnerUpScore ?? 0))
    guard best.match.averageSimilarity >= minimumAverageSimilarity,
      best.match.fullRecordingCoverage >= minimumFullRecordingCoverage,
      best.match.matchedSpanSeconds >= minimumMatchedSpanSeconds,
      runnerUpMargin >= minimumRunnerUpMargin
    else { return [] }

    return [
      AudioMatchObservation(
        sourceNodeID: request.sourceNodeID,
        targetNodeID: best.candidate.nodeID,
        capability: .nearIdentity,
        score: best.match.score,
        matchedCoverage: best.match.fullRecordingCoverage,
        runnerUpMargin: runnerUpMargin,
        sourceRange: AudioTimeRange(
          startSeconds: best.match.queryStartSeconds,
          durationSeconds: best.match.matchedSpanSeconds),
        targetRange: AudioTimeRange(
          startSeconds: best.match.targetStartSeconds,
          durationSeconds: best.match.matchedSpanSeconds),
        coveredDurationSeconds: best.match.matchedSpanSeconds,
        fingerprintDigest: source.fingerprint.digest,
        targetFingerprintDigest: best.target.fingerprint.digest,
        fingerprintVersion: Self.fingerprintVersion,
        sourceObservation: source.observation,
        targetObservation: best.target.observation,
        explanation:
          "\(Self.fingerprintVersion) aligned \(percent(best.match.fullRecordingCoverage)) of both full-recording fingerprints at \(percent(best.match.averageSimilarity)) average spectral similarity; raw duration coverage \(percent(best.match.rawDurationCoverage)), active duration delta \(percent(best.match.activeDurationDeltaRatio)), matched \(seconds(best.match.matchedSpanSeconds)).",
        algorithmVersion: Self.algorithmVersion,
        algorithmFamily: Self.algorithmFamily,
        materialClass: request.materialClass,
        resourceUsage: AudioMatchResourceUsage(
          sourceDurationSeconds: source.fingerprint.totalDurationSeconds,
          targetDurationSeconds: best.target.fingerprint.totalDurationSeconds,
          sourceFingerprintFrames: source.fingerprint.trimmedTokens.count,
          targetFingerprintFrames: best.target.fingerprint.trimmedTokens.count,
          candidateCount: request.candidates.count,
          sourceFileBytes: source.observation.bytes,
          targetFileBytes: best.target.observation.bytes,
          workingMemoryMeasuredBytes: requestMemory.measuredBytes,
          workingMemoryUpperBoundBytes: requestMemory.upperBoundBytes)
      )
    ]
  }

  private func ranksBefore(_ left: NearIdentityRankedMatch, _ right: NearIdentityRankedMatch)
    -> Bool
  {
    if left.match.score != right.match.score { return left.match.score > right.match.score }
    return left.candidate.nodeID < right.candidate.nodeID
  }

  private func auditedFingerprint(
    at url: URL,
    preflight: NearIdentityPreflight
  ) throws -> AuditedFingerprint? {
    guard try FileFingerprint.read(from: url, fileManager: .default) == preflight.fileFingerprint
    else {
      throw NearIdentityMatcherError.changedDuringAnalysis(url)
    }
    try willDigestHook(url)
    guard try FileFingerprint.read(from: url, fileManager: .default) == preflight.fileFingerprint
    else {
      throw NearIdentityMatcherError.changedDuringAnalysis(url)
    }
    let before = try AudioMatchSourceObservation.captureBounded(
      fileURL: url,
      maximumBytes: maximumFileBytes,
      progress: digestProgressHook)
    let fingerprint = try fingerprint(url, preflight: preflight)
    try postFingerprintHook(url)
    let after = try AudioMatchSourceObservation.captureBounded(
      fileURL: url,
      maximumBytes: maximumFileBytes,
      progress: digestProgressHook)
    guard before == after else {
      throw NearIdentityMatcherError.changedDuringAnalysis(url)
    }
    return fingerprint.map { AuditedFingerprint(fingerprint: $0, observation: after) }
  }

  private func preflight(_ url: URL) throws -> NearIdentityPreflight {
    let fileFingerprint = try FileFingerprint.read(from: url, fileManager: .default)
    guard fileFingerprint.bytes > 0, fileFingerprint.bytes <= maximumFileBytes else {
      throw NearIdentityMatcherError.outsideBounds(url)
    }
    let audioFile: AVAudioFile
    do {
      audioFile = try AVAudioFile(
        forReading: url,
        commonFormat: .pcmFormatFloat32,
        interleaved: false)
    } catch {
      throw NearIdentityMatcherError.unreadable(url, error.localizedDescription)
    }
    let format = audioFile.processingFormat
    guard format.channelCount > 0, format.channelCount <= 32,
      format.sampleRate.isFinite,
      (1_000...384_000).contains(format.sampleRate),
      audioFile.length > 0
    else { throw NearIdentityMatcherError.outsideBounds(url) }
    let durationSeconds = Double(audioFile.length) / format.sampleRate
    guard
      let estimatedCanonicalFrames = Self.boundedCanonicalFrameEstimate(
        durationSeconds: durationSeconds,
        maximumDurationSeconds: maximumDurationSeconds,
        maximumFingerprintFrames: maximumFingerprintFrames)
    else { throw NearIdentityMatcherError.outsideBounds(url) }
    let estimatedFingerprintFrames = min(
      maximumFingerprintFrames,
      max(
        1,
        (estimatedCanonicalFrames - Self.frameSize) / Self.hopSize + 1))
    guard
      let workingMemoryPlan = LocalNearIdentityWorkingMemoryPlanner.filePlan(
        inputFrameCount: audioFile.length,
        channelCount: Int(format.channelCount),
        canonicalFrameCapacity: estimatedCanonicalFrames,
        fingerprintFrameCapacity: estimatedFingerprintFrames)
    else { throw NearIdentityMatcherError.outsideBounds(url) }
    return NearIdentityPreflight(
      fileFingerprint: fileFingerprint,
      durationSeconds: durationSeconds,
      estimatedCanonicalFrames: estimatedCanonicalFrames,
      workingMemoryPlan: workingMemoryPlan)
  }

  private func fingerprint(
    _ url: URL,
    preflight: NearIdentityPreflight
  ) throws -> NearIdentityFingerprint? {
    let audioFile: AVAudioFile
    do {
      audioFile = try AVAudioFile(
        forReading: url,
        commonFormat: .pcmFormatFloat32,
        interleaved: false)
    } catch {
      throw NearIdentityMatcherError.unreadable(url, error.localizedDescription)
    }

    let inputFormat = audioFile.processingFormat
    guard inputFormat.channelCount > 0, inputFormat.channelCount <= 32,
      inputFormat.sampleRate.isFinite,
      (1_000...384_000).contains(inputFormat.sampleRate),
      audioFile.length > 0
    else { throw NearIdentityMatcherError.outsideBounds(url) }
    let durationSeconds = Double(audioFile.length) / inputFormat.sampleRate
    guard durationSeconds.isFinite,
      durationSeconds > 0,
      durationSeconds <= maximumDurationSeconds,
      abs(durationSeconds - preflight.durationSeconds) < 1e-9,
      try FileFingerprint.read(from: url, fileManager: .default) == preflight.fileFingerprint,
      let canonicalFormat = AVAudioFormat(
        standardFormatWithSampleRate: Self.canonicalSampleRate,
        channels: 1),
      let converter = AVAudioConverter(from: inputFormat, to: canonicalFormat),
      let outputBuffer = AVAudioPCMBuffer(
        pcmFormat: canonicalFormat,
        frameCapacity: AVAudioFrameCount(preflight.estimatedCanonicalFrames))
    else { throw NearIdentityMatcherError.outsideBounds(url) }

    let input = CanonicalConversionInput(
      audioFile: audioFile,
      inputFormat: inputFormat,
      url: url)
    var conversionError: NSError?
    let status = converter.convert(to: outputBuffer, error: &conversionError) {
      requestedPacketCount,
      inputStatus in
      input.nextBuffer(
        requestedPacketCount: requestedPacketCount,
        inputStatus: inputStatus)
    }
    if let readError = input.readError {
      throw NearIdentityMatcherError.unreadable(url, readError.localizedDescription)
    }
    guard status != .error,
      conversionError == nil,
      outputBuffer.frameLength < outputBuffer.frameCapacity,
      let samples = outputBuffer.floatChannelData?[0]
    else {
      throw NearIdentityMatcherError.unreadable(
        url,
        conversionError?.localizedDescription ?? "canonical conversion exceeded its bound")
    }

    return try makeFingerprint(
      samples: UnsafeBufferPointer(start: samples, count: Int(outputBuffer.frameLength)),
      totalDurationSeconds: durationSeconds,
      url: url)
  }

  private func makeFingerprint(
    samples: UnsafeBufferPointer<Float>,
    totalDurationSeconds: Double,
    url: URL
  ) throws -> NearIdentityFingerprint? {
    guard samples.count >= Self.frameSize else { return nil }
    let frameCount = (samples.count - Self.frameSize) / Self.hopSize + 1
    guard frameCount <= maximumFingerprintFrames else {
      throw NearIdentityMatcherError.outsideBounds(url)
    }
    guard
      let setup = vDSP_DFT_zop_CreateSetup(
        nil,
        vDSP_Length(Self.frameSize),
        vDSP_DFT_Direction.FORWARD)
    else { throw NearIdentityMatcherError.unreadable(url, "FFT setup failed") }
    defer { vDSP_DFT_DestroySetup(setup) }

    let window = (0..<Self.frameSize).map { index in
      Float(0.5 - 0.5 * cos(2 * Double.pi * Double(index) / Double(Self.frameSize - 1)))
    }
    var input = [Float](repeating: 0, count: Self.frameSize)
    let imaginary = [Float](repeating: 0, count: Self.frameSize)
    var realOut = [Float](repeating: 0, count: Self.frameSize)
    var imaginaryOut = [Float](repeating: 0, count: Self.frameSize)
    var rawFrames: [RawFingerprintFrame] = []
    rawFrames.reserveCapacity(frameCount)

    for frameIndex in 0..<frameCount {
      let start = frameIndex * Self.hopSize
      for index in 0..<Self.frameSize {
        input[index] = samples[start + index] * window[index]
      }
      vDSP_DFT_Execute(setup, input, imaginary, &realOut, &imaginaryOut)

      var bands = [Float](repeating: 0, count: 72)
      for index in 2..<(Self.frameSize / 2) {
        let frequency = Double(index) * Self.canonicalSampleRate / Double(Self.frameSize)
        guard frequency >= 45, frequency <= 5_000 else { continue }
        let fraction = log(frequency / 45) / log(5_000 / 45)
        let band = min(bands.count - 1, max(0, Int(fraction * Double(bands.count))))
        bands[band] +=
          realOut[index] * realOut[index]
          + imaginaryOut[index] * imaginaryOut[index]
      }
      let energy = bands.reduce(Float(0), +)
      rawFrames.append(
        RawFingerprintFrame(
          token: robustToken(from: bands, real: realOut, imaginary: imaginaryOut),
          energy: energy))
    }

    let peakEnergy = rawFrames.map(\.energy).max() ?? 0
    guard peakEnergy.isFinite, peakEnergy > 1e-10 else { return nil }
    let silenceThreshold = max(Float(1e-10), peakEnergy * 1e-6)
    let tokens = rawFrames.map { $0.energy > silenceThreshold ? $0.token : 0 }
    guard let firstNonSilent = tokens.firstIndex(where: { $0 != 0 }),
      let lastNonSilent = tokens.lastIndex(where: { $0 != 0 })
    else { return nil }
    let trimmedTokens = Array(tokens[firstNonSilent...lastNonSilent])
    let nonSilentTokens = trimmedTokens.filter { $0 != 0 }
    let nonSilentRatio = Double(nonSilentTokens.count) / Double(trimmedTokens.count)
    let distinctTokenCount = Set(nonSilentTokens).count
    let transitions = zip(nonSilentTokens, nonSilentTokens.dropFirst())
      .count(where: { $0 != $1 })
    let transitionRatio = Double(transitions) / Double(max(1, nonSilentTokens.count - 1))
    guard nonSilentRatio >= minimumNonSilentRatio,
      distinctTokenCount >= minimumDistinctTokenCount,
      transitionRatio >= 0.04
    else { return nil }

    var activityEnergies: [Float] = []
    activityEnergies.reserveCapacity(
      (samples.count + Self.activityBlockSize - 1) / Self.activityBlockSize)
    for start in stride(from: 0, to: samples.count, by: Self.activityBlockSize) {
      let end = min(samples.count, start + Self.activityBlockSize)
      var energy: Float = 0
      for index in start..<end {
        energy += samples[index] * samples[index]
      }
      activityEnergies.append(energy / Float(end - start))
    }
    let peakActivityEnergy = activityEnergies.max() ?? 0
    let activityThreshold = max(Float(1e-10), peakActivityEnergy * 1e-5)
    guard let firstActiveBlock = activityEnergies.firstIndex(where: { $0 > activityThreshold }),
      let lastActiveBlock = activityEnergies.lastIndex(where: { $0 > activityThreshold })
    else { return nil }
    let activeStartSample = firstActiveBlock * Self.activityBlockSize
    let activeEndSample = min(samples.count, (lastActiveBlock + 1) * Self.activityBlockSize)
    let activeDurationSeconds =
      Double(activeEndSample - activeStartSample) / Self.canonicalSampleRate
    let activeContentRatio = activeDurationSeconds / totalDurationSeconds
    guard activeContentRatio.isFinite,
      activeContentRatio >= minimumActiveContentRatio
    else { return nil }

    return NearIdentityFingerprint(
      trimmedTokens: trimmedTokens,
      totalDurationSeconds: totalDurationSeconds,
      activeDurationSeconds: activeDurationSeconds,
      activeContentRatio: activeContentRatio,
      leadingSilenceFrames: firstNonSilent,
      digest: fingerprintDigest(
        for: trimmedTokens,
        totalDurationSeconds: totalDurationSeconds,
        activeDurationSeconds: activeDurationSeconds))
  }

  private func compare(
    query: NearIdentityFingerprint,
    target: NearIdentityFingerprint
  ) -> NearIdentityMatch? {
    let fingerprintDurationCoverage =
      Double(min(query.trimmedTokens.count, target.trimmedTokens.count))
      / Double(max(query.trimmedTokens.count, target.trimmedTokens.count))
    let rawDurationCoverage =
      min(query.totalDurationSeconds, target.totalDurationSeconds)
      / max(query.totalDurationSeconds, target.totalDurationSeconds)
    let activeDurationCoverage =
      min(query.activeDurationSeconds, target.activeDurationSeconds)
      / max(query.activeDurationSeconds, target.activeDurationSeconds)
    let activeDurationDeltaRatio = 1 - activeDurationCoverage
    guard fingerprintDurationCoverage >= minimumFullRecordingCoverage,
      rawDurationCoverage >= 0.75,
      query.activeContentRatio >= minimumActiveContentRatio,
      target.activeContentRatio >= minimumActiveContentRatio
    else { return nil }
    if activeDurationDeltaRatio < 0.02 {
      guard activeDurationDeltaRatio <= maximumNearEqualDurationDeltaRatio else { return nil }
    } else {
      guard activeDurationCoverage >= minimumFullRecordingCoverage else { return nil }
    }
    let queryNonSilent = query.trimmedTokens.count(where: { $0 != 0 })
    let targetNonSilent = target.trimmedTokens.count(where: { $0 != 0 })
    guard queryNonSilent > 0, targetNonSilent > 0 else { return nil }
    let hopSeconds = Double(Self.hopSize) / Self.canonicalSampleRate
    let maximumLagFrames = min(
      Int((maximumLagSeconds / hopSeconds).rounded(.up)),
      max(query.trimmedTokens.count, target.trimmedTokens.count))

    var best: NearIdentityAlignment?
    for lag in -maximumLagFrames...maximumLagFrames {
      let queryStart = max(0, -lag)
      let targetStart = max(0, lag)
      let overlap = min(
        query.trimmedTokens.count - queryStart,
        target.trimmedTokens.count - targetStart)
      guard overlap > 0 else { continue }

      var similarityTotal = 0.0
      var matchedNonSilentFrames = 0
      var silenceMismatches = 0
      var pitchDeltaTotal = 0
      var positivePitchDeltaCount = 0
      var negativePitchDeltaCount = 0
      for index in 0..<overlap {
        let queryToken = query.trimmedTokens[queryStart + index]
        let targetToken = target.trimmedTokens[targetStart + index]
        switch (queryToken == 0, targetToken == 0) {
        case (false, false):
          similarityTotal += tokenSimilarity(queryToken, targetToken)
          matchedNonSilentFrames += 1
          let pitchDelta = Int(targetToken >> 15) - Int(queryToken >> 15)
          pitchDeltaTotal += pitchDelta
          if pitchDelta > 0 {
            positivePitchDeltaCount += 1
          } else if pitchDelta < 0 {
            negativePitchDeltaCount += 1
          }
        case (true, false), (false, true):
          silenceMismatches += 1
        case (true, true):
          break
        }
      }
      guard matchedNonSilentFrames > 0 else { continue }
      var averageSimilarity = similarityTotal / Double(matchedNonSilentFrames)
      if hasCoherentPitchTransform(
        pitchDeltaTotal: pitchDeltaTotal,
        positiveCount: positivePitchDeltaCount,
        negativeCount: negativePitchDeltaCount,
        sampleCount: matchedNonSilentFrames)
      {
        averageSimilarity *= 0.75
      }
      let queryCoverage = Double(matchedNonSilentFrames) / Double(queryNonSilent)
      let targetCoverage = Double(matchedNonSilentFrames) / Double(targetNonSilent)
      let fullRecordingCoverage = min(
        fingerprintDurationCoverage,
        rawDurationCoverage,
        activeDurationCoverage,
        queryCoverage,
        targetCoverage)
      let silenceConsistency = 1 - Double(silenceMismatches) / Double(overlap)
      let sequenceSimilarity = averageSimilarity * 0.92 + silenceConsistency * 0.08
      let score = sequenceSimilarity * (0.8 + 0.2 * fullRecordingCoverage)
      let alignment = NearIdentityAlignment(
        lagFrames: lag,
        queryStartFrame: queryStart,
        targetStartFrame: targetStart,
        overlapFrames: overlap,
        averageSimilarity: averageSimilarity,
        fullRecordingCoverage: fullRecordingCoverage,
        score: score)
      if let retainedBest = best {
        if alignment.score > retainedBest.score
          || (alignment.score == retainedBest.score
            && abs(alignment.lagFrames) < abs(retainedBest.lagFrames))
        {
          best = alignment
        }
      } else {
        best = alignment
      }
    }
    guard let best else { return nil }

    let matchedSpanSeconds = Double(best.overlapFrames) * hopSeconds
    return NearIdentityMatch(
      score: best.score,
      averageSimilarity: best.averageSimilarity,
      fullRecordingCoverage: best.fullRecordingCoverage,
      matchedSpanSeconds: matchedSpanSeconds,
      rawDurationCoverage: rawDurationCoverage,
      activeDurationDeltaRatio: activeDurationDeltaRatio,
      queryStartSeconds: query.trimmedStartSeconds + Double(best.queryStartFrame) * hopSeconds,
      targetStartSeconds: target.trimmedStartSeconds + Double(best.targetStartFrame) * hopSeconds)
  }

  private func robustToken(
    from bands: [Float],
    real: [Float],
    imaginary: [Float]
  ) -> UInt64 {
    let coarseBandCount = 16
    let stride = max(1, bands.count / coarseBandCount)
    var coarse = [Float](repeating: 0, count: coarseBandCount)
    for coarseIndex in 0..<coarseBandCount {
      let start = coarseIndex * stride
      let end = min(bands.count, start + stride)
      guard start < end else { continue }
      coarse[coarseIndex] = bands[start..<end].reduce(0, +)
    }

    let lowerBin = max(
      2, Int((45 * Double(Self.frameSize) / Self.canonicalSampleRate).rounded(.up)))
    let upperBin = min(
      Self.frameSize / 2 - 2,
      Int((5_000 * Double(Self.frameSize) / Self.canonicalSampleRate).rounded(.down)))
    var magnitudes = [Float](repeating: 0, count: upperBin - lowerBin + 1)
    for index in lowerBin...upperBin {
      magnitudes[index - lowerBin] = real[index] * real[index] + imaginary[index] * imaginary[index]
    }
    let peakOffset = magnitudes.enumerated().max(by: { $0.element < $1.element })?.offset ?? 0
    let peakBin = lowerBin + peakOffset
    let left = log(max(Float.leastNonzeroMagnitude, magnitudes[max(0, peakOffset - 1)]))
    let center = log(max(Float.leastNonzeroMagnitude, magnitudes[peakOffset]))
    let right = log(
      max(Float.leastNonzeroMagnitude, magnitudes[min(magnitudes.count - 1, peakOffset + 1)]))
    let denominator = left - 2 * center + right
    let interpolation =
      denominator == 0
      ? 0
      : min(Float(0.5), max(Float(-0.5), 0.5 * (left - right) / denominator))
    let dominantFrequency =
      (Double(peakBin) + Double(interpolation)) * Self.canonicalSampleRate
      / Double(Self.frameSize)
    let pitchBucket = max(0, Int((240 * log2(dominantFrequency / 45)).rounded()))
    var shape: UInt64 = 0
    for index in 0..<(coarseBandCount - 1) {
      shape <<= 1
      if coarse[index] >= coarse[index + 1] { shape |= 1 }
    }
    return UInt64(pitchBucket + 1) << 15 | shape
  }

  private func tokenSimilarity(_ left: UInt64, _ right: UInt64) -> Double {
    let leftPitch = Int(left >> 15)
    let rightPitch = Int(right >> 15)
    let pitchDistance = abs(leftPitch - rightPitch)
    let pitchSimilarity = max(0, 1 - Double(pitchDistance) * 0.03)
    let differingShapeBits = ((left & 0x7fff) ^ (right & 0x7fff)).nonzeroBitCount
    let shapeSimilarity = 1 - Double(differingShapeBits) / 15
    return pitchSimilarity * 0.8 + shapeSimilarity * 0.2
  }

  private func hasCoherentPitchTransform(
    pitchDeltaTotal: Int,
    positiveCount: Int,
    negativeCount: Int,
    sampleCount: Int
  ) -> Bool {
    guard sampleCount > 0 else { return false }
    let mean = Double(pitchDeltaTotal) / Double(sampleCount)
    guard abs(mean) >= 0.45 else { return false }
    let directionCount = mean > 0 ? positiveCount : negativeCount
    let directionRatio = Double(directionCount) / Double(sampleCount)
    return directionRatio >= 0.55
  }

  static func boundedCanonicalFrameEstimate(
    durationSeconds: Double,
    maximumDurationSeconds: Double,
    maximumFingerprintFrames: Int
  ) -> Int? {
    guard durationSeconds.isFinite,
      durationSeconds > 0,
      maximumDurationSeconds.isFinite,
      maximumDurationSeconds > 0,
      durationSeconds <= maximumDurationSeconds,
      maximumFingerprintFrames > 0
    else { return nil }
    let canonicalFrames = durationSeconds * canonicalSampleRate
    let (fingerprintFrameCapacity, multiplicationOverflow) =
      maximumFingerprintFrames.multipliedReportingOverflow(by: hopSize)
    let (maximumCanonicalFrames, additionOverflow) =
      fingerprintFrameCapacity.addingReportingOverflow(frameSize)
    guard canonicalFrames.isFinite,
      canonicalFrames >= 0,
      !multiplicationOverflow,
      !additionOverflow,
      canonicalFrames <= Double(maximumCanonicalFrames - frameSize),
      canonicalFrames <= Double(Int.max - frameSize),
      canonicalFrames <= Double(UInt32.max - UInt32(frameSize))
    else { return nil }
    return Int(canonicalFrames.rounded(.up)) + frameSize
  }

  private func fingerprintDigest(
    for tokens: [UInt64],
    totalDurationSeconds: Double,
    activeDurationSeconds: Double
  ) -> String {
    var hasher = SHA256()
    hasher.update(data: Data(Self.fingerprintVersion.utf8))
    var count = UInt64(tokens.count).littleEndian
    withUnsafeBytes(of: &count) { hasher.update(bufferPointer: $0) }
    var totalDurationBits = totalDurationSeconds.bitPattern.littleEndian
    withUnsafeBytes(of: &totalDurationBits) { hasher.update(bufferPointer: $0) }
    var activeDurationBits = activeDurationSeconds.bitPattern.littleEndian
    withUnsafeBytes(of: &activeDurationBits) { hasher.update(bufferPointer: $0) }
    for token in tokens {
      var littleEndian = token.littleEndian
      withUnsafeBytes(of: &littleEndian) { hasher.update(bufferPointer: $0) }
    }
    return FileContentDigest.hex(hasher.finalize())
  }

  private func percent(_ value: Double) -> String {
    "\(Int((min(1, max(0, value)) * 100).rounded()))%"
  }

  private func seconds(_ value: Double) -> String {
    String(format: "%.2fs", locale: Locale(identifier: "en_US_POSIX"), value)
  }
}

private enum NearIdentityMatcherError: Error {
  case unreadable(URL, String)
  case outsideBounds(URL)
  case changedDuringAnalysis(URL)
}

private final class CanonicalConversionInput: @unchecked Sendable {
  let audioFile: AVAudioFile
  let inputFormat: AVAudioFormat
  let url: URL
  private(set) var reachedEnd = false
  private(set) var readError: Error?
  private var retainedBuffer: AVAudioPCMBuffer?

  init(audioFile: AVAudioFile, inputFormat: AVAudioFormat, url: URL) {
    self.audioFile = audioFile
    self.inputFormat = inputFormat
    self.url = url
  }

  func nextBuffer(
    requestedPacketCount: AVAudioPacketCount,
    inputStatus: UnsafeMutablePointer<AVAudioConverterInputStatus>
  ) -> AVAudioBuffer? {
    if readError != nil {
      inputStatus.pointee = .noDataNow
      return nil
    }
    if reachedEnd {
      inputStatus.pointee = .endOfStream
      return nil
    }
    let remainingFrames = audioFile.length - audioFile.framePosition
    guard remainingFrames > 0 else {
      reachedEnd = true
      inputStatus.pointee = .endOfStream
      return nil
    }
    let frameCount = AVAudioFrameCount(
      max(1, min(Int64(requestedPacketCount), 8_192, remainingFrames)))
    guard
      let inputBuffer = AVAudioPCMBuffer(
        pcmFormat: inputFormat,
        frameCapacity: frameCount)
    else {
      inputStatus.pointee = .noDataNow
      readError = NearIdentityMatcherError.unreadable(url, "input buffer allocation failed")
      return nil
    }
    do {
      try audioFile.read(into: inputBuffer, frameCount: frameCount)
    } catch {
      inputStatus.pointee = .noDataNow
      readError = error
      return nil
    }
    guard inputBuffer.frameLength > 0 else {
      reachedEnd = true
      inputStatus.pointee = .endOfStream
      return nil
    }
    inputStatus.pointee = .haveData
    retainedBuffer = inputBuffer
    return inputBuffer
  }
}

private struct AuditedFingerprint {
  let fingerprint: NearIdentityFingerprint
  let observation: AudioMatchSourceObservation
}

private struct NearIdentityRankedMatch {
  let candidate: AudioMatchCandidate
  let target: AuditedFingerprint
  let match: NearIdentityMatch
}

private struct NearIdentityPreflight {
  let fileFingerprint: FileFingerprint
  let durationSeconds: Double
  let estimatedCanonicalFrames: Int
  let workingMemoryPlan: LocalNearIdentityFileMemoryPlan
}

private struct RawFingerprintFrame {
  let token: UInt64
  let energy: Float
}

private struct NearIdentityFingerprint {
  let trimmedTokens: [UInt64]
  let totalDurationSeconds: Double
  let activeDurationSeconds: Double
  let activeContentRatio: Double
  let leadingSilenceFrames: Int
  let digest: String

  private var hopSeconds: Double {
    Double(LocalNearIdentityAudioMatcher.hopSize)
      / LocalNearIdentityAudioMatcher.canonicalSampleRate
  }

  var trimmedStartSeconds: Double { Double(leadingSilenceFrames) * hopSeconds }
}

struct LocalNearIdentityWorkingMemoryUsage: Sendable, Equatable {
  let measuredBytes: Int64
  let upperBoundBytes: Int64
}

struct LocalNearIdentityFileMemoryPlan: Sendable, Equatable {
  let extraction: LocalNearIdentityWorkingMemoryUsage
  let retained: LocalNearIdentityWorkingMemoryUsage
}

enum LocalNearIdentityWorkingMemoryPlanner {
  private static let digestBufferBytes: Int64 = 64 * 1_024
  private static let fixedFrameworkUpperBoundBytes: Int64 = 2 * 1_024 * 1_024
  private static let fixedRequestUpperBoundBytes: Int64 = 64 * 1_024
  private static let fixedComparisonUpperBoundBytes: Int64 = 64 * 1_024
  private static let allocationOverheadBytes: Int64 = 64

  static func requestContainers(candidateCount: Int) -> LocalNearIdentityWorkingMemoryUsage? {
    guard candidateCount > 0 else { return nil }
    var measured = LocalNearIdentityByteCounter()
    var upper = LocalNearIdentityByteCounter()
    guard measured.add(1_024),
      measured.addProduct(candidateCount, 512),
      upper.add(fixedRequestUpperBoundBytes),
      upper.addProduct(candidateCount, 2_048),
      upper.addProduct(candidateCount, Int(allocationOverheadBytes) * 6)
    else { return nil }
    return LocalNearIdentityWorkingMemoryUsage(
      measuredBytes: measured.total,
      upperBoundBytes: upper.total)
  }

  static func filePlan(
    inputFrameCount: Int64,
    channelCount: Int,
    canonicalFrameCapacity: Int,
    fingerprintFrameCapacity: Int
  ) -> LocalNearIdentityFileMemoryPlan? {
    guard inputFrameCount > 0,
      channelCount > 0,
      canonicalFrameCapacity > 0,
      fingerprintFrameCapacity > 0
    else { return nil }
    let activityBlockCount =
      canonicalFrameCapacity / LocalNearIdentityAudioMatcher.activityBlockSize
      + (canonicalFrameCapacity % LocalNearIdentityAudioMatcher.activityBlockSize == 0 ? 0 : 1)

    var retainedMeasured = LocalNearIdentityByteCounter()
    var retainedUpper = LocalNearIdentityByteCounter()
    guard
      retainedMeasured.addProduct(
        fingerprintFrameCapacity,
        MemoryLayout<UInt64>.stride),
      retainedMeasured.add(512),
      retainedUpper.addProduct(
        fingerprintFrameCapacity,
        MemoryLayout<UInt64>.stride * 2),
      retainedUpper.add(2_048),
      retainedUpper.addProduct(4, Int(allocationOverheadBytes))
    else { return nil }

    var measured = LocalNearIdentityByteCounter()
    guard measured.add(digestBufferBytes),
      measured.addProduct(canonicalFrameCapacity, MemoryLayout<Float>.stride),
      measured.addProduct(
        inputFrameCount,
        Int64(channelCount),
        Int64(MemoryLayout<Float>.stride)),
      measured.addProduct(
        fingerprintFrameCapacity,
        MemoryLayout<RawFingerprintFrame>.stride),
      measured.addProduct(
        fingerprintFrameCapacity,
        MemoryLayout<UInt64>.stride * 3),
      measured.addProduct(fingerprintFrameCapacity, 24),
      measured.addProduct(activityBlockCount, MemoryLayout<Float>.stride),
      measured.addProduct(
        5,
        LocalNearIdentityAudioMatcher.frameSize * MemoryLayout<Float>.stride),
      measured.addProduct(72, MemoryLayout<Float>.stride),
      measured.add(512)
    else { return nil }

    var upper = LocalNearIdentityByteCounter()
    guard upper.add(digestBufferBytes),
      upper.addProduct(canonicalFrameCapacity, MemoryLayout<Float>.stride),
      upper.addProduct(
        inputFrameCount,
        Int64(channelCount),
        Int64(MemoryLayout<Float>.stride)),
      upper.addProduct(
        fingerprintFrameCapacity,
        MemoryLayout<RawFingerprintFrame>.stride * 2),
      upper.addProduct(
        fingerprintFrameCapacity,
        MemoryLayout<UInt64>.stride * 6),
      upper.addProduct(fingerprintFrameCapacity, 64),
      upper.addProduct(activityBlockCount, MemoryLayout<Float>.stride * 2),
      upper.addProduct(
        13,
        LocalNearIdentityAudioMatcher.frameSize * MemoryLayout<Float>.stride),
      upper.addProduct(72, MemoryLayout<Float>.stride * 2),
      upper.add(fixedFrameworkUpperBoundBytes),
      upper.addProduct(32, Int(allocationOverheadBytes))
    else { return nil }

    return LocalNearIdentityFileMemoryPlan(
      extraction: LocalNearIdentityWorkingMemoryUsage(
        measuredBytes: measured.total,
        upperBoundBytes: upper.total),
      retained: LocalNearIdentityWorkingMemoryUsage(
        measuredBytes: retainedMeasured.total,
        upperBoundBytes: retainedUpper.total))
  }

  static func requestPlan(
    source: LocalNearIdentityFileMemoryPlan,
    candidates: [LocalNearIdentityFileMemoryPlan],
    containers: LocalNearIdentityWorkingMemoryUsage
  ) -> LocalNearIdentityWorkingMemoryUsage? {
    guard !candidates.isEmpty else { return nil }
    let largestCandidateExtraction = candidates.max {
      $0.extraction.upperBoundBytes < $1.extraction.upperBoundBytes
    }?.extraction
    let largestCandidateRetained = candidates.max {
      $0.retained.upperBoundBytes < $1.retained.upperBoundBytes
    }?.retained
    guard let largestCandidateExtraction, let largestCandidateRetained else { return nil }

    guard
      let sourcePhase = usageSum([containers, source.extraction]),
      let candidatePhase = usageSum([
        containers,
        source.retained,
        largestCandidateExtraction,
        candidates.count > 1
          ? largestCandidateRetained
          : LocalNearIdentityWorkingMemoryUsage(measuredBytes: 0, upperBoundBytes: 0),
        LocalNearIdentityWorkingMemoryUsage(
          measuredBytes: 1_024,
          upperBoundBytes: fixedComparisonUpperBoundBytes),
      ])
    else { return nil }
    return LocalNearIdentityWorkingMemoryUsage(
      measuredBytes: max(sourcePhase.measuredBytes, candidatePhase.measuredBytes),
      upperBoundBytes: max(sourcePhase.upperBoundBytes, candidatePhase.upperBoundBytes))
  }

  private static func usageSum(_ usages: [LocalNearIdentityWorkingMemoryUsage])
    -> LocalNearIdentityWorkingMemoryUsage?
  {
    var measured = LocalNearIdentityByteCounter()
    var upper = LocalNearIdentityByteCounter()
    for usage in usages {
      guard measured.add(usage.measuredBytes), upper.add(usage.upperBoundBytes) else { return nil }
    }
    return LocalNearIdentityWorkingMemoryUsage(
      measuredBytes: measured.total,
      upperBoundBytes: upper.total)
  }
}

private struct LocalNearIdentityByteCounter {
  private(set) var total: Int64 = 0

  mutating func add(_ value: Int64) -> Bool {
    guard value >= 0 else { return false }
    let result = total.addingReportingOverflow(value)
    guard !result.overflow else { return false }
    total = result.partialValue
    return true
  }

  mutating func addProduct(_ left: Int, _ right: Int) -> Bool {
    guard let left = Int64(exactly: left), let right = Int64(exactly: right) else { return false }
    return addProduct(left, right)
  }

  mutating func addProduct(_ left: Int64, _ right: Int64) -> Bool {
    guard left >= 0, right >= 0 else { return false }
    let product = left.multipliedReportingOverflow(by: right)
    guard !product.overflow else { return false }
    return add(product.partialValue)
  }

  mutating func addProduct(_ first: Int64, _ second: Int64, _ third: Int64) -> Bool {
    guard first >= 0, second >= 0, third >= 0 else { return false }
    let firstProduct = first.multipliedReportingOverflow(by: second)
    guard !firstProduct.overflow else { return false }
    let finalProduct = firstProduct.partialValue.multipliedReportingOverflow(by: third)
    guard !finalProduct.overflow else { return false }
    return add(finalProduct.partialValue)
  }
}

private struct NearIdentityAlignment {
  let lagFrames: Int
  let queryStartFrame: Int
  let targetStartFrame: Int
  let overlapFrames: Int
  let averageSimilarity: Double
  let fullRecordingCoverage: Double
  let score: Double
}

private struct NearIdentityMatch {
  let score: Double
  let averageSimilarity: Double
  let fullRecordingCoverage: Double
  let matchedSpanSeconds: Double
  let rawDurationCoverage: Double
  let activeDurationDeltaRatio: Double
  let queryStartSeconds: Double
  let targetStartSeconds: Double
}
