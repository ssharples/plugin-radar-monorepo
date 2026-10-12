import AppKit
import StudioCore
import SwiftUI

/// The working contents of one selected Set. History selects the source; this view owns reuse.
struct ProjectContentsView: View {
  let entry: WorkTimelineEntry
  @Bindable var store: StudioLibraryStore
  @State private var contentIndex: SetContentBrowserIndex?
  @State private var selectedTrackID: String?
  @State private var section = ProjectContentSection.tracks
  @State private var filterText = ""
  @State private var onlyLikelyBounces = false
  @State private var reuseRequest: SetReuseRequest?
  @State private var availableWidth: CGFloat = 800

  private var requestKey: String { "\(entry.id):\(store.workCatalogGeneration)" }

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      controls
      if let contentIndex {
        if section == .tracks {
          trackBrowser(contentIndex)
        } else {
          projectAudio(contentIndex)
        }
      } else {
        ProgressView("Reading tracks and audio…")
          .frame(maxWidth: .infinity, minHeight: 300)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background {
      GeometryReader { proxy in
        Color.clear.onChange(of: proxy.size.width, initial: true) { _, width in
          availableWidth = width
        }
      }
    }
    .onChange(of: filterText) { _, _ in
      guard let contentIndex else { return }
      let matches = filteredTracks(contentIndex)
      if !matches.contains(where: { $0.id == selectedTrackID }) {
        selectedTrackID = matches.first?.id
      }
    }
    .task(id: requestKey) {
      let content = entry.revision.set.content
      let audio = entry.session.previewAssets
      let worker = Task.detached(priority: .userInitiated) {
        SetContentBrowserIndex(content: content, projectAudio: audio)
      }
      let result = await withTaskCancellationHandler {
        await worker.value
      } onCancel: {
        worker.cancel()
      }
      guard !Task.isCancelled else { return }
      contentIndex = result
      if !result.tracks.contains(where: { $0.id == selectedTrackID }) {
        selectedTrackID =
          result.tracks.first(where: {
            $0.audio.contains { $0.clips.contains { $0.placement != .takeLane } }
          })?.id
          ?? result.tracks.first(where: { !$0.audio.isEmpty })?.id
          ?? result.tracks.first?.id
      }
    }
    .sheet(item: $reuseRequest) { request in
      SetReuseGuideView(request: request, reveal: store.revealInFinder)
    }
  }

