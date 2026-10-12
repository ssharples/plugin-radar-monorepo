import StudioCore
import SwiftUI

struct SessionOrganisationReviewView: View {
  let session: StudioSession
  @Bindable var store: StudioLibraryStore

  @State private var artistName = ""
  @State private var workName = ""
  @State private var isElsewhereExpanded = false

  private var reviewCandidate: SessionContentReviewCandidate? {
    store.contentReviewCandidates(for: session.id).first
  }

  private var rankedSuggestions: [RankedSuggestion] {
    guard let reviewCandidate else { return [] }
    if let ranked = reviewCandidate.rankedCandidateEvidence, !ranked.isEmpty {
      let ordered = ranked.sorted {
        if $0.score != $1.score { return $0.score > $1.score }
        if $0.workID != $1.workID { return $0.workID < $1.workID }
        return $0.sessionID < $1.sessionID
      }
      return ordered.enumerated().map { index, candidate in
        RankedSuggestion(
          rank: index + 1,
          workID: candidate.workID,
          sessionID: candidate.sessionID,
          score: candidate.score,
          reviewSignalCount: candidate.reviewSignalCount,
          observation: candidate.observation
        )
      }
    }
    guard let observation = reviewCandidate.observation else { return [] }
    return [
      RankedSuggestion(
        rank: 1,
        workID: reviewCandidate.candidateWorkID,
        sessionID: observation.candidateRevisionReference.sessionID,
        score: reviewCandidate.score,
        reviewSignalCount: observation.distinctiveEvidenceKindCount,
        observation: observation
      )
    ]
  }

  private var workSuggestions: [String] {
    store.availableWorkNames(for: artistName)
  }

  private var reviewDestinationWorkSuggestions: [String] {
    store.availableReviewDestinationWorkNames(for: artistName)
  }

  private var evidenceCountColumns: [GridItem] {
    [GridItem(.adaptive(minimum: 86, maximum: 126), spacing: 8, alignment: .leading)]
  }

  private var isApplying: Bool { store.isApplyingContentReview }

  private var authoritySavedWithPendingCalibration: Bool {
    if case .authoritySavedCalibrationPending = store.sessionReviewActionState { return true }
    return false
  }

  var body: some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          header
          physicalSession
          actionStatus

