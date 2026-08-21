import StudioCore
import SwiftUI

struct SetContentView: View {
  let set: AbletonSet
  let compatibilityReport: PluginCompatibilityReport?
  let versionDiff: SetVersionDiff?
  let comparedOlderSet: AbletonSet?
  private let setMap: SetMapSnapshot
  @State private var lens: SetContentLens

  init(
    set: AbletonSet,
    compatibilityReport: PluginCompatibilityReport?,
    versionDiff: SetVersionDiff?,
    comparedOlderSet: AbletonSet?
  ) {
    self.set = set
    self.compatibilityReport = compatibilityReport
    self.versionDiff = versionDiff
    self.comparedOlderSet = comparedOlderSet
    setMap = SetMapBuilder().build(set: set)

    let arguments = ProcessInfo.processInfo.arguments
    let initialLens: SetContentLens
    if arguments.contains("--sample-project-devices") {
      initialLens = .devices
    } else if arguments.contains("--sample-project-clips") {
      initialLens = .clips
    } else if arguments.contains("--sample-project-media") {
      initialLens = .media
    } else {
      initialLens = .tracks
    }
    _lens = State(initialValue: initialLens)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .firstTextBaseline) {
        Text("Inside this Set")
          .font(.title2.weight(.semibold))
        Spacer()
        sessionSummary
      }

      if !set.content.locators.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(set.content.locators) { locator in
              Label(locator.name, systemImage: "mappin")
                .font(.caption)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.secondary.opacity(0.08), in: Capsule())
                .help("Beat \(locator.beatTime.formatted(.number.precision(.fractionLength(1))))")
            }
          }
        }
      }

      if let versionDiff, let comparedOlderSet {
        VersionDiffSummary(diff: versionDiff, olderSet: comparedOlderSet)
      }

      SetMapSnapshotView(snapshot: setMap)

      Picker("Set contents", selection: $lens) {
        ForEach(SetContentLens.allCases) { lens in
          Text(lens.title).tag(lens)
        }
      }
      .pickerStyle(.segmented)
      .labelsHidden()
      .frame(maxWidth: 520)

      Group {
        switch lens {
        case .tracks:
          TracksPanel(tracks: set.content.tracks)
        case .devices:
          DevicesPanel(tracks: set.content.tracks, compatibilityReport: compatibilityReport)
        case .clips:
          ClipsPanel(tracks: set.content.tracks)
        case .media:
          DependenciesPanel(dependencies: set.content.dependencies)
        }
      }
      .animation(.easeOut(duration: 0.18), value: lens)
    }
  }

  @ViewBuilder
  private var sessionSummary: some View {
    let tempo = set.content.tempo
    let signature = set.content.timeSignature
    if tempo != nil || signature != nil {
      HStack(spacing: 12) {
        if let tempo {
          Text(
            "\(tempo.formatted(.number.precision(.fractionLength(tempo.rounded() == tempo ? 0 : 1)))) BPM"
          )
        }
        if let signature {
          Text("\(signature.numerator)/\(signature.denominator)")
        }
      }
      .font(.callout.monospacedDigit())
      .foregroundStyle(.secondary)
    }
  }
}

private struct VersionDiffSummary: View {
  let diff: SetVersionDiff
  let olderSet: AbletonSet
  @State private var isExpanded: Bool

  init(diff: SetVersionDiff, olderSet: AbletonSet) {
    self.diff = diff
    self.olderSet = olderSet
    _isExpanded = State(
      initialValue: ProcessInfo.processInfo.arguments.contains(where: {
        $0.hasPrefix("--sample-project")
      })
    )
  }

