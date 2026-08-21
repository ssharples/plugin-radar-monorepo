import AppKit
import ApplicationServices
import Foundation

public enum AccessibilityPermissionState: String, Codable, Sendable {
  case authorized
  case denied
  case notDetermined
}

public struct AbletonRunningProcess: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let processIdentifier: Int32
  public let bundleIdentifier: String?
  public let applicationURL: URL?
  public let displayName: String
  public let version: String?

  public init(
    processIdentifier: Int32,
    bundleIdentifier: String?,
    applicationURL: URL?,
    displayName: String,
    version: String?
  ) {
    self.processIdentifier = processIdentifier
    self.bundleIdentifier = bundleIdentifier
    self.applicationURL = applicationURL
    self.displayName = displayName
    self.version = version
    id = StableID.forValue("live-process:\(processIdentifier):\(applicationURL?.path ?? "")")
  }
}

public enum AXSemanticRole: String, Codable, Sendable {
  case application
  case window
  case dialog
  case sheet
  case button
  case menuItem
  case textField
  case popUpButton
  case checkBox
  case progressIndicator
  case group
  case unknown
}

public struct AXSemanticNode: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let role: AXSemanticRole
  public let title: String?
  public let identifier: String?
  public let value: String?
  public let isEnabled: Bool
  public let attributes: [String: String]
  public let children: [AXSemanticNode]

  public init(
    id: String,
    role: AXSemanticRole,
    title: String? = nil,
    identifier: String? = nil,
    value: String? = nil,
    isEnabled: Bool = true,
    attributes: [String: String] = [:],
    children: [AXSemanticNode] = []
  ) {
    self.id = id
    self.role = role
    self.title = title
    self.identifier = identifier
    self.value = value
    self.isEnabled = isEnabled
    self.attributes = attributes
    self.children = children
  }

  public func first(where predicate: (AXSemanticNode) -> Bool) -> AXSemanticNode? {
    if predicate(self) { return self }
    for child in children {
      if let match = child.first(where: predicate) { return match }
    }
    return nil
  }

  public func all(where predicate: (AXSemanticNode) -> Bool) -> [AXSemanticNode] {
    var matches = predicate(self) ? [self] : []
    for child in children { matches.append(contentsOf: child.all(where: predicate)) }
    return matches
  }
}

public struct AXApplicationSnapshot: Codable, Sendable, Equatable {
  public let capturedAt: Date
  public let root: AXSemanticNode

  public init(capturedAt: Date = Date(), root: AXSemanticNode) {
    self.capturedAt = capturedAt
    self.root = root
  }
}

public enum AXSemanticInstruction: Sendable, Equatable {
  case press(nodeID: String)
  case setString(nodeID: String, value: String)
  case setBool(nodeID: String, value: Bool)
  case setURL(nodeID: String, value: URL)
}

public protocol AbletonAccessibilityClient: Sendable {
  func permissionState(requestIfNeeded: Bool) async -> AccessibilityPermissionState
  func runningAbletonProcesses() async -> [AbletonRunningProcess]
  func snapshot(processIdentifier: Int32) async throws -> AXApplicationSnapshot
  func perform(_ instruction: AXSemanticInstruction, processIdentifier: Int32) async throws
  func cancelCurrentOperation(processIdentifier: Int32) async
  func waitForChange() async throws
}

public enum AbletonAutomationState: Sendable, Equatable {
  case idle
  case preflighting
  case awaitingApproval
  case confirmingActiveSet
  case openingExportDialog
  case configuringExport
  case choosingDestination
  case exporting(progress: Double?)
  case verifyingOutputs
  case completed
  case cancelled
  case failed(String)
}

public enum AbletonAutomationEvent: Sendable, Equatable {
  case state(AbletonAutomationState)
  case message(String)
}

public struct AbletonAutomationPreflight: Sendable, Equatable {
  public let permission: AccessibilityPermissionState
  public let process: AbletonRunningProcess?
  public let adapterVersion: String?
  public let activeSetConfirmed: Bool
  public let activeSetURL: URL?
  public let hasUnsavedChanges: Bool?
  public let message: String

