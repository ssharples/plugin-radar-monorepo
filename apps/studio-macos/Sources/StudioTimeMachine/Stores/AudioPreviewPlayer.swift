import AVFoundation
import Foundation
import Observation
import StudioCore

enum AudioWaveformState: Equatable {
  case idle
  case loading
  case ready([Float])
  case unavailable
  case failed(String)
}

@MainActor
@Observable
final class AudioPreviewPlayer {
  var currentAsset: PreviewAsset?
  var currentFidelity: PreviewFidelity = .existingArtifact
  var currentLabel: String?
  var isPlaying = false
  var isLoadingPlayback = false
  var currentTime: TimeInterval = 0
  var duration: TimeInterval = 0
  var waveformState: AudioWaveformState = .idle
  var errorMessage: String?

  @ObservationIgnored private var player: AVPlayer?
  @ObservationIgnored private var timeObserver: Any?
  @ObservationIgnored private var endObserver: Any?
  @ObservationIgnored private var playbackTask: Task<Void, Never>?
  @ObservationIgnored private var waveformTask: Task<Void, Never>?
  @ObservationIgnored private var requestedWaveformSampleCount: Int?
  @ObservationIgnored private var pendingSeekTime: TimeInterval?
  private var assetToken = UUID()
  private var waveformRequestToken = UUID()

  var progress: Double {
    guard duration > 0 else { return 0 }
    return min(max(currentTime / duration, 0), 1)
  }

  var currentAmplitude: Double {
    guard isPlaying, case .ready(let samples) = waveformState, !samples.isEmpty else {
      return 0
    }
    let center = min(
      max(Int(progress * Double(samples.count - 1)), 0),
      samples.count - 1
    )
    let lower = max(0, center - 1)
    let upper = min(samples.count - 1, center + 1)
    let localPeak = samples[lower...upper].max() ?? 0
    return min(max(Double(localPeak), 0), 1)
  }

  func prepare(
    _ asset: PreviewAsset,
    fidelity: PreviewFidelity = .existingArtifact,
    label: String? = nil
  ) {
    let selectedFileChanged =
      currentAsset?.id != asset.id
      || currentAsset?.fileURL.standardizedFileURL != asset.fileURL.standardizedFileURL

    if selectedFileChanged {
      resetPlayback()
      waveformTask?.cancel()
      waveformTask = nil
      requestedWaveformSampleCount = nil
      currentTime = 0
      duration = 0
      pendingSeekTime = nil
      waveformState = asset.isAvailableOnDisk ? .idle : .unavailable
      assetToken = UUID()
      waveformRequestToken = UUID()
    }

    currentAsset = asset
    currentFidelity = fidelity
    currentLabel = label
  }

  func requestWaveform(for asset: PreviewAsset, sampleCount: Int) {
    guard isCurrent(asset) else { return }
    guard asset.isAvailableOnDisk else {
      waveformState = .unavailable
      return
    }

    let boundedCount = Self.boundedWaveformSampleCount(sampleCount)
    if requestedWaveformSampleCount == boundedCount {
      switch waveformState {
      case .loading, .ready:
        return
      case .idle, .unavailable, .failed:
        break
      }
    }

    waveformTask?.cancel()
    requestedWaveformSampleCount = boundedCount
    waveformState = .loading
    let token = assetToken
    let requestToken = UUID()
    waveformRequestToken = requestToken

    waveformTask = Task { [weak self] in
      do {
        let waveform = try await AudioWaveformRepository.shared.waveform(
          for: asset.fileURL,
          sampleCount: boundedCount
        )
        try Task.checkCancellation()
        guard let self, self.assetToken == token, self.isCurrent(asset) else { return }
        self.duration = waveform.duration
        self.waveformState = .ready(waveform.samples)
      } catch is CancellationError {
        guard let self, self.assetToken == token, self.waveformRequestToken == requestToken else {
          return
        }
        self.requestedWaveformSampleCount = nil
        self.waveformState = asset.isAvailableOnDisk ? .idle : .unavailable
        return
      } catch {
        guard let self, self.assetToken == token, self.isCurrent(asset) else { return }
        self.waveformState = .failed(error.localizedDescription)
      }
    }
  }

