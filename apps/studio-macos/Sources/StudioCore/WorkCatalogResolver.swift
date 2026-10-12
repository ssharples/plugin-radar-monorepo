import Foundation

public enum OwnerInferenceStrategy: String, Codable, Sendable {
  case firstMeaningfulPathComponent
}

public struct RootOwnerConvention: Codable, Sendable {
  public let rootURL: URL
  public let strategy: OwnerInferenceStrategy
  public let ignoredPathComponents: Set<String>

  public init(
    rootURL: URL,
    strategy: OwnerInferenceStrategy = .firstMeaningfulPathComponent,
    ignoredPathComponents: Set<String> = []
  ) {
    self.rootURL = rootURL.standardizedFileURL
    self.strategy = strategy
    self.ignoredPathComponents = ignoredPathComponents
  }
}

public struct OrganisationConfiguration: Sendable {
  public let ownerConventions: [RootOwnerConvention]
  public let recognizeEngineeringRoots: Bool

  public init(
    ownerConventions: [RootOwnerConvention] = [],
    recognizeEngineeringRoots: Bool = true
  ) {
    self.ownerConventions = ownerConventions
    self.recognizeEngineeringRoots = recognizeEngineeringRoots
  }
}

public struct WorkCatalogResolver: Sendable {
  public static let algorithmVersion = "phase1-deterministic-v1"

  private let configuration: OrganisationConfiguration

  public init(configuration: OrganisationConfiguration = OrganisationConfiguration()) {
    self.configuration = configuration
  }

  public func resolve(
    indexes: [StudioLibraryIndex],
    overrides: OrganisationOverrides = OrganisationOverrides(),
    directory: StudioOrganisationDirectory = StudioOrganisationDirectory(),
    generatedAt: Date = Date()
  ) -> WorkCatalog {
    var overridesBySessionID: [String: SessionOrganisationOverride] = [:]
    for override in overrides.sessionOverrides {
      overridesBySessionID[override.sessionID] = override
    }
    let assignmentsBySessionID = directory.assignmentsBySessionID
    let qualifierDecisionsByRevisionID = Dictionary(
      grouping: overrides.qualifierDecisions, by: \.revisionID)
    let managedWorksByID = directory.worksByID
    let managedArtistsByID = directory.artistsByID
    var seeds: [SessionSeed] = []
    var seenSessionIDs: Set<String> = []
    var seenSessionPaths: Set<String> = []

    // Prefer the most specific tracked root when registered roots overlap. The physical Session
    // remains one object and owner conventions are evaluated relative to the tightest scope.
    for index in indexes.sorted(by: { $0.rootURL.path.count > $1.rootURL.path.count }) {
      for project in index.projects {
        let sessionPath = project.rootURL.standardizedFileURL.path
        guard seenSessionIDs.insert(project.id).inserted,
          seenSessionPaths.insert(sessionPath).inserted
        else { continue }
        let override = overridesBySessionID[project.id]
        let managedWork = assignmentsBySessionID[project.id]
          .flatMap { managedWorksByID[$0.workID] }
        let managedArtist = managedWork.flatMap { managedArtistsByID[$0.artistID] }
        let owner =
          managedArtist.map { managedOwner($0, project: project) }
          ?? inferOwner(project: project, index: index, override: override)
        let title =
          managedWork.map { managedTitle($0, project: project) }
          ?? inferTitle(
            project: project,
            index: index,
            ownerName: owner.displayName,
            override: override
          )
        let groupingKey: String
        if let managedWork {
          groupingKey = "managed:\(managedWork.id)"
        } else if override?.keepSeparate == true || owner.displayName == "Unknown"
          || title.key.isEmpty
        {
          groupingKey = "session:\(project.id)"
        } else if let explicit = override?.groupingKey, !explicit.isEmpty {
          groupingKey = "override:\(normalizeKey(explicit))"
        } else {
          groupingKey = "\(owner.id):\(compactedTitleKey(title.key))"
        }
        seeds.append(
          SessionSeed(
            project: project,
            owner: owner,
            title: title,
            groupingKey: groupingKey,
            hasOverride: override != nil || managedWork != nil,
            managedWorkID: managedWork?.id
          ))
      }
    }

    let grouped = Dictionary(grouping: seeds, by: \.groupingKey)
    var works = grouped.values.map {
      makeWork($0, qualifierDecisionsByRevisionID: qualifierDecisionsByRevisionID)
    }
    works.sort(by: workSort)
    let reviewQueue = buildReviewQueue(works: works)

    return WorkCatalog(
      generatedAt: generatedAt,
      algorithmVersion: Self.algorithmVersion,
      sourceRoots: indexes.map(\.rootURL).sorted { $0.path < $1.path },
      works: works,
      reviewQueue: reviewQueue
    )
  }