  public init(
    permission: AccessibilityPermissionState,
    process: AbletonRunningProcess?,
    adapterVersion: String?,
    activeSetConfirmed: Bool,
    activeSetURL: URL?,
    hasUnsavedChanges: Bool?,
    message: String
  ) {
    self.permission = permission
    self.process = process
    self.adapterVersion = adapterVersion
    self.activeSetConfirmed = activeSetConfirmed
    self.activeSetURL = activeSetURL
    self.hasUnsavedChanges = hasUnsavedChanges
    self.message = message
  }
}

public enum AbletonAutomationError: Error, LocalizedError, Equatable {
  case accessibilityPermissionRequired
  case liveNotRunning
  case unsupportedVersion(String?)
  case activeSetMismatch(expected: URL, observed: String?)
  case unsavedSet(String)
  case missingSemanticControl(String)
  case unexpectedDialog(String)
  case invalidApproval
  case timedOut(String)
  case cancelled
  case accessibilityFailure(String)

  public var errorDescription: String? {
    switch self {
    case .accessibilityPermissionRequired:
      "Accessibility permission is required before Studio Time Machine can control Ableton Live."
    case .liveNotRunning: "Ableton Live is not running."
    case .unsupportedVersion(let version):
      "Ableton Live \(version ?? "Unknown") is unsupported. This adapter targets 12.4.2."
    case .activeSetMismatch(let expected, let observed):
      "The active Live Set could not be confirmed as \(expected.lastPathComponent). Observed: \(observed ?? "unknown")."
    case .unsavedSet(let name):
      "\(name) has unsaved changes. Automation stopped without opening or changing anything."
    case .missingSemanticControl(let label):
      "Ableton Live 12.4.2 did not expose the expected Accessibility control: \(label)."
    case .unexpectedDialog(let title):
      "Automation stopped at an unexpected dialog: \(title)."
    case .invalidApproval: "The export approval is missing, stale, or belongs to another plan."
    case .timedOut(let state): "Ableton automation timed out while \(state)."
    case .cancelled: "Ableton export automation was cancelled."
    case .accessibilityFailure(let message): "Accessibility automation failed: \(message)"
    }
  }
}

public protocol AbletonLiveUIAdapter: Sendable {
  var adapterVersion: String { get }
  func supports(version: String?) -> Bool
  func confirmActiveSet(
    snapshot: AXApplicationSnapshot,
    plan: AbletonExportPlan
  ) throws -> AbletonActiveSetConfirmation
  func openExportInstruction(snapshot: AXApplicationSnapshot) throws -> AXSemanticInstruction
  func exportDialogInstructions(
    snapshot: AXApplicationSnapshot,
    plan: AbletonExportPlan
  ) throws -> [AXSemanticInstruction]?
  func savePanelInstructions(
    snapshot: AXApplicationSnapshot,
    plan: AbletonExportPlan
  ) throws -> [AXSemanticInstruction]?
  func exportProgress(snapshot: AXApplicationSnapshot) throws -> Double?
  func hasExportUI(snapshot: AXApplicationSnapshot) -> Bool
}

public struct AbletonActiveSetConfirmation: Sendable, Equatable {
  public let isConfirmed: Bool
  public let observedDocument: String?
  public let observedURL: URL?
  public let hasUnsavedChanges: Bool

  public init(
    isConfirmed: Bool,
    observedDocument: String?,
    observedURL: URL?,
    hasUnsavedChanges: Bool
  ) {
    self.isConfirmed = isConfirmed
    self.observedDocument = observedDocument
    self.observedURL = observedURL
    self.hasUnsavedChanges = hasUnsavedChanges
  }
}

public struct AbletonLive124UIAdapter: AbletonLiveUIAdapter {
  public let adapterVersion = "ableton-live-12.4.2-ax-v1"

  public init() {}

  public func supports(version: String?) -> Bool {
    version?.hasPrefix("12.4.2") == true
  }

