# CLAUDE.md

Read the repository root `AGENTS.md` before working. It is authoritative. This
file is a concise Claude Code wrapper, not a second product specification.

## Default focus

Studio Time Machine is the primary product. Work in `apps/studio-macos/` first:
it is a private, local-first native macOS app for read-only indexing, search,
inspection, organisation, and safe recovery of music projects and history.

Preserve these boundaries:

- Never silently move, rename, delete, overwrite, or upload source projects or
  audio. Restores and recovered files need an explicit no-overwrite plan.
- Keep provenance truthful: distinguish observed, reconstructed, heuristic,
  approximate, and unknown results. Do not claim mix-accurate rendering without
  Ableton Live.
- Keep physical source locations separate from virtual organisation. Preserve
  Work, Session, Set Revision, artifact, and source-location identity; use
  “Add to Studio”, not “import”.
- Keep optional cloud, account, AI, sharing, catalogue, and community features
  separate from local work.

## Canonical macOS checks

Run from the repository root when the macOS app changes:

```sh
swift build --package-path apps/studio-macos
swift test --package-path apps/studio-macos
bash apps/studio-macos/script/build_and_run.sh --build
bash apps/studio-macos/script/build_and_run.sh --verify
```

Run a real `studio-index` scan only against a user-approved library root. Do
not treat sample mode or a successful build as real-corpus evidence.

## Conditional secondary checks

Only when the corresponding path changes, consult its local documentation and
run the focused check:

- `apps/web/`: `pnpm build:web`
- `convex/`: the repository's Convex typecheck/deployment check
- `apps/desktop/ui/`: `pnpm build:desktop-ui`
- `apps/desktop/`: its JUCE/CMake target from the local documentation

Do not automatically rebuild legacy plugin surfaces for unrelated macOS work.
Keep secondary-surface results separate from native app verification.
