# Repository direction

## Primary product: Studio Time Machine for macOS

This repository has made a major product pivot. Its primary product is now **Studio Time Machine**, a native macOS app for privately indexing, searching, inspecting, previewing, organising, and safely recovering music projects and their history.

The main implementation lives in `apps/studio-macos/`:

- `StudioTimeMachine` is the native SwiftUI application.
- `StudioCore` is the local indexing, evidence, search, organisation, and recovery domain layer.
- `studio-index` is the command-line indexer and diagnostics surface.
- `apps/studio-macos/PRODUCT.md` is the product authority.
- `apps/studio-macos/CONTEXT.md` defines product language and the domain model.
- `apps/studio-macos/DESIGN.md` defines the macOS interaction and visual direction.
- `apps/studio-macos/Package.swift` is the build and test entry point.

When a task is ambiguous, prioritise Studio Time Machine. Treat it as the source of truth for product, architecture, UX, roadmap, and naming decisions. The project is no longer primarily a Plugin Radar website, plugin catalogue, or DAW plugin-host product.

## Secondary and legacy surfaces

The following remain in the repository as existing, adjacent, secondary, or legacy capabilities:

- `apps/web/`: the Plugin Radar website and plugin-discovery experience.
- `convex/`: the cloud catalogue and website backend.
- `apps/desktop/`: the JUCE plugin and React desktop/plugin-host surface.

Do not extend or prioritise these surfaces ahead of Studio Time Machine unless the task explicitly targets them or an intentional integration decision has been made. Their existing catalogue, community, cloud, and plugin-chain concepts do not automatically define the macOS app.

Maintain these surfaces when required, but do not treat their older roadmaps or positioning documents as the current project direction.

## Studio Time Machine product constraints

- Keep indexing, inspection, and search local-first, private, and read-only.
- Never silently rewrite, move, rename, delete, or overwrite source projects or audio.
- Require explicit, reviewable plans and no-overwrite destinations for restores, branches, recovered audio, exports, and handoffs; verify the result.
- Preserve truthful provenance. Clearly distinguish observed evidence, reconstructed or inferred relationships, heuristics, unknowns, and approximate results.
- Do not claim mix-accurate reconstruction or arbitrary Ableton rendering without Ableton Live. Label approximate previews as approximate.
- Keep private local work separate from optional cloud, account, AI, sharing, catalogue, or community features.
- Treat local paths, file URLs, project identifiers, and project contents as device-local data; do not upload them implicitly.
- Preserve the distinctions between Work, Session, Set Revision, artifact, and physical source location. Virtual organisation must not imply a physical file move.
- Use “Add to Studio” for user-authorised library access; do not describe it as an import that takes ownership of source files.
- Prefer native macOS and SwiftUI patterns with accessible keyboard and assistive-technology behaviour. Use AppKit interop only where the platform capability requires it.

## Development and verification

Run macOS app commands from the repository root:

```sh
swift build --package-path apps/studio-macos
swift test --package-path apps/studio-macos
```

For a packaged app smoke check:

```sh
bash apps/studio-macos/script/build_and_run.sh --build
bash apps/studio-macos/script/build_and_run.sh --verify
```

Only run a real-corpus `studio-index` command against user-approved library roots. Do not assume sample-mode UI, a successful build, or an HTTP response proves that real local indexing works.

When a task explicitly changes the website, Convex backend, or JUCE/plugin surface, run that surface's relevant checks and consult its local documentation. Keep those results separate from macOS app verification.
