# Studio Time Machine — Shipping Roadmap

Updated: 2026-08-21

Studio Time Machine is the product's macOS shipping path. It is a private,
local-first application whose indexing, inspection, search, and organisation
are read-only. Source projects and audio must not be silently moved, renamed,
deleted, overwritten, or uploaded. Recovery and restore work requires an
explicit, reviewable no-overwrite plan and truthful provenance.

## Current evidence

The sanitized Task 1 application branch passed the deterministic local gates:

- `swift build --package-path apps/studio-macos`
- `swift test --package-path apps/studio-macos` — 518 tests in 52 suites

No signing, notarization, distribution, real-corpus validation, or live-provider
work is complete. The local package script is a development smoke surface, not
a distribution artifact.

## Shipping path

### 1. Pivot alignment and privacy

- Keep the native macOS app, `StudioCore`, and `studio-index` as the primary
  implementation.
- Preserve local-first, read-only, no-overwrite, provenance, and Work-versus-
  Session boundaries.
- Keep private local data separate from optional cloud, account, AI, sharing,
  catalogue, community, and plugin integrations.

### 2. Deterministic local quality gates

Run from the repository root:

```sh
swift build --package-path apps/studio-macos
swift test --package-path apps/studio-macos
bash apps/studio-macos/script/build_and_run.sh --build
bash apps/studio-macos/script/build_and_run.sh --verify
```

Keep the full test suite and packaged sample smoke path repeatable on supported
macOS versions. A sample run or successful compile is not real-corpus proof.

### 3. Real, non-destructive corpus QA

With explicit approval for each library root, validate discovery, provenance,
history, search, previews, and recovery plans against real projects. Record
what was observed, reconstructed, approximate, or unknown, and verify that
source projects and audio remain unchanged. This gate is not complete yet.

### 4. Signing, notarization, and distribution

After the local and real-corpus gates pass, establish Developer ID signing,
hardened runtime and entitlements, notarization, clean-account installation,
and distribution evidence. None of these release steps is complete yet.

## Later and optional integrations

Cloud catalogue, community, account, AI, sharing, and plugin/DAW integrations
remain optional follow-on work. They must not become prerequisites for the
private local app or weaken its privacy and read-only guarantees.

## Secondary and legacy estate

`apps/web/` (Plugin Radar website), `convex/` (cloud catalogue/backend),
`apps/desktop/ui/` (React plugin-host UI), and `apps/desktop/` (JUCE plugin)
remain in the repository for secondary or explicitly targeted maintenance.
Their historical roadmaps and audit labels are not current release claims and
do not supersede this macOS shipping path.
