---
name: Studio Time Machine
description: A calm, private macOS archive where studio projects become objects that can be heard, inspected, and safely recovered.
colors:
  ink: "#000000"
  paper-ink: "#FFFFFF"
  shell-chrome: "#0E0F0D"
  shell-chrome-raised: "#181A17"
  workspace-canvas: "#F6F4ED"
  workspace-raised: "#FCFBF7"
  selection-faint: "rgba(0, 0, 0, 0.08)"
  selection-soft: "rgba(0, 0, 0, 0.09)"
  panel-soft: "rgba(0, 0, 0, 0.06)"
  divider-soft: "rgba(0, 0, 0, 0.20)"
  sleeve-rose: "#F04D6B"
  sleeve-wine: "#8C1438"
  sleeve-sky: "#47ABDB"
  sleeve-ocean: "#144A87"
  sleeve-gold: "#F7BA38"
  sleeve-amber: "#C44F12"
  sleeve-leaf: "#7AC287"
  sleeve-forest: "#1A6645"
  sleeve-lilac: "#A380D9"
  sleeve-violet: "#402982"
  sleeve-dark-ink: "#2E1405"
typography:
  workspace-title:
    fontFamily: "Helvetica Neue, Helvetica, sans-serif"
    fontSize: "30px"
    fontWeight: 700
  project-title:
    fontFamily: "Helvetica Neue, Helvetica, sans-serif"
    fontSize: "34px"
    fontWeight: 700
  task-title:
    fontFamily: "Helvetica Neue, Helvetica, sans-serif"
    fontSize: "28px"
    fontWeight: 700
  native-body:
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"
    fontWeight: 400
  native-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif"
    fontWeight: 600
rounded:
  source-selection: "7px"
  evidence-row: "10px"
  recovery-panel: "12px"
  location-panel: "14px"
  transport: "18px"
spacing:
  micro: "4px"
  compact: "8px"
  control: "10px"
  row: "14px"
  panel: "18px"
  section: "30px"
  workspace: "38px"
  task: "40px"
components:
  source-selection:
    backgroundColor: "{colors.selection-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.source-selection}"
    padding: "5px 7px"
  evidence-selection:
    backgroundColor: "{colors.selection-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.evidence-row}"
    padding: "10px 12px"
  recovery-panel:
    backgroundColor: "{colors.panel-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.recovery-panel}"
    padding: "15px"
  timeline-chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-ink}"
    padding: "7px 13px"
---

# Design System: Studio Time Machine

## Overview

**Creative North Star: "The Private Studio Archive"**

Studio Time Machine uses compact dark navigation and a quiet matte workspace as structural principles, with archive-oriented references informing the project objects inside it. A compact dark navigation rail frames one quiet workspace; project identity and history live inside that workspace rather than competing with window chrome. The thesis remains that a private archive becomes a calm studio object that can be heard and inspected; dashboard chrome is refused.

The application is an Operate surface. A custom but macOS-literate sidebar, Song-first Spotlight overlay, breadcrumb command bar, optional inspector, settings scene, keyboard commands, review sheets, context menus, disclosure groups, segmented pickers, and system status semantics do the interaction work. Library status and location management sit in the sidebar footer, leaving the command bar for context and inspection. Generous negative space keeps archive-scale evidence legible. The sleeve-and-disc object remains the memorable expression: it carries project and version lineage while the shell stays near-monochrome.

The light workspace is shipped and reviewed. Semantic SwiftUI foreground styles, `NSColor.textBackgroundColor`, `.bar`, `.regularMaterial`, native dividers, standard controls, and system status colors are runtime-resolved macOS materials—not fixed color tokens. The frontmatter therefore records only literal colors found in the implementation. Dark Mode, final product naming, future project-object generation, compare-window treatment, and the boundary between the main window and auxiliary preview or inspection windows remain unresolved visual decisions.

**Key Characteristics:**

- Compact charcoal navigation framing one uninterrupted matte workspace.
- A compact sidebar search action and Command-F open a Song-first Spotlight overlay; breadcrumb context remains quiet in the command bar.
- Small, singular tasks surrounded by deliberate negative space.
- Helvetica Neue for workspace headings and object monograms; native San Francisco text styles for controls, metadata, and evidence.
- Deterministic sleeve-and-disc identities carry almost all expressive color.
- Evidence appears as quiet rows, disclosures, inspectors, and compact panels—not dashboard cards.
- Every recovery, compatibility, preview, provenance, and lifecycle state says what is known and what is not.

