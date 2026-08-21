import StudioCore
import SwiftUI

private enum SampleScope: String, CaseIterable, Identifiable {
  case all = "All Samples"
  case used = "Used"
  case unavailable = "Unavailable"

  var id: Self { self }

  func includes(_ sample: SampleListRow) -> Bool {
    switch self {
    case .all: true
    case .used: sample.occurrenceCount > 0
    case .unavailable: sample.availability != .available
    }
  }
}

private enum SampleInspectorLens: String, CaseIterable, Identifiable {
  case overview = "Overview"
  case usage = "Usage"
  case copies = "Copies"

  var id: Self { self }
}

struct SamplesView: View {
  @Bindable var store: StudioLibraryStore
  @State private var selection: String?
  @State private var sortOrder = [KeyPathComparator(\SampleListRow.name)]
  @State private var scope: SampleScope = .all
  @State private var showsLocations = false

  var body: some View {
    VStack(spacing: 0) {
      workspaceHeader
      libraryControls
      Divider()

      if store.sampleLocations.isEmpty && store.sampleRows.isEmpty {
        emptyState
      } else {
        HSplitView {
          libraryPane
            .frame(minWidth: 650)

          if let sample = store.selectedSample {
            SampleUsageDetailView(
              sample: sample,
              occurrences: store.sampleOccurrences,
              matchReviews: store.sampleMatchReviews,
              audioAnalysis: store.selectedSampleAudioAnalysis,
              isAnalyzingAudio: store.isAnalyzingSelectedSample,
              isVerifyingMatches: store.isVerifyingSampleMatches,
              usageCoverageComplete: store.sampleUsageCoverageComplete,
              isPlaying: store.isSamplePreviewPlaying(sample),
              amplitude: store.samplePreviewAmplitude(sample),
              togglePreview: { store.toggleSamplePreview(sample) },
              analyzeAudio: { store.analyzeSelectedSample(force: true) },
              verifyMatches: store.verifySelectedSampleMatches,
              decideMatch: store.decideSampleMatch,
              reveal: store.revealInFinder
            )
            .id(sample.id)
            .frame(minWidth: 340, idealWidth: 410, maxWidth: 500)
          }
        }
      }
    }
    .onAppear {
      selection = store.selectedSampleID
    }
    .onChange(of: selection) { _, next in
      store.selectSample(id: next)
    }
    .onChange(of: store.selectedSampleID) { _, next in
      if selection != next { selection = next }
    }
    .onChange(of: scope) { _, _ in
      guard let selection, !filteredRows.contains(where: { $0.id == selection }) else { return }
      self.selection = filteredRows.first?.id
    }
    .onChange(of: sortOrder) { _, next in
      guard let comparator = next.first else { return }
      let field: SampleSortField =
        switch comparator.keyPath {
        case \SampleListRow.name: .name
        case \SampleListRow.locationName: .location
        case \SampleListRow.sessionCount: .sessionCount
        case \SampleListRow.setCount: .setCount
        case \SampleListRow.occurrenceCount: .occurrenceCount
        case \SampleListRow.metadata.bytes: .size
        default: .name
        }
      store.setSampleSort(
        field: field,
        direction: comparator.order == .forward ? .ascending : .descending)
    }
    .tint(.black)
  }

  private var workspaceHeader: some View {
    HStack(alignment: .center, spacing: 18) {
      VStack(alignment: .leading, spacing: 4) {
        Text("Samples")
          .font(.custom("Helvetica Neue", size: 30).weight(.bold))
        Text(headerDetail)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }

      Spacer()

      Button {
        showsLocations.toggle()
      } label: {
        Label(locationButtonTitle, systemImage: locationButtonSymbol)
      }
      .popover(isPresented: $showsLocations, arrowEdge: .top) {
        SampleLocationsPopover(
          locations: store.sampleLocations,
          addLocations: store.chooseSampleLocations,
          removeLocation: store.removeSampleLocation,
          reveal: store.revealInFinder
        )
      }

      Button(action: store.rescanSamples) {
        Label("Rescan", systemImage: "arrow.triangle.2.circlepath")
      }
      .disabled(store.sampleLocations.isEmpty || store.sampleStatus == .indexing)
    }
    .padding(.horizontal, 26)
    .padding(.top, 22)
    .padding(.bottom, 16)
  }

