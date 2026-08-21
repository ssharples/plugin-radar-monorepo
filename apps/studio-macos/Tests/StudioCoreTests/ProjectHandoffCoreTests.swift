import CoreGraphics
import CryptoKit
import Foundation
import PDFKit
import Testing

@testable import StudioCore

private func handoffCatalog(plan: ProjectHandoffPlan, set: AbletonSet) -> WorkCatalog {
  let reference = plan.revisionReference
  let revision = StudioSetRevision(
    id: reference.revisionID,
    set: set,
    revisionLabel: reference.displaySnapshot.revisionName,
    timestamp: RevisionTimestamp(
      value: set.modifiedAt,
      source: .fileModificationTime,
      confidence: .confirmed,
      explanation: "Test catalogue"))
  let session = StudioSession(
    id: reference.sessionID,
    rootURL: plan.sourceProjectURL,
    displayName: reference.displaySnapshot.sessionName,
    role: .production,
    canonicalTitle: reference.displaySnapshot.workName,
    canonicalTitleKey: reference.displaySnapshot.workName.lowercased(),
    titleEvidence: [],
    revisions: [revision],
    previewAssets: [])
  let work = StudioWork(
    id: reference.workID,
    artist: ArtistIdentity(
      id: "artist-1",
      displayName: reference.displaySnapshot.artistName,
      confidence: .confirmed,
      evidence: []),
    displayName: reference.displaySnapshot.workName,
    canonicalKey: reference.displaySnapshot.workName.lowercased(),
    confidence: .confirmed,
    evidence: [],
    sessions: [session])
  return WorkCatalog(
    generatedAt: reference.reviewedAt,
    algorithmVersion: reference.catalogueAlgorithmVersion,
    sourceRoots: [reference.trackedRootURL],
    works: [work],
    reviewQueue: [])
}

extension ProjectReadinessAuditor {
  fileprivate func audit(
    plan: ProjectHandoffPlan,
    set: AbletonSet,
    pluginInventory: PluginInventory,
    managedLibraryInventory: ProjectManagedLibraryInventory = .unknown,
    availableDiskBytes: Int64?,
    fallbackEvidence: [ProjectFallbackAudioEvidence] = [],
    auditedAt: Date = Date()
  ) throws -> ProjectReadinessAudit {
    try audit(
      plan: plan,
      set: set,
      in: handoffCatalog(plan: plan, set: set),
      pluginInventory: pluginInventory,
      managedLibraryInventory: managedLibraryInventory,
      availableDiskBytes: availableDiskBytes,
      fallbackEvidence: fallbackEvidence,
      auditedAt: auditedAt)
  }
}

@Suite("Project handoff core")
struct ProjectHandoffCoreTests {
  @Test("A handoff plan is created only from a valid current revision reference")
  func validCurrentReferenceCreatesPlan() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let plan = try ProjectHandoffPlanFactory().make(
      id: "reviewed-plan",
      setURL: fixture.set().fileURL,
      in: fixture.catalog(),
      sourceProjectURL: fixture.project,
      stagingRootURL: fixture.staging,
      mediaPolicy: .requireAvailableAndContained,
      fallbackPolicy: ProjectHandoffFallbackPolicy(mode: .none),
      selectedTrackIDs: [],
      createdAt: fixture.date)