  private func inferOwner(
    project: StudioProject,
    index: StudioLibraryIndex,
    override: SessionOrganisationOverride?
  ) -> OwnerSeed {
    if let name = override?.artistName?.trimmingCharacters(in: .whitespacesAndNewlines),
      !name.isEmpty
    {
      let evidence = OrganisationEvidence(
        id: StableID.forValue("owner-override:\(project.id):\(name)"),
        kind: .userOverride,
        score: 1,
        explanation: "User assigned this Session to \(name).",
        sourceURLs: [project.rootURL]
      )
      return OwnerSeed(
        id: StableID.forValue("artist:\(normalizeKey(name))"),
        displayName: name,
        confidence: .confirmed,
        evidence: [evidence]
      )
    }

    guard let component = ownerComponent(project: project, index: index) else {
      return OwnerSeed.unknown
    }
    let name = component.name
    let evidence = OrganisationEvidence(
      id: StableID.forValue("owner-ancestor:\(project.id):\(name)"),
      kind: .ownerAncestor,
      score: 0.98,
      explanation:
        "\(name) is the Artist folder at the nearest recognised Engineering boundary.",
      sourceURLs: [component.url]
    )
    return OwnerSeed(
      id: StableID.forValue("artist:\(normalizeKey(name))"),
      displayName: name,
      confidence: .automatic,
      evidence: [evidence]
    )
  }

  private func ownerConvention(for rootURL: URL) -> RootOwnerConvention? {
    let rootPath = rootURL.standardizedFileURL.path
    if let configured = configuration.ownerConventions.first(where: {
      $0.rootURL.standardizedFileURL.path == rootPath
    }) {
      return configured
    }
    guard configuration.recognizeEngineeringRoots,
      normalizeKey(rootURL.lastPathComponent) == "engineering"
    else { return nil }
    return RootOwnerConvention(rootURL: rootURL)
  }

  private func ownerComponent(project: StudioProject, index: StudioLibraryIndex) -> OwnerComponent?
  {
    let components = relativePathComponents(child: project.rootURL, parent: index.rootURL)
    if let convention = configuration.ownerConventions.first(where: {
      $0.rootURL.standardizedFileURL.path == index.rootURL.standardizedFileURL.path
    }) {
      let ignored = Set(convention.ignoredPathComponents.map(normalizeKey))
      guard
        let offset = components.firstIndex(where: {
          let key = normalizeKey($0)
          return !key.isEmpty && !ignored.contains(key) && !$0.hasPrefix(".")
        })
      else { return nil }
      return OwnerComponent(
        name: components[offset],
        url: index.rootURL.appending(path: components.prefix(offset + 1).joined(separator: "/")),
        titleComponentOffset: offset + 1
      )
    }
    guard configuration.recognizeEngineeringRoots else { return nil }
    if normalizeKey(index.rootURL.lastPathComponent) == "engineering",
      let name = components.first
    {
      return OwnerComponent(
        name: name,
        url: index.rootURL.appending(path: name, directoryHint: .isDirectory),
        titleComponentOffset: 1
      )
    }
    guard
      let engineeringOffset = components.firstIndex(where: {
        normalizeKey($0) == "engineering"
      }), components.indices.contains(engineeringOffset + 1)
    else { return nil }
    let artistOffset = engineeringOffset + 1
    return OwnerComponent(
      name: components[artistOffset],
      url: index.rootURL.appending(
        path: components.prefix(artistOffset + 1).joined(separator: "/"),
        directoryHint: .isDirectory
      ),
      titleComponentOffset: artistOffset + 1
    )
  }