  private var libraryControls: some View {
    HStack(spacing: 16) {
      Picker("Sample scope", selection: $scope) {
        ForEach(SampleScope.allCases) { item in
          Text(item.rawValue).tag(item)
        }
      }
      .pickerStyle(.menu)
      .frame(width: 155, alignment: .leading)

      Text(scopeSummary)
        .font(.caption)
        .foregroundStyle(.secondary)

      Spacer()

      StudioInlineFilterField(text: $store.searchText, prompt: "Filter samples and packs")
        .frame(width: 230)

      if store.sampleStatus == .indexing {
        ProgressView()
          .controlSize(.small)
          .accessibilityLabel("Indexing sample metadata")
        Text("Reading audio headers…")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else if store.isQueryingSamples {
        ProgressView()
          .controlSize(.small)
          .accessibilityLabel("Querying the local sample index")
        Text("Updating results…")
          .font(.caption)
          .foregroundStyle(.secondary)
      } else {
        Text("Local analysis · read-only")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.horizontal, 26)
    .padding(.bottom, 14)
  }

  private var libraryPane: some View {
    Group {
      if filteredRows.isEmpty {
        ContentUnavailableView {
          Label(emptyScopeTitle, systemImage: emptyScopeSymbol)
        } description: {
          Text(emptyScopeDescription)
        } actions: {
          Button("Show All Samples") { scope = .all }
        }
      } else {
        table
      }
    }
    .background(Color(nsColor: .textBackgroundColor))
  }

  private var table: some View {
    Table(filteredRows, selection: $selection, sortOrder: $sortOrder) {
      TableColumn("Sample", value: \SampleListRow.name) { sample in
        VStack(alignment: .leading, spacing: 3) {
          HStack(spacing: 6) {
            Button {
              store.toggleSamplePreview(sample)
            } label: {
              SampleMeshSphereView(
                tint: sphereTint(for: sample),
                isPlaying: store.isSamplePreviewPlaying(sample),
                amplitude: store.samplePreviewAmplitude(sample)
              )
            }
            .buttonStyle(.plain)
            .disabled(sample.availability != .available)
            .accessibilityLabel(
              store.isSamplePreviewPlaying(sample)
                ? "Pause \(sample.name)" : "Play \(sample.name)"
            )
            .help(
              sample.availability == .available
                ? "Play or pause this sample" : sample.availability.shortTitle
            )
            Text(sample.name)
              .fontWeight(.medium)
              .lineLimit(1)
          }
          Text(sample.classification.shortTitle)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
        .padding(.vertical, 8)
      }
      .width(min: 230, ideal: 310)

      TableColumn("Pack", value: \SampleListRow.locationName) { sample in
        VStack(alignment: .leading, spacing: 3) {
          Text(sample.packName).lineLimit(1)
          Text(sample.locationName)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      }
      .width(min: 150, ideal: 210)

      TableColumn("Library use", value: \SampleListRow.occurrenceCount) { sample in
        VStack(alignment: .leading, spacing: 3) {
          Text("\(sample.occurrenceCount.formatted()) occurrences")
            .monospacedDigit()
          Text(workSummary(sample))
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      }
      .width(min: 110, ideal: 135)

      TableColumn("Last used") { sample in
        Text(sample.lastUsedAt?.formatted(date: .abbreviated, time: .omitted) ?? "—")
      }
      .width(min: 90, ideal: 110)
    }
    .tableStyle(.inset(alternatesRowBackgrounds: true))
    .accessibilityLabel("Indexed samples")
  }

  private var emptyState: some View {
    VStack(spacing: 0) {
      Spacer()
      VStack(spacing: 18) {
        VStack(spacing: 8) {
          Text("Choose your sample libraries")
            .font(.custom("Helvetica Neue", size: 28).weight(.bold))
          Text(
            "Add the folders where you keep samples. Studio Time Machine builds a private catalogue and connects each sound to its Ableton history."
          )
          .font(.body)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
          .frame(maxWidth: 520)
        }

        Button("Add Sample Locations…", action: store.chooseSampleLocations)
          .buttonStyle(.borderedProminent)
          .controlSize(.large)

        VStack(alignment: .leading, spacing: 9) {
          assurance("internaldrive", "Audio stays on this Mac")
          assurance("waveform", "Only bounded file metadata is read during indexing")
          assurance("lock.shield", "Samples are never moved, rewritten, or uploaded")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }
      Spacer()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(Color(nsColor: .textBackgroundColor))
  }

  private func assurance(_ symbol: String, _ title: String) -> some View {
    Label(title, systemImage: symbol)
  }

  private var filteredRows: [SampleListRow] {
    store.sampleRows.filter(scope.includes)
  }

  private var headerDetail: String {
    let shown = store.sampleRows.count
    let total = store.sampleTotalCount
    let locations = store.sampleLocations.count
    return
      "\(shown.formatted()) of \(total.formatted()) indexed · \(locations) \(locations == 1 ? "location" : "locations") · Local and read-only"
  }

  private var locationButtonTitle: String {
    let count = store.sampleLocations.count
    return count == 1 ? "1 Location" : "\(count) Locations"
  }

  private var locationButtonSymbol: String {
    store.sampleLocations.contains(where: { $0.availability != .available })
      ? "externaldrive.badge.exclamationmark" : "externaldrive"
  }

  private var scopeSummary: String {
    let visible = filteredRows.count
    if store.sampleRows.count < store.sampleTotalCount {
      return
        "\(visible.formatted()) visible · first \(store.sampleRows.count.formatted()) of \(store.sampleTotalCount.formatted()) indexed"
    }
    return "\(visible.formatted()) visible"
  }

  private func workSummary(_ sample: SampleListRow) -> String {
    guard let count = sample.workCount else { return "Work count resolving" }
    return "\(count.formatted()) \(count == 1 ? "Work" : "Works")"
  }

  private func sphereTint(for sample: SampleListRow) -> Color {
    guard sample.availability == .available else { return .secondary }
    switch store.sampleFrequencyRegion(sample) {
    case .low: return .red
    case .mid: return .orange
    case .high: return .purple
    case nil: return .secondary
    }
  }

  private var emptyScopeTitle: String {
    switch scope {
    case .all: "No samples found"
    case .used: "No indexed usage"
    case .unavailable: "Every sample is available"
    }
  }

  private var emptyScopeSymbol: String {
    switch scope {
    case .all: "waveform"
    case .used: "link"
    case .unavailable: "checkmark.circle"
    }
  }

  private var emptyScopeDescription: String {
    switch scope {
    case .all: "The current search and indexed locations do not contain matching audio."
    case .used: "No clip-audio references match the samples in the current result set."
    case .unavailable:
      "No samples in the current result set are missing or on a disconnected location."
    }
  }
}

private struct SampleLocationsPopover: View {
  let locations: [SampleLocation]
  let addLocations: () -> Void
  let removeLocation: (SampleLocation) -> Void
  let reveal: (URL) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 4) {
        Text("Sample Locations")
          .font(.headline)
        Text("Independent from project-library roots. Overlaps are deduplicated.")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .padding(16)

      Divider()

      if locations.isEmpty {
        Text("No sample folders have been added.")
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .padding(16)
      } else {
        ForEach(locations, id: \.id) { location in
          HStack(spacing: 11) {
            Image(systemName: location.availability.symbol)
              .foregroundStyle(location.availability.tint)
              .frame(width: 20)

            VStack(alignment: .leading, spacing: 3) {
              Text(location.displayName)
                .font(.subheadline.weight(.medium))
              Text(
                "\(location.sampleCount.formatted()) samples · \(location.availability.shortTitle)"
              )
              .font(.caption)
              .foregroundStyle(.secondary)
              Text(location.fileURL.path(percentEncoded: false))
                .font(.caption2)
                .foregroundStyle(.tertiary)
                .lineLimit(1)
                .truncationMode(.middle)
            }

            Spacer()

            Menu {
              Button("Reveal in Finder") { reveal(location.fileURL) }
                .disabled(location.availability != .available)
              Divider()
              Button("Remove from Samples", role: .destructive) {
                removeLocation(location)
              }
            } label: {
              Image(systemName: "ellipsis.circle")
            }
            .menuStyle(.borderlessButton)
            .accessibilityLabel("Actions for \(location.displayName)")
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 12)

          if location.id != locations.last?.id { Divider().padding(.leading, 47) }
        }
      }

      Divider()

      Button(action: addLocations) {
        Label("Add Sample Locations…", systemImage: "plus")
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .buttonStyle(.plain)
      .padding(16)
    }
    .frame(width: 420)
  }
}

private struct SampleUsageDetailView: View {
  let sample: SampleListRow
  let occurrences: [SampleUsageOccurrence]
  let matchReviews: [SampleMatchReview]
  let audioAnalysis: SampleAudioAnalysis?
  let isAnalyzingAudio: Bool
  let isVerifyingMatches: Bool
  let usageCoverageComplete: Bool
  let isPlaying: Bool
  let amplitude: Double
  let togglePreview: () -> Void
  let analyzeAudio: () -> Void
  let verifyMatches: () -> Void
  let decideMatch: (SampleMatchReview, Bool) -> Void
  let reveal: (URL) -> Void

  @State private var usageExpanded = false
  @State private var provenanceExpanded = false
  @State private var technicalExpanded = false
  @State private var copiesExpanded = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        identity

        if let audioAnalysis {
          acousticSummary(audioAnalysis)
        } else if sample.availability == .available, !isAnalyzingAudio {
          Button("Analyse This Sample", action: analyzeAudio)
            .buttonStyle(.borderedProminent)
        }

        Divider()

        DisclosureGroup(isExpanded: $usageExpanded) {
          usageContent.padding(.top, 12)
        } label: {
          disclosureLabel(
            "Usage and channel context",
            detail:
              "\(sample.occurrenceCount.formatted()) occurrences · \(sample.sessionCount.formatted()) Sessions"
          )
        }

        Divider()

        DisclosureGroup(isExpanded: $provenanceExpanded) {
          provenanceContent.padding(.top, 12)
        } label: {
          disclosureLabel("Provenance", detail: sample.classification.shortTitle)
        }

        Divider()

        DisclosureGroup(isExpanded: $technicalExpanded) {
          technicalContent.padding(.top, 12)
        } label: {
          disclosureLabel(
            "Technical and file",
            detail: "\(sample.metadata.format.uppercased()) · \(sample.metadata.durationText)"
          )
        }

        Divider()

        DisclosureGroup(isExpanded: $copiesExpanded) {
          copiesContent.padding(.top, 12)
        } label: {
          disclosureLabel(
            "Copies and sources",
            detail: matchReviews.isEmpty
              ? "No reviewed candidates" : "\(matchReviews.count.formatted()) candidates"
          )
        }
      }
      .padding(18)
    }
    .background(Color(nsColor: .controlBackgroundColor))
  }

  private var identity: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        SampleMeshSphereView(
          tint: frequencyTint,
          isPlaying: isPlaying,
          amplitude: amplitude
        )
        .accessibilityHidden(true)
        Text(sample.name)
          .font(.title2.weight(.semibold))
          .lineLimit(3)
        Spacer()
        Button(isPlaying ? "Pause" : "Play", action: togglePreview)
          .disabled(sample.availability != .available)
        Button("Reveal", action: { reveal(sample.fileURL) })
          .disabled(sample.availability != .available)
      }

      Text("\(sample.packName) · \(sample.locationName)")
        .font(.subheadline)
        .foregroundStyle(.secondary)

      HStack(spacing: 7) {
        Circle()
          .fill(sample.availability.tint)
          .frame(width: 7, height: 7)
        Text(sample.availability.shortTitle)
          .font(.caption.weight(.medium))
        Text("·")
          .foregroundStyle(.tertiary)
        Text(workAndUseSummary)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      .accessibilityElement(children: .combine)
    }
  }

  private func acousticSummary(_ analysis: SampleAudioAnalysis) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 3) {
          Text(analysis.contentSuggestions.first?.label ?? "No confident content suggestion")
            .font(.headline)
          Text("On-device suggestion · \(analysis.contentModel)")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Spacer()
        if let confidence = analysis.contentSuggestions.first?.confidence {
          Text(confidence.formatted(.percent.precision(.fractionLength(0))))
            .font(.headline)
            .monospacedDigit()
            .help("Model score; not calibrated certainty")
        }
      }

