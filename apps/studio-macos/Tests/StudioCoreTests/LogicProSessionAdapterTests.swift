import Foundation
import Testing

@testable import StudioCore

@Suite("Logic Pro session adapter")
struct LogicProSessionAdapterTests {
  @Test("Discovers alternatives and backups with truthful static metadata provenance")
  func discoversLogicPackageMetadata() throws {
    let library = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: library) }

    let projectFolder = library.appending(path: "Song", directoryHint: .isDirectory)
    let package = projectFolder.appending(path: "Song.logicx", directoryHint: .isDirectory)
    let resources = package.appending(path: "Resources", directoryHint: .isDirectory)
    let alternative = package.appending(path: "Alternatives/000", directoryHint: .isDirectory)
    let backup = alternative.appending(
      path: "Project File Backups/00", directoryHint: .isDirectory)
    let audioFolder = projectFolder.appending(path: "Audio Files", directoryHint: .isDirectory)
    let packagedAudioFolder = package.appending(
      path: "Media/Audio Files", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: resources, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: backup, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(at: audioFolder, withIntermediateDirectories: true)
    try FileManager.default.createDirectory(
      at: packagedAudioFolder, withIntermediateDirectories: true)

    try writePlist(
      [
        "BundleVersion": 2,
        "LastSavedFrom": "Logic Pro 12.0",
        "VariantNames": ["0": "Main Mix"],
      ],
      to: resources.appending(path: "ProjectInformation.plist")
    )
    let metadata: [String: Any] = [
      "AudioFiles": [
        "Audio Files/Kick.wav", "Audio Files/Package.wav", "Audio Files/Missing.wav",
      ],
      "BeatsPerMinute": 95.0,
      "NumberOfTracks": 9,
      "SampleRate": 44_100.0,
      "SongKey": "C",
      "SongGenderKey": "major",
      "SongSignatureNumerator": 4,
      "SongSignatureDenominator": 4,
      "UnusedAudioFiles": ["Audio Files/Unused.wav"],
    ]
    try writePlist(metadata, to: alternative.appending(path: "MetaData.plist"))
    try writePlist(metadata, to: backup.appending(path: "MetaData.plist"))
    try Data([0x23, 0x47]).write(to: alternative.appending(path: "ProjectData"))
    try Data([0x23, 0x47]).write(to: backup.appending(path: "ProjectData"))
    try Data([0, 1, 2]).write(to: audioFolder.appending(path: "Kick.wav"))
    try Data([3, 4, 5]).write(to: packagedAudioFolder.appending(path: "Package.wav"))
    try Data([3]).write(to: alternative.appending(path: "WindowImage.jpg"))

    let adapter = LogicProSessionAdapter()
    let result = try adapter.discover(in: library)

    #expect(adapter.capabilities.discoversSessions)
    #expect(adapter.capabilities.readsStaticMetadata)
    #expect(adapter.capabilities.resolvesAudioReferences)
    #expect(!adapter.capabilities.readsDeviceChains)
    #expect(!adapter.capabilities.requestsAuthoritativeRender)
    #expect(result.issues.isEmpty)
    #expect(result.sessions.count == 1)

    let session = try #require(result.sessions.first)
    #expect(session.daw == .logicPro)
    #expect(session.displayName == "Song")
    #expect(session.creatorVersion == "Logic Pro 12.0")
    #expect(session.previewImageURL?.lastPathComponent == "WindowImage.jpg")
    #expect(session.previewImageURL.map { FileManager.default.fileExists(atPath: $0.path) } == true)
    #expect(session.revisions.count == 2)

    let head = try #require(session.revisions.first(where: { $0.kind == .alternativeHead }))
    #expect(head.displayName == "Main Mix")
    #expect(head.inspection.provenance == .nativeStatic)
    #expect(head.inspection.metadata.tempo == 95)
    #expect(head.inspection.metadata.trackCount == 9)
    #expect(head.inspection.metadata.sampleRate == 44_100)
    #expect(head.inspection.metadata.key == "C major")
    #expect(
      head.inspection.metadata.timeSignature == SetTimeSignature(numerator: 4, denominator: 4))
    #expect(head.inspection.audioReferences.count == 3)
    #expect(head.inspection.audioReferences.count(where: { $0.availability == .available }) == 2)
    #expect(head.inspection.audioReferences.count(where: { $0.availability == .missing }) == 1)
    #expect(head.inspection.unusedAudioReferences.map(\.relativePath) == ["Audio Files/Unused.wav"])

    let savedBackup = try #require(session.revisions.first(where: { $0.kind == .backup }))
    #expect(savedBackup.displayName == "Main Mix · Backup 00")
    #expect(savedBackup.inspection.provenance == .nativeStatic)
  }

  @Test("Isolates malformed packages instead of aborting root discovery")
  func isolatesMalformedPackage() throws {
    let library = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: library) }

    let broken = library.appending(path: "Broken.logicx", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: broken, withIntermediateDirectories: true)

    let result = try LogicProSessionAdapter().discover(in: library)

    #expect(result.sessions.isEmpty)
    #expect(result.issues.count == 1)
    #expect(result.issues[0].fileURL == broken)
  }

  private func writePlist(_ value: Any, to url: URL) throws {
    let data = try PropertyListSerialization.data(
      fromPropertyList: value,
      format: .binary,
      options: 0
    )
    try data.write(to: url)
  }
}