    #expect(plan.workID == "work-1")
    #expect(plan.sessionID == "session-1")
    #expect(plan.revisionID == "revision-1")
    #expect(plan.sourceSetURL == fixture.set().fileURL.standardizedFileURL)
    #expect(plan.displaySnapshot.artist == "Artist")
    #expect(plan.displaySnapshot.song == "Song")
    #expect(plan.displaySnapshot.version == "Mix 1")
  }

  @Test("Invalid Work Session and revision combinations cannot create a handoff plan")
  func invalidIdentityCombinationIsRejected() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    #expect(throws: StudioRevisionReferenceError.revisionNotFound("revision-1")) {
      _ = try StudioRevisionReferenceResolver().capture(
        workID: "wrong-work",
        sessionID: "session-1",
        revisionID: "revision-1",
        in: fixture.catalog())
    }
  }

  @Test("A regrouped Song makes the reviewed handoff explicitly stale")
  func regroupedWorkRequiresReview() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let plan = fixture.plan
    let originalAudit = try ProjectReadinessAuditor().audit(
      plan: plan,
      set: fixture.set(),
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date)
    let regrouped = fixture.catalog(workID: "work-regrouped")

    #expect(
      throws: ProjectHandoffReferenceValidationError.requiresReview(.workRegrouped)
    ) {
      _ = try ProjectReadinessAuditor().audit(
        plan: plan,
        set: fixture.set(),
        in: regrouped,
        pluginInventory: fixture.emptyInventory,
        availableDiskBytes: 10_000,
        auditedAt: fixture.date)
    }
    #expect(
      throws: ProjectHandoffReferenceValidationError.requiresReview(.workRegrouped)
    ) {
      _ = try ProjectStagingCopyPlanner().plan(
        handoff: plan,
        in: regrouped,
        packageID: "stale-package",
        displayName: "Song",
        indexedRoots: [],
        plannedAt: fixture.date)
    }
    #expect(
      throws: ProjectHandoffReferenceValidationError.requiresReview(.workRegrouped)
    ) {
      _ = try ProjectHandoffReportGenerator().generate(
        ProjectHandoffReportInput(
          handoffPlan: plan,
          catalog: regrouped,
          audit: originalAudit,
          stagingEvidence: nil,
          stagingPlan: nil,
          generatedAt: fixture.date))
    }
  }

  @Test("A contained project with documented plug-ins is ready with limitations")
  func readyAudit() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let mediaURL = fixture.project.appending(path: "Samples/Recorded/vocal.wav")
    try fixture.write("audio", to: mediaURL)
    let set = fixture.set(
      dependencies: [fixture.dependency(id: "vocal", url: mediaURL, availability: .available)],
      plugin: fixture.plugin
    )
    let plan = fixture.handoff(stagingRoot: fixture.staging, set: set)

    let audit = try ProjectReadinessAuditor().audit(
      plan: plan,
      set: set,
      pluginInventory: fixture.installedInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(audit.assurance.media.status == .availableAtSource)
    #expect(audit.assurance.plugins.status == .documented)
    #expect(audit.assurance.fallbackAudio.status == .notRequested)
    #expect(audit.status == .readyWithLimitations)
    #expect(audit.mediaRequirements.first?.location == .containedInProject)
    #expect(audit.pluginRequirements.first?.senderStatus == .installed)
    #expect(audit.boundaryEvidence.containedOnThisMac)
    #expect(!audit.boundaryEvidence.portableToAnotherMac)
  }

  @Test("Missing Ableton-visible media needs attention")
  func missingMediaAudit() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let missingURL = fixture.project.appending(path: "Samples/Recorded/missing.wav")
    let set = fixture.set(
      dependencies: [fixture.dependency(id: "missing", url: missingURL, availability: .missing)]
    )
    let plan = fixture.handoff(stagingRoot: fixture.staging, set: set)

    let audit = try ProjectReadinessAuditor().audit(
      plan: plan,
      set: set,
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(audit.status == .needsAttention)
    #expect(audit.assurance.media.status == .needsAttention)
    #expect(audit.risks.contains(where: { $0.kind == .missingMedia }))
  }

  @Test("Managed-library status comes only from explicit inventory evidence")
  func explicitManagedLibraryEvidenceStates() throws {
    let fixture = try Fixture(pluginName: "Nebula Sampler")
    defer { fixture.remove() }

    let set = fixture.set(plugin: fixture.plugin)
    let plan = fixture.handoff(stagingRoot: fixture.staging, set: set)
    let inventories: [(ProjectManagedLibraryInventory, ProjectManagedLibraryStatus, Bool)] = [
      (
        ProjectManagedLibraryInventory(
          assessedAt: fixture.date,
          records: [
            ProjectManagedLibraryInventoryRecord(
              id: "known-library", pluginIdentifier: "audio.example.plugin", format: .vst3,
              status: .known,
              explanation:
                "Explicit local inventory identifies a separately managed sample library.")
          ]),
        .known,
        true
      ),
      (
        ProjectManagedLibraryInventory(
          assessedAt: fixture.date,
          records: [
            ProjectManagedLibraryInventoryRecord(
              id: "assessed-no-library", pluginIdentifier: "audio.example.plugin", format: .vst3,
              status: .notDetected,
              explanation: "Explicit local inventory did not detect a managed library.")
          ]),
        .notDetected,
        false
      ),
      (.unknown, .unknown, true),
    ]

    for (inventory, expectedStatus, expectsRisk) in inventories {
      let audit = try ProjectReadinessAuditor().audit(
        plan: plan,
        set: set,
        pluginInventory: fixture.installedInventory,
        managedLibraryInventory: inventory,
        availableDiskBytes: 10_000,
        auditedAt: fixture.date
      )
      #expect(audit.pluginRequirements.first?.managedLibraryStatus == expectedStatus)
      #expect(
        audit.risks.contains(where: { $0.kind == .pluginManagedLibrary }) == expectsRisk)
      #expect(audit.status == .readyWithLimitations)
    }
  }

  @Test("Unknown destination capacity is explicit and cannot produce Ready")
  func unknownDestinationCapacityIsLimited() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let audit = try ProjectReadinessAuditor().audit(
      plan: fixture.plan,
      set: fixture.set(),
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: nil,
      auditedAt: fixture.date
    )

    #expect(audit.destinationCapacityStatus == .unknown)
    #expect(audit.status == .readyWithLimitations)
    #expect(audit.boundaryEvidence.portableToAnotherMac)
    #expect(
      audit.risks.contains(where: {
        $0.kind == .unknownDiskSpace && $0.severity == .warning
      }))
    #expect(throws: Never.self) { try audit.validate() }
  }

  @Test("A fully contained source project is portable to another Mac")
  func portableProjectAudit() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let mediaURL = fixture.project.appending(path: "Samples/Imported/kick.wav")
    try fixture.write("audio", to: mediaURL)
    let set = fixture.set(
      dependencies: [fixture.dependency(id: "kick", url: mediaURL, availability: .available)]
    )

    let audit = try ProjectReadinessAuditor().audit(
      plan: fixture.handoff(stagingRoot: fixture.staging, set: set),
      set: set,
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(audit.status == .ready)
    #expect(audit.boundaryEvidence.containedOnThisMac)
    #expect(audit.boundaryEvidence.portableToAnotherMac)
    #expect(audit.boundaryEvidence.portabilitySummary.contains("portable to another Mac"))
  }

  @Test("The audit resolves the intact Project leaf from a reviewed ancestor folder")
  func ancestorProjectFolderResolvesToProjectLeaf() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let mediaURL = fixture.project.appending(path: "Samples/Imported/kick.wav")
    try fixture.write("audio", to: mediaURL)
    let set = fixture.set(
      dependencies: [fixture.dependency(id: "kick", url: mediaURL, availability: .available)]
    )

    let audit = try ProjectReadinessAuditor().audit(
      plan: fixture.handoff(stagingRoot: fixture.staging, sourceProject: fixture.root, set: set),
      set: set,
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(audit.status == .ready)
    #expect(audit.boundaryEvidence.projectLeafName == fixture.project.lastPathComponent)
    #expect(audit.boundaryEvidence.selectedSetRelativePath == "Song.als")
    #expect(audit.boundaryEvidence.projectLeafSummary.contains("resolved that Project leaf"))
  }

  @Test("Nested Ableton Project Info folders create a blocking boundary conflict")
  func conflictingProjectInfoAudit() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    try fixture.write(
      "nested-info",
      to: fixture.project.appending(path: "Archive/Ableton Project Info/Project8.cfg")
    )

    let audit = try ProjectReadinessAuditor().audit(
      plan: fixture.plan,
      set: fixture.set(),
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(audit.status == .needsAttention)
    #expect(audit.risks.contains(where: { $0.kind == .projectBoundaryConflict }))
    #expect(audit.boundaryEvidence.projectInfoStatus == .conflicting)
    #expect(audit.boundaryEvidence.containedOnThisMac == false)
    #expect(!audit.boundaryEvidence.sourceContainmentSummary.contains("intact source Project"))
  }

  @Test("Cloud placeholders permission blocks and removable volumes are classified explicitly")
  func explicitMediaClassificationsAudit() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    let placeholder = fixture.project.appending(path: "Samples/Imported/pad.wav.icloud")
    try fixture.write("placeholder", to: placeholder)

    let permissionURL = fixture.project.appending(path: "Samples/Imported/secret.wav")
    try fixture.write("audio", to: permissionURL)
    try FileManager.default.setAttributes(
      [.posixPermissions: 0o000], ofItemAtPath: permissionURL.path)
    defer {
      try? FileManager.default.setAttributes(
        [.posixPermissions: 0o644], ofItemAtPath: permissionURL.path)
    }

    let removable = URL(fileURLWithPath: "/Volumes/Fixture FieldDrive/lead.wav")
    let unknown = MediaDependency(
      id: "unknown-volume",
      kind: .clipAudio,
      reference: MediaReference(absolutePath: nil, relativePath: nil),
      resolvedURL: nil,
      availability: .unresolved,
      ownerID: "track-1"
    )
    let set = fixture.set(
      dependencies: [
        fixture.dependency(id: "placeholder", url: placeholder, availability: .available),
        fixture.dependency(id: "permission", url: permissionURL, availability: .available),
        fixture.dependency(id: "removable", url: removable, availability: .available),
        unknown,
      ]
    )

    let audit = try ProjectReadinessAuditor().audit(
      plan: fixture.handoff(stagingRoot: fixture.staging, set: set),
      set: set,
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(
      audit.mediaRequirements.contains(where: {
        $0.id == "placeholder" && $0.location == .cloudPlaceholder
      }))
    #expect(
      audit.mediaRequirements.contains(where: {
        $0.id == "permission" && $0.location == .permissionBlocked
      }))
    #expect(
      audit.mediaRequirements.contains(where: {
        $0.id == "removable" && $0.location == .removableVolumeDependent
      }))
    #expect(audit.mediaRequirements.first(where: { $0.id == "removable" })?.volumeState == .offline)
    #expect(
      audit.mediaRequirements.first(where: { $0.id == "placeholder" })?.fileValidation
        == .notValidated)
    #expect(
      audit.mediaRequirements.first(where: { $0.id == "unknown-volume" })?.volumeState == .unknown)
  }

  @Test("Available embedded media must exist and be readable non-empty stable files")
  func embeddedFileValidationFailsClosed() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let missing = fixture.project.appending(path: "Samples/Imported/missing.wav")
    let empty = fixture.project.appending(path: "Samples/Imported/empty.wav")
    try fixture.write("", to: empty)
    let set = fixture.set(dependencies: [
      fixture.dependency(id: "missing", url: missing, availability: .available),
      fixture.dependency(id: "empty", url: empty, availability: .available),
    ])

    let audit = try ProjectReadinessAuditor().audit(
      plan: fixture.handoff(stagingRoot: fixture.staging, set: set),
      set: set,
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(audit.status == .needsAttention)
    #expect(audit.mediaRequirements.first(where: { $0.id == "missing" })?.location == .missing)
    #expect(
      audit.mediaRequirements.first(where: { $0.id == "missing" })?.fileValidation == .missing)
    #expect(
      audit.mediaRequirements.first(where: { $0.id == "empty" })?.location == .invalidEmbeddedFile)
    #expect(audit.mediaRequirements.first(where: { $0.id == "empty" })?.fileValidation == .empty)
    #expect(audit.risks.contains(where: { $0.kind == .invalidEmbeddedMedia }))
  }

  @Test("A file that changes during validation is never treated as contained")
  func changingEmbeddedFileFailsClosed() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let media = fixture.project.appending(path: "Samples/Recorded/race.wav")
    try fixture.write("audio", to: media)
    let set = fixture.set(dependencies: [
      fixture.dependency(id: "race", url: media, availability: .available)
    ])
    let auditor = ProjectReadinessAuditor(
      fallbackFileVerifier: ProjectFallbackFileVerifier(),
      mediaFileValidator: StubMediaFileValidator(result: .changedDuringAudit)
    )

    let audit = try auditor.audit(
      plan: fixture.handoff(stagingRoot: fixture.staging, set: set),
      set: set,
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(audit.mediaRequirements.first?.fileValidation == .changedDuringAudit)
    #expect(audit.mediaRequirements.first?.location == .invalidEmbeddedFile)
    #expect(!audit.boundaryEvidence.containedOnThisMac)
    #expect(!audit.boundaryEvidence.portableToAnotherMac)
  }

  @Test("Nested ancestor Ableton Project boundaries require explicit review")
  func nestedAncestorProjectBoundariesConflict() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    try fixture.write(
      "outer-info",
      to: fixture.root.appending(path: "Ableton Project Info/Project8.cfg")
    )

    let audit = try ProjectReadinessAuditor().audit(
      plan: fixture.handoff(stagingRoot: fixture.staging, sourceProject: fixture.root),
      set: fixture.set(),
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(audit.status == .needsAttention)
    #expect(audit.boundaryEvidence.projectInfoStatus == .conflicting)
    #expect(
      audit.boundaryEvidence.conflictingProjectInfoRelativePaths == [
        "ancestor-1/Ableton Project Info"
      ])
  }

  @Test("Portability remediation is an immutable review-only plan")
  func portabilityPlanDoesNotMutateSource() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let outside = fixture.root.appending(path: "outside.wav")
    try fixture.write("audio", to: outside)
    let set = fixture.set(dependencies: [
      fixture.dependency(id: "external", url: outside, availability: .available)
    ])
    let handoff = fixture.handoff(stagingRoot: fixture.staging, set: set)
    let before = try Data(contentsOf: handoff.sourceSetURL)
    let audit = try ProjectReadinessAuditor().audit(
      plan: handoff, set: set, pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000, auditedAt: fixture.date)

    let review = try ProjectPortabilityReviewPlanner().make(
      id: "review-only", handoffPlan: handoff, audit: audit, createdAt: fixture.date)

    #expect(review.authorizesMutation == false)
    #expect(
      review.actions.contains(where: {
        $0.kind == .collectExternalMediaInStagedCopy && $0.stagedCopyOnly
      }))
    #expect(try Data(contentsOf: handoff.sourceSetURL) == before)
    #expect(try FileManager.default.contentsOfDirectory(atPath: fixture.staging.path).isEmpty)
  }

  @Test("A changed source Set is reported as needing attention")
  func sourceChangeAudit() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let plan = fixture.plan
    let set = fixture.set()
    try fixture.write("changed-set-contents", to: fixture.project.appending(path: "Song.als"))

    let audit = try ProjectReadinessAuditor().audit(
      plan: plan,
      set: set,
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(audit.status == .needsAttention)
    #expect(audit.risks.contains(where: { $0.kind == .sourceSetMismatch }))
  }

  @Test("Same-size Set replacement with restored mtime invalidates review")
  func sameSizeRestoredMtimeSetReplacement() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let plan = fixture.plan
    let sourceSet = fixture.project.appending(path: "Song.als")
    try Data(String(repeating: "x", count: 100).utf8).write(to: sourceSet)
    try FileManager.default.setAttributes(
      [.modificationDate: fixture.date], ofItemAtPath: sourceSet.path)

    let audit = try ProjectReadinessAuditor().audit(
      plan: plan,
      set: fixture.set(),
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    #expect(audit.status == .needsAttention)
    #expect(
      audit.risks.contains(where: {
        $0.kind == .sourceSetMismatch && $0.summary.contains("content digest changed")
      }))
  }

  @Test("Reports are deterministic and redact local paths and personal data")
  func recipientReportsAreRedacted() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let set = fixture.set()
    let reviewedPlan = fixture.handoff(
      stagingRoot: fixture.staging,
      versionLabel: "Mix 2",
      senderNote:
        "From alice@example.com; source file:///Users/alice/Music/Song.als; "
        + "windows C:/Users/alice/Music/Secret.als; "
        + "UNC \\\\studio-server\\alice\\Secret.wav; slash //studio-server/alice/Secret.wav")
    var audit = try ProjectReadinessAuditor().audit(
      plan: reviewedPlan,
      set: set,
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )
    audit = audit.addingRisk(
      ProjectHandoffRisk(
        id: "private",
        kind: .unknown,
        severity: .note,
        summary: "Contact producer@example.com at /Users/alice/Music/Secret.als"
      )
    )
    let input = ProjectHandoffReportInput(
      handoffPlan: reviewedPlan,
      catalog: handoffCatalog(plan: reviewedPlan, set: set),
      audit: audit,
      stagingEvidence: nil,
      stagingPlan: nil,
      generatedAt: fixture.date
    )

    let first = try ProjectHandoffReportGenerator().generate(input)
    let second = try ProjectHandoffReportGenerator().generate(input)
    let combined = String(decoding: first.json + first.text + first.pdf, as: UTF8.self)

    #expect(first == second)
    #expect(first.pdf.starts(with: Data("%PDF-1.".utf8)))
    let pdfURL = fixture.root.appending(path: "report.pdf")
    try first.pdf.write(to: pdfURL)
    #expect((CGPDFDocument(pdfURL as CFURL)?.numberOfPages ?? 0) >= 1)
    #expect(!combined.contains("/Users/alice"))
    #expect(!combined.contains("alice@example.com"))
    #expect(!combined.contains("studio-server"))
    #expect(!combined.contains("C:/Users/alice"))
    #expect(combined.contains("<redacted path>"))
    #expect(combined.contains("<redacted email>"))
    let renderedOutputs = [
      String(decoding: first.json, as: UTF8.self),
      String(decoding: first.text, as: UTF8.self),
      try #require(PDFDocument(data: first.pdf)).string ?? "",
    ]
    for output in renderedOutputs {
      #expect(!output.contains("C:/Users/alice"))
      #expect(!output.contains("//studio-server/alice"))
      #expect(!output.contains("\\\\studio-server\\alice"))
      #expect(output.contains("<redacted path>"))
    }
  }

  @Test("Reports preserve exact readiness vocabulary before and after staging")
  func reportsPreserveExactStatusVocabulary() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let mediaURL = fixture.project.appending(path: "Samples/Recorded/vocal.wav")
    try fixture.write("audio", to: mediaURL)
    let set = fixture.set(
      dependencies: [fixture.dependency(id: "vocal", url: mediaURL, availability: .available)],
      plugin: fixture.plugin
    )
    let plan = fixture.handoff(stagingRoot: fixture.staging, set: set)
    let audit = try ProjectReadinessAuditor().audit(
      plan: plan,
      set: set,
      pluginInventory: fixture.installedInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    )

    let reports = try ProjectHandoffReportGenerator().generate(
      ProjectHandoffReportInput(
        handoffPlan: plan,
        catalog: handoffCatalog(plan: plan, set: set),
        audit: audit,
        stagingEvidence: nil,
        stagingPlan: nil,
        generatedAt: fixture.date
      )
    )
    let text = String(decoding: reports.text, as: UTF8.self)
    #expect(text.contains("Status: Ready with limitations"))
    #expect(!text.contains("Ready to stage"))
  }

  @Test("Reports include reviewed-plan and audit freshness timestamps")
  func reportsIncludeFreshnessTimestamps() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let auditDate = fixture.date.addingTimeInterval(300)
    let generatedAt = fixture.date.addingTimeInterval(600)
    let plan = fixture.handoff(stagingRoot: fixture.staging, createdAt: fixture.date)
    let audit = try ProjectReadinessAuditor().audit(
      plan: plan,
      set: fixture.set(),
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: auditDate
    )

    let reports = try ProjectHandoffReportGenerator().generate(
      ProjectHandoffReportInput(
        handoffPlan: plan,
        catalog: handoffCatalog(plan: plan, set: fixture.set()),
        audit: audit,
        stagingEvidence: nil,
        stagingPlan: nil,
        generatedAt: generatedAt
      )
    )

    let iso = ISO8601DateFormatter()
    let text = String(decoding: reports.text, as: UTF8.self)
    let json = String(decoding: reports.json, as: UTF8.self)
    #expect(text.contains("Plan reviewed: \(iso.string(from: fixture.date))"))
    #expect(text.contains("Audit evidence: \(iso.string(from: auditDate))"))
    #expect(json.contains("\"auditedAt\""))
    #expect(json.contains("\"reviewCapturedAt\""))
  }

  @Test("Staging evidence does not overwrite audited media assurance wording")
  func stagedReportsPreserveAuditedMediaAssurance() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    let evidence = try ProjectStagingCopyExecutor().execute(copyPlan)
    let audit = try ProjectReadinessAuditor().audit(
      plan: fixture.plan,
      set: fixture.set(),
      pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      auditedAt: fixture.date
    ).addingRisk(
      ProjectHandoffRisk(
        id: "forced-media-warning",
        kind: .externalMedia,
        severity: .blocking,
        summary: "Forced media warning for report regression coverage"
      )
    )

    let reports = try ProjectHandoffReportGenerator().generate(
      ProjectHandoffReportInput(
        handoffPlan: fixture.plan,
        catalog: fixture.catalog(),
        audit: audit,
        stagingEvidence: evidence,
        stagingPlan: copyPlan,
        generatedAt: fixture.date
      )
    )
    let text = String(decoding: reports.text, as: UTF8.self)
    #expect(text.contains("Status: Needs attention"))
    #expect(text.contains("Ableton media: Ableton-visible media needs attention before handoff."))
    #expect(
      !text.contains(
        "Source-contained Ableton-visible media was copied byte-for-byte and verified in the staged Project."
      ))
  }

  @Test("Planning is collision-safe and staging never overwrites")
  func collisionSafety() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let existing = fixture.staging.appending(path: "Song - Handoff", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: existing, withIntermediateDirectories: true)

    let copyPlan = try ProjectStagingCopyPlanner().plan(
      handoff: fixture.plan,
      in: fixture.catalog(),
      packageID: "package-1",
      displayName: "Song",
      indexedRoots: [fixture.root.appending(path: "Music")],
      plannedAt: fixture.date
    )

    #expect(copyPlan.destinationContainerURL.lastPathComponent == "Song - Handoff 2")
    try FileManager.default.createDirectory(
      at: copyPlan.destinationContainerURL,
      withIntermediateDirectories: true
    )
    #expect(throws: ProjectStagingError.destinationCollision) {
      try ProjectStagingCopyExecutor().execute(copyPlan)
    }
  }

  @Test("Staging preserves the source and records verified SHA-256 evidence")
  func stagedCopyVerification() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let setURL = fixture.project.appending(path: "Song.als")
    let infoURL = fixture.project.appending(path: "Ableton Project Info/Project8.cfg")
    try fixture.write("set", to: setURL)
    try fixture.write("info", to: infoURL)
    let sourceSetData = try Data(contentsOf: setURL)

    let copyPlan = try ProjectStagingCopyPlanner().plan(
      handoff: fixture.plan,
      in: fixture.catalog(),
      packageID: "package-1",
      displayName: "Song",
      indexedRoots: [],
      plannedAt: fixture.date
    )
    let evidence = try ProjectStagingCopyExecutor().execute(copyPlan)

    #expect(try Data(contentsOf: setURL) == sourceSetData)
    #expect(evidence.manifest.files.count == 2)
    #expect(evidence.manifest.files.allSatisfy { $0.sha256.count == 64 })
    #expect(FileManager.default.fileExists(atPath: evidence.manifestURL.path))
    #expect(try ProjectStagingVerifier().verify(evidence, against: copyPlan) == evidence.manifest)
  }

  @Test("Staging refuses destinations inside source or indexed music roots")
  func sourceMutationResistance() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }

    #expect(throws: ProjectStagingError.unsafeDestination) {
      try ProjectStagingCopyPlanner().plan(
        handoff: fixture.handoff(stagingRoot: fixture.project.appending(path: "Delivery")),
        in: fixture.catalog(),
        packageID: "package-1",
        displayName: "Song",
        indexedRoots: [],
        plannedAt: fixture.date
      )
    }
    #expect(throws: ProjectStagingError.unsafeDestination) {
      try ProjectStagingCopyPlanner().plan(
        handoff: fixture.handoff(stagingRoot: fixture.root.appending(path: "Music/Handoffs")),
        in: fixture.catalog(),
        packageID: "package-1",
        displayName: "Song",
        indexedRoots: [fixture.root.appending(path: "Music")],
        plannedAt: fixture.date
      )
    }
  }

  @Test("Verification detects a changed staged file")
  func packageVerificationFailure() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    try fixture.write("set", to: fixture.project.appending(path: "Song.als"))
    try fixture.write(
      "info",
      to: fixture.project.appending(path: "Ableton Project Info/Project8.cfg")
    )
    let plan = try ProjectStagingCopyPlanner().plan(
      handoff: fixture.plan,
      in: fixture.catalog(),
      packageID: "package-1",
      displayName: "Song",
      indexedRoots: [],
      plannedAt: fixture.date
    )
    let evidence = try ProjectStagingCopyExecutor().execute(plan)
    try Data("changed".utf8).write(to: evidence.projectURL.appending(path: "Song.als"))

    #expect(throws: ProjectStagingError.verificationFailed) {
      try ProjectStagingVerifier().verify(evidence, against: plan)
    }
  }

  @Test("External and symlink-escaped media never satisfy source containment")
  func externalMediaIsNotReady() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let outside = fixture.root.appending(path: "outside.wav")
    try fixture.write("audio", to: outside)
    let link = fixture.project.appending(path: "Samples/escaped.wav")
    try FileManager.default.createDirectory(
      at: link.deletingLastPathComponent(), withIntermediateDirectories: true)
    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: outside)
    for policy in [ProjectHandoffMediaPolicy.requireAvailable, .requireAvailableAndContained] {
      let set = fixture.set(dependencies: [
        fixture.dependency(id: "escape", url: link, availability: .available)
      ])
      let handoff = fixture.handoff(stagingRoot: fixture.staging, set: set, mediaPolicy: policy)
      let audit = try ProjectReadinessAuditor().audit(
        plan: handoff,
        set: set,
        pluginInventory: fixture.emptyInventory,
        availableDiskBytes: 10_000,
        auditedAt: fixture.date
      )
      #expect(audit.mediaRequirements.first?.location == .symlinkEscaped)
      #expect(audit.status == .needsAttention)
      #expect(audit.assurance.media.status == .needsAttention)
    }
  }

  @Test("Existing fallback evidence must be non-empty and contained")
  func fallbackEvidenceAudit() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let policy = ProjectHandoffFallbackPolicy(mode: .requireExistingAudio)
    let handoff = fixture.handoff(
      stagingRoot: fixture.staging, fallbackPolicy: policy, selectedTrackIDs: ["track-1"])
    let fallback = fixture.project.appending(path: "Samples/Fallback/track-1.wav")
    try fixture.write("rendered", to: fallback)
    let missing = try ProjectReadinessAuditor().audit(
      plan: handoff, set: fixture.set(), pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000, auditedAt: fixture.date
    )
    #expect(missing.status == .needsAttention)
    let present = try ProjectReadinessAuditor().audit(
      plan: handoff, set: fixture.set(), pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000,
      fallbackEvidence: [ProjectFallbackAudioEvidence(trackID: "track-1", fileURL: fallback)],
      auditedAt: fixture.date
    )
    #expect(present.assurance.fallbackAudio.status == .included)
    #expect(present.status == .ready)
  }

  @Test("Adding a blocking risk recomputes readiness")
  func addedBlockingRisk() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let audit = try ProjectReadinessAuditor().audit(
      plan: fixture.plan, set: fixture.set(), pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000, auditedAt: fixture.date
    ).addingRisk(
      ProjectHandoffRisk(id: "late", kind: .missingMedia, severity: .blocking, summary: "Missing"))
    #expect(audit.status == .needsAttention)
    #expect(audit.assurance.media.status == .needsAttention)
  }

  @Test("Planner rejects source and staging aliases")
  func symlinkAliasesAreRejected() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let stagingAlias = fixture.root.appending(path: "Staging Alias")
    try FileManager.default.createSymbolicLink(
      at: stagingAlias, withDestinationURL: fixture.staging)
    #expect(throws: ProjectStagingError.unsafeDestination) {
      try ProjectStagingCopyPlanner().plan(
        handoff: fixture.handoff(stagingRoot: stagingAlias), in: fixture.catalog(),
        packageID: "package",
        displayName: "Song",
        indexedRoots: [], plannedAt: fixture.date
      )
    }
    let sourceAlias = fixture.root.appending(path: "Source Alias")
    try FileManager.default.createSymbolicLink(at: sourceAlias, withDestinationURL: fixture.project)
    #expect(throws: ProjectStagingError.unsafeDestination) {
      try ProjectStagingCopyPlanner().plan(
        handoff: fixture.handoff(
          stagingRoot: fixture.staging, sourceProject: sourceAlias),
        in: fixture.catalog(),
        packageID: "package", displayName: "Song", indexedRoots: [], plannedAt: fixture.date
      )
    }
  }

  @Test("Planner rejects conflicting Ableton Project Info folders")
  func plannerRejectsConflictingProjectInfo() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    try fixture.write(
      "nested-info",
      to: fixture.project.appending(path: "Archive/Ableton Project Info/Project8.cfg")
    )

    #expect(throws: ProjectStagingError.conflictingProjectInfo) {
      try ProjectStagingCopyPlanner().plan(
        handoff: fixture.plan,
        in: fixture.catalog(),
        packageID: "package-1",
        displayName: "Song",
        indexedRoots: [],
        plannedAt: fixture.date
      )
    }
  }

  @Test("Executor rejects a staging-root symlink swap")
  func symlinkSwapIsRejected() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    try FileManager.default.removeItem(at: fixture.staging)
    try FileManager.default.createSymbolicLink(
      at: fixture.staging, withDestinationURL: fixture.project)
    #expect(throws: ProjectStagingError.invalidPlan) {
      try ProjectStagingCopyExecutor().execute(copyPlan)
    }
  }

  @Test("Promotion collision is detected atomically at the promotion seam")
  func promotionCollision() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    let destination = copyPlan.destinationContainerURL
    let executor = ProjectStagingCopyExecutor(
      hooks: ProjectStagingExecutionHooks(
        beforePromotion: {
          try FileManager.default.createDirectory(
            at: destination, withIntermediateDirectories: false)
        }
      ))
    #expect(throws: ProjectStagingError.destinationCollision) { try executor.execute(copyPlan) }
    #expect(ProjectStagingRecoveryScanner().records(in: fixture.staging).isEmpty)
  }

  @Test("A source mutation during copy fails and cleans its partial")
  func sourceMutationDuringCopy() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    let sourceSet = fixture.project.appending(path: "Song.als")
    let executor = ProjectStagingCopyExecutor(
      hooks: ProjectStagingExecutionHooks(
        afterSourceSnapshot: { try Data("changed during copy".utf8).write(to: sourceSet) }
      ))
    #expect(throws: ProjectStagingError.sourceChanged) { try executor.execute(copyPlan) }
    let children = try FileManager.default.contentsOfDirectory(atPath: fixture.staging.path)
    #expect(!children.contains(where: { $0.contains("partial-") }))
  }

  @Test("Post-promotion failure is retained and discoverable as needs attention")
  func promotedFailureRecovery() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    let added = copyPlan.destinationProjectURL.appending(path: "unexpected.wav")
    let executor = ProjectStagingCopyExecutor(
      hooks: ProjectStagingExecutionHooks(
        afterPromotion: { try Data("tamper".utf8).write(to: added) }
      ))
    #expect(throws: ProjectStagingError.promotedCopyNeedsReview(copyPlan.destinationContainerURL)) {
      try executor.execute(copyPlan)
    }
    let records = ProjectStagingRecoveryScanner().records(in: fixture.staging)
    #expect(records.count == 1)
    #expect(records.first?.status == .needsAttention)
  }

  @Test("Verifier rejects additions, missing files, zero files, links, and manifest tampering")
  func adversarialPackageTampering() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    let evidence = try ProjectStagingCopyExecutor().execute(copyPlan)
    let extra = evidence.projectURL.appending(path: "extra.wav")
    try Data("extra".utf8).write(to: extra)
    #expect(throws: ProjectStagingError.verificationFailed) {
      try ProjectStagingVerifier().verify(evidence, against: copyPlan)
    }
    try FileManager.default.removeItem(at: extra)
    let info = evidence.projectURL.appending(path: "Ableton Project Info/Project8.cfg")
    try FileManager.default.removeItem(at: info)
    #expect(throws: ProjectStagingError.verificationFailed) {
      try ProjectStagingVerifier().verify(evidence, against: copyPlan)
    }
    try Data().write(to: info)
    #expect(throws: ProjectStagingError.verificationFailed) {
      try ProjectStagingVerifier().verify(evidence, against: copyPlan)
    }
    try Data("info".utf8).write(to: info)
    let link = evidence.projectURL.appending(path: "link.wav")
    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: info)
    #expect(throws: ProjectStagingError.verificationFailed) {
      try ProjectStagingVerifier().verify(evidence, against: copyPlan)
    }
    try FileManager.default.removeItem(at: link)
    var manifest = try Data(contentsOf: evidence.manifestURL)
    manifest.append(0x20)
    try manifest.write(to: evidence.manifestURL)
    #expect(throws: ProjectStagingError.verificationFailed) {
      try ProjectStagingVerifier().verify(evidence, against: copyPlan)
    }
  }

  @Test("Reports reject evidence from another reviewed revision")
  func reportIdentityMismatch() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    let evidence = try ProjectStagingCopyExecutor().execute(copyPlan)
    let other = fixture.handoff(
      stagingRoot: fixture.staging, id: "other-plan", revisionID: "revision-2")
    let audit = try ProjectReadinessAuditor().audit(
      plan: other, set: fixture.set(), pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000, auditedAt: fixture.date
    )
    let input = ProjectHandoffReportInput(
      handoffPlan: other,
      catalog: handoffCatalog(plan: other, set: fixture.set()),
      audit: audit, stagingEvidence: evidence, stagingPlan: copyPlan,
      generatedAt: fixture.date
    )
    #expect(throws: ProjectHandoffReportError.identityMismatch) {
      try ProjectHandoffReportGenerator().generate(input)
    }
  }

  @Test("Reports reject staging evidence for a different selected Set with reused IDs")
  func reportSelectedSetMismatch() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    let evidence = try ProjectStagingCopyExecutor().execute(copyPlan)
    let otherSet = fixture.project.appending(path: "Other.als")
    try fixture.write("other set", to: otherSet)
    let indexedOtherSet = fixture.set(fileURL: otherSet)
    let other = fixture.handoff(stagingRoot: fixture.staging, set: indexedOtherSet)
    let audit = try ProjectReadinessAuditor().audit(
      plan: other, set: indexedOtherSet, pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000, auditedAt: fixture.date
    )
    let input = ProjectHandoffReportInput(
      handoffPlan: other,
      catalog: handoffCatalog(plan: other, set: indexedOtherSet),
      audit: audit, stagingEvidence: evidence, stagingPlan: copyPlan,
      generatedAt: fixture.date
    )
    #expect(throws: ProjectHandoffReportError.identityMismatch) {
      try ProjectHandoffReportGenerator().generate(input)
    }
  }

  @Test("A changed Set observation requires a fresh handoff review")
  func changedSetRequiresReview() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let plan = fixture.plan
    let changed = fixture.set(compressedBytes: 101)
    #expect(
      throws: ProjectHandoffReferenceValidationError.requiresReview(.setContentChanged)
    ) {
      _ = try ProjectReadinessAuditor().audit(
        plan: plan,
        set: changed,
        in: fixture.catalog(set: changed),
        pluginInventory: fixture.emptyInventory,
        availableDiskBytes: 10_000,
        auditedAt: fixture.date)
    }
  }

  @Test("Staging evidence cannot be reused after any reviewed handoff contract change")
  func completeHandoffFingerprintBinding() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    let evidence = try ProjectStagingCopyExecutor().execute(copyPlan)
    let basePlan = fixture.plan
    let baseAudit = try ProjectReadinessAuditor().audit(
      plan: basePlan, set: fixture.set(), pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000, auditedAt: fixture.date)
    let variants = [
      fixture.handoff(stagingRoot: fixture.staging, mediaPolicy: .requireAvailable),
      fixture.handoff(
        stagingRoot: fixture.staging,
        fallbackPolicy: ProjectHandoffFallbackPolicy(mode: .requireExistingAudio),
        selectedTrackIDs: ["track-1"]),
      fixture.handoff(stagingRoot: fixture.staging, selectedTrackIDs: ["track-1"]),
      fixture.handoff(
        stagingRoot: fixture.staging,
        createdAt: fixture.date.addingTimeInterval(1)),
      fixture.handoff(stagingRoot: fixture.staging, artistLabel: "Different Artist"),
      fixture.handoff(stagingRoot: fixture.staging, songLabel: "Different Song"),
      fixture.handoff(stagingRoot: fixture.staging, versionLabel: "Mix 99"),
      fixture.handoff(stagingRoot: fixture.staging, setDisplayName: "Different Set Label"),
      fixture.handoff(stagingRoot: fixture.staging, senderNote: "Changed recipient note"),
    ]
    for variant in variants {
      let currentSet = fixture.set(displayName: variant.displaySnapshot.setDisplayName)
      let input = ProjectHandoffReportInput(
        handoffPlan: variant,
        catalog: handoffCatalog(plan: variant, set: currentSet),
        audit: baseAudit, stagingEvidence: evidence, stagingPlan: copyPlan,
        generatedAt: fixture.date)
      #expect(throws: ProjectHandoffReportError.identityMismatch) {
        try ProjectHandoffReportGenerator().generate(input)
      }
    }
  }

  @Test("Contradictory audit construction is rejected before reporting")
  func contradictoryAuditIsRejected() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let valid = try ProjectReadinessAuditor().audit(
      plan: fixture.plan, set: fixture.set(), pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000, auditedAt: fixture.date)
    let invalid = ProjectReadinessAudit(
      planID: valid.planID, planFingerprint: valid.planFingerprint,
      workID: valid.workID, sessionID: valid.sessionID, revisionID: valid.revisionID,
      setDisplayName: valid.setDisplayName, sourceModifiedAt: valid.sourceModifiedAt,
      auditedAt: valid.auditedAt, estimatedStagedBytes: valid.estimatedStagedBytes,
      availableDiskBytes: valid.availableDiskBytes,
      destinationCapacityStatus: valid.destinationCapacityStatus,
      boundaryEvidence: valid.boundaryEvidence,
      mediaRequirements: valid.mediaRequirements,
      pluginRequirements: valid.pluginRequirements,
      verifiedFallbackAudio: valid.verifiedFallbackAudio,
      liveRequirement: valid.liveRequirement,
      risks: [
        ProjectHandoffRisk(
          id: "contradiction", kind: .missingMedia, severity: .blocking,
          summary: "Blocking but marked ready")
      ],
      assurance: valid.assurance,
      status: .ready)
    #expect(throws: ProjectReadinessAuditError.contradictoryStatus) { try invalid.validate() }
    let input = ProjectHandoffReportInput(
      handoffPlan: fixture.plan,
      catalog: fixture.catalog(),
      audit: invalid, stagingEvidence: nil, stagingPlan: nil,
      generatedAt: fixture.date)
    #expect(throws: ProjectHandoffReportError.invalidAudit) {
      try ProjectHandoffReportGenerator().generate(input)
    }
  }

  @Test("A failed post-promotion receipt update returns the retained URL truthfully")
  func recoveryReceiptFailureIsTyped() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    let executor = ProjectStagingCopyExecutor(
      hooks: ProjectStagingExecutionHooks(
        afterPromotion: { throw TestFailure.injected },
        beforeNeedsAttentionReceipt: { throw TestFailure.injected }))
    #expect(throws: ProjectStagingError.promotedCopyUnlabelled(copyPlan.destinationContainerURL)) {
      try executor.execute(copyPlan, verifiedAt: fixture.date)
    }
    let records = ProjectStagingRecoveryScanner().records(
      in: fixture.staging, now: fixture.date.addingTimeInterval(7_200), staleAfter: 60)
    #expect(records.first?.containerURL == copyPlan.destinationContainerURL)
    #expect(records.first?.status == .needsAttention)
  }

  @Test("Restart recovery marks a stale partial receipt as needs attention")
  func stalePartialRecovery() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let partial = fixture.staging.appending(path: ".Song.partial-restart")
    try FileManager.default.createDirectory(at: partial, withIntermediateDirectories: false)
    let record = ProjectStagingRecoveryRecord(
      planID: "plan", planFingerprint: "fingerprint", status: .copying,
      containerURL: partial, updatedAt: fixture.date)
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    try encoder.encode(record).write(
      to: partial.appending(path: ".studio-handoff-state.json"), options: .withoutOverwriting)
    let recovered = ProjectStagingRecoveryScanner().records(
      in: fixture.staging, now: fixture.date.addingTimeInterval(7_200), staleAfter: 60)
    #expect(recovered.count == 1)
    #expect(recovered.first?.planID == "plan")
    #expect(recovered.first?.status == .needsAttention)
    #expect(recovered.first?.containerURL.path == partial.path)
  }

  @Test("Replacing or growing a path during stable digest fails closed")
  func directStableReadRaces() throws {
    for mutation in [DigestMutation.replacement, .growth] {
      let fixture = try Fixture()
      defer { fixture.remove() }
      let sample = fixture.project.appending(path: "Samples/Recorded/race.wav")
      try fixture.write(String(repeating: "a", count: 1_100_000), to: sample)
      let copyPlan = try fixture.copyPlan()
      let mutator = DigestRaceMutator(target: sample, mutation: mutation)
      let executor = ProjectStagingCopyExecutor(
        hooks: ProjectStagingExecutionHooks(duringStableDigest: { try mutator.mutate($0) }))
      #expect(throws: ProjectStagingError.sourceChanged) { try executor.execute(copyPlan) }
      #expect(!FileManager.default.fileExists(atPath: copyPlan.destinationContainerURL.path))
    }
  }

  @Test("A source subdirectory symlink swap after snapshot fails and cleans the partial")
  func sourceSubdirectorySymlinkSwap() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let samples = fixture.project.appending(path: "Samples")
    try fixture.write("audio", to: samples.appending(path: "take.wav"))
    let outside = fixture.root.appending(path: "outside")
    try fixture.write("outside", to: outside.appending(path: "take.wav"))
    let copyPlan = try fixture.copyPlan()
    let executor = ProjectStagingCopyExecutor(
      hooks: ProjectStagingExecutionHooks(afterSourceSnapshot: {
        try FileManager.default.removeItem(at: samples)
        try FileManager.default.createSymbolicLink(at: samples, withDestinationURL: outside)
      }))
    #expect(throws: ProjectStagingError.verificationFailed) { try executor.execute(copyPlan) }
    #expect(!FileManager.default.fileExists(atPath: copyPlan.destinationContainerURL.path))
  }

  @Test("Verifier rejects a coherent manifest with an unknown schema")
  func unknownManifestSchema() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let copyPlan = try fixture.copyPlan()
    let evidence = try ProjectStagingCopyExecutor().execute(copyPlan)
    var manifestObject = try #require(
      JSONSerialization.jsonObject(with: Data(contentsOf: evidence.manifestURL))
        as? [String: Any])
    manifestObject["schemaVersion"] = 999
    let manifestData = try JSONSerialization.data(
      withJSONObject: manifestObject,
      options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
    try manifestData.write(to: evidence.manifestURL)

    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .millisecondsSince1970
    var evidenceObject = try #require(
      JSONSerialization.jsonObject(with: encoder.encode(evidence)) as? [String: Any])
    evidenceObject["manifest"] = manifestObject
    evidenceObject["manifestSHA256"] = FileContentDigest.hex(SHA256.hash(data: manifestData))
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .millisecondsSince1970
    let altered = try decoder.decode(
      ProjectStagingEvidence.self,
      from: JSONSerialization.data(withJSONObject: evidenceObject, options: [.sortedKeys]))
    #expect(throws: ProjectStagingError.verificationFailed) {
      try ProjectStagingVerifier().verify(altered, against: copyPlan)
    }
  }

  @Test("Fallback evidence requires a requested existing track and a direct non-empty file")
  func fallbackEvidenceRejectsInvalidTrackAndFiles() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let fallbackMode = ProjectHandoffFallbackPolicy(mode: .requireExistingAudio)
    let valid = fixture.project.appending(path: "Samples/Fallback/valid.wav")
    try fixture.write("rendered", to: valid)
    let cases: [(String, URL)] = [
      ("does-not-exist", valid),
      ("track-2", valid),
    ]
    for (trackID, url) in cases {
      let plan = fixture.handoff(
        stagingRoot: fixture.staging, fallbackPolicy: fallbackMode,
        selectedTrackIDs: ["track-1"])
      let audit = try ProjectReadinessAuditor().audit(
        plan: plan, set: fixture.set(), pluginInventory: fixture.emptyInventory,
        availableDiskBytes: 10_000,
        fallbackEvidence: [ProjectFallbackAudioEvidence(trackID: trackID, fileURL: url)],
        auditedAt: fixture.date)
      #expect(audit.status == .needsAttention)
      #expect(audit.verifiedFallbackAudio.isEmpty)
    }

    let empty = fixture.project.appending(path: "Samples/Fallback/empty.wav")
    try Data().write(to: empty)
    let link = fixture.project.appending(path: "Samples/Fallback/link.wav")
    try FileManager.default.createSymbolicLink(at: link, withDestinationURL: valid)
    for url in [empty, link] {
      let plan = fixture.handoff(
        stagingRoot: fixture.staging, fallbackPolicy: fallbackMode,
        selectedTrackIDs: ["track-1"])
      let audit = try ProjectReadinessAuditor().audit(
        plan: plan, set: fixture.set(), pluginInventory: fixture.emptyInventory,
        availableDiskBytes: 10_000,
        fallbackEvidence: [ProjectFallbackAudioEvidence(trackID: "track-1", fileURL: url)],
        auditedAt: fixture.date)
      #expect(audit.assurance.fallbackAudio.status == .needsAttention)
      #expect(audit.verifiedFallbackAudio.isEmpty)
    }
  }

  @Test("Verified fallback evidence makes the affected plug-in row truthful")
  func pluginFallbackReportTruth() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let fallback = fixture.project.appending(path: "Samples/Fallback/track-1.wav")
    try fixture.write("rendered", to: fallback)
    let set = fixture.set(plugin: fixture.plugin)
    let plan = fixture.handoff(
      stagingRoot: fixture.staging,
      set: set,
      fallbackPolicy: ProjectHandoffFallbackPolicy(mode: .requireExistingAudio),
      selectedTrackIDs: ["track-1"])
    let audit = try ProjectReadinessAuditor().audit(
      plan: plan, set: set,
      pluginInventory: fixture.installedInventory, availableDiskBytes: 10_000,
      fallbackEvidence: [ProjectFallbackAudioEvidence(trackID: "track-1", fileURL: fallback)],
      auditedAt: fixture.date)
    #expect(audit.verifiedFallbackAudio.first?.sha256.count == 64)
    #expect(audit.pluginRequirements.first?.trackIDs == ["track-1"])
    #expect(audit.pluginRequirements.first?.fallbackAvailable == true)
    #expect(audit.assurance.fallbackAudio.status == .included)
    let reports = try ProjectHandoffReportGenerator().generate(
      ProjectHandoffReportInput(
        handoffPlan: plan,
        catalog: handoffCatalog(plan: plan, set: set),
        audit: audit, stagingEvidence: nil, stagingPlan: nil,
        generatedAt: fixture.date))
    #expect(String(decoding: reports.text, as: UTF8.self).contains("fallback: yes"))
  }

  @Test("Fallback verification rejects replacement, symlink swap, and growth during hashing")
  func fallbackStableReadRaces() throws {
    for mutation in [FallbackMutation.replacement, .symlinkSwap, .growth] {
      let fixture = try Fixture()
      defer { fixture.remove() }
      let fallback = fixture.project.appending(path: "Samples/Fallback/track-1.wav")
      try fixture.write(String(repeating: "a", count: 1_100_000), to: fallback)
      let outside = fixture.root.appending(path: "outside.wav")
      try fixture.write(String(repeating: "z", count: 1_100_000), to: outside)
      let mutator = FallbackRaceMutator(target: fallback, outside: outside, mutation: mutation)
      let auditor = ProjectReadinessAuditor(
        fallbackFileVerifier: ProjectFallbackFileVerifier(duringRead: { try mutator.mutate($0) }))
      let plan = fixture.handoff(
        stagingRoot: fixture.staging,
        fallbackPolicy: ProjectHandoffFallbackPolicy(mode: .requireExistingAudio),
        selectedTrackIDs: ["track-1"])
      let audit = try auditor.audit(
        plan: plan, set: fixture.set(), pluginInventory: fixture.emptyInventory,
        availableDiskBytes: 10_000,
        fallbackEvidence: [ProjectFallbackAudioEvidence(trackID: "track-1", fileURL: fallback)],
        auditedAt: fixture.date)
      #expect(audit.status == .needsAttention)
      #expect(audit.assurance.fallbackAudio.status == .needsAttention)
      #expect(audit.verifiedFallbackAudio.isEmpty)
      #expect(throws: Never.self) { try audit.validate() }
    }
  }

  @Test("PDF preserves Unicode and paginates long recipient content")
  func unicodeMultipagePDF() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let note = Array(repeating: "Björk 東京 длинная строка recipient detail", count: 220).joined(
      separator: " ")
    let plan = fixture.handoff(
      stagingRoot: fixture.staging,
      artistLabel: "Björk", songLabel: "東京", versionLabel: "版本 2", senderNote: note)
    let audit = try ProjectReadinessAuditor().audit(
      plan: plan, set: fixture.set(), pluginInventory: fixture.emptyInventory,
      availableDiskBytes: 10_000, auditedAt: fixture.date
    )
    let reports = try ProjectHandoffReportGenerator().generate(
      ProjectHandoffReportInput(
        handoffPlan: plan,
        catalog: handoffCatalog(plan: plan, set: fixture.set()),
        audit: audit, stagingEvidence: nil, stagingPlan: nil,
        generatedAt: fixture.date
      ))
    let document = try #require(PDFDocument(data: reports.pdf))
    #expect(document.pageCount > 1)
    let extracted = document.string ?? ""
    #expect(extracted.contains("Björk"))
    #expect(extracted.contains("東京"))
    #expect(extracted.contains("CAVEATS"))
  }
}

