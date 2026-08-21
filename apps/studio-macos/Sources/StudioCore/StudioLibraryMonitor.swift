import CoreServices
import Foundation

public enum LibraryFileChangeKind: String, Codable, Sendable {
  case created
  case removed
  case renamed
  case modified
  case metadataChanged
  case rootChanged
  case unknown
}

public struct LibraryFileEvent: Codable, Sendable, Equatable {
  public let fileURL: URL
  public let kind: LibraryFileChangeKind
  public let isDirectory: Bool
  public let eventID: UInt64

  public init(
    fileURL: URL,
    kind: LibraryFileChangeKind,
    isDirectory: Bool,
    eventID: UInt64
  ) {
    self.fileURL = fileURL
    self.kind = kind
    self.isDirectory = isDirectory
    self.eventID = eventID
  }
}

public struct LibraryFileEventBatch: Sendable, Equatable {
  public let events: [LibraryFileEvent]
  public let requiresFullRescan: Bool

  public init(events: [LibraryFileEvent], requiresFullRescan: Bool) {
    self.events = events
    self.requiresFullRescan = requiresFullRescan
  }

  public var containsIndexableChanges: Bool {
    requiresFullRescan
      || events.contains { event in
        event.isDirectory
          || event.fileURL.pathExtension.caseInsensitiveCompare("als") == .orderedSame
          || StudioLibraryMonitor.indexableAudioExtensions.contains(
            event.fileURL.pathExtension.lowercased()
          )
      }
  }
}

public enum StudioLibraryMonitorError: Error, LocalizedError {
  case noRoots
  case couldNotCreateStream
  case alreadyRunning

  public var errorDescription: String? {
    switch self {
    case .noRoots: "At least one library root is required"
    case .couldNotCreateStream: "macOS could not create the library file-event stream"
    case .alreadyRunning: "This library monitor is already running"
    }
  }
}

public final class StudioLibraryMonitor: @unchecked Sendable {
  static let indexableAudioExtensions: Set<String> = [
    "aif", "aiff", "flac", "m4a", "mp3", "ogg", "wav",
  ]

  private let queue = DispatchQueue(label: "com.pluginradar.studio-library-monitor")
  private let lock = NSLock()
  private var streamRef: FSEventStreamRef?
  private var continuation: AsyncStream<LibraryFileEventBatch>.Continuation?

  public init() {}

  deinit {
    stop()
  }

  public func events(
    watching roots: [URL],
    latency: TimeInterval = 0.75
  ) throws -> AsyncStream<LibraryFileEventBatch> {
    let roots = roots.map(\.standardizedFileURL)
    guard !roots.isEmpty else { throw StudioLibraryMonitorError.noRoots }

    lock.lock()
    defer { lock.unlock() }
    guard streamRef == nil else { throw StudioLibraryMonitorError.alreadyRunning }

    let stream = AsyncStream<LibraryFileEventBatch>.makeStream(
      bufferingPolicy: .bufferingNewest(32)
    )
    var context = FSEventStreamContext(
      version: 0,
      info: Unmanaged.passUnretained(self).toOpaque(),
      retain: nil,
      release: nil,
      copyDescription: nil
    )
    let flags = FSEventStreamCreateFlags(
      kFSEventStreamCreateFlagFileEvents
        | kFSEventStreamCreateFlagWatchRoot
        | kFSEventStreamCreateFlagNoDefer
    )
    guard
      let eventStream = FSEventStreamCreate(
        kCFAllocatorDefault,
        Self.callback,
        &context,
        roots.map(\.path) as CFArray,
        FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
        latency,
        flags
      )
    else {
      stream.continuation.finish()
      throw StudioLibraryMonitorError.couldNotCreateStream
    }

    continuation = stream.continuation
    stream.continuation.onTermination = { [weak self] _ in
      self?.stop()
    }
    streamRef = eventStream
    FSEventStreamSetDispatchQueue(eventStream, queue)
    FSEventStreamStart(eventStream)
    return stream.stream
  }

