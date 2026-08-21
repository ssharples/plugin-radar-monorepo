import Foundation

public enum StudioSearchKind: String, Codable, CaseIterable, Sendable {
  case project
  case set
  case track
  case clip
  case device
  case locator
  case audio
}

public struct StudioSearchHit: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let kind: StudioSearchKind
  public let title: String
  public let context: String
  public let fileURL: URL?
  public let rootURL: URL
  public let projectID: String?
  public let timelineID: String?
  public let setID: String?
  public let trackID: String?
  public let score: Double

  public init(
    id: String,
    kind: StudioSearchKind,
    title: String,
    context: String,
    fileURL: URL?,
    rootURL: URL,
    projectID: String?,
    timelineID: String?,
    setID: String?,
    trackID: String?,
    score: Double
  ) {
    self.id = id
    self.kind = kind
    self.title = title
    self.context = context
    self.fileURL = fileURL
    self.rootURL = rootURL
    self.projectID = projectID
    self.timelineID = timelineID
    self.setID = setID
    self.trackID = trackID
    self.score = score
  }
}

public struct StudioSearchIndex: Sendable {
  private let documents: [SearchDocument]

  public init(index: StudioLibraryIndex) {
    self.init(indexes: [index])
  }

  public init(indexes: [StudioLibraryIndex]) {
    // A user may intentionally track overlapping roots, such as their home folder and
    // Downloads. The same file-backed object keeps the same local identity in both indexes;
    // emit it once and attribute it to the most specific registered root.
    let orderedIndexes = indexes.sorted { $0.rootURL.path.count > $1.rootURL.path.count }
    var documentsByID: [String: SearchDocument] = [:]
    for document in orderedIndexes.flatMap(Self.documents) where documentsByID[document.id] == nil {
      documentsByID[document.id] = document
    }
    documents = Array(documentsByID.values)
  }

  public func search(
    _ query: String,
    kinds: Set<StudioSearchKind> = Set(StudioSearchKind.allCases),
    limit: Int = 100
  ) -> [StudioSearchHit] {
    let normalizedQuery = normalize(query)
    guard !normalizedQuery.isEmpty, limit > 0 else { return [] }
    let queryTokens = Set(normalizedQuery.split(separator: " ").map(String.init))
    return documents.compactMap { document -> StudioSearchHit? in
      guard kinds.contains(document.kind) else { return nil }
      guard
        let score = matchScore(
          query: normalizedQuery,
          queryTokens: queryTokens,
          title: document.normalizedTitle,
          searchable: document.searchable,
          modifiedAt: document.modifiedAt
        )
      else { return nil }
      return StudioSearchHit(
        id: document.id,
        kind: document.kind,
        title: document.title,
        context: document.context,
        fileURL: document.fileURL,
        rootURL: document.rootURL,
        projectID: document.projectID,
        timelineID: document.timelineID,
        setID: document.setID,
        trackID: document.trackID,
        score: score
      )
    }
    .sorted {
      if $0.score != $1.score { return $0.score > $1.score }
      return $0.title.localizedStandardCompare($1.title) == .orderedAscending
    }
    .prefix(limit)
    .map { $0 }
  }

  private static func documents(index: StudioLibraryIndex) -> [SearchDocument] {
    var documents: [SearchDocument] = []
    for project in index.projects {
      documents.append(
        SearchDocument(
          id: "search:project:\(project.id)",
          kind: .project,
          title: project.displayName,
          terms: [],
          context: "Project",
          fileURL: project.rootURL,
          rootURL: index.rootURL,
          projectID: project.id
        )
      )
      for timeline in project.timelines {
        for set in timeline.versions {
          let setContext = set.isBackup ? "\(project.displayName) · Backup" : project.displayName
          documents.append(
            SearchDocument(
              id: "search:set:\(set.id)",
              kind: .set,
              title: set.displayName,
              terms: [timeline.displayName, set.creator ?? ""],
              context: setContext,
              fileURL: set.fileURL,
              rootURL: index.rootURL,
              projectID: project.id,
              timelineID: timeline.id,
              setID: set.id,
              modifiedAt: set.modifiedAt
            )
          )
          appendContentDocuments(
            set: set,
            project: project,
            timeline: timeline,
            rootURL: index.rootURL,
            to: &documents
          )
        }
      }
      for asset in project.previewAssets {
        documents.append(
          audioDocument(asset: asset, project: project, rootURL: index.rootURL)
        )
      }
    }
    for asset in index.unassignedAudioAssets {
      documents.append(
        SearchDocument(
          id: "search:audio:\(asset.id)",
          kind: .audio,
          title: asset.fileURL.deletingPathExtension().lastPathComponent,
          terms: [
            asset.category.rawValue, asset.isLikelyUserRender ? "render bounce mix master" : "",
          ],
          context: "Loose audio",
          fileURL: asset.fileURL,
          rootURL: index.rootURL,
          modifiedAt: asset.modifiedAt
        )
      )
    }
    return documents
  }