private enum TestFailure: Error { case injected }
private enum DigestMutation { case replacement, growth }
private enum FallbackMutation { case replacement, symlinkSwap, growth }

private struct StubMediaFileValidator: ProjectMediaFileValidating {
  let result: ProjectEmbeddedFileValidationStatus

  func validate(_ fileURL: URL) -> ProjectEmbeddedFileValidationStatus { result }
}

private final class DigestRaceMutator: @unchecked Sendable {
  private let lock = NSLock()
  private let target: URL
  private let mutation: DigestMutation
  private var didMutate = false

  init(target: URL, mutation: DigestMutation) {
    self.target = target
    self.mutation = mutation
  }

  func mutate(_ url: URL) throws {
    lock.lock()
    defer { lock.unlock() }
    guard !didMutate, url.standardizedFileURL == target.standardizedFileURL else { return }
    didMutate = true
    switch mutation {
    case .replacement:
      let replacement = target.deletingLastPathComponent().appending(path: "replacement.tmp")
      try Data(String(repeating: "b", count: 1_100_000).utf8).write(to: replacement)
      _ = try FileManager.default.replaceItemAt(target, withItemAt: replacement)
    case .growth:
      let handle = try FileHandle(forWritingTo: target)
      defer { try? handle.close() }
      try handle.seekToEnd()
      try handle.write(contentsOf: Data("growth".utf8))
    }
  }
}

