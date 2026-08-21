import Foundation

public enum StudioLiveInsertKind: String, Codable, CaseIterable, Sendable {
  case track
  case audioClip
  case audioFile
  case deviceChain
}

public enum StudioLiveInsertDelivery: String, Codable, CaseIterable, Sendable {
  /// Reserved for a future qualified Ableton adapter. The search index never emits this today.
  case directInsertion
  case userDraggableFile
  case requiresLiveBrowser
  case inspectOnly
}

public struct StudioLiveInsertHit: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: StudioLiveInsertKind
  public let title: String
  public let detail: String
  public let projectName: String?
  public let setName: String?
  public let fileURL: URL?
  public let rootURL: URL
  public let projectID: String?
  public let timelineID: String?
  public let setID: String?
  public let trackID: String?
  public let delivery: StudioLiveInsertDelivery
  public let score: Double
  public let matchReasons: [String]

  public init(
    id: String,
    kind: StudioLiveInsertKind,
    title: String,
    detail: String,
    projectName: String?,
    setName: String?,
    fileURL: URL?,
    rootURL: URL,
    projectID: String?,
    timelineID: String?,
    setID: String?,
    trackID: String?,
    delivery: StudioLiveInsertDelivery,
    score: Double,
    matchReasons: [String]
  ) {
    self.id = id
    self.kind = kind
    self.title = title
    self.detail = detail
    self.projectName = projectName
    self.setName = setName
    self.fileURL = fileURL?.standardizedFileURL
    self.rootURL = rootURL.standardizedFileURL
    self.projectID = projectID
    self.timelineID = timelineID
    self.setID = setID
    self.trackID = trackID
    self.delivery = delivery
    self.score = score
    self.matchReasons = matchReasons
  }
}

/// Private, deterministic retrieval for the global Live Insert palette.
///
/// This index understands producer vocabulary but does not infer audio identity and does not execute
/// Ableton actions. A future embedding backend may add candidates before this exact reranker.
public struct StudioLiveInsertSearchIndex: Sendable {
  private let documents: [LiveInsertDocument]

  public init(index: StudioLibraryIndex) {
    self.init(indexes: [index])
  }

  public init(indexes: [StudioLibraryIndex]) {
    let ordered = indexes.sorted { $0.rootURL.path.count > $1.rootURL.path.count }
    var documentsByID: [String: LiveInsertDocument] = [:]
    for document in ordered.flatMap(Self.documents) where documentsByID[document.id] == nil {
      documentsByID[document.id] = document
    }
    documents = Array(documentsByID.values)
  }

  public func search(_ query: String, limit: Int = 80) -> [StudioLiveInsertHit] {
    let normalizedQuery = Self.normalize(query)
    guard !normalizedQuery.isEmpty, limit > 0 else { return [] }
    let queryTokens = normalizedQuery.split(separator: " ").map(String.init)
    let intent = LiveInsertIntent(tokens: queryTokens)

    return documents.compactMap { document in
      match(document, queryTokens: queryTokens, intent: intent)
    }
    .sorted {
      if $0.score != $1.score { return $0.score > $1.score }
      if $0.kind != $1.kind { return $0.kind.rawValue < $1.kind.rawValue }
      return $0.title.localizedStandardCompare($1.title) == .orderedAscending
    }
    .prefix(limit)
    .map { $0 }
  }

  private func match(
    _ document: LiveInsertDocument,
    queryTokens: [String],
    intent: LiveInsertIntent
  ) -> StudioLiveInsertHit? {
    if let requiredKind = intent.requiredKind, document.kind != requiredKind { return nil }

    var score = document.kind == .track ? 8.0 : 0
    var reasons = Set<String>()
    for token in queryTokens where !Self.nonEvidenceTokens.contains(token) {
      if document.titleTokens.contains(token) {
        score += 24
        reasons.insert("Matched name")
      } else if document.projectTokens.contains(token) {
        score += 20
        if let projectName = document.projectName {
          reasons.insert("Matched project \(projectName)")
        }
      } else if document.termTokens.contains(token) {
        score += 14
        reasons.insert("Matched indexed evidence")
      } else if document.allTokens.contains(where: { $0.hasPrefix(token) }) {
        score += 10
        reasons.insert("Matched prefix")
      } else if let concept = Self.concept(for: token),
        !document.allTokens.isDisjoint(with: concept.terms)
      {
        score += 9
        reasons.insert("Matched \(concept.name) vocabulary")
      } else {
        return nil
      }
    }

    if intent.requiredKind == document.kind {
      score += 48
      reasons.insert(intent.reason)
    }
    if document.normalizedTitle == queryTokens.joined(separator: " ") { score += 50 }
    if let modifiedAt = document.modifiedAt {
      let ageInDays = max(0, Date().timeIntervalSince(modifiedAt) / 86_400)
      score += 5 * exp(-ageInDays / 730)
    }

    return StudioLiveInsertHit(
      id: document.id,
      kind: document.kind,
      title: document.title,
      detail: document.detail,
      projectName: document.projectName,
      setName: document.setName,
      fileURL: document.fileURL,
      rootURL: document.rootURL,
      projectID: document.projectID,
      timelineID: document.timelineID,
      setID: document.setID,
      trackID: document.trackID,
      delivery: document.delivery,
      score: score,
      matchReasons: reasons.sorted())
  }

