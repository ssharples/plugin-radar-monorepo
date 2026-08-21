import StudioCore
import SwiftUI

struct RestorePlanReviewView: View {
  let plan: SetRestorePlan
  @Bindable var store: StudioLibraryStore

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      HStack(alignment: .top, spacing: 18) {
        Image(
          systemName: plan.operation == .restore
            ? "clock.arrow.circlepath" : "arrow.triangle.branch"
        )
        .font(.system(size: 36, weight: .light))
        .foregroundStyle(.secondary)

        VStack(alignment: .leading, spacing: 6) {
          Text(plan.operation == .restore ? "Review restore plan" : "Review branch plan")
            .font(.title2.weight(.semibold))
          Text("Nothing is written until you confirm this new-file operation.")
            .foregroundStyle(.secondary)
        }
      }

      GroupBox("Source snapshot") {
        VStack(alignment: .leading, spacing: 8) {
          LabeledContent("Set", value: plan.snapshot.originalFilename)
          LabeledContent(
            "Captured",
            value: plan.snapshot.capturedAt.formatted(date: .abbreviated, time: .shortened))
          LabeledContent(
            "Size",
            value: ByteCountFormatter.string(fromByteCount: plan.snapshot.bytes, countStyle: .file))
          LocalPathText(url: plan.snapshot.sourceURL)
        }
        .padding(4)
      }

      GroupBox("New destination") {
        VStack(alignment: .leading, spacing: 8) {
          Label("Creates a new .als file", systemImage: "doc.badge.plus")
            .font(.body.weight(.medium))
          Text(plan.destinationURL.path)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
          Text(
            "Execution rechecks the destination and refuses to overwrite a file that appears after planning."
          )
          .font(.caption)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
        }
        .padding(4)
      }

      HStack {
        Button("Cancel", action: store.cancelRestorePlan)
          .keyboardShortcut(.cancelAction)
          .disabled(store.isExecutingRestore)
        Spacer()
        if store.isExecutingRestore {
          ProgressView()
            .controlSize(.small)
        }
        Button(
          store.isSampleLibrary
            ? "Sample Plan"
            : (plan.operation == .restore ? "Restore New Copy" : "Create Branch Copy")
        ) {
          store.executeRestorePlan()
        }
        .keyboardShortcut(.defaultAction)
        .buttonStyle(.borderedProminent)
        .disabled(store.isExecutingRestore || store.isSampleLibrary)
      }
    }
    .padding(26)
    .frame(width: 620)
    .tint(.black)
    .interactiveDismissDisabled(store.isExecutingRestore)
  }
}
