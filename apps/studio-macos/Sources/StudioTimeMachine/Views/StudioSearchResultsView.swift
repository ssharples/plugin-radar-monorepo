import StudioCore
import SwiftUI

struct StudioGlobalSearchOverlay: View {
  @Bindable var store: StudioLibraryStore
  @FocusState private var inputFocused: Bool
  @State private var selectedResultID: String?

  private var query: String {
    store.globalSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  var body: some View {
    ZStack(alignment: .top) {
      Color.black.opacity(0.24)
        .contentShape(Rectangle())
        .onTapGesture { store.dismissGlobalSearch() }
        .accessibilityHidden(true)

      searchPanel
        .padding(.top, 78)
        .padding(.horizontal, 32)
    }
    .onExitCommand { store.dismissGlobalSearch() }
    .onAppear {
      selectedResultID = store.globalSongHits.first.map(songSelectionID)
      Task { @MainActor in
        await Task.yield()
        inputFocused = true
      }
    }
    .onChange(of: store.globalSearchText) { _, _ in
      selectedResultID = nil
    }
    .onChange(of: store.globalSongHits.map(\.id)) { _, _ in
      guard selectedResultID == nil || !selectionStillVisible else { return }
      selectedResultID = store.globalSongHits.first.map(songSelectionID)
    }
    .onChange(of: store.globalEvidenceHits.map(\.id)) { _, _ in
      guard selectedResultID == nil || !selectionStillVisible else { return }
      selectedResultID =
        store.globalSongHits.first.map(songSelectionID)
        ?? store.globalEvidenceHits.first.map(evidenceSelectionID)
    }
  }

  private var searchPanel: some View {
    VStack(spacing: 0) {
      searchField
      Divider().overlay(StudioShellPalette.canvasStroke)
      results
    }
    .frame(width: 680)
    .background(StudioShellPalette.canvasRaised)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(Color.black.opacity(0.14), lineWidth: 1)
    }
    .shadow(color: Color.black.opacity(0.22), radius: 28, x: 0, y: 16)
    .accessibilityElement(children: .contain)
    .accessibilityAddTraits(.isModal)
    .accessibilityLabel("Search Studio")
    .accessibilityIdentifier("studio.search.overlay")
  }

