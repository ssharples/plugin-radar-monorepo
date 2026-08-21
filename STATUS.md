# STATUS.md — Studio Time Machine

Updated: 2026-08-21

## Current product direction

Studio Time Machine is the primary shipping path: a native macOS app for
private, local-first, read-only indexing, search, inspection, virtual
organisation, and safe recovery of music projects and their history. The
macOS package targets macOS 14+ and Swift 6.2.

## Verified local evidence

Task 1's sanitized application branch was verified locally with:

- `swift build --package-path apps/studio-macos` — passed.
- `swift test --package-path apps/studio-macos` — passed: 518 tests in 52 suites.

These are local source and package checks. They do not establish a release,
real-library, or provider claim.

## Not yet verified

The following remain release gates and are intentionally not claimed complete:

- real-corpus indexing and non-destructive recovery QA against an approved
  library;
- Developer ID signing, hardened runtime, notarization, distribution, or a
  clean-account installation;
- live provider, cloud, account, AI, sharing, catalogue, or community
  integration;
- mix-accurate rendering of arbitrary Sets without Ableton Live.

The local packaging script is a development smoke surface and is not a
distribution artifact.

## Secondary and historical surfaces

The existing `apps/web/`, `convex/`, `apps/desktop/ui/`, and `apps/desktop/`
surfaces remain in the repository as secondary or legacy capabilities. Their
historical audit tables and older Plugin Radar/ProChain/JUCE completion labels
are not current macOS release evidence. Maintain them only for explicitly
targeted work or an approved integration; do not let them redefine the
primary product or imply a current release.

## Next evidence gates

1. Keep deterministic macOS build, full-test, and packaged-sample checks green.
2. Exercise the indexer and recovery safeguards against a real, user-approved
   corpus without mutating source files.
3. Complete privacy and pivot review, then establish signing/notarization and
   distribution evidence.
