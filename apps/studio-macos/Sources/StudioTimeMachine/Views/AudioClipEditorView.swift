import StudioCore
import SwiftUI

struct AudioClipEditorView: View {
  let asset: PreviewAsset
  @Bindable var player: AudioPreviewPlayer
  @State private var visibleRange: ClosedRange<Double>?
  @State private var showsDestination = false

  var body: some View {
    if let selection = player.clipSelection {
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Text("Select a clip").font(.callout.weight(.medium))
          Spacer()
          Button("Done") { player.endClipping() }
            .buttonStyle(.borderless)
            .help("Return to the full audio preview")
        }

        ClipSelectionWaveform(asset: asset, player: player, visibleRange: visibleRange)
          .frame(height: 68)

        HStack {
          Text(
            "\((visibleRange?.lowerBound ?? 0).formatted(.number.precision(.fractionLength(3)))) s")
          Spacer()
          Text(
            "\((visibleRange?.upperBound ?? player.duration).formatted(.number.precision(.fractionLength(3)))) s"
          )
        }
        .font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
        .accessibilityLabel(
          "Visible waveform from \(visibleRange?.lowerBound ?? 0) to \(visibleRange?.upperBound ?? player.duration) seconds"
        )

        ViewThatFits(in: .horizontal) {
          HStack(spacing: 12) {
            timeFields(selection)
            durationLabel(selection)
          }
          VStack(alignment: .leading, spacing: 6) {
            timeFields(selection)
            durationLabel(selection)
          }
        }

        ViewThatFits(in: .horizontal) {
          HStack(spacing: 12) {
            auditionControls(selection)
            Spacer(minLength: 8)
            exportControls
          }
          VStack(alignment: .leading, spacing: 10) {
            auditionControls(selection)
            exportControls
          }
        }
        .controlSize(.small)

        if let error = player.clipClipboard.errorMessage {
          Text(error).font(.caption).foregroundStyle(.red).textSelection(.enabled)
        } else {
          HStack(alignment: .top, spacing: 8) {
            Text(player.clipClipboard.status ?? "Copy Clip creates a new WAV in Studio Clips.")
              .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            Button("Location…") { showsDestination = true }
              .buttonStyle(.borderless)
              .fixedSize()
              .popover(isPresented: $showsDestination) {
                VStack(alignment: .leading, spacing: 10) {
                  Text("Clip destination").font(.headline)
                  Text(player.clipClipboard.plan?.destinationURL.path ?? "No destination")
                    .font(.caption).textSelection(.enabled)
                  Text(
                    "A new WAV is kept here so your DAW can reference it. Each clip has its own destination; source files stay unchanged."
                  )
                  .font(.caption).foregroundStyle(.secondary)
                }
                .padding(16).frame(width: 380)
              }
          }
          .font(.caption)
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 7)
      .padding(.bottom, 12)
      .onChange(of: asset.fileURL) { _, _ in visibleRange = nil }
    }
  }

  private func timeFields(_ selection: AudioClipSelection) -> some View {
    HStack(spacing: 12) {
      timeField(
        "In",
        value: Binding(
          get: { player.clipSelection?.start ?? 0 },
          set: {
            player.setClipSelection(
              start: min($0, selection.end - min(0.001, player.duration)), end: selection.end)
          }))
      timeField(
        "Out",
        value: Binding(
          get: { player.clipSelection?.end ?? 0 },
          set: {
            player.setClipSelection(start: selection.start, end: $0)
          }))
    }
  }

  private func timeField(_ label: String, value: Binding<Double>) -> some View {
    HStack(spacing: 5) {
      Text(label).foregroundStyle(.secondary)
      TextField(label, value: value, format: .number.precision(.fractionLength(3)))
        .textFieldStyle(.roundedBorder)
        .frame(width: 80)
        .accessibilityLabel("Clip \(label.lowercased()) point in seconds")
      Text("s").foregroundStyle(.secondary)
    }
    .font(.caption.monospacedDigit())
  }

  private func durationLabel(_ selection: AudioClipSelection) -> some View {
    Text("\(selection.duration.formatted(.number.precision(.fractionLength(3)))) s selected")
      .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
      .fixedSize()
  }

  private func auditionControls(_ selection: AudioClipSelection) -> some View {
    HStack(spacing: 8) {
      Toggle(isOn: $player.loopsSelection) { Label("Loop", systemImage: "repeat") }
        .toggleStyle(.button)
        .help("Repeat the selected range while auditioning")
      Button(
        visibleRange == nil ? "Zoom" : "Full audio",
        systemImage: visibleRange == nil
          ? "plus.magnifyingglass" : "arrow.up.left.and.arrow.down.right"
      ) {
        if visibleRange != nil {
          visibleRange = nil
        } else {
          let padding = max(selection.duration * 0.5, 0.05)
          visibleRange =
            max(0, selection.start - padding)...min(player.duration, selection.end + padding)
        }
      }
      .help(
        visibleRange == nil
          ? "Zoom into the selected range for precise trimming"
          : "Show the complete source waveform")
    }
  }

  private var exportControls: some View {
    HStack(spacing: 8) {
      Button {
        player.clipClipboard.copyClip()
      } label: {
        if player.clipClipboard.isPreparing {
          HStack(spacing: 5) {
            ProgressView().controlSize(.mini)
            Text("Preparing…")
          }
        } else {
          Label("Copy Clip", systemImage: "doc.on.clipboard")
        }
      }
      .disabled(player.clipClipboard.isPreparing)
      .help("Create and copy the selected range as a new WAV file; the source stays unchanged")

      if let url = player.clipClipboard.preparedURL {
        Label("Drag Clip", systemImage: "hand.draw")
          .font(.caption.weight(.medium))
          .padding(.horizontal, 8).padding(.vertical, 5)
          .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
          .onDrag { NSItemProvider(object: url as NSURL) }
          .help("Drag this WAV into Ableton Live or another DAW")
          .accessibilityLabel("Drag exported audio clip")
        Button {
          player.clipClipboard.revealClip()
        } label: {
          Image(systemName: "folder")
        }
        .help("Reveal clip in Finder")
        .accessibilityLabel("Reveal clip in Finder")
      }
    }
  }
}