          if let reviewCandidate, !authoritySavedWithPendingCalibration {
            rankedReview(reviewCandidate)
            reviewActions(reviewCandidate)
          } else if !authoritySavedWithPendingCalibration {
            manualAssignment
          }
        }
        .padding(28)
        .frame(maxWidth: .infinity, alignment: .leading)
      }

      Divider()
      HStack {
        Text("All organisation changes are virtual. Source files remain untouched.")
          .font(.caption)
          .foregroundStyle(.secondary)
        Spacer()
        Button("Close") { store.organisationSessionToEdit = nil }
          .keyboardShortcut(.cancelAction)
          .disabled(isApplying)
          .accessibilityHint("Closes this review without changing the physical Session.")
      }
      .padding(.horizontal, 28)
      .padding(.vertical, 14)
    }
    .frame(minWidth: 860, idealWidth: 920, minHeight: 560, idealHeight: 650)
    .tint(.black)
    .interactiveDismissDisabled(isApplying)
    .onExitCommand {
      guard !isApplying else { return }
      store.organisationSessionToEdit = nil
    }
    .onAppear(perform: populateCurrentAssignment)
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 7) {
      Text(reviewCandidate == nil ? "Organise Session" : "Review Session organisation")
        .font(.title2.weight(.semibold))
      Text(
        reviewCandidate == nil
          ? "Link this physical project to a virtual Artist and Song."
          : "Compare local content evidence before deciding whether this Session belongs with an existing Song."
      )
      .foregroundStyle(.secondary)
      .fixedSize(horizontal: false, vertical: true)

      if reviewCandidate != nil {
        Label("Review only - no automatic attachment is authorised", systemImage: "hand.raised")
          .font(.callout.weight(.medium))
          .foregroundStyle(.secondary)
          .accessibilityHint(
            "Production calibration is unavailable, so Studio Time Machine will not attach this Session automatically."
          )
      }
    }
  }

  private var physicalSession: some View {
    GroupBox("Selected physical Session") {
      VStack(alignment: .leading, spacing: 7) {
        Text(session.displayName).font(.headline)
        LocalPathText(url: session.rootURL)
      }
      .padding(4)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("Selected physical Session")
    .accessibilityValue("\(session.displayName), \(session.rootURL.path)")
    .accessibilityHint("This folder is indexed read-only and will not be moved or renamed.")
  }

  @ViewBuilder
  private var actionStatus: some View {
    switch store.sessionReviewActionState {
    case .idle:
      EmptyView()
    case .applying:
      statusPanel(
        title: "Saving reviewed choice",
        message: "Updating local organisation authority and its private calibration record.",
        systemImage: "progress.indicator"
      )
    case .authoritySavedCalibrationPending(let message):
      statusPanel(
        title: "Organisation choice saved",
        message: message,
        systemImage: "exclamationmark.triangle"
      )
    case .failed(let message):
      statusPanel(
        title: "The choice could not be saved",
        message: message,
        systemImage: "xmark.octagon"
      )
    }
  }

  private func statusPanel(title: String, message: String, systemImage: String) -> some View {
    HStack(alignment: .top, spacing: 11) {
      Image(systemName: systemImage)
        .frame(width: 18)
      VStack(alignment: .leading, spacing: 4) {
        Text(title).font(.headline)
        Text(message)
          .font(.callout)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.quaternary.opacity(0.55), in: RoundedRectangle(cornerRadius: 10))
    .accessibilityElement(children: .combine)
    .accessibilityLabel(title)
    .accessibilityValue(message)
  }

  private func rankedReview(_ candidate: SessionContentReviewCandidate) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 3) {
          Text("Ranked candidates")
            .font(.headline)
          Text("Exact weighted comparisons, ordered by the local review score.")
            .font(.callout)
            .foregroundStyle(.secondary)
        }
        Spacer()
        Text("\(rankedSuggestions.count) candidates")
          .font(.caption.weight(.medium))
          .foregroundStyle(.secondary)
      }

      VStack(spacing: 12) {
        ForEach(rankedSuggestions) { suggestion in
          rankedSuggestion(suggestion)
        }
      }

      if let generation = candidate.candidateGeneration {
        candidateGenerationDisclosure(generation)
      }
    }
  }

  private func rankedSuggestion(_ suggestion: RankedSuggestion) -> some View {
    let observation = suggestion.observation
    let workName = store.contentReviewWorkName(for: suggestion.workID)
    let artistName = store.contentReviewArtistName(for: suggestion.workID)
    let sessionName = store.contentReviewSessionName(for: suggestion.sessionID)

    return GroupBox {
      VStack(alignment: .leading, spacing: 14) {
        HStack(alignment: .top, spacing: 12) {
          Text("#\(suggestion.rank)")
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(.quaternary, in: Capsule())
            .accessibilityLabel("Rank \(suggestion.rank)")

          VStack(alignment: .leading, spacing: 3) {
            Text(relationshipTitle(observation, candidateName: workName))
              .font(.headline)
            Text("\(artistName) / \(workName)")
              .font(.callout.weight(.medium))
            Text("Candidate Session: \(sessionName)")
              .font(.caption)
              .foregroundStyle(.secondary)
          }

          Spacer(minLength: 20)

          VStack(alignment: .trailing, spacing: 2) {
            Text(percent(suggestion.score))
              .font(.title3.monospacedDigit().weight(.semibold))
            Text("review score")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          .accessibilityElement(children: .combine)
          .accessibilityLabel("Review score")
          .accessibilityValue(percent(suggestion.score))
          .accessibilityHint("This ranking score is evidence for review, not a probability.")
        }

        HStack(spacing: 18) {
          directionalScore(
            label: "Selected contains candidate",
            value: observation.sourceContainsCandidateScore,
            help: "Distinctive weighted material from the candidate found in the selected Session."
          )
          directionalScore(
            label: "Candidate contains selected",
            value: observation.candidateContainsSourceScore,
            help: "Distinctive weighted material from the selected Session found in the candidate."
          )
        }

        LazyVGrid(columns: evidenceCountColumns, alignment: .leading, spacing: 8) {
          evidenceCount("Exact", count: observation.exactEvidenceCount)
          if let count = observation.pcmEvidenceCount {
            evidenceCount("PCM", count: count)
          }
          if let count = observation.excerptEvidenceCount {
            evidenceCount("Excerpt", count: count)
          }
          evidenceCount("Placement", count: observation.placementEvidenceCount)
          evidenceCount("MIDI", count: observation.midiStructureEvidenceCount)
          evidenceCount("Arrangement", count: observation.arrangementEvidenceCount)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Evidence counts")
        .accessibilityValue(evidenceCountsAccessibilityValue(observation))

        HStack {
          Spacer()
          Text("Runner-up margin \(percent(observation.runnerUpMargin))")
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
            .accessibilityLabel("Runner-up margin")
            .accessibilityValue(percent(observation.runnerUpMargin))
        }

        if !observation.conflicts.isEmpty {
          Label(
            observation.conflicts.map(conflictLabel).joined(separator: ", "),
            systemImage: "exclamationmark.triangle"
          )
          .font(.caption)
          .foregroundStyle(.secondary)
          .accessibilityLabel("Review conflicts")
          .accessibilityValue(observation.conflicts.map(conflictLabel).joined(separator: ", "))
        }

        DisclosureGroup("Evidence and limits") {
          evidenceDetails(observation, reviewSignalCount: suggestion.reviewSignalCount)
            .padding(.top, 10)
        }
        .font(.callout.weight(.medium))
        .accessibilityHint(
          "Expands distinctive matches, suppressed common material, evidence scope, duration limits, and algorithm details."
        )
      }
      .padding(5)
    }
    .accessibilityElement(children: .contain)
  }

  private func directionalScore(label: String, value: Double, help: String) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack {
        Text(label)
          .font(.caption)
          .foregroundStyle(.secondary)
        Spacer()
        Text(percent(value))
          .font(.caption.monospacedDigit().weight(.medium))
      }
      ProgressView(value: value, total: 1)
        .progressViewStyle(.linear)
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(label)
    .accessibilityValue(percent(value))
    .accessibilityHint(help)
  }

  private func evidenceCount(_ label: String, count: Int) -> some View {
    Text("\(label) \(count)")
      .font(.caption.monospacedDigit())
      .padding(.horizontal, 8)
      .padding(.vertical, 5)
      .background(.quaternary.opacity(0.65), in: Capsule())
      .accessibilityLabel("\(label) evidence")
      .accessibilityValue("\(count) matches")
  }

  private func evidenceCountsAccessibilityValue(
    _ observation: DirectionalSessionContainmentObservation
  ) -> String {
    var values = ["Exact: \(observation.exactEvidenceCount)"]
    if let count = observation.pcmEvidenceCount { values.append("PCM: \(count)") }
    if let count = observation.excerptEvidenceCount { values.append("Excerpt: \(count)") }
    values.append("Placement: \(observation.placementEvidenceCount)")
    values.append("MIDI: \(observation.midiStructureEvidenceCount)")
    values.append("Arrangement: \(observation.arrangementEvidenceCount)")
    return values.joined(separator: "; ")
  }

  private func evidenceDetails(
    _ observation: DirectionalSessionContainmentObservation,
    reviewSignalCount: Int
  ) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      Text(observation.explanation)
        .font(.callout)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)

      detailSection("Distinctive matched material") {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(observation.matchedEvidenceGroups) { group in
            VStack(alignment: .leading, spacing: 3) {
              HStack {
                Text(evidenceFamilyLabel(group.family))
                Spacer()
                Text("\(group.matchCount) matches")
                  .foregroundStyle(.secondary)
              }
              Text(
                "Selected: \(anchorSummary(group.sourceAnchorIDs)) | Candidate: \(anchorSummary(group.candidateAnchorIDs))"
              )
              .font(.caption.monospaced())
              .foregroundStyle(.secondary)
              .textSelection(.enabled)
            }
            .accessibilityElement(children: .combine)
          }
          Text(
            "\(observation.distinctiveAnchorCount) distinctive anchors across \(reviewSignalCount) review signals and \(observation.independentSourceMaterialCount) independent source materials."
          )
          .font(.caption)
          .foregroundStyle(.secondary)
        }
      }

      detailSection("Suppressed or common evidence") {
        if observation.suppressedAnchors.isEmpty {
          Text("No anchors were suppressed for this comparison.")
            .foregroundStyle(.secondary)
        } else {
          VStack(alignment: .leading, spacing: 7) {
            ForEach(observation.suppressedAnchors) { anchor in
              HStack(alignment: .firstTextBaseline) {
                Text(suppressionLabel(anchor.reason))
                Spacer()
                Text(
                  "\(anchor.side.rawValue.capitalized), seen in \(anchor.corpusFrequency) Sessions"
                )
                .foregroundStyle(.secondary)
              }
              .accessibilityElement(children: .combine)
            }
          }
        }
      }

      detailSection("Evidence scope and duration") {
        VStack(alignment: .leading, spacing: 7) {
          detailRow(
            "Selected Session",
            value:
              "\(scopeLabel(observation.sourceEvidenceScope)), \(durationLabel(observation.sourceMeasuredAudioDurationSeconds, policy: observation.sourceAudioDurationPolicy))"
          )
          detailRow(
            "Candidate Session",
            value:
              "\(scopeLabel(observation.candidateEvidenceScope)), \(durationLabel(observation.candidateMeasuredAudioDurationSeconds, policy: observation.candidateAudioDurationPolicy))"
          )
          detailRow(
            "Revision coverage",
            value:
              "\(observation.sourceEvidenceRevisionReferences.count) selected / \(observation.candidateEvidenceRevisionReferences.count) candidate revisions"
          )
          detailRow(
            "Unavailable evidence",
            value: unavailableEvidenceLabel(observation.unavailableEvidenceFamilies)
          )
          detailRow("Chronology", value: compatibilityLabel(observation.chronologyCompatibility))
          detailRow("Artist", value: compatibilityLabel(observation.artistCompatibility))
        }
      }

      detailSection("Method") {
        VStack(alignment: .leading, spacing: 7) {
          detailRow("Algorithm", value: observation.algorithmFamily)
          detailRow("Version", value: observation.algorithmVersion)
          detailRow("Calibration", value: observation.calibrationID ?? "Unavailable - review only")
          detailRow(
            "Weighted match",
            value:
              "\(decimal(observation.weightedIntersectionTotal)) intersection; \(decimal(observation.sourceMatchedWeightTotal))/\(decimal(observation.sourceWeightTotal)) selected; \(decimal(observation.candidateMatchedWeightTotal))/\(decimal(observation.candidateWeightTotal)) candidate"
          )
        }
      }
    }
  }

  private func detailSection<Content: View>(
    _ title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
      content()
        .font(.caption)
    }
  }

  private func detailRow(_ label: String, value: String) -> some View {
    HStack(alignment: .firstTextBaseline) {
      Text(label)
      Spacer(minLength: 18)
      Text(value)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.trailing)
        .textSelection(.enabled)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(label)
    .accessibilityValue(value)
  }

  private func candidateGenerationDisclosure(
    _ generation: SessionContentCandidateGenerationMetadata
  ) -> some View {
    DisclosureGroup("Candidate search limits") {
      VStack(alignment: .leading, spacing: 7) {
        detailRow("Candidate pool", value: "\(generation.candidatePoolCount)")
        detailRow("Shortlisted", value: "\(generation.shortlistedCandidateCount)")
        detailRow(
          "Exact comparisons",
          value:
            "\(generation.exactComparisonCandidateCount) of \(generation.candidatePoolCount), limit \(generation.exactComparisonCandidateLimit)"
        )
        detailRow(
          "Retrieval",
          value:
            "\(generation.deterministicOverlapCandidateCount) deterministic overlap; \(generation.sketchBandCandidateCount) sketch band"
        )
        detailRow(
          "Parity",
          value: generation.parityDisposition?.rawValue ?? "unknown"
        )
        detailRow(
          "Generator",
          value: "\(generation.algorithmFamily) / \(generation.algorithmVersion)"
        )
      }
      .padding(.top, 9)
    }
    .font(.callout.weight(.medium))
    .accessibilityHint("Expands the bounded candidate search and exact-comparison limits.")
  }

  private func reviewActions(_ candidate: SessionContentReviewCandidate) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        Text("Record a decision")
          .font(.headline)
        Text(
          "The decision becomes local organisation authority. Calibration delivery is recorded separately."
        )
        .font(.callout)
        .foregroundStyle(.secondary)
      }

      HStack(spacing: 10) {
        Button("Accept") {
          store.applyContentReviewAction(.accept, to: candidate)
        }
        .buttonStyle(.borderedProminent)
        .accessibilityHint(
          "Assigns this Session to \(store.contentReviewWorkName(for: candidate.candidateWorkID))."
        )

        Button("Keep separate") {
          store.applyContentReviewAction(.keepSeparate, to: candidate)
        }
        .accessibilityHint("Keeps this Session outside the suggested Song.")

        Button("Assign elsewhere") {
          let cleanArtist = artistName.trimmingCharacters(in: .whitespacesAndNewlines)
          let cleanWork = workName.trimmingCharacters(in: .whitespacesAndNewlines)
          if cleanArtist.isEmpty || cleanWork.isEmpty { isElsewhereExpanded = true }
          store.assignContentReviewCandidateElsewhere(
            candidate,
            artistName: cleanArtist,
            workName: cleanWork
          )
        }
        .accessibilityHint("Uses the different Artist and Song selected below.")

        Button("Reject", role: .destructive) {
          store.applyContentReviewAction(.reject, to: candidate)
        }
        .accessibilityHint("Rejects this suggested Song match.")

        Spacer()
      }
      .disabled(isApplying)

      DisclosureGroup("Choose a different Artist and Song", isExpanded: $isElsewhereExpanded) {
        VStack(alignment: .leading, spacing: 14) {
          if rankedSuggestions.count > 1 {
            VStack(alignment: .leading, spacing: 7) {
              Text("Other ranked candidates")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
              HStack(spacing: 8) {
                ForEach(rankedSuggestions.dropFirst()) { suggestion in
                  Button(store.contentReviewWorkName(for: suggestion.workID)) {
                    artistName = store.contentReviewArtistName(for: suggestion.workID)
                    workName = store.contentReviewWorkName(for: suggestion.workID)
                  }
                  .accessibilityHint(
                    "Fills the elsewhere target with rank \(suggestion.rank), \(store.contentReviewArtistName(for: suggestion.workID)), \(store.contentReviewWorkName(for: suggestion.workID))."
                  )
                }
              }
            }
          }

          organisationField(
            title: "Artist / Client",
            value: $artistName,
            suggestions: store.availableReviewDestinationArtistNames,
            prompt: "Choose an existing virtual Artist"
          )
          organisationField(
            title: "Song",
            value: $workName,
            suggestions: reviewDestinationWorkSuggestions,
            prompt: "Choose an existing virtual Song"
          )
        }
        .padding(.top, 10)
      }
      .font(.callout.weight(.medium))
      .accessibilityHint(
        "Expands the manual Artist and Song fallback for the Assign elsewhere decision."
      )
    }
  }

  private var manualAssignment: some View {
    VStack(alignment: .leading, spacing: 16) {
      VStack(alignment: .leading, spacing: 4) {
        Text("Manual organisation")
          .font(.headline)
        Text("No ranked content suggestion is available. Choose or create a virtual destination.")
          .font(.callout)
          .foregroundStyle(.secondary)
      }
      organisationField(
        title: "Artist / Client",
        value: $artistName,
        suggestions: store.availableArtistNames,
        prompt: "Choose an existing Artist or type a new one"
      )
      organisationField(
        title: "Song",
        value: $workName,
        suggestions: workSuggestions,
        prompt: "Choose an existing Song or type a new one"
      )
      HStack {
        Spacer()
        Button("Assign Session") {
          store.assignSession(session, artistName: artistName, workName: workName)
        }
        .buttonStyle(.borderedProminent)
        .disabled(
          artistName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || workName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        )
        .accessibilityHint("Creates a virtual assignment without moving or renaming files.")
      }
    }
  }

  private func organisationField(
    title: String,
    value: Binding<String>,
    suggestions: [String],
    prompt: String
  ) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title).font(.callout.weight(.medium))
      HStack(spacing: 8) {
        TextField(prompt, text: value)
          .textFieldStyle(.roundedBorder)
          .accessibilityLabel(title)
          .accessibilityHint(prompt)
        Menu {
          if suggestions.isEmpty {
            Text("No existing values")
          } else {
            ForEach(suggestions, id: \.self) { suggestion in
              Button(suggestion) { value.wrappedValue = suggestion }
            }
          }
        } label: {
          Label("Choose existing", systemImage: "chevron.up.chevron.down")
        }
        .menuStyle(.borderlessButton)
        .fixedSize()
        .accessibilityLabel("Choose an existing \(title)")
      }
    }
  }

  private func populateCurrentAssignment() {
    guard
      let current = store.workCatalog?.works.first(where: {
        $0.sessions.contains(where: { $0.id == session.id })
      })
    else { return }
    if current.artist.displayName != "Unknown" { artistName = current.artist.displayName }
    workName = current.displayName
  }

  private func relationshipTitle(
    _ observation: DirectionalSessionContainmentObservation,
    candidateName: String
  ) -> String {
    if observation.sourceContainsCandidateScore >= 0.9
      && observation.candidateContainsSourceScore >= 0.9
    {
      return "Possible duplicate Session"
    }
    if observation.sourceContainsCandidateScore
      > observation.candidateContainsSourceScore + 0.12
    {
      return "Likely evolved from \(candidateName)"
    }
    return "Possible match for \(candidateName)"
  }

  private func percent(_ value: Double) -> String {
    value.formatted(.percent.precision(.fractionLength(0)))
  }

  private func decimal(_ value: Double) -> String {
    value.formatted(.number.precision(.fractionLength(1)))
  }

  private func anchorSummary(_ anchorIDs: [String]) -> String {
    guard !anchorIDs.isEmpty else { return "none" }
    let visible = anchorIDs.prefix(3).joined(separator: ", ")
    return anchorIDs.count > 3 ? "\(visible), +\(anchorIDs.count - 3)" : visible
  }

  private func evidenceFamilyLabel(_ family: DirectionalContainmentEvidenceFamily) -> String {
    switch family {
    case .exact: "Exact content"
    case .placement: "Clip placement"
    case .midiStructure: "MIDI structure"
    case .arrangement: "Arrangement order"
    }
  }

  private func suppressionLabel(_ reason: DirectionalContainmentSuppressionReason) -> String {
    switch reason {
    case .commonCorpusMaterial: "Common corpus material"
    case .templateMaterial: "Template structure"
    case .externalLibraryMaterial: "External library material"
    case .unverifiedMutableIdentity: "Unverified mutable reference"
    }
  }

  private func conflictLabel(_ conflict: DirectionalContainmentConflict) -> String {
    switch conflict {
    case .artistMismatch: "Artist conflict"
    case .chronologyMismatch: "Chronology conflict"
    case .directionReversal: "Direction reversal"
    case .closeRunnerUp: "Close runner-up"
    case .insufficientIndependentEvidence: "Insufficient independent evidence"
    case .durableRejection: "Previously rejected"
    case .incompatibleEvidenceScope: "Incompatible evidence scope"
    }
  }

  private func scopeLabel(_ scope: SessionContentEvidenceScope) -> String {
    switch scope {
    case .fullSession: "Full Session scope"
    case .activeRevision: "Active revision scope"
    case .selectedRevision: "Selected revision scope"
    }
  }

  private func durationLabel(
    _ duration: Double?,
    policy: SessionContentAudioDurationPolicy
  ) -> String {
    let policyLabel: String =
      switch policy {
      case .completeFile: "complete-file audio"
      case .boundedPrefix: "bounded-prefix audio"
      case .unknown: "unknown audio coverage"
      }
    guard let duration else { return "\(policyLabel), duration unknown" }
    return
      "\(policyLabel), \(duration.formatted(.number.precision(.fractionLength(0)))) seconds measured"
  }

  private func unavailableEvidenceLabel(
    _ families: [DirectionalContainmentUnavailableEvidenceFamily]
  ) -> String {
    guard !families.isEmpty else { return "None reported" }
    return families.map { family in
      switch family {
      case .pcm: "PCM identity"
      case .excerpt: "Excerpt matching"
      }
    }.joined(separator: ", ")
  }

  private func compatibilityLabel(
    _ compatibility: DirectionalContainmentChronologyCompatibility
  ) -> String {
    switch compatibility {
    case .compatible: "Compatible"
    case .conflict: "Conflict - review required"
    case .unknown: "Unknown - review required"
    }
  }

  private func compatibilityLabel(
    _ compatibility: DirectionalContainmentArtistCompatibility
  ) -> String {
    switch compatibility {
    case .compatible: "Compatible"
    case .conflict: "Conflict - review required"
    case .unknown: "Unknown - review required"
    }
  }
}

private struct RankedSuggestion: Identifiable {
  let rank: Int
  let workID: String
  let sessionID: String
  let score: Double
  let reviewSignalCount: Int
  let observation: DirectionalSessionContainmentObservation

  var id: String { "\(rank):\(workID):\(sessionID)" }
}
