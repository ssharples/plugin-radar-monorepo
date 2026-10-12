import StudioCore
import SwiftUI

struct SetMapSnapshotView: View {
  let snapshot: SetMapSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      header

      if snapshot.completeness == .unavailable {
        ContentUnavailableView(
          "No saved layout evidence",
          systemImage: "rectangle.dashed",
          description: Text("This Set did not expose tracks or Arrangement clips to the indexer.")
        )
        .frame(maxWidth: .infinity, minHeight: 180)
      } else {
        SetMapCanvas(snapshot: snapshot)
          .frame(height: mapHeight)
          .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

        evidenceFooter
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Reconstructed Arrangement map for \(snapshot.setName)")
    .accessibilityValue(accessibilitySummary)
  }

  private var header: some View {
    HStack(alignment: .top, spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        Text("Arrangement map")
          .font(.headline)

        Text("A full-song overview generated locally from the saved Set")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Spacer()

      Text("Reconstructed")
        .font(.caption)
        .foregroundStyle(.secondary)
    }
  }

  @ViewBuilder
  private var evidenceFooter: some View {
    HStack(spacing: 8) {
      Text(evidenceSummary)
        .monospacedDigit()

      if snapshot.missingMediaClipCount > 0 {
        Label(
          counted(snapshot.missingMediaClipCount, singular: "clip missing media", plural: "clips missing media"),
          systemImage: "exclamationmark.triangle"
        )
          .foregroundStyle(.orange)
      }

      Spacer(minLength: 0)
    }
    .font(.caption)
    .foregroundStyle(.secondary)

    if snapshot.completeness == .structureOnly {
      Label(
        "No Arrangement clips were found; this map preserves the saved track structure.",
        systemImage: "info.circle"
      )
      .font(.caption)
      .foregroundStyle(.secondary)
    }
  }

  private var mapHeight: CGFloat {
    min(460, max(190, 58 + CGFloat(snapshot.lanes.count) * 30))
  }

  private var evidenceSummary: String {
    var parts = [
      counted(snapshot.lanes.count, singular: "track", plural: "tracks"),
      counted(snapshot.arrangementClipCount, singular: "clip", plural: "clips"),
    ]
    if snapshot.sessionClipCount > 0 {
      parts.append(
        counted(snapshot.sessionClipCount, singular: "Session clip", plural: "Session clips"))
    }
    if snapshot.takeLaneClipCount > 0 {
      parts.append(
        counted(snapshot.takeLaneClipCount, singular: "take lane", plural: "take lanes"))
    }
    return parts.joined(separator: "  ·  ")
  }

  private func counted(_ count: Int, singular: String, plural: String) -> String {
    "\(count) \(count == 1 ? singular : plural)"
  }

  private var accessibilitySummary: String {
    var parts = [
      counted(snapshot.lanes.count, singular: "track", plural: "tracks"),
      counted(
        snapshot.arrangementClipCount,
        singular: "Arrangement clip",
        plural: "Arrangement clips"
      ),
      counted(snapshot.locators.count, singular: "locator", plural: "locators"),
    ]
    if snapshot.sessionClipCount > 0 {
      parts.append(
        counted(snapshot.sessionClipCount, singular: "Session clip", plural: "Session clips"))
    }
    if snapshot.missingMediaClipCount > 0 {
      parts.append(
        counted(
          snapshot.missingMediaClipCount,
          singular: "clip with missing media",
          plural: "clips with missing media"
        ))
    }
    return parts.joined(separator: ", ")
  }
}

private struct SetMapCanvas: View {
  let snapshot: SetMapSnapshot

