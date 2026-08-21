import Foundation

public enum PreviewFidelity: String, Codable, Sendable {
  case existingArtifact
  case approximate
  case experimentalLiveRender
  case unavailable
}

public enum PreviewSourceKind: String, Codable, Sendable {
  case userRender
  case freeze
  case consolidated
  case recordedAudio
  case importedAudio
  case dryReconstruction
  case none
}

public enum PreviewCoverage: String, Codable, Sendable {
  case complete
  case partial
  case unsupported
}

public struct PreviewCoverageReport: Codable, Sendable, Equatable {
  public let coverage: PreviewCoverage
  public let arrangementAudioClipCount: Int
  public let availableAudioClipCount: Int
  public let midiTrackCount: Int
  public let warpedClipCount: Int
  public let missingDependencyCount: Int
  public let nativeDeviceCount: Int
  public let thirdPartyDeviceCount: Int
  public let maxForLiveDeviceCount: Int
  public let blockers: [String]

  public init(
    coverage: PreviewCoverage,
    arrangementAudioClipCount: Int,
    availableAudioClipCount: Int,
    midiTrackCount: Int,
    warpedClipCount: Int,
    missingDependencyCount: Int,
    nativeDeviceCount: Int,
    thirdPartyDeviceCount: Int,
    maxForLiveDeviceCount: Int,
    blockers: [String]
  ) {
    self.coverage = coverage
    self.arrangementAudioClipCount = arrangementAudioClipCount
    self.availableAudioClipCount = availableAudioClipCount
    self.midiTrackCount = midiTrackCount
    self.warpedClipCount = warpedClipCount
    self.missingDependencyCount = missingDependencyCount
    self.nativeDeviceCount = nativeDeviceCount
    self.thirdPartyDeviceCount = thirdPartyDeviceCount
    self.maxForLiveDeviceCount = maxForLiveDeviceCount
    self.blockers = blockers
  }
}

public struct DryPreviewSegment: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let trackID: String
  public let clipID: String
  public let sourceURL: URL
  public let startBeat: Double
  public let endBeat: Double?

  public init(
    id: String,
    trackID: String,
    clipID: String,
    sourceURL: URL,
    startBeat: Double,
    endBeat: Double?
  ) {
    self.id = id
    self.trackID = trackID
    self.clipID = clipID
    self.sourceURL = sourceURL
    self.startBeat = startBeat
    self.endBeat = endBeat
  }
}

public struct DryPreviewPlan: Codable, Sendable, Equatable {
  public let tempo: Double
  public let segments: [DryPreviewSegment]
  public let coverage: PreviewCoverageReport

  public init(tempo: Double, segments: [DryPreviewSegment], coverage: PreviewCoverageReport) {
    self.tempo = tempo
    self.segments = segments
    self.coverage = coverage
  }
}

public struct PreviewDecision: Codable, Sendable, Equatable {
  public let setID: String
  public let sourceKind: PreviewSourceKind
  public let fidelity: PreviewFidelity
  public let label: String
  public let confidence: Double
  public let asset: PreviewAsset?
  public let dryPlan: DryPreviewPlan?
  public let explanation: String

  public init(
    setID: String,
    sourceKind: PreviewSourceKind,
    fidelity: PreviewFidelity,
    label: String,
    confidence: Double,
    asset: PreviewAsset?,
    dryPlan: DryPreviewPlan?,
    explanation: String
  ) {
    self.setID = setID
    self.sourceKind = sourceKind
    self.fidelity = fidelity
    self.label = label
    self.confidence = confidence
    self.asset = asset
    self.dryPlan = dryPlan
    self.explanation = explanation
  }
}

public struct PreviewResolver: Sendable {
  public init() {}

  public func resolve(set: AbletonSet, project: StudioProject) -> PreviewDecision {
    if let asset = bestExistingAsset(for: set, assets: project.previewAssets) {
      return existingDecision(set: set, asset: asset)
    }

    let coverage = coverage(for: set)
    let dependencyByReference = Dictionary(
      grouping: set.content.dependencies,
      by: { $0.reference }
    )
    let segments = set.content.tracks.flatMap { track in
      track.clips.compactMap { clip -> DryPreviewSegment? in
        guard clip.kind == .audio, clip.placement == .arrangement,
          let reference = clip.sampleReference,
          let dependency = dependencyByReference[reference]?.first,
          dependency.availability == .available,
          let sourceURL = dependency.resolvedURL
        else { return nil }
        return DryPreviewSegment(
          id: StableID.forValue("dry-segment:\(track.id):\(clip.id)"),
          trackID: track.id,
          clipID: clip.id,
          sourceURL: sourceURL,
          startBeat: clip.startBeat ?? 0,
          endBeat: clip.endBeat
        )
      }
    }
    if !segments.isEmpty {
      return PreviewDecision(
        setID: set.id,
        sourceKind: .dryReconstruction,
        fidelity: .approximate,
        label: coverage.coverage == .complete
          ? "Approximate dry preview" : "Approximate partial preview",
        confidence: coverage.coverage == .complete ? 0.7 : 0.45,
        asset: nil,
        dryPlan: DryPreviewPlan(
          tempo: set.content.tempo ?? 120,
          segments: segments,
          coverage: coverage
        ),
        explanation:
          "This preview uses source audio without reproducing Ableton devices or full session behavior."
      )
    }

    return PreviewDecision(
      setID: set.id,
      sourceKind: .none,
      fidelity: .unavailable,
      label: "No safe preview",
      confidence: 1,
      asset: nil,
      dryPlan: nil,
      explanation: coverage.blockers.isEmpty
        ? "No existing audio artifact or resolvable Arrangement audio was found."
        : coverage.blockers.joined(separator: " ")
    )
  }

