import AppKit
import StudioCore
import SwiftUI

/// A real source-file transfer. Playback and dragging never imply a rendered Live clip.
struct ProjectReusableAudioRow: View {
  let name: String
  let detail: String
  let asset: PreviewAsset?
  let unavailableReason: String
  let previewLabel: String
  @Bindable var player: AudioPreviewPlayer
  let reveal: (URL) -> Void
  @State private var isAvailable = false
  @State private var copied = false

  private var isCurrent: Bool {
    guard let asset else { return false }
    return player.currentAsset?.fileURL.standardizedFileURL == asset.fileURL.standardizedFileURL
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 10) {
        Button {
          guard let asset else { return }
          player.prepare(asset, label: previewLabel)
          player.toggle(asset)
        } label: {
          Image(systemName: isCurrent && player.isPlaying ? "pause.fill" : "play.fill")
            .font(.system(size: 11, weight: .semibold))
            .frame(width: 30, height: 30)
            .background(StudioShellPalette.canvasRaised, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!isAvailable || (isCurrent && player.isLoadingPlayback))
        .accessibilityLabel("\(isCurrent && player.isPlaying ? "Pause" : "Play") \(name)")

        if let asset, isAvailable {
          fileLabel
            .onDrag { NSItemProvider(object: asset.fileURL as NSURL) }
            .help("Drag \(name) into Ableton Live, or use the file actions menu")
        } else {
          fileLabel
        }

        Menu {
          if let asset {
            Button("Copy Audio File") {
              NSPasteboard.general.clearContents()
              copied = NSPasteboard.general.writeObjects([asset.fileURL as NSURL])
            }
            .disabled(!isAvailable)
            Button("Reveal in Finder") { reveal(asset.fileURL) }
              .disabled(!isAvailable)
          }
        } label: {
          Image(systemName: "ellipsis")
            .frame(width: 24, height: 28)
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .disabled(asset == nil)
        .accessibilityLabel("File actions for \(name)")
      }
      if isCurrent, let error = player.errorMessage {
        Text(error)
          .font(.caption)
          .foregroundStyle(.orange)
          .padding(.leading, 40)
      }
    }
    .padding(.vertical, 9)
    .task(id: asset) {
      let file = asset
      isAvailable = await Task.detached(priority: .utility) {
        file?.isAvailableOnDisk == true
      }.value
    }
  }

  private var fileLabel: some View {
    HStack(spacing: 10) {
      VStack(alignment: .leading, spacing: 3) {
        Text(name)
          .font(.callout.weight(.medium))
          .lineLimit(1)
          .truncationMode(.middle)
        Text(isAvailable ? (copied ? "File copied" : detail) : unavailableReason)
          .font(.caption)
          .foregroundStyle(isAvailable ? Color.secondary : .orange)
          .lineLimit(2)
      }
      Spacer(minLength: 0)
      if isAvailable {
        Image(systemName: "hand.draw")
          .font(.caption)
          .foregroundStyle(.tertiary)
          .accessibilityLabel("Draggable audio file")
      }
    }
    .contentShape(Rectangle())
  }
}
