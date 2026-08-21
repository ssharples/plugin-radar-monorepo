# Studio Time Machine

Studio Time Machine is a native macOS app for a private, local-first Studio Library. `StudioCore`
is its read-only indexing, evidence, search, recovery, and export-plan foundation.
It incrementally indexes and monitors multiple Ableton project roots, extracts typed
Set/track/clip/device/media metadata, builds timelines and semantic diffs, maintains
immutable content-addressed snapshots, resolves truthful preview options, inventories
installed plug-ins, builds a searchable personal chain library, and produces private,
explainable context-aware chain recommendations.

The toolbar search is a private, Spotlight-style view across every folder the user has
chosen to track. Each root is recursively indexed for Ableton Sets and supported audio;
normal Ableton project folders are preserved, while loose `.als` files (for example in
Downloads or a transfer folder) remain discoverable under their containing directory.
Results retain their owning root and local file provenance so opening a hit can switch to
the correct location. Nothing is uploaded.

Source projects remain read-only during indexing and snapshotting. Restore and audio
recovery require an explicit no-overwrite plan. Exact rendering of arbitrary Sets without
Ableton Live is intentionally not claimed. A deliberately restricted offline renderer can
write a clearly labeled approximate WAV from resolvable raw Arrangement audio only.
`AbletonLiveBridge` can discover installed Live applications and prepare an explicit
user-approved Open in Live action, preferring the Set's creator major version when it is
installed. The shipped Accessibility-driven export adapter is experimental and limited to
Ableton Live 12.4.2. It requires an explicit review, Accessibility preflight for the active Set
using its exposed document path when available, and no unsaved changes. When Live exposes no
document path, a constrained same-title fallback may be used; that remains a real-Live
qualification limitation. The plan also requires a typed no-overwrite destination. Live remains
authoritative; the app drives only semantic controls, stops on unexpected dialogs,
and verifies fresh output before linking it as experimental evidence. Real-Live qualification
with a disposable Set and empty destination remains a release gate; unsupported versions stop
rather than falling back.

## Build and test

```sh
swift build --package-path apps/studio-macos
swift build --package-path apps/studio-macos --product studio-index
swift test --package-path apps/studio-macos
```

## Aggregate corpus validation

The summary mode deliberately omits project names and file paths:

```sh
swift run --package-path apps/studio-macos studio-index \
  /path/to/Ableton/projects --summary
```

Pass `--cache /path/to/index-cache.plist` to exercise the same persistent incremental
repository used by the app; a second run reuses unchanged parsed Sets.

The privacy-safe validation corpus and normalized cache are used for directional
parser, indexing, and performance measurements. These reports are not
hardware-independent SLAs and do not include user data in the application.

The package also contains the native `StudioTimeMachine` executable. The CLI remains a
privacy-safe development and corpus-validation tool.

The public models intended for the SwiftUI application are documented in
[`docs/swiftui-data-contract.md`](docs/swiftui-data-contract.md).
