import AVFoundation
import Foundation

public enum MasteringAnalysisStandard: String, Codable, Sendable {
  /// Loudness follows ITU-R BS.1770 K-weighting and gating. True peak is a clearly labelled
  /// 4x interpolation estimate and is not a substitute for a certified delivery meter.
  case ituRBS1770Inspired
}

public struct MasteringAnalysis: Codable, Sendable, Equatable {
  public let fileURL: URL
  public let analyzedAt: Date
  public let sourceBytes: Int64
  public let sourceModifiedAt: Date?
  public let durationSeconds: TimeInterval
  public let sampleRate: Double
  public let channelCount: Int
  public let analysisStandard: MasteringAnalysisStandard
  public let integratedLUFS: Double?
  public let maximumMomentaryLUFS: Double?
  public let maximumShortTermLUFS: Double?
  public let loudnessRangeLU: Double?
  public let samplePeakDBFS: Double?
  public let estimatedTruePeakDBTP: Double?
  public let averageRMSDBFS: Double?
  public let maximumRMSDBFS: Double?
  public let crestFactorDB: Double?
  public let stereoCorrelation: Double?
  public let rightMinusLeftBalanceDB: Double?
  public let dcOffsetByChannel: [Double]
  public let clippedSampleCount: Int64

  public init(
    fileURL: URL,
    analyzedAt: Date,
    sourceBytes: Int64,
    sourceModifiedAt: Date?,
    durationSeconds: TimeInterval,
    sampleRate: Double,
    channelCount: Int,
    analysisStandard: MasteringAnalysisStandard,
    integratedLUFS: Double?,
    maximumMomentaryLUFS: Double?,
    maximumShortTermLUFS: Double?,
    loudnessRangeLU: Double?,
    samplePeakDBFS: Double?,
    estimatedTruePeakDBTP: Double?,
    averageRMSDBFS: Double?,
    maximumRMSDBFS: Double?,
    crestFactorDB: Double?,
    stereoCorrelation: Double?,
    rightMinusLeftBalanceDB: Double?,
    dcOffsetByChannel: [Double],
    clippedSampleCount: Int64
  ) {
    self.fileURL = fileURL
    self.analyzedAt = analyzedAt
    self.sourceBytes = sourceBytes
    self.sourceModifiedAt = sourceModifiedAt
    self.durationSeconds = durationSeconds
    self.sampleRate = sampleRate
    self.channelCount = channelCount
    self.analysisStandard = analysisStandard
    self.integratedLUFS = integratedLUFS
    self.maximumMomentaryLUFS = maximumMomentaryLUFS
    self.maximumShortTermLUFS = maximumShortTermLUFS
    self.loudnessRangeLU = loudnessRangeLU
    self.samplePeakDBFS = samplePeakDBFS
    self.estimatedTruePeakDBTP = estimatedTruePeakDBTP
    self.averageRMSDBFS = averageRMSDBFS
    self.maximumRMSDBFS = maximumRMSDBFS
    self.crestFactorDB = crestFactorDB
    self.stereoCorrelation = stereoCorrelation
    self.rightMinusLeftBalanceDB = rightMinusLeftBalanceDB
    self.dcOffsetByChannel = dcOffsetByChannel
    self.clippedSampleCount = clippedSampleCount
  }
}

public enum MasteringAnalyzerError: Error, LocalizedError {
  case unavailable(URL)
  case unsupportedChannelCount(Int)
  case unreadableAudio(URL, String)
  case emptyAudio(URL)

  public var errorDescription: String? {
    switch self {
    case .unavailable(let url): "Audio is unavailable at \(url.path)"
    case .unsupportedChannelCount(let count):
      "Master analysis currently supports mono and stereo files, not \(count) channels"
    case .unreadableAudio(let url, let reason): "Could not decode audio at \(url.path): \(reason)"
    case .emptyAudio(let url): "Audio contains no readable frames at \(url.path)"
    }
  }
}

/// Reads mono or stereo audio without changing it and returns objective mastering evidence.
///
/// Memory use is bounded by a decode buffer plus 100 ms energy summaries, so selecting a long
/// master does not require loading the complete file into memory.
public struct MasteringAnalyzer: Sendable {
  public init() {}

