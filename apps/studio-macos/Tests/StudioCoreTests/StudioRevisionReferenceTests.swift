import Foundation
import Testing

@testable import StudioCore

@Suite("Reviewed revision references")
struct StudioRevisionReferenceTests {
  @Test("Resolves a revision from the current all-root catalogue")
  func resolvesAcrossAllTrackedRoots() throws {
    let fixture = try ReferenceFixture()
    defer { fixture.remove() }
    let first = try fixture.catalogueWork(
      rootName: "First Root", workID: "work-one", sessionID: "session-one",
      revisionID: "revision-one", setName: "One")
    let second = try fixture.catalogueWork(
      rootName: "Second Root", workID: "work-two", sessionID: "session-two",
      revisionID: "revision-two", setName: "Two")
    let catalog = fixture.catalog(
      works: [first.work, second.work], roots: [first.root, second.root])

    let resolved = try StudioRevisionReferenceResolver().capture(
      setURL: second.set.fileURL, in: catalog)

    #expect(resolved.reference.workID == "work-two")
    #expect(resolved.reference.sessionID == "session-two")
    #expect(resolved.reference.revisionID == "revision-two")
    #expect(resolved.reference.trackedRootURL == second.root.standardizedFileURL)
    #expect(resolved.reference.displaySnapshot.workName == "Two")
  }

  @Test("Captures the most-specific tracked root for a cross-root Song revision")
  func capturesMostSpecificTrackedRoot() throws {
    let fixture = try ReferenceFixture()
    defer { fixture.remove() }
    let member = try fixture.catalogueWork(
      rootName: "Nested Root", workID: "work", sessionID: "session",
      revisionID: "revision", setName: "Song")
    let catalog = fixture.catalog(
      works: [member.work], roots: [fixture.directory, member.root])

    let resolved = try StudioRevisionReferenceResolver().capture(
      setURL: member.set.fileURL,
      in: catalog
    )

    #expect(resolved.reference.trackedRootURL == member.root.standardizedFileURL)
  }

  @Test("Captures the authoritative Work after an override regrouping")
  func capturesCurrentOverrideGrouping() throws {
    let fixture = try ReferenceFixture()
    defer { fixture.remove() }
    let member = try fixture.catalogueWork(
      rootName: "Music", workID: "managed-work", sessionID: "messy-session",
      revisionID: "messy-revision", setName: "idea005")
    let managed = fixture.replacing(
      member.work, workID: "managed-work", artistName: "Demo Artist", workName: "Example Song")
    let catalog = fixture.catalog(works: [managed], roots: [member.root])

    let resolved = try StudioRevisionReferenceResolver().capture(
      setURL: member.set.fileURL, in: catalog)

    #expect(resolved.reference.workID == "managed-work")
    #expect(resolved.reference.displaySnapshot.artistName == "Demo Artist")
    #expect(resolved.reference.displaySnapshot.workName == "Example Song")
  }

