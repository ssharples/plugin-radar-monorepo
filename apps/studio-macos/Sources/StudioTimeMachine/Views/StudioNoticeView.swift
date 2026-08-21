import SwiftUI

struct StudioNoticeView: View {
  let message: String
  let actionTitle: String?
  let action: (() -> Void)?
  let dismiss: () -> Void

  init(
    message: String,
    actionTitle: String? = nil,
    action: (() -> Void)? = nil,
    dismiss: @escaping () -> Void
  ) {
    self.message = message
    self.actionTitle = actionTitle
    self.action = action
    self.dismiss = dismiss
  }

  var body: some View {
    HStack(spacing: 10) {
      Image(systemName: "info.circle")
        .foregroundStyle(.secondary)
      Text(message)
        .font(.callout)
        .lineLimit(2)
      Spacer(minLength: 12)
      if let actionTitle, let action {
        Button(actionTitle, action: action)
          .buttonStyle(.borderless)
          .accessibilityHint("Reveals the newly detected export without changing it")
      }
      Button(action: dismiss) {
        Image(systemName: "xmark")
      }
      .buttonStyle(.borderless)
      .help("Dismiss")
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .background(.bar, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(Color.secondary.opacity(0.18), lineWidth: 1)
    }
    .padding(.horizontal, 24)
    .padding(.top, 10)
  }
}