private struct ClipSelectionWaveform: View {
  let asset: PreviewAsset
  @Bindable var player: AudioPreviewPlayer
  let visibleRange: ClosedRange<Double>?
  @FocusState private var isFocused: Bool

  private var span: ClosedRange<Double> { visibleRange ?? 0...max(player.duration, 0.001) }

  var body: some View {
    GeometryReader { proxy in
      let width = max(1, proxy.size.width)
      let samples = Int(width * 1.35)
      let lower = position(player.clipSelection?.start ?? 0, width: width)
      let upper = position(player.clipSelection?.end ?? 0, width: width)

      ZStack(alignment: .topLeading) {
        ZStack(alignment: .topLeading) {
          RoundedRectangle(cornerRadius: 6).fill(.primary.opacity(0.035))
          if case .ready(let amplitudes) = player.waveformState,
            player.waveformRange == visibleRange
          {
            Canvas { context, size in
              var path = Path()
              let count = max(1, Int(size.width / 3))
              for index in 0..<count {
                let a = index * amplitudes.count / count
                let b = min(amplitudes.count, max(a + 1, (index + 1) * amplitudes.count / count))
                let value = a < b ? amplitudes[a..<b].max() ?? 0 : 0
                let height = max(1, CGFloat(value) * (size.height - 8))
                path.addRect(
                  CGRect(
                    x: CGFloat(index) * 3, y: (size.height - height) / 2, width: 1.5, height: height
                  ))
              }
              context.fill(path, with: .color(.primary.opacity(0.5)))
            }
          } else if case .failed = player.waveformState {
            Text("Waveform unavailable. Use In and Out to select audio.")
              .font(.caption).foregroundStyle(.secondary).padding(8)
          } else if case .unavailable = player.waveformState {
            Text("Source audio unavailable").font(.caption).foregroundStyle(.secondary).padding(8)
          } else {
            HStack {
              Spacer()
              ProgressView().controlSize(.small)
              Spacer()
            }.frame(height: proxy.size.height)
          }
          Rectangle().fill(.tint.opacity(0.16))
            .frame(width: max(2, upper - lower), height: proxy.size.height)
            .offset(x: lower)
          Rectangle().fill(.primary.opacity(0.65)).frame(width: 1, height: proxy.size.height)
            .offset(x: position(player.currentTime, width: width))
        }
        .contentShape(Rectangle())
        .gesture(
          DragGesture(minimumDistance: 0).onChanged { value in
            let anchor = time(value.startLocation.x, width: width)
            let current = time(value.location.x, width: width)
            player.setClipSelection(start: min(anchor, current), end: max(anchor, current))
          })

        rangeHandle(isStart: true, width: width, height: proxy.size.height).offset(x: lower - 7)
        rangeHandle(isStart: false, width: width, height: proxy.size.height).offset(x: upper - 7)
      }
      .coordinateSpace(name: "clipWaveform")
      .onAppear { player.requestWaveform(for: asset, sampleCount: samples, range: visibleRange) }
      .onChange(of: samples) { _, _ in
        player.requestWaveform(for: asset, sampleCount: samples, range: visibleRange)
      }
      .onChange(of: visibleRange) { _, _ in
        player.requestWaveform(for: asset, sampleCount: samples, range: visibleRange)
      }
    }
    .focusable().focused($isFocused)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Clip selection waveform")
    .accessibilityValue(
      "From \(player.clipSelection?.start ?? 0) to \(player.clipSelection?.end ?? 0) seconds. Playhead \(player.currentTime) seconds."
    )
    .accessibilityHint(
      "Drag to select audio. Edit the In and Out fields to adjust the range precisely."
    )
    .accessibilityAdjustableAction { direction in
      shiftSelection(direction == .increment ? 0.01 : -0.01)
    }
    .onKeyPress(.leftArrow) {
      shiftSelection(-0.01)
      return .handled
    }
    .onKeyPress(.rightArrow) {
      shiftSelection(0.01)
      return .handled
    }
  }

