# Studio Time Machine implementation programme

## Global constraints

- Preserve every indexed music file. Never move, rename, overwrite, save, freeze, bounce, collect,
  upload, email, or delete user material without a reviewed plan and exact-step approval.
- Local-first and truthful provenance remain product invariants. Suggestions are not verified facts.
- Keep the source `StudioLibraryIndex` physically truthful and layer Artist, Song, Session, revision,
  export, delivery, and managed-library records above it.
- The primary renderer is the user's installed Ableton Live. Screenshot computer use is never the
  primary executor.
- New filesystem outputs use staging, atomic promotion, collision-safe paths, and never-overwrite.
- Preserve current sample/demo launch arguments for deterministic UI QA, but never confuse them with
  the real cached library.
- Do not commit or modify unrelated work in the current linked worktree.

## Wave 1 — trustworthy action foundations

### Task 1: Durable Export Inbox core

Implement the non-UI domain and persistence layer described in `export-detection-and-delivery.md`:

- stable batch detection from file-event candidates;
- debounce/probe seam for growing files;
- explicit export-folder and filename evidence;
- exclusion of recordings, freeze, consolidate, crop, reverse, and sample-library material;
- `ExportBatch`, status, association evidence, package and delivery-attempt records;
- durable deduplication across relaunch;
- review/relink/dismiss transitions;
- focused tests, including partial render, duplicate event, manual export suggestion, verified output,
  exclusion, and collision cases.

No SwiftUI, network, mail, cloud, ZIP, or real Live interaction in this task.

### Task 2: Project readiness and handoff core

Implement the non-UI, non-Live-mutation first slice from `ableton-project-handoff.md`:

- immutable `ProjectHandoffPlan`, `ProjectReadinessAudit`, assurance states, requirements and risks;
- audit an indexed Set using media dependency and plug-in inventory evidence;
- redact absolute local paths and personal data from recipient output;
- deterministic JSON, plain-text, and PDF report generation;
- safe staged-copy plan/executor for an intact Ableton Project leaf with collision/no-overwrite,
  byte/file verification, manifest and SHA-256 evidence;
- focused tests for ready, missing media, external plug-in library uncertainty, collision, source
  mutation resistance, redaction and package verification.

No Collect All and Save automation, Freeze/Bounce, ZIP, upload, email, or source music mutation in
this task.

### Task 3: Content-based Session-to-Song integration

Connect the existing content-lineage primitives to production organisation:

- build `SessionContentManifest` values from real indexed Set dependencies, arrangements and stable
  content identities without hashing entire libraries unnecessarily;
- compute corpus frequency so common library samples/templates cannot dominate;
- compare unassigned or weakly grouped Sessions to existing Works;
- surface persistent review candidates with explanations and matched anchors;
- auto-attach only when calibrated evidence, artist compatibility and runner-up margin permit;
- keep user assignments/rejections authoritative;
- add regressions for `idea005` style names, common samples, ambiguity, artist conflict, exact copies,
  and durable rejection.

Do not move files or make uncalibrated automatic assignments.

## Wave 2 — app integration

### Task 4: Export Inbox UI and notifications

Add the bell count, durable Inbox, `New export detected` banner, review/relink/dismiss and version
timeline integration. Preserve background monitoring and cached launch behavior.

### Task 5: Local delivery

Create verified ZIP packages, text/JSON manifest, checksums, Reveal, native Share/Mail, and editable
recipient message. No automatic send or upload.

### Task 6: Send Project UI

Add `Send Project...`, readiness review, staging progress, truthful three-part assurance, report
preview, and handoff to local delivery.

### Task 7: Inspector replacement

Remove the overwhelming full-height inspector from primary Song recovery. Route version details,
chain evidence, export review and file metadata into focused pages, sheets and disclosures.

### Task 8: Content-match review and Variant lanes

Expose content-based Song suggestions and durable accept/reject controls. Render Main, Clean,
Explicit, Instrumental and other filename-derived lineages as compact reviewed branches.

## Wave 3 — controlled Ableton and filesystem actions

### Task 9: Real Live 12.4.2 export qualification

Capture a read-only semantic AX fixture, update the versioned adapter to actual identifiers/roles,
keep unexpected prompts blocking, pass fake tests, then request approval for a disposable real export.

### Task 10: Portable Project Live automation

On a verified staging copy only, automate Collect All and Save; re-index and verify all Ableton-visible
media is contained. Later add a separate compatibility Set and reviewed Freeze/Bounce fallbacks.

### Task 11: Managed Studio Library and templates

Implement per-Song `Copy into Studio Library`, verified promotion, Finder-mirrored Artist/Song/Session
structure, source provenance, and separate archive-original action. Add new Project creation from
DAW-native templates into transparent destinations.

### Task 12: Ableton-native chain recovery

Prefer existing `.adg`/Rack artifacts and Ableton-native recovery. Add reviewed copy/paste or Live
insertion only where a fidelity-preserving payload is proven; keep inspect-only for unsupported chains.

## Wave 4 — distribution and business platform

### Task 13: External sample onboarding and richer matching

Complete selected external sample roots, original-to-collected family UI, missing-file recovery,
segment/transformed matching calibration and semantic classification behind truthful availability.

### Task 14: Distribution

Developer ID signing, Hardened Runtime, notarization, stable TCC identity, clean-account install,
Accessibility onboarding and update path.

### Task 15: Hosted Studio Send

Only after local delivery is proven: authenticated private storage, expiring links, retention and
revoke controls, transactional email, quotas, abuse protection, download receipts and billing.

### Task 16: Broader plug-in and DAW intelligence

Design the canonical AU/VST/VST3/AAX product catalogue, consented anonymous aggregation, account and
sync boundaries, multi-DAW adapters, learned recommendation evaluation and commercial packaging.
Logic remains read-only until its adapter is validated; FL Studio, Pro Tools and AAX require separate
capability-qualified plans.

## Wave 5 — content intelligence and portability

The implementation-ready contract is `content-intelligence-and-portability.md`. It adds directional
Session containment, layered audio matching, BWF/iXML Export DNA, an adapter-neutral project model,
project-boundary audits, and private calibration without weakening the existing evidence ladder.

Delivery is split into deterministic, scale/interoperability, and research capabilities. Neural or
semantic matchers remain unavailable in production until their labelled-corpus, calibration,
licensing, and resource gates pass.

## Verification gates

Each task requires focused tests, full `swift test`, release build, diff review and truthful reporting.
UI tasks additionally require rendered and Accessibility QA. Live tasks report simulated and real QA
separately. Distribution and hosted delivery remain separate statuses from local implementation.
