import SwiftUI

struct FirstRunView: View {
  let chooseFolder: () -> Void

  var body: some View {
    VStack(spacing: 26) {
      Spacer(minLength: 60)

      ProjectObjectView(identity: "first-run", size: 178, showsDisc: true)
        .accessibilityHidden(true)

      VStack(spacing: 10) {
        Text("Find the work already in your studio")
          .font(.custom("Helvetica Neue", size: 28).weight(.bold))
          .multilineTextAlignment(.center)

        Text(
          "Add a folder containing Ableton projects. Studio Time Machine builds a private, read-only library of Sets, backups, and existing audio."
        )
        .font(.body)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
        .lineSpacing(3)
        .frame(maxWidth: 470)
      }

      Button(action: chooseFolder) {
        Label("Add to Studio", systemImage: "folder.badge.plus")
          .frame(minWidth: 180)
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.large)
      .tint(.black)

      HStack(spacing: 18) {
        Label("Stays on this Mac", systemImage: "macbook")
        Label("Originals untouched", systemImage: "lock")
      }
      .font(.caption)
      .foregroundStyle(.secondary)

      Spacer(minLength: 76)
    }
    .padding(40)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}
