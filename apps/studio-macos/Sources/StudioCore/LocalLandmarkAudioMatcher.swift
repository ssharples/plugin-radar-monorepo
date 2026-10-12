import AVFoundation
import Accelerate
import CryptoKit
import Foundation

public enum LocalLandmarkMatcherError: Error, LocalizedError, Sendable {
  case unreadable(URL, String)
  case empty(URL)

  public var errorDescription: String? {
    switch self {
    case .unreadable(let url, let reason):
      "Could not fingerprint audio at \(url.path): \(reason)"
    case .empty(let url):
      "Audio contains no fingerprintable frames at \(url.path)"
    }
  }
}

public struct LocalLandmarkAudioMatcher: AudioMatchingEngine {
  public static let algorithmVersion = "local-landmark-v1"
  public static let excerptRetrievalAlgorithmFamily = "local-excerpt-sequence-retrieval"
  public static let excerptRetrievalAlgorithmVersion = "local-landmark-excerpt-prototype-v2"
  public static let excerptFingerprintVersion = "local-landmark-spectral-sequence-v2"

  public let descriptor: AudioMatcherDescriptor
  public let minimumCoverage: Double
  public let minimumAlignedFrames: Int
  public let excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration?

  private let digestProgressHook: @Sendable (URL, Int64) throws -> Void
  private let prePCMBufferAllocationHook: @Sendable (URL) throws -> Void
  private let postFingerprintHook: @Sendable (URL) throws -> Void

  public init(
    minimumCoverage: Double = 0.55,
    minimumAlignedFrames: Int = 6,
    excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration? = nil,
    availability: AudioMatcherAvailability? = nil
  ) {
    self.init(
      minimumCoverage: minimumCoverage,
      minimumAlignedFrames: minimumAlignedFrames,
      excerptRetrievalPrototype: excerptRetrievalPrototype,
      availability: availability,
      digestProgressHook: { _, _ in },
      prePCMBufferAllocationHook: { _ in },
      postFingerprintHook: { _ in })
  }

  init(
    minimumCoverage: Double = 0.55,
    minimumAlignedFrames: Int = 6,
    excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration?,
    availability: AudioMatcherAvailability? = nil,
    digestProgressHook: @escaping @Sendable (URL, Int64) throws -> Void = { _, _ in },
    prePCMBufferAllocationHook: @escaping @Sendable (URL) throws -> Void = { _ in },
    postFingerprintHook: @escaping @Sendable (URL) throws -> Void
  ) {
    self.minimumCoverage = minimumCoverage
    self.minimumAlignedFrames = minimumAlignedFrames
    self.excerptRetrievalPrototype = excerptRetrievalPrototype
    self.digestProgressHook = digestProgressHook
    self.prePCMBufferAllocationHook = prePCMBufferAllocationHook
    self.postFingerprintHook = postFingerprintHook

    let resolvedAvailability: AudioMatcherAvailability
    if let error = excerptRetrievalPrototype?.validationError {
      resolvedAvailability = .unavailable(reason: error)
    } else if let availability {
      resolvedAvailability = availability
    } else if excerptRetrievalPrototype != nil {
      resolvedAvailability = .unavailable(
        reason:
          "Research prototype only; held-out corpus calibration and production acceptance are unavailable."
      )
    } else {
      resolvedAvailability = .available
    }
    let capabilities: Set<AudioMatchingCapability> =
      excerptRetrievalPrototype == nil
      ? [.segment, .nearIdentity]
      : [.excerptRetrieval]
    descriptor = AudioMatcherDescriptor(
      id: excerptRetrievalPrototype == nil
        ? "local-landmark" : "local-landmark-excerpt-prototype",
      displayName: excerptRetrievalPrototype == nil
        ? "Local landmark matcher"
        : "Local landmark matcher with excerpt retrieval prototype",
      algorithmVersion: excerptRetrievalPrototype == nil
        ? Self.algorithmVersion : Self.excerptRetrievalAlgorithmVersion,
      capabilities: capabilities,
      availability: resolvedAvailability)
  }

  public func match(_ request: AudioMatchRequest) async throws -> [AudioMatchObservation] {
    if let configuration = excerptRetrievalPrototype {
      return try await matchAuditedExcerptRequest(request, configuration: configuration)
    }
    return try matchLandmarks(request)
  }

