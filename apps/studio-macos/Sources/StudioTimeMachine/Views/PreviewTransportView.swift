import StudioCore
import SwiftUI

struct PreviewTransportView: View {
  let asset: PreviewAsset
  let isSample: Bool
  @Bindable var player: AudioPreviewPlayer

  var body: some View {
    VStack(spacing: 4) {
      WaveformScrubberView(asset: asset, player: player)

      HStack(spacing: 13) {
        Button {
          player.toggle(asset)
        } label: {
          ZStack {
            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
              .opacity(player.isLoadingPlayback ? 0 : 1)
            if player.isLoadingPlayback {
              ProgressView()
                .controlSize(.small)
            }
          }
          .frame(width: 24, height: 24)
        }
        .buttonStyle(.borderless)
        .disabled(!asset.isAvailableOnDisk || player.isLoadingPlayback)
        .help(
          asset.isAvailableOnDisk ? "Play existing audio" : "File unavailable at indexed location")

        VStack(alignment: .leading, spacing: 2) {
          Text(asset.filename)
            .font(.callout.weight(.medium))
            .lineLimit(1)
          HStack(spacing: 7) {
            Text(previewSourceText)
            if asset.isLikelyUserRender {
              Text("Likely render")
                .fontWeight(.semibold)
            }
          }
          .font(.caption)
          .foregroundStyle(.secondary)
        }

        Spacer(minLength: 16)

        Text(timeText)
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
          .accessibilityHidden(true)

        Button {
          player.stop()
        } label: {
          Image(systemName: "xmark")
        }
        .buttonStyle(.borderless)
        .help("Close preview")
      }
      .padding(.horizontal, 16)
      .padding(.bottom, 10)

      if let errorMessage = player.errorMessage {
        Text(errorMessage)
          .font(.caption)
          .foregroundStyle(.red)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.horizontal, 53)
          .padding(.bottom, 9)
      }
    }
    .padding(.top, 7)
    .frame(maxWidth: 760)
    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    .shadow(color: .black.opacity(0.16), radius: 20, x: 0, y: 10)
    .accessibilityElement(children: .contain)
  }

  private var previewSourceText: String {
    if player.currentFidelity == .approximate {
      return "\(player.currentLabel ?? "Approximate") · raw fixed-tempo placement"
    }
    if let currentLabel = player.currentLabel {
      return "\(currentLabel) · \(asset.category.displayName)"
    }
    return "\(isSample ? "Sample metadata" : "Existing artifact") · \(asset.category.displayName)"
  }

  private var timeText: String {
    "\(format(player.currentTime)) / \(format(player.duration))"
  }

  private func format(_ time: TimeInterval) -> String {
    guard time.isFinite, time > 0 else { return "0:00" }
    let totalSeconds = Int(time.rounded(.down))
    return String(format: "%d:%02d", totalSeconds / 60, totalSeconds % 60)
  }
}

private struct WaveformScrubberView: View {
  let asset: PreviewAsset
  @Bindable var player: AudioPreviewPlayer
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @FocusState private var isFocused: Bool
  @State private var isHovering = false
  @State private var isScrubbing = false