  var body: some View {
    DisclosureGroup(isExpanded: $isExpanded) {
      if diff.hasChanges {
        VStack(alignment: .leading, spacing: 9) {
          if let tempo = diff.tempoChange {
            DiffEvidenceRow(
              symbol: "metronome",
              title: "Tempo",
              detail:
                "\(tempo.before?.formatted() ?? "Not extracted") → \(tempo.after?.formatted() ?? "Not extracted") BPM"
            )
          }
          ForEach(diff.trackChanges) { change in
            TrackDiffEvidence(change: change)
          }
          ForEach(diff.locatorChanges) { change in
            DiffEvidenceRow(
              symbol: "mappin",
              title: "\(change.kind.action) locator",
              detail: evidenceName(before: change.before?.name, after: change.after?.name)
            )
          }
          ForEach(diff.dependencyChanges) { change in
            DiffEvidenceRow(
              symbol: "waveform",
              title: "\(change.kind.action) media reference",
              detail: evidenceName(
                before: change.before?.reference.displayPath,
                after: change.after?.reference.displayPath
              )
            )
          }
        }
        .padding(.top, 10)
      }
    } label: {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: diff.hasChanges ? "clock.arrow.2.circlepath" : "equal.circle")
          .foregroundStyle(.secondary)
          .frame(width: 20)
        VStack(alignment: .leading, spacing: 5) {
          Text(
            diff.hasChanges
              ? "Changes from the previous version"
              : "No semantic changes from the previous version"
          )
          .font(.body.weight(.medium))
          Text("Compared with \(olderSet.displayName) · \(olderSet.modifiedText)")
            .font(.caption)
            .foregroundStyle(.secondary)
          if diff.hasChanges {
            Text(changeSummary)
              .font(.callout)
              .foregroundStyle(.secondary)
          }
        }
      }
    }
    .padding(.vertical, 10)
  }

  private var changeSummary: String {
    let deviceChanges = diff.trackChanges.reduce(0) { $0 + $1.deviceChanges.count }
    let clipChanges = diff.trackChanges.reduce(0) { $0 + $1.clipChanges.count }
    var parts: [String] = []
    if diff.tempoChange != nil { parts.append("tempo") }
    if !diff.trackChanges.isEmpty { parts.append("\(diff.trackChanges.count) tracks") }
    if deviceChanges > 0 { parts.append("\(deviceChanges) devices") }
    if clipChanges > 0 { parts.append("\(clipChanges) clips") }
    if !diff.dependencyChanges.isEmpty {
      parts.append("\(diff.dependencyChanges.count) media references")
    }
    return parts.joined(separator: " · ")
  }

  private func evidenceName(before: String?, after: String?) -> String {
    switch (before, after) {
    case (let before?, let after?) where before != after: "\(before) → \(after)"
    case (_, let after?): after
    case (let before?, _): before
    default: "Unnamed"
    }
  }
}

private struct TrackDiffEvidence: View {
  let change: TrackChange

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      DiffEvidenceRow(
        symbol: change.trackKind.symbol,
        title: "\(change.kind.action) track",
        detail: evidenceName
      )
      if change.mixerChanged {
        Text("Mixer state changed")
          .font(.caption)
          .foregroundStyle(.secondary)
          .padding(.leading, 32)
      }
      ForEach(change.deviceChanges) { device in
        Text(
          "\(device.kind.action) device — \(name(before: device.beforeName, after: device.afterName))\(deviceDetail(device))"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.leading, 32)
      }
      ForEach(change.clipChanges) { clip in
        Text(
          "\(clip.kind.action) clip — \(name(before: clip.beforeName, after: clip.afterName))\(clipDetail(clip))"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.leading, 32)
      }
    }
  }

  private var evidenceName: String { name(before: change.beforeName, after: change.afterName) }

  private func name(before: String?, after: String?) -> String {
    switch (before, after) {
    case (let before?, let after?) where before != after: "\(before) → \(after)"
    case (_, let after?): after.isEmpty ? "Unnamed" : after
    case (let before?, _): before.isEmpty ? "Unnamed" : before
    default: "Unnamed"
    }
  }

  private func deviceDetail(_ change: DeviceChange) -> String {
    var details: [String] = []
    if change.stateChanged { details.append("state changed") }
    if change.enabledChanged { details.append("enabled state changed") }
    return details.isEmpty ? "" : " · \(details.joined(separator: ", "))"
  }

  private func clipDetail(_ change: ClipChange) -> String {
    var details: [String] = []
    if change.timingChanged { details.append("timing changed") }
    if change.contentChanged { details.append("content changed") }
    return details.isEmpty ? "" : " · \(details.joined(separator: ", "))"
  }
}

