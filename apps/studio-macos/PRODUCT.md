# Product
<!-- impeccable:product-schema 1 -->

## Platform

macOS

This is a native macOS product. Impeccable v4.0.4 does not expose a macOS platform value, so this file is the authority: do not reinterpret the interface as iOS, a responsive web app, or a mobile-first adaptive layout.

## Stack

- Native SwiftUI for the macOS application, using AppKit interop only where macOS capabilities require it.
- `StudioCore` is the local-first, read-only indexing library and the current source of truth for the SwiftUI data contract.
- The current package targets macOS 14 and contains the `StudioCore` library, corpus-validation CLI, and native `StudioTimeMachine` application target.
- The existing JUCE plug-in, React desktop UI, and Convex services are adjacent Plugin Radar capabilities. Reuse or integration is not assumed until product and architecture decisions explicitly establish it.

## Users

Serious independent producer-engineers with years of Ableton Live projects, inconsistent naming habits, duplicate or timestamped Sets, missing plug-ins, scattered renders, and valuable chains embedded in old work. They need a private working tool, not a social feed or a generic file manager.

## Product Purpose

Studio Time Machine turns a producer's existing Ableton archive into a navigable, trustworthy local Studio Library. It helps them find a project, understand its Set history, hear audio that already exists, inspect what can be recovered, and restore useful material without rewriting the source archive.

## Positioning

- Working product relationship: **Plugin Radar / Studio Time Machine**. The final product name and its relationship to Plugin Radar remain open.
- Private recovery and personal chain intelligence are the core. Community discovery and sharing are secondary, opt-in capabilities.
- The product is not a cloud DAW, a whole-Set merge tool, an independent Ableton rendering engine, or a promise of mix-accurate reconstruction.

## Operating Context

- Primary environment: a Mac used for music production, with Ableton projects spread across user-selected folders and potentially removable drives.
- First value should appear from existing files after folder permission; an account is not a prerequisite for local indexing or playback.
- Indexing and whole-library chain derivation must run away from the main actor, tolerate individual corrupt or unsupported Sets, and progressively reveal useful results without presenting an incomplete scan as complete.
- `StudioLibrarySyncService` is the UI-facing orchestration boundary. It coordinates durable per-root caches, progressive indexing, stable-write monitoring, immutable Set snapshots, and no-overwrite restores through one event stream.
- The underlying repository reuses unchanged Set metadata and retains cached libraries for disconnected roots. Recursive monitoring begins before the initial scan, debounces filesystem changes, and waits for stable `.als` saves before indexing and snapshot capture, so saves cannot fall into a scan-to-watch gap.
- Set identity is rename-stable on the same volume when filesystem fingerprints are available. Local file URLs and identifiers remain device-local implementation details and must not be uploaded.

## Capabilities and Constraints

### Studio Library

- `StudioLibraryIndex.projects` is the primary collection. Each project contains one or more Set timelines and project-associated audio assets.
- The interface must remain useful at the verified production-corpus scale: 114 projects, 208 timelines, 586 Sets, 378 backups, 8,177 audio assets, 942 unassigned audio assets, 79,016 clips, 33,321 devices, and 116,929 dependencies, with zero parser issues. The four-worker validation expanded 6.26 GB of XML in 105.84 seconds with 478 MB maximum RSS.
- `StudioLibraryIndex.unassignedAudioAssets` is a first-class, recoverable **Loose audio** destination. It must not be hidden as an indexing anomaly.
- The sidebar search action and Command-F open one private, Spotlight-style overlay across every registered root, not merely the active location. Song names from the content-aware Work catalogue are the primary result, with Artist matching and recent Songs available before typing. An explicit expansion reveals a separate indexed-evidence section spanning project folders, loose Sets, Set versions, tracks, clips, devices/plug-ins, locators, project audio, and Loose audio while retaining owning-root and selection provenance. A Set found outside a normal Ableton project boundary is grouped under its containing folder rather than omitted. Case- and diacritic-insensitive, multi-token/prefix matching and light recency ranking run entirely on the Mac; index construction and queries stay away from the main actor. Destination-specific filters remain local to their page and independent from global search.
- Registered roots persist between launches and expose available, unavailable, and permission-required states. Cached evidence remains inspectable when a removable drive is offline.

### Samples