  private func managedOwner(_ artist: StudioArtistRecord, project: StudioProject) -> OwnerSeed {
    let evidence = OrganisationEvidence(
      id: StableID.forValue("managed-artist:\(artist.id):\(project.id)"),
      kind: .userOverride,
      score: 1,
      explanation: "User assigned this Session to Artist \(artist.displayName).",
      sourceURLs: [project.rootURL]
    )
    return OwnerSeed(
      id: artist.id,
      displayName: artist.displayName,
      confidence: .confirmed,
      evidence: [evidence]
    )
  }

  private func managedTitle(_ work: StudioWorkRecord, project: StudioProject) -> TitleSeed {
    let normalized = normalizedTitle(work.displayName, ownerName: "")
    let evidence = CanonicalTitleEvidence(
      id: StableID.forValue("managed-work:\(work.id):\(project.id)"),
      rawValue: work.displayName,
      canonicalValue: work.displayName,
      canonicalKey: normalized.key,
      source: .userOverride,
      sourceURL: project.rootURL,
      weight: 100,
      removedContext: []
    )
    return TitleSeed(displayName: work.displayName, key: normalized.key, evidence: [evidence])
  }

  private func inferTitle(
    project: StudioProject,
    index: StudioLibraryIndex,
    ownerName: String,
    override: SessionOrganisationOverride?
  ) -> TitleSeed {
    var candidates: [CanonicalTitleEvidence] = []
    if let name = override?.workName?.trimmingCharacters(in: .whitespacesAndNewlines),
      !name.isEmpty
    {
      candidates.append(
        titleEvidence(
          name,
          source: .userOverride,
          url: project.rootURL,
          weight: 100,
          ownerName: ownerName
        ))
    }
    candidates.append(
      titleEvidence(
        project.displayName,
        source: .projectFolder,
        url: project.rootURL,
        weight: 5,
        ownerName: ownerName
      ))
    for set in project.sets {
      candidates.append(
        titleEvidence(
          set.displayName,
          source: set.isBackup ? .backupSet : .currentSet,
          url: set.fileURL,
          weight: set.isBackup ? 0.75 : 4,
          ownerName: ownerName
        ))
    }

    let relativeComponents = relativePathComponents(child: project.rootURL, parent: index.rootURL)
    let ownerOffset = ownerComponent(project: project, index: index)?.titleComponentOffset ?? 0
    let ancestorComponents = relativeComponents.dropFirst(ownerOffset).dropLast()
    for (offset, component) in ancestorComponents.reversed().enumerated() {
      candidates.append(
        titleEvidence(
          component,
          source: .ancestorFolder,
          url: project.rootURL.deletingLastPathComponent(),
          weight: offset == 0 ? 3 : 1,
          ownerName: ownerName
        ))
    }

    let useful = candidates.filter {
      !$0.canonicalKey.isEmpty && !isGenericTitleKey($0.canonicalKey)
    }
    var totals = Dictionary(grouping: useful, by: \.canonicalKey).mapValues { values in
      values.reduce(0) { $0 + $1.weight }
    }
    // `NEW` is only treated as workflow context when a physical ancestor independently names
    // the base Work. This avoids globally rewriting legitimate titles such as "Something New".
    for ancestor in useful where ancestor.source == .ancestorFolder {
      let contextualKey = ancestor.canonicalKey + " new"
      let contextualSupport = useful.filter { $0.canonicalKey == contextualKey }
        .reduce(0) { $0 + $1.weight }
      if contextualSupport > 0 {
        totals[ancestor.canonicalKey, default: 0] += contextualSupport
      }
    }
    let bestKey = totals.keys.max { lhs, rhs in
      if totals[lhs, default: 0] != totals[rhs, default: 0] {
        return totals[lhs, default: 0] < totals[rhs, default: 0]
      }
      return lhs.count > rhs.count
    }
    let selected =
      useful
      .filter { $0.canonicalKey == bestKey }
      .sorted {
        if $0.weight != $1.weight { return $0.weight > $1.weight }
        return $0.canonicalValue.count < $1.canonicalValue.count
      }
      .first
    let fallback = normalizedTitle(project.displayName, ownerName: ownerName)
    return TitleSeed(
      displayName: selected?.canonicalValue
        ?? (fallback.display.isEmpty ? project.displayName : fallback.display),
      key: selected?.canonicalKey ?? fallback.key,
      evidence: useful.sorted {
        if $0.canonicalKey == bestKey, $1.canonicalKey != bestKey { return true }
        if $0.canonicalKey != bestKey, $1.canonicalKey == bestKey { return false }
        return $0.weight > $1.weight
      }
    )
  }

