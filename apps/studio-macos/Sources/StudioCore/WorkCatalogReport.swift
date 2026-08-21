import Foundation

public struct OrganisationCorpusSummary: Codable, Sendable {
  public let sourceRootCount: Int
  public let artistCount: Int
  public let workCount: Int
  public let groupedWorkCount: Int
  public let physicalSessionCount: Int
  public let setRevisionCount: Int
  public let backupRevisionCount: Int
  public let reviewCandidateCount: Int
  public let unresolvedWorkCount: Int
  public let timestampSourceCounts: [String: Int]

  public init(catalog: WorkCatalog) {
    let revisions = catalog.works.flatMap(\.sessions).flatMap(\.revisions)
    sourceRootCount = catalog.sourceRoots.count
    artistCount = Set(catalog.works.map(\.artist.id)).count
    workCount = catalog.works.count
    groupedWorkCount = catalog.works.count(where: { $0.sessions.count > 1 })
    physicalSessionCount = catalog.works.reduce(0) { $0 + $1.sessions.count }
    setRevisionCount = revisions.count
    backupRevisionCount = revisions.count(where: { $0.set.isBackup })
    reviewCandidateCount = catalog.reviewQueue.count
    unresolvedWorkCount = catalog.works.count(where: { $0.confidence == .unresolved })
    timestampSourceCounts = Dictionary(grouping: revisions, by: { $0.timestamp.source.rawValue })
      .mapValues(\.count)
  }
}

