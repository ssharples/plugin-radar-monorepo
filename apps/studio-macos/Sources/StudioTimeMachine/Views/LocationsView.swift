import StudioCore
import SwiftUI

struct LocationsView: View {
  let index: StudioLibraryIndex
  let isSample: Bool
  let syncStatus: StudioLibrarySyncStatus
  @Bindable var store: StudioLibraryStore

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 30) {
        header
        locations
        actions
        syncSummary
      }
      .padding(38)
      .frame(maxWidth: 920, alignment: .leading)
      .frame(maxWidth: .infinity, alignment: .center)
    }
    .background(StudioShellPalette.canvas)
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Locations")
        .font(.custom("Helvetica Neue", size: 30).weight(.bold))
        .foregroundStyle(StudioShellPalette.ink)
      Text("Add folders to keep your Studio Library current on this Mac.")
        .foregroundStyle(StudioShellPalette.mutedInk)
      Text(
        "Studio Time Machine reads projects and audio in place. Enable automatic updates to follow changes, while cached evidence stays available when a drive is offline."
      )
      .font(.callout)
      .foregroundStyle(StudioShellPalette.mutedInk)
      .frame(maxWidth: 700, alignment: .leading)
    }
  }

  private var locations: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Your folders")
        .font(.headline)
        .foregroundStyle(StudioShellPalette.ink)
      if store.registeredRoots.isEmpty {
        Text("No folders have been added yet.")
          .foregroundStyle(StudioShellPalette.mutedInk)
          .padding(.vertical, 14)
      } else {
        VStack(spacing: 0) {
          ForEach(store.registeredRoots) { root in
            LocationRow(
              root: root, isActive: isActive(root), isSampleRoot: root.id == "sample-root",
              open: { store.loadCachedRoot(root) })
            if root.id != store.registeredRoots.last?.id {
              Divider().overlay(StudioShellPalette.canvasStroke)
            }
          }
        }
        .padding(.horizontal, 16)
        .background(
          StudioShellPalette.canvasRaised,
          in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .overlay {
          RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(
            StudioShellPalette.canvasStroke, lineWidth: 1)
        }
      }
    }
  }

  private var actions: some View {
    ViewThatFits(in: .horizontal) {
      actionButtons(stacked: false)
      actionButtons(stacked: true)
    }
    .fixedSize(horizontal: false, vertical: true)
  }

  @ViewBuilder
  private func actionButtons(stacked: Bool) -> some View {
    Group {
      if stacked {
        VStack(alignment: .leading, spacing: 8) { actionControls }
      } else {
        HStack(spacing: 10) { actionControls }
      }
    }
  }

  @ViewBuilder
  private var actionControls: some View {
    Button {
      store.chooseLibraryFolder()
    } label: {
      Label("Add to Studio", systemImage: "plus")
    }
    .buttonStyle(StudioCanvasButtonStyle(kind: .primary))
    if !isSample {
      Button {
        store.rescan()
      } label: {
        Label(
          syncStatus == .indexing ? "Updating…" : "Update Library", systemImage: "arrow.clockwise")
      }
      .buttonStyle(StudioCanvasButtonStyle(kind: .secondary))
      .disabled(!store.canUpdateLibrary)
      Button {
        store.setAutomaticUpdatesEnabled(syncStatus != .monitoring)
      } label: {
        Label(
          syncStatus == .monitoring ? "Pause Updates" : "Resume Updates",
          systemImage: syncStatus == .monitoring ? "pause" : "play")
      }
      .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
      .disabled(
        store.isChangingAutomaticUpdates || syncStatus == .indexing
          || (syncStatus != .monitoring && !hasAvailableRoot))
    }
  }

  private var syncSummary: some View {
    VStack(alignment: .leading, spacing: 12) {
      Label(syncState.title, systemImage: syncState.symbol)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(syncState.color)
      Text(syncState.detail)
        .font(.callout)
        .foregroundStyle(StudioShellPalette.mutedInk)
        .frame(maxWidth: 700, alignment: .leading)
      if syncStatus == .indexing, let progress = store.indexingProgress {
        VStack(alignment: .leading, spacing: 7) {
          ProgressView(value: progress.fractionCompleted).tint(StudioShellPalette.ink)
          HStack {
            Text(progressLabel(progress))
            Spacer()
            Text("\(progress.completed) of \(max(progress.total, progress.completed))")
              .monospacedDigit()
          }
          .font(.caption)
          .foregroundStyle(StudioShellPalette.mutedInk)
        }
      }
      if let statistics = store.lastStatistics {
        DisclosureGroup {
          VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 24) {
              LocationMetric(value: statistics.projectCount, label: "Projects")
              LocationMetric(value: statistics.setCount, label: "Sets")
              LocationMetric(value: statistics.parsedSetCount, label: "Parsed")
              LocationMetric(value: statistics.reusedSetCount, label: "Reused")
              LocationMetric(value: statistics.audioAssetCount, label: "Audio")
            }
            Text(
              "Completed \(statistics.completedAt.formatted(date: .abbreviated, time: .shortened)) · \(statistics.duration.formatted(.number.precision(.fractionLength(1)))) seconds"
            )
            .font(.caption).foregroundStyle(StudioShellPalette.mutedInk)
            if statistics.issueCount > 0 {
              Label(
                "\(statistics.issueCount) indexing issue\(statistics.issueCount == 1 ? "" : "s") recorded",
                systemImage: "exclamationmark.triangle"
              )
              .font(.caption).foregroundStyle(.orange)
            }
          }
          .padding(.top, 10)
        } label: {
          Text(isSample ? "Example scan diagnostics" : "Latest scan diagnostics").font(
            .subheadline.weight(.semibold)
          ).foregroundStyle(
            StudioShellPalette.ink)
        }
        .tint(StudioShellPalette.mutedInk)
      }
    }
  }

  private var activeRoot: RegisteredLibraryRoot? { store.registeredRoots.first(where: isActive) }
  private var hasAvailableRoot: Bool {
    store.registeredRoots.contains { $0.availability == .available }
  }
  private func isActive(_ root: RegisteredLibraryRoot) -> Bool {
    root.fileURL.standardizedFileURL.path == index.rootURL.standardizedFileURL.path
  }
  private func progressLabel(_ progress: IndexingProgress) -> String {
    return switch progress.phase {
    case .discovering: "Finding projects"
    case .parsingSets: "Reading Set evidence"
    case .classifyingAudio: "Classifying audio"
    case .finalizing: "Saving library evidence"
    case .complete: "Update complete"
    }
  }

  private var syncState: (title: String, detail: String, symbol: String, color: Color) {
    if isSample {
      return (
        "Sample preview",
        "This is static sample data. No folders are opened and no file watching is running.",
        "shippingbox", StudioShellPalette.mutedInk
      )
    }
    guard let root = activeRoot else {
      return (
        "Waiting for a folder", "Add a folder to start a private, read-only library.",
        "folder.badge.plus", StudioShellPalette.mutedInk
      )
    }
    switch root.availability {
    case .available:
      switch syncStatus {
      case .monitoring:
        return (
          "Watching for changes",
          "Stable Ableton Set saves are picked up automatically across available folders while the source files stay in place.",
          "waveform.path.ecg", .green
        )
      case .indexing:
        return (
          "Updating the library",
          store.automaticUpdatesEnabled
            ? "Reading available folders. You can keep browsing while the library updates."
            : "This manual scan refreshes available folders. Automatic watching remains paused.",
          "arrow.triangle.2.circlepath", .orange
        )
      case .idle, .stopped:
        if store.automaticUpdatesEnabled {
          return (
            "Automatic updates not running",
            "Resume Updates to watch available folders again, or Update Library for a single scan.",
            "pause.circle", StudioShellPalette.mutedInk
          )
        }
        return (
          "Updates paused",
          "Automatic watching is paused. Resume updates whenever you want Studio Time Machine to follow new Set saves.",
          "pause.circle", StudioShellPalette.mutedInk
        )
      }
    case .unavailable:
      return (
        "Drive unavailable",
        "This folder is offline. Cached library evidence remains available to inspect, and other available folders can continue watching.",
        "externaldrive.badge.xmark", .orange
      )
    case .permissionRequired:
      return (
        "Permission needed",
        "Access to this folder is required again. Cached evidence remains available while other available folders can continue watching.",
        "lock.trianglebadge.exclamationmark", .red
      )
    }
  }
}

