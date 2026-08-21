import Foundation

public enum IndexingPhase: String, Codable, Sendable {
  case discovering
  case parsingSets
  case classifyingAudio
  case finalizing
  case complete
}

public struct IndexingProgress: Codable, Sendable, Equatable {
  public let phase: IndexingPhase
  public let completed: Int
  public let total: Int
  public let reused: Int

  public init(phase: IndexingPhase, completed: Int, total: Int, reused: Int = 0) {
    self.phase = phase
    self.completed = completed
    self.total = total
    self.reused = reused
  }

  public var fractionCompleted: Double {
    guard total > 0 else { return phase == .complete ? 1 : 0 }
    return min(1, max(0, Double(completed) / Double(total)))
  }
}

public struct IndexingStatistics: Codable, Sendable, Equatable {
  public let projectCount: Int
  public let setCount: Int
  public let parsedSetCount: Int
  public let reusedSetCount: Int
  public let audioAssetCount: Int
  public let issueCount: Int
  public let startedAt: Date
  public let completedAt: Date

  public init(
    projectCount: Int,
    setCount: Int,
    parsedSetCount: Int,
    reusedSetCount: Int,
    audioAssetCount: Int,
    issueCount: Int,
    startedAt: Date,
    completedAt: Date
  ) {
    self.projectCount = projectCount
    self.setCount = setCount
    self.parsedSetCount = parsedSetCount
    self.reusedSetCount = reusedSetCount
    self.audioAssetCount = audioAssetCount
    self.issueCount = issueCount
    self.startedAt = startedAt
    self.completedAt = completedAt
  }

  public var duration: TimeInterval {
    completedAt.timeIntervalSince(startedAt)
  }
}

public struct IndexingRun: Sendable {
  public let index: StudioLibraryIndex
  public let statistics: IndexingStatistics

  public init(index: StudioLibraryIndex, statistics: IndexingStatistics) {
    self.index = index
    self.statistics = statistics
  }
}
