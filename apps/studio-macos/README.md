# Plugin Radar Studio backend

`StudioCore` is the local-first backend for the native macOS Studio Time Machine.
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
installed. Live remains visible and authoritative; export remains entirely user-controlled.

## Build and test

```sh
swift build --package-path apps/studio-macos
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

The August 2026 privacy-safe validation corpus contained 114 projects, 586 Sets,
79,016 clips, 33,321 devices, 116,929 media dependencies, and 8,177 audio assets with
zero parser issues. On the validation Mac, a production cold scan completed in about
106 seconds. The normalized 31 MB cache produced an identical warm result in about
11 seconds. These are directional corpus measurements, not hardware-independent SLAs.

The package also contains the native `StudioTimeMachine` executable. The CLI remains a
privacy-safe development and corpus-validation tool.

The public models intended for the SwiftUI application are documented in
[`docs/swiftui-data-contract.md`](docs/swiftui-data-contract.md).
