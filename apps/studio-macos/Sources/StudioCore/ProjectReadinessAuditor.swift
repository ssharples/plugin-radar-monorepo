import Foundation

protocol ProjectMediaFileValidating: Sendable {
  func validate(_ fileURL: URL) -> ProjectEmbeddedFileValidationStatus
}

struct ProjectMediaFileValidator: ProjectMediaFileValidating {
  var duringRead: @Sendable (URL) throws -> Void = { _ in }

  func validate(_ fileURL: URL) -> ProjectEmbeddedFileValidationStatus {
    let url = fileURL.standardizedFileURL
    guard FileManager.default.fileExists(atPath: url.path) else { return .missing }
    guard let before = snapshot(url) else { return .unreadable }
    guard before.type == .typeRegular else { return .notRegularFile }
    guard before.bytes > 0 else { return .empty }
    do {
      let handle = try FileHandle(forReadingFrom: url)
      defer { try? handle.close() }
      guard try handle.read(upToCount: 1)?.isEmpty == false else { return .unreadable }
      try duringRead(url)
    } catch {
      return .unreadable
    }
    guard let after = snapshot(url), before == after else { return .changedDuringAudit }
    return .verified
  }

  private struct Snapshot: Equatable {
    let type: FileAttributeType
    let bytes: Int64
    let modifiedAtNanoseconds: Int64?
    let fileNumber: UInt64?
    let systemNumber: UInt64?
    let permissions: Int?
  }

  private func snapshot(_ url: URL) -> Snapshot? {
    guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
      let type = attributes[.type] as? FileAttributeType
    else { return nil }
    return Snapshot(
      type: type,
      bytes: (attributes[.size] as? NSNumber)?.int64Value ?? 0,
      modifiedAtNanoseconds: (attributes[.modificationDate] as? Date).map {
        Int64($0.timeIntervalSince1970 * 1_000_000_000)
      },
      fileNumber: (attributes[.systemFileNumber] as? NSNumber)?.uint64Value,
      systemNumber: (attributes[.systemNumber] as? NSNumber)?.uint64Value,
      permissions: (attributes[.posixPermissions] as? NSNumber)?.intValue
    )
  }
}

public struct ProjectReadinessAuditor {
  private let fileManager: FileManager
  private let fallbackFileVerifier: any ProjectFallbackFileVerifying
  private let mediaFileValidator: any ProjectMediaFileValidating

