import StudioCore
import SwiftUI

struct StudioInspectorView: View {
  @Bindable var store: StudioLibraryStore

  var body: some View {
    ScrollView {
      Group {
        if let occurrence = store.selectedChainOccurrence {
          ChainInspectorView(
            occurrence: occurrence,
            family: store.chainLibrary?.families.first { $0.signature == occurrence.signature },
            openSource: store.openSelectedChainSource
          )
        } else if let asset = store.selectedAsset, store.selectedAssetID != nil {
          AssetInspectorView(asset: asset)
        } else if let set = store.selectedSet {
          SetInspectorView(
            set: set,
            compatibilityReport: store.selectedCompatibilityReport,
            previewDecision: store.selectedPreviewDecision,
            isScanningCompatibility: store.isScanningPluginInventory
          )
        } else if let index = store.library {
          LibraryInspectorView(index: index)
        } else {
          ContentUnavailableView(
            "Nothing selected",
            systemImage: "sidebar.right",
            description: Text("Choose a project, Set, or audio artifact to inspect it.")
          )
        }
      }
      .padding(20)
    }
  }
}

private struct SetInspectorView: View {
  let set: AbletonSet
  let compatibilityReport: PluginCompatibilityReport?
  let previewDecision: PreviewDecision?
  let isScanningCompatibility: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      VStack(alignment: .leading, spacing: 7) {
        Text(set.displayName)
          .font(.title3.weight(.semibold))
          .fixedSize(horizontal: false, vertical: true)
        Label(
          set.isBackup ? "Backup Set" : "Current Set",
          systemImage: set.isBackup ? "clock.arrow.circlepath" : "doc"
        )
        .font(.callout)
        .foregroundStyle(.secondary)
      }

      Divider()

      InspectorSection("Set evidence") {
        KeyValueRow(label: "Modified", value: set.modifiedText)
        KeyValueRow(label: "Created with", value: set.liveVersionText)
        if let tempo = set.content.tempo {
          KeyValueRow(
            label: "Tempo",
            value:
              "\(tempo.formatted(.number.precision(.fractionLength(tempo.rounded() == tempo ? 0 : 1)))) BPM"
          )
        }
        KeyValueRow(label: "Compressed", value: set.compressedSizeText)
        KeyValueRow(label: "Expanded XML", value: set.expandedSizeText)
      }

