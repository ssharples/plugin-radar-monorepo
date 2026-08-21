# Song-first Spotlight Search Review

Date: 2026-08-14

Scope: read-only review of the current Song-first global search implementation against the user request plus `PRODUCT.md` and `DESIGN.md`. Reviewed `StudioWorkSearch.swift`, `StudioSearch.swift`, `StudioSearchTests.swift`, the search state and navigation in `StudioLibraryStore.swift`, `LibraryRootView.swift`, `StudioSidebarView.swift`, `StudioSearchResultsView.swift`, `StudioLibraryView.swift`, `LooseAudioView.swift`, `SamplesView.swift`, `RecoveredChainsView.swift`, `StudioTimeMachineApp.swift`, and `StudioShellStyle.swift`. Also inspected `/tmp/studio-search-qa.png` and `/tmp/studio-search-qa-2.png`; both screenshots predate the current `StudioSearchResultsView.swift` and therefore are historical evidence rather than proof of the reviewed source.

## Verdict

**SPEC PASS**

**QUALITY CHANGES REQUIRED**

The requested information architecture is present: Song/Artist results lead, deeper indexed evidence is a separate explicit expansion, the old global header field is gone, a compact sidebar search action opens an upper-centred Spotlight-style overlay, Command-F invokes it, all-root evidence retains root provenance, and Samples/Loose audio/chain filters remain separate in `searchText`.

No Critical findings.

## Findings

### Important — Return can open a stale result from the previous query

`StudioLibraryStore.scheduleGlobalSearch()` cancels the old task but leaves `globalSongHits`, `globalEvidenceHits`, and the selected result visible while the new 70 ms debounce and detached query run (`StudioLibraryStore.swift:2129-2177`). `StudioGlobalSearchOverlay.openSelectedResult()` then opens whichever old ID is still selected (`StudioSearchResultsView.swift:275-293`). A user can type a new query and press Return quickly enough to open a Song or evidence row that does not match the text now shown in the field. Clearing the field has the same race.

Bind published results to their normalized query/generation, or synchronously clear/invalidate selection and results when the query changes. Return should only activate results produced for the current query. Add a deterministic store/interaction regression covering query A -> query B -> immediate Return.

### Important — a cross-root Song can lead to an unusable version detail

Global Song selection correctly opens the aggregate `StudioWork`, but `openRevision(_:in:)` finds a project in `searchableRootIndexes` without activating that project's owning root (`StudioLibraryStore.swift:1071-1082`). `selectedProject` only resolves against the active `library` (`StudioLibraryStore.swift:590-612`). Therefore, if the chosen Song/version lives under a different tracked root from the currently active one, clicking **Details** assigns a foreign `selectedProjectID` and the detail route cannot resolve that project. Evidence hits do activate their owning root, but Song-first navigation does not complete that handoff.

Resolve the cached root that owns `session.rootURL` (using most-specific-root semantics), activate it before assigning project/timeline/Set IDs, and cover a Work whose chosen revision belongs to a non-active root.

### Important — the custom modal does not isolate assistive-technology focus

The overlay visually dims the underlying shell, but `LibraryRootView` leaves the full sidebar/workspace accessibility tree exposed (`LibraryRootView.swift:11-55`). `StudioGlobalSearchOverlay` contains its children and labels the panel, but does not declare modal semantics or hide the background (`StudioSearchResultsView.swift:13-60`). VoiceOver users can therefore navigate behind what is presented as a modal search surface.

Hide the underlying shell from accessibility while `globalSearchPresented` is true and expose the panel as the modal focus scope. Verify initial focus, Escape restoration to the invoking search button, Tab order, and announcement of expanded evidence/loading/empty states.

### Minor — cancelled detached searches continue consuming work

The parent query tasks are cancelled and guard state publication, but each uses `Task.detached { ... }.value` (`StudioLibraryStore.swift:2138-2149`, `2169-2177`), so cancellation does not stop the detached search itself. Rapid typing over a large evidence index can leave multiple full local searches running concurrently. State is protected, but CPU and memory work are not.

Use structured cancellation or make the index search cancellation-aware. Keep the query off the main actor, as the product contract requires.

### Minor — current rendered proof is missing

The two supplied QA screenshots were captured at 01:19 and 01:22, while the reviewed `StudioSearchResultsView.swift` was modified at 01:28. They demonstrate the intended shell and Song-first ordering, but cannot validate the current panel sizing, keyboard focus, expansion state, or accessibility behavior. Capture fresh rendered evidence after the findings above are fixed.

## Test coverage assessment

`StudioSearchTests` provides useful deterministic coverage for Song-over-Artist ranking, diacritic handling, recent ordering, indexed evidence kinds, all-root provenance, and overlapping-root deduplication. It does not cover global-search state generations, immediate-Return behavior, modal focus/accessibility, or Song-to-version navigation across roots. Those gaps correspond directly to the Important findings above.