  private func matchLandmarks(_ request: AudioMatchRequest) throws -> [AudioMatchObservation] {
    let query = try fingerprint(request.sourceURL, maximumFrames: nil)
    var raw: [RankedObservation] = []
    for candidate in request.candidates {
      if Task.isCancelled { throw CancellationError() }
      let target = try fingerprint(candidate.fileURL, maximumFrames: nil)
      if let match = align(query: query, target: target),
        match.coverage >= minimumCoverage,
        match.alignedFrames >= minimumAlignedFrames
      {
        raw.append(.exact(candidate, nil, match))
      }
    }
    return observations(
      from: raw,
      request: request,
      source: nil,
      query: query,
      configuration: nil)
  }

  private func matchAuditedExcerptRequest(
    _ request: AudioMatchRequest,
    configuration: LocalExcerptRetrievalPrototypeConfiguration
  ) async throws -> [AudioMatchObservation] {
    guard configuration.validationError == nil,
      !request.candidates.isEmpty,
      request.candidates.count <= configuration.maximumCandidateCount,
      let metadataByteCount = requestMetadataByteCount(request),
      let requestContainers = LocalExcerptWorkingMemoryPlanner.requestContainers(
        candidateCount: request.candidates.count,
        metadataByteCount: metadataByteCount),
      requestContainers.upperBoundBytes <= configuration.maximumWorkingMemoryBytes
    else { return [] }
    guard
      Set(request.candidates.map(\.nodeID)).count == request.candidates.count,
      Set(request.candidates.map { $0.fileURL.standardizedFileURL }).count
        == request.candidates.count
    else { return [] }
    if Task.isCancelled { throw CancellationError() }

    let sortedCandidates = request.candidates.sorted { left, right in
      if left.nodeID != right.nodeID { return left.nodeID < right.nodeID }
      return left.fileURL.standardizedFileURL.path < right.fileURL.standardizedFileURL.path
    }
    var raw: [RankedObservation] = []
    raw.reserveCapacity(sortedCandidates.count)
    let source: AuditedLandmarkFingerprint
    do {
      source = try auditedFingerprint(
        request.sourceURL,
        configuration: configuration,
        isQuery: true,
        retainedQuery: nil,
        requestContainers: requestContainers)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      return []
    }

    var requestPeak = source.workingMemoryUsage
    do {
      for candidate in sortedCandidates {
        if Task.isCancelled { throw CancellationError() }
        let targetPreflight = try preflight(candidate.fileURL, configuration: configuration)
        guard
          let candidateUsage = LocalExcerptWorkingMemoryPlanner.match(
            query: source.fingerprint,
            targetFrameCount: targetPreflight.fingerprintFrameCount,
            targetChannelCount: targetPreflight.channelCount,
            targetHopSeconds: targetPreflight.hopSeconds,
            configuration: configuration,
            requestContainers: requestContainers)
        else { return [] }
        requestPeak = requestPeak.conservativePeak(with: candidateUsage)
      }
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      return []
    }
    guard requestPeak.upperBoundBytes <= configuration.maximumWorkingMemoryBytes else { return [] }

    let prototype = LocalExcerptRetrievalPrototype(configuration: configuration)
    for candidate in sortedCandidates {
      if Task.isCancelled { throw CancellationError() }
      do {
        let target = try auditedFingerprint(
          candidate.fileURL,
          configuration: configuration,
          isQuery: false,
          retainedQuery: source.fingerprint,
          requestContainers: requestContainers)
        requestPeak = requestPeak.conservativePeak(with: target.workingMemoryUsage)
        if let match = try prototype.match(
          query: source.fingerprint,
          target: target.fingerprint,
          requestContainers: requestContainers)
        {
          raw.append(.excerpt(candidate, target.summary, match))
        }
      } catch is CancellationError {
        throw CancellationError()
      } catch {
        // A partial pool cannot establish a truthful runner-up margin.
        return []
      }
    }
    let requestLevelRaw = raw.map { $0.replacingExcerptWorkingMemoryUsage(requestPeak) }
    return observations(
      from: requestLevelRaw,
      request: request,
      source: source,
      query: source.fingerprint,
      configuration: configuration)
  }

