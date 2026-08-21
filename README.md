# Studio Time Machine

Studio Time Machine is the primary product in this repository: a private,
local-first native macOS app for indexing, searching, inspecting, organising,
and safely recovering music projects and their history. Indexing and inspection
are read-only. The app never silently moves, renames, deletes, overwrites, or
uploads source projects or audio; restores and recovered material require an
explicit, reviewable no-overwrite plan. Provenance distinguishes observed,
reconstructed, heuristic, approximate, and unknown results.

## Requirements

- macOS 14 or later
- Swift 6.2 toolchain (the package declares `swift-tools-version: 6.2`)
- Xcode command-line tools, with SQLite and zlib available to SwiftPM

The native app and its local indexer live in `apps/studio-macos/`. The Swift
package contains the `StudioTimeMachine` app, the `StudioCore` domain layer,
and the `studio-index` diagnostics/indexing CLI. Product and domain decisions
are documented in `apps/studio-macos/PRODUCT.md` and
`apps/studio-macos/CONTEXT.md`.

## Build, test, and run

Run these commands from the repository root:

```sh
# Build the macOS package
swift build --package-path apps/studio-macos

# Run the complete Swift test suite
swift test --package-path apps/studio-macos

# Build, package, and open the deterministic local sample library
bash apps/studio-macos/script/build_and_run.sh --sample
```

The equivalent root convenience scripts are:

```sh
pnpm build:studio
pnpm test:studio
pnpm run:studio
```

For a packaged-app smoke check, build and verify the local bundle explicitly:

```sh
bash apps/studio-macos/script/build_and_run.sh --build
bash apps/studio-macos/script/build_and_run.sh --verify
```

Only run `studio-index` against library roots the user has approved. A sample
mode, a successful build, or an HTTP response is not evidence that a real local
library has been indexed.

## Repository layout

```text
apps/studio-macos/  Native macOS app, StudioCore, and studio-index
packages/shared/    Shared types and constants retained by adjacent surfaces
scripts/            Repository maintenance and historical data tooling
docs/               Product, research, and historical documentation
```

## Secondary and legacy surfaces

The repository still contains adjacent surfaces that are maintained only when a
task explicitly targets them or an intentional integration decision requires
them:

- `apps/web/` — the legacy Plugin Radar website and plugin-discovery surface
- `convex/` — the secondary cloud catalogue and website backend
- `apps/desktop/ui/` — the secondary React desktop/plugin-host UI
- `apps/desktop/` — the legacy JUCE plugin and native host surface

These surfaces do not define the current product direction. Run their local
checks only when their paths change, and keep those results separate from
Studio Time Machine verification. Optional cloud, account, AI, sharing,
catalogue, community, and plugin integrations come later and must not weaken
the app's local-first privacy and read-only boundaries.
