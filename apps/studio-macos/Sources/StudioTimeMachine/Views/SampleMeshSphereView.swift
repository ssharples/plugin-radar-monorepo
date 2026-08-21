import SwiftUI

/// A lightweight projected wireframe sphere suitable for hundreds of native table rows.
/// Only the currently playing sphere receives animation-frame updates.
struct SampleMeshSphereView: View {
  let tint: Color
  let isPlaying: Bool
  let amplitude: Double

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    TimelineView(schedule) { context in
      Canvas(rendersAsynchronously: true) { graphics, size in
        drawSphere(
          in: &graphics,
          size: size,
          time: context.date.timeIntervalSinceReferenceDate
        )
      }
    }
    .frame(width: 24, height: 24)
    .accessibilityHidden(true)
  }

  private var schedule: AnimationTimelineSchedule {
    .animation(minimumInterval: 1 / 30, paused: !isPlaying || reduceMotion)
  }

  private func drawSphere(
    in graphics: inout GraphicsContext,
    size: CGSize,
    time: TimeInterval
  ) {
    let energy = isPlaying ? min(max(amplitude, 0), 1) : 0
    let motionTime = isPlaying && !reduceMotion ? time : 0
    let pulse = 1 + energy * 0.22
    let radius = min(size.width, size.height) * 0.38 * pulse
    let center = CGPoint(x: size.width / 2, y: size.height / 2)
    let rotation = motionTime * (0.8 + energy * 1.4)
    let lineWidth = 0.72 + energy * 0.5

    for latitude in [-0.58, -0.28, 0.0, 0.28, 0.58] {
      var path = Path()
      for step in 0...36 {
        let longitude = Double(step) / 36 * 2 * Double.pi
        let point = projectedPoint(
          latitude: latitude,
          longitude: longitude + rotation,
          radius: radius,
          center: center,
          energy: energy,
          time: motionTime
        )
        step == 0 ? path.move(to: point) : path.addLine(to: point)
      }
      graphics.stroke(path, with: .color(tint.opacity(0.42 + energy * 0.4)), lineWidth: lineWidth)
    }

    for meridian in 0..<6 {
      let offset = Double(meridian) / 6 * Double.pi
      var path = Path()
      for step in 0...36 {
        let latitude = -Double.pi / 2 + Double(step) / 36 * Double.pi
        let point = projectedPoint(
          latitude: latitude,
          longitude: offset + rotation,
          radius: radius,
          center: center,
          energy: energy,
          time: motionTime
        )
        step == 0 ? path.move(to: point) : path.addLine(to: point)
      }
      graphics.stroke(path, with: .color(tint.opacity(0.5 + energy * 0.46)), lineWidth: lineWidth)
    }
  }

  private func projectedPoint(
    latitude: Double,
    longitude: Double,
    radius: Double,
    center: CGPoint,
    energy: Double,
    time: TimeInterval
  ) -> CGPoint {
    let deformation =
      1 + energy * 0.1 * sin(longitude * 3 + latitude * 5 + time * 4.2)
    let x = cos(latitude) * sin(longitude) * radius * deformation
    let y = sin(latitude) * radius * deformation
    let depth = cos(latitude) * cos(longitude)
    return CGPoint(
      x: center.x + x,
      y: center.y + y * 0.86 + depth * radius * 0.16
    )
  }
}
