# Content Intelligence Wave Ledger

Updated: 2026-08-14
Workspace: `/Users/test/Development/Projects/plugin-radar-monorepo-ableton-indexer/apps/studio-macos`
Graphify: no `graphify-out/graph.json` present during this run
Repo state: parent repo branch `codex/ableton-indexer-mvp`; `apps/studio-macos` is an untracked local app boundary and must be treated as live WIP
Subagent model policy: every active and future subagent is explicitly pinned to `gpt-5.6-sol`

## Audit snapshot

- Primary contract: `docs/content-intelligence-and-portability.md`
- Related contracts read:
  - `docs/audio-identity-lineage.md`
  - `docs/organisation-engine.md`
  - `docs/export-detection-and-delivery.md`
  - `docs/ableton-project-handoff.md`
  - `docs/implementation-program.md`
  - `PRODUCT.md`
  - `DESIGN.md`
- Existing implementation already present for:
  - directional containment observations, candidate generation, and organisation integration
  - BWF/RF64/BW64/iXML parsing and export-evidence sidecar support
  - project readiness and project-boundary auditing
  - MinHash candidate generation, project interchange, near-identity fingerprints, excerpt prototype, calibration storage, and evaluation reporting
- Current execution focus:
  - complete the final independent cross-contract audit after all slice acceptances
  - preserve the accepted evidence ladder and unavailable production-research boundaries
  - report simulated verification separately from real-corpus, real-DAW, packaging, and hosted status

## Dependency graph

1. Directional containment depends on:
   - `WorkCatalogResolver`
   - `SessionContentManifestBuilder`
   - `SessionContentLineageResolver`
   - durable review/override storage
2. Export DNA depends on:
   - bounded RIFF/RF64/BW64 reader
   - export association evidence model
   - sidecar redaction rules
3. Project-boundary audit depends on:
   - `ProjectHandoffPlan` / revision-reference validation
   - parsed Ableton dependency evidence
   - plug-in inventory and compatibility evidence
4. Wave B depends on accepted Wave A contracts for:
   - exact-decision parity over candidate sketches
   - adapter-neutral portability mapping
   - derivative-vs-identity enforcement
5. Wave C depends on:
   - accepted calibration/review storage
   - abstention-first evidence policy
   - explicit unavailability of uncalibrated production automation

## Ownership map

| Workstream | Scope | Owner | Write boundary | Status |
| --- | --- | --- | --- | --- |
| Wave A1 | Directional, rarity-weighted Session containment and review evidence | Accepted owners Galileo/Euclid (`gpt-5.6-sol`) | Accepted `SessionContent*` core and reviewed UI seams frozen | SPEC PASS / QUALITY APPROVED; simulated rendered/AX proof passed |
| Wave A2 | BWF/RF64/BW64/iXML Export DNA parsing and artifact association | Accepted by Dalton | ExportDNA/linker plus opaque ExportInbox receipt seam | SPEC PASS / QUALITY APPROVED; focused verification passed |
| Wave A3 | Project-boundary and portability audit extensions | Accepted by Cicero | `ProjectReadinessAuditor.swift`, `ProjectHandoff*`, related tests | SPEC PASS / QUALITY APPROVED; 49 tests and strict format passed |
| Wave B4 | Asymmetric/weighted MinHash candidate generation with exact-decision parity | Accepted by Mendel (`gpt-5.6-sol`) | Candidate/index persistence and focused resolver/organisation tests frozen | SPEC PASS / QUALITY APPROVED |
| Wave B5 | Versioned DAW-neutral `StudioProjectInterchange` and Ableton adapter mapping | Accepted by Carson (`gpt-5.6-sol`) | Interchange/Ableton parser and focused tests/fixture frozen | SPEC PASS / QUALITY APPROVED |
| Wave B6 | Near-identical recording fingerprints | Accepted by Hubble (`gpt-5.6-sol`) | Near-identity matcher, authority/coordinator, focused tests frozen | SPEC PASS / QUALITY APPROVED |
| Wave C7 | High-specific excerpt retrieval prototype | Accepted by Archimedes (`gpt-5.6-sol`) | landmark/excerpt plus sole shared matcher contract seam frozen | SPEC PASS / QUALITY APPROVED; 506-test integrated gate passed |
| Wave C8 | Transformed-sample lab and labelled-corpus evaluation harness | Accepted by Aristotle (`gpt-5.6-sol`) | research-lab/evaluation files frozen | SPEC PASS / QUALITY APPROVED; production unavailable |
| Wave C9 | Musical-version discovery prototype | Accepted by Gauss (`gpt-5.6-sol`) | separate version-similarity files frozen | SPEC PASS / QUALITY APPROVED; production unavailable |
| Wave C10 | Private calibration/review-label storage and evaluation reports | Accepted by Godel (`gpt-5.6-sol`) | Calibration store/report/services/tests and local CLI frozen | SPEC PASS / QUALITY APPROVED |

## Known integration blockers

- No slice-level Critical or Important findings remain; Waves A, B, C7, C8, C9, and C10 are independently accepted and frozen.
- The prior landmark distorted-excerpt failure was repaired in C7 and the integrated full suite now passes 506/506 tests across 52 suites.
- Final completion depends only on the new independent broad cross-contract review; production research activation remains intentionally unavailable pending real-corpus and governance gates.

## Review history

### Wave A1 review 1