  public func confirmActiveSet(
    snapshot: AXApplicationSnapshot,
    plan: AbletonExportPlan
  ) throws -> AbletonActiveSetConfirmation {
    try rejectUnexpectedDialog(snapshot)
    guard
      let window = snapshot.root.first(where: {
        $0.role == .window
          && ($0.attributes["isMain"] == "true" || $0.identifier == "ableton.main-window")
      })
    else { throw AbletonAutomationError.missingSemanticControl("main Live window") }
    let observedDocument = window.attributes["documentPath"] ?? window.value ?? window.title
    let observedURL = observedDocument.flatMap(Self.fileURL)
    let expectedPath = plan.setURL.standardizedFileURL.path
    let titleName = plan.setURL.deletingPathExtension().lastPathComponent
    let confirmed =
      observedURL?.standardizedFileURL.path == expectedPath
      || (observedURL == nil && window.title?.localizedCaseInsensitiveContains(titleName) == true)
    let modified =
      window.attributes["isModified"] == "true"
      || window.title?.contains("*") == true
      || window.title?.localizedCaseInsensitiveContains("unsaved") == true
    return AbletonActiveSetConfirmation(
      isConfirmed: confirmed,
      observedDocument: observedDocument,
      observedURL: observedURL,
      hasUnsavedChanges: modified
    )
  }

  public func openExportInstruction(snapshot: AXApplicationSnapshot) throws -> AXSemanticInstruction
  {
    try rejectUnexpectedDialog(snapshot)
    guard
      let item = snapshot.root.first(where: {
        $0.role == .menuItem
          && ($0.identifier == "ableton.file.export-audio"
            || $0.title?.localizedCaseInsensitiveContains("Export Audio") == true)
          && $0.isEnabled
      })
    else {
      throw AbletonAutomationError.missingSemanticControl("File > Export Audio/Video")
    }
    return .press(nodeID: item.id)
  }

  public func exportDialogInstructions(
    snapshot: AXApplicationSnapshot,
    plan: AbletonExportPlan
  ) throws -> [AXSemanticInstruction]? {
    try rejectUnexpectedDialog(snapshot, allowing: ["Export Audio", "Export Audio/Video"])
    guard let dialog = exportDialog(snapshot) else { return nil }
    let renderedTrack = try field("rendered-track", title: "Rendered Track", in: dialog)
    let start = try field("render-start", title: "Render Start", in: dialog)
    let length = try field("render-length", title: "Render Length", in: dialog)
    let fileType = try field("file-type", title: "File Type", in: dialog)
    let sampleRate = try field("sample-rate", title: "Sample Rate", in: dialog)
    let bitDepth = try field("bit-depth", title: "Bit Depth", in: dialog)
    let normalize = try field("normalize", title: "Normalize", in: dialog)
    let effects = try field(
      "include-return-main-effects", title: "Include Return and Main Effects", in: dialog)
    guard
      let export = dialog.first(where: {
        $0.role == .button && $0.title?.caseInsensitiveCompare("Export") == .orderedSame
          && $0.isEnabled
      })
    else { throw AbletonAutomationError.missingSemanticControl("Export button") }
    return [
      .setString(nodeID: renderedTrack.id, value: plan.source.title),
      .setString(nodeID: start.id, value: Self.beatString(plan.arrangementRange.startBeat)),
      .setString(nodeID: length.id, value: Self.beatString(plan.arrangementRange.lengthBeats)),
      .setString(nodeID: fileType.id, value: plan.pcmFormat.displayName),
      .setString(nodeID: sampleRate.id, value: String(plan.sampleRate.rawValue)),
      .setString(nodeID: bitDepth.id, value: String(plan.bitDepth.rawValue)),
      .setBool(nodeID: normalize.id, value: plan.normalize),
      .setBool(nodeID: effects.id, value: plan.includeReturnAndMainEffects),
      .press(nodeID: export.id),
    ]
  }