  private func titleEvidence(
    _ value: String,
    source: TitleEvidenceSource,
    url: URL,
    weight: Double,
    ownerName: String
  ) -> CanonicalTitleEvidence {
    let normalized = normalizedTitle(value, ownerName: ownerName)
    return CanonicalTitleEvidence(
      id: StableID.forValue("title:\(source.rawValue):\(url.path):\(value)"),
      rawValue: value,
      canonicalValue: normalized.display,
      canonicalKey: normalized.key,
      source: source,
      sourceURL: url,
      weight: weight,
      removedContext: normalized.removed
    )
  }

  private func makeWork(
    _ seeds: [SessionSeed],
    qualifierDecisionsByRevisionID: [String: [RevisionQualifierDecision]]
  ) -> StudioWork {
    let orderedSeeds = seeds.sorted { $0.project.rootURL.path < $1.project.rootURL.path }
    let preferredSeed =
      orderedSeeds.max { lhs, rhs in
        titleSupport(lhs) < titleSupport(rhs)
      } ?? orderedSeeds[0]
    let owner = preferredSeed.owner
    let sessions = orderedSeeds.map {
      makeSession($0, qualifierDecisionsByRevisionID: qualifierDecisionsByRevisionID)
    }.sorted(by: sessionSort)
    var evidence = owner.evidence
    evidence.append(
      OrganisationEvidence(
        id: StableID.forValue(
          "title-work:\(orderedSeeds.map(\.project.id).joined(separator: ":"))"),
        kind: .canonicalTitle,
        score: 0.96,
        explanation:
          "The strongest folder and Set-name evidence resolves to \(preferredSeed.title.displayName).",
        sourceURLs: orderedSeeds.map(\.project.rootURL)
      ))
    if orderedSeeds.count > 1 {
      evidence.append(
        OrganisationEvidence(
          id: StableID.forValue(
            "shared-title:\(orderedSeeds.map(\.project.id).joined(separator: ":"))"),
          kind: .sharedCanonicalTitle,
          score: 0.99,
          explanation:
            "\(orderedSeeds.count) physical Sessions have the exact canonical title \(preferredSeed.title.displayName).",
          sourceURLs: orderedSeeds.map(\.project.rootURL)
        ))
      if owner.displayName != "Unknown" {
        evidence.append(
          OrganisationEvidence(
            id: StableID.forValue("shared-owner:\(owner.id):\(preferredSeed.title.key)"),
            kind: .sharedOwner,
            score: 0.98,
            explanation:
              "Every grouped Session is beneath the same inferred owner, \(owner.displayName).",
            sourceURLs: orderedSeeds.map(\.project.rootURL)
          ))
      }
    }
    if orderedSeeds.contains(where: \.hasOverride) {
      evidence.append(
        OrganisationEvidence(
          id: StableID.forValue(
            "override-work:\(orderedSeeds.map(\.project.id).joined(separator: ":"))"),
          kind: .userOverride,
          score: 1,
          explanation: "A durable user override contributes to this Work assignment.",
          sourceURLs: orderedSeeds.map(\.project.rootURL)
        ))
    }
    let confidence: OrganisationConfidence
    if orderedSeeds.contains(where: \.hasOverride) {
      confidence = .confirmed
    } else if owner.displayName == "Unknown" || preferredSeed.title.key.isEmpty {
      confidence = .unresolved
    } else {
      confidence = .automatic
    }
    let identity = ArtistIdentity(
      id: owner.id,
      displayName: owner.displayName,
      confidence: owner.confidence,
      evidence: owner.evidence
    )
    return StudioWork(
      id: orderedSeeds.compactMap(\.managedWorkID).first
        ?? StableID.forValue(
          "work:\(owner.id):\(preferredSeed.title.key):\(orderedSeeds.first?.groupingKey ?? "")"),
      artist: identity,
      displayName: preferredSeed.title.displayName,
      canonicalKey: preferredSeed.title.key,
      confidence: confidence,
      evidence: evidence,
      sessions: sessions
    )
  }

