# Content Intelligence and Portability Plan

## Context

This plan executes `apps/studio-macos/docs/content-intelligence-and-portability.md` inside the
linked worktree at
`/Users/test/Development/Projects/plugin-radar-monorepo-ableton-indexer/apps/studio-macos`.

Current audit summary before dispatch:

- `SessionContentManifestBuilder`, `SessionContentLineageResolver`, `SessionContentOrganisationEngine`,
  `AudioArtifactLinker`, `AudioLineageStore`, `LocalLandmarkAudioMatcher`, `AudioMatchingCoordinator`,
  `ProjectReadinessAuditor`, `ProjectHandoffPlan`, `ProjectHandoffReportGenerator`, and the current
  Logic read-only adapter already exist.
- The current session-lineage logic is weighted but still symmetric and Work-targeted. It does not
  persist the directional containment observation contract, runner-up chronology conflict detail, or
  asymmetric candidate-sketch parity required by the spec.
- Export linking does not yet parse BWF/RF64/BW64/iXML metadata or persist sidecar-ready Export DNA
  evidence.
- Project readiness audits exist, but they do not yet classify the full project-boundary and
  portability evidence required by the spec.
- Research matchers remain unavailable by default and must stay that way until their explicit
  calibration gates pass.

## Global Constraints

- Preserve every indexed music file. Never move, rename, overwrite, save, freeze, bounce, collect,
  upload, email, or delete user material without a reviewed plan and exact-step approval.
- Local-first and truthful provenance remain product invariants. Suggestions are not verified facts.
- Keep the source `StudioLibraryIndex` physically truthful and layer Artist, Song, Session, revision,
  export, delivery, and managed-library records above it.
- Similarity never becomes verified identity. Uncalibrated transformed or musical similarity remains
  suggestion-only. User assignments, separations, and rejections remain authoritative.
- Keep the physically truthful `StudioLibraryIndex` separate from virtual organisation and the
  reviewed `StudioRevisionReference` action boundary.
- All analysis stays local. Do not upload audio, create accounts, send email, or add provider keys.
- Do not move, rename, overwrite, delete, collect, save, freeze, bounce, or rewrite indexed music.
- Do not launch or manipulate real Ableton/Logic, run a real export, or stage inside a tracked music
  root without fresh exact-step approval. Simulated fixtures are expected.
- Keep production ML capabilities unavailable until a labelled-corpus report, held-out evaluation,
  calibration, licence/model-rights review, and resource budget are accepted.
- Keep current sample/demo launch arguments working for deterministic UI QA and do not confuse them
  with real library state.
- No task is complete until it has focused/adversarial tests, `swift test`, release builds for
  `StudioTimeMachine` and `studio-index`, formatting/diff review, and independent SPEC PASS plus
  QUALITY APPROVED with no open Critical or Important findings. UI tasks also require rendered macOS
  and Accessibility proof using deterministic fixtures.

## Dependency Graph

- Task 1 must land before Tasks 2 and 6.
- Task 3 must land before Task 4.
- Task 5 must land before any project-copy, portability, or handoff surfaces that consume the richer
  audit evidence.
- Task 6 depends on Task 1 and must preserve exact-decision parity with Task 1.
- Task 7 depends on the current Ableton parser and becomes the adapter-neutral project boundary for
  later DAW adapters.
- Task 8 depends on Task 7.
- Task 9 may reuse the existing `AudioMatchingEngine` contracts but must not activate automatic
  decisions without Task 13.
- Tasks 10, 11, and 12 may extend matcher registries and research harnesses but must remain
  unavailable-by-default until Task 13 is accepted.
- Task 13 is the durable storage and evaluation gate for Tasks 1, 4, 9, 10, 11, and 12.

## Ownership Map

- Task 1 owns session containment models, scoring, review-candidate persistence, and organisation
  integration only. No other task edits those files until Task 1 is accepted.
- Task 3 owns RIFF/BWF/iXML parsing and Export DNA metadata models only.
- Task 5 owns project-boundary audit classifications, portability evidence, and project-readiness
  reporting only.
- Task 4 is the only task allowed to integrate Export DNA with artifact association after Task 3
  lands.
- Task 7 is the only task allowed to introduce `StudioProjectInterchange` core types.
- Task 13 is the only task allowed to define durable calibration/review-label storage.

## Task 1: Directional containment core and review evidence

Deliver the deterministic Wave A containment contract from the primary spec.

Required outcomes:

- Add a versioned `DirectionalSessionContainmentObservation` with:
  - source and candidate `StudioRevisionReference` values;
  - algorithm family/version and optional calibration ID;
  - both directional scores;
  - weighted intersection and denominator totals;
  - matched anchors grouped by evidence family;
  - corpus-frequency-suppressed anchors;
  - exact, PCM, excerpt, placement, MIDI-structure, and arrangement evidence counts;
  - runner-up margin, chronology compatibility, Artist compatibility, and conflicts; and
  - a review-ready human explanation.