private struct LocationRow: View {
  let root: RegisteredLibraryRoot
  let isActive: Bool
  let isSampleRoot: Bool
  let open: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: rootSymbol).font(.title3).foregroundStyle(StudioShellPalette.mutedInk)
        .frame(width: 26)
      VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 8) {
          Text(root.displayName).font(.headline).foregroundStyle(StudioShellPalette.ink)
          if isActive {
            Text("CURRENT").font(.caption2.weight(.bold)).foregroundStyle(StudioShellPalette.ink)
              .padding(.horizontal, 7).padding(.vertical, 3).background(
                StudioShellPalette.signal, in: Capsule())
          }
        }
        LocalPathText(url: root.fileURL, font: .callout, lineLimit: 1)
        Label(statusText, systemImage: statusSymbol).font(.caption.weight(.medium)).foregroundStyle(
          statusColor)
        if let date = root.lastScannedAt {
          Text("Evidence from \(date.formatted(date: .abbreviated, time: .shortened))").font(
            .caption
          ).foregroundStyle(StudioShellPalette.mutedInk)
        }
      }
      Spacer(minLength: 18)
      VStack(alignment: .trailing, spacing: 8) {
        Text("\(root.projectCount) projects · \(root.setCount) Sets").font(
          .caption.monospacedDigit()
        ).foregroundStyle(StudioShellPalette.mutedInk)
        if !isActive && !isSampleRoot && root.lastScannedAt != nil {
          Button("Open cached library", action: open).buttonStyle(
            StudioCanvasButtonStyle(kind: .quiet)
          ).controlSize(.small)
        }
      }
    }
    .padding(.vertical, 16)
  }
  private var rootSymbol: String {
    isSampleRoot
      ? "shippingbox"
      : (root.availability == .available
        ? "externaldrive.fill" : "externaldrive.badge.exclamationmark")
  }
  private var statusText: String {
    if isSampleRoot { return "Static sample data · read-only" }
    return switch root.availability {
    case .available: "Available · read-only"
    case .unavailable: "Offline · cached evidence retained"
    case .permissionRequired: "Access required"
    }
  }
  private var statusSymbol: String {
    return switch root.availability {
    case .available: "checkmark.circle"
    case .unavailable: "externaldrive.badge.xmark"
    case .permissionRequired: "lock.trianglebadge.exclamationmark"
    }
  }
  private var statusColor: Color {
    if isSampleRoot { return StudioShellPalette.mutedInk }
    return switch root.availability {
    case .available: .green
    case .unavailable: .orange
    case .permissionRequired: .red
    }
  }
}

private struct LocationMetric: View {
  let value: Int
  let label: String
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text("\(value)").font(.title3.monospacedDigit().weight(.semibold)).foregroundStyle(
        StudioShellPalette.ink)
      Text(label).font(.caption).foregroundStyle(StudioShellPalette.mutedInk)
    }
    .frame(minWidth: 76, alignment: .leading)
  }
}
