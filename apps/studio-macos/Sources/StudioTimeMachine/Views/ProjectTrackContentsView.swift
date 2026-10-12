import StudioCore
import SwiftUI

struct ProjectTrackContentsView: View {
  let item: SetContentBrowserTrack
  @Bindable var store: StudioLibraryStore
  let reuse: (SetReuseKind) -> Void

  private var activeAudio: [SetContentAudioItem] {
    item.audio.filter { $0.clips.contains { $0.placement != .takeLane } }
  }

  private var takeAudio: [SetContentAudioItem] {
    item.audio.filter { $0.clips.allSatisfy { $0.placement == .takeLane } }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 24) {
      VStack(alignment: .leading, spacing: 10) {
        Text(item.track.name.isEmpty ? "Untitled track" : item.track.name)
          .font(.title2.weight(.semibold))
          .textSelection(.enabled)
        Text(
          "\(item.track.kind.browserTitle) track · \(item.track.clips.count) clip\(item.track.clips.count == 1 ? "" : "s")"
        )
        .font(.callout)
        .foregroundStyle(.secondary)
        if item.track.kind != .main {
          Button {
            reuse(.track)
          } label: {
            Label("Use track in Live…", systemImage: "arrow.up.right.square")
          }
          .buttonStyle(StudioCanvasButtonStyle(kind: .secondary))
          .help("Show how to bring this track into your current Set using Live’s Browser")
        }
      }

      sourceAudio
      deviceChain

      if !item.track.clips.isEmpty {
        DisclosureGroup("Clips · \(item.track.clips.count)") {
          LazyVStack(alignment: .leading, spacing: 12) {
            ForEach(item.track.clips) { clip in
              VStack(alignment: .leading, spacing: 3) {
                Text(clip.name.isEmpty ? "Untitled clip" : clip.name)
                  .font(.callout.weight(.medium))
                Text(clipSummary(clip))
                  .font(.caption)
                  .foregroundStyle(.secondary)
              }
            }
          }
          .padding(.top, 10)
        }
        .font(.headline)
      }
    }
  }

  private var sourceAudio: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Source audio")
        .font(.headline)
      if item.audio.isEmpty {
        Text(
          item.track.kind == .midi
            ? "This track uses MIDI. Bring the track into Live to hear its instrument and clips."
            : "No audio clips are referenced directly by this track."
        )
        .font(.callout)
        .foregroundStyle(.secondary)
      } else {
        Text(
          "Listen to the source file, then drag it into Live. Clip edits, warping and effects stay in the Set."
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
        LazyVStack(spacing: 0) {
          ForEach(activeAudio) { audio in audioRow(audio) }
        }
        if !takeAudio.isEmpty {
          DisclosureGroup("Audio from take lanes · \(takeAudio.count)") {
            LazyVStack(spacing: 0) {
              ForEach(takeAudio) { audio in audioRow(audio) }
            }
            .padding(.top, 6)
          }
          .font(.callout)
        }
      }
    }
  }

  private var deviceChain: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Devices")
        .font(.headline)
      if item.track.devices.isEmpty {
        Text("No devices on this track.")
          .font(.callout)
          .foregroundStyle(.secondary)
      } else {
        Button {
          reuse(.devices)
        } label: {
          Label("Use devices in Live…", systemImage: "slider.horizontal.3")
        }
        .buttonStyle(StudioCanvasButtonStyle(kind: .secondary))
        VStack(alignment: .leading, spacing: 10) {
          ForEach(item.track.devices) { device in
            ProjectDeviceRow(device: device)
          }
        }
        .padding(.top, 3)
      }

      if !item.deviceResources.isEmpty {
        DisclosureGroup("Device sample files · \(item.deviceResources.count)") {
          LazyVStack(spacing: 0) {
            ForEach(item.deviceResources) { dependency in
              let audio = SetContentAudioItem(dependency: dependency, clips: [])
              audioRow(audio, detail: "Device resource · Referenced file")
            }
          }
          .padding(.top, 6)
        }
        .font(.callout)
      }
    }
  }

  private func audioRow(_ audio: SetContentAudioItem, detail: String? = nil) -> some View {
    ProjectReusableAudioRow(
      name: audio.filename,
      detail: detail ?? audioUsage(audio),
      asset: previewAsset(for: audio),
      unavailableReason: audio.dependency.availability == .available
        ? "File unavailable at its indexed location" : audio.sourceLabel,
      previewLabel: "Source audio · \(item.track.name)",
      player: store.player,
      reveal: store.revealInFinder
    )
  }

  private func previewAsset(for audio: SetContentAudioItem) -> PreviewAsset? {
    guard audio.dependency.availability == .available,
      let url = audio.dependency.resolvedURL
    else { return nil }
    return audio.indexedAsset
      ?? PreviewAsset(
        id: audio.id, fileURL: url, category: .otherAudio, isLikelyUserRender: false,
        bytes: 0, modifiedAt: nil
      )
  }

  private func audioUsage(_ audio: SetContentAudioItem) -> String {
    let placements = [SetClipPlacement.arrangement, .session, .takeLane, .unknown]
      .filter { placement in audio.clips.contains { $0.placement == placement } }
      .map(placementName)
      .joined(separator: ", ")
    return "\(audio.clips.count) clip\(audio.clips.count == 1 ? "" : "s") · \(placements)"
  }

  private func clipSummary(_ clip: SetClip) -> String {
    var parts = [placementName(clip.placement)]
    if clip.kind == .midi { parts.append("\(clip.midiNoteCount) notes") }
    if clip.isWarped == true { parts.append("Warped") }
    if let start = clip.startBeat, clip.placement == .arrangement {
      parts.append("Beat \(start.formatted(.number.precision(.fractionLength(0...2))))")
    }
    return parts.joined(separator: " · ")
  }

  private func placementName(_ placement: SetClipPlacement) -> String {
    switch placement {
    case .arrangement: "Arrangement"
    case .session: "Session view"
    case .takeLane: "Take lane"
    case .unknown: "Placement unknown"
    }
  }
}

private struct ProjectDeviceRow: View {
  let device: SetDevice
  @State private var expanded = true

  var body: some View {
    if device.nestedDevices.isEmpty {
      label
    } else {
      DisclosureGroup(isExpanded: $expanded) {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(device.nestedDevices) { child in
            ProjectDeviceRow(device: child)
          }
        }
        .padding(.leading, 12)
        .padding(.top, 8)
      } label: {
        label
      }
    }
  }

  private var label: some View {
    HStack(spacing: 8) {
      Image(systemName: device.kind == .rack ? "square.stack.3d.up" : "slider.horizontal.3")
        .foregroundStyle(.secondary)
        .frame(width: 18)
      Text(device.displayName)
        .font(.callout.weight(.medium))
        .lineLimit(2)
      if device.isEnabled == false {
        Text("Off").font(.caption).foregroundStyle(.secondary)
      }
      Spacer(minLength: 0)
      if let format = device.plugin?.format {
        Text(format == .audioUnit ? "AU" : format.rawValue.uppercased())
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }
}
