import Foundation
import StudioCore

struct SampleSessionReviewFixture {
  let catalog: WorkCatalog
  let directory: StudioOrganisationDirectory
  let session: StudioSession
}

enum SampleLibrary {
  static func make() -> StudioLibraryIndex {
    let root = URL(fileURLWithPath: "/Sample Studio Archive", isDirectory: true)
    let projects = [
      project(
        root: root,
        name: "Halogen Sky",
        timelineNames: ["Halogen Sky", "Halogen Sky — Vocal Print"],
        assetNames: [
          ("Halogen Sky Mix 07.wav", PreviewAssetCategory.otherAudio, true),
          ("Freeze Bass 02.aif", .freeze, false),
          ("Vocal Comp.wav", .consolidated, false),
        ],
        seed: 1
      ),
      project(
        root: root,
        name: "Static Bloom",
        timelineNames: ["Static Bloom", "Static Bloom — Club"],
        assetNames: [
          ("Static Bloom master.wav", .otherAudio, true),
          ("Resample 14.wav", .recorded, false),
        ],
        seed: 2
      ),
      project(
        root: root,
        name: "Late Train",
        timelineNames: ["Late Train"],
        assetNames: [
          ("Late Train Demo.mp3", .otherAudio, true),
          ("Keys Reverse.aif", .reversed, false),
        ],
        seed: 3
      ),
      project(
        root: root,
        name: "Vessel Study",
        timelineNames: ["Vessel Study", "Vessel Study — Arrangement"],
        assetNames: [
          ("Vessel bounce 3.wav", .otherAudio, true),
          ("Field Recording 06.wav", .imported, false),
        ],
        seed: 4
      ),
    ]

    let looseAudio = [
      asset(
        root: root, projectName: nil, name: "Untitled Master 12.wav", category: .otherAudio,
        likelyRender: true, offset: 1),
      asset(
        root: root, projectName: nil, name: "Voice Memo — bridge.m4a", category: .otherAudio,
        likelyRender: false, offset: 2),
      asset(
        root: root, projectName: nil, name: "Drum Print 128.wav", category: .otherAudio,
        likelyRender: false, offset: 3),
    ]

    return StudioLibraryIndex(
      rootURL: root,
      scannedAt: Date(timeIntervalSince1970: 1_786_464_000),
      projects: projects,
      unassignedAudioAssets: looseAudio,
      issues: []
    )
  }

  static func makeDense() -> StudioLibraryIndex {
    let base = make()
    let additionalProjects = (5...114).map { number in
      project(
        root: base.rootURL,
        name: "Archive Project \(number.formatted(.number.precision(.integerLength(3))))",
        timelineNames: ["Archive Project \(number)"],
        assetNames: [
          ("Archive Project \(number) Mix.wav", PreviewAssetCategory.otherAudio, true)
        ],
        seed: number
      )
    }

    return StudioLibraryIndex(
      rootURL: base.rootURL,
      scannedAt: base.scannedAt,
      projects: base.projects + additionalProjects,
      unassignedAudioAssets: base.unassignedAudioAssets,
      issues: base.issues
    )
  }

  static func makeSearchCompanion() -> StudioLibraryIndex {
    let root = URL(fileURLWithPath: "/Volumes/Fixture Field Archive", isDirectory: true)
    return StudioLibraryIndex(
      rootURL: root,
      scannedAt: Date(timeIntervalSince1970: 1_786_420_800),
      projects: [
        project(
          root: root,
          name: "Dry Lead Archive",
          timelineNames: ["Dry Lead Archive"],
          assetNames: [
            ("Dry Lead Archive Mix.wav", PreviewAssetCategory.otherAudio, true)
          ],
          seed: 50
        )
      ],
      unassignedAudioAssets: [
        asset(
          root: root,
          projectName: nil,
          name: "Dry Lead Field Take.wav",
          category: .recorded,
          likelyRender: false,
          offset: 500
        )
      ],
      issues: []
    )
  }

  static func makePluginInventory() -> PluginInventory {
    PluginInventory(
      scannedAt: Date(timeIntervalSince1970: 1_786_464_000),
      scannedFormats: [.audioUnit, .vst2, .vst3],
      plugins: [
        InstalledPlugin(
          id: "sample-installed-pro-q-4",
          name: "Pro-Q 4",
          manufacturer: "FabFilter",
          format: .vst3,
          version: "4.0",
          bundleIdentifier: "com.fabfilter.Pro-Q.4",
          componentIdentifier: nil,
          bundleURL: URL(fileURLWithPath: "/Sample Plug-Ins/Pro-Q 4.vst3")
        )
      ]
    )
  }

