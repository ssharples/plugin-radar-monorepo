import Foundation
import Testing

@testable import StudioCore

struct SampleLibraryTests {
  @Test func overlappingLocationsDeduplicateAndSecondScanReusesMetadata() throws {
    let root = try TestSupport.temporaryDirectory()
    let pack = root.appending(path: "Pack One", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: pack, withIntermediateDirectories: true)
    let sampleURL = pack.appending(path: "Kick.wav")
    try minimalWAV().write(to: sampleURL)
    let database = try database(in: root)
    let rootLocation = try database.registerLocation(root, securityScopedBookmark: nil)
    let packLocation = try database.registerLocation(pack, securityScopedBookmark: nil)
    let indexer = SampleLibraryIndexer()

    let first = try indexer.scan(location: rootLocation, projectRoots: [], database: database)
    let overlap = try indexer.scan(location: packLocation, projectRoots: [], database: database)
    let second = try indexer.scan(location: rootLocation, projectRoots: [], database: database)
    let result = try database.querySamples()

    #expect(first.discoveredFileCount == 1)
    #expect(first.metadataReadCount == 1)
    #expect(overlap.discoveredFileCount == 1)
    #expect(result.totalCount == 1)
    #expect(second.reusedMetadataCount == 1)
    #expect(result.rows[0].classification == .externalLibraryOriginal)
  }

  @Test func importedProjectAudioDoesNotClaimCollectedSourceWithoutEvidence() throws {
    let root = try TestSupport.temporaryDirectory()
    let project = root.appending(path: "Song Project", directoryHint: .isDirectory)
    let imported = project.appending(path: "Samples/Imported", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: imported, withIntermediateDirectories: true)
    let sampleURL = imported.appending(path: "Shared.wav")
    try minimalWAV().write(to: sampleURL)
    let database = try database(in: root)
    let location = try database.registerLocation(root, securityScopedBookmark: nil)

    _ = try SampleLibraryIndexer().scan(
      location: location, projectRoots: [project], database: database)
    let row = try #require(database.querySamples().rows.first)

    #expect(row.classification == .projectImported)
    #expect(row.classification != .collectedProjectCopy)
    #expect(row.classificationExplanation.contains("not proven"))
  }

  @Test func collectedFolderRemainsUnverifiedUntilContentMatch() throws {
    let root = try TestSupport.temporaryDirectory()
    let project = root.appending(path: "Song Project", directoryHint: .isDirectory)
    let collected = project.appending(path: "Samples/Collected", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: collected, withIntermediateDirectories: true)
    try minimalWAV().write(to: collected.appending(path: "Renamed.wav"))
    let database = try database(in: root)
    let location = try database.registerLocation(root, securityScopedBookmark: nil)

    _ = try SampleLibraryIndexer().scan(
      location: location, projectRoots: [project], database: database)
    let row = try #require(database.querySamples().rows.first)

    #expect(row.classification == .projectImported)
    #expect(row.classificationExplanation.contains("unverified"))
  }