public enum WorkCatalogReport {
  public static func markdown(_ catalog: WorkCatalog) -> String {
    let summary = OrganisationCorpusSummary(catalog: catalog)
    let worksByID = Dictionary(uniqueKeysWithValues: catalog.works.map { ($0.id, $0) })
    var lines: [String] = [
      "# Studio organisation corpus report",
      "",
      "Generated: \(dateTime(catalog.generatedAt))  ",
      "Resolver: `\(catalog.algorithmVersion)`  ",
      "Mode: read-only derived catalogue; no source files were moved, renamed, or rewritten.",
      "",
      "## Summary",
      "",
      "| Measure | Result |",
      "| --- | ---: |",
      "| Tracked roots | \(summary.sourceRootCount) |",
      "| Artists/clients | \(summary.artistCount) |",
      "| Logical Works | \(summary.workCount) |",
      "| Multi-Session Works | \(summary.groupedWorkCount) |",
      "| Physical Sessions | \(summary.physicalSessionCount) |",
      "| Set revisions | \(summary.setRevisionCount) |",
      "| Backup revisions | \(summary.backupRevisionCount) |",
      "| Suggested review matches | \(summary.reviewCandidateCount) |",
      "| Unresolved Works | \(summary.unresolvedWorkCount) |",
      "",
      "### Chronology evidence",
      "",
      "| Timestamp source | Revisions |",
      "| --- | ---: |",
    ]
    for source in RevisionTimestampSource.allCases {
      lines.append("| \(humanize(source.rawValue)) | \(summary.timestampSourceCounts[source.rawValue, default: 0]) |")
    }

    lines.append(contentsOf: [
      "",
      "## Interpretation rules",
      "",
      "- Exact canonical titles merge automatically only when Sessions share a deterministic artist/client.",
      "- Similar titles never merge silently; they appear in the review queue.",
      "- Embedded Ableton Backup timestamps outrank filename dates and filesystem modification time.",
      "- Every physical path and raw Set name remains visible below.",
      "",
      "## Work catalogue",
      "",
    ])

    let artistGroups = Dictionary(grouping: catalog.works, by: { $0.artist.displayName })
    for artistName in artistGroups.keys.sorted(by: localizedAscending) {
      lines.append("### \(escapeHeading(artistName))")
      lines.append("")
      for work in artistGroups[artistName, default: []].sorted(by: workAscending) {
        let revisionCount = work.sessions.reduce(0) { $0 + $1.revisions.count }
        lines.append("#### \(escapeHeading(work.displayName))")
        lines.append("")
        lines.append(
          "Confidence: **\(humanize(work.confidence.rawValue))** · \(work.sessions.count) Session\(work.sessions.count == 1 ? "" : "s") · \(revisionCount) revision\(revisionCount == 1 ? "" : "s")"
        )
        lines.append("")
        for item in work.evidence where !item.isContradiction {
          lines.append("- Evidence: \(item.explanation)")
        }
        lines.append("")

        for session in work.sessions {
          lines.append("##### Session: \(escapeHeading(session.displayName))")
          lines.append("")
          lines.append("- Role: \(humanize(session.role.rawValue))")
          lines.append("- Physical path: \(code(session.rootURL.path))")
          let selectedTitleEvidence = session.titleEvidence.filter {
            $0.canonicalKey == session.canonicalTitleKey
          }
          if !selectedTitleEvidence.isEmpty {
            let sources = selectedTitleEvidence.prefix(6).map {
              "\(humanize($0.source.rawValue)): \(code($0.rawValue))"
            }.joined(separator: "; ")
            lines.append("- Canonical title evidence: \(sources)")
          }
          lines.append("")
          lines.append("| Time | Source | Kind | Set | Revision label |")
          lines.append("| --- | --- | --- | --- | --- |")
          for revision in session.revisions {
            lines.append(
              "| \(revision.timestamp.value.map(dateTime) ?? "Unknown") | \(humanize(revision.timestamp.source.rawValue)) | \(revision.set.isBackup ? "Backup" : "Current") | \(code(revision.set.fileURL.lastPathComponent)) | \(revision.revisionLabel.map(code) ?? "—") |"
            )
          }
          if session.revisions.isEmpty {
            lines.append("| — | — | — | No parsable Sets | — |")
          }
          lines.append("")
        }
      }
    }

    lines.append(contentsOf: ["## Review queue", ""])
    if catalog.reviewQueue.isEmpty {
      lines.append("No medium-confidence title matches require review.")
    } else {
      lines.append("These candidates were deliberately kept separate.")
      lines.append("")
      lines.append("| Score | Artist/client | Work | Possible match | Reason |")
      lines.append("| ---: | --- | --- | --- | --- |")
      for review in catalog.reviewQueue {
        guard let source = worksByID[review.sourceWorkID], let candidate = worksByID[review.candidateWorkID]
        else { continue }
        lines.append(
          "| \(String(format: "%.2f", review.score)) | \(escapeCell(source.artist.displayName)) | \(escapeCell(source.displayName)) | \(escapeCell(candidate.displayName)) | \(escapeCell(review.evidence.first?.explanation ?? "Similar deterministic title evidence")) |"
        )
      }
    }
    lines.append(contentsOf: [
      "",
      "## Known Phase 1 limits",
      "",
      "- This phase uses path, filename, owner-convention, and timestamp evidence. It does not yet use structural Set similarity, direct media dependencies, hashes, or audio fingerprints.",
      "- A filesystem timestamp is weak chronology evidence because copies and archives can rewrite it.",
      "- Unknown-owner Sessions are kept separate even when titles match.",
      "- Workflow labels are stripped conservatively; semantic variants such as Live and Remix remain distinct unless a user override says otherwise.",
      "",
    ])
    return lines.joined(separator: "\n")
  }

  private static func dateTime(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withSpaceBetweenDateAndTime]
    return formatter.string(from: date)
  }

  private static func code(_ value: String) -> String {
    "`\(value.replacingOccurrences(of: "`", with: "′"))`"
  }

  private static func humanize(_ value: String) -> String {
    value.replacingOccurrences(of: #"([a-z0-9])([A-Z])"#, with: "$1 $2", options: .regularExpression)
      .replacingOccurrences(of: "_", with: " ")
      .capitalized
  }

  private static func escapeCell(_ value: String) -> String {
    value.replacingOccurrences(of: "|", with: "\\|")
  }

  private static func escapeHeading(_ value: String) -> String {
    value.replacingOccurrences(of: "#", with: "\\#")
  }

  private static func localizedAscending(_ lhs: String, _ rhs: String) -> Bool {
    lhs.localizedStandardCompare(rhs) == .orderedAscending
  }

  private static func workAscending(_ lhs: StudioWork, _ rhs: StudioWork) -> Bool {
    localizedAscending(lhs.displayName, rhs.displayName)
  }
}