  public func savePanelInstructions(
    snapshot: AXApplicationSnapshot,
    plan: AbletonExportPlan
  ) throws -> [AXSemanticInstruction]? {
    try rejectUnexpectedDialog(snapshot, allowing: ["Save", "Export"])
    guard
      let panel = snapshot.root.first(where: {
        ($0.role == .sheet || $0.role == .dialog)
          && ($0.identifier == "NSSavePanel"
            || $0.attributes["subrole"] == "AXStandardWindow")
      })
    else { return nil }
    let name = try field("save-name", title: "Save As", in: panel)
    guard
      let save = panel.first(where: {
        $0.role == .button
          && ($0.title?.caseInsensitiveCompare("Save") == .orderedSame
            || $0.title?.caseInsensitiveCompare("Export") == .orderedSame)
          && $0.isEnabled
      })
    else { throw AbletonAutomationError.missingSemanticControl("Save button") }
    return [
      .setURL(nodeID: panel.id, value: plan.destination.directoryURL),
      .setString(nodeID: name.id, value: plan.destination.baseName),
      .press(nodeID: save.id),
    ]
  }

  public func exportProgress(snapshot: AXApplicationSnapshot) throws -> Double? {
    try rejectUnexpectedDialog(snapshot, allowing: ["Export", "Rendering"])
    guard
      let progress = snapshot.root.first(where: {
        $0.role == .progressIndicator || $0.identifier == "ableton.export-progress"
      })
    else { return nil }
    if let value = progress.value.flatMap(Double.init) {
      return value > 1 ? min(1, value / 100) : max(0, value)
    }
    return 0
  }

  public func hasExportUI(snapshot: AXApplicationSnapshot) -> Bool {
    exportDialog(snapshot) != nil
      || snapshot.root.first(where: {
        $0.identifier == "NSSavePanel" || $0.identifier == "ableton.export-progress"
      }) != nil
  }

  private func exportDialog(_ snapshot: AXApplicationSnapshot) -> AXSemanticNode? {
    snapshot.root.first(where: {
      ($0.role == .dialog || $0.role == .sheet)
        && ($0.identifier == "ableton.export-audio-dialog"
          || $0.title?.localizedCaseInsensitiveContains("Export Audio") == true)
    })
  }

  private func field(_ identifier: String, title: String, in root: AXSemanticNode) throws
    -> AXSemanticNode
  {
    guard
      let node = root.first(where: {
        $0.identifier == identifier || $0.title?.caseInsensitiveCompare(title) == .orderedSame
      })
    else { throw AbletonAutomationError.missingSemanticControl(title) }
    return node
  }

  private func rejectUnexpectedDialog(
    _ snapshot: AXApplicationSnapshot,
    allowing allowedTitles: [String] = []
  ) throws {
    let dialogs = snapshot.root.all { $0.role == .dialog || $0.role == .sheet }
    for dialog in dialogs {
      let title = dialog.title ?? dialog.identifier ?? "Untitled dialog"
      let isAllowed =
        allowedTitles.contains { title.localizedCaseInsensitiveContains($0) }
        || dialog.identifier == "NSSavePanel"
        || dialog.identifier == "ableton.export-progress"
      if !isAllowed { throw AbletonAutomationError.unexpectedDialog(title) }
    }
  }

  private static func fileURL(_ value: String) -> URL? {
    if value.hasPrefix("file://") { return URL(string: value) }
    if value.hasPrefix("/") { return URL(fileURLWithPath: value) }
    return nil
  }

  private static func beatString(_ value: Double) -> String {
    value.formatted(.number.precision(.fractionLength(0...3)))
  }
}