  private var searchField: some View {
    HStack(spacing: 12) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 17, weight: .medium))
        .foregroundStyle(StudioShellPalette.mutedInk)

      TextField("Find a Song or Artist", text: $store.globalSearchText)
        .textFieldStyle(.plain)
        .font(.system(size: 18, weight: .medium))
        .foregroundStyle(StudioShellPalette.ink)
        .focused($inputFocused)
        .onSubmit(openSelectedResult)
        .onKeyPress(.downArrow) {
          moveSelection(by: 1)
          return .handled
        }
        .onKeyPress(.upArrow) {
          moveSelection(by: -1)
          return .handled
        }
        .onKeyPress(.escape) {
          store.dismissGlobalSearch()
          return .handled
        }
        .accessibilityLabel("Find a Song or Artist")
        .accessibilityIdentifier("studio.search.input")

      if !store.globalSearchText.isEmpty {
        Button {
          store.globalSearchText = ""
          inputFocused = true
        } label: {
          Image(systemName: "xmark.circle.fill")
            .font(.system(size: 15))
            .foregroundStyle(StudioShellPalette.mutedInk.opacity(0.70))
        }
        .buttonStyle(.plain)
        .help("Clear search")
        .accessibilityLabel("Clear search")
      }

      Text("esc")
        .font(.system(size: 10, weight: .semibold, design: .rounded))
        .foregroundStyle(StudioShellPalette.mutedInk)
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(StudioShellPalette.ink.opacity(0.055), in: RoundedRectangle(cornerRadius: 6))
        .accessibilityHidden(true)
    }
    .padding(.horizontal, 20)
    .frame(height: 62)
  }

  @ViewBuilder
  private var results: some View {
    if store.workCatalog == nil && store.isRebuildingOrganisation {
      VStack(spacing: 10) {
        ProgressView().controlSize(.small)
        Text("Organising Songs…")
          .font(.callout.weight(.medium))
        Text("Search will appear as the local Song catalogue becomes ready.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, minHeight: 210)
    } else if store.globalSongHits.isEmpty && !store.globalSearchExpanded {
      VStack(spacing: 9) {
        Image(systemName: "music.note.list")
          .font(.system(size: 24, weight: .light))
          .foregroundStyle(StudioShellPalette.mutedInk.opacity(0.70))
        Text(query.isEmpty ? "No recent Songs" : "No matching Songs")
          .font(.headline)
        Text(
          query.isEmpty
            ? "Songs appear here after they are organised in your Studio Library."
            : "Try a Song or Artist name, or expand into indexed project evidence."
        )
        .font(.callout)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity, minHeight: 210)
      .padding(24)

      expansionControl
    } else {
      List(selection: $selectedResultID) {
        Section(query.isEmpty ? "Recent Songs" : "Songs") {
          if store.globalSongHits.isEmpty {
            Text("No Song or Artist matches “\(query)”.")
              .font(.callout)
              .foregroundStyle(.secondary)
              .padding(.vertical, 8)
          } else {
            ForEach(store.globalSongHits) { hit in
              if let work = store.globalSongResults.first(where: { $0.id == hit.workID }) {
                Button {
                  selectedResultID = songSelectionID(hit)
                  store.openGlobalSong(work)
                } label: {
                  SongSearchResultRow(hit: hit)
                }
                .buttonStyle(.plain)
                .tag(songSelectionID(hit))
                .accessibilityLabel("\(hit.songName), by \(artistLabel(hit.artistName))")
                .accessibilityHint("Open this Song in the Studio Library")
                .accessibilityIdentifier("studio.search.song.\(hit.workID)")
              }
            }
          }
        }

        if !query.isEmpty {
          Section {
            expansionControl
              .listRowSeparator(.hidden)
          }
        }

        if store.globalSearchExpanded {
          Section("Project files and details") {
            if store.isSearchingGlobalEvidence {
              HStack(spacing: 10) {
                ProgressView().controlSize(.small)
                Text("Searching the local studio index…")
                  .font(.callout)
                  .foregroundStyle(.secondary)
              }
              .padding(.vertical, 12)
            } else if store.globalEvidenceHits.isEmpty {
              Text("No indexed project files or details match “\(query)”.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .padding(.vertical, 12)
            } else {
              ForEach(store.globalEvidenceHits) { hit in
                Button {
                  selectedResultID = evidenceSelectionID(hit)
                  store.openGlobalEvidence(hit)
                } label: {
                  StudioIndexedSearchResultRow(
                    hit: hit,
                    rootName: store.rootDisplayName(for: hit.rootURL)
                  )
                }
                .buttonStyle(.plain)
                .tag(evidenceSelectionID(hit))
                .contextMenu {
                  Button("Open") { store.openGlobalEvidence(hit) }
                  if let fileURL = hit.fileURL {
                    Button("Reveal in Finder") { store.revealInFinder(fileURL) }
                  }
                }
              }
            }
          }
        }
      }
      .listStyle(.plain)
      .scrollContentBackground(.hidden)
      .frame(height: resultListHeight)
    }
  }

  private var expansionControl: some View {
    Button {
      store.expandGlobalSearch()
      inputFocused = true
    } label: {
      HStack(spacing: 9) {
        Image(systemName: store.globalSearchExpanded ? "checkmark" : "plus.magnifyingglass")
          .frame(width: 18)
        Text(
          store.globalSearchExpanded
            ? "Searching all project files and details"
            : "Search all project files and details"
        )
        Spacer()
        if !store.globalSearchExpanded {
          Image(systemName: "chevron.right")
            .font(.system(size: 10, weight: .semibold))
        }
      }
      .font(.callout.weight(.medium))
      .foregroundStyle(StudioShellPalette.ink)
      .padding(.vertical, 9)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(store.globalSearchExpanded || query.isEmpty)
    .help("Include Projects, Sets, tracks, clips, plug-ins, locators, and audio")
    .accessibilityHint("Adds a separate section of local indexed evidence")
    .accessibilityIdentifier("studio.search.expand-evidence")
  }

  private var selectionStillVisible: Bool {
    guard let selectedResultID else { return false }
    return store.globalSongHits.contains { songSelectionID($0) == selectedResultID }
      || store.globalEvidenceHits.contains { evidenceSelectionID($0) == selectedResultID }
  }

  private var selectableResultIDs: [String] {
    store.globalSongHits.map(songSelectionID)
      + (store.globalSearchExpanded ? store.globalEvidenceHits.map(evidenceSelectionID) : [])
  }

  private var resultListHeight: CGFloat {
    let songHeight = CGFloat(store.globalSongHits.count) * 55
    let expansionHeight: CGFloat = query.isEmpty ? 0 : 52
    let evidenceHeight: CGFloat =
      store.globalSearchExpanded
      ? CGFloat(max(1, store.globalEvidenceHits.count)) * 55 + 30
      : 0
    return min(498, max(150, 30 + songHeight + expansionHeight + evidenceHeight))
  }

  private func openSelectedResult() {
    if let selectedResultID,
      let hit = store.globalSongHits.first(where: { songSelectionID($0) == selectedResultID }),
      let work = store.globalSongResults.first(where: { $0.id == hit.workID })
    {
      store.openGlobalSong(work)
      return
    }
    if let selectedResultID,
      let hit = store.globalEvidenceHits.first(where: {
        evidenceSelectionID($0) == selectedResultID
      })
    {
      store.openGlobalEvidence(hit)
      return
    }
    if let first = store.globalSongResults.first {
      store.openGlobalSong(first)
    }
  }

  private func moveSelection(by offset: Int) {
    let ids = selectableResultIDs
    guard !ids.isEmpty else {
      selectedResultID = nil
      return
    }
    let currentIndex =
      selectedResultID.flatMap { ids.firstIndex(of: $0) }
      ?? (offset > 0 ? -1 : ids.count)
    selectedResultID = ids[min(max(currentIndex + offset, 0), ids.count - 1)]
  }

  private func songSelectionID(_ hit: StudioWorkSearchHit) -> String {
    "song:\(hit.workID)"
  }

  private func evidenceSelectionID(_ hit: StudioSearchHit) -> String {
    "evidence:\(hit.id)"
  }

  private func artistLabel(_ name: String) -> String {
    name == "Unknown" ? "Unassigned Artist" : name
  }
}

private struct SongSearchResultRow: View {
  let hit: StudioWorkSearchHit

  var body: some View {
    HStack(spacing: 13) {
      Image(systemName: "music.note")
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(StudioShellPalette.mutedInk)
        .frame(width: 20)

      VStack(alignment: .leading, spacing: 3) {
        Text(hit.songName)
          .font(.system(size: 14.5, weight: .semibold))
          .foregroundStyle(StudioShellPalette.ink)
          .lineLimit(1)
        Text(hit.artistName == "Unknown" ? "Unassigned Artist" : hit.artistName)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }

      Spacer(minLength: 16)
      Image(systemName: "return")
        .font(.system(size: 10, weight: .medium))
        .foregroundStyle(.tertiary)
        .accessibilityHidden(true)
    }
    .padding(.vertical, 7)
    .contentShape(Rectangle())
  }
}

private struct StudioIndexedSearchResultRow: View {
  let hit: StudioSearchHit
  let rootName: String

  var body: some View {
    HStack(alignment: .top, spacing: 13) {
      Image(systemName: hit.kind.symbol)
        .font(.system(size: 12.5, weight: .medium))
        .foregroundStyle(.secondary)
        .frame(width: 20)

      VStack(alignment: .leading, spacing: 3) {
        Text(hit.title)
          .font(.body.weight(.medium))
          .foregroundStyle(.primary)
          .lineLimit(1)
        Text("\(hit.context) · \(rootName)")
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }

      Spacer(minLength: 16)
      Text(hit.kind.displayName)
        .font(.caption2.weight(.semibold))
        .foregroundStyle(.secondary)
    }
    .padding(.vertical, 7)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(hit.kind.displayName), \(hit.title), \(hit.context), \(rootName)")
    .accessibilityHint("Open this indexed result")
  }
}

extension StudioSearchKind {
  fileprivate var displayName: String {
    switch self {
    case .project: "PROJECT"
    case .set: "SET"
    case .track: "TRACK"
    case .clip: "CLIP"
    case .device: "DEVICE"
    case .locator: "LOCATOR"
    case .audio: "AUDIO"
    }
  }

  fileprivate var symbol: String {
    switch self {
    case .project: "square.stack.3d.up"
    case .set: "doc.zipper"
    case .track: "slider.horizontal.3"
    case .clip: "waveform.path"
    case .device: "dial.medium"
    case .locator: "mappin"
    case .audio: "waveform"
    }
  }
}