  public func analyze(file fileURL: URL, analyzedAt: Date = Date()) throws -> MasteringAnalysis {
    let url = fileURL.standardizedFileURL
    guard FileManager.default.isReadableFile(atPath: url.path) else {
      throw MasteringAnalyzerError.unavailable(url)
    }
    let values = try url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
    let audioFile: AVAudioFile
    do {
      audioFile = try AVAudioFile(
        forReading: url,
        commonFormat: .pcmFormatFloat32,
        interleaved: false
      )
    } catch {
      throw MasteringAnalyzerError.unreadableAudio(url, error.localizedDescription)
    }
    let format = audioFile.processingFormat
    let channelCount = Int(format.channelCount)
    guard channelCount == 1 || channelCount == 2 else {
      throw MasteringAnalyzerError.unsupportedChannelCount(channelCount)
    }
    guard format.sampleRate > 0 else {
      throw MasteringAnalyzerError.unreadableAudio(url, "invalid sample rate")
    }

    var meter = StreamingMeter(sampleRate: format.sampleRate, channelCount: channelCount)
    let capacity: AVAudioFrameCount = 16_384
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
      throw MasteringAnalyzerError.unreadableAudio(url, "could not allocate decode buffer")
    }
    while audioFile.framePosition < audioFile.length {
      if Task.isCancelled { throw CancellationError() }
      let remaining = audioFile.length - audioFile.framePosition
      let requested = AVAudioFrameCount(min(AVAudioFramePosition(capacity), remaining))
      guard requested > 0 else { break }
      do {
        try audioFile.read(into: buffer, frameCount: requested)
      } catch {
        throw MasteringAnalyzerError.unreadableAudio(url, error.localizedDescription)
      }
      guard buffer.frameLength > 0 else { break }
      guard let channels = buffer.floatChannelData else {
        throw MasteringAnalyzerError.unreadableAudio(url, "decoder did not provide Float32 channels")
      }
      meter.consume(channels: channels, frameCount: Int(buffer.frameLength))
    }
    guard meter.frameCount > 0 else { throw MasteringAnalyzerError.emptyAudio(url) }
    return meter.result(
      fileURL: url,
      analyzedAt: analyzedAt,
      sourceBytes: Int64(values.fileSize ?? 0),
      sourceModifiedAt: values.contentModificationDate
    )
  }
}

private struct EnergyBucket {
  var weightedSum = 0.0
  var unweightedSum = 0.0
  var frames = 0
}

private struct StreamingMeter {
  let sampleRate: Double
  let channelCount: Int
  let framesPerBucket: Int
  var filters: [[Biquad]]
  var interpolationHistory: [[Double]]
  var buckets: [EnergyBucket] = []
  var currentBucket = EnergyBucket()
  var frameCount: Int64 = 0
  var samplePeak = 0.0
  var estimatedTruePeak = 0.0
  var sumSquares: [Double]
  var sums: [Double]
  var clippedSampleCount: Int64 = 0
  var stereoProductSum = 0.0

  init(sampleRate: Double, channelCount: Int) {
    self.sampleRate = sampleRate
    self.channelCount = channelCount
    framesPerBucket = max(1, Int((sampleRate * 0.1).rounded()))
    filters = (0..<channelCount).map { _ in
      [Biquad.preFilter(sampleRate: sampleRate), Biquad.rlbFilter(sampleRate: sampleRate)]
    }
    interpolationHistory = Array(repeating: [], count: channelCount)
    sumSquares = Array(repeating: 0, count: channelCount)
    sums = Array(repeating: 0, count: channelCount)
  }

  mutating func consume(channels: UnsafePointer<UnsafeMutablePointer<Float>>, frameCount count: Int) {
    for frame in 0..<count {
      var weightedFrameEnergy = 0.0
      var unweightedFrameEnergy = 0.0
      for channel in 0..<channelCount {
        let sample = Double(channels[channel][frame])
        let magnitude = abs(sample)
        samplePeak = max(samplePeak, magnitude)
        estimatedTruePeak = max(estimatedTruePeak, magnitude)
        if magnitude >= 1 { clippedSampleCount += 1 }
        sumSquares[channel] += sample * sample
        sums[channel] += sample
        unweightedFrameEnergy += sample * sample
        if channelCount == 2, channel == 1 {
          stereoProductSum += Double(channels[0][frame]) * sample
        }

        var filtered = sample
        for index in filters[channel].indices {
          filtered = filters[channel][index].process(filtered)
        }
        weightedFrameEnergy += filtered * filtered
        updateTruePeak(sample, channel: channel)
      }
      currentBucket.weightedSum += weightedFrameEnergy
      currentBucket.unweightedSum += unweightedFrameEnergy / Double(channelCount)
      currentBucket.frames += 1
      self.frameCount += 1
      if currentBucket.frames == framesPerBucket {
        buckets.append(currentBucket)
        currentBucket = EnergyBucket()
      }
    }
  }