  func toggle(_ asset: PreviewAsset) {
    if !isCurrent(asset) {
      prepare(asset)
    }

    guard asset.isAvailableOnDisk else {
      errorMessage = "The audio file is not available at its indexed location."
      return
    }

    if let player {
      if isPlaying {
        player.pause()
        isPlaying = false
      } else {
        player.play()
        isPlaying = true
      }
      errorMessage = nil
      return
    }

    guard !isLoadingPlayback else { return }
    loadForPlaybackAndPlay(asset)
  }

  func seek(toFraction fraction: Double) {
    guard duration > 0 else { return }
    seek(to: min(max(fraction, 0), 1) * duration)
  }

  func skip(by interval: TimeInterval) {
    guard duration > 0 else { return }
    seek(to: min(max(currentTime + interval, 0), duration))
  }

  func stop() {
    resetPlayback()
    waveformTask?.cancel()
    waveformTask = nil
    requestedWaveformSampleCount = nil
    currentAsset = nil
    currentFidelity = .existingArtifact
    currentLabel = nil
    currentTime = 0
    duration = 0
    pendingSeekTime = nil
    waveformState = .idle
    errorMessage = nil
    assetToken = UUID()
    waveformRequestToken = UUID()
  }

  private func loadForPlaybackAndPlay(_ asset: PreviewAsset) {
    playbackTask?.cancel()
    isLoadingPlayback = true
    errorMessage = nil
    let token = assetToken

    playbackTask = Task { [weak self] in
      do {
        let mediaAsset = AVURLAsset(url: asset.fileURL)
        async let loadedDuration = mediaAsset.load(.duration)
        async let loadedIsPlayable = mediaAsset.load(.isPlayable)
        let (mediaDuration, isPlayable) = try await (loadedDuration, loadedIsPlayable)
        try Task.checkCancellation()

        guard isPlayable else { throw AudioPreviewError.notPlayable }
        guard let self, self.assetToken == token, self.isCurrent(asset) else { return }

        let item = AVPlayerItem(asset: mediaAsset)
        let player = AVPlayer(playerItem: item)
        self.player = player
        self.duration = max(
          self.duration,
          mediaDuration.seconds.isFinite ? mediaDuration.seconds : 0
        )
        self.installTimeObservers(on: player, token: token)
        if let pendingSeekTime = self.pendingSeekTime {
          await player.seek(
            to: CMTime(seconds: pendingSeekTime, preferredTimescale: 60_000),
            toleranceBefore: .zero,
            toleranceAfter: .zero
          )
        }
        player.play()
        self.isPlaying = true
        self.isLoadingPlayback = false
      } catch is CancellationError {
        return
      } catch {
        guard let self, self.assetToken == token, self.isCurrent(asset) else { return }
        self.isPlaying = false
        self.isLoadingPlayback = false
        self.errorMessage = "This audio format could not be played: \(error.localizedDescription)"
      }
    }
  }

  private func seek(to requestedTime: TimeInterval) {
    let targetTime = min(max(requestedTime, 0), duration)
    currentTime = targetTime
    pendingSeekTime = targetTime

    guard let player else { return }
    let shouldContinuePlaying = isPlaying
    player.seek(
      to: CMTime(seconds: targetTime, preferredTimescale: 60_000),
      toleranceBefore: .zero,
      toleranceAfter: .zero
    )
    if shouldContinuePlaying {
      player.play()
    }
  }

