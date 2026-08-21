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
        VStack(alignment: .leading, spacing: 8) {
          Text("Locations")
            .font(.custom("Helvetica Neue", size: 30).weight(.bold))
          Text(
            "Registered roots persist between launches. Their cached library remains inspectable when a drive is disconnected."
          )
          .foregroundStyle(.secondary)
          .frame(maxWidth: 680, alignment: .leading)
        }

        VStack(spacing: 0) {
          ForEach(store.registeredRoots) { root in
            RegisteredRootRow(
              root: root,
              isActive: root.fileURL.standardizedFileURL.path
                == index.rootURL.standardizedFileURL.path,
              isSampleRoot: root.id == "sample-root",
              open: { store.loadCachedRoot(root) }
            )
            Divider().padding(.leading, 48)
          }
        }

        if let statistics = store.lastStatistics {
          VStack(alignment: .leading, spacing: 12) {
            Text("Latest scan")
              .font(.headline)
            HStack(spacing: 24) {
              LocationMetric(value: statistics.projectCount, label: "Projects")
              LocationMetric(value: statistics.setCount, label: "Sets")
              LocationMetric(value: statistics.parsedSetCount, label: "Parsed")
              LocationMetric(value: statistics.reusedSetCount, label: "Reused")
              LocationMetric(value: statistics.audioAssetCount, label: "Audio")
            }
            Text(
              "Completed in \(statistics.duration.formatted(.number.precision(.fractionLength(1)))) seconds"
            )
            .font(.caption)
            .foregroundStyle(.secondary)
          }
          .padding(.vertical, 8)
        }

        HStack(spacing: 10) {
          Button("Rescan Active Root", action: store.rescan)
            .buttonStyle(.borderedProminent)
            .disabled(activeRoot?.availability != .available || isSample)
          Button("Add to Studio…", action: store.chooseLibraryFolder)
        }

        Label(watcherStatus.text, systemImage: watcherStatus.symbol)
          .font(.caption)
          .foregroundStyle(.secondary)
          .frame(maxWidth: 680, alignment: .leading)
      }
      .padding(38)
      .frame(maxWidth: 920, alignment: .leading)
      .frame(maxWidth: .infinity, alignment: .center)
    }
  }

  private var activeRoot: RegisteredLibraryRoot? {
    store.registeredRoots.first {
      $0.fileURL.standardizedFileURL.path == index.rootURL.standardizedFileURL.path
    }
  }

  private var watcherStatus: (text: String, symbol: String) {
    if isSample {
      return (
        "Sample data is static. No folders are opened and file watching is not running.",
        "pause.circle"
      )
    }
    guard let activeRoot else {
      return (
        "Select a registered root to inspect its file-watching status.", "questionmark.circle"
      )
    }
    switch activeRoot.availability {
    case .available:
      switch syncStatus {
      case .monitoring:
        return (
          "File watching is active. Stable Set saves are indexed and snapshotted automatically.",
          "waveform.path.ecg"
        )
      case .indexing:
        return (
          "This root is indexing now. File watching resumes when the scan finishes.",
          "arrow.triangle.2.circlepath"
        )
      case .idle, .stopped:
        return (
          "This root is available, but file watching is not currently running.", "pause.circle"
        )
      }
    case .unavailable:
      return (
        "File watching is paused while this root is unavailable. Its cached library remains inspectable.",
        "externaldrive.badge.xmark"
      )
    case .permissionRequired:
      return (
        "File watching is paused until folder permission is granted again. Add the folder to recover access.",
        "lock.trianglebadge.exclamationmark"
      )
    }
  }
}

private struct RegisteredRootRow: View {
  let root: RegisteredLibraryRoot
  let isActive: Bool
  let isSampleRoot: Bool
  let open: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: rootSymbol)
        .font(.title2)
        .foregroundStyle(.secondary)
        .frame(width: 34)

      VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 8) {
          Text(root.displayName)
            .font(.headline)
          if isActive {
            Text("ACTIVE")
              .font(.caption2.weight(.bold))
              .padding(.horizontal, 7)
              .padding(.vertical, 3)
              .background(.quaternary, in: Capsule())
          }
        }
        LocalPathText(url: root.fileURL, font: .callout, lineLimit: 1)
        Label(statusText, systemImage: statusSymbol)
          .font(.caption.weight(.medium))
          .foregroundStyle(statusColor)
        if let lastScannedAt = root.lastScannedAt {
          Text("Last scanned \(lastScannedAt.formatted(date: .abbreviated, time: .shortened))")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }

      Spacer()

      VStack(alignment: .trailing, spacing: 8) {
        Text("\(root.projectCount) projects · \(root.setCount) Sets")
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
        if !isActive && root.lastScannedAt != nil {
          Button("Open Cached Library", action: open)
            .controlSize(.small)
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
    if isSampleRoot { return "Sample data · static and read-only" }
    return switch root.availability {
    case .available: "Available · indexed read-only"
    case .unavailable: "Drive or folder unavailable · cached data retained"
    case .permissionRequired: "Folder permission required"
    }
  }

  private var statusSymbol: String {
    switch root.availability {
    case .available: "checkmark.circle"
    case .unavailable: "externaldrive.badge.xmark"
    case .permissionRequired: "lock.trianglebadge.exclamationmark"
    }
  }

  private var statusColor: Color {
    if isSampleRoot { return .secondary }
    return switch root.availability {
    case .available: Color.green
    case .unavailable: Color.orange
    case .permissionRequired: Color.red
    }
  }
}

private struct LocationMetric: View {
  let value: Int
  let label: String

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text("\(value)")
        .font(.title3.monospacedDigit().weight(.semibold))
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .frame(minWidth: 76, alignment: .leading)
  }
}
