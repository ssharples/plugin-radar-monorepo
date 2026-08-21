import Foundation

public enum RevisionArtifactKind: String, Codable, Sendable, CaseIterable {
  case stem
  case master
  case bounce
  case mix
  case render
}

public struct RevisionArtifactAssociation: Codable, Identifiable, Sendable {
  public let id: String
  public let asset: PreviewAsset
  public let kind: RevisionArtifactKind
  public let revisionID: String?
  public let confidence: OrganisationConfidence
  public let explanation: String

  public init(
    id: String,
    asset: PreviewAsset,
    kind: RevisionArtifactKind,
    revisionID: String?,
    confidence: OrganisationConfidence,
    explanation: String
  ) {
    self.id = id
    self.asset = asset
    self.kind = kind
    self.revisionID = revisionID
    self.confidence = confidence
    self.explanation = explanation
  }
}

/// Connects discovered export audio to the most plausible Set revision without claiming that a
/// filesystem timestamp proves render provenance. Explicit Set-name evidence outranks chronology.
public struct RevisionArtifactResolver: Sendable {
  public static let algorithmVersion = "revision-artifact-v1"

  public init() {}

  public func resolve(
    assets: [PreviewAsset],
    revisions: [StudioSetRevision]
  ) -> [RevisionArtifactAssociation] {
    assets.compactMap { asset in
      guard let kind = artifactKind(for: asset) else { return nil }
      let namedMatches = revisions.filter {
        let revisionName = Self.normalized($0.set.displayName)
        return revisionName.count >= 4
          && Self.normalized(asset.fileURL.deletingPathExtension().lastPathComponent)
            .contains(revisionName)
      }
      let selected: StudioSetRevision?
      let confidence: OrganisationConfidence
      let explanation: String
      let mostSpecificNamedMatches = mostSpecific(namedMatches)
      if mostSpecificNamedMatches.count == 1 {
        selected = mostSpecificNamedMatches[0]
        confidence = .automatic
        explanation =
          "The export filename contains the Set name; its path and modification time remain supporting evidence, not proof of the render engine."
      } else if let modifiedAt = asset.modifiedAt {
        let prior = revisions.compactMap { revision -> (StudioSetRevision, Date)? in
          let date = revision.timestamp.value ?? revision.set.modifiedAt
          guard let date, date <= modifiedAt.addingTimeInterval(2) else { return nil }
          return (revision, date)
        }.sorted { $0.1 > $1.1 }
        selected = prior.first?.0
        confidence = selected == nil ? .unresolved : .suggested
        explanation =
          selected == nil
          ? "An export-like audio file was found in this Session, but no earlier Set save can anchor it."
          : "This is the nearest Set save before the export timestamp. Review before treating it as the source revision."
      } else {
        selected = nil
        confidence = .unresolved
        explanation =
          "An export-like audio file was found in this Session, but it has no usable timestamp or Set-name evidence."
      }
      return RevisionArtifactAssociation(
        id: StableID.forValue(
          "revision-artifact:\(asset.id):\(selected?.id ?? "unassigned"):\(kind.rawValue)"),
        asset: asset,
        kind: kind,
        revisionID: selected?.id,
        confidence: confidence,
        explanation: explanation)
    }.sorted {
      let left = $0.asset.modifiedAt ?? .distantPast
      let right = $1.asset.modifiedAt ?? .distantPast
      if left != right { return left > right }
      return $0.asset.fileURL.lastPathComponent.localizedStandardCompare(
        $1.asset.fileURL.lastPathComponent) == .orderedAscending
    }
  }

  private func artifactKind(for asset: PreviewAsset) -> RevisionArtifactKind? {
    guard asset.category == .otherAudio || asset.isLikelyUserRender else { return nil }
    let tokens = asset.fileURL.pathComponents
      .flatMap { $0.lowercased().split { !$0.isLetter && !$0.isNumber } }
      .map(String.init)
    if tokens.contains("stems") || tokens.contains("stem") { return .stem }
    if tokens.contains("masters") || tokens.contains("master") { return .master }
    if tokens.contains("bounces") || tokens.contains("bounce") { return .bounce }
    if tokens.contains("mixes") || tokens.contains("mix") || tokens.contains("mixed")
      || tokens.contains("mixdown")
    {
      return .mix
    }
    if tokens.contains("exports") || tokens.contains("export") || tokens.contains("render") {
      return .render
    }
    return asset.isLikelyUserRender ? .render : nil
  }

  private func mostSpecific(_ revisions: [StudioSetRevision]) -> [StudioSetRevision] {
    guard let longest = revisions.map({ Self.normalized($0.set.displayName).count }).max() else {
      return []
    }
    return revisions.filter { Self.normalized($0.set.displayName).count == longest }
  }

  private static func normalized(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      .lowercased()
      .filter { $0.isLetter || $0.isNumber }
  }
}