  private func installTimeObservers(on player: AVPlayer, token: UUID) {
    removeTimeObservers()
    timeObserver = player.addPeriodicTimeObserver(
      forInterval: CMTime(seconds: 0.05, preferredTimescale: 600),
      queue: .main
    ) { [weak self, weak player] time in
      Task { @MainActor in
        guard let self, let player, self.assetToken == token else { return }
        let seconds = time.seconds
        if seconds.isFinite {
          self.currentTime = min(max(seconds, 0), self.duration)
          self.pendingSeekTime = self.currentTime
        }

        if player.currentItem?.status == .failed {
          self.isPlaying = false
          self.errorMessage =
            "Playback stopped: \(player.currentItem?.error?.localizedDescription ?? "unknown audio error")"
        } else if self.duration > 0,
          self.currentTime >= self.duration - 0.05,
          player.timeControlStatus != .playing
        {
          self.currentTime = self.duration
          self.isPlaying = false
        }
      }
    }

    guard duration > 0 else { return }
    let endTime = CMTime(seconds: duration, preferredTimescale: 60_000)
    endObserver = player.addBoundaryTimeObserver(
      forTimes: [NSValue(time: endTime)],
      queue: .main
    ) { [weak self] in
      Task { @MainActor in
        guard let self, self.assetToken == token else { return }
        self.currentTime = self.duration
        self.pendingSeekTime = self.duration
        self.isPlaying = false
      }
    }
  }

  private func resetPlayback() {
    playbackTask?.cancel()
    playbackTask = nil
    player?.pause()
    removeTimeObservers()
    player = nil
    isPlaying = false
    isLoadingPlayback = false
    errorMessage = nil
  }

  private func removeTimeObservers() {
    if let timeObserver {
      player?.removeTimeObserver(timeObserver)
      self.timeObserver = nil
    }
    if let endObserver {
      player?.removeTimeObserver(endObserver)
      self.endObserver = nil
    }
  }

  private func isCurrent(_ asset: PreviewAsset) -> Bool {
    currentAsset?.id == asset.id
      && currentAsset?.fileURL.standardizedFileURL == asset.fileURL.standardizedFileURL
  }

  private static func boundedWaveformSampleCount(_ requestedCount: Int) -> Int {
    let clamped = min(max(requestedCount, 96), 2_048)
    return Int(ceil(Double(clamped) / 32)) * 32
  }
}

private enum AudioPreviewError: LocalizedError {
  case notPlayable
  case emptyAudio
  case unsupportedPCM

  var errorDescription: String? {
    switch self {
    case .notPlayable:
      "The selected file does not contain playable audio."
    case .emptyAudio:
      "The selected file contains no audio frames."
    case .unsupportedPCM:
      "The selected file could not be decoded to a waveform."
    }
  }
}

private struct AudioWaveform: Sendable {
  let samples: [Float]
  let duration: TimeInterval
}

private struct AudioWaveformFileIdentity: Hashable, Sendable {
  let path: String
  let resourceIdentifier: String
  let byteCount: Int
  let modifiedAt: TimeInterval
}

private struct AudioWaveformCacheKey: Hashable, Sendable {
  let file: AudioWaveformFileIdentity
  let sampleCount: Int
}

private actor AudioWaveformRepository {
  static let shared = AudioWaveformRepository()

  private var cache: [AudioWaveformCacheKey: AudioWaveform] = [:]
  private var insertionOrder: [AudioWaveformCacheKey] = []
  private let maximumCachedSampleCount = 32_768
  private var cachedSampleCount = 0

  func waveform(for url: URL, sampleCount: Int) async throws -> AudioWaveform {
    let identityTask = Task.detached(priority: .utility) {
      try AudioWaveformDecoder.fileIdentity(for: url)
    }
    let identity = try await withTaskCancellationHandler {
      try await identityTask.value
    } onCancel: {
      identityTask.cancel()
    }
    let key = AudioWaveformCacheKey(file: identity, sampleCount: sampleCount)
    if let cached = cache[key] { return cached }

    let decodeTask = Task.detached(priority: .utility) {
      try AudioWaveformDecoder.decode(url: url, sampleCount: sampleCount)
    }
    let waveform = try await withTaskCancellationHandler {
      try await decodeTask.value
    } onCancel: {
      decodeTask.cancel()
    }
    try Task.checkCancellation()
    insert(waveform, for: key)
    return waveform
  }

  private func insert(_ waveform: AudioWaveform, for key: AudioWaveformCacheKey) {
    if let replaced = cache.updateValue(waveform, forKey: key) {
      cachedSampleCount -= replaced.samples.count
      insertionOrder.removeAll { $0 == key }
    }
    insertionOrder.append(key)
    cachedSampleCount += waveform.samples.count

    while cachedSampleCount > maximumCachedSampleCount, let oldest = insertionOrder.first {
      insertionOrder.removeFirst()
      if let removed = cache.removeValue(forKey: oldest) {
        cachedSampleCount -= removed.samples.count
      }
    }
  }
}