- Reviewer: Pascal `019ffe8f-4a3d-71d2-b3c6-1f750cb95d9c` (`gpt-5.6-sol`, read-only)
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`
- Critical: mutable/reference fallback identities can be treated as exact distinctive evidence and authorize automatic attachment.
- Important: evidence scope and duration are absent; suppressed material still affects decisions; automatic gating is incorrectly symmetric and permits unknown compatibility; shortlist exact-decision parity is unproven; top-K evidence is not persisted; invalidation and stale-record supersession are incomplete; reviewed actions are not durably bound to observations and supersession history.
- Routing: all findings sent to fix owner Galileo for bounded fix round 1. No dependent work may accept this contract until re-review passes.

### Wave A1 fix round 1

- Implemented: immutable vs mutable identity provenance; revision scope and duration policy; decision-zero suppression; directional automatic gating with explicit Artist/chronology compatibility; bounded winner/runner-up parity; persisted top-K evidence; broader invalidation and superseded automatic history; observation-bound reviewed actions.
- Verification: `swift build --target StudioCore`, authorised-file parse, and formatting passed. Focused tests compiled but were blocked at the time by the now-repaired calibration-test errors.
- Re-review: all eight prior findings returned to Pascal for scoped verification.

### Wave A1 re-review 1

- Addressed: mutable identity safety; decision-zero suppression; directional automatic compatibility; persisted top-K evidence.
- Open Important: full-Session review-only scope and measured duration; exact tie-break parity; stale automatic supersession; production reviewed-action/calibration integration.
- New Important: exact scoring occurs before shortlist bounding; calibration snapshot factories ignore the content-specific observation ID.
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Routing: all six open findings sent to original owner Galileo for fix round 2, with the minimal organisation/calibration persistence seams added.

### Wave A1 fix round 2

- Implemented: full/unknown-duration review-only handling and immutable measured durations; unified exact tie ordering; pre-exact shortlist bounding; stale automatic supersession; four production reviewed-action paths with calibration persistence/supersession; observation-specific snapshot identities.
- Verification: StudioCore build, strict formatting, and authorised-file parse passed. Focused execution is temporarily blocked by the active Wave A2 linker's test signature changes.
- Re-review: all six findings returned to Pascal for scoped re-review.

### Wave A1 re-review 2

- Addressed: full/unknown-duration review-only policy; pre-exact shortlist bounding; stale automatic supersession; observation-specific calibration identity.
- Open Important: retrieval-vs-exact tie ordering can still lose exact winner/runner-up; calibration failure after authoritative user action has no durable retry/outbox label record.
- New Important: uncalibrated-refresh test asserts empty history instead of empty current authority.
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Routing: all three items sent to Galileo for fix round 3.

### Wave A1 fix round 3

- Implemented: parity-safe complete bounded/exhaustive selection with explicit abstention; durable observation-bound pending-label outbox and idempotent cross-instance delivery; corrected current-vs-history assertion.
- Verification: candidate generator 11 tests passed; resolver 15 passed; calibration store 10 passed; strict format and parse passed. Corrected organisation suite and final build await the active Wave A2 compile repair.
- Re-review: all three items returned to Pascal for scoped review.

### Wave A1 re-review 3

- Reviewer: Pascal `019ffe8f-4a3d-71d2-b3c6-1f750cb95d9c` (`gpt-5.6-sol`, read-only)
- Addressed: exact-decision parity and deterministic tie behavior; current-versus-superseded-history distinction.
- Open Important: outbox delivery accepts a partially matching calibration record and can clear despite different reproduction features, target Work, decision time, or notes; simultaneous cross-instance delivery can race on `duplicateDecision` without reload-and-compare convergence.
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Routing: the single remaining persistence issue returned to original owner Galileo for bounded fix round 4.

### Wave A1 fix round 4

- Owner: Galileo `019ffe94-eb6d-7152-b010-98d670440b5c` (`gpt-5.6-sol`)
- Scope: complete-payload idempotency, duplicate-race reload-and-compare convergence, and adversarial cross-instance/payload-mismatch tests only.
- Implemented: full normalized decision equivalence, duplicate-race reload-and-compare convergence, retained pending conflicts, and adversarial payload/race/supersession recovery tests.
- Verification: strict format and parse passed; StudioCore build passed; freshly linked bundle passed `CalibrationReviewStoreTests` 13 and `SessionContentOrganisationEngineTests` 42 with `--skip-build`.
- Integration blocker: normal SwiftPM test invocation currently reaches an unrelated `StudioLiveInsertPanelController.swift` `Int`/`OSStatus` compile error. That unrelated file was preserved.
- Re-review: the single persistence issue returned to Pascal. A1 remains unaccepted pending verdict.

### Wave A1 re-review 4

- Reviewer: Pascal `019ffe8f-4a3d-71d2-b3c6-1f750cb95d9c` (`gpt-5.6-sol`, read-only)
- Prior persistence finding: `ADDRESSED`; full payload/supersession equivalence and duplicate-race convergence are covered with fresh cross-instance reads.
- No new Critical or Important findings.
- Verdict: `SPEC PASS`; `QUALITY APPROVED`.
- Status: core A1 contract accepted. UI evidence/action binding and fresh main-thread Wave A verification remain.

### Wave A stable-tree verification

- Main-thread focused suites passed: lineage resolver 15; candidate generation 11; organisation engine 42; calibration review store 13; Export DNA parser 21; artifact linker 15; export inbox 34; project handoff 49.
- `StudioTimeMachine` debug target build passed after an unrelated concurrently edited UI compile error cleared without orchestrator changes.
- A3 formatting-only repair was byte-equivalent after applying the formatter to pre-change snapshots; strict lint passed independently, and 49 handoff tests plus StudioCore build remained green.
- Remaining Wave A gates: ranked review UI implementation/review and rendered macOS/Accessibility proof.

### Wave A1 review UI implementation

- Owner: Euclid `019ffef1-105e-7cf2-b6d4-252189dd3c0a` (`gpt-5.6-sol`). Prior owner Poincare was closed after remaining active without producing a checkpoint or file change.
- Exclusive write boundary: `SessionOrganisationReviewView.swift`, `StudioLibraryStore.swift`, and only the minimal deterministic sample-fixture/sheet-presentation seams required for `--sample-session-review`.
- Required outcome: ranked directional evidence, explicit review-only limitations, all four authoritative reviewed actions, no physical-file mutation, deterministic isolated fixture, native Accessibility semantics.
- Acceptance: debug build, strict format, independent read-only review, and rendered/Accessibility proof. Core A1 contract files are frozen during this slice.
- Implemented: ranked directional candidates, progressive evidence/method limitations, manual fallback, four reviewed actions through the accepted service, visible action state, and isolated `--sample-session-review` fixture using temporary stores.
- Implementer verification: strict format and parse passed; `StudioTimeMachine` target build passed; implementer reports a 980x650 rendered fixture and Accessibility-tree inspection. This is not acceptance evidence until independently reproduced.
- Status: awaiting independent read-only SPEC/QUALITY review.

### Wave A1 review UI review 1

- Reviewer: Mencius `019ffefe-3e72-7153-9bec-d6604c2dea31` (`gpt-5.6-sol`, read-only)
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important core seam: a rescan can replace the observation under a stable candidate ID, and the reviewed-action service can apply unseen evidence. Routed to original A1 core owner Galileo for atomic complete expected-observation validation in the locked authority write.
- Important UI/action flow: Close remains enabled during an in-flight action and can hide a later failure; Assign Elsewhere creates virtual Artist/Song records before candidate validation and can leave orphans; PCM/excerpt evidence counts are omitted when available. These remain queued for original UI owner Euclid after the core seam is accepted.
- Minor queued: replace the misleading “reviewed” candidate count and remove the avoidable sample database force-unwrap.
- Independent scoped strict format and `StudioTimeMachine` target build passed. Reviewer did not complete rendered/Accessibility proof.

### Wave A1 core fix round 5

- Owner: Galileo `019ffe94-eb6d-7152-b010-98d670440b5c` (`gpt-5.6-sol`).
- Scope: atomic full expected-observation binding and adversarial same-ID observation-replacement tests only.
- Implemented: complete expected `CalibrationObservationSnapshot` on requests, service preflight equality, repeated equality inside the locked authority mutation, typed stale refusal, and before/during-write same-ID replacement tests with zero side effects.
- Verification: calibration review store 15 tests passed; organisation engine 42 passed; strict format/parse and StudioCore build passed.
- Re-review: Mencius marked the stale-observation finding `ADDRESSED`; calibration tests 15, organisation tests 42, strict format, and StudioCore build independently passed with no new Critical/Important findings.
- Verdict for core seam: `SPEC PASS`; `QUALITY APPROVED`.

### Wave A1 UI fix round 1

- Owner: Euclid `019ffef1-105e-7cf2-b6d4-252189dd3c0a` (`gpt-5.6-sol`).
- Scope: pass complete displayed snapshot; prevent dismissal/lost failure during action; make Assign Elsewhere existing-Work-only to avoid orphan records; render PCM/excerpt counts; correct candidate wording; address or report the sample force-unwrap Minor.
- Implemented: complete displayed snapshot requests; in-flight dismissal lock and durable failure notice; existing-Work-only Assign Elsewhere; adaptive six-family counts; corrected candidate wording; removed sample database force-unwrap paths.
- Verification: strict format/parse and warning-free `StudioTimeMachine` target build passed. Implementer rendered 980x650 deterministic fixture, exercised Accept, and observed assignment/calibration only under the UUID temporary root with no pending outbox or real-path/network handles.
- Status: original reviewer re-review in progress. Core files remain frozen.

### Wave A1 UI re-review 1

- Reviewer: Mencius `019ffefe-3e72-7153-9bec-d6604c2dea31` (`gpt-5.6-sol`, read-only)
- All prior code-review findings: `ADDRESSED`; no new Critical or Important source findings.
- Independent strict format and warning-free app target build passed; deterministic minimum-size render/scrolling passed.
- Verdict: `SPEC PASS`; `QUALITY APPROVED` for the scoped code review.

### Wave A1 Computer Use QA 1

- Main-thread deterministic `--sample-session-review` render passed at the minimum-size sheet with two ranked candidates, review-only language, progressive disclosure, and exactly four action controls visible after scrolling.
- New Important Accessibility finding: the evidence grid collapsed multiple values under a single `Exact evidence` label, leaving remaining family counts unlabeled in the AX tree.
- Routing: returned to Euclid for UI fix round 2; the deterministic first candidate must expose all six evidence families so the repaired AX contract is rendered rather than inferred.

### Wave A1 UI fix round 2

- Owner: Euclid `019ffef1-105e-7cf2-b6d4-252189dd3c0a` (`gpt-5.6-sol`).
- Implemented: explicit complete `Evidence counts` AX representation and deterministic first-candidate PCM/excerpt availability, while the runner-up preserves unavailable semantics.
- Verification: strict format/parse and warning-free app build passed; implementer rendered six unclipped chips at minimum size and reported the AX value `Exact: 3; PCM: 4; Excerpt: 2; Placement: 2; MIDI: 1; Arrangement: 2`.
- Status: scoped independent re-review and main-thread Computer Use reproduction pending.

### Wave A1 UI re-review 2 and Computer Use QA 2

- Reviewer: Mencius marked the Accessibility finding `ADDRESSED`; no new Critical/Important findings; `SPEC PASS`; `QUALITY APPROVED`.
- Main-thread Computer Use independently reproduced at minimum size:
  - rank-1 AX value `Exact: 3; PCM: 4; Excerpt: 2; Placement: 2; MIDI: 1; Arrangement: 2`;
  - truthful rank-2 omission plus unavailable evidence disclosure;
  - expanded directional evidence, suppression, scope/duration, algorithm, unavailable calibration, and weighted totals;
  - scroll reachability and exactly four action controls.
- Main-thread stable verification: calibration review store 15 tests passed; organisation engine 42 passed; warning-free app target build and strict A1 source/test/UI formatting passed.
- Wave A status: complete for authorised local implementation and simulated UI proof. Real corpus calibration and real DAW qualification were not run.

### Wave A2 implementation checkpoint 1

- Owner: Hume `019ffe8f-4946-76d2-a107-884c46069f28` (`gpt-5.6-sol`)
- Status: incomplete; parser compile ordering fixed, but strict `bext`, stronger `ds64`, standard iXML timestamp, XML complexity bounds, and unknown-field preservation gaps remain.
- Routing: original owner resumed to complete the gaps before independent review.

### Wave A2 implementation checkpoint 2

- Owner: Hume `019ffe8f-4946-76d2-a107-884c46069f28` (`gpt-5.6-sol`)
- Implemented: strict `bext` v0-v2 layout; RF64/BW64 and `ds64` validation; standard iXML timestamp fields; XML depth/node/text bounds; unknown iXML low-trust preservation; association migration compatibility.
- Verification: `swift build --target StudioCore`, strict formatting, and frontend parse passed. Focused test execution remains blocked by the known Wave C10 and in-progress Wave A1 test-target compile errors.
- Routing: read-only independent review dispatched to Dalton. No acceptance until review and fresh focused execution pass.

### Wave A2 review 1

- Reviewer: Dalton `019ffea4-29d4-7201-8213-f8c35754dbe0` (`gpt-5.6-sol`, read-only)
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`
- Critical: the parser and association support have no production export/linker call site, so Export DNA is not used by real local detection.
- Important: immutable observations are not digest-bound/revalidated; automatic policy does not require sufficient independent provenance and lets descriptive NOTE text affect score; duplicate authoritative chunks are order-dependent; `fmt` validation and RF64 table consumption are incomplete; unknown iXML preservation/contradiction handling is lossy; sidecar redaction/confidence validation and schema migration are incomplete; required adversarial and build/test gates remain open.
- Minor deferred: reject/report nonsensical negative iXML indexes/counts and malformed BWF date/time.
- Routing: all Critical/Important findings sent to original owner Hume for fix round 1, with the minimal `AudioArtifactLinker` production seam added to its write boundary.

### Wave A2 fix round 1

- Implemented: production linker integration and typed abstention; immutable revalidation; automatic/descriptive evidence separation; duplicate/`fmt`/`ds64`/iXML hardening; structured unknown metadata; typed sidecar confidence, migration/future rejection, comprehensive redaction; all missing adversarial fixtures.
- Verification: `ExportDNAParserTests` 21 passed; `AudioArtifactLinkerTests` 12 passed; strict formatting and StudioCore build passed.
- Re-review: all prior load-bearing findings returned to Dalton for scoped re-review.

### Wave A2 re-review 1

- Addressed: production parsing; duplicate/`fmt`/`ds64`/iXML hardening; structured unknown metadata; schema migration; redaction; adversarial coverage.
- Open Critical: public automation binding can be forged and used for automatic selection.
- Open Important: raw resolver trusts caller-fabricated immutable observations/revalidation dates; sidecar verified state inherits the same authority flaw.
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED` despite independently reproduced 21 parser tests, 12 linker tests, formatting, and build.
- Routing: authority findings sent to Hume for fix round 2 using the existing non-Codable detector receipt seam from ExportInbox.

### Wave A2 fix round 2

- Owner: Hume `019ffe8f-4946-76d2-a107-884c46069f28` (`gpt-5.6-sol`)
- Implemented: automatic linker authority is detector-receipt bound; public/Codable bindings and decoded sidecars remain descriptive; raw observations require in-call file revalidation; mismatched and forged authority paths are covered adversarially.
- Verification: `ExportDNAParserTests` 21 passed; `AudioArtifactLinkerTests` 15 passed; `ExportInboxCoreTests` 34 passed; StudioCore build, strict formatting, and frontend parse passed.
- Re-review: the prior authority findings returned to Dalton for scoped independent review. A2 remains unaccepted pending that verdict.

### Wave A2 re-review 2

- Reviewer: Dalton `019ffea4-29d4-7201-8213-f8c35754dbe0` (`gpt-5.6-sol`, read-only)
- All prior authority findings: `ADDRESSED`; no new Critical or Important findings.
- Independent verification: `AudioArtifactLinkerTests` 15 passed; `ExportInboxCoreTests` 34 passed; scoped strict formatting passed.
- Verdict: `SPEC PASS`; `QUALITY APPROVED`.
- Minor deferred: positive detector issuance and linker consumption are covered across two production-seam tests rather than one combined end-to-end test.
- Status: core A2 contract accepted. Fresh main-thread Wave A verification remains required after A1 stops editing.

### Wave A3 implementation checkpoint 1

- Owner: Avicenna `019ffe8f-4b5c-72e1-9ad7-b3e0477a29b3` (`gpt-5.6-sol`)
- Implemented: fail-closed project/root, Project Info, media/volume/symlink/placeholder/permission/embedded-file checks; truthful local-containment vs cross-Mac portability; review-only plans; UNC report redaction.
- Verification: `swift build --target StudioCore` passed; focused test execution is blocked by the known Wave C10 test-target compile error; authorised files parse successfully.
- Routing: read-only independent review dispatched to Cicero. No acceptance yet.

### Wave A3 review 1

- Reviewer: Cicero `019ffe99-d8fa-7092-ae7e-ccf068bf23c5` (`gpt-5.6-sol`, read-only)
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`
- Critical: source freshness can miss same-size content replacement with restored modification time.
- Important: unknown destination capacity can still report Ready; forward-slash Windows and UNC paths escape report redaction; managed-library evidence is a fixed vendor-name heuristic rather than truthful inventory; current build is blocked by the in-progress Wave A1 mutable-identity enum change.
- Minor deferred: reviewed media-policy variants currently have equivalent behavior; direct `..` traversal and UNC media-reference classification tests are absent.
- Routing: all Critical/Important A3 findings sent to original owner Avicenna for fix round 1. The Wave A1 compile error stays with its existing owner and is not a cross-boundary edit.