  static func makeSessionReviewFixture(index: StudioLibraryIndex) throws
    -> SampleSessionReviewFixture
  {
    let observedAt = Date(timeIntervalSince1970: 1_786_464_000)
    guard index.projects.count >= 3 else {
      throw CocoaError(.fileReadCorruptFile)
    }

    let artist = StudioArtistRecord(
      id: "sample-review-artist",
      displayName: "Northline Archive",
      createdAt: observedAt
    )
    let likelyWork = StudioWorkRecord(
      id: "sample-review-work-static-bloom",
      artistID: artist.id,
      displayName: "Static Bloom",
      createdAt: observedAt
    )
    let runnerUpWork = StudioWorkRecord(
      id: "sample-review-work-late-train",
      artistID: artist.id,
      displayName: "Late Train",
      createdAt: observedAt
    )
    let baseDirectory = StudioOrganisationDirectory(
      artists: [artist],
      works: [likelyWork, runnerUpWork],
      sessionAssignments: [
        StudioSessionAssignment(
          sessionID: index.projects[1].id,
          workID: likelyWork.id,
          assignedAt: observedAt
        ),
        StudioSessionAssignment(
          sessionID: index.projects[2].id,
          workID: runnerUpWork.id,
          assignedAt: observedAt
        ),
      ]
    )
    let catalog = WorkCatalogResolver().resolve(
      indexes: [index],
      directory: baseDirectory,
      generatedAt: observedAt
    )
    guard
      let sourceWork = catalog.works.first(where: {
        $0.sessions.contains(where: { $0.id == index.projects[0].id })
      }),
      let sourceSession = sourceWork.sessions.first(where: { $0.id == index.projects[0].id }),
      let likelyCatalogWork = catalog.works.first(where: { $0.id == likelyWork.id }),
      let likelySession = likelyCatalogWork.sessions.first,
      let runnerUpCatalogWork = catalog.works.first(where: { $0.id == runnerUpWork.id }),
      let runnerUpSession = runnerUpCatalogWork.sessions.first,
      let sourceRevision = sourceSession.revisions.first,
      let likelyRevision = likelySession.revisions.first,
      let runnerUpRevision = runnerUpSession.revisions.first
    else {
      throw CocoaError(.fileReadCorruptFile)
    }

    let referenceResolver = StudioRevisionReferenceResolver()
    let sourceReference = try referenceResolver.capture(
      workID: sourceWork.id,
      sessionID: sourceSession.id,
      revisionID: sourceRevision.id,
      in: catalog,
      catalogueGenerationID: "sample-session-review-generation-v1",
      reviewedAt: observedAt
    ).reference
    let likelyReference = try referenceResolver.capture(
      workID: likelyCatalogWork.id,
      sessionID: likelySession.id,
      revisionID: likelyRevision.id,
      in: catalog,
      catalogueGenerationID: "sample-session-review-generation-v1",
      reviewedAt: observedAt
    ).reference
    let runnerUpReference = try referenceResolver.capture(
      workID: runnerUpCatalogWork.id,
      sessionID: runnerUpSession.id,
      revisionID: runnerUpRevision.id,
      in: catalog,
      catalogueGenerationID: "sample-session-review-generation-v1",
      reviewedAt: observedAt
    ).reference

    let likelyObservation = sessionReviewObservation(
      source: sourceReference,
      candidate: likelyReference,
      sourceContainsCandidate: 0.91,
      candidateContainsSource: 0.57,
      runnerUpMargin: 0.18,
      exactCount: 3,
      pcmCount: 4,
      excerptCount: 2,
      placementCount: 2,
      midiCount: 1,
      arrangementCount: 2,
      sourceDuration: 312,
      candidateDuration: 244,
      conflicts: [],
      explanation:
        "Most of Static Bloom's distinctive verified material appears in this later, larger Session. Common library material was excluded; this remains a review suggestion."
    )
    let runnerUpObservation = sessionReviewObservation(
      source: sourceReference,
      candidate: runnerUpReference,
      sourceContainsCandidate: 0.62,
      candidateContainsSource: 0.46,
      runnerUpMargin: 0,
      exactCount: 2,
      placementCount: 1,
      midiCount: 0,
      arrangementCount: 1,
      sourceDuration: 312,
      candidateDuration: 228,
      conflicts: [.closeRunnerUp],
      explanation:
        "Late Train shares less distinctive material and remains the runner-up. The evidence is review-only and does not establish Session identity."
    )
    let candidateGeneration = SessionContentCandidateGenerationMetadata(
      algorithmFamily: "weighted-asymmetric-minhash",
      algorithmVersion: "weighted-asymmetric-minhash-sample-v1",
      candidatePoolCount: 3,
      shortlistedCandidateCount: 2,
      exactComparisonCandidateCount: 2,
      exactComparisonCandidateLimit: 12,
      deterministicOverlapCandidateCount: 2,
      sketchBandCandidateCount: 2,
      exhaustiveFallbackUsed: false,
      parityDisposition: .guaranteed,
      sourceManifestToken: "sample-review-source-manifest-v1",
      candidatePoolToken: "sample-review-candidate-pool-v1",
      invalidationToken: "sample-review-invalidation-v1"
    )
    let ranked = [
      SessionLineageCandidateScore(
        workID: likelyWork.id,
        sessionID: likelySession.id,
        score: 0.84,
        reviewSignalCount: 4,
        observation: likelyObservation
      ),
      SessionLineageCandidateScore(
        workID: runnerUpWork.id,
        sessionID: runnerUpSession.id,
        score: 0.61,
        reviewSignalCount: 3,
        observation: runnerUpObservation
      ),
    ]
    let reviewCandidate = SessionContentReviewCandidate(
      id: "sample-session-review-candidate",
      sessionID: sourceSession.id,
      sourceWorkID: sourceWork.id,
      candidateWorkID: likelyWork.id,
      relationship: .sameWork,
      score: ranked[0].score,
      matchedAnchorIDs: likelyObservation.matchedAnchorIDs,
      explanation: likelyObservation.explanation,
      algorithmVersion: likelyObservation.algorithmVersion,
      calibrationID: nil,
      candidateGeneration: candidateGeneration,
      independentSourceMaterialCount: likelyObservation.independentSourceMaterialCount,
      observation: likelyObservation,
      observationID: "sample-session-review-observation-v1",
      decisionRecordedAt: observedAt,
      rankedCandidateEvidence: ranked
    )
    let directory = StudioOrganisationDirectory(
      artists: baseDirectory.artists,
      works: baseDirectory.works,
      sessionAssignments: baseDirectory.sessionAssignments,
      contentReviewCandidates: [reviewCandidate]
    )
    return SampleSessionReviewFixture(
      catalog: catalog,
      directory: directory,
      session: sourceSession
    )
  }

