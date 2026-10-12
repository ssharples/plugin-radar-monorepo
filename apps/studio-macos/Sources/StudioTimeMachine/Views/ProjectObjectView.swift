import SwiftUI

struct ProjectObjectView: View {
  let identity: String
  let size: CGFloat
  var showsDisc = true
  var isActive = false
  var isHovered = false

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack {
      if showsDisc {
        disc
          .frame(width: size * 0.78, height: size * 0.78)
          .offset(x: discOffset)
      }

      sleeve
        .frame(width: size * 0.82, height: size * 0.82)
        .offset(x: -size * 0.09)
    }
    .frame(width: size, height: size)
    .animation(
      reduceMotion ? nil : .spring(response: 0.36, dampingFraction: 0.82),
      value: isHovered || isActive
    )
  }

  private var discOffset: CGFloat {
    (isHovered || isActive) ? size * 0.24 : size * 0.14
  }

  private var disc: some View {
    ZStack {
      Circle()
        .fill(
          AngularGradient(
            colors: palette.discColors,
            center: .center
          )
        )
      Circle()
        .stroke(.white.opacity(0.68), lineWidth: 1)
        .padding(size * 0.09)
      Circle()
        .fill(.white.opacity(0.9))
        .frame(width: size * 0.09, height: size * 0.09)
      Circle()
        .stroke(.black.opacity(0.08), lineWidth: 1)
    }
    .shadow(color: .black.opacity(0.14), radius: 14, x: 0, y: 7)
  }

  private var sleeve: some View {
    ZStack(alignment: .bottomLeading) {
      RoundedRectangle(cornerRadius: size * 0.075, style: .continuous)
        .fill(
          LinearGradient(
            colors: [palette.sleeveTop, palette.sleeveBottom],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )

      GeometryReader { proxy in
        Path { path in
          path.move(to: CGPoint(x: 0, y: proxy.size.height * 0.68))
          path.addCurve(
            to: CGPoint(x: proxy.size.width, y: proxy.size.height * 0.4),
            control1: CGPoint(x: proxy.size.width * 0.34, y: proxy.size.height * 0.46),
            control2: CGPoint(x: proxy.size.width * 0.67, y: proxy.size.height * 0.7)
          )
          path.addLine(to: CGPoint(x: proxy.size.width, y: proxy.size.height))
          path.addLine(to: CGPoint(x: 0, y: proxy.size.height))
          path.closeSubpath()
        }
        .fill(palette.ink.opacity(0.2))
      }
      .clipShape(RoundedRectangle(cornerRadius: size * 0.075, style: .continuous))

      Text(monogram)
        .font(.custom("Helvetica Neue", size: size * 0.16).weight(.bold))
        .foregroundStyle(palette.ink)
        .padding(size * 0.09)
    }
    .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 6)
  }

  private var monogram: String {
    let words = identity.split(whereSeparator: { !$0.isLetter && !$0.isNumber })
    let letters = words.prefix(2).compactMap(\.first)
    return letters.isEmpty ? "ST" : String(letters).uppercased()
  }

  private var palette: ProjectPalette {
    ProjectPalette.palette(for: identity)
  }
}

private struct ProjectPalette {
  let sleeveTop: Color
  let sleeveBottom: Color
  let ink: Color
  let discColors: [Color]

  static func palette(for identity: String) -> ProjectPalette {
    let value = identity.unicodeScalars.reduce(0) { ($0 &* 31) &+ Int($1.value) }
    return palettes[abs(value) % palettes.count]
  }

  private static let palettes: [ProjectPalette] = [
    ProjectPalette(
      sleeveTop: Color(red: 0.94, green: 0.30, blue: 0.42),
      sleeveBottom: Color(red: 0.55, green: 0.08, blue: 0.22),
      ink: .white,
      discColors: [.pink, .orange, .white, .purple, .pink]
    ),
    ProjectPalette(
      sleeveTop: Color(red: 0.28, green: 0.67, blue: 0.86),
      sleeveBottom: Color(red: 0.08, green: 0.29, blue: 0.53),
      ink: .white,
      discColors: [.cyan, .white, .mint, .blue, .cyan]
    ),
    ProjectPalette(
      sleeveTop: Color(red: 0.97, green: 0.73, blue: 0.22),
      sleeveBottom: Color(red: 0.77, green: 0.31, blue: 0.07),
      ink: Color(red: 0.18, green: 0.08, blue: 0.02),
      discColors: [.yellow, .white, .orange, .pink, .yellow]
    ),
    ProjectPalette(
      sleeveTop: Color(red: 0.48, green: 0.76, blue: 0.53),
      sleeveBottom: Color(red: 0.10, green: 0.40, blue: 0.27),
      ink: .white,
      discColors: [.mint, .white, .green, .cyan, .mint]
    ),
    ProjectPalette(
      sleeveTop: Color(red: 0.64, green: 0.50, blue: 0.85),
      sleeveBottom: Color(red: 0.25, green: 0.16, blue: 0.51),
      ink: .white,
      discColors: [.purple, .white, .pink, .blue, .purple]
    ),
  ]
}
