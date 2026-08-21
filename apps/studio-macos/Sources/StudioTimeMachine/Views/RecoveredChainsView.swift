import StudioCore
import SwiftUI

struct RecoveredChainsView: View {
  @Bindable var store: StudioLibraryStore
  @State private var mode: ChainBrowserMode
  @State private var recommendationContext: ProductionContext = .vocal

  init(store: StudioLibraryStore) {
    self.store = store
    let arguments = ProcessInfo.processInfo.arguments
    if arguments.contains("--sample-chain-recommendations") {
      _mode = State(initialValue: .recommendations)
    } else if arguments.contains("--sample-chain-occurrences") {
      _mode = State(initialValue: .occurrences)
    } else if arguments.contains("--sample-chain-plugins") {
      _mode = State(initialValue: .plugins)
    } else {
      _mode = State(initialValue: .families)
    }
  }

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 28) {
        header

        if let library = store.chainLibrary {
          metrics(library)

          Picker("Chain browser mode", selection: $mode) {
            ForEach(ChainBrowserMode.allCases) { mode in
              Text(mode.title).tag(mode)
            }
          }
          .pickerStyle(.segmented)
          .labelsHidden()
          .frame(maxWidth: 560)

          if mode == .recommendations {
            recommendationControls
          }

          browserContent
        } else if store.isBuildingChainLibrary {
          VStack(spacing: 12) {
            ProgressView()
              .controlSize(.small)
            Text("Building your private chain library")
              .font(.body.weight(.medium))
            Text("Grouping recurring device topology and local compatibility evidence.")
              .font(.callout)
              .foregroundStyle(.secondary)
          }
          .frame(maxWidth: .infinity, minHeight: 300)
        } else {
          ContentUnavailableView(
            "No chain evidence yet",
            systemImage: "point.3.connected.trianglepath.dotted",
            description: Text(
              "Index a folder to build a private chain library from parsed Set content.")
          )
        }

        Label(
          "Recovery is inspect-only unless an existing Rack is present. Studio Time Machine does not fabricate .adg files or claim native chain insertion.",
          systemImage: "lock.shield"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(maxWidth: 720, alignment: .leading)
      }
      .padding(38)
      .padding(.bottom, store.player.currentAsset == nil ? 24 : 92)
      .frame(maxWidth: 920, alignment: .leading)
      .frame(maxWidth: .infinity, alignment: .center)
    }
  }

  private var header: some View {
    HStack(alignment: .bottom, spacing: 24) {
      VStack(alignment: .leading, spacing: 8) {
        Text("Private chain browser")
          .font(.custom("Helvetica Neue", size: 30).weight(.bold))
        Text(
          "Recurring device chains recovered from your own Sets, with the project, version, state variation, and plug-in evidence kept attached."
        )
        .foregroundStyle(.secondary)
        .frame(maxWidth: 700, alignment: .leading)
      }

      Spacer(minLength: 16)

      StudioInlineFilterField(text: $store.searchText, prompt: "Filter chains")
        .frame(width: 220)
    }
  }

  private func metrics(_ library: PersonalChainLibrary) -> some View {
    HStack(spacing: 28) {
      ChainMetric(value: library.families.count, label: "Chain families")
      ChainMetric(value: library.occurrences.count, label: "Occurrences")
      ChainMetric(value: library.pluginUsage.count, label: "Plug-ins used")
    }
  }

  @ViewBuilder
  private var browserContent: some View {
    switch mode {
    case .recommendations:
      if visibleRecommendations.isEmpty {
        ContentUnavailableView(
          "No local recommendation",
          systemImage: "sparkles",
          description: Text("No chain family has been used in this production context yet.")
        )
        .frame(maxWidth: .infinity, minHeight: 260)
      } else {
        LazyVStack(spacing: 0) {
          ForEach(Array(visibleRecommendations.enumerated()), id: \.element.id) {
            index, recommendation in
            ChainRecommendationRow(recommendation: recommendation, rank: index + 1) {
              store.selectChainOccurrence(recommendation.representative)
            }
            Divider().padding(.leading, 44)
          }
        }
      }
    case .families:
      if store.visibleChainFamilies.isEmpty {
        searchEmptyState
      } else {
        LazyVStack(spacing: 0) {
          ForEach(store.visibleChainFamilies) { family in
            ChainFamilyRow(family: family) {
              if let occurrence = family.occurrences.first {
                store.selectChainOccurrence(occurrence)
              }
            }
            Divider().padding(.leading, 44)
          }
        }
      }
    case .occurrences:
      if store.visibleChainOccurrences.isEmpty {
        searchEmptyState
      } else {
        LazyVStack(spacing: 0) {
          ForEach(store.visibleChainOccurrences) { occurrence in
            ChainOccurrenceRow(
              occurrence: occurrence,
              stateVariationCount: store.chainLibrary?.families.first {
                $0.signature == occurrence.signature
              }?.stateVariationCount ?? 1,
              isSelected: store.selectedChainOccurrenceID == occurrence.id,
              select: { store.selectChainOccurrence(occurrence) }
            )
            Divider().padding(.leading, 44)
          }
        }
      }
    case .plugins:
      if store.visiblePluginUsage.isEmpty {
        searchEmptyState
      } else {
        LazyVStack(spacing: 0) {
          ForEach(store.visiblePluginUsage) { usage in
            PluginUsageRow(usage: usage)
            Divider().padding(.leading, 44)
          }
        }
      }
    }
  }

  private var searchEmptyState: some View {
    ContentUnavailableView.search(text: store.searchText)
      .frame(maxWidth: .infinity, minHeight: 260)
  }

  private var recommendationControls: some View {
    HStack(spacing: 14) {
      Picker("Production context", selection: $recommendationContext) {
        ForEach(ProductionContext.allCases, id: \.self) { context in
          Label(context.title, systemImage: context.symbol).tag(context)
        }
      }
      .pickerStyle(.menu)
      .fixedSize()

      Label("Private deterministic ranking · no cloud AI", systemImage: "lock.shield")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private var visibleRecommendations: [ChainRecommendation] {
    guard let library = store.chainLibrary else { return [] }
    let recommendations = ChainRecommendationEngine().recommend(
      for: recommendationContext,
      library: library
    )
    let query = store.searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return recommendations }
    return recommendations.filter {
      $0.family.displayName.localizedCaseInsensitiveContains(query)
        || $0.representative.trackName.localizedCaseInsensitiveContains(query)
        || $0.representative.projectName.localizedCaseInsensitiveContains(query)
        || $0.reasons.contains(where: { $0.localizedCaseInsensitiveContains(query) })
    }
  }
}

