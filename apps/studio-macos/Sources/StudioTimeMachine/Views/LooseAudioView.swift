import StudioCore
import SwiftUI

struct LooseAudioView: View {
  let index: StudioLibraryIndex
  @Bindable var store: StudioLibraryStore

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 26) {
        HStack(alignment: .bottom, spacing: 24) {
          VStack(alignment: .leading, spacing: 8) {
            Text("Loose audio")
              .font(.custom("Helvetica Neue", size: 30).weight(.bold))
            Text(
              "Audio found across every tracked library but outside a recognised Ableton project. Keep it recoverable instead of hiding it."
            )
            .foregroundStyle(.secondary)
            .frame(maxWidth: 680, alignment: .leading)
          }

          Spacer(minLength: 16)

          StudioInlineFilterField(text: $store.searchText, prompt: "Filter loose audio")
            .frame(width: 230)
        }

        if store.visibleLooseAudio.isEmpty {
          if store.searchText.isEmpty {
            ContentUnavailableView(
              "No loose audio",
              systemImage: "waveform",
              description: Text("Every indexed audio file belongs to a recognised project.")
            )
            .frame(maxWidth: .infinity, minHeight: 380)
          } else {
            ContentUnavailableView.search(text: store.searchText)
              .frame(maxWidth: .infinity, minHeight: 380)
          }
        } else {
          LazyVStack(spacing: 0) {
            ForEach(store.visibleLooseAudio) { asset in
              AudioAssetRow(
                asset: asset,
                isSelected: store.selectedAsset?.id == asset.id,
                sourceName: store.looseAudioRootDisplayName(for: asset),
                select: { store.selectGlobalLooseAudio(asset) },
                play: { store.player.toggle(asset) },
                reveal: { store.revealInFinder(asset.fileURL) }
              )
            }
          }
        }
      }
      .padding(.horizontal, 38)
      .padding(.top, 34)
      .padding(.bottom, store.player.currentAsset == nil ? 42 : 110)
      .frame(maxWidth: 980, alignment: .leading)
      .frame(maxWidth: .infinity, alignment: .center)
    }
  }
}
