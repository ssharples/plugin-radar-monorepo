# Ableton project handoff

## Product decision

Add a first-class `Send Project...` flow. It prepares a new, disposable handoff copy of a selected
Set revision, verifies what can actually travel, creates a recipient-facing compatibility report, and
then passes the verified package to the existing delivery flow.

Never run Collect All and Save, Freeze, Bounce, Flatten, or Save As against the indexed source. The
source Project remains untouched and is always shown separately from the staging destination.

Do not use one undifferentiated "portable" badge. Report three independent outcomes:

1. `Ableton media verified` — every audio and Max for Live reference visible to Live is available and
   contained in the staged Project.
2. `Plug-ins documented` — third-party plug-ins, formats, versions when known, tracks, and sender-side
   availability are listed. This is an audit, not proof of recipient compatibility.
3. `Fallback audio included` — tracks at risk from missing plug-ins have an approved frozen/bounced
   counterpart, or the package says that no fallback was created.

Ableton confirms that Collect All and Save copies referenced audio and Max for Live devices into the
Project, but does not collect third-party plug-ins. Ableton recommends Freeze/Flatten, Bounce, or
resampling when the other computer may not have identical plug-ins. [Transferring Projects to
another computer](https://help.ableton.com/hc/en-us/articles/209071909-Transferring-Projects-to-another-computer)

## Recipient experience

The recipient receives a ZIP with a predictable top-level folder:

```text
ARTIST - SONG - VERSION/
  Project/
    Ableton Project Info/
    Samples/
    SONG - VERSION.als
    SONG - VERSION - COMPATIBILITY.als   (optional)
  Audio Fallbacks/                       (optional stems/master)
  Project Handoff.pdf
  Project Handoff.txt
  manifest.json
```

The Project folder is intact rather than a loose `.als` file. Ableton states that the Project Info
folder identifies a Project and that removing it can produce missing-media errors even after Collect
All and Save. [Saving Projects](https://help.ableton.com/hc/en-us/articles/115000915804-Saving-Projects)

ZIP should be the default because it works without installing a Pack and can contain the PDF beside
the Project. Offer `.alp` as an advanced alternative: Live can restore a complete Project from a Pack,
but external files still need to be collected first. [Packing Projects into
Packs](https://www.ableton.com/en/live-manual/12/managing-files-and-sets/#packing-projects-into-packs)

## Safe preparation workflow

### 1. Readiness audit

The app parses the selected `.als` and displays, before any copy or Live automation:

- exact source Set revision and physical Project folder;
- Live creator/version and likely edition requirements when knowable;
- resolved, external, disconnected, missing, and unresolved media references;
- native devices, Max for Live devices, Ableton Packs when identifiable, and third-party plug-ins;
- third-party plug-in name, vendor, AU/VST/VST3 format, required version when encoded, tracks used,
  and whether a compatible installation is present on the sender's Mac;
- high-risk plug-in-managed libraries that cannot be proven portable from the `.als` alone;
- estimated staged size, free disk space, package destination, and strict no-overwrite policy.

The existing `AbletonSetContent`, `MediaDependencyResolver`, `PluginInventoryScanner`, and
`PluginCompatibilityEvaluator` already provide most of the deterministic input for this audit.

### 2. Create an isolated staging Project

Copy the entire DAW-owned Project leaf to a new collision-safe staging folder outside every indexed
music root. Preserve its internal layout and source provenance. Verify the copy before promotion.
Never move the source and never use the source folder as a delivery destination.

Open only the staged Set in Live after a review step names the exact source, staged destination, and
actions. If Live has unsaved user work or the active document cannot be confirmed, stop.

### 3. Collect media in the staged copy

Run Collect All and Save in Live with every source category selected. Live defines this as copying
external files into the current Project; external includes Packs, other Projects, the User Library,
and elsewhere on the computer. [Collecting External
Files](https://www.ableton.com/en/live-manual/12/managing-files-and-sets/#collecting-external-files)

This must be a reviewed extension of the existing versioned AX adapter, with expected-dialog state,
cancellation, unsupported-version handling, and no coordinate-only primary path.

### 4. Create compatibility fallbacks when requested

Preserve one editable staged Set. Save a separate `- COMPATIBILITY` revision and freeze or bounce only
the reviewed at-risk tracks in that revision. Never flatten the editable copy.

Freeze is the preferred first fallback because the device chain remains represented while Live plays
generated freeze files. Ableton documents that frozen tracks can play on computers lacking their
devices, although frozen content has editing and behavior limitations. [Track
Freeze](https://www.ableton.com/en/manual/computer-audio-resources-and-strategies/#track-freeze)

Offer stems and a master as the most universal fallback. Do not claim that a frozen/bounced revision
is equivalent to the editable source.

### 5. Verify the staged result

Re-index the staged `.als` and require all of the following before showing `Ableton media verified`:

- the expected Set and `Ableton Project Info` exist;
- every media/device resource visible to the parser resolves;
- every resolved reference is inside the staged Project root;
- files are readable, non-zero, and stable;
- compatibility/fallback files expected by the plan exist;
- the immutable package file list, byte sizes, and SHA-256 digests are recorded;
- the ZIP can be reopened and its manifest matches its contents;
- nothing collided with or overwrote a pre-existing path.

If any item fails, retain the staged copy for review and label it `Needs attention`; do not silently
send it.

## Assurance language

| Status | Meaning |
| --- | --- |
| Ready | Ableton-visible media is contained and verified; required plug-ins are documented; selected fallbacks exist. |
| Ready with compatibility notes | Media is verified, but recipient needs listed devices/Packs or should use fallbacks. |
| Needs attention | Known missing/disconnected media, failed collection, missing fallback, or failed package verification. |
| Unknown external dependency | A plug-in may load its own library/preset assets and the app cannot prove those assets travel. |

Never say `no missing samples guaranteed`. Say `All Ableton-visible media was collected and verified
on the sender's Mac`, with the verification time and Live version. Audio inside Kontakt, Spitfire,
Omnisphere, or similar vendor-managed libraries can sit outside Ableton's file-reference model, and
third-party plug-ins and licences cannot be bundled by this workflow.

## Project Handoff PDF

The PDF is a generated snapshot of the verified manifest, not a manually editable source of truth.
It contains:

1. Artist, Song, selected version, source revision date, package ID, generated date, and sender note.
2. A three-card readiness summary for media, plug-ins, and fallback audio.
3. Required Ableton version/edition, Packs, and Max for Live requirements when known.
4. A plug-in table: name, vendor, format, required version or `Not encoded`, tracks used, sender-side
   status, and available fallback.
5. Missing or uncertain dependencies in a prominent warnings section.
6. Package contents, file count/size, manifest checksum, and verification method.
7. Opening instructions: unzip the complete folder, open the named `.als`, do not move internal files,
   use the compatibility Set or stems if devices are unavailable.
8. Honest caveats about recipient licences, plug-in-managed libraries, hardware/external instruments,
   and sample redistribution rights.

Generate a plain-text twin for accessibility, copy/paste, and recipients who cannot open the PDF.
Do not include local absolute paths, usernames, email addresses, serial numbers, or licence data.

## Prewritten message

```text
Subject: ARTIST - SONG - VERSION | Ableton project

Hi [name],

Here is the Ableton project for ARTIST - SONG (VERSION).

Prepared with Ableton Live [version]. All media references visible to Ableton were collected into the
Project and verified on [date]. The package includes [an editable Set / a compatibility Set / stems /
a master].

You will need these third-party plug-ins to edit the original processing:
[short plug-in list]

[Compatibility note or: The compatibility Set/fallback audio is included if you do not have them.]

Download: [link]
Expires: [date]

Open `Project/[set name].als`. Full compatibility and package details are in Project Handoff.pdf.
```

The user reviews and edits this message before Share, Mail, iCloud link, or Studio Send. The app never
uploads or sends a project in response to background indexing alone.

## Core models

- `ProjectHandoffPlan`: source Work/Session/revision, staging/delivery URLs, media policy, fallback
  policy, selected tracks, package format, and never-overwrite policy.
- `ProjectReadinessAudit`: media evidence, device requirements, Live compatibility, risks, size, and
  current assurance status.
- `ProjectHandoffEvidence`: staged revision IDs, automation evidence, before/after dependencies,
  fallbacks, verified file manifest, checksums, Live/adapter version, and timestamps.
- `ProjectHandoffPackage`: immutable package URL, format, report URLs, digest, size, and status.

All records link back to the selected Set revision and Work without rewriting indexed source truth.

## Implementation order

1. Read-only `ProjectReadinessAudit` plus a visible `Send Project...` review sheet.
2. PDF/text/JSON report generation from current parser and plug-in inventory evidence.
3. Verified filesystem staging and ZIP packaging, initially with manual `Collect All and Save` steps.
4. Versioned Live 12.4.2 AX automation for staged Collect All and Save, with fake-tree tests first.
5. Optional compatibility Set and reviewed per-track Freeze/Bounce automation.
6. Hand the verified package to native Share/Mail, iCloud temporary links, and later Studio Send.
7. Add `.alp` output only after the simpler ZIP flow and staged Project verification are proven.

The valuable first slice is the audit and report: it is useful without automating Live, exercises the
existing parser/inventory, and makes the eventual staging automation safer.

## Primary sources

- Ableton [Transferring Projects to another computer](https://help.ableton.com/hc/en-us/articles/209071909-Transferring-Projects-to-another-computer)
- Ableton [Saving Projects](https://help.ableton.com/hc/en-us/articles/115000915804-Saving-Projects)
- Ableton [Managing Audio Clips and Samples](https://help.ableton.com/hc/en-us/articles/5068208334226-Managing-Audio-Clips-and-Samples)
- Ableton Live 12 Manual [Managing Files and Sets](https://www.ableton.com/en/live-manual/12/managing-files-and-sets/)
- Ableton Live 12 Manual [Track Freeze](https://www.ableton.com/en/manual/computer-audio-resources-and-strategies/#track-freeze)
- Ableton [Committing Audio in Live](https://help.ableton.com/hc/en-us/articles/22998838817820-Committing-Audio-in-Live)
