import AppKit
import Carbon.HIToolbox
import SwiftUI

@MainActor
final class StudioLiveInsertPanelController: NSObject {
  private let store: StudioLibraryStore
  private var panel: StudioLiveInsertPanel?
  private var previousApplication: NSRunningApplication?

  init(store: StudioLibraryStore) {
    self.store = store
  }

  func toggle() {
    if panel?.isVisible == true {
      dismiss()
    } else {
      present()
    }
  }

  func present() {
    previousApplication = NSWorkspace.shared.frontmostApplication
    store.prepareLiveInsert(sourceApplicationName: previousApplication?.localizedName)
    let panel = panel ?? makePanel()
    self.panel = panel
    position(panel)
    NSApp.activate(ignoringOtherApps: true)
    panel.makeKeyAndOrderFront(nil)
  }

  func dismiss(restorePreviousApplication: Bool = true) {
    panel?.orderOut(nil)
    if restorePreviousApplication,
      let previousApplication,
      previousApplication.bundleIdentifier != Bundle.main.bundleIdentifier
    {
      previousApplication.activate(options: [])
    }
    self.previousApplication = nil
  }

  private func makePanel() -> StudioLiveInsertPanel {
    let panel = StudioLiveInsertPanel(
      contentRect: NSRect(x: 0, y: 0, width: 720, height: 520),
      styleMask: [.titled, .fullSizeContentView],
      backing: .buffered,
      defer: false)
    panel.title = "Live Insert"
    panel.titleVisibility = .hidden
    panel.titlebarAppearsTransparent = true
    panel.isMovableByWindowBackground = true
    panel.isFloatingPanel = true
    panel.level = .floating
    panel.hidesOnDeactivate = false
    panel.isReleasedWhenClosed = false
    panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    panel.backgroundColor = .clear
    panel.hasShadow = true
    panel.animationBehavior = .utilityWindow
    panel.standardWindowButton(.closeButton)?.isHidden = true
    panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
    panel.standardWindowButton(.zoomButton)?.isHidden = true

    let rootView = StudioLiveInsertPaletteView(
      store: store,
      dismiss: { [weak self] in self?.dismiss() },
      openSource: { [weak self] hit in
        guard let self else { return }
        self.dismiss(restorePreviousApplication: false)
        self.store.openLiveInsertHit(hit)
        self.showStudioLibraryWindow()
      },
      revealSource: { [weak self] hit in
        guard let self else { return }
        self.dismiss(restorePreviousApplication: false)
        self.store.revealLiveInsertHit(hit)
      })
    panel.contentView = NSHostingView(rootView: rootView)
    return panel
  }

  private func position(_ panel: NSPanel) {
    let screen = NSScreen.main ?? NSScreen.screens.first
    guard let visibleFrame = screen?.visibleFrame else {
      panel.center()
      return
    }
    let origin = NSPoint(
      x: visibleFrame.midX - panel.frame.width / 2,
      y: visibleFrame.maxY - panel.frame.height - min(110, visibleFrame.height * 0.13))
    panel.setFrameOrigin(origin)
  }

  private func showStudioLibraryWindow() {
    NSApp.activate(ignoringOtherApps: true)
    NSApp.windows.first(where: { window in
      window !== panel && !(window is NSPanel)
    })?.makeKeyAndOrderFront(nil)
  }
}

private final class StudioLiveInsertPanel: NSPanel {
  override var canBecomeKey: Bool { true }
  override var canBecomeMain: Bool { false }
}

enum StudioGlobalHotKeyRegistrationError: Error, LocalizedError {
  case eventHandler(OSStatus)
  case hotKey(OSStatus)

  var errorDescription: String? {
    switch self {
    case .eventHandler(let status):
      "The Live Insert keyboard event handler could not be installed (\(status))."
    case .hotKey(let status):
      "Command-Shift-F is already reserved or could not be registered (\(status))."
    }
  }
}

final class StudioGlobalHotKeyController: @unchecked Sendable {
  private static let signature: OSType = 0x5354_4D49  // STMI
  private static let identifier: UInt32 = 1

  private let action: @MainActor @Sendable () -> Void
  private var eventHandler: EventHandlerRef?
  private var hotKey: EventHotKeyRef?

  @MainActor
  init(action: @escaping @MainActor @Sendable () -> Void) {
    self.action = action
  }

  deinit {
    if let hotKey { UnregisterEventHotKey(hotKey) }
    if let eventHandler { RemoveEventHandler(eventHandler) }
  }

  func registerCommandShiftF() throws {
    guard eventHandler == nil, hotKey == nil else { return }

    var eventType = EventTypeSpec(
      eventClass: OSType(kEventClassKeyboard),
      eventKind: UInt32(kEventHotKeyPressed))
    let handlerStatus = InstallEventHandler(
      GetApplicationEventTarget(),
      studioLiveInsertHotKeyHandler,
      1,
      &eventType,
      Unmanaged.passUnretained(self).toOpaque(),
      &eventHandler)
    guard handlerStatus == noErr else {
      throw StudioGlobalHotKeyRegistrationError.eventHandler(handlerStatus)
    }

    let identifier = EventHotKeyID(
      signature: Self.signature,
      id: Self.identifier)
    let hotKeyStatus = RegisterEventHotKey(
      UInt32(kVK_ANSI_F),
      UInt32(cmdKey | shiftKey),
      identifier,
      GetApplicationEventTarget(),
      0,
      &hotKey)
    guard hotKeyStatus == noErr else {
      if let eventHandler { RemoveEventHandler(eventHandler) }
      eventHandler = nil
      throw StudioGlobalHotKeyRegistrationError.hotKey(hotKeyStatus)
    }
  }

  fileprivate func receive(_ event: EventRef?) -> OSStatus {
    guard let event else { return OSStatus(eventNotHandledErr) }
    var identifier = EventHotKeyID()
    let status = GetEventParameter(
      event,
      EventParamName(kEventParamDirectObject),
      EventParamType(typeEventHotKeyID),
      nil,
      MemoryLayout<EventHotKeyID>.size,
      nil,
      &identifier)
    guard status == noErr,
      identifier.signature == Self.signature,
      identifier.id == Self.identifier
    else { return OSStatus(eventNotHandledErr) }

    Task { @MainActor [action] in action() }
    return noErr
  }
}

private let studioLiveInsertHotKeyHandler: EventHandlerUPP = {
  _, event, userData in
  guard let userData else { return OSStatus(eventNotHandledErr) }
  let controller = Unmanaged<StudioGlobalHotKeyController>
    .fromOpaque(userData)
    .takeUnretainedValue()
  return controller.receive(event)
}
