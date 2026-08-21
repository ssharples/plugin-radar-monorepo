import Foundation
import Testing

@testable import StudioCore

@Suite("Local near-identical recording matching")
struct LocalNearIdentityAudioMatcherTests {
  @Test("Matches gain, channel, silence, sample-rate, and PCM re-encoding changes")
  func matchesOrdinaryReencodingChanges() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.aiff")
    let unrelated = root.appending(path: "unrelated.wav")
    try TestSupport.writeGeneratedAudio(
      to: query,
      sampleRate: 44_100,
      signalDuration: 8,
      gain: 0.92,
      channels: 1,
      bitDepth: 32)
    try TestSupport.writeGeneratedAudio(
      to: target,
      sampleRate: 48_000,
      signalDuration: 8,
      leadingSilence: 0.55,
      trailingSilence: 0.35,
      gain: 0.48,
      channels: 2,
      bitDepth: 16)
    try TestSupport.writeGeneratedAudio(
      to: unrelated,
      sampleRate: 48_000,
      signalDuration: 8,
      leadingSilence: 0.55,
      gain: 0.7,
      channels: 2,
      bitDepth: 16,
      transform: .unrelated)

    let observations = try await match(query, candidates: [target, unrelated])

    let observation = try #require(observations.only)
    #expect(observation.targetNodeID == "target")
    #expect(observation.capability == .nearIdentity)
    #expect(observation.matchedCoverage >= 0.85)
    #expect(abs((observation.targetRange?.startSeconds ?? 0) - 0.55) < 0.25)
    #expect((observation.coveredDurationSeconds ?? 0) > 7.5)
    #expect(observation.fingerprintVersion == LocalNearIdentityAudioMatcher.fingerprintVersion)
    #expect(observation.fingerprintDigest?.count == 64)
    #expect(observation.targetFingerprintDigest?.count == 64)
    #expect(observation.sourceObservation?.contentSHA256.count == 64)
    #expect(observation.targetObservation?.contentSHA256.count == 64)
    #expect(observation.algorithmFamily == LocalNearIdentityAudioMatcher.algorithmFamily)
    #expect(observation.explanation.contains(LocalNearIdentityAudioMatcher.fingerprintVersion))
  }

  @Test("Matches a local AAC re-encode without treating it as exact identity")
  func matchesCompressedReencode() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.m4a")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 8)
    try TestSupport.writeGeneratedAudio(
      to: target,
      sampleRate: 48_000,
      signalDuration: 8,
      leadingSilence: 0.35,
      trailingSilence: 0.2,
      gain: 0.6,
      channels: 2)

    let observation = try #require(try await match(query, candidates: [target]).only)

    #expect(observation.capability == .nearIdentity)
    #expect(
      observation.sourceObservation?.contentSHA256 != observation.targetObservation?.contentSHA256)
    let edge = try #require(AudioMatchProposalBuilder().edge(from: observation))
    #expect(edge.relationship == .nearIdenticalRecording)
    #expect(edge.confidence == .suggested)
    #expect(edge.confidence != .verifiedIdentity)
  }

  @Test("Matches a modest trim only when full-recording coverage remains")
  func matchesModestTrim() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "trimmed.aiff")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 8)
    try TestSupport.writeGeneratedAudio(
      to: target,
      sampleRate: 48_000,
      signalDuration: 7.1,
      sourceOffset: 0.45,
      leadingSilence: 0.2,
      trailingSilence: 0.3,
      gain: 0.6,
      channels: 2,
      bitDepth: 16)

    let observation = try #require(try await match(query, candidates: [target]).only)

    #expect(observation.matchedCoverage >= 0.8)
    #expect((observation.sourceRange?.startSeconds ?? 0) > 0.25)
    #expect((observation.coveredDurationSeconds ?? 0) > 6.5)
  }

  @Test("Unrelated same-duration audio abstains")
  func rejectsUnrelatedSameDurationAudio() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.aiff")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(
      to: target,
      signalDuration: 6,
      transform: .unrelated)

    #expect(try await match(query, candidates: [target]).isEmpty)
  }

  @Test("Excerpt-only overlap lacks full-recording coverage")
  func rejectsExcerptOnlyMatch() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let excerpt = root.appending(path: "excerpt.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 8)
    try TestSupport.writeGeneratedAudio(
      to: excerpt,
      signalDuration: 5,
      sourceOffset: 1.5)

    #expect(try await match(query, candidates: [excerpt]).isEmpty)
  }

  @Test("Pitch, time, reverse, and chop transformations abstain")
  func rejectsCreativeTransformations() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 8)
    let variants: [(String, TestSupport.GeneratedAudioTransform)] = [
      ("pitch", .pitchShifted(semitones: 4)),
      ("time", .timeScaled(factor: 1.08)),
      ("reverse", .reversed(referenceDuration: 8)),
      ("chop", .chopped(chunkDuration: 0.8)),
    ]

    for (name, transform) in variants {
      let target = root.appending(path: "\(name).wav")
      try TestSupport.writeGeneratedAudio(
        to: target,
        signalDuration: name == "time" ? 7.4 : 8,
        transform: transform)
      #expect(try await match(query, candidates: [target]).isEmpty)
    }
  }

  @Test("Microtonal through one-semitone pitch shifts abstain")
  func rejectsSubtlePitchTransforms() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 8)

    let probes = [
      LocalNearIdentityAudioMatcher.diagnosticPitchProbeSemitones,
      LocalNearIdentityAudioMatcher.validatedPitchTransformBoundarySemitones,
      0.25,
      1.0,
    ]
    for semitones in probes {
      let target = root.appending(path: "pitch-\(semitones).wav")
      try TestSupport.writeGeneratedAudio(
        to: target,
        signalDuration: 8,
        transform: .pitchShifted(semitones: semitones))
      #expect(try await match(query, candidates: [target]).isEmpty)
    }
  }

  @Test("Non-finite and overflowing duration estimates abstain before integer conversion")
  func rejectsInvalidDurationEstimates() {
    for duration in [Double.nan, .infinity, -.infinity, -1, 0, .greatestFiniteMagnitude] {
      #expect(
        LocalNearIdentityAudioMatcher.boundedCanonicalFrameEstimate(
          durationSeconds: duration,
          maximumDurationSeconds: 900,
          maximumFingerprintFrames: 10_000) == nil)
    }
    #expect(
      LocalNearIdentityAudioMatcher.boundedCanonicalFrameEstimate(
        durationSeconds: 1,
        maximumDurationSeconds: 900,
        maximumFingerprintFrames: .max) == nil)
  }

  @Test("Half-percent and one-percent time stretches abstain")
  func rejectsSubtleTimeTransforms() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 8)

    for factor in [1.005, 0.99] {
      let target = root.appending(path: "time-\(factor).wav")
      try TestSupport.writeGeneratedAudio(
        to: target,
        signalDuration: 8 / factor,
        transform: .timeScaled(factor: factor))
      #expect(try await match(query, candidates: [target]).isEmpty)
    }
  }

  @Test("Short content padded with long silence lacks full-recording coverage")
  func rejectsShortPaddedContent() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let padded = root.appending(path: "padded.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 8)
    try TestSupport.writeGeneratedAudio(
      to: padded,
      signalDuration: 2,
      sourceOffset: 2,
      leadingSilence: 8,
      trailingSilence: 8)

    #expect(try await match(query, candidates: [padded]).isEmpty)
  }

  @Test("Silence and mostly-silent material are degenerate")
  func rejectsDegenerateMaterial() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let silence = root.appending(path: "silence.wav")
    let silenceCopy = root.appending(path: "silence-copy.wav")
    let burst = root.appending(path: "burst.wav")
    let burstCopy = root.appending(path: "burst-copy.wav")
    try TestSupport.writeGeneratedAudio(
      to: silence,
      signalDuration: 6,
      transform: .silence)
    try TestSupport.writeGeneratedAudio(
      to: silenceCopy,
      signalDuration: 6,
      transform: .silence)
    try TestSupport.writeGeneratedAudio(
      to: burst,
      signalDuration: 6,
      activeRange: 2.2..<3.1)
    try TestSupport.writeGeneratedAudio(
      to: burstCopy,
      signalDuration: 6,
      activeRange: 2.2..<3.1)

    #expect(try await match(silence, candidates: [silenceCopy]).isEmpty)
    #expect(try await match(burst, candidates: [burstCopy]).isEmpty)
  }

  @Test("Ambiguous runner-up candidates abstain")
  func rejectsAmbiguousRunnerUps() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let first = root.appending(path: "first.wav")
    let second = root.appending(path: "second.aiff")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(
      to: first,
      signalDuration: 6,
      leadingSilence: 0.3,
      gain: 0.65)
    try TestSupport.writeGeneratedAudio(
      to: second,
      sampleRate: 48_000,
      signalDuration: 6,
      leadingSilence: 0.3,
      gain: 0.65,
      channels: 2,
      bitDepth: 16)

    #expect(try await match(query, candidates: [first, second]).isEmpty)
  }

  @Test("Replacement after fingerprinting invalidates the observation")
  func rejectsReplacementDuringMatch() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 6)
    let matcher = LocalNearIdentityAudioMatcher(postFingerprintHook: { url in
      guard url.standardizedFileURL == target.standardizedFileURL else { return }
      try TestSupport.replaceWithGeneratedAudio(
        at: target,
        signalDuration: 6,
        transform: .unrelated)
    })

    let result = try await matcher.match(request(query, candidates: [target]))

    #expect(result.isEmpty)
  }

  @Test("Source replacement after fingerprinting invalidates the observation")
  func rejectsSourceReplacementDuringMatch() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 6)
    let matcher = LocalNearIdentityAudioMatcher(postFingerprintHook: { url in
      guard url.standardizedFileURL == query.standardizedFileURL else { return }
      try TestSupport.replaceWithGeneratedAudio(
        at: query,
        signalDuration: 6,
        transform: .unrelated)
    })

    #expect(try await matcher.match(request(query, candidates: [target])).isEmpty)
  }

  @Test("Source and target growth or in-place mutation during bounded digest abstains")
  func rejectsMutationDuringBoundedDigest() async throws {
    for mutateSource in [true, false] {
      for appendGrowth in [true, false] {
        let root = try TestSupport.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let query = root.appending(path: "query.wav")
        let target = root.appending(path: "target.wav")
        try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
        try TestSupport.writeGeneratedAudio(to: target, signalDuration: 6)
        let mutationURL = mutateSource ? query : target
        let sourceBytes = try FileFingerprint.read(from: query, fileManager: .default).bytes
        let targetBytes = try FileFingerprint.read(from: target, fileManager: .default).bytes
        let gate = LockedMutationGate()
        let maximumObservedRead = LockedMaximum()
        let matcher = LocalNearIdentityAudioMatcher(
          maximumFileBytes: max(sourceBytes, targetBytes),
          digestProgressHook: { url, bytesRead in
            maximumObservedRead.record(bytesRead)
            guard url.standardizedFileURL == mutationURL.standardizedFileURL,
              gate.claim()
            else { return }
            let handle = try FileHandle(forWritingTo: mutationURL)
            defer { try? handle.close() }
            if appendGrowth {
              try handle.seekToEnd()
              try handle.write(contentsOf: Data(repeating: 0x5a, count: 128 * 1_024))
            } else {
              let size = try FileFingerprint.read(
                from: mutationURL,
                fileManager: .default
              ).bytes
              let offset = min(max(bytesRead + 1_024, 128), max(128, size - 256))
              try handle.seek(toOffset: UInt64(offset))
              try handle.write(contentsOf: Data(repeating: 0xa5, count: 128))
            }
            try handle.synchronize()
          },
          postFingerprintHook: { _ in })

        #expect(try await matcher.match(request(query, candidates: [target])).isEmpty)
        #expect(maximumObservedRead.value <= max(sourceBytes, targetBytes))
      }
    }
  }

  @Test("Unreadable candidates cause an abstention rather than partial ranking")
  func rejectsUnreadableCandidateSet() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let valid = root.appending(path: "valid.wav")
    let unreadable = root.appending(path: "broken.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: valid, signalDuration: 6)
    try Data("not audio".utf8).write(to: unreadable)

    #expect(try await match(query, candidates: [valid, unreadable]).isEmpty)
    #expect(try await match(unreadable, candidates: [valid]).isEmpty)
  }

  @Test("Small, over-duration, and over-candidate inputs are bounded")
  func enforcesInputBounds() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let short = root.appending(path: "short.wav")
    let shortCopy = root.appending(path: "short-copy.wav")
    let long = root.appending(path: "long.wav")
    let longCopy = root.appending(path: "long-copy.wav")
    let unrelated = root.appending(path: "unrelated.wav")
    try TestSupport.writeGeneratedAudio(to: short, signalDuration: 1.5)
    try TestSupport.writeGeneratedAudio(to: shortCopy, signalDuration: 1.5)
    try TestSupport.writeGeneratedAudio(to: long, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(to: longCopy, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(
      to: unrelated,
      signalDuration: 6,
      transform: .unrelated)

    #expect(try await match(short, candidates: [shortCopy]).isEmpty)
    #expect(
      try await LocalNearIdentityAudioMatcher(maximumDurationSeconds: 4)
        .match(request(long, candidates: [longCopy])).isEmpty)
    #expect(
      try await LocalNearIdentityAudioMatcher(maximumCandidateCount: 1)
        .match(request(long, candidates: [longCopy, unrelated])).isEmpty)
    #expect(
      try await LocalNearIdentityAudioMatcher(maximumFingerprintFrames: 10)
        .match(request(long, candidates: [longCopy])).isEmpty)

    let clamped = LocalNearIdentityAudioMatcher(
      maximumLagSeconds: 1_000,
      maximumDurationSeconds: 10_000,
      maximumFingerprintFrames: 100_000,
      maximumCandidateCount: 1_000,
      maximumFileBytes: Int64.max,
      maximumWorkingMemoryBytes: Int64.max)
    #expect(clamped.maximumLagSeconds == LocalNearIdentityAudioMatcher.hardMaximumLagSeconds)
    #expect(
      clamped.maximumDurationSeconds
        == LocalNearIdentityAudioMatcher.hardMaximumDurationSeconds)
    #expect(
      clamped.maximumFingerprintFrames
        == LocalNearIdentityAudioMatcher.hardMaximumFingerprintFrames)
    #expect(
      clamped.maximumCandidateCount
        == LocalNearIdentityAudioMatcher.hardMaximumCandidateCount)
    #expect(clamped.maximumFileBytes == LocalNearIdentityAudioMatcher.hardMaximumFileBytes)
    #expect(
      clamped.maximumWorkingMemoryBytes
        == LocalNearIdentityAudioMatcher.hardMaximumWorkingMemoryBytes)

    let safetyClamped = LocalNearIdentityAudioMatcher(
      minimumAverageSimilarity: 0,
      minimumFullRecordingCoverage: 0,
      minimumRunnerUpMargin: 0,
      minimumMatchedSpanSeconds: 0,
      minimumNonSilentRatio: 0,
      minimumDistinctTokenCount: 1,
      minimumActiveContentRatio: 0,
      maximumNearEqualDurationDeltaRatio: 1)
    #expect(
      safetyClamped.minimumAverageSimilarity
        == LocalNearIdentityAudioMatcher.safetyMinimumAverageSimilarity)
    #expect(
      safetyClamped.minimumFullRecordingCoverage
        == LocalNearIdentityAudioMatcher.safetyMinimumFullRecordingCoverage)
    #expect(
      safetyClamped.minimumRunnerUpMargin
        == LocalNearIdentityAudioMatcher.safetyMinimumRunnerUpMargin)
    #expect(
      safetyClamped.minimumMatchedSpanSeconds
        == LocalNearIdentityAudioMatcher.safetyMinimumMatchedSpanSeconds)
    #expect(
      safetyClamped.minimumNonSilentRatio
        == LocalNearIdentityAudioMatcher.safetyMinimumNonSilentRatio)
    #expect(
      safetyClamped.minimumDistinctTokenCount
        == LocalNearIdentityAudioMatcher.safetyMinimumDistinctTokenCount)
    #expect(
      safetyClamped.minimumActiveContentRatio
        == LocalNearIdentityAudioMatcher.safetyMinimumActiveContentRatio)
    #expect(
      safetyClamped.maximumNearEqualDurationDeltaRatio
        == LocalNearIdentityAudioMatcher.safetyMaximumNearEqualDurationDeltaRatio)
  }

  @Test("All files are preflighted before any content digest")
  func preflightsBeforeDigesting() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let oversized = root.appending(path: "oversized.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 5)
    try TestSupport.writeGeneratedAudio(to: oversized, signalDuration: 8)
    let queryBytes = try FileFingerprint.read(from: query, fileManager: .default).bytes
    let oversizedBytes = try FileFingerprint.read(from: oversized, fileManager: .default).bytes
    let counter = LockedCounter()
    let matcher = LocalNearIdentityAudioMatcher(
      maximumFileBytes: (queryBytes + oversizedBytes) / 2,
      willDigestHook: { _ in counter.increment() },
      postFingerprintHook: { _ in })

    #expect(try await matcher.match(request(query, candidates: [oversized])).isEmpty)
    #expect(counter.value == 0)

    let overDurationSourceCounter = LockedCounter()
    let sourceBoundedMatcher = LocalNearIdentityAudioMatcher(
      maximumDurationSeconds: 4,
      willDigestHook: { _ in overDurationSourceCounter.increment() },
      postFingerprintHook: { _ in })
    #expect(
      try await sourceBoundedMatcher.match(request(query, candidates: [oversized])).isEmpty)
    #expect(overDurationSourceCounter.value == 0)

    let overDurationTargetCounter = LockedCounter()
    let targetBoundedMatcher = LocalNearIdentityAudioMatcher(
      maximumDurationSeconds: 6,
      willDigestHook: { _ in overDurationTargetCounter.increment() },
      postFingerprintHook: { _ in })
    #expect(
      try await targetBoundedMatcher.match(request(query, candidates: [oversized])).isEmpty)
    #expect(overDurationTargetCounter.value == 0)
  }

  @Test("Request memory ceiling admits the exact bound and rejects one byte below")
  func enforcesExactRequestMemoryBoundary() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.aiff")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(
      to: target,
      sampleRate: 48_000,
      signalDuration: 6,
      channels: 2,
      bitDepth: 16)

    let recorder = LockedMemoryPlan()
    let baselineMatcher = LocalNearIdentityAudioMatcher(
      postFingerprintHook: { _ in },
      requestMemoryPreflightHook: { measured, upper in
        recorder.record(measured: measured, upper: upper)
      })
    let baseline = try #require(
      try await baselineMatcher.match(request(query, candidates: [target])).only)
    let plan = try #require(recorder.value)
    let baselineUsage = try #require(baseline.resourceUsage)
    #expect(plan.measured > 0)
    #expect(plan.measured <= plan.upper)
    #expect(baselineUsage.workingMemoryMeasuredBytes == plan.measured)
    #expect(baselineUsage.workingMemoryUpperBoundBytes == plan.upper)

    let exactDigestCount = LockedCounter()
    let exactMatcher = LocalNearIdentityAudioMatcher(
      maximumWorkingMemoryBytes: plan.upper,
      willDigestHook: { _ in exactDigestCount.increment() },
      postFingerprintHook: { _ in })
    let exact = try #require(
      try await exactMatcher.match(request(query, candidates: [target])).only)
    #expect(exact.resourceUsage?.workingMemoryUpperBoundBytes == plan.upper)
    #expect(exactDigestCount.value > 0)

    let belowDigestCount = LockedCounter()
    let belowMatcher = LocalNearIdentityAudioMatcher(
      maximumWorkingMemoryBytes: plan.upper - 1,
      willDigestHook: { _ in belowDigestCount.increment() },
      postFingerprintHook: { _ in })
    #expect(try await belowMatcher.match(request(query, candidates: [target])).isEmpty)
    #expect(belowDigestCount.value == 0)
  }

  @Test("Streaming memory evidence includes a larger losing candidate independent of order")
  func reportsOrderIndependentRequestPeak() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let winner = root.appending(path: "winner.aiff")
    let largeLoser = root.appending(path: "large-loser.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(
      to: winner,
      sampleRate: 48_000,
      signalDuration: 6,
      channels: 2,
      bitDepth: 16)
    try TestSupport.writeGeneratedAudio(
      to: largeLoser,
      sampleRate: 96_000,
      signalDuration: 9,
      channels: 2,
      bitDepth: 16,
      transform: .unrelated)

    let winnerOnly = try #require(try await match(query, candidates: [winner]).only)
    let forward = try #require(try await match(query, candidates: [winner, largeLoser]).only)
    let reversed = try #require(try await match(query, candidates: [largeLoser, winner]).only)
    let winnerOnlyUsage = try #require(winnerOnly.resourceUsage)
    let forwardUsage = try #require(forward.resourceUsage)
    let reversedUsage = try #require(reversed.resourceUsage)

    #expect(forward.targetNodeID == "winner")
    #expect(reversed.targetNodeID == "winner")
    #expect(forwardUsage.candidateCount == 2)
    #expect(forwardUsage.workingMemoryMeasuredBytes > winnerOnlyUsage.workingMemoryMeasuredBytes)
    #expect(
      forwardUsage.workingMemoryUpperBoundBytes > winnerOnlyUsage.workingMemoryUpperBoundBytes)
    #expect(forwardUsage.workingMemoryMeasuredBytes == reversedUsage.workingMemoryMeasuredBytes)
    #expect(forwardUsage.workingMemoryUpperBoundBytes == reversedUsage.workingMemoryUpperBoundBytes)
  }

  @Test("High-rate multichannel and overflowing plans reject before digest allocation")
  func rejectsUnsafeMemoryPlansBeforeDigest() async throws {
    #expect(
      LocalNearIdentityWorkingMemoryPlanner.filePlan(
        inputFrameCount: .max,
        channelCount: 32,
        canonicalFrameCapacity: .max,
        fingerprintFrameCapacity: .max) == nil)
    #expect(LocalNearIdentityWorkingMemoryPlanner.requestContainers(candidateCount: .max) == nil)
    let stereoPlan = try #require(
      LocalNearIdentityWorkingMemoryPlanner.filePlan(
        inputFrameCount: 480_000,
        channelCount: 2,
        canonicalFrameCapacity: 120_000,
        fingerprintFrameCapacity: 120))
    let highChannelPlan = try #require(
      LocalNearIdentityWorkingMemoryPlanner.filePlan(
        inputFrameCount: 480_000,
        channelCount: 32,
        canonicalFrameCapacity: 120_000,
        fingerprintFrameCapacity: 120))
    #expect(highChannelPlan.extraction.upperBoundBytes > stereoPlan.extraction.upperBoundBytes)

    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let expensive = root.appending(path: "high-rate-multichannel.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 5)
    try TestSupport.writeGeneratedAudio(
      to: expensive,
      sampleRate: 96_000,
      signalDuration: 5,
      channels: 2,
      bitDepth: 16)
    let digestCount = LockedCounter()
    let matcher = LocalNearIdentityAudioMatcher(
      maximumWorkingMemoryBytes: 5 * 1_024 * 1_024,
      willDigestHook: { _ in digestCount.increment() },
      postFingerprintHook: { _ in })

    #expect(try await matcher.match(request(query, candidates: [expensive])).isEmpty)
    #expect(digestCount.value == 0)
  }

  @Test("Many-candidate request containers are bounded before any digest")
  func rejectsManyCandidateRequestBeforeDigest() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.wav")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 5)
    try TestSupport.writeGeneratedAudio(to: target, signalDuration: 5)
    let candidates = (0..<LocalNearIdentityAudioMatcher.hardMaximumCandidateCount).map {
      AudioMatchCandidate(nodeID: "candidate-\($0)", fileURL: target)
    }
    let manyCandidateRequest = AudioMatchRequest(
      sourceNodeID: "query",
      sourceURL: query,
      candidates: candidates)
    let planRecorder = LockedMemoryPlan()
    let baseline = LocalNearIdentityAudioMatcher(
      postFingerprintHook: { _ in },
      requestMemoryPreflightHook: { measured, upper in
        planRecorder.record(measured: measured, upper: upper)
        throw MemoryPlanProbe.stop
      })
    _ = try await baseline.match(manyCandidateRequest)
    let plan = try #require(planRecorder.value)
    let digestCount = LockedCounter()
    let bounded = LocalNearIdentityAudioMatcher(
      maximumWorkingMemoryBytes: plan.upper - 1,
      willDigestHook: { _ in digestCount.increment() },
      postFingerprintHook: { _ in })

    #expect(try await bounded.match(manyCandidateRequest).isEmpty)
    #expect(digestCount.value == 0)
  }

  @Test("Fingerprint observations are deterministic")
  func producesDeterministicObservations() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let query = root.appending(path: "query.wav")
    let target = root.appending(path: "target.aiff")
    try TestSupport.writeGeneratedAudio(to: query, signalDuration: 6)
    try TestSupport.writeGeneratedAudio(
      to: target,
      sampleRate: 48_000,
      signalDuration: 6,
      channels: 2,
      bitDepth: 16)

    let first = try #require(try await match(query, candidates: [target]).only)
    let second = try #require(try await match(query, candidates: [target]).only)

    #expect(first == second)
  }

  private func match(_ source: URL, candidates: [URL]) async throws
    -> [AudioMatchObservation]
  {
    try await LocalNearIdentityAudioMatcher().match(request(source, candidates: candidates))
  }

  private func request(_ source: URL, candidates: [URL]) -> AudioMatchRequest {
    AudioMatchRequest(
      sourceNodeID: "query",
      sourceURL: source,
      candidates: candidates.map {
        AudioMatchCandidate(
          nodeID: $0.deletingPathExtension().lastPathComponent,
          fileURL: $0)
      })
  }
}

