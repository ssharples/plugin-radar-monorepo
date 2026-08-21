import SwiftUI

struct LocalPathText: View {
  let url: URL
  var font: Font = .caption2
  var lineLimit: Int? = nil

  @AppStorage("studio.showFullPaths") private var showFullPaths = true

  var body: some View {
    Text(showFullPaths ? url.path : abbreviatedPath)
      .font(font)
      .foregroundStyle(.secondary)
      .lineLimit(lineLimit)
      .textSelection(.enabled)
      .help(url.path)
  }

  private var abbreviatedPath: String {
    let parent = url.deletingLastPathComponent().lastPathComponent
    return parent.isEmpty ? url.lastPathComponent : "…/\(parent)/\(url.lastPathComponent)"
  }
}