private struct DiffEvidenceRow: View {
  let symbol: String
  let title: String
  let detail: String

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 12) {
      Image(systemName: symbol)
        .foregroundStyle(.secondary)
        .frame(width: 20)
      Text(title).font(.callout.weight(.medium))
      Text(detail).font(.callout).foregroundStyle(.secondary)
      Spacer()
    }
  }
}

private enum SetContentLens: String, CaseIterable, Identifiable {
  case tracks
  case devices
  case clips
  case media

  var id: String { rawValue }
  var title: String {
    switch self {
    case .tracks: "Tracks"
    case .devices: "Devices"
    case .clips: "Clips"
    case .media: "Media"
    }
  }
}

private struct TracksPanel: View {
  let tracks: [SetTrack]
  @State private var showsAll = false

  private var visibleTracks: [SetTrack] {
    showsAll ? tracks : Array(tracks.prefix(100))
  }

  var body: some View {
    if tracks.isEmpty {
      EvidenceEmptyState(
        title: "No track detail extracted",
        message: "The structural Set summary remains available in the inspector."
      )
    } else {
      VStack(spacing: 0) {
        ForEach(visibleTracks) { track in
          HStack(spacing: 12) {
            Image(systemName: track.kind.symbol)
              .foregroundStyle(.secondary)
              .frame(width: 20)
            VStack(alignment: .leading, spacing: 3) {
              Text(track.name.isEmpty ? track.kind.title : track.name)
                .font(.body.weight(.medium))
              Text(
                "\(track.kind.title) · \(track.devices.count) devices · \(track.clips.count) clips"
              )
              .font(.caption)
              .foregroundStyle(.secondary)
            }
            Spacer()
            MixerStateSummary(mixer: track.mixer)
          }
          .padding(.vertical, 10)
          .overlay(alignment: .bottom) { Divider().padding(.leading, 32) }
        }
        EvidenceListFooter(
          total: tracks.count, initialLimit: 100, noun: "tracks", showsAll: $showsAll)
      }
    }
  }
}

private struct MixerStateSummary: View {
  let mixer: TrackMixerState

  var body: some View {
    Label(statusText, systemImage: statusSymbol)
      .font(.caption.weight(.medium))
      .foregroundStyle(.secondary)
  }

  private var statusText: String {
    var values: [String] = []
    if let speakerOn = mixer.speakerOn {
      values.append(speakerOn ? "On" : "Off")
    }
    if mixer.isSoloed == true { values.append("Solo") }
    if mixer.isArmed == true { values.append("Armed") }
    return values.isEmpty ? "Not extracted" : values.joined(separator: " · ")
  }

  private var statusSymbol: String {
    if mixer.isArmed == true { return "record.circle" }
    if mixer.isSoloed == true { return "s.circle.fill" }
    if mixer.speakerOn == false { return "speaker.slash" }
    if mixer.speakerOn == true { return "speaker.wave.2" }
    return "questionmark.circle"
  }
}

private struct DevicesPanel: View {
  let tracks: [SetTrack]
  let compatibilityReport: PluginCompatibilityReport?
  @State private var showsAll = false

  private var devices: [DeviceNode] {
    tracks.flatMap { track in
      track.devices.flatMap { DeviceNode.flatten(device: $0, trackName: track.name) }
    }
  }

  private var visibleDevices: [DeviceNode] {
    showsAll ? devices : Array(devices.prefix(140))
  }