- Samples is a dedicated local destination backed by SQLite/FTS rather than the project index plist. Users register one or more security-scoped sample locations independently from project roots; overlaps deduplicate by physical resource identity or canonical path.
- Incremental scans read file resources and bounded audio headers for filename/path, pack, format, size, duration, sample rate, bit depth, channels, and creation/modification evidence. Monitoring schedules rescans without eagerly hashing audio.
- Primary project usage means distinct logical Works. Until the Work catalogue resolves an occurrence, the Work count is unknown rather than substituted with a physical folder count. Physical Sessions, Set revisions, clips, and occurrences remain separately visible.
- Every parsed audio occurrence retains its Session, Set, track, clip, Arrangement/Session/take-lane placement, warp evidence, and the ordered containing-track device/plug-in tree.
- External-library resources, project Recorded/Imported/Processed audio, verified collected copies, loose audio, and missing/disconnected references are distinct. “External original” describes the selected library resource and never claims historical provenance.
- Copy/source matching is staged and on demand: same-name/size candidates receive bounded quick digests, and full SHA-256 runs only after quick agreement. Exact duplicates may support a collected-copy classification; lower-confidence source suggestions remain reviewable, and user decisions are durable overrides.
- Zero usage is worded as “no indexed use” whenever project or sample coverage is incomplete. Duplicate/storage insights are read-only and expose no delete, move, or rewrite actions.

### Find and reuse project contents

- Opening a Song should answer what is in the project and what the producer can use next. Show tracks, referenced source audio and ordered devices before archive history.
- Versions chooses the exact source Set. Audio files covers the selected physical Session folder across its saved versions; it must not imply that every file belongs to the selected revision.
- Auditioning and dragging source audio transfers the existing file. Clip offsets, edits, fades, warping, automation, routing and devices are not rendered into that file by Studio Time Machine.
- The floating player can select an excerpt of its current audio file, audition or loop it, zoom its waveform, and create a separate clip. Copy Clip reviews the source and In/Out range inline, exposes the full local destination through Location, and creates a verified, frame-aligned 32-bit float WAV without overwriting any existing file. Clips preserve source sample rate and mono/stereo channels, with no automatic normalisation or fades. Approximate source previews retain that label in clip filenames.
- Copied clips remain in the local Studio Clips folder because another app may reference the file. The clipboard contains a file URL and Drag Clip exposes the same WAV. External Command-V insertion into Ableton Live is unverified; file dragging is the documented Live transfer route. No implicit upload or source-project rewrite occurs.
- Track and device-chain reuse can guide the user through Ableton Live's Browser using the exact Set and track name. Keep the destination Set open. This is a user-completed Live workflow, not native chain insertion or a generated rack export.
- Take-lane-only recordings, individual clip evidence, device resource files and detailed history should expand near their context. Search must work on track, clip, sample-file and device names.

### Project and version history

- A `SetTimeline` groups a current Set with timestamped files from Ableton's `Backup` directory. Versions are newest first.
- The interface may show exact on-disk modification time and whether a version is a backup.
- Set structure counts are evidence from the parsed XML. They do not prove that a device, sidechain, automation lane, or other element is active.
- Parsed Set content may expose tempo, time signature, locators, track/mixer state, nested devices, plug-in identity, clips, media references, and dependency availability. Each field remains evidence, not a claim about audible behavior.
- Semantic version comparisons may describe tempo, track, device, clip, locator, and dependency changes between adjacent indexed versions.
- Originals are immutable. Snapshot history exposes captured versions and both Restore and Branch operations; every plan creates an explicit new `.als` destination, verifies stored content, and refuses overwrite before execution. Initial snapshots skip existing Ableton Backup files rather than duplicating the archive's 378 native backups.
- Available clip-audio dependencies may be planned into a collision-safe `Recovered Audio` folder and copied with content verification. This operation never rewrites a Set or source audio.
- There is no whole-Set merge. Selective recovery may be designed only where the underlying capability and provenance are explicit.

### Existing audio and preview truth

- Existing audio artifacts should be playable immediately when their local files are available.
- `PreviewAsset.category` is provenance and must remain independent from `isLikelyUserRender`.
- Provenance categories are `freeze`, `consolidated`, `crop`, `recorded`, `imported`, `reversed`, and `otherAudio`. `isLikelyUserRender` is only a filename heuristic for likely mixes, masters, bounces, renders, stems, previews, or demos.
- A likely user render is not a stronger provenance class and must not overwrite or replace the category shown to the user.
- Reconstructed previews must always be labeled **Approximate** before and during playback; they must never imply mix accuracy.
- The restricted local renderer may place resolvable raw audio on a fixed-tempo timeline and write a new WAV. It omits source offsets, fades, warping, automation, mixer state, routing, devices, plug-ins, and Ableton summing; output fidelity is permanently **Approximate** and destinations are no-overwrite.
- Opening a Set in a discovered, explicitly reviewed Ableton Live installation is experimental. The bridge may prefer a matching creator major version, but compatibility is not guaranteed; it does not control playback, render, bounce, or automate export.
- Any future Ableton-controlled rendering must remain visibly distinct from existing artifacts and approximate reconstruction. Today, Live remains visible and authoritative and export is user-controlled.
- If no trustworthy preview exists, the product should explain why rather than manufacturing certainty.

