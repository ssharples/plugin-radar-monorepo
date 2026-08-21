import AVFoundation
import Foundation
import Testing
@testable import StudioCore

@Suite("Audio content identity")
struct AudioContentIdentityTests {
  @Test("Identical bytes produce verified byte identity")
  func byteIdentity() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let source = directory.appending(path: "source.bin")
    let copy = directory.appending(path: "renamed.bin")
    try Data("studio-audio".utf8).write(to: source)
    try FileManager.default.copyItem(at: source, to: copy)

    let service = AudioContentIdentityService()
    let sourceIdentity = try service.identify(source, decodeAudio: false)
    let copyIdentity = try service.identify(copy, decodeAudio: false)

    #expect(sourceIdentity.byteSHA256 == copyIdentity.byteSHA256)
    #expect(sourceIdentity.contentAssetID == copyIdentity.contentAssetID)
    #expect(sourceIdentity.canonicalPCM == nil)
  }

  @Test("Lossless containers with the same samples share canonical PCM identity")
  func canonicalPCMIdentity() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let wav = directory.appending(path: "take.wav")
    let aiff = directory.appending(path: "take.aiff")
    try writeSignal(to: wav, phase: 0)
    try writeSignal(to: aiff, phase: 0)

    let service = AudioContentIdentityService()
    let wavIdentity = try service.identify(wav)
    let aiffIdentity = try service.identify(aiff)

    #expect(wavIdentity.byteSHA256 != aiffIdentity.byteSHA256)
    #expect(wavIdentity.canonicalPCM?.sha256 == aiffIdentity.canonicalPCM?.sha256)
    #expect(wavIdentity.contentAssetID == aiffIdentity.contentAssetID)
    #expect(wavIdentity.canonicalPCM?.sampleRate == 48_000)
    #expect(wavIdentity.canonicalPCM?.channelCount == 2)
  }

  @Test("Different decoded samples remain different Content Assets")
  func differentSignals() throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let first = directory.appending(path: "first.wav")
    let second = directory.appending(path: "second.wav")
    try writeSignal(to: first, phase: 0)
    try writeSignal(to: second, phase: .pi / 2)

    let service = AudioContentIdentityService()
    let firstIdentity = try service.identify(first)
    let secondIdentity = try service.identify(second)

    #expect(firstIdentity.canonicalPCM?.sha256 != secondIdentity.canonicalPCM?.sha256)
    #expect(firstIdentity.contentAssetID != secondIdentity.contentAssetID)
  }

  private func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
      .appending(path: "audio-identity-\(UUID().uuidString)", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  private func writeSignal(to url: URL, phase: Double) throws {
    let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2)!
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4_800)!
    buffer.frameLength = 4_800
    for channel in 0..<2 {
      let samples = buffer.floatChannelData![channel]
      for frame in 0..<Int(buffer.frameLength) {
        samples[frame] = Float(sin((Double(frame) / 48_000 * 440 * 2 * .pi) + phase)) * 0.25
      }
    }
    var settings = format.settings
    settings[AVLinearPCMIsNonInterleaved] = false
    let file = try AVAudioFile(forWriting: url, settings: settings)
    try file.write(from: buffer)
  }
}
