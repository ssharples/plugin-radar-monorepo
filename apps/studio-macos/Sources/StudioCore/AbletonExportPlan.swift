import Foundation

public struct AbletonSelectedTrack: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let name: String

  public init(id: String, name: String) {
    self.id = id
    self.name = name
  }
}

public enum AbletonExportSource: Codable, Sendable, Equatable {
  case main
  case allIndividualTracks(expectedTrackCount: Int?)
  case selectedTracks([AbletonSelectedTrack])

  public var title: String {
    switch self {
    case .main: "Main"
    case .allIndividualTracks: "All Individual Tracks"
    case .selectedTracks(let tracks):
      tracks.isEmpty ? "Selected Tracks" : "Selected Tracks (\(tracks.count))"
    }
  }

  public var expectedFileCount: Int? {
    switch self {
    case .main: 1
    case .allIndividualTracks(let count): count
    case .selectedTracks(let tracks): tracks.isEmpty ? nil : tracks.count
    }
  }
}

public struct AbletonArrangementRange: Codable, Sendable, Equatable {
  public let startBeat: Double
  public let endBeat: Double

  public init(startBeat: Double, endBeat: Double) {
    self.startBeat = startBeat
    self.endBeat = endBeat
  }

  public var lengthBeats: Double { endBeat - startBeat }
}

public enum AbletonExportPCMFormat: String, Codable, Sendable, CaseIterable {
  case wav
  case aiff
  case flac

  public var fileExtension: String {
    switch self {
    case .wav: "wav"
    case .aiff: "aiff"
    case .flac: "flac"
    }
  }

  public var displayName: String { rawValue.uppercased() }
}

public enum AbletonExportSampleRate: Int, Codable, Sendable, CaseIterable {
  case hz44100 = 44_100
  case hz48000 = 48_000
  case hz88200 = 88_200
  case hz96000 = 96_000
  case hz176400 = 176_400
  case hz192000 = 192_000
}

public enum AbletonExportBitDepth: Int, Codable, Sendable, CaseIterable {
  case int16 = 16
  case int24 = 24
  case int32 = 32
}

public enum AbletonExportOverwritePolicy: String, Codable, Sendable {
  case never
}

public struct AbletonExportDestination: Codable, Sendable, Equatable {
  public let directoryURL: URL
  public let baseName: String
  public let expectedOutputFileNames: [String]

  public init(
    directoryURL: URL,
    baseName: String,
    expectedOutputFileNames: [String] = []
  ) {
    self.directoryURL = directoryURL.standardizedFileURL
    self.baseName = baseName
    self.expectedOutputFileNames = expectedOutputFileNames
  }
}

public struct AbletonExportPlan: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let setID: String
  public let revisionID: String
  public let workID: String?
  public let workName: String?
  public let setURL: URL
  public let installation: AbletonLiveInstallation
  public let source: AbletonExportSource
  public let arrangementRange: AbletonArrangementRange
  public let pcmFormat: AbletonExportPCMFormat
  public let sampleRate: AbletonExportSampleRate
  public let bitDepth: AbletonExportBitDepth
  public let normalize: Bool
  public let includeReturnAndMainEffects: Bool
  public let destination: AbletonExportDestination
  public let overwritePolicy: AbletonExportOverwritePolicy
  public let revisionReference: StudioRevisionReference?

  public init(
    setID: String,
    revisionID: String,
    workID: String? = nil,
    workName: String? = nil,
    setURL: URL,
    installation: AbletonLiveInstallation,
    source: AbletonExportSource,
    arrangementRange: AbletonArrangementRange,
    pcmFormat: AbletonExportPCMFormat,
    sampleRate: AbletonExportSampleRate,
    bitDepth: AbletonExportBitDepth,
    normalize: Bool,
    includeReturnAndMainEffects: Bool,
    destination: AbletonExportDestination,
    overwritePolicy: AbletonExportOverwritePolicy = .never,
    revisionReference: StudioRevisionReference? = nil
  ) {
    self.setID = setID
    self.revisionID = revisionID
    self.workID = workID
    self.workName = workName
    self.setURL = setURL.standardizedFileURL
    self.installation = installation
    self.source = source
    self.arrangementRange = arrangementRange
    self.pcmFormat = pcmFormat
    self.sampleRate = sampleRate
    self.bitDepth = bitDepth
    self.normalize = normalize
    self.includeReturnAndMainEffects = includeReturnAndMainEffects
    self.destination = destination
    self.overwritePolicy = overwritePolicy
    self.revisionReference = revisionReference
    id = StableID.forValue(
      [
        "ableton-export", setID, revisionID, setURL.standardizedFileURL.path,
        installation.id, source.title, String(arrangementRange.startBeat),
        String(arrangementRange.endBeat), pcmFormat.rawValue, String(sampleRate.rawValue),
        String(bitDepth.rawValue), String(normalize), String(includeReturnAndMainEffects),
        destination.directoryURL.path, destination.baseName,
        destination.expectedOutputFileNames.joined(separator: "|"), overwritePolicy.rawValue,
        revisionReference?.id ?? "legacy-unreviewed-reference",
      ].joined(separator: ":"))
  }

  public var expectedFileCount: Int? {
    if !destination.expectedOutputFileNames.isEmpty {
      return destination.expectedOutputFileNames.count
    }
    return source.expectedFileCount
  }

  public var primaryOutputURL: URL {
    destination.directoryURL.appending(
      path: "\(destination.baseName).\(pcmFormat.fileExtension)")
  }
}

