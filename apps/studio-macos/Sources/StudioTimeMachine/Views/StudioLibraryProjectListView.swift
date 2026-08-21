import StudioCore
import SwiftUI

struct StudioLibraryProjectListView: View {
  let works: [StudioWork]
  @Bindable var store: StudioLibraryStore
  @State private var visibleWorkCount = pageSize

  private static let pageSize = 14

  private var visibleWorks: ArraySlice<StudioWork> {
    works.prefix(visibleWorkCount)
  }

  private var hasMoreWorks: Bool {
    visibleWorkCount < works.count
  }

  var body: some View {
    LazyVStack(alignment: .leading, spacing: 18) {
      listGuide

      ForEach(visibleWorks) { work in
        SongProjectFileGroup(
          work: work,
          openSong: { store.selectWork(work) },
          openRevision: { revision, session in
            store.selectWork(work)
            store.openRevision(revision, in: session)
          },
          reveal: store.revealInFinder
        )
      }

      if hasMoreWorks {
        ProgressView("Loading more Songs…")
          .controlSize(.small)
          .foregroundStyle(StudioShellPalette.mutedInk)
          .frame(maxWidth: .infinity)
          .padding(.vertical, 16)
          .onAppear(perform: loadNextPage)
      } else {
        Text("All \(works.count) Songs loaded")
          .font(.system(size: 11, weight: .medium, design: .rounded))
          .foregroundStyle(StudioShellPalette.mutedInk.opacity(0.72))
          .frame(maxWidth: .infinity)
          .padding(.vertical, 10)
      }
    }
    .onChange(of: works.map(\.id)) { _, _ in
      visibleWorkCount = Self.pageSize
    }
  }

  private var listGuide: some View {
    HStack(spacing: 14) {
      Text("SONG / PROJECT FILE")
        .frame(maxWidth: .infinity, alignment: .leading)
      Text("SESSION")
        .frame(width: 156, alignment: .leading)
      Text("MODIFIED")
        .frame(width: 104, alignment: .leading)
      Text("DETAILS")
        .frame(width: 112, alignment: .leading)
      Color.clear.frame(width: 72)
    }
    .font(.system(size: 9, weight: .bold, design: .rounded))
    .tracking(0.7)
    .foregroundStyle(StudioShellPalette.mutedInk.opacity(0.78))
    .padding(.horizontal, 18)
    .accessibilityHidden(true)
  }

  private func loadNextPage() {
    guard hasMoreWorks else { return }
    visibleWorkCount = min(visibleWorkCount + Self.pageSize, works.count)
  }
}

private struct SongProjectFileGroup: View {
  let work: StudioWork
  let openSong: () -> Void
  let openRevision: (StudioSetRevision, StudioSession) -> Void
  let reveal: (URL) -> Void

  private var catalog: SongProjectFileCatalog {
    SongProjectFileCatalog(work: work)
  }