  @Test func usageAggregationKeepsPhysicalCountsAndContainingTrackChain() throws {
    let root = try TestSupport.temporaryDirectory()
    let sampleURL = root.appending(path: "Library/Hit.wav")
    try FileManager.default.createDirectory(
      at: sampleURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    try minimalWAV().write(to: sampleURL)
    let database = try database(in: root)
    let location = try database.registerLocation(
      sampleURL.deletingLastPathComponent(), securityScopedBookmark: nil)
    _ = try SampleLibraryIndexer().scan(location: location, projectRoots: [], database: database)
    let sampleID = try #require(database.querySamples().rows.first?.id)
    let reference = MediaReference(absolutePath: sampleURL.path, relativePath: nil)
    let clip = SetClip(
      id: "clip", xmlID: "1", kind: .audio, placement: .session, name: "Hit clip",
      startBeat: 0, endBeat: 4, loopStartBeat: 0, loopEndBeat: 4,
      loopEnabled: true, isWarped: true, warpMode: 2, warpMarkerCount: 3,
      midiNoteCount: 0, sampleReference: reference)
    let device = SetDevice(
      id: "device", xmlID: "2", kind: .vst3, typeName: "PluginDevice",
      displayName: "Channel EQ", isEnabled: true,
      plugin: PluginIdentity(
        format: .vst3, name: "Channel EQ", manufacturer: "Example",
        identifier: "example.eq"),
      stateDigest: "state", nestedDevices: [], resourceReferences: [])
    let track = SetTrack(
      id: "track", xmlID: "3", kind: .audio, name: "DRUMS", colorIndex: nil,
      groupTrackXMLID: nil, isFolded: false, mixer: TrackMixerState(),
      devices: [device], clips: [clip])
    let dependency = MediaDependency(
      id: "dep", kind: .clipAudio, reference: reference, resolvedURL: sampleURL,
      availability: .available, ownerID: clip.id)
    let set = AbletonSet(
      id: "set", fileURL: root.appending(path: "Song.als"), displayName: "Song",
      isBackup: false, modifiedAt: Date(timeIntervalSince1970: 123), compressedBytes: 1,
      xmlBytes: 2, creator: "Live",
      format: AbletonFormat(
        majorVersion: "12", minorVersion: nil, schemaChangeCount: nil, revision: nil),
      structure: SetStructure(),
      content: AbletonSetContent(tracks: [track], dependencies: [dependency]))
    let project = StudioProject(
      id: "session", rootURL: root, displayName: "Physical Session",
      timelines: [SetTimeline(id: "timeline", displayName: "Song", versions: [set])],
      previewAssets: [])
    let index = StudioLibraryIndex(
      rootURL: root, scannedAt: Date(), projects: [project],
      unassignedAudioAssets: [], issues: [])
    let aggregation = SampleUsageAggregator().aggregate(
      indexes: [index], sampleIDsByPath: [sampleURL.standardizedFileURL.path: sampleID],
      worksBySessionID: ["session": LogicalWorkIdentity(id: "work", displayName: "Song")])

    try database.replaceUsage(aggregation, coverageComplete: true)
    let row = try #require(database.querySamples().rows.first)
    let occurrence = try #require(database.occurrences(for: sampleID).first)

    #expect(row.workCount == 1)
    #expect(row.sessionCount == 1)
    #expect(row.setCount == 1)
    #expect(row.occurrenceCount == 1)
    #expect(occurrence.placement == .session)
    #expect(occurrence.isWarped == true)
    #expect(occurrence.deviceChain.map(\.displayName) == ["Channel EQ"])
  }

  @Test func unresolvedWorksAreNotRelabeledPhysicalProjects() throws {
    let root = try TestSupport.temporaryDirectory()
    let database = try database(in: root)
    let sampleURL = root.appending(path: "Missing.wav")
    let sampleID = StableID.forValue("sample:\(sampleURL.path)")
    let occurrence = SampleUsageOccurrence(
      id: "use", sampleID: sampleID, workID: nil, workName: nil,
      sessionID: "physical", sessionName: "Physical Project", timelineID: "timeline",
      setID: "set", setName: "Set", setURL: root.appending(path: "Set.als"),
      setModifiedAt: nil, trackID: "track", trackName: "Audio", clipID: "clip",
      clipName: "Missing", placement: .arrangement, isWarped: nil, warpMode: nil,
      warpMarkerCount: 0, deviceChain: [])
    let seed = SampleResourceSeed(
      fileURL: sampleURL, name: sampleURL.lastPathComponent,
      locationName: "Referenced by Set", packName: root.lastPathComponent,
      classification: .missingReference,
      classificationExplanation: "Missing parsed dependency", availability: .missing,
      metadata: SampleMetadataReader().missing(format: "wav"))
    try database.replaceUsage(
      SampleUsageAggregation(occurrences: [occurrence], referencedSamples: [seed]),
      coverageComplete: false)
    let result = try database.querySamples()
    let row = try #require(result.rows.first)

    #expect(row.workCount == nil)
    #expect(row.sessionCount == 1)
    #expect(result.usageCoverageComplete == false)
  }

  @Test func ftsSearchAndSortStayInDatabase() throws {
    let root = try TestSupport.temporaryDirectory()
    let database = try database(in: root)
    let location = try database.registerLocation(root, securityScopedBookmark: nil)
    for (name, bytes) in [("Dusty Kick.wav", 44), ("Bright Hat.wav", 88)] {
      let url = root.appending(path: name)
      var data = minimalWAV()
      data.append(Data(repeating: 0, count: bytes))
      try data.write(to: url)
    }
    _ = try SampleLibraryIndexer().scan(location: location, projectRoots: [], database: database)

    let searched = try database.querySamples(SampleQuery(searchText: "dust kick"))
    let sorted = try database.querySamples(
      SampleQuery(sortField: .size, direction: .descending))

    #expect(searched.rows.map(\.name) == ["Dusty Kick.wav"])
    #expect(sorted.rows.map(\.name) == ["Bright Hat.wav", "Dusty Kick.wav"])
  }

  @Test func copyVerificationIsStagedAndCollectedClassificationStaysTruthful() throws {
    let root = try TestSupport.temporaryDirectory()
    let externalRoot = root.appending(path: "External", directoryHint: .isDirectory)
    let projectRoot = root.appending(path: "Song Project", directoryHint: .isDirectory)
    let importedRoot = projectRoot.appending(path: "Samples/Imported", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: externalRoot, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: importedRoot, withIntermediateDirectories: true)
    let external = externalRoot.appending(path: "Kick.wav")
    let imported = importedRoot.appending(path: "Kick.wav")
    let bytes = minimalWAV() + Data(repeating: 7, count: 80_000)
    try bytes.write(to: external)
    try bytes.write(to: imported)
    let database = try database(in: root)
    let externalLocation = try database.registerLocation(externalRoot, securityScopedBookmark: nil)
    let projectLocation = try database.registerLocation(projectRoot, securityScopedBookmark: nil)
    _ = try SampleLibraryIndexer().scan(
      location: externalLocation, projectRoots: [projectRoot], database: database)
    _ = try SampleLibraryIndexer().scan(
      location: projectLocation, projectRoots: [projectRoot], database: database)
    let before = try database.querySamples()
    let externalID = try #require(
      before.rows.first { $0.classification == .externalLibraryOriginal }?.id)
    let importedID = try #require(before.rows.first { $0.classification == .projectImported }?.id)

    let reviews = try SampleCopyMatcher().verifyCandidates(
      for: externalID, database: database)
    let after = try database.querySamples()

    #expect(reviews.contains { $0.evidence.relationship == .exactDuplicateOf })
    #expect(reviews.contains { $0.evidence.relationship == .possibleSourceOf })
    #expect(after.rows.first { $0.id == importedID }?.classification == .collectedProjectCopy)
    let ambiguous = try #require(reviews.first { $0.evidence.relationship == .possibleSourceOf })
    try database.saveReviewDecision(evidenceID: ambiguous.id, accepted: false)
    #expect(
      try database.matchReviews(for: externalID).first { $0.id == ambiguous.id }?.evidence
        .userDecision == false)
  }

  private func database(in directory: URL) throws -> SampleLibraryDatabase {
    try SampleLibraryDatabase(storageURL: directory.appending(path: "samples.sqlite"))
  }

  private func minimalWAV() -> Data {
    Data([
      0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6D, 0x74, 0x20, 0x10, 0, 0, 0, 1, 0, 1, 0,
      0x44, 0xAC, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0,
      0x64, 0x61, 0x74, 0x61, 0, 0, 0, 0,
    ])
  }
}
