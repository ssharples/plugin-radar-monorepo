import Foundation
import Testing

@testable import StudioCore

@Suite("Ableton Accessibility automation")
struct AbletonAutomationTests {
  @Test("Executes a reviewed export through semantic AX controls and records revision evidence")
  func normalExport() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let client = FakeAbletonAccessibilityClient(
      process: fixture.process,
      snapshots: fixture.normalSnapshots,
      outputURL: fixture.plan.primaryOutputURL)
    let store = AbletonExportEvidenceStore(storageURL: fixture.evidenceURL)
    let automation = AbletonAutomation(client: client, evidenceStore: store)

    let preflight = await automation.preflight(fixture.plan)
    #expect(preflight.permission == .authorized)
    #expect(preflight.activeSetConfirmed)
    #expect(preflight.hasUnsavedChanges == false)
    #expect(preflight.adapterVersion == "ableton-live-12.4.2-ax-v1")

    let evidence = try await automation.execute(
      fixture.plan,
      approval: AbletonExportApproval(planID: fixture.plan.id))

    #expect(evidence.setID == "set-1")
    #expect(evidence.revisionID == "revision-7")
    #expect(evidence.workID == "work-1")
    #expect(evidence.outputs.count == 1)
    #expect(evidence.outputs.first?.sampleRate == 44_100)
    #expect(evidence.outputs.first?.bitDepth == 16)
    #expect(evidence.overwritePolicy == .never)
    let storedEvidence = try await store.all()
    #expect(storedEvidence.count == 1)
    let instructions = await client.performedInstructions()
    #expect(instructions.contains(.press(nodeID: "menu.export")))
    #expect(instructions.contains(.setString(nodeID: "field.source", value: "Main")))
    #expect(instructions.contains(.setString(nodeID: "field.rate", value: "44100")))
    #expect(instructions.contains(.setBool(nodeID: "field.normalize", value: false)))
    #expect(instructions.contains(.press(nodeID: "button.save")))
  }

  @Test("Stops before touching Live when Accessibility permission is missing")
  func missingPermission() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let client = FakeAbletonAccessibilityClient(
      permission: .denied, process: fixture.process, snapshots: fixture.normalSnapshots)
    let automation = AbletonAutomation(client: client)

    let preflight = await automation.preflight(fixture.plan)
    #expect(preflight.permission == .denied)
    #expect(!preflight.activeSetConfirmed)
    await #expect(throws: AbletonAutomationError.accessibilityPermissionRequired) {
      try await automation.execute(
        fixture.plan, approval: AbletonExportApproval(planID: fixture.plan.id))
    }
    #expect(await client.performedInstructions().isEmpty)
  }

  @Test("Rejects unsupported Live versions explicitly")
  func unsupportedVersion() async throws {
    let fixture = try Fixture(processVersion: "12.5.0")
    defer { fixture.remove() }
    let client = FakeAbletonAccessibilityClient(
      process: fixture.process, snapshots: fixture.normalSnapshots)
    let automation = AbletonAutomation(client: client)

    let preflight = await automation.preflight(fixture.plan)
    #expect(preflight.adapterVersion == nil)
    #expect(preflight.message.contains("unsupported"))
    await #expect(throws: AbletonAutomationError.unsupportedVersion("12.5.0")) {
      try await automation.execute(
        fixture.plan, approval: AbletonExportApproval(planID: fixture.plan.id))
    }
    #expect(await client.performedInstructions().isEmpty)
  }

  @Test("Rejects an unsaved active Set before opening Export")
  func unsavedSet() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let client = FakeAbletonAccessibilityClient(
      process: fixture.process,
      snapshots: [fixture.mainSnapshot(modified: true)])
    let automation = AbletonAutomation(client: client)

    let preflight = await automation.preflight(fixture.plan)
    #expect(preflight.activeSetConfirmed)
    #expect(preflight.hasUnsavedChanges == true)
    await #expect(throws: AbletonAutomationError.self) {
      try await automation.execute(
        fixture.plan, approval: AbletonExportApproval(planID: fixture.plan.id))
    }
    #expect(await client.performedInstructions().isEmpty)
  }

  @Test("Stops at an unexpected licensing or recovery dialog")
  func unexpectedDialog() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let client = FakeAbletonAccessibilityClient(
      process: fixture.process,
      snapshots: [fixture.unexpectedDialogSnapshot])
    let automation = AbletonAutomation(client: client)

    let preflight = await automation.preflight(fixture.plan)
    #expect(!preflight.activeSetConfirmed)
    #expect(preflight.message.contains("License Agreement"))
    await #expect(throws: AbletonAutomationError.unexpectedDialog("License Agreement")) {
      try await automation.execute(
        fixture.plan, approval: AbletonExportApproval(planID: fixture.plan.id))
    }
    #expect(await client.performedInstructions().isEmpty)
  }

  @Test("Never-overwrite collision is rechecked before any AX instruction")
  func destinationCollision() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    try Data("existing".utf8).write(to: fixture.plan.primaryOutputURL)
    let client = FakeAbletonAccessibilityClient(
      process: fixture.process, snapshots: fixture.normalSnapshots)
    let automation = AbletonAutomation(client: client)

    await #expect(
      throws: AbletonExportPlanError.destinationCollision(fixture.plan.primaryOutputURL)
    ) {
      try await automation.execute(
        fixture.plan, approval: AbletonExportApproval(planID: fixture.plan.id))
    }
    #expect(await client.performedInstructions().isEmpty)
  }

  @Test("Cancellation asks Live to cancel and produces no evidence")
  func cancellation() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let client = FakeAbletonAccessibilityClient(
      process: fixture.process,
      snapshots: Array(fixture.normalSnapshots.prefix(4)),
      outputURL: nil,
      stallAfterSave: true)
    let automation = AbletonAutomation(client: client)
    let task = Task {
      try await automation.execute(
        fixture.plan, approval: AbletonExportApproval(planID: fixture.plan.id))
    }
    while !(await client.didSubmitSave()) {
      try await Task.sleep(for: .milliseconds(5))
    }
    task.cancel()
    await #expect(throws: AbletonAutomationError.cancelled) {
      try await task.value
    }
    #expect(await client.cancelWasRequested())
    #expect(!FileManager.default.fileExists(atPath: fixture.plan.primaryOutputURL.path))
  }

  @Test("A regrouped catalogue stops execution before the first AX instruction")
  func regroupDuringExecutionGateFailsClosed() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let generation = "catalogue-generation-one"
    let plan = fixture.referencedPlan(generationID: generation)
    let authority = StudioRevisionExecutionAuthority(generationID: generation)
    let client = FakeAbletonAccessibilityClient(
      process: fixture.process, snapshots: fixture.normalSnapshots,
      pauseBeforeFirstSnapshot: true)
    let automation = AbletonAutomation(
      client: client, revisionExecutionAuthority: authority)
    let operation = Task {
      try await automation.execute(
        plan,
        approval: AbletonExportApproval(
          planID: plan.id, catalogueGenerationID: generation))
    }
    await client.waitUntilSnapshotRequested()

    authority.activate(generationID: "catalogue-generation-two")
    await client.releaseFirstSnapshot()

    await #expect(throws: StudioRevisionReferenceError.catalogueGenerationChanged) {
      _ = try await operation.value
    }
    #expect(await client.performedInstructions().isEmpty)
  }

  @Test("Invalid authority after a failed rebuild cannot execute the previous plan")
  func failedRebuildAuthorityCannotExecute() async throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let generation = "last-successful-generation"
    let plan = fixture.referencedPlan(generationID: generation)
    let authority = StudioRevisionExecutionAuthority(generationID: generation)
    authority.invalidate()
    let client = FakeAbletonAccessibilityClient(
      process: fixture.process, snapshots: fixture.normalSnapshots)
    let automation = AbletonAutomation(
      client: client, revisionExecutionAuthority: authority)

    await #expect(throws: StudioRevisionReferenceError.catalogueGenerationChanged) {
      _ = try await automation.execute(
        plan,
        approval: AbletonExportApproval(
          planID: plan.id, catalogueGenerationID: generation))
    }
    #expect(await client.performedInstructions().isEmpty)
  }

  @Test("Output verification rejects stale, empty, and wrong-format evidence")
  func outputVerification() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let verifier = AbletonExportOutputVerifier()
    let startedAt = Date()

    try Data().write(to: fixture.plan.primaryOutputURL)
    #expect(throws: AbletonExportVerificationError.self) {
      try verifier.verify(
        plan: fixture.plan, startedAt: startedAt,
        adapterVersion: "ableton-live-12.4.2-ax-v1")
    }
    try FileManager.default.removeItem(at: fixture.plan.primaryOutputURL)
    try minimalWAV().write(to: fixture.plan.primaryOutputURL)
    try FileManager.default.setAttributes(
      [.modificationDate: startedAt.addingTimeInterval(-30)],
      ofItemAtPath: fixture.plan.primaryOutputURL.path)
    #expect(throws: AbletonExportVerificationError.staleOutput(fixture.plan.primaryOutputURL)) {
      try verifier.verify(
        plan: fixture.plan, startedAt: startedAt,
        adapterVersion: "ableton-live-12.4.2-ax-v1")
    }
  }

  @Test("Unknown-count stem exports verify fresh track-named files without a base-name prefix")
  func verifiesTrackNamedStemOutputs() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let startedAt = Date()
    let plan = fixture.stemsPlan
    let first = fixture.root.appending(path: "_ BEAT.wav")
    let second = fixture.root.appending(path: "_ Leads.wav")
    try minimalWAV().write(to: first)
    try minimalWAV().write(to: second)

    let evidence = try AbletonExportOutputVerifier().verify(
      plan: plan, startedAt: startedAt,
      adapterVersion: "ableton-live-12.4.2-ax-v1")

    #expect(
      Set(evidence.outputs.map(\.fileURL.lastPathComponent)) == ["_ BEAT.wav", "_ Leads.wav"])
  }

  @Test("Unknown-count stem export requires a destination without existing audio")
  func stemDestinationMustBeAudioEmpty() throws {
    let fixture = try Fixture()
    defer { fixture.remove() }
    let existing = fixture.root.appending(path: "Existing Track.wav")
    try minimalWAV().write(to: existing)

    #expect(throws: AbletonExportPlanError.self) {
      try AbletonExportPlanValidator().validate(fixture.stemsPlan)
    }
  }
}