  var body: some View {
    VStack(spacing: 0) {
      songHeader

      Divider()
        .overlay(StudioShellPalette.canvasStroke)

      ForEach(Array(catalog.families.enumerated()), id: \.element.id) { index, family in
        ProjectFileFamilyRow(
          family: family,
          isLatest: index == 0,
          open: openRevision,
          reveal: reveal
        )

        if index < catalog.families.count - 1 || !catalog.unmatchedBackups.isEmpty {
          groupDivider
        }
      }

      if !catalog.unmatchedBackups.isEmpty {
        UnmatchedBackupsDisclosure(
          entries: catalog.unmatchedBackups,
          open: openRevision,
          reveal: reveal
        )
      }
    }
    .background(StudioShellPalette.canvasRaised)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(StudioShellPalette.canvasStroke, lineWidth: 1)
    }
  }

  private var groupDivider: some View {
    Divider()
      .padding(.leading, 78)
      .overlay(StudioShellPalette.canvasStroke.opacity(0.76))
  }

  private var songHeader: some View {
    Button(action: openSong) {
      HStack(spacing: 16) {
        ProjectObjectView(
          identity: work.displayName,
          size: 58,
          showsDisc: true,
          isActive: true
        )

        VStack(alignment: .leading, spacing: 3) {
          Text(work.displayName)
            .font(.system(size: 17, weight: .bold, design: .rounded))
            .foregroundStyle(StudioShellPalette.ink)
            .lineLimit(1)

          Text(artistName)
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(
              work.artist.displayName == "Unknown" ? Color.orange : StudioShellPalette.mutedInk
            )
            .lineLimit(1)
        }

        Spacer(minLength: 16)

        VStack(alignment: .trailing, spacing: 3) {
          Text(catalog.primaryCountText)
            .font(.system(size: 11.5, weight: .semibold, design: .rounded))
          Text(catalog.secondarySummary(work: work))
            .font(.system(size: 10.5, weight: .medium, design: .rounded))
            .foregroundStyle(StudioShellPalette.mutedInk)
        }

        Image(systemName: "chevron.right")
          .font(.system(size: 10, weight: .bold))
          .foregroundStyle(StudioShellPalette.mutedInk.opacity(0.6))
          .frame(width: 18)
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 13)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      "\(work.displayName), \(artistName), \(catalog.primaryCountText), \(catalog.backupCountText)"
    )
    .accessibilityHint("Open Song history")
  }

  private var artistName: String {
    work.artist.displayName == "Unknown" ? "Unassigned Artist" : work.artist.displayName
  }
}

private struct ProjectFileFamilyRow: View {
  let family: ProjectFileFamily
  let isLatest: Bool
  let open: (StudioSetRevision, StudioSession) -> Void
  let reveal: (URL) -> Void
  @State private var backupsExpanded = false
  @State private var isHovered = false

