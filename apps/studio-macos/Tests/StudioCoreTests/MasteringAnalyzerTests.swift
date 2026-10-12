import AVFoundation
import Foundation
import Testing

@testable import StudioCore

@Suite("Mastering analysis")
struct MasteringAnalyzerTests {
  @Test("Measures a known stereo sine through the public analyzer seam")
  func measuresKnownStereoSine() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let url = root.appending(path: "known-sine.wav")
    try writeStereoSine(to: url, amplitude: 0.5, duration: 4)

    let result = try MasteringAnalyzer().analyze(file: url)

    #expect(result.fileURL == url)
    #expect(abs(result.durationSeconds - 4) < 0.01)
    #expect(result.sampleRate == 48_000)
    #expect(result.channelCount == 2)
    #expect(abs(try #require(result.samplePeakDBFS) - -6.0206) < 0.03)
    #expect(abs(try #require(result.averageRMSDBFS) - -9.0309) < 0.03)
    #expect(abs(try #require(result.crestFactorDB) - 3.0103) < 0.04)
    #expect(abs(try #require(result.stereoCorrelation) - 1) < 0.001)
    #expect(abs(try #require(result.integratedLUFS) - -6.05) < 0.15)
    #expect(abs(try #require(result.loudnessRangeLU)) < 0.01)
    let truePeak = try #require(result.estimatedTruePeakDBTP)
    let samplePeak = try #require(result.samplePeakDBFS)
    #expect(truePeak >= samplePeak)
    #expect(result.analysisStandard == .ituRBS1770Inspired)
  }

  @Test("Represents digital silence without fabricated finite decibel values")
  func measuresSilence() throws {
    let root = try TestSupport.temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: root) }
    let url = root.appending(path: "silence.wav")
    try writeStereoSine(to: url, amplitude: 0, duration: 1)

    let result = try MasteringAnalyzer().analyze(file: url)

    #expect(result.integratedLUFS == nil)
    #expect(result.samplePeakDBFS == nil)
    #expect(result.estimatedTruePeakDBTP == nil)
    #expect(result.averageRMSDBFS == nil)
    #expect(result.crestFactorDB == nil)
    #expect(result.stereoCorrelation == nil)
  }

  private func writeStereoSine(to url: URL, amplitude: Float, duration: Double) throws {
    let sampleRate = 48_000.0
    let format = try #require(
      AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2)
    )
    let frameCount = AVAudioFrameCount(duration * sampleRate)
    let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount))
    buffer.frameLength = frameCount
    let channels = try #require(buffer.floatChannelData)
    for frame in 0..<Int(frameCount) {
      let sample = sin(Float(frame) * 2 * .pi * 1_000 / Float(sampleRate)) * amplitude
      channels[0][frame] = sample
      channels[1][frame] = sample
    }
    var settings = format.settings
    settings[AVLinearPCMIsNonInterleaved] = false
    let file = try AVAudioFile(forWriting: url, settings: settings)
    try file.write(from: buffer)
  }
}
