import StudioCore
import SwiftUI

struct RecoveryEvidenceView: View {
  @Bindable var store: StudioLibraryStore

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      Text("Preview and recovery")
        .font(.title2.weight(.semibold))

      Grid(alignment: .topLeading, horizontalSpacing: 28, verticalSpacing: 0) {
        GridRow {
          previewPanel
          snapshotPanel
          audioRecoveryPanel
        }
      }

      if let message = store.syncMessage {
        RecoveryMessage(text: message, symbol: "clock.arrow.2.circlepath")
      }
      if let message = store.recoveryMessage {
        RecoveryMessage(text: message, symbol: "waveform.badge.plus")
      }
    }
  }

  private var previewPanel: some View {
    RecoveryPanel(title: "Preview fidelity", symbol: "play.circle") {
      if let decision = store.selectedPreviewDecision {
        Label(decision.label, systemImage: decision.fidelity.symbol)
          .font(.body.weight(.medium))
        Text(decision.explanation)
          .font(.caption)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
        if let asset = decision.asset {
          Text(
            "\(asset.category.displayName) · \(asset.isLikelyUserRender ? "Likely user render" : "No render hint")"
          )
          .font(.caption)
          .foregroundStyle(.secondary)
          Button("Play Existing Artifact") {
            store.selectAsset(asset)
            store.player.toggle(asset)
          }
          .controlSize(.small)
          .disabled(!asset.isAvailableOnDisk)
        }
        if let coverage = decision.dryPlan?.coverage {
          Text(
            "\(coverage.availableAudioClipCount) of \(coverage.arrangementAudioClipCount) Arrangement audio clips available"
          )
          .font(.caption)
          .foregroundStyle(.secondary)
          if !coverage.blockers.isEmpty {
            Text(coverage.blockers.prefix(2).joined(separator: " "))
              .font(.caption2)
              .foregroundStyle(.secondary)
              .fixedSize(horizontal: false, vertical: true)
          }
          Button("Review Approximate Preview…", action: store.chooseApproximatePreviewDestination)
            .controlSize(.small)
        }
      } else {
        Text("Select a Set to resolve the safest available preview.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      Text(
        "Ableton-controlled renders remain experimental and are never presented as exact by default."
      )
      .font(.caption2)
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
      if store.isDiscoveringAbletonLive {
        Label(
          "Looking for installed Ableton Live applications",
          systemImage: "arrow.triangle.2.circlepath"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      } else {
        Button("Review Open in Ableton Live…", action: store.planOpenInAbletonLive)
          .controlSize(.small)
        Button("Review Automated Main Export…") {
          store.chooseLiveExportDestination()
        }
        .controlSize(.small)
        .disabled(store.isPlanningLiveExport)
      }
    }
  }

  private var snapshotPanel: some View {
    RecoveryPanel(title: "Immutable snapshots", symbol: "clock.arrow.circlepath") {
      if let snapshot = store.selectedProjectSnapshots.first {
        Text("\(store.selectedProjectSnapshots.count) captured versions")
          .font(.body.weight(.medium))
        Text(
          "Latest: \(snapshot.originalFilename) · \(snapshot.capturedAt.formatted(date: .abbreviated, time: .shortened))"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
        Button("Browse Snapshots…") {
          store.showSnapshotHistory()
        }
        .controlSize(.small)
      } else {
        Text("No immutable snapshot has been captured for this project yet.")
          .font(.caption)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }

      Text("Restore or branch from any captured version after reviewing its new destination.")
        .font(.caption2)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var audioRecoveryPanel: some View {
    RecoveryPanel(title: "Recovered audio", symbol: "waveform.badge.plus") {
      if store.selectedSet != nil {
        let available = store.selectedSetAvailableClipAudioCount
        Text("\(available) available clip-audio references")
          .font(.body.weight(.medium))
        Text(
          "Plans verified, collision-safe copies into a new Recovered Audio folder. The Set and source files stay untouched."
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
        Button("Plan Recovered Audio…", action: store.chooseAudioRecoveryDestination)
          .controlSize(.small)
          .disabled(available == 0)
      }

    }
  }
}

private struct RecoveryPanel<Content: View>: View {
  let title: String
  let symbol: String
  @ViewBuilder let content: Content

  init(title: String, symbol: String, @ViewBuilder content: () -> Content) {
    self.title = title
    self.symbol = symbol
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Label(title, systemImage: symbol)
        .font(.headline)
      content
      Spacer(minLength: 0)
    }
    .padding(15)
    .frame(maxWidth: .infinity, minHeight: 178, alignment: .topLeading)
    .background(
      Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
  }
}

private struct RecoveryMessage: View {
  let text: String
  let symbol: String

  var body: some View {
    Label(text, systemImage: symbol)
      .font(.caption)
      .foregroundStyle(.secondary)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

extension PreviewFidelity {
  fileprivate var symbol: String {
    switch self {
    case .existingArtifact: "waveform.circle"
    case .approximate: "waveform.badge.exclamationmark"
    case .experimentalLiveRender: "flask"
    case .unavailable: "nosign"
    }
  }
}