- Replace the current symmetric Work-targeted containment decision path with directional,
  rarity-weighted Session-to-Session comparison that still preserves existing authority constraints.
- Keep common-library/template material from dominating matches.
- Persist review candidates and accepted/rejected authority through existing organisation durability.
- Surface the richer review evidence through the production organisation models; no automatic
  attachment when production calibration is unavailable.

Allowed write scope:

- `apps/studio-macos/Sources/StudioCore/SessionContentLineage.swift`
- `apps/studio-macos/Sources/StudioCore/SessionContentOrganisation.swift`
- `apps/studio-macos/Sources/StudioCore/OrganisationModels.swift`
- `apps/studio-macos/Sources/StudioCore/StudioOrganisationStore.swift`
- `apps/studio-macos/Tests/StudioCoreTests/SessionContentLineageResolverTests.swift`
- `apps/studio-macos/Tests/StudioCoreTests/SessionContentOrganisationEngineTests.swift`
- Add new focused files under the same `StudioCore` and `StudioCoreTests` areas only if the existing
  files would otherwise become unclear.

Not allowed:

- No `StudioTimeMachine` UI files in this task.
- No MinHash sketches yet.
- No mutable file actions or real corpus operations.

Required tests:

- Larger later Session containing most of an older Session.
- Exact copies with different paths.
- Common sample pack producing no match.
- One rare shared sample staying derivative-only/review-only.
- Artist conflict, close runner-up, direction reversal, chronology conflict.
- Manual assignment, `keepSeparate`, and durable rejection authority.
- Stale Set observation and cross-instance authority changes.

Definition of done:

- Deterministic containment observations persist with truthful explanation and no automatic attachment
  without applicable calibration.
- Existing content-organisation authority semantics remain intact.
- Focused tests cover every acceptance case above.

## Task 2: Directional containment review UI

Integrate accepted Task 1 evidence into the existing organisation review flow.

Required outcomes:

- Expose “Likely evolved from …” and “Possible duplicate Session” review states.
- Show both directional scores and progressive disclosure for matched distinctive material.
- Preserve Accept, Keep separate, Assign elsewhere, and Reject authority.
- Keep the visual language aligned with `DESIGN.md` and current review surfaces.

Allowed write scope:

- `apps/studio-macos/Sources/StudioTimeMachine/Stores/StudioLibraryStore.swift`
- `apps/studio-macos/Sources/StudioTimeMachine/Views/SessionOrganisationReviewView.swift`
- Any new supporting view/model files under `Sources/StudioTimeMachine` that are dedicated to this
  review surface
- Matching deterministic UI tests/fixtures if they already exist in this target

Dependencies:

- Task 1 accepted first.

## Task 3: BWF/RF64/BW64/iXML parser core

Deliver the bounded read-only Export DNA parser contract.

Required outcomes:

- Add a bounded RIFF/RF64/BW64 reader that can parse chunk tables without loading entire audio payloads.
- Parse `bext`, `iXML`, `axml`, and RIFF `INFO` metadata with explicit trust levels.
- Capture container/sample-rate fields needed to interpret 64-bit sample time reference exactly.
- Reject invalid lengths and integer overflow, tolerate unknown chunks, and preserve odd-sized-chunk
  semantics.
- Keep Unicode handling deterministic.

Allowed write scope:

- New parser/model files under `apps/studio-macos/Sources/StudioCore`
- Matching focused tests under `apps/studio-macos/Tests/StudioCoreTests`

Not allowed:

- No artifact-association changes in this task.
- No UI changes.

Required tests:

- Valid BWF v0/v1/v2 fields and 64-bit time references.
- RF64/BW64, odd-sized chunks, unknown chunks, malformed lengths, and truncation.
- iXML multiple-track metadata and Unicode.
- Metadata absent or contradictory.

Definition of done:

- The parser returns structured metadata with explicit trust semantics and survives malformed fixture
  cases without unsafe reads.

## Task 4: Export DNA association and sidecar evidence

Integrate Task 3 metadata into artifact association without weakening existing provenance rules.

Required outcomes:

- Extend artifact association evidence with immutable source observation, BWF origination timestamp,
  sample time reference compatibility, duration/range agreement, iXML label compatibility, export
  folder/filename evidence, exact or excerpt audio evidence, and expected track/file-count evidence.
- Embedded descriptive metadata alone must never count as verified provenance.
- Two plausible Set revisions must remain review-only.
- Add deterministic JSON sidecar support for Studio-created packages without rewriting user audio.
- Redact absolute paths and personal data from sidecar/report surfaces.