      InspectorSection("Structure") {
        metricGrid
        Text(
          "Counts describe the Set XML. They do not prove a device, sidechain, or automation lane is active."
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      }

      InspectorSection("Compatibility") {
        if isScanningCompatibility {
          Label("Scanning installed plug-ins", systemImage: "arrow.triangle.2.circlepath")
            .font(.body.weight(.medium))
        } else if let compatibilityReport {
          if compatibilityReport.evidence.isEmpty {
            Label("No third-party plug-in identities", systemImage: "checkmark.circle")
              .font(.body.weight(.medium))
          } else {
            KeyValueRow(
              label: "Installed",
              value: "\(compatibilityReport.evidence.count { $0.status == .installed })")
            KeyValueRow(label: "Missing", value: "\(compatibilityReport.missingCount)")
            KeyValueRow(
              label: "Version mismatch", value: "\(compatibilityReport.versionMismatchCount)")
            KeyValueRow(label: "Not scanned", value: "\(compatibilityReport.unknownCount)")
            ForEach(compatibilityReport.evidence.prefix(8)) { evidence in
              HStack(alignment: .top, spacing: 8) {
                Image(systemName: evidence.status.symbol)
                  .foregroundStyle(evidence.status.color)
                  .frame(width: 16)
                VStack(alignment: .leading, spacing: 2) {
                  Text(evidence.requiredPlugin.name ?? "Unknown plug-in")
                    .font(.callout.weight(.medium))
                  Text(evidence.explanation)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                }
              }
            }
          }
        } else {
          Label("Not yet scanned", systemImage: "questionmark.diamond")
            .font(.body.weight(.medium))
          Text(
            "Compatibility remains unknown until the local installed plug-in inventory finishes."
          )
          .font(.caption)
          .foregroundStyle(.secondary)
        }
      }

      InspectorSection("Preview availability") {
        if let previewDecision {
          Label(previewDecision.label, systemImage: previewDecision.fidelity.symbol)
            .font(.body.weight(.medium))
          Text(previewDecision.explanation)
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)

          if let coverage = previewDecision.dryPlan?.coverage {
            KeyValueRow(label: "Coverage", value: coverage.coverage.title)
            KeyValueRow(
              label: "Arrangement audio",
              value:
                "\(coverage.availableAudioClipCount) of \(coverage.arrangementAudioClipCount) available"
            )
            ForEach(Array(coverage.blockers.enumerated()), id: \.offset) { _, blocker in
              Label(blocker, systemImage: "exclamationmark.circle")
                .font(.caption)
                .foregroundStyle(.secondary)
            }
          }
        } else {
          Text("No preview decision is available for this Set.")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }

      InspectorSection("Media dependencies") {
        KeyValueRow(
          label: "Available",
          value: "\(set.content.dependencies.count { $0.availability == .available })")
        KeyValueRow(
          label: "Missing",
          value: "\(set.content.dependencies.count { $0.availability == .missing })")
        KeyValueRow(
          label: "Disconnected",
          value: "\(set.content.dependencies.count { $0.availability == .disconnected })")
        KeyValueRow(
          label: "Unresolved",
          value: "\(set.content.dependencies.count { $0.availability == .unresolved })")
      }

      LocalPathText(url: set.fileURL)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var metricGrid: some View {
    Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 10) {
      MetricRow(
        "Tracks", set.structure.trackCount, "Third-party", set.structure.thirdPartyDeviceCount)
      MetricRow(
        "Audio", set.structure.audioTrackCount, "Max for Live", set.structure.maxForLiveDeviceCount)
      MetricRow("MIDI", set.structure.midiTrackCount, "Racks", set.structure.rackDeviceCount)
      MetricRow(
        "Groups", set.structure.groupTrackCount, "Automation", set.structure.automationEnvelopeCount
      )
      MetricRow(
        "Returns", set.structure.returnTrackCount, "Warp markers", set.structure.warpMarkerCount)
    }
  }
}

extension PluginCompatibilityStatus {
  fileprivate var symbol: String {
    switch self {
    case .installed: "checkmark.circle"
    case .missing: "xmark.circle"
    case .versionMismatch: "exclamationmark.triangle"
    case .unknown: "questionmark.circle"
    }
  }

  fileprivate var color: Color {
    switch self {
    case .installed: .green
    case .missing: .red
    case .versionMismatch: .orange
    case .unknown: .secondary
    }
  }
}

extension PreviewFidelity {
  fileprivate var symbol: String {
    switch self {
    case .existingArtifact: "waveform.circle"
    case .approximate: "waveform.badge.exclamationmark"
    case .experimentalLiveRender: "flask"
    case .unavailable: "nosign"
    }
  }
}

extension PreviewCoverage {
  fileprivate var title: String {
    switch self {
    case .complete: "Complete source coverage"
    case .partial: "Partial source coverage"
    case .unsupported: "Unsupported"
    }
  }
}

private struct AssetInspectorView: View {
  let asset: PreviewAsset
  @State private var analysis: MasteringAnalysis?
  @State private var isAnalyzing = false
  @State private var analysisError: String?
  @State private var analysisRequestedForAssetID: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      VStack(alignment: .leading, spacing: 7) {
        Text(asset.filename)
          .font(.title3.weight(.semibold))
          .fixedSize(horizontal: false, vertical: true)
        Label(
          asset.isAvailableOnDisk ? "Existing local audio" : "File unavailable",
          systemImage: asset.isAvailableOnDisk ? "waveform" : "questionmark.folder"
        )
        .font(.callout)
        .foregroundStyle(.secondary)
      }