  private static func documents(index: StudioLibraryIndex) -> [LiveInsertDocument] {
    var result: [LiveInsertDocument] = []
    for project in index.projects {
      for timeline in project.timelines {
        for set in timeline.versions {
          for track in set.content.tracks {
            let trackTerms = [track.kind.rawValue] + track.clips.map(\.name)
            result.append(
              LiveInsertDocument(
                id: "live-insert:track:\(set.id):\(track.id)",
                kind: .track,
                title: track.name,
                detail: "\(track.kind.displayName) track",
                terms: trackTerms,
                project: project,
                timeline: timeline,
                set: set,
                trackID: track.id,
                fileURL: set.fileURL,
                delivery: .requiresLiveBrowser))

            if !track.devices.isEmpty {
              let devices = track.devices.flatMap(\.flattenedForLiveInsert)
              let names = devices.map(\.displayName)
              let deviceTerms = devices.flatMap {
                [$0.displayName, $0.typeName, $0.plugin?.name ?? "", $0.plugin?.manufacturer ?? ""]
              }
              result.append(
                LiveInsertDocument(
                  id: "live-insert:chain:\(set.id):\(track.id)",
                  kind: .deviceChain,
                  title: "\(track.name) chain",
                  detail: names.joined(separator: " → "),
                  terms: ["chain", "rack", "processing", "effects", track.name] + deviceTerms,
                  project: project,
                  timeline: timeline,
                  set: set,
                  trackID: track.id,
                  fileURL: set.fileURL,
                  delivery: .requiresLiveBrowser))
            }

            for clip in track.clips where clip.kind == .audio {
              let resolvedURL = set.content.dependencies.first {
                $0.ownerID == clip.id && $0.kind == .clipAudio && $0.availability == .available
              }?.resolvedURL
              result.append(
                LiveInsertDocument(
                  id: "live-insert:clip:\(set.id):\(clip.id)",
                  kind: .audioClip,
                  title: clip.name,
                  detail: "\(track.name) · \(clip.placement.rawValue) audio clip",
                  terms: ["sample", "audio", "clip", "stem", track.name],
                  project: project,
                  timeline: timeline,
                  set: set,
                  trackID: track.id,
                  fileURL: resolvedURL ?? set.fileURL,
                  delivery: resolvedURL == nil ? .requiresLiveBrowser : .userDraggableFile))
            }
          }
        }
      }

      for asset in project.previewAssets {
        result.append(audioDocument(asset: asset, project: project, rootURL: index.rootURL))
      }
    }

    for asset in index.unassignedAudioAssets {
      result.append(
        LiveInsertDocument(
          id: "live-insert:audio:\(asset.id)",
          kind: .audioFile,
          title: asset.fileURL.deletingPathExtension().lastPathComponent,
          detail: "Loose audio · \(asset.category.rawValue)",
          terms: ["sample", "audio", "file", asset.category.rawValue],
          rootURL: index.rootURL,
          fileURL: asset.fileURL,
          modifiedAt: asset.modifiedAt,
          delivery: .userDraggableFile))
    }
    return result
  }

  private static func audioDocument(
    asset: PreviewAsset,
    project: StudioProject,
    rootURL: URL
  ) -> LiveInsertDocument {
    LiveInsertDocument(
      id: "live-insert:audio:\(asset.id)",
      kind: .audioFile,
      title: asset.fileURL.deletingPathExtension().lastPathComponent,
      detail: "Project audio · \(asset.category.rawValue)",
      terms: ["sample", "audio", "file", "bounce", "render", asset.category.rawValue],
      rootURL: rootURL,
      projectID: project.id,
      projectName: project.displayName,
      fileURL: asset.fileURL,
      modifiedAt: asset.modifiedAt,
      delivery: .userDraggableFile)
  }

  private static func concept(for token: String) -> LiveInsertConcept? {
    concepts.first { $0.terms.contains(token) }
  }

  private static let concepts: [LiveInsertConcept] = [
    LiveInsertConcept(name: "vocal", terms: ["vocal", "vocals", "vox", "voice", "singer"]),
    LiveInsertConcept(name: "lead", terms: ["lead", "main", "topline", "primary"]),
    LiveInsertConcept(name: "harmony", terms: ["harmony", "harmonies", "backing", "bv", "bvs"]),
    LiveInsertConcept(
      name: "drum", terms: ["drum", "drums", "kick", "snare", "hat", "hihat", "perc", "percussion"]),
    LiveInsertConcept(name: "guitar", terms: ["guitar", "gtr", "acoustic", "electric"]),
    LiveInsertConcept(name: "keyboard", terms: ["keys", "piano", "rhodes", "organ", "keyboard"]),
    LiveInsertConcept(name: "synth", terms: ["synth", "synthesizer", "pad", "arp"]),
  ]

