import Foundation
import Testing

@testable import StudioCore

@Suite("Personal chain recommendations")
struct ChainRecommendationTests {
  @Test("Infers common production contexts")
  func infersContexts() {
    let engine = ChainRecommendationEngine()
    #expect(engine.inferContext(trackName: "Lead Vox") == .vocal)
    #expect(engine.inferContext(trackName: "GTR DI") == .guitar)
    #expect(engine.inferContext(trackName: "Kick Print") == .drums)
    #expect(engine.inferContext(trackName: "PreMaster") == .master)
    #expect(engine.inferContext(trackName: "Texture 7") == .other)
  }

  @Test("Ranks only chains used in the requested context and explains the evidence")
  func recommendsFromPersonalHistory() throws {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    let vocal = occurrence(id: "vocal", trackName: "Lead Vocal", modifiedAt: now)
    let guitar = occurrence(id: "guitar", trackName: "Guitar DI", modifiedAt: now)
    let vocalFamily = family(id: "vocal-family", occurrences: [vocal])
    let guitarFamily = family(id: "guitar-family", occurrences: [guitar])
    let library = PersonalChainLibrary(
      families: [guitarFamily, vocalFamily],
      occurrences: [guitar, vocal],
      pluginUsage: []
    )

    let results = ChainRecommendationEngine().recommend(
      for: .vocal,
      library: library,
      now: now
    )

    let result = try #require(results.first)
    #expect(results.count == 1)
    #expect(result.family.signature == vocalFamily.signature)
    #expect(result.representative.trackName == "Lead Vocal")
    #expect(result.reasons.contains("Used once on a similar track"))
  }

  private func family(id: String, occurrences: [ChainOccurrence]) -> ChainFamily {
    ChainFamily(
      signature: id,
      displayName: "Example EQ",
      occurrences: occurrences,
      stateVariationCount: 1,
      projectCount: 1
    )
  }

  private func occurrence(id: String, trackName: String, modifiedAt: Date) -> ChainOccurrence {
    let plugin = PluginIdentity(
      format: .vst3,
      name: "Example EQ",
      manufacturer: "Example Audio",
      identifier: "eq-1"
    )
    let device = SetDevice(
      id: "device-\(id)",
      xmlID: id,
      kind: .vst3,
      typeName: "PluginDevice",
      displayName: "Example EQ",
      isEnabled: true,
      plugin: plugin,
      stateDigest: id,
      nestedDevices: [],
      resourceReferences: []
    )
    return ChainOccurrence(
      id: id,
      signature: "family-\(id)",
      projectID: "project-\(id)",
      projectName: "Project \(id)",
      timelineID: "timeline-\(id)",
      setID: "set-\(id)",
      setName: "Mix",
      trackID: "track-\(id)",
      trackName: trackName,
      trackKind: .audio,
      modifiedAt: modifiedAt,
      devices: [device],
      compatibility: nil,
      recoveryCapability: .inspectOnly
    )
  }
}