  public func stop() {
    lock.lock()
    let eventStream = streamRef
    let currentContinuation = continuation
    streamRef = nil
    continuation = nil
    lock.unlock()

    if let eventStream {
      FSEventStreamStop(eventStream)
      FSEventStreamInvalidate(eventStream)
      FSEventStreamRelease(eventStream)
    }
    currentContinuation?.finish()
  }

  private func receive(
    numberOfEvents: Int,
    eventPaths: UnsafeMutableRawPointer,
    eventFlags: UnsafePointer<FSEventStreamEventFlags>,
    eventIDs: UnsafePointer<FSEventStreamEventId>
  ) {
    let paths = eventPaths.assumingMemoryBound(to: UnsafePointer<CChar>?.self)
    var events: [LibraryFileEvent] = []
    var requiresFullRescan = false
    events.reserveCapacity(numberOfEvents)

    for offset in 0..<numberOfEvents {
      guard let path = paths[offset] else { continue }
      let flags = eventFlags[offset]
      requiresFullRescan = requiresFullRescan || Self.requiresFullRescan(flags)
      events.append(
        Self.event(
          path: String(cString: path),
          flags: flags,
          eventID: eventIDs[offset]
        )
      )
    }

    lock.lock()
    let currentContinuation = continuation
    lock.unlock()
    currentContinuation?.yield(
      LibraryFileEventBatch(events: events, requiresFullRescan: requiresFullRescan)
    )
  }

  private static let callback: FSEventStreamCallback = {
    _, clientInfo, numberOfEvents, eventPaths, eventFlags, eventIDs in
    guard let clientInfo else { return }
    let monitor = Unmanaged<StudioLibraryMonitor>.fromOpaque(clientInfo).takeUnretainedValue()
    monitor.receive(
      numberOfEvents: numberOfEvents,
      eventPaths: eventPaths,
      eventFlags: eventFlags,
      eventIDs: eventIDs
    )
  }

  static func event(
    path: String,
    flags: FSEventStreamEventFlags,
    eventID: FSEventStreamEventId
  ) -> LibraryFileEvent {
    LibraryFileEvent(
      fileURL: URL(fileURLWithPath: path),
      kind: changeKind(flags),
      isDirectory: has(flags, kFSEventStreamEventFlagItemIsDir),
      eventID: eventID
    )
  }

  private static func changeKind(_ flags: FSEventStreamEventFlags) -> LibraryFileChangeKind {
    if has(flags, kFSEventStreamEventFlagRootChanged) { return .rootChanged }
    if has(flags, kFSEventStreamEventFlagItemRenamed) { return .renamed }
    if has(flags, kFSEventStreamEventFlagItemCreated) { return .created }
    if has(flags, kFSEventStreamEventFlagItemRemoved) { return .removed }
    if has(flags, kFSEventStreamEventFlagItemModified) { return .modified }
    if has(flags, kFSEventStreamEventFlagItemInodeMetaMod)
      || has(flags, kFSEventStreamEventFlagItemFinderInfoMod)
      || has(flags, kFSEventStreamEventFlagItemChangeOwner)
      || has(flags, kFSEventStreamEventFlagItemXattrMod)
    {
      return .metadataChanged
    }
    return .unknown
  }

  private static func requiresFullRescan(_ flags: FSEventStreamEventFlags) -> Bool {
    has(flags, kFSEventStreamEventFlagMustScanSubDirs)
      || has(flags, kFSEventStreamEventFlagUserDropped)
      || has(flags, kFSEventStreamEventFlagKernelDropped)
      || has(flags, kFSEventStreamEventFlagRootChanged)
      || has(flags, kFSEventStreamEventFlagEventIdsWrapped)
  }

  private static func has(_ flags: FSEventStreamEventFlags, _ flag: Int) -> Bool {
    flags & FSEventStreamEventFlags(flag) != 0
  }
}