  private static let nonEvidenceTokens = LiveInsertIntent.intentTokens.union([
    "a", "an", "bring", "find", "for", "from", "get", "give", "i", "inside", "into", "layer",
    "me", "my", "need", "of", "part", "please", "the", "to", "use", "want",
  ])

  fileprivate static func normalize(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      .lowercased()
      .split { !$0.isLetter && !$0.isNumber }
      .joined(separator: " ")
  }
}

private struct LiveInsertConcept: Sendable {
  let name: String
  let terms: Set<String>
}

private struct LiveInsertIntent: Sendable {
  static let chainTokens: Set<String> = ["chain", "rack", "processing", "effects", "fx"]
  static let sampleTokens: Set<String> = ["sample", "audiofile"]
  static let intentTokens = chainTokens.union(sampleTokens)

  let requiredKind: StudioLiveInsertKind?
  let reason: String

  init(tokens: [String]) {
    let words = Set(tokens)
    if !words.isDisjoint(with: Self.chainTokens) {
      requiredKind = .deviceChain
      reason = "Matched device-chain intent"
    } else if !words.isDisjoint(with: Self.sampleTokens) {
      requiredKind = nil
      reason = "Matched audio intent"
    } else {
      requiredKind = nil
      reason = ""
    }
  }
}

private struct LiveInsertDocument: Sendable {
  let id: String
  let kind: StudioLiveInsertKind
  let title: String
  let detail: String
  let projectName: String?
  let setName: String?
  let fileURL: URL?
  let rootURL: URL
  let projectID: String?
  let timelineID: String?
  let setID: String?
  let trackID: String?
  let modifiedAt: Date?
  let delivery: StudioLiveInsertDelivery
  let normalizedTitle: String
  let titleTokens: Set<String>
  let projectTokens: Set<String>
  let termTokens: Set<String>
  let allTokens: Set<String>

  init(
    id: String,
    kind: StudioLiveInsertKind,
    title: String,
    detail: String,
    terms: [String],
    project: StudioProject,
    timeline: SetTimeline,
    set: AbletonSet,
    trackID: String?,
    fileURL: URL?,
    delivery: StudioLiveInsertDelivery
  ) {
    self.init(
      id: id,
      kind: kind,
      title: title,
      detail: detail,
      terms: terms + [timeline.displayName],
      rootURL: project.rootURL,
      projectID: project.id,
      projectName: project.displayName,
      timelineID: timeline.id,
      setID: set.id,
      setName: set.displayName,
      trackID: trackID,
      fileURL: fileURL,
      modifiedAt: set.modifiedAt,
      delivery: delivery)
  }

  init(
    id: String,
    kind: StudioLiveInsertKind,
    title: String,
    detail: String,
    terms: [String],
    rootURL: URL,
    projectID: String? = nil,
    projectName: String? = nil,
    timelineID: String? = nil,
    setID: String? = nil,
    setName: String? = nil,
    trackID: String? = nil,
    fileURL: URL?,
    modifiedAt: Date?,
    delivery: StudioLiveInsertDelivery
  ) {
    self.id = id
    self.kind = kind
    self.title = title
    self.detail = detail
    self.projectName = projectName
    self.setName = setName
    self.fileURL = fileURL
    self.rootURL = rootURL
    self.projectID = projectID
    self.timelineID = timelineID
    self.setID = setID
    self.trackID = trackID
    self.modifiedAt = modifiedAt
    self.delivery = delivery
    normalizedTitle = StudioLiveInsertSearchIndex.normalize(title)
    titleTokens = Set(normalizedTitle.split(separator: " ").map(String.init))
    projectTokens = Set(
      StudioLiveInsertSearchIndex.normalize(projectName ?? "").split(separator: " ").map(
        String.init))
    termTokens = Set(
      StudioLiveInsertSearchIndex.normalize(
        ([detail, setName ?? ""] + terms).joined(separator: " ")
      )
      .split(separator: " ").map(String.init))
    allTokens = titleTokens.union(projectTokens).union(termTokens)
  }
}

extension SetDevice {
  fileprivate var flattenedForLiveInsert: [SetDevice] {
    [self] + nestedDevices.flatMap(\.flattenedForLiveInsert)
  }
}

extension SetTrackKind {
  fileprivate var displayName: String {
    switch self {
    case .audio: "Audio"
    case .midi: "MIDI"
    case .group: "Group"
    case .returnTrack: "Return"
    case .main: "Main"
    }
  }
}
