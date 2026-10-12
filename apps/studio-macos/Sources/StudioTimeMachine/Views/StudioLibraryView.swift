import StudioCore
import SwiftUI

struct StudioLibraryView: View {
  let index: StudioLibraryIndex
  @Bindable var store: StudioLibraryStore
  @AppStorage("studio.libraryDensity") private var density = LibraryDensity.spacious.rawValue
  @AppStorage("studio.libraryPresentation") private var presentation =
    LibraryPresentation.list.rawValue
  @State private var focus: LibraryFocus = .all
  @State private var sort: LibrarySort = .lastSaved

  private var columns: [GridItem] {
    let compact = store.isDenseSample || density == LibraryDensity.compact.rawValue
    return [
      GridItem(
        .adaptive(minimum: compact ? 168 : 220, maximum: compact ? 220 : 290),
        spacing: compact ? 22 : 36)
    ]
  }

  var body: some View {
    let works = filteredWorks
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        libraryHeader
        browseControls

        if !store.isSampleLibrary, store.isRebuildingOrganisation, store.visibleWorks.isEmpty {
          ProgressView("Organising Songs from your studio evidence…")
            .frame(maxWidth: .infinity, minHeight: 380)
        } else if store.visibleWorks.isEmpty {
          ContentUnavailableView(
            "No Songs found",
            systemImage: "square.stack.3d.up.slash",
            description: Text("Choose another Ableton folder or rescan this location.")
          )
          .frame(maxWidth: .infinity, minHeight: 380)
        } else if works.isEmpty {
          ContentUnavailableView {
            Label(focus.emptyTitle, systemImage: focus.symbol)
          } description: {
            Text(focus.emptyDescription)
          } actions: {
            Button("Show all Songs") { focus = .all }
              .buttonStyle(StudioCanvasButtonStyle(kind: .secondary))
          }
          .frame(maxWidth: .infinity, minHeight: 300)
        } else if currentPresentation == .list {
          StudioLibraryProjectListView(works: works, store: store)
        } else {
          LazyVGrid(columns: columns, alignment: .leading, spacing: 34) {
            ForEach(works) { work in
              WorkTile(work: work, open: { store.selectWork(work) })
            }
          }
        }
      }
      .padding(.horizontal, 38)
      .padding(.top, 34)
      .padding(.bottom, store.player.currentAsset == nil ? 42 : 110)
    }
  }

  private var libraryHeader: some View {
    HStack(alignment: .firstTextBaseline) {
      VStack(alignment: .leading, spacing: 7) {
        HStack(spacing: 10) {
          Text("Studio Library")
            .font(.custom("Helvetica Neue", size: 30).weight(.bold))
          if store.isSampleLibrary {
            Text("SAMPLE")
              .font(.caption2.weight(.bold))
              .padding(.horizontal, 8)
              .padding(.vertical, 4)
              .background(.quaternary, in: Capsule())
          }
        }

        Text(summaryText)
          .foregroundStyle(.secondary)
      }

      Spacer()

      HStack(spacing: 9) {
        if isUpdatingLibrary {
          HStack(spacing: 7) {
            ProgressView()
              .controlSize(.small)
            Text(updateStatusText)
              .font(.caption.weight(.medium))
              .foregroundStyle(.secondary)
          }
          .accessibilityElement(children: .combine)
          .accessibilityLabel(updateStatusText)
        }

        LibraryPresentationControl(selection: $presentation)
        if currentPresentation == .grid {
          Menu {
            Picker("Library density", selection: $density) {
              ForEach(LibraryDensity.allCases) { density in
                Text(density.title).tag(density.rawValue)
              }
            }
          } label: {
            Label("Library density", systemImage: "rectangle.grid.2x2")
          }
          .menuStyle(.borderlessButton)
          .fixedSize()
        }
      }
    }
  }

  private var browseControls: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 16) {
        focusControl
        Spacer(minLength: 12)
        sortControl
      }
      .frame(height: 28)
      Text(
        focus == .organise
          ? "Review suggested groupings and assign an Artist. Your files stay where they are."
          : "Open a Song to continue. Expand its Set files when you need the details."
      )
      .font(.callout)
      .foregroundStyle(StudioShellPalette.mutedInk)
    }
  }

  private var focusControl: some View {
    Picker("Show Songs", selection: $focus) {
      ForEach(LibraryFocus.allCases) { option in
        Text(option.title).tag(option)
      }
    }
    .pickerStyle(.segmented)
    .frame(width: 326)
  }

  private var sortControl: some View {
    Menu {
      Picker("Sort Songs", selection: $sort) {
        ForEach(LibrarySort.allCases) { option in
          Text(option.title).tag(option)
        }
      }
    } label: {
      Label(sort.title, systemImage: "arrow.up.arrow.down")
        .font(.callout)
    }
    .menuStyle(.borderlessButton)
    .fixedSize()
    .accessibilityLabel("Sort Songs: \(sort.title)")
  }

  private var filteredWorks: [StudioWork] {
    let recentIDs = Set(store.recentWorkIDs)
    let dates = Dictionary(
      uniqueKeysWithValues: store.visibleWorks.map { work in
        (
          work.id,
          work.sessions.flatMap(\.revisions)
            .compactMap { $0.timestamp.value ?? $0.set.modifiedAt }.max() ?? .distantPast
        )
      })
    return store.visibleWorks.filter { work in
      switch focus {
      case .all: true
      case .recent: recentIDs.contains(work.id)
      case .organise:
        work.artist.displayName == "Unknown"
          || work.confidence == .suggested || work.confidence == .unresolved
      }
    }.sorted { left, right in
      if sort == .lastSaved, dates[left.id] != dates[right.id] {
        return (dates[left.id] ?? .distantPast) > (dates[right.id] ?? .distantPast)
      }
      let comparison = left.displayName.localizedStandardCompare(right.displayName)
      return comparison == .orderedSame ? left.id < right.id : comparison == .orderedAscending
    }
  }

  private var currentPresentation: LibraryPresentation {
    LibraryPresentation(rawValue: presentation) ?? .list
  }

  private var isUpdatingLibrary: Bool {
    !store.isSampleLibrary && (store.syncStatus == .indexing || store.isRebuildingOrganisation)
  }

  private var updateStatusText: String {
    if let progress = store.indexingProgress, progress.total > 0 {
      return "Updating library · \(progress.completed) of \(progress.total)"
    }
    return store.isRebuildingOrganisation ? "Organising Songs…" : "Updating library…"
  }

  private var summaryText: String {
    if let catalog = store.workCatalog {
      let sessionCount = catalog.works.reduce(0) { $0 + $1.sessions.count }
      let revisionCount = catalog.works.reduce(0) {
        $0 + $1.sessions.reduce(0) { $0 + $1.revisions.count }
      }
      return
        "\(catalog.works.count) Song\(catalog.works.count == 1 ? "" : "s") · \(sessionCount) Session\(sessionCount == 1 ? "" : "s") · \(revisionCount) Set Revisions"
    }
    let timelineCount = index.projects.reduce(0) { $0 + $1.timelines.count }
    let setCount = index.projects.reduce(0) { $0 + $1.sets.count }
    return "\(index.projects.count) projects · \(timelineCount) timelines · \(setCount) Sets"
  }
}