      Divider()

      InspectorSection("Preview truth") {
        KeyValueRow(label: "Provenance", value: asset.category.displayName)
        KeyValueRow(
          label: "Render heuristic",
          value: asset.isLikelyUserRender ? "Likely user render" : "No render hint")
        Text(
          "Provenance and the filename heuristic are independent. A likely render does not replace the artifact category."
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
      }

      InspectorSection("File") {
        KeyValueRow(label: "Modified", value: asset.modifiedText)
        KeyValueRow(label: "Size", value: asset.sizeText)
      }

      InspectorSection("Master analysis") {
        if let analysis {
          MasteringAnalysisEvidenceView(analysis: analysis)
        } else if isAnalyzing {
          HStack(spacing: 8) {
            ProgressView().controlSize(.small)
            Text("Reading audio locally…")
              .font(.callout.weight(.medium))
          }
          Text("The source file remains unchanged.")
            .font(.caption)
            .foregroundStyle(.secondary)
        } else if let analysisError {
          Label(analysisError, systemImage: "exclamationmark.triangle")
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
          Button("Try Again") { analysisRequestedForAssetID = asset.id }
        } else if asset.isAvailableOnDisk {
          Text(
            asset.isLikelyUserRender
              ? "Technical evidence is ready to calculate locally."
              : "Run technical analysis when this artifact is a mix, master, or bounce."
          )
          .font(.caption)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
          Button("Analyze Audio") { analysisRequestedForAssetID = asset.id }
        } else {
          Text("Reconnect the file location before analysing this artifact.")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }

      LocalPathText(url: asset.fileURL)
        .fixedSize(horizontal: false, vertical: true)
    }
    .task(id: "\(asset.id):\(analysisRequestedForAssetID ?? "")") {
      guard asset.isAvailableOnDisk,
        asset.isLikelyUserRender || analysisRequestedForAssetID == asset.id
      else { return }
      await analyze()
    }
  }

  @MainActor
  private func analyze() async {
    analysis = nil
    analysisError = nil
    isAnalyzing = true
    let url = asset.fileURL
    do {
      analysis = try await MasteringAnalysisMemo.shared.analysis(file: url)
    } catch is CancellationError {
      // Selection changed; do not turn expected cancellation into an error state.
    } catch {
      analysisError = error.localizedDescription
    }
    isAnalyzing = false
  }
}

private actor MasteringAnalysisMemo {
  static let shared = MasteringAnalysisMemo()

  private var analysesByPath: [String: MasteringAnalysis] = [:]

  func analysis(file fileURL: URL) throws -> MasteringAnalysis {
    let url = fileURL.standardizedFileURL
    let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
    if let cached = analysesByPath[url.path],
      cached.sourceBytes == Int64(values.fileSize ?? 0),
      cached.sourceModifiedAt == values.contentModificationDate
    {
      return cached
    }
    let analysis = try MasteringAnalyzer().analyze(file: url)
    analysesByPath[url.path] = analysis
    return analysis
  }
}

private struct MasteringAnalysisEvidenceView: View {
  let analysis: MasteringAnalysis