  @Test("A later Work regrouping is stale and never silently reinterpreted")
  func regroupedWorkFailsClosed() throws {
    let fixture = try ReferenceFixture()
    defer { fixture.remove() }
    let original = try fixture.catalogueWork(
      rootName: "Music", workID: "work-original", sessionID: "session",
      revisionID: "revision", setName: "Song")
    let initial = fixture.catalog(works: [original.work], roots: [original.root])
    let reference = try StudioRevisionReferenceResolver().capture(
      setURL: original.set.fileURL, in: initial
    ).reference
    let regrouped = fixture.replacing(original.work, workID: "work-new")
    let current = fixture.catalog(works: [regrouped], roots: [original.root])

    #expect(
      throws: StudioRevisionReferenceError.workRegrouped(
        expectedWorkID: "work-original", currentWorkID: "work-new"
      )
    ) {
      _ = try StudioRevisionReferenceResolver().resolve(reference, in: current)
    }
  }

  @Test("Changed Set observation fails closed even when IDs and path are unchanged")
  func changedSetObservationFailsClosed() throws {
    let fixture = try ReferenceFixture()
    defer { fixture.remove() }
    let original = try fixture.catalogueWork(
      rootName: "Music", workID: "work", sessionID: "session",
      revisionID: "revision", setName: "Song")
    let initial = fixture.catalog(works: [original.work], roots: [original.root])
    let reference = try StudioRevisionReferenceResolver().capture(
      setURL: original.set.fileURL, in: initial
    ).reference
    let changedSet = fixture.replacing(
      original.set, compressedBytes: original.set.compressedBytes + 1)
    let changedWork = fixture.replacing(original.work, revisionSet: changedSet)
    let current = fixture.catalog(works: [changedWork], roots: [original.root])

    #expect(throws: StudioRevisionReferenceError.contentObservationChanged) {
      _ = try StudioRevisionReferenceResolver().resolve(reference, in: current)
    }
  }

  @Test("Live export planning validates through the current catalogue reference")
  func exportPlanRequiresCurrentCatalogueReference() throws {
    let fixture = try ReferenceFixture()
    defer { fixture.remove() }
    let member = try fixture.catalogueWork(
      rootName: "Music", workID: "work-current", sessionID: "session",
      revisionID: "revision", setName: "Song")
    let current = fixture.catalog(works: [member.work], roots: [member.root])
    let reference = try StudioRevisionReferenceResolver().capture(
      setURL: member.set.fileURL, in: current
    ).reference
    let plan = AbletonExportPlan(
      setID: reference.setID, revisionID: reference.revisionID,
      workID: reference.workID, workName: reference.displaySnapshot.workName,
      setURL: reference.setURL,
      installation: AbletonLiveInstallation(
        id: "live", applicationURL: URL(fileURLWithPath: "/Applications/Live.app"),
        displayName: "Live", bundleIdentifier: "com.ableton.live", version: "12.4.2",
        majorVersion: 12),
      source: .main, arrangementRange: AbletonArrangementRange(startBeat: 0, endBeat: 16),
      pcmFormat: .wav, sampleRate: .hz48000, bitDepth: .int24, normalize: false,
      includeReturnAndMainEffects: true,
      destination: AbletonExportDestination(
        directoryURL: fixture.directory, baseName: "Song Master",
        expectedOutputFileNames: ["Song Master.wav"]),
      revisionReference: reference)

    try AbletonExportPlanValidator().validate(plan, in: current)
    let regrouped = fixture.catalog(
      works: [fixture.replacing(member.work, workID: "work-regrouped")], roots: [member.root])
    #expect(
      throws: StudioRevisionReferenceError.workRegrouped(
        expectedWorkID: "work-current", currentWorkID: "work-regrouped"
      )
    ) {
      try AbletonExportPlanValidator().validate(plan, in: regrouped)
    }
  }

  @Test("A failed catalogue rebuild leaves no authority for the previous catalogue")
  func failedRebuildCannotReusePreviousCatalogue() throws {
    let fixture = try ReferenceFixture()
    defer { fixture.remove() }
    let member = try fixture.catalogueWork(
      rootName: "Music", workID: "work", sessionID: "session",
      revisionID: "revision", setName: "Song")
    let catalog = fixture.catalog(works: [member.work], roots: [member.root])
    let authority = StudioRevisionExecutionAuthority()
    authority.activate(generationID: "successful-generation", catalog: catalog)
    let reference = try authority.capture(setURL: member.set.fileURL).reference
    let plan = fixture.exportPlan(reference: reference)

    authority.invalidate()

    #expect(throws: StudioRevisionReferenceError.catalogueRefreshInProgress) {
      _ = try authority.capture(setURL: member.set.fileURL)
    }
    #expect(throws: StudioRevisionReferenceError.catalogueRefreshInProgress) {
      try authority.validate(plan: plan)
    }
    #expect(throws: StudioRevisionReferenceError.catalogueGenerationChanged) {
      try authority.authorize(
        plan: plan,
        approval: AbletonExportApproval(
          planID: plan.id, catalogueGenerationID: "successful-generation"))
    }
  }
}

private final class ReferenceFixture {
  struct Member {
    let root: URL
    let set: AbletonSet
    let work: StudioWork
  }

  let directory: URL

  init() throws {
    directory = try TestSupport.temporaryDirectory()
  }

  func remove() { try? FileManager.default.removeItem(at: directory) }