  var body: some View {
    Canvas(rendersAsynchronously: true) { context, size in
      drawBackground(context: &context, size: size)
      guard !snapshot.lanes.isEmpty else { return }

      let labelWidth = min(170, max(108, size.width * 0.23))
      let rulerHeight: CGFloat = 34
      let mapWidth = max(1, size.width - labelWidth)
      let laneHeight = max(1, (size.height - rulerHeight) / CGFloat(snapshot.lanes.count))
      let beatSpan = max(1, snapshot.endBeat - snapshot.startBeat)

      drawGrid(
        context: &context,
        size: size,
        labelWidth: labelWidth,
        rulerHeight: rulerHeight,
        mapWidth: mapWidth,
        beatSpan: beatSpan
      )
      drawLocators(
        context: &context,
        size: size,
        labelWidth: labelWidth,
        rulerHeight: rulerHeight,
        mapWidth: mapWidth,
        beatSpan: beatSpan
      )

      for (index, lane) in snapshot.lanes.enumerated() {
        let top = rulerHeight + CGFloat(index) * laneHeight
        drawLane(
          lane,
          index: index,
          context: &context,
          labelWidth: labelWidth,
          mapWidth: mapWidth,
          top: top,
          height: laneHeight,
          beatSpan: beatSpan
        )
      }
    }
  }

  private func drawBackground(context: inout GraphicsContext, size: CGSize) {
    context.fill(
      Path(CGRect(origin: .zero, size: size)),
      with: .color(Color.secondary.opacity(0.045))
    )
    context.fill(
      Path(CGRect(x: 0, y: 0, width: min(170, max(108, size.width * 0.23)), height: size.height)),
      with: .color(Color.primary.opacity(0.018))
    )
  }

  private func drawGrid(
    context: inout GraphicsContext,
    size: CGSize,
    labelWidth: CGFloat,
    rulerHeight: CGFloat,
    mapWidth: CGFloat,
    beatSpan: Double
  ) {
    let divisions = 8
    for division in 0...divisions {
      let fraction = Double(division) / Double(divisions)
      let x = labelWidth + CGFloat(fraction) * mapWidth
      if division > 0, division < divisions, division.isMultiple(of: 2) {
        var line = Path()
        line.move(to: CGPoint(x: x, y: rulerHeight))
        line.addLine(to: CGPoint(x: x, y: size.height))
        context.stroke(line, with: .color(Color.primary.opacity(0.035)), lineWidth: 1)
      }

      let beat = snapshot.startBeat + fraction * beatSpan
      let bar = Int(floor(beat / Double(snapshot.timeSignature?.numerator ?? 4))) + 1
      context.draw(
        Text("\(max(1, bar))")
          .font(.system(size: 9, design: .monospaced))
          .foregroundStyle(Color.secondary.opacity(0.62)),
        at: CGPoint(x: x + 4, y: 5),
        anchor: .topLeading
      )
    }

    var divider = Path()
    divider.move(to: CGPoint(x: labelWidth, y: 0))
    divider.addLine(to: CGPoint(x: labelWidth, y: size.height))
    context.stroke(divider, with: .color(Color.primary.opacity(0.06)), lineWidth: 1)
  }

  private func drawLocators(
    context: inout GraphicsContext,
    size: CGSize,
    labelWidth: CGFloat,
    rulerHeight: CGFloat,
    mapWidth: CGFloat,
    beatSpan: Double
  ) {
    for locator in snapshot.locators
    where locator.beatTime >= snapshot.startBeat && locator.beatTime <= snapshot.endBeat {
      let x = timelineX(
        locator.beatTime,
        labelWidth: labelWidth,
        mapWidth: mapWidth,
        beatSpan: beatSpan
      )
      var line = Path()
      line.move(to: CGPoint(x: x, y: rulerHeight - 10))
      line.addLine(to: CGPoint(x: x, y: size.height))
      context.stroke(line, with: .color(Color.primary.opacity(0.11)), lineWidth: 1)

      let isAtRightEdge = x > labelWidth + mapWidth - 72
      context.draw(
        Text(locator.name.uppercased())
          .font(.system(size: 8, weight: .semibold))
          .foregroundStyle(Color.secondary.opacity(0.78)),
        at: CGPoint(x: x + (isAtRightEdge ? -3 : 3), y: rulerHeight - 4),
        anchor: isAtRightEdge ? .bottomTrailing : .bottomLeading
      )
    }
  }