  mutating func updateTruePeak(_ sample: Double, channel: Int) {
    interpolationHistory[channel].append(sample)
    guard interpolationHistory[channel].count == 4 else { return }
    let values = interpolationHistory[channel]
    for phase in 1..<4 {
      let t = Double(phase) / 4
      let interpolated = catmullRom(values[0], values[1], values[2], values[3], t: t)
      estimatedTruePeak = max(estimatedTruePeak, abs(interpolated))
    }
    interpolationHistory[channel].removeFirst()
  }

  mutating func result(
    fileURL: URL,
    analyzedAt: Date,
    sourceBytes: Int64,
    sourceModifiedAt: Date?
  ) -> MasteringAnalysis {
    if currentBucket.frames > 0 { buckets.append(currentBucket) }
    let momentaryEnergies = windowEnergies(bucketCount: 4, step: 1, allowPartial: true)
    let shortTermEnergies = windowEnergies(bucketCount: 30, step: 10, allowPartial: false)
    let integrated = integratedLoudness(momentaryEnergies)
    let shortTermLoudness = shortTermEnergies.compactMap(loudness)
    let totalSamples = Double(frameCount) * Double(channelCount)
    let totalSquares = sumSquares.reduce(0, +)
    let averageRMS = totalSamples > 0 ? decibels(sqrt(totalSquares / totalSamples)) : nil
    let maximumRMS = momentaryUnweightedEnergies().compactMap { decibels(sqrt($0)) }.max()
    let peakDB = decibels(samplePeak)
    let truePeakDB = decibels(estimatedTruePeak)
    let correlation: Double? = {
      guard channelCount == 2 else { return nil }
      let denominator = sqrt(sumSquares[0] * sumSquares[1])
      return denominator > 0 ? max(-1, min(1, stereoProductSum / denominator)) : nil
    }()
    let balance: Double? = {
      guard channelCount == 2, sumSquares[0] > 0, sumSquares[1] > 0 else { return nil }
      return 10 * log10(sumSquares[1] / sumSquares[0])
    }()
    return MasteringAnalysis(
      fileURL: fileURL,
      analyzedAt: analyzedAt,
      sourceBytes: sourceBytes,
      sourceModifiedAt: sourceModifiedAt,
      durationSeconds: Double(frameCount) / sampleRate,
      sampleRate: sampleRate,
      channelCount: channelCount,
      analysisStandard: .ituRBS1770Inspired,
      integratedLUFS: integrated,
      maximumMomentaryLUFS: momentaryEnergies.compactMap(loudness).max(),
      maximumShortTermLUFS: shortTermLoudness.max(),
      loudnessRangeLU: loudnessRange(shortTermEnergies, integrated: integrated),
      samplePeakDBFS: peakDB,
      estimatedTruePeakDBTP: truePeakDB,
      averageRMSDBFS: averageRMS,
      maximumRMSDBFS: maximumRMS,
      crestFactorDB: peakDB.flatMap { peak in averageRMS.map { peak - $0 } },
      stereoCorrelation: correlation,
      rightMinusLeftBalanceDB: balance,
      dcOffsetByChannel: sums.map { $0 / Double(frameCount) },
      clippedSampleCount: clippedSampleCount
    )
  }

  private func windowEnergies(
    bucketCount: Int,
    step: Int,
    allowPartial: Bool
  ) -> [Double] {
    guard !buckets.isEmpty else { return [] }
    if buckets.count < bucketCount {
      return allowPartial ? [combinedEnergy(in: 0..<buckets.count, weighted: true)] : []
    }
    return stride(from: 0, through: buckets.count - bucketCount, by: step).map {
      combinedEnergy(in: $0..<($0 + bucketCount), weighted: true)
    }
  }