### Set detail and health

- Set detail may expose producing Live version, compressed and expanded size, and structural counts for track types, third-party devices, Max for Live devices, Racks, warp markers, and automation envelopes.
- Index issues are non-fatal. The main Library should show an unobtrusive count and offer local filename and parser-message detail on demand.
- Local installed-plug-in inventory and Set plug-in identity may distinguish installed, missing, version mismatch, and unknown or unscanned conditions. Status cannot rely on color alone, and the scanner must not load plug-in code.
- Inspectability, previewability, and recoverability are separate states; a missing plug-in must not make an otherwise inspectable Set appear lost.

### Chains and community

- Private recovered chains are a primary Library destination and retain source project, Set/version, track, ordered-device, state-variation, and compatibility evidence.
- Chain recovery capability is deliberately limited to **Inspect only** or **Existing Rack candidate**. The product must not fabricate `.adg` export or claim native chain insertion.
- Local recommendations may rank the producer's own chain families for vocal, guitar, bass, drums, keys, synth, mix-bus, master, and other contexts. Every recommendation must remain deterministic and explain same-context reuse, project breadth, recency, saved-state variation, and local plug-in compatibility; it is not cloud AI.
- Community content is secondary and visually separated from private work. Cloud sync, account creation, AI analysis, sharing, and community participation require explicit opt-in.
- Existing Plugin Radar catalogue capabilities may inform later integration, but the current chain library is built locally from indexed StudioCore evidence.

## Brand Commitments

- The Codex and ChatGPT desktop applications are the binding structural reference for the app shell: compact dark navigation, one quiet light workspace, a sidebar-triggered Spotlight search, breadcrumb context, contextual inspection, and utility/status controls at the bottom of the sidebar. Translate the interaction model into this product; do not reproduce proprietary branding or copy the shell literally.
- The [untitled]-informed Mobbin world remains the reference for project objects, playback restraint, generous negative space, and focused archive tasks inside the workspace.
- Project and version objects should carry most of the expressive color. Navigation, controls, metadata, and status remain quiet and evidence-led.
- Prefer one memorable physical metaphor: a project sleeve/object that reveals version discs or artifacts as the producer moves through time. It must support comprehension rather than become ornamental chrome.
- The existing dark industrial Plugin Radar/JUCE visual treatment is not automatically inherited by this product.
- The light workspace is the current visual authority. The exact Dark Mode treatment remains open and must be resolved by visual review rather than automatic inversion.

## Product Principles

1. **Recover before reorganising.** Help the producer hear and retrieve what already exists before asking them to curate it.
2. **Source preservation is non-negotiable.** Index read-only; never silently rewrite originals.
3. **Evidence over optimism.** Show provenance, heuristics, compatibility, approximation, and experimental status plainly.
4. **Private by default.** Local value comes before accounts, cloud services, AI, or community.
5. **Object first, data second.** Let a project feel like a recognisable studio object, then reveal dense technical evidence on demand.
6. **Calm at archive scale.** Preserve focus and negative space while supporting hundreds of Sets and thousands of audio assets.

## Accessibility

- Use native macOS keyboard navigation, focus, menus, toolbars, VoiceOver semantics, and standard text behavior.
- Respect Reduce Motion and Increased Contrast. Never encode provenance, compatibility, or severity with color alone.
- Keep source-list selection, timeline selection, playback, and inspector state legible at large Dynamic Type or accessibility text settings supported by macOS.
- Exact localization scope and minimum accessibility test matrix remain open.

## Open Decisions

- First-release packaging of the implemented Library, immutable snapshots, safe new-copy restore, and recovered-audio planning.
- Supported Ableton Live versions and the behavior for unknown or future formats.
- Cache retention and removal policy, cross-volume move behavior, and root prioritisation. Search aggregation across all registered roots is now fixed product behavior; broader merged-library browsing remains a separate presentation decision.
- Whether a future semantic-search layer should augment the shipped deterministic local index, and what its explicit opt-in and data boundary would be. The current search sends nothing off the Mac.
- Whether existing Rack candidates gain a future native `.adg` recovery path; inspect-only remains the current truthful contract.
- Rules and reliability thresholds for approximate previews.
- Whether a later opt-in automation layer can make Ableton-controlled export reliable without weakening the current explicit-launch and user-controlled boundary.
- Whether the local installed-plug-in inventory later integrates with Plugin Radar's catalogue without weakening local-first privacy.
- Final product name, pricing, cloud/community boundaries, and account timing.
- Dark Mode art direction, project-object generation, compare-window behavior, and the precise boundary between the main window and auxiliary preview/inspection windows.
