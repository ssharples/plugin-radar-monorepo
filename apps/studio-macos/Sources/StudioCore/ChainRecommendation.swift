import Foundation

public enum ProductionContext: String, Codable, CaseIterable, Sendable {
  case vocal
  case guitar
  case bass
  case drums
  case keys
  case synth
  case mixBus
  case master
  case other
}

public struct ChainRecommendation: Codable, Identifiable, Sendable, Equatable {
  public let id: String
  public let context: ProductionContext
  public let family: ChainFamily
  public let representative: ChainOccurrence
  public let score: Double
  public let reasons: [String]
  public let missingPluginCount: Int

  public init(
    id: String,
    context: ProductionContext,
    family: ChainFamily,
    representative: ChainOccurrence,
    score: Double,
    reasons: [String],
    missingPluginCount: Int
  ) {
    self.id = id
    self.context = context
    self.family = family
    self.representative = representative
    self.score = score
    self.reasons = reasons
    self.missingPluginCount = missingPluginCount
  }
}

/// Produces private, explainable suggestions from the producer's own indexed history.
/// This is the deterministic baseline that a future consented ML model must beat.
public struct ChainRecommendationEngine: Sendable {
  public init() {}

  public func recommend(
    for context: ProductionContext,
    library: PersonalChainLibrary,
    limit: Int = 8,
    now: Date = Date()
  ) -> [ChainRecommendation] {
    guard limit > 0 else { return [] }
    return library.families.compactMap { family in
      recommendation(for: family, context: context, now: now)
    }
    .sorted {
      if $0.score != $1.score { return $0.score > $1.score }
      return $0.family.displayName.localizedStandardCompare($1.family.displayName)
        == .orderedAscending
    }
    .prefix(limit)
    .map { $0 }
  }

  public func inferContext(trackName: String) -> ProductionContext {
    let value = normalizedWords(trackName)
    let rules: [(ProductionContext, Set<String>)] = [
      (.master, ["master", "main", "premaster", "finalizer"]),
      (.mixBus, ["mixbus", "mix", "twobus", "2bus", "bus"]),
      (.vocal, ["vocal", "vocals", "vox", "leadvox", "bv", "bvs", "harmony"]),
      (.guitar, ["guitar", "gtr", "acoustic", "electric"]),
      (.bass, ["bass", "sub"]),
      (.drums, ["drum", "drums", "kick", "snare", "hihat", "hat", "perc", "percussion"]),
      (.keys, ["keys", "piano", "organ", "rhodes", "wurli"]),
      (.synth, ["synth", "pad", "lead", "arp"]),
    ]
    return rules.first(where: { !$0.1.isDisjoint(with: value) })?.0 ?? .other
  }

  private func recommendation(
    for family: ChainFamily,
    context: ProductionContext,
    now: Date
  ) -> ChainRecommendation? {
    let matching = family.occurrences.filter { inferContext(trackName: $0.trackName) == context }
    let candidates = matching.isEmpty && context == .other ? family.occurrences : matching
    guard !candidates.isEmpty else { return nil }

    let representative = candidates.max { left, right in
      occurrenceScore(left, now: now) < occurrenceScore(right, now: now)
    }!
    let missingPluginCount =
      representative.compatibility?.evidence.count(where: {
        $0.status == .missing || $0.status == .versionMismatch
      }) ?? 0
    let compatibleCount =
      representative.compatibility?.evidence.count(where: {
        $0.status == .installed
      }) ?? 0
    let contextUseCount = matching.count
    let frequency = log2(Double(contextUseCount + 1)) * 20
    let projectBreadth = log2(Double(family.projectCount + 1)) * 8
    let recency = recencyScore(representative.modifiedAt, now: now) * 16
    let compatibility = Double(compatibleCount) * 2 - Double(missingPluginCount) * 24
    let score = max(0, frequency + projectBreadth + recency + compatibility)

    var reasons: [String] = []
    reasons.append(
      contextUseCount == 1
        ? "Used once on a similar track"
        : "Used \(contextUseCount) times on similar tracks"
    )
    if family.projectCount > 1 {
      reasons.append("Repeated across \(family.projectCount) projects")
    }
    if missingPluginCount == 0, representative.compatibility != nil {
      reasons.append("All detected plug-ins are available")
    } else if missingPluginCount > 0 {
      reasons.append("\(missingPluginCount) plug-in issue\(missingPluginCount == 1 ? "" : "s")")
    }
    if family.stateVariationCount > 1 {
      reasons.append("\(family.stateVariationCount) saved setting variations")
    }

    return ChainRecommendation(
      id: StableID.forValue("recommendation:\(context.rawValue):\(family.signature)"),
      context: context,
      family: family,
      representative: representative,
      score: score,
      reasons: reasons,
      missingPluginCount: missingPluginCount
    )
  }

  private func occurrenceScore(_ occurrence: ChainOccurrence, now: Date) -> Double {
    let compatibility =
      occurrence.compatibility?.evidence.reduce(into: 0.0) { score, evidence in
        switch evidence.status {
        case .installed: score += 2
        case .missing, .versionMismatch: score -= 8
        case .unknown: break
        }
      } ?? 0
    return compatibility + recencyScore(occurrence.modifiedAt, now: now)
  }

  private func recencyScore(_ date: Date?, now: Date) -> Double {
    guard let date else { return 0 }
    let ageInDays = max(0, now.timeIntervalSince(date) / 86_400)
    return exp(-ageInDays / 730)
  }

  private func normalizedWords(_ value: String) -> Set<String> {
    let components = value.lowercased().split { !$0.isLetter && !$0.isNumber }
    return Set(components.map(String.init))
  }
}
