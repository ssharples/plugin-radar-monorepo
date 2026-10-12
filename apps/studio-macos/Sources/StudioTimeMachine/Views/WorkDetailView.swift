import StudioCore
import SwiftUI

struct WorkDetailView: View {
  let work: StudioWork
  @Bindable var store: StudioLibraryStore
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var selectedRevisionID: String?
  @State private var showsAllVersions = false
  @State private var showsVersionPicker = false
  @State private var showsSelectedExports = false
  @State private var historySnapshot: WorkHistorySnapshot?
  @State private var isLoadingHistory = true
  @State private var availableWidth: CGFloat = 1000

  private let collapsedVersionCount = 12

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        header

        if isLoadingHistory && historySnapshot == nil {
          ProgressView("Reading project contents…")
            .frame(maxWidth: .infinity, minHeight: 320)
        } else if timelineEntries.isEmpty {
          ContentUnavailableView(
            "No versions found",
            systemImage: "clock.arrow.circlepath",
            description: Text("This Song has no readable Ableton Set history yet.")
          )
          .frame(maxWidth: .infinity, minHeight: 320)
        } else {
          if let selectedEntry {
            selectedVersionActions(selectedEntry)
            ProjectContentsView(entry: selectedEntry, store: store)
              .id(selectedEntry.id)
            selectedExportsDisclosure(selectedEntry)
          }
          sessionSources
        }
      }
      .padding(.horizontal, 32)
      .padding(.top, 32)
      .padding(.bottom, store.player.currentAsset == nil ? 50 : 118)
      .frame(maxWidth: 1100, alignment: .leading)
      .frame(maxWidth: .infinity, alignment: .center)
    }
    .background {
      GeometryReader { proxy in
        Color.clear.onChange(of: proxy.size.width, initial: true) { _, width in
          availableWidth = width - 64
        }
      }
    }
    .sheet(isPresented: $showsVersionPicker) {
      VStack(alignment: .leading, spacing: 18) {
        HStack {
          Text("Choose a version").font(.title2.weight(.semibold))
          Spacer()
          Button("Done") { showsVersionPicker = false }
            .keyboardShortcut(.cancelAction)
        }
        ScrollView { timelineSection }
      }
      .padding(24)
      .frame(width: 760, height: 620)
      .background(StudioShellPalette.canvas)
    }
    .task(id: historyRequestKey) {
      let requestedWork = work
      isLoadingHistory = true
      let worker = Task.detached(priority: .userInitiated) {
        try? WorkHistorySnapshot(work: requestedWork)
      }
      let snapshot = await withTaskCancellationHandler {
        await worker.value
      } onCancel: {
        worker.cancel()
      }
      guard !Task.isCancelled, let snapshot else { return }
      historySnapshot = snapshot
      isLoadingHistory = false
      reconcileSelection(in: snapshot.entries)
    }
  }

  private var header: some View {
    HStack(alignment: .center, spacing: 24) {
      ProjectObjectView(identity: work.displayName, size: 88, showsDisc: true, isActive: true)

      VStack(alignment: .leading, spacing: 7) {
        Text(work.displayName)
          .font(.custom("Helvetica Neue", size: 34).weight(.bold))
          .lineLimit(2)

        HStack(spacing: 8) {
          Text(work.artist.displayName == "Unknown" ? "Unassigned Artist" : work.artist.displayName)
            .font(.body.weight(.semibold))
            .foregroundStyle(work.artist.displayName == "Unknown" ? .orange : .primary)

          Text("·")
            .foregroundStyle(.tertiary)

          if let tempo = selectedEntry?.revision.set.content.tempo {
            Text("\(tempo.formatted(.number.precision(.fractionLength(0...1)))) BPM")
              .foregroundStyle(.secondary)
          }
        }

        HStack(spacing: 8) {
          Label(groupingLabel, systemImage: groupingSymbol)
            .help(confidenceText)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }

      if needsOrganisationReview {
        if work.sessions.count == 1, let session = work.sessions.first {
          Button("Organise…") { store.editOrganisation(for: session) }
            .buttonStyle(StudioCanvasButtonStyle(kind: .secondary))
        } else {
          Menu {
            ForEach(work.sessions) { session in
              Button(session.displayName) { store.editOrganisation(for: session) }
            }
          } label: {
            Label("Organise…", systemImage: "folder.badge.gearshape")
          }
          .buttonStyle(StudioCanvasButtonStyle(kind: .secondary))
        }
      }

      Spacer(minLength: 0)
    }
  }

  private var timelineSection: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 3) {
          Text("Version history")
            .font(.title2.weight(.semibold))
          Text("Every indexed save, combined across all related Sessions")
            .font(.callout)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Text("Newest first")
          .font(.caption.weight(.medium))
          .foregroundStyle(.secondary)
      }

      LazyVStack(spacing: 0) {
        ForEach(Array(visibleTimelineEntries.enumerated()), id: \.element.id) { index, entry in
          WorkRevisionTimelineRow(
            entry: entry,
            isSelected: entry.id == selectedRevisionID,
            isLatest: entry.id == timelineEntries.first?.id,
            isLast: index == visibleTimelineEntries.count - 1,
            artifactCount: artifacts(for: entry).count
          ) {
            let update = {
              selectedRevisionID = entry.id
              store.selectedWorkRevisionID = entry.id
              showsSelectedExports = false
              showsVersionPicker = false
            }
            if reduceMotion {
              update()
            } else {
              withAnimation(.easeOut(duration: 0.16), update)
            }
          }
        }
      }

      if timelineEntries.count > collapsedVersionCount {
        Button {
          if reduceMotion {
            showsAllVersions.toggle()
          } else {
            withAnimation(.easeOut(duration: 0.18)) {
              showsAllVersions.toggle()
            }
          }
        } label: {
          Label(
            showsAllVersions
              ? "Show recent versions only"
              : "Show all \(timelineEntries.count) versions",
            systemImage: showsAllVersions ? "chevron.up" : "chevron.down"
          )
        }
        .buttonStyle(StudioCanvasButtonStyle(kind: .secondary))
        .frame(maxWidth: .infinity, alignment: .center)
      }
    }
  }

  private func selectedVersionActions(_ entry: WorkTimelineEntry) -> some View {
    let isWide = availableWidth >= 620
    let layout =
      isWide
      ? AnyLayout(HStackLayout(spacing: 12))
      : AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
    return layout {
      VStack(alignment: .leading, spacing: 4) {
        Text(entry.displayName)
          .font(.callout.weight(.semibold))
          .lineLimit(1)
          .truncationMode(.middle)
        Text(
          "\(entry.id == timelineEntries.first?.id ? "Latest saved version" : "Earlier version") · \(entry.dateText)"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      if isWide { Spacer(minLength: 0) }
      versionActionButtons(entry)
    }
    .padding(.vertical, 12)
    .accessibilityElement(children: .contain)
  }

  private func versionActionButtons(_ entry: WorkTimelineEntry) -> some View {
    HStack(spacing: 12) {
      Button {
        showsVersionPicker = true
      } label: {
        Label("Versions · \(timelineEntries.count)", systemImage: "clock.arrow.circlepath")
      }
      .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
      .help("Choose which saved version supplies the tracks, audio references and devices below")
      Menu {
        Button("Set Details…") { store.openRevision(entry.revision, in: entry.session) }
        Button("Reveal Set in Finder") { store.revealInFinder(entry.revision.set.fileURL) }
        Divider()
        Button("Export Master WAV…") {
          store.chooseLiveExportDestination(for: entry.revision, in: entry.session, source: .main)
        }
        Button("Export Stems…") {
          store.chooseLiveExportDestination(
            for: entry.revision, in: entry.session,
            source: .allIndividualTracks(expectedTrackCount: nil))
        }
      } label: {
        Image(systemName: "ellipsis").frame(width: 24, height: 30)
      }
      .menuStyle(.borderlessButton)
      .fixedSize()
      .accessibilityLabel("Actions for selected Set")
      Button {
        store.planOpenInAbletonLive(for: entry.revision, in: entry.session)
      } label: {
        Label("Open in Live…", systemImage: "arrow.up.right.square")
      }
      .buttonStyle(StudioCanvasButtonStyle(kind: .secondary))
      .help("Review the exact Set before opening it in Ableton Live")
    }
    .fixedSize(horizontal: true, vertical: false)
  }

  @ViewBuilder
  private func selectedExportsDisclosure(_ entry: WorkTimelineEntry) -> some View {
    let inferred = artifacts(for: entry)
    let verified = verifiedExports(for: entry)
    let verifiedPaths = Set(verified.flatMap(\.outputs).map { $0.fileURL.standardizedFileURL.path })
    let inferredOnly = inferred.filter {
      !verifiedPaths.contains($0.asset.fileURL.standardizedFileURL.path)
    }
    let outputCount = verified.flatMap(\.outputs).count + inferredOnly.count
    if outputCount > 0 {
      DisclosureGroup(isExpanded: $showsSelectedExports) {
        VStack(spacing: 0) {
          ForEach(verified) { export in
            ForEach(export.outputs) { output in
              exportRow(
                name: output.fileURL.lastPathComponent,
                detail:
                  "Verified \(export.source.title) · \(output.sampleRate.formatted()) Hz · \(output.bitDepth)-bit",
                url: output.fileURL,
                verified: true)
            }
          }
          ForEach(inferredOnly) { artifact in
            exportRow(
              name: artifact.asset.fileURL.lastPathComponent,
              detail: "Likely \(artifact.kind.displayName.lowercased()) · \(artifact.explanation)",
              url: artifact.asset.fileURL,
              verified: false)
          }
        }
        .padding(.top, 8)
      } label: {
        HStack {
          Label("Exports", systemImage: "waveform.badge.checkmark")
            .font(.headline)
          Text("\(outputCount)")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
          Spacer()
          Text(verified.isEmpty ? "Matched from Finder evidence" : "Includes verified exports")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .background(StudioShellPalette.canvasRaised)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
  }

  private func exportRow(
    name: String,
    detail: String,
    url: URL,
    verified: Bool
  ) -> some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: verified ? "checkmark.seal.fill" : "waveform")
        .foregroundStyle(verified ? Color.green : Color.secondary)
        .frame(width: 18)
      VStack(alignment: .leading, spacing: 2) {
        Button(name) { store.revealInFinder(url) }
          .buttonStyle(.plain)
          .font(.callout.weight(.medium))
          .lineLimit(1)
          .help("Reveal \(name) in Finder")
          .accessibilityLabel("Reveal \(name) in Finder")
        Text(detail).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
      }
      Spacer(minLength: 8)
      Button("Reveal") { store.revealInFinder(url) }
        .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
    }
    .padding(.vertical, 8)
  }

  private var sessionSources: some View {
    DisclosureGroup {
      VStack(spacing: 0) {
        ForEach(Array(work.sessions.enumerated()), id: \.element.id) { index, session in
          HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
              Text(session.displayName)
                .font(.body.weight(.medium))
              Text(
                "\(session.role.displayName) · \(session.revisions.count) versions · \(session.previewAssets.count) audio files"
              )
              .font(.caption)
              .foregroundStyle(.secondary)
              LocalPathText(url: session.rootURL, font: .caption2, lineLimit: 1)
            }

            Spacer(minLength: 12)

            Button("Organise…") { store.editOrganisation(for: session) }
              .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
            Button {
              store.revealInFinder(session.rootURL)
            } label: {
              Label("Reveal", systemImage: "folder")
            }
            .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
          }
          .padding(.vertical, 12)

          if index < work.sessions.count - 1 {
            Divider()
          }
        }
      }
      .padding(.top, 10)
    } label: {
      HStack {
        Label("Session sources", systemImage: "folder.badge.gearshape")
          .font(.headline)
        Spacer()
        Text(
          "\(work.sessions.count) physical folder\(work.sessions.count == 1 ? "" : "s") · files untouched"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 6)
  }

  private var historyRequestKey: String { "\(work.id):\(store.workCatalogGeneration)" }

  private var timelineEntries: [WorkTimelineEntry] { historySnapshot?.entries ?? [] }

  private var visibleTimelineEntries: [WorkTimelineEntry] {
    showsAllVersions ? timelineEntries : Array(timelineEntries.prefix(collapsedVersionCount))
  }

  private var selectedEntry: WorkTimelineEntry? {
    guard let selectedRevisionID else { return timelineEntries.first }
    return timelineEntries.first { $0.id == selectedRevisionID }
  }

  private func artifacts(for entry: WorkTimelineEntry) -> [RevisionArtifactAssociation] {
    historySnapshot?.artifacts(for: entry) ?? []
  }

  private func reconcileSelection(in entries: [WorkTimelineEntry]) {
    let availableIDs = Set(entries.map(\.id))
    let rememberedID = selectedRevisionID ?? store.selectedWorkRevisionID
    selectedRevisionID =
      rememberedID.flatMap { availableIDs.contains($0) ? $0 : nil }
      ?? entries.first?.id
    store.selectedWorkRevisionID = selectedRevisionID
    if let selectedRevisionID,
      let index = entries.firstIndex(where: { $0.id == selectedRevisionID }),
      index >= collapsedVersionCount
    {
      showsAllVersions = true
    }
  }

  private func verifiedExports(for entry: WorkTimelineEntry) -> [AbletonExportEvidence] {
    store.abletonExportEvidence.filter {
      $0.revisionID == entry.revision.id || $0.setID == entry.revision.set.id
    }
  }

  private var groupingLabel: String {
    switch work.confidence {
    case .confirmed: "Confirmed grouping"
    case .automatic: "Auto-grouped"
    case .suggested: "Grouping needs review"
    case .unresolved: "Artist needs review"
    }
  }

  private var groupingSymbol: String {
    work.confidence == .confirmed ? "checkmark.seal" : "sparkles"
  }

  private var confidenceText: String {
    switch work.confidence {
    case .confirmed: "Manually confirmed organisation"
    case .automatic: "Grouped from deterministic path and filename evidence"
    case .suggested: "Suggested grouping—review recommended"
    case .unresolved: "Artist needs review"
    }
  }

  private var needsOrganisationReview: Bool {
    work.artist.displayName == "Unknown"
      || work.confidence == .suggested
      || work.confidence == .unresolved
  }
}

private struct WorkRevisionTimelineRow: View {
  let entry: WorkTimelineEntry
  let isSelected: Bool
  let isLatest: Bool
  let isLast: Bool
  let artifactCount: Int
  let select: () -> Void

  var body: some View {
    Button(action: select) {
      HStack(alignment: .top, spacing: 0) {
        dateColumn
          .frame(width: 74, alignment: .leading)

        timelineRail
          .frame(width: 28)

        VStack(alignment: .leading, spacing: isSelected ? 7 : 4) {
          HStack(spacing: 8) {
            Text(entry.displayName)
              .font(.body.weight(isSelected ? .semibold : .medium))
              .foregroundStyle(.primary)
              .lineLimit(1)

            if isLatest {
              statusTag(
                "LATEST", foreground: StudioShellPalette.ink, background: StudioShellPalette.signal)
            } else {
              statusTag(
                entry.revision.set.isBackup ? "BACKUP" : "SET",
                foreground: .secondary,
                background: Color.secondary.opacity(0.09)
              )
            }

            Spacer(minLength: 8)

            if artifactCount > 0 {
              Label("\(artifactCount)", systemImage: "waveform")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .help("\(artifactCount) likely exported audio file\(artifactCount == 1 ? "" : "s")")
            }

            Text(entry.session.role.displayName)
              .font(.caption.weight(.medium))
              .foregroundStyle(.secondary)
          }

          Text(entry.session.displayName)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)

          if isSelected {
            HStack(spacing: 8) {
              Text(entry.revision.timestamp.explanation)
                .lineLimit(1)
              Text("·")
              Text("\(entry.revision.set.structure.trackCount) tracks")
              Text("·")
              Text(entry.revision.set.liveVersionText)
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
          }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 11)
        .background(
          isSelected ? StudioShellPalette.ink.opacity(0.055) : .clear,
          in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .focusEffectDisabled()
    .accessibilityLabel(
      "\(entry.displayName), \(entry.session.role.displayName), \(entry.dateText)\(isLatest ? ", latest version" : "")"
    )
    .accessibilityHint("Choose this version to browse its tracks, source audio and devices")
  }

  private var dateColumn: some View {
    VStack(alignment: .leading, spacing: 1) {
      if let date = entry.date {
        Text(date.formatted(.dateTime.day().month(.abbreviated)))
          .font(.callout.weight(.semibold))
          .foregroundStyle(isSelected ? .primary : .secondary)
        Text(date.formatted(.dateTime.year()))
          .font(.caption2)
          .foregroundStyle(.tertiary)
      } else {
        Text("Unknown")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.top, 12)
  }

  private var timelineRail: some View {
    ZStack(alignment: .top) {
      if !isLast {
        Rectangle()
          .fill(Color.secondary.opacity(0.18))
          .frame(width: 1)
          .padding(.top, 24)
          .frame(maxHeight: .infinity)
      }

      Circle()
        .fill(isSelected ? StudioShellPalette.ink : StudioShellPalette.canvas)
        .frame(width: isSelected ? 10 : 8, height: isSelected ? 10 : 8)
        .overlay {
          Circle()
            .stroke(
              isSelected ? StudioShellPalette.ink : Color.secondary.opacity(0.42), lineWidth: 1)
        }
        .padding(.top, 17)
    }
    .frame(maxHeight: .infinity)
  }

  private func statusTag(_ title: String, foreground: Color, background: Color) -> some View {
    Text(title)
      .font(.system(size: 8, weight: .bold, design: .rounded))
      .foregroundStyle(foreground)
      .padding(.horizontal, 6)
      .padding(.vertical, 3)
      .background(background, in: Capsule())
  }
}

extension SessionRole {
  fileprivate var displayName: String {
    switch self {
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

extension RevisionArtifactKind {
  fileprivate var displayName: String {
    switch self {
    case .stem: "Stem"
    case .master: "Master"
    case .bounce: "Bounce"
    case .mix: "Mix"
    case .render: "Render"
    }
  }
}
