import StudioCore
import SwiftUI

struct IndexingView: View {
  let rootURL: URL
  let progress: IndexingProgress?

  var body: some View {
    VStack(spacing: 24) {
      ProjectObjectView(identity: rootURL.path, size: 148, showsDisc: true)
        .accessibilityHidden(true)

      VStack(spacing: 8) {
        Text("Building your Studio Library")
          .font(.title2.weight(.semibold))
        Text(rootURL.lastPathComponent)
          .foregroundStyle(.secondary)
      }

      VStack(spacing: 8) {
        if let progress, progress.total > 0 {
          ProgressView(value: progress.fractionCompleted)
            .frame(width: 280)
          HStack(spacing: 8) {
            Text(progressLabel(progress.phase))
            Text("\(progress.completed) of \(progress.total)")
            if progress.reused > 0 {
              Text("· \(progress.reused) reused")
            }
          }
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
        } else {
          ProgressView()
            .controlSize(.small)
        }
      }

      Text(
        "Reading projects, Set backups, and existing audio. Nothing in this folder will be changed."
      )
      .font(.callout)
      .foregroundStyle(.secondary)
      .multilineTextAlignment(.center)
      .frame(maxWidth: 390)
    }
    .padding(40)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func progressLabel(_ phase: IndexingPhase) -> String {
    switch phase {
    case .discovering: "Discovering files"
    case .parsingSets: "Reading Sets"
    case .classifyingAudio: "Classifying audio"
    case .finalizing: "Saving library"
    case .complete: "Complete"
    }
  }
}

struct IndexFailureView: View {
  let rootURL: URL?
  let message: String
  let retry: () -> Void

  var body: some View {
    ContentUnavailableView {
      Label("The folder could not be indexed", systemImage: "exclamationmark.triangle")
    } description: {
      VStack(spacing: 6) {
        if let rootURL { Text(rootURL.path).font(.caption) }
        Text(message)
      }
    } actions: {
      Button("Try Again", action: retry)
        .buttonStyle(.borderedProminent)
    }
  }
}
