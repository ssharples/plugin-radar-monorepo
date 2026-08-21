# Ableton Live export automation foundation

## Product boundary

Studio Time Machine does not render an Ableton Set itself. The authoritative renderer remains the
user's installed Ableton Live. The app prepares a typed, reviewable `AbletonExportPlan`, confirms the
active Set through macOS Accessibility using its exposed document path when available, or a
constrained same-title fallback when Live exposes no path, configures Live's export UI through
semantic controls, and verifies the resulting audio. It never edits or saves the source `.als` file.

The initial versioned adapter is `ableton-live-12.4.2-ax-v1` and supports only Ableton Live 12.4.2.
An unknown or different version is an explicit stop, not a best-effort click sequence.

## Execution and safety gates

1. The user chooses a new destination and reviews the exact Set, revision/Work link, source, range,
   PCM format, sample rate, bit depth, normalization, effects policy, and output filename.
2. `AbletonExportPlanValidator` confirms that the Set and destination are available and that no
   expected output already exists. The only overwrite policy is `never`.
3. Accessibility preflight confirms permission, the running Live process and version, the active Set
   by exposed document path when available or the constrained same-title fallback, and that the Set
   has no unsaved changes. The fallback remains an explicit real-Live qualification limitation.
4. A fresh approval tied to the immutable plan ID is required to execute.
5. `AbletonAutomation` uses `AXUIElement` roles, identifiers, labels, values, and actions. There are no
   stored screen coordinates.
6. Any unexpected dialog—including licensing, recovery, missing plug-in, or overwrite UI—stops the
   state machine. It is not dismissed automatically.
7. The destination collision check runs again immediately before the save panel is submitted.
8. Completion requires the expected number of fresh, non-empty files with readable audio metadata
   matching the reviewed format, sample rate, and bit depth.
9. Verified evidence is appended atomically and links the output to the physical Set ID, revision ID,
   and logical Work when deterministic organisation evidence is available.

Cancellation asks the active semantic UI for a Cancel button and then stops. If a wait is interrupted,
the cancellation request is still attempted before the task exits.

## Computer-use recovery seam

`AbletonComputerUseFallback` is an intentionally disabled interface. Screenshot-driven control is not
the primary executor and is not automatically entered after an AX failure. A future implementation
must require a separate user choice, explicit screenshot consent, and Ableton-window-only capture.

No provider key or credential is embedded in the app, source, configuration, or evidence store. If a
future recovery provider uses bring-your-own-key credentials, the implementation must use a dedicated
macOS Keychain service scoped to the stable app bundle identifier. Secrets must never be written to
UserDefaults, logs, screenshots, export plans, evidence plists, or the indexed music database.

## Packaging and distribution

The current `script/build_and_run.sh` output is a local development artifact. It uses ad-hoc signing
and is **not distribution ready**.

The shipping app needs:

- a stable Developer ID Application identity, team, bundle identifier, and designated requirement;
- Hardened Runtime enabled at signing time;
- signing of every nested executable before the outer app, then strict signature verification;
- a zipped or installer artifact submitted to Apple's notary service and stapled after acceptance;
- a clean-machine Gatekeeper launch test and a clean Accessibility onboarding test;
- release automation that preserves the stable code identity so macOS TCC permission does not appear
  to belong to a different application after every build.

The macOS App Sandbox is deliberately not part of this architecture. Driving another application's UI
through Accessibility and indexing arbitrary user-selected studio folders is incompatible with the
intended sandbox boundary. Distribution should therefore use Developer ID outside the Mac App Store.
Security still relies on user-granted folder bookmarks, Accessibility TCC permission, a narrow
AX-only executor, and strict reviewed plans.

No kernel extension, system extension, privileged helper, launch daemon, audio driver, virtual device,
or installer-time root access is required or planned.

## Verification ladder

- **Simulated:** fake semantic AX trees cover normal export, unexpected dialog, unsaved Set, missing
  permission, unsupported version, collision, cancellation, and output verification.
- **Controlled real QA:** use only a copied/disposable Set fixture and a new empty destination. First
  inspect the running Live state. Stop if another Set is open, unsaved state cannot be ruled out, or an
  unexpected prompt appears. Record the exact fixture, settings, destination, adapter observations,
  and output evidence.
- **Release:** repeat on a clean supported macOS account using the notarized Developer ID build.

Real Live QA is adapter qualification, not permission to broaden support. If Live 12.4.2 exposes a
control differently from the fake contract, update the 12.4.2 adapter and its captured semantic-tree
fixture; do not fall back to coordinates.
