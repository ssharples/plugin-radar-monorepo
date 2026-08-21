import Foundation

public enum LibraryRootAvailability: String, Codable, Sendable {
  case available
  case unavailable
  case permissionRequired
}

public struct RegisteredLibraryRoot: Codable, Identifiable, Sendable {
  public let id: String
  public let fileURL: URL
  public let displayName: String
  public let availability: LibraryRootAvailability
  public let requiresBookmarkRefresh: Bool
  public let lastScannedAt: Date?
  public let projectCount: Int
  public let setCount: Int

  public init(
    id: String,
    fileURL: URL,
    displayName: String,
    availability: LibraryRootAvailability,
    requiresBookmarkRefresh: Bool,
    lastScannedAt: Date?,
    projectCount: Int,
    setCount: Int
  ) {
    self.id = id
    self.fileURL = fileURL
    self.displayName = displayName
    self.availability = availability
    self.requiresBookmarkRefresh = requiresBookmarkRefresh
    self.lastScannedAt = lastScannedAt
    self.projectCount = projectCount
    self.setCount = setCount
  }
}

public struct RegisteredRootIndexingRun: Sendable {
  public let root: RegisteredLibraryRoot
  public let run: IndexingRun

  public init(root: RegisteredLibraryRoot, run: IndexingRun) {
    self.root = root
    self.run = run
  }
}
