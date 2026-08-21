# SwiftUI data contract

The native interface consumes the `StudioCore` library. The library is local
first. Indexing, monitoring, preview analysis, and snapshot capture never change
source Ableton projects or audio. A restore or audio recovery copy is only written
after the caller explicitly executes a no-overwrite plan.

## Application service

`StudioLibrarySyncService` is the main UI boundary. Construct the production service
with `try StudioLibrarySyncService.applicationSupportService()`, subscribe with
`await service.events()`, register one or more security-scoped roots, then call
`await service.start()`.

`StudioLibrarySyncEvent` publishes:

- status changes (`idle`, `indexing`, `monitoring`, or `stopped`)
- registered-root availability and per-root indexing progress
- completed per-root indexes and indexing statistics
- immutable snapshot capture, completed restore URLs, and user-displayable failures

`start()` begins recursive FSEvents monitoring before its incremental scan, then captures
content-addressed initial snapshots without leaving a file-change gap. Save events are debounced
and the `.als` file must stop changing before it is parsed and snapshotted. Use
`cachedIndexes()` for immediate launch content while a refresh is running.

`SampleLibraryService` is the separate Samples boundary. It persists security-scoped
sample locations and relational metadata/usage evidence in `samples.sqlite`, starts
recursive monitoring before scanning, and exposes bounded `SampleQueryResult` pages.
`replaceUsage(indexes:worksBySessionID:coverageComplete:)` joins parsed clip references
to physical Sessions, Sets, tracks, clips, placement/warp evidence, and ordered device
trees. Work identity is optional; callers must not replace an unresolved Work count
with the physical Session count. `verifyCopyCandidates` performs staged hashing only
for a selected sample's candidate group, while `saveReviewDecision` persists an
explicit user override.

## Navigation hierarchy

```text
StudioLibraryIndex
├── projects: [StudioProject]
│   ├── timelines: [SetTimeline]
│   │   └── versions: [AbletonSet]
│   └── previewAssets: [PreviewAsset]
├── unassignedAudioAssets: [PreviewAsset]
└── issues: [IndexIssue]
```

### Studio Library

Use `StudioLibraryIndex.projects` as the primary collection. Each
`StudioProject` provides a stable local identifier, display name, root URL,
version timelines, and audio candidates. File URLs remain local and should not
be sent to cloud services.

### Project timeline

`SetTimeline` groups the current Set and timestamped files in Ableton's
`Backup` directory. Versions are newest first. The UI can distinguish backups
with `AbletonSet.isBackup` and show the exact on-disk modification time with
`modifiedAt`.

### Set detail

`AbletonSet` exposes the producing Live version, compressed and expanded size,
a `SetStructure` summary, and typed `content`. Content includes tempo, time signature,
locators, tracks and mixer state, Arrangement/Session/take-lane clips, MIDI note counts,
warp evidence, nested devices and Racks, AU/VST2/VST3 identities, Max for Live devices,
opaque device-state digests, and resolved media dependencies. These values describe
stored Set state; they do not claim a device, sidechain, or automation lane is audible.

### Versions, snapshots, and recovery

`SetVersionDiffer` produces a semantic `SetVersionDiff` covering tempo, tracks,
devices, clips, locators, and dependencies. `SnapshotStore` keeps immutable,
content-addressed `.als` blobs in Application Support and deduplicates unchanged saves.
`planRestore` always chooses a new filename and `execute` refuses to overwrite a file
that appeared after planning. Restore and branch do not edit the original Set.

`AudioRecoveryService` plans available clip-audio dependencies into a collision-safe
`Recovered Audio` folder in the destination project. Execution verifies each copy and
never rewrites `.als`; importing recovered audio into Live remains a user action.

### Preview availability

`PreviewAsset.category` records provenance independently from
`isLikelyUserRender`:

- `freeze`, `consolidated`, `crop`, and `reversed` come from Ableton's processed
  sample folders.
- `recorded` and `imported` come from Ableton's sample folders.
- `otherAudio` covers exports, loose audio, and project-specific layouts.
- `isLikelyUserRender` is a filename heuristic for mixes, masters, bounces,
  renders, stems, previews, and demos.

Project audio appears on `StudioProject.previewAssets`. Audio inside the
selected library but outside a recognised project appears in
`StudioLibraryIndex.unassignedAudioAssets`; the interface should make this a
recoverable "Loose audio" destination rather than hiding it.

