# Samples: product and data architecture

## Outcome

`Samples` is a dedicated native macOS library for audio that the user explicitly
chooses to index. Sample locations are permission boundaries, not Ableton project
roots. They may overlap each other or a project root; one physical file is indexed
once and can belong to several locations.

The feature remains local-first and read-only. It never moves, renames, deletes,
rewrites, uploads, or eagerly hashes the library. The first slice offers inspection
and evidence only; storage findings do not include destructive actions.

## Corpus and product evidence

Validation against representative local libraries shows that the Samples surface
needs fast local SQLite queries while avoiding a monolithic plist, eager media
loading, and eager full-file hashing. Exact corpus measurements belong in the
separate validation report rather than this product architecture document.

High-value product slices supported by this evidence are:

1. Missing-sample recovery ranked by exact path, exact duplicate, and technical/audio
   similarity evidence.
2. Most-used, rarely-used, and no-indexed-use samples and packs, with an explicit
   coverage warning while a root is offline, unregistered, or not fully indexed.
3. Duplicate-family storage insight using staged verification, without delete actions.
4. Production-context views derived from track names, clip placement, warp evidence,
   and the containing track's ordered device/plug-in chain.
5. Recently imported and recently used samples, followed by favourites and pack ROI
   inferred from durable local usage rather than ratings the user must maintain.
6. Similar-sample and substitution workflows only after a normalized-audio fingerprint
   layer exists; container metadata similarity alone is not marketed as sonic similarity.

## Identity and vocabulary

- **Work**: durable logical musical identity. This is the primary project count.
- **Session**: one physical project folder (`StudioProject` in the current index).
- **Set**: one `.als` revision.
- **Occurrence**: one parsed audio clip placement in one Set and track.
- **Sample**: one physical or missing audio resource identity.
- **Sample family**: canonical grouping connected by typed, scored evidence. A family
  does not imply that any member is the original.

The current index has physical Sessions but no completed Work catalogue. Therefore
`workCount` is nullable. The UI shows an em dash and explanation until every counted
occurrence has a resolved or user-confirmed Work identity. It never relabels Session
count as Work count.

## Architecture decision

Use a dedicated SQLite database with FTS5 under Application Support. Keep the existing
project plist intact. SQLite owns sample locations, file metadata, location membership,
occurrences, family evidence, and durable user overrides. Queries aggregate and sort in
the database and return a bounded page for the native `Table`.

The vertical slice is split into focused `StudioCore` files:

- `SampleLibraryModels`: public truth/provenance and query contracts.
- `SampleLibraryDatabase`: schema, FTS, deduplicated upserts, aggregation, and overrides.
- `SampleMetadataReader`: bounded AudioToolbox/file-resource metadata reads.
- `SampleLibraryIndexer`: recursive incremental enumeration and classification.
- `SampleUsageAggregator`: ALS dependency-to-clip/track/device-chain joins.
- `SampleLibraryService`: security-scoped locations, monitoring, rescans, and events.

The app adds isolated Samples views and a small integration seam in the existing store,
sidebar, root switch, and command menu.

## Data model

### Location

Persistent security-scoped bookmark, last resolved URL, availability
(`available`, `unavailable`, `permissionRequired`), bookmark-staleness evidence,
last scan date, and file count. Removing a location removes its membership, not the
file or evidence still reachable through another registered location.

### Sample resource

Canonical path, file-resource identity when available, filename, extension/format,
bytes, duration, sample rate, bit depth when the container exposes it, channel count,
creation and modification evidence, containing pack/folder, availability, and a typed
classification:

- `externalLibraryOriginal`: selected location outside a recognised project;
- `projectRecorded`, `projectImported`, or `projectProcessed` from Ableton folders;
- `collectedProjectCopy`: only after defensible external-source evidence exists;
- `looseUnassigned`: local audio with no stronger classification;
- `missingReference`: parsed ALS reference with no available local resource.

`externalLibraryOriginal` means the registered external library resource, not a claim
that it is the historical master/original recording.

### Occurrence