  private func observations(
    from raw: [RankedObservation],
    request: AudioMatchRequest,
    source: AuditedLandmarkFingerprint?,
    query: LocalLandmarkFingerprint,
    configuration: LocalExcerptRetrievalPrototypeConfiguration?
  ) -> [AudioMatchObservation] {
    let ranked = raw.sorted { left, right in
      if left.score != right.score { return left.score > right.score }
      return left.nodeID < right.nodeID
    }
    return ranked.enumerated().compactMap { index, item in
      let crossFileRunnerUp =
        ranked.enumerated()
        .filter { $0.offset != index }
        .map(\.element.score)
        .max() ?? 0
      switch item {
      case .exact(let candidate, let target, let match):
        let start = max(0, Double(match.offsetFrames) * query.hopSeconds)
        let duration = Double(match.alignedFrames) * query.hopSeconds
        let capability: AudioMatchingCapability =
          match.coverage > 0.95 && abs(query.durationSeconds - match.targetDurationSeconds) < 0.15
          ? .nearIdentity : .segment
        return AudioMatchObservation(
          sourceNodeID: request.sourceNodeID,
          targetNodeID: candidate.nodeID,
          capability: capability,
          score: match.score,
          matchedCoverage: match.coverage,
          runnerUpMargin: max(0, match.score - crossFileRunnerUp),
          sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: duration),
          targetRange: AudioTimeRange(startSeconds: start, durationSeconds: duration),
          fingerprintDigest: source?.fingerprint.digest,
          targetFingerprintDigest: target?.digest,
          fingerprintVersion: source == nil ? nil : Self.excerptFingerprintVersion,
          sourceObservation: source?.observation,
          targetObservation: target?.observation,
          explanation:
            "\(match.alignedFrames) landmark frames align at a consistent time offset.",
          algorithmVersion: Self.algorithmVersion,
          materialClass: request.materialClass,
          resourceUsage: resourceUsage(
            source: source,
            target: target,
            candidateCount: request.candidates.count))
      case .excerpt(let candidate, let target, let match):
        guard let source, let configuration else { return nil }
        let runnerUpScore = max(crossFileRunnerUp, match.runnerUpScore)
        let runnerUpMargin = max(0, match.score - runnerUpScore)
        guard runnerUpMargin >= configuration.minimumRunnerUpMargin else { return nil }
        let workingMemory = match.workingMemoryUsage
        guard workingMemory.upperBoundBytes <= configuration.maximumWorkingMemoryBytes else {
          return nil
        }
        let usage = AudioMatchResourceUsage(
          sourceDurationSeconds: source.fingerprint.durationSeconds,
          targetDurationSeconds: target.durationSeconds,
          sourceFingerprintFrames: source.fingerprint.frameFeatures.count,
          targetFingerprintFrames: target.fingerprintFrameCount,
          candidateCount: request.candidates.count,
          sourceFileBytes: source.observation.bytes,
          targetFileBytes: target.observation.bytes,
          workingMemoryMeasuredBytes: workingMemory.measuredBytes,
          workingMemoryUpperBoundBytes: workingMemory.upperBoundBytes)
        return AudioMatchObservation(
          sourceNodeID: request.sourceNodeID,
          targetNodeID: candidate.nodeID,
          capability: .excerptRetrieval,
          score: match.score,
          matchedCoverage: match.matchedCoverage,
          runnerUpMargin: runnerUpMargin,
          sourceRange: match.queryRange,
          targetRange: match.targetRange,
          coveredDurationSeconds: match.queryRange.durationSeconds,
          fingerprintDigest: source.fingerprint.digest,
          targetFingerprintDigest: target.digest,
          fingerprintVersion: Self.excerptFingerprintVersion,
          sourceObservation: source.observation,
          targetObservation: target.observation,
          excerptRetrieval: match.diagnostics(
            configuration: configuration,
            runnerUpMargin: runnerUpMargin,
            sourceFingerprintFrameCount: source.fingerprint.frameFeatures.count,
            targetFingerprintFrameCount: target.fingerprintFrameCount),
          explanation:
            "Approximate local-neighbour retrieval proposed an offset; deterministic exact frame-sequence verification retained a five-to-ten-second offset-consistent excerpt for review.",
          algorithmVersion: Self.excerptRetrievalAlgorithmVersion,
          algorithmFamily: Self.excerptRetrievalAlgorithmFamily,
          materialClass: request.materialClass,
          resourceUsage: usage)
      }
    }
  }

  private func requestMetadataByteCount(_ request: AudioMatchRequest) -> Int? {
    var total = 0
    guard addMetadataBytes(request.sourceNodeID, to: &total),
      addMetadataBytes(request.sourceURL.standardizedFileURL.path, to: &total)
    else { return nil }
    for candidate in request.candidates {
      guard addMetadataBytes(candidate.nodeID, to: &total),
        addMetadataBytes(candidate.fileURL.standardizedFileURL.path, to: &total)
      else { return nil }
    }
    return total
  }

  private func addMetadataBytes(_ value: String, to total: inout Int) -> Bool {
    let result = total.addingReportingOverflow(value.utf8.count)
    guard !result.overflow else { return false }
    total = result.partialValue
    return true
  }

  private func auditedFingerprint(
    _ url: URL,
    configuration: LocalExcerptRetrievalPrototypeConfiguration,
    isQuery: Bool,
    retainedQuery: LocalLandmarkFingerprint?,
    requestContainers: LocalExcerptWorkingMemoryUsage
  ) throws -> AuditedLandmarkFingerprint {
    let preflight = try preflight(url, configuration: configuration)
    if isQuery {
      guard preflight.durationSeconds >= configuration.minimumQueryDurationSeconds,
        preflight.durationSeconds <= configuration.maximumQueryDurationSeconds
      else { throw AudioMatchFileObservationError.outsideByteBound(url) }
    }
    let admissionUsage: LocalExcerptWorkingMemoryUsage
    if let retainedQuery {
      guard
        let usage = LocalExcerptWorkingMemoryPlanner.match(
          query: retainedQuery,
          targetFrameCount: preflight.fingerprintFrameCount,
          targetChannelCount: preflight.channelCount,
          targetHopSeconds: preflight.hopSeconds,
          configuration: configuration,
          requestContainers: requestContainers)
      else { throw AudioMatchFileObservationError.outsideByteBound(url) }
      admissionUsage = usage
    } else {
      guard
        let usage = LocalExcerptWorkingMemoryPlanner.addingRequestContainers(
          to: preflight.workingMemoryUsage,
          requestContainers: requestContainers)
      else { throw AudioMatchFileObservationError.outsideByteBound(url) }
      admissionUsage = usage
    }
    guard admissionUsage.upperBoundBytes <= configuration.maximumWorkingMemoryBytes else {
      throw AudioMatchFileObservationError.outsideByteBound(url)
    }
    let before = try AudioMatchSourceObservation.captureBounded(
      fileURL: url,
      maximumBytes: configuration.maximumFileBytes,
      progress: { digestURL, bytesRead in
        if Task.isCancelled { throw CancellationError() }
        try digestProgressHook(digestURL, bytesRead)
      })
    if Task.isCancelled { throw CancellationError() }
    let fingerprint = try fingerprint(
      url,
      maximumFrames: configuration.maximumFingerprintFrames,
      maximumChannelCount: configuration.maximumChannelCount,
      expectedPreflight: preflight)
    guard fingerprint.frameFeatures.count == preflight.fingerprintFrameCount,
      fingerprint.channelCount == preflight.channelCount
    else {
      throw AudioMatchFileObservationError.changedDuringObservation(url)
    }
    try postFingerprintHook(url)
    let after = try AudioMatchSourceObservation.captureBounded(
      fileURL: url,
      maximumBytes: configuration.maximumFileBytes,
      progress: { digestURL, bytesRead in
        if Task.isCancelled { throw CancellationError() }
        try digestProgressHook(digestURL, bytesRead)
      })
    guard before == after else {
      throw AudioMatchFileObservationError.changedDuringObservation(url)
    }
    return AuditedLandmarkFingerprint(
      fingerprint: fingerprint,
      observation: after,
      workingMemoryUsage: admissionUsage)
  }

  private func preflight(
    _ url: URL,
    configuration: LocalExcerptRetrievalPrototypeConfiguration
  ) throws -> LandmarkPreflight {
    let file = try AVAudioFile(
      forReading: url,
      commonFormat: .pcmFormatFloat32,
      interleaved: false)
    let sampleRate = file.processingFormat.sampleRate
    let rawChannelCount = Int(file.processingFormat.channelCount)
    guard sampleRate.isFinite, (1_000...768_000).contains(sampleRate),
      rawChannelCount > 0,
      rawChannelCount <= configuration.maximumChannelCount,
      file.length >= 0
    else {
      throw LocalLandmarkMatcherError.unreadable(url, "invalid duration metadata")
    }
    let channelCount = min(rawChannelCount, configuration.maximumChannelCount)
    let duration = Double(file.length) / sampleRate
    guard duration.isFinite,
      duration > 0,
      duration <= configuration.maximumFileDurationSeconds
    else { throw AudioMatchFileObservationError.outsideByteBound(url) }
    let frameSize = AVAudioFramePosition(Self.frameSize)
    let hopSize = AVAudioFramePosition(Self.hopSize)
    let fingerprintFrames: AVAudioFramePosition =
      file.length >= frameSize ? ((file.length - frameSize) / hopSize) + 1 : 0
    guard fingerprintFrames > 0,
      fingerprintFrames <= AVAudioFramePosition(configuration.maximumFingerprintFrames)
    else { throw AudioMatchFileObservationError.outsideByteBound(url) }
    let fingerprintFrameCount = Int(fingerprintFrames)
    guard
      let workingMemoryUsage = LocalExcerptWorkingMemoryPlanner.fingerprint(
        frameCount: fingerprintFrameCount,
        channelCount: channelCount),
      workingMemoryUsage.upperBoundBytes <= configuration.maximumWorkingMemoryBytes
    else {
      throw AudioMatchFileObservationError.outsideByteBound(url)
    }
    return LandmarkPreflight(
      durationSeconds: duration,
      fingerprintFrameCount: fingerprintFrameCount,
      channelCount: channelCount,
      hopSeconds: Double(Self.hopSize) / sampleRate,
      workingMemoryUsage: workingMemoryUsage)
  }

  private static let frameSize = 4_096
  private static let hopSize = 2_048

  private func fingerprint(
    _ url: URL,
    maximumFrames: Int?,
    maximumChannelCount: Int? = nil,
    expectedPreflight: LandmarkPreflight? = nil
  ) throws -> LocalLandmarkFingerprint {
    let audioFile: AVAudioFile
    do {
      audioFile = try AVAudioFile(
        forReading: url,
        commonFormat: .pcmFormatFloat32,
        interleaved: false)
    } catch {
      throw LocalLandmarkMatcherError.unreadable(url, error.localizedDescription)
    }
    let format = audioFile.processingFormat
    let channelCount = Int(format.channelCount)
    guard channelCount > 0,
      maximumChannelCount.map({ channelCount <= $0 }) ?? true
    else { throw AudioMatchFileObservationError.outsideByteBound(url) }
    let frameSize = AVAudioFramePosition(Self.frameSize)
    let hopSize = AVAudioFramePosition(Self.hopSize)
    let fingerprintFrames: AVAudioFramePosition =
      audioFile.length >= frameSize ? ((audioFile.length - frameSize) / hopSize) + 1 : 0
    guard fingerprintFrames > 0,
      fingerprintFrames <= AVAudioFramePosition(maximumFrames ?? Int.max),
      let frameCount = Int(exactly: fingerprintFrames),
      let workingMemoryUsage = LocalExcerptWorkingMemoryPlanner.fingerprint(
        frameCount: frameCount,
        channelCount: channelCount)
    else { throw AudioMatchFileObservationError.outsideByteBound(url) }
    if let expectedPreflight {
      guard expectedPreflight.fingerprintFrameCount == frameCount,
        expectedPreflight.channelCount == channelCount,
        expectedPreflight.workingMemoryUsage == workingMemoryUsage
      else { throw AudioMatchFileObservationError.changedDuringObservation(url) }
    }
    guard
      let setup = vDSP_DFT_zop_CreateSetup(
        nil,
        vDSP_Length(Self.frameSize),
        vDSP_DFT_Direction.FORWARD)
    else { throw LocalLandmarkMatcherError.unreadable(url, "FFT setup failed") }
    defer { vDSP_DFT_DestroySetup(setup) }
    try prePCMBufferAllocationHook(url)
    guard
      let buffer = AVAudioPCMBuffer(
        pcmFormat: format,
        frameCapacity: AVAudioFrameCount(Self.frameSize))
    else { throw LocalLandmarkMatcherError.unreadable(url, "buffer allocation failed") }

    var tokens: [UInt64] = []
    var frameFeatures: [[Float]] = []
    tokens.reserveCapacity(frameCount)
    frameFeatures.reserveCapacity(frameCount)
    var input = [Float](repeating: 0, count: Self.frameSize)
    let imaginary = [Float](repeating: 0, count: Self.frameSize)
    var realOut = [Float](repeating: 0, count: Self.frameSize)
    var imaginaryOut = [Float](repeating: 0, count: Self.frameSize)
    var bands = [Float](repeating: 0, count: LocalExcerptWorkingMemoryPlanner.bandCount)
    var position: AVAudioFramePosition = 0
    while position + AVAudioFramePosition(Self.frameSize) <= audioFile.length {
      if Task.isCancelled { throw CancellationError() }
      if let maximumFrames, tokens.count >= maximumFrames {
        throw AudioMatchFileObservationError.outsideByteBound(url)
      }
      audioFile.framePosition = position
      try audioFile.read(into: buffer, frameCount: AVAudioFrameCount(Self.frameSize))
      guard buffer.frameLength == AVAudioFrameCount(Self.frameSize),
        let channels = buffer.floatChannelData
      else { break }
      input.withUnsafeMutableBufferPointer { $0.initialize(repeating: 0) }
      for channel in 0..<channelCount {
        for frame in 0..<Self.frameSize { input[frame] += channels[channel][frame] }
      }
      let divisor = Float(channelCount)
      for frame in 0..<Self.frameSize {
        let window =
          0.5 - 0.5 * cos(2 * Float.pi * Float(frame) / Float(Self.frameSize - 1))
        input[frame] = input[frame] / divisor * window
      }
      vDSP_DFT_Execute(setup, input, imaginary, &realOut, &imaginaryOut)
      bands.withUnsafeMutableBufferPointer { $0.initialize(repeating: 0) }
      let nyquist = format.sampleRate / 2
      for index in 2..<(Self.frameSize / 2) {
        let frequency = Double(index) * format.sampleRate / Double(Self.frameSize)
        guard frequency >= 45, frequency <= min(16_000, nyquist) else { continue }
        let fraction = log(frequency / 45) / log(min(16_000, nyquist) / 45)
        let band = min(95, max(0, Int(fraction * 96)))
        bands[band] += realOut[index] * realOut[index] + imaginaryOut[index] * imaginaryOut[index]
      }
      let peaks = bands.indices.sorted { bands[$0] > bands[$1] }.prefix(4).sorted()
      let energy = peaks.reduce(Float(0)) { $0 + bands[$1] }
      if energy <= 1e-8 {
        tokens.append(0)
        frameFeatures.append([Float](repeating: 0, count: 24))
      } else {
        var token: UInt64 = 1
        for peak in peaks { token = token &* 131 &+ UInt64(peak + 1) }
        tokens.append(token)
        frameFeatures.append(featureVector(from: bands))
      }
      position += AVAudioFramePosition(Self.hopSize)
    }
    guard !tokens.isEmpty else { throw LocalLandmarkMatcherError.empty(url) }
    return LocalLandmarkFingerprint(
      tokens: tokens,
      frameFeatures: frameFeatures,
      hopSeconds: Double(Self.hopSize) / format.sampleRate,
      durationSeconds: Double(audioFile.length) / format.sampleRate,
      digest: fingerprintDigest(tokens: tokens, frameFeatures: frameFeatures),
      channelCount: channelCount,
      workingMemoryMeasuredBytes: workingMemoryUsage.measuredBytes,
      workingMemoryUpperBoundBytes: workingMemoryUsage.upperBoundBytes)
  }

  private func align(
    query: LocalLandmarkFingerprint,
    target: LocalLandmarkFingerprint
  ) -> LocalLandmarkExactMatch? {
    var targetPositions: [UInt64: [Int]] = [:]
    for (index, token) in target.tokens.enumerated() where token != 0 {
      targetPositions[token, default: []].append(index)
    }
    var offsets: [Int: Set<Int>] = [:]
    for (queryIndex, token) in query.tokens.enumerated() where token != 0 {
      for targetIndex in targetPositions[token, default: []] {
        offsets[targetIndex - queryIndex, default: []].insert(queryIndex)
      }
    }
    guard
      let best = offsets.sorted(by: { left, right in
        if left.value.count != right.value.count { return left.value.count > right.value.count }
        return left.key < right.key
      }).first
    else { return nil }
    let nonSilentCount = max(1, query.tokens.count(where: { $0 != 0 }))
    let coverage = Double(best.value.count) / Double(nonSilentCount)
    return LocalLandmarkExactMatch(
      offsetFrames: best.key,
      alignedFrames: best.value.count,
      coverage: coverage,
      score: coverage,
      targetDurationSeconds: target.durationSeconds)
  }

  private func featureVector(from bands: [Float]) -> [Float] {
    var compact = [Float](repeating: 0, count: 24)
    for band in 0..<24 {
      let start = band * 4
      compact[band] = log1p(bands[start..<(start + 4)].reduce(0, +))
    }
    let norm = sqrt(compact.reduce(Float(0)) { $0 + $1 * $1 })
    guard norm > 1e-6 else { return compact }
    return compact.map { $0 / norm }
  }

  private func fingerprintDigest(
    tokens: [UInt64],
    frameFeatures: [[Float]]
  ) -> String {
    var hasher = SHA256()
    for token in tokens {
      var value = token.bigEndian
      hasher.update(data: Data(bytes: &value, count: MemoryLayout<UInt64>.size))
    }
    for frame in frameFeatures {
      for feature in frame {
        var value = feature.bitPattern.bigEndian
        hasher.update(data: Data(bytes: &value, count: MemoryLayout<UInt32>.size))
      }
    }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
  }

  private func resourceUsage(
    source: AuditedLandmarkFingerprint?,
    target: AuditedLandmarkSummary?,
    candidateCount: Int
  ) -> AudioMatchResourceUsage? {
    guard let source, let target else { return nil }
    return AudioMatchResourceUsage(
      sourceDurationSeconds: source.fingerprint.durationSeconds,
      targetDurationSeconds: target.durationSeconds,
      sourceFingerprintFrames: source.fingerprint.frameFeatures.count,
      targetFingerprintFrames: target.fingerprintFrameCount,
      candidateCount: candidateCount,
      sourceFileBytes: source.observation.bytes,
      targetFileBytes: target.observation.bytes,
      workingMemoryMeasuredBytes: target.workingMemoryUsage.measuredBytes,
      workingMemoryUpperBoundBytes:
        target.workingMemoryUsage.upperBoundBytes)
  }
}

