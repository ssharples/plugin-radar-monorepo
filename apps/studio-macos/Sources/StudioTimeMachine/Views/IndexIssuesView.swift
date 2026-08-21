import StudioCore
import SwiftUI

struct IndexIssuesView: View {
  let issues: [IndexIssue]
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        VStack(alignment: .leading, spacing: 4) {
          Text("Indexing issues")
            .font(.title2.weight(.semibold))
          Text("The rest of the library remains available.")
            .foregroundStyle(.secondary)
        }
        Spacer()
        Button("Done") { dismiss() }
          .keyboardShortcut(.defaultAction)
      }
      .padding(22)

      Divider()

      List(issues) { issue in
        VStack(alignment: .leading, spacing: 5) {
          Text(issue.fileURL.lastPathComponent)
            .font(.body.weight(.medium))
          Text(issue.message)
            .font(.callout)
            .foregroundStyle(.secondary)
          LocalPathText(url: issue.fileURL)
        }
        .padding(.vertical, 6)
      }
    }
    .frame(width: 660, height: 440)
  }
}
