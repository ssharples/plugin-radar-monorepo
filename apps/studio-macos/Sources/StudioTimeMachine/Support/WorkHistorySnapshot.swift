import Foundation
import StudioCore

struct WorkTimelineEntry: Identifiable, Sendable {
  let session: StudioSession
  let revision: StudioSetRevision

  var id: String { revision.id }
  var date: Date? { revision.timestamp.value ?? revision.set.modifiedAt }

  var displayName: String {
    let cleaned = revision.set.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    return cleaned.isEmpty || cleaned == "\\" ? session.displayName : cleaned
  }

  var dateText: String {
    date?.formatted(date: .abbreviated, time: .shortened) ?? "Date unavailable"
  }
}

struct WorkHistorySnapshot: Sendable {
  let entries: [WorkTimelineEntry]
  let artifactsByRevisionID: [String: [RevisionArtifactAssociation]]

  init(work: StudioWork) throws {
    let resolver = RevisionArtifactResolver()
    var entries = [WorkTimelineEntry]()
    var artifactsByRevisionID = [String: [RevisionArtifactAssociation]]()

    for session in work.sessions {
      try Task.checkCancellation()
      entries.append(
        contentsOf: session.revisions.map {
          WorkTimelineEntry(session: session, revision: $0)
        })
      for association in resolver.resolve(
        assets: session.previewAssets, revisions: session.revisions)
      {
        guard let revisionID = association.revisionID else { continue }
        artifactsByRevisionID[revisionID, default: []].append(association)
      }
    }

    self.entries = entries.sorted {
      if $0.date != $1.date { return ($0.date ?? .distantPast) > ($1.date ?? .distantPast) }
      return $0.id < $1.id
    }
    self.artifactsByRevisionID = artifactsByRevisionID
  }

  func artifacts(for entry: WorkTimelineEntry) -> [RevisionArtifactAssociation] {
    artifactsByRevisionID[entry.revision.id] ?? []
  }
}
