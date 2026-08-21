import Foundation
import Testing

@testable import StudioCore

@Suite("Local transformed-sample research lab")
struct LocalTransformedSampleResearchLabTests {
  @Test("Capability is unavailable by default and does not read files")
  func unavailableByDefault() async throws {
    let missing = URL(filePath: "/missing/research-audio.wav")
    let result = try await LocalTransformedSampleResearchLab().analyze(
      TransformedSampleResearchRequest(
        sourceID: "source",
        sourceURL: missing,
        candidates: [
          TransformedSampleResearchCandidate(candidateID: "target", fileURL: missing)
        ]))

    #expect(result.matches.isEmpty)
    let reasons = result.abstentions.map { $0.reason }
    #expect(reasons == [TransformedSampleResearchAbstentionReason.capabilityUnavailable])
    #expect(result.capability.availability == .unavailable)
  }

  @Test(
    "Research mode evaluates every family fixture without surfacing abstained evidence",
    arguments: TransformedSampleResearchTestSupport.positiveTransforms)
  func evaluatesTransformFamily(
    _ transform: TransformedSampleResearchTestSupport.SyntheticTransform
  ) async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: transform)
    let result = try await researchLab().analyze(
      request(source: fixture.source, target: fixture.target))
    if let match = result.matches.first {
      #expect(match.label == "Possible transformed use")
      #expect(match.classification != .unknown)
      #expect(match.sourceRange.durationSeconds == 5)
      #expect(match.targetRange.durationSeconds == 5)
      #expect(match.sourceObservation.contentSHA256.count == 64)
      #expect(match.targetObservation.contentSHA256.count == 64)
      #expect(match.resourceUsage.comparedWindowPairCount > 0)
      #expect(match.isWellFormedResearchEvidence)
      if let expected = transform.family {
        let observedNames = match.hypotheses.map { $0.family.rawValue }
        #expect(
          match.hypotheses.contains(where: { $0.family == expected }),
          "Expected \(expected.rawValue), got \(observedNames)")
      }
    } else {
      #expect(!result.abstentions.isEmpty)
      let expectedReason: TransformedSampleResearchAbstentionReason
      switch transform {
      case .filtering, .distortion, .reverb, .silence:
        expectedReason = .relationshipConflictingEvidence
      case .pitch, .microtonal, .timeStretch, .delay, .reversal, .chopping:
        expectedReason = .relationshipIndeterminate
      default:
        Issue.record("Unexpected relationship abstention for \(transform.rawValue)")
        return
      }
      #expect(result.abstentions.map(\.reason) == [expectedReason])
      let encoded = String(decoding: try JSONEncoder().encode(result), as: UTF8.self)
      #expect(!encoded.contains(TransformedSampleResearchMatch.externalLabel))
      #expect(!encoded.contains("sourceObservation"))
      #expect(!encoded.contains("targetObservation"))
    }
  }

  @Test("Composite transforms retain multiple typed hypotheses")
  func retainsCompositeHypotheses() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: .composite)
    let result = try await researchLab().analyze(
      request(source: fixture.source, target: fixture.target))
    let match = try #require(result.matches.first)

    #expect(match.hypotheses.count >= 2)
    #expect(match.hypotheses.allSatisfy { $0.isWellFormed })
    let observedFamilies = match.hypotheses.map { $0.family }
    let sortedFamilies = observedFamilies.sorted { $0.rawValue < $1.rawValue }
    #expect(observedFamilies == sortedFamilies)
  }

  @Test("Five-second windows advance on the fixed 2.5-second overlapping hop")
  func fixedWindowGeometry() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let source = root.appending(path: "source.wav")
    let target = root.appending(path: "target.wav")
    try TransformedSampleResearchTestSupport.writeAudio(to: source, transform: nil)
    try TransformedSampleResearchTestSupport.writeAudio(
      to: target,
      transform: .gain,
      leadingSilence: 2.5)

    let result = try await researchLab().analyze(request(source: source, target: target))
    let match = try #require(result.matches.first)

    #expect(match.sourceRange.durationSeconds == 5)
    #expect(match.targetRange.startSeconds == 2.5)
    #expect(match.targetRange.durationSeconds == 5)
  }

  @Test("Candidate insertion order and encoding are deterministic")
  func deterministicOrderingAndEncoding() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let source = root.appending(path: "source.wav")
    let transformed = root.appending(path: "transformed.wav")
    let unrelated = root.appending(path: "unrelated.wav")
    try TransformedSampleResearchTestSupport.writeAudio(to: source, transform: nil)
    try TransformedSampleResearchTestSupport.writeAudio(to: transformed, transform: .gain)
    try TransformedSampleResearchTestSupport.writeAudio(to: unrelated, transform: .unrelated)
    let firstCandidates = [
      TransformedSampleResearchCandidate(candidateID: "match", fileURL: transformed),
      TransformedSampleResearchCandidate(candidateID: "negative", fileURL: unrelated),
    ]
    let secondCandidates = Array(firstCandidates.reversed())
    let first = try await researchLab().analyze(
      TransformedSampleResearchRequest(
        sourceID: "source",
        sourceURL: source,
        candidates: firstCandidates))
    let second = try await researchLab().analyze(
      TransformedSampleResearchRequest(
        sourceID: "source",
        sourceURL: source,
        candidates: secondCandidates))
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]

    #expect(first == second)
    #expect(try encoder.encode(first) == encoder.encode(second))
  }

  @Test("Malformed decoded capability cannot enable research")
  func rejectsMalformedCapability() async throws {
    let data = Data(
      """
      {"algorithmVersion":"local-transformed-sample-research-v4","availability":"localResearchOnly","schemaVersion":999}
      """.utf8)
    let capability = try JSONDecoder().decode(
      TransformedSampleResearchCapability.self,
      from: data)
    let result = try await LocalTransformedSampleResearchLab(capability: capability).analyze(
      TransformedSampleResearchRequest(
        sourceID: "source",
        sourceURL: URL(filePath: "/missing/source.wav"),
        candidates: [
          TransformedSampleResearchCandidate(
            candidateID: "target",
            fileURL: URL(filePath: "/missing/target.wav"))
        ]))

    #expect(!capability.isWellFormed)
    #expect(result.abstentions.map { $0.reason } == [.capabilityUnavailable])
  }

  @Test("Unrelated and independently re-performed negatives abstain")
  func rejectsNegatives() async throws {
    for transform in [
      TransformedSampleResearchTestSupport.SyntheticTransform.unrelated,
      .independentReperformance,
    ] {
      let root = try TestSupport.temporaryDirectory()
      defer { try? FileManager.default.removeItem(at: root) }
      let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
        root: root,
        transform: transform)
      let result = try await researchLab().analyze(
        request(source: fixture.source, target: fixture.target))

      #expect(result.matches.isEmpty, "Unexpected match for \(transform.rawValue)")
      #expect(
        result.abstentions.contains(where: {
          $0.reason == TransformedSampleResearchAbstentionReason.noSpecificMatch
        }))
    }
  }

  @Test("Byte-identical audio is identity evidence, not transformed-use evidence")
  func rejectsByteIdenticalPair() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let source = root.appending(path: "source.wav")
    let target = root.appending(path: "target.wav")
    try TransformedSampleResearchTestSupport.writeAudio(to: source, transform: nil)
    try FileManager.default.copyItem(at: source, to: target)

    let result = try await researchLab().analyze(request(source: source, target: target))

    #expect(result.matches.isEmpty)
    let abstention = result.abstentions.first(where: {
      $0.reason == .byteIdenticalNotTransformedUse
    })
    #expect(abstention?.candidateID == "target")
  }

  @Test("Direct reuse requires nonidentical content with located reuse evidence")
  func directReuseRequiresNonidenticalEvidence() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: .gain)

    let result = try await researchLab().analyze(
      request(source: fixture.source, target: fixture.target))
    let match = try #require(result.matches.first)

    #expect(match.sourceObservation.contentSHA256 != match.targetObservation.contentSHA256)
    #expect(match.classification == .directReuse)
    #expect(match.classification != .possibleReperformance)
  }

  @Test("Each classified relationship emits the exact review-only suggestion")
  func classifiesRelationshipEvidenceConservatively() async throws {
    let cases:
      [(
        TransformedSampleResearchTestSupport.SyntheticTransform,
        TransformedSampleRelationshipClassification
      )] = [
        (.gain, .directReuse),
        (.interpolationEvidence, .possibleInterpolation),
        (.rePerformanceEvidence, .possibleReperformance),
      ]
    for (transform, expected) in cases {
      let root = try TestSupport.temporaryDirectory()
      defer { try? FileManager.default.removeItem(at: root) }
      let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
        root: root,
        transform: transform)
      let result = try await researchLab().analyze(
        request(source: fixture.source, target: fixture.target))
      let match = try #require(result.matches.first)

      #expect(match.label == "Possible transformed use")
      #expect(match.classification != .unknown)
      #expect(
        match.classification == expected,
        "Unexpected classification for \(transform): \(match.relationshipEvidence)")
      #expect(match.relationshipEvidence.conservativeClassification == expected)
      #expect(
        match.relationshipEvidence.conservativeClassificationDisposition == .classified(expected))
      #expect(match.isWellFormedResearchEvidence)
    }
  }

  @Test("Nested match and result evidence require one exact current algorithm version")
  func rejectsMixedAndUnsupportedResultVersions() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: .gain)
    let result = try await researchLab().analyze(
      request(source: fixture.source, target: fixture.target))
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    let currentData = try encoder.encode(result)
    let decoder = JSONDecoder()

    #expect(result.isWellFormedResearchResult)
    #expect(try decoder.decode(TransformedSampleResearchResult.self, from: currentData) == result)

    for version in ["", "local-transformed-sample-research-v3", "unknown-algorithm"] {
      let staleMatch = try replacingAlgorithmVersions(
        in: currentData,
        matchVersion: version,
        capabilityVersion: nil)
      #expect(throws: (any Error).self) {
        try decoder.decode(TransformedSampleResearchResult.self, from: staleMatch)
      }
      let staleMatchData = try firstMatchData(from: staleMatch)
      #expect(throws: (any Error).self) {
        try decoder.decode(TransformedSampleResearchMatch.self, from: staleMatchData)
      }
    }

    let mixedCapability = try replacingAlgorithmVersions(
      in: currentData,
      matchVersion: nil,
      capabilityVersion: "local-transformed-sample-research-v3")
    #expect(throws: (any Error).self) {
      try decoder.decode(TransformedSampleResearchResult.self, from: mixedCapability)
    }
    let allLegacy = try replacingAlgorithmVersions(
      in: currentData,
      matchVersion: "local-transformed-sample-research-v3",
      capabilityVersion: "local-transformed-sample-research-v3")
    #expect(throws: (any Error).self) {
      try decoder.decode(TransformedSampleResearchResult.self, from: allLegacy)
    }
  }

  @Test("Relationship disposition distinguishes every abstention reason")
  func relationshipEvidenceFailsClosed() {
    let conflicting = TransformedSampleRelationshipEvidence(
      waveformCorrelation: 0.955,
      forwardFeatureSimilarity: 0.99,
      reverseFeatureSimilarity: 0.2,
      unorderedFeatureSimilarity: 0.99,
      durationRatio: 1,
      dominantFrequencyRatio: 1)
    let low = TransformedSampleRelationshipEvidence(
      waveformCorrelation: 0.2,
      forwardFeatureSimilarity: 0.3,
      reverseFeatureSimilarity: 0.25,
      unorderedFeatureSimilarity: 0.4,
      durationRatio: 1,
      dominantFrequencyRatio: 1)
    let indeterminate = TransformedSampleRelationshipEvidence(
      waveformCorrelation: 0.35,
      forwardFeatureSimilarity: 0.7,
      reverseFeatureSimilarity: 0.2,
      unorderedFeatureSimilarity: 0.7,
      durationRatio: 1.2,
      dominantFrequencyRatio: 1.1)
    let malformed = TransformedSampleRelationshipEvidence(
      waveformCorrelation: .nan,
      forwardFeatureSimilarity: 1,
      reverseFeatureSimilarity: 0,
      unorderedFeatureSimilarity: 0,
      durationRatio: 1,
      dominantFrequencyRatio: 1)

    #expect(conflicting.isWellFormed)
    #expect(
      conflicting.conservativeClassificationDisposition == .abstained(.conflictingEvidence))
    #expect(conflicting.conservativeClassification == .unknown)
    #expect(low.conservativeClassificationDisposition == .abstained(.lowEvidence))
    #expect(indeterminate.conservativeClassificationDisposition == .abstained(.indeterminate))
    #expect(!malformed.isWellFormed)
    #expect(malformed.conservativeClassificationDisposition == .abstained(.malformedEvidence))
    #expect(malformed.conservativeClassification == .unknown)
  }

  @Test("Ambiguous relationship evidence abstains without persisting a candidate or observation")
  func ambiguousRelationshipDoesNotSurfaceEvidence() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: .ambiguousRelationship)

    let result = try await researchLab().analyze(
      request(source: fixture.source, target: fixture.target))
    let encoded = String(decoding: try JSONEncoder().encode(result), as: UTF8.self)

    #expect(result.matches.isEmpty)
    #expect(
      result.abstentions.contains(where: {
        [
          TransformedSampleResearchAbstentionReason.relationshipLowEvidence,
          .relationshipConflictingEvidence,
          .relationshipIndeterminate,
        ].contains($0.reason)
      }))
    #expect(!encoded.contains(TransformedSampleResearchMatch.externalLabel))
    #expect(!encoded.contains("sourceObservation"))
    #expect(!encoded.contains("targetObservation"))
  }

  @Test("Close candidate ties abstain without emitting research evidence")
  func rejectsAmbiguousCandidates() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: .gain)
    let duplicate = root.appending(path: "duplicate.wav")
    try FileManager.default.copyItem(at: fixture.target, to: duplicate)
    let result = try await researchLab().analyze(
      TransformedSampleResearchRequest(
        sourceID: "source",
        sourceURL: fixture.source,
        candidates: [
          TransformedSampleResearchCandidate(candidateID: "a", fileURL: fixture.target),
          TransformedSampleResearchCandidate(candidateID: "b", fileURL: duplicate),
        ]))

    #expect(result.matches.isEmpty)
    #expect(
      result.abstentions.contains(where: {
        $0.reason == TransformedSampleResearchAbstentionReason.ambiguousMatch
      }))
  }

  @Test("Candidate, byte, frame, and memory ceilings fail closed")
  func enforcesBounds() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: .gain)
    let second = root.appending(path: "second.wav")
    try FileManager.default.copyItem(at: fixture.target, to: second)
    let candidates = [
      TransformedSampleResearchCandidate(candidateID: "a", fileURL: fixture.target),
      TransformedSampleResearchCandidate(candidateID: "b", fileURL: second),
    ]

    let candidateLimited = try await LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      maximumCandidateCount: 1
    ).analyze(
      TransformedSampleResearchRequest(
        sourceID: "source",
        sourceURL: fixture.source,
        candidates: candidates))
    let candidateReasons = candidateLimited.abstentions.map { $0.reason }
    #expect(candidateReasons == [TransformedSampleResearchAbstentionReason.candidateLimitExceeded])

    let byteLimited = try await LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      maximumFileBytes: 128
    ).analyze(request(source: fixture.source, target: fixture.target))
    let byteReasons = byteLimited.abstentions.map { $0.reason }
    #expect(byteReasons == [TransformedSampleResearchAbstentionReason.resourceLimitExceeded])

    let frameLimited = try await LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      maximumDecodedFrames: 1_000
    ).analyze(request(source: fixture.source, target: fixture.target))
    let frameReasons = frameLimited.abstentions.map { $0.reason }
    #expect(frameReasons == [TransformedSampleResearchAbstentionReason.resourceLimitExceeded])

    let memoryLimited = try await LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      maximumWorkingMemoryBytes: 1_000
    ).analyze(request(source: fixture.source, target: fixture.target))
    let memoryReasons = memoryLimited.abstentions.map { $0.reason }
    #expect(memoryReasons == [TransformedSampleResearchAbstentionReason.resourceLimitExceeded])
  }

  @Test("Memory admission passes at the exact peak and rejects one byte below it")
  func exactMemoryAdmissionBoundary() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: .gain)
    let baseline = try await researchLab().analyze(
      request(source: fixture.source, target: fixture.target))
    let required = try #require(baseline.matches.first).resourceUsage.workingMemoryUpperBoundBytes

    let exact = try await LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      maximumWorkingMemoryBytes: required
    ).analyze(request(source: fixture.source, target: fixture.target))
    let exactMatch = try #require(exact.matches.first)
    #expect(exactMatch.resourceUsage.workingMemoryUpperBoundBytes == required)
    #expect(exactMatch.resourceUsage.workingMemoryUpperBoundBytes <= required)

    let oneByteBelow = try await LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      maximumWorkingMemoryBytes: required - 1
    ).analyze(request(source: fixture.source, target: fixture.target))
    #expect(oneByteBelow.matches.isEmpty)
    #expect(oneByteBelow.abstentions.map(\.reason) == [.resourceLimitExceeded])
  }

  @Test("High sample rates, excessive channels, and arithmetic extremes fail before decode")
  func preflightRejectsUnsupportedAndOverflowingAudio() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let highRate = root.appending(path: "high-rate.wav")
    let highChannels = root.appending(path: "high-channels.wav")
    let ordinary = root.appending(path: "ordinary.wav")
    try TransformedSampleResearchTestSupport.writeRawFloatWAV(
      to: highRate,
      sampleRate: 384_000,
      channelCount: 1)
    try TransformedSampleResearchTestSupport.writeRawFloatWAV(
      to: highChannels,
      sampleRate: 8_000,
      channelCount: LocalTransformedSampleResearchLab.hardMaximumChannelCount + 1)
    try TransformedSampleResearchTestSupport.writeAudio(to: ordinary, transform: .gain)
    let lab = LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      maximumWorkingMemoryBytes: 20 * 1_024 * 1_024)

    for source in [highRate, highChannels] {
      let result = try await lab.analyze(request(source: source, target: ordinary))
      #expect(result.matches.isEmpty)
      #expect(result.abstentions.map(\.reason) == [.resourceLimitExceeded])
    }
    #expect(
      LocalTransformedSampleResearchLab.conservativeMemoryEstimate(
        frameCount: Int64.max,
        sampleRate: Double.greatestFiniteMagnitude,
        channelCount: Int.max) == nil)
    let mono = try #require(
      LocalTransformedSampleResearchLab.conservativeMemoryEstimate(
        frameCount: 48_000,
        sampleRate: 8_000,
        channelCount: 1))
    let multichannel = try #require(
      LocalTransformedSampleResearchLab.conservativeMemoryEstimate(
        frameCount: 48_000,
        sampleRate: 8_000,
        channelCount: LocalTransformedSampleResearchLab.hardMaximumChannelCount))
    #expect(multichannel.decodePeakBytes > mono.decodePeakBytes)
  }

  @Test("Byte-identical fast path obeys the same exact memory boundary")
  func identicalFastPathMemoryBoundary() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let source = root.appending(path: "source.wav")
    let target = root.appending(path: "target.wav")
    try TransformedSampleResearchTestSupport.writeAudio(to: source, transform: nil)
    try FileManager.default.copyItem(at: source, to: target)
    let estimate = try #require(
      LocalTransformedSampleResearchLab.conservativeMemoryEstimate(
        frameCount: 48_000,
        sampleRate: 8_000,
        channelCount: 1))

    let exact = try await LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      maximumWorkingMemoryBytes: estimate.decodePeakBytes
    ).analyze(request(source: source, target: target))
    #expect(exact.matches.isEmpty)
    #expect(exact.abstentions.map(\.reason) == [.byteIdenticalNotTransformedUse])

    let rejected = try await LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      maximumWorkingMemoryBytes: estimate.decodePeakBytes - 1
    ).analyze(request(source: source, target: target))
    #expect(rejected.abstentions.map(\.reason) == [.resourceLimitExceeded])
  }

  @Test("An in-place replacement during analysis invalidates immutable evidence")
  func rejectsMutation() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: .gain)
    let target = fixture.target.standardizedFileURL
    let lab = LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      postDecodeHook: { url in
        guard url.standardizedFileURL == target else { return }
        let replacement = root.appending(path: "replacement.wav")
        try TransformedSampleResearchTestSupport.writeAudio(
          to: replacement,
          transform: .unrelated)
        _ = try FileManager.default.replaceItemAt(target, withItemAt: replacement)
      })
    let result = try await lab.analyze(
      request(source: fixture.source, target: fixture.target))

    #expect(result.matches.isEmpty)
    #expect(
      result.abstentions.contains(where: {
        $0.reason == TransformedSampleResearchAbstentionReason.immutableObservationChanged
      }))
  }

  @Test("Source and target mutations after comparison invalidate final evidence")
  func finalRevalidationRejectsEveryMutationForm() async throws {
    enum Subject: CaseIterable, Sendable { case source, target }
    enum Mutation: CaseIterable, Sendable { case inPlace, replacement }

    for subject in Subject.allCases {
      for mutation in Mutation.allCases {
        let root = try TestSupport.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
          root: root,
          transform: .gain)
        let victim = subject == .source ? fixture.source : fixture.target
        let replacement = root.appending(path: "replacement.wav")
        try TransformedSampleResearchTestSupport.writeAudio(
          to: replacement,
          transform: .unrelated)
        let lab = LocalTransformedSampleResearchLab(
          capability: researchCapability(),
          finalRevalidationHook: {
            switch mutation {
            case .inPlace:
              let replacementData = try Data(contentsOf: replacement)
              let handle = try FileHandle(forWritingTo: victim)
              try handle.truncate(atOffset: 0)
              try handle.write(contentsOf: replacementData)
              try handle.close()
            case .replacement:
              try FileManager.default.removeItem(at: victim)
              try FileManager.default.moveItem(at: replacement, to: victim)
            }
          })

        let result = try await lab.analyze(
          request(source: fixture.source, target: fixture.target))

        #expect(result.matches.isEmpty, "Unexpected match for \(subject) \(mutation)")
        #expect(
          result.abstentions.contains(where: {
            $0.reason == .immutableObservationChanged
              && $0.candidateID == (subject == .target ? "target" : nil)
          }))
      }
    }
  }

  @Test("Cancellation stops bounded local analysis")
  func cancellation() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: .gain)
    let task = Task {
      try await researchLab().analyze(request(source: fixture.source, target: fixture.target))
    }
    task.cancel()

    await #expect(throws: CancellationError.self) {
      try await task.value
    }
  }

  @Test("The in-flight window comparison loop observes self-cancellation")
  func inFlightComparisonCancellation() async throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let fixture = try TransformedSampleResearchTestSupport.writeFixturePair(
      root: root,
      transform: .gain)
    let lab = LocalTransformedSampleResearchLab(
      capability: researchCapability(),
      comparisonProgressHook: { count in
        guard count == 0 else { return }
        withUnsafeCurrentTask { task in
          task?.cancel()
        }
      })
    let task = Task.detached {
      try await lab.analyze(request(source: fixture.source, target: fixture.target))
    }

    await #expect(throws: CancellationError.self) {
      try await task.value
    }
  }

  private func researchLab() -> LocalTransformedSampleResearchLab {
    LocalTransformedSampleResearchLab(capability: researchCapability())
  }

  private func researchCapability() -> TransformedSampleResearchCapability {
    TransformedSampleResearchCapability(availability: .localResearchOnly)
  }

  private func request(
    source: URL,
    target: URL
  ) -> TransformedSampleResearchRequest {
    TransformedSampleResearchRequest(
      sourceID: "source",
      sourceURL: source,
      candidates: [
        TransformedSampleResearchCandidate(candidateID: "target", fileURL: target)
      ])
  }

  private func replacingAlgorithmVersions(
    in data: Data,
    matchVersion: String?,
    capabilityVersion: String?
  ) throws -> Data {
    guard var document = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      var matches = document["matches"] as? [[String: Any]],
      !matches.isEmpty,
      var capability = document["capability"] as? [String: Any]
    else { throw CocoaError(.coderInvalidValue) }
    if let matchVersion {
      matches[0]["algorithmVersion"] = matchVersion
      document["matches"] = matches
    }
    if let capabilityVersion {
      capability["algorithmVersion"] = capabilityVersion
      document["capability"] = capability
    }
    return try JSONSerialization.data(withJSONObject: document, options: [.sortedKeys])
  }

  private func firstMatchData(from resultData: Data) throws -> Data {
    guard let document = try JSONSerialization.jsonObject(with: resultData) as? [String: Any],
      let matches = document["matches"] as? [[String: Any]],
      let first = matches.first
    else { throw CocoaError(.coderInvalidValue) }
    return try JSONSerialization.data(withJSONObject: first, options: [.sortedKeys])
  }
}