  func catalogueWork(
    rootName: String, workID: String, sessionID: String, revisionID: String, setName: String
  ) throws -> Member {
    let root = directory.appending(path: rootName, directoryHint: .isDirectory)
    let sessionRoot = root.appending(path: sessionID, directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: sessionRoot, withIntermediateDirectories: true)
    let setURL = sessionRoot.appending(path: "\(setName).als")
    try Data("\(setName)-content".utf8).write(to: setURL)
    let set = AbletonSet(
      id: "set-\(revisionID)", fileURL: setURL, displayName: setName, isBackup: false,
      modifiedAt: Date(timeIntervalSince1970: 100), compressedBytes: 128, xmlBytes: 256,
      creator: "Ableton Live 12",
      format: AbletonFormat(
        majorVersion: "5", minorVersion: "12", schemaChangeCount: 1, revision: nil),
      structure: SetStructure())
    let revision = StudioSetRevision(
      id: revisionID, set: set, revisionLabel: "1.0",
      timestamp: RevisionTimestamp(
        value: set.modifiedAt, source: .fileModificationTime, confidence: .automatic,
        explanation: "fixture"))
    let session = StudioSession(
      id: sessionID, rootURL: sessionRoot, displayName: sessionID, role: .production,
      canonicalTitle: setName, canonicalTitleKey: setName.lowercased(), titleEvidence: [],
      revisions: [revision], previewAssets: [])
    let artist = ArtistIdentity(
      id: "artist-\(workID)", displayName: "Artist", confidence: .automatic, evidence: [])
    let work = StudioWork(
      id: workID, artist: artist, displayName: setName, canonicalKey: setName.lowercased(),
      confidence: .automatic, evidence: [], sessions: [session])
    return Member(root: root, set: set, work: work)
  }

  func catalog(works: [StudioWork], roots: [URL]) -> WorkCatalog {
    WorkCatalog(
      generatedAt: Date(timeIntervalSince1970: 200), algorithmVersion: "test-v1",
      sourceRoots: roots, works: works, reviewQueue: [])
  }

  func replacing(
    _ work: StudioWork, workID: String? = nil, artistName: String? = nil,
    workName: String? = nil, revisionSet: AbletonSet? = nil
  ) -> StudioWork {
    let sessions = work.sessions.map { session in
      StudioSession(
        id: session.id, rootURL: session.rootURL, displayName: session.displayName,
        role: session.role, canonicalTitle: session.canonicalTitle,
        canonicalTitleKey: session.canonicalTitleKey, titleEvidence: session.titleEvidence,
        revisions: session.revisions.map { revision in
          StudioSetRevision(
            id: revision.id, set: revisionSet ?? revision.set,
            revisionLabel: revision.revisionLabel,
            filenameInterpretation: revision.filenameInterpretation,
            qualifierDecisions: revision.qualifierDecisions, timestamp: revision.timestamp)
        }, previewAssets: session.previewAssets)
    }
    return StudioWork(
      id: workID ?? work.id,
      artist: ArtistIdentity(
        id: work.artist.id, displayName: artistName ?? work.artist.displayName,
        confidence: work.artist.confidence, evidence: work.artist.evidence),
      displayName: workName ?? work.displayName, canonicalKey: work.canonicalKey,
      confidence: work.confidence, evidence: work.evidence, sessions: sessions)
  }

  func replacing(_ set: AbletonSet, compressedBytes: Int64) -> AbletonSet {
    AbletonSet(
      id: set.id, fileURL: set.fileURL, displayName: set.displayName, isBackup: set.isBackup,
      modifiedAt: set.modifiedAt, compressedBytes: compressedBytes, xmlBytes: set.xmlBytes,
      creator: set.creator, format: set.format, structure: set.structure, content: set.content)
  }

  func exportPlan(reference: StudioRevisionReference) -> AbletonExportPlan {
    AbletonExportPlan(
      setID: reference.setID, revisionID: reference.revisionID,
      workID: reference.workID, workName: reference.displaySnapshot.workName,
      setURL: reference.setURL,
      installation: AbletonLiveInstallation(
        id: "live", applicationURL: URL(fileURLWithPath: "/Applications/Live.app"),
        displayName: "Live", bundleIdentifier: "com.ableton.live", version: "12.4.2",
        majorVersion: 12),
      source: .main, arrangementRange: AbletonArrangementRange(startBeat: 0, endBeat: 16),
      pcmFormat: .wav, sampleRate: .hz48000, bitDepth: .int24, normalize: false,
      includeReturnAndMainEffects: true,
      destination: AbletonExportDestination(
        directoryURL: directory, baseName: "Song Master",
        expectedOutputFileNames: ["Song Master.wav"]),
      revisionReference: reference)
  }
}
