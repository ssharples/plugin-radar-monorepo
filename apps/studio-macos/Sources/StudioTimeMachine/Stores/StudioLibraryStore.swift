import AppKit
import Foundation
import Observation
import StudioCore
import UniformTypeIdentifiers

@MainActor
@Observable
final class StudioLibraryStore {
  private static let sampleDatabaseUnavailableMessage =
    "The Samples database is unavailable. Restart Studio Time Machine and try again."

  private enum SessionReviewDestinationError: Error, LocalizedError {
    case missingArtist(String)
    case missingWork(artistName: String, workName: String)
    case suggestedWork

    var errorDescription: String? {
      switch self {
      case .missingArtist(let name):
        "Choose an existing virtual Artist. \(name) has not been created in Studio yet."
      case .missingWork(let artistName, let workName):
        "Choose an existing virtual Song. \(artistName) / \(workName) has not been created in Studio yet."
      case .suggestedWork:
        "Assign elsewhere must target a different Song from the active suggestion."
      }
    }
  }

  enum Phase {
    case welcome
    case indexing(URL)
    case ready(StudioLibraryIndex)
    case failed(URL?, String)
  }

  enum SessionReviewActionState: Equatable {
    case idle
    case applying(candidateID: String)
    case authoritySavedCalibrationPending(String)
    case failed(String)
  }

  var phase: Phase = .welcome
  var destination: LibraryDestination = .library
  var selectedProjectID: String?
  var selectedWorkID: String?
  var selectedWorkRevisionID: String?
  var selectedTimelineID: String?
  var selectedSetID: String?
  var selectedAssetID: String?
  var selectedChainOccurrenceID: String?
  var selectedSampleID: String?
  var searchText = "" {
    didSet {
      if destination == .samples { scheduleSampleQuery() } else { scheduleLibrarySearch() }
    }
  }
  var searchHits: [StudioSearchHit] = []
  var isSearchingLibrary = false
  var globalSearchPresented = false
  var shouldRestoreGlobalSearchTriggerFocus = false
  var globalSearchText = "" {
    didSet {
      // Invalidate published results synchronously. Return must never be able to open a result
      // produced for the text that was in the field one keystroke ago.
      globalSongHits = []
      globalEvidenceHits = []
      isSearchingGlobalEvidence = false
      scheduleGlobalSearch()
    }
  }
  var globalSearchExpanded = false
  var globalSongHits: [StudioWorkSearchHit] = []
  var globalEvidenceHits: [StudioSearchHit] = []
  var isSearchingGlobalEvidence = false
  var liveInsertText = "" {
    didSet {
      liveInsertHits = []
      scheduleLiveInsertSearch()
    }
  }
  var liveInsertHits: [StudioLiveInsertHit] = []
  var isSearchingLiveInsert = false
  var liveInsertSourceApplicationName: String?
  var inspectorPresented = false
  var issueSheetPresented = false
  var snapshotSheetPresented = false
  var isSampleLibrary = false
  var isDenseSample = false
  var registeredRoots: [RegisteredLibraryRoot] = []
  var indexingProgress: IndexingProgress?
  var lastStatistics: IndexingStatistics?
  var hasPendingLibraryChanges = false
  var pluginInventory: PluginInventory?
  var isScanningPluginInventory = false
  var syncStatus: StudioLibrarySyncStatus = .idle
  var syncMessage: String?
  var exportMessage: String?
  var latestDetectedExportBatchID: String?
  var snapshots: [SetSnapshot] = []
  var restorePlan: SetRestorePlan?
  var isExecutingRestore = false
  var lastRestoreURL: URL?
  var chainLibrary: PersonalChainLibrary?
  var isBuildingChainLibrary = false
  var audioRecoveryPlan: AudioRecoveryPlan?
  var isExecutingAudioRecovery = false
  var approximatePreviewRenderPlan: ApproximatePreviewRenderPlan?
  var isRenderingApproximatePreview = false
  var liveOpenPlan: AbletonLiveOpenPlan?
  var isDiscoveringAbletonLive = false
  var isOpeningInAbletonLive = false
  var liveBridgeMessage: String?
  var liveExportPlan: AbletonExportPlan?
  var liveExportPreflight: AbletonAutomationPreflight?
  var liveExportState: AbletonAutomationState = .idle
  var isPlanningLiveExport = false
  var isPreflightingLiveExport = false
  var isExecutingLiveExport = false
  var liveExportMessage: String?
  var lastLiveExportEvidence: AbletonExportEvidence?
  var abletonExportEvidence: [AbletonExportEvidence] = []
  var workCatalog: WorkCatalog?
  var recentWorkIDs: [String] =
    UserDefaults.standard.stringArray(forKey: "StudioTimeMachine.recentWorkIDs.v1") ?? []
  var organisationDirectory = StudioOrganisationDirectory()
  var organisationSessionToEdit: StudioSession?
  var isRebuildingOrganisation = false
  var organisationMessage: String?
  var sessionReviewActionState: SessionReviewActionState = .idle
  var recoveredAudioURLs: [URL] = []
  var recoveryMessage: String?
  var sampleLocations: [SampleLocation] = []
  var sampleRows: [SampleListRow] = []
  var sampleTotalCount = 0
  var sampleUsageCoverageComplete = false
  var sampleOccurrences: [SampleUsageOccurrence] = []
  var sampleMatchReviews: [SampleMatchReview] = []
  var isVerifyingSampleMatches = false
  var selectedSampleAudioAnalysis: SampleAudioAnalysis?
  var sampleAudioAnalysesByID: [String: SampleAudioAnalysis] = [:]
  var isAnalyzingSelectedSample = false
  var sampleStatus: SampleLibraryStatus = .idle
  var sampleSortField: SampleSortField = .name
  var sampleSortDirection: SampleSortDirection = .ascending
  var isQueryingSamples = false
  var sampleMessage: String?
  let player = AudioPreviewPlayer()

  @ObservationIgnored private let syncService: StudioLibrarySyncService
  @ObservationIgnored private let sampleService: SampleLibraryService?
  @ObservationIgnored private let organisationStore: StudioOrganisationStore
  @ObservationIgnored private let organisationOverrideStore: OrganisationOverrideStore
  @ObservationIgnored private let reviewedActionService: SessionContentReviewedActionService
  @ObservationIgnored private let isSessionReviewSample: Bool
  @ObservationIgnored private let sampleReviewStorageRoot: URL?
  @ObservationIgnored private let revisionExecutionAuthority = StudioRevisionExecutionAuthority()
  @ObservationIgnored private let sessionContentCalibration: AudioMatchingCalibration? = nil
  @ObservationIgnored private var syncEventTask: Task<Void, Never>?
  @ObservationIgnored private var sampleEventTask: Task<Void, Never>?
  @ObservationIgnored private var sampleQueryTask: Task<Void, Never>?
  @ObservationIgnored private var sampleAnalysisTask: Task<Void, Never>?
  @ObservationIgnored private var sampleFixtureOccurrences: [SampleUsageOccurrence] = []
  @ObservationIgnored private var sampleFixtureRows: [SampleListRow] = []
  @ObservationIgnored private var sampleFixtureReviews: [SampleMatchReview] = []
  @ObservationIgnored private var sampleFixtureVerifiedReviews: [SampleMatchReview] = []
  @ObservationIgnored private var chainBuildTask: Task<Void, Never>?
  @ObservationIgnored private var searchIndexTask: Task<Void, Never>?
  @ObservationIgnored private var searchTask: Task<Void, Never>?
  @ObservationIgnored private var globalSongSearchTask: Task<Void, Never>?
  @ObservationIgnored private var globalEvidenceSearchTask: Task<Void, Never>?
  @ObservationIgnored private var liveInsertSearchTask: Task<Void, Never>?
  @ObservationIgnored private var globalSongSearchGeneration = UUID()
  @ObservationIgnored private var globalEvidenceSearchGeneration = UUID()
  @ObservationIgnored private var liveInsertSearchGeneration = UUID()
  @ObservationIgnored private var librarySearchIndex: StudioSearchIndex?
  @ObservationIgnored private var liveInsertSearchIndex: StudioLiveInsertSearchIndex?
  @ObservationIgnored private var liveAutomation: AbletonAutomation?
  @ObservationIgnored private var liveExportTask: Task<Void, Never>?
  @ObservationIgnored private var organisationTask: Task<Void, Never>?
  @ObservationIgnored private var organisationGeneration = UUID()
  @ObservationIgnored private var searchableRootIndexes: [String: RootLibraryIndex] = [:]
  @ObservationIgnored private var looseAudioRootPathByAssetPath: [String: String] = [:]
  private var globallyIndexedLooseAudio: [PreviewAsset] = []
  private var rootDisplayNamesByPath: [String: String] = [:]
  private var searchIndexToken = UUID()
  private var scanToken = UUID()
  private var activeRootID: String?