  private var controls: some View {
    let layout =
      availableWidth >= 500
      ? AnyLayout(HStackLayout(spacing: 18))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
    return layout {
      Picker("Project contents", selection: $section) {
        Text("Tracks").tag(ProjectContentSection.tracks)
        Text("Audio files").tag(ProjectContentSection.audio)
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      .frame(width: 220, height: 28, alignment: .leading)
      .onChange(of: section) { _, _ in filterText = "" }

      HStack(spacing: 7) {
        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
        TextField(
          section == .tracks ? "Find a track, clip or device" : "Find an audio file",
          text: $filterText
        )
        .textFieldStyle(.plain)
        .accessibilityLabel(section == .tracks ? "Find project content" : "Find project audio")
        if !filterText.isEmpty {
          Button {
            filterText = ""
          } label: {
            Image(systemName: "xmark.circle.fill")
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Clear project filter")
        }
      }
      .padding(.horizontal, 10)
      .frame(height: 32)
      .background(StudioShellPalette.canvasRaised, in: RoundedRectangle(cornerRadius: 8))
    }
  }

  private func trackBrowser(_ index: SetContentBrowserIndex) -> some View {
    let tracks = filteredTracks(index)
    let isWide = availableWidth >= 620
    let layout =
      isWide
      ? AnyLayout(HStackLayout(alignment: .top, spacing: 22))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: 18))
    return layout {
      VStack(alignment: .leading, spacing: 10) {
        Text("\(tracks.count) track\(tracks.count == 1 ? "" : "s")")
          .font(.caption.weight(.medium))
          .foregroundStyle(.secondary)
        if tracks.isEmpty {
          Text(
            filterText.isEmpty
              ? "No track structure is available for this Set." : "No matching tracks."
          )
          .font(.callout)
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, minHeight: 180, alignment: .topLeading)
        } else {
          List(selection: $selectedTrackID) {
            ForEach(tracks) { item in
              ProjectTrackRow(item: item)
                .tag(item.id)
                .listRowSeparator(.hidden)
            }
          }
          .listStyle(.plain)
          .scrollContentBackground(.hidden)
          .frame(height: isWide ? min(560, max(340, CGFloat(tracks.count) * 53)) : 180)
          .accessibilityLabel("Tracks in \(entry.displayName)")
        }
      }
      .frame(width: isWide ? 220 : nil)

      if isWide {
        Rectangle()
          .fill(StudioShellPalette.canvasStroke)
          .frame(width: 1)
      }

      if let selected = tracks.first(where: { $0.id == selectedTrackID }) ?? tracks.first {
        ProjectTrackContentsView(
          item: selected,
          store: store,
          reuse: { kind in
            reuseRequest = SetReuseRequest(
              sourceSetURL: entry.revision.set.fileURL,
              projectURL: entry.session.rootURL,
              track: selected.track,
              kind: kind
            )
          }
        )
        .id("\(entry.id):\(selected.id)")
        .frame(maxWidth: .infinity, alignment: .topLeading)
      } else {
        ContentUnavailableView(
          "Choose a track",
          systemImage: "slider.horizontal.3",
          description: Text("Its source audio and devices will appear here.")
        )
        .frame(maxWidth: .infinity, minHeight: 260)
      }
    }
  }

  private func projectAudio(_ index: SetContentBrowserIndex) -> some View {
    let files = index.projectAudio.filter {
      (!onlyLikelyBounces || $0.isLikelyUserRender)
        && (filterText.isEmpty || $0.filename.localizedStandardContains(filterText))
    }
    return VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 4) {
          Text("Audio in \(entry.session.displayName)")
            .font(.title3.weight(.semibold))
          Text("Files in this project folder, including audio from other saved versions.")
            .font(.callout)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Toggle("Possible bounces", isOn: $onlyLikelyBounces)
          .toggleStyle(.checkbox)
          .help("Filename suggestions for mixes, stems and bounces; listen to confirm.")
      }
      Text("Listen here, then drag a file into your current Ableton Set.")
        .font(.callout)
        .foregroundStyle(.secondary)
      if files.isEmpty {
        ContentUnavailableView(
          "No matching audio files",
          systemImage: "waveform",
          description: Text(
            "Try another filter, or choose a track to find audio referenced outside this folder.")
        )
        .frame(maxWidth: .infinity, minHeight: 250)
      } else {
        LazyVStack(spacing: 0) {
          ForEach(files) { asset in
            ProjectReusableAudioRow(
              name: asset.filename,
              detail: asset.category.displayName
                + (asset.isLikelyUserRender ? " · Possible bounce" : ""),
              asset: asset,
              unavailableReason: "File unavailable at its indexed location",
              previewLabel: "Project audio",
              player: store.player,
              reveal: store.revealInFinder
            )
          }
        }
      }
    }
  }

  private func filteredTracks(_ index: SetContentBrowserIndex) -> [SetContentBrowserTrack] {
    guard !filterText.isEmpty else { return index.tracks }
    return index.tracks.filter { item in
      item.track.name.localizedStandardContains(filterText)
        || item.audio.contains { $0.filename.localizedStandardContains(filterText) }
        || item.track.clips.contains { $0.name.localizedStandardContains(filterText) }
        || Self.devices(item.track.devices, contain: filterText)
    }
  }

  private static func devices(_ devices: [SetDevice], contain text: String) -> Bool {
    devices.contains {
      $0.displayName.localizedStandardContains(text)
        || Self.devices($0.nestedDevices, contain: text)
    }
  }
}

private enum ProjectContentSection { case tracks, audio }

private struct ProjectTrackRow: View {
  let item: SetContentBrowserTrack

  var body: some View {
    HStack(spacing: 9) {
      Image(systemName: item.track.kind.browserSymbol)
        .foregroundStyle(.secondary)
        .frame(width: 18)
      VStack(alignment: .leading, spacing: 3) {
        Text(item.track.name.isEmpty ? "Untitled track" : item.track.name)
          .font(.callout.weight(.medium))
          .lineLimit(1)
        Text(
          item.track.kind.browserTitle
            + " · \(item.track.clips.count) clip\(item.track.clips.count == 1 ? "" : "s")"
        )
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
      }
      Spacer(minLength: 0)
    }
    .padding(.leading, CGFloat(min(item.depth, 3)) * 10)
    .padding(.vertical, 5)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      "\(item.track.name), \(item.track.kind.browserTitle), \(item.audio.count) audio files, \(item.track.devices.count) devices"
    )
  }
}

extension SetTrackKind {
  var browserSymbol: String {
    switch self {
    case .audio: "waveform"
    case .midi: "pianokeys"
    case .group: "folder"
    case .returnTrack: "arrow.uturn.backward"
    case .main: "speaker.wave.2"
    }
  }

  var browserTitle: String {
    switch self {
    case .audio: "Audio"
    case .midi: "MIDI"
    case .group: "Group"
    case .returnTrack: "Return"
    case .main: "Main"
    }
  }
}