  var body: some View {
    if devices.isEmpty {
      EvidenceEmptyState(
        title: "No devices extracted",
        message: "No plug-in availability is inferred from an empty device list."
      )
    } else {
      VStack(spacing: 0) {
        ForEach(visibleDevices) { node in
          HStack(spacing: 11) {
            Color.clear.frame(width: CGFloat(node.depth * 18), height: 1)
            Image(systemName: node.device.kind.symbol)
              .foregroundStyle(.secondary)
              .frame(width: 20)
            VStack(alignment: .leading, spacing: 3) {
              Text(node.device.displayName)
                .font(.body.weight(.medium))
              HStack(spacing: 6) {
                Text(node.trackName)
                Text("·")
                Text(node.device.kind.title)
                if let plugin = node.device.plugin {
                  Text("·")
                  Text([plugin.manufacturer, plugin.name].compactMap { $0 }.joined(separator: " "))
                }
              }
              .font(.caption)
              .foregroundStyle(.secondary)
            }
            Spacer()
            if let evidence = compatibilityReport?.evidence.first(where: {
              $0.deviceID == node.device.id
            }) {
              Label(evidence.status.title, systemImage: evidence.status.symbol)
                .font(.caption.weight(.medium))
                .foregroundStyle(evidence.status.color)
            } else {
              Text(node.device.isEnabled == false ? "Disabled" : "Present in Set")
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
            }
          }
          .padding(.vertical, 10)
          .overlay(alignment: .bottom) { Divider().padding(.leading, 32) }
        }
        EvidenceListFooter(
          total: devices.count, initialLimit: 140, noun: "devices", showsAll: $showsAll)
      }
    }
  }
}

private struct DeviceNode: Identifiable {
  let id: String
  let device: SetDevice
  let trackName: String
  let depth: Int

  static func flatten(device: SetDevice, trackName: String, depth: Int = 0, path: String = "")
    -> [DeviceNode]
  {
    let nodePath = path.isEmpty ? device.id : "\(path)/\(device.id)"
    let node = DeviceNode(
      id: "\(trackName)/\(nodePath)",
      device: device,
      trackName: trackName,
      depth: depth
    )
    return [node]
      + device.nestedDevices.flatMap {
        flatten(device: $0, trackName: trackName, depth: depth + 1, path: nodePath)
      }
  }
}

private struct ClipsPanel: View {
  let tracks: [SetTrack]
  @State private var showsAll = false

  private var clips: [ClipNode] {
    tracks.flatMap { track in
      track.clips.map { ClipNode(id: "\(track.id)/\($0.id)", clip: $0, trackName: track.name) }
    }
  }

  private var visibleClips: [ClipNode] {
    showsAll ? clips : Array(clips.prefix(140))
  }

  var body: some View {
    if clips.isEmpty {
      EvidenceEmptyState(
        title: "No clips extracted",
        message: "This Set may still contain structural track and device evidence."
      )
    } else {
      VStack(spacing: 0) {
        ForEach(visibleClips) { node in
          HStack(spacing: 12) {
            Image(systemName: node.clip.kind == .audio ? "waveform" : "pianokeys")
              .foregroundStyle(.secondary)
              .frame(width: 20)
            VStack(alignment: .leading, spacing: 3) {
              Text(node.clip.name.isEmpty ? "Untitled clip" : node.clip.name)
                .font(.body.weight(.medium))
              Text("\(node.trackName) · \(node.clip.placement.title)")
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            if node.clip.kind == .audio {
              Text(
                node.clip.isWarped == true
                  ? "Warped · \(node.clip.warpMarkerCount) markers" : "Not warped")
            } else {
              Text("\(node.clip.midiNoteCount) MIDI notes")
            }
          }
          .font(.callout)
          .padding(.vertical, 10)
          .overlay(alignment: .bottom) { Divider().padding(.leading, 32) }
        }
        EvidenceListFooter(
          total: clips.count, initialLimit: 140, noun: "clips", showsAll: $showsAll)
      }
    }
  }
}

private struct ClipNode: Identifiable {
  let id: String
  let clip: SetClip
  let trackName: String
}

private struct DependenciesPanel: View {
  let dependencies: [MediaDependency]
  @State private var showsAll = false

  private var visibleDependencies: [MediaDependency] {
    showsAll ? dependencies : Array(dependencies.prefix(160))
  }