  private static func sessionReviewObservation(
    source: StudioRevisionReference,
    candidate: StudioRevisionReference,
    sourceContainsCandidate: Double,
    candidateContainsSource: Double,
    runnerUpMargin: Double,
    exactCount: Int,
    pcmCount: Int? = nil,
    excerptCount: Int? = nil,
    placementCount: Int,
    midiCount: Int,
    arrangementCount: Int,
    sourceDuration: Double,
    candidateDuration: Double,
    conflicts: [DirectionalContainmentConflict],
    explanation: String
  ) -> DirectionalSessionContainmentObservation {
    let matchedGroups = [
      DirectionalContainmentEvidenceGroup(
        family: .exact,
        sourceAnchorIDs: (1...exactCount).map { "source-exact-\($0)" },
        candidateAnchorIDs: (1...exactCount).map { "candidate-exact-\($0)" }
      ),
      DirectionalContainmentEvidenceGroup(
        family: .placement,
        sourceAnchorIDs: (1...placementCount).map { "source-placement-\($0)" },
        candidateAnchorIDs: (1...placementCount).map { "candidate-placement-\($0)" }
      ),
      DirectionalContainmentEvidenceGroup(
        family: .midiStructure,
        sourceAnchorIDs: midiCount == 0 ? [] : ["source-midi-1"],
        candidateAnchorIDs: midiCount == 0 ? [] : ["candidate-midi-1"]
      ),
      DirectionalContainmentEvidenceGroup(
        family: .arrangement,
        sourceAnchorIDs: (1...arrangementCount).map { "source-arrangement-\($0)" },
        candidateAnchorIDs: (1...arrangementCount).map { "candidate-arrangement-\($0)" }
      ),
    ]
    return DirectionalSessionContainmentObservation(
      sourceRevisionReference: source,
      candidateRevisionReference: candidate,
      sourceEvidenceScope: .fullSession,
      candidateEvidenceScope: .fullSession,
      sourceAudioDurationPolicy: .completeFile,
      candidateAudioDurationPolicy: .completeFile,
      sourceMeasuredAudioDurationSeconds: sourceDuration,
      candidateMeasuredAudioDurationSeconds: candidateDuration,
      sourceSelectedRevisionID: source.revisionID,
      candidateSelectedRevisionID: candidate.revisionID,
      algorithmFamily: "session-content-lineage",
      algorithmVersion: SessionContentLineageResolver.algorithmVersion,
      calibrationID: nil,
      sourceContainsCandidateScore: sourceContainsCandidate,
      candidateContainsSourceScore: candidateContainsSource,
      weightedIntersectionTotal: 8.4,
      sourceMatchedWeightTotal: 8.4,
      sourceWeightTotal: 9.2,
      candidateMatchedWeightTotal: 8.4,
      candidateWeightTotal: 14.7,
      arrangementScore: arrangementCount > 1 ? 0.83 : 0.52,
      matchedEvidenceGroups: matchedGroups,
      unavailableEvidenceFamilies: [
        pcmCount == nil ? .pcm : nil,
        excerptCount == nil ? .excerpt : nil,
      ].compactMap { $0 },
      suppressedAnchors: [
        DirectionalContainmentSuppressedAnchor(
          side: .source,
          anchorID: "common-library-kick",
          contentIdentity: "sample-fixture-common-library-kick",
          kind: .externalLibrarySample,
          corpusFrequency: 48,
          reason: .commonCorpusMaterial
        )
      ],
      exactEvidenceCount: exactCount,
      pcmEvidenceCount: pcmCount,
      excerptEvidenceCount: excerptCount,
      placementEvidenceCount: placementCount,
      midiStructureEvidenceCount: midiCount,
      arrangementEvidenceCount: arrangementCount,
      distinctiveAnchorCount: exactCount + placementCount + midiCount,
      distinctiveEvidenceKindCount: midiCount == 0 ? 3 : 4,
      independentSourceMaterialCount: max(2, exactCount),
      runnerUpMargin: runnerUpMargin,
      chronologyCompatibility: .compatible,
      artistCompatibility: .unknown,
      conflicts: conflicts,
      explanation: explanation
    )
  }