      HStack(spacing: 8) {
        frequencyBand("Low", value: analysis.lowEnergy, color: .red)
        frequencyBand("Mid", value: analysis.midEnergy, color: .yellow)
        frequencyBand("High", value: analysis.highEnergy, color: .blue)
      }

      if analysis.contentSuggestions.count > 1 {
        HStack(spacing: 7) {
          ForEach(analysis.contentSuggestions.dropFirst()) { suggestion in
            Text(
              "\(suggestion.label) \(suggestion.confidence.formatted(.percent.precision(.fractionLength(0))))"
            )
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(.quaternary, in: Capsule())
          }
        }
      }

      Text(
        "Frequency balance is measured locally from bounded audio windows. Content labels are suggestions, never provenance."
      )
      .font(.caption)
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var frequencyTint: Color {
    guard sample.availability == .available else { return .secondary }
    switch audioAnalysis?.dominantRegion {
    case .low: return .red
    case .mid: return .orange
    case .high: return .purple
    case nil: return .secondary
    }
  }

  private var usageContent: some View {
    VStack(alignment: .leading, spacing: 14) {
      if !usageCoverageComplete {
        HStack(alignment: .top, spacing: 9) {
          Circle()
            .fill(Color.secondary)
            .frame(width: 7, height: 7)
            .padding(.top, 5)
          Text(
            "Coverage is incomplete. Zero means no use in currently indexed, available roots—not proof that this sample was never used."
          )
          .font(.caption)
          .foregroundStyle(.secondary)
        }
      }

      if occurrences.isEmpty {
        Text("No indexed clip occurrences")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      } else {
        ForEach(occurrences) { occurrence in
          occurrenceRow(occurrence)
        }
      }
    }
  }

