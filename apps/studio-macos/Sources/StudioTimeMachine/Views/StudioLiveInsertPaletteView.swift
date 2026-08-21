import StudioCore
import SwiftUI

struct StudioLiveInsertPaletteView: View {
  @Bindable var store: StudioLibraryStore
  let dismiss: () -> Void
  let openSource: (StudioLiveInsertHit) -> Void
  let revealSource: (StudioLiveInsertHit) -> Void

  @FocusState private var searchFocused: Bool
  @State private var selectedID: String?

  private var selectedHit: StudioLiveInsertHit? {
    guard let selectedID else { return nil }
    return store.liveInsertHits.first { $0.id == selectedID }
  }

  var body: some View {
    VStack(spacing: 0) {
      contextHeader
      Divider()
      searchField
      Divider()
      results
      Divider()
      footer
    }
    .frame(width: 720, height: 520)
    .background(.regularMaterial)
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Live Insert search")
    .accessibilityIdentifier("studio.live-insert.palette")
    .onAppear {
      selectedID = store.liveInsertHits.first?.id
      Task { @MainActor in
        await Task.yield()
        searchFocused = true
      }
    }
    .onChange(of: store.liveInsertHits.map(\.id)) { _, ids in
      guard selectedID == nil || !ids.contains(selectedID ?? "") else { return }
      selectedID = ids.first
    }
    .onExitCommand(perform: dismiss)
  }

  private var contextHeader: some View {
    HStack(spacing: 10) {
      Image(systemName: "waveform.path.ecg")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(.secondary)

      VStack(alignment: .leading, spacing: 2) {
        Text("Live Insert")
          .font(.callout.weight(.semibold))
        Text(contextText)
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Spacer()

      Text("⌘⇧F")
        .font(.system(size: 11, weight: .semibold, design: .rounded))
        .foregroundStyle(.secondary)
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
        .accessibilityLabel("Command Shift F")
    }
    .padding(.horizontal, 18)
    .frame(height: 54)
  }

  private var searchField: some View {
    HStack(spacing: 12) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 18, weight: .medium))
        .foregroundStyle(.secondary)

      TextField("Find a sample, track, clip, or chain", text: $store.liveInsertText)
        .textFieldStyle(.plain)
        .font(.system(size: 20, weight: .medium))
        .focused($searchFocused)
        .onSubmit(openSelected)
        .onKeyPress(.downArrow) {
          moveSelection(by: 1)
          return .handled
        }
        .onKeyPress(.upArrow) {
          moveSelection(by: -1)
          return .handled
        }
        .onKeyPress(.escape) {
          dismiss()
          return .handled
        }
        .accessibilityLabel("Find a sample, track, clip, or chain")
        .accessibilityHint(
          "Search project, Set, track, clip, device, and audio evidence stored on this Mac"
        )
        .accessibilityIdentifier("studio.live-insert.input")

