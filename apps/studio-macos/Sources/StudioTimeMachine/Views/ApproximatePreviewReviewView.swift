import StudioCore
import SwiftUI

struct ApproximatePreviewReviewView: View {
  let renderPlan: ApproximatePreviewRenderPlan
  @Bindable var store: StudioLibraryStore

  private let omissions = [
    "Source offsets, clip fades, and warping",
    "Automation, mixer state, and routing",
    "Devices, plug-ins, and Ableton summing",
  ]

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      HStack(alignment: .top, spacing: 18) {
        Image(systemName: "waveform.badge.exclamationmark")
          .font(.system(size: 36, weight: .light))
          .foregroundStyle(.orange)
        VStack(alignment: .leading, spacing: 6) {
          Text("Review approximate dry preview")
            .font(.title2.weight(.semibold))
          Text("A secondary recovery aid—not a representation of the Ableton mix.")
            .foregroundStyle(.secondary)
        }
      }

      GroupBox("What this new WAV contains") {
        VStack(alignment: .leading, spacing: 8) {
          LabeledContent("Set", value: renderPlan.setName)
          LabeledContent("Raw placements", value: "\(renderPlan.dryPlan.segments.count)")
          LabeledContent("Fixed tempo", value: renderPlan.dryPlan.tempo.formatted() + " BPM")
          LabeledContent(
            "Coverage",
            value:
              "\(renderPlan.dryPlan.coverage.availableAudioClipCount) of \(renderPlan.dryPlan.coverage.arrangementAudioClipCount) Arrangement audio clips"
          )
        }
        .padding(4)
      }

      GroupBox("Deliberately omitted") {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(omissions, id: \.self) { omission in
            Label(omission, systemImage: "minus.circle")
          }
        }
        .foregroundStyle(.secondary)
        .padding(4)
      }

      GroupBox("New destination") {
        VStack(alignment: .leading, spacing: 8) {
          Label("Creates a new WAV without launching Ableton Live", systemImage: "doc.badge.plus")
            .font(.body.weight(.medium))
          Text(renderPlan.destinationURL.path)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
          Text(
            "Rendering refuses to overwrite a file that already exists. Existing artifacts remain the preferred preview source."
          )
          .font(.caption)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
        }
        .padding(4)
      }

      HStack {
        Button("Cancel", action: store.cancelApproximatePreviewRender)
          .keyboardShortcut(.cancelAction)
          .disabled(store.isRenderingApproximatePreview)
        Spacer()
        if store.isRenderingApproximatePreview {
          ProgressView()
            .controlSize(.small)
        }
        Button(store.isSampleLibrary ? "Sample Plan" : "Render Approximate WAV") {
          store.executeApproximatePreviewRender()
        }
        .keyboardShortcut(.defaultAction)
        .buttonStyle(.borderedProminent)
        .disabled(store.isRenderingApproximatePreview || store.isSampleLibrary)
      }
    }
    .padding(26)
    .frame(width: 660)
    .tint(.black)
    .interactiveDismissDisabled(store.isRenderingApproximatePreview)
  }
}
