import StudioCore
import SwiftUI

struct SnapshotHistoryView: View {
  @Bindable var store: StudioLibraryStore
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(spacing: 0) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 4) {
          Text("Immutable snapshots")
            .font(.title2.weight(.semibold))
          Text(projectSummary)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Button("Done") { dismiss() }
          .keyboardShortcut(.cancelAction)
      }
      .padding(22)

      Divider()

      if store.selectedProjectSnapshots.isEmpty {
        ContentUnavailableView(
          "No snapshots captured",
          systemImage: "clock.arrow.circlepath",
          description: Text(
            "Stable Set saves appear here after indexing and monitoring capture them.")
        )
      } else {
        List(store.selectedProjectSnapshots) { snapshot in
          SnapshotRow(snapshot: snapshot) {
            store.chooseRestoreDestination(for: snapshot, operation: .restore)
          } branch: {
            store.chooseRestoreDestination(for: snapshot, operation: .branch)
          }
        }
        .listStyle(.inset)
      }

      Divider()

      Label(
        "Restore and Branch always plan a new .als file. The snapshot and source Set are never overwritten.",
        systemImage: "lock.shield"
      )
      .font(.caption)
      .foregroundStyle(.secondary)
      .padding(16)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(minWidth: 720, minHeight: 520)
    .tint(.black)
  }

  private var projectSummary: String {
    let name = store.selectedProject?.displayName ?? "Selected project"
    let count = store.selectedProjectSnapshots.count
    return "\(name) · \(count) \(count == 1 ? "captured version" : "captured versions")"
  }
}

private struct SnapshotRow: View {
  let snapshot: SetSnapshot
  let restore: () -> Void
  let branch: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: snapshot.reason.symbol)
        .font(.title3)
        .foregroundStyle(.secondary)
        .frame(width: 30)

      VStack(alignment: .leading, spacing: 5) {
        Text(snapshot.originalFilename)
          .font(.body.weight(.medium))
        Text(
          "Captured \(snapshot.capturedAt.formatted(date: .abbreviated, time: .shortened)) · \(snapshot.reason.title)"
        )
        .font(.callout)
        .foregroundStyle(.secondary)
        HStack(spacing: 10) {
          Text(ByteCountFormatter.string(fromByteCount: snapshot.bytes, countStyle: .file))
          Text("Digest \(snapshot.contentDigest.prefix(10))…")
          if let creator = snapshot.creator {
            Text(creator)
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        LocalPathText(url: snapshot.sourceURL, lineLimit: 1)
      }

      Spacer(minLength: 16)

      HStack(spacing: 8) {
        Button("Branch…", action: branch)
          .controlSize(.small)
        Button("Restore…", action: restore)
          .controlSize(.small)
          .buttonStyle(.borderedProminent)
      }
    }
    .padding(.vertical, 8)
  }
}

extension SnapshotReason {
  fileprivate var title: String {
    switch self {
    case .initialIndex: "Initial index"
    case .stableSave: "Stable save"
    case .manual: "Manual scan"
    }
  }

  fileprivate var symbol: String {
    switch self {
    case .initialIndex: "tray.and.arrow.down"
    case .stableSave: "checkmark.circle"
    case .manual: "arrow.triangle.2.circlepath"
    }
  }
}