Use `PreviewResolver` for the truthfulness boundary. It prefers existing user renders
and Ableton-produced artifacts, otherwise it may provide an explicitly approximate,
audio-only dry reconstruction plan. MIDI, warping, missing media, native devices,
third-party plug-ins, Racks, and Max for Live appear as coverage blockers. A Set with
no safe source returns `unavailable`; the UI must not imply an exact Live render.

`DryPreviewRenderer` can write that dry plan to a new WAV without launching Live. It
only places raw source files on a fixed-tempo timeline and always returns `approximate`.
It does not reproduce source offsets, fades, warping, automation, mixer state, routing,
devices, plug-ins, or Ableton summing. Rendering is capped at four hours, uses a
temporary file, and refuses to overwrite the destination.

### Open in Ableton Live

`AbletonLiveLocator.installedApplications()` discovers installed Ableton Live application
bundles without launching them. `AbletonLiveBridge.planOpen(set:installations:)` prepares
an `AbletonLiveOpenPlan`, preferring an installed Live major version that matches the
Set's creator evidence. The review UI must show `installation`, `explanation`, and
`requiresUserControlledExport` before calling the `@MainActor` `execute(_:)` method from
an explicit user action.

Execution only asks macOS to open the selected `.als` in the chosen visible Live
application. It does not render, bounce, control Live, start a background audio engine,
or automate export. Missing Sets, no discovered installation, and launch failures are
public error states; Live compatibility is not guaranteed.

### Chains and plug-ins

`PluginInventoryScanner` inspects installed AU/VST2/VST3 bundle metadata without
loading plug-in code. `PluginCompatibilityEvaluator` reports installed, missing,
version-mismatched, and unknown evidence for each Set.

`ChainIntelligenceBuilder` converts an index into `PersonalChainLibrary`: searchable
track-chain occurrences with project/Set/track provenance, topology families, device
state variation counts, compatibility, and personal plug-in usage. Recovery capability
is intentionally limited to `inspectOnly` or `existingRackCandidate`. The backend does
not generate `.adg` files or claim it can paste arbitrary chains into Live yet.

`ChainRecommendationEngine` is the private, explainable baseline for suggestions. It
infers common production contexts from track names and ranks the user's own chain
families by same-context reuse, project breadth, recency, and installed-plug-in evidence.
It does not upload session data or present heuristic context as AI certainty.

### Library search

Build the toolbar's `StudioSearchIndex` from every cached registered-root index, not only
the currently displayed root. Rebuild it when a root is registered, restored at launch,
or emits `indexUpdated`. `search(_:kinds:limit:)` covers projects/folders, Set versions,
tracks, clips, devices/plug-ins, locators, project audio, and Loose audio. Hits contain the
IDs needed to restore UI selection plus local file URL, owning root, display context, and
score. Opening a hit first switches to its `rootURL`, then resolves its project/Set/audio
selection. Matching is case/diacritic-insensitive, multi-token, prefix-aware, local, and
lightly recency-ranked.

Tracked roots are recursively scanned. A normal `Ableton Project Info` directory defines
an Ableton project boundary. A discovered `.als` outside such a boundary is still indexed
under its containing directory, so Downloads and transfer folders do not silently lose
Sets. Supported loose audio remains searchable even when it belongs to no Set or project.

### Index health

A corrupt or unsupported `.als` file produces an `IndexIssue` and does not stop
the rest of the scan. The initial UI should show an unobtrusive issue count and
offer a detail sheet with the local filename and parser message.

## Identity and privacy

Identifiers are local deterministic hashes. File-backed identities use volume and inode
evidence when available, so a Set can retain identity across a same-volume rename.
Fallback identities use standardised local paths. They are not global identities and
must not be uploaded. Cache files, bookmarks, snapshots, plug-in inventories, and media
paths remain local unless a future consented sync product defines a separate contract.

## Current indexing contract

- The caller grants folder access and supplies a security-scoped root URL/bookmark.
- The actor-based service is safe to call from Swift concurrency; consume events on the
  UI's chosen actor.
- Expanded `.als` data is capped at 256 MiB and held for one Set at a time.
- Symbolic links are ignored to avoid cycles and unexpected traversal.
- Parsed Set metadata and fingerprints persist as an atomic binary property-list cache. Unchanged Sets
  are reused, deleted Sets are pruned, and corrupt/old cache schemas reset safely.
- Multiple roots can be registered. Disconnected or permission-blocked roots remain
  visible rather than silently disappearing.
- Exact arbitrary-Set rendering without Ableton Live is outside this contract.
- Opening a Set in an explicitly reviewed installed Live application is supported; all
  playback and export after launch remain visible, authoritative Live user actions.