  private func makeSession(
    _ seed: SessionSeed,
    qualifierDecisionsByRevisionID: [String: [RevisionQualifierDecision]]
  ) -> StudioSession {
    let revisions = seed.project.sets.map { set in
      StudioSetRevision(
        id: set.id,
        set: set,
        revisionLabel: revisionLabel(set.displayName, workTitle: seed.title.displayName),
        filenameInterpretation: StudioFilenameParser().parse(set.displayName),
        qualifierDecisions: qualifierDecisionsByRevisionID[set.id] ?? [],
        timestamp: revisionTimestamp(for: set)
      )
    }.sorted(by: revisionSort)
    return StudioSession(
      id: seed.project.id,
      rootURL: seed.project.rootURL,
      displayName: seed.project.displayName,
      role: inferRole(project: seed.project),
      canonicalTitle: seed.title.displayName,
      canonicalTitleKey: seed.title.key,
      titleEvidence: seed.title.evidence,
      revisions: revisions,
      previewAssets: seed.project.previewAssets
    )
  }

  private func buildReviewQueue(works: [StudioWork]) -> [WorkMatchReview] {
    var reviews: [WorkMatchReview] = []
    guard works.count > 1 else { return [] }
    for leftIndex in 0..<(works.count - 1) {
      for rightIndex in (leftIndex + 1)..<works.count {
        let left = works[leftIndex]
        let right = works[rightIndex]
        guard left.artist.id == right.artist.id,
          left.artist.displayName != "Unknown",
          left.canonicalKey != right.canonicalKey
        else {
          continue
        }
        let score = titleSimilarity(left.canonicalKey, right.canonicalKey)
        guard score >= 0.72 else { continue }
        let evidence = OrganisationEvidence(
          id: StableID.forValue("similar:\(left.id):\(right.id)"),
          kind: .similarTitle,
          score: score,
          explanation:
            "\(left.displayName) and \(right.displayName) have similar title tokens, but were not merged automatically.",
          sourceURLs: (left.sessions + right.sessions).map(\.rootURL)
        )
        reviews.append(
          WorkMatchReview(
            id: StableID.forValue("review:\(left.id):\(right.id)"),
            sourceWorkID: left.id,
            candidateWorkID: right.id,
            confidence: .suggested,
            score: score,
            evidence: [evidence]
          ))
      }
    }
    return reviews.sorted { lhs, rhs in
      if lhs.score != rhs.score { return lhs.score > rhs.score }
      return lhs.id < rhs.id
    }
  }

  private func revisionTimestamp(for set: AbletonSet) -> RevisionTimestamp {
    if let date = parseEmbeddedBackupTimestamp(set.displayName) {
      return RevisionTimestamp(
        value: date,
        source: .embeddedBackupFilename,
        confidence: .automatic,
        explanation: "Ableton embedded this save time in the Backup filename."
      )
    }
    if let date = parseExplicitFilenameDate(set.displayName, fallbackYearFrom: set.modifiedAt) {
      return RevisionTimestamp(
        value: date,
        source: .explicitFilenameDate,
        confidence: .suggested,
        explanation:
          "The Set name contains an explicit calendar date; the year comes from file metadata when absent."
      )
    }
    if let modifiedAt = set.modifiedAt {
      return RevisionTimestamp(
        value: modifiedAt,
        source: .fileModificationTime,
        confidence: .suggested,
        explanation:
          "Ordered by filesystem modification time; copying or archiving can change this clock."
      )
    }
    return RevisionTimestamp(
      value: nil,
      source: .unavailable,
      confidence: .unresolved,
      explanation: "No usable timestamp evidence is available."
    )
  }

  private func parseEmbeddedBackupTimestamp(_ value: String) -> Date? {
    guard
      let match = value.firstMatch(of: /\[(\d{4})[-_](\d{2})[-_](\d{2})\s+(\d{2})(\d{2})(\d{2})\]/)
    else { return nil }
    var components = DateComponents()
    components.calendar = Calendar(identifier: .gregorian)
    components.timeZone = .current
    components.year = Int(match.1)
    components.month = Int(match.2)
    components.day = Int(match.3)
    components.hour = Int(match.4)
    components.minute = Int(match.5)
    components.second = Int(match.6)
    return components.date
  }