private struct Fixture {
  let root: URL
  let setURL: URL
  let evidenceURL: URL
  let process: AbletonRunningProcess
  let plan: AbletonExportPlan

  init(processVersion: String = "12.4.2") throws {
    root = try TestSupport.temporaryDirectory()
    setURL = root.appending(path: "Safe Fixture.als")
    evidenceURL = root.appending(path: "evidence.plist")
    try Data("fixture".utf8).write(to: setURL)
    let appURL = URL(fileURLWithPath: "/Applications/Ableton Live 12 Suite.app")
    let installation = AbletonLiveInstallation(
      id: "live-12", applicationURL: appURL, displayName: "Ableton Live 12 Suite",
      bundleIdentifier: "com.ableton.live", version: processVersion, majorVersion: 12)
    process = AbletonRunningProcess(
      processIdentifier: 4242, bundleIdentifier: installation.bundleIdentifier,
      applicationURL: appURL, displayName: installation.displayName, version: processVersion)
    plan = AbletonExportPlan(
      setID: "set-1", revisionID: "revision-7", workID: "work-1", workName: "Safe Work",
      setURL: setURL, installation: installation, source: .main,
      arrangementRange: AbletonArrangementRange(startBeat: 0, endBeat: 16),
      pcmFormat: .wav, sampleRate: .hz44100, bitDepth: .int16, normalize: false,
      includeReturnAndMainEffects: true,
      destination: AbletonExportDestination(
        directoryURL: root, baseName: "Safe Fixture Export",
        expectedOutputFileNames: ["Safe Fixture Export.wav"]))
  }