public struct AbletonExportTarget: Sendable, Equatable {
  public let setID: String
  public let revisionID: String
  public let workID: String?
  public let workName: String?
  public let setURL: URL
  public let setDisplayName: String
  public let arrangementRange: AbletonArrangementRange
  public let revisionReference: StudioRevisionReference?

  public init(
    setID: String,
    revisionID: String,
    workID: String?,
    workName: String?,
    setURL: URL,
    setDisplayName: String,
    arrangementRange: AbletonArrangementRange,
    revisionReference: StudioRevisionReference? = nil
  ) {
    self.setID = setID
    self.revisionID = revisionID
    self.workID = workID
    self.workName = workName
    self.setURL = setURL.standardizedFileURL
    self.setDisplayName = setDisplayName
    self.arrangementRange = arrangementRange
    self.revisionReference = revisionReference
  }
}

public struct AbletonExportRetargeter: Sendable {
  public init() {}

  public func retarget(
    _ plan: AbletonExportPlan,
    to target: AbletonExportTarget
  ) throws -> AbletonExportPlan {
    if plan.revisionReference != nil, target.revisionReference == nil {
      throw AbletonExportPlanError.missingRevisionReference
    }
    let exportLabel: String =
      switch plan.source {
      case .main: "Master"
      case .allIndividualTracks: "Stems"
      case .selectedTracks: "Selected Tracks"
      }
    let baseName = "\(target.setDisplayName) \(exportLabel)"
    let expectedOutputFileNames =
      plan.source.expectedFileCount == 1
      ? ["\(baseName).\(plan.pcmFormat.fileExtension)"]
      : []
    let retargeted = AbletonExportPlan(
      setID: target.setID,
      revisionID: target.revisionID,
      workID: target.workID,
      workName: target.workName,
      setURL: target.setURL,
      installation: plan.installation,
      source: plan.source,
      arrangementRange: target.arrangementRange,
      pcmFormat: plan.pcmFormat,
      sampleRate: plan.sampleRate,
      bitDepth: plan.bitDepth,
      normalize: plan.normalize,
      includeReturnAndMainEffects: plan.includeReturnAndMainEffects,
      destination: AbletonExportDestination(
        directoryURL: plan.destination.directoryURL,
        baseName: baseName,
        expectedOutputFileNames: expectedOutputFileNames),
      overwritePolicy: plan.overwritePolicy,
      revisionReference: target.revisionReference)
    try AbletonExportPlanValidator().validate(retargeted)
    return retargeted
  }
}

public struct AbletonExportApproval: Codable, Sendable, Equatable {
  public let planID: String
  public let catalogueGenerationID: String?
  public let confirmedAt: Date

  public init(
    planID: String,
    catalogueGenerationID: String? = nil,
    confirmedAt: Date = Date()
  ) {
    self.planID = planID
    self.catalogueGenerationID = catalogueGenerationID
    self.confirmedAt = confirmedAt
  }

  public func isValid(for plan: AbletonExportPlan, at date: Date, maxAge: TimeInterval = 300)
    -> Bool
  {
    planID == plan.id
      && (plan.revisionReference == nil
        || catalogueGenerationID == plan.revisionReference?.catalogueGenerationID)
      && date >= confirmedAt && date.timeIntervalSince(confirmedAt) <= maxAge
  }
}

public enum AbletonExportPlanError: Error, LocalizedError, Equatable {
  case unavailableSet(URL)
  case invalidRange
  case emptySelectedTracks
  case invalidDestinationName
  case destinationUnavailable(URL)
  case destinationCollision(URL)
  case expectedOutputCountMismatch
  case missingRevisionReference
  case revisionReferenceMismatch

