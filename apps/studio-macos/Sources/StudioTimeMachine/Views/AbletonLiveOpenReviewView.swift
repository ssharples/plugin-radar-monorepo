import StudioCore
import SwiftUI

struct AbletonLiveOpenReviewView: View {
  let plan: AbletonLiveOpenPlan
  @Bindable var store: StudioLibraryStore

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      HStack(alignment: .top, spacing: 18) {
        Image(systemName: "flask")
          .font(.system(size: 36, weight: .light))
          .foregroundStyle(.orange)
        VStack(alignment: .leading, spacing: 6) {
          HStack(spacing: 8) {
            Text("Review Open in Ableton Live")
              .font(.title2.weight(.semibold))
            Text("EXPERIMENTAL")
              .font(.caption2.weight(.bold))
              .padding(.horizontal, 7)
              .padding(.vertical, 3)
              .background(.quaternary, in: Capsule())
          }
          Text("Studio Time Machine will only ask Live to open this Set after you confirm.")
            .foregroundStyle(.secondary)
        }
      }

      GroupBox("Selected Ableton Live installation") {
        VStack(alignment: .leading, spacing: 8) {
          LabeledContent("Application", value: plan.installation.displayName)
          LabeledContent("Version", value: plan.installation.version ?? "Unknown")
          LocalPathText(url: plan.installation.applicationURL)
        }
        .padding(4)
      }

      GroupBox("Why this installation") {
        Text(plan.explanation)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
          .padding(4)
      }

      GroupBox("User-controlled boundary") {
        VStack(alignment: .leading, spacing: 9) {
          Label(
            "Opens the original Set in the selected Live application",
            systemImage: "checkmark.circle")
          Label(
            "Does not render, export, play audio, or control Live in the background",
            systemImage: "xmark.circle")
          Label(
            plan.requiresUserControlledExport
              ? "Any export must be started and reviewed by you inside Ableton Live"
              : "No automated export is included in this plan",
            systemImage: "person.crop.circle.badge.checkmark"
          )
          LocalPathText(url: plan.setURL)
        }
        .foregroundStyle(.secondary)
        .padding(4)
      }

      if let message = store.liveBridgeMessage {
        Label(message, systemImage: "exclamationmark.triangle")
          .font(.callout)
          .foregroundStyle(.red)
          .fixedSize(horizontal: false, vertical: true)
      }

      HStack {
        Button("Cancel", action: store.cancelLiveOpenPlan)
          .keyboardShortcut(.cancelAction)
          .disabled(store.isOpeningInAbletonLive)
        Spacer()
        if store.isOpeningInAbletonLive {
          ProgressView()
            .controlSize(.small)
        }
        Button(store.isSampleLibrary ? "Sample Plan" : "Open Set in Ableton Live") {
          store.executeLiveOpenPlan()
        }
        .keyboardShortcut(.defaultAction)
        .buttonStyle(.borderedProminent)
        .disabled(store.isOpeningInAbletonLive || store.isSampleLibrary)
      }
    }
    .padding(26)
    .frame(width: 660)
    .tint(.black)
    .interactiveDismissDisabled(store.isOpeningInAbletonLive)
  }
}