  init() {
    let arguments = ProcessInfo.processInfo.arguments
    let useSessionReviewSample = arguments.contains("--sample-session-review")
    isSessionReviewSample = useSessionReviewSample

    let calibrationStore: CalibrationReviewStore
    if useSessionReviewSample {
      let temporaryRoot = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        .appendingPathComponent(
          "StudioTimeMachine-SessionReview-\(UUID().uuidString)",
          isDirectory: true
        )
      sampleReviewStorageRoot = temporaryRoot
      syncService = StudioLibrarySyncService(
        repository: StudioLibraryRepository(
          storageURL: temporaryRoot.appendingPathComponent("index-cache.json")
        ),
        snapshotStore: SnapshotStore(
          storageRoot: temporaryRoot.appendingPathComponent("Snapshots", isDirectory: true))
      )
      sampleService = try? SampleLibraryService(
        database: SampleLibraryDatabase(
          storageURL: temporaryRoot.appendingPathComponent("samples.sqlite")))
      organisationStore = StudioOrganisationStore(
        storageURL: temporaryRoot.appendingPathComponent("studio-organisation.plist"))
      organisationOverrideStore = OrganisationOverrideStore(
        storageURL: temporaryRoot.appendingPathComponent("organisation-overrides.plist"))
      calibrationStore = CalibrationReviewStore(
        storageURL: temporaryRoot.appendingPathComponent("calibration-review.plist"))
    } else {
      sampleReviewStorageRoot = nil
      if let service = try? StudioLibrarySyncService.applicationSupportService() {
        syncService = service
      } else {
        let fallbackRoot = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
          .appendingPathComponent("StudioTimeMachine", isDirectory: true)
        syncService = StudioLibrarySyncService(
          repository: StudioLibraryRepository(
            storageURL: fallbackRoot.appendingPathComponent("index-cache.json")
          ),
          snapshotStore: SnapshotStore(
            storageRoot: fallbackRoot.appendingPathComponent("Snapshots"))
        )
      }
      if let service = try? SampleLibraryService.applicationSupportService() {
        sampleService = service
      } else {
        let fallback = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
          .appendingPathComponent(
            "StudioTimeMachine-Samples-\(UUID().uuidString)", isDirectory: true
          )
          .appendingPathComponent("samples.sqlite")
        sampleService = try? SampleLibraryService(
          database: SampleLibraryDatabase(storageURL: fallback))
      }
      if let storageURL = try? StudioOrganisationStore.defaultStorageURL() {
        organisationStore = StudioOrganisationStore(storageURL: storageURL)
      } else {
        organisationStore = StudioOrganisationStore(
          storageURL: URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appending(path: "StudioTimeMachine-Organisation-\(UUID().uuidString).plist"))
      }
      if let storageURL = try? OrganisationOverrideStore.defaultStorageURL() {
        organisationOverrideStore = OrganisationOverrideStore(storageURL: storageURL)
      } else {
        organisationOverrideStore = OrganisationOverrideStore(
          storageURL: URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appending(
              path: "StudioTimeMachine-OrganisationOverrides-\(UUID().uuidString).plist"))
      }
      let calibrationURL =
        (try? CalibrationReviewStore.defaultStorageURL())
        ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
        .appending(path: "StudioTimeMachine-Calibration-\(UUID().uuidString).plist")
      calibrationStore = CalibrationReviewStore(storageURL: calibrationURL)
    }
    reviewedActionService = SessionContentReviewedActionService(
      organisationStore: organisationStore,
      calibrationStore: calibrationStore
    )

    if arguments.contains("--sample-welcome") {
      phase = .welcome
      isSampleLibrary = true
      return
    }

    if arguments.contains("--sample-indexing") {
      phase = .indexing(URL(fileURLWithPath: "/Volumes/Fixture Studio Archive", isDirectory: true))
      indexingProgress = IndexingProgress(
        phase: .parsingSets,
        completed: 144,
        total: 586,
        reused: 128
      )
      isSampleLibrary = true
      return
    }

    if arguments.contains("--sample-failure") {
      phase = .failed(
        URL(fileURLWithPath: "/Volumes/Fixture Offline Archive", isDirectory: true),
        "The drive is offline or folder access is no longer available. Reconnect it, then try again."
      )
      isSampleLibrary = true
      return
    }

    if arguments.contains(where: { $0.hasPrefix("--sample-") }) {
      let dense = arguments.contains("--sample-dense")
      let sample = dense ? SampleLibrary.makeDense() : SampleLibrary.make()
      phase = .ready(sample)
      isSampleLibrary = true
      isDenseSample = dense
      registeredRoots = [
        RegisteredLibraryRoot(
          id: "sample-root",
          fileURL: sample.rootURL,
          displayName: sample.rootURL.lastPathComponent,
          availability: .available,
          requiresBookmarkRefresh: false,
          lastScannedAt: sample.scannedAt,
          projectCount: sample.projects.count,
          setCount: sample.projects.reduce(0) { $0 + $1.sets.count }
        )
      ]
      var sampleIndexes = [RootLibraryIndex(root: registeredRoots[0], index: sample)]
      if arguments.contains("--sample-search") {
        let companion = SampleLibrary.makeSearchCompanion()
        let companionRoot = RegisteredLibraryRoot(
          id: "sample-search-companion-root",
          fileURL: companion.rootURL,
          displayName: companion.rootURL.lastPathComponent,
          availability: .available,
          requiresBookmarkRefresh: false,
          lastScannedAt: companion.scannedAt,
          projectCount: companion.projects.count,
          setCount: companion.projects.reduce(0) { $0 + $1.sets.count }
        )
        registeredRoots.append(companionRoot)
        sampleIndexes.append(RootLibraryIndex(root: companionRoot, index: companion))
      }
      prepareSearchIndex(for: sampleIndexes)
      workCatalog = WorkCatalogResolver().resolve(
        indexes: sampleIndexes.map(\.index),
        generatedAt: Date(timeIntervalSince1970: 1_786_464_000)
      )
      if arguments.contains("--sample-background-indexing") {
        isSampleLibrary = false
        syncStatus = .indexing
        indexingProgress = IndexingProgress(
          phase: .parsingSets,
          completed: 759,
          total: 760,
          reused: 759
        )
        isRebuildingOrganisation = true
      }
      if useSessionReviewSample, let storageRoot = sampleReviewStorageRoot {
        do {
          let fixture = try SampleLibrary.makeSessionReviewFixture(index: sample)
          try Self.seedSampleOrganisationDirectory(
            fixture.directory,
            storageURL: storageRoot.appendingPathComponent("studio-organisation.plist")
          )
          organisationDirectory = fixture.directory
          workCatalog = fixture.catalog
          organisationSessionToEdit = fixture.session
        } catch {
          phase = .failed(
            nil,
            "The deterministic Session review fixture could not be prepared: \(error.localizedDescription)"
          )
        }
      }
      if arguments.contains("--sample-root-states") {
        registeredRoots += [
          RegisteredLibraryRoot(
            id: "sample-offline-root",
            fileURL: URL(fileURLWithPath: "/Volumes/Fixture Field Archive", isDirectory: true),
            displayName: "Field Archive",
            availability: .unavailable,
            requiresBookmarkRefresh: false,
            lastScannedAt: Date(timeIntervalSince1970: 1_786_377_600),
            projectCount: 31,
            setCount: 84
          ),
          RegisteredLibraryRoot(
            id: "sample-permission-root",
            fileURL: URL(fileURLWithPath: "/Volumes/Fixture Collaborations", isDirectory: true),
            displayName: "Collaborations",
            availability: .permissionRequired,
            requiresBookmarkRefresh: true,
            lastScannedAt: Date(timeIntervalSince1970: 1_786_204_800),
            projectCount: 18,
            setCount: 47
          ),
        ]
      }
      pluginInventory = SampleLibrary.makePluginInventory()
      chainLibrary = ChainIntelligenceBuilder().build(index: sample, inventory: pluginInventory)
      if arguments.contains("--sample-samples") {
        destination = .samples
        let fixture = SampleSamples.make(
          project: sample.projects[0],
          playableSampleURL: Self.audioFixtureAsset(from: arguments)?.fileURL
        )
        sampleRows = fixture.rows
        sampleTotalCount = fixture.rows.count
        sampleUsageCoverageComplete = false
        sampleLocations = fixture.locations
        selectedSampleID = fixture.rows.first?.id
        sampleOccurrences = fixture.occurrences
        sampleFixtureOccurrences = fixture.occurrences
        sampleFixtureRows = fixture.rows
        sampleFixtureReviews = fixture.reviews
        sampleFixtureVerifiedReviews = fixture.verifiedReviews
        sampleMatchReviews = fixture.reviews
      }
      if let project = sample.projects.first, let set = project.sets.first {
        snapshots = [
          SetSnapshot(
            id: "sample-snapshot-current",
            projectID: project.id,
            sourceSetID: set.id,
            sourceURL: set.fileURL,
            originalFilename: set.fileURL.lastPathComponent,
            contentDigest: "sample-current-digest",
            bytes: set.compressedBytes,
            capturedAt: sample.scannedAt,
            reason: .initialIndex,
            creator: set.creator
          ),
          SetSnapshot(
            id: "sample-snapshot-stable-save",
            projectID: project.id,
            sourceSetID: set.id,
            sourceURL: set.fileURL,
            originalFilename: set.fileURL.lastPathComponent,
            contentDigest: "sample-stable-save-digest",
            bytes: set.compressedBytes,
            capturedAt: sample.scannedAt.addingTimeInterval(-86_400),
            reason: .stableSave,
            creator: set.creator
          ),
        ]
      }

      if arguments.contains("--sample-snapshots"), let project = sample.projects.first {
        selectProject(project)
        snapshotSheetPresented = true
      } else if arguments.contains("--sample-restore-plan"),
        let project = sample.projects.first,
        let snapshot = snapshots.first
      {
        selectProject(project)
        restorePlan = SetRestorePlan(
          id: "sample-restore-plan",
          snapshot: snapshot,
          operation: .restore,
          destinationURL: URL(fileURLWithPath: "/Sample Restores/Halogen Sky restored.als"),
          willCreateNewFile: true
        )
      } else if arguments.contains("--sample-recovery-plan"), let project = sample.projects.first {
        selectProject(project)
        let source = project.rootURL.appendingPathComponent("Samples/Recorded/Dry Lead.wav")
        let destinationDirectory = project.rootURL.appendingPathComponent(
          "Recovered Audio", isDirectory: true)
        audioRecoveryPlan = AudioRecoveryPlan(
          id: "sample-audio-recovery-plan",
          destinationDirectory: destinationDirectory,
          items: [
            AudioRecoveryItem(
              id: "sample-recovery-item-one",
              dependencyID: "sample-dependency-available-1",
              sourceURL: source,
              destinationURL: destinationDirectory.appendingPathComponent("Dry Lead.wav"),
              bytes: 24_800_000
            ),
            AudioRecoveryItem(
              id: "sample-recovery-item-two",
              dependencyID: "sample-dependency-available-2",
              sourceURL: project.rootURL.appendingPathComponent("Samples/Imported/Room Tone.wav"),
              destinationURL: destinationDirectory.appendingPathComponent("Room Tone.wav"),
              bytes: 8_200_000
            ),
          ]
        )
      } else if arguments.contains("--sample-approximate-plan"),
        let project = sample.projects.first,
        let set = project.sets.first,
        let track = set.content.tracks.first,
        let clip = track.clips.first,
        let sourceURL = set.content.dependencies.compactMap(\.resolvedURL).first
      {
        selectProject(project)
        approximatePreviewRenderPlan = ApproximatePreviewRenderPlan(
          setName: set.displayName,
          dryPlan: DryPreviewPlan(
            tempo: set.content.tempo ?? 120,
            segments: [
              DryPreviewSegment(
                id: "sample-approximate-segment",
                trackID: track.id,
                clipID: clip.id,
                sourceURL: sourceURL,
                startBeat: clip.startBeat ?? 0,
                endBeat: clip.endBeat
              )
            ],
            coverage: PreviewResolver().coverage(for: set)
          ),
          destinationURL: URL(
            fileURLWithPath: "/Sample Previews/\(set.displayName) Approximate Preview.wav"
          )
        )
      } else if arguments.contains("--sample-live-plan"),
        let project = sample.projects.first,
        let set = project.sets.first
      {
        selectProject(project)
        liveOpenPlan = AbletonLiveOpenPlan(
          id: "sample-live-open-plan",
          setURL: set.fileURL,
          installation: AbletonLiveInstallation(
            id: "sample-live-12",
            applicationURL: URL(
              fileURLWithPath: "/Applications/Ableton Live 12 Suite.app",
              isDirectory: true
            ),
            displayName: "Ableton Live 12 Suite",
            bundleIdentifier: "com.ableton.live",
            version: "12.2.5",
            majorVersion: 12
          ),
          explanation:
            "Open in installed Live 12, matching the Set's creator version. Export remains user-controlled in Live.",
          requiresUserControlledExport: true
        )
      } else if arguments.contains(where: { $0.hasPrefix("--sample-project") }),
        let project = sample.projects.first
      {
        selectProject(project)
      } else if arguments.contains("--sample-loose-audio") {
        destination = .looseAudio
        if let asset = sample.unassignedAudioAssets.first {
          selectAsset(asset)
        }
      } else if arguments.contains("--sample-search") {
        globalSearchPresented = true
        globalSearchText = "dry lead"
      } else if arguments.contains(where: { $0.hasPrefix("--sample-chain") }) {
        destination = .recoveredChains
      } else if arguments.contains("--sample-locations")
        || arguments.contains("--sample-root-states")
      {
        destination = .locations
      } else if arguments.contains("--sample-samples") {
        destination = .samples
      }

      if let fixtureAsset = Self.audioFixtureAsset(from: arguments) {
        player.prepare(fixtureAsset, label: "Deterministic QA fixture")
      } else if destination != .samples, player.currentAsset == nil,
        let asset = sample.projects.first?.previewAssets.first
      {
        player.prepare(asset)
      }
      return
    }

    syncEventTask = Task { [weak self] in
      guard let self else { return }
      let events = await self.syncService.events()
      for await event in events {
        guard !Task.isCancelled else { return }
        self.consume(event)
      }
    }
    if let sampleService {
      sampleEventTask = Task { [weak self] in
        guard let self else { return }
        let events = await sampleService.events()
        for await event in events {
          guard !Task.isCancelled else { return }
          self.consume(event)
        }
      }
    }
    Task { [weak self] in
      await self?.restoreCachedLibraryAndStart()
      await self?.restoreSamples()
    }
  }

  private static func audioFixtureAsset(from arguments: [String]) -> PreviewAsset? {
    let prefix = "--sample-audio-file="
    let inlinePath = arguments.first(where: { $0.hasPrefix(prefix) }).map {
      String($0.dropFirst(prefix.count))
    }
    let separatePath = arguments.firstIndex(of: "--sample-audio-file").flatMap { index in
      arguments.indices.contains(index + 1) ? arguments[index + 1] : nil
    }
    guard let path = inlinePath ?? separatePath, !path.isEmpty else { return nil }

    let url = URL(fileURLWithPath: path).standardizedFileURL
    let values = try? url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
    return PreviewAsset(
      id: "sample-audio-fixture-\(url.path)",
      fileURL: url,
      category: .recorded,
      isLikelyUserRender: false,
      bytes: Int64(values?.fileSize ?? 0),
      modifiedAt: values?.contentModificationDate ?? .distantPast
    )
  }