  var body: some View {
    if dependencies.isEmpty {
      EvidenceEmptyState(
        title: "No media dependencies extracted",
        message: "This does not imply that every external file is available."
      )
    } else {
      VStack(spacing: 0) {
        ForEach(visibleDependencies) { dependency in
          HStack(spacing: 12) {
            Image(systemName: dependency.availability.symbol)
              .foregroundStyle(dependency.availability.color)
              .frame(width: 20)
            VStack(alignment: .leading, spacing: 3) {
              Text(dependency.reference.displayPath)
                .font(.body.weight(.medium))
                .lineLimit(1)
              Text(dependency.kind == .clipAudio ? "Clip audio" : "Device resource")
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            Spacer()
            Text(dependency.availability.title)
              .font(.caption.weight(.semibold))
          }
          .padding(.vertical, 10)
          .overlay(alignment: .bottom) { Divider().padding(.leading, 32) }
          .accessibilityLabel(
            "\(dependency.reference.displayPath), \(dependency.availability.title)")
        }
        EvidenceListFooter(
          total: dependencies.count, initialLimit: 160, noun: "media references",
          showsAll: $showsAll)
      }
    }
  }
}

private struct EvidenceListFooter: View {
  let total: Int
  let initialLimit: Int
  let noun: String
  @Binding var showsAll: Bool

  var body: some View {
    if total > initialLimit {
      HStack {
        Text(
          showsAll ? "Showing all \(total) \(noun)" : "Showing \(initialLimit) of \(total) \(noun)"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        Spacer()
        Button(showsAll ? "Show First \(initialLimit)" : "Show All \(total)") {
          showsAll.toggle()
        }
        .controlSize(.small)
      }
      .padding(.vertical, 10)
    }
  }
}

private struct EvidenceEmptyState: View {
  let title: String
  let message: String

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(title).font(.body.weight(.medium))
      Text(message).font(.callout).foregroundStyle(.secondary)
    }
    .padding(.vertical, 16)
  }
}

extension SetTrackKind {
  fileprivate var title: String {
    switch self {
    case .audio: "Audio track"
    case .midi: "MIDI track"
    case .group: "Group"
    case .returnTrack: "Return"
    case .main: "Main"
    }
  }

  fileprivate var symbol: String {
    switch self {
    case .audio: "waveform"
    case .midi: "pianokeys"
    case .group: "folder"
    case .returnTrack: "arrow.uturn.backward"
    case .main: "speaker.wave.2"
    }
  }
}

extension VersionChangeKind {
  fileprivate var action: String {
    switch self {
    case .added: "Added"
    case .removed: "Removed"
    case .modified: "Modified"
    }
  }
}

extension SetDeviceKind {
  fileprivate var title: String {
    switch self {
    case .native: "Live device"
    case .audioUnit: "Audio Unit"
    case .vst2: "VST2"
    case .vst3: "VST3"
    case .maxForLive: "Max for Live"
    case .rack: "Rack"
    case .placeholder: "Placeholder"
    case .unknown: "Unknown device"
    }
  }

  fileprivate var symbol: String {
    switch self {
    case .rack: "square.stack.3d.up"
    case .audioUnit, .vst2, .vst3: "puzzlepiece.extension"
    case .maxForLive: "m.square"
    case .placeholder, .unknown: "questionmark.square.dashed"
    case .native: "slider.horizontal.3"
    }
  }
}

extension SetClipPlacement {
  fileprivate var title: String {
    switch self {
    case .arrangement: "Arrangement"
    case .session: "Session"
    case .takeLane: "Take lane"
    case .unknown: "Unknown placement"
    }
  }
}

extension MediaReference {
  fileprivate var displayPath: String {
    relativePath ?? absolutePath ?? "Unresolved media reference"
  }
}

extension MediaDependencyAvailability {
  fileprivate var title: String {
    switch self {
    case .available: "Available"
    case .missing: "Missing"
    case .disconnected: "Drive disconnected"
    case .unresolved: "Unresolved"
    }
  }

  fileprivate var symbol: String {
    switch self {
    case .available: "checkmark.circle"
    case .missing: "xmark.circle"
    case .disconnected: "externaldrive.badge.xmark"
    case .unresolved: "questionmark.circle"
    }
  }

  fileprivate var color: Color {
    switch self {
    case .available: .green
    case .missing: .red
    case .disconnected: .orange
    case .unresolved: .secondary
    }
  }
}

extension PluginCompatibilityStatus {
  fileprivate var title: String {
    switch self {
    case .installed: "Installed"
    case .missing: "Missing"
    case .versionMismatch: "Version mismatch"
    case .unknown: "Not scanned"
    }
  }

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