  var body: some View {
    Group {
      KeyValueRow(label: "Integrated", value: meter(analysis.integratedLUFS, unit: "LUFS"))
      KeyValueRow(
        label: "Max momentary", value: meter(analysis.maximumMomentaryLUFS, unit: "LUFS-M"))
      KeyValueRow(
        label: "Max short-term", value: meter(analysis.maximumShortTermLUFS, unit: "LUFS-S"))
      KeyValueRow(label: "Loudness range", value: meter(analysis.loudnessRangeLU, unit: "LU"))

      Divider()

      KeyValueRow(
        label: "True peak (estimated)", value: meter(analysis.estimatedTruePeakDBTP, unit: "dBTP"))
      KeyValueRow(label: "Sample peak", value: meter(analysis.samplePeakDBFS, unit: "dBFS"))
      KeyValueRow(label: "Average RMS", value: meter(analysis.averageRMSDBFS, unit: "dBFS"))
      KeyValueRow(label: "Maximum RMS", value: meter(analysis.maximumRMSDBFS, unit: "dBFS"))
      KeyValueRow(label: "Crest factor", value: meter(analysis.crestFactorDB, unit: "dB"))

      Divider()

      KeyValueRow(label: "Stereo correlation", value: correlationText)
      KeyValueRow(
        label: "Right − left", value: meter(analysis.rightMinusLeftBalanceDB, unit: "dB"))
      KeyValueRow(label: "Clipped samples", value: analysis.clippedSampleCount.formatted())
      KeyValueRow(label: "Sample rate", value: sampleRateText)
      KeyValueRow(label: "Channels", value: "\(analysis.channelCount)")

      Text(
        "LUFS uses ITU-R BS.1770-style K-weighting and gating. True peak is a 4× estimate, not a certified delivery measurement. Values describe the file; they do not grade the master."
      )
      .font(.caption)
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
    }
  }

  private func meter(_ value: Double?, unit: String) -> String {
    guard let value else { return "−∞ \(unit)" }
    return "\(value.formatted(.number.precision(.fractionLength(1)))) \(unit)"
  }

  private var correlationText: String {
    guard let value = analysis.stereoCorrelation else {
      return analysis.channelCount == 1 ? "Mono" : "Unavailable"
    }
    return value.formatted(.number.precision(.fractionLength(2)))
  }

  private var sampleRateText: String {
    let kilohertz = analysis.sampleRate / 1_000
    return "\(kilohertz.formatted(.number.precision(.fractionLength(kilohertz.rounded() == kilohertz ? 0 : 1)))) kHz"
  }
}

private struct LibraryInspectorView: View {
  let index: StudioLibraryIndex

  var body: some View {
    VStack(alignment: .leading, spacing: 22) {
      Text("Library evidence")
        .font(.title3.weight(.semibold))

      InspectorSection("Current snapshot") {
        KeyValueRow(label: "Projects", value: "\(index.projects.count)")
        KeyValueRow(
          label: "Timelines", value: "\(index.projects.reduce(0) { $0 + $1.timelines.count })")
        KeyValueRow(label: "Sets", value: "\(index.projects.reduce(0) { $0 + $1.sets.count })")
        KeyValueRow(label: "Loose audio", value: "\(index.unassignedAudioAssets.count)")
        KeyValueRow(label: "Issues", value: "\(index.issues.count)")
      }

      Text("Scanned \(index.scannedAt.formatted(date: .abbreviated, time: .shortened))")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}

private struct InspectorSection<Content: View>: View {
  let title: String
  @ViewBuilder let content: Content

  init(_ title: String, @ViewBuilder content: () -> Content) {
    self.title = title
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(title)
        .font(.headline)
      content
    }
  }
}

private struct KeyValueRow: View {
  let label: String
  let value: String

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(label)
        .foregroundStyle(.secondary)
      Spacer(minLength: 12)
      Text(value)
        .multilineTextAlignment(.trailing)
        .textSelection(.enabled)
    }
    .font(.callout)
  }
}

private struct MetricRow: View {
  let firstLabel: String
  let firstValue: Int
  let secondLabel: String
  let secondValue: Int

  init(_ firstLabel: String, _ firstValue: Int, _ secondLabel: String, _ secondValue: Int) {
    self.firstLabel = firstLabel
    self.firstValue = firstValue
    self.secondLabel = secondLabel
    self.secondValue = secondValue
  }

  var body: some View {
    GridRow {
      Text("\(firstValue)")
        .font(.title3.monospacedDigit().weight(.semibold))
      Text(firstLabel)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text("\(secondValue)")
        .font(.title3.monospacedDigit().weight(.semibold))
      Text(secondLabel)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }
}
