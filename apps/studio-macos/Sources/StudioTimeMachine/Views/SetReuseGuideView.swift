import AppKit
import StudioCore
import SwiftUI

enum SetReuseKind: String, Identifiable {
  case track
  case devices

  var id: String { rawValue }
}

struct SetReuseRequest: Identifiable {
  let sourceSetURL: URL
  let projectURL: URL
  let track: SetTrack
  let kind: SetReuseKind

  var id: String {
    "\(sourceSetURL.path)::\(track.id)::\(kind.rawValue)"
  }
}

struct SetReuseGuideView: View {
  let request: SetReuseRequest
  let reveal: (URL) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var copiedReference: String?

  private var sourceAvailable: Bool {
    FileManager.default.fileExists(atPath: request.sourceSetURL.path)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      header
      sourceSummary
      instructions

      if !sourceAvailable {
        Label(
          "This Set is currently unavailable. You can keep the references below and try again when its drive is connected.",
          systemImage: "externaldrive.badge.xmark"
        )
        .font(.callout)
        .foregroundStyle(.orange)
        .fixedSize(horizontal: false, vertical: true)
      }

      Text(
        "Complete the transfer in Live. Plug-ins must be installed for the chain to load correctly."
      )
      .font(.caption)
      .foregroundStyle(StudioShellPalette.mutedInk)
      .fixedSize(horizontal: false, vertical: true)

      footer
    }
    .padding(26)
    .frame(width: 650)
    .background(StudioShellPalette.canvas)
  }

  private var header: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: request.kind == .track ? "rectangle.stack" : "slider.horizontal.3")
        .font(.system(size: 28, weight: .light))
        .foregroundStyle(StudioShellPalette.ink)
      VStack(alignment: .leading, spacing: 6) {
        Text(request.kind == .track ? "Reuse this track" : "Reuse these devices")
          .font(.title2.weight(.semibold))
          .foregroundStyle(StudioShellPalette.ink)
        Text("Keep your destination Set open, then bring the exact source through Live’s Browser.")
          .font(.callout)
          .foregroundStyle(StudioShellPalette.mutedInk)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }

  private var sourceSummary: some View {
    VStack(alignment: .leading, spacing: 9) {
      Text("Source")
        .font(.headline)
        .foregroundStyle(StudioShellPalette.ink)
      LabeledContent("Set") {
        Text(request.sourceSetURL.lastPathComponent)
          .foregroundStyle(StudioShellPalette.ink)
          .textSelection(.enabled)
      }
      LabeledContent("Track") {
        Text(request.track.name.isEmpty ? "Untitled track" : request.track.name)
          .foregroundStyle(StudioShellPalette.ink)
          .textSelection(.enabled)
      }
      LocalPathText(url: request.sourceSetURL, font: .caption, lineLimit: 1)
      HStack(spacing: 8) {
        Button("Reveal Source Set") { reveal(request.sourceSetURL) }
          .buttonStyle(StudioCanvasButtonStyle(kind: .secondary))
          .disabled(!sourceAvailable)
        Button("Copy Folder Path") { copy(request.projectURL.path, reference: "folder") }
          .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
        Button("Copy Track Name") { copy(trackDisplayName, reference: "track") }
          .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
      }
    }
    .padding(15)
    .background(
      StudioShellPalette.canvasRaised, in: RoundedRectangle(cornerRadius: 12, style: .continuous)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .stroke(StudioShellPalette.canvasStroke, lineWidth: 1)
    }
  }

  private var instructions: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("In Ableton Live")
        .font(.headline)
        .foregroundStyle(StudioShellPalette.ink)
      GuideStep(
        number: 1,
        text:
          "Leave the destination Set open. If needed, add the source project folder to Live’s Browser Places."
      )
      GuideStep(
        number: 2,
        text:
          "In the Browser, unfold the source project folder, then unfold the source .als and locate the track named “\(trackDisplayName)”."
      )
      if request.kind == .track {
        GuideStep(
          number: 3, text: "Drag that track into an empty track area in the open destination Set.")
      } else {
        GuideStep(
          number: 3,
          text:
            "Inside the source track in Live’s Browser, drag its Devices entry onto the desired destination track’s device area."
        )
      }
    }
  }

  private var footer: some View {
    HStack(spacing: 10) {
      if let copiedReference {
        Text("Copied \(copiedReference)")
          .font(.caption)
          .foregroundStyle(StudioShellPalette.mutedInk)
          .transition(.opacity)
      }

      Spacer(minLength: 8)

      if let ableton = runningAbleton {
        Button("Switch to Live") {
          _ = ableton.activate(options: [])
        }
        .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
        .help("Activate the running Ableton Live app")
      }

      Button("Done") { dismiss() }
        .buttonStyle(StudioCanvasButtonStyle(kind: .primary))
        .keyboardShortcut(.defaultAction)
    }
  }

  private var trackDisplayName: String {
    request.track.name.isEmpty ? "Untitled track" : request.track.name
  }

  private var runningAbleton: NSRunningApplication? {
    NSWorkspace.shared.runningApplications.first {
      if $0.bundleIdentifier?.hasPrefix("com.ableton.live") == true { return true }
      return $0.localizedName?.localizedCaseInsensitiveContains("Ableton Live") == true
    }
  }

  private func copy(_ value: String, reference: String) {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(value, forType: .string)
    copiedReference = reference
  }
}

private struct GuideStep: View {
  let number: Int
  let text: String

  var body: some View {
    HStack(alignment: .top, spacing: 11) {
      Text("\(number)")
        .font(.caption.weight(.bold))
        .foregroundStyle(StudioShellPalette.ink)
        .frame(width: 22, height: 22)
        .background(StudioShellPalette.signal, in: Circle())
      Text(text)
        .font(.callout)
        .foregroundStyle(StudioShellPalette.ink)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}
