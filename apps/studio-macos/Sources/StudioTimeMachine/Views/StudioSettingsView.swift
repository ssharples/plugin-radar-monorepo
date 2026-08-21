import SwiftUI

struct StudioSettingsView: View {
  @AppStorage("studio.libraryDensity") private var density = LibraryDensity.spacious.rawValue
  @AppStorage("studio.showFullPaths") private var showFullPaths = true

  var body: some View {
    TabView {
      Form {
        Picker("Library density", selection: $density) {
          ForEach(LibraryDensity.allCases) { option in
            Text(option.title).tag(option.rawValue)
          }
        }
        Toggle("Show full local paths while browsing", isOn: $showFullPaths)
        Text("Write-plan destinations are always shown in full before confirmation.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .formStyle(.grouped)
      .tabItem {
        Label("General", systemImage: "slider.horizontal.3")
      }

      Form {
        LabeledContent("Indexing", value: "Local and read-only")
        LabeledContent("Cloud upload", value: "Off")
        Text(
          "File URLs and path-derived identifiers stay on this Mac. Cloud, AI, and community features require a separate explicit opt-in contract."
        )
        .font(.callout)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      }
      .formStyle(.grouped)
      .tabItem {
        Label("Privacy", systemImage: "lock.shield")
      }
    }
    .frame(width: 500, height: 300)
    .scenePadding()
  }
}