  private static func seedSampleOrganisationDirectory(
    _ directory: StudioOrganisationDirectory,
    storageURL: URL
  ) throws {
    struct SampleOrganisationDocument: Encodable {
      let schemaVersion = 1
      let directory: StudioOrganisationDirectory
    }

    let encoder = PropertyListEncoder()
    encoder.outputFormat = .binary
    let data = try encoder.encode(SampleOrganisationDocument(directory: directory))
    try FileManager.default.createDirectory(
      at: storageURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try data.write(to: storageURL, options: .atomic)
  }

  var library: StudioLibraryIndex? {
    if case .ready(let index) = phase { return index }
    return nil
  }

  var visibleProjects: [StudioProject] {
    guard let projects = library?.projects else { return [] }
    return projects
  }

  var visibleWorks: [StudioWork] {
    workCatalog?.works ?? []
  }

  var selectedWork: StudioWork? {
    guard let selectedWorkID else { return nil }
    return workCatalog?.works.first { $0.id == selectedWorkID }
  }

  var recentWorks: [StudioWork] {
    guard let works = workCatalog?.works else { return [] }
    let worksByID = Dictionary(uniqueKeysWithValues: works.map { ($0.id, $0) })
    return recentWorkIDs.compactMap { worksByID[$0] }
  }

  var globalSongResults: [StudioWork] {
    guard let works = workCatalog?.works else { return [] }
    let worksByID = Dictionary(uniqueKeysWithValues: works.map { ($0.id, $0) })
    return globalSongHits.compactMap { worksByID[$0.workID] }
  }

  func project(for sessionID: String) -> StudioProject? {
    if let project = library?.projects.first(where: { $0.id == sessionID }) { return project }
    for cached in searchableRootIndexes.values {
      if let project = cached.index.projects.first(where: { $0.id == sessionID }) {
        return project
      }
    }
    return nil
  }

  var availableArtistNames: [String] {
    Set(
      organisationDirectory.artists.map(\.displayName)
        + (workCatalog?.works.map(\.artist.displayName) ?? [])
        .filter { $0 != "Unknown" }
    ).sorted { $0.localizedStandardCompare($1) == .orderedAscending }
  }

  func availableWorkNames(for artistName: String) -> [String] {
    let persistedArtistIDs = Set(
      organisationDirectory.artists.filter {
        $0.displayName.caseInsensitiveCompare(artistName) == .orderedSame
      }.map(\.id))
    let persisted = organisationDirectory.works.filter {
      persistedArtistIDs.contains($0.artistID)
    }.map(\.displayName)
    let inferred =
      workCatalog?.works.filter {
        $0.artist.displayName.caseInsensitiveCompare(artistName) == .orderedSame
      }.map(\.displayName) ?? []
    return Set(persisted + inferred).sorted {
      $0.localizedStandardCompare($1) == .orderedAscending
    }
  }

  var availableReviewDestinationArtistNames: [String] {
    organisationDirectory.artists.map(\.displayName).sorted {
      $0.localizedStandardCompare($1) == .orderedAscending
    }
  }

  func availableReviewDestinationWorkNames(for artistName: String) -> [String] {
    let artistIDs = Set(
      organisationDirectory.artists.filter {
        $0.displayName.caseInsensitiveCompare(artistName) == .orderedSame
      }.map(\.id)
    )
    return organisationDirectory.works.filter {
      artistIDs.contains($0.artistID)
    }.map(\.displayName).sorted {
      $0.localizedStandardCompare($1) == .orderedAscending
    }
  }

  func contentReviewCandidates(for sessionID: String) -> [SessionContentReviewCandidate] {
    organisationDirectory.contentReviewCandidates
      .filter { $0.sessionID == sessionID }
      .sorted {
        if $0.score != $1.score { return $0.score > $1.score }
        return $0.id < $1.id
      }
  }

  func contentReviewWorkName(for workID: String) -> String {
    if let record = organisationDirectory.works.first(where: { $0.id == workID }) {
      return record.displayName
    }
    return workCatalog?.works.first(where: { $0.id == workID })?.displayName ?? "Unknown Song"
  }

  func contentReviewArtistName(for workID: String) -> String {
    if let work = organisationDirectory.works.first(where: { $0.id == workID }),
      let artist = organisationDirectory.artists.first(where: { $0.id == work.artistID })
    {
      return artist.displayName
    }
    return workCatalog?.works.first(where: { $0.id == workID })?.artist.displayName
      ?? "Unknown Artist"
  }

  func contentReviewSessionName(for sessionID: String) -> String {
    workCatalog?.sessionsByID[sessionID]?.displayName
      ?? project(for: sessionID)?.displayName
      ?? "Unknown Session"
  }

  var visibleLooseAudio: [PreviewAsset] {
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return globallyIndexedLooseAudio }
    let assetsByPath = Dictionary(
      uniqueKeysWithValues: globallyIndexedLooseAudio.map {
        ($0.fileURL.standardizedFileURL.path, $0)
      })
    return searchHits.compactMap { hit in
      guard hit.kind == .audio, let path = hit.fileURL?.standardizedFileURL.path else { return nil }
      return assetsByPath[path]
    }
  }

  var globalLooseAudioCount: Int? {
    guard library != nil || !globallyIndexedLooseAudio.isEmpty else { return nil }
    return globallyIndexedLooseAudio.count
  }

  var selectedSample: SampleListRow? {
    guard let selectedSampleID else { return nil }
    return sampleRows.first { $0.id == selectedSampleID }
  }

  var sampleSidebarDetail: String {
    if sampleStatus == .indexing { return "Indexing…" }
    if sampleLocations.isEmpty { return "Choose sample folders" }
    return "\(sampleTotalCount.formatted()) local samples"
  }

  func rootDisplayName(for rootURL: URL) -> String {
    rootDisplayNamesByPath[rootURL.standardizedFileURL.path]
      ?? rootURL.lastPathComponent
  }

  func looseAudioRootDisplayName(for asset: PreviewAsset) -> String {
    let assetPath = asset.fileURL.standardizedFileURL.path
    guard let rootPath = looseAudioRootPathByAssetPath[assetPath] else {
      return library.map { rootDisplayName(for: $0.rootURL) } ?? "Local library"
    }
    return rootDisplayNamesByPath[rootPath]
      ?? URL(fileURLWithPath: rootPath, isDirectory: true).lastPathComponent
  }

  var selectedProject: StudioProject? {
    guard let selectedProjectID else { return nil }
    return library?.projects.first { $0.id == selectedProjectID }
  }

  var selectedTimeline: SetTimeline? {
    guard let project = selectedProject else { return nil }
    if let selectedTimelineID,
      let timeline = project.timelines.first(where: { $0.id == selectedTimelineID })
    {
      return timeline
    }
    return project.timelines.first
  }

  var selectedSet: AbletonSet? {
    guard let timeline = selectedTimeline else { return nil }
    if let selectedSetID,
      let set = timeline.versions.first(where: { $0.id == selectedSetID })
    {
      return set
    }
    return timeline.versions.first
  }

  var selectedAsset: PreviewAsset? {
    guard let selectedAssetID else { return player.currentAsset }
    let projectAssets = selectedProject?.previewAssets ?? []
    return (projectAssets + (library?.unassignedAudioAssets ?? []))
      .first { $0.id == selectedAssetID }
  }

  var selectedCompatibilityReport: PluginCompatibilityReport? {
    guard let selectedSet, let pluginInventory else { return nil }
    return PluginCompatibilityEvaluator().evaluate(set: selectedSet, inventory: pluginInventory)
  }

  var selectedVersionDiff: SetVersionDiff? {
    guard let timeline = selectedTimeline, let selectedSet else { return nil }
    guard let selectedIndex = timeline.versions.firstIndex(where: { $0.id == selectedSet.id })
    else {
      return nil
    }
    let olderIndex = selectedIndex + 1
    guard timeline.versions.indices.contains(olderIndex) else { return nil }
    return SetVersionDiffer().diff(older: timeline.versions[olderIndex], newer: selectedSet)
  }

  var comparedOlderSet: AbletonSet? {
    guard let timeline = selectedTimeline, let selectedSet else { return nil }
    guard let selectedIndex = timeline.versions.firstIndex(where: { $0.id == selectedSet.id })
    else {
      return nil
    }
    let olderIndex = selectedIndex + 1
    return timeline.versions.indices.contains(olderIndex) ? timeline.versions[olderIndex] : nil
  }

  var selectedPreviewDecision: PreviewDecision? {
    guard let selectedSet, let selectedProject else { return nil }
    return PreviewResolver().resolve(set: selectedSet, project: selectedProject)
  }

  var selectedProjectSnapshots: [SetSnapshot] {
    guard let selectedProjectID else { return [] }
    return snapshots.filter { $0.projectID == selectedProjectID }
  }

  var visibleChainOccurrences: [ChainOccurrence] {
    chainLibrary?.search(searchText) ?? []
  }