## Implementation response and verification

Date: 2026-08-14

All three Important findings and the cancellation concern were addressed in the search slice:

- Query mutation now synchronously clears Song/evidence hits and the view selection. Both off-main search pipelines carry independent UUID generations, and `StudioSearchResultBatch` revalidates the semantic query before publishing results. Immediate Return therefore has no stale result to open. A pure regression verifies that a batch produced for query A is rejected for query B.
- Song opening captures the preferred current revision through `StudioRevisionReferenceResolver` and activates its exact `trackedRootURL`. Version opening resolves and activates the revision's owning cache before assigning project/timeline/Set selection. A new pure regression verifies most-specific-root capture for overlapping roots.
- The underlying shell is hosted behind an AppKit accessibility-isolation boundary while custom search is presented, the inspector is withheld, and the search panel carries modal semantics. The sidebar trigger owns keyboard and accessibility focus state for dismissal restoration. The focused text field also handles Escape explicitly; outside-click dismissal remains on the scrim.
- Detached work remains off-main but every completion is generation- and query-gated, so cancelled or superseded work cannot publish state.

Verification evidence:

- Strict Swift format passed for all changed search/Core/UI/test files.
- Focused tests passed: `StudioSearchTests` 6/6 and the new most-specific tracked-root test 1/1.
- Full package test passed: 226 tests across 41 suites.
- Release builds passed for `StudioTimeMachine` and `studio-index`; the final post-accessibility-change debug app build also passed.
- Impeccable detector returned `[]`.
- Fresh corrected render: `/tmp/studio-search-review-final-corrected.png`.
- Direct AXUIElement traversal of the presented search found 244 accessible elements, initial focus on `studio.search.input`, `studio.search.overlay` present, and `studio.sidebar.search` absent, confirming background isolation while modal.
- Escape dismissal itself was observed in an earlier corrected probe, but AX focus restoration reported `AXUnknown`. A later direct AX traversal confirmed modal isolation; after adding the explicit focused-field Escape handler and dual focus state, the final restoration target was not re-probed before handoff. Treat exact post-Escape focus restoration as unconfirmed QA, not a verified claim.

## Final read-only re-review

Date: 2026-08-14

**SPEC PASS**

**QUALITY APPROVED WITH MINOR FOLLOW-UP**

The three prior Important findings are closed in the current source:

- **Stale Return:** `globalSearchText` now synchronously clears both result collections before scheduling work (`StudioLibraryStore.swift:36-44`). Each Song and evidence pipeline also advances an independent UUID generation and checks both that generation and the normalized semantic query before publication (`StudioLibraryStore.swift:2152-2215`). The overlay clears its local selection when the text changes, and Return can only resolve through the now-current hit collections (`StudioSearchResultsView.swift:32-44, 283-301`). A superseded query therefore cannot open its old row.
- **Cross-root activation:** Song opening captures the preferred revision's reviewed reference and activates its exact `trackedRootURL` before selecting the Work (`StudioLibraryStore.swift:1197-1205, 2282-2301`). Version opening resolves the owning root before assigning Project/timeline/Set selection, with a most-specific-root fallback (`StudioLibraryStore.swift:1081-1099, 2304-2335`). `StudioRevisionReferenceResolver` itself selects the longest containing source root, with a regression for overlapping roots (`StudioRevisionReference.swift:262-289`; `StudioRevisionReferenceTests.swift:31-47`).
- **VoiceOver modal isolation:** the entire shell is hosted behind an AppKit accessibility boundary and marked hidden while search is presented; the inspector is withheld at the same time (`LibraryRootView.swift:13-29, 103-110, 157-178`). The overlay is separately exposed with `.isModal`, identifies its input, requests initial focus, and supports Escape (`StudioSearchResultsView.swift:13-64, 67-92`). The sidebar trigger carries both keyboard and accessibility focus bindings for dismissal restoration (`StudioSidebarView.swift:4-8, 44-49, 84-101`). This closes the underlying-tree navigation trap.

One prior Minor is only partially closed:

- **Superseded search computation still runs:** generation, query, and parent-cancellation guards now make publication safe, but both pipelines still await an unstructured `Task.detached`, while the synchronous `StudioWorkSearchIndex.search` and `StudioSearchIndex.search` loops have no cancellation checks (`StudioLibraryStore.swift:2163-2179, 2200-2214`; `StudioWorkSearch.swift:53-115`; `StudioSearch.swift:72-111`). Cancelling the parent does not cooperatively stop that detached CPU work. This is a bounded local-performance follow-up rather than a correctness blocker; make search cancellation-aware or retain and cancel the detached handle if profiling shows rapid typing over large indexes causes material overlap.

Exact post-Escape AX focus restoration remains unconfirmed rendered QA, as already recorded in the implementation response. The source has a safe, explicit dual-focus restoration path and reveals no substantive accessibility trap, so this remains Minor and does not block approval.