  private func drawLane(
    _ lane: SetMapLane,
    index: Int,
    context: inout GraphicsContext,
    labelWidth: CGFloat,
    mapWidth: CGFloat,
    top: CGFloat,
    height: CGFloat,
    beatSpan: Double
  ) {
    if index > 0 {
      var separator = Path()
      separator.move(to: CGPoint(x: 0, y: top))
      separator.addLine(to: CGPoint(x: labelWidth + mapWidth, y: top))
      context.stroke(separator, with: .color(Color.primary.opacity(0.035)), lineWidth: 1)
    }

    if height >= 8 {
      let color = trackColor(lane.colorIndex)
      let markerX = 10 + CGFloat(min(3, lane.groupDepth)) * 10
      let markerRect = CGRect(x: markerX, y: top + height / 2 - 2, width: 4, height: 4)
      context.fill(
        Path(roundedRect: markerRect, cornerRadius: 2),
        with: .color(color.opacity(0.68))
      )
      context.draw(
        Text(lane.name)
          .font(.system(size: min(11, max(8, height * 0.28)), weight: lane.kind == .group ? .semibold : .regular))
          .foregroundStyle(lane.kind == .group ? Color.primary : Color.secondary),
        at: CGPoint(x: markerRect.maxX + 7, y: top + height / 2),
        anchor: .leading
      )
    }

    let color = trackColor(lane.colorIndex)
    for clip in lane.clips {
      let startX = timelineX(
        clip.startBeat,
        labelWidth: labelWidth,
        mapWidth: mapWidth,
        beatSpan: beatSpan
      )
      let endX = timelineX(
        clip.endBeat,
        labelWidth: labelWidth,
        mapWidth: mapWidth,
        beatSpan: beatSpan
      )
      let inset = min(5, max(2, height * 0.15))
      let rect = CGRect(
        x: startX,
        y: top + inset,
        width: max(2, endX - startX),
        height: max(1, height - inset * 2)
      )
      let path = Path(roundedRect: rect, cornerRadius: min(6, rect.height * 0.28))
      context.fill(path, with: .color(color.opacity(clip.kind == .midi ? 0.22 : 0.28)))

      if clip.mediaAvailability == .missing || clip.mediaAvailability == .disconnected {
        context.stroke(path, with: .color(.orange), style: StrokeStyle(lineWidth: 1.2, dash: [4, 3]))
      } else if clip.isLooped {
        context.stroke(path, with: .color(color.opacity(0.58)), lineWidth: 1)
      } else {
        context.stroke(path, with: .color(color.opacity(0.34)), lineWidth: 1)
      }

      if height >= 22, rect.width >= 44 {
        let maximumCharacters = max(3, Int((rect.width - 12) / 5.5))
        let title = clip.name.count > maximumCharacters
          ? String(clip.name.prefix(maximumCharacters - 1)) + "…"
          : clip.name
        context.draw(
          Text(title)
            .font(.system(size: min(10, max(8, height * 0.22)), weight: .medium))
            .foregroundStyle(Color.primary.opacity(0.72)),
          at: CGPoint(x: rect.minX + 7, y: rect.midY),
          anchor: .leading
        )
      }
    }
  }

  private func timelineX(
    _ beat: Double,
    labelWidth: CGFloat,
    mapWidth: CGFloat,
    beatSpan: Double
  ) -> CGFloat {
    let fraction = min(1, max(0, (beat - snapshot.startBeat) / beatSpan))
    return labelWidth + CGFloat(fraction) * mapWidth
  }

  private func trackColor(_ colorIndex: Int?) -> Color {
    switch abs(colorIndex ?? 0) % 12 {
    case 0: return .blue
    case 1: return .cyan
    case 2: return .mint
    case 3: return .green
    case 4: return .yellow
    case 5: return .orange
    case 6: return .red
    case 7: return .pink
    case 8: return .purple
    case 9: return .indigo
    case 10: return .teal
    default: return .gray
    }
  }
}