private final class FallbackRaceMutator: @unchecked Sendable {
  private let lock = NSLock()
  private let target: URL
  private let outside: URL
  private let mutation: FallbackMutation
  private var didMutate = false

  init(target: URL, outside: URL, mutation: FallbackMutation) {
    self.target = target
    self.outside = outside
    self.mutation = mutation
  }

  func mutate(_ url: URL) throws {
    lock.lock()
    defer { lock.unlock() }
    guard !didMutate, url.standardizedFileURL == target.standardizedFileURL else { return }
    didMutate = true
    switch mutation {
    case .replacement:
      let replacement = target.deletingLastPathComponent().appending(path: "fallback.tmp")
      try Data(String(repeating: "b", count: 1_100_000).utf8).write(to: replacement)
      _ = try FileManager.default.replaceItemAt(target, withItemAt: replacement)
    case .symlinkSwap:
      try FileManager.default.removeItem(at: target)
      try FileManager.default.createSymbolicLink(at: target, withDestinationURL: outside)
    case .growth:
      let handle = try FileHandle(forWritingTo: target)
      defer { try? handle.close() }
      try handle.seekToEnd()
      try handle.write(contentsOf: Data("growth".utf8))
    }
  }
}

private final class Fixture {
  let root: URL
  let project: URL
  let staging: URL
  let date = Date(timeIntervalSince1970: 1_700_000_000)
  let pluginName: String