## Colors

The shell is intentionally semantic and near-monochrome; literal color is reserved for the object-led archive and low-alpha selection or panel layers.

### Primary

- **Archive Ink:** The black tint anchors prominent native actions, the selected segmented lens, and selected timeline chips.
- **Paper Ink:** White is used only where a light foreground must sit over the selected black control or a dark project sleeve.

### Secondary

- **Rose / Wine, Sky / Ocean, Gold / Amber, Leaf / Forest, and Lilac / Violet:** Five deterministic two-stop sleeve gradients give projects recognizable identities without coloring the surrounding interface.
- **Dark Sleeve Ink:** The warm gold sleeve uses a dark brown monogram for contrast; the other shipped sleeves use white monograms.

### Neutral

- **Faint Selection:** The quiet selected state for audio rows and similar evidence.
- **Soft Selection:** The source-list and version-row selection layer.
- **Soft Panel:** Recovery panels group related facts without becoming elevated dashboard cards.
- **Soft Divider:** Thin lineage and evidence separators establish order without boxing content.
- **Native semantic roles:** Primary and secondary labels, text background, bar material, quaternary fills, regular material, dividers, and green/orange/red status roles must remain SwiftUI or AppKit semantic values. Do not replace them with sampled hex values.

**The Color Belongs to the Object Rule.** Project and version sleeves and discs carry expression; navigation, controls, metadata, and evidence remain neutral.

**The Semantic Shell Rule.** Preserve macOS semantic colors and materials so contrast and system rendering stay truthful; only literal implementation colors belong in the token layer.

**The Status Is More Than Color Rule.** Available, missing, disconnected, permission-required, mismatch, and unknown states always pair native status color with an SF Symbol and explicit label.

## Typography

**Display Font:** Helvetica Neue (with Helvetica and sans-serif fallback)
**Body Font:** San Francisco through native SwiftUI text styles
**Label/Mono Font:** San Francisco, with `monospacedDigit()` only for counts, progress, tempo, signatures, and scan statistics

**Character:** Helvetica Neue makes the archive headings and object monograms feel authored and physical. Native San Francisco keeps controls, metadata, paths, lists, inspector evidence, and operational copy unmistakably macOS and easy to scan.

### Hierarchy

- **Project Title** (bold, 34px): The selected project name beside its active sleeve and disc.
- **Workspace Title** (bold, 30px): Library destinations such as Studio Library, Locations, Loose audio, and Private chain browser.
- **Task Title** (bold, 28px): The centered first-run invitation.
- **Section Heading** (native Title 2, semibold): Set history, Inside this Set, Preview and recovery, and other major evidence groups.
- **Panel Heading** (native Headline): Recovery panels, inspector sections, and compact group labels.
- **Body / Callout** (native Body and Callout): File names, explanations, paths, device and track rows, actions, and evidence.
- **Metadata** (native Caption and Caption 2): Counts, timestamps, provenance, statuses, helper copy, and compact state tags.

**The Two-Family Rule.** Use Helvetica Neue only for workspace-scale headings and sleeve monograms. Everything interactive, evidential, or metadata-heavy remains in native San Francisco styles.

**The Evidence Numeral Rule.** Use native monospaced digits when changing widths would impair comparison; do not introduce a separate decorative mono family.

## Layout

The app opens at a 1240 × 800 default window and holds a 980 × 650 minimum. A fixed 258-point custom sidebar occupies the full dark window surface while the central workspace is inset by 8 points and clipped to a 16-point continuous shape. The optional inspector remains 260 to 380 points, ideally 310. Breadcrumbs and the inspector toggle sit in a light command bar inside the workspace; the sidebar search action opens a restrained upper-centred modal over the window.

Library grids adapt between spacious objects (220–290 point columns, 36 point gaps) and compact archive browsing (168–220 point columns, 22 point gaps). Main destinations use approximately 38 points of horizontal workspace padding and 30–34 points above the first heading. Project detail is centered within a 980-point reading width with 42-point side padding and 40-point section separation. Locations and private chains use a tighter 920-point evidence width. Bottom padding expands when the floating transport is present so content is never obscured.