### Wave A3 fix round 1

- Implemented: digest/resource-bound source freshness; typed unknown destination capacity with limitations status; explicit managed-library inventory states; expanded JSON/text/PDF path and personal-data redaction.
- Verification: `swift build --target StudioCore` and authorised-file parse passed; A3 test source compiles, while suite launch remains blocked by the known Wave C10 test-target errors.
- Re-review: scoped review dispatched to Cicero for the four prior load-bearing findings.

### Wave A3 re-review 1

- Reviewer: Cicero `019ffe99-d8fa-7092-ae7e-ccf068bf23c5` (`gpt-5.6-sol`, read-only)
- All four prior load-bearing findings: `ADDRESSED`
- Verdict: `SPEC PASS`; `QUALITY APPROVED`; no new Critical/Important breakage.
- Remaining gate: execute `ProjectHandoffCoreTests` after the separate calibration test-target compile errors are repaired.

### Test-target compile unblock

- Owner: Pauli `019ffead-cf0a-7ae3-bf51-70fb5eb3866d` (`gpt-5.6-sol`)
- Scope: minimal missing-`try` repairs in `CalibrationReviewStoreTests.swift` only. This is verification infrastructure and does not activate Wave C production capabilities.
- Result: added `try` at the two throwing fixture calls only; frontend parse passed. Shared SwiftPM verification is deferred until the active Wave A1/A2 owners stop editing source.

## Deferred UI acceptance

- `SessionOrganisationReviewView` currently provides manual Artist/Song assignment but does not display the Feature 1 ranked containment review evidence or explicit keep-separate/rejection controls. UI binding, deterministic sample fixtures, rendered macOS proof, and Accessibility proof are deferred until the Wave A1 core contract passes re-review.

## Acceptance loop

For each active Wave A stream:

1. Implementer audits the current slice against the specification and existing tests.
2. Implementer patches only within its allowed write boundary.
3. Implementer runs focused tests and reports remaining gaps honestly.
4. Independent reviewer performs read-only review against the spec and quality bar.
5. Any Critical or Important finding returns to the original implementer for one bounded fix round.
6. Reviewer re-checks the fix before the slice is marked accepted.
7. Main thread runs integration verification and records status distinctly from real-corpus or real-DAW qualification.

## Wave B prepared dispatch

Wave B remains blocked until Wave A UI acceptance. When unblocked, dispatch all three owners explicitly on `gpt-5.6-sol` with these non-overlapping boundaries:

### Wave B4 candidate parity owner

- Dependencies: accepted A1 exact resolver, evidence suppression, candidate invalidation, and automatic/review gates.
- Allowed files: `SessionContentLineageCandidateGeneration.swift`, `SessionContentLineageCandidateGeneratorTests.swift`, and only a minimal resolver-test fixture if parity proof requires it.
- Goal: audit the existing asymmetric/weighted sketch implementation and close only scale, invalidation, deterministic tie, exhaustive-ceiling abstention, and exact winner/runner-up parity gaps.
- Safety: sketches generate candidates only; exact scoring remains authoritative; if parity cannot be proven within a bound, abstain rather than truncate.
- Done: adversarial dense/tie/suppression/stale-sketch tests, focused suite, strict format, independent SPEC/QUALITY review.

### Wave B5 interchange owner

- Dependencies: accepted A3 truthful portability language and existing read-only Ableton/Logic adapters.
- Allowed files: `StudioProjectInterchange.swift`, `AbletonSetParser.swift` only for missing read-only fields, `StudioProjectInterchangeTests.swift`, `AbletonSetParserTests.swift`, and interchange fixture JSON.
- Goal: validate versioned DAW-neutral identity, timeline/static metadata, hierarchy/mixer/routing, devices/plugins, clips/warp/fades, dependencies/audio references, locators/automation, export/handoff references, evidence summary, and Ableton adapter mapping with field-level provenance.
- Safety: unknown stays unknown; parsed/derived never becomes verified; no DAW launch or project write; Logic remains read-only and partial.
- Done: v1 migration/future-schema/adversarial provenance tests, deterministic round-trip fixture, focused suites, strict format, independent SPEC/QUALITY review.

### Wave B6 near-identity owner

- Dependencies: accepted A2 artifact-vs-identity policy and evidence ladder.
- Exclusive allowed files: `LocalNearIdentityAudioMatcher.swift`, `AudioMatcherContracts.swift`, `AudioMatchingCoordinator.swift`, their focused tests, and deterministic generated-audio fixture helpers only.
- Goal: validate compact local full-recording fingerprint behavior for re-encode, gain/channel/silence/trim tolerance while rejecting excerpts, pitch/time transforms, unrelated signals, mutable observations, and ambiguous runners-up.
- Safety: never verified identity; reversible derivative family link only after explicit capability-specific calibration; no generic calibration may promote transformed or musical similarity; local bounded decoding only.
- Done: focused/adversarial/resource-bound tests, strict format, independent SPEC/QUALITY review. B6 retains sole matcher-registry ownership until accepted; Wave C8/C9 cannot edit that registry concurrently.

## Wave B execution

### Wave B5 implementation

- Owner: Ohm `019fff2e-08b7-7910-acb3-a322ae2ec4f1` (`gpt-5.6-sol`).
- Implemented: fail-closed v1 migration/validation, bounded versioned DAW extensions, neutral routing references, deterministic Ableton mapping, truthful provenance, clip/device/dependency coverage, and partial read-only Logic corrections.
- Changed only `StudioProjectInterchange.swift` and `StudioProjectInterchangeTests.swift`.
- Verification: interchange 13 tests passed; Ableton parser 3 passed; strict format/parse and StudioCore build passed.
- Status: independent reviewer Carson `019fff40-5503-7381-b648-431239812101` (`gpt-5.6-sol`, read-only) in progress.

### Wave B4 implementation

- Owner: Leibniz `019fff2d-c869-7e60-9292-b1a97b47371e` (`gpt-5.6-sol`).
- Implemented: weighted retrieval, explicit bounded fallback reasons, ceiling abstention, stable v5 context tokens, deterministic ordering, and expanded adversarial parity coverage including 80 seeded corpora.
- Verification: candidate generator 16 and resolver 15 tests passed via isolated bundle; strict format/parse and StudioCore build passed. Normal filtered execution waits for active B6 API edits to settle.
- Reported residual: repeated accepted-resolver calls may differ below one ULP from dictionary accumulation while decision/order remain unchanged; independent review must classify this.
- Status: independent reviewer Mendel `019fff40-f049-7ab2-82e1-2082b0bf4064` (`gpt-5.6-sol`, read-only) in progress.

### Wave B6 implementation

- Owner: Kuhn `019fff2e-464c-7db2-8e60-3a093ba385c9` (`gpt-5.6-sol`).
- Implemented: bounded canonical-rate fingerprinting, re-encode/sample-rate/channel/gain/silence/trim tolerance, immutable source/target revalidation, opaque matcher authority, scoped calibration acceptance, and research-only unavailable registry capabilities.
- Verification: near-identity 12 tests and matcher contract/coordinator 13 tests passed; strict format/parse and StudioCore build passed.
- Open integration evidence: full 371-test run had three B4 assertions that pass isolated and two landmark excerpt assertions that still fail isolated. Shared-contract regression must be ruled out before acceptance.
- Status: independent reviewer Hubble `019fff44-6917-7330-bd3f-ee269ed5b0f9` (`gpt-5.6-sol`, read-only) in progress.

### Wave B4 review 1

- Reviewer: Mendel `019fff40-f049-7ab2-82e1-2082b0bf4064` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no acceptance despite focused tests passing.
- Important: the implementation rebuilds sketches/weights and intersects exact identities across the full pool before bounding, so it is not scale-safe candidate retrieval and has no reusable persisted index or performance ceiling proof.
- Important: duplicate identity normalization is first-wins and the context token can remain unchanged when decisions change; the token also relies on collision-prone FNV rather than a canonical cryptographic digest.
- Important: guaranteed-mode parity omits complete exact semantics, including zero-score and durable-rejection conflicts, while tests compare only a partial result projection.
- Important: dictionary accumulation and exact floating-point comparisons retain sub-ULP nondeterminism that can alter thresholds or ties.
- Routing: all findings returned to original owner Leibniz for fix round 1 with a persisted/reusable inverted-index seam, deterministic normalization/digesting, complete exact parity, bit-stable numeric reductions, and adversarial performance instrumentation.

### Wave B5 review 1

- Reviewer: Carson `019fff40-5503-7381-b648-431239812101` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`.
- Important: the neutral model lacks tempo maps, MIDI notes, actual warp markers, fades, automation points, sends, device-state availability, and meaningful preview/export/handoff metadata.
- Important: validation omits routing targets, automation owners, dependency kind/owner compatibility, availability/path consistency, and strict extension allowlisting/bounds.
- Important: Logic-derived or guessed values are incorrectly labelled parsed; selected revision membership is unchecked.
- Important: historical and current schemas both claim v1, so current corruption is indistinguishable from migration; Ableton dependency ordering is Set-derived and nondeterministic.
- Important: adversarial tests do not cover these cases and encode incorrect Logic provenance.
- Routing: all findings returned to original owner Ohm for fix round 1, including a strict v2 schema with narrow v1 migration and deterministic complete adapter coverage.

### Wave B6 review 1

- Reviewer: Hubble `019fff44-6917-7330-bd3f-ee269ed5b0f9` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`.
- Important: the matcher accepts subtle pitch/time transformations and non-full recordings, including +1 semitone, quarter-semitone, 1% stretch, and short material padded with long silence.
- Important: matcher authority is forgeable inside StudioCore and is not bound to immutable source/target files and node identities through independent coordinator revalidation.
- Important: calibration does not enforce algorithm/material scope, held-out evaluation, rights/model review, and resource budget; transformed or musical research labels can therefore promote high confidence.
- Important: resource caps occur after an unbounded full-file digest, maximum-frame settings are not safely clamped, and source/target mutation races are untested.
- Regression triage: the separate landmark distorted-excerpt failure predates the B6 prototype and remains a Wave C7/final-suite gate rather than evidence of B6 acceptance.
- Routing: all findings returned to original owner Kuhn for fix round 1 with full-recording/pitch/time adversarial probes, coordinator-only bound authority, capability-specific gates, and preflight/streaming resource safety.

### Wave B fix round 1 dispatch

- B4, B5, and B6 original owners are active concurrently only within their non-overlapping authorised seams.
- No dependent Wave C implementation may advance until all three contracts receive independent `SPEC PASS` and `QUALITY APPROVED` re-review verdicts with no Critical/Important findings.
- Every owner and reviewer is explicitly pinned to `gpt-5.6-sol`.

### Wave B4 fix round 1