  public init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
    fallbackFileVerifier = ProjectFallbackFileVerifier()
    mediaFileValidator = ProjectMediaFileValidator()
  }

  init(
    fileManager: FileManager = .default,
    fallbackFileVerifier: any ProjectFallbackFileVerifying,
    mediaFileValidator: any ProjectMediaFileValidating = ProjectMediaFileValidator()
  ) {
    self.fileManager = fileManager
    self.fallbackFileVerifier = fallbackFileVerifier
    self.mediaFileValidator = mediaFileValidator
  }

  public func audit(
    plan: ProjectHandoffPlan,
    set: AbletonSet,
    in catalog: WorkCatalog,
    catalogueGenerationID: String? = nil,
    pluginInventory: PluginInventory,
    managedLibraryInventory: ProjectManagedLibraryInventory = .unknown,
    availableDiskBytes: Int64?,
    fallbackEvidence: [ProjectFallbackAudioEvidence] = [],
    auditedAt: Date = Date()
  ) throws -> ProjectReadinessAudit {
    let referenceValidator = ProjectHandoffReferenceValidator()
    _ = try referenceValidator.validate(
      plan: plan, in: catalog, catalogueGenerationID: catalogueGenerationID)
    try referenceValidator.validate(set: set, for: plan)

    let reviewedProjectRoot = plan.sourceProjectURL.resolvingSymlinksInPath().standardizedFileURL
    let (projectRoot, projectInfo) = resolvedProjectRoot(
      reviewedProjectRoot: reviewedProjectRoot,
      setURL: plan.sourceSetURL
    )
    let sourceSetObservation = observeSourceSet(at: plan.sourceSetURL)

    let media = set.content.dependencies.map {
      classify($0, projectRoot: projectRoot, setURL: plan.sourceSetURL)
    }

    let knownTrackIDs = Set(set.content.tracks.map(\.id))
    let requestedFallbackTracks = Set(plan.selectedTrackIDs)
    let verifiedFallbackAudio: [ProjectVerifiedFallbackAudio] =
      plan.fallbackPolicy.mode == .requireExistingAudio
      ? fallbackEvidence.compactMap { evidence in
        guard requestedFallbackTracks.contains(evidence.trackID),
          knownTrackIDs.contains(evidence.trackID)
        else { return nil }
        guard
          let observation = try? fallbackFileVerifier.verify(
            fileURL: evidence.fileURL,
            inside: projectRoot
          )
        else { return nil }
        return ProjectVerifiedFallbackAudio(
          trackID: evidence.trackID,
          relativePath: observation.relativePath,
          bytes: observation.bytes,
          sha256: observation.sha256
        )
      }
      : []
    var verifiedFallbackByTrack: [String: ProjectVerifiedFallbackAudio] = [:]
    for evidence in verifiedFallbackAudio.sorted(by: { $0.relativePath < $1.relativePath }) {
      if verifiedFallbackByTrack[evidence.trackID] == nil {
        verifiedFallbackByTrack[evidence.trackID] = evidence
      }
    }
    let verifiedFallbacks = verifiedFallbackByTrack.values.sorted { $0.trackID < $1.trackID }
    let verifiedFallbackTracks = Set(verifiedFallbacks.map(\.trackID))

    let compatibility = PluginCompatibilityEvaluator().evaluate(
      set: set,
      inventory: pluginInventory
    )
    let tracksByDevice = tracksByDeviceID(set.content.tracks)
    let pluginRequirements = compatibility.evidence.map { evidence in
      let tracks = tracksByDevice[evidence.deviceID] ?? []
      let managedLibrary = managedLibraryEvidence(
        for: evidence.requiredPlugin,
        inventory: managedLibraryInventory
      )
      return ProjectPluginRequirement(
        id: evidence.id,
        name: evidence.requiredPlugin.name ?? "Unknown plug-in",
        manufacturer: evidence.requiredPlugin.manufacturer,
        format: evidence.requiredPlugin.format,
        requiredVersion: evidence.requiredPlugin.version,
        trackNames: tracks.map(\.name),
        trackIDs: tracks.map(\.id),
        senderStatus: evidence.status,
        installedVersion: evidence.installedPlugin?.version,
        managedLibraryStatus: managedLibrary.status,
        managedLibraryEvidence: managedLibrary.explanation,
        fallbackAvailable: !tracks.isEmpty
          && Set(tracks.map(\.id)).isSubset(of: verifiedFallbackTracks)
      )
    }

    let allDevices = set.content.tracks.flatMap { track in flatten(track.devices) }
    let maxDevices = allDevices.filter { $0.kind == .maxForLive }
    let nativeNames = Set(
      allDevices.filter { $0.kind == .native }.map(\.displayName).filter { !$0.isEmpty }
    )
    let maxNames = Set(maxDevices.map(\.displayName).filter { !$0.isEmpty })
    let packNames = inferredPackNames(set: set)
    let live = ProjectLiveRequirement(
      creator: set.creator,
      version: parseLiveVersion(set.creator),
      edition: parseLiveEdition(set.creator),
      requiresMaxForLive: !maxDevices.isEmpty,
      maxForLiveDeviceCount: maxDevices.count,
      maxForLiveDeviceNames: Array(maxNames),
      nativeDeviceNames: Array(nativeNames),
      packNames: packNames
    )

    var risks =
      mediaRisks(media) + pluginRisks(pluginRequirements)
      + pluginLibraryRisks(pluginRequirements)
    risks += projectBoundaryRisks(projectInfo, projectRoot: projectRoot)

    if hasSourceSetMismatch(
      plan: plan, set: set, projectRoot: projectRoot, observation: sourceSetObservation)
    {
      risks.append(
        ProjectHandoffRisk(
          id: "source-set-mismatch",
          kind: .sourceSetMismatch,
          severity: .blocking,
          summary: sourceSetMismatchSummary(
            plan: plan,
            set: set,
            observation: sourceSetObservation
          )
        )
      )
    }
    if live.requiresMaxForLive {
      let names =
        live.maxForLiveDeviceNames.isEmpty
        ? "" : " (\(live.maxForLiveDeviceNames.joined(separator: ", ")))"
      risks.append(
        ProjectHandoffRisk(
          id: "max-for-live",
          kind: .maxForLiveRequirement,
          severity: .warning,
          summary:
            "This Set uses Max for Live devices\(names); the recipient needs a compatible Live edition and those devices."
        )
      )
    }

    let estimatedBytes = estimatedStagedBytes(
      set: set,
      projectRoot: projectRoot,
      dependencies: set.content.dependencies
    )
    let destinationCapacityStatus: ProjectDestinationCapacityStatus
    if let availableDiskBytes, availableDiskBytes < estimatedBytes {
      destinationCapacityStatus = .insufficient
      risks.append(
        ProjectHandoffRisk(
          id: "disk-space",
          kind: .insufficientDiskSpace,
          severity: .blocking,
          summary:
            "The staging destination does not have enough known free space (\(availableDiskBytes) bytes free for \(estimatedBytes) bytes)."
        )
      )
    } else if availableDiskBytes == nil {
      destinationCapacityStatus = .unknown
      risks.append(
        ProjectHandoffRisk(
          id: "disk-space-unknown",
          kind: .unknownDiskSpace,
          severity: .warning,
          summary:
            "Free space at the reviewed staging destination is unknown; capacity must be confirmed before staging."
        )
      )
    } else {
      destinationCapacityStatus = .sufficient
    }
    if plan.fallbackPolicy.mode == .requireExistingAudio,
      requestedFallbackTracks.isEmpty
        || !requestedFallbackTracks.isSubset(of: verifiedFallbackTracks)
    {
      risks.append(
        ProjectHandoffRisk(
          id: "fallback-not-audited",
          kind: .missingFallback,
          severity: .blocking,
          summary: "Requested fallback audio has not been verified by this read-only audit."
        )
      )
    }

    let boundaryEvidence = buildBoundaryEvidence(
      plan: plan,
      media: media,
      pluginRequirements: pluginRequirements,
      live: live,
      projectInfo: projectInfo,
      projectRoot: projectRoot,
      reviewedProjectRoot: reviewedProjectRoot,
      risks: risks
    )

    let mediaBlockingKinds: Set<ProjectHandoffRiskKind> = [
      .sourceSetMismatch, .projectBoundaryConflict, .missingMedia, .disconnectedMedia,
      .unresolvedMedia, .externalMedia, .symlinkEscapedMedia, .cloudPlaceholderMedia,
      .permissionBlockedMedia, .removableVolumeMedia, .invalidEmbeddedMedia, .unknownMedia,
      .insufficientDiskSpace,
    ]
    let mediaBlocking = risks.contains { risk in
      risk.severity == .blocking && mediaBlockingKinds.contains(risk.kind)
    }
    let mediaAssurance = ProjectHandoffAssuranceItem(
      status: mediaBlocking ? .needsAttention : .availableAtSource,
      summary: mediaBlocking
        ? "Ableton-visible media or project-boundary evidence needs attention before handoff."
        : "\(boundaryEvidence.sourceContainmentSummary) \(boundaryEvidence.portabilitySummary)"
    )
    let pluginAssurance = ProjectHandoffAssuranceItem(
      status: .documented,
      summary:
        pluginRequirements.isEmpty && !live.requiresMaxForLive && live.packNames.isEmpty
        ? "No third-party plug-ins, Ableton Packs, or Max for Live requirements were identified."
        : "Ableton devices, Packs, Max for Live devices, and third-party plug-ins are documented; portability to another Mac is not proven by this audit."
    )
    let fallbackAssurance: ProjectHandoffAssuranceItem =
      switch plan.fallbackPolicy.mode {
      case .none:
        ProjectHandoffAssuranceItem(
          status: .notRequested,
          summary: "No fallback audio was requested or created."
        )
      case .requireExistingAudio:
        !requestedFallbackTracks.isEmpty
          && requestedFallbackTracks.isSubset(of: verifiedFallbackTracks)
          ? ProjectHandoffAssuranceItem(
            status: .included,
            summary:
              "Existing fallback audio is present inside the source Project for every requested track."
          )
          : ProjectHandoffAssuranceItem(
            status: .needsAttention,
            summary: "Requested fallback audio has not been verified."
          )
      }

    let status: ProjectHandoffStatus
    if risks.contains(where: { $0.severity == .blocking }) {
      status = .needsAttention
    } else if risks.contains(where: { $0.severity == .warning })
      || !boundaryEvidence.portableToAnotherMac
    {
      status = .readyWithLimitations
    } else {
      status = .ready
    }

    return ProjectReadinessAudit(
      planID: plan.id,
      planFingerprint: plan.fingerprint,
      workID: plan.workID,
      sessionID: plan.sessionID,
      revisionID: plan.revisionID,
      setDisplayName: set.displayName,
      sourceModifiedAt: set.modifiedAt,
      auditedAt: auditedAt,
      estimatedStagedBytes: estimatedBytes,
      availableDiskBytes: availableDiskBytes,
      destinationCapacityStatus: destinationCapacityStatus,
      boundaryEvidence: boundaryEvidence,
      mediaRequirements: media,
      pluginRequirements: pluginRequirements,
      verifiedFallbackAudio: verifiedFallbacks,
      liveRequirement: live,
      risks: risks,
      assurance: ProjectHandoffAssurance(
        media: mediaAssurance,
        plugins: pluginAssurance,
        fallbackAudio: fallbackAssurance
      ),
      status: status
    )
  }

  private func classify(
    _ dependency: MediaDependency,
    projectRoot: URL,
    setURL: URL
  ) -> ProjectMediaRequirement {
    let displayName = displayName(for: dependency)
    let lexicalURL =
      dependency.resolvedURL?.standardizedFileURL
      ?? candidateURL(for: dependency, setURL: setURL, projectRoot: projectRoot)
    let canonicalURL = lexicalURL?.resolvingSymlinksInPath().standardizedFileURL
    let lexicalInsideProject = lexicalURL.map { lexicalDescendant($0, of: projectRoot) } ?? false
    let canonicalInsideProject = canonicalURL.map { isDescendant($0, of: projectRoot) } ?? false
    let observedVolumeState = volumeState(
      for: canonicalURL ?? lexicalURL,
      availability: dependency.availability
    )

    let location: ProjectMediaLocation
    let fileValidation: ProjectEmbeddedFileValidationStatus
    let evidence: String

    switch dependency.availability {
    case .missing:
      location = .missing
      fileValidation = .missing
      evidence =
        "No readable file was found for \(pathEvidence(for: lexicalURL, dependency: dependency))."
    case .disconnected:
      location = .disconnected
      fileValidation = .notValidated
      evidence =
        "The reference points to a currently disconnected volume: \(pathEvidence(for: lexicalURL, dependency: dependency))."
    case .unresolved:
      location = .unknown
      fileValidation = .notValidated
      evidence = "The media reference could not be resolved from the encoded paths."
    case .available:
      if let lexicalURL, isCloudPlaceholder(lexicalURL) {
        location = .cloudPlaceholder
        fileValidation = .notValidated
        evidence =
          "The reference resolves to a cloud placeholder: \(pathEvidence(for: lexicalURL, dependency: dependency))."
      } else if lexicalInsideProject, canonicalInsideProject == false {
        location = .symlinkEscaped
        fileValidation = canonicalURL.map(mediaFileValidator.validate) ?? .notValidated
        evidence =
          "The Project path resolves through a symlink to a location outside the Project: \(pathEvidence(for: lexicalURL, dependency: dependency))."
      } else {
        fileValidation =
          (canonicalURL ?? lexicalURL).map(mediaFileValidator.validate) ?? .notValidated
        switch fileValidation {
        case .missing:
          location = observedVolumeState == .offline ? .removableVolumeDependent : .missing
          evidence =
            observedVolumeState == .offline
            ? "The reference is on a currently offline volume: \(pathEvidence(for: lexicalURL, dependency: dependency))."
            : "The media was marked available, but no file exists at \(pathEvidence(for: lexicalURL, dependency: dependency))."
        case .unreadable:
          location = .permissionBlocked
          evidence =
            "The reference exists but cannot be read with current permissions: \(pathEvidence(for: lexicalURL, dependency: dependency))."
        case .empty:
          location = .invalidEmbeddedFile
          evidence =
            "The referenced media file is empty: \(pathEvidence(for: lexicalURL, dependency: dependency))."
        case .notRegularFile:
          location = .invalidEmbeddedFile
          evidence =
            "The referenced media is not a direct regular file: \(pathEvidence(for: lexicalURL, dependency: dependency))."
        case .changedDuringAudit:
          location = .invalidEmbeddedFile
          evidence =
            "The referenced media changed during the read-only audit: \(pathEvidence(for: lexicalURL, dependency: dependency))."
        case .verified:
          if canonicalInsideProject {
            location = .containedInProject
            evidence =
              "The reference is a readable, non-empty file inside the source Project: \(canonicalURL?.lastPathComponent ?? displayName)."
          } else if observedVolumeState == .availableRemovable {
            location = .removableVolumeDependent
            evidence =
              "The readable reference depends on a removable volume: \(pathEvidence(for: lexicalURL, dependency: dependency))."
          } else {
            location = .external
            evidence =
              "The readable reference resolves outside the source Project: \(pathEvidence(for: canonicalURL ?? lexicalURL, dependency: dependency))."
          }
        case .notValidated:
          location = .unknown
          evidence = "The media was marked available but no local file could be validated."
        }
      }
    }

    return ProjectMediaRequirement(
      id: dependency.id,
      kind: dependency.kind,
      displayName: displayName,
      ownerID: dependency.ownerID,
      availability: dependency.availability,
      location: location,
      volumeState: observedVolumeState,
      fileValidation: fileValidation,
      resolvedPath: (canonicalURL ?? lexicalURL)?.path,
      evidence: evidence
    )
  }

  private func displayName(for dependency: MediaDependency) -> String {
    if let relativePath = dependency.reference.relativePath, !relativePath.isEmpty {
      return URL(fileURLWithPath: relativePath).lastPathComponent
    }
    if let absolutePath = dependency.reference.absolutePath, !absolutePath.isEmpty {
      return URL(fileURLWithPath: absolutePath).lastPathComponent
    }
    return "Unresolved media"
  }

  private func mediaRisks(_ requirements: [ProjectMediaRequirement]) -> [ProjectHandoffRisk] {
    requirements.compactMap { requirement in
      let kind: ProjectHandoffRiskKind
      switch requirement.location {
      case .containedInProject:
        return nil
      case .missing:
        kind = .missingMedia
      case .disconnected:
        kind = .disconnectedMedia
      case .external:
        kind = .externalMedia
      case .symlinkEscaped:
        kind = .symlinkEscapedMedia
      case .cloudPlaceholder:
        kind = .cloudPlaceholderMedia
      case .permissionBlocked:
        kind = .permissionBlockedMedia
      case .removableVolumeDependent:
        kind = .removableVolumeMedia
      case .invalidEmbeddedFile:
        kind = .invalidEmbeddedMedia
      case .unknown:
        kind = .unknownMedia
      }
      return ProjectHandoffRisk(
        id: "media-\(requirement.id)",
        kind: kind,
        severity: .blocking,
        summary: "\(requirement.displayName): \(requirement.evidence)"
      )
    }
  }

  private func pluginRisks(_ requirements: [ProjectPluginRequirement]) -> [ProjectHandoffRisk] {
    requirements.compactMap { requirement in
      switch requirement.senderStatus {
      case .installed:
        return nil
      case .missing:
        return ProjectHandoffRisk(
          id: "plugin-missing-\(requirement.id)",
          kind: .missingPlugin,
          severity: .warning,
          summary: "No matching sender-side installation was found for \(requirement.name)."
        )
      case .versionMismatch:
        return ProjectHandoffRisk(
          id: "plugin-version-\(requirement.id)",
          kind: .pluginVersionMismatch,
          severity: .warning,
          summary: "The installed version differs from the version encoded for \(requirement.name)."
        )
      case .unknown:
        return ProjectHandoffRisk(
          id: "plugin-unknown-\(requirement.id)",
          kind: .unscannedPluginFormat,
          severity: .warning,
          summary: "The sender-side availability of \(requirement.name) is unknown."
        )
      }
    }
  }

  private func pluginLibraryRisks(_ requirements: [ProjectPluginRequirement])
    -> [ProjectHandoffRisk]
  {
    requirements.compactMap { requirement in
      switch requirement.managedLibraryStatus {
      case .notDetected:
        return nil
      case .known:
        return ProjectHandoffRisk(
          id: "plugin-library-\(requirement.id)",
          kind: .pluginManagedLibrary,
          severity: .warning,
          summary:
            "\(requirement.name) has an explicitly identified managed-library dependency: \(requirement.managedLibraryEvidence)"
        )
      case .unknown:
        return ProjectHandoffRisk(
          id: "plugin-library-unknown-\(requirement.id)",
          kind: .pluginManagedLibrary,
          severity: .warning,
          summary:
            "Managed-library status is unknown for \(requirement.name): \(requirement.managedLibraryEvidence)"
        )
      }
    }
  }

  private func managedLibraryEvidence(
    for plugin: PluginIdentity,
    inventory: ProjectManagedLibraryInventory
  ) -> (status: ProjectManagedLibraryStatus, explanation: String) {
    let matches = inventory.records.filter { record in
      if let format = record.format, format != plugin.format { return false }
      if let identifier = record.pluginIdentifier {
        return normalizePluginEvidence(identifier)
          == normalizePluginEvidence(plugin.identifier ?? "")
      }
      guard let name = record.pluginName,
        normalizePluginEvidence(name) == normalizePluginEvidence(plugin.name ?? "")
      else { return false }
      if let manufacturer = record.manufacturer {
        return normalizePluginEvidence(manufacturer)
          == normalizePluginEvidence(plugin.manufacturer ?? "")
      }
      return true
    }
    guard matches.count == 1, let match = matches.first else {
      let explanation =
        matches.isEmpty
        ? "No explicit managed-library inventory record matched this plug-in requirement."
        : "Conflicting managed-library inventory records matched this plug-in requirement."
      return (.unknown, explanation)
    }
    return (match.status, match.explanation)
  }

  private func normalizePluginEvidence(_ value: String) -> String {
    value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
      .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func projectBoundaryRisks(
    _ projectInfo: AbletonProjectInfoInspection,
    projectRoot: URL
  ) -> [ProjectHandoffRisk] {
    switch projectInfo.status {
    case .intact:
      return []
    case .missing:
      return [
        ProjectHandoffRisk(
          id: "project-boundary-missing",
          kind: .projectBoundaryConflict,
          severity: .blocking,
          summary:
            "Project boundary conflict: the source Project does not contain a top-level Ableton Project Info directory."
        )
      ]
    case .conflicting:
      let rel = projectInfo.projectInfoURLs.map {
        projectInfoEvidencePath(from: projectRoot, to: $0)
      }
      return [
        ProjectHandoffRisk(
          id: "project-boundary-conflict",
          kind: .projectBoundaryConflict,
          severity: .blocking,
          summary:
            "Project boundary conflict: expected one top-level Ableton Project Info directory, found \(rel.joined(separator: ", "))."
        )
      ]
    }
  }

  private func buildBoundaryEvidence(
    plan: ProjectHandoffPlan,
    media: [ProjectMediaRequirement],
    pluginRequirements: [ProjectPluginRequirement],
    live: ProjectLiveRequirement,
    projectInfo: AbletonProjectInfoInspection,
    projectRoot: URL,
    reviewedProjectRoot: URL,
    risks: [ProjectHandoffRisk]
  ) -> ProjectBoundaryEvidence {
    let projectInfoRelativePaths = projectInfo.projectInfoURLs.map {
      projectInfoEvidencePath(from: projectRoot, to: $0)
    }
    let conflictingProjectInfoRelativePaths = projectInfo.conflictingProjectInfoURLs.map {
      projectInfoEvidencePath(from: projectRoot, to: $0)
    }
    let locallyAvailableLocations: Set<ProjectMediaLocation> = [
      .containedInProject, .external, .symlinkEscaped, .removableVolumeDependent,
    ]
    let containedOnThisMac =
      projectInfo.status == .intact
      && media.allSatisfy {
        locallyAvailableLocations.contains($0.location)
          && $0.fileValidation == .verified
          && $0.volumeState != .offline
          && $0.volumeState != .unknown
      }

    let hasManagedLibraryRisk = risks.contains(where: { $0.kind == .pluginManagedLibrary })
    let portableToAnotherMac =
      projectInfo.status == .intact
      && media.allSatisfy {
        $0.location == .containedInProject && $0.fileValidation == .verified
      }
      && pluginRequirements.isEmpty
      && !live.requiresMaxForLive
      && live.packNames.isEmpty
      && !hasManagedLibraryRisk

    let resolvedFromReviewedFolder =
      reviewedProjectRoot.standardizedFileURL != projectRoot.standardizedFileURL
    let reviewedFolderNote =
      resolvedFromReviewedFolder
      ? " This audit resolved that Project leaf from the reviewed folder \(reviewedProjectRoot.lastPathComponent)."
      : ""

    let projectLeafSummary: String
    switch projectInfo.status {
    case .intact:
      projectLeafSummary =
        "The intact DAW-owned Project leaf is \(projectRoot.lastPathComponent) with Set \(relativePath(from: projectRoot, to: plan.sourceSetURL)).\(reviewedFolderNote)"
    case .missing:
      projectLeafSummary =
        "The source folder \(projectRoot.lastPathComponent) is missing the required top-level Ableton Project Info directory."
    case .conflicting:
      projectLeafSummary =
        "The source folder \(projectRoot.lastPathComponent) has conflicting Ableton Project Info directories: \(projectInfoRelativePaths.joined(separator: ", "))."
    }

    let sourceContainmentSummary: String
    if media.isEmpty, projectInfo.status == .intact {
      sourceContainmentSummary =
        "No Ableton-visible media references were identified outside the intact source Project leaf on this Mac."
    } else if containedOnThisMac && media.allSatisfy({ $0.location == .containedInProject }) {
      sourceContainmentSummary =
        "Ableton-visible media is contained on this Mac inside the intact source Project."
    } else if containedOnThisMac {
      let external = media.filter { $0.location != .containedInProject }.map(\.displayName).sorted()
      sourceContainmentSummary =
        "Ableton-visible media resolves on this Mac, but the source Project still depends on paths outside its boundary: \(external.joined(separator: ", "))."
    } else if projectInfo.status == .conflicting {
      let locallyResolved = media.filter { locallyAvailableLocations.contains($0.location) }.map(
        \.displayName
      ).sorted()
      sourceContainmentSummary =
        locallyResolved.isEmpty
        ? "The Project boundary is conflicting, so this audit cannot truthfully claim source containment on this Mac."
        : "Ableton-visible media may resolve on this Mac, but the Project boundary is conflicting, so this audit cannot truthfully claim source containment for \(locallyResolved.joined(separator: ", "))."
    } else if projectInfo.status == .missing {
      sourceContainmentSummary =
        "The required top-level Ableton Project Info directory is missing, so this audit cannot truthfully claim source containment on this Mac."
    } else {
      let blocked = media.filter { !locallyAvailableLocations.contains($0.location) }.map(
        \.displayName
      ).sorted()
      sourceContainmentSummary =
        "Not every Ableton-visible media reference is currently available on this Mac: \(blocked.joined(separator: ", "))."
    }

    var limitations: [String] = []
    if projectInfo.status != .intact {
      limitations.append("the Project boundary is not intact")
    }
    let nonContainedMedia = media.filter { $0.location != .containedInProject }
    if !nonContainedMedia.isEmpty {
      limitations.append("media remains outside the Project boundary")
    }
    if !pluginRequirements.isEmpty {
      limitations.append("third-party plug-ins are required")
    }
    if live.requiresMaxForLive {
      limitations.append("Max for Live devices are required")
    }
    if !live.packNames.isEmpty {
      limitations.append("Ableton Packs are referenced")
    }
    if hasManagedLibraryRisk {
      limitations.append("vendor-managed libraries are not proven portable")
    }

    let portabilitySummary =
      portableToAnotherMac
      ? "This intact source Project is portable to another Mac based on the evidence captured by this read-only audit."
      : "This source Project is not yet proven portable to another Mac because \(limitations.joined(separator: ", "))."

    return ProjectBoundaryEvidence(
      projectLeafName: projectRoot.lastPathComponent,
      selectedSetRelativePath: relativePath(from: projectRoot, to: plan.sourceSetURL),
      projectInfoStatus: projectInfo.status,
      projectInfoRelativePaths: projectInfoRelativePaths,
      conflictingProjectInfoRelativePaths: conflictingProjectInfoRelativePaths,
      containedOnThisMac: containedOnThisMac,
      portableToAnotherMac: portableToAnotherMac,
      projectLeafSummary: projectLeafSummary,
      sourceContainmentSummary: sourceContainmentSummary,
      portabilitySummary: portabilitySummary
    )
  }

  private func hasSourceSetMismatch(
    plan: ProjectHandoffPlan,
    set: AbletonSet,
    projectRoot: URL,
    observation: ProjectSourceSetFileObservation?
  ) -> Bool {
    if plan.sourceSetURL.resolvingSymlinksInPath().standardizedFileURL
      != set.fileURL.resolvingSymlinksInPath().standardizedFileURL
      || !isDescendant(plan.sourceSetURL, of: projectRoot)
      || plan.displaySnapshot.setDisplayName != set.displayName
    {
      return true
    }
    guard let observation else { return true }
    return observation != plan.sourceSetFileObservation
  }

  private func sourceSetMismatchSummary(
    plan: ProjectHandoffPlan,
    set: AbletonSet,
    observation: ProjectSourceSetFileObservation?
  ) -> String {
    guard let observation else {
      return "The reviewed source Set is no longer readable at the reviewed path."
    }
    if observation.sha256 != plan.sourceSetFileObservation.sha256 {
      return "The source Set content digest changed after review."
    }
    if observation.resourceIdentifier != plan.sourceSetFileObservation.resourceIdentifier {
      return "The physical source Set resource changed after review."
    }
    if observation != plan.sourceSetFileObservation {
      return "The source Set file observation changed after review."
    }
    return "The reviewed source Set does not match the indexed Set revision being audited."
  }

  private func observeSourceSet(at url: URL) -> ProjectSourceSetFileObservation? {
    try? ProjectSourceSetFileObserver().observe(at: url)
  }

  private func estimatedStagedBytes(
    set: AbletonSet,
    projectRoot: URL,
    dependencies: [MediaDependency]
  ) -> Int64 {
    var projectBytes: Int64 = 0
    if let enumerator = fileManager.enumerator(
      at: projectRoot,
      includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey],
      options: []
    ) {
      for case let url as URL in enumerator {
        guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
          values.isRegularFile == true
        else { continue }
        projectBytes += Int64(values.fileSize ?? 0)
      }
    }
    if projectBytes == 0 { projectBytes = max(0, set.compressedBytes) }
    var externalURLs = Set<URL>()
    for dependency in dependencies where dependency.availability == .available {
      guard let url = dependency.resolvedURL?.resolvingSymlinksInPath().standardizedFileURL,
        !isDescendant(url, of: projectRoot)
      else { continue }
      externalURLs.insert(url)
    }
    let externalBytes = externalURLs.reduce(Int64(0)) { total, url in
      let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize
      return total + Int64(size ?? 0)
    }
    return projectBytes + externalBytes
  }

  private func candidateURL(
    for dependency: MediaDependency,
    setURL: URL,
    projectRoot: URL
  ) -> URL? {
    if let absolutePath = cleanPath(dependency.reference.absolutePath) {
      return URL(fileURLWithPath: absolutePath).standardizedFileURL
    }
    guard let relativePath = cleanPath(dependency.reference.relativePath) else { return nil }
    let projectCandidate = projectRoot.appending(path: relativePath).standardizedFileURL
    if fileExists(at: projectCandidate) { return projectCandidate }
    return setURL.deletingLastPathComponent().appending(path: relativePath).standardizedFileURL
  }

  private func inferredPackNames(set: AbletonSet) -> [String] {
    var names = Set<String>()
    let references =
      set.content.dependencies.map(\.reference)
      + set.content.tracks.flatMap { track in
        flatten(track.devices).flatMap(\.resourceReferences)
      }
    for reference in references {
      for rawPath in [reference.absolutePath, reference.relativePath].compactMap({ cleanPath($0) })
      {
        let components = URL(fileURLWithPath: rawPath).standardizedFileURL.pathComponents
        if let index = components.firstIndex(of: "Packs"), index + 1 < components.count {
          names.insert(components[index + 1])
        }
      }
    }
    return names.sorted()
  }

  private func parseLiveVersion(_ creator: String?) -> String? {
    creator?.firstMatch(of: /\d+(?:\.\d+){0,2}/).map { String($0.output) }
  }

  private func parseLiveEdition(_ creator: String?) -> String? {
    guard let creator else { return nil }
    for edition in ["Suite", "Standard", "Intro", "Lite"]
    where creator.localizedCaseInsensitiveContains(edition) {
      return edition
    }
    return nil
  }

  private func flatten(_ devices: [SetDevice]) -> [SetDevice] {
    devices.flatMap { [$0] + flatten($0.nestedDevices) }
  }

  private struct DeviceTrack: Sendable {
    let id: String
    let name: String
  }

  private func tracksByDeviceID(_ tracks: [SetTrack]) -> [String: [DeviceTrack]] {
    var result: [String: [DeviceTrack]] = [:]
    for track in tracks {
      for device in flatten(track.devices) {
        result[device.id, default: []].append(DeviceTrack(id: track.id, name: track.name))
      }
    }
    return result
  }

  private func isCloudPlaceholder(_ url: URL) -> Bool {
    if url.lastPathComponent.hasSuffix(".icloud") { return true }
    guard
      let values = try? url.resourceValues(
        forKeys: [.isUbiquitousItemKey, .ubiquitousItemDownloadingStatusKey]
      )
    else {
      return false
    }
    return values.isUbiquitousItem == true
      && values.ubiquitousItemDownloadingStatus != URLUbiquitousItemDownloadingStatus.current
  }

  private func isRemovableVolume(_ url: URL) -> Bool {
    if url.standardizedFileURL.pathComponents.dropFirst().first == "Volumes" {
      return true
    }
    guard
      let values = try? url.resourceValues(forKeys: [.volumeIsRemovableKey, .volumeIsEjectableKey])
    else {
      return false
    }
    return values.volumeIsRemovable == true || values.volumeIsEjectable == true
  }

  private func volumeState(
    for url: URL?,
    availability: MediaDependencyAvailability
  ) -> ProjectMediaVolumeState {
    if availability == .disconnected { return .offline }
    guard let url else { return .unknown }
    let pathComponents = url.standardizedFileURL.pathComponents
    if pathComponents.count > 2, pathComponents[1] == "Volumes" {
      let volumeRoot = URL(fileURLWithPath: "/Volumes").appending(path: pathComponents[2])
      return fileManager.fileExists(atPath: volumeRoot.path) ? .availableRemovable : .offline
    }
    guard
      let values = try? url.resourceValues(
        forKeys: [.volumeIsRemovableKey, .volumeIsEjectableKey, .volumeIsLocalKey]
      )
    else {
      return url.isFileURL ? .availableLocal : .unknown
    }
    if values.volumeIsRemovable == true || values.volumeIsEjectable == true {
      return .availableRemovable
    }
    if values.volumeIsLocal == true { return .availableLocal }
    return .unknown
  }

  private func pathEvidence(for url: URL?, dependency: MediaDependency) -> String {
    if let url { return url.path }
    if let absolutePath = cleanPath(dependency.reference.absolutePath) { return absolutePath }
    if let relativePath = cleanPath(dependency.reference.relativePath) { return relativePath }
    return "an unresolved path"
  }

  private func cleanPath(_ value: String?) -> String? {
    guard let value else { return nil }
    let decoded = value.removingPercentEncoding ?? value
    let trimmed = decoded.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private func fileExists(at url: URL) -> Bool {
    fileManager.fileExists(atPath: url.path)
  }

  private func resolvedProjectRoot(
    reviewedProjectRoot: URL,
    setURL: URL
  ) -> (projectRoot: URL, inspection: AbletonProjectInfoInspection) {
    let inspector = AbletonProjectInfoInspector(fileManager: fileManager)
    let reviewedRoot = reviewedProjectRoot.resolvingSymlinksInPath().standardizedFileURL
    let setDirectory = setURL.resolvingSymlinksInPath().standardizedFileURL
      .deletingLastPathComponent()

    guard isDescendant(setDirectory, of: reviewedRoot) else {
      return (reviewedRoot, inspector.inspect(projectRoot: reviewedRoot))
    }

    var candidate = setDirectory
    var boundaryRoots: [URL] = []
    while true {
      let directInfo = candidate.appending(
        path: "Ableton Project Info", directoryHint: .isDirectory)
      var isDirectory: ObjCBool = false
      if fileManager.fileExists(atPath: directInfo.path, isDirectory: &isDirectory),
        isDirectory.boolValue
      {
        boundaryRoots.append(candidate)
      }
      if candidate.standardizedFileURL == reviewedRoot { break }
      let parent = candidate.deletingLastPathComponent().standardizedFileURL
      if parent == candidate || !isDescendant(parent, of: reviewedRoot) { break }
      candidate = parent
    }

    if let projectRoot = boundaryRoots.first {
      let selectedInspection = inspector.inspect(projectRoot: projectRoot)
      guard boundaryRoots.count > 1 else { return (projectRoot, selectedInspection) }
      let boundaryInfoURLs = boundaryRoots.map {
        $0.appending(path: "Ableton Project Info", directoryHint: .isDirectory).standardizedFileURL
      }
      let allInfoURLs = Array(Set(selectedInspection.projectInfoURLs + boundaryInfoURLs))
        .sorted { $0.path < $1.path }
      let topLevel = projectRoot.appending(
        path: "Ableton Project Info", directoryHint: .isDirectory
      ).standardizedFileURL
      return (
        projectRoot,
        AbletonProjectInfoInspection(
          topLevelProjectInfoURL: topLevel,
          projectInfoURLs: allInfoURLs,
          conflictingProjectInfoURLs: allInfoURLs.filter { $0 != topLevel }
        )
      )
    }

    return (reviewedRoot, inspector.inspect(projectRoot: reviewedRoot))
  }

  private func lexicalDescendant(_ child: URL, of parent: URL) -> Bool {
    let childPath = child.standardizedFileURL.path
    let parentPath = parent.standardizedFileURL.path
    return childPath == parentPath || childPath.hasPrefix(parentPath + "/")
  }

  private func isDescendant(_ child: URL, of parent: URL) -> Bool {
    let childPath = child.resolvingSymlinksInPath().standardizedFileURL.path
    let parentPath = parent.resolvingSymlinksInPath().standardizedFileURL.path
    return childPath == parentPath || childPath.hasPrefix(parentPath + "/")
  }

  private func relativePath(from root: URL, to url: URL) -> String {
    let rootPath = root.standardizedFileURL.path
    let urlPath = url.standardizedFileURL.path
    guard urlPath == rootPath || urlPath.hasPrefix(rootPath + "/") else {
      return url.lastPathComponent
    }
    let relative = String(urlPath.dropFirst(rootPath.count)).trimmingCharacters(
      in: CharacterSet(charactersIn: "/"))
    return relative.isEmpty ? "." : relative
  }

  private func projectInfoEvidencePath(from root: URL, to infoURL: URL) -> String {
    if lexicalDescendant(infoURL, of: root) { return relativePath(from: root, to: infoURL) }
    let boundaryRoot = infoURL.deletingLastPathComponent().standardizedFileURL
    var candidate = root.standardizedFileURL
    var levels = 0
    while candidate != boundaryRoot {
      let parent = candidate.deletingLastPathComponent().standardizedFileURL
      guard parent != candidate else { return "outside-selected-project/Ableton Project Info" }
      candidate = parent
      levels += 1
    }
    return "ancestor-\(levels)/Ableton Project Info"
  }
}

