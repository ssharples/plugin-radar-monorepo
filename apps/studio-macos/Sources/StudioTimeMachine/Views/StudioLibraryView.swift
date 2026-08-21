import StudioCore
import SwiftUI

struct StudioLibraryView: View {
  let index: StudioLibraryIndex
  @Bindable var store: StudioLibraryStore
  @AppStorage("studio.libraryDensity") private var density = LibraryDensity.spacious.rawValue
  @AppStorage("studio.libraryPresentation") private var presentation =
    LibraryPresentation.list.rawValue

  private var columns: [GridItem] {
    let compact = store.isDenseSample || density == LibraryDensity.compact.rawValue
    return [
      GridItem(
        .adaptive(minimum: compact ? 168 : 220, maximum: compact ? 220 : 290),
        spacing: compact ? 22 : 36)
    ]
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 34) {
        libraryHeader

        if !store.isSampleLibrary, store.isRebuildingOrganisation, store.visibleWorks.isEmpty {
          ProgressView("Organising Songs from your studio evidence…")
            .frame(maxWidth: .infinity, minHeight: 380)
        } else if store.isSampleLibrary ? store.visibleProjects.isEmpty : store.visibleWorks.isEmpty
        {
          ContentUnavailableView(
            "No Songs found",
            systemImage: "square.stack.3d.up.slash",
            description: Text("Add another Ableton folder to Studio or rescan this location.")
          )
          .frame(maxWidth: .infinity, minHeight: 380)
        } else if !store.isSampleLibrary, currentPresentation == .list {
          StudioLibraryProjectListView(works: store.visibleWorks, store: store)
        } else {
          LazyVGrid(columns: columns, alignment: .leading, spacing: 34) {
            if store.isSampleLibrary {
              ForEach(store.visibleProjects) { project in
                ProjectTile(
                  project: project,
                  open: { store.selectProject(project) },
                  reveal: { store.revealInFinder(project.rootURL) }
                )
              }
            } else {
              ForEach(store.visibleWorks) { work in
                WorkTile(work: work, open: { store.selectWork(work) })
              }
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

        if !store.isSampleLibrary {
          LibraryPresentationControl(selection: $presentation)
        }

        if store.isSampleLibrary || currentPresentation == .grid {
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
    if !store.isSampleLibrary, let catalog = store.workCatalog {
      let sessionCount = catalog.works.reduce(0) { $0 + $1.sessions.count }
      let revisionCount = catalog.works.reduce(0) {
        $0 + $1.sessions.reduce(0) { $0 + $1.revisions.count }
      }
      return
        "\(catalog.works.count) Songs · \(sessionCount) Sessions · \(revisionCount) Set Revisions"
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
          Text("\(work.sessions.count) Sessions · \(revisionCount) Set Revisions")
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
      "\(work.displayName), \(work.artist.displayName), \(work.sessions.count) Sessions"
    )
    .accessibilityHint("Open Song and related Sessions")
  }
}

private struct ProjectTile: View {
  let project: StudioProject
  let open: () -> Void
  let reveal: () -> Void
  @State private var isHovered = false

  var body: some View {
    Button(action: open) {
      VStack(alignment: .leading, spacing: 12) {
        ProjectObjectView(
          identity: project.displayName,
          size: 170,
          showsDisc: true,
          isHovered: isHovered
        )
        .frame(maxWidth: .infinity, alignment: .center)

        VStack(alignment: .leading, spacing: 4) {
          Text(project.displayName)
            .font(.headline)
            .foregroundStyle(.primary)
            .lineLimit(1)
          Text("\(project.timelines.count) timelines · \(project.setCount) Sets")
            .font(.callout)
            .foregroundStyle(.secondary)
          Text(project.latestModifiedText)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .onHover { isHovered = $0 }
    .accessibilityLabel("\(project.displayName), \(project.setCount) Sets")
    .accessibilityHint("Open project timeline")
    .contextMenu {
      Button("Open Project", action: open)
      Button("Reveal in Finder", action: reveal)
    }
  }
}
