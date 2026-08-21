import Foundation

public struct LogicProSessionAdapter: DAWSessionAdapter, @unchecked Sendable {
  public let daw = DAWKind.logicPro
  public let capabilities = DAWCapabilities(
    discoversSessions: true,
    readsStaticMetadata: true,
    resolvesAudioReferences: true,
    readsTrackStructure: false,
    readsDeviceChains: false,
    requestsAuthoritativeRender: false
  )

  private let fileManager: FileManager

  public init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
  }

  public func discover(in rootURL: URL) throws -> DAWDiscoveryResult {
    let packages = try logicPackages(in: rootURL.standardizedFileURL)
    var sessions: [DiscoveredDAWSession] = []
    var issues: [DAWAdapterIssue] = []

    for package in packages {
      do {
        sessions.append(try inspect(package: package))
      } catch {
        issues.append(
          DAWAdapterIssue(
            id: StableID.forValue("logic-issue:\(package.path):\(error.localizedDescription)"),
            daw: .logicPro,
            fileURL: package,
            message: error.localizedDescription
          ))
      }
    }

    return DAWDiscoveryResult(
      sessions: sessions.sorted {
        $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending
      },
      issues: issues.sorted { $0.fileURL.path < $1.fileURL.path }
    )
  }

  private func logicPackages(in rootURL: URL) throws -> [URL] {
    if rootURL.pathExtension.caseInsensitiveCompare("logicx") == .orderedSame {
      return [rootURL]
    }

    guard
      let enumerator = fileManager.enumerator(
        at: rootURL,
        includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
        options: [.skipsHiddenFiles]
      )
    else {
      throw CocoaError(.fileReadNoSuchFile)
    }

    var packages: [URL] = []
    for case let url as URL in enumerator {
      let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
      if values?.isSymbolicLink == true {
        if values?.isDirectory == true { enumerator.skipDescendants() }
        continue
      }
      guard url.pathExtension.caseInsensitiveCompare("logicx") == .orderedSame else { continue }
      packages.append(url.standardizedFileURL)
      if values?.isDirectory == true { enumerator.skipDescendants() }
    }
    return packages
  }

  private func inspect(package: URL) throws -> DiscoveredDAWSession {
    let projectInformationURL = package.appending(path: "Resources/ProjectInformation.plist")
    let projectInformation = try readDictionary(at: projectInformationURL)
    let alternativesRoot = package.appending(path: "Alternatives", directoryHint: .isDirectory)
    let alternativeURLs = try directoryURLs(at: alternativesRoot)
    guard !alternativeURLs.isEmpty else {
      throw LogicProAdapterError.noAlternatives(package)
    }

    let packageName = package.deletingPathExtension().lastPathComponent
    let variantNames = stringDictionary(projectInformation["VariantNames"])
    let variantNamesV2 = stringDictionary(projectInformation["VariantNamesV2"])
    var revisions: [DAWSessionRevision] = []
    var previewImageURL: URL?

    for alternativeURL in alternativeURLs {
      let alternativeKey = normalizedAlternativeKey(alternativeURL.lastPathComponent)
      let configuredName =
        usefulVariantName(variantNames[alternativeKey])
        ?? usefulVariantName(variantNamesV2[alternativeKey])
      let alternativeName =
        configuredName
        ?? (alternativeKey == "0" ? packageName : "Alternative \(alternativeURL.lastPathComponent)")

      let headMetadataURL = alternativeURL.appending(path: "MetaData.plist")
      if fileManager.fileExists(atPath: headMetadataURL.path) {
        revisions.append(
          try makeRevision(
            package: package,
            containerURL: alternativeURL,
            metadataURL: headMetadataURL,
            displayName: alternativeName,
            kind: .alternativeHead
          ))
      }

      let candidatePreview = alternativeURL.appending(path: "WindowImage.jpg")
      if previewImageURL == nil, fileManager.fileExists(atPath: candidatePreview.path) {
        previewImageURL = candidatePreview
      }

      let backupsRoot = alternativeURL.appending(
        path: "Project File Backups", directoryHint: .isDirectory)
      for backupURL in (try? directoryURLs(at: backupsRoot)) ?? [] {
        let metadataURL = backupURL.appending(path: "MetaData.plist")
        guard fileManager.fileExists(atPath: metadataURL.path) else { continue }
        revisions.append(
          try makeRevision(
            package: package,
            containerURL: backupURL,
            metadataURL: metadataURL,
            displayName: "\(alternativeName) · Backup \(backupURL.lastPathComponent)",
            kind: .backup
          ))
      }
    }

    guard !revisions.isEmpty else {
      throw LogicProAdapterError.noReadableRevisions(package)
    }

    return DiscoveredDAWSession(
      id: StableID.forURL(package),
      daw: .logicPro,
      rootURL: package,
      displayName: packageName,
      creatorVersion: projectInformation["LastSavedFrom"] as? String,
      previewImageURL: previewImageURL,
      revisions: revisions.sorted(by: revisionSort)
    )
  }

  private func makeRevision(
    package: URL,
    containerURL: URL,
    metadataURL: URL,
    displayName: String,
    kind: DAWRevisionKind
  ) throws -> DAWSessionRevision {
    let dictionary = try readDictionary(at: metadataURL)
    let projectDataURL = containerURL.appending(path: "ProjectData")
    let revisionURL =
      fileManager.fileExists(atPath: projectDataURL.path)
      ? projectDataURL
      : metadataURL
    let numerator = integer(dictionary["SongSignatureNumerator"])
    let denominator = integer(dictionary["SongSignatureDenominator"])
    let signature: SetTimeSignature? = numerator.flatMap { numerator in
      denominator.flatMap { denominator in
        guard numerator > 0, denominator > 0 else { return nil }
        return SetTimeSignature(numerator: numerator, denominator: denominator)
      }
    }
    let metadata = SessionProjectMetadata(
      tempo: double(dictionary["BeatsPerMinute"]),
      trackCount: integer(dictionary["NumberOfTracks"]),
      sampleRate: double(dictionary["SampleRate"]),
      key: musicalKey(dictionary),
      timeSignature: signature
    )
    let usedPaths = dictionary["AudioFiles"] as? [String] ?? []
    let unusedPaths = dictionary["UnusedAudioFiles"] as? [String] ?? []
    let inspection = DAWSessionInspection(
      provenance: .nativeStatic,
      sourceURL: metadataURL,
      metadata: metadata,
      audioReferences: usedPaths.map { audioReference(path: $0, package: package) },
      unusedAudioReferences: unusedPaths.map { audioReference(path: $0, package: package) }
    )
    let modifiedAt = (try? revisionURL.resourceValues(forKeys: [.contentModificationDateKey]))?
      .contentModificationDate
    return DAWSessionRevision(
      id: StableID.forURL(revisionURL),
      fileURL: revisionURL,
      displayName: displayName,
      kind: kind,
      modifiedAt: modifiedAt,
      inspection: inspection
    )
  }

  private func audioReference(path: String, package: URL) -> DAWAudioReference {
    let expandedPath = NSString(string: path).expandingTildeInPath
    let candidates: [URL]
    if expandedPath.hasPrefix("/") {
      candidates = [URL(fileURLWithPath: expandedPath)]
    } else {
      // Folder-organised Logic projects keep Audio Files beside the .logicx document, while
      // package-organised projects can keep them inside the package. Preserve both possibilities.
      candidates = [
        package.deletingLastPathComponent().appending(path: expandedPath),
        package.appending(path: "Media").appending(path: expandedPath),
        package.appending(path: expandedPath),
      ]
    }
    let resolved = candidates.first(where: { fileManager.fileExists(atPath: $0.path) })
    return DAWAudioReference(
      relativePath: path,
      resolvedURL: resolved ?? candidates.first,
      availability: resolved == nil ? .missing : .available
    )
  }

  private func directoryURLs(at rootURL: URL) throws -> [URL] {
    let values = try fileManager.contentsOfDirectory(
      at: rootURL,
      includingPropertiesForKeys: [.isDirectoryKey],
      options: [.skipsHiddenFiles]
    )
    return values.filter {
      (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
    }.sorted {
      $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending
    }
  }

  private func readDictionary(at url: URL) throws -> [String: Any] {
    guard fileManager.fileExists(atPath: url.path) else {
      throw LogicProAdapterError.missingMetadata(url)
    }
    let data = try Data(contentsOf: url)
    let value = try PropertyListSerialization.propertyList(from: data, options: [], format: nil)
    guard let dictionary = value as? [String: Any] else {
      throw LogicProAdapterError.invalidMetadata(url)
    }
    return dictionary
  }

  private func stringDictionary(_ value: Any?) -> [String: String] {
    guard let dictionary = value as? [String: Any] else {
      return value as? [String: String] ?? [:]
    }
    return dictionary.compactMapValues { $0 as? String }
  }

  private func normalizedAlternativeKey(_ value: String) -> String {
    Int(value).map(String.init) ?? value
  }

  private func usefulVariantName(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, trimmed != "{PROJECT_NAME}" else { return nil }
    return trimmed
  }

  private func integer(_ value: Any?) -> Int? {
    (value as? NSNumber)?.intValue ?? (value as? String).flatMap(Int.init)
  }

  private func double(_ value: Any?) -> Double? {
    (value as? NSNumber)?.doubleValue ?? (value as? String).flatMap(Double.init)
  }

  private func musicalKey(_ dictionary: [String: Any]) -> String? {
    guard let root = usefulVariantName(dictionary["SongKey"] as? String) else { return nil }
    guard let gender = usefulVariantName(dictionary["SongGenderKey"] as? String) else {
      return root
    }
    return "\(root) \(gender)"
  }

  private func revisionSort(_ lhs: DAWSessionRevision, _ rhs: DAWSessionRevision) -> Bool {
    if lhs.kind != rhs.kind {
      return lhs.kind == .alternativeHead
    }
    switch (lhs.modifiedAt, rhs.modifiedAt) {
    case (let left?, let right?): return left > right
    case (_?, nil): return true
    case (nil, _?): return false
    case (nil, nil):
      return lhs.displayName.localizedStandardCompare(rhs.displayName) == .orderedAscending
    }
  }
}

private enum LogicProAdapterError: LocalizedError {
  case noAlternatives(URL)
  case noReadableRevisions(URL)
  case missingMetadata(URL)
  case invalidMetadata(URL)

  var errorDescription: String? {
    switch self {
    case .noAlternatives(let url):
      "Logic project has no Alternatives directory: \(url.path)"
    case .noReadableRevisions(let url):
      "Logic project has no readable alternative metadata: \(url.path)"
    case .missingMetadata(let url):
      "Logic metadata is missing: \(url.path)"
    case .invalidMetadata(let url):
      "Logic metadata is not a property-list dictionary: \(url.path)"
    }
  }
}
