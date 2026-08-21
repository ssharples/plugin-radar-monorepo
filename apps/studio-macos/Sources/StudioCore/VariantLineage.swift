import Foundation

public enum StudioVariantLaneKind: String, Codable, Sendable, CaseIterable {
  case main
  case cleanEdit
  case explicit
  case instrumental
  case acapella
  case radioEdit
  case extended

  init(_ variant: StudioVariantKind?) {
    self = switch variant {
    case nil: .main
    case .cleanEdit: .cleanEdit
    case .explicit: .explicit
    case .instrumental: .instrumental
    case .acapella: .acapella
    case .radioEdit: .radioEdit
    case .extended: .extended
    }
  }
}

public struct StudioVariantLineage: Codable, Identifiable, Sendable {
  public let id: String
  public let kind: StudioVariantLaneKind
  public let revisions: [StudioSetRevision]
  public let originRevisionID: String?
  public let originEvidence: AudioLineageEdge?

  public init(
    id: String,
    kind: StudioVariantLaneKind,
    revisions: [StudioSetRevision],
    originRevisionID: String?,
    originEvidence: AudioLineageEdge?
  ) {
    self.id = id
    self.kind = kind
    self.revisions = revisions
    self.originRevisionID = originRevisionID
    self.originEvidence = originEvidence
  }
}

public struct VariantLineageBuilder: Sendable {
  public init() {}

  public func build(
    revisions: [StudioSetRevision],
    lineageEdges: [AudioLineageEdge] = []
  ) -> [StudioVariantLineage] {
    let grouped = Dictionary(grouping: revisions) { revision in
      StudioVariantLaneKind(revision.filenameInterpretation?.variant?.kind)
    }
    return grouped.map { kind, revisions in
      let sorted = revisions.sorted(by: Self.revisionSort)
      let revisionIDs = Set(sorted.map(\.id))
      let origin = lineageEdges.first {
        $0.relationship == .variantDerivedFrom && revisionIDs.contains($0.sourceNodeID)
      }
      return StudioVariantLineage(
        id: StableID.forValue("variant-lineage:\(kind.rawValue):\(sorted.map(\.id).joined(separator: ":"))"),
        kind: kind,
        revisions: sorted,
        originRevisionID: origin?.targetNodeID,
        originEvidence: origin)
    }.sorted { left, right in
      if left.kind == .main { return true }
      if right.kind == .main { return false }
      return left.kind.rawValue < right.kind.rawValue
    }
  }

  private static func revisionSort(_ left: StudioSetRevision, _ right: StudioSetRevision) -> Bool {
    if let leftIdentifier = left.filenameInterpretation?.revisionIdentifier?.components,
      let rightIdentifier = right.filenameInterpretation?.revisionIdentifier?.components,
      leftIdentifier != rightIdentifier
    {
      return leftIdentifier.lexicographicallyPrecedes(rightIdentifier)
    }
    switch (left.timestamp.value, right.timestamp.value) {
    case (let left?, let right?) where left != right: return left < right
    default: return left.id < right.id
    }
  }
}
