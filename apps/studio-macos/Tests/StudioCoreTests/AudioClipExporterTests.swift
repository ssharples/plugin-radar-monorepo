import AVFoundation
import Foundation
import Testing

@testable import StudioCore

@Suite("Audio clip exporter")
struct AudioClipExporterTests {
  @Test("Exports frame-aligned stereo PCM without changing the source")
  func exportsClip() throws {
    let root = try TestSupport.temporaryDirectory()
    let source = root.appending(path: "source.wav")
    let destination = root.appending(path: "Exports/clip.wav")
    try TestSupport.writeGeneratedAudio(
      to: source, sampleRate: 48_000, signalDuration: 1.0, gain: 2.0, channels: 2, bitDepth: 32)
    let sourceBefore = try Data(contentsOf: source)

    let result = try AudioClipExporter().export(
      AudioClipExportPlan(
        sourceURL: source, startSeconds: 0.125, endSeconds: 0.375, destinationURL: destination))

    #expect(result.frameCount == 12_000)
    #expect(result.sampleRate == 48_000)
    #expect(result.channelCount == 2)
    #expect(result.duration == 0.25)
    #expect(FileManager.default.fileExists(atPath: destination.path))
    #expect(try Data(contentsOf: source) == sourceBefore)

    let output = try AVAudioFile(forReading: destination)
    #expect(output.length == 12_000)
    #expect(output.processingFormat.channelCount == 2)
    #expect(output.fileFormat.streamDescription.pointee.mBitsPerChannel == 32)
    #expect(output.fileFormat.streamDescription.pointee.mFormatFlags & kAudioFormatFlagIsFloat != 0)
    let buffer = try #require(
      AVAudioPCMBuffer(
        pcmFormat: output.processingFormat, frameCapacity: AVAudioFrameCount(output.length)))
    try output.read(into: buffer)
    let peak = (0..<Int(output.processingFormat.channelCount)).reduce(Float.zero) {
      current, channel in
      max(
        current,
        (0..<Int(buffer.frameLength)).reduce(Float.zero) {
          max($0, abs(buffer.floatChannelData![channel][$1]))
        })
    }
    #expect(peak > 1)
  }

  @Test("Allows an end boundary within one frame but rejects larger overruns")
  func validatesEndBoundary() throws {
    let root = try TestSupport.temporaryDirectory()
    let source = root.appending(path: "source.wav")
    try TestSupport.writeGeneratedAudio(
      to: source, sampleRate: 48_000, signalDuration: 1.0, channels: 1, bitDepth: 32)

    let valid = root.appending(path: "valid.wav")
    let result = try AudioClipExporter().export(
      AudioClipExportPlan(
        sourceURL: source, startSeconds: 0.1, endSeconds: 1.0 + (0.5 / 48_000),
        destinationURL: valid))
    #expect(result.frameCount == 43_200)

    let invalid = root.appending(path: "invalid.wav")
    #expect(throws: AudioClipExporterError.self) {
      try AudioClipExporter().export(
        AudioClipExportPlan(
          sourceURL: source, startSeconds: 0.1, endSeconds: 1.0 + (2.0 / 48_000),
          destinationURL: invalid))
    }
    #expect(!FileManager.default.fileExists(atPath: invalid.path))
  }

  @Test("Rejects invalid ranges and existing destinations without touching files")
  func rejectsUnsafePlans() throws {
    let root = try TestSupport.temporaryDirectory()
    let source = root.appending(path: "source.wav")
    try TestSupport.writeGeneratedAudio(to: source, signalDuration: 1.0)
    let exporter = AudioClipExporter()

    for (start, end) in [(-1.0, 0.5), (0.5, 0.5), (0.8, 0.2), (.nan, 0.5), (0.1, .infinity)] {
      #expect(throws: AudioClipExporterError.self) {
        try exporter.export(
          AudioClipExportPlan(
            sourceURL: source, startSeconds: start, endSeconds: end,
            destinationURL: root.appending(path: UUID().uuidString)))
      }
    }

    let existing = root.appending(path: "existing.wav")
    let original = Data([1, 2, 3])
    try original.write(to: existing)
    #expect(throws: AudioClipExporterError.self) {
      try exporter.export(
        AudioClipExportPlan(
          sourceURL: source, startSeconds: 0, endSeconds: 0.25, destinationURL: existing))
    }
    #expect(try Data(contentsOf: existing) == original)
  }

  @Test("Rejects huge finite ranges before converting seconds to frame positions")
  func rejectsHugeFiniteRange() throws {
    let root = try TestSupport.temporaryDirectory()
    let source = root.appending(path: "source.wav")
    let destination = root.appending(path: "huge.wav")
    try TestSupport.writeGeneratedAudio(to: source, signalDuration: 1.0)

    #expect(throws: AudioClipExporterError.self) {
      try AudioClipExporter().export(
        AudioClipExportPlan(
          sourceURL: source,
          startSeconds: Double.greatestFiniteMagnitude / 2,
          endSeconds: Double.greatestFiniteMagnitude,
          destinationURL: destination))
    }
    #expect(!FileManager.default.fileExists(atPath: destination.path))
  }

  @Test("Honours cancellation before creating any output")
  func honoursCancellation() async throws {
    let root = try TestSupport.temporaryDirectory()
    let source = root.appending(path: "source.wav")
    let destination = root.appending(path: "cancelled.wav")
    try TestSupport.writeGeneratedAudio(to: source, signalDuration: 1.0)
    let task = Task {
      try AudioClipExporter().export(
        AudioClipExportPlan(
          sourceURL: source, startSeconds: 0, endSeconds: 0.5, destinationURL: destination))
    }
    task.cancel()
    do {
      _ = try await task.value
      Issue.record("Cancelled export unexpectedly succeeded")
    } catch is CancellationError {
      // expected
    }
    #expect(!FileManager.default.fileExists(atPath: destination.path))
  }
}