Allowed write scope:

- `apps/studio-macos/Sources/StudioCore/AudioArtifactLinker.swift`
- Export inbox / package metadata files under `apps/studio-macos/Sources/StudioCore` that are
  dedicated to export evidence
- Matching tests under `apps/studio-macos/Tests/StudioCoreTests`

Dependencies:

- Task 3 accepted first.

## Task 5: Project-boundary and portability audit extensions

Extend the existing read-only project readiness audit to the full project-boundary and portability
contract.

Required outcomes:

- Resolve the intact DAW-owned Project leaf.
- Detect nested or conflicting `Ableton Project Info` directories.
- Classify every media reference as project-contained, external, missing, disconnected, symlink
  escaped, cloud placeholder, permission blocked, removable-volume dependent, or unknown when
  applicable.
- Distinguish “contained on this Mac” from “portable to another Mac”.
- Inventory Ableton devices, Packs, Max for Live devices, third-party plug-ins, and managed
  libraries with exact evidence.
- Detect source changes and insufficient destination space.
- Produce `Ready`, `Ready with limitations`, or `Needs attention` with exact evidence while keeping
  the audit read-only.

Allowed write scope:

- `apps/studio-macos/Sources/StudioCore/ProjectHandoffModels.swift`
- `apps/studio-macos/Sources/StudioCore/ProjectReadinessAuditor.swift`
- `apps/studio-macos/Sources/StudioCore/ProjectStagingCopy.swift`
- `apps/studio-macos/Sources/StudioCore/ProjectHandoffReports.swift`
- `apps/studio-macos/Tests/StudioCoreTests/ProjectHandoffCoreTests.swift`
- Add supporting audit-specific files/tests under the same areas if needed

Not allowed:

- No real staging into indexed roots.
- No Live automation.

Required tests:

- Nested/conflicting project-info folders.
- Symlink escape, removable volume, unavailable permission, placeholder, source-change, and
  insufficient-space cases.
- Readiness wording differentiating source containment from true portability.
- Cross-instance or stale-reference behaviour where applicable.

Definition of done:

- The audit remains read-only, truthful, and strict about portability limitations.

## Task 6: Weighted/asymmetric MinHash candidate sketches

Add candidate-sketch generation for directional containment while preserving exact-decision parity.

Allowed write scope:

- Session-containment core files from Task 1
- New containment-sketch files/tests under `StudioCore`

Dependencies:

- Task 1 accepted first.

## Task 7: `StudioProjectInterchange` core and Ableton mapping

Introduce the versioned adapter-neutral project representation and map the current Ableton parser into
it without losing existing fields.

Allowed write scope:

- New interchange/model files under `StudioCore`
- `AbletonSetParser`-adjacent mapping seams only as needed
- Matching tests under `StudioCoreTests`

## Task 8: Logic read-only interchange mapping and conformance

Map the current Logic read-only adapter into `StudioProjectInterchange` only for fields it can prove,
with deterministic fixtures and conformance tests.

Dependencies:

- Task 7 accepted first.

## Task 9: Near-identical recording fingerprints

Add a compact local near-identity fingerprint engine under the existing matcher contracts.

Constraints:

- Return `sameRecordingCandidate`; never promote it to verified identity.
- Keep duration/sequence consistency checks mandatory.

## Task 10: High-specific excerpt retrieval prototype

Add the optional compact embedding backend and retrieval prototype behind an unavailable-by-default
capability gate.

Constraints:

- Candidate retrieval only; final verification must still use immutable observations.
- No production automatic decisions.

## Task 11: Transformed-sample lab and evaluation harness

Build the unavailable-by-default research lab plus labelled-corpus evaluation harness.

Constraints:

- Suggestions only.
- Synthetic augmentation alone is insufficient for activation.

## Task 12: Musical-version discovery prototype

Add a separate “Musically related” discovery index as a recall layer after deterministic search.

Constraints:

- Manual confirmation only.
- Keep this index separate from identity and excerpt indexes.

## Task 13: Private calibration, review-label storage, and evaluation reports

Persist versioned local labels and produce per-evidence-family evaluation reports.

Required outcomes:

- Durable local labels for same Song / keep separate, duplicate/evolved/derivative/unrelated,
  correct/incorrect export association, same recording/transformed use/false match, and accepted
  Artist/Variant/branch relationships.
- Store input observation IDs, algorithm version, features needed to reproduce the decision,
  decision time, and supersession history.
- Produce precision, recall, calibration, abstention, coverage, false-auto-attachment count, corpus
  partitions, and performance/resource measurements locally.

Allowed write scope:

- New calibration/report storage files under `StudioCore`
- Existing organisation or audio-matching durability seams only as required for integration
- Matching tests under `StudioCoreTests`