      if store.isSearchingLiveInsert {
        ProgressView()
          .controlSize(.small)
          .accessibilityLabel("Searching")
      } else if !store.liveInsertText.isEmpty {
        Button {
          store.liveInsertText = ""
          searchFocused = true
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Clear search")
      }
    }
    .padding(.horizontal, 20)
    .frame(height: 68)
  }

  @ViewBuilder
  private var results: some View {
    let query = store.liveInsertText.trimmingCharacters(in: .whitespacesAndNewlines)
    if query.isEmpty {
      LiveInsertExamples { example in
        store.liveInsertText = example
        searchFocused = true
      }
    } else if !store.isSearchingLiveInsert && store.liveInsertHits.isEmpty {
      ContentUnavailableView(
        "Nothing matched",
        systemImage: "waveform.badge.magnifyingglass",
        description: Text(
          "Try the Song, project, track role, device, or clip name. Search remains entirely local.")
      )
    } else {
      List(selection: $selectedID) {
        ForEach(store.liveInsertHits) { hit in
          liveInsertRow(hit)
            .tag(hit.id)
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
    }
  }

  @ViewBuilder
  private func liveInsertRow(_ hit: StudioLiveInsertHit) -> some View {
    let row = Button {
      selectedID = hit.id
      openSource(hit)
    } label: {
      LiveInsertResultRow(hit: hit, isSelected: selectedID == hit.id)
    }
    .buttonStyle(.plain)
    .contextMenu {
      Button("Open Source in Studio") { openSource(hit) }
      if hit.fileURL != nil {
        Button("Reveal Source in Finder") { revealSource(hit) }
      }
    }
    .accessibilityLabel("\(hit.title), \(hit.kind.accessibilityName)")
    .accessibilityValue(hit.delivery.accessibilityValue)
    .accessibilityHint(hit.delivery.accessibilityHint)
    .accessibilityIdentifier("studio.live-insert.result.\(hit.id)")

    if hit.delivery == .userDraggableFile, let fileURL = hit.fileURL {
      row.draggable(fileURL) {
        LiveInsertDragPreview(hit: hit)
      }
    } else {
      row
    }
  }

  private var footer: some View {
    HStack(spacing: 14) {
      Label("Navigate", systemImage: "arrow.up.arrow.down")
      Label("Open source", systemImage: "return")
      if selectedHit?.delivery == .userDraggableFile {
        Label("Drag file to Live", systemImage: "hand.draw")
      } else {
        Label("Live Browser required", systemImage: "sidebar.left")
      }
      Spacer()
      Text("No automatic Live action")
        .foregroundStyle(.secondary)
    }
    .font(.caption)
    .padding(.horizontal, 18)
    .frame(height: 44)
    .accessibilityElement(children: .combine)
  }

  private var contextText: String {
    guard let application = store.liveInsertSourceApplicationName else {
      return "Foreground application unknown · destination not verified"
    }
    if application.localizedCaseInsensitiveContains("Ableton Live") {
      return "\(application) detected · active Set and destination track not yet verified"
    }
    return "Opened from \(application) · search only"
  }

  private func moveSelection(by delta: Int) {
    let ids = store.liveInsertHits.map(\.id)
    guard !ids.isEmpty else { return }
    guard let selectedID, let index = ids.firstIndex(of: selectedID) else {
      self.selectedID = ids.first
      return
    }
    self.selectedID = ids[min(max(index + delta, 0), ids.count - 1)]
  }

  private func openSelected() {
    guard let selectedHit else { return }
    openSource(selectedHit)
  }
}

private struct LiveInsertExamples: View {
  let select: (String) -> Void

  private let examples = [
    "lead vocal example set",
    "vocal eq chain",
    "verse vocal sample",
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 5) {
        Text("Search your studio history")
          .font(.title3.weight(.semibold))
        Text("Combine a Song or project name with the layer, sample, device, or chain you need.")
          .font(.callout)
          .foregroundStyle(.secondary)
      }

      VStack(alignment: .leading, spacing: 8) {
        ForEach(examples, id: \.self) { example in
          Button {
            select(example)
          } label: {
            HStack {
              Image(systemName: "text.magnifyingglass")
                .foregroundStyle(.secondary)
              Text(example)
              Spacer()
              Image(systemName: "arrow.up.left")
                .font(.caption)
                .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 12)
            .frame(height: 38)
            .background(.quaternary.opacity(0.7), in: RoundedRectangle(cornerRadius: 9))
          }
          .buttonStyle(.plain)
        }
      }

      Spacer()
    }
    .padding(24)
  }
}

private struct LiveInsertResultRow: View {
  let hit: StudioLiveInsertHit
  let isSelected: Bool

  var body: some View {
    HStack(spacing: 12) {
      Image(systemName: hit.kind.symbol)
        .font(.system(size: 15, weight: .medium))
        .foregroundStyle(isSelected ? .primary : .secondary)
        .frame(width: 24)

      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 7) {
          Text(hit.title)
            .font(.callout.weight(.semibold))
            .lineLimit(1)
          Text(hit.kind.label)
            .font(.caption2.weight(.medium))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(.quaternary, in: Capsule())
        }
        Text([hit.projectName, hit.setName, hit.detail].compactMap { $0 }.joined(separator: " · "))
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }

      Spacer(minLength: 12)

      Text(hit.delivery.label)
        .font(.caption.weight(.medium))
        .foregroundStyle(hit.delivery == .userDraggableFile ? .primary : .secondary)
        .lineLimit(1)
    }
    .padding(.horizontal, 10)
    .frame(minHeight: 50)
    .contentShape(Rectangle())
  }
}

private struct LiveInsertDragPreview: View {
  let hit: StudioLiveInsertHit

  var body: some View {
    Label(hit.title, systemImage: "waveform")
      .font(.callout.weight(.semibold))
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 10))
  }
}

extension StudioLiveInsertKind {
  fileprivate var label: String {
    switch self {
    case .track: "Track"
    case .audioClip: "Audio clip"
    case .audioFile: "Audio file"
    case .deviceChain: "Chain"
    }
  }

  fileprivate var accessibilityName: String { label.lowercased() }

  fileprivate var symbol: String {
    switch self {
    case .track: "slider.horizontal.3"
    case .audioClip: "waveform"
    case .audioFile: "waveform.badge.plus"
    case .deviceChain: "point.3.connected.trianglepath.dotted"
    }
  }
}

extension StudioLiveInsertDelivery {
  fileprivate var label: String {
    switch self {
    case .directInsertion: "Insert"
    case .userDraggableFile: "Drag to Live"
    case .requiresLiveBrowser: "Open source"
    case .inspectOnly: "Inspect"
    }
  }

  fileprivate var accessibilityValue: String { label }

  fileprivate var accessibilityHint: String {
    switch self {
    case .directInsertion:
      "Insert into the verified Ableton Live destination"
    case .userDraggableFile:
      "Drag this file result into Ableton Live, or press Return to inspect its source"
    case .requiresLiveBrowser:
      "Press Return to inspect the source. Ableton Live Browser navigation is required to load it"
    case .inspectOnly:
      "Press Return to inspect the indexed source evidence"
    }
  }
}
