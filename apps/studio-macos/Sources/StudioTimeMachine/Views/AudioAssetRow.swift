import StudioCore
import SwiftUI

struct AudioAssetRow: View {
  let asset: PreviewAsset
  let isSelected: Bool
  var sourceName: String? = nil
  let select: () -> Void
  let play: () -> Void
  let reveal: () -> Void

  var body: some View {
    HStack(spacing: 12) {
      Button(action: select) {
        HStack(spacing: 12) {
          Image(
            systemName: asset.isLikelyUserRender ? "waveform.badge.magnifyingglass" : "waveform"
          )
          .foregroundStyle(.secondary)
          .frame(width: 20)

          VStack(alignment: .leading, spacing: 4) {
            Text(asset.filename)
              .foregroundStyle(.primary)
              .lineLimit(1)
            HStack(spacing: 8) {
              Text(asset.category.displayName)
              Text("·")
              Text(asset.modifiedText)
              Text("·")
              Text(asset.sizeText)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            if let sourceName {
              Label(sourceName, systemImage: "externaldrive")
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
          }

          Spacer()

          if asset.isLikelyUserRender {
            Text("Likely user render")
              .font(.caption.weight(.medium))
              .padding(.horizontal, 8)
              .padding(.vertical, 4)
              .background(.quaternary, in: Capsule())
          }
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)

      Button(action: play) {
        Image(systemName: "play.fill")
          .frame(width: 28, height: 28)
      }
      .buttonStyle(.borderless)
      .disabled(!asset.isAvailableOnDisk)
      .help(
        asset.isAvailableOnDisk ? "Play existing audio" : "File unavailable at indexed location")
    }
    .padding(.vertical, 10)
    .padding(.horizontal, 10)
    .background(
      isSelected ? Color.black.opacity(0.08) : .clear,
      in: RoundedRectangle(cornerRadius: 9, style: .continuous)
    )
    .overlay(alignment: .bottom) {
      Divider().padding(.leading, 42)
    }
    .accessibilityElement(children: .contain)
    .contextMenu {
      Button("Play", action: play)
        .disabled(!asset.isAvailableOnDisk)
      Button("Reveal in Finder", action: reveal)
    }
  }
}
