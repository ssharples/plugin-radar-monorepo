import StudioCore
import SwiftUI

struct AbletonExportReviewView: View {
  let plan: AbletonExportPlan
  @Bindable var store: StudioLibraryStore

  private var currentPlan: AbletonExportPlan { store.liveExportPlan ?? plan }

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      header
      GroupBox("Exact Set and revision") {
        VStack(alignment: .leading, spacing: 7) {
          LabeledContent("Set", value: currentPlan.setURL.lastPathComponent)
          LabeledContent("Revision evidence", value: currentPlan.revisionID)
          if let workName = currentPlan.workName { LabeledContent("Work", value: workName) }
          LocalPathText(url: currentPlan.setURL)
        }
        .padding(4)
      }
      HStack(alignment: .top, spacing: 14) {
        settings
        destination
      }
      permissionStatus
      controls
    }
    .padding(26)
    .frame(width: 780)
    .tint(.black)
    .interactiveDismissDisabled(store.isExecutingLiveExport)
  }

  private var header: some View {
    HStack(alignment: .top, spacing: 16) {
      Image(systemName: "waveform.badge.gearshape")
        .font(.system(size: 34, weight: .light))
        .foregroundStyle(.orange)
      VStack(alignment: .leading, spacing: 5) {
        HStack(spacing: 8) {
          Text("Review Ableton Export").font(.title2.weight(.semibold))
          Text("EXPERIMENTAL")
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 7).padding(.vertical, 3)
            .background(.quaternary, in: Capsule())
        }
        Text("Nothing runs until the active Set and every setting below are confirmed again.")
          .foregroundStyle(.secondary)
      }
    }
  }

  private var settings: some View {
    GroupBox("Export settings") {
      VStack(alignment: .leading, spacing: 7) {
        LabeledContent("Source", value: currentPlan.source.title)
        LabeledContent(
          "Arrangement beats",
          value: "\(beat(currentPlan.arrangementRange.startBeat))–\(beat(currentPlan.arrangementRange.endBeat))")
        LabeledContent("PCM", value: currentPlan.pcmFormat.displayName)
        LabeledContent("Sample rate", value: "\(currentPlan.sampleRate.rawValue.formatted()) Hz")
        LabeledContent("Bit depth", value: "\(currentPlan.bitDepth.rawValue)-bit")
        LabeledContent("Normalize", value: currentPlan.normalize ? "On" : "Off")
        LabeledContent(
          "Return + Main effects", value: currentPlan.includeReturnAndMainEffects ? "Included" : "Off")
      }
      .padding(4)
    }
    .frame(maxWidth: .infinity)
  }

  private var destination: some View {
    GroupBox("Destination and safety") {
      VStack(alignment: .leading, spacing: 8) {
        LabeledContent("Filename", value: currentPlan.primaryOutputURL.lastPathComponent)
        Label("Never overwrite", systemImage: "lock.shield")
          .font(.body.weight(.medium))
        Text("A collision stops the run before Live is instructed to save.")
          .font(.caption).foregroundStyle(.secondary)
        LocalPathText(url: currentPlan.destination.directoryURL)
      }
      .padding(4)
    }
    .frame(maxWidth: .infinity)
  }

  @ViewBuilder
  private var permissionStatus: some View {
    GroupBox("Accessibility preflight") {
      VStack(alignment: .leading, spacing: 10) {
        if store.isPreflightingLiveExport {
          Label("Checking Live without changing it…", systemImage: "hourglass")
        } else if let preflight = store.liveExportPreflight {
          Label(
            preflight.message,
            systemImage: store.liveExportCanExecute
              ? "checkmark.shield" : "exclamationmark.triangle"
          )
          .foregroundStyle(store.liveExportCanExecute ? .green : .orange)
          .fixedSize(horizontal: false, vertical: true)
          if let process = preflight.process {
            Text(
              "\(process.displayName) \(process.version ?? "Unknown") · adapter \(preflight.adapterVersion ?? "unsupported")"
            )
            .font(.caption).foregroundStyle(.secondary)
          }
          if !preflight.activeSetConfirmed, let activeSetURL = preflight.activeSetURL {
            VStack(alignment: .leading, spacing: 5) {
              LabeledContent("Plan", value: currentPlan.setURL.lastPathComponent)
              LabeledContent("Open in Live", value: activeSetURL.lastPathComponent)
            }
            .font(.caption)

            if store.canRetargetLiveExportToActiveSet {
              Button("Use \(activeSetURL.deletingPathExtension().lastPathComponent)") {
                store.retargetLiveExportToActiveSet()
              }
              .buttonStyle(.borderedProminent)
              .help("Rebuild the reviewed export plan for the Set that is currently open in Live")
            } else {
              Text(
                "Choose Export beside the version that is open in Live, or open the reviewed Set before checking again."
              )
              .font(.caption)
              .foregroundStyle(.secondary)
            }
          }
        } else {
          Text(
            "Preflight confirms Accessibility permission, Live 12.4.2, the planned active Set by document path when available or a constrained same-title fallback, and no unsaved changes."
          )
          .foregroundStyle(.secondary)
        }
        HStack {
          Button(store.liveExportPreflight == nil ? "Check Live" : "Check again") {
            store.preflightLiveExport(requestPermission: false)
          }
          if store.liveExportPreflight?.permission != .authorized {
            Button("Request Accessibility Access") {
              store.preflightLiveExport(requestPermission: true)
            }
            Button("Open System Settings", action: store.openAccessibilitySettings)
          }
        }
        .controlSize(.small)
        .disabled(store.isPreflightingLiveExport || store.isExecutingLiveExport)
      }
      .padding(4)
    }
  }

  private var controls: some View {
    HStack {
      Button(
        store.isExecutingLiveExport ? "Stop Safely" : "Cancel", action: store.cancelLiveExportPlan
      )
      .keyboardShortcut(.cancelAction)
      Spacer()
      if store.isExecutingLiveExport {
        ProgressView().controlSize(.small)
        Text(statusLabel).font(.caption).foregroundStyle(.secondary)
      }
      Button("Confirm and Export") { store.executeLiveExportPlan() }
        .keyboardShortcut(.defaultAction)
        .buttonStyle(.borderedProminent)
        .disabled(!store.liveExportCanExecute || store.isExecutingLiveExport)
    }
  }

  private var statusLabel: String {
    switch store.liveExportState {
    case .confirmingActiveSet: "Confirming Set"
    case .openingExportDialog: "Opening Export"
    case .configuringExport: "Applying settings"
    case .choosingDestination: "Choosing destination"
    case .exporting(let progress): progress.map { "Rendering \(Int($0 * 100))%" } ?? "Rendering"
    case .verifyingOutputs: "Verifying audio"
    case .cancelled: "Cancelling"
    default: "Working"
    }
  }

  private func beat(_ value: Double) -> String {
    value.formatted(.number.precision(.fractionLength(0...2)))
  }
}
