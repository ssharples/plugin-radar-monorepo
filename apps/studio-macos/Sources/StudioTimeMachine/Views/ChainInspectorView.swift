import StudioCore
import SwiftUI

struct ChainInspectorView: View {
  let occurrence: ChainOccurrence
  let family: ChainFamily?
  let openSource: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      VStack(alignment: .leading, spacing: 7) {
        Text(occurrence.devices.map(\.displayName).joined(separator: " → "))
          .font(.title3.weight(.semibold))
          .fixedSize(horizontal: false, vertical: true)
        Label(
          occurrence.recoveryCapability.title, systemImage: occurrence.recoveryCapability.symbol
        )
        .font(.callout)
        .foregroundStyle(.secondary)
      }

      Button("Open Source Set", action: openSource)
        .buttonStyle(.borderedProminent)

      Divider()

      ChainInspectorSection("Source") {
        ChainKeyValueRow(label: "Project", value: occurrence.projectName)
        ChainKeyValueRow(label: "Set", value: occurrence.setName)
        ChainKeyValueRow(label: "Track", value: occurrence.trackName)
        if let modifiedAt = occurrence.modifiedAt {
          ChainKeyValueRow(
            label: "Modified", value: modifiedAt.formatted(date: .abbreviated, time: .shortened))
        }
      }

      ChainInspectorSection("Family") {
        ChainKeyValueRow(label: "Occurrences", value: "\(family?.occurrences.count ?? 1)")
        ChainKeyValueRow(label: "Projects", value: "\(family?.projectCount ?? 1)")
        ChainKeyValueRow(label: "Stored states", value: "\(family?.stateVariationCount ?? 1)")
      }

      ChainInspectorSection("Ordered devices") {
        ForEach(flattenedDevices) { node in
          HStack(alignment: .top, spacing: 8) {
            Color.clear.frame(width: CGFloat(node.depth * 12), height: 1)
            Image(
              systemName: node.device.nestedDevices.isEmpty
                ? "slider.horizontal.3" : "square.stack.3d.up"
            )
            .foregroundStyle(.secondary)
            .frame(width: 16)
            VStack(alignment: .leading, spacing: 2) {
              Text(node.device.displayName)
                .font(.callout.weight(.medium))
              if let plugin = node.device.plugin {
                Text(
                  [plugin.manufacturer, plugin.name, plugin.version].compactMap { $0 }.joined(
                    separator: " · ")
                )
                .font(.caption)
                .foregroundStyle(.secondary)
              }
            }
          }
        }
      }

      ChainInspectorSection("Compatibility") {
        if let report = occurrence.compatibility, !report.evidence.isEmpty {
          ForEach(report.evidence) { evidence in
            VStack(alignment: .leading, spacing: 2) {
              Text(evidence.requiredPlugin.name ?? "Unknown plug-in")
                .font(.callout.weight(.medium))
              Text(evidence.explanation)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        } else {
          Text("No third-party plug-in evidence in this occurrence.")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }

      Text(
        "Studio Time Machine can inspect this chain but does not insert it into Live or fabricate a Rack file."
      )
      .font(.caption)
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var flattenedDevices: [ChainDeviceNode] {
    occurrence.devices.flatMap { ChainDeviceNode.flatten($0) }
  }
}

private struct ChainDeviceNode: Identifiable {
  let id: String
  let device: SetDevice
  let depth: Int

  static func flatten(_ device: SetDevice, depth: Int = 0, path: String = "") -> [ChainDeviceNode] {
    let nextPath = path.isEmpty ? device.id : "\(path)/\(device.id)"
    return [ChainDeviceNode(id: nextPath, device: device, depth: depth)]
      + device.nestedDevices.flatMap { flatten($0, depth: depth + 1, path: nextPath) }
  }
}

private struct ChainInspectorSection<Content: View>: View {
  let title: String
  @ViewBuilder let content: Content

  init(_ title: String, @ViewBuilder content: () -> Content) {
    self.title = title
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title).font(.headline)
      content
    }
  }
}

private struct ChainKeyValueRow: View {
  let label: String
  let value: String

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(label).foregroundStyle(.secondary)
      Spacer(minLength: 10)
      Text(value)
        .multilineTextAlignment(.trailing)
        .textSelection(.enabled)
    }
    .font(.callout)
  }
}
