import Foundation
import Testing

@testable import StudioCore

@Suite("Deterministic Work catalogue")
struct WorkCatalogResolverTests {
  @Test("Groups the five Example Song Sessions without losing physical Sets")
  func exampleSongGoldenFixture() throws {
    let root = URL(fileURLWithPath: "/Library/Engineering", isDirectory: true)
    let base = root.appending(path: "DEMO ARTIST", directoryHint: .isDirectory)
    let projects = [
      project(
        base: base,
        path: "EXAMPLE SONG/EXAMPLE SONG DECEMBER/EXAMPLE SONG 1.1 Project",
        sets: [
          ("EXAMPLE SONG 1.1", false, 1_600_000_000),
          ("EXAMPLE SONG 1.7", false, 1_600_100_000),
          ("EXAMPLE SONG 1.7 [2020-12-22 133932]", true, 1_600_110_000),
        ]
      ),
      project(
        base: base,
        path: "EXAMPLE SONG/EXAMPLE SONG SET/EXAMPLE SONG Project",
        sets: [
          ("EXAMPLE SONG", false, 1_600_200_000),
          ("EXAMPLE SONG 1.2", false, 1_600_300_000),
        ]
      ),
      project(
        base: base,
        path: "EXAMPLE SONG/EXAMPLE SONG Project",
        sets: [
          ("EXAMPLE SONG", false, 1_600_400_000),
          ("EXAMPLE SONG 12th march", false, 1_600_500_000),
        ]
      ),
      project(
        base: base,
        path: "• FINAL ALBUM FILES •/1. EXAMPLE SONG/1. EXAMPLE SONG 1.1 Project",
        sets: [
          ("1. EXAMPLE SONG 1.1", false, 1_600_600_000),
          ("\\", false, 1_600_600_060),
          ("1. EXAMPLE SONG 1.1 [2020-04-29 200215]", true, 1_600_610_000),
        ]
      ),
      project(
        base: base,
        path: "EXAMPLE SONG/EXAMPLE SONG MIX Project",
        sets: [
          ("EXAMPLE SONG MIX", false, 1_600_700_000),
          ("EXAMPLE SONG MIX [2020-07-24 155104]", true, 1_600_710_000),
        ]
      ),
    ]
    let index = StudioLibraryIndex(
      rootURL: root,
      scannedAt: Date(timeIntervalSince1970: 1_601_000_000),
      projects: projects,
      unassignedAudioAssets: [],
      issues: []
    )

    let catalog = WorkCatalogResolver().resolve(
      indexes: [index],
      generatedAt: Date(timeIntervalSince1970: 1_601_000_000)
    )

    let work = try #require(catalog.works.first)
    #expect(catalog.works.count == 1)
    #expect(work.artist.displayName == "DEMO ARTIST")
    #expect(work.displayName == "EXAMPLE SONG")
    #expect(work.sessions.count == 5)
    #expect(work.sessions.flatMap(\.revisions).count == 12)
    #expect(work.confidence == .automatic)
    #expect(work.sessions.contains(where: { $0.role == .mix }))
    let unusual = try #require(
      work.sessions.flatMap(\.revisions).first(where: { $0.set.displayName == "\\" }))
    #expect(unusual.timestamp.source == .fileModificationTime)
    #expect(unusual.set.fileURL.lastPathComponent == "\\.als")
    let backup = try #require(
      work.sessions.flatMap(\.revisions).first(where: {
        $0.set.displayName.contains("2020-04-29 200215")
      }))
    #expect(backup.timestamp.source == .embeddedBackupFilename)
    #expect(catalog.reviewQueue.isEmpty)
  }

  @Test("Keeps unknown-owner matches separate and queues only same-owner fuzzy titles")
  func conservativeMatching() {
    let downloads = URL(fileURLWithPath: "/Downloads", isDirectory: true)
    let first = project(base: downloads, path: "Shared Song", sets: [("Shared Song", false, 10)])
    let second = project(
      base: downloads, path: "Elsewhere/Shared Song", sets: [("Shared Song", false, 20)])
    let unknownIndex = StudioLibraryIndex(
      rootURL: downloads,
      scannedAt: Date(),
      projects: [first, second],
      unassignedAudioAssets: [],
      issues: []
    )
    let unknownCatalog = WorkCatalogResolver().resolve(indexes: [unknownIndex])
    #expect(unknownCatalog.works.count == 2)
    #expect(unknownCatalog.reviewQueue.isEmpty)

    let engineering = URL(fileURLWithPath: "/Music/Engineering", isDirectory: true)
    let artist = engineering.appending(path: "Artist", directoryHint: .isDirectory)
    let exact = project(
      base: artist,
      path: "Example Light Project",
      sets: [("Example Light", false, 10)]
    )
    let typo = project(
      base: artist,
      path: "Exampl Light Project",
      sets: [("Exampl Light", false, 20)]
    )
    let knownIndex = StudioLibraryIndex(
      rootURL: engineering,
      scannedAt: Date(),
      projects: [exact, typo],
      unassignedAudioAssets: [],
      issues: []
    )
    let knownCatalog = WorkCatalogResolver().resolve(indexes: [knownIndex])
    #expect(knownCatalog.works.count == 2)
    #expect(knownCatalog.reviewQueue.count == 1)
    #expect(knownCatalog.reviewQueue[0].confidence == .suggested)
  }

  @Test("Treats spacing and version suffixes as deterministic context")
  func compactedAndVersionedTitles() {
    let root = URL(fileURLWithPath: "/Music/Engineering", isDirectory: true)
    let artist = root.appending(path: "Artist", directoryHint: .isDirectory)
    let spaced = project(
      base: artist,
      path: "EXAMPLE TITLE Project",
      sets: [("EXAMPLE TITLE", false, 10)]
    )
    let compacted = project(
      base: artist,
      path: "EXAMPLETITLE V2 Project",
      sets: [("EXAMPLETITLE V2", false, 20)]
    )
    let dated = project(
      base: artist,
      path: "EXAMPLETITLE 1.4 march 12th Project",
      sets: [("EXAMPLETITLE 1.4 march 12th", false, 30)]
    )
    let ownerPrefixed = project(
      base: artist,
      path: "Artist - EXAMPLE TITLE VERSION 2 Project",
      sets: [("Artist - EXAMPLE TITLE VERSION 2", false, 40)]
    )
    let index = StudioLibraryIndex(
      rootURL: root,
      scannedAt: Date(),
      projects: [spaced, compacted, dated, ownerPrefixed],
      unassignedAudioAssets: [],
      issues: []
    )
    let catalog = WorkCatalogResolver().resolve(indexes: [index])
    #expect(catalog.works.count == 1)
    #expect(catalog.works[0].sessions.count == 4)
  }

  @Test("Durable overrides can assign and separate Sessions")
  func overrides() throws {
    let root = URL(fileURLWithPath: "/Downloads", isDirectory: true)
    let first = project(base: root, path: "Folder A", sets: [("Song alpha", false, 10)])
    let second = project(base: root, path: "Folder B", sets: [("Other title", false, 20)])
    let index = StudioLibraryIndex(
      rootURL: root,
      scannedAt: Date(),
      projects: [first, second],
      unassignedAudioAssets: [],
      issues: []
    )
    let merged = WorkCatalogResolver().resolve(
      indexes: [index],
      overrides: OrganisationOverrides(sessionOverrides: [
        SessionOrganisationOverride(
          sessionID: first.id,
          artistName: "Client",
          workName: "Canonical Song",
          groupingKey: "client-canonical-song"
        ),
        SessionOrganisationOverride(
          sessionID: second.id,
          artistName: "Client",
          workName: "Canonical Song",
          groupingKey: "client-canonical-song"
        ),
      ])
    )
    #expect(merged.works.count == 1)
    #expect(merged.works[0].confidence == .confirmed)
    #expect(merged.works[0].sessions.count == 2)

    let separated = WorkCatalogResolver().resolve(
      indexes: [index],
      overrides: OrganisationOverrides(sessionOverrides: [
        SessionOrganisationOverride(
          sessionID: first.id,
          artistName: "Client",
          workName: "Canonical Song",
          groupingKey: "client-canonical-song"
        ),
        SessionOrganisationOverride(
          sessionID: second.id,
          artistName: "Client",
          workName: "Canonical Song",
          groupingKey: "client-canonical-song",
          keepSeparate: true
        ),
      ])
    )
    #expect(separated.works.count == 2)
  }

  @Test("Persists override decisions atomically")
  func overridePersistence() async throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let storageURL = directory.appending(path: "Organisation/overrides.plist")
    let store = OrganisationOverrideStore(storageURL: storageURL)
    let decision = SessionOrganisationOverride(
      sessionID: "session-a",
      artistName: "Client",
      workName: "Song",
      groupingKey: "client-song"
    )
    _ = try await store.upsert(decision)
    #expect(FileManager.default.fileExists(atPath: storageURL.path))

    let reloaded = OrganisationOverrideStore(storageURL: storageURL)
    let loaded = try await reloaded.load()
    #expect(loaded.sessionOverrides.count == 1)
    #expect(loaded.sessionOverrides[0].workName == "Song")

    let empty = try await reloaded.remove(sessionID: "session-a")
    #expect(empty.sessionOverrides.isEmpty)
  }

  @Test("Renders auditable Markdown without losing paths")
  func report() {
    let root = URL(fileURLWithPath: "/Music/Engineering", isDirectory: true)
    let artist = root.appending(path: "DEMO ARTIST", directoryHint: .isDirectory)
    let index = StudioLibraryIndex(
      rootURL: root,
      scannedAt: Date(),
      projects: [project(base: artist, path: "Song Project", sets: [("Song 1.1", false, 10)])],
      unassignedAudioAssets: [],
      issues: []
    )
    let markdown = WorkCatalogReport.markdown(
      WorkCatalogResolver().resolve(indexes: [index], generatedAt: Date(timeIntervalSince1970: 0)))
    #expect(markdown.contains("# Studio organisation corpus report"))
    #expect(markdown.contains("DEMO ARTIST"))
    #expect(markdown.contains("/Music/Engineering/DEMO ARTIST/Song Project"))
    #expect(markdown.contains("File Modification Time"))
  }

  @Test("Falls through generic album folders to meaningful Work ancestry")
  func genericFolderFallback() throws {
    let root = URL(fileURLWithPath: "/Music/Engineering", isDirectory: true)
    let artist = root.appending(path: "DEMO ARTIST", directoryHint: .isDirectory)
    let session = project(
      base: artist,
      path: "• FINAL ALBUM FILES •/11. EXAMPLE ALBUM CUT/STEMS 1.2/_ Project",
      sets: [("_", false, 10)]
    )
    let index = StudioLibraryIndex(
      rootURL: root,
      scannedAt: Date(),
      projects: [session],
      unassignedAudioAssets: [],
      issues: []
    )
    let work = try #require(WorkCatalogResolver().resolve(indexes: [index]).works.first)
    #expect(work.displayName == "EXAMPLE ALBUM CUT")
    #expect(work.confidence == .automatic)
  }

  @Test("Deduplicates physical Sessions across overlapping tracked roots")
  func overlappingRoots() throws {
    let music = URL(fileURLWithPath: "/Music", isDirectory: true)
    let engineering = music.appending(path: "Engineering", directoryHint: .isDirectory)
    let artist = engineering.appending(path: "Artist", directoryHint: .isDirectory)
    let session = project(base: artist, path: "Song Project", sets: [("Song", false, 10)])
    let broad = StudioLibraryIndex(
      rootURL: music,
      scannedAt: Date(),
      projects: [session],
      unassignedAudioAssets: [],
      issues: []
    )
    let specific = StudioLibraryIndex(
      rootURL: engineering,
      scannedAt: Date(),
      projects: [session],
      unassignedAudioAssets: [],
      issues: []
    )
    let catalog = WorkCatalogResolver().resolve(indexes: [broad, specific])
    let work = try #require(catalog.works.first)
    #expect(catalog.works.count == 1)
    #expect(work.sessions.count == 1)
    #expect(work.artist.displayName == "Artist")
  }

  @Test("Recognises an Engineering artist boundary beneath a broader Music root")
  func nestedEngineeringRoot() throws {
    let music = URL(fileURLWithPath: "/Music", isDirectory: true)
    let artist = music.appending(
      path: "Engineering/DEMO ARTIST", directoryHint: .isDirectory)
    let first = project(
      base: artist, path: "Final/1. EXAMPLE SONG 1.1 Project",
      sets: [("EXAMPLE SONG 1.1", false, 10)])
    let second = project(
      base: artist, path: "Elsewhere/EXAMPLE SONG MIX Project",
      sets: [("EXAMPLE SONG MIX", false, 20)])
    let index = StudioLibraryIndex(
      rootURL: music, scannedAt: Date(), projects: [first, second],
      unassignedAudioAssets: [], issues: [])

    let work = try #require(WorkCatalogResolver().resolve(indexes: [index]).works.first)
    #expect(work.artist.displayName == "DEMO ARTIST")
    #expect(work.displayName == "EXAMPLE SONG")
    #expect(work.sessions.count == 2)
  }

  @Test("Manual Artist and Song assignments organise unrelated messy folders")
  func manualDirectoryAssignments() throws {
    let root = URL(fileURLWithPath: "/Downloads", isDirectory: true)
    let first = project(base: root, path: "stuff 2024", sets: [("idea_91", false, 10)])
    let second = project(base: root, path: "untitled copy", sets: [("final-new-2", false, 20)])
    let artist = StudioArtistRecord(id: "artist-demo-artist", displayName: "DEMO ARTIST")
    let managedWork = StudioWorkRecord(
      id: "work-example-song", artistID: artist.id, displayName: "EXAMPLE SONG")
    let directory = StudioOrganisationDirectory(
      artists: [artist],
      works: [managedWork],
      sessionAssignments: [
        StudioSessionAssignment(sessionID: first.id, workID: managedWork.id),
        StudioSessionAssignment(sessionID: second.id, workID: managedWork.id),
      ])
    let index = StudioLibraryIndex(
      rootURL: root, scannedAt: Date(), projects: [first, second],
      unassignedAudioAssets: [], issues: [])

    let catalog = WorkCatalogResolver().resolve(indexes: [index], directory: directory)
    let work = try #require(catalog.works.first)
    #expect(catalog.works.count == 1)
    #expect(work.id == managedWork.id)
    #expect(work.artist.id == artist.id)
    #expect(work.artist.displayName == "DEMO ARTIST")
    #expect(work.displayName == "EXAMPLE SONG")
    #expect(work.sessions.count == 2)
    #expect(work.confidence == .confirmed)
  }

  @Test("Persists Artist directory, Songs, and Session assignments atomically")
  func organisationDirectoryPersistence() async throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let storageURL = directory.appending(path: "Organisation/studio-organisation.plist")
    let store = StudioOrganisationStore(storageURL: storageURL)

    let artist = try await store.createArtist(displayName: "DEMO ARTIST")
    let work = try await store.createWork(artistID: artist.id, displayName: "EXAMPLE SONG")
    let assignment = try await store.assign(sessionID: "session-one", to: work.id)
    #expect(assignment.workID == work.id)

    let reloaded = try await StudioOrganisationStore(storageURL: storageURL).load()
    #expect(reloaded.artists == [artist])
    #expect(reloaded.works == [work])
    #expect(reloaded.sessionAssignments == [assignment])
    await #expect(throws: StudioOrganisationStoreError.duplicateArtist("demo artist")) {
      try await store.createArtist(displayName: "demo artist")
    }
  }

  private func project(
    base: URL,
    path: String,
    sets: [(name: String, backup: Bool, modifiedAt: TimeInterval)]
  ) -> StudioProject {
    let root = base.appending(path: path, directoryHint: .isDirectory).standardizedFileURL
    let abletonSets = sets.map { item in
      let folder = item.backup ? root.appending(path: "Backup", directoryHint: .isDirectory) : root
      let fileURL = folder.appending(path: "\(item.name).als")
      return AbletonSet(
        id: StableID.forURL(fileURL),
        fileURL: fileURL,
        displayName: item.name,
        isBackup: item.backup,
        modifiedAt: Date(timeIntervalSince1970: item.modifiedAt),
        compressedBytes: 1,
        xmlBytes: 1,
        creator: "Ableton Live 12",
        format: AbletonFormat(
          majorVersion: "5",
          minorVersion: "12.0",
          schemaChangeCount: 1,
          revision: nil
        ),
        structure: SetStructure()
      )
    }
    return StudioProject(
      id: StableID.forURL(root),
      rootURL: root,
      displayName: root.lastPathComponent,
      timelines: [
        SetTimeline(
          id: StableID.forValue("timeline:\(root.path)"),
          displayName: abletonSets.first?.displayName ?? root.lastPathComponent,
          versions: abletonSets
        )
      ],
      previewAssets: []
    )
  }
}
