import AVFoundation
import Foundation
import Testing

@testable import StudioCore

struct SampleAudioAnalyzerTests {
  @Test func lowSineProducesLowFrequencyMeshAndPersists() async throws {
    let directory = try TestSupport.temporaryDirectory()
    let fileURL = directory.appending(path: "Low Tone.wav")
    try writeSine(frequency: 80, duration: 1.2, to: fileURL)
    let database = try SampleLibraryDatabase(
      storageURL: directory.appending(path: "samples.sqlite"))
    let location = try database.registerLocation(directory, securityScopedBookmark: nil)
    _ = try SampleLibraryIndexer().scan(location: location, projectRoots: [], database: database)
    let rows = try database.querySamples().rows
    let row = try #require(rows.first)

    let analysis = try await SampleAudioAnalyzer().analyze(row)

    #expect(analysis.spectralFrames.count == SampleAudioAnalyzer.spectralFrameCount)
    #expect(
      analysis.spectralFrames.allSatisfy { $0.count == SampleAudioAnalyzer.spectralBandCount })
    #expect(analysis.dominantRegion == .low)
    #expect(analysis.lowEnergy > analysis.highEnergy)
    #expect(analysis.dominantFrequencyHz < 250)
    #expect(analysis.matches(row))

    try database.saveAudioAnalysis(analysis)
    let stored = try database.audioAnalysis(for: row.id)
    let cached = try #require(stored)
    #expect(cached == analysis)
  }

  private func writeSine(frequency: Double, duration: Double, to url: URL) throws {
    let sampleRate = 44_100.0
    let format = try #require(
      AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1))
    let frameCount = AVAudioFrameCount(sampleRate * duration)
    let buffer = try #require(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount))
    buffer.frameLength = frameCount
    let samples = try #require(buffer.floatChannelData?[0])
    for frame in 0..<Int(frameCount) {
      samples[frame] = Float(sin(2 * Double.pi * frequency * Double(frame) / sampleRate) * 0.7)
    }
    let file = try AVAudioFile(forWriting: url, settings: format.settings)
    try file.write(from: buffer)
  }
}