First run, indexing, and failure are single-purpose states centered in the full detail workspace. First run presents one explicit folder action and two quiet privacy assurances. Indexing adds determinate progress when totals are known, names the current phase, reports reused Sets, and repeats that nothing is changed. Failure uses the native unavailable-state pattern and one retry action.

The selected Set moves from project and version lineage into evidence. A horizontal timeline chooser precedes version rows; then a 520-point segmented lens switches among Tracks, Devices, Clips, and Media. Semantic changes from the previous version live in an expandable disclosure above the lens. Preview and recovery form three equal evidence panels; snapshot history and restore, branch, and recovered-audio plans expand into focused review sheets with exact source and destination evidence. The inspector remains the denser secondary reading surface for file, structure, dependency, compatibility, and selected-chain detail.

Registered roots persist between launches. Rows distinguish active, available, unavailable, and permission-required roots; cached libraries stay inspectable while a drive is disconnected. File-watching copy distinguishes monitoring, indexing, paused, permission recovery, and static sample data. Do not visually imply that a cached root is currently live.

Deterministic review states are part of the implementation contract: `--sample-welcome`, `--sample-indexing`, `--sample-failure`, `--sample-dense`, `--sample-root-states`, `--sample-loose-audio`, `--sample-search`, `--sample-snapshots`, `--sample-restore-plan`, `--sample-recovery-plan`, `--sample-approximate-plan`, `--sample-live-plan`, and the `--sample-project-*` family select stable surfaces. Project lens variants include `--sample-project-devices`, `--sample-project-clips`, and `--sample-project-media`; private-chain variants include `--sample-chains`, `--sample-chain-recommendations`, `--sample-chain-occurrences`, and `--sample-chain-plugins`. Review-only sample plans disable their execution actions.

**The Workspace, Not Dashboard Rule.** Prefer wide reading lanes, rows, and native inspectors. Add cards only when a bounded decision genuinely needs a shared container.

**The Focused Task Rule.** Permission, indexing, failure, and empty states get one clear action in a small central composition rather than a field of competing choices.

## Elevation & Depth

The interface is flat by default. Native source-list/bar separation, tonal fills, dividers, and selection layers provide most structure. Shadows belong only to physical metaphors and the floating playback layer: discs use a black 14% shadow with radius 14 and 7-point vertical offset; sleeves use black 12%, radius 12, and 6-point offset; the regular-material transport uses black 16%, radius 20, and 10-point offset.

**The Physical Exception Rule.** Sleeves, discs, and the active floating transport may cast ambient shadow because they behave like physical studio objects. Evidence rows, navigation, inspectors, and recovery panels stay flat.

**The One Floating Layer Rule.** The preview transport is the only persistent floating surface in the main window; keep it restrained, centered, and no wider than 690 points.

## Shapes

Native controls retain their platform shapes. The custom vocabulary is continuously rounded and restrained: source selection uses a 7-point radius, evidence selection 9–10 points, recovery panels 12 points, grouped location surfaces 14 points, and the floating transport 18 points. Timeline selectors, locator tags, sample/current/backup tags, and render hints are capsules.

The signature project object combines a sleeve at 82% of its square frame with a disc at 78%. The sleeve has a continuous radius equal to 7.5% of its size, a diagonal gradient, a restrained wave-like ink field, and a two-letter Helvetica Neue monogram. The disc uses an angular gradient, fine light ring, white center, and quiet dark outline. The sleeve sits left of center and the disc reveals to the right, making lineage legible even at the 56-point version-row scale.

**The Continuous Geometry Rule.** Custom rectangles use continuous corners; pills use true capsule geometry. Do not mix in sharp web-card rectangles or arbitrary radius values.

## Components

### Window Frame and Navigation

- **Structure:** Full-height dark sidebar, compact app switcher, one primary folder action, grouped destinations, text-led recent Songs, bottom library-status/location control, detail workspace, optional inspector, sidebar-triggered Song search overlay, settings scene, and command menu.
- **Selection:** A restrained light-on-dark layer clarifies the active destination or Song. Recent Songs remain text-led so the colourful project object is reserved for the workspace.
- **Behavior:** Global search opens from the sidebar or Command-F and first returns Work-catalogue Song names, with Artist matching and recent Songs before typing. “Search all project files and details” progressively reveals local project, Set, track, clip, device, locator, and audio rows with owning-root provenance; choosing evidence first activates its cached root, then opens its project and version. Loose audio, Samples, and recovered-chain filters remain page-local. Search-index construction and querying occur away from the main actor. The inspector and folder actions remain available in the toolbar and command system.
- **Desktop reach:** Command shortcuts navigate the four Library destinations, choose a folder, rescan, open snapshot history, plan recovered audio, reveal the current selection in Finder, and toggle the inspector. Project, Set, audio, and search rows expose focused context menus.
- **Settings:** Library density and full-versus-abbreviated browsing paths persist with `AppStorage`. Any path that authorises a write plan remains full and selectable regardless of browsing preference.

