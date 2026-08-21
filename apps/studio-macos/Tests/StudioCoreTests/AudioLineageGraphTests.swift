import Foundation
import Testing

@testable import StudioCore

@Suite("Audio Identity and Lineage Graph")
struct AudioLineageGraphTests {
  @Test("Persists one Content Asset with every verified physical location")
  func contentAssetLocationsPersist() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = directory.appending(path: "source.wav")
    let collected = directory.appending(path: "Samples/Collected/renamed.wav")
    try FileManager.default.createDirectory(
      at: collected.deletingLastPathComponent(), withIntermediateDirectories: true)
    try Data("identical-audio-bytes".utf8).write(to: source)
    try FileManager.default.copyItem(at: source, to: collected)
    let identityService = AudioContentIdentityService()
    let sourceIdentity = try identityService.identify(source, decodeAudio: false)
    let collectedIdentity = try identityService.identify(collected, decodeAudio: false)
    let storeURL = directory.appending(path: "lineage.sqlite")

    do {
      let store = try AudioLineageStore(storageURL: storeURL)
      _ = try store.register(
        sourceIdentity, provenance: .externalLibrary,
        provenanceExplanation: "Selected sample location")
      _ = try store.register(
        collectedIdentity, provenance: .projectCollected,
        provenanceExplanation: "Ableton Samples/Collected location")
      let assets = try store.contentAssets()
      #expect(assets.count == 1)
      #expect(try store.locations(for: assets[0].id).count == 2)
      #expect(try store.collectedCopyLinks(for: assets[0].id).count == 1)
    }

    let reopened = try AudioLineageStore(storageURL: storeURL)
    let asset = try #require(reopened.contentAssets().first)
    #expect(try reopened.locations(for: asset.id).map(\.provenance).contains(.externalLibrary))
    #expect(try reopened.locations(for: asset.id).map(\.provenance).contains(.projectCollected))
  }

  @Test("Persists directional segment and transformation evidence")
  func lineageEdgePersists() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let store = try AudioLineageStore(storageURL: directory.appending(path: "lineage.sqlite"))
    let edge = AudioLineageEdge(
      id: "edge-1",
      sourceNodeID: "sample-vocal",
      targetNodeID: "bounce-main",
      relationship: .containedSegment,
      confidence: .highConfidenceDerivative,
      explanation: "A distinctive vocal region aligns in the bounce.",
      algorithmVersion: "landmark-v1",
      sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 8),
      targetRange: AudioTimeRange(startSeconds: 32, durationSeconds: 8),
      transform: AudioTransformEvidence(timeFactor: 1, pitchSemitones: 0),
      evidence: [
        AudioMatchEvidence(
          kind: .landmarkFingerprint, score: 0.97,
          explanation: "Aligned landmarks across the complete query range.")
      ]
    )

    try store.save(edge)
    let stored = try #require(store.edges(for: "sample-vocal").first)
    #expect(stored == edge)
    #expect(stored.targetRange?.startSeconds == 32)
  }

  @Test("Automation policy permits catalogue links but never physical mutation")
  func automationSafety() {
    let policy = AudioLineageAutomationPolicy()
    let verified = AudioLineageEdge(
      id: "verified", sourceNodeID: "a", targetNodeID: "b",
      relationship: .exactDecodedAudio, confidence: .verifiedIdentity,
      explanation: "Complete canonical PCM hashes agree.", algorithmVersion: "pcm-v1")
    let suggested = AudioLineageEdge(
      id: "suggested", sourceNodeID: "session-a", targetNodeID: "work-b",
      relationship: .sessionDerivedFrom, confidence: .suggested,
      explanation: "One audio anchor overlaps.", algorithmVersion: "lineage-v1")

    #expect(policy.allowedActions(for: verified).contains(.uniteContentLocations))
    #expect(policy.allowedActions(for: verified).contains(.preselectMissingFileCandidate))
    #expect(policy.allowedActions(for: suggested) == [.queueForReview])
    #expect(!policy.allowedActions(for: verified).contains(.moveFile))
    #expect(!policy.allowedActions(for: verified).contains(.deleteFile))
    #expect(!policy.allowedActions(for: verified).contains(.rewriteDAWProject))
  }

  @Test("Excerpt sequence evidence remains distinct and review-only")
  func excerptSequenceEvidenceIsReviewOnly() {
    let edge = AudioLineageEdge(
      id: "excerpt",
      sourceNodeID: "query",
      targetNodeID: "reference",
      relationship: .containedSegment,
      confidence: .suggested,
      explanation: "A bounded exact sequence re-score retained a located excerpt.",
      algorithmVersion: LocalLandmarkAudioMatcher.excerptRetrievalAlgorithmVersion,
      sourceRange: AudioTimeRange(startSeconds: 0, durationSeconds: 6),
      targetRange: AudioTimeRange(startSeconds: 12, durationSeconds: 6),
      evidence: [
        AudioMatchEvidence(
          kind: .excerptSequenceAlignment,
          score: 0.91,
          explanation: "Approximate retrieval proposed; exact sequence verification decided.")
      ])

    #expect(edge.evidence.first?.kind == .excerptSequenceAlignment)
    #expect(edge.evidence.first?.kind != .semanticEmbedding)
    #expect(AudioLineageAutomationPolicy().allowedActions(for: edge) == [.queueForReview])
  }
}