- Owner: Leibniz `019fff2d-c869-7e60-9292-b1a97b47371e` (`gpt-5.6-sol`).
- Implemented: reusable v6 inverted identity/sketch-band index; persisted SHA-256 cache descriptors and strict invalidation; bounded posting traversal/abstention; deterministic duplicate normalization and bit-exact sorted resolver reductions; cross-query and cross-store reuse with schema-one decoding.
- Implementer verification: candidate 19/19, resolver 16/16, organisation/persistence 43/43; strict format, frontend parse, and StudioCore build passed in its isolated state.
- Scale evidence: 512 candidates indexed/sketched once; 2 identity lookups, 4 identity posting visits, 8 band lookups, 16 sketch posting visits, 2 estimates, zero full-pool intersections; persisted reuse rebuilt zero sketches.
- Shared-suite limitation: normal SwiftPM test compilation was blocked by concurrent B5 test API edits, not accepted as a B4 waiver.
- Status: B4 files frozen pending original reviewer Mendel re-review.

### Wave B4 re-review 1

- Reviewer: Mendel `019fff40-f049-7ab2-82e1-2082b0bf4064` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`.
- Important: persisted reuse stores entries/sketches but reconstructs every posting index on load and scans all entries per query for active count, leaving uninstrumented O(sessions x candidates) work.
- Important: manifests containing only suppressed/common/template/external/mutable anchors are removed from the candidate universe even though exhaustive resolution retains zero-score ordering and durable-rejection conflict semantics.
- Important: persisted canonical tokens/weights/sketches/candidates are trusted without re-deriving integrity; reference tokens omit persisted reference fields and the cache configuration does not bind resolver eligibility/weight algorithm version.
- Minor: process-determinism test runs twice in one process rather than comparing a separate-process golden encoding.
- Minor: internal fallback/signature/posting configuration is not clamped against overflow or excessive allocation, although defaults are safe.
- Verified addressed: duplicate normalization, SHA-256 manifest hashing, deterministic reductions/ties, review-only scope, ceiling abstention, and schema-one decoding; 19/16/43 focused tests and strict format passed.
- Routing: all three Important findings and both low-cost hardening Minors returned to original owner Leibniz for bounded fix round 2.

### Wave B4 fix round 2

- Owner: Leibniz `019fff2d-c869-7e60-9292-b1a97b47371e` (`gpt-5.6-sol`).
- Implemented: v7 persisted canonical identity/band postings and per-Work counts; SHA-256 integrity/context tokens; direct load validation; bounded no-scan queries; configuration clamping; fail-closed cache migration; suppressed-only complete-resolution parity; tamper/stale/future-cache rejection; deterministic encoding fixtures.
- Scale evidence: 512 candidates x 64 queries; 512 identity and 4,096 band postings validated; 64 active lookups, 64 identity visits, 512 band visits, 640 entry lookups, zero entry scans, zero posting reconstruction, zero full-pool exact intersections.
- Implementer verification: candidate 22/22, resolver 16/16, organisation 44/44, StudioCore build, strict format, frontend parse, and diff check passed.
- Status: B4 files frozen pending original reviewer Mendel re-review 2.

### Wave B4 re-review 2

- Reviewer: Mendel `019fff40-f049-7ab2-82e1-2082b0bf4064` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`.
- Important: normal organisation refresh supplies a new generated-at timestamp as every candidate reference `reviewedAt`; because this field is correctly token-bound, unchanged pools always miss/rebuild. The cross-store test hides the defect by reusing one fixed timestamp.
- Minor: one-time index-load validation work is copied into every query's persisted counters, making aggregated load-vs-query accounting ambiguous.
- Verified addressed: actual canonical posting persistence/validation, no unbounded query scans, decision-zero exact parity, complete cache/version binding, malformed/stale/future rejection, clamped configuration, and honest determinism fixtures; 22/16/44 tests, build, and strict format passed.
- Routing: timestamp/cache-identity seam and counter separation returned to original owner Leibniz for narrow fix round 3.

### Wave B4 fix round 3

- Owner: Leibniz `019fff2d-c869-7e60-9292-b1a97b47371e` (`gpt-5.6-sol`).
- Implemented: candidate-generation v8 excludes volatile reviewed-at, catalogue-generation, and derived-reference IDs from stable cache identity; reused indexes overlay cached sketches/postings with current truthful references; one-time index-load counters are separate from per-query metadata.
- Cross-store proof uses different generated-at values (2000 then 3000), reuses with zero sketch/posting rebuild, and emits current reference timestamps at 3000.
- Implementer verification: candidate 22/22, resolver 16/16, organisation 44/44; 512-candidate load and 64-query counters separate cleanly; StudioCore build, strict format, frontend parse, and diff check passed.
- Status: B4 files frozen pending original reviewer Mendel re-review 3.

### Wave B4 re-review 3

- Reviewer: Mendel `019fff40-f049-7ab2-82e1-2082b0bf4064` (`gpt-5.6-sol`, read-only).
- All prior findings: `ADDRESSED`; no new Critical, Important, or Minor findings.
- Independent verification: candidate 22/22, resolver 16/16, organisation 44/44, StudioCore build, and strict format passed.
- Verdict: `SPEC PASS`; `QUALITY APPROVED`.
- Status: B4 accepted and frozen. Wave B4/B5/B6 contracts are all accepted; C10 storage/report implementation may now begin.

### Wave B6 fix round 1

- Owner: Kuhn `019fff2e-464c-7db2-8e60-3a093ba385c9` (`gpt-5.6-sol`).
- Implemented: v3 bounded fingerprinting with fine pitch sensitivity, active/raw duration consistency, trim/full-coverage and silence/degenerate rejection; preflight before content digest; coordinator-only non-Codable authority after an independent deterministic rerun bound to nodes, immutable observations, digests, algorithm, material, and resource facts.
- Calibration promotion now requires matching capability/family/version/material plus accepted held-out evaluation, rights review, and sufficient resource budget. Production high-confidence remains unavailable from synthetic fixtures alone.
- Hard bounds: 900 seconds, 10,000 fingerprint frames, 64 candidates, 8 GB per file, and 8 seconds lag. Decision thresholds are explicit and tested rather than inferred from the prior broad coarse match.
- Implementer verification: near-identity 17/17, contracts 11/11, coordinator 5/5, focused landmark compatibility, StudioCore build, strict format, and frontend parse passed in its isolated state.
- Shared-suite limitation: broad suite not run during concurrent test churn; this remains a later integration gate.
- Status: B6 files frozen pending original reviewer Hubble re-review.

### Wave B6 re-review 1