### Project Sleeve and Disc

- **Character:** The archive's physical identity and only sustained source of expressive color.
- **Identity:** A deterministic palette is derived from project identity; the monogram derives from the first two alphanumeric words.
- **Behavior:** The disc moves from 14% to 24% of object size on hover or active selection using a spring with response 0.36 and damping fraction 0.82.
- **Accessibility:** Reduce Motion removes the spring animation; the containing project button supplies the descriptive accessibility label and hint.

### Buttons, Chips, and Segmented Lenses

- **Buttons:** Shell and canvas buttons use the product's compact continuous-corner styles while retaining native keyboard, focus, menu, help, disabled, and accessibility behavior. Black marks primary canvas actions; low-alpha tonal fills handle secondary and quiet actions.
- **Chips:** Selected timeline chips are black with the semantic workspace foreground; unselected chips use a quiet secondary fill. Evidence tags use quaternary native fill.
- **Lenses:** Tracks, Devices, Clips, and Media use a native segmented picker capped at 520 points. Lens changes use a restrained 0.18-second ease-out transition.

### Evidence Rows and Inspector

- **Style:** Leading SF Symbol, medium body label, secondary caption detail, trailing state or metric, and a divider inset to the text column.
- **Density:** Rows generally use 10 points of vertical padding. Large lists initially cap tracks at 100, devices and clips at 140, and media references at 160, then offer an explicit show-all control.
- **Truth:** Mixer state, device nesting, clip placement and warp evidence, media availability, structural counts, paths, and compatibility remain factual and scannable.
- **Compatibility:** Installed, missing, version mismatch, and not-scanned are distinct labeled states. Missing plug-ins never make an otherwise inspectable Set look lost.

### Semantic Version Diff

- **Style:** A native disclosure group names the older Set and modification time before listing change evidence.
- **Content:** Tempo, track, mixer, device, clip, locator, and media-reference changes are described semantically. Summaries count affected objects without claiming audio equivalence.
- **State:** Sample project review states open the disclosure deterministically; ordinary use remains user-controlled.

### Preview and Recovery

- **Panels:** Three flat, soft-neutral panels cover Preview fidelity, Immutable snapshots, and Recovered audio.
- **Preview truth:** Existing artifact, Approximate, experimental Ableton-controlled render, and unavailable are distinct fidelity states. Provenance category and “Likely user render” remain independent labels.
- **Approximate render:** When no existing artifact is preferred, a native save panel leads to a focused review sheet for a new offline WAV. The sheet names raw placements, fixed tempo, source coverage, the full destination, and every deliberate omission: source offsets, fades, warping, automation, mixer, routing, devices, plug-ins, and Ableton summing. The result stays labeled Approximate in the floating transport.
- **Open in Live:** The experimental review sheet names the selected installed Live application, version-match explanation, exact Set, and user-controlled boundary. A second explicit action is required before launch. This path only opens the Set: it does not render, export, or play audio, and it does not silently launch anything else.
- **Accessibility export:** A separate experimental review sheet names the supported adapter and Live version, the active Set as confirmed by its exposed document path when available, explicit export settings, and full no-overwrite destination. When Live exposes no document path, the constrained same-title fallback is disclosed as a qualification limitation. `Confirm and Export` remains disabled until Accessibility preflight confirms permission, the active-Set check, and no unsaved changes. The executor uses semantic Accessibility controls only; unexpected dialogs stop the run, and fresh output is verified before it is linked as experimental Ableton-controlled evidence. Real-Live qualification must still use a disposable Set and new empty destination before release.
- **Snapshots:** History lists every captured project version with reason, time, byte size, digest, and source. Restore and Branch each enter a plan-review sheet that exposes the exact new `.als` destination before confirmation and refuses overwrite.
- **Recovered audio:** The review sheet reports verified file count and total bytes, exposes the exact destination directory and every From/To mapping, copies only available clip-audio references, resolves filename collisions safely, and never mutates the Set or source files.
- **Notices:** Completion and failure messages appear as a dismissible, nonmodal banner above the current destination, so recovery outcomes are not trapped inside one project panel.

