import AVFoundation
import Foundation
import Testing

@testable import StudioCore

@Suite("Audio waveform reader")
struct AudioWaveformReaderTests {
  @Test("Reads a frame-aligned region and preserves full source duration")
  func readsRegion() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appending(path: "range.wav")
    try writeRangeAudio(to: url, activeRange: 1..<2)
    let source = try AVAudioFile(forReading: url)
    let sampleRate = source.processingFormat.sampleRate
    let activeStart = 48_000.0 / sampleRate
    let activeEnd = 96_000.0 / sampleRate

    let result = try AudioWaveformReader.read(
      url: url, sampleCount: 128, startTime: activeStart + 0.5 / sampleRate,
      endTime: activeEnd - 0.5 / sampleRate)

    #expect(result.samples.count == 128)
    #expect(abs(result.duration - Double(source.length) / sampleRate) < 0.000001)
    #expect(result.startTime == activeStart)
    #expect(result.endTime == activeEnd)
    #expect(result.samples.max() ?? 0 > 0.8)

    let short = try AudioWaveformReader.read(
      url: url, sampleCount: 96, startTime: 1.00001, endTime: 1.00002)
    #expect(short.samples.count == 96)
    #expect(short.startTime <= short.endTime)
  }

  @Test("Regional read distinguishes quiet and loud windows")
  func distinguishesWindows() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appending(path: "windows.wav")
    try writeQuietAndLoudAudio(to: url)

    let source = try AVAudioFile(forReading: url)
    let duration = Double(source.length) / source.processingFormat.sampleRate
    let quiet = try AudioWaveformReader.read(
      url: url, sampleCount: 96, startTime: 0, endTime: duration * 0.2)
    let loud = try AudioWaveformReader.read(
      url: url, sampleCount: 96, startTime: duration * 0.5, endTime: duration * 0.8)

    #expect((quiet.samples.max() ?? 0) < 0.01)
    #expect((loud.samples.max() ?? 0) > 0.9)
  }

  @Test("Clamps sample count to the supported range")
  func clampsSampleCount() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appending(path: "clamp.wav")
    try TestSupport.writeGeneratedAudio(to: url, sampleRate: 1_000, signalDuration: 1)

    #expect((try AudioWaveformReader.read(url: url, sampleCount: 1)).samples.count == 96)
    #expect((try AudioWaveformReader.read(url: url, sampleCount: 10_000)).samples.count == 2_048)
  }

  @Test("Rejects empty, invalid, and out-of-bounds regions")
  func rejectsInvalidInputs() throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let emptyURL = directory.appending(path: "empty.wav")
    let sourceURL = directory.appending(path: "source.wav")
    try makeEmptyAudio(at: emptyURL)
    try TestSupport.writeGeneratedAudio(to: sourceURL, sampleRate: 1_000, signalDuration: 1)

    #expect(throws: AudioWaveformReaderError.emptyAudio) {
      try AudioWaveformReader.read(url: emptyURL, sampleCount: 96)
    }
    #expect(throws: AudioWaveformReaderError.self) {
      try AudioWaveformReader.read(url: sourceURL, sampleCount: 96, startTime: 0.8, endTime: 0.2)
    }
    #expect(throws: AudioWaveformReaderError.self) {
      try AudioWaveformReader.read(url: sourceURL, sampleCount: 96, startTime: -0.1, endTime: 0.2)
    }
    #expect(throws: AudioWaveformReaderError.self) {
      try AudioWaveformReader.read(url: sourceURL, sampleCount: 96, startTime: 0.2, endTime: 1.1)
    }
    #expect(throws: AudioWaveformReaderError.self) {
      try AudioWaveformReader.read(url: sourceURL, sampleCount: 96, startTime: .nan, endTime: 0.2)
    }
  }

  @Test("Honors cancellation before reading")
  func honorsCancellation() async throws {
    let directory = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let url = directory.appending(path: "cancel.wav")
    try TestSupport.writeGeneratedAudio(to: url, sampleRate: 48_000, signalDuration: 1)

    let task = Task {
      try AudioWaveformReader.read(url: url, sampleCount: 512)
    }
    task.cancel()
    await #expect(throws: CancellationError.self) {
      try await task.value
    }
  }

  private func writeQuietAndLoudAudio(to url: URL) throws {
    let format = AVAudioFormat(standardFormatWithSampleRate: 1_000, channels: 1)!
    let frameCount: AVAudioFrameCount = 4_000
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
    buffer.frameLength = frameCount
    let samples = buffer.floatChannelData![0]
    for frame in 0..<Int(frameCount) {
      let time = Double(frame) / format.sampleRate
      samples[frame] =
        time >= 2 && time < 3
        ? Float(sin(time * 2 * .pi * 11)) * 0.8
        : 0
    }
    var settings = format.settings
    settings[AVLinearPCMIsNonInterleaved] = false
    let file = try AVAudioFile(forWriting: url, settings: settings)
    try file.write(from: buffer)
  }

  private func writeRangeAudio(to url: URL, activeRange: Range<Double>) throws {
    let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1)!
    let frameCount: AVAudioFrameCount = 192_000
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)!
    buffer.frameLength = frameCount
    let samples = buffer.floatChannelData![0]
    for frame in 0..<Int(frameCount) {
      let time = Double(frame) / format.sampleRate
      samples[frame] =
        activeRange.contains(time)
        ? Float(sin(time * 2 * .pi * 220)) * 0.8
        : 0
    }
    var settings = format.settings
    settings[AVLinearPCMIsNonInterleaved] = false
    let file = try AVAudioFile(forWriting: url, settings: settings)
    try file.write(from: buffer)
  }

  private func makeEmptyAudio(at url: URL) throws {
    let format = AVAudioFormat(standardFormatWithSampleRate: 1_000, channels: 1)!
    _ = try AVAudioFile(forWriting: url, settings: format.settings)
  }
}