public actor AbletonAutomation {
  private let client: any AbletonAccessibilityClient
  private let adapters: [any AbletonLiveUIAdapter]
  private let verifier: AbletonExportOutputVerifier
  private let evidenceStore: AbletonExportEvidenceStore?
  private let revisionExecutionAuthority: StudioRevisionExecutionAuthority?
  private var continuations: [UUID: AsyncStream<AbletonAutomationEvent>.Continuation] = [:]

  public init(
    client: any AbletonAccessibilityClient,
    adapters: [any AbletonLiveUIAdapter] = [AbletonLive124UIAdapter()],
    verifier: AbletonExportOutputVerifier = AbletonExportOutputVerifier(),
    evidenceStore: AbletonExportEvidenceStore? = nil,
    revisionExecutionAuthority: StudioRevisionExecutionAuthority? = nil
  ) {
    self.client = client
    self.adapters = adapters
    self.verifier = verifier
    self.evidenceStore = evidenceStore
    self.revisionExecutionAuthority = revisionExecutionAuthority
  }

  public static func live124(
    evidenceStore: AbletonExportEvidenceStore? = nil,
    revisionExecutionAuthority: StudioRevisionExecutionAuthority? = nil
  )
    -> AbletonAutomation
  {
    AbletonAutomation(
      client: MacOSAbletonAccessibilityClient(), evidenceStore: evidenceStore,
      revisionExecutionAuthority: revisionExecutionAuthority)
  }

  public func events() -> AsyncStream<AbletonAutomationEvent> {
    let id = UUID()
    return AsyncStream { continuation in
      continuations[id] = continuation
      continuation.onTermination = { _ in
        Task { await self.removeContinuation(id) }
      }
    }
  }

  public func preflight(
    _ plan: AbletonExportPlan,
    requestPermission: Bool = false
  ) async -> AbletonAutomationPreflight {
    emit(.state(.preflighting))
    let permission = await client.permissionState(requestIfNeeded: requestPermission)
    guard permission == .authorized else {
      return AbletonAutomationPreflight(
        permission: permission, process: nil, adapterVersion: nil,
        activeSetConfirmed: false, activeSetURL: nil, hasUnsavedChanges: nil,
        message: AbletonAutomationError.accessibilityPermissionRequired.localizedDescription)
    }
    let process = await matchingProcess(for: plan)
    guard let process else {
      return AbletonAutomationPreflight(
        permission: permission, process: nil, adapterVersion: nil,
        activeSetConfirmed: false, activeSetURL: nil, hasUnsavedChanges: nil,
        message: AbletonAutomationError.liveNotRunning.localizedDescription)
    }
    guard let adapter = adapters.first(where: { $0.supports(version: process.version) }) else {
      return AbletonAutomationPreflight(
        permission: permission, process: process, adapterVersion: nil,
        activeSetConfirmed: false, activeSetURL: nil, hasUnsavedChanges: nil,
        message: AbletonAutomationError.unsupportedVersion(process.version).localizedDescription)
    }
    do {
      let snapshot = try await client.snapshot(processIdentifier: process.processIdentifier)
      let confirmation = try adapter.confirmActiveSet(snapshot: snapshot, plan: plan)
      let message =
        confirmation.hasUnsavedChanges
        ? AbletonAutomationError.unsavedSet(process.displayName).localizedDescription
        : (confirmation.isConfirmed
          ? "Accessibility is ready and the active Set matches the reviewed plan."
          : AbletonAutomationError.activeSetMismatch(
            expected: plan.setURL, observed: confirmation.observedDocument
          ).localizedDescription)
      return AbletonAutomationPreflight(
        permission: permission, process: process, adapterVersion: adapter.adapterVersion,
        activeSetConfirmed: confirmation.isConfirmed,
        activeSetURL: confirmation.observedURL,
        hasUnsavedChanges: confirmation.hasUnsavedChanges,
        message: message)
    } catch {
      return AbletonAutomationPreflight(
        permission: permission, process: process, adapterVersion: adapter.adapterVersion,
        activeSetConfirmed: false, activeSetURL: nil, hasUnsavedChanges: nil,
        message: error.localizedDescription)
    }
  }

  public func execute(
    _ plan: AbletonExportPlan,
    approval: AbletonExportApproval,
    now: Date = Date()
  ) async throws -> AbletonExportEvidence {
    var activeProcessIdentifier: Int32?
    do {
      guard approval.isValid(for: plan, at: now) else {
        throw AbletonAutomationError.invalidApproval
      }
      try Task.checkCancellation()
      try revisionExecutionAuthority?.authorize(plan: plan, approval: approval)
      try AbletonExportPlanValidator().validate(plan)
      let startedAt = now
      emit(.state(.confirmingActiveSet))
      guard await client.permissionState(requestIfNeeded: false) == .authorized else {
        throw AbletonAutomationError.accessibilityPermissionRequired
      }
      guard let process = await matchingProcess(for: plan) else {
        throw AbletonAutomationError.liveNotRunning
      }
      activeProcessIdentifier = process.processIdentifier
      guard let adapter = adapters.first(where: { $0.supports(version: process.version) }) else {
        throw AbletonAutomationError.unsupportedVersion(process.version)
      }
      var snapshot = try await client.snapshot(processIdentifier: process.processIdentifier)
      let confirmation = try adapter.confirmActiveSet(snapshot: snapshot, plan: plan)
      guard confirmation.isConfirmed else {
        throw AbletonAutomationError.activeSetMismatch(
          expected: plan.setURL, observed: confirmation.observedDocument)
      }
      guard !confirmation.hasUnsavedChanges else {
        throw AbletonAutomationError.unsavedSet(process.displayName)
      }

      try Task.checkCancellation()
      try revisionExecutionAuthority?.authorize(plan: plan, approval: approval)
      emit(.state(.openingExportDialog))
      try await client.perform(
        adapter.openExportInstruction(snapshot: snapshot),
        processIdentifier: process.processIdentifier)
      var configured = false
      var destinationSubmitted = false
      var polls = 0

      while polls < 7_200 {
        if Task.isCancelled {
          await client.cancelCurrentOperation(processIdentifier: process.processIdentifier)
          throw AbletonAutomationError.cancelled
        }
        snapshot = try await client.snapshot(processIdentifier: process.processIdentifier)
        if !configured,
          let instructions = try adapter.exportDialogInstructions(snapshot: snapshot, plan: plan)
        {
          emit(.state(.configuringExport))
          for instruction in instructions {
            try await client.perform(instruction, processIdentifier: process.processIdentifier)
          }
          configured = true
          continue
        }
        if configured, !destinationSubmitted,
          let instructions = try adapter.savePanelInstructions(snapshot: snapshot, plan: plan)
        {
          try AbletonExportPlanValidator().validate(plan)
          emit(.state(.choosingDestination))
          for instruction in instructions {
            try await client.perform(instruction, processIdentifier: process.processIdentifier)
          }
          destinationSubmitted = true
          continue
        }
        if destinationSubmitted {
          let progress = try adapter.exportProgress(snapshot: snapshot)
          if progress != nil || adapter.hasExportUI(snapshot: snapshot) {
            emit(.state(.exporting(progress: progress)))
          } else {
            emit(.state(.verifyingOutputs))
            let evidence = try verifier.verify(
              plan: plan,
              startedAt: startedAt,
              completedAt: Date(),
              adapterVersion: adapter.adapterVersion
            )
            if let evidenceStore { try await evidenceStore.append(evidence) }
            emit(.state(.completed))
            return evidence
          }
        }
        polls += 1
        try await client.waitForChange()
      }
      throw AbletonAutomationError.timedOut("waiting for Live export state")
    } catch is CancellationError {
      if let activeProcessIdentifier {
        await client.cancelCurrentOperation(processIdentifier: activeProcessIdentifier)
      }
      emit(.state(.cancelled))
      throw AbletonAutomationError.cancelled
    } catch let error as AbletonAutomationError {
      emit(.state(error == .cancelled ? .cancelled : .failed(error.localizedDescription)))
      throw error
    } catch let error as AbletonExportPlanError {
      emit(.state(.failed(error.localizedDescription)))
      throw error
    } catch let error as AbletonExportVerificationError {
      emit(.state(.failed(error.localizedDescription)))
      throw error
    } catch let error as StudioRevisionReferenceError {
      emit(.state(.failed(error.localizedDescription)))
      throw error
    } catch {
      let wrapped = AbletonAutomationError.accessibilityFailure(error.localizedDescription)
      emit(.state(.failed(wrapped.localizedDescription)))
      throw wrapped
    }
  }

  private func matchingProcess(for plan: AbletonExportPlan) async -> AbletonRunningProcess? {
    let processes = await client.runningAbletonProcesses()
    return processes.first(where: {
      $0.applicationURL?.standardizedFileURL == plan.installation.applicationURL.standardizedFileURL
    })
      ?? processes.first(where: {
        $0.bundleIdentifier == plan.installation.bundleIdentifier
      })
  }

  private func emit(_ event: AbletonAutomationEvent) {
    for continuation in continuations.values { continuation.yield(event) }
  }

  private func removeContinuation(_ id: UUID) {
    continuations.removeValue(forKey: id)
  }
}