  private func rangeHandle(isStart: Bool, width: CGFloat, height: CGFloat) -> some View {
    ZStack {
      Rectangle().fill(.tint).frame(width: 2)
      RoundedRectangle(cornerRadius: 2).fill(.tint).frame(width: 8, height: 18)
      Rectangle().fill(.white.opacity(0.8)).frame(width: 1, height: 8)
    }
    .frame(width: 14, height: height).contentShape(Rectangle())
    .gesture(
      DragGesture(minimumDistance: 0, coordinateSpace: .named("clipWaveform"))
        .onChanged { value in
          guard let selection = player.clipSelection else { return }
          let point = time(value.location.x, width: width)
          player.setClipSelection(
            start: isStart ? min(point, selection.end - 0.001) : selection.start,
            end: isStart ? selection.end : max(point, selection.start + 0.001))
        }
    )
    .accessibilityHidden(true)
  }

  private func position(_ time: Double, width: CGFloat) -> CGFloat {
    min(max((time - span.lowerBound) / (span.upperBound - span.lowerBound), 0), 1) * width
  }

  private func time(_ x: CGFloat, width: CGFloat) -> Double {
    span.lowerBound + min(max(x / width, 0), 1) * (span.upperBound - span.lowerBound)
  }

  private func shiftSelection(_ amount: Double) {
    guard let selection = player.clipSelection else { return }
    let start = min(max(0, selection.start + amount), max(0, player.duration - selection.duration))
    player.setClipSelection(start: start, end: start + selection.duration)
  }
}