  private static func project(
    root: URL,
    name: String,
    timelineNames: [String],
    assetNames: [(String, PreviewAssetCategory, Bool)],
    seed: Int
  ) -> StudioProject {
    let projectRoot = root.appendingPathComponent(name, isDirectory: true)
    let timelines = timelineNames.enumerated().map { index, timelineName in
      let versions = (0..<(index == 0 ? 4 : 2)).map { version in
        set(
          projectRoot: projectRoot,
          name: timelineName,
          version: version,
          seed: seed + index
        )
      }
      return SetTimeline(
        id: "sample-timeline-\(seed)-\(index)",
        displayName: timelineName,
        versions: versions
      )
    }

    return StudioProject(
      id: "sample-project-\(seed)",
      rootURL: projectRoot,
      displayName: name,
      timelines: timelines,
      previewAssets: assetNames.enumerated().map { index, item in
        asset(
          root: root,
          projectName: name,
          name: item.0,
          category: item.1,
          likelyRender: item.2,
          offset: seed * 10 + index
        )
      }
    )
  }

  private static func set(projectRoot: URL, name: String, version: Int, seed: Int) -> AbletonSet {
    var structure = SetStructure()
    structure.audioTrackCount = 8 + seed + version
    structure.midiTrackCount = 5 + seed
    structure.groupTrackCount = 3
    structure.returnTrackCount = 4
    structure.thirdPartyDeviceCount = 12 + seed + version
    structure.maxForLiveDeviceCount = seed % 3
    structure.rackDeviceCount = 4 + seed
    structure.warpMarkerCount = 180 + (seed * 13) + version
    structure.automationEnvelopeCount = 42 + (version * 3)

    let isBackup = version > 0
    let filename = isBackup ? "\(name) [2026-08-\(10 - version) 21-0\(version)].als" : "\(name).als"
    let folder = isBackup ? projectRoot.appendingPathComponent("Backup") : projectRoot

    return AbletonSet(
      id: "sample-set-\(seed)-\(name)-\(version)",
      fileURL: folder.appendingPathComponent(filename),
      displayName: filename.replacingOccurrences(of: ".als", with: ""),
      isBackup: isBackup,
      modifiedAt: Date(
        timeIntervalSince1970: 1_786_464_000 - Double(version * 86_400 + seed * 7_200)),
      compressedBytes: Int64(5_600_000 + version * 230_000),
      xmlBytes: 28_000_000 + version * 1_100_000,
      creator: "Ableton Live 12.1",
      format: AbletonFormat(
        majorVersion: "12", minorVersion: "1", schemaChangeCount: 3, revision: "sample"),
      structure: structure,
      content: sampleContent(projectRoot: projectRoot, seed: seed, version: version)
    )
  }