public final class MacOSAbletonAccessibilityClient: AbletonAccessibilityClient, @unchecked Sendable
{
  private let lock = NSLock()
  private var elementsByID: [String: AXUIElement] = [:]

  public init() {}

  public func permissionState(requestIfNeeded: Bool) async -> AccessibilityPermissionState {
    if AXIsProcessTrusted() { return .authorized }
    if requestIfNeeded {
      let options = ["AXTrustedCheckOptionPrompt": true] as CFDictionary
      return AXIsProcessTrustedWithOptions(options) ? .authorized : .notDetermined
    }
    return .denied
  }

  public func runningAbletonProcesses() async -> [AbletonRunningProcess] {
    NSWorkspace.shared.runningApplications.compactMap { application in
      let name = application.localizedName ?? ""
      let identity = "\(application.bundleIdentifier ?? "") \(name)".lowercased()
      guard identity.contains("ableton"), identity.contains("live") else { return nil }
      let version = application.bundleURL.flatMap(Self.bundleVersion)
      return AbletonRunningProcess(
        processIdentifier: application.processIdentifier,
        bundleIdentifier: application.bundleIdentifier,
        applicationURL: application.bundleURL,
        displayName: name,
        version: version)
    }
  }

  public func snapshot(processIdentifier: Int32) async throws -> AXApplicationSnapshot {
    var nextElements: [String: AXUIElement] = [:]
    let application = AXUIElementCreateApplication(pid_t(processIdentifier))
    let root = readNode(application, path: "app", depth: 0, elements: &nextElements)
    lock.withLock { elementsByID = nextElements }
    return AXApplicationSnapshot(root: root)
  }