- Reviewer: Hubble `019fff44-6917-7330-bd3f-ee269ed5b0f9` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`.
- Important: adjacent pitch buckets still accept a +0.10-semitone microtonal shift at score 0.988; tests begin only at +0.25 semitones.
- Important: the coordinator independently reruns a caller-supplied request but does not resolve node IDs to an authoritative persisted node/file binding, so callers can induce authority for unrelated lineage identities.
- Important: accepted transformation calibration can still produce a high-confidence derivative through the public builder/custom-engine path; registry unavailability is insufficient.
- Important: digest capture still reads to EOF without a configured byte limit after preflight, allowing concurrent-growth bypass; duration-derived frame conversion occurs before safe bounds checks, and in-place mutation races are untested.
- Verified addressed: intended re-encode/gain/channel/trim behavior; quarter/+1 semitone, 0.5-1% stretch, long silence, excerpt, unrelated, silence, and degenerate abstention; capability/material/held-out/rights/resource matching; engine receipt construction restriction.
- Separate C7 blocker retained: distorted-excerpt prototype still fails exactly as before B6 and is not the reason for B6 rejection.
- Routing: all four Important findings returned to original owner Kuhn for bounded fix round 2. C10 and dependent Wave C implementation remain blocked.

### Wave B6 fix round 2

- Owner: Kuhn `019fff2e-464c-7db2-8e60-3a093ba385c9` (`gpt-5.6-sol`).
- Implemented: coherent +0.05/+0.10/+0.25/+1-semitone rejection with finer pitch bins; independent rerun plus authoritative host-catalog node/URL/immutable-observation binding for promotion; research capabilities hard suggestion-only regardless of calibration/custom engine; byte-capped streaming digest; finite/range/overflow checks before duration-to-frame conversion.
- Trust boundary: host-supplied authoritative catalog is explicit; absent, duplicate, unknown, URL-mismatched, or observation-mismatched bindings cannot promote evidence.
- Implementer verification: near-identity 19/19, contracts 11/11, coordinator 7/7, production landmark compatibility 2/2, StudioCore build, strict format, and frontend parse passed.
- Truthful limitation: +0.10 semitone is the validated deterministic boundary; +0.05 rejects in the synthetic diagnostic but is not claimed as corpus-wide calibration.
- Status: B6 files frozen pending original reviewer Hubble re-review 2.

### Wave B6 re-review 2

- Reviewer: Hubble `019fff44-6917-7330-bd3f-ee269ed5b0f9` (`gpt-5.6-sol`, read-only).
- All four prior Important findings: `ADDRESSED`; no new Critical or Important findings.
- Independent verification: near-identity 19/19, contracts 11/11, coordinator 7/7, production landmark compatibility 2/2, strict format, debug compilation, and release `studio-index`/`StudioTimeMachine` builds passed.
- Independent boundary probe: exact/+0.01/+0.025 semitone matched; +0.05/+0.075/+0.10 rejected, consistent with the honest deterministic boundary and no real-corpus calibration claim.
- Minor retained: duplicate authoritative bindings are rejected in implementation and an independent probe, but no checked-in focused negative test covers that branch.
- Separate blocker: distorted-excerpt prototype failure remains Wave C7/final-suite work and is not a B6 regression.
- Verdict: `SPEC PASS`; `QUALITY APPROVED`.
- Status: B6 accepted and frozen. Production high-confidence remains unavailable without accepted real held-out calibration; no verified-identity promotion exists.

### Wave B5 fix round 1

- Owner: Ohm `019fff2e-08b7-7910-acb3-a322ae2ec4f1` (`gpt-5.6-sol`).
- Implemented in interchange source/tests only: schema v2 with strict v1 migration; richer tempo, note, warp, fade, automation, send/device-state, preview/export/handoff structures; bounded allowlisted extensions; comprehensive ID/hierarchy/routing/owner/dependency/availability validation; deterministic Ableton ordering; corrected Logic derived/unknown provenance and revision membership checks.
- Truthful adapter limitation: current Ableton parser exposes only MIDI-note and warp counts and lacks detailed routing, automation, fades, and artifact state. The neutral adapter records unsupported rather than inventing those values.
- Implementer verification: interchange 19/19, Ableton parser 3/3, StudioCore build, strict format, and frontend parse passed.
- Status: B5 files frozen pending original reviewer Carson re-review.

### Wave B5 re-review 1

- Reviewer: Carson `019fff40-5503-7381-b648-431239812101` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: a schema-v2 payload may supply the exact v1 migration marker and then omit v2-required tempo/device/routing/note/warp/fade/automation fields; decoder/validation treat it as migrated instead of malformed current data.
- Minor: explicit missing-parent-ID and existing-non-group-parent adversarial tests are absent, although implementation checks exist.
- Verified addressed: complete neutral structures, reference/compatibility/availability/extension validation, deterministic Ableton mapping, corrected Logic provenance and revision membership, and truthful unsupported parser gaps. Focused 19/3 tests, build, and strict format passed.
- Routing: schema-spoof finding and both missing adversarial tests returned to original owner Ohm for narrow fix round 2.

### Wave B5 fix round 2

- Owner: Ohm `019fff2e-08b7-7910-acb3-a322ae2ec4f1` (`gpt-5.6-sol`).
- Implemented: schema v2 rejects every persisted migration marker before nested decoding; migration provenance is decoder-generated only for a recognized v1 envelope and omitted from canonical v2; presence-based v2 required-field checks; marker-spoof, missing-parent-ID, and non-group-parent adversarial tests; deterministic legacy short-state-digest normalization.
- Implementer verification: interchange 22/22, parser 3/3, StudioCore build, strict format, and strict-concurrency frontend parse passed.
- Status: B5 files frozen pending original reviewer Carson re-review 2.

### Wave B5 re-review 2

- Reviewer: Carson `019fff40-5503-7381-b648-431239812101` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical/Minor findings.
- Important: explicit JSON null satisfies `contains` while `decodeIfPresent` yields nil and installs v1 defaults, bypassing required-v2 validation for tempo map, routing, device availability, MIDI notes, warp markers, fades, and automation.
- Verified addressed: persisted marker spoof closure, strict v1 migration/canonical v2 omission, missing/non-group parent tests, and all previously accepted model/provenance/determinism behavior; 22/3 tests, build, and strict format passed.
- Routing: explicit-null handling for every v2-required nested field returned to original owner Ohm for surgical fix round 3.

### Wave B5 fix round 3

- Owner: Ohm `019fff2e-08b7-7910-acb3-a322ae2ec4f1` (`gpt-5.6-sol`).
- Implemented: schema-v2 decoding now distinguishes missing, explicit null, and present values for all 13 migratable required fields; null and missing produce distinct field-specific failures; strict v1 default migration remains supported.
- Implementer verification: interchange 23/23, parser 3/3, StudioCore build, strict format, and strict-concurrency frontend parse passed.
- Status: B5 files frozen pending original reviewer Carson re-review 3.

### Wave B5 re-review 3

- Reviewer: Carson `019fff40-5503-7381-b648-431239812101` (`gpt-5.6-sol`, read-only).
- All prior findings: `ADDRESSED`; no new Critical, Important, or Minor findings.
- Independent verification: interchange 23/23, parser 3/3, StudioCore build, and strict format passed.
- Verdict: `SPEC PASS`; `QUALITY APPROVED`.
- Status: B5 accepted and frozen. Real DAW round-trip/compatibility qualification remains explicitly not run and is not claimed.

### Wave C10 gate audit dispatch

- Read-only auditor: Godel `019fff6e-e5bc-79e2-b26a-37e9ce37abf5` (`gpt-5.6-sol`).
- Scope: existing private/versioned calibration label persistence and evaluation reports only; no edits, production integration, capability activation, real corpus, or network use.
- Purpose: establish the independent correction list while Wave B is active. Any C10 implementation remains blocked until the shared B6 calibration contract is accepted.

### Wave C10 gate audit 1

- Auditor: Godel `019fff6e-e5bc-79e2-b26a-37e9ce37abf5` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: evidence-family reporting exposes counts only, not per-family precision, recall, calibration, abstention, coverage, false-auto, and resource metrics; unavailable evidence can be counted as observed.
- Important: corpus partitions are arbitrary strings and do not prove held-out Artist/Song isolation; reports lack typed synthetic/real provenance and explicit rights/model, resource, DAW, packaging, and hosted-service gate status.
- Important: immutable binding accepts any non-path provenance string, permits weak export labels, omits target/material/resource evidence for audio matches, and trusts caller-supplied feature digests.
- Important: algorithm/calibration/reproduction/date/score/performance metadata is not semantically or numerically validated.
- Important: authoritative review call sites exist only for Session-to-Work; other required label families have enums but no delivered authority path, and supersession is optional for contradictory active decisions.
- Important: schema v1 has no migration; version is checked only after full decode; loaded-ledger corruption and supersession consistency are not validated.
- Important: writes are coordinated/atomic, but cached `load()` is stale across instances/processes and no separate-process test proves convergence.
- Important: ledger/string/note/feature/file bounds, private file permissions, complete path/personal-data protection, and safe Markdown escaping/redaction are absent.
- Important: reports are unversioned and test-only with no local production entry point.
- Minor: strict formatting currently fails in `CalibrationEvaluationReport.swift`.
- Safety retained: no production call site activates ML from these labels/reports.
- Verification limitation: concurrent Wave B edits prevented a clean focused build; all four audited files passed frontend parsing and no files were changed.
- Routing: implementation remains intentionally blocked until B6 acceptance, then all nine Important findings return to one bounded C10 owner before Godel re-review.

### Wave C10 implementation dispatch

- Owner: Bohr `019fffaa-f853-7942-ba1e-0d9225e2d5e5` (`gpt-5.6-sol`).
- Dependencies: Wave A and all Wave B contracts accepted; B4/B5/B6 files frozen.
- Exclusive scope: calibration store/report, C10-only typed review/report services/tests, and minimal local `studio-index` report/review entry points.
- Required corrections: all nine gate-audit findings, including strict v2/v1 migration, semantic integrity, immutable kind-specific binding, automatic supersession, every label family, typed held-out/privacy/gate metadata, per-evidence metrics, bounds/private permissions/redaction, cross-instance/process freshness, and versioned local report delivery.
- Safety: labels/reports never activate production ML; real corpus/DAW/packaging/hosted statuses remain explicitly not run/unavailable; no upload or real music access.
- Acceptance: focused/adversarial tests, builds/format, then original auditor Godel read-only re-review with no Critical/Important findings.

### Wave C10 owner checkpoint replacement

- Initial owner Bohr `019fffaa-f853-7942-ba1e-0d9225e2d5e5` remained running through repeated bounded waits and an interrupt checkpoint request without responding, so it was closed rather than allowed to block the programme indefinitely.
- Substantial uploaded changes to the store, report, CLI, and focused tests were preserved. `StudioCore` builds on that partial state.
- First focused compile found one current test error at `CalibrationReviewStoreTests.swift:1064`; no source compile failure.
- Continuation owner Curie `019fffc6-a61c-7cd3-b9ac-bb0e2b5949cb` (`gpt-5.6-sol`) owns the same C10-only boundary and must audit/finish all nine findings rather than restart or self-accept.

### Wave C10 implementation completion

- Owner: Curie `019fffc6-a61c-7cd3-b9ac-bb0e2b5949cb` (`gpt-5.6-sol`), continuing preserved Bohr edits.
- Implemented: strict v2 persistence/narrow v1 Session migration; typed immutable bindings and digest validation; bounded metadata and private permissions; every typed label family with family-scoped supersession; cross-process locking/freshness; typed corpus isolation/gates; full per-evidence metrics; deterministic versioned reports; local `studio-index calibration-review` and `calibration-report` commands.
- Implementer verification: calibration store 26/26, reports 7/7, organisation 44/44, lineage 16/16; debug StudioCore/studio-index; release studio-index/StudioTimeMachine; strict format/concurrency parse/whitespace passed.
- Full-suite evidence: 419 tests across 49 suites; only the known C7 distorted-excerpt test failed two expectations; all C10 tests passed.
- Real corpus, rights/model review, real DAW, packaging/notarization, and hosted service remain not run; no UI, network, real music, or commit.
- Status: C10 files frozen pending original auditor Godel re-review.

### Wave C10 review 1

- Reviewer: Godel `019fff6e-e5bc-79e2-b26a-37e9ce37abf5` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: v1 migration expects a fabricated 64-hex/`sha256:` shape that historical v1 never emitted and invents source/candidate direction from sorted provenance.
- Important: partition isolation reports passed even for empty data; labelled-corpus acceptance needs only one held-out decision; evaluation/rights/resource acceptance states are not evidence-bound.
- Important: transformed-audio labels retain files/fingerprints/material/resources but omit source/target ranges, transform hypotheses, and excerpt diagnostics.
- Important: decoded v2 records do not fully repeat accepted-relationship binding checks and permit record/primary partition nil asymmetry after digest recomputation.
- Important: scored abstentions are included as incorrect predictions in Brier/calibration metrics.
- Important: privacy checks miss Windows forward-slash paths, UNC paths, and non-file URL paths.
- Important: local report output overwrites destinations and does not reject JSON/Markdown aliases or symlinks, contrary to never-overwrite delivery.
- Verified addressed: bounded metadata, all label families/supersession, cross-process freshness, core v2/future checks, bounds/0600, local commands/no activation; 26/7/44/22 tests, builds, and formatting passed. Full suite only failed known C7.
- Routing: all seven Important findings returned to continuation owner Curie for bounded fix round 1; C7-C9 implementation remains blocked.

### Wave C10 fix round 1

- Owner: Curie `019fffc6-a61c-7cd3-b9ac-bb0e2b5949cb` (`gpt-5.6-sol`).
- Implemented: truthful legacy-v1 unresolved migration; evidence-bound activation gates; audio ranges/transform/excerpt reproduction evidence; full decoded-v2 semantic checks; emitted-prediction-only calibration scoring; Windows/UNC/URL path privacy; inode-bound atomic never-overwrite report delivery with alias/symlink rejection.
- Implementer verification: store 27/27, reports 9/9, organisation 44/44, lineage 16/16; full suite 422 with only two known C7 assertions failing; debug/release both products; strict format; CLI 0600 creation plus overwrite/symlink rejection passed.
- Generated reports remain `activationAuthority: none`, gates `notRun`, hosted `unavailable`; real corpus/DAW/packaging/hosted/network not run.
- Status: C10 files frozen pending Godel re-review 2.

### Wave C10 re-review 1

- Reviewer: Godel `019fff6e-e5bc-79e2-b26a-37e9ce37abf5` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: report destinations are exclusively created but final paths become visible before full write/fsync, so crash/readers can observe partial output and post-write verification remains racy.
- Important: privacy detection misses absolute/UNC/URL paths embedded after key/value separators such as `path=`, `path:`, or `url=`.
- Important: partial/insufficient/empty evaluations inconsistently emit `ineligible` rather than the required `notRun`; tests codify the wrong distinction.
- Verified addressed: representative v1 handling, audio reproduction bindings, decoded-v2 semantics, scored-abstention filtering; 27/9/44/16 tests, release builds, formatting, and CLI overwrite/symlink sentinels passed. Full suite only failed known C7.
- Routing: all three Important findings returned to Curie for narrow fix round 2.

### Wave C10 fix round 2

- Owner: Curie `019fffc6-a61c-7cd3-b9ac-bb0e2b5949cb` (`gpt-5.6-sol`).
- Implemented: private sibling O_EXCL/0600 temp write, fsync, no-replace atomic rename, directory sync, alias/symlink/race checks and cleanup; embedded key/value path detection; incomplete/synthetic/insufficient gates now `notRun`, with `ineligible` reserved for completed failing evidence.
- Implementer verification: store 27/27, reports 12/12, organisation 44/44, lineage 16/16; CLI success/overwrite/symlink/concurrent writers (one success, one expected 133), valid final JSON/no residue; debug/release both products; strict format.
- Full suite: 425 tests across 49 suites; only known C7 distorted-excerpt assertions fail.
- Status: C10 files frozen pending Godel re-review 3.

### Wave C10 re-review 2

- Reviewer: Godel `019fff6e-e5bc-79e2-b26a-37e9ce37abf5` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: resource-budget gate counts any partial performance object as measured and reduces missing bytes/candidate count to zero, so wall-clock+memory-only evidence can be accepted rather than `notRun`.
- Verified addressed: all three prior fixes and every earlier C10 contract; 27/12/44/16 tests, CLI concurrency/overwrite/symlink, releases, formatting passed; full suite only known C7 failed.
- Routing: complete-measurement gate semantics returned to Curie for surgical fix round 3.

### Wave C10 fix round 3

- Owner: Curie `019fffc6-a61c-7cd3-b9ac-bb0e2b5949cb` (`gpt-5.6-sol`).
- Implemented in report source/tests only: resource evidence binds exact evaluated observation count and deterministic corpus digest; complete finite nonnegative measurements required; CPU required when budgeted; missing remains nil/not measured while legitimate zero remains zero; incomplete/stale => `notRun`, complete over-budget => `ineligible`.
- Implementer verification: reports 14/14, store 27/27, organisation 44/44, lineage 16/16, strict format, debug/release both products passed. Full suite deferred to final gate.
- Status: C10 frozen pending Godel re-review 4.

### Wave C10 re-review 3

- Reviewer: Godel `019fff6e-e5bc-79e2-b26a-37e9ce37abf5` (`gpt-5.6-sol`, read-only).
- All prior findings: `ADDRESSED`; no new Critical, Important, or Minor C10 findings.
- Independent verification: reports 14/14, store 27/27, organisation 44/44, lineage 16/16, both release builds, and strict format passed.
- Full run: 427 tests across 49 suites; only known C7 distorted-excerpt assertions failed.
- Verdict: `SPEC PASS`; `QUALITY APPROVED`.
- Status: C10 accepted and frozen. It supplies no activation authority; real corpus/rights/model/DAW/packaging/hosted gates remain not run/unavailable.

### Wave C prototype gate audits

- C7 auditor: Archimedes `019fffab-956b-7120-9a96-ef7d4778138b` (`gpt-5.6-sol`), read-only, including reproduction of the known distorted-excerpt failure.
- C8 auditor: Aristotle `019fffab-9988-7673-9300-1eb0f32c4689` (`gpt-5.6-sol`), read-only, defining a new-file-only research lab/evaluation boundary with unavailable-by-default semantics.
- C9 auditor: Gauss `019fffab-9735-7401-9247-4b021c9cbb85` (`gpt-5.6-sol`), read-only, defining a separate musical-version index boundary and manual-only result contract.
- These audits do not start production integration. No C7/C8/C9 implementation begins until C10 is independently accepted.

### Wave C7 gate audit 1

- Auditor: Archimedes `019fffab-956b-7120-9a96-ef7d4778138b` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: distorted-excerpt fixture consistently returns no result; ANN window scores are used as final evidence without exact sequence and immutable-file revalidation; internal/file runner-up ambiguity is not enforced; defaults allow only about 2.5-3 seconds rather than 5-10 seconds consecutive evidence; file/candidate/frame/memory/config/mutation bounds are absent; excerpt evidence is mislabeled generic semantic embedding.
- Minor: diagnostics report configured rather than effective rounded timing; strict formatting fails in both implementation files and the distorted test.
- Full-suite audit evidence: 402 tests across 48 suites, only the distorted-excerpt test failed with two expectations; contract/coordinator 18/18 passed.
- Safety retained: production registration unavailable, result suggestion-only/review-only, no automatic identity or derivative authority.

### Wave C8 gate audit 1

- Auditor: Aristotle `019fffab-9988-7673-9300-1eb0f32c4689` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`.
- Critical: transformed-sample lab/corpus harness is not implemented; only an unavailable registry descriptor and hand-constructed test observation exist.
- Important: shared schema cannot retain all transform hypotheses/composites or direct reuse vs interpolation/re-performance; current calibration/report contract cannot prove activation gates; transformed snapshots lack target/ranges/hypotheses/material/resources, assigned to active C10.
- Safe new-file boundary: transformed research models, local lab, corpus evaluation, synthetic test support/tests only; fixed 5-second/2.5-second-hop research windows, all required transform families, typed ranges/hypotheses, literal `Possible transformed use`, synthetic-only ineligible activation.
- Safety retained: registry unavailable and transformation evidence suggestion/review-only.

