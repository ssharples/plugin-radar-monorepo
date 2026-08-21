# Ableton template creation and management feasibility

Status: primary-source research and product architecture recommendation. No Live Set, template, preference, or app source was changed.

## Decision

A **Template Manager is feasible and can offer dependable CRUD for custom, Live-authored templates**. An **Automatic Template Builder is feasible only when Ableton Live remains the author of changed `.als` content**, or when the builder creates an exact copy of an already valid template.

Do not promise arbitrary external `.als` synthesis or unattended third-party plug-in injection. Ableton does not publish a supported `.als` authoring schema. The official Live API can manipulate parts of an open Set, but its Live 12.3 device insertion API supports native Live devices only and explicitly excludes Max for Live devices and plug-ins. Pro-Q 4 therefore cannot be inserted through that supported API.

The recommended first product flow is:

> Pro-Q 4 appears on 82% of your tracking-layer channels. Add it to your Recording template?

The app should then show the evidence, exact plug-in format/version, target tracks and chain position; duplicate the selected template; open a disposable candidate in compatible Live; guide or permission-gated automate the change; and let **Live save and validate** the resulting template. The original remains untouched until the user explicitly promotes the candidate.

## Confirmed by Ableton

### What a template is

- `.als` is Ableton's file type for both a Live Set and a template Set ([Live-specific file types](https://help.ableton.com/hc/en-us/articles/209769625-Live-specific-file-types)).
- Live creates a custom Template Set with **File > Save Live Set as Template**. Opening it from Browser > Templates creates a new `Untitled.als` with the saved tracks, devices and configuration; it does not turn the template file itself into the user's new project ([Default Set and Template Sets](https://help.ableton.com/hc/en-us/articles/209067189-Default-Set-and-Template-Sets), [Live 12 manual: Template Sets](https://www.ableton.com/en/live-manual/12/managing-files-and-sets/#template-sets)).
- Template/default Sets can hold multichannel I/O setup, preset devices on tracks, computer-key mappings and MIDI mappings ([Live 12 manual: Template Sets](https://www.ableton.com/en/live-manual/12/managing-files-and-sets/#template-sets)).
- Any existing browser template can be made the default with **Set Default Live Set**. The factory `DefaultLiveSet.als` can be selected to restore the factory default ([Default Set and Template Sets](https://help.ableton.com/hc/en-us/articles/209067189-Default-Set-and-Template-Sets)).

### Storage in Live 11 and Live 12 on macOS

- As of Live 11, custom templates are saved inside the User Library's `Templates` folder ([The User Library](https://help.ableton.com/hc/en-us/articles/209774085-The-User-Library)).
- The default User Library path is `/Users/<username>/Music/Ableton/User Library`, so the default custom-template path is `/Users/<username>/Music/Ableton/User Library/Templates` ([The User Library](https://help.ableton.com/hc/en-us/articles/209774085-The-User-Library), [Default Set and Template Sets](https://help.ableton.com/hc/en-us/articles/209067189-Default-Set-and-Template-Sets)).
- The User Library can be relocated to another local folder or an external drive in Live's Library settings. A manager must discover the configured User Library; it must not hard-code the default path ([The User Library](https://help.ableton.com/hc/en-us/articles/209774085-The-User-Library)).
- Finder changes inside the User Library are supported: Ableton says Live stays in sync with changes applied to folders there ([The User Library](https://help.ableton.com/hc/en-us/articles/209774085-The-User-Library)).
- Live 10 and earlier used a different default-template mechanism, including `Template.als` under the version-specific Preferences directory. This proposal should support Live 11/12 first and treat Live 10 as a separate adapter ([Default Set and Template Sets](https://help.ableton.com/hc/en-us/articles/209067189-Default-Set-and-Template-Sets)).

### Version compatibility

- Live Sets are forward-readable: a Set made in an older Live can open in a newer Live.
- A Set created or saved in a newer Live cannot open in an older Live. This also applies to point releases; Ableton's example says a Set saved by Live 12.3 cannot open in 12.2.
- When a newer Live opens an older Set, Ableton prompts for **Save As** so the older source remains usable.

These are Ableton's documented rules in [Backward Compatibility](https://help.ableton.com/hc/en-us/articles/360000841004-Backward-Compatibility). A manager must never silently overwrite an older template with a newer Live's serialization. “Update” should create a new version first.

### Plug-in state and portability

- Saving a Live Set saves its device/control settings ([Live 12 manual: Saving and Exporting](https://www.ableton.com/en/live-manual/12/live-concepts/#saving-and-exporting)).
- Third-party plug-ins are referenced by a Set but are not collected with it. A recipient needs the same plug-ins installed; Ableton recommends the same edition, plug-in installation and authorization when transferring work ([Transferring Projects to another computer](https://help.ableton.com/hc/en-us/articles/209071909-Transferring-Projects-to-another-computer)).
- AU is macOS-only. VST2 and VST3 can be cross-platform, but Ableton says both machines should have the same plug-in version and recommends using one format consistently within a Set ([Using AU and VST plug-ins on macOS](https://help.ableton.com/hc/en-us/articles/209068929-Using-AU-and-VST-plug-ins-on-macOS)).
- A third-party plug-in's saved state is a reserved binary block which only the plug-in itself can read or write. This is the decisive reason not to synthesize or modify Pro-Q 4 state outside Live/the plug-in ([VST/AU plug-ins reset to default preset](https://help.ableton.com/hc/en-us/articles/115001443850-VST-AU-plug-ins-reset-to-default-preset)).
- For Max for Live content, Ableton recommends saving devices used by templates into the User Library first; otherwise Live can create redundant copies and make updates harder ([Saving Max for Live devices in Templates](https://help.ableton.com/hc/en-us/articles/6195586576146-Saving-Max-for-Live-devices-in-Templates)).

## Official automation surfaces and their limits

### Live Object Model

The official Live Object Model can create, delete and duplicate tracks/scenes and alter exposed properties in the currently open Set ([Song API](https://docs.cycling74.com/apiref/lom/song/)). As of Live 12.3, `Track.insert_device` can insert a native Live device, but its documentation explicitly says Max for Live devices and plug-ins are not supported ([Track API](https://docs.cycling74.com/apiref/lom/track/)). The documented `Song` API has no save, Save As, or Save as Template function.

Consequences:

- It can help build native-device-only track topology inside an open Live Set.
- It cannot implement the Pro-Q 4 example.
- It cannot finish the operation by saving a Template Set without a separate user/UI step.
- A Max for Live helper would itself have to be present in the open Set and still would not provide supported third-party plug-in insertion or template saving.

### Ableton Live Set Export library

Ableton also documents a Live Set Export library that generates self-contained projects with audio/MIDI tracks and clips. Its public documentation describes an Objective-C wrapper for iOS, a restricted generation model, and no reader/parser. It does not document third-party plug-in devices or a desktop template-management workflow ([Ableton Live Set Export](https://ableton.github.io/export/)). It may be useful for a separate audio/MIDI export feature, but it is not a basis for a Pro-Q-equipped macOS template builder.

### macOS Accessibility/UI automation

Accessibility automation can drive the same steps a user performs in Live: open a new/duplicated Set, create or select tracks, search the Browser, load Pro-Q 4, and invoke Save Live Set as Template. The important advantage is that Live and the plug-in write their own state.

This is not an Ableton API contract. It is version-, focus-, localization- and UI-state-dependent. Treat it as a permission-gated **guided adapter**, never as silent background mutation:

1. Require Accessibility permission and show the exact planned actions.
2. Refuse to modify an unidentified or unsaved active Set.
3. Work from a duplicate/new candidate, never the user's only template.
4. Stop on any unexpected dialog, unavailable plug-in, disabled save/export state, or mismatched track/device selection.
5. Ask the user to verify the visible device chain before Live saves it.
6. Confirm a new Live-authored file exists, is structurally readable, and can be reopened before offering promotion.

## CRUD contract

“All Ableton templates” includes different ownership classes. CRUD must be capability-based rather than pretending factory content is mutable.

| Source | Read/open | Create/duplicate | Update | Rename | Delete |
| --- | --- | --- | --- | --- | --- |
| Custom template in configured User Library | Yes | Yes | Yes, as a new Live-authored version then promote | Yes | Move to Trash with restore path |
| Current default custom template | Yes | Yes | Only after preserving the source and validating the replacement | Block external rename/delete until another default is selected in Live | Block until another default is selected |
| Core/factory template inside the signed Live app | Yes | Duplicate into User Library | No in place | No | No |
| Template supplied by an installed Pack | Yes | Duplicate into User Library | No in place | No | No |
| Live 10 legacy `Template.als` | Read via separate legacy adapter | Separate workflow | Separate workflow | Separate workflow | Restore/fallback rules differ |

### Create

Supported confidence tiers:

1. **Reliable clone:** byte-for-byte duplicate a valid Live-authored `.als` into the User Library Templates folder with a collision-free name.
2. **Reliable Live-owned creation:** Live performs Save Live Set as Template after the user/guided builder configures the Set.
3. **Bounded seed catalogue:** duplicate a prevalidated, Live-authored seed for a known topology. This is fully automatic only when no content mutation is needed.
4. **Unsupported synthesis:** generate or patch arbitrary `.als` XML/device/plugin blocks outside Live.

### Read

The manager can index filename, path, source kind, file dates, byte size, structural track/device metadata, inferred creating Live version, referenced plug-ins, missing dependencies and whether a custom template is the configured default. The app already has a read-only gzip/XML parser, but the XML representation is not a published Ableton schema. Parsed fields must be treated as observed evidence, and every new Live release needs corpus validation.

### Update

Opening a browser template produces `Untitled.als`; Ableton does not document an external in-place template-update API. Model update as:

1. create a versioned candidate from the original;
2. make changes inside compatible Live;
3. use Live's Save as Template workflow under a new temporary name;
4. validate/reopen;
5. show a diff of tracks, routing and device chains;
6. promote with explicit confirmation while retaining a recoverable previous version.

This also prevents a newer Live point release from destroying the only copy that an older installation can open.

### Rename and organize

Renaming/organizing custom files in the User Library is consistent with Ableton's documented Finder synchronization. Preserve `.als`, use coordinated/atomic filesystem operations, resolve name collisions, and wait for Live's index to observe the change. Do not rename factory or Pack files in place. If the file is the selected default, perform the default reassignment inside Live first rather than editing Live preference files externally.

### Delete

Delete should mean **move a custom template to macOS Trash**, with confirmation and a durable restore record. Never hard-delete in the first slice. Refuse deletion of factory/Pack templates and of the active default until the default is reassigned. If Live is open, also refuse to delete a template involved in an unconfirmed builder run.

## Automatic recommendation design

The recommendation engine is viable because Studio Time Machine already reads track/device chains across physical Sets. It must aggregate only defensible semantic contexts:

- “tracking layer” must come from explicit track roles, stable naming/routing evidence, or user-confirmed roles—not from every track containing vocals/audio;
- count distinct Works and Sessions, not raw duplicated Set revisions alone;
- show the precise denominator and time window;
- distinguish plug-in identity, format and major version (for example, AU Pro-Q 4 is not a VST3 Pro-Q 4 instance);
- infer insertion position from ordered chains and show it before applying;
- abstain where sessions have missing/disabled plug-ins or ambiguous roles.

Example explanation:

> Pro-Q 4 (Audio Unit) appears first on 18 of 22 user-confirmed vocal tracking tracks across 9 Works. Your selected Recording template has 4 vocal tracking tracks; 2 already contain Pro-Q 4. Add the same plug-in format to the other 2?

The generated **recipe** is deterministic and reviewable even when execution is guided:

- base template and immutable source digest;
- installed Live version and source template version evidence;
- target track identities/roles;
- exact device identity, format, intended chain position and preset choice;
- operations to perform;
- expected post-change chain;
- candidate path, backup path and validation result;
- user confirmation/override.

## Validation gate for a generated candidate

A candidate is not “created successfully” merely because a file exists.

1. The original digest and modification time remain unchanged.
2. Candidate `.als` passes gzip integrity and the app's structural parser.
3. Creator/version evidence matches the Live instance used to save it.
4. Expected tracks and ordered device chains are present.
5. Required plug-ins are installed in the exact saved format and are not reported missing/disabled.
6. Live opens the candidate without corruption, compatibility, demo-mode or missing-device dialogs.
7. Reopened device state matches the selected preset/state evidence.
8. Opening the candidate from Templates yields a new `Untitled.als`.
9. Only after these checks may the user promote it or set it as default.

Ableton documents multiple structural corruption modes, including non-unique list IDs, invalid pointee IDs, unexpected/missing nodes and malformed data; this reinforces why gzip/XML well-formedness alone is insufficient ([Corrupt Sets](https://help.ableton.com/hc/en-us/articles/209773445-Corrupt-Sets)).

## Inferred but requiring a prototype

- A coordinated atomic rename/move of a custom template should be reflected by Live because Ableton says it stays synchronized with Finder changes in the User Library. Verify latency, collision behavior and current-default handling in installed Live 11 and Live 12.
- A byte-identical clone of a valid template should load identically, but the product still needs an end-to-end Live-open test across a representative Live 11/12 matrix.
- Accessibility can likely automate the Pro-Q 4 browser insertion and Save as Template path on the current English Live 12 UI. Reliability must be measured against dialogs, focus changes, multiple Live windows, different browser layouts and Live updates.
- Exact device-chain reuse may be made safer with Live-authored device/track presets or a Live-authored seed, but preset dependencies and plug-in binary state still require Live/plugin validation.
- Parsed creator/version and plug-in identities are useful compatibility evidence, but because the `.als` XML schema is undocumented they cannot be a permanent compatibility contract without regression fixtures.

## Unsupported claims to avoid

- “We can safely write any Ableton template from scratch.”
- “We can inject Pro-Q 4 or its settings by editing `.als` XML.”
- “A template containing a plug-in includes the plug-in itself.”
- “The same named AU/VST/VST3 plug-in is interchangeable.”
- “A template saved by Live 12 will still work in Live 11 or an earlier Live 12 point release.”
- “CRUD applies in place to Ableton factory and Pack templates.”
- “A successful gzip/XML parse proves Live can open the file.”
- “Frequent plugin use alone proves it belongs on every recording track.”

## Recommended delivery slices

### Slice 1 — reliable manager

- discover configured User Library plus Core/Pack template sources;
- index templates, default status, Live version evidence and dependencies;
- open, duplicate, rename/organize, move to Trash and restore custom templates;
- make factory/Pack sources read/duplicate-only;
- maintain automatic local version history and never overwrite without confirmation.

### Slice 2 — recommendation and recipe

- derive role-aware repeated-device suggestions from distinct Works/Sessions;
- show evidence, exact plug-in format/version and ordered position;
- let the user choose base template, target tracks and preset/state;
- persist acceptance/rejection as a durable override;
- produce a deterministic, auditable recipe without changing Live.

### Slice 3 — guided Live-owned builder

- duplicate/open a candidate in compatible Live;
- apply only explicit approved operations with Accessibility permission;
- stop on uncertainty and require visible user verification;
- have Live save the new Template Set;
- reopen and validate before promotion/default selection.

### Later experiment — native-only LOM builder

Prototype Live 12.3+ native-device insertion through the Live Object Model for templates that use only Ableton devices. Keep it separate from third-party plug-in recipes and from the Save as Template step.

## Final answer

**Yes:** we can build a useful, dependable Template Manager with safe CRUD for user templates, immutable browsing/duplication for factory and Pack templates, version history, dependency checks and evidence-driven improvement suggestions.

**Not yet as an unattended promise:** adding Pro-Q 4 to arbitrary templates automatically. The supported API cannot insert it, and its binary state can only be written by the plug-in. The production-safe design is to recommend the change, build a reviewable recipe, work on a duplicate, and make Live/plugin own the final serialization and validation.
