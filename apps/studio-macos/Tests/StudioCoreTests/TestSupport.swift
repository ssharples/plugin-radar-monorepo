import AVFoundation
import CZlib
import Foundation

enum TestSupport {
  enum GeneratedAudioTransform: Sendable {
    case reference
    case unrelated
    case pitchShifted(semitones: Double)
    case timeScaled(factor: Double)
    case reversed(referenceDuration: Double)
    case chopped(chunkDuration: Double)
    case silence
  }

  static func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
      .appending(path: UUID().uuidString, directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  static func writeGzip(_ value: String, to url: URL) throws {
    let handle = url.withUnsafeFileSystemRepresentation { path in
      path.flatMap { gzopen($0, "wb") }
    }
    guard let handle else {
      throw CocoaError(.fileWriteUnknown)
    }
    defer { gzclose(handle) }

    let bytes = Array(value.utf8)
    let written = bytes.withUnsafeBytes { buffer in
      gzwrite(handle, buffer.baseAddress, UInt32(buffer.count))
    }
    guard written == bytes.count else {
      throw CocoaError(.fileWriteUnknown)
    }
  }

  static func writeGeneratedAudio(
    to url: URL,
    sampleRate: Double = 44_100,
    signalDuration: Double,
    sourceOffset: Double = 0,
    leadingSilence: Double = 0,
    trailingSilence: Double = 0,
    gain: Float = 0.8,
    channels: AVAudioChannelCount = 1,
    bitDepth: Int = 32,
    activeRange: Range<Double>? = nil,
    transform: GeneratedAudioTransform = .reference
  ) throws {
    let format = AVAudioFormat(
      standardFormatWithSampleRate: sampleRate,
      channels: channels)!
    let totalDuration = leadingSilence + signalDuration + trailingSilence
    let totalFrames = AVAudioFrameCount((totalDuration * sampleRate).rounded(.up))
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: totalFrames)!
    buffer.frameLength = totalFrames

    for channel in 0..<Int(channels) {
      let samples = buffer.floatChannelData![channel]
      for frame in 0..<Int(totalFrames) {
        let outputTime = Double(frame) / sampleRate
        let localTime = outputTime - leadingSilence
        guard localTime >= 0, localTime < signalDuration,
          activeRange?.contains(localTime) ?? true
        else {
          samples[frame] = 0
          continue
        }
        samples[frame] = generatedSample(
          localTime: localTime,
          sourceOffset: sourceOffset,
          gain: gain,
          transform: transform)
      }
    }

    let fileExtension = url.pathExtension.lowercased()
    let settings: [String: Any]
    if fileExtension == "m4a" {
      settings = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channels,
        AVEncoderBitRateKey: 128_000,
      ]
    } else {
      settings = [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: sampleRate,
        AVNumberOfChannelsKey: channels,
        AVLinearPCMBitDepthKey: bitDepth,
        AVLinearPCMIsFloatKey: bitDepth == 32,
        AVLinearPCMIsBigEndianKey: ["aif", "aiff"].contains(fileExtension),
        AVLinearPCMIsNonInterleaved: false,
      ]
    }
    let file = try AVAudioFile(
      forWriting: url,
      settings: settings,
      commonFormat: .pcmFormatFloat32,
      interleaved: false)
    try file.write(from: buffer)
  }

  static func replaceWithGeneratedAudio(
    at url: URL,
    signalDuration: Double,
    transform: GeneratedAudioTransform
  ) throws {
    let replacement = url.deletingLastPathComponent()
      .appending(path: "replacement-\(UUID().uuidString).wav")
    try writeGeneratedAudio(
      to: replacement,
      signalDuration: signalDuration,
      transform: transform)
    _ = try FileManager.default.replaceItemAt(url, withItemAt: replacement)
  }

  private static func generatedSample(
    localTime: Double,
    sourceOffset: Double,
    gain: Float,
    transform: GeneratedAudioTransform
  ) -> Float {
    let sourceTime: Double
    let pitchScale: Double
    let unrelated: Bool
    switch transform {
    case .reference:
      sourceTime = sourceOffset + localTime
      pitchScale = 1
      unrelated = false
    case .unrelated:
      sourceTime = sourceOffset + localTime
      pitchScale = 1
      unrelated = true
    case .pitchShifted(let semitones):
      sourceTime = sourceOffset + localTime
      pitchScale = pow(2, semitones / 12)
      unrelated = false
    case .timeScaled(let factor):
      sourceTime = sourceOffset + localTime * factor
      pitchScale = 1
      unrelated = false
    case .reversed(let referenceDuration):
      sourceTime = sourceOffset + max(0, referenceDuration - localTime)
      pitchScale = 1
      unrelated = false
    case .chopped(let chunkDuration):
      let chunk = max(0.1, chunkDuration)
      let chunkIndex = Int(floor(localTime / chunk))
      let chunkStart = Double(chunkIndex) * chunk
      let swappedIndex = chunkIndex.isMultiple(of: 2) ? chunkIndex + 1 : chunkIndex - 1
      sourceTime = sourceOffset + Double(max(0, swappedIndex)) * chunk + (localTime - chunkStart)
      pitchScale = 1
      unrelated = false
    case .silence:
      return 0
    }

    let step = floor(sourceTime * 4)
    let baseFrequency = unrelated ? 1_470.0 : 170.0
    let changingFrequency = (baseFrequency + step * 83) * pitchScale
    let transientPhase = sourceTime.truncatingRemainder(dividingBy: 0.75)
    let transientEnvelope = transientPhase < 0.035 ? 1 - transientPhase / 0.035 : 0
    let body =
      sin(2 * .pi * changingFrequency * sourceTime) * 0.48
      + sin(2 * .pi * changingFrequency * 2.31 * sourceTime) * 0.21
    let transient = transientEnvelope * sin(2 * .pi * 2_700 * pitchScale * sourceTime) * 0.26
    return Float(body + transient) * gain
  }

  static let liveSetXML = """
    <?xml version="1.0" encoding="UTF-8"?>
    <Ableton MajorVersion="5" MinorVersion="12.0_12000" SchemaChangeCount="3" Creator="Ableton Live 12.1" Revision="abc123">
      <LiveSet>
        <Tracks>
          <AudioTrack Id="1">
            <Name><EffectiveName Value="Audio 1" /><UserName Value="Lead Vocal" /></Name>
            <Color Value="7" />
            <DeviceChain>
              <Mixer>
                <Volume><Manual Value="0.75" /></Volume>
                <Pan><Manual Value="-0.1" /></Pan>
                <Speaker><Manual Value="true" /></Speaker>
              </Mixer>
              <MainSequencer>
                <Recorder><IsArmed Value="true" /></Recorder>
                <MonitoringEnum Value="2" />
                <Sample><ArrangerAutomation><Events>
                  <AudioClip Id="101" Time="4">
                    <Name Value="Verse vocal" />
                    <CurrentStart Value="4" /><CurrentEnd Value="12" />
                    <Loop><LoopStart Value="4" /><LoopEnd Value="12" /><LoopOn Value="false" /></Loop>
                    <IsWarped Value="true" /><WarpMode Value="3" />
                    <WarpMarkers><WarpMarker /><WarpMarker /></WarpMarkers>
                    <SampleRef><FileRef><Path Value="/Audio/verse.wav" /><RelativePath Value="Samples/Recorded/verse.wav" /></FileRef></SampleRef>
                  </AudioClip>
                </Events></ArrangerAutomation></Sample>
              </MainSequencer>
              <DeviceChain><Devices>
                <PluginDevice Id="201">
                  <UserName Value="Vocal EQ" /><On><Manual Value="true" /></On>
                  <PluginDesc><Vst3PluginInfo><Name Value="Example EQ" /><Vendor Value="Example Audio" /><Uid Value="eq-1" /></Vst3PluginInfo></PluginDesc>
                  <Buffer>opaque-state</Buffer>
                </PluginDevice>
              </Devices></DeviceChain>
            </DeviceChain>
          </AudioTrack>
          <AudioTrack Id="2">
            <Name><EffectiveName Value="Audio 2" /><UserName Value="" /></Name>
            <DeviceChain><DeviceChain><Devices><AudioEffectGroupDevice Id="202" /></Devices></DeviceChain></DeviceChain>
          </AudioTrack>
          <MidiTrack Id="3">
            <Name><EffectiveName Value="MIDI 1" /><UserName Value="Keys" /></Name>
            <DeviceChain>
              <MainSequencer><ClipTimeable><ArrangerAutomation><Events>
                <MidiClip Id="102" Time="16"><Name Value="Chorus chords" /><Notes><MidiNoteEvent /></Notes></MidiClip>
              </Events></ArrangerAutomation></ClipTimeable></MainSequencer>
              <DeviceChain><Devices><MxDeviceInstrument Id="203" /></Devices></DeviceChain>
            </DeviceChain>
          </MidiTrack>
          <GroupTrack Id="4"><Name><EffectiveName Value="Group" /></Name></GroupTrack>
          <ReturnTrack Id="5"><Name><EffectiveName Value="Return A" /></Name></ReturnTrack>
        </Tracks>
        <MainTrack><DeviceChain><Mixer><Tempo><Manual Value="128" /></Tempo></Mixer></DeviceChain></MainTrack>
        <Locators><Locators><Locator Id="1"><Name Value="Chorus" /><Time Value="16" /></Locator></Locators></Locators>
        <AutomationEnvelopes><AutomationEnvelope /></AutomationEnvelopes>
      </LiveSet>
    </Ableton>
    """
}
