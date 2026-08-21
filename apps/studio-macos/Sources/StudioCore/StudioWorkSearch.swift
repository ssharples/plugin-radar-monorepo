import Foundation

/// Binds asynchronous local-search output to the semantic query that produced it.
/// Consumers must revalidate the batch before publishing or opening a result.
public struct StudioSearchResultBatch<Element: Sendable>: Sendable {
  public let normalizedQuery: String
  public let results: [Element]

  public init(query: String, results: [Element]) {
    normalizedQuery = StudioWorkSearchIndex.normalize(query)
    self.results = results
  }

  public func results(matching query: String) -> [Element]? {
    guard normalizedQuery == StudioWorkSearchIndex.normalize(query) else { return nil }
    return results
  }
}

public struct StudioWorkSearchHit: Identifiable, Sendable, Equatable {
  public let id: String
  public let workID: String
  public let songName: String
  public let artistName: String
  public let score: Double

  public init(
    workID: String,
    songName: String,
    artistName: String,
    score: Double
  ) {
    id = "work-search:\(workID)"
    self.workID = workID
    self.songName = songName
    self.artistName = artistName
    self.score = score
  }
}

/// A small, deterministic index over the content-aware Work catalogue.
///
/// This index deliberately contains Songs and Artists only. Projects, Sets, tracks, plug-ins,
/// and audio remain in `StudioSearchIndex` and are exposed only after explicit expansion in the
/// app's global search surface.
public struct StudioWorkSearchIndex: Sendable {
  private let documents: [WorkSearchDocument]

  public init(works: [StudioWork]) {
    documents = works.map(WorkSearchDocument.init)
  }

  public func search(
    _ query: String,
    recentWorkIDs: [String] = [],
    limit: Int = 24
  ) -> [StudioWorkSearchHit] {
    guard limit > 0 else { return [] }
    let normalizedQuery = Self.normalize(query)
    let recentRanks = Dictionary(
      uniqueKeysWithValues: recentWorkIDs.enumerated().map { ($0.element, $0.offset) })

    if normalizedQuery.isEmpty {
      return documents.sorted { left, right in
        let leftRank = recentRanks[left.workID]
        let rightRank = recentRanks[right.workID]
        if leftRank != nil || rightRank != nil {
          return (leftRank ?? Int.max) < (rightRank ?? Int.max)
        }
        if left.modifiedAt != right.modifiedAt {
          return (left.modifiedAt ?? .distantPast) > (right.modifiedAt ?? .distantPast)
        }
        return left.songName.localizedStandardCompare(right.songName) == .orderedAscending
      }
      .prefix(limit)
      .map { $0.hit(score: recentRanks[$0.workID].map { 1_000 - Double($0) } ?? 0) }
    }

    let queryTokens = normalizedQuery.split(separator: " ").map(String.init)
    return documents.compactMap { document -> StudioWorkSearchHit? in
      guard
        queryTokens.allSatisfy({ token in
          document.searchTokens.contains(where: { $0.hasPrefix(token) })
            || document.searchable.contains(token)
        })
      else { return nil }

      let score: Double
      if document.normalizedSong == normalizedQuery {
        score = 1_000
      } else if document.normalizedSong.hasPrefix(normalizedQuery) {
        score = 850
      } else if document.normalizedSong.contains(normalizedQuery) {
        score = 700
      } else if document.normalizedArtist == normalizedQuery {
        score = 560
      } else if document.normalizedArtist.hasPrefix(normalizedQuery) {
        score = 500
      } else if document.normalizedArtist.contains(normalizedQuery) {
        score = 450
      } else {
        score = 360 + Double(queryTokens.count * 8)
      }
      let recentBoost = recentRanks[document.workID].map { max(0, 12 - Double($0)) } ?? 0
      return document.hit(score: score + recentBoost)
    }
    .sorted { left, right in
      if left.score != right.score { return left.score > right.score }
      let songComparison = left.songName.localizedStandardCompare(right.songName)
      if songComparison != .orderedSame { return songComparison == .orderedAscending }
      return left.artistName.localizedStandardCompare(right.artistName) == .orderedAscending
    }
    .prefix(limit)
    .map { $0 }
  }

  fileprivate static func normalize(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      .lowercased()
      .split { !$0.isLetter && !$0.isNumber }
      .joined(separator: " ")
  }
}

private struct WorkSearchDocument: Sendable {
  let workID: String
  let songName: String
  let artistName: String
  let normalizedSong: String
  let normalizedArtist: String
  let searchable: String
  let searchTokens: Set<String>
  let modifiedAt: Date?

  init(work: StudioWork) {
    workID = work.id
    songName = work.displayName
    artistName = work.artist.displayName
    normalizedSong = StudioWorkSearchIndex.normalize(work.displayName)
    normalizedArtist = StudioWorkSearchIndex.normalize(work.artist.displayName)
    searchable = [normalizedSong, normalizedArtist].filter { !$0.isEmpty }.joined(separator: " ")
    searchTokens = Set(searchable.split(separator: " ").map(String.init))
    modifiedAt = work.sessions.flatMap(\.revisions).compactMap(\.timestamp.value).max()
  }

  func hit(score: Double) -> StudioWorkSearchHit {
    StudioWorkSearchHit(
      workID: workID,
      songName: songName,
      artistName: artistName,
      score: score
    )
  }
}