  var normalSnapshots: [AXApplicationSnapshot] {
    [mainSnapshot(), exportDialogSnapshot, savePanelSnapshot, progressSnapshot, mainSnapshot()]
  }

  var stemsPlan: AbletonExportPlan {
    AbletonExportPlan(
      setID: plan.setID, revisionID: plan.revisionID, workID: plan.workID,
      workName: plan.workName, setURL: plan.setURL, installation: plan.installation,
      source: .allIndividualTracks(expectedTrackCount: nil),
      arrangementRange: plan.arrangementRange, pcmFormat: plan.pcmFormat,
      sampleRate: plan.sampleRate, bitDepth: plan.bitDepth, normalize: plan.normalize,
      includeReturnAndMainEffects: plan.includeReturnAndMainEffects,
      destination: AbletonExportDestination(
        directoryURL: root, baseName: "Safe Fixture Stems"))
  }

  func referencedPlan(generationID: String) -> AbletonExportPlan {
    let reference = StudioRevisionReference(
      workID: plan.workID!, sessionID: "session-1", revisionID: plan.revisionID,
      setID: plan.setID, setURL: plan.setURL, trackedRootURL: root,
      contentObservation: StudioSetContentObservation(
        compressedBytes: 7, modifiedAtNanoseconds: 1,
        reconstructedContentDigest: "indexed-set-digest"),
      displaySnapshot: StudioRevisionDisplaySnapshot(
        artistName: "Artist", workName: plan.workName!, sessionName: "Session",
        revisionName: "Safe Fixture"),
      catalogueAlgorithmVersion: "test", catalogueGenerationID: generationID,
      reviewedAt: Date(timeIntervalSince1970: 1))
    return AbletonExportPlan(
      setID: plan.setID, revisionID: plan.revisionID, workID: plan.workID,
      workName: plan.workName, setURL: plan.setURL, installation: plan.installation,
      source: plan.source, arrangementRange: plan.arrangementRange,
      pcmFormat: plan.pcmFormat, sampleRate: plan.sampleRate, bitDepth: plan.bitDepth,
      normalize: plan.normalize,
      includeReturnAndMainEffects: plan.includeReturnAndMainEffects,
      destination: plan.destination, overwritePolicy: plan.overwritePolicy,
      revisionReference: reference)
  }