private enum ChainBrowserMode: String, CaseIterable, Identifiable {
  case recommendations
  case families
  case occurrences
  case plugins

  var id: String { rawValue }
  var title: String {
    switch self {
    case .recommendations: "Recommendations"
    case .families: "Families"
    case .occurrences: "Occurrences"
    case .plugins: "Plug-ins"
    }
  }
}

private struct ChainRecommendationRow: View {
  let recommendation: ChainRecommendation
  let rank: Int
  let select: () -> Void

  var body: some View {
    Button(action: select) {
      HStack(alignment: .top, spacing: 14) {
        ZStack {
          Circle()
            .fill(Color.secondary.opacity(0.09))
            .frame(width: 30, height: 30)
          Text("\(rank)")
            .font(.caption.monospacedDigit().weight(.semibold))
            .foregroundStyle(.secondary)
        }

        VStack(alignment: .leading, spacing: 6) {
          Text(recommendation.family.displayName)
            .font(.body.weight(.medium))
            .foregroundStyle(.primary)
          Text(
            "From \(recommendation.representative.projectName) · \(recommendation.representative.trackName)"
          )
          .font(.callout)
          .foregroundStyle(.secondary)
          Text(recommendation.reasons.joined(separator: " · "))
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer()

        VStack(alignment: .trailing, spacing: 4) {
          Text(recommendation.context.title)
            .font(.caption.weight(.semibold))
          if recommendation.missingPluginCount > 0 {
            Label(
              "\(recommendation.missingPluginCount) plug-in issues",
              systemImage: "exclamationmark.triangle")
          } else {
            Label("Locally compatible", systemImage: "checkmark.circle")
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      .padding(.vertical, 14)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityHint("Inspect the representative chain and its recommendation evidence")
  }
}

private struct ChainFamilyRow: View {
  let family: ChainFamily
  let select: () -> Void

  var body: some View {
    Button(action: select) {
      HStack(alignment: .top, spacing: 14) {
        Image(systemName: "square.stack.3d.up")
          .font(.title3)
          .foregroundStyle(.secondary)
          .frame(width: 30)

        VStack(alignment: .leading, spacing: 6) {
          Text(family.displayName)
            .font(.body.weight(.medium))
            .foregroundStyle(.primary)
            .fixedSize(horizontal: false, vertical: true)
          Text(
            "\(family.occurrences.count) occurrences across \(family.projectCount) \(family.projectCount == 1 ? "project" : "projects")"
          )
          .font(.callout)
          .foregroundStyle(.secondary)
          Label(
            "\(family.stateVariationCount) \(family.stateVariationCount == 1 ? "stored state" : "stored state variations")",
            systemImage: "slider.horizontal.3"
          )
          .font(.caption)
          .foregroundStyle(.secondary)
        }

        Spacer()

        if let latest = family.occurrences.first {
          VStack(alignment: .trailing, spacing: 4) {
            Text(latest.projectName)
            Text(latest.trackName)
            Text(latest.recoveryCapability.title)
          }
          .font(.caption)
          .foregroundStyle(.secondary)
        }
      }
      .padding(.vertical, 14)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityHint("Inspect the latest occurrence in this family")
  }
}

private struct ChainOccurrenceRow: View {
  let occurrence: ChainOccurrence
  let stateVariationCount: Int
  let isSelected: Bool
  let select: () -> Void

  var body: some View {
    Button(action: select) {
      HStack(alignment: .top, spacing: 14) {
        Image(systemName: occurrence.recoveryCapability.symbol)
          .font(.title3)
          .foregroundStyle(.secondary)
          .frame(width: 30)

        VStack(alignment: .leading, spacing: 6) {
          Text(occurrence.devices.map(\.displayName).joined(separator: " → "))
            .font(.body.weight(.medium))
            .foregroundStyle(.primary)
            .fixedSize(horizontal: false, vertical: true)
          Text("\(occurrence.projectName) · \(occurrence.setName) · \(occurrence.trackName)")
            .font(.callout)
            .foregroundStyle(.secondary)
          HStack(spacing: 10) {
            Label(
              occurrence.recoveryCapability.title, systemImage: occurrence.recoveryCapability.symbol
            )
            Text(
              "\(stateVariationCount) \(stateVariationCount == 1 ? "state" : "state variations")")
            if let modifiedAt = occurrence.modifiedAt {
              Text(modifiedAt.formatted(date: .abbreviated, time: .omitted))
            }
          }
          .font(.caption)
          .foregroundStyle(.secondary)
        }

        Spacer()

        CompatibilitySummary(report: occurrence.compatibility)
      }
      .padding(.horizontal, 8)
      .padding(.vertical, 14)
      .background(
        isSelected ? Color.black.opacity(0.08) : .clear,
        in: RoundedRectangle(cornerRadius: 9, style: .continuous)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityHint("Show chain evidence in the inspector")
  }
}

private struct PluginUsageRow: View {
  let usage: PluginUsageStatistic

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      Image(systemName: "puzzlepiece.extension")
        .font(.title3)
        .foregroundStyle(.secondary)
        .frame(width: 30)

      VStack(alignment: .leading, spacing: 6) {
        Text(usage.plugin.name ?? usage.plugin.identifier ?? "Unknown plug-in")
          .font(.body.weight(.medium))
        Text(
          [usage.plugin.manufacturer, usage.plugin.format.title, usage.plugin.version].compactMap {
            $0
          }.joined(separator: " · ")
        )
        .font(.callout)
        .foregroundStyle(.secondary)
        Text(usage.trackNames.prefix(4).joined(separator: " · "))
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
      }

      Spacer()

      VStack(alignment: .trailing, spacing: 3) {
        Text("\(usage.occurrenceCount) occurrences")
        Text("\(usage.projectCount) \(usage.projectCount == 1 ? "project" : "projects")")
      }
      .font(.caption)
      .foregroundStyle(.secondary)
    }
    .padding(.vertical, 14)
  }
}

private struct CompatibilitySummary: View {
  let report: PluginCompatibilityReport?

  var body: some View {
    if let report {
      VStack(alignment: .trailing, spacing: 3) {
        Text("\(report.evidence.count) plug-in checks")
        if report.missingCount > 0 {
          Text("\(report.missingCount) missing")
        } else if report.versionMismatchCount > 0 {
          Text("\(report.versionMismatchCount) version mismatch")
        } else {
          Text("Available locally")
        }
      }
      .font(.caption)
      .foregroundStyle(.secondary)
    }
  }
}

private struct ChainMetric: View {
  let value: Int
  let label: String

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text("\(value)")
        .font(.title2.monospacedDigit().weight(.semibold))
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

extension ChainRecoveryCapability {
  var title: String {
    switch self {
    case .inspectOnly: "Inspect only"
    case .existingRackCandidate: "Existing Rack candidate"
    }
  }

  var symbol: String {
    switch self {
    case .inspectOnly: "eye"
    case .existingRackCandidate: "square.stack.3d.up"
    }
  }
}

extension PluginFormat {
  fileprivate var title: String {
    switch self {
    case .audioUnit: "Audio Unit"
    case .vst2: "VST2"
    case .vst3: "VST3"
    }
  }
}

extension ProductionContext {
  fileprivate var title: String {
    switch self {
    case .vocal: "Vocal"
    case .guitar: "Guitar"
    case .bass: "Bass"
    case .drums: "Drums"
    case .keys: "Keys"
    case .synth: "Synth"
    case .mixBus: "Mix bus"
    case .master: "Master"
    case .other: "Other"
    }
  }

  fileprivate var symbol: String {
    switch self {
    case .vocal: "mic"
    case .guitar: "guitars"
    case .bass: "waveform.path"
    case .drums: "circle.grid.cross"
    case .keys: "pianokeys"
    case .synth: "slider.horizontal.3"
    case .mixBus: "arrow.triangle.merge"
    case .master: "speaker.wave.3"
    case .other: "waveform"
    }
  }
}
