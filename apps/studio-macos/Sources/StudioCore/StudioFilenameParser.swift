import Foundation

public enum StudioVariantKind: String, Codable, Sendable, CaseIterable {
  case cleanEdit
  case explicit
  case instrumental
  case acapella
  case radioEdit
  case extended
}

public enum StudioWorkflowStateKind: String, Codable, Sendable, CaseIterable {
  case idea
  case rough
  case workInProgress
  case clientReview
  case approved
  case finalCandidate
  case print
}

public struct FilenameVariantEvidence: Codable, Sendable, Equatable {
  public let kind: StudioVariantKind
  public let rawToken: String
  public let confidence: OrganisationConfidence

  public init(
    kind: StudioVariantKind,
    rawToken: String,
    confidence: OrganisationConfidence = .suggested
  ) {
    self.kind = kind
    self.rawToken = rawToken
    self.confidence = confidence
  }
}

public struct FilenameSessionRoleEvidence: Codable, Sendable, Equatable {
  public let kind: SessionRole
  public let rawToken: String
  public let confidence: OrganisationConfidence

  public init(
    kind: SessionRole,
    rawToken: String,
    confidence: OrganisationConfidence = .suggested
  ) {
    self.kind = kind
    self.rawToken = rawToken
    self.confidence = confidence
  }
}

public struct FilenameWorkflowStateEvidence: Codable, Sendable, Equatable {
  public let kind: StudioWorkflowStateKind
  public let rawToken: String
  public let confidence: OrganisationConfidence

  public init(
    kind: StudioWorkflowStateKind,
    rawToken: String,
    confidence: OrganisationConfidence = .suggested
  ) {
    self.kind = kind
    self.rawToken = rawToken
    self.confidence = confidence
  }
}

public struct StudioRevisionIdentifier: Codable, Sendable, Equatable {
  public let displayValue: String
  public let components: [Int]
  public let rawToken: String

  public init(displayValue: String, components: [Int], rawToken: String) {
    self.displayValue = displayValue
    self.components = components
    self.rawToken = rawToken
  }
}

public struct StudioFilenameInterpretation: Codable, Sendable, Equatable {
  public let rawFilename: String
  public let baseStem: String
  public let variant: FilenameVariantEvidence?
  public let sessionRole: FilenameSessionRoleEvidence?
  public let workflowState: FilenameWorkflowStateEvidence?
  public let revisionIdentifier: StudioRevisionIdentifier?
  public let unknownTokens: [String]
  public let parserVersion: String

  public init(
    rawFilename: String,
    baseStem: String,
    variant: FilenameVariantEvidence?,
    sessionRole: FilenameSessionRoleEvidence?,
    workflowState: FilenameWorkflowStateEvidence?,
    revisionIdentifier: StudioRevisionIdentifier?,
    unknownTokens: [String],
    parserVersion: String
  ) {
    self.rawFilename = rawFilename
    self.baseStem = baseStem
    self.variant = variant
    self.sessionRole = sessionRole
    self.workflowState = workflowState
    self.revisionIdentifier = revisionIdentifier
    self.unknownTokens = unknownTokens
    self.parserVersion = parserVersion
  }
}

public struct StudioFilenameParser: Sendable {
  public static let algorithmVersion = "studio-filename-v1"

  public init() {}

  public func parse(_ filename: String) -> StudioFilenameInterpretation {
    let pathExtension = (filename as NSString).pathExtension.lowercased()
    let knownExtensions: Set<String> = [
      "als", "alp", "alc", "wav", "aif", "aiff", "caf", "flac", "mp3", "m4a", "ogg",
    ]
    let stem = knownExtensions.contains(pathExtension)
      ? (filename as NSString).deletingPathExtension : filename
    var tokens = stem.split(whereSeparator: { $0 == "_" || $0 == "-" }).map(String.init)
    if tokens.isEmpty { tokens = [stem] }

    var revisionIdentifier: StudioRevisionIdentifier?
    if let last = tokens.last, let parsed = Self.revisionIdentifier(last) {
      revisionIdentifier = parsed
      tokens.removeLast()
    }

    let qualifierStart = tokens.indices.first { index in
      index > tokens.startIndex && Self.isKnownQualifier(tokens[index])
    }

    var variant: FilenameVariantEvidence?
    var role: FilenameSessionRoleEvidence?
    var workflow: FilenameWorkflowStateEvidence?
    var unknown: [String] = []
    let baseTokens: ArraySlice<String>

    if let qualifierStart {
      baseTokens = tokens[..<qualifierStart]
      for token in tokens[qualifierStart...] {
        let normalized = Self.normalized(token)
        if let kind = Self.variantKind(normalized) {
          variant = FilenameVariantEvidence(kind: kind, rawToken: token)
        } else if let kind = Self.roleKind(normalized) {
          role = FilenameSessionRoleEvidence(kind: kind, rawToken: token)
        } else if let kind = Self.workflowKind(normalized) {
          workflow = FilenameWorkflowStateEvidence(kind: kind, rawToken: token)
        } else {
          unknown.append(token)
        }
      }
    } else {
      baseTokens = tokens[...]
    }

    let baseStem = baseTokens.joined(separator: "_").trimmingCharacters(in: .whitespaces)
    return StudioFilenameInterpretation(
      rawFilename: filename,
      baseStem: baseStem.isEmpty ? stem : baseStem,
      variant: variant,
      sessionRole: role,
      workflowState: workflow,
      revisionIdentifier: revisionIdentifier,
      unknownTokens: unknown,
      parserVersion: Self.algorithmVersion
    )
  }

  private static func revisionIdentifier(_ token: String) -> StudioRevisionIdentifier? {
    let normalized = token.lowercased()
      .replacingOccurrences(of: #"^(?:v|rev)"#, with: "", options: .regularExpression)
    guard normalized.range(of: #"^\d+(?:\.\d+)*$"#, options: .regularExpression) != nil else {
      return nil
    }
    let components = normalized.split(separator: ".").compactMap { Int($0) }
    guard !components.isEmpty else { return nil }
    return StudioRevisionIdentifier(
      displayValue: normalized,
      components: components,
      rawToken: token
    )
  }

  private static func isKnownQualifier(_ token: String) -> Bool {
    let value = normalized(token)
    return variantKind(value) != nil || roleKind(value) != nil || workflowKind(value) != nil
  }

  private static func normalized(_ token: String) -> String {
    token.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: " ", with: "")
  }

  private static func variantKind(_ value: String) -> StudioVariantKind? {
    switch value {
    case "clean": .cleanEdit
    case "explicit", "dirty": .explicit
    case "instrumental", "inst": .instrumental
    case "acapella", "a-cappella", "acappella": .acapella
    case "radio", "radioedit": .radioEdit
    case "extended": .extended
    default: nil
    }
  }

  private static func roleKind(_ value: String) -> SessionRole? {
    switch value {
    case "prod", "production": .production
    case "vocaledit", "vocals": .vocalEdit
    case "mix", "mixdown", "mixing": .mix
    case "master", "mastering": .master
    case "stems", "stemprep": .stemPreparation
    case "live", "pa": .live
    default: nil
    }
  }

  private static func workflowKind(_ value: String) -> StudioWorkflowStateKind? {
    switch value {
    case "idea": .idea
    case "rough": .rough
    case "wip": .workInProgress
    case "client": .clientReview
    case "approved": .approved
    case "final": .finalCandidate
    case "print": .print
    default: nil
    }
  }
}