  init(pluginName: String = "Example EQ") throws {
    root = try TestSupport.temporaryDirectory()
    project = root.appending(path: "Source Project", directoryHint: .isDirectory)
    staging = root.appending(path: "Staging", directoryHint: .isDirectory)
    self.pluginName = pluginName
    try FileManager.default.createDirectory(at: project, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
    let setURL = project.appending(path: "Song.als")
    try Data(String(repeating: "s", count: 100).utf8).write(to: setURL)
    try FileManager.default.setAttributes([.modificationDate: date], ofItemAtPath: setURL.path)
    let infoURL = project.appending(path: "Ableton Project Info/Project8.cfg")
    try FileManager.default.createDirectory(
      at: infoURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try Data("info".utf8).write(to: infoURL)
    try FileManager.default.setAttributes([.modificationDate: date], ofItemAtPath: infoURL.path)
  }

  var plugin: PluginIdentity {
    PluginIdentity(
      format: .vst3,
      name: pluginName,
      manufacturer: "Example Audio",
      identifier: "audio.example.plugin",
      version: "1.0"
    )
  }

  var installedInventory: PluginInventory {
    PluginInventory(
      scannedAt: date,
      scannedFormats: [.vst3],
      plugins: [
        InstalledPlugin(
          id: "installed",
          name: pluginName,
          manufacturer: "Example Audio",
          format: .vst3,
          version: "1.0",
          bundleIdentifier: "audio.example.plugin",
          componentIdentifier: nil,
          bundleURL: URL(fileURLWithPath: "/Library/Audio/Plug-Ins/VST3/Plugin.vst3")
        )
      ]
    )
  }

  var emptyInventory: PluginInventory {
    PluginInventory(scannedAt: date, scannedFormats: [.vst3], plugins: [])
  }

  var plan: ProjectHandoffPlan {
    handoff(stagingRoot: staging)
  }

  func handoff(
    stagingRoot: URL,
    sourceProject: URL? = nil,
    set: AbletonSet? = nil,
    id: String = "plan-1",
    revisionID: String = "revision-1",
    mediaPolicy: ProjectHandoffMediaPolicy = .requireAvailableAndContained,
    fallbackPolicy: ProjectHandoffFallbackPolicy = ProjectHandoffFallbackPolicy(mode: .none),
    selectedTrackIDs: [String] = [],
    createdAt: Date? = nil,
    artistLabel: String = "Artist",
    songLabel: String = "Song",
    versionLabel: String = "Mix 1",
    setDisplayName: String = "Song",
    senderNote: String? = nil
  ) -> ProjectHandoffPlan {
    let indexedSet = set ?? self.set(displayName: setDisplayName)
    let catalog = catalog(
      set: indexedSet, revisionID: revisionID, artistLabel: artistLabel,
      songLabel: songLabel, versionLabel: versionLabel)
    let reference = try! StudioRevisionReferenceResolver().capture(
      setURL: indexedSet.fileURL, in: catalog, reviewedAt: createdAt ?? date
    ).reference
    return try! ProjectHandoffPlanFactory().make(
      id: id,
      revisionReference: reference,
      in: catalog,
      sourceProjectURL: sourceProject ?? project,
      stagingRootURL: stagingRoot,
      senderNote: senderNote,
      mediaPolicy: mediaPolicy,
      fallbackPolicy: fallbackPolicy,
      selectedTrackIDs: selectedTrackIDs,
      createdAt: createdAt ?? date)
  }

  func copyPlan() throws -> ProjectStagingCopyPlan {
    try ProjectStagingCopyPlanner().plan(
      handoff: plan, in: catalog(), packageID: "package-1", displayName: "Song", indexedRoots: [],
      plannedAt: date
    )
  }

  func set(
    dependencies: [MediaDependency] = [],
    plugin: PluginIdentity? = nil,
    fileURL: URL? = nil,
    displayName: String = "Song",
    compressedBytes: Int64 = 100
  ) -> AbletonSet {
    let devices: [SetDevice] =
      plugin.map {
        [
          SetDevice(
            id: "device-1",
            xmlID: "1",
            kind: .vst3,
            typeName: "PluginDevice",
            displayName: $0.name ?? "Plug-in",
            isEnabled: true,
            plugin: $0,
            stateDigest: "state",
            nestedDevices: [],
            resourceReferences: []
          )
        ]
      } ?? []
    let track = SetTrack(
      id: "track-1",
      xmlID: "1",
      kind: .audio,
      name: "Vocal",
      colorIndex: nil,
      groupTrackXMLID: nil,
      isFolded: nil,
      mixer: TrackMixerState(),
      devices: devices,
      clips: []
    )
    return AbletonSet(
      id: "set-1",
      fileURL: fileURL ?? project.appending(path: "Song.als"),
      displayName: displayName,
      isBackup: false,
      modifiedAt: date,
      compressedBytes: compressedBytes,
      xmlBytes: 200,
      creator: "Ableton Live 12.4.2 Suite",
      format: AbletonFormat(
        majorVersion: "5",
        minorVersion: "12.0_12000",
        schemaChangeCount: 3,
        revision: "abc"
      ),
      structure: SetStructure(),
      content: AbletonSetContent(tracks: [track], dependencies: dependencies)
    )
  }

  func catalog(
    set: AbletonSet? = nil,
    revisionID: String = "revision-1",
    artistLabel: String = "Artist",
    songLabel: String = "Song",
    versionLabel: String = "Mix 1",
    workID: String = "work-1",
    sessionID: String = "session-1"
  ) -> WorkCatalog {
    let indexedSet = set ?? self.set()
    let revision = StudioSetRevision(
      id: revisionID,
      set: indexedSet,
      revisionLabel: versionLabel,
      timestamp: RevisionTimestamp(
        value: indexedSet.modifiedAt,
        source: .fileModificationTime,
        confidence: .confirmed,
        explanation: "Test catalogue"))
    let session = StudioSession(
      id: sessionID,
      rootURL: project,
      displayName: "Session",
      role: .production,
      canonicalTitle: songLabel,
      canonicalTitleKey: songLabel.lowercased(),
      titleEvidence: [],
      revisions: [revision],
      previewAssets: [])
    let work = StudioWork(
      id: workID,
      artist: ArtistIdentity(
        id: "artist-1", displayName: artistLabel, confidence: .confirmed, evidence: []),
      displayName: songLabel,
      canonicalKey: songLabel.lowercased(),
      confidence: .confirmed,
      evidence: [],
      sessions: [session])
    return WorkCatalog(
      generatedAt: date,
      algorithmVersion: "handoff-tests-v1",
      sourceRoots: [root],
      works: [work],
      reviewQueue: [])
  }

  func dependency(
    id: String,
    url: URL,
    availability: MediaDependencyAvailability
  ) -> MediaDependency {
    MediaDependency(
      id: id,
      kind: .clipAudio,
      reference: MediaReference(absolutePath: url.path, relativePath: url.lastPathComponent),
      resolvedURL: url,
      availability: availability,
      ownerID: "track-1"
    )
  }

  func write(_ value: String, to url: URL) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try Data(value.utf8).write(to: url)
  }

  func remove() {
    try? FileManager.default.removeItem(at: root)
  }
}