  private var provenanceContent: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(sample.classification.shortTitle)
        .font(.subheadline.weight(.medium))
      Text(sample.classificationExplanation)
        .font(.caption)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var technicalContent: some View {
    VStack(alignment: .leading, spacing: 14) {
      Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 9) {
        technicalRow("Format", sample.metadata.format.uppercased())
        technicalRow(
          "Size",
          ByteCountFormatter.string(fromByteCount: sample.metadata.bytes, countStyle: .file))
        technicalRow("Duration", sample.metadata.durationText)
        technicalRow(
          "Sample rate", sample.metadata.sampleRate.map { "\(Int($0).formatted()) Hz" } ?? "Unknown"
        )
        technicalRow("Bit depth", sample.metadata.bitDepth.map { "\($0)-bit" } ?? "Unknown")
        technicalRow("Channels", sample.metadata.channelCount.map(String.init) ?? "Unknown")
        if let analysis = audioAnalysis {
          technicalRow(
            "Spectral centroid",
            "\(analysis.spectralCentroidHz.formatted(.number.precision(.fractionLength(0)))) Hz")
          technicalRow("Analyzer", analysis.algorithmVersion)
        }
      }

      Text(sample.fileURL.path(percentEncoded: false))
        .font(.caption)
        .foregroundStyle(.secondary)
        .textSelection(.enabled)
        .fixedSize(horizontal: false, vertical: true)

      HStack {
        Button("Reveal in Finder") { reveal(sample.fileURL) }
          .disabled(sample.availability != .available)
        Button(isAnalyzingAudio ? "Analysing…" : "Reanalyse Audio", action: analyzeAudio)
          .disabled(isAnalyzingAudio || sample.availability != .available)
      }
    }
  }

  private var copiesContent: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(
        "Filename similarity starts a review; it never proves an original. Exact identity and staged hashes remain separately explained."
      )
      .font(.caption)
      .foregroundStyle(.secondary)

      Button(
        isVerifyingMatches ? "Verifying candidates…" : "Find Verified Copies",
        action: verifyMatches
      )
      .disabled(isVerifyingMatches || sample.availability != .available)

      ForEach(matchReviews) { review in
        VStack(alignment: .leading, spacing: 8) {
          HStack {
            Text(review.candidateName)
              .font(.subheadline.weight(.medium))
              .lineLimit(1)
            Spacer()
            Text(review.evidence.relationship.shortTitle)
              .font(.caption.weight(.semibold))
          }
          Text(review.evidence.explanation)
            .font(.caption)
            .foregroundStyle(.secondary)
          if let decision = review.evidence.userDecision {
            Text(decision ? "Confirmed by you" : "Rejected by you")
              .font(.caption.weight(.medium))
          } else if review.evidence.relationship != .exactDuplicateOf {
            HStack {
              Button("Confirm") { decideMatch(review, true) }
              Button("Not a Match") { decideMatch(review, false) }
            }
            .controlSize(.small)
          }
        }
        .padding(.vertical, 8)
      }
    }
  }

  private func occurrenceRow(_ occurrence: SampleUsageOccurrence) -> some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text(occurrence.trackName)
            .font(.subheadline.weight(.semibold))
          Text("\(occurrence.sessionName) · \(occurrence.setName)")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Text(occurrence.placement.shortTitle)
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Text(occurrence.clipName)
        .font(.caption)

      let devices = occurrence.deviceChain.flatMap(flattenedDevices)
      if !devices.isEmpty {
        VStack(alignment: .leading, spacing: 5) {
          Text("Channel chain")
            .font(.caption.weight(.semibold))
          ForEach(Array(devices.enumerated()), id: \.element.id) { index, device in
            Text("\(index + 1). \(device.displayName)")
              .font(.caption)
          }
        }
      }
    }
    .padding(12)
    .background(.quaternary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .accessibilityElement(children: .combine)
  }

  private func disclosureLabel(_ title: String, detail: String) -> some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(title)
        .font(.headline)
      Text(detail)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  private func frequencyBand(_ title: String, value: Double, color: Color) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(title)
        Spacer()
        Text(value.formatted(.percent.precision(.fractionLength(0))))
          .monospacedDigit()
      }
      .font(.caption)
      GeometryReader { proxy in
        ZStack(alignment: .leading) {
          Capsule().fill(Color.primary.opacity(0.08))
          Capsule().fill(color).frame(width: proxy.size.width * value)
        }
      }
      .frame(height: 5)
    }
    .frame(maxWidth: .infinity)
  }

  private func technicalRow(_ label: String, _ value: String) -> some View {
    GridRow {
      Text(label).foregroundStyle(.secondary)
      Text(value)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .textSelection(.enabled)
    }
    .font(.caption)
  }

  private func flattenedDevices(_ device: SetDevice) -> [SetDevice] {
    [device] + device.nestedDevices.flatMap(flattenedDevices)
  }

  private var workAndUseSummary: String {
    let works =
      sample.workCount.map { "\($0.formatted()) \($0 == 1 ? "Work" : "Works")" }
      ?? "Work count unresolved"
    return "\(works) · \(sample.occurrenceCount.formatted()) occurrences"
  }
}