  private func parseExplicitFilenameDate(_ value: String, fallbackYearFrom modifiedAt: Date?)
    -> Date?
  {
    if let match = value.firstMatch(of: /(?i)(\d{4})[-_](\d{2})[-_](\d{2})/) {
      return gregorianDate(year: Int(match.1), month: Int(match.2), day: Int(match.3))
    }
    guard
      let match = value.firstMatch(
        of:
          /(?i)\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/
      ),
      let modifiedAt
    else { return nil }
    let calendar = Calendar(identifier: .gregorian)
    let year = calendar.component(.year, from: modifiedAt)
    let monthName = String(match.2).lowercased()
    let monthNames = [
      "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
    ]
    guard let month = monthNames.firstIndex(where: { monthName.hasPrefix($0) }) else { return nil }
    return gregorianDate(year: year, month: month + 1, day: Int(match.1))
  }

  private func gregorianDate(year: Int?, month: Int?, day: Int?) -> Date? {
    guard let year, let month, let day else { return nil }
    var components = DateComponents()
    components.calendar = Calendar(identifier: .gregorian)
    components.timeZone = .current
    components.year = year
    components.month = month
    components.day = day
    components.hour = 12
    return components.date
  }

  private func revisionLabel(_ value: String, workTitle: String) -> String? {
    var label = value
    if let range = label.range(of: #"\s*\[[0-9]{4}[-_][^\]]+\]\s*$"#, options: .regularExpression) {
      label.removeSubrange(range)
    }
    label = label.replacingOccurrences(of: workTitle, with: "", options: [.caseInsensitive])
    label = label.replacingOccurrences(
      of: #"^[\s•·*_\-]*(?:\d{1,3})[\s.\-_]+"#,
      with: "",
      options: .regularExpression
    )
    label = label.replacingOccurrences(of: workTitle, with: "", options: [.caseInsensitive])
      .trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters))
    return label.isEmpty ? nil : label
  }

  private func inferRole(project: StudioProject) -> SessionRole {
    let value = ([project.displayName] + project.sets.map(\.displayName)).joined(separator: " ")
      .lowercased()
    if value.range(of: #"\bmaster(?:ing)?\b"#, options: .regularExpression) != nil {
      return .master
    }
    if value.range(of: #"\bmix(?:down|ing)?\b"#, options: .regularExpression) != nil { return .mix }
    if value.range(of: #"\bstems?\b"#, options: .regularExpression) != nil {
      return .stemPreparation
    }
    if value.range(of: #"\bvocal(?:s| edit)?\b"#, options: .regularExpression) != nil {
      return .vocalEdit
    }
    if value.range(of: #"\blive\b"#, options: .regularExpression) != nil { return .live }
    return .production
  }

  private func normalizedTitle(
    _ value: String,
    ownerName: String
  ) -> (display: String, key: String, removed: [String]) {
    var working = value.precomposedStringWithCanonicalMapping
    var removed: [String] = []
    if let range = working.range(of: #"\s*\[[0-9]{4}[-_][^\]]+\]\s*$"#, options: .regularExpression)
    {
      removed.append(String(working[range]).trimmingCharacters(in: .whitespaces))
      working.removeSubrange(range)
    }
    working = working.replacingOccurrences(
      of: #"^[\s•·*_\-]*(?:\d{1,3})[\s.\-_]+"#, with: "", options: .regularExpression)
    working = working.replacingOccurrences(
      of: #"^[\s•·*_\-]*(?:\d{1,2})(?=\p{Lu}{2})"#,
      with: "",
      options: .regularExpression
    )
    working = working.replacingOccurrences(
      of: #"[^\p{L}\p{N}&'.]+"#,
      with: " ",
      options: .regularExpression
    ).trimmingCharacters(in: .whitespacesAndNewlines)
    var tokens = working.split(whereSeparator: \Character.isWhitespace).map {
      String($0).trimmingCharacters(in: .punctuationCharacters)
    }.filter { !$0.isEmpty }
    let suffixWords: Set<String> = [
      "project", "projects", "mix", "mixdown", "mixing", "master", "mastering", "stems",
      "stem", "bounce", "bounces", "render", "renders", "export", "exports", "pa", "ableton",
    ]
    let monthPattern =
      #"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"#
    while !tokens.isEmpty {
      let rawLast = tokens.last ?? ""
      let last = normalizeKey(rawLast)
      if suffixWords.contains(last) {
        removed.append(tokens.removeLast())
        continue
      }
      if tokens.count > 1,
        rawLast.range(
          of: #"^(?:v)?\d+(?:[._]\d+)+$"#, options: [.regularExpression, .caseInsensitive]) != nil
      {
        removed.append(tokens.removeLast())
        continue
      }
      if tokens.count > 1,
        rawLast.range(of: #"^v\d+$"#, options: [.regularExpression, .caseInsensitive]) != nil
      {
        removed.append(tokens.removeLast())
        continue
      }
      let withoutAttachedDate = rawLast.replacingOccurrences(
        of: "(?i)\\d{1,2}\(monthPattern)$",
        with: "",
        options: .regularExpression
      )
      if withoutAttachedDate != rawLast {
        removed.append(String(rawLast.dropFirst(withoutAttachedDate.count)))
        if withoutAttachedDate.isEmpty {
          tokens.removeLast()
        } else {
          tokens[tokens.count - 1] = withoutAttachedDate
        }
        continue
      }
      if tokens.count > 2 {
        let triple = tokens.suffix(3).joined(separator: " ")
        let monthDayYear = "(?i)^\(monthPattern)\\s+\\d{1,2}(?:st|nd|rd|th)?\\s+\\d{4}$"
        let dayMonthYear = "(?i)^\\d{1,2}(?:st|nd|rd|th)?\\s+\(monthPattern)\\s+\\d{4}$"
        if triple.range(of: monthDayYear, options: .regularExpression) != nil
          || triple.range(of: dayMonthYear, options: .regularExpression) != nil
        {
          removed.append(contentsOf: tokens.suffix(3))
          tokens.removeLast(3)
          continue
        }
      }
      if tokens.count > 2 {
        let pair = tokens.suffix(2).joined(separator: " ")
        let ordinalThenMonth = "(?i)^\\d{1,2}(?:st|nd|rd|th)?\\s+\(monthPattern)$"
        let monthThenDayOrYear = "(?i)^\(monthPattern)\\s+(?:\\d{1,2}(?:st|nd|rd|th)?|\\d{4})$"
        if pair.range(of: ordinalThenMonth, options: .regularExpression) != nil
          || pair.range(of: monthThenDayOrYear, options: .regularExpression) != nil
        {
          removed.append(contentsOf: tokens.suffix(2))
          tokens.removeLast(2)
          continue
        }
        if pair.range(of: #"(?i)^version\s+\d+$"#, options: .regularExpression) != nil {
          removed.append(contentsOf: tokens.suffix(2))
          tokens.removeLast(2)
          continue
        }
      }
      if tokens.count > 1,
        rawLast.range(
          of: #"^\d{1,2}(?:st|nd|rd|th)?$"#, options: [.regularExpression, .caseInsensitive]) != nil
      {
        removed.append(tokens.removeLast())
        continue
      }
      break
    }
    if ownerName != "Unknown" {
      let ownerTokens = normalizeKey(ownerName).split(separator: " ").map(String.init)
      let titlePrefix = tokens.prefix(ownerTokens.count).map(normalizeKey)
      if tokens.count > ownerTokens.count, titlePrefix == ownerTokens {
        removed.append(contentsOf: tokens.prefix(ownerTokens.count))
        tokens.removeFirst(ownerTokens.count)
      }
    }
    let display = tokens.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    return (display, normalizeKey(display), removed)
  }

  private func normalizeKey(_ value: String) -> String {
    value.folding(
      options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
      locale: Locale(identifier: "en_US_POSIX")
    )
    .replacingOccurrences(of: #"[^a-z0-9]+"#, with: " ", options: .regularExpression)
    .trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func compactedTitleKey(_ value: String) -> String {
    normalizeKey(value).replacingOccurrences(of: " ", with: "")
  }

  private func isGenericTitleKey(_ value: String) -> Bool {
    let generic: Set<String> = [
      "album files", "backup", "backups", "exports", "final album files", "masters",
      "mixes", "project", "projects", "samples", "stems",
    ]
    return generic.contains(normalizeKey(value))
  }

  private func relativePathComponents(child: URL, parent: URL) -> [String] {
    let childComponents = child.standardizedFileURL.pathComponents
    let parentComponents = parent.standardizedFileURL.pathComponents
    guard childComponents.starts(with: parentComponents) else { return [] }
    return Array(childComponents.dropFirst(parentComponents.count))
  }

  private func titleSupport(_ seed: SessionSeed) -> Double {
    seed.title.evidence.filter { $0.canonicalKey == seed.title.key }.reduce(0) { $0 + $1.weight }
  }

  private func titleSimilarity(_ lhs: String, _ rhs: String) -> Double {
    let left = Set(lhs.split(separator: " ").map(String.init))
    let right = Set(rhs.split(separator: " ").map(String.init))
    guard !left.isEmpty, !right.isEmpty else { return 0 }
    let tokenScore = Double(left.intersection(right).count) / Double(left.union(right).count)
    let compactLeft = lhs.replacingOccurrences(of: " ", with: "")
    let compactRight = rhs.replacingOccurrences(of: " ", with: "")
    if compactLeft == compactRight { return 0.95 }
    let distance = levenshtein(compactLeft, compactRight)
    let editScore = 1 - Double(distance) / Double(max(compactLeft.count, compactRight.count))
    return max(tokenScore, editScore)
  }

  private func levenshtein(_ lhs: String, _ rhs: String) -> Int {
    let left = Array(lhs)
    let right = Array(rhs)
    var previous = Array(0...right.count)
    for (leftIndex, leftCharacter) in left.enumerated() {
      var current = [leftIndex + 1]
      for (rightIndex, rightCharacter) in right.enumerated() {
        current.append(
          min(
            current[rightIndex] + 1,
            previous[rightIndex + 1] + 1,
            previous[rightIndex] + (leftCharacter == rightCharacter ? 0 : 1)
          ))
      }
      previous = current
    }
    return previous.last ?? 0
  }

  private func revisionSort(_ lhs: StudioSetRevision, _ rhs: StudioSetRevision) -> Bool {
    switch (lhs.timestamp.value, rhs.timestamp.value) {
    case (let left?, let right?):
      if left != right { return left < right }
    case (nil, _?): return false
    case (_?, nil): return true
    case (nil, nil): break
    }
    return lhs.set.fileURL.path.localizedStandardCompare(rhs.set.fileURL.path) == .orderedAscending
  }

  private func sessionSort(_ lhs: StudioSession, _ rhs: StudioSession) -> Bool {
    let left = lhs.revisions.compactMap(\.timestamp.value).min()
    let right = rhs.revisions.compactMap(\.timestamp.value).min()
    switch (left, right) {
    case (let left?, let right?):
      if left != right { return left < right }
    case (_?, nil): return true
    case (nil, _?): return false
    case (nil, nil): break
    }
    return lhs.rootURL.path.localizedStandardCompare(rhs.rootURL.path) == .orderedAscending
  }

  private func workSort(_ lhs: StudioWork, _ rhs: StudioWork) -> Bool {
    let artistOrder = lhs.artist.displayName.localizedStandardCompare(rhs.artist.displayName)
    if artistOrder != .orderedSame { return artistOrder == .orderedAscending }
    return lhs.displayName.localizedStandardCompare(rhs.displayName) == .orderedAscending
  }
}

private struct OwnerSeed: Sendable {
  let id: String
  let displayName: String
  let confidence: OrganisationConfidence
  let evidence: [OrganisationEvidence]

  static let unknown = OwnerSeed(
    id: StableID.forValue("artist:unknown"),
    displayName: "Unknown",
    confidence: .unresolved,
    evidence: []
  )
}

private struct TitleSeed: Sendable {
  let displayName: String
  let key: String
  let evidence: [CanonicalTitleEvidence]
}

private struct SessionSeed: Sendable {
  let project: StudioProject
  let owner: OwnerSeed
  let title: TitleSeed
  let groupingKey: String
  let hasOverride: Bool
  let managedWorkID: String?
}

private struct OwnerComponent {
  let name: String
  let url: URL
  let titleComponentOffset: Int
}
