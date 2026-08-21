import StudioCore
import SwiftUI

struct WorkDetailView: View {
  let work: StudioWork
  @Bindable var store: StudioLibraryStore
  @State private var selectedRevisionID: String?
  @State private var showsAllVersions = false
  @State private var showsSelectedExports = false

  private let collapsedVersionCount = 12

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 28) {
        header

        if timelineEntries.isEmpty {
          ContentUnavailableView(
            "No versions found",
            systemImage: "clock.arrow.circlepath",
            description: Text("This Song has no readable Ableton Set history yet.")
          )
          .frame(maxWidth: .infinity, minHeight: 320)
        } else {
          timelineSection
          sessionSources
        }
      }
      .padding(.horizontal, 42)
      .padding(.top, 32)
      .padding(.bottom, store.player.currentAsset == nil ? 50 : 118)
      .frame(maxWidth: 960, alignment: .leading)
      .frame(maxWidth: .infinity, alignment: .center)
    }
    .onAppear {
      if selectedRevisionID == nil {
        let restoredID = store.selectedWorkRevisionID.flatMap { rememberedID in
          timelineEntries.contains(where: { $0.id == rememberedID }) ? rememberedID : nil
        }
        selectedRevisionID = restoredID ?? timelineEntries.first?.id
        store.selectedWorkRevisionID = selectedRevisionID
      }
    }
  }

  private var header: some View {
    HStack(alignment: .center, spacing: 24) {
      ProjectObjectView(identity: work.displayName, size: 128, showsDisc: true, isActive: true)

      VStack(alignment: .leading, spacing: 7) {
        Text(work.displayName)
          .font(.custom("Helvetica Neue", size: 36).weight(.bold))
          .lineLimit(2)

        HStack(spacing: 8) {
          Text(work.artist.displayName == "Unknown" ? "Unassigned Artist" : work.artist.displayName)
            .font(.body.weight(.semibold))
            .foregroundStyle(work.artist.displayName == "Unknown" ? .orange : .primary)

          Text("·")
            .foregroundStyle(.tertiary)

          Text(historySummary)
            .foregroundStyle(.secondary)
        }

        HStack(spacing: 8) {
          Label(dateRangeText, systemImage: "calendar")
          Label(groupingLabel, systemImage: groupingSymbol)
            .help(confidenceText)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
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

      if let selectedEntry {
        selectedVersionActions(selectedEntry)
        selectedExportsDisclosure(selectedEntry)
      }

      VStack(spacing: 0) {
        ForEach(Array(visibleTimelineEntries.enumerated()), id: \.element.id) { index, entry in
          WorkRevisionTimelineRow(
            entry: entry,
            isSelected: entry.id == selectedRevisionID,
            isLatest: entry.id == timelineEntries.first?.id,
            isLast: index == visibleTimelineEntries.count - 1,
            artifactCount: artifacts(for: entry).count
          ) {
            withAnimation(.easeOut(duration: 0.16)) {
              selectedRevisionID = entry.id
              store.selectedWorkRevisionID = entry.id
            }
          }
        }
      }

      if timelineEntries.count > collapsedVersionCount {
        Button {
          withAnimation(.easeOut(duration: 0.18)) {
            showsAllVersions.toggle()
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
    let linkedArtifacts = artifacts(for: entry)
    let verified = verifiedExports(for: entry)
    return HStack(spacing: 18) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 8) {
          Text(entry.displayName)
            .font(.headline)
            .foregroundStyle(.white)
            .lineLimit(1)
          if entry.id == timelineEntries.first?.id {
            Text("LATEST")
              .font(.caption2.weight(.bold))
              .foregroundStyle(StudioShellPalette.ink)
              .padding(.horizontal, 7)
              .padding(.vertical, 3)
              .background(StudioShellPalette.signal, in: Capsule())
          }
        }
        Text(
          "\(entry.session.role.displayName) · \(entry.dateText) · \(entry.revision.set.structure.trackCount) tracks"
        )
        .font(.caption)
        .foregroundStyle(.white.opacity(0.56))
        .lineLimit(1)

        if !linkedArtifacts.isEmpty || !verified.isEmpty {
          HStack(spacing: 8) {
            if !verified.isEmpty {
              Label(
                "\(verified.flatMap(\.outputs).count) verified",
                systemImage: "checkmark.seal")
            }
            if !linkedArtifacts.isEmpty {
              Label(artifactSummary(linkedArtifacts), systemImage: "waveform")
            }
            if verified.isEmpty && linkedArtifacts.contains(where: { $0.confidence != .automatic })
            {
              Text("Likely from this version")
            }
          }
          .font(.caption2.weight(.medium))
          .foregroundStyle(.white.opacity(0.68))
        }
      }

      Spacer(minLength: 12)

      Button {
        store.openRevision(entry.revision, in: entry.session)
      } label: {
        Label("Details", systemImage: "doc.text.magnifyingglass")
      }
      .buttonStyle(StudioShellButtonStyle(kind: .secondary))
      .help("Open this version's details without expanding the inspector")

      Menu {
        Button("Master WAV…") {
          store.chooseLiveExportDestination(
            for: entry.revision,
            in: entry.session,
            source: .main
          )
        }
        Button("Stems — Individual Tracks…") {
          store.chooseLiveExportDestination(
            for: entry.revision,
            in: entry.session,
            source: .allIndividualTracks(expectedTrackCount: nil)
          )
        }
        Divider()
        Button("Reveal Set in Finder") {
          store.revealInFinder(entry.revision.set.fileURL)
        }
      } label: {
        Label("Export", systemImage: "square.and.arrow.up")
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.88))
          .padding(.horizontal, 13)
          .frame(height: 34)
          .background(Color.white.opacity(0.08))
          .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
          .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
              .stroke(StudioShellPalette.chromeStroke, lineWidth: 1)
          }
      }
      .menuStyle(.borderlessButton)
      .tint(.white.opacity(0.88))
      .fixedSize()
      .help("Review a no-overwrite Ableton export")

      Button {
        store.planOpenInAbletonLive(for: entry.revision, in: entry.session)
      } label: {
        Label("Open in Live…", systemImage: "play.fill")
      }
      .buttonStyle(StudioShellButtonStyle(kind: .primary))
      .help("Review the exact Set and Ableton Live installation before opening")
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 15)
    .background(StudioShellPalette.ink)
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .accessibilityElement(children: .contain)
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
        Text("\(work.sessions.count) physical folders · files untouched")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 6)
  }

  private var timelineEntries: [WorkTimelineEntry] {
    work.sessions
      .flatMap { session in
        session.revisions.map { WorkTimelineEntry(session: session, revision: $0) }
      }
      .sorted {
        ($0.date ?? .distantPast) > ($1.date ?? .distantPast)
      }
  }

  private var visibleTimelineEntries: [WorkTimelineEntry] {
    showsAllVersions ? timelineEntries : Array(timelineEntries.prefix(collapsedVersionCount))
  }

  private var selectedEntry: WorkTimelineEntry? {
    guard let selectedRevisionID else { return timelineEntries.first }
    return timelineEntries.first { $0.id == selectedRevisionID }
  }

  private func artifacts(for entry: WorkTimelineEntry) -> [RevisionArtifactAssociation] {
    RevisionArtifactResolver()
      .resolve(assets: entry.session.previewAssets, revisions: entry.session.revisions)
      .filter { $0.revisionID == entry.revision.id }
  }

  private func verifiedExports(for entry: WorkTimelineEntry) -> [AbletonExportEvidence] {
    store.abletonExportEvidence.filter {
      $0.revisionID == entry.revision.id || $0.setID == entry.revision.set.id
    }
  }

  private func artifactSummary(_ artifacts: [RevisionArtifactAssociation]) -> String {
    let stems = artifacts.count { $0.kind == .stem }
    let masters = artifacts.count { $0.kind == .master }
    let others = artifacts.count - stems - masters
    return [
      stems > 0 ? "\(stems) stem\(stems == 1 ? "" : "s")" : nil,
      masters > 0 ? "\(masters) master\(masters == 1 ? "" : "s")" : nil,
      others > 0 ? "\(others) bounce\(others == 1 ? "" : "s")" : nil,
    ].compactMap { $0 }.joined(separator: " · ")
  }

  private var historySummary: String {
    "\(timelineEntries.count) versions across \(work.sessions.count) Sessions"
  }

  private var dateRangeText: String {
    let dates = timelineEntries.compactMap(\.date).sorted()
    guard let first = dates.first, let last = dates.last else { return "Dates unavailable" }
    if Calendar.current.isDate(first, inSameDayAs: last) {
      return first.formatted(date: .abbreviated, time: .omitted)
    }
    return
      "\(first.formatted(.dateTime.month(.abbreviated).year()))–\(last.formatted(.dateTime.month(.abbreviated).year()))"
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
}

private struct WorkTimelineEntry: Identifiable {
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
                entry.revision.set.isBackup ? "BACKUP" : "CURRENT",
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
    .accessibilityHint("Select this version to open, inspect or export")
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