### Wave C9 gate audit 1

- Auditor: Gauss `019fffab-9735-7401-9247-4b021c9cbb85` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; Feature 2D is not implemented beyond unavailable semantic scaffolding.
- Important: generic semantic matcher lacks immutable/range/ambiguity/resource safety; no enforceable deterministic-search-first receipt; no exact manual-only `Musically related` result/type boundary.
- Safe new-file boundary: musical discovery prototype/index/tests only, with deterministic local whole/segment features, separate bounded index, immutable observations/ranges/resources, typed deterministic-search receipt, ambiguity/staleness abstention, and no lineage/Work/session authority or cloud storage.
- Safety retained: semantic capability unavailable and accepted calibration cannot promote it.

### Wave C implementation dispatch

- C7 owner: Confucius `01a0001b-068a-7731-a3f4-b77002a2149e` (`gpt-5.6-sol`), exclusive owner of landmark/excerpt and the only shared matcher-contract seam during this wave.
- C8 owner: Boyle `01a0001b-0862-7261-a756-1e850c3b5cfd` (`gpt-5.6-sol`), new transformed-research model/lab/corpus files only.
- C9 owner: Einstein `01a0001b-0a7c-7983-b74d-bf91baf2f206` (`gpt-5.6-sol`), new musical-version prototype/index/test files only.
- Dependencies: A/B and C10 accepted; accepted files frozen except C7's explicitly authorised matcher-contract compatibility seam.
- Safety: all three remain unavailable-by-default, local, bounded, synthetic-fixture research; suggestion/manual review only; no ML activation, identity authority, Work/Session action, cloud storage, or network.
- Registry/search/C10 ingestion remains a later sequential integration seam after each prototype is independently accepted.

### Wave C9 implementation

- Owner: Einstein `01a0001b-0a7c-7983-b74d-bf91baf2f206` (`gpt-5.6-sol`).
- Implemented only the three authorised new files: versioned deterministic whole/segment embeddings, separate bounded persistent index, private deterministic-search receipt issuance, immutable-file revalidation, explicit safety abstention, and manual-only exact `Musically related` results.
- Remains unavailable-by-default and disconnected from search, registry, lineage, organisation, UI, calibration, cloud, and network.
- Implementer verification: focused 12/12, StudioCore build, strict format/concurrency parse, forbidden-authority grep, and diff checks passed using synthetic fixtures only.
- Status: C9 files frozen pending original auditor Gauss review.

### Wave C9 review 1

- Reviewer: Gauss `019fffab-9735-7401-9247-4b021c9cbb85` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: memory preflight/report omits retained alignment score arrays; an allowed adversary reports 1.73 MB under a 2 MiB budget while scores alone require about 61.5 MB.
- Important: cancellation is checked before comparison but not within candidate/offset/pitch/segment loops, permitting long cancellation delay near the 100-million comparison ceiling.
- Verified addressed: private receipt, deterministic/corruption-safe separate index, immutable/range/runner-up/stale evidence, manual-only label, unavailable/disconnected authority boundary; focused 12/12, builds, format, concurrency parse passed.
- Routing: both Important findings returned to Einstein for bounded fix round 1.

### Wave C8 implementation

- Owner: Boyle `01a0001b-0862-7261-a756-1e850c3b5cfd` (`gpt-5.6-sol`).
- Implemented entirely in six authorised new files: unavailable-by-default bounded 5-second/2.5-second lab, immutable observations, all 16 typed transform families, composite/range evidence, literal `Possible transformed use`, versioned leakage-checked corpus manifests, deterministic per-transform metrics and evidence-bound non-activation gates.
- Remains disconnected from registry/C10/shared matcher authority and has no activation API.
- Implementer verification: 19 focused tests across two suites including all 16 transform fixtures, StudioCore build, strict format/concurrency parse/diff checks; temporary WAVs only.
- Status: C8 files frozen pending original auditor Aristotle review.

### Wave C8 review 1

- Reviewer: Aristotle `019fffab-9988-7673-9300-1eb0f32c4689` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: byte-identical files can emit transformed-use/chopping evidence, making direct-reuse vs re-performance classification unreliable.
- Important: source/target observations are not revalidated after comparison and can be stale at return.
- Important: dominant nested comparison loops ignore in-flight cancellation.
- Important: per-transform calibration applies one overall score to every family, yielding invalid Brier/calibration for unpredicted families.
- Important: gate evidence is not bound to evaluation result/algorithm artifact and false-positive budget can pass with no held-out negatives.
- Important: unchecked resource integer addition can overflow-crash evaluation.
- Verified addressed: unavailable default, exact geometry, hard bounds, ranges/observations, all 16 typed/composite hypotheses, literal label, leakage/synthetic gates, no authority; focused 19/debug build/format passed.
- Routing: all six Important findings returned to Boyle for bounded fix round 1.

### Wave C7 implementation

- Owner: Confucius `01a0001b-068a-7731-a3f4-b77002a2149e` (`gpt-5.6-sol`).
- Implemented: local-neighbour candidate retrieval followed by exact deterministic sequence scoring; immutable source/target capture and mutation revalidation; internal/cross-file ambiguity abstention; effective 5-10-second evidence; bounded config/files/candidates/frames/memory/cancellation; distinct excerpt evidence.
- Safety: unavailable-by-default, suggestion/review-only, never verified identity or automatic/high-confidence derivative.
- Implementer verification: 41 focused C7/contracts/coordinator/lineage, B6 19, C10 41; full suite 472/472; release both products; strict format/concurrency/whitespace/conflict checks passed.
- Status: C7 files frozen pending original auditor Archimedes review.

### Wave C7 review 1

- Reviewer: Archimedes `019fffab-956b-7120-9a96-ef7d4778138b` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical/Minor findings.
- Important: memory preflight/report counts fingerprint frames only, omitting channel-scaled AVAudioPCMBuffer and fixed FFT/window/index allocations; high-channel input can exceed the configured ceiling while reporting compliance.
- Verified addressed: all other prior findings; focused 41, B6 19, C10 41, full 473/473, both releases, scoped strict format passed.
- Routing: truthful complete memory accounting/high-channel adversary returned to Confucius for bounded fix round 1.

## Wave A dispatch brief

### Wave C8 fix round 1

- Owner: Boyle `01a0001b-0862-7261-a756-1e850c3b5cfd` (`gpt-5.6-sol`).
- Corrected all six review findings in the authorised six-file slice: identical-file abstention, final immutable observation revalidation, dominant-loop cancellation, per-family calibration confidence, evaluation/algorithm/artifact-bound gate evidence with mandatory real held-out negatives, and overflow-safe fail-closed resource accounting.
- Implementer verification: 27 focused tests, full `swift test` 486/486 across 52 suites, strict formatting/parsing, StudioCore build, and release builds for `StudioTimeMachine` and `studio-index`.
- Status: files frozen; original reviewer Aristotle resumed for independent re-review. Real-corpus calibration, real-DAW qualification, packaging, and hosted services remain not run.

### Wave C8 review 2