  public func perform(_ instruction: AXSemanticInstruction, processIdentifier: Int32) async throws {
    let nodeID: String
    switch instruction {
    case .press(let id), .setString(let id, _), .setBool(let id, _), .setURL(let id, _):
      nodeID = id
    }
    let element = lock.withLock { elementsByID[nodeID] }
    guard let element else {
      throw AbletonAutomationError.missingSemanticControl(nodeID)
    }
    let result: AXError
    switch instruction {
    case .press:
      result = AXUIElementPerformAction(element, kAXPressAction as CFString)
    case .setString(_, let value):
      result = AXUIElementSetAttributeValue(
        element, kAXValueAttribute as CFString, value as CFTypeRef)
    case .setBool(_, let value):
      result = AXUIElementSetAttributeValue(
        element, kAXValueAttribute as CFString, NSNumber(value: value))
    case .setURL(_, let value):
      result = AXUIElementSetAttributeValue(
        element, kAXDocumentAttribute as CFString, value as CFURL)
    }
    guard result == .success else {
      throw AbletonAutomationError.accessibilityFailure(
        "AX instruction failed with error \(result.rawValue) for \(nodeID)")
    }
  }

  public func cancelCurrentOperation(processIdentifier: Int32) async {
    guard let snapshot = try? await snapshot(processIdentifier: processIdentifier),
      let cancel = snapshot.root.first(where: {
        $0.role == .button && $0.title?.caseInsensitiveCompare("Cancel") == .orderedSame
      })
    else { return }
    try? await perform(.press(nodeID: cancel.id), processIdentifier: processIdentifier)
  }

  public func waitForChange() async throws {
    try await Task.sleep(for: .milliseconds(250))
  }