private struct LegacySampleUsageDetailView: View {
  let sample: SampleListRow
  let occurrences: [SampleUsageOccurrence]
  let matchReviews: [SampleMatchReview]
  let isVerifyingMatches: Bool
  let usageCoverageComplete: Bool
  let verifyMatches: () -> Void
  let decideMatch: (SampleMatchReview, Bool) -> Void
  let reveal: (URL) -> Void

  @State private var lens: SampleInspectorLens = .overview

  var body: some View {
    VStack(spacing: 0) {
      inspectorHeader

      Picker("Sample detail", selection: $lens) {
        ForEach(SampleInspectorLens.allCases) { item in
          Text(lensTitle(item)).tag(item)
        }
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      .padding(.horizontal, 18)
      .padding(.bottom, 16)

      Divider()

      ScrollView {
        Group {
          switch lens {
          case .overview: overview
          case .usage: usage
          case .copies: copies
          }
        }
        .padding(18)
      }
    }
    .background(Color(nsColor: .controlBackgroundColor))
  }

  private var inspectorHeader: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: "waveform")
          .font(.system(size: 20, weight: .medium))
          .frame(width: 42, height: 42)
          .background(.quaternary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))

        VStack(alignment: .leading, spacing: 4) {
          Text(sample.name)
            .font(.title3.weight(.semibold))
            .lineLimit(2)
          Text("\(sample.packName) · \(sample.locationName)")
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }

        Spacer()

        Button {
          reveal(sample.fileURL)
        } label: {
          Image(systemName: "arrow.right.circle")
        }
        .buttonStyle(.borderless)
        .disabled(sample.availability != .available)
        .help("Reveal Sample in Finder")
        .accessibilityLabel("Reveal Sample in Finder")
      }

      Label(sample.availability.shortTitle, systemImage: sample.availability.symbol)
        .font(.caption.weight(.medium))
        .foregroundStyle(sample.availability.tint)

      HStack(spacing: 0) {
        inspectorMetric(sample.workCount.map(String.init) ?? "—", "Works")
        metricDivider
        inspectorMetric(sample.sessionCount.formatted(), "Sessions")
        metricDivider
        inspectorMetric(sample.setCount.formatted(), "Sets")
        metricDivider
        inspectorMetric(sample.occurrenceCount.formatted(), "Uses")
      }
    }
    .padding(18)
  }

  private var overview: some View {
    VStack(alignment: .leading, spacing: 22) {
      detailSection("Provenance") {
        Label(sample.classification.shortTitle, systemImage: sample.classification.symbol)
          .font(.subheadline.weight(.medium))
        Text(sample.classificationExplanation)
          .font(.caption)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }

      detailSection("Technical") {
        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 9) {
          technicalRow("Format", sample.metadata.format.uppercased())
          technicalRow(
            "Size",
            ByteCountFormatter.string(fromByteCount: sample.metadata.bytes, countStyle: .file))
          technicalRow("Duration", sample.metadata.durationText)
          technicalRow(
            "Sample rate",
            sample.metadata.sampleRate.map { "\(Int($0).formatted()) Hz" } ?? "Unknown")
          technicalRow("Bit depth", sample.metadata.bitDepth.map { "\($0)-bit" } ?? "Unknown")
          technicalRow("Channels", sample.metadata.channelCount.map(String.init) ?? "Unknown")
          technicalRow(
            "Modified",
            sample.metadata.modifiedAt?.formatted(date: .abbreviated, time: .shortened)
              ?? "Unknown")
          technicalRow(
            "Created",
            sample.metadata.createdAt?.formatted(date: .abbreviated, time: .shortened)
              ?? "Unknown")
        }
      }

      detailSection("File") {
        Text(sample.fileURL.path(percentEncoded: false))
          .font(.caption)
          .foregroundStyle(.secondary)
          .textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
        Button("Reveal in Finder") { reveal(sample.fileURL) }
          .disabled(sample.availability != .available)
      }
    }
  }

  private var usage: some View {
    VStack(alignment: .leading, spacing: 16) {
      if !usageCoverageComplete {
        coverageNotice
      }

      if occurrences.isEmpty {
        ContentUnavailableView {
          Label("No indexed clip occurrences", systemImage: "link")
        } description: {
          Text(
            usageCoverageComplete
              ? "This sample is not referenced by any indexed Ableton clip."
              : "No occurrence is visible in the currently indexed, available roots. This is not proof that the sample was never used."
          )
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 30)
      } else {
        VStack(alignment: .leading, spacing: 4) {
          Text("Where this sample appears")
            .font(.headline)
          Text(
            "Each occurrence preserves the physical Session, Set revision, clip placement, warp evidence, and ordered channel chain."
          )
          .font(.caption)
          .foregroundStyle(.secondary)
        }

        ForEach(occurrences) { occurrence in
          occurrenceCard(occurrence)
        }
      }
    }
  }

  private var copies: some View {
    VStack(alignment: .leading, spacing: 18) {
      VStack(alignment: .leading, spacing: 6) {
        Text("Copies and possible sources")
          .font(.headline)
        Text(
          "Candidates begin as suggestions. Studio Time Machine verifies bytes in stages and never treats a similar filename as proof of origin."
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }

      Button(
        isVerifyingMatches ? "Verifying candidates…" : "Find Verified Copies",
        action: verifyMatches
      )
      .disabled(isVerifyingMatches || sample.availability != .available)

      if matchReviews.isEmpty {
        Label("No copy candidates reviewed", systemImage: "doc.on.doc")
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .padding(.vertical, 12)
      } else {
        ForEach(matchReviews) { review in
          matchReview(review)
        }
      }

      Label(
        "Exact file identity and staged hashes are high-confidence evidence. Technical metadata, dependency paths, and name or time similarity remain separately explained.",
        systemImage: "checkmark.shield"
      )
      .font(.caption)
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var coverageNotice: some View {
    HStack(alignment: .top, spacing: 10) {
      Image(systemName: "info.circle")
        .foregroundStyle(.secondary)
      VStack(alignment: .leading, spacing: 3) {
        Text("Usage coverage is incomplete")
          .font(.caption.weight(.semibold))
        Text(
          "Zero means no use in the currently indexed, available roots—not proof that this sample was never used."
        )
        .font(.caption)
        .foregroundStyle(.secondary)
      }
    }
    .padding(11)
    .background(.quaternary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  private func matchReview(_ review: SampleMatchReview) -> some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack(alignment: .firstTextBaseline) {
        Text(review.candidateName)
          .font(.subheadline.weight(.semibold))
          .lineLimit(1)
        Spacer()
        Label(
          review.evidence.relationship.shortTitle, systemImage: review.evidence.relationship.symbol
        )
        .font(.caption2.weight(.semibold))
      }

      Text(review.evidence.explanation)
        .font(.caption)
        .foregroundStyle(.secondary)

      HStack(spacing: 8) {
        Text(review.evidence.tier.shortTitle)
          .font(.caption2)
          .foregroundStyle(.secondary)
        Spacer()
        if let decision = review.evidence.userDecision {
          Label(
            decision ? "Confirmed by you" : "Rejected by you",
            systemImage: decision ? "checkmark.circle" : "xmark.circle"
          )
          .font(.caption)
        } else if review.evidence.relationship != .exactDuplicateOf {
          Button("Confirm") { decideMatch(review, true) }.controlSize(.small)
          Button("Not a Match") { decideMatch(review, false) }.controlSize(.small)
        }
      }
    }
    .padding(12)
    .background(.quaternary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
  }

  private func occurrenceCard(_ occurrence: SampleUsageOccurrence) -> some View {
    VStack(alignment: .leading, spacing: 11) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 3) {
          Text(occurrence.trackName)
            .font(.subheadline.weight(.semibold))
          Text("\(occurrence.sessionName) · \(occurrence.setName)")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Text(
          occurrence.setModifiedAt?.formatted(date: .abbreviated, time: .omitted)
            ?? "Date unknown"
        )
        .font(.caption2)
        .foregroundStyle(.secondary)
      }

      HStack(spacing: 7) {
        evidenceTag(occurrence.clipName, symbol: "rectangle.stack")
        evidenceTag(occurrence.placement.shortTitle, symbol: "timeline.selection")
        if occurrence.isWarped == true {
          evidenceTag("Warped", symbol: "waveform.path")
        }
      }

      Divider()

      VStack(alignment: .leading, spacing: 7) {
        Text("Containing-track chain")
          .font(.caption.weight(.semibold))

        if occurrence.deviceChain.isEmpty {
          Text("No devices stored on this track")
            .font(.caption)
            .foregroundStyle(.secondary)
        } else {
          let devices = occurrence.deviceChain.flatMap(flattenedDevices)
          ForEach(Array(devices.enumerated()), id: \.element.id) { index, device in
            HStack(spacing: 8) {
              Text("\(index + 1)")
                .font(.caption2)
                .monospacedDigit()
                .foregroundStyle(.secondary)
                .frame(width: 16, alignment: .trailing)
              Text(device.displayName)
                .font(.caption)
              Spacer()
            }
          }
        }
      }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.quaternary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .accessibilityElement(children: .combine)
  }

  private func evidenceTag(_ title: String, symbol: String) -> some View {
    Label(title, systemImage: symbol)
      .font(.caption2)
      .lineLimit(1)
      .padding(.horizontal, 7)
      .padding(.vertical, 4)
      .background(.quaternary, in: Capsule())
  }

  private func inspectorMetric(_ value: String, _ label: String) -> some View {
    VStack(spacing: 2) {
      Text(value)
        .font(.headline)
        .monospacedDigit()
      Text(label)
        .font(.caption2)
        .foregroundStyle(.secondary)
    }
    .frame(maxWidth: .infinity)
  }

  private var metricDivider: some View {
    Divider().frame(height: 28)
  }

  private func flattenedDevices(_ device: SetDevice) -> [SetDevice] {
    [device] + device.nestedDevices.flatMap(flattenedDevices)
  }

  private func detailSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content)
    -> some View
  {
    VStack(alignment: .leading, spacing: 9) {
      Text(title)
        .font(.headline)
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func technicalRow(_ label: String, _ value: String) -> some View {
    GridRow {
      Text(label).foregroundStyle(.secondary)
      Text(value)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .textSelection(.enabled)
    }
    .font(.caption)
  }

  private func lensTitle(_ item: SampleInspectorLens) -> String {
    switch item {
    case .overview: item.rawValue
    case .usage: "\(item.rawValue)  \(sample.occurrenceCount.formatted())"
    case .copies: "\(item.rawValue)  \(matchReviews.count.formatted())"
    }
  }
}

extension SampleClassification {
  fileprivate var shortTitle: String {
    switch self {
    case .externalLibraryOriginal: "External library resource"
    case .projectRecorded: "Project recording"
    case .projectImported: "Project imported audio"
    case .projectProcessed: "Project processed audio"
    case .collectedProjectCopy: "Verified collected copy"
    case .looseUnassigned: "Loose / unassigned audio"
    case .missingReference: "Missing reference"
    }
  }

  fileprivate var symbol: String {
    switch self {
    case .externalLibraryOriginal: "shippingbox"
    case .projectRecorded: "mic"
    case .projectImported: "square.and.arrow.down"
    case .projectProcessed: "waveform.badge.magnifyingglass"
    case .collectedProjectCopy: "doc.on.doc"
    case .looseUnassigned: "tray"
    case .missingReference: "questionmark.folder"
    }
  }
}

extension SampleAvailability {
  fileprivate var shortTitle: String {
    switch self {
    case .available: "Available"
    case .unavailable: "Location unavailable"
    case .missing: "Missing"
    case .disconnected: "Drive disconnected"
    }
  }

  fileprivate var symbol: String {
    switch self {
    case .available: "checkmark.circle"
    case .unavailable: "externaldrive.badge.exclamationmark"
    case .missing: "questionmark.folder"
    case .disconnected: "externaldrive.badge.xmark"
    }
  }

  fileprivate var tint: Color {
    switch self {
    case .available: .green
    case .unavailable: .orange
    case .missing: .red
    case .disconnected: .orange
    }
  }
}

extension SampleLocationAvailability {
  fileprivate var shortTitle: String {
    switch self {
    case .available: "Available"
    case .unavailable: "Unavailable"
    case .permissionRequired: "Permission required"
    }
  }

  fileprivate var symbol: String {
    switch self {
    case .available: "checkmark.circle"
    case .unavailable: "externaldrive.badge.xmark"
    case .permissionRequired: "lock.trianglebadge.exclamationmark"
    }
  }

  fileprivate var tint: Color {
    switch self {
    case .available: .green
    case .unavailable: .orange
    case .permissionRequired: .red
    }
  }
}

extension SampleEvidenceTier {
  fileprivate var shortTitle: String {
    switch self {
    case .exactIdentity: "Exact resource identity"
    case .stagedExactHash: "Verified file hash"
    case .technicalOrAudioFingerprint: "Technical / audio fingerprint"
    case .parsedDependencyPath: "Parsed dependency path"
    case .filenameFolderTimeSimilarity: "Filename / folder / time suggestion"
    }
  }
}

extension SampleTechnicalMetadata {
  fileprivate var durationText: String {
    guard let durationSeconds else { return "—" }
    let minutes = Int(durationSeconds) / 60
    let seconds = durationSeconds - Double(minutes * 60)
    return minutes > 0
      ? String(format: "%d:%04.1f", minutes, seconds) : String(format: "%.1fs", seconds)
  }
}

extension SetClipPlacement {
  fileprivate var shortTitle: String {
    switch self {
    case .arrangement: "Arrangement"
    case .session: "Session"
    case .takeLane: "Take lane"
    case .unknown: "Unknown placement"
    }
  }
}

extension SampleFamilyRelationship {
  fileprivate var shortTitle: String {
    switch self {
    case .exactDuplicateOf: "Exact duplicate"
    case .collectedCopyOf: "Collected copy"
    case .possibleSourceOf: "Possible source"
    case .usedBy: "Used by"
    }
  }

  fileprivate var symbol: String {
    switch self {
    case .exactDuplicateOf: "equal.circle"
    case .collectedCopyOf: "doc.on.doc"
    case .possibleSourceOf: "questionmark.diamond"
    case .usedBy: "link"
    }
  }
}