  func mainSnapshot(modified: Bool = false) -> AXApplicationSnapshot {
    AXApplicationSnapshot(
      root: AXSemanticNode(
        id: "app", role: .application,
        children: [
          AXSemanticNode(
            id: "main", role: .window, title: modified ? "Safe Fixture *" : "Safe Fixture",
            identifier: "ableton.main-window",
            attributes: [
              "isMain": "true", "documentPath": setURL.path,
              "isModified": String(modified),
            ],
            children: [
              AXSemanticNode(
                id: "menu.export", role: .menuItem, title: "Export Audio/Video",
                identifier: "ableton.file.export-audio")
            ])
        ]))
  }

  var exportDialogSnapshot: AXApplicationSnapshot {
    AXApplicationSnapshot(
      root: AXSemanticNode(
        id: "app", role: .application,
        children: [
          AXSemanticNode(
            id: "dialog.export", role: .dialog, title: "Export Audio/Video",
            identifier: "ableton.export-audio-dialog",
            children: [
              AXSemanticNode(
                id: "field.source", role: .popUpButton, title: "Rendered Track",
                identifier: "rendered-track"),
              AXSemanticNode(
                id: "field.start", role: .textField, title: "Render Start",
                identifier: "render-start"),
              AXSemanticNode(
                id: "field.length", role: .textField, title: "Render Length",
                identifier: "render-length"),
              AXSemanticNode(
                id: "field.type", role: .popUpButton, title: "File Type", identifier: "file-type"),
              AXSemanticNode(
                id: "field.rate", role: .popUpButton, title: "Sample Rate",
                identifier: "sample-rate"),
              AXSemanticNode(
                id: "field.depth", role: .popUpButton, title: "Bit Depth", identifier: "bit-depth"),
              AXSemanticNode(
                id: "field.normalize", role: .checkBox, title: "Normalize", identifier: "normalize"),
              AXSemanticNode(
                id: "field.effects", role: .checkBox, title: "Include Return and Main Effects",
                identifier: "include-return-main-effects"),
              AXSemanticNode(id: "button.export", role: .button, title: "Export"),
            ])
        ]))
  }

  var savePanelSnapshot: AXApplicationSnapshot {
    AXApplicationSnapshot(
      root: AXSemanticNode(
        id: "app", role: .application,
        children: [
          AXSemanticNode(
            id: "panel.save", role: .sheet, title: "Save", identifier: "NSSavePanel",
            children: [
              AXSemanticNode(
                id: "field.name", role: .textField, title: "Save As", identifier: "save-name"),
              AXSemanticNode(id: "button.save", role: .button, title: "Save"),
            ])
        ]))
  }