  var body: some View {
    GeometryReader { proxy in
      let width = max(proxy.size.width, 1)
      let requestedSamples = Int(width * 1.35)

      ZStack {
        RoundedRectangle(cornerRadius: 7, style: .continuous)
          .fill(Color.black.opacity(isHovering || isFocused ? 0.045 : 0.001))

        waveformContent(size: proxy.size)
          .padding(.horizontal, 1)
          .padding(.vertical, 5)

        if player.duration > 0 {
          Rectangle()
            .fill(Color.black.opacity(isHovering || isFocused || isScrubbing ? 0.7 : 0.28))
            .frame(width: 1)
            .offset(x: width * player.progress - width / 2)
            .allowsHitTesting(false)
        }
      }
      .contentShape(Rectangle())
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { value in
            isScrubbing = true
            player.seek(toFraction: value.location.x / width)
          }
          .onEnded { value in
            player.seek(toFraction: value.location.x / width)
            isScrubbing = false
          }
      )
      .onAppear {
        player.requestWaveform(for: asset, sampleCount: requestedSamples)
      }
      .onChange(of: requestedSamples) { _, newValue in
        player.requestWaveform(for: asset, sampleCount: newValue)
      }
      .onChange(of: asset.id) { _, _ in
        player.requestWaveform(for: asset, sampleCount: requestedSamples)
      }
      .overlay {
        RoundedRectangle(cornerRadius: 7, style: .continuous)
          .stroke(Color.black.opacity(isFocused ? 0.62 : 0), lineWidth: 1.5)
          .padding(1)
      }
    }
    .frame(height: 34)
    .padding(.horizontal, 10)
    .focusable()
    .focusEffectDisabled()
    .focused($isFocused)
    .onHover { isHovering = $0 }
    .transaction { transaction in
      if reduceMotion { transaction.animation = nil }
    }
    .onKeyPress(.leftArrow) {
      player.skip(by: -keyboardStep)
      return .handled
    }
    .onKeyPress(.rightArrow) {
      player.skip(by: keyboardStep)
      return .handled
    }
    .accessibilityElement()
    .accessibilityLabel("Audio waveform")
    .accessibilityValue(accessibilityValue)
    .accessibilityHint("Click or drag to seek. Use Left and Right Arrow keys to adjust position.")
    .accessibilityAdjustableAction { direction in
      switch direction {
      case .increment:
        player.skip(by: keyboardStep)
      case .decrement:
        player.skip(by: -keyboardStep)
      @unknown default:
        break
      }
    }
  }

  @ViewBuilder
  private func waveformContent(size: CGSize) -> some View {
    switch player.waveformState {
    case .ready(let samples):
      ZStack(alignment: .leading) {
        WaveformBars(samples: samples)
          .fill(Color.black.opacity(0.2))
        WaveformBars(samples: samples)
          .fill(Color.black.opacity(0.82))
          .mask(alignment: .leading) {
            Rectangle()
              .frame(width: size.width * player.progress)
          }
      }
    case .loading:
      waveformStatus("Loading waveform", showsProgress: true)
    case .unavailable:
      waveformStatus("File unavailable", showsProgress: false)
    case .failed(let message):
      waveformStatus("Waveform unavailable", showsProgress: false)
        .help(message)
    case .idle:
      waveformStatus("Preparing waveform", showsProgress: true)
    }
  }

  private func waveformStatus(_ title: String, showsProgress: Bool) -> some View {
    ZStack {
      Rectangle()
        .fill(Color.black.opacity(0.12))
        .frame(height: 1)
      HStack(spacing: 6) {
        if showsProgress {
          ProgressView()
            .controlSize(.mini)
        }
        Text(title)
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 7)
      .background(.regularMaterial)
    }
  }

  private var keyboardStep: TimeInterval {
    max(1, min(5, player.duration / 100))
  }

  private var accessibilityValue: String {
    switch player.waveformState {
    case .unavailable:
      return "File unavailable"
    case .failed:
      return "Waveform unavailable"
    case .idle, .loading:
      return "Loading"
    case .ready:
      return "\(spokenTime(player.currentTime)) of \(spokenTime(player.duration))"
    }
  }

  private func spokenTime(_ time: TimeInterval) -> String {
    guard time.isFinite, time > 0 else { return "0 seconds" }
    let seconds = Int(time.rounded())
    let minutes = seconds / 60
    let remainder = seconds % 60
    if minutes == 0 { return "\(remainder) seconds" }
    return "\(minutes) minutes, \(remainder) seconds"
  }
}

private struct WaveformBars: Shape {
  let samples: [Float]

  func path(in rect: CGRect) -> Path {
    var path = Path()
    guard !samples.isEmpty, rect.width > 0, rect.height > 0 else { return path }

    let targetSpacing: CGFloat = 9
    let barCount = max(2, Int(rect.width / targetSpacing))
    let barWidth = min(4, rect.width / CGFloat(barCount) * 0.5)
    let step = (rect.width - barWidth) / CGFloat(max(barCount - 1, 1))
    let amplitudes = reducedAmplitudes(count: barCount)

    for (index, amplitude) in amplitudes.enumerated() {
      let height = max(barWidth, rect.height * (0.12 + CGFloat(amplitude) * 0.84))
      let barRect = CGRect(
        x: rect.minX + CGFloat(index) * step,
        y: rect.maxY - height,
        width: barWidth,
        height: height
      )
      path.addRoundedRect(
        in: barRect,
        cornerSize: CGSize(width: barWidth / 2, height: barWidth / 2)
      )
    }
    return path
  }

  private func reducedAmplitudes(count: Int) -> [Float] {
    guard count < samples.count else { return samples }

    return (0..<count).map { index in
      let lowerBound = index * samples.count / count
      let upperBound = max(lowerBound + 1, (index + 1) * samples.count / count)
      return samples[lowerBound..<min(upperBound, samples.count)].max() ?? 0
    }
  }
}
