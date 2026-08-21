import Foundation

public enum ExactAudioRecoveryStatus: String, Codable, Sendable {
  case noIndexedIdentity
  case noAvailableLocation
  case uniqueVerifiedLocation
  case multipleVerifiedLocations
}

public struct ExactAudioRecoveryResolution: Codable, Sendable, Equatable {
  public let missingURL: URL
  public let contentAssetID: String?
  public let status: ExactAudioRecoveryStatus
  public let candidates: [AudioPhysicalLocation]
  public let preselectedCandidate: AudioPhysicalLocation?
  public let explanation: String

  public init(
    missingURL: URL,
    contentAssetID: String?,
    status: ExactAudioRecoveryStatus,
    candidates: [AudioPhysicalLocation],
    preselectedCandidate: AudioPhysicalLocation?,
    explanation: String
  ) {
    self.missingURL = missingURL
    self.contentAssetID = contentAssetID
    self.status = status
    self.candidates = candidates
    self.preselectedCandidate = preselectedCandidate
    self.explanation = explanation
  }
}

/// Resolves a missing path only from identity evidence that was captured while the file existed.
/// It does not edit a DAW project or choose between multiple verified physical locations.
public struct ExactAudioRecoveryResolver: @unchecked Sendable {
  private let lineageStore: AudioLineageStore
  private let fileManager: FileManager

  public init(lineageStore: AudioLineageStore, fileManager: FileManager = .default) {
    self.lineageStore = lineageStore
    self.fileManager = fileManager
  }

  public func resolve(missingURL: URL) throws -> ExactAudioRecoveryResolution {
    let canonicalMissingURL = missingURL.resolvingSymlinksInPath().standardizedFileURL
    guard let indexedLocation = try lineageStore.location(at: canonicalMissingURL) else {
      return ExactAudioRecoveryResolution(
        missingURL: canonicalMissingURL, contentAssetID: nil, status: .noIndexedIdentity,
        candidates: [], preselectedCandidate: nil,
        explanation: "This path has no previously verified Content Asset identity.")
    }

    let candidates = try lineageStore.locations(for: indexedLocation.contentAssetID)
      .filter {
        $0.fileURL.standardizedFileURL.path != canonicalMissingURL.path
          && fileManager.fileExists(atPath: $0.fileURL.path)
      }
    if candidates.isEmpty {
      return ExactAudioRecoveryResolution(
        missingURL: canonicalMissingURL, contentAssetID: indexedLocation.contentAssetID,
        status: .noAvailableLocation, candidates: [], preselectedCandidate: nil,
        explanation: "The Content Asset is known, but none of its other verified locations is available.")
    }
    if candidates.count == 1 {
      return ExactAudioRecoveryResolution(
        missingURL: canonicalMissingURL, contentAssetID: indexedLocation.contentAssetID,
        status: .uniqueVerifiedLocation, candidates: candidates,
        preselectedCandidate: candidates[0],
        explanation: "One available location has the same verified Content Asset identity.")
    }
    return ExactAudioRecoveryResolution(
      missingURL: canonicalMissingURL, contentAssetID: indexedLocation.contentAssetID,
      status: .multipleVerifiedLocations, candidates: candidates, preselectedCandidate: nil,
      explanation: "Several available locations have verified identity; choose a location during review.")
  }
}
