import AVFoundation
import Foundation
import Testing

@testable import StudioCore

@Suite("Local landmark audio matching")
struct LocalLandmarkAudioMatcherTests {
  @Test("Finds a query excerpt inside a longer audio file with its time range")
  func findsExcerpt() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 5)
    try writeSignal(to: target, silencePrefix: 2, signalDuration: 5)
    let engine = LocalLandmarkAudioMatcher()

    let observations = try await engine.match(
      AudioMatchRequest(
        sourceNodeID: "query", sourceURL: query,
        candidates: [AudioMatchCandidate(nodeID: "target", fileURL: target)]))
    let match = try #require(observations.first)

    #expect(match.capability == .segment)
    #expect(match.matchedCoverage > 0.8)
    #expect(abs((match.targetRange?.startSeconds ?? 0) - 2) < 0.4)
    #expect(match.sourceRange?.durationSeconds ?? 0 > 4)
  }

  @Test("Does not emit a match for unrelated audio")
  func rejectsUnrelated() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 4, frequencyOffset: 0)
    try writeSignal(to: target, silencePrefix: 0, signalDuration: 4, frequencyOffset: 1_200)

    let observations = try await LocalLandmarkAudioMatcher().match(
      AudioMatchRequest(
        sourceNodeID: "query", sourceURL: query,
        candidates: [AudioMatchCandidate(nodeID: "target", fileURL: target)]))

    #expect(observations.isEmpty)
  }

  @Test("Abstains when two candidates are equally strong")
  func ambiguousCandidatesHaveNoMargin() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let first = root.appending(path: "first.wav")
    let second = root.appending(path: "second.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 4)
    try FileManager.default.copyItem(at: query, to: first)
    try FileManager.default.copyItem(at: query, to: second)

    let observations = try await LocalLandmarkAudioMatcher().match(
      AudioMatchRequest(
        sourceNodeID: "query", sourceURL: query,
        candidates: [
          AudioMatchCandidate(nodeID: "first", fileURL: first),
          AudioMatchCandidate(nodeID: "second", fileURL: second),
        ]))

    #expect(observations.count == 2)
    #expect(observations.allSatisfy { $0.runnerUpMargin == 0 })
    #expect(observations.allSatisfy { AudioMatchProposalBuilder().edge(from: $0) == nil })
  }

  @Test(
    "Prototype excerpt retrieval returns candidate ranges and diagnostics for distorted excerpts")
  func prototypeFindsDistortedExcerpt() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
    try writeSignal(
      to: target,
      silencePrefix: 2,
      signalDuration: 6,
      variant: .distortedExcerpt)

    let engine = LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration())
    let observations = try await engine.match(
      AudioMatchRequest(
        sourceNodeID: "query",
        sourceURL: query,
        candidates: [AudioMatchCandidate(nodeID: "target", fileURL: target)]))
    #expect(observations.count == 1)
    let match = try #require(observations.first)
    let diagnostics = try #require(match.excerptRetrieval)

    #expect(match.capability == .excerptRetrieval)
    #expect(match.score > 0.7)
    #expect(match.matchedCoverage > 0.5)
    #expect(abs((match.targetRange?.startSeconds ?? 0) - 2) < 0.5)
    #expect(match.sourceRange?.durationSeconds ?? 0 >= 5)
    #expect(diagnostics.offsetConsistency > 0.85)
    #expect(diagnostics.matchedWindowCount >= 8)
    #expect(diagnostics.totalQueryWindowCount >= 10)
    #expect(diagnostics.scoreDistribution.mean > diagnostics.scoreDistribution.minimum)
    #expect(diagnostics.exactSequenceVerified)
    #expect(diagnostics.windowDurationSeconds != diagnostics.requestedWindowDurationSeconds)
    #expect(diagnostics.hopDurationSeconds != diagnostics.requestedHopDurationSeconds)
    #expect(diagnostics.queryRange == match.sourceRange)
    #expect(diagnostics.referenceRange == match.targetRange)
    #expect(diagnostics.runnerUpMargin == match.runnerUpMargin)
    #expect(diagnostics.approximateCandidateVisitCount > 0)
    #expect(diagnostics.exactSequenceComparisonCount >= diagnostics.matchedWindowCount)
    #expect(match.sourceObservation != nil)
    #expect(match.targetObservation != nil)
    #expect(match.resourceUsage != nil)
    let edge = try #require(AudioMatchProposalBuilder().edge(from: match))
    #expect(edge.evidence.first?.kind == .excerptSequenceAlignment)
    #expect(edge.confidence == .suggested)
    #expect(AudioLineageAutomationPolicy().allowedActions(for: edge) == [.queueForReview])
  }

  @Test("Prototype excerpt retrieval abstains on unrelated audio")
  func prototypeRejectsUnrelated() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
    try writeSignal(
      to: target,
      silencePrefix: 1.5,
      signalDuration: 6,
      frequencyOffset: 1_300,
      variant: .alternateTexture)

    let observations = try await LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration()
    ).match(
      AudioMatchRequest(
        sourceNodeID: "query",
        sourceURL: query,
        candidates: [AudioMatchCandidate(nodeID: "target", fileURL: target)]))

    #expect(observations.isEmpty)
  }

  @Test("Excerpt prototype is unavailable by default")
  func prototypeIsUnavailableByDefault() {
    let descriptor = LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration()
    ).descriptor

    guard case .unavailable = descriptor.availability else {
      Issue.record("The research prototype must not be available by default.")
      return
    }
  }

  @Test("Prototype abstains below five seconds")
  func prototypeRejectsShortExcerpt() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "short.wav")
    let target = root.appending(path: "target.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 4.9)
    try writeSignal(to: target, silencePrefix: 2, signalDuration: 4.9)

    #expect(try await excerptMatcher().match(request(query, candidates: [target])).isEmpty)
  }

  @Test("Repeated excerpts inside one file are ambiguous")
  func prototypeRejectsRepeatedInternalExcerpt() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "repeated.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
    try writeRepeatedSignal(
      to: target,
      starts: [1, 9],
      signalDuration: 6,
      variant: .distortedExcerpt)

    #expect(try await excerptMatcher().match(request(query, candidates: [target])).isEmpty)
  }

  @Test("Equal excerpt candidates abstain instead of selecting by insertion order")
  func prototypeRejectsEqualCandidates() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let first = root.appending(path: "first.wav")
    let second = root.appending(path: "second.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
    try writeSignal(
      to: first,
      silencePrefix: 2,
      signalDuration: 6,
      variant: .distortedExcerpt)
    try FileManager.default.copyItem(at: first, to: second)

    #expect(
      try await excerptMatcher().match(request(query, candidates: [first, second])).isEmpty)
  }

  @Test("Candidate insertion order does not change an unambiguous result")
  func prototypeIsDeterministicAcrossCandidateOrder() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let good = root.appending(path: "good.wav")
    let unrelated = root.appending(path: "unrelated.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
    try writeSignal(
      to: good,
      silencePrefix: 2,
      signalDuration: 6,
      variant: .distortedExcerpt)
    try writeSignal(
      to: unrelated,
      silencePrefix: 1,
      signalDuration: 6,
      frequencyOffset: 1_400,
      variant: .alternateTexture)
    let matcher = excerptMatcher()

    let forward = try await matcher.match(request(query, candidates: [good, unrelated]))
    let reversed = try await matcher.match(request(query, candidates: [unrelated, good]))

    #expect(forward == reversed)
    #expect(forward.count == 1)
  }

  @Test("Invalid and non-finite configurations fail closed")
  func invalidConfigurationsFailClosed() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
    try writeSignal(to: target, silencePrefix: 2, signalDuration: 6)
    let configurations = [
      LocalExcerptRetrievalPrototypeConfiguration(windowDurationSeconds: .nan),
      LocalExcerptRetrievalPrototypeConfiguration(hopDurationSeconds: .infinity),
      LocalExcerptRetrievalPrototypeConfiguration(minimumAverageWindowScore: -0.1),
      LocalExcerptRetrievalPrototypeConfiguration(minimumAverageWindowScore: 0.64),
      LocalExcerptRetrievalPrototypeConfiguration(minimumRunnerUpMargin: 0.04),
      LocalExcerptRetrievalPrototypeConfiguration(minimumQueryDurationSeconds: 4.9),
      LocalExcerptRetrievalPrototypeConfiguration(maximumChannelCount: 0),
      LocalExcerptRetrievalPrototypeConfiguration(
        maximumChannelCount:
          LocalExcerptRetrievalPrototypeConfiguration.hardMaximumChannelCount + 1),
    ]

    for configuration in configurations {
      #expect(configuration.validationError != nil)
      let matcher = LocalLandmarkAudioMatcher(
        minimumCoverage: 1.01,
        excerptRetrievalPrototype: configuration,
        availability: .available)
      #expect(try await matcher.match(request(query, candidates: [target])).isEmpty)
    }
  }

  @Test("Resource ceilings abstain before unbounded fingerprint work")
  func resourceCeilingsFailClosed() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    let other = root.appending(path: "other.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
    try writeSignal(to: target, silencePrefix: 2, signalDuration: 6)
    try writeSignal(to: other, silencePrefix: 1, signalDuration: 6)

    let bounded = [
      LocalExcerptRetrievalPrototypeConfiguration(maximumFileBytes: 128),
      LocalExcerptRetrievalPrototypeConfiguration(maximumFileDurationSeconds: 5),
      LocalExcerptRetrievalPrototypeConfiguration(maximumFingerprintFrames: 4),
      LocalExcerptRetrievalPrototypeConfiguration(maximumWorkingMemoryBytes: 1_024),
    ]
    for configuration in bounded {
      let matcher = LocalLandmarkAudioMatcher(
        minimumCoverage: 1.01,
        excerptRetrievalPrototype: configuration,
        availability: .available)
      #expect(try await matcher.match(request(query, candidates: [target])).isEmpty)
    }
    let oneCandidateOnly = LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(
        maximumCandidateCount: 1),
      availability: .available)
    #expect(
      try await oneCandidateOnly.match(
        request(query, candidates: [target, other])
      ).isEmpty)
  }

  @Test("High-channel audio abstains before fingerprint buffer allocation")
  func highChannelAudioFailsClosed() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "high-channel.caf")
    let target = root.appending(path: "target.wav")
    try writeMultichannelSignal(
      to: query,
      channelCount: LocalExcerptRetrievalPrototypeConfiguration.hardMaximumChannelCount + 1,
      duration: 6)
    try writeSignal(to: target, silencePrefix: 1, signalDuration: 6)
    let fingerprintGate = LockedExcerptMutationGate()
    let matcher = LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(),
      availability: .available,
      prePCMBufferAllocationHook: { _ in _ = fingerprintGate.claim() },
      postFingerprintHook: { _ in })

    let observations = try await matcher.match(request(query, candidates: [target]))

    #expect(observations.isEmpty)
    #expect(!fingerprintGate.isClaimed)

    let validAllocationGate = LockedExcerptMutationGate()
    let validMatcher = LocalLandmarkAudioMatcher(
      excerptRetrievalPrototype: nil,
      availability: .available,
      prePCMBufferAllocationHook: { _ in _ = validAllocationGate.claim() },
      postFingerprintHook: { _ in })
    _ = try await validMatcher.match(request(target, candidates: [target]))
    #expect(validAllocationGate.isClaimed)
  }

  @Test("Request memory retains the largest candidate peak independent of order")
  func requestMemoryTracksLargerLosingCandidate() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let winner = root.appending(path: "small-winner.wav")
    let largerLoser = root.appending(path: "larger-unrelated.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
    try writeSignal(
      to: winner,
      silencePrefix: 2,
      signalDuration: 6,
      variant: .distortedExcerpt)
    try writeSignal(
      to: largerLoser,
      silencePrefix: 3,
      signalDuration: 15,
      frequencyOffset: 1_700,
      variant: .alternateTexture)

    let matcher = excerptMatcher()
    let winnerOnly = try #require(
      try await matcher.match(request(query, candidates: [winner])).first)
    let forward = try #require(
      try await matcher.match(request(query, candidates: [winner, largerLoser])).first)
    let reversed = try #require(
      try await matcher.match(request(query, candidates: [largerLoser, winner])).first)
    let winnerOnlyUsage = try #require(winnerOnly.resourceUsage)
    let forwardUsage = try #require(forward.resourceUsage)
    let reversedUsage = try #require(reversed.resourceUsage)

    #expect(forward.targetNodeID == "small-winner")
    #expect(reversed.targetNodeID == "small-winner")
    #expect(
      forwardUsage.workingMemoryUpperBoundBytes
        > winnerOnlyUsage.workingMemoryUpperBoundBytes)
    #expect(
      forwardUsage.workingMemoryMeasuredBytes
        > winnerOnlyUsage.workingMemoryMeasuredBytes)
    #expect(forwardUsage.workingMemoryUpperBoundBytes == reversedUsage.workingMemoryUpperBoundBytes)
    #expect(forwardUsage.workingMemoryMeasuredBytes == reversedUsage.workingMemoryMeasuredBytes)
    #expect(
      forward.excerptRetrieval?.workingMemoryUpperBoundBytes
        == forwardUsage.workingMemoryUpperBoundBytes)

    let exactBoundary = forwardUsage.workingMemoryUpperBoundBytes
    let atLimit = LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(
        maximumWorkingMemoryBytes: exactBoundary),
      availability: .available)
    let atLimitForward = try await atLimit.match(
      request(query, candidates: [winner, largerLoser]))
    let atLimitReversed = try await atLimit.match(
      request(query, candidates: [largerLoser, winner]))
    #expect(atLimitForward.count == 1)
    #expect(atLimitReversed.count == 1)
    #expect(
      atLimitForward.first?.resourceUsage?.workingMemoryUpperBoundBytes == exactBoundary)
    #expect(
      atLimitReversed.first?.resourceUsage?.workingMemoryUpperBoundBytes == exactBoundary)

    let overLimit = LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(
        maximumWorkingMemoryBytes: exactBoundary - 1),
      availability: .available)
    #expect(
      try await overLimit.match(
        request(query, candidates: [winner, largerLoser])
      ).isEmpty)
    #expect(
      try await overLimit.match(
        request(query, candidates: [largerLoser, winner])
      ).isEmpty)
  }

  @Test("Request memory planner arithmetic overflow fails closed")
  func requestMemoryPlannerOverflowFailsClosed() {
    let oneCandidate = LocalExcerptWorkingMemoryPlanner.requestContainers(
      candidateCount: 1,
      metadataByteCount: 128)
    let twoCandidates = LocalExcerptWorkingMemoryPlanner.requestContainers(
      candidateCount: 2,
      metadataByteCount: 128)
    #expect(
      (twoCandidates?.upperBoundBytes ?? 0)
        > (oneCandidate?.upperBoundBytes ?? 0))
    #expect(
      LocalExcerptWorkingMemoryPlanner.requestContainers(
        candidateCount: .max,
        metadataByteCount: 1) == nil)
    #expect(
      LocalExcerptWorkingMemoryPlanner.requestContainers(
        candidateCount: 1,
        metadataByteCount: .max) == nil)
    #expect(
      LocalExcerptWorkingMemoryPlanner.addingRequestContainers(
        to: LocalExcerptWorkingMemoryUsage(measuredBytes: .max, upperBoundBytes: .max),
        requestContainers: LocalExcerptWorkingMemoryUsage(
          measuredBytes: 1,
          upperBoundBytes: 1)) == nil)
  }

  @Test("Reported working-memory upper bound is an exact admission boundary")
  func workingMemoryAdmissionBoundaryIsTruthful() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
    try writeSignal(
      to: target,
      silencePrefix: 2,
      signalDuration: 6,
      variant: .distortedExcerpt)

    let baseline = try #require(
      try await excerptMatcher().match(request(query, candidates: [target])).first)
    let diagnostics = try #require(baseline.excerptRetrieval)
    let usage = try #require(baseline.resourceUsage)
    let upperBound = diagnostics.workingMemoryUpperBoundBytes

    #expect(diagnostics.workingMemoryMeasuredBytes > 0)
    #expect(diagnostics.workingMemoryMeasuredBytes <= upperBound)
    #expect(usage.workingMemoryMeasuredBytes == diagnostics.workingMemoryMeasuredBytes)
    #expect(usage.workingMemoryUpperBoundBytes == upperBound)

    let atLimit = LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(
        maximumWorkingMemoryBytes: upperBound),
      availability: .available)
    #expect(
      try await atLimit.match(request(query, candidates: [target])).count == 1)

    let overLimit = LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(
        maximumWorkingMemoryBytes: upperBound - 1),
      availability: .available)
    #expect(
      try await overLimit.match(request(query, candidates: [target])).isEmpty)
  }

  @Test("Source and target mutation invalidate immutable excerpt evidence")
  func mutationInvalidatesExcerpt() async throws {
    for mutateSource in [true, false] {
      let root = try TestSupport.temporaryDirectory()
      defer { try? FileManager.default.removeItem(at: root) }
      let query = root.appending(path: "query.wav")
      let target = root.appending(path: "target.wav")
      try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
      try writeSignal(
        to: target,
        silencePrefix: 2,
        signalDuration: 6,
        variant: .distortedExcerpt)
      let mutationURL = mutateSource ? query : target
      let gate = LockedExcerptMutationGate()
      let matcher = LocalLandmarkAudioMatcher(
        minimumCoverage: 1.01,
        excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(),
        availability: .available,
        digestProgressHook: { url, bytesRead in
          guard url.standardizedFileURL == mutationURL.standardizedFileURL,
            bytesRead > 0,
            gate.claim()
          else { return }
          let handle = try FileHandle(forWritingTo: mutationURL)
          defer { try? handle.close() }
          try handle.seek(toOffset: UInt64(bytesRead + 128))
          try handle.write(contentsOf: Data(repeating: 0xa5, count: 64))
          try handle.synchronize()
        },
        postFingerprintHook: { _ in })

      #expect(try await matcher.match(request(query, candidates: [target])).isEmpty)
    }
  }

  @Test("Source and target replacement invalidate immutable excerpt evidence")
  func replacementInvalidatesExcerpt() async throws {
    for replaceSource in [true, false] {
      let root = try TestSupport.temporaryDirectory()
      defer { try? FileManager.default.removeItem(at: root) }
      let query = root.appending(path: "query.wav")
      let target = root.appending(path: "target.wav")
      try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
      try writeSignal(
        to: target,
        silencePrefix: 2,
        signalDuration: 6,
        variant: .distortedExcerpt)
      let replacementURL = replaceSource ? query : target
      let gate = LockedExcerptMutationGate()
      let matcher = LocalLandmarkAudioMatcher(
        minimumCoverage: 1.01,
        excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(),
        availability: .available,
        postFingerprintHook: { url in
          guard url.standardizedFileURL == replacementURL.standardizedFileURL,
            gate.claim()
          else { return }
          try TestSupport.replaceWithGeneratedAudio(
            at: replacementURL,
            signalDuration: 6,
            transform: .unrelated)
        })

      #expect(try await matcher.match(request(query, candidates: [target])).isEmpty)
    }
  }

  @Test("Cancellation interrupts bounded fingerprinting")
  func cancellationInterruptsFingerprinting() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try writeSignal(to: query, silencePrefix: 0, signalDuration: 6)
    try writeSignal(to: target, silencePrefix: 2, signalDuration: 6)
    let task = Task {
      try await excerptMatcher().match(request(query, candidates: [target]))
    }
    task.cancel()

    do {
      _ = try await task.value
      Issue.record("Cancelled excerpt retrieval must throw CancellationError.")
    } catch is CancellationError {}
  }

  private func excerptMatcher() -> LocalLandmarkAudioMatcher {
    LocalLandmarkAudioMatcher(
      minimumCoverage: 1.01,
      excerptRetrievalPrototype: LocalExcerptRetrievalPrototypeConfiguration(),
      availability: .available)
  }

  private func request(_ query: URL, candidates: [URL]) -> AudioMatchRequest {
    AudioMatchRequest(
      sourceNodeID: "query",
      sourceURL: query,
      candidates: candidates.map {
        AudioMatchCandidate(nodeID: $0.deletingPathExtension().lastPathComponent, fileURL: $0)
      })
  }

  private func writeSignal(
    to url: URL,
    silencePrefix: Double,
    signalDuration: Double,
    frequencyOffset: Double = 0,
    variant: SignalVariant = .clean
  ) throws {
    try writeRepeatedSignal(
      to: url,
      starts: [silencePrefix],
      signalDuration: signalDuration,
      frequencyOffset: frequencyOffset,
      variant: variant)
  }

  private func writeRepeatedSignal(
    to url: URL,
    starts: [Double],
    signalDuration: Double,
    frequencyOffset: Double = 0,
    variant: SignalVariant = .clean
  ) throws {
    let sampleRate = 44_100.0
    let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
    let totalDuration = (starts.max() ?? 0) + signalDuration
    let total = AVAudioFrameCount(totalDuration * sampleRate)
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: total)!
    buffer.frameLength = total
    let samples = buffer.floatChannelData![0]
    for start in starts.sorted() {
      let prefixFrames = Int(start * sampleRate)
      let endFrame = min(Int(total), prefixFrames + Int(signalDuration * sampleRate))
      for frame in prefixFrames..<endFrame {
        let t = Double(frame - prefixFrames) / sampleRate
        let changing = 180 + frequencyOffset + floor(t * 2) * 137
        let transient = Int(t * 8) % 8 == 0 ? 0.35 : 0
        let base = Float(
          sin(2 * .pi * changing * t) * 0.5
            + sin(2 * .pi * (changing * 2.37) * t) * 0.2
            + transient * sin(2 * .pi * 2_400 * t))
        samples[frame] = sample(base, at: t, variant: variant)
      }
    }
    var settings = format.settings
    settings[AVLinearPCMIsNonInterleaved] = false
    let file = try AVAudioFile(forWriting: url, settings: settings)
    try file.write(from: buffer)
  }

  private func writeMultichannelSignal(
    to url: URL,
    channelCount: Int,
    duration: Double
  ) throws {
    let sampleRate = 8_000.0
    let layout = try #require(
      AVAudioChannelLayout(
        layoutTag: AudioChannelLayoutTag(
          kAudioChannelLayoutTag_DiscreteInOrder | UInt32(channelCount))))
    let format = AVAudioFormat(
      standardFormatWithSampleRate: sampleRate,
      channelLayout: layout)
    var settings = format.settings
    settings[AVFormatIDKey] = kAudioFormatLinearPCM
    settings[AVLinearPCMIsNonInterleaved] = false
    let file = try AVAudioFile(forWriting: url, settings: settings)
    let totalFrames = Int(duration * sampleRate)
    let chunkFrames = 1_024
    var written = 0
    while written < totalFrames {
      let frameCount = min(chunkFrames, totalFrames - written)
      let buffer = try #require(
        AVAudioPCMBuffer(
          pcmFormat: format,
          frameCapacity: AVAudioFrameCount(chunkFrames)))
      buffer.frameLength = AVAudioFrameCount(frameCount)
      let channels = try #require(buffer.floatChannelData)
      for channel in 0..<channelCount {
        for frame in 0..<frameCount {
          let time = Double(written + frame) / sampleRate
          channels[channel][frame] = Float(
            sin(2 * .pi * Double(120 + channel * 11) * time) * 0.2)
        }
      }
      try file.write(from: buffer)
      written += frameCount
    }
  }

  private func sample(_ base: Float, at time: Double, variant: SignalVariant) -> Float {
    switch variant {
    case .clean:
      return base
    case .distortedExcerpt:
      let harmonic = Float(sin(2 * .pi * 4_800 * time) * 0.08 + sin(2 * .pi * 7_200 * time) * 0.05)
      let clipped = tanh(base * 3.6)
      return Float((Double(clipped) * 0.82) + Double(harmonic))
    case .alternateTexture:
      let wobble = Float(sin(2 * .pi * 3.1 * time) * 0.22)
      let carrier = Float(sin(2 * .pi * 1_150 * time) * 0.25)
      return tanh((base * 0.2) + wobble + carrier)
    }
  }

  private enum SignalVariant {
    case clean
    case distortedExcerpt
    case alternateTexture
  }
}

private final class LockedExcerptMutationGate: @unchecked Sendable {
  private let lock = NSLock()
  private var claimed = false

  func claim() -> Bool {
    lock.lock()
    defer { lock.unlock() }
    guard !claimed else { return false }
    claimed = true
    return true
  }

  var isClaimed: Bool {
    lock.lock()
    defer { lock.unlock() }
    return claimed
  }
}