  var progressSnapshot: AXApplicationSnapshot {
    AXApplicationSnapshot(
      root: AXSemanticNode(
        id: "app", role: .application,
        children: [
          AXSemanticNode(
            id: "progress", role: .progressIndicator, identifier: "ableton.export-progress",
            value: "0.5")
        ]))
  }

  var unexpectedDialogSnapshot: AXApplicationSnapshot {
    AXApplicationSnapshot(
      root: AXSemanticNode(
        id: "app", role: .application,
        children: [
          mainSnapshot().root.children[0],
          AXSemanticNode(id: "license", role: .dialog, title: "License Agreement"),
        ]))
  }

  func remove() { try? FileManager.default.removeItem(at: root) }
}

private actor FakeAbletonAccessibilityClient: AbletonAccessibilityClient {
  private let permission: AccessibilityPermissionState
  private let process: AbletonRunningProcess
  private let snapshots: [AXApplicationSnapshot]
  private let outputURL: URL?
  private let stallAfterSave: Bool
  private let pauseBeforeFirstSnapshot: Bool
  private var snapshotIndex = 0
  private var instructions: [AXSemanticInstruction] = []
  private var cancelled = false
  private var submittedSave = false
  private var firstSnapshotRequested = false
  private var firstSnapshotReleased = false

  init(
    permission: AccessibilityPermissionState = .authorized,
    process: AbletonRunningProcess,
    snapshots: [AXApplicationSnapshot],
    outputURL: URL? = nil,
    stallAfterSave: Bool = false,
    pauseBeforeFirstSnapshot: Bool = false
  ) {
    self.permission = permission
    self.process = process
    self.snapshots = snapshots
    self.outputURL = outputURL
    self.stallAfterSave = stallAfterSave
    self.pauseBeforeFirstSnapshot = pauseBeforeFirstSnapshot
  }

  func permissionState(requestIfNeeded: Bool) async -> AccessibilityPermissionState { permission }
  func runningAbletonProcesses() async -> [AbletonRunningProcess] { [process] }

  func snapshot(processIdentifier: Int32) async throws -> AXApplicationSnapshot {
    if pauseBeforeFirstSnapshot, snapshotIndex == 0, !firstSnapshotReleased {
      firstSnapshotRequested = true
      while !firstSnapshotReleased { await Task.yield() }
    }
    return snapshots[min(snapshotIndex, snapshots.count - 1)]
  }

  func perform(_ instruction: AXSemanticInstruction, processIdentifier: Int32) async throws {
    instructions.append(instruction)
    switch instruction {
    case .press(nodeID: "menu.export"):
      snapshotIndex = min(1, snapshots.count - 1)
    case .press(nodeID: "button.export"):
      snapshotIndex = min(2, snapshots.count - 1)
    case .press(nodeID: "button.save"):
      submittedSave = true
      snapshotIndex = min(3, snapshots.count - 1)
      if let outputURL { try minimalWAV().write(to: outputURL, options: .atomic) }
    default:
      break
    }
  }

  func cancelCurrentOperation(processIdentifier: Int32) async { cancelled = true }

  func waitForChange() async throws {
    if stallAfterSave, submittedSave {
      try await Task.sleep(for: .seconds(60))
    } else if snapshotIndex == 3 {
      snapshotIndex = min(4, snapshots.count - 1)
    } else {
      await Task.yield()
    }
  }

  func performedInstructions() -> [AXSemanticInstruction] { instructions }
  func cancelWasRequested() -> Bool { cancelled }
  func didSubmitSave() -> Bool { submittedSave }

  func waitUntilSnapshotRequested() async {
    while !firstSnapshotRequested { await Task.yield() }
  }

  func releaseFirstSnapshot() { firstSnapshotReleased = true }
}

private func minimalWAV() -> Data {
  Data([
    0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    0x66, 0x6D, 0x74, 0x20, 0x10, 0, 0, 0, 1, 0, 1, 0,
    0x44, 0xAC, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 16, 0,
    0x64, 0x61, 0x74, 0x61, 0, 0, 0, 0,
  ])
}