  private func momentaryUnweightedEnergies() -> [Double] {
    guard !buckets.isEmpty else { return [] }
    if buckets.count < 4 {
      return [combinedEnergy(in: 0..<buckets.count, weighted: false)]
    }
    return (0...(buckets.count - 4)).map {
      combinedEnergy(in: $0..<($0 + 4), weighted: false)
    }
  }

  private func combinedEnergy(in range: Range<Int>, weighted: Bool) -> Double {
    let sum = range.reduce(0.0) {
      $0 + (weighted ? buckets[$1].weightedSum : buckets[$1].unweightedSum)
    }
    let frames = range.reduce(0) { $0 + buckets[$1].frames }
    return frames > 0 ? sum / Double(frames) : 0
  }
}

private func integratedLoudness(_ energies: [Double]) -> Double? {
  let aboveAbsolute = energies.filter { (loudness($0) ?? -.infinity) > -70 }
  guard !aboveAbsolute.isEmpty, let ungated = loudness(mean(aboveAbsolute)) else { return nil }
  let relativeThreshold = ungated - 10
  let gated = aboveAbsolute.filter { (loudness($0) ?? -.infinity) > relativeThreshold }
  return gated.isEmpty ? nil : loudness(mean(gated))
}

private func loudnessRange(_ energies: [Double], integrated: Double?) -> Double? {
  guard let integrated else { return nil }
  let threshold = max(-70, integrated - 20)
  let values = energies.compactMap(loudness).filter { $0 > threshold }.sorted()
  guard values.count >= 2 else { return nil }
  return percentile(values, 0.95) - percentile(values, 0.10)
}

private func loudness(_ energy: Double) -> Double? {
  guard energy > 0, energy.isFinite else { return nil }
  return -0.691 + 10 * log10(energy)
}

private func decibels(_ amplitude: Double) -> Double? {
  guard amplitude > 0, amplitude.isFinite else { return nil }
  return 20 * log10(amplitude)
}

private func mean(_ values: [Double]) -> Double {
  values.reduce(0, +) / Double(values.count)
}

private func percentile(_ sorted: [Double], _ fraction: Double) -> Double {
  let position = fraction * Double(sorted.count - 1)
  let lower = Int(position.rounded(.down))
  let upper = Int(position.rounded(.up))
  guard lower != upper else { return sorted[lower] }
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - Double(lower))
}

private func catmullRom(_ p0: Double, _ p1: Double, _ p2: Double, _ p3: Double, t: Double) -> Double {
  0.5
    * ((2 * p1) + (-p0 + p2) * t
      + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
      + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
}

private struct Biquad {
  let b0: Double
  let b1: Double
  let b2: Double
  let a1: Double
  let a2: Double
  var z1 = 0.0
  var z2 = 0.0

  mutating func process(_ input: Double) -> Double {
    let output = b0 * input + z1
    z1 = b1 * input - a1 * output + z2
    z2 = b2 * input - a2 * output
    return output
  }

  static func preFilter(sampleRate: Double) -> Biquad {
    let frequency = 1_681.974450955533
    let gain = 3.999843853973347
    let q = 0.7071752369554196
    let k = tan(.pi * frequency / sampleRate)
    let vh = pow(10, gain / 20)
    let vb = pow(vh, 0.4996667741545416)
    let denominator = 1 + k / q + k * k
    return Biquad(
      b0: (vh + vb * k / q + k * k) / denominator,
      b1: 2 * (k * k - vh) / denominator,
      b2: (vh - vb * k / q + k * k) / denominator,
      a1: 2 * (k * k - 1) / denominator,
      a2: (1 - k / q + k * k) / denominator
    )
  }

  static func rlbFilter(sampleRate: Double) -> Biquad {
    let frequency = 38.13547087602444
    let q = 0.5003270373238773
    let k = tan(.pi * frequency / sampleRate)
    let denominator = 1 + k / q + k * k
    return Biquad(
      b0: 1 / denominator,
      b1: -2 / denominator,
      b2: 1 / denominator,
      a1: 2 * (k * k - 1) / denominator,
      a2: (1 - k / q + k * k) / denominator
    )
  }
}