  private func readNode(
    _ element: AXUIElement,
    path: String,
    depth: Int,
    elements: inout [String: AXUIElement]
  ) -> AXSemanticNode {
    let roleValue = stringAttribute(kAXRoleAttribute, element: element)
    let role = Self.semanticRole(roleValue)
    let title = stringAttribute(kAXTitleAttribute, element: element)
    let identifier = stringAttribute(kAXIdentifierAttribute, element: element)
    let value = stringAttribute(kAXValueAttribute, element: element)
    let document = stringAttribute(kAXDocumentAttribute, element: element)
    let subrole = stringAttribute(kAXSubroleAttribute, element: element)
    let enabled = boolAttribute(kAXEnabledAttribute, element: element) ?? true
    let main = boolAttribute(kAXMainAttribute, element: element)
    let id = StableID.forValue("ax:\(path):\(roleValue ?? ""):\(identifier ?? title ?? "")")
    elements[id] = element
    var attributes: [String: String] = [:]
    if let document { attributes["documentPath"] = document }
    if let subrole { attributes["subrole"] = subrole }
    if let main { attributes["isMain"] = String(main) }
    if let title, title.contains("*") { attributes["isModified"] = "true" }
    var children: [AXSemanticNode] = []
    if depth < 10, let childElements = elementArrayAttribute(kAXChildrenAttribute, element: element)
    {
      children = childElements.enumerated().map { offset, child in
        readNode(child, path: "\(path).\(offset)", depth: depth + 1, elements: &elements)
      }
    }
    return AXSemanticNode(
      id: id, role: role, title: title, identifier: identifier, value: value,
      isEnabled: enabled, attributes: attributes, children: children)
  }

  private func stringAttribute(_ name: String, element: AXUIElement) -> String? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success,
      let value
    else { return nil }
    if let string = value as? String { return string }
    if CFGetTypeID(value) == CFURLGetTypeID(), let url = value as? URL { return url.path }
    if let number = value as? NSNumber { return number.stringValue }
    return nil
  }

  private func boolAttribute(_ name: String, element: AXUIElement) -> Bool? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success,
      let number = value as? NSNumber
    else { return nil }
    return number.boolValue
  }

  private func elementArrayAttribute(_ name: String, element: AXUIElement) -> [AXUIElement]? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
      return nil
    }
    return value as? [AXUIElement]
  }

  private static func semanticRole(_ value: String?) -> AXSemanticRole {
    switch value {
    case kAXApplicationRole: .application
    case kAXWindowRole: .window
    case "AXDialog": .dialog
    case kAXSheetRole: .sheet
    case kAXButtonRole: .button
    case kAXMenuItemRole: .menuItem
    case kAXTextFieldRole: .textField
    case kAXPopUpButtonRole: .popUpButton
    case kAXCheckBoxRole: .checkBox
    case kAXProgressIndicatorRole: .progressIndicator
    case kAXGroupRole: .group
    default: .unknown
    }
  }

  private static func bundleVersion(_ url: URL) -> String? {
    guard let bundle = Bundle(url: url) else { return nil }
    return bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
      ?? bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String
  }
}

public protocol AbletonComputerUseFallback: Sendable {
  func requestRecovery(
    plan: AbletonExportPlan,
    abletonWindowOnly: Bool,
    explicitScreenshotConsent: Bool
  ) async throws -> Never
}

public enum AbletonComputerUseFallbackError: Error, LocalizedError {
  case notConfigured
  case consentRequired

  public var errorDescription: String? {
    switch self {
    case .notConfigured:
      "Computer-use recovery is not configured. Deterministic Accessibility automation remains primary."
    case .consentRequired:
      "Computer-use recovery requires explicit screenshot consent and must be limited to the Ableton window."
    }
  }
}

public struct DisabledAbletonComputerUseFallback: AbletonComputerUseFallback {
  public init() {}

  public func requestRecovery(
    plan: AbletonExportPlan,
    abletonWindowOnly: Bool,
    explicitScreenshotConsent: Bool
  ) async throws -> Never {
    guard abletonWindowOnly, explicitScreenshotConsent else {
      throw AbletonComputerUseFallbackError.consentRequired
    }
    throw AbletonComputerUseFallbackError.notConfigured
  }
}