### Private Chain Browser

- **Style:** A segmented evidence workspace switches among Recommendations, Families, Occurrences, and Plug-ins. Rows retain ordered device names, project/Set/track lineage, state-variation count, modification date, and plug-in compatibility evidence.
- **Recommendations:** Context is explicitly chosen from vocal, guitar, bass, drums, keys, synth, mix bus, master, and other. Ranking is deterministic and local; reasons expose same-context reuse, project breadth, recency, and compatibility. The surface says “no cloud AI.”
- **Drill-through:** Selecting an occurrence opens a native inspector with ordered and nested devices, compatibility, and recovery capability. Open Source Set returns to the exact project, timeline, and Set evidence.
- **Capability:** Every occurrence says either Inspect only or Existing Rack candidate. The interface never fabricates `.adg` files or implies native chain insertion.
- **Privacy:** Recovered chains remain local and private; community semantics do not appear in this surface.

### Floating Preview Transport

- **Material:** Native regular material in an 18-point continuous shape with one ambient shadow.
- **Content:** Play/pause, filename, artifact category, independent likely-render hint, close, disabled-file help, and inline error text.
- **Placement:** Centered above the bottom edge with 28-point horizontal and 18-point bottom insets; content surfaces reserve 110–118 points beneath it.

## Do's and Don'ts

### Do:

- **Do** let project and version objects carry the expressive color while native chrome and evidence remain quiet.
- **Do** use native macOS focus, keyboard navigation, menus, toolbar behavior, text selection, VoiceOver semantics, and standard control states.
- **Do** respect Reduce Motion and Increased Contrast, and keep labels and symbols alongside every status color.
- **Do** separate provenance from the likely-render filename heuristic, and separate inspectability, previewability, compatibility, and recoverability.
- **Do** label approximate playback before and during playback; keep experimental Ableton-controlled rendering visibly distinct and clearly gated behind explicit review.
- **Do** explain persistent-root lifecycle truth: cached inspection, drive disconnection, permission loss, scan progress, reused data, and watcher state.
- **Do** show restore and recovered-audio destinations before action, create new output only, and preserve collision-safe filenames.
- **Do** keep browsing-path preference separate from safety-critical plan destinations, which always show the full local path.
- **Do** explain local search and chain recommendation provenance, keep their heavy work off the main actor, and never imply a cloud AI dependency.
- **Do** keep deterministic sample arguments working as repeatable visual-review fixtures.
- **Do** preserve unresolved product decisions as unresolved: release boundary; supported Live versions and future-format behavior; controlled real-Live qualification and release criteria for the Accessibility export adapter; retention, cross-volume moves, root priority, and broader merged-library browsing beyond the fixed global-search behavior; future semantic-search scope and opt-in boundary; extraction formats and safe-restore contract; preview thresholds; plug-in catalogue integration; naming, pricing, cloud, community, and account timing; Dark Mode; generated object art; compare windows; and auxiliary-window boundaries.

### Don't:

- **Don't** turn the archive into a generic dashboard of statistic cards, saturated navigation, or decorative control chrome.
- **Don't** replace semantic SwiftUI colors and materials with fixed web-style tokens or automatic dark-mode inversion.
- **Don't** use Helvetica Neue for controls, metadata, file paths, tables, or dense evidence.
- **Don't** encode availability, severity, compatibility, or provenance with color alone.
- **Don't** imply that structure counts prove a device, sidechain, automation lane, or clip is active.
- **Don't** present a likely user render as provenance, an approximate reconstruction as exact, or an experimental render as dependable.
- **Don't** overwrite originals, conceal output destinations, copy unavailable media, or claim whole-Set merge.
- **Don't** allow deterministic sample review plans to execute filesystem writes.
- **Don't** present inspect-only chains as recoverable racks or fabricate native chain files.
- **Don't** imply cached roots are connected, sample data is live, or unresolved lifecycle contracts are guaranteed.
- **Don't** introduce account, cloud, AI, sharing, or community pressure into the private local-first archive without explicit opt-in and a resolved product decision.
