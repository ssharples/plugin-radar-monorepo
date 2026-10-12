import AppKit
import Observation
import StudioCore

/// Completed files stay local and persist because another app may reference them.
@MainActor
@Observable
final class AudioClipClipboardController {
  private(set) var plan: AudioClipExportPlan?
  private(set) var preparedURL: URL?
  private(set) var isPreparing = false
  private(set) var status: String?
  private(set) var errorMessage: String?
  @ObservationIgnored private var exportTask: Task<Void, Never>?
  @ObservationIgnored private var generation = UUID()

  func configure(source: URL, selection: AudioClipSelection, approximate: Bool) {
    invalidate()
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[
      0]
    let directory = support.appending(
      path: "PluginRadar/StudioTimeMachine/Clips", directoryHint: .isDirectory
    )
    .appending(path: UUID().uuidString, directoryHint: .isDirectory)
    let stem = String(source.deletingPathExtension().lastPathComponent.prefix(100))
      .replacingOccurrences(of: ":", with: "-")
      .replacingOccurrences(of: "/", with: "-")
    let range = String(format: "%.3f–%.3fs", selection.start, selection.end)
    let name = "\(approximate ? "Approximate - " : "")\(stem) - \(range).wav"
    plan = AudioClipExportPlan(
      sourceURL: source, startSeconds: selection.start,
      endSeconds: selection.end, destinationURL: directory.appending(path: name))
  }

  func invalidate() {
    generation = UUID()
    exportTask?.cancel()
    exportTask = nil
    plan = nil
    preparedURL = nil
    isPreparing = false
    status = nil
    errorMessage = nil
  }

  func copyClip() {
    if let preparedURL, FileManager.default.isReadableFile(atPath: preparedURL.path) {
      writeToClipboard(preparedURL)
      return
    }
    preparedURL = nil
    guard let plan, !isPreparing else { return }
    isPreparing = true
    errorMessage = nil
    let token = generation
    exportTask = Task { [weak self] in
      let worker = Task.detached(priority: .userInitiated) {
        try AudioClipExporter().export(plan)
      }
      do {
        let result = try await withTaskCancellationHandler {
          try await worker.value
        } onCancel: {
          worker.cancel()
        }
        try Task.checkCancellation()
        guard let self, self.generation == token else { return }
        self.preparedURL = result.fileURL
        self.isPreparing = false
        self.writeToClipboard(result.fileURL)
      } catch is CancellationError {
        return
      } catch {
        guard let self, self.generation == token else { return }
        self.isPreparing = false
        self.errorMessage = error.localizedDescription
      }
    }
  }

  func revealClip() {
    guard let preparedURL else { return }
    guard FileManager.default.isReadableFile(atPath: preparedURL.path) else {
      self.preparedURL = nil
      status = nil
      errorMessage = "The clip was moved or removed. Copy Clip again to recreate it."
      return
    }
    NSWorkspace.shared.activateFileViewerSelecting([preparedURL])
  }

  private func writeToClipboard(_ url: URL) {
    NSPasteboard.general.clearContents()
    if NSPasteboard.general.writeObjects([url as NSURL]) {
      status = "WAV copied. Drag Clip into Live."
      errorMessage = nil
    } else {
      errorMessage = "The clipboard is unavailable. Drag Clip or reveal the WAV in Finder."
    }
  }
}
