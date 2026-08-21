import Foundation
import Testing

@testable import StudioCore

@Suite("Ableton Live bridge")
struct AbletonLiveBridgeTests {
  @Test("Discovers Live applications and plans with the matching creator major version")
  func discoversAndPlans() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    try makeApplication(name: "Ableton Live 11 Suite", version: "11.3.42", in: root)
    try makeApplication(name: "Ableton Live 12 Suite", version: "12.2.5", in: root)
    try makeApplication(name: "Unrelated Audio Tool", version: "99.0", in: root, ableton: false)

    let installations = AbletonLiveLocator().installedApplications(searchRoots: [root])

    #expect(installations.count == 2)
    #expect(installations.first?.majorVersion == 12)
    let setURL = root.appending(path: "Song.als")
    try Data("set".utf8).write(to: setURL)
    let plan = try AbletonLiveBridge().planOpen(
      set: makeSet(url: setURL, creator: "Ableton Live 11.3.42"),
      installations: installations
    )
    #expect(plan.installation.majorVersion == 11)
    #expect(plan.requiresUserControlledExport)
    #expect(plan.explanation.contains("matching"))
  }

  @Test("Refuses to plan an unavailable Set or an absent installation")
  func validatesInputs() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let setURL = root.appending(path: "Missing.als")
    let bridge = AbletonLiveBridge()
    #expect(throws: AbletonLiveBridgeError.self) {
      try bridge.planOpen(set: makeSet(url: setURL, creator: nil), installations: [])
    }
    try Data("set".utf8).write(to: setURL)
    #expect(throws: AbletonLiveBridgeError.self) {
      try bridge.planOpen(set: makeSet(url: setURL, creator: nil), installations: [])
    }
  }

  private func makeApplication(
    name: String,
    version: String,
    in root: URL,
    ableton: Bool = true
  ) throws {
    let application = root.appending(path: "\(name).app", directoryHint: .isDirectory)
    let contents = application.appending(path: "Contents", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
    let info: [String: Any] = [
      "CFBundleIdentifier": ableton ? "com.ableton.live" : "com.example.audio",
      "CFBundleDisplayName": name,
      "CFBundleShortVersionString": version,
    ]
    let data = try PropertyListSerialization.data(
      fromPropertyList: info,
      format: .binary,
      options: 0
    )
    try data.write(to: contents.appending(path: "Info.plist"))
  }

  private func makeSet(url: URL, creator: String?) -> AbletonSet {
    AbletonSet(
      id: "set",
      fileURL: url,
      displayName: "Song",
      isBackup: false,
      modifiedAt: nil,
      compressedBytes: 0,
      xmlBytes: 0,
      creator: creator,
      format: AbletonFormat(
        majorVersion: nil,
        minorVersion: nil,
        schemaChangeCount: nil,
        revision: nil
      ),
      structure: SetStructure()
    )
  }
}
