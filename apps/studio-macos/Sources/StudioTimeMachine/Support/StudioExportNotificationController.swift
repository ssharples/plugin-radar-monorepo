import AppKit
import StudioCore
@preconcurrency import UserNotifications

@MainActor
final class StudioExportNotificationController: NSObject, UNUserNotificationCenterDelegate {
  static let shared = StudioExportNotificationController()

  private nonisolated static let categoryIdentifier = "studio.export.detected"
  private nonisolated static let revealActionIdentifier = "studio.export.reveal"
  private nonisolated static let batchIDKey = "exportBatchID"

  private let notificationCenter = UNUserNotificationCenter.current()
  private var isConfigured = false

  func configure() {
    guard !isConfigured else { return }
    isConfigured = true
    notificationCenter.delegate = self
    let reveal = UNNotificationAction(
      identifier: Self.revealActionIdentifier,
      title: "Reveal in Finder",
      options: [.foreground]
    )
    notificationCenter.setNotificationCategories([
      UNNotificationCategory(
        identifier: Self.categoryIdentifier,
        actions: [reveal],
        intentIdentifiers: [],
        options: [])
    ])
  }

  func notify(_ batches: [ExportBatch]) {
    guard !isSampleMode, !batches.isEmpty else { return }
    configure()
    Task {
      do {
        let settings = await notificationCenter.notificationSettings()
        let isAuthorized: Bool
        switch settings.authorizationStatus {
        case .authorized, .provisional:
          isAuthorized = true
        case .notDetermined:
          isAuthorized = try await notificationCenter.requestAuthorization(
            options: [.alert, .sound])
        case .denied:
          isAuthorized = false
        @unknown default:
          isAuthorized = false
        }
        guard isAuthorized else { return }
        for batch in batches { try await addNotification(for: batch) }
      } catch {
        NSLog("Studio Time Machine export notification: %@", error.localizedDescription)
      }
    }
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .list, .sound])
  }

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let actionIdentifier = response.actionIdentifier
    let batchID = response.notification.request.content.userInfo[Self.batchIDKey] as? String
    Task { @MainActor in
      if actionIdentifier == Self.revealActionIdentifier, let batchID {
        await revealExportBatch(id: batchID)
      }
    }
    completionHandler()
  }

  private var isSampleMode: Bool {
    ProcessInfo.processInfo.arguments.contains { $0.hasPrefix("--sample-") }
  }

  private func addNotification(for batch: ExportBatch) async throws {
    let content = UNMutableNotificationContent()
    content.title = "New export detected"
    content.body = notificationBody(for: batch)
    content.categoryIdentifier = Self.categoryIdentifier
    content.threadIdentifier = "studio.export.inbox"
    content.userInfo = [Self.batchIDKey: batch.id]
    content.sound = .default
    try await notificationCenter.add(
      UNNotificationRequest(identifier: batch.id, content: content, trigger: nil))
  }

  private func notificationBody(for batch: ExportBatch) -> String {
    let format = batch.technicalSummary.formats.map { $0.uppercased() }.joined(separator: "/")
    if batch.files.count == 1, let file = batch.files.first {
      return [file.fileURL.lastPathComponent, format].filter { !$0.isEmpty }.joined(
        separator: " · ")
    }
    let kind = batch.kind == .stems ? "stems" : "files"
    return ["\(batch.files.count) \(kind)", format].filter { !$0.isEmpty }.joined(
      separator: " · ")
  }

  func revealExportBatch(id: String) async {
    do {
      let storageURL = try ExportInboxStore.defaultStorageURL()
      guard let batch = try await ExportInboxStore(storageURL: storageURL).batch(id: id) else {
        return
      }
      let urls = batch.files.map(\.fileURL).filter { url in
        var isDirectory: ObjCBool = false
        return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory)
          && !isDirectory.boolValue
      }
      guard !urls.isEmpty else { return }
      NSWorkspace.shared.activateFileViewerSelecting(urls)
    } catch {
      NSLog("Studio Time Machine reveal export: %@", error.localizedDescription)
    }
  }
}