  public var errorDescription: String? {
    switch self {
    case .unavailableSet(let url): "The Ableton Set is unavailable at \(url.path)."
    case .invalidRange: "The Arrangement export range must have a finite end after its start."
    case .emptySelectedTracks: "Selected Tracks export requires at least one selected track."
    case .invalidDestinationName: "The export destination needs a valid filename."
    case .destinationUnavailable(let url): "The export destination is unavailable at \(url.path)."
    case .destinationCollision(let url):
      "Never overwrite is enabled and an output already exists at \(url.path)."
    case .expectedOutputCountMismatch:
      "The expected output filenames do not match the selected export source."
    case .missingRevisionReference:
      "This export has no reviewed Studio Set Revision reference. Review the current Song and Set before continuing."
    case .revisionReferenceMismatch:
      "The export fields no longer match the reviewed Studio Set Revision reference."
    }
  }
}

public struct AbletonExportPlanValidator: Sendable {
  public init() {}

  public func validate(_ plan: AbletonExportPlan, fileManager: FileManager = .default) throws {
    if let reference = plan.revisionReference {
      guard plan.workID == reference.workID,
        plan.workName == reference.displaySnapshot.workName,
        plan.revisionID == reference.revisionID,
        plan.setID == reference.setID,
        plan.setURL == reference.setURL
      else { throw AbletonExportPlanError.revisionReferenceMismatch }
    }
    guard fileManager.isReadableFile(atPath: plan.setURL.path) else {
      throw AbletonExportPlanError.unavailableSet(plan.setURL)
    }
    guard plan.arrangementRange.startBeat.isFinite,
      plan.arrangementRange.endBeat.isFinite,
      plan.arrangementRange.startBeat >= 0,
      plan.arrangementRange.endBeat > plan.arrangementRange.startBeat
    else { throw AbletonExportPlanError.invalidRange }
    if case .selectedTracks(let tracks) = plan.source, tracks.isEmpty {
      throw AbletonExportPlanError.emptySelectedTracks
    }
    let name = plan.destination.baseName.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, !name.contains("/") else {
      throw AbletonExportPlanError.invalidDestinationName
    }
    var isDirectory: ObjCBool = false
    guard
      fileManager.fileExists(atPath: plan.destination.directoryURL.path, isDirectory: &isDirectory),
      isDirectory.boolValue,
      fileManager.isWritableFile(atPath: plan.destination.directoryURL.path)
    else { throw AbletonExportPlanError.destinationUnavailable(plan.destination.directoryURL) }
    if let expected = plan.source.expectedFileCount,
      !plan.destination.expectedOutputFileNames.isEmpty,
      expected != plan.destination.expectedOutputFileNames.count
    {
      throw AbletonExportPlanError.expectedOutputCountMismatch
    }
    let expectedURLs =
      plan.destination.expectedOutputFileNames.isEmpty
      ? (plan.source.expectedFileCount == 1 ? [plan.primaryOutputURL] : [])
      : plan.destination.expectedOutputFileNames.map {
        plan.destination.directoryURL.appending(path: $0)
      }
    for outputURL in expectedURLs where fileManager.fileExists(atPath: outputURL.path) {
      throw AbletonExportPlanError.destinationCollision(outputURL)
    }
    if expectedURLs.isEmpty {
      let existing =
        (try? fileManager.contentsOfDirectory(
          at: plan.destination.directoryURL,
          includingPropertiesForKeys: [.isRegularFileKey],
          options: [.skipsHiddenFiles])) ?? []
      if let collision = existing.first(where: {
        $0.pathExtension.caseInsensitiveCompare(plan.pcmFormat.fileExtension) == .orderedSame
          || (plan.pcmFormat == .aiff
            && $0.pathExtension.caseInsensitiveCompare("aif") == .orderedSame)
      }) {
        throw AbletonExportPlanError.destinationCollision(collision)
      }
    }
  }

  public func validate(
    _ plan: AbletonExportPlan,
    in catalog: WorkCatalog,
    catalogueGenerationID: String? = nil,
    fileManager: FileManager = .default
  ) throws {
    guard let reference = plan.revisionReference else {
      throw AbletonExportPlanError.missingRevisionReference
    }
    _ = try StudioRevisionReferenceResolver().resolve(
      reference, in: catalog, catalogueGenerationID: catalogueGenerationID)
    try validate(plan, fileManager: fileManager)
  }
}
