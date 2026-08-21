import CoreServices
import Foundation
import Testing

@testable import StudioCore

@Suite("Studio library file monitor")
struct StudioLibraryMonitorTests {
  @Test(
    "Maps file event flags to semantic changes",
    arguments: [
      (kFSEventStreamEventFlagItemCreated, LibraryFileChangeKind.created),
      (kFSEventStreamEventFlagItemRemoved, LibraryFileChangeKind.removed),
      (kFSEventStreamEventFlagItemRenamed, LibraryFileChangeKind.renamed),
      (kFSEventStreamEventFlagItemModified, LibraryFileChangeKind.modified),
      (kFSEventStreamEventFlagRootChanged, LibraryFileChangeKind.rootChanged),
    ]
  )
  func mapsFlags(flag: Int, expected: LibraryFileChangeKind) {
    let event = StudioLibraryMonitor.event(
      path: "/Library/Project/Song.als",
      flags: FSEventStreamEventFlags(flag),
      eventID: 42
    )

    #expect(event.kind == expected)
    #expect(event.eventID == 42)
  }

  @Test("Filters event batches to indexable file types")
  func detectsIndexableChanges() {
    let setEvent = LibraryFileEvent(
      fileURL: URL(fileURLWithPath: "/Library/Song.als"),
      kind: .modified,
      isDirectory: false,
      eventID: 1
    )
    let imageEvent = LibraryFileEvent(
      fileURL: URL(fileURLWithPath: "/Library/Cover.png"),
      kind: .modified,
      isDirectory: false,
      eventID: 2
    )

    #expect(
      LibraryFileEventBatch(events: [setEvent], requiresFullRescan: false).containsIndexableChanges)
    #expect(
      !LibraryFileEventBatch(events: [imageEvent], requiresFullRescan: false)
        .containsIndexableChanges
    )
    #expect(LibraryFileEventBatch(events: [], requiresFullRescan: true).containsIndexableChanges)
  }
}