struct LocalLandmarkFingerprint {
  let tokens: [UInt64]
  let frameFeatures: [[Float]]
  let hopSeconds: Double
  let durationSeconds: Double
  let digest: String
  let channelCount: Int
  let workingMemoryMeasuredBytes: Int64
  let workingMemoryUpperBoundBytes: Int64
}

private struct LandmarkPreflight {
  let durationSeconds: Double
  let fingerprintFrameCount: Int
  let channelCount: Int
  let hopSeconds: Double
  let workingMemoryUsage: LocalExcerptWorkingMemoryUsage
}

private struct AuditedLandmarkFingerprint {
  let fingerprint: LocalLandmarkFingerprint
  let observation: AudioMatchSourceObservation
  let workingMemoryUsage: LocalExcerptWorkingMemoryUsage

  var summary: AuditedLandmarkSummary {
    AuditedLandmarkSummary(
      digest: fingerprint.digest,
      durationSeconds: fingerprint.durationSeconds,
      fingerprintFrameCount: fingerprint.frameFeatures.count,
      observation: observation,
      workingMemoryUsage: workingMemoryUsage)
  }
}

private struct AuditedLandmarkSummary {
  let digest: String
  let durationSeconds: Double
  let fingerprintFrameCount: Int
  let observation: AudioMatchSourceObservation
  let workingMemoryUsage: LocalExcerptWorkingMemoryUsage
}

private enum RankedObservation {
  case exact(AudioMatchCandidate, AuditedLandmarkSummary?, LocalLandmarkExactMatch)
  case excerpt(AudioMatchCandidate, AuditedLandmarkSummary, LocalExcerptRetrievalMatch)

  var score: Double {
    switch self {
    case .exact(_, _, let match): match.score
    case .excerpt(_, _, let match): match.score
    }
  }

  var nodeID: String {
    switch self {
    case .exact(let candidate, _, _): candidate.nodeID
    case .excerpt(let candidate, _, _): candidate.nodeID
    }
  }

  func replacingExcerptWorkingMemoryUsage(
    _ usage: LocalExcerptWorkingMemoryUsage
  ) -> RankedObservation {
    switch self {
    case .exact:
      return self
    case .excerpt(let candidate, let summary, let match):
      return .excerpt(candidate, summary, match.replacingWorkingMemoryUsage(usage))
    }
  }
}

struct LocalLandmarkExactMatch {
  let offsetFrames: Int
  let alignedFrames: Int
  let coverage: Double
  let score: Double
  let targetDurationSeconds: Double
}
