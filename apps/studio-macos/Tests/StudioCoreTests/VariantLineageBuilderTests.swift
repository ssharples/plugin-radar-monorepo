import Foundation
import Testing
@testable import StudioCore

@Suite("Variant Lineages")
struct VariantLineageBuilderTests {
  @Test("Builds independent Main and Clean lanes and links the branch origin")
  func cleanLane() {
    let revisions = [
      revision("main-11", "idea005_mix_1.1", at: 100),
      revision("clean-10", "idea005_clean_1.0", at: 110),
      revision("clean-12", "idea005_clean_1.2", at: 120),
    ]
    let origin = AudioLineageEdge(
      id: "branch", sourceNodeID: "clean-10", targetNodeID: "main-11",
      relationship: .variantDerivedFrom, confidence: .highConfidenceDerivative,
      explanation: "Shared backing identifies the branch origin.",
      algorithmVersion: "test", calibrationID: "test")

    let lanes = VariantLineageBuilder().build(revisions: revisions, lineageEdges: [origin])

    #expect(lanes.map(\.kind) == [.main, .cleanEdit])
    #expect(lanes[1].revisions.map(\.id) == ["clean-10", "clean-12"])
    #expect(lanes[1].originRevisionID == "main-11")
    #expect(lanes[1].revisions.last?.filenameInterpretation?.revisionIdentifier?.displayValue == "1.2")
  }

  private func revision(_ id: String, _ name: String, at timestamp: TimeInterval)
    -> StudioSetRevision
  {
    let set = AbletonSet(
      id: id, fileURL: URL(fileURLWithPath: "/Music/\(name).als"), displayName: name,
      isBackup: false, modifiedAt: Date(timeIntervalSince1970: timestamp),
      compressedBytes: 1, xmlBytes: 1, creator: nil,
      format: AbletonFormat(
        majorVersion: nil, minorVersion: nil, schemaChangeCount: nil, revision: nil),
      structure: SetStructure())
    return StudioSetRevision(
      id: id, set: set, revisionLabel: nil,
      filenameInterpretation: StudioFilenameParser().parse(name),
      timestamp: RevisionTimestamp(
        value: Date(timeIntervalSince1970: timestamp), source: .fileModificationTime,
        confidence: .suggested, explanation: "fixture"))
  }
}
