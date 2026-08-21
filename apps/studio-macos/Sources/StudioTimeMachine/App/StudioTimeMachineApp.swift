import AppKit
import SwiftUI

@main
struct StudioTimeMachineApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @State private var store = StudioLibraryStore()

  var body: some Scene {
    WindowGroup("Studio Library", id: "studio-library") {
      LibraryRootView(store: store)
        .frame(minWidth: 980, minHeight: 650)
        .preferredColorScheme(.light)
        .accentColor(.black)
        .onAppear {
          appDelegate.configure(store: store)
        }
    }
    .defaultSize(width: 1240, height: 800)
    .windowStyle(.hiddenTitleBar)
    .commands {
      CommandGroup(replacing: .newItem) {}

      CommandMenu("Library") {
        Button("Add to Studio…") {
          store.chooseLibraryFolder()
        }
        .keyboardShortcut("o", modifiers: .command)

        Button("Rescan Library") {
          store.rescan()
        }
        .keyboardShortcut("r", modifiers: .command)
        .disabled(store.library == nil)

        Button("Add Sample Location…") {
          store.chooseSampleLocations()
        }

        Button("Rescan Samples") {
          store.rescanSamples()
        }
        .disabled(store.sampleLocations.isEmpty)

        Button("Show Snapshot History…") {
          store.showSnapshotHistory()
        }
        .keyboardShortcut("h", modifiers: [.command, .option])
        .disabled(store.selectedProjectSnapshots.isEmpty)

        Button("Plan Recovered Audio…") {
          store.chooseAudioRecoveryDestination()
        }
        .disabled(store.selectedSetAvailableClipAudioCount == 0)

        Button("Reveal Selection in Finder") {
          store.revealSelectedInFinder()
        }
        .keyboardShortcut("r", modifiers: [.command, .shift])
        .disabled(store.selectedFileURL == nil)

        Divider()

        Button(store.inspectorPresented ? "Hide Inspector" : "Show Inspector") {
          store.inspectorPresented.toggle()
        }
        .keyboardShortcut("i", modifiers: [.command, .option])
      }

      CommandMenu("Navigate") {
        Button("Studio Library") { store.navigate(to: .library) }
          .keyboardShortcut("1", modifiers: .command)
        Button("Samples") { store.navigate(to: .samples) }
          .keyboardShortcut("2", modifiers: .command)
        Button("Loose Audio") { store.navigate(to: .looseAudio) }
          .keyboardShortcut("3", modifiers: .command)
        Button("Private Chains") { store.navigate(to: .recoveredChains) }
          .keyboardShortcut("4", modifiers: .command)
        Button("Locations") { store.navigate(to: .locations) }
          .keyboardShortcut("5", modifiers: .command)
      }

      CommandGroup(after: .textEditing) {
        Button("Search Studio") {
          NotificationCenter.default.post(name: .focusStudioSearch, object: nil)
        }
        .keyboardShortcut("f", modifiers: .command)
      }

      CommandMenu("Live Insert") {
        Button("Open Live Insert") {
          appDelegate.toggleLiveInsert()
        }
      }
    }

    Settings {
      StudioSettingsView()
        .preferredColorScheme(.light)
        .tint(.black)
        .accentColor(.black)
    }
  }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  private var liveInsertPanelController: StudioLiveInsertPanelController?
  private var liveInsertHotKeyController: StudioGlobalHotKeyController?

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)
    NSApp.applicationIconImage = StudioBrandAssets.appIcon
    NSApp.activate(ignoringOtherApps: true)
    StudioExportNotificationController.shared.configure()

    let hotKeyController = StudioGlobalHotKeyController { [weak self] in
      self?.toggleLiveInsert()
    }
    do {
      try hotKeyController.registerCommandShiftF()
      liveInsertHotKeyController = hotKeyController
    } catch {
      NSLog("Studio Time Machine: %@", error.localizedDescription)
    }
  }

  func configure(store: StudioLibraryStore) {
    guard liveInsertPanelController == nil else { return }
    let controller = StudioLiveInsertPanelController(store: store)
    liveInsertPanelController = controller
    if ProcessInfo.processInfo.arguments.contains("--sample-live-insert") {
      Task { @MainActor in
        try? await Task.sleep(for: .milliseconds(250))
        controller.present()
      }
    }
  }

  func toggleLiveInsert() {
    liveInsertPanelController?.toggle()
  }
}
