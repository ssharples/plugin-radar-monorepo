import Foundation
import Testing
@testable import StudioCore

@Suite("Studio filename semantics")
struct StudioFilenameParserTests {
  @Test("Scopes a decimal revision to the Clean Edit variant lane")
  func cleanVariantRevision() {
    let result = StudioFilenameParser().parse("idea005_clean_1.2.als")

    #expect(result.baseStem == "idea005")
    #expect(result.variant?.kind == .cleanEdit)
    #expect(result.variant?.rawToken == "clean")
    #expect(result.revisionIdentifier?.components == [1, 2])
    #expect(result.revisionIdentifier?.displayValue == "1.2")
    #expect(result.sessionRole == nil)
    #expect(result.unknownTokens.isEmpty)
  }

  @Test("Preserves decimal revisions when the catalogue name has no file extension")
  func extensionlessCatalogueName() {
    let result = StudioFilenameParser().parse("idea005_clean_1.2")

    #expect(result.baseStem == "idea005")
    #expect(result.variant?.kind == .cleanEdit)
    #expect(result.revisionIdentifier?.displayValue == "1.2")
  }

  @Test("Parses independent role and variant evidence")
  func cleanMix() {
    let result = StudioFilenameParser().parse("idea005_clean_mix_v3.als")

    #expect(result.baseStem == "idea005")
    #expect(result.variant?.kind == .cleanEdit)
    #expect(result.sessionRole?.kind == .mix)
    #expect(result.revisionIdentifier?.components == [3])
  }

  @Test("Does not turn an ambiguous prefix into a Song-level Clean Edit")
  func cleanGuitarIsAmbiguous() {
    let result = StudioFilenameParser().parse("clean_guitar_idea005.als")

    #expect(result.variant == nil)
    #expect(result.baseStem == "clean_guitar_idea005")
  }

  @Test("Treats final as naming intent rather than verified status")
  func finalCandidate() {
    let result = StudioFilenameParser().parse("EXAMPLE SONG_final_2.als")

    #expect(result.baseStem == "EXAMPLE SONG")
    #expect(result.workflowState?.kind == .finalCandidate)
    #expect(result.revisionIdentifier?.displayValue == "2")
    #expect(result.workflowState?.confidence == .suggested)
  }

  @Test("Preserves raw input and unknown suffix tokens")
  func preservesUnknownTokens() {
    let result = StudioFilenameParser().parse("idea005_clean_labelprint_1.2.als")

    #expect(result.rawFilename == "idea005_clean_labelprint_1.2.als")
    #expect(result.baseStem == "idea005")
    #expect(result.unknownTokens == ["labelprint"])
  }

  @Test("Persists accepted and rejected qualifier decisions across store instances")
  func qualifierDecisionsPersist() async throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appending(path: "organisation-overrides.plist")
    let decision = RevisionQualifierDecision(
      id: "revision:variant:clean", revisionID: "revision", facet: .variant,
      rawToken: "clean", accepted: false, parserVersion: StudioFilenameParser.algorithmVersion,
      decidedAt: Date(timeIntervalSince1970: 100))

    _ = try await OrganisationOverrideStore(storageURL: url).upsert(decision)
    let reopened = try await OrganisationOverrideStore(storageURL: url).load()

    #expect(reopened.qualifierDecisions == [decision])
  }
}