Sample, optional Work, physical Session, timeline, Set revision, track, clip,
Arrangement/Session/take-lane placement, warp mode/marker evidence, Set modified date,
and the ordered device tree on the containing track. This is sufficient to answer
“What plug-ins were on the channel where this sample was used?” without loading a Set
again.

### Family evidence and overrides

Edges use `exactDuplicateOf`, `collectedCopyOf`, `possibleSourceOf`, and `usedBy` with
score, tier, explanation, algorithm version, and optional user-confirmed override.
Evidence tiers are:

1. same resource identity or verified full SHA-256;
2. staged size + quick digest, then full SHA-256 only for candidates;
3. technical metadata plus future normalized PCM/audio fingerprint;
4. parsed ALS absolute/relative paths;
5. filename/folder/time similarity, always ambiguous on its own.

The first slice implements path/resource identity and staged exact-duplicate candidate
verification. It persists review decisions; later fingerprint algorithms must treat a
user decision as a durable constraint.

## Incremental and monitoring behavior

The scanner enumerates only supported audio extensions and reads file/resource headers,
not entire audio payloads. `(resource identity or canonical path, size, mtime)` is the
incremental fingerprint. Unchanged rows are reused. FSEvents starts before the initial
scan, debounces changes, and schedules a location rescan; overlapping locations converge
through the unique physical-resource/path key. Full SHA-256 is reserved for same-size candidates
whose bounded quick digests agree. Candidate search includes differently named external/project-copy
pairs because Collect All, consolidation, and recording workflows can change filenames; the quick
digest gate prevents eager full hashing.

An unavailable location keeps cached rows inspectable and marks them unavailable. It
does not erase usage or turn samples into “unused.”

## Query and UI contract

The Samples destination uses a native `Table`, bounded database pages, FTS search, and
database sort by name, pack/location, Work count, Session count, Set count, occurrence
count, last used, size, duration, format, or availability. The detail pane lists every
occurrence and its physical path, Work coverage, Session, Set, track, clip placement,
warp evidence, and ordered device/plug-in chain.

Counts are distinct by stored identity. Repeated clips in one Set increase occurrence
count but not Set count. Backups are physical Set revisions and remain visible. “No
indexed use” is the only zero-use wording until all relevant project and sample roots
are available and indexed.

## Verification gates

- focused schema/indexer/usage/deduplication tests;
- full debug and release package builds plus signed app-bundle verification;
- real-corpus bounded metadata scan evidence, without eager hashing;
- rendered Samples table, location state, empty/loading/error state, occurrence detail,
  plug-in chain, keyboard focus, and accessibility-tree inspection.

## Selected-sample acoustic analysis

Acoustic analysis is staged separately from metadata indexing. Selecting an available
sample schedules a utility-priority, cancellable analysis. `AVAudioFile` decodes twelve
representative bounded windows and Accelerate/vDSP produces a 12 × 40 log-frequency
energy surface. The SQLite record includes source byte/mtime evidence and analyzer
version so unchanged results are reused and stale results are replaced.

The inspector presents the measured low/mid/high balance as compact named percentages;
it does not turn the spectrum into a large visualization. Each sample row instead has a
small projected wireframe sphere in place of the former status dot. The sphere stays
still when idle and deforms/rotates only for the sample currently playing. Its motion is
driven by the decoded RMS waveform envelope at the current playback position, not by a
decorative timer pulse. Cached analysis colours the sphere red for low end, amber for
midrange, or violet for high end; it remains neutral until evidence exists. A lightweight SwiftUI Canvas projection avoids creating a
SceneKit renderer for every row in a large table.

Apple Sound Analysis v1 supplies optional, on-device suggestions such as kick/bass drum,
drums, bass, piano, guitar, vocals, and synthesizer. Raw classifier identifiers, model
name, and score remain visible evidence; low-confidence output abstains. A suggestion
never changes path provenance or implies a historical source.

Acoustic content, structural form, and DAW role stay separate. Audio can suggest an
instrument or possibly a full mix, but it cannot prove that a waveform came from an
Ableton main/master channel. Main, group, return, or track role requires parsed project
evidence or a durable user confirmation.