  var visibleChainFamilies: [ChainFamily] {
    guard let families = chainLibrary?.families else { return [] }
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return families }
    let matchingIDs = Set(chainLibrary?.search(query).map(\.signature) ?? [])
    return families.filter {
      $0.displayName.localizedCaseInsensitiveContains(query) || matchingIDs.contains($0.signature)
    }
  }

  var visiblePluginUsage: [PluginUsageStatistic] {
    guard let usage = chainLibrary?.pluginUsage else { return [] }
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return usage }
    return usage.filter {
      $0.plugin.name?.localizedCaseInsensitiveContains(query) == true
        || $0.plugin.manufacturer?.localizedCaseInsensitiveContains(query) == true
        || $0.trackNames.contains(where: { $0.localizedCaseInsensitiveContains(query) })
    }
  }

  var selectedChainOccurrence: ChainOccurrence? {
    guard let selectedChainOccurrenceID else { return nil }
    return chainLibrary?.occurrences.first { $0.id == selectedChainOccurrenceID }
  }

  var selectedSetAvailableClipAudioCount: Int {
    selectedSet?.content.dependencies.count {
      $0.kind == .clipAudio && $0.availability == .available
    } ?? 0
  }

  var noticeMessage: String? {
    exportMessage ?? organisationMessage ?? sampleMessage ?? recoveryMessage ?? liveBridgeMessage
      ?? syncMessage
  }

  var noticeActionTitle: String? {
    exportMessage != nil && latestDetectedExportBatchID != nil ? "Reveal in Finder" : nil
  }

  var selectedFileURL: URL? {
    if let selectedAsset, selectedAssetID != nil { return selectedAsset.fileURL }
    if let selectedSet { return selectedSet.fileURL }
    if let selectedProject { return selectedProject.rootURL }
    return nil
  }

  func chooseLibraryFolder() {
    let panel = NSOpenPanel()
    panel.title = "Add an Ableton folder to Studio"
    panel.message = "Studio Time Machine reads this folder without changing any projects or audio."
    panel.prompt = "Add to Studio"
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    panel.canCreateDirectories = false

    guard panel.runModal() == .OK, let url = panel.url else { return }
    let bookmark = try? url.bookmarkData(
      options: .withSecurityScope,
      includingResourceValuesForKeys: nil,
      relativeTo: nil
    )
    indexFolder(url, bookmark: bookmark)
  }

  func indexFolder(_ url: URL, bookmark: Data? = nil) {
    let token = UUID()
    scanToken = token
    phase = .indexing(url)
    indexingProgress = IndexingProgress(phase: .discovering, completed: 0, total: 1)
    lastStatistics = nil
    hasPendingLibraryChanges = false
    isSampleLibrary = false
    destination = .library
    searchText = ""
    clearSelection()

    Task {
      do {
        await syncService.stopMonitoring()
        let root = try await syncService.registerRoot(url, securityScopedBookmark: bookmark)
        activeRootID = root.id
        registeredRoots = try await syncService.registeredRoots()

        try await syncService.startMonitoring()
        _ = try await syncService.scanAll(snapshotReason: .initialIndex)

        guard scanToken == token else { return }
        registeredRoots = try await syncService.registeredRoots()
        await refreshGlobalSearchIndex()
        snapshots = (try? await syncService.snapshots()) ?? snapshots
        scanInstalledPlugins()
      } catch {
        guard scanToken == token else { return }
        indexingProgress = nil
        registeredRoots = (try? await syncService.registeredRoots()) ?? registeredRoots
        let cachedIndexes = (try? await syncService.cachedIndexes()) ?? []
        if let cached = cachedIndexes.first(where: { $0.root.id == activeRootID }) {
          activate(cached)
          prepareSearchIndex(for: cachedIndexes)
          await rebuildWorkCatalog(from: cachedIndexes)
          syncMessage = error.localizedDescription
        } else {
          phase = .failed(url, error.localizedDescription)
        }
      }
    }
  }

  func rescan() {
    guard library != nil else {
      chooseLibraryFolder()
      return
    }
    indexingProgress = IndexingProgress(phase: .discovering, completed: 0, total: 1)
    hasPendingLibraryChanges = false
    Task {
      do {
        _ = try await syncService.scanAll(snapshotReason: .manual)
      } catch {
        indexingProgress = nil
        syncMessage = "Library update could not finish: \(error.localizedDescription)"
      }
    }
  }

  func loadCachedRoot(_ root: RegisteredLibraryRoot) {
    Task {
      do {
        let cachedIndexes = try await syncService.cachedIndexes()
        guard let cached = cachedIndexes.first(where: { $0.root.id == root.id })
        else {
          if root.availability == .available { indexFolder(root.fileURL) }
          return
        }
        activate(cached)
        prepareSearchIndex(for: cachedIndexes)
        await rebuildWorkCatalog(from: cachedIndexes)
        destination = .library
        clearSelection()
        if registeredRoots.contains(where: { $0.availability == .available }) {
          try? await syncService.startMonitoring()
        }
        scanInstalledPlugins()
      } catch {
        phase = .failed(root.fileURL, error.localizedDescription)
      }
    }
  }

  func showLibrary() {
    destination = .library
    searchText = ""
    selectedWorkID = nil
    selectedProjectID = nil
    selectedTimelineID = nil
    selectedSetID = nil
    selectedAssetID = nil
    selectedChainOccurrenceID = nil
  }

  func navigate(to destination: LibraryDestination) {
    self.destination = destination
    searchText = ""
    selectedWorkID = nil
    selectedProjectID = nil
    selectedTimelineID = nil
    selectedSetID = nil
    selectedAssetID = nil
    selectedChainOccurrenceID = nil
    if destination != .samples {
      selectedSampleID = nil
      sampleOccurrences = []
      sampleMatchReviews = []
    } else {
      scheduleSampleQuery()
    }
    inspectorPresented = false
  }

  func chooseSampleLocations() {
    guard let sampleService else {
      sampleMessage = Self.sampleDatabaseUnavailableMessage
      return
    }
    let panel = NSOpenPanel()
    panel.title = "Choose sample library locations"
    panel.message =
      "Studio Time Machine recursively indexes audio metadata without changing sample files."
    panel.prompt = "Add Locations"
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = true
    panel.canCreateDirectories = false
    guard panel.runModal() == .OK else { return }

    Task {
      do {
        for url in panel.urls {
          let bookmark = try? url.bookmarkData(
            options: [.withSecurityScope, .securityScopeAllowOnlyReadAccess],
            includingResourceValuesForKeys: nil,
            relativeTo: nil)
          _ = try await sampleService.registerLocation(url, securityScopedBookmark: bookmark)
        }
        sampleLocations = try await sampleService.locations()
        try await sampleService.start(
          projectRoots: searchableRootIndexes.values.flatMap { $0.index.projects.map(\.rootURL) })
        await refreshSampleUsage()
        scheduleSampleQuery()
      } catch {
        sampleMessage = error.localizedDescription
      }
    }
  }

  func removeSampleLocation(_ location: SampleLocation) {
    guard let sampleService else {
      sampleMessage = Self.sampleDatabaseUnavailableMessage
      return
    }
    Task {
      do {
        try await sampleService.removeLocation(id: location.id)
        sampleLocations = try await sampleService.locations()
        try await sampleService.startMonitoring()
        scheduleSampleQuery()
      } catch {
        sampleMessage = error.localizedDescription
      }
    }
  }

  func rescanSamples() {
    guard let sampleService else {
      sampleMessage = Self.sampleDatabaseUnavailableMessage
      return
    }
    Task {
      do {
        _ = try await sampleService.scanAll()
        await refreshSampleUsage()
        scheduleSampleQuery()
      } catch {
        sampleMessage = error.localizedDescription
      }
    }
  }

  func setSampleSort(field: SampleSortField, direction: SampleSortDirection) {
    sampleSortField = field
    sampleSortDirection = direction
    scheduleSampleQuery()
  }

  func selectSample(id: String?) {
    selectedSampleID = id
    sampleMatchReviews = []
    selectedSampleAudioAnalysis = nil
    sampleAnalysisTask?.cancel()
    guard let id else { return }
    if isSampleLibrary {
      sampleOccurrences = sampleFixtureOccurrences.filter { $0.sampleID == id }
      sampleMatchReviews = sampleFixtureReviews.filter {
        $0.evidence.sourceSampleID == id || $0.evidence.targetSampleID == id
      }
      if let sample = sampleFixtureRows.first(where: { $0.id == id }) {
        let analysis = Self.sampleFixtureAnalysis(for: sample)
        selectedSampleAudioAnalysis = analysis
        sampleAudioAnalysesByID[id] = analysis
      }
      return
    }
    sampleOccurrences = []
    guard let sampleService else {
      sampleMessage = Self.sampleDatabaseUnavailableMessage
      return
    }
    Task {
      do {
        sampleOccurrences = try await sampleService.occurrences(for: id)
        sampleMatchReviews = try await sampleService.matchReviews(for: id)
      } catch {
        sampleMessage = error.localizedDescription
      }
    }
    analyzeSelectedSample()
  }

  func toggleSamplePreview(_ sample: SampleListRow) {
    let asset = samplePreviewAsset(for: sample)
    if player.currentAsset?.fileURL.standardizedFileURL != sample.fileURL.standardizedFileURL {
      player.prepare(asset, label: sample.name)
    }
    player.requestWaveform(for: asset, sampleCount: 512)
    player.toggle(asset)
  }

  func isSamplePreviewPlaying(_ sample: SampleListRow) -> Bool {
    player.isPlaying
      && player.currentAsset?.fileURL.standardizedFileURL == sample.fileURL.standardizedFileURL
  }

  func samplePreviewAmplitude(_ sample: SampleListRow) -> Double {
    isSamplePreviewPlaying(sample) ? player.currentAmplitude : 0
  }

  func sampleFrequencyRegion(_ sample: SampleListRow) -> SampleFrequencyRegion? {
    sampleAudioAnalysesByID[sample.id]?.dominantRegion
  }

  private func samplePreviewAsset(for sample: SampleListRow) -> PreviewAsset {
    PreviewAsset(
      id: "sample-preview-\(sample.id)",
      fileURL: sample.fileURL,
      category: samplePreviewCategory(for: sample.classification),
      isLikelyUserRender: false,
      bytes: sample.metadata.bytes,
      modifiedAt: sample.metadata.modifiedAt
    )
  }

  private func samplePreviewCategory(for classification: SampleClassification)
    -> PreviewAssetCategory
  {
    switch classification {
    case .projectRecorded: .recorded
    case .projectImported, .collectedProjectCopy: .imported
    case .projectProcessed: .consolidated
    case .externalLibraryOriginal, .looseUnassigned, .missingReference: .otherAudio
    }
  }

  func analyzeSelectedSample(force: Bool = false) {
    guard let selectedSample, selectedSample.availability == .available else { return }
    guard let sampleService else {
      sampleMessage = Self.sampleDatabaseUnavailableMessage
      return
    }
    sampleAnalysisTask?.cancel()
    isAnalyzingSelectedSample = true
    sampleAnalysisTask = Task { [weak self] in
      defer { self?.isAnalyzingSelectedSample = false }
      do {
        let analysis = try await sampleService.audioAnalysis(for: selectedSample, force: force)
        guard !Task.isCancelled, self?.selectedSampleID == selectedSample.id else { return }
        self?.selectedSampleAudioAnalysis = analysis
        self?.sampleAudioAnalysesByID[selectedSample.id] = analysis
      } catch is CancellationError {
      } catch {
        guard !Task.isCancelled else { return }
        self?.sampleMessage = error.localizedDescription
      }
    }
  }

  func verifySelectedSampleMatches() {
    guard let selectedSampleID, !isVerifyingSampleMatches else { return }
    if isSampleLibrary {
      sampleMatchReviews = sampleFixtureVerifiedReviews.filter {
        $0.evidence.sourceSampleID == selectedSampleID
          || $0.evidence.targetSampleID == selectedSampleID
      }
      return
    }
    guard let sampleService else {
      sampleMessage = Self.sampleDatabaseUnavailableMessage
      return
    }
    isVerifyingSampleMatches = true
    Task {
      defer { isVerifyingSampleMatches = false }
      do {
        sampleMatchReviews = try await sampleService.verifyCopyCandidates(for: selectedSampleID)
        scheduleSampleQuery()
      } catch {
        sampleMessage = error.localizedDescription
      }
    }
  }

  func decideSampleMatch(_ review: SampleMatchReview, accepted: Bool) {
    if isSampleLibrary {
      sampleMatchReviews = sampleMatchReviews.map { item in
        guard item.id == review.id else { return item }
        return SampleMatchReview(
          evidence: SampleFamilyEvidence(
            id: item.evidence.id, sourceSampleID: item.evidence.sourceSampleID,
            targetSampleID: item.evidence.targetSampleID,
            relationship: item.evidence.relationship, score: item.evidence.score,
            tier: item.evidence.tier, explanation: item.evidence.explanation,
            algorithmVersion: item.evidence.algorithmVersion, userDecision: accepted),
          candidateName: item.candidateName, candidateURL: item.candidateURL,
          candidateClassification: item.candidateClassification)
      }
      return
    }
    guard let sampleService else {
      sampleMessage = Self.sampleDatabaseUnavailableMessage
      return
    }
    Task {
      do {
        try await sampleService.saveReviewDecision(
          evidenceID: review.evidence.id, accepted: accepted)
        if let selectedSampleID {
          sampleMatchReviews = try await sampleService.matchReviews(for: selectedSampleID)
        }
      } catch {
        sampleMessage = error.localizedDescription
      }
    }
  }

  func selectProject(_ project: StudioProject) {
    selectedProjectID = project.id
    selectedAssetID = nil
    selectedChainOccurrenceID = nil
    selectInitialVersion(for: project)
    inspectorPresented = false
  }

  func selectWork(_ work: StudioWork) {
    if selectedWorkID != work.id {
      selectedWorkRevisionID = nil
    }
    destination = .library
    searchText = ""
    selectedWorkID = work.id
    selectedProjectID = nil
    selectedTimelineID = nil
    selectedSetID = nil
    selectedAssetID = nil
    selectedChainOccurrenceID = nil
    inspectorPresented = false
    rememberRecentWork(work.id)
  }

  func openRevision(_ revision: StudioSetRevision, in session: StudioSession) {
    let owningRoot = owningRoot(for: revision, in: session)
    if let owningRoot { activate(owningRoot) }
    guard
      let project =
        owningRoot?.index.projects.first(where: { $0.id == session.id })
        ?? project(for: session.id)
    else { return }
    selectedWorkRevisionID = revision.id
    selectedWorkID = selectedWork?.id
    selectedProjectID = project.id
    selectedTimelineID =
      project.timelines.first(where: {
        $0.versions.contains(where: { $0.id == revision.set.id })
      })?.id ?? project.timelines.first?.id
    selectedSetID = revision.set.id
    selectedAssetID = nil
    inspectorPresented = false
  }

  func returnToSelectedWork() {
    selectedProjectID = nil
    selectedTimelineID = nil
    selectedSetID = nil
    selectedAssetID = nil
    inspectorPresented = false
  }

  private func rememberRecentWork(_ workID: String) {
    recentWorkIDs.removeAll { $0 == workID }
    recentWorkIDs.insert(workID, at: 0)
    if recentWorkIDs.count > 8 {
      recentWorkIDs.removeLast(recentWorkIDs.count - 8)
    }
    UserDefaults.standard.set(
      recentWorkIDs,
      forKey: "StudioTimeMachine.recentWorkIDs.v1"
    )
  }

  func editOrganisation(for session: StudioSession) {
    organisationMessage = nil
    sessionReviewActionState = .idle
    organisationSessionToEdit = session
  }

  func applyContentReviewAction(
    _ action: SessionContentReviewedAction,
    to candidate: SessionContentReviewCandidate
  ) {
    guard !isApplyingContentReview else { return }
    guard let expectedObservation = reviewObservationSnapshot(for: candidate) else { return }
    sessionReviewActionState = .applying(candidateID: candidate.id)
    Task {
      await performContentReviewAction(
        action,
        candidate: candidate,
        expectedObservation: expectedObservation
      )
    }
  }

  func assignContentReviewCandidateElsewhere(
    _ candidate: SessionContentReviewCandidate,
    artistName: String,
    workName: String
  ) {
    guard !isApplyingContentReview else { return }
    let cleanArtist = artistName.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanWork = workName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleanArtist.isEmpty, !cleanWork.isEmpty else {
      recordSessionReviewFailure(
        "Choose an existing Artist and Song before assigning elsewhere.")
      return
    }
    guard let expectedObservation = reviewObservationSnapshot(for: candidate) else { return }

    sessionReviewActionState = .applying(candidateID: candidate.id)
    Task {
      do {
        let work = try await existingReviewDestination(
          artistName: cleanArtist,
          workName: cleanWork,
          candidate: candidate,
          expectedObservation: expectedObservation
        )
        await performContentReviewAction(
          .assignElsewhere(workID: work.id),
          candidate: candidate,
          expectedObservation: expectedObservation
        )
      } catch {
        recordSessionReviewFailure(error.localizedDescription)
      }
    }
  }

  var isApplyingContentReview: Bool {
    if case .applying = sessionReviewActionState { return true }
    return false
  }

  func assignSession(
    _ session: StudioSession,
    artistName: String,
    workName: String
  ) {
    let cleanArtist = artistName.trimmingCharacters(in: .whitespacesAndNewlines)
    let cleanWork = workName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !cleanArtist.isEmpty, !cleanWork.isEmpty else {
      organisationMessage = "Choose or create both an Artist and a Song."
      return
    }
    Task {
      do {
        var directory = try await organisationStore.load()
        let artist: StudioArtistRecord
        if let existing = directory.artists.first(where: {
          $0.displayName.caseInsensitiveCompare(cleanArtist) == .orderedSame
        }) {
          artist = existing
        } else {
          artist = try await organisationStore.createArtist(displayName: cleanArtist)
          directory = try await organisationStore.load()
        }
        let work: StudioWorkRecord
        if let existing = directory.works.first(where: {
          $0.artistID == artist.id
            && $0.displayName.caseInsensitiveCompare(cleanWork) == .orderedSame
        }) {
          work = existing
        } else {
          work = try await organisationStore.createWork(
            artistID: artist.id, displayName: cleanWork)
        }
        _ = try await organisationStore.assign(sessionID: session.id, to: work.id)
        try await refreshOrganisationTruth()
        organisationSessionToEdit = nil
        organisationMessage =
          "Assigned \(session.displayName) to \(artist.displayName) — \(work.displayName). No files were moved."
        selectedWorkID = work.id
      } catch {
        sessionReviewActionState = .failed(error.localizedDescription)
        organisationMessage = error.localizedDescription
      }
    }
  }

  private func performContentReviewAction(
    _ action: SessionContentReviewedAction,
    candidate: SessionContentReviewCandidate,
    expectedObservation: CalibrationObservationSnapshot
  ) async {
    let decisionID = "session-content-review-\(UUID().uuidString)"
    do {
      _ = try await reviewedActionService.apply(
        SessionContentReviewedActionRequest(
          reviewCandidateID: candidate.id,
          expectedObservation: expectedObservation,
          action: action,
          decisionID: decisionID,
          notes: "Reviewed in Organise Session"
        ))
      try await refreshOrganisationTruth()
      organisationMessage = reviewedActionSuccessMessage(action, candidate: candidate)
      sessionReviewActionState = .idle
      organisationSessionToEdit = nil
    } catch {
      let refreshedDirectory = try? await organisationStore.load()
      if let refreshedDirectory { organisationDirectory = refreshedDirectory }
      let authorityWasSaved =
        refreshedDirectory?.pendingCalibrationReviewActions.contains(where: {
          $0.decisionID == decisionID
        }) == true
      if authorityWasSaved {
        try? await refreshOrganisationTruth()
        let message =
          "Your organisation choice is saved and authoritative. Its private calibration label is still pending: \(error.localizedDescription)"
        sessionReviewActionState = .authoritySavedCalibrationPending(message)
        organisationMessage = message
      } else {
        recordSessionReviewFailure(error.localizedDescription)
      }
    }
  }

  private func reviewObservationSnapshot(
    for candidate: SessionContentReviewCandidate
  ) -> CalibrationObservationSnapshot? {
    let snapshot = CalibrationObservationSnapshot.from(reviewCandidate: candidate)
    guard snapshot.hasTruthfulProvenance else {
      recordSessionReviewFailure(
        "The displayed content observation is incomplete. No organisation or calibration action was saved."
      )
      return nil
    }
    return snapshot
  }

  private func existingReviewDestination(
    artistName: String,
    workName: String,
    candidate: SessionContentReviewCandidate,
    expectedObservation: CalibrationObservationSnapshot
  ) async throws -> StudioWorkRecord {
    let directory = try await organisationStore.load()
    guard
      let currentCandidate = directory.contentReviewCandidates.first(where: {
        $0.id == candidate.id
      })
    else {
      throw SessionContentReviewedActionError.missingReviewCandidate(candidate.id)
    }
    let currentObservation = CalibrationObservationSnapshot.from(reviewCandidate: currentCandidate)
    guard currentObservation == expectedObservation else {
      throw SessionContentReviewedActionError.staleReviewCandidate(candidate.id)
    }
    guard
      let artist = directory.artists.first(where: {
        $0.displayName.caseInsensitiveCompare(artistName) == .orderedSame
      })
    else {
      throw SessionReviewDestinationError.missingArtist(artistName)
    }
    guard
      let work = directory.works.first(where: {
        $0.artistID == artist.id
          && $0.displayName.caseInsensitiveCompare(workName) == .orderedSame
      })
    else {
      throw SessionReviewDestinationError.missingWork(
        artistName: artistName,
        workName: workName
      )
    }
    guard work.id != candidate.candidateWorkID else {
      throw SessionReviewDestinationError.suggestedWork
    }
    return work
  }

  private func recordSessionReviewFailure(_ message: String) {
    sessionReviewActionState = .failed(message)
    organisationMessage = message
  }

  private func refreshOrganisationTruth() async throws {
    let directory = try await organisationStore.load()
    organisationDirectory = directory
    if isSessionReviewSample {
      let indexes = searchableRootIndexes.values
        .map(\.index)
        .sorted { $0.rootURL.path < $1.rootURL.path }
      let overrides = try await organisationOverrideStore.reload()
      workCatalog = WorkCatalogResolver().resolve(
        indexes: indexes,
        overrides: overrides,
        directory: directory,
        generatedAt: Date(timeIntervalSince1970: 1_786_464_000)
      )
      scheduleGlobalSearch()
    } else {
      await refreshGlobalSearchIndex()
      organisationDirectory = try await organisationStore.load()
    }
  }

  private func reviewedActionSuccessMessage(
    _ action: SessionContentReviewedAction,
    candidate: SessionContentReviewCandidate
  ) -> String {
    let candidateName = contentReviewWorkName(for: candidate.candidateWorkID)
    switch action {
    case .accept:
      return
        "Accepted the reviewed link to \(candidateName). The local review label was recorded. No files were moved."
    case .keepSeparate:
      return
        "Kept this Session separate from \(candidateName). The local review label was recorded."
    case .assignElsewhere(let workID):
      return
        "Assigned this Session to \(contentReviewWorkName(for: workID)). The local review label was recorded. No files were moved."
    case .reject:
      return "Rejected the suggestion for \(candidateName). The local review label was recorded."
    }
  }

  func openSearchHit(_ hit: StudioSearchHit) {
    Task { await openSearchHitFromOwningRoot(hit) }
  }

  func presentGlobalSearch() {
    guard !globalSearchPresented else { return }
    shouldRestoreGlobalSearchTriggerFocus = false
    globalSearchExpanded = false
    globalSearchPresented = true
    globalSearchText = ""
  }

  func dismissGlobalSearch(restoreTriggerFocus: Bool = true) {
    shouldRestoreGlobalSearchTriggerFocus = restoreTriggerFocus
    globalSearchPresented = false
    globalSearchExpanded = false
    globalSearchText = ""
    globalSongSearchTask?.cancel()
    globalEvidenceSearchTask?.cancel()
    isSearchingGlobalEvidence = false
  }

  func expandGlobalSearch() {
    globalSearchExpanded = true
    scheduleGlobalEvidenceSearch()
  }

  func openGlobalSong(_ work: StudioWork) {
    if let reference = preferredRevisionReference(for: work),
      let owningRoot = searchableRootIndexes[reference.trackedRootURL.standardizedFileURL.path]
    {
      activate(owningRoot)
    }
    dismissGlobalSearch(restoreTriggerFocus: false)
    selectWork(work)
  }

  func openGlobalEvidence(_ hit: StudioSearchHit) {
    dismissGlobalSearch(restoreTriggerFocus: false)
    openSearchHit(hit)
  }

  func selectGlobalLooseAudio(_ asset: PreviewAsset) {
    Task {
      let assetPath = asset.fileURL.standardizedFileURL.path
      guard let rootPath = looseAudioRootPathByAssetPath[assetPath],
        let cached = searchableRootIndexes[rootPath]
      else {
        selectAsset(asset)
        return
      }
      activate(cached)
      destination = .looseAudio
      selectedProjectID = nil
      selectedTimelineID = nil
      selectedSetID = nil
      selectAsset(asset)
      if !isSampleLibrary { await refreshGlobalSearchIndex() }
    }
  }

  func selectTimeline(_ timeline: SetTimeline) {
    selectedTimelineID = timeline.id
    selectedSetID = timeline.versions.first?.id
    selectedAssetID = nil
    inspectorPresented = false
  }

  func selectSet(_ set: AbletonSet) {
    selectedSetID = set.id
    selectedAssetID = nil
    inspectorPresented = false
  }

  func selectAsset(_ asset: PreviewAsset) {
    selectedAssetID = asset.id
    player.prepare(asset)
    inspectorPresented = true
  }

  func selectChainOccurrence(_ occurrence: ChainOccurrence) {
    selectedChainOccurrenceID = occurrence.id
    selectedProjectID = nil
    selectedTimelineID = nil
    selectedSetID = nil
    selectedAssetID = nil
    inspectorPresented = true
  }

  func openSelectedChainSource() {
    guard let occurrence = selectedChainOccurrence,
      let project = library?.projects.first(where: { $0.id == occurrence.projectID }),
      let timeline = project.timelines.first(where: { $0.id == occurrence.timelineID }),
      let set = timeline.versions.first(where: { $0.id == occurrence.setID })
    else { return }

    destination = .library
    selectedProjectID = project.id
    selectedTimelineID = timeline.id
    selectedSetID = set.id
    selectedAssetID = nil
    selectedChainOccurrenceID = nil
    searchText = ""
    inspectorPresented = true
  }

  func showSnapshotHistory() {
    guard !selectedProjectSnapshots.isEmpty else { return }
    snapshotSheetPresented = true
  }

  func chooseRestoreDestination(
    for snapshot: SetSnapshot,
    operation: RestoreOperation = .restore
  ) {
    let panel = NSOpenPanel()
    panel.title =
      operation == .restore ? "Choose a restore destination" : "Choose a branch destination"
    panel.message =
      "Studio Time Machine will plan a new .als copy here. It never overwrites the source Set."
    panel.prompt = operation == .restore ? "Plan Restore" : "Plan Branch"
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    guard panel.runModal() == .OK, let destination = panel.url else { return }

    Task {
      do {
        let plan = try await syncService.planRestore(
          snapshotID: snapshot.id,
          destinationDirectory: destination,
          operation: operation
        )
        snapshotSheetPresented = false
        await Task.yield()
        restorePlan = plan
        syncMessage = nil
      } catch {
        restorePlan = nil
        syncMessage = error.localizedDescription
      }
    }
  }

  func executeRestorePlan() {
    guard !isSampleLibrary, let restorePlan, !isExecutingRestore else { return }
    isExecutingRestore = true
    Task {
      defer { isExecutingRestore = false }
      do {
        _ = try await syncService.executeRestore(restorePlan)
      } catch {
        syncMessage = error.localizedDescription
      }
    }
  }

  func chooseAudioRecoveryDestination() {
    guard let selectedSet else { return }
    let panel = NSOpenPanel()
    panel.title = "Choose a project folder"
    panel.message =
      "Available clip audio will be planned into a new Recovered Audio folder. No Set or source audio is changed."
    panel.prompt = "Plan Recovery"
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    guard panel.runModal() == .OK, let destination = panel.url else { return }

    do {
      audioRecoveryPlan = try AudioRecoveryService().plan(
        dependencies: selectedSet.content.dependencies,
        destinationProjectURL: destination
      )
      recoveryMessage = nil
    } catch {
      audioRecoveryPlan = nil
      recoveryMessage = error.localizedDescription
    }
  }

  func chooseApproximatePreviewDestination() {
    guard let set = selectedSet,
      let dryPlan = selectedPreviewDecision?.dryPlan
    else { return }

    let panel = NSSavePanel()
    panel.title = "Save an approximate dry preview"
    panel.message =
      "Review the fixed-tempo raw-audio limitations before rendering. Studio Time Machine will create a new WAV and never overwrite an existing file."
    panel.prompt = "Review Preview"
    panel.allowedContentTypes = [.wav]
    panel.canCreateDirectories = true
    panel.nameFieldStringValue = "\(set.displayName) Approximate Preview.wav"
    guard panel.runModal() == .OK, let destinationURL = panel.url else { return }

    approximatePreviewRenderPlan = ApproximatePreviewRenderPlan(
      setName: set.displayName,
      dryPlan: dryPlan,
      destinationURL: destinationURL
    )
  }

  func executeApproximatePreviewRender() {
    guard !isSampleLibrary,
      let renderPlan = approximatePreviewRenderPlan,
      !isRenderingApproximatePreview
    else { return }

    isRenderingApproximatePreview = true
    Task {
      defer { isRenderingApproximatePreview = false }
      do {
        let result = try await Task.detached(priority: .utility) {
          try DryPreviewRenderer().render(
            plan: renderPlan.dryPlan,
            destinationURL: renderPlan.destinationURL
          )
        }.value
        let values = try? result.fileURL.resourceValues(
          forKeys: [.fileSizeKey, .contentModificationDateKey]
        )
        let asset = PreviewAsset(
          id: "approximate-preview:\(result.fileURL.standardizedFileURL.path)",
          fileURL: result.fileURL,
          category: .otherAudio,
          isLikelyUserRender: false,
          bytes: Int64(values?.fileSize ?? 0),
          modifiedAt: values?.contentModificationDate
        )
        player.prepare(asset, fidelity: .approximate, label: "Approximate dry preview")
        approximatePreviewRenderPlan = nil
        recoveryMessage =
          "Created an Approximate dry preview from \(result.renderedSegmentCount) raw audio placements. No source files were changed."
      } catch {
        recoveryMessage = error.localizedDescription
      }
    }
  }

  func cancelApproximatePreviewRender() {
    guard !isRenderingApproximatePreview else { return }
    approximatePreviewRenderPlan = nil
  }

  func planOpenInAbletonLive() {
    guard let selectedSet, !isDiscoveringAbletonLive else { return }
    isDiscoveringAbletonLive = true
    liveBridgeMessage = nil
    Task {
      defer { isDiscoveringAbletonLive = false }
      do {
        let installations = await Task.detached(priority: .utility) {
          AbletonLiveLocator().installedApplications()
        }.value
        liveOpenPlan = try AbletonLiveBridge().planOpen(
          set: selectedSet,
          installations: installations
        )
      } catch {
        liveOpenPlan = nil
        liveBridgeMessage = error.localizedDescription
      }
    }
  }

  func planOpenInAbletonLive(for revision: StudioSetRevision, in session: StudioSession) {
    openRevision(revision, in: session)
    planOpenInAbletonLive()
  }

  func executeLiveOpenPlan() {
    guard !isSampleLibrary,
      let liveOpenPlan,
      !isOpeningInAbletonLive
    else { return }

    isOpeningInAbletonLive = true
    Task {
      defer { isOpeningInAbletonLive = false }
      do {
        try await AbletonLiveBridge().execute(liveOpenPlan)
        self.liveOpenPlan = nil
        liveBridgeMessage =
          "Opened the Set in \(liveOpenPlan.installation.displayName). Export and every further action remain under your control in Ableton Live."
      } catch {
        liveBridgeMessage = error.localizedDescription
      }
    }
  }

  func cancelLiveOpenPlan() {
    guard !isOpeningInAbletonLive else { return }
    liveOpenPlan = nil
  }

  func chooseLiveExportDestination(
    for revision: StudioSetRevision,
    in session: StudioSession,
    source: AbletonExportSource
  ) {
    openRevision(revision, in: session)
    chooseLiveExportDestination(source: source)
  }

  func chooseLiveExportDestination(source: AbletonExportSource = .main) {
    guard !isSampleLibrary, let selectedSet, !isPlanningLiveExport else { return }
    let panel = NSOpenPanel()
    panel.title = "Choose a new \(source.title) export destination"
    panel.message =
      "Studio Time Machine will never replace an existing file. Choose a disposable or empty folder."
    panel.prompt = "Review Export"
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    panel.canCreateDirectories = true
    guard panel.runModal() == .OK, let destinationURL = panel.url else { return }

    isPlanningLiveExport = true
    liveExportMessage = nil
    Task {
      defer { isPlanningLiveExport = false }
      do {
        let installations = await Task.detached(priority: .utility) {
          AbletonLiveLocator().installedApplications()
        }.value
        guard
          let installation = installations.first(where: {
            $0.version?.hasPrefix("12.4.2") == true
          })
        else {
          throw AbletonAutomationError.unsupportedVersion(installations.first?.version)
        }
        guard !self.isRebuildingOrganisation else {
          throw StudioRevisionReferenceError.catalogueRefreshInProgress
        }
        let resolved = try revisionExecutionAuthority.capture(setURL: selectedSet.fileURL)
        try StudioRevisionReferenceResolver().validate(
          set: selectedSet, against: resolved.reference)
        let currentSet = resolved.revision.set
        let setMap = SetMapBuilder().build(set: currentSet)
        let exportLabel: String
        switch source {
        case .main:
          exportLabel = "Master"
        case .allIndividualTracks:
          exportLabel = "Stems"
        case .selectedTracks:
          exportLabel = "Selected Tracks"
        }
        let safeBaseName = "\(currentSet.displayName) \(exportLabel)"
        let expectedOutputFileNames =
          source.expectedFileCount == 1 ? ["\(safeBaseName).wav"] : []
        let plan = AbletonExportPlan(
          setID: resolved.reference.setID,
          revisionID: resolved.reference.revisionID,
          workID: resolved.reference.workID,
          workName: resolved.reference.displaySnapshot.workName,
          setURL: resolved.reference.setURL,
          installation: installation,
          source: source,
          arrangementRange: AbletonArrangementRange(
            startBeat: max(0, setMap.startBeat), endBeat: max(16, setMap.endBeat)),
          pcmFormat: .wav,
          sampleRate: .hz48000,
          bitDepth: .int24,
          normalize: false,
          includeReturnAndMainEffects: true,
          destination: AbletonExportDestination(
            directoryURL: destinationURL,
            baseName: safeBaseName,
            expectedOutputFileNames: expectedOutputFileNames),
          revisionReference: resolved.reference
        )
        try revisionExecutionAuthority.validate(plan: plan)
        let evidenceURL = try AbletonExportEvidenceStore.defaultStorageURL()
        let automation = AbletonAutomation.live124(
          evidenceStore: AbletonExportEvidenceStore(storageURL: evidenceURL),
          revisionExecutionAuthority: revisionExecutionAuthority)
        liveAutomation = automation
        liveExportPreflight = nil
        liveExportState = .awaitingApproval
        liveExportPlan = plan
      } catch {
        liveExportMessage = error.localizedDescription
      }
    }
  }

  func preflightLiveExport(requestPermission: Bool) {
    guard let liveExportPlan, let liveAutomation, !isPreflightingLiveExport else { return }
    isPreflightingLiveExport = true
    liveExportMessage = nil
    Task {
      let result = await liveAutomation.preflight(
        liveExportPlan, requestPermission: requestPermission)
      liveExportPreflight = result
      liveExportMessage = result.message
      isPreflightingLiveExport = false
    }
  }

  var canRetargetLiveExportToActiveSet: Bool {
    guard let activeSetURL = liveExportPreflight?.activeSetURL else { return false }
    return indexedExportTarget(for: activeSetURL) != nil
  }

  func retargetLiveExportToActiveSet() {
    guard let plan = liveExportPlan,
      let activeSetURL = liveExportPreflight?.activeSetURL,
      let target = indexedExportTarget(for: activeSetURL)
    else {
      liveExportMessage =
        "The active Live Set is not in an indexed Studio location, so this plan cannot be switched safely."
      return
    }
    do {
      liveExportPlan = try AbletonExportRetargeter().retarget(plan, to: target)
      liveExportPreflight = nil
      liveExportMessage =
        "The reviewed plan now targets \(target.setURL.lastPathComponent). Run preflight again before exporting."
    } catch {
      liveExportMessage = error.localizedDescription
    }
  }

  func openAccessibilitySettings() {
    guard
      let url = URL(
        string:
          "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
    else { return }
    NSWorkspace.shared.open(url)
  }

  func executeLiveExportPlan() {
    guard let liveExportPlan, let liveAutomation, liveExportCanExecute,
      !isExecutingLiveExport
    else { return }
    guard !isRebuildingOrganisation else {
      liveExportMessage =
        "The current all-root Studio catalogue is unavailable. Refresh the library and review this export again."
      return
    }
    do {
      try revisionExecutionAuthority.validate(plan: liveExportPlan)
    } catch {
      liveExportPreflight = nil
      liveExportMessage = error.localizedDescription
      return
    }
    isExecutingLiveExport = true
    liveExportMessage = nil
    let eventTask = Task {
      let events = await liveAutomation.events()
      for await event in events {
        if case .state(let state) = event { liveExportState = state }
      }
    }
    liveExportTask = Task {
      defer {
        eventTask.cancel()
        isExecutingLiveExport = false
        liveExportTask = nil
      }
      do {
        guard !isRebuildingOrganisation else {
          throw StudioRevisionReferenceError.catalogueRefreshInProgress
        }
        try revisionExecutionAuthority.validate(plan: liveExportPlan)
        guard let approvedGeneration = liveExportPlan.revisionReference?.catalogueGenerationID
        else {
          throw AbletonExportPlanError.missingRevisionReference
        }
        let evidence = try await liveAutomation.execute(
          liveExportPlan,
          approval: AbletonExportApproval(
            planID: liveExportPlan.id,
            catalogueGenerationID: approvedGeneration))
        lastLiveExportEvidence = evidence
        abletonExportEvidence.removeAll { $0.id == evidence.id }
        abletonExportEvidence.insert(evidence, at: 0)
        self.liveExportPlan = nil
        liveExportPreflight = nil
        liveExportMessage =
          "Verified \(evidence.outputs.count) fresh export output(s) and linked the evidence to this Set revision."
      } catch {
        liveExportMessage = error.localizedDescription
      }
    }
  }

  var liveExportCanExecute: Bool {
    guard let preflight = liveExportPreflight else { return false }
    return preflight.permission == .authorized
      && preflight.adapterVersion != nil
      && preflight.activeSetConfirmed
      && preflight.hasUnsavedChanges == false
  }

  func cancelLiveExportPlan() {
    if isExecutingLiveExport {
      liveExportTask?.cancel()
      return
    }
    liveExportPlan = nil
    liveExportPreflight = nil
    liveAutomation = nil
    liveExportState = .idle
  }

  func executeAudioRecoveryPlan() {
    guard !isSampleLibrary, let audioRecoveryPlan, !isExecutingAudioRecovery else { return }
    isExecutingAudioRecovery = true
    Task {
      defer { isExecutingAudioRecovery = false }
      do {
        let recovered = try await Task.detached(priority: .utility) {
          try AudioRecoveryService().execute(audioRecoveryPlan)
        }.value
        recoveredAudioURLs = recovered
        self.audioRecoveryPlan = nil
        recoveryMessage =
          "Recovered \(recovered.count) audio files as verified copies. Originals were not changed."
      } catch {
        recoveryMessage = error.localizedDescription
      }
    }
  }

  func cancelRestorePlan() {
    guard !isExecutingRestore else { return }
    restorePlan = nil
  }

  func cancelAudioRecoveryPlan() {
    guard !isExecutingAudioRecovery else { return }
    audioRecoveryPlan = nil
  }

  func dismissNotice() {
    exportMessage = nil
    latestDetectedExportBatchID = nil
    organisationMessage = nil
    recoveryMessage = nil
    liveBridgeMessage = nil
    syncMessage = nil
  }

  func revealInFinder(_ url: URL) {
    NSWorkspace.shared.activateFileViewerSelecting([url])
  }

  func revealSelectedInFinder() {
    guard let selectedFileURL else { return }
    revealInFinder(selectedFileURL)
  }

  func performNoticeAction() {
    guard exportMessage != nil, let latestDetectedExportBatchID else { return }
    Task {
      await StudioExportNotificationController.shared.revealExportBatch(
        id: latestDetectedExportBatchID)
    }
  }

  private func restoreCachedLibraryAndStart() async {
    do {
      let roots = try await syncService.registeredRoots()
      registeredRoots = roots
      let cachedIndexes = try await syncService.cachedIndexes()
      if let cached = cachedIndexes.first {
        activate(cached)
        prepareSearchIndex(for: cachedIndexes)
        await rebuildWorkCatalog(from: cachedIndexes)
        snapshots = (try? await syncService.snapshots()) ?? []
        scanInstalledPlugins()
      }
      if roots.contains(where: { $0.availability == .available }) {
        try await syncService.resumeMonitoring()
        await refreshGlobalSearchIndex()
      }
      if let evidenceURL = try? AbletonExportEvidenceStore.defaultStorageURL() {
        abletonExportEvidence =
          (try? await AbletonExportEvidenceStore(storageURL: evidenceURL).all()) ?? []
      }
      await refreshSampleUsage()
    } catch {
      // A missing or unreadable cache should not block first run.
    }
  }

  private func restoreSamples() async {
    guard let sampleService else {
      sampleMessage = Self.sampleDatabaseUnavailableMessage
      return
    }
    do {
      sampleLocations = try await sampleService.locations()
      if sampleLocations.contains(where: { $0.availability == .available }) {
        try await sampleService.start(
          projectRoots: searchableRootIndexes.values.flatMap { $0.index.projects.map(\.rootURL) })
      }
      scheduleSampleQuery()
    } catch {
      sampleMessage = error.localizedDescription
    }
  }

  private func refreshSampleUsage() async {
    guard !isSampleLibrary else { return }
    guard let sampleService else {
      sampleMessage = "Sample usage could not refresh because the Samples database is unavailable."
      return
    }
    do {
      let indexes = try await syncService.cachedIndexes().map(\.index)
      let coverage =
        !registeredRoots.isEmpty
        && registeredRoots.allSatisfy { $0.availability == .available }
        && sampleLocations.allSatisfy { $0.availability == .available }
      try await sampleService.replaceUsage(indexes: indexes, coverageComplete: coverage)
      scheduleSampleQuery()
    } catch {
      sampleMessage = "Sample usage could not refresh: \(error.localizedDescription)"
    }
  }

  private func indexedExportTarget(for fileURL: URL) -> AbletonExportTarget? {
    guard !isRebuildingOrganisation,
      let resolved = try? revisionExecutionAuthority.capture(setURL: fileURL)
    else { return nil }
    let revision = resolved.revision
    let map = SetMapBuilder().build(set: revision.set)
    return AbletonExportTarget(
      setID: resolved.reference.setID,
      revisionID: resolved.reference.revisionID,
      workID: resolved.reference.workID,
      workName: resolved.reference.displaySnapshot.workName,
      setURL: resolved.reference.setURL,
      setDisplayName: revision.set.displayName,
      arrangementRange: AbletonArrangementRange(
        startBeat: max(0, map.startBeat), endBeat: max(16, map.endBeat)),
      revisionReference: resolved.reference)
  }

  private func scheduleSampleQuery() {
    guard destination == .samples else { return }
    if isSampleLibrary {
      let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
      var rows = sampleFixtureRows.filter { row in
        query.isEmpty
          || row.name.localizedCaseInsensitiveContains(query)
          || row.packName.localizedCaseInsensitiveContains(query)
          || row.locationName.localizedCaseInsensitiveContains(query)
      }
      rows.sort { left, right in
        let comparison: ComparisonResult =
          switch sampleSortField {
          case .name: left.name.localizedStandardCompare(right.name)
          case .location:
            left.locationName.localizedStandardCompare(right.locationName)
          case .workCount: Self.compare(left.workCount ?? -1, right.workCount ?? -1)
          case .sessionCount: Self.compare(left.sessionCount, right.sessionCount)
          case .setCount: Self.compare(left.setCount, right.setCount)
          case .occurrenceCount: Self.compare(left.occurrenceCount, right.occurrenceCount)
          case .lastUsed:
            Self.compare(left.lastUsedAt ?? .distantPast, right.lastUsedAt ?? .distantPast)
          case .size: Self.compare(left.metadata.bytes, right.metadata.bytes)
          case .duration:
            Self.compare(left.metadata.durationSeconds ?? 0, right.metadata.durationSeconds ?? 0)
          case .format: left.metadata.format.localizedStandardCompare(right.metadata.format)
          case .availability:
            left.availability.rawValue.localizedStandardCompare(right.availability.rawValue)
          }
        let resolved =
          comparison == .orderedSame
          ? left.id.localizedStandardCompare(right.id) : comparison
        return sampleSortDirection == .ascending
          ? resolved == .orderedAscending : resolved == .orderedDescending
      }
      sampleRows = rows
      if let selectedSampleID, !rows.contains(where: { $0.id == selectedSampleID }) {
        selectSample(id: rows.first?.id)
      }
      return
    }
    sampleQueryTask?.cancel()
    guard let sampleService else {
      isQueryingSamples = false
      sampleMessage = Self.sampleDatabaseUnavailableMessage
      return
    }
    isQueryingSamples = true
    let query = SampleQuery(
      searchText: searchText, sortField: sampleSortField,
      direction: sampleSortDirection, limit: 500)
    sampleQueryTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(90))
      guard !Task.isCancelled else { return }
      do {
        let result = try await sampleService.query(query)
        guard !Task.isCancelled else { return }
        self?.sampleRows = result.rows
        self?.sampleTotalCount = result.totalCount
        self?.sampleUsageCoverageComplete = result.usageCoverageComplete
        self?.isQueryingSamples = false
        if self?.selectedSampleID == nil { self?.selectSample(id: result.rows.first?.id) }
      } catch {
        self?.isQueryingSamples = false
        self?.sampleMessage = error.localizedDescription
      }
    }
  }

  private static func compare<Value: Comparable>(_ left: Value, _ right: Value)
    -> ComparisonResult
  {
    if left < right { return .orderedAscending }
    if left > right { return .orderedDescending }
    return .orderedSame
  }

  private static func sampleFixtureAnalysis(for sample: SampleListRow) -> SampleAudioAnalysis {
    let isLow = sample.name.localizedCaseInsensitiveContains("kick")
    let frames = (0..<SampleAudioAnalyzer.spectralFrameCount).map { time in
      (0..<SampleAudioAnalyzer.spectralBandCount).map { band in
        let center = isLow ? 10.0 : 23.0
        let distance = abs(Double(band) - center)
        let envelope = max(0.04, 1 - distance / 15)
        let pulse = 0.62 + 0.38 * sin(Double(time + 1) * 1.41 + Double(band) * 0.19)
        return Float(max(0.025, min(1, envelope * pulse)))
      }
    }
    return SampleAudioAnalysis(
      sampleID: sample.id,
      analyzedAt: Date(timeIntervalSince1970: 1_786_464_000),
      sourceBytes: sample.metadata.bytes,
      sourceModifiedAt: sample.metadata.modifiedAt,
      spectralFrames: frames,
      dominantFrequencyHz: isLow ? 58 : 1_240,
      spectralCentroidHz: isLow ? 410 : 2_480,
      lowEnergy: isLow ? 0.71 : 0.16,
      midEnergy: isLow ? 0.24 : 0.67,
      highEnergy: isLow ? 0.05 : 0.17,
      dominantRegion: isLow ? .low : .mid,
      contentSuggestions: [
        SampleContentSuggestion(
          label: isLow ? "Kick" : "Music", confidence: isLow ? 0.86 : 0.61,
          evidenceLabel: isLow ? "bass_drum" : "music")
      ]
    )
  }

  private func scanInstalledPlugins() {
    guard !isSampleLibrary, !isScanningPluginInventory else { return }
    isScanningPluginInventory = true
    Task {
      let inventory = await Task.detached(priority: .utility) {
        PluginInventoryScanner().scan()
      }.value
      pluginInventory = inventory
      isScanningPluginInventory = false
      rebuildChainLibrary()
    }
  }

  private func consume(_ event: StudioLibrarySyncEvent) {
    switch event {
    case .statusChanged(let status):
      syncStatus = status
    case .rootsChanged(let roots):
      registeredRoots = roots
      Task { await refreshGlobalSearchIndex() }
    case .progress(let rootID, let update):
      guard activeRootID == nil || activeRootID == rootID else { return }
      indexingProgress = update
      if library == nil, let root = registeredRoots.first(where: { $0.id == rootID }) {
        phase = .indexing(root.fileURL)
      }
    case .indexUpdated(let rootID, let index, let statistics):
      Task { await refreshGlobalSearchIndex() }
      Task { await refreshSampleUsage() }
      guard activeRootID == nil || activeRootID == rootID else { return }
      activeRootID = rootID
      phase = .ready(index)
      indexingProgress = nil
      lastStatistics = statistics
      hasPendingLibraryChanges = false
      rebuildChainLibrary()
    case .snapshotCaptured(let snapshot):
      if !snapshots.contains(where: { $0.id == snapshot.id }) {
        snapshots.append(snapshot)
        snapshots.sort { $0.capturedAt > $1.capturedAt }
      }
    case .exportsDetected(let batches):
      let fileCount = batches.reduce(0) { $0 + $1.files.count }
      latestDetectedExportBatchID = batches.max { $0.completedAt < $1.completedAt }?.id
      exportMessage =
        "New export detected: \(fileCount) stable file\(fileCount == 1 ? "" : "s")."
      StudioExportNotificationController.shared.notify(batches)
    case .exportDetectionFailed(let message):
      exportMessage = "Export detection could not finish: \(message)"
    case .restoreCompleted(let url):
      lastRestoreURL = url
      restorePlan = nil
      syncMessage = "Restored a new Set copy at \(url.path). The source Set was not changed."
    case .failed(let message):
      syncMessage = message
      if library == nil { phase = .failed(nil, message) }
    }
  }

  private func consume(_ event: SampleLibraryEvent) {
    switch event {
    case .statusChanged(let status):
      sampleStatus = status
    case .locationsChanged(let locations):
      sampleLocations = locations
    case .indexCompleted:
      scheduleSampleQuery()
    case .usageUpdated:
      scheduleSampleQuery()
    case .failed(let message):
      sampleMessage = message
    }
  }

  private func rebuildChainLibrary() {
    chainBuildTask?.cancel()
    guard let library else {
      chainLibrary = nil
      isBuildingChainLibrary = false
      return
    }
    isBuildingChainLibrary = true
    let inventory = pluginInventory
    chainLibrary = nil
    chainBuildTask = Task { [weak self] in
      let result = await Task.detached(priority: .utility) {
        ChainIntelligenceBuilder().build(index: library, inventory: inventory)
      }.value
      guard !Task.isCancelled else { return }
      self?.chainLibrary = result
      self?.isBuildingChainLibrary = false
    }
  }

  private func refreshGlobalSearchIndex() async {
    guard !isSampleLibrary else { return }
    do {
      let cachedIndexes = try await syncService.cachedIndexes()
      prepareSearchIndex(for: cachedIndexes)
      await rebuildWorkCatalog(from: cachedIndexes)
    } catch {
      syncMessage = "Global search could not refresh: \(error.localizedDescription)"
    }
  }

  private func prepareSearchIndex(for cachedIndexes: [RootLibraryIndex]) {
    searchIndexTask?.cancel()
    searchTask?.cancel()
    liveInsertSearchTask?.cancel()
    let token = UUID()
    searchIndexToken = token
    librarySearchIndex = nil
    liveInsertSearchIndex = nil
    searchHits = []

    searchableRootIndexes = Dictionary(
      uniqueKeysWithValues: cachedIndexes.map {
        ($0.index.rootURL.standardizedFileURL.path, $0)
      }
    )
    rootDisplayNamesByPath = Dictionary(
      uniqueKeysWithValues: cachedIndexes.map {
        ($0.index.rootURL.standardizedFileURL.path, $0.root.displayName)
      }
    )
    let mostSpecificFirst = cachedIndexes.sorted {
      $0.index.rootURL.standardizedFileURL.path.count
        > $1.index.rootURL.standardizedFileURL.path.count
    }
    var looseAudioByPath: [String: PreviewAsset] = [:]
    looseAudioRootPathByAssetPath = [:]
    for cached in mostSpecificFirst {
      let rootPath = cached.index.rootURL.standardizedFileURL.path
      for asset in cached.index.unassignedAudioAssets {
        let assetPath = asset.fileURL.standardizedFileURL.path
        guard looseAudioByPath[assetPath] == nil else { continue }
        looseAudioByPath[assetPath] = asset
        looseAudioRootPathByAssetPath[assetPath] = rootPath
      }
    }
    globallyIndexedLooseAudio = looseAudioByPath.values
      .sorted {
        $0.fileURL.lastPathComponent.localizedStandardCompare($1.fileURL.lastPathComponent)
          == .orderedAscending
      }

    isSearchingLibrary = !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let indexes = cachedIndexes.map(\.index)
    searchIndexTask = Task { [weak self] in
      let indexes = await Task.detached(priority: .utility) {
        (
          StudioSearchIndex(indexes: indexes),
          StudioLiveInsertSearchIndex(indexes: indexes)
        )
      }.value
      guard !Task.isCancelled else { return }
      guard self?.searchIndexToken == token else { return }
      self?.librarySearchIndex = indexes.0
      self?.liveInsertSearchIndex = indexes.1
      self?.scheduleLibrarySearch()
      self?.scheduleGlobalEvidenceSearch()
      self?.scheduleLiveInsertSearch()
    }
  }

  private func rebuildWorkCatalog(from cachedIndexes: [RootLibraryIndex]) async {
    guard !isSampleLibrary else { return }
    organisationTask?.cancel()
    let generation = UUID()
    organisationGeneration = generation
    revisionExecutionAuthority.invalidate()
    if liveExportPlan != nil || liveExportTask != nil {
      liveExportTask?.cancel()
      liveExportPlan = nil
      liveExportPreflight = nil
      liveExportMessage =
        "Studio organisation changed. Review the current Song and Set again before exporting."
    }
    isRebuildingOrganisation = true
    let indexes = cachedIndexes.map(\.index)
    let store = organisationStore
    let overrideStore = organisationOverrideStore
    let calibration = sessionContentCalibration
    await store.beginOrganisation(generation: generation)
    let operation = Task { [weak self] in
      do {
        let overrides = try await overrideStore.reload()
        try Task.checkCancellation()
        let result = try await store.organiseByContent(
          indexes: indexes, overrides: overrides, calibration: calibration,
          generation: generation)
        try Task.checkCancellation()
        let directory = try await store.load()
        try Task.checkCancellation()
        guard let self, self.organisationGeneration == generation else { return }
        self.organisationDirectory = directory
        self.workCatalog = result.catalog
        self.scheduleGlobalSearch()
        self.revisionExecutionAuthority.activate(
          generationID: generation.uuidString, catalog: result.catalog)
        if let selectedWorkID,
          !result.catalog.works.contains(where: { $0.id == selectedWorkID })
        {
          self.selectedWorkID = nil
        }
        self.isRebuildingOrganisation = false
      } catch is CancellationError {
        return
      } catch StudioOrganisationStoreError.supersededOrganisation {
        return
      } catch {
        guard let self, self.organisationGeneration == generation else { return }
        self.revisionExecutionAuthority.invalidate()
        self.isRebuildingOrganisation = false
        self.organisationMessage =
          "Studio organisation could not refresh: \(error.localizedDescription)"
      }
    }
    organisationTask = operation
    await operation.value
  }

  private func scheduleLibrarySearch() {
    searchTask?.cancel()
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else {
      searchHits = []
      isSearchingLibrary = false
      return
    }
    guard destination == .library || destination == .looseAudio else {
      searchHits = []
      isSearchingLibrary = false
      return
    }
    guard let librarySearchIndex else {
      searchHits = []
      isSearchingLibrary = true
      return
    }

    let onlyLooseAudio = destination == .looseAudio
    let kinds: Set<StudioSearchKind> = onlyLooseAudio ? [.audio] : Set(StudioSearchKind.allCases)
    let looseAudioPaths = Set(
      globallyIndexedLooseAudio.map {
        $0.fileURL.standardizedFileURL.path
      })
    isSearchingLibrary = true
    searchTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(120))
      guard !Task.isCancelled else { return }
      let hits = await Task.detached(priority: .userInitiated) {
        librarySearchIndex.search(query, kinds: kinds, limit: 100)
      }.value
      guard !Task.isCancelled else { return }
      self?.searchHits =
        onlyLooseAudio
        ? hits.filter { hit in
          guard let path = hit.fileURL?.standardizedFileURL.path else { return false }
          return looseAudioPaths.contains(path)
        }
        : hits
      self?.isSearchingLibrary = false
    }
  }

  private func scheduleGlobalSearch() {
    globalSongSearchTask?.cancel()
    let generation = UUID()
    globalSongSearchGeneration = generation
    globalSongHits = []
    guard globalSearchPresented else {
      return
    }
    let query = globalSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
    let works = workCatalog?.works ?? []
    let recentIDs = recentWorkIDs
    globalSongSearchTask = Task { [weak self] in
      if !query.isEmpty { try? await Task.sleep(for: .milliseconds(70)) }
      guard !Task.isCancelled else { return }
      let batch = await Task.detached(priority: .userInitiated) {
        StudioSearchResultBatch(
          query: query,
          results: StudioWorkSearchIndex(works: works).search(
            query,
            recentWorkIDs: recentIDs,
            limit: 24
          )
        )
      }.value
      guard !Task.isCancelled else { return }
      guard let self, self.globalSongSearchGeneration == generation else { return }
      guard let hits = batch.results(matching: self.globalSearchText) else { return }
      self.globalSongHits = hits
      self.scheduleGlobalEvidenceSearch()
    }
  }

  private func scheduleGlobalEvidenceSearch() {
    globalEvidenceSearchTask?.cancel()
    let generation = UUID()
    globalEvidenceSearchGeneration = generation
    globalEvidenceHits = []
    isSearchingGlobalEvidence = false
    let query = globalSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard globalSearchPresented, globalSearchExpanded, !query.isEmpty else {
      return
    }
    guard let librarySearchIndex else {
      isSearchingGlobalEvidence = true
      return
    }

    isSearchingGlobalEvidence = true
    globalEvidenceSearchTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(90))
      guard !Task.isCancelled else { return }
      let batch = await Task.detached(priority: .userInitiated) {
        StudioSearchResultBatch(
          query: query,
          results: librarySearchIndex.search(
            query, kinds: Set(StudioSearchKind.allCases), limit: 100)
        )
      }.value
      guard !Task.isCancelled else { return }
      guard let self, self.globalEvidenceSearchGeneration == generation else { return }
      guard let hits = batch.results(matching: self.globalSearchText) else { return }
      self.globalEvidenceHits = hits
      self.isSearchingGlobalEvidence = false
    }
  }

  func prepareLiveInsert(sourceApplicationName: String?) {
    liveInsertSourceApplicationName = sourceApplicationName
    liveInsertSearchTask?.cancel()
    liveInsertText = ""
    liveInsertHits = []
    isSearchingLiveInsert = false
  }

  func openLiveInsertHit(_ hit: StudioLiveInsertHit) {
    let kind: StudioSearchKind =
      switch hit.kind {
      case .track, .deviceChain: .track
      case .audioClip: .clip
      case .audioFile: .audio
      }
    let context = [hit.projectName, hit.setName, hit.detail]
      .compactMap { $0 }
      .joined(separator: " · ")
    let searchHit = StudioSearchHit(
      id: hit.id,
      kind: kind,
      title: hit.title,
      context: context,
      fileURL: hit.fileURL,
      rootURL: hit.rootURL,
      projectID: hit.projectID,
      timelineID: hit.timelineID,
      setID: hit.setID,
      trackID: hit.trackID,
      score: hit.score)
    Task { await openSearchHitFromOwningRoot(searchHit) }
  }

  func revealLiveInsertHit(_ hit: StudioLiveInsertHit) {
    guard let fileURL = hit.fileURL else { return }
    revealInFinder(fileURL)
  }

  private func scheduleLiveInsertSearch() {
    liveInsertSearchTask?.cancel()
    let generation = UUID()
    liveInsertSearchGeneration = generation
    liveInsertHits = []
    isSearchingLiveInsert = false
    let query = liveInsertText.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !query.isEmpty else { return }
    guard let liveInsertSearchIndex else {
      isSearchingLiveInsert = true
      return
    }

    isSearchingLiveInsert = true
    liveInsertSearchTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(55))
      guard !Task.isCancelled else { return }
      let batch = await Task.detached(priority: .userInitiated) {
        StudioSearchResultBatch(
          query: query,
          results: liveInsertSearchIndex.search(query, limit: 80))
      }.value
      guard !Task.isCancelled else { return }
      guard let self, self.liveInsertSearchGeneration == generation else { return }
      guard let hits = batch.results(matching: self.liveInsertText) else { return }
      self.liveInsertHits = hits
      self.isSearchingLiveInsert = false
    }
  }

  private func openSearchHitFromOwningRoot(_ hit: StudioSearchHit) async {
    let rootPath = hit.rootURL.standardizedFileURL.path
    var cached = searchableRootIndexes[rootPath]
    if cached == nil, !isSampleLibrary {
      await refreshGlobalSearchIndex()
      cached = searchableRootIndexes[rootPath]
    }
    guard let cached else { return }

    activate(cached)

    if hit.kind == .audio,
      let fileURL = hit.fileURL,
      let asset = cached.index.unassignedAudioAssets.first(where: {
        $0.fileURL.standardizedFileURL == fileURL.standardizedFileURL
      })
    {
      destination = .looseAudio
      searchText = ""
      selectAsset(asset)
      return
    }

    guard let projectID = hit.projectID,
      let project = cached.index.projects.first(where: { $0.id == projectID })
    else { return }

    destination = .library
    selectedWorkID =
      workCatalog?.works.first(where: {
        $0.sessions.contains(where: { $0.id == project.id })
      })?.id
    selectedProjectID = project.id
    selectedTimelineID = hit.timelineID ?? project.timelines.first?.id
    if let setID = hit.setID {
      selectedSetID = setID
    } else {
      selectedSetID =
        project.timelines
        .first(where: { $0.id == selectedTimelineID })?.versions.first?.id
    }
    selectedAssetID = nil
    selectedChainOccurrenceID = nil

    if hit.kind == .audio,
      let fileURL = hit.fileURL,
      let asset = project.previewAssets.first(where: {
        $0.fileURL.standardizedFileURL == fileURL.standardizedFileURL
      })
    {
      selectedAssetID = asset.id
      player.prepare(asset)
    }

    searchText = ""
    inspectorPresented = true
  }

  private func activate(_ cached: RootLibraryIndex) {
    activeRootID = cached.root.id
    phase = .ready(cached.index)
    rebuildChainLibrary()
  }

  private func preferredRevisionReference(for work: StudioWork) -> StudioRevisionReference? {
    guard let workCatalog else { return nil }
    let candidates = work.sessions.flatMap { session in
      session.revisions.map { (session: session, revision: $0) }
    }
    guard
      let preferred = candidates.sorted(by: { left, right in
        let leftDate = left.revision.timestamp.value ?? left.revision.set.modifiedAt ?? .distantPast
        let rightDate =
          right.revision.timestamp.value ?? right.revision.set.modifiedAt ?? .distantPast
        if leftDate != rightDate { return leftDate > rightDate }
        return left.revision.id < right.revision.id
      }).first
    else { return nil }
    return try? StudioRevisionReferenceResolver().capture(
      workID: work.id,
      sessionID: preferred.session.id,
      revisionID: preferred.revision.id,
      in: workCatalog
    ).reference
  }

  private func owningRoot(
    for revision: StudioSetRevision,
    in session: StudioSession
  ) -> RootLibraryIndex? {
    if let workCatalog,
      let work = workCatalog.works.first(where: { work in
        work.sessions.contains(where: { candidate in
          candidate.id == session.id
            && candidate.revisions.contains(where: { $0.id == revision.id })
        })
      }),
      let reference = try? StudioRevisionReferenceResolver().capture(
        workID: work.id,
        sessionID: session.id,
        revisionID: revision.id,
        in: workCatalog
      ).reference,
      let cached = searchableRootIndexes[reference.trackedRootURL.standardizedFileURL.path]
    {
      return cached
    }

    // A catalogue refresh can briefly make the reference unavailable. Preserve the same
    // most-specific-root rule from revision capture rather than resolving an arbitrary cache.
    let setPath = revision.set.fileURL.standardizedFileURL.path
    return searchableRootIndexes.values.filter { cached in
      let rootPath = cached.index.rootURL.standardizedFileURL.path
      return setPath == rootPath || setPath.hasPrefix(rootPath + "/")
    }.max {
      $0.index.rootURL.standardizedFileURL.path.count
        < $1.index.rootURL.standardizedFileURL.path.count
    }
  }

  private func selectInitialVersion(for project: StudioProject?) {
    selectedTimelineID = project?.timelines.first?.id
    selectedSetID = project?.timelines.first?.versions.first?.id
  }

  private func clearSelection() {
    selectedWorkID = nil
    selectedProjectID = nil
    selectedTimelineID = nil
    selectedSetID = nil
    selectedAssetID = nil
    selectedChainOccurrenceID = nil
    player.stop()
  }
}
