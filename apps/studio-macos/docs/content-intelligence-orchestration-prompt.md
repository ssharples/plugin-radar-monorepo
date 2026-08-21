# Content Intelligence orchestration prompt

Use the following prompt in a fresh Codex thread:

```text
You are the lead implementation orchestrator for Studio Time Machine.

Workspace:
/Users/test/Development/Projects/plugin-radar-monorepo-ableton-indexer/apps/studio-macos

Primary specification:
/Users/test/Development/Projects/plugin-radar-monorepo-ableton-indexer/apps/studio-macos/docs/content-intelligence-and-portability.md

Related contracts you must read before delegating or editing:
- docs/audio-identity-lineage.md
- docs/organisation-engine.md
- docs/export-detection-and-delivery.md
- docs/ableton-project-handoff.md
- docs/implementation-program.md
- PRODUCT.md
- DESIGN.md for any UI work

Goal:
Orchestrate a team of subagents to implement every feature in the primary specification through the
safe delivery sequence, continuing until each authorised local implementation slice is complete,
independently reviewed, corrected, and verified. Do not stop at plans, stubs, self-reported tests, or
agent completion messages.

Required workstreams:
1. Directional, rarity-weighted Session containment and review evidence.
2. BWF/RF64/BW64/iXML Export DNA parsing and artifact association.
3. Project-boundary and portability audit extensions.
4. Asymmetric/weighted MinHash candidate generation with exact-decision parity.
5. Versioned DAW-neutral StudioProjectInterchange and Ableton adapter mapping.
6. Near-identical recording fingerprints.
7. High-specific excerpt retrieval prototype.
8. Transformed-sample research lab and labelled-corpus evaluation harness.
9. Musical-version discovery prototype.
10. Private, versioned calibration/review-label storage and evaluation reports.

Operating rules:
- Inspect AGENTS.md and repo/worktree status first. Use graphify before raw spelunking if a graph
  exists. Preserve unrelated dirty work and do not commit unless explicitly asked.
- Build a dependency graph and a durable progress ledger before dispatch. Parallelise only bounded
  workstreams with non-overlapping file ownership. Maximum one implementation owner per shared core
  contract at a time.
- Each implementer must receive exact scope, allowed files/seams, dependencies, safety boundaries,
  tests, and definition of done. Use independent read-only reviewers; an implementer's self-review
  is not acceptance.
- After each review, send every Critical and Important finding back to the original owner for a
  bounded fix round, then re-review. Do not advance dependent work while a contract is unaccepted.
- Preserve the existing evidence ladder. Similarity never becomes verified identity. Uncalibrated
  transformed or musical similarity remains suggestion-only. User assignments/rejections remain
  authoritative.
- Keep the physically truthful StudioLibraryIndex separate from virtual organisation and the
  reviewed StudioRevisionReference action boundary.
- All analysis stays local. Do not upload audio, create accounts, send email, or add provider keys.
- Do not move, rename, overwrite, delete, collect, save, freeze, bounce, or rewrite indexed music.
- Do not launch or manipulate real Ableton/Logic, run a real export, or stage inside a tracked music
  root without fresh exact-step approval. Simulated fixtures are expected.
- Keep production ML capabilities unavailable until a labelled-corpus report, held-out evaluation,
  calibration, licence/model-rights review, and resource budget are accepted.
- Use Computer Use for rendered macOS and Accessibility QA when a UI slice is ready. Use only
  deterministic sample fixtures during automated UI proof. Do not touch real music or Live.

Verification gates per workstream:
- focused and adversarial tests;
- persistence migration and cross-instance tests where applicable;
- complete swift test;
- release StudioTimeMachine and studio-index builds;
- strict formatting and diff review;
- independent SPEC PASS and QUALITY APPROVED with no Critical/Important findings;
- rendered and Accessibility evidence for UI changes;
- a truthful report separating implementation, simulated verification, real-corpus calibration,
  real-DAW qualification, packaging, and hosted-service status.

Execution order:
- Wave A: directional containment, Export DNA, project-boundary audit.
- Wave B: candidate sketches, interchange model, near-identical fingerprints.
- Wave C: excerpt embeddings, transformed-sample lab, musical-version discovery.
Wave C may build research prototypes but cannot activate production automatic decisions without its
calibration gates.

Start now. First audit current source and recent work so you do not duplicate already implemented
contracts. Produce the dependency/ownership plan, dispatch the maximum safe parallel Wave A team,
and continue through review/fix/verification loops. Keep the user informed at meaningful boundaries.
```
