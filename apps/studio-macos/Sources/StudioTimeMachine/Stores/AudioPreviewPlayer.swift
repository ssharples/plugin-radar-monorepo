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

struct AudioClipSelection: Equatable {
  let start: TimeInterval
  let end: TimeInterval
  var duration: TimeInterval { end - start }
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
  private(set) var clipSelection: AudioClipSelection?
  var loopsSelection = true
  private(set) var waveformRange: ClosedRange<Double>?
  let clipClipboard = AudioClipClipboardController()

  @ObservationIgnored private var requestedWaveformRange: ClosedRange<Double>?
  @ObservationIgnored private var playbackGeneration = UUID()
  @ObservationIgnored private var isHandlingEnd = false

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

  private var waveformProgress: Double {
    guard let range = waveformRange else { return progress }
    return min(
      max((currentTime - range.lowerBound) / max(range.upperBound - range.lowerBound, 0.001), 0), 1)
  }

  var currentAmplitude: Double {
    guard isPlaying, case .ready(let samples) = waveformState, !samples.isEmpty else {
      return 0
    }
    let center = min(
      max(Int(waveformProgress * Double(samples.count - 1)), 0),
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
      endClipping()
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

    let fidelityChanged = currentFidelity != fidelity
    currentAsset = asset
    currentFidelity = fidelity
    currentLabel = label
    if fidelityChanged, let clipSelection {
      clipClipboard.configure(
        source: asset.fileURL, selection: clipSelection, approximate: fidelity == .approximate)
    }
  }

  func requestWaveform(for asset: PreviewAsset, sampleCount: Int, range: ClosedRange<Double>? = nil)
  {
    guard isCurrent(asset) else { return }
    guard asset.isAvailableOnDisk else {
      waveformState = .unavailable
      return
    }

    let boundedCount = Self.boundedWaveformSampleCount(sampleCount)
    if requestedWaveformSampleCount == boundedCount, requestedWaveformRange == range {
      switch waveformState {
      case .loading, .ready:
        return
      case .idle, .unavailable, .failed:
        break
      }
    }

    waveformTask?.cancel()
    requestedWaveformSampleCount = boundedCount
    requestedWaveformRange = range
    waveformState = .loading
    let token = assetToken
    let requestToken = UUID()
    waveformRequestToken = requestToken

    waveformTask = Task { [weak self] in
      do {
        let waveform = try await AudioWaveformRepository.shared.waveform(
          for: asset.fileURL,
          sampleCount: boundedCount, range: range
        )
        try Task.checkCancellation()
        guard let self, self.assetToken == token, self.waveformRequestToken == requestToken,
          self.isCurrent(asset)
        else { return }
        self.waveformRange = range
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
        guard let self, self.assetToken == token, self.waveformRequestToken == requestToken,
          self.isCurrent(asset)
        else { return }
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
        playbackGeneration = UUID()
        player.pause()
        isPlaying = false
      } else {
        isPlaying = true
        if let clipSelection,
          currentTime < clipSelection.start || currentTime >= clipSelection.end - 0.001
        {
          seek(to: clipSelection.start)
        } else if currentTime >= duration - 0.001 {
          seek(to: clipSelection?.start ?? 0)
        } else {
          player.play()
        }
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
    endClipping()
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
        try Task.checkCancellation()
        guard self.assetToken == token else { return }
        if let selection = self.clipSelection {
          await player.seek(
            to: CMTime(seconds: selection.start, preferredTimescale: 60_000),
            toleranceBefore: .zero, toleranceAfter: .zero)
          try Task.checkCancellation()
          guard self.assetToken == token else { return }
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

  func beginClipping() {
    guard duration > 0 else { return }
    let start = min(currentTime, max(0, duration - 2))
    setClipSelection(start: start, end: min(duration, start + 2))
  }

  func setClipSelection(start: Double, end: Double) {
    guard start.isFinite, end.isFinite, duration > 0 else { return }
    let minimum = min(0.001, duration)
    let lower = min(max(start, 0), duration - minimum)
    let upper = min(max(end, lower + minimum), duration)
    let selection = AudioClipSelection(start: lower, end: upper)
    guard selection != clipSelection else { return }
    clipSelection = selection
    if let asset = currentAsset {
      clipClipboard.configure(
        source: asset.fileURL, selection: selection, approximate: currentFidelity == .approximate)
    }
    updatePlaybackEnd()
    seek(to: selection.start)
  }

  func endClipping() {
    clipSelection = nil
    waveformRange = nil
    requestedWaveformRange = nil
    requestedWaveformSampleCount = nil
    clipClipboard.invalidate()
    updatePlaybackEnd()
  }

  func seek(to requestedTime: TimeInterval) {
    guard requestedTime.isFinite else { return }
    let targetTime = min(
      max(requestedTime, clipSelection?.start ?? 0), clipSelection?.end ?? duration)
    currentTime = targetTime
    pendingSeekTime = targetTime
    playbackGeneration = UUID()
    isHandlingEnd = false
    let generation = playbackGeneration
    let token = assetToken
    guard let player else { return }
    let shouldContinuePlaying = isPlaying
    player.seek(
      to: CMTime(seconds: targetTime, preferredTimescale: 60_000),
      toleranceBefore: .zero,
      toleranceAfter: .zero
    ) { [weak self, weak player] finished in
      Task { @MainActor in
        guard finished, let self, self.assetToken == token, self.playbackGeneration == generation
        else { return }
        if shouldContinuePlaying, self.isPlaying { player?.play() }
      }
    }
  }

  private func handlePlaybackEnd() {
    guard isPlaying, !isHandlingEnd else { return }
    // Ignore a boundary callback queued before a newer seek.
    guard (player?.currentTime().seconds ?? 0) >= (clipSelection?.end ?? duration) - 0.005 else {
      return
    }
    isHandlingEnd = true
    player?.pause()
    if let selection = clipSelection, loopsSelection {
      seek(to: selection.start)
    } else {
      currentTime = clipSelection?.end ?? duration
      pendingSeekTime = currentTime
      isPlaying = false
      isHandlingEnd = false
    }
  }

  private func updatePlaybackEnd() {
    playbackGeneration = UUID()
    isHandlingEnd = false
    guard let player else { return }
    if let endObserver {
      player.removeTimeObserver(endObserver)
      self.endObserver = nil
    }
    let end = clipSelection?.end ?? duration
    player.currentItem?.forwardPlaybackEndTime = CMTime(seconds: end, preferredTimescale: 60_000)
    guard end > 0 else { return }
    let token = assetToken
    let selection = clipSelection
    endObserver = player.addBoundaryTimeObserver(
      forTimes: [NSValue(time: CMTime(seconds: end, preferredTimescale: 60_000))], queue: .main
    ) { [weak self] in
      Task { @MainActor in
        guard let self, self.assetToken == token, self.clipSelection == selection else { return }
        self.handlePlaybackEnd()
      }
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
          self.currentTime >= (self.clipSelection?.end ?? self.duration) - 0.002,
          player.timeControlStatus != .playing
        {
          self.handlePlaybackEnd()
        }
      }
    }

    updatePlaybackEnd()
  }

  private func resetPlayback() {
    playbackGeneration = UUID()
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

private struct AudioWaveformFileIdentity: Hashable, Sendable {
  let path: String
  let resourceIdentifier: String
  let byteCount: Int
  let modifiedAt: TimeInterval
}

private struct AudioWaveformCacheKey: Hashable, Sendable {
  let file: AudioWaveformFileIdentity
  let sampleCount: Int
  let range: ClosedRange<Double>?
}

private actor AudioWaveformRepository {
  static let shared = AudioWaveformRepository()

  private var cache: [AudioWaveformCacheKey: AudioWaveformReadResult] = [:]
  private var insertionOrder: [AudioWaveformCacheKey] = []
  private let maximumCachedSampleCount = 32_768
  private var cachedSampleCount = 0

  func waveform(for url: URL, sampleCount: Int, range: ClosedRange<Double>?) async throws
    -> AudioWaveformReadResult
  {
    let identityTask = Task.detached(priority: .utility) {
      try AudioWaveformDecoder.fileIdentity(for: url)
    }
    let identity = try await withTaskCancellationHandler {
      try await identityTask.value
    } onCancel: {
      identityTask.cancel()
    }
    let key = AudioWaveformCacheKey(file: identity, sampleCount: sampleCount, range: range)
    if let cached = cache[key] { return cached }

    let decodeTask = Task.detached(priority: .utility) {
      try AudioWaveformReader.read(
        url: url, sampleCount: sampleCount, startTime: range?.lowerBound, endTime: range?.upperBound
      )
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

  private func insert(_ waveform: AudioWaveformReadResult, for key: AudioWaveformCacheKey) {
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

}