  private static func sampleContent(projectRoot: URL, seed: Int, version: Int) -> AbletonSetContent
  {
    let vocalReference = MediaReference(
      absolutePath: projectRoot.appendingPathComponent("Samples/Recorded/Dry Lead.wav").path,
      relativePath: "Samples/Recorded/Dry Lead.wav"
    )
    let missingReference = MediaReference(
      absolutePath: nil,
      relativePath: "Samples/Imported/Choir Texture.wav"
    )

    let utility = SetDevice(
      id: "sample-device-utility-\(seed)",
      xmlID: "200\(seed)",
      kind: .native,
      typeName: "Utility",
      displayName: "Utility",
      isEnabled: true,
      plugin: nil,
      stateDigest: "sample-utility-\(seed)-\(version)",
      nestedDevices: [],
      resourceReferences: []
    )
    let plugin = SetDevice(
      id: "sample-device-plugin-\(seed)",
      xmlID: "201\(seed)",
      kind: .vst3,
      typeName: "PluginDevice",
      displayName: "Pro-Q 4",
      isEnabled: true,
      plugin: PluginIdentity(
        format: .vst3,
        name: "Pro-Q 4",
        manufacturer: "FabFilter",
        identifier: "com.fabfilter.Pro-Q.4",
        version: "4.0"
      ),
      stateDigest: "sample-plugin-\(seed)-\(version)",
      nestedDevices: [],
      resourceReferences: []
    )
    let synthPlugin = SetDevice(
      id: "sample-device-synth-plugin-\(seed)",
      xmlID: "203\(seed)",
      kind: .vst3,
      typeName: "PluginDevice",
      displayName: "Pro-Q 4",
      isEnabled: true,
      plugin: PluginIdentity(
        format: .vst3,
        name: "Pro-Q 4",
        manufacturer: "FabFilter",
        identifier: "com.fabfilter.Pro-Q.4",
        version: "3.0"
      ),
      stateDigest: "sample-synth-plugin-\(seed)-\(version)",
      nestedDevices: [],
      resourceReferences: []
    )
    let missingPlugin = SetDevice(
      id: "sample-device-missing-plugin-\(seed)",
      xmlID: "204\(seed)",
      kind: .vst2,
      typeName: "PluginDevice",
      displayName: "VintageVerb",
      isEnabled: true,
      plugin: PluginIdentity(
        format: .vst2,
        name: "VintageVerb",
        manufacturer: "Valhalla DSP",
        identifier: "com.valhalladsp.VintageVerb",
        version: "4.0"
      ),
      stateDigest: "sample-missing-plugin-\(seed)-\(version)",
      nestedDevices: [],
      resourceReferences: []
    )
    let rack = SetDevice(
      id: "sample-device-rack-\(seed)",
      xmlID: "202\(seed)",
      kind: .rack,
      typeName: "AudioEffectGroupDevice",
      displayName: "Vocal Control",
      isEnabled: true,
      plugin: nil,
      stateDigest: "sample-rack-\(seed)-\(version)",
      nestedDevices: [utility, plugin, missingPlugin],
      resourceReferences: []
    )

    let vocalClip = SetClip(
      id: "sample-clip-vocal-\(seed)",
      xmlID: "300\(seed)",
      kind: .audio,
      placement: .arrangement,
      name: "Dry Lead — Verse 2",
      startBeat: 65,
      endBeat: 97 + Double(version * 4),
      loopStartBeat: 0,
      loopEndBeat: 32,
      loopEnabled: false,
      isWarped: true,
      warpMode: 2,
      warpMarkerCount: 18,
      midiNoteCount: 0,
      sampleReference: vocalReference
    )
    let synthClip = SetClip(
      id: "sample-clip-synth-\(seed)",
      xmlID: "301\(seed)",
      kind: .midi,
      placement: .session,
      name: "Hook Chords",
      startBeat: 0,
      endBeat: 16,
      loopStartBeat: 0,
      loopEndBeat: 16,
      loopEnabled: true,
      isWarped: nil,
      warpMode: nil,
      warpMarkerCount: 0,
      midiNoteCount: 42,
      sampleReference: nil
    )

    let tracks = [
      SetTrack(
        id: "sample-track-vocal-\(seed)",
        xmlID: "100\(seed)",
        kind: .audio,
        name: "DRY LEAD",
        colorIndex: 13,
        groupTrackXMLID: "102\(seed)",
        isFolded: false,
        mixer: TrackMixerState(
          volume: 0.82, pan: 0, speakerOn: true, isSoloed: false, isArmed: true, monitoringMode: 0),
        devices: [rack],
        clips: [vocalClip]
      ),
      SetTrack(
        id: "sample-track-synth-\(seed)",
        xmlID: "101\(seed)",
        kind: .midi,
        name: "Juno Hook",
        colorIndex: 22,
        groupTrackXMLID: nil,
        isFolded: false,
        mixer: TrackMixerState(
          volume: 0.68, pan: -0.08, speakerOn: true, isSoloed: true, isArmed: false,
          monitoringMode: 0),
        devices: [synthPlugin],
        clips: [synthClip]
      ),
      SetTrack(
        id: "sample-track-group-\(seed)",
        xmlID: "102\(seed)",
        kind: .group,
        name: "VOCALS",
        colorIndex: 13,
        groupTrackXMLID: nil,
        isFolded: false,
        mixer: TrackMixerState(
          volume: 0.76, pan: 0, speakerOn: false, isSoloed: false, isArmed: nil, monitoringMode: nil
        ),
        devices: [utility],
        clips: []
      ),
    ]

    return AbletonSetContent(
      tempo: 124 + Double(version) * 0.5,
      timeSignature: SetTimeSignature(numerator: 4, denominator: 4),
      locators: [
        SetLocator(id: "sample-locator-verse-\(seed)", name: "Verse 2", beatTime: 65),
        SetLocator(id: "sample-locator-hook-\(seed)", name: "Final Hook", beatTime: 129),
        SetLocator(id: "sample-locator-outro-\(seed)", name: "Outro", beatTime: 193),
      ],
      tracks: tracks,
      dependencies: [
        MediaDependency(
          id: "sample-dependency-available-\(seed)",
          kind: .clipAudio,
          reference: vocalReference,
          resolvedURL: projectRoot.appendingPathComponent("Samples/Recorded/Dry Lead.wav"),
          availability: .available,
          ownerID: vocalClip.id
        ),
        MediaDependency(
          id: "sample-dependency-missing-\(seed)",
          kind: .clipAudio,
          reference: missingReference,
          resolvedURL: nil,
          availability: .missing,
          ownerID: vocalClip.id
        ),
        MediaDependency(
          id: "sample-dependency-disconnected-\(seed)",
          kind: .deviceResource,
          reference: MediaReference(
            absolutePath: "/Volumes/Fixture Samples/Impulse Responses/Hall.wav", relativePath: nil),
          resolvedURL: nil,
          availability: .disconnected,
          ownerID: rack.id
        ),
      ]
    )
  }

  private static func asset(
    root: URL,
    projectName: String?,
    name: String,
    category: PreviewAssetCategory,
    likelyRender: Bool,
    offset: Int
  ) -> PreviewAsset {
    var url = root
    if let projectName { url.appendPathComponent(projectName, isDirectory: true) }
    url.appendPathComponent(name)
    return PreviewAsset(
      id: "sample-asset-\(offset)-\(name)",
      fileURL: url,
      category: category,
      isLikelyUserRender: likelyRender,
      bytes: Int64(8_000_000 + offset * 730_000),
      modifiedAt: Date(timeIntervalSince1970: 1_786_464_000 - Double(offset * 14_400))
    )
  }
}