public enum ProjectPortabilityReviewPlanError: Error, Equatable {
  case identityMismatch
  case invalidAudit
}

public struct ProjectPortabilityReviewPlanner: Sendable {
  public init() {}

  public func make(
    id: String,
    handoffPlan: ProjectHandoffPlan,
    audit: ProjectReadinessAudit,
    createdAt: Date = Date()
  ) throws -> ProjectPortabilityReviewPlan {
    guard audit.planID == handoffPlan.id,
      audit.planFingerprint == handoffPlan.fingerprint,
      audit.workID == handoffPlan.workID,
      audit.sessionID == handoffPlan.sessionID,
      audit.revisionID == handoffPlan.revisionID
    else { throw ProjectPortabilityReviewPlanError.identityMismatch }
    do { try audit.validate() } catch { throw ProjectPortabilityReviewPlanError.invalidAudit }

    var actions: [ProjectPortabilityReviewAction] = []
    for risk in audit.risks {
      guard let action = action(for: risk) else { continue }
      if !actions.contains(where: { $0.kind == action.kind }) { actions.append(action) }
    }
    return ProjectPortabilityReviewPlan(
      id: id,
      handoffPlanID: handoffPlan.id,
      handoffPlanFingerprint: handoffPlan.fingerprint,
      auditTimestamp: audit.auditedAt,
      createdAt: createdAt,
      actions: actions
    )
  }

