import Foundation
import Testing

@testable import StudioCore

@Suite("Installed plug-in inventory")
struct PluginInventoryTests {
  @Test("Scans plug-in bundles without loading their code")
  func scansBundleMetadata() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let bundle = root.appending(path: "Example EQ.vst3", directoryHint: .isDirectory)
    let contents = bundle.appending(path: "Contents", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
    let info: [String: Any] = [
      "CFBundleIdentifier": "audio.example.eq",
      "CFBundleDisplayName": "Example EQ",
      "CFBundleShortVersionString": "2.0.0",
      "Manufacturer": "Example Audio",
    ]
    let data = try PropertyListSerialization.data(
      fromPropertyList: info,
      format: .xml,
      options: 0
    )
    try data.write(to: contents.appending(path: "Info.plist"))

    let inventory = PluginInventoryScanner(
      searchRoots: [PluginSearchRoot(fileURL: root, format: .vst3)]
    ).scan()

    #expect(inventory.plugins.count == 1)
    #expect(inventory.plugins[0].name == "Example EQ")
    #expect(inventory.plugins[0].manufacturer == "Example Audio")
    #expect(inventory.plugins[0].version == "2.0.0")
    #expect(inventory.plugins[0].bundleIdentifier == "audio.example.eq")
  }

  @Test("Distinguishes installed, missing, mismatched, and unscanned plug-ins")
  func evaluatesCompatibility() {
    let required = PluginIdentity(
      format: .vst3,
      name: "Example EQ",
      manufacturer: "Example Audio",
      identifier: "audio.example.eq",
      version: "1.0.0"
    )
    let installed = InstalledPlugin(
      id: "installed",
      name: "Example EQ",
      manufacturer: "Example Audio",
      format: .vst3,
      version: "2.0.0",
      bundleIdentifier: "audio.example.eq",
      componentIdentifier: nil,
      bundleURL: URL(fileURLWithPath: "/Library/Example EQ.vst3")
    )
    let set = makeSet(plugin: required)
    let evaluator = PluginCompatibilityEvaluator()

    let mismatch = evaluator.evaluate(
      set: set,
      inventory: PluginInventory(
        scannedAt: Date(),
        scannedFormats: [.vst3],
        plugins: [installed]
      )
    )
    #expect(mismatch.evidence.first?.status == .versionMismatch)

    let missing = evaluator.evaluate(
      set: set,
      inventory: PluginInventory(scannedAt: Date(), scannedFormats: [.vst3], plugins: [])
    )
    #expect(missing.evidence.first?.status == .missing)

    let unknown = evaluator.evaluate(
      set: set,
      inventory: PluginInventory(scannedAt: Date(), scannedFormats: [], plugins: [])
    )
    #expect(unknown.evidence.first?.status == .unknown)

    let matchingSet = makeSet(
      plugin: PluginIdentity(
        format: .vst3,
        name: "Example EQ",
        manufacturer: "Example Audio",
        identifier: "audio.example.eq",
        version: "2.0.0"
      )
    )
    let matching = evaluator.evaluate(
      set: matchingSet,
      inventory: PluginInventory(
        scannedAt: Date(),
        scannedFormats: [.vst3],
        plugins: [installed]
      )
    )
    #expect(matching.evidence.first?.status == .installed)
  }

  private func makeSet(plugin: PluginIdentity) -> AbletonSet {
    let device = SetDevice(
      id: "device",
      xmlID: "1",
      kind: .vst3,
      typeName: "PluginDevice",
      displayName: plugin.name ?? "Plug-in",
      isEnabled: true,
      plugin: plugin,
      stateDigest: "state",
      nestedDevices: [],
      resourceReferences: []
    )
    let track = SetTrack(
      id: "track",
      xmlID: "1",
      kind: .audio,
      name: "Audio",
      colorIndex: nil,
      groupTrackXMLID: nil,
      isFolded: nil,
      mixer: TrackMixerState(),
      devices: [device],
      clips: []
    )
    return AbletonSet(
      id: "set",
      fileURL: URL(fileURLWithPath: "/Project/Song.als"),
      displayName: "Song",
      isBackup: false,
      modifiedAt: nil,
      compressedBytes: 0,
      xmlBytes: 0,
      creator: nil,
      format: AbletonFormat(
        majorVersion: nil,
        minorVersion: nil,
        schemaChangeCount: nil,
        revision: nil
      ),
      structure: SetStructure(),
      content: AbletonSetContent(tracks: [track])
    )
  }
}
