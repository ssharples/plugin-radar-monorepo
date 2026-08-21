import Foundation

public struct SampleLibraryIndexer: @unchecked Sendable {
  public static let supportedExtensions: Set<String> = [
    "aif", "aiff", "flac", "m4a", "mp3", "ogg", "wav",
  ]

  private let fileManager: FileManager
  private let metadataReader: SampleMetadataReader

  public init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
    metadataReader = SampleMetadataReader()
  }

  public func scan(
    location: SampleLocation,
    projectRoots: [URL],
    database: SampleLibraryDatabase
  ) throws -> SampleIndexingStatistics {
    let startedAt = Date()
    let keys: [URLResourceKey] = [
      .isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey,
      .contentModificationDateKey, .creationDateKey, .fileResourceIdentifierKey,
    ]
    guard
      let enumerator = fileManager.enumerator(
        at: location.fileURL,
        includingPropertiesForKeys: keys,
        options: [.skipsHiddenFiles, .skipsPackageDescendants],
        errorHandler: { _, _ in true })
    else {
      throw CocoaError(.fileReadNoSuchFile)
    }

    let existingIDs = try database.allSampleIDsByPath()
    var seen = Set<String>()
    var discovered = 0
    var metadataReads = 0
    var reused = 0
    let locationPath = location.fileURL.standardizedFileURL.path

    for case let fileURL as URL in enumerator {
      let ext = fileURL.pathExtension.lowercased()
      guard Self.supportedExtensions.contains(ext) else { continue }
      let values = try? fileURL.resourceValues(forKeys: Set(keys))
      guard values?.isRegularFile == true, values?.isSymbolicLink != true else { continue }
      discovered += 1
      let path = fileURL.resolvingSymlinksInPath().standardizedFileURL.path
      let size = Int64(values?.fileSize ?? 0)
      let modified = values?.contentModificationDate
      if let fingerprint = try database.fingerprint(forPath: path),
        fingerprint.bytes == size,
        Self.sameTimestamp(fingerprint.modifiedAt, modified),
        let id = existingIDs[path]
      {
        try database.addMembership(locationID: location.id, sampleID: id)
        seen.insert(id)
        reused += 1
        continue
      }

      let metadata = try metadataReader.read(fileURL)
      metadataReads += 1
      let relative =
        path.hasPrefix(locationPath + "/")
        ? String(path.dropFirst(locationPath.count + 1)) : fileURL.lastPathComponent
      let firstComponent = relative.split(separator: "/").first.map(String.init)
      let packName =
        firstComponent == fileURL.lastPathComponent
        ? location.displayName : (firstComponent ?? location.displayName)
      let classification = SamplePathClassifier.classify(
        fileURL, projectRoots: projectRoots, selectedLocation: location.fileURL)
      let id = try database.upsertSample(
        SampleResourceSeed(
          fileURL: fileURL, name: fileURL.lastPathComponent,
          locationName: location.displayName, packName: packName,
          classification: classification.0, classificationExplanation: classification.1,
          availability: .available, metadata: metadata),
        locationID: location.id)
      seen.insert(id)
    }

    let completedAt = Date()
    let removed = try database.completeScan(
      locationID: location.id, seenSampleIDs: seen, completedAt: completedAt)
    return SampleIndexingStatistics(
      discoveredFileCount: discovered, metadataReadCount: metadataReads,
      reusedMetadataCount: reused, removedMembershipCount: removed,
      startedAt: startedAt, completedAt: completedAt)
  }

  private static func sameTimestamp(_ left: Date?, _ right: Date?) -> Bool {
    switch (left, right) {
    case (nil, nil): true
    case (let left?, let right?):
      abs(left.timeIntervalSince1970 - right.timeIntervalSince1970) < 0.001
    default: false
    }
  }
}