  var body: some View {
    VStack(spacing: 0) {
      primaryRow

      if backupsExpanded {
        VStack(spacing: 0) {
          ForEach(Array(family.backups.enumerated()), id: \.element.id) { index, backup in
            BackupProjectFileRow(
              entry: backup,
              open: { open(backup.revision, backup.session) },
              reveal: { reveal(backup.revision.set.fileURL) }
            )

            if index < family.backups.count - 1 {
              Divider()
                .padding(.leading, 132)
                .overlay(StudioShellPalette.canvasStroke.opacity(0.55))
            }
          }
        }
        .background(StudioShellPalette.ink.opacity(0.024))
        .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
  }

  private var primaryRow: some View {
    HStack(spacing: 14) {
      HStack(spacing: 8) {
        Button {
          open(family.main.revision, family.main.session)
        } label: {
          HStack(spacing: 14) {
            ZStack {
              RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(StudioShellPalette.ink.opacity(isLatest ? 0.10 : 0.055))
              Image(systemName: "slider.horizontal.3")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(StudioShellPalette.ink.opacity(isLatest ? 0.84 : 0.58))
            }
            .frame(width: 42, height: 42)

            VStack(alignment: .leading, spacing: 4) {
              HStack(spacing: 7) {
                Text(family.main.name)
                  .font(.system(size: 12.5, weight: .semibold))
                  .foregroundStyle(StudioShellPalette.ink)
                  .lineLimit(1)

                primaryStatusTag
              }

              Text(family.main.revision.set.fileURL.lastPathComponent)
                .font(.system(size: 10.5, weight: .regular, design: .monospaced))
                .foregroundStyle(StudioShellPalette.mutedInk.opacity(0.82))
                .lineLimit(1)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)

        if !family.backups.isEmpty {
          backupDisclosure
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      ProjectFileMetadataColumns(entry: family.main)

      ProjectFileActions(
        entry: family.main,
        open: { open(family.main.revision, family.main.session) },
        reveal: { reveal(family.main.revision.set.fileURL) },
        opacity: isHovered ? 1 : 0.62
      )
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 9)
    .background(isHovered ? StudioShellPalette.ink.opacity(0.035) : .clear)
    .contentShape(Rectangle())
    .onHover { isHovered = $0 }
    .contextMenu {
      Button("Open Project File") {
        open(family.main.revision, family.main.session)
      }
      Button("Reveal in Finder") {
        reveal(family.main.revision.set.fileURL)
      }
    }
    .accessibilityElement(children: .contain)
  }

  private var primaryStatusTag: some View {
    Text(isLatest ? "LATEST" : "CURRENT")
      .font(.system(size: 8, weight: .bold, design: .rounded))
      .tracking(0.45)
      .foregroundStyle(isLatest ? StudioShellPalette.ink : StudioShellPalette.mutedInk)
      .padding(.horizontal, 6)
      .padding(.vertical, 3)
      .background(
        isLatest ? StudioShellPalette.signal.opacity(0.78) : StudioShellPalette.ink.opacity(0.065),
        in: Capsule()
      )
  }

  private var backupDisclosure: some View {
    Button {
      withAnimation(.easeInOut(duration: 0.18)) {
        backupsExpanded.toggle()
      }
    } label: {
      HStack(spacing: 4) {
        Image(systemName: "chevron.right")
          .font(.system(size: 8, weight: .bold))
          .rotationEffect(.degrees(backupsExpanded ? 90 : 0))
        Text(family.backupCountText)
          .font(.system(size: 9.5, weight: .semibold, design: .rounded))
      }
      .foregroundStyle(StudioShellPalette.mutedInk)
      .padding(.horizontal, 7)
      .padding(.vertical, 3)
      .background(StudioShellPalette.ink.opacity(0.045), in: Capsule())
    }
    .buttonStyle(.plain)
    .help(backupsExpanded ? "Hide backups" : "Show backups")
    .accessibilityLabel("\(family.backupCountText) for \(family.main.name)")
    .accessibilityValue(backupsExpanded ? "Expanded" : "Collapsed")
  }
}

private struct BackupProjectFileRow: View {
  let entry: SongProjectFileEntry
  let open: () -> Void
  let reveal: () -> Void
  @State private var isHovered = false

  var body: some View {
    HStack(spacing: 14) {
      HStack(spacing: 10) {
        Rectangle()
          .fill(StudioShellPalette.ink.opacity(0.10))
          .frame(width: 2, height: 30)
          .padding(.leading, 20)

        Button(action: open) {
          HStack(spacing: 10) {
            Image(systemName: "clock.arrow.circlepath")
              .font(.system(size: 11, weight: .medium))
              .foregroundStyle(StudioShellPalette.mutedInk.opacity(0.72))
              .frame(width: 30, height: 30)
              .background(
                StudioShellPalette.ink.opacity(0.04), in: RoundedRectangle(cornerRadius: 7))

            VStack(alignment: .leading, spacing: 2) {
              Text(entry.name)
                .font(.system(size: 11.5, weight: .medium))
                .foregroundStyle(StudioShellPalette.ink.opacity(0.74))
                .lineLimit(1)
              Text(entry.revision.set.fileURL.lastPathComponent)
                .font(.system(size: 9.5, weight: .regular, design: .monospaced))
                .foregroundStyle(StudioShellPalette.mutedInk.opacity(0.68))
                .lineLimit(1)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      ProjectFileMetadataColumns(entry: entry, subdued: true)

      ProjectFileActions(
        entry: entry,
        open: open,
        reveal: reveal,
        opacity: isHovered ? 0.82 : 0.38
      )
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 6)
    .background(isHovered ? StudioShellPalette.ink.opacity(0.025) : .clear)
    .contentShape(Rectangle())
    .onHover { isHovered = $0 }
    .contextMenu {
      Button("Open Backup", action: open)
      Button("Reveal in Finder", action: reveal)
    }
  }
}

private struct UnmatchedBackupsDisclosure: View {
  let entries: [SongProjectFileEntry]
  let open: (StudioSetRevision, StudioSession) -> Void
  let reveal: (URL) -> Void
  @State private var expanded = false

  var body: some View {
    VStack(spacing: 0) {
      Button {
        withAnimation(.easeInOut(duration: 0.18)) {
          expanded.toggle()
        }
      } label: {
        HStack(spacing: 9) {
          Image(systemName: "chevron.right")
            .font(.system(size: 9, weight: .bold))
            .rotationEffect(.degrees(expanded ? 90 : 0))
          Image(systemName: "clock.badge.questionmark")
            .font(.system(size: 12, weight: .semibold))
          VStack(alignment: .leading, spacing: 2) {
            Text("Backups without a current Set")
              .font(.system(size: 11.5, weight: .semibold, design: .rounded))
            Text("Kept separate because no exact parent project file was found")
              .font(.system(size: 9.5, weight: .regular, design: .rounded))
          }
          Spacer()
          Text("\(entries.count)")
            .font(.system(size: 10, weight: .bold, design: .rounded))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(StudioShellPalette.ink.opacity(0.05), in: Capsule())
        }
        .foregroundStyle(StudioShellPalette.mutedInk)
        .padding(.horizontal, 22)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .accessibilityValue(expanded ? "Expanded" : "Collapsed")

      if expanded {
        VStack(spacing: 0) {
          ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
            BackupProjectFileRow(
              entry: entry,
              open: { open(entry.revision, entry.session) },
              reveal: { reveal(entry.revision.set.fileURL) }
            )
            if index < entries.count - 1 {
              Divider()
                .padding(.leading, 132)
                .overlay(StudioShellPalette.canvasStroke.opacity(0.55))
            }
          }
        }
        .background(StudioShellPalette.ink.opacity(0.024))
      }
    }
  }
}

private struct ProjectFileMetadataColumns: View {
  let entry: SongProjectFileEntry
  var subdued = false

  var body: some View {
    Group {
      VStack(alignment: .leading, spacing: 3) {
        Text(entry.roleTitle)
          .font(.system(size: subdued ? 10.5 : 11.5, weight: .semibold, design: .rounded))
        Text(entry.session.displayName)
          .font(.system(size: 10, weight: .regular))
          .lineLimit(1)
      }
      .frame(width: 156, alignment: .leading)

      Text(entry.dateText)
        .font(.system(size: subdued ? 10 : 11, weight: .medium, design: .rounded))
        .frame(width: 104, alignment: .leading)

      VStack(alignment: .leading, spacing: 3) {
        Text("\(entry.revision.set.structure.trackCount) tracks")
          .font(.system(size: subdued ? 10 : 11, weight: .semibold, design: .rounded))
        Text(entry.sizeText)
          .font(.system(size: 10, weight: .regular, design: .rounded))
      }
      .frame(width: 112, alignment: .leading)
    }
    .foregroundStyle(
      subdued ? StudioShellPalette.mutedInk.opacity(0.68) : StudioShellPalette.mutedInk
    )
  }
}

private struct ProjectFileActions: View {
  let entry: SongProjectFileEntry
  let open: () -> Void
  let reveal: () -> Void
  let opacity: Double

  var body: some View {
    HStack(spacing: 2) {
      Button(action: open) {
        Image(systemName: "arrow.up.right.square")
          .frame(width: 14, height: 14)
      }
      .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
      .help(entry.revision.set.isBackup ? "Open backup" : "Open project file")
      .accessibilityLabel("Open \(entry.name)")

      Button(action: reveal) {
        Image(systemName: "folder")
          .frame(width: 14, height: 14)
      }
      .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
      .help("Reveal in Finder")
      .accessibilityLabel("Reveal \(entry.name) in Finder")
    }
    .frame(width: 72, alignment: .trailing)
    .opacity(opacity)
  }
}

private struct SongProjectFileCatalog {
  let families: [ProjectFileFamily]
  let unmatchedBackups: [SongProjectFileEntry]

  init(work: StudioWork) {
    var resolvedFamilies: [ProjectFileFamily] = []
    var unresolvedBackups: [SongProjectFileEntry] = []

    for session in work.sessions {
      let entries = session.revisions.map {
        SongProjectFileEntry(session: session, revision: $0)
      }
      let mains = entries.filter { !$0.revision.set.isBackup }.sorted(by: Self.entrySort)
      var backupsByLineage = Dictionary(
        grouping: entries.filter { $0.revision.set.isBackup },
        by: \.lineageKey
      )

      for main in mains {
        let backups = backupsByLineage.removeValue(forKey: main.lineageKey) ?? []
        resolvedFamilies.append(
          ProjectFileFamily(main: main, backups: backups.sorted(by: Self.entrySort))
        )
      }

      unresolvedBackups.append(contentsOf: backupsByLineage.values.flatMap { $0 })
    }

    families = resolvedFamilies.sorted {
      if $0.main.modifiedAt != $1.main.modifiedAt {
        return $0.main.modifiedAt > $1.main.modifiedAt
      }
      return $0.main.name.localizedStandardCompare($1.main.name) == .orderedAscending
    }
    unmatchedBackups = unresolvedBackups.sorted(by: Self.entrySort)
  }

  var backupCount: Int {
    families.reduce(unmatchedBackups.count) { $0 + $1.backups.count }
  }

  var primaryCountText: String {
    "\(families.count) project file\(families.count == 1 ? "" : "s")"
  }

  var backupCountText: String {
    "\(backupCount) backup\(backupCount == 1 ? "" : "s")"
  }

  func secondarySummary(work: StudioWork) -> String {
    var parts = [
      "\(work.sessions.count) Session\(work.sessions.count == 1 ? "" : "s")",
      backupCountText,
    ]
    if let latest = families.first?.main.modifiedAt, latest != .distantPast {
      parts.append("latest \(latest.formatted(date: .abbreviated, time: .omitted))")
    }
    return parts.joined(separator: " · ")
  }

  private static func entrySort(_ left: SongProjectFileEntry, _ right: SongProjectFileEntry) -> Bool
  {
    if left.modifiedAt != right.modifiedAt { return left.modifiedAt > right.modifiedAt }
    return left.name.localizedStandardCompare(right.name) == .orderedAscending
  }
}

private struct ProjectFileFamily: Identifiable {
  let main: SongProjectFileEntry
  let backups: [SongProjectFileEntry]

  var id: String { main.id }

  var backupCountText: String {
    "\(backups.count) backup\(backups.count == 1 ? "" : "s")"
  }
}

private struct SongProjectFileEntry: Identifiable {
  let session: StudioSession
  let revision: StudioSetRevision

  var id: String { revision.id }

  var modifiedAt: Date {
    revision.timestamp.value ?? revision.set.modifiedAt ?? .distantPast
  }

  var name: String {
    let cleaned = revision.set.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
    return cleaned.isEmpty || cleaned == "\\" ? session.displayName : cleaned
  }

  var lineageKey: String {
    name.replacingOccurrences(
      of: #"\s*\[[0-9]{4}[-_][0-9]{2}[-_][0-9]{2}[^\]]*\]\s*$"#,
      with: "",
      options: [.regularExpression, .caseInsensitive]
    )
    .trimmingCharacters(in: .whitespacesAndNewlines)
    .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
  }

  var dateText: String {
    guard modifiedAt != .distantPast else { return "Unknown" }
    return modifiedAt.formatted(.dateTime.day().month(.abbreviated).year())
  }

  var sizeText: String {
    ByteCountFormatter.string(fromByteCount: revision.set.compressedBytes, countStyle: .file)
  }

  var roleTitle: String {
    switch session.role {
    case .production: "Production"
    case .vocalEdit: "Vocal Edit"
    case .stemPreparation: "Stem Preparation"
    case .mix: "Mix"
    case .master: "Master"
    case .live: "Live"
    case .unknown: "Session"
    }
  }
}