  private func action(for risk: ProjectHandoffRisk) -> ProjectPortabilityReviewAction? {
    let tuple: (ProjectPortabilityReviewActionKind, String, Bool)? =
      switch risk.kind {
      case .projectBoundaryConflict:
        (
          .reviewProjectBoundary,
          "Review and select one intact Ableton Project boundary before staging.", false
        )
      case .externalMedia:
        (
          .collectExternalMediaInStagedCopy,
          "Review collection of external media into a disposable staged Project copy.", true
        )
      case .symlinkEscapedMedia:
        (
          .replaceEscapedSymlinkInStagedCopy,
          "Review replacing escaped symlinks with verified files in the staged copy only.", true
        )
      case .cloudPlaceholderMedia:
        (
          .downloadCloudMedia, "Make cloud media locally available before creating a staged copy.",
          false
        )
      case .disconnectedMedia, .removableVolumeMedia:
        (
          .restoreOfflineVolume, "Reconnect the referenced volume and run a fresh read-only audit.",
          false
        )
      case .permissionBlockedMedia:
        (.grantReadPermission, "Grant read access and run a fresh read-only audit.", false)
      case .missingMedia, .invalidEmbeddedMedia:
        (
          .replaceInvalidMediaInStagedCopy,
          "Review a verified replacement for use in a staged copy; do not rewrite the indexed Set.",
          true
        )
      case .unresolvedMedia, .unknownMedia:
        (
          .resolveUnknownReference, "Resolve the unknown reference through explicit user review.",
          false
        )
      case .insufficientDiskSpace, .unknownDiskSpace:
        (
          .provideDestinationSpace,
          "Choose a reviewed staging destination with sufficient free space.", false
        )
      case .missingFallback:
        (
          .provideFallbackAudio,
          "Review existing fallback audio or a later separately approved staged-copy render plan.",
          true
        )
      case .sourceSetMismatch:
        (
          .reviewProjectBoundary,
          "The source Set changed; capture a fresh reviewed revision before any staging action.",
          false
        )
      case .missingPlugin, .pluginVersionMismatch, .unscannedPluginFormat, .pluginManagedLibrary,
        .maxForLiveRequirement, .unknown:
        nil
      }
    guard let tuple else { return nil }
    return ProjectPortabilityReviewAction(
      id: "action-\(tuple.0.rawValue)",
      kind: tuple.0,
      summary: tuple.1,
      stagedCopyOnly: tuple.2
    )
  }
}