extension Collection {
  fileprivate var only: Element? { count == 1 ? first : nil }
}

private final class LockedCounter: @unchecked Sendable {
  private let lock = NSLock()
  private var count = 0

  var value: Int {
    lock.withLock { count }
  }

  func increment() {
    lock.withLock { count += 1 }
  }
}

private final class LockedMutationGate: @unchecked Sendable {
  private let lock = NSLock()
  private var claimed = false

  func claim() -> Bool {
    lock.withLock {
      guard !claimed else { return false }
      claimed = true
      return true
    }
  }
}

private final class LockedMaximum: @unchecked Sendable {
  private let lock = NSLock()
  private var maximum: Int64 = 0

  var value: Int64 {
    lock.withLock { maximum }
  }

  func record(_ value: Int64) {
    lock.withLock { maximum = max(maximum, value) }
  }
}

private final class LockedMemoryPlan: @unchecked Sendable {
  struct Value {
    let measured: Int64
    let upper: Int64
  }

  private let lock = NSLock()
  private var storage: Value?

  var value: Value? {
    lock.withLock { storage }
  }

  func record(measured: Int64, upper: Int64) {
    lock.withLock {
      storage = Value(measured: measured, upper: upper)
    }
  }
}

private enum MemoryPlanProbe: Error {
  case stop
}
