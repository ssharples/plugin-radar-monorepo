# GEMINI.md

Read and follow the root `AGENTS.md`; it is the authoritative repository
contract. This file keeps Gemini-specific onboarding concise and aligned with
that contract.

## Default focus: Studio Time Machine

Treat `apps/studio-macos/` as the primary product: a private, local-first
native macOS archive, search, inspection, organisation, and safe-recovery app.
Indexing and inspection are read-only. Never silently move, rename, delete,
overwrite, or upload source projects or audio. Require an explicit,
reviewable no-overwrite plan for restores and recovered outputs.

Keep provenance honest by distinguishing observed evidence, reconstructed
relationships, heuristics, approximate previews, and unknowns. Preserve the
distinction between physical source locations and virtual organisation, and
between Work, Session, Set Revision, artifacts, and source locations. Use “Add
to Studio”, not “import”.

## Verification

From the repository root, run these when `apps/studio-macos/` changes:

```sh
swift build --package-path apps/studio-macos
swift test --package-path apps/studio-macos
bash apps/studio-macos/script/build_and_run.sh --build
bash apps/studio-macos/script/build_and_run.sh --verify
```

Run `studio-index` against real libraries only with user approval. Sample mode
and a successful build do not prove real-corpus indexing.

## Secondary and legacy surfaces

`apps/web/`, `convex/`, `apps/desktop/ui/`, and `apps/desktop/` are secondary or
legacy. When one changes, consult its local instructions and run only its
focused check (`pnpm build:web`, the relevant Convex check,
`pnpm build:desktop-ui`, or the relevant JUCE/CMake target). Do not rebuild
legacy plugin surfaces automatically for unrelated Studio Time Machine work.