- Reviewer: Aristotle `019fffab-9988-7673-9300-1eb0f32c4689` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: `possibleInterpolation` and `possibleReperformance` are unreachable, so the required direct-reuse versus interpolation/re-performance distinction is not implemented.
- Important: working-memory admission excludes the full five-second sample copy and channel-scaled decoder allocations, occurs after both decodes, and is skipped for byte-identical pairs; a 384 kHz probe exceeded the configured ceiling.
- Minor: the actual authorised shared test support file is `TransformedSampleResearchTestSupport.swift`; ledger/prompt inventory is corrected accordingly.
- All six prior Important findings were independently confirmed fixed. Reviewer verification: 27 C8, 59 adjacent matcher, full 486/486 across 52 suites, both release products, strict format/diff, and independent probes passed.
- Routing: both Important findings returned to Boyle for bounded fix round 2; C8 remains unaccepted.

### Wave C8 fix round 2

- Owner: Boyle `01a0001b-0862-7261-a756-1e850c3b5cfd` (`gpt-5.6-sol`).
- Made `directReuse`, `possibleInterpolation`, `possibleReperformance`, and `unknown` reachable under conservative typed-evidence rules with conflict/malformed abstention.
- Moved overflow-safe memory admission before allocation and included both channel-scaled decode buffers, retained samples, metadata/scratch/fixed overhead, identical-file handling, and sample-rate/channel bounds.
- Implementer verification: 32 C8 focused, 61 adjacent matcher, full `swift test` 497/497 across 52 suites, strict-concurrency StudioCore, both release products, parse/strict-format/conflict/whitespace/forbidden-boundary checks.
- Status: files frozen; Aristotle resumed for independent re-review. Synthetic fixtures only; real corpus/calibration, DAW, UI/Accessibility, packaging/notarization, and hosted services remain not run.

### Wave C8 review 3

- Reviewer: Aristotle `019fffab-9988-7673-9300-1eb0f32c4689` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical/Minor findings.
- Important: conflicting and weak evidence falls through to `unknown`, which the lab still emits as a transformed-use match instead of abstaining; no separate classification disposition preserves the evidence ladder.
- The memory-bound finding and all earlier C8 protections were accepted. Reviewer verification: 32 C8, 61 adjacent, full 497/497 across 52 suites, both releases, strict checks, exact/one-byte-under and high-rate/channel probes passed.
- Routing: explicit classification disposition and no-output abstention for unknown/conflict/weak/malformed evidence returned to Boyle for bounded fix round 3; C8 remains unaccepted.

### Wave C8 fix round 3

- Owner: Boyle `01a0001b-0862-7261-a756-1e850c3b5cfd` (`gpt-5.6-sol`).
- Added versioned v4 relationship dispositions separating classified outcomes from low/conflicting/malformed/indeterminate abstentions; the lab emits no match for abstentions and evaluation rejects unknown positives.
- Implementer verification: 33 C8 across two suites, 61 adjacent across four suites, full `swift test` 501/501 across 52 suites, strict-concurrency StudioCore, both release products, strict format/parse/whitespace/conflict/boundary/inventory checks.
- Status: files frozen; Aristotle resumed for final independent re-review. Synthetic fixtures only; real corpus/calibration, DAW, UI/Accessibility, packaging/notarization, and hosted services remain not run.

### Wave C8 review 4

- Reviewer: Aristotle `019fffab-9988-7673-9300-1eb0f32c4689` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical/Minor findings.
- Important: corpus validation accepts `.unknown` transformed-use ground truth and metrics ignore expected classification, allowing an unknown case to score as a true positive with full coverage.
- Important: nested match validation accepts any non-empty algorithm version, so a decoded v3 match can validate inside a current v4 result even while the enclosing capability rejects v3.
- All seven disposition probes and earlier protections passed. Reviewer verification: 33 C8, 61 adjacent, full 501/501 across 52 suites, both releases, strict checks, unchanged hashes.
- Routing: unknown-ground-truth rejection/class-aware metrics and exact nested version binding returned to Boyle for bounded fix round 4; C8 remains unaccepted.

### Wave C8 fix round 4

- Owner: Boyle `01a0001b-0862-7261-a756-1e850c3b5cfd` (`gpt-5.6-sol`).
- Rejected unknown transformed-positive ground truth, required explicit negative labels, made metrics require transform-family and relationship-class agreement with zero abstention coverage, and enforced exact current v4 binding across matches/results/evaluations/artifact bindings/reports/gates.
- Implementer verification: 37 C8 across two suites, 61 adjacent across four suites, full `swift test` 505/505 across 52 suites, strict-concurrency StudioCore, both release products, strict format/parse/whitespace/conflict/boundary/inventory checks.
- Status: files frozen; Aristotle resumed for independent re-review. Synthetic fixtures only; real corpus/calibration, DAW, UI/Accessibility, packaging/notarization, and hosted services remain not run.

### Wave C8 review 5

- Reviewer: Aristotle `019fffab-9988-7673-9300-1eb0f32c4689` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical/Minor findings.
- Important: persisted report gate statuses are not validated against or bound to gate evidence, allowing accepted gates over `.notRun` evidence and empty nested review IDs to survive validation/persistence/decode.
- Round-4 ground-truth, class-aware metrics, exact v4 nested binding, and all earlier C8 protections passed. Reviewer verification: 37 C8, 61 adjacent, full 505/505 across 52 suites, both releases, strict checks, unchanged hashes.
- Routing: deterministic gate derivation, full evidence validation, decision/evidence digest binding, and forged-report adversaries returned to Boyle for bounded fix round 5; C8 remains unaccepted.

### Wave C8 fix round 5

- Owner: Boyle `01a0001b-0862-7261-a756-1e850c3b5cfd` (`gpt-5.6-sol`).
- Made gate decisions exclusively derived from validated evidence and added schema-v2 report digests binding evidence, context, decisions, metrics, review IDs, and artifact identifiers; forged/stale/malformed/duplicate/legacy/mutated/overflow cases fail closed.
- Implementer verification: 38 C8 across two suites, 61 adjacent across four suites, full `swift test` 506/506 across 52 suites, strict-concurrency StudioCore, both release products, strict format/parse/whitespace/conflict/production-boundary checks.
- Status: files frozen; Aristotle resumed for independent re-review. Synthetic fixtures only; real corpus/calibration, DAW, UI/Accessibility, packaging/notarization, and hosted services remain not run.

### Wave C8 acceptance

- Reviewer: Aristotle `019fffab-9988-7673-9300-1eb0f32c4689` (`gpt-5.6-sol`, independent read-only).
- Verdict: `SPEC PASS`; `QUALITY APPROVED`; no Critical, Important, or Minor findings.
- Independent verification: 38 C8, 61 adjacent, full `swift test` 506/506 across 52 suites, both release products, strict format/whitespace, unchanged file hashes, and forged-gate/digest/legacy/overflow/review-ID probes passed.
- Status: C8 accepted and frozen. Capability remains unavailable, unregistered, suggestion-only, and without identity or activation authority; real corpus/calibration, DAW, packaging/notarization, hosted services, and UI QA remain not run/not applicable.

## Integrated verification gate

- Local orchestrator verification after all slice acceptances: full `swift test` 506/506 across 52 suites passed.
- Release `StudioTimeMachine` and release `studio-index` builds passed sequentially.
- Authorized content-intelligence/interchange/calibration source and test inventory passed strict `swift-format` 6.3.
- Whole `StudioCore` passed complete strict concurrency with warnings as errors.
- Scoped conflict-marker and trailing-whitespace scans passed.
- Repository-wide strict formatting still reports pre-existing out-of-scope files; no unrelated formatting was changed.
- Git boundary remains `?? ./` for the entire app from the parent repository; no commit was created.
- Next gate: one new independent broad cross-contract SPEC/QUALITY review of all ten workstreams and the final integrated evidence.

## Final broad review 1

