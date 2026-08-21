import AVFoundation
import Foundation
import Testing

@testable import StudioCore

@Suite("Restricted dry preview renderer")
struct DryPreviewRendererTests {
  @Test("Renders raw timeline audio to a new approximate WAV")
  func rendersApproximateTimeline() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let sourceURL = root.appending(path: "tone.wav")
    try writeTone(to: sourceURL)
    let destinationURL = root.appending(path: "preview.wav")
    let coverage = PreviewCoverageReport(
      coverage: .partial,
      arrangementAudioClipCount: 1,
      availableAudioClipCount: 1,
      midiTrackCount: 0,
      warpedClipCount: 0,
      missingDependencyCount: 0,
      nativeDeviceCount: 1,
      thirdPartyDeviceCount: 0,
      maxForLiveDeviceCount: 0,
      blockers: ["Live devices and Racks are omitted."]
    )
    let plan = DryPreviewPlan(
      tempo: 120,
      segments: [
        DryPreviewSegment(
          id: "segment",
          trackID: "track",
          clipID: "clip",
          sourceURL: sourceURL,
          startBeat: 1,
          endBeat: 1.2
        )
      ],
      coverage: coverage
    )

    let result = try DryPreviewRenderer().render(plan: plan, destinationURL: destinationURL)

    #expect(result.fidelity == .approximate)
    #expect(result.renderedSegmentCount == 1)
    #expect(result.duration > 0.5)
    let rendered = try AVAudioFile(forReading: destinationURL)
    #expect(rendered.length > 20_000)
    #expect(try hasAudibleSamples(file: rendered))
    #expect(throws: DryPreviewRendererError.self) {
      try DryPreviewRenderer().render(plan: plan, destinationURL: destinationURL)
    }
  }

  private func writeTone(to url: URL) throws {
    let format = try #require(
      AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)
    )
    let frameCount: AVAudioFrameCount = 4_410
    let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount))
    buffer.frameLength = frameCount
    let channel = try #require(buffer.floatChannelData?[0])
    for frame in 0..<Int(frameCount) {
      channel[frame] = sin(Float(frame) * 2 * .pi * 440 / 44_100) * 0.25
    }
    var fileSettings = format.settings
    fileSettings[AVLinearPCMIsNonInterleaved] = false
    let file = try AVAudioFile(forWriting: url, settings: fileSettings)
    try file.write(from: buffer)
  }

  private func hasAudibleSamples(file: AVAudioFile) throws -> Bool {
    let frameCount = AVAudioFrameCount(file.length)
    let buffer = try #require(
      AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frameCount)
    )
    try file.read(into: buffer)
    guard let channels = buffer.floatChannelData else { return false }
    for channelIndex in 0..<Int(buffer.format.channelCount) {
      for frame in 0..<Int(buffer.frameLength) where abs(channels[channelIndex][frame]) > 0.001 {
        return true
      }
    }
    return false
  }
}