private struct LibraryPresentationControl: View {
  @Binding var selection: String

  var body: some View {
    HStack(spacing: 2) {
      ForEach(LibraryPresentation.allCases) { option in
        Button {
          selection = option.rawValue
        } label: {
          Image(systemName: option.symbol)
            .font(.system(size: 12, weight: .semibold))
            .frame(width: 16, height: 16)
        }
        .buttonStyle(
          StudioCanvasButtonStyle(
            kind: selection == option.rawValue ? .secondary : .quiet
          )
        )
        .help("\(option.title) view")
        .accessibilityLabel("\(option.title) view")
        .accessibilityValue(selection == option.rawValue ? "Selected" : "Not selected")
      }
    }
    .padding(2)
    .background(StudioShellPalette.ink.opacity(0.045))
    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 11, style: .continuous)
        .stroke(StudioShellPalette.canvasStroke, lineWidth: 1)
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Library view")
  }
}

private struct WorkTile: View {
  let work: StudioWork
  let open: () -> Void
  @State private var isHovered = false

  private var revisionCount: Int {
    work.sessions.reduce(0) { $0 + $1.revisions.count }
  }

  private var latestDate: Date? {
    work.sessions.flatMap(\.revisions).compactMap(\.timestamp.value).max()
  }

  var body: some View {
    Button(action: open) {
      VStack(alignment: .leading, spacing: 12) {
        ProjectObjectView(
          identity: work.displayName,
          size: 170,
          showsDisc: true,
          isHovered: isHovered
        )
        .frame(maxWidth: .infinity, alignment: .center)

        VStack(alignment: .leading, spacing: 4) {
          Text(work.displayName)
            .font(.headline)
            .foregroundStyle(.primary)
            .lineLimit(1)
          Text(work.artist.displayName == "Unknown" ? "Unassigned Artist" : work.artist.displayName)
            .font(.callout.weight(.medium))
            .foregroundStyle(work.artist.displayName == "Unknown" ? .orange : .secondary)
          Text(
            "\(work.sessions.count) Session\(work.sessions.count == 1 ? "" : "s") · \(revisionCount) Set Revisions"
          )
          .font(.callout)
          .foregroundStyle(.secondary)
          if let latestDate {
            Text("Latest \(latestDate.formatted(date: .abbreviated, time: .omitted))")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { isHovered = $0 }
    .accessibilityLabel(
      "\(work.displayName), \(work.artist.displayName == "Unknown" ? "Unassigned Artist" : work.artist.displayName), \(work.sessions.count) Session\(work.sessions.count == 1 ? "" : "s")"
    )
    .accessibilityHint("Open Song and related Sessions")
  }
}

private enum LibraryFocus: String, CaseIterable, Identifiable {
  case all, recent, organise
  var id: String { rawValue }
  var title: String {
    switch self {
    case .all: "All Songs"
    case .recent: "Recently opened"
    case .organise: "Needs organising"
    }
  }
  var symbol: String { self == .organise ? "checkmark.circle" : "clock" }
  var emptyTitle: String {
    self == .organise ? "No organisation reviews needed" : "Your next session starts here"
  }
  var emptyDescription: String {
    self == .organise
      ? "No unassigned Artists or suggested groupings in this indexed library."
      : "Open a Song from your library and find it here next time."
  }
}

private enum LibrarySort: String, CaseIterable, Identifiable {
  case lastSaved, name
  var id: String { rawValue }
  var title: String { self == .lastSaved ? "Last saved" : "Song name" }
}