  private static func appendContentDocuments(
    set: AbletonSet,
    project: StudioProject,
    timeline: SetTimeline,
    rootURL: URL,
    to documents: inout [SearchDocument]
  ) {
    let baseContext = "\(project.displayName) · \(set.displayName)"
    for track in set.content.tracks {
      documents.append(
        SearchDocument(
          id: "search:track:\(set.id):\(track.id)",
          kind: .track,
          title: track.name,
          terms: [track.kind.rawValue],
          context: baseContext,
          fileURL: set.fileURL,
          rootURL: rootURL,
          projectID: project.id,
          timelineID: timeline.id,
          setID: set.id,
          trackID: track.id,
          modifiedAt: set.modifiedAt
        )
      )
      for clip in track.clips {
        documents.append(
          SearchDocument(
            id: "search:clip:\(set.id):\(clip.id)",
            kind: .clip,
            title: clip.name,
            terms: [track.name, clip.kind.rawValue, clip.placement.rawValue],
            context: "\(baseContext) · \(track.name)",
            fileURL: clip.sampleReference.flatMap { reference in
              set.content.dependencies.first(where: {
                $0.ownerID == clip.id && $0.reference == reference
              })?.resolvedURL
            } ?? set.fileURL,
            rootURL: rootURL,
            projectID: project.id,
            timelineID: timeline.id,
            setID: set.id,
            trackID: track.id,
            modifiedAt: set.modifiedAt
          )
        )
      }
      for device in track.devices.flatMap(\.flattenedForSearch) {
        documents.append(
          SearchDocument(
            id: "search:device:\(set.id):\(device.id)",
            kind: .device,
            title: device.displayName,
            terms: [
              track.name,
              device.typeName,
              device.plugin?.name ?? "",
              device.plugin?.manufacturer ?? "",
              device.plugin?.format.rawValue ?? "",
            ],
            context: "\(baseContext) · \(track.name)",
            fileURL: set.fileURL,
            rootURL: rootURL,
            projectID: project.id,
            timelineID: timeline.id,
            setID: set.id,
            trackID: track.id,
            modifiedAt: set.modifiedAt
          )
        )
      }
    }
    for locator in set.content.locators {
      documents.append(
        SearchDocument(
          id: "search:locator:\(set.id):\(locator.id)",
          kind: .locator,
          title: locator.name,
          terms: [set.displayName],
          context: baseContext,
          fileURL: set.fileURL,
          rootURL: rootURL,
          projectID: project.id,
          timelineID: timeline.id,
          setID: set.id,
          modifiedAt: set.modifiedAt
        )
      )
    }
  }

  private static func audioDocument(
    asset: PreviewAsset,
    project: StudioProject,
    rootURL: URL
  ) -> SearchDocument {
    SearchDocument(
      id: "search:audio:\(asset.id)",
      kind: .audio,
      title: asset.fileURL.deletingPathExtension().lastPathComponent,
      terms: [
        project.displayName,
        asset.category.rawValue,
        asset.isLikelyUserRender ? "render bounce mix master" : "",
      ],
      context: project.displayName,
      fileURL: asset.fileURL,
      rootURL: rootURL,
      projectID: project.id,
      modifiedAt: asset.modifiedAt
    )
  }

  private func matchScore(
    query: String,
    queryTokens: Set<String>,
    title: String,
    searchable: String,
    modifiedAt: Date?
  ) -> Double? {
    let documentTokens = Set(searchable.split(separator: " ").map(String.init))
    guard
      queryTokens.allSatisfy({ token in
        documentTokens.contains(where: { $0.hasPrefix(token) }) || searchable.contains(token)
      })
    else { return nil }

    let textScore: Double
    if title == query {
      textScore = 100
    } else if title.hasPrefix(query) {
      textScore = 80
    } else if title.contains(query) {
      textScore = 60
    } else if documentTokens.contains(query) {
      textScore = 45
    } else {
      textScore = 30 + Double(queryTokens.count * 4)
    }
    guard let modifiedAt else { return textScore }
    let ageInDays = max(0, Date().timeIntervalSince(modifiedAt) / 86_400)
    return textScore + 8 * exp(-ageInDays / 730)
  }

  private func normalize(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      .lowercased()
      .split { !$0.isLetter && !$0.isNumber }
      .joined(separator: " ")
  }
}

private struct SearchDocument: Sendable {
  let id: String
  let kind: StudioSearchKind
  let title: String
  let context: String
  let fileURL: URL?
  let rootURL: URL
  let projectID: String?
  let timelineID: String?
  let setID: String?
  let trackID: String?
  let modifiedAt: Date?
  let normalizedTitle: String
  let searchable: String

  init(
    id: String,
    kind: StudioSearchKind,
    title: String,
    terms: [String],
    context: String,
    fileURL: URL?,
    rootURL: URL,
    projectID: String? = nil,
    timelineID: String? = nil,
    setID: String? = nil,
    trackID: String? = nil,
    modifiedAt: Date? = nil
  ) {
    self.id = id
    self.kind = kind
    self.title = title
    self.context = context
    self.fileURL = fileURL
    self.rootURL = rootURL
    self.projectID = projectID
    self.timelineID = timelineID
    self.setID = setID
    self.trackID = trackID
    self.modifiedAt = modifiedAt
    normalizedTitle = Self.normalize(title)
    searchable = Self.normalize(([title, context] + terms).joined(separator: " "))
  }

  private static func normalize(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      .lowercased()
      .split { !$0.isLetter && !$0.isNumber }
      .joined(separator: " ")
  }
}

extension SetDevice {
  fileprivate var flattenedForSearch: [SetDevice] {
    [self] + nestedDevices.flatMap(\.flattenedForSearch)
  }
}
