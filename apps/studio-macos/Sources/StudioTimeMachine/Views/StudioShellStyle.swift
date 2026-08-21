import SwiftUI

enum StudioShellPalette {
  static let chrome = Color(red: 0.055, green: 0.059, blue: 0.052)
  static let chromeRaised = Color(red: 0.095, green: 0.101, blue: 0.090)
  static let chromeStroke = Color.white.opacity(0.10)
  static let canvas = Color(red: 0.965, green: 0.956, blue: 0.929)
  static let canvasRaised = Color(red: 0.988, green: 0.984, blue: 0.970)
  static let canvasStroke = Color.black.opacity(0.08)
  static let ink = Color(red: 0.075, green: 0.078, blue: 0.068)
  static let mutedInk = Color(red: 0.39, green: 0.39, blue: 0.35)
  static let signal = Color(red: 0.804, green: 0.944, blue: 0.263)
}

struct StudioShellButtonStyle: ButtonStyle {
  enum Kind { case primary, secondary, ghost }

  let kind: Kind
  @Environment(\.isEnabled) private var isEnabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 12, weight: .semibold, design: .rounded))
      .foregroundStyle(foregroundColor)
      .padding(.horizontal, kind == .ghost ? 9 : 13)
      .frame(height: 34)
      .background(backgroundColor(configuration.isPressed))
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(kind == .primary ? .clear : StudioShellPalette.chromeStroke, lineWidth: 1)
      }
      .scaleEffect(configuration.isPressed ? 0.97 : 1)
      .opacity(isEnabled ? 1 : 0.42)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }

  private var foregroundColor: Color {
    switch kind {
    case .primary: StudioShellPalette.ink
    case .secondary, .ghost: .white.opacity(0.88)
    }
  }

  private func backgroundColor(_ isPressed: Bool) -> Color {
    switch kind {
    case .primary: StudioShellPalette.signal.opacity(isPressed ? 0.76 : 1)
    case .secondary: Color.white.opacity(isPressed ? 0.14 : 0.08)
    case .ghost: Color.white.opacity(isPressed ? 0.11 : 0.001)
    }
  }
}

struct StudioCanvasButtonStyle: ButtonStyle {
  enum Kind { case primary, secondary, quiet }

  let kind: Kind
  @Environment(\.isEnabled) private var isEnabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 12, weight: .semibold, design: .rounded))
      .foregroundStyle(foregroundColor)
      .padding(.horizontal, kind == .quiet ? 9 : 13)
      .frame(height: 34)
      .background(backgroundColor(configuration.isPressed))
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(kind == .secondary ? StudioShellPalette.ink.opacity(0.14) : .clear, lineWidth: 1)
      }
      .scaleEffect(configuration.isPressed ? 0.97 : 1)
      .opacity(isEnabled ? 1 : 0.42)
      .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
  }

  private var foregroundColor: Color {
    switch kind {
    case .primary: .white
    case .secondary, .quiet: StudioShellPalette.ink
    }
  }

  private func backgroundColor(_ isPressed: Bool) -> Color {
    switch kind {
    case .primary: StudioShellPalette.ink.opacity(isPressed ? 0.78 : 1)
    case .secondary: StudioShellPalette.canvasRaised.opacity(isPressed ? 0.68 : 1)
    case .quiet: StudioShellPalette.ink.opacity(isPressed ? 0.10 : 0.001)
    }
  }
}

struct StudioShellIconButton: View {
  let title: String
  let systemImage: String
  var badge: Int?
  var isActive = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      ZStack(alignment: .topTrailing) {
        Image(systemName: systemImage)
          .font(.system(size: 13, weight: .semibold))
          .frame(width: 16, height: 16)

        if let badge, badge > 0 {
          Text("\(min(badge, 99))")
            .font(.system(size: 8, weight: .bold, design: .rounded))
            .foregroundStyle(StudioShellPalette.ink)
            .padding(.horizontal, 4)
            .frame(minWidth: 14, minHeight: 14)
            .background(StudioShellPalette.signal, in: Capsule())
            .offset(x: 9, y: -8)
        }
      }
    }
    .buttonStyle(StudioShellButtonStyle(kind: isActive ? .secondary : .ghost))
    .help(title)
    .accessibilityLabel(title)
  }
}

struct StudioCanvasIconButton: View {
  let title: String
  let systemImage: String
  var isActive = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(StudioShellPalette.ink.opacity(isActive ? 0.92 : 0.62))
        .frame(width: 16, height: 16)
    }
    .buttonStyle(StudioCanvasButtonStyle(kind: isActive ? .secondary : .quiet))
    .help(title)
    .accessibilityLabel(title)
  }
}

struct StudioInlineFilterField: View {
  @Binding var text: String
  let prompt: String

  var body: some View {
    HStack(spacing: 8) {
      Image(systemName: "line.3.horizontal.decrease.circle")
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(StudioShellPalette.mutedInk)

      TextField(prompt, text: $text)
        .textFieldStyle(.plain)
        .font(.system(size: 12.5, weight: .medium))
        .foregroundStyle(StudioShellPalette.ink)

      if !text.isEmpty {
        Button {
          text = ""
        } label: {
          Image(systemName: "xmark.circle.fill")
            .font(.system(size: 12))
            .foregroundStyle(StudioShellPalette.mutedInk.opacity(0.72))
        }
        .buttonStyle(.plain)
        .help("Clear filter")
        .accessibilityLabel("Clear filter")
      }
    }
    .padding(.horizontal, 10)
    .frame(height: 32)
    .background(StudioShellPalette.ink.opacity(0.045))
    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 9, style: .continuous)
        .stroke(StudioShellPalette.canvasStroke, lineWidth: 1)
    }
  }
}