private enum AudioWaveformDecoder {
  static func fileIdentity(for url: URL) throws -> AudioWaveformFileIdentity {
    let values = try url.standardizedFileURL.resourceValues(forKeys: [
      .fileResourceIdentifierKey, .fileSizeKey, .contentModificationDateKey,
    ])
    return AudioWaveformFileIdentity(
      path: url.standardizedFileURL.path,
      resourceIdentifier: String(describing: values.fileResourceIdentifier),
      byteCount: values.fileSize ?? 0,
      modifiedAt: values.contentModificationDate?.timeIntervalSince1970 ?? 0
    )
  }

  static func decode(url: URL, sampleCount: Int) throws -> AudioWaveform {
    let file = try AVAudioFile(forReading: url)
    let frameCount = file.length
    guard frameCount > 0 else { throw AudioPreviewError.emptyAudio }

    let format = file.processingFormat
    guard format.channelCount > 0, format.sampleRate > 0 else {
      throw AudioPreviewError.unsupportedPCM
    }

    let readCapacity = AVAudioFrameCount(min(Int64(65_536), frameCount))
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: readCapacity) else {
      throw AudioPreviewError.unsupportedPCM
    }

    var bucketEnergy = [Double](repeating: 0, count: sampleCount)
    var bucketFrameCounts = [Int](repeating: 0, count: sampleCount)
    var frameOffset: AVAudioFramePosition = 0

    while frameOffset < frameCount {
      try Task.checkCancellation()
      let framesToRead = AVAudioFrameCount(min(Int64(readCapacity), frameCount - frameOffset))
      try file.read(into: buffer, frameCount: framesToRead)
      let framesRead = Int(buffer.frameLength)
      guard framesRead > 0 else { break }

      if let channels = buffer.floatChannelData {
        for localFrame in 0..<framesRead {
          let absoluteFrame = frameOffset + AVAudioFramePosition(localFrame)
          let bucket = min(
            Int(Double(absoluteFrame) / Double(frameCount) * Double(sampleCount)),
            sampleCount - 1
          )
          var frameEnergy = 0.0
          for channel in 0..<Int(format.channelCount) {
            let candidate = Double(channels[channel][localFrame])
            frameEnergy += candidate * candidate
          }
          bucketEnergy[bucket] += frameEnergy / Double(format.channelCount)
          bucketFrameCounts[bucket] += 1
        }
      } else {
        throw AudioPreviewError.unsupportedPCM
      }

      frameOffset += AVAudioFramePosition(framesRead)
    }

    var samples = zip(bucketEnergy, bucketFrameCounts).map { energy, count in
      count > 0 ? Float(sqrt(energy / Double(count))) : 0
    }
    let maximum = samples.max() ?? 0
    if maximum > 0 {
      samples = samples.map { sample in
        sqrt(min(sample / maximum, 1))
      }
    }

    if samples.count > 2 {
      var smoothed = samples
      for index in 1..<(samples.count - 1) {
        smoothed[index] = (samples[index - 1] + samples[index] * 2 + samples[index + 1]) / 4
      }
      samples = smoothed
    }

    return AudioWaveform(
      samples: samples,
      duration: Double(frameCount) / format.sampleRate
    )
  }
}