- Reviewer: Volta `01a000bd-cbbb-7e41-a607-9eb97908c153` (`gpt-5.6-sol`, independent read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important B6: near-identity request memory is checked after allocation, retains all candidate fingerprints, omits live/capacity/cumulative candidate memory, and persists only source/winner estimates with measured memory defaulting to zero.
- Important C10: reports can be publicly decoded/constructed and persisted without binding to a review-store snapshot or recomputing metrics/gates, allowing accepted gates or understated peak memory to be forged.
- Important C10: ledger and CLI readers stat a pathname then perform a separate mapped/unbounded path read, allowing replacement/growth to bypass the pre-allocation cap.
- Minor A3: `ProjectStagingCopy.swift` is not strict-format clean, so the prior integrated scoped-format inventory was incomplete.
- Independent verification: 397 focused tests across 21 suites, full 506/506 across 52 suites, both release products, warnings-as-errors strict concurrency, conflict/whitespace/diff checks passed; no UI/real corpus/DAW/packaging/hosted activity.
- Routing: B6 Important returned to Kuhn; both C10 Important findings returned to Curie; A3 formatting Minor assigned to Raman, all using `gpt-5.6-sol` and non-overlapping ownership.

### A3 formatting correction

- Owner: Raman `01a000d5-04e7-7890-a414-d8836c56c478` (`gpt-5.6-sol`).
- Applied formatting-only changes to `ProjectStagingCopy.swift`; parser-normalized pre/post checksum matched.
- Verification: strict file lint, StudioCore build, and 49 ProjectHandoffCore tests passed.
- Status: file frozen for final independent re-review; no semantic/API/string/test/contract change and no commit.

### B6 broad-review correction

- Owner: Kuhn `019fff2e-464c-7db2-8e60-3a093ba385c9` (`gpt-5.6-sol`).
- Added v5 streaming top-two ranking, overflow-safe request memory preflight before digest/decode, positive modeled payload/conservative order-independent request peak evidence, and calibration rejection of absent/zero measured memory.
- Verification: B6 23, contracts 15, coordinator 9, C7 19, C10 reports 16/store 31, full `swift test` 517/517 across 52 suites, both releases, warnings-as-errors concurrency, and strict format passed.
- Status: B6 files frozen for Volta re-review. Memory is deterministic modeled payload/upper-bound evidence, not process RSS; real corpus/DAW/network not run.

### C10 broad-review correction

- Owner: Curie `019fffc6-a61c-7cd3-b9ac-bb0e2b5949cb` (`gpt-5.6-sol`).
- Added schema-v3 canonical report integrity bound to exact store identity/generation/content digest/evaluated facts/metrics/resources/derived gates; trusted publication reloads and recomputes before atomic write, rejecting forged/legacy/mutated/understated/stale reports while activation authority stays `none`.
- Replaced store/CLI path stat plus mapped read with descriptor-based bounded no-follow regular-file reads validating identity, size, EOF, mutation, alias, symlink, and nonregular cases.
- Verification: store 31 across two suites, reports 16, organisation 44, lineage 16, full `swift test` 517/517 across 52 suites, both products debug/release/strict-concurrency, strict format, and forbidden-read scan passed.
- Status: C10 files frozen for Volta re-review. Real corpus/DAW/packaging/hosted/network/ML activation not run; gates remain `notRun`.

## Final broad acceptance

- Reviewer: Volta `01a000bd-cbbb-7e41-a607-9eb97908c153` (`gpt-5.6-sol`, independent read-only).
- Verdict: `SPEC PASS`; `QUALITY APPROVED`; no Critical, Important, or Minor findings.
- All Final broad review 1 findings are independently confirmed addressed: B6 v5 conservative pre-allocation/streaming accounting, C10 schema-v3 integrity/trusted recomputation/bounded descriptor reads, and A3 strict formatting.
- Independent verification: B6 47/47, C10 47/47, A3 49/49, full `swift test` 517/517 across 52 suites, both release products, strict scoped format, warnings-as-errors complete concurrency, whitespace/conflict and forbidden-read scans passed.
- Qualification truth: deterministic simulated implementation approved; real corpus/calibration, real DAW, packaging/notarization, and hosted services not run; production ML unavailable; no correction UI files and no additional rendered QA required.
- Final orchestrator-owned frozen-tree verification follows this acceptance record.

## Final orchestrator verification

- Frozen-tree full `swift test`: 517/517 across 52 suites passed.
- Frozen-tree release `StudioTimeMachine` and release `studio-index`: passed sequentially.
- Strict `swift-format` 6.3 passed for the complete authorised feature/test inventory, `ProjectStagingCopy.swift`, and `StudioIndexCLI/main.swift`.
- Complete strict-concurrency StudioCore build with warnings as errors passed.
- Conflict-marker, trailing-whitespace, and forbidden mapped/path-based C10 read scans passed.
- Git boundary remains `?? ./` for the untracked local app; no commit created and unrelated work was not modified.
- Final status: every authorised local implementation slice is complete, independently accepted, corrected, and verified. Production ML remains unavailable; real-corpus calibration, real-DAW qualification, packaging/notarization, and hosted services remain explicitly not run.

### Wave C9 fix round 1

- Owner: Einstein `01a0001b-0a7c-7983-b74d-bf91baf2f206` (`gpt-5.6-sol`).
- Replaced retained alignment-score arrays with bounded streaming summaries, separated conservative index/source/comparison memory accounting, and added cancellation checks every 64 segment comparisons with adversarial coverage.
- Implementer verification: 14 focused tests, full `swift test` 486/486 across 52 suites, StudioCore debug build, both release products, strict formatting, and strict-concurrency parsing.
- Status: files frozen; original reviewer Gauss resumed for independent re-review. Synthetic fixtures only; real corpus/calibration, real DAW, UI, packaging, and hosted services remain not run.

### Wave C9 review 2

- Reviewer: Gauss `019fffab-9735-7401-9247-4b021c9cbb85` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: cumulative resident index plus next extraction/result is not preflighted before allocation during index build, and recall checks resident index plus source extraction only after allocation.
- Important: extraction uses a fixed memory allowance despite channel-scaled `AVAudioPCMBuffer` allocation and has no supported-channel cap or multichannel adversary.
- Prior retained-alignment and in-loop cancellation defects are accepted as fixed; evidence-ladder, disconnected registry, recall receipt, exact `Musically related` label, and manual-only semantics remain accepted.
- Reviewer verification: 14 C9, 14 matcher-contract, 9 coordinator, 6 deterministic-search, 17 landmark tests; full 402 tests across 64 suites; both releases and strict checks passed.
- Routing: both Important findings returned to Einstein for bounded fix round 2; C9 remains unaccepted.

### Wave C9 fix round 2

- Owner: Einstein `01a0001b-0a7c-7983-b74d-bf91baf2f206` (`gpt-5.6-sol`).
- Added pre-allocation cumulative resident-index/transient-extraction/result accounting, bounded persisted index accounting, channel-scaled decoder/FFT/scratch accounting, and an eight-channel admission cap; retained streaming summaries and in-loop cancellation.
- Added four adversarial cases for cumulative/index-resident extraction, channel bounds, and overflow.
- Implementer verification: 18 C9 focused, 53 adjacent across four suites, full `swift test` 496/496 across 52 suites, StudioCore debug, both release products, strict format/concurrency/whitespace/diff/pattern checks.
- Status: files frozen; Gauss resumed for independent re-review. Synthetic fixtures only; real corpus/calibration, DAW, UI, packaging, and hosted services remain not run.

### Wave C9 review 3

- Reviewer: Gauss `019fffab-9735-7401-9247-4b021c9cbb85` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical/Minor findings.
- Important: checksum-valid persisted indexes accept unbounded observation strings while minimum resident-memory validation counts only segments plus fixed allowance, permitting forged underclaimed memory evidence on cross-instance recall.
- All prior C9 findings and safety/activation boundaries remained accepted. Reviewer verification: 18 C9, 48 adjacent, full 497/497 across 52 suites, both releases, strict checks and external access probes passed.
- Routing: bound/account all variable persisted fields plus exact/one-byte-under cross-instance adversaries returned to Einstein for bounded fix round 3; C9 remains unaccepted.

### Wave C9 fix round 3

- Owner: Einstein `01a0001b-0a7c-7983-b74d-bf91baf2f206` (`gpt-5.6-sol`).
- Added bounded UTF-8 fields, canonical local-file URL validation, bounded decoding, and shared content-derived overflow-safe memory accounting for strings, URLs, containers, segments, embeddings, and fixed overhead across build/load; extraction retains a separate worst-case reservation.
- Implementer verification: 21 C9, 67 adjacent across five suites, full `swift test` 501/501 across 52 suites, StudioCore debug and warnings-as-errors strict concurrency, both release products, strict format/parse/whitespace/boundary checks.
- Status: files frozen; Gauss resumed for final independent re-review. Synthetic fixtures only; real corpus/calibration, DAW, UI, packaging/notarization, and hosted services remain not run.

### Wave C9 acceptance

- Reviewer: Gauss `019fffab-9735-7401-9247-4b021c9cbb85` (`gpt-5.6-sol`, independent read-only).
- Verdict: `SPEC PASS`; `QUALITY APPROVED`; no Critical, Important, or Minor findings.
- Independent verification: 21 C9, 67 adjacent across five suites, full `swift test` 501/501 across 52 suites, both release products, strict format, warnings-as-errors concurrency, whitespace/authority scans, and external receipt/activation probes passed.
- Status: C9 accepted and frozen. Production remains unavailable; real corpus/calibration, DAW, packaging/notarization, and hosted services remain not run; UI QA not applicable.

### Wave C7 fix round 1

- Owner: Confucius `01a0001b-068a-7731-a3f4-b77002a2149e` (`gpt-5.6-sol`).
- Replaced incomplete frame-only accounting with a shared overflow-safe working-memory preflight/report boundary covering channel-scaled decode buffers, FFT/window arrays, fingerprint/postings/index/scoring storage, retained capacity, and fixed overhead; inputs above 16 channels abstain before fingerprinting.
- Added high-channel, exact-limit, one-byte-over-limit, invalid-channel, and legacy persistence adversaries.
- Implementer verification: 63 focused C7/B6/contracts/coordinator/lineage tests, 41 C10 compatibility tests, full `swift test` 486/486 across 52 suites, both release products, strict format/concurrency/whitespace/conflict checks.
- Status: files frozen; original reviewer Archimedes resumed for independent re-review. No real corpus, DAW, network, or model activity.

### Wave C7 review 2

- Reviewer: Archimedes `019fffab-956b-7120-9a96-ef7d4778138b` (`gpt-5.6-sol`, read-only).
- Verdict: `SPEC FAIL`; `QUALITY NOT APPROVED`; no Critical findings.
- Important: request-level memory evidence models one pair and persists only the winning target estimate, omitting a larger losing candidate peak and candidate-count-scaled retained summaries/capacity.
- Minor: high-channel test does not directly prove abstention before PCM allocation; direct checked-arithmetic overflow adversaries are absent.
- All other C7 behavior and safety contracts were accepted. Reviewer verification: 44 C7/contracts/coordinator/lineage, 19 B6, 41 C10, full 486/486 across 52 suites, both releases, and scoped strict formatting passed.
- Routing: Important and Minor findings returned to Confucius for bounded fix round 2; C7 remains unaccepted.

### Wave C7 fix round 2

- Owner: Confucius `01a0001b-068a-7731-a3f4-b77002a2149e` (`gpt-5.6-sol`).
- Added request-level candidate-scaled container/metadata/summary/ranking/query accounting, persisted the order-invariant maximum peak across every candidate, fail-closed overflow, and a pre-PCM-allocation high-channel test seam.
- Implementer verification: 46 C7/contracts/coordinator/lineage, 19 B6, 41 C10 across three suites, full `swift test` 497/497 across 52 suites, both release products, strict format/concurrency/whitespace/conflict checks.
- Status: files frozen; Archimedes resumed for independent re-review. Deterministic synthetic fixtures only; real corpus/calibration, DAW, UI, packaging/notarization, hosted services, network, and model qualification remain not run.

### Wave C7 acceptance

- Reviewer: Archimedes `019fffab-956b-7120-9a96-ef7d4778138b` (`gpt-5.6-sol`, independent read-only).
- Verdict: `SPEC PASS`; `QUALITY APPROVED`; no Critical, Important, or Minor findings.
- Independent verification: 46 C7/contracts/coordinator/lineage, 19 B6, 41 C10, full `swift test` 497/497 across 52 suites, both release products, scoped strict format/whitespace, and warnings-as-errors strict concurrency passed.
- Status: C7 accepted and frozen. Production remains unavailable and suggestion-only; real corpus/calibration, DAW, packaging/notarization, and hosted services remain not run.

### Agent A

- Goal: close any spec gaps in directional containment, explanation evidence, and organisation review persistence without weakening abstention rules
- Allowed files:
  - `Sources/StudioCore/SessionContentOrganisation.swift`
  - `Sources/StudioCore/SessionContentLineage.swift`
  - `Sources/StudioCore/SessionContentLineageCandidateGeneration.swift`
  - `Tests/StudioCoreTests/SessionContentLineageResolverTests.swift`
  - `Tests/StudioCoreTests/SessionContentLineageCandidateGeneratorTests.swift`
  - `Tests/StudioCoreTests/SessionContentOrganisationEngineTests.swift`
- Must not edit export, handoff, UI, or calibration-storage files
- Must preserve manual authority, review-only fallback, and exact-decision parity

### Agent B

- Goal: close any spec gaps in bounded Export DNA parsing, contradictions, track metadata, and redacted sidecar association support
- Allowed files:
  - `Sources/StudioCore/ExportDNAParser.swift`
  - `Sources/StudioCore/ExportDNAModels.swift`
  - `Sources/StudioCore/ExportDNAAssociationSupport.swift`
  - `Tests/StudioCoreTests/ExportDNAParserTests.swift`
- Must not edit project-handoff, UI, or live-export files
- Must preserve read-only parsing, size bounds, and descriptive-metadata distrust

### Agent C

- Goal: close any spec gaps in read-only project-boundary auditing, truthful portability status, and handoff-report safety
- Allowed files:
  - `Sources/StudioCore/ProjectReadinessAuditor.swift`
  - `Sources/StudioCore/ProjectHandoffModels.swift`
  - `Sources/StudioCore/ProjectHandoffReports.swift`
  - `Tests/StudioCoreTests/ProjectHandoffCoreTests.swift`
- Must not edit export-DNA or containment files
- Must preserve no-mutation guarantees, never-overwrite planning, and truthful "portable to another Mac" language

## Reporting template

- `IMPLEMENTED`: code changes landed locally
- `FOCUSED TESTS`: exact command and result
- `SPEC PASS`: yes/no with outstanding clause references
- `QUALITY APPROVED`: yes/no after independent review
- `REAL CORPUS CALIBRATION`: not run unless explicitly stated
- `REAL DAW QUALIFICATION`: not run unless explicitly stated