  public func coverage(for set: AbletonSet) -> PreviewCoverageReport {
    let tracks = set.content.tracks
    let clips = tracks.flatMap(\.clips).filter {
      $0.kind == .audio && $0.placement == .arrangement
    }
    let dependencies = set.content.dependencies
    let availableReferences = Set(
      dependencies.filter { $0.availability == .available }.map(\.reference)
    )
    let availableClips = clips.count(where: {
      $0.sampleReference.map(availableReferences.contains) == true
    })
    let devices = tracks.flatMap { $0.devices.flatMap(\.flattened) }
    let midiTracks = tracks.count(where: { $0.kind == .midi })
    let warped = clips.count(where: { $0.isWarped == true })
    let missing = dependencies.count(where: {
      $0.availability == .missing || $0.availability == .disconnected
    })
    let native = devices.count(where: { $0.kind == .native || $0.kind == .rack })
    let thirdParty = devices.count(where: {
      $0.kind == .audioUnit || $0.kind == .vst2 || $0.kind == .vst3
    })
    let maxForLive = devices.count(where: { $0.kind == .maxForLive })
    var blockers: [String] = []
    if midiTracks > 0 { blockers.append("MIDI instruments are omitted.") }
    if warped > 0 { blockers.append("Warped clips may not match Live.") }
    if missing > 0 { blockers.append("Some referenced audio is unavailable.") }
    if native > 0 { blockers.append("Live devices and Racks are omitted.") }
    if thirdParty > 0 { blockers.append("Third-party plug-in processing is omitted.") }
    if maxForLive > 0 { blockers.append("Max for Live devices require Live.") }

    let coverage: PreviewCoverage
    if clips.isEmpty || availableClips == 0 {
      coverage = .unsupported
    } else if availableClips == clips.count && blockers.isEmpty {
      coverage = .complete
    } else {
      coverage = .partial
    }
    return PreviewCoverageReport(
      coverage: coverage,
      arrangementAudioClipCount: clips.count,
      availableAudioClipCount: availableClips,
      midiTrackCount: midiTracks,
      warpedClipCount: warped,
      missingDependencyCount: missing,
      nativeDeviceCount: native,
      thirdPartyDeviceCount: thirdParty,
      maxForLiveDeviceCount: maxForLive,
      blockers: blockers
    )
  }

  private func bestExistingAsset(for set: AbletonSet, assets: [PreviewAsset]) -> PreviewAsset? {
    assets.max { score($0, for: set) < score($1, for: set) }
      .flatMap { score($0, for: set) >= 40 ? $0 : nil }
  }

  private func score(_ asset: PreviewAsset, for set: AbletonSet) -> Double {
    var score: Double
    if asset.isLikelyUserRender {
      score = 100
    } else {
      switch asset.category {
      case .freeze: score = 80
      case .consolidated: score = 68
      case .recorded: score = 45
      case .imported: score = 35
      case .crop, .reversed: score = 30
      case .otherAudio: score = 25
      }
    }
    let setName = normalizedName(set.displayName)
    let assetName = normalizedName(asset.fileURL.deletingPathExtension().lastPathComponent)
    if !setName.isEmpty, assetName.contains(setName) || setName.contains(assetName) {
      score += 20
    }
    if let setDate = set.modifiedAt, let assetDate = asset.modifiedAt {
      let days = abs(assetDate.timeIntervalSince(setDate)) / 86_400
      score += max(0, 15 - min(15, days / 7))
    }
    return score
  }

  private func existingDecision(set: AbletonSet, asset: PreviewAsset) -> PreviewDecision {
    let sourceKind: PreviewSourceKind
    let label: String
    if asset.isLikelyUserRender {
      sourceKind = .userRender
      label = "Existing mix or render"
    } else {
      switch asset.category {
      case .freeze:
        sourceKind = .freeze
        label = "Frozen audio"
      case .consolidated:
        sourceKind = .consolidated
        label = "Consolidated audio"
      case .recorded:
        sourceKind = .recordedAudio
        label = "Recorded audio"
      case .imported:
        sourceKind = .importedAudio
        label = "Imported audio"
      case .crop, .reversed, .otherAudio:
        sourceKind = .recordedAudio
        label = "Existing audio"
      }
    }
    return PreviewDecision(
      setID: set.id,
      sourceKind: sourceKind,
      fidelity: .existingArtifact,
      label: label,
      confidence: asset.isLikelyUserRender ? 0.85 : 0.7,
      asset: asset,
      dryPlan: nil,
      explanation:
        "This plays an existing file from the project; it is not a new render of the Set."
    )
  }

  private func normalizedName(_ value: String) -> String {
    value.lowercased().filter { $0.isLetter || $0.isNumber }
  }
}

extension SetDevice {
  fileprivate var flattened: [SetDevice] { [self] + nestedDevices.flatMap(\.flattened) }
}
