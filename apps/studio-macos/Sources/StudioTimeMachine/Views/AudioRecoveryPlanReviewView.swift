import StudioCore
import SwiftUI

struct AudioRecoveryPlanReviewView: View {
  let plan: AudioRecoveryPlan
  @Bindable var store: StudioLibraryStore

  var body: some View {
    VStack(spacing: 0) {
      HStack(alignment: .top, spacing: 18) {
        Image(systemName: "waveform.badge.plus")
          .font(.system(size: 36, weight: .light))
          .foregroundStyle(.secondary)
        VStack(alignment: .leading, spacing: 6) {
          Text("Review recovered audio")
            .font(.title2.weight(.semibold))
          Text(
            "\(plan.items.count) verified source files · \(ByteCountFormatter.string(fromByteCount: plan.totalBytes, countStyle: .file))"
          )
          .foregroundStyle(.secondary)
          Text(plan.destinationDirectory.path)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
        }
        Spacer()
      }
      .padding(24)

      Divider()

      List(plan.items) { item in
        HStack(alignment: .top, spacing: 12) {
          Image(systemName: "waveform")
            .foregroundStyle(.secondary)
            .frame(width: 20)
          VStack(alignment: .leading, spacing: 5) {
            Text(item.sourceURL.lastPathComponent)
              .font(.body.weight(.medium))
            Text(ByteCountFormatter.string(fromByteCount: item.bytes, countStyle: .file))
              .font(.caption)
              .foregroundStyle(.secondary)
            Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 5) {
              GridRow {
                Text("From").foregroundStyle(.secondary)
                LocalPathText(url: item.sourceURL, lineLimit: 1)
              }
              GridRow {
                Text("To").foregroundStyle(.secondary)
                Text(item.destinationURL.path)
                  .font(.caption2)
                  .foregroundStyle(.secondary)
                  .lineLimit(1)
                  .textSelection(.enabled)
                  .help(item.destinationURL.path)
              }
            }
            .font(.caption)
          }
        }
        .padding(.vertical, 6)
      }

      Divider()

      HStack {
        Label("Copies only; no .als or source audio is rewritten", systemImage: "lock.shield")
          .font(.caption)
          .foregroundStyle(.secondary)
        Spacer()
        Button("Cancel", action: store.cancelAudioRecoveryPlan)
          .keyboardShortcut(.cancelAction)
          .disabled(store.isExecutingAudioRecovery)
        if store.isExecutingAudioRecovery {
          ProgressView()
            .controlSize(.small)
        }
        Button(
          store.isSampleLibrary ? "Sample Plan" : "Copy Verified Files",
          action: store.executeAudioRecoveryPlan
        )
        .keyboardShortcut(.defaultAction)
        .buttonStyle(.borderedProminent)
        .disabled(store.isExecutingAudioRecovery || store.isSampleLibrary)
      }
      .padding(18)
    }
    .frame(minWidth: 760, minHeight: 560)
    .tint(.black)
    .interactiveDismissDisabled(store.isExecutingAudioRecovery)
  }
}
