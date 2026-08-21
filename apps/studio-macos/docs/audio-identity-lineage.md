# Audio Identity and Lineage Graph

Studio Time Machine models audio identity separately from creative similarity. Every decision is
local, versioned, explainable, and non-destructive.

## Shipped foundation

- `AudioContentIdentityService` computes complete SHA-256 identity and a versioned canonical decoded
  PCM identity without resampling, normalising, or downmixing.
- `AudioLineageStore` persists one logical Content Asset with every physical Finder location and its
  provenance.
- `SampleCopyMatcher` stages candidate work, verifies complete hashes, classifies verified
  `Samples/Collected` copies, and registers both external and project-local locations. Same-size files
  are never treated as identical before full verification.
- `ExactAudioRecoveryResolver` preselects a missing-file replacement only when one available location
  shares the previously indexed verified Content Asset identity. Multiple exact locations remain a
  review choice and no `.als` is rewritten.
- `LocalLandmarkAudioMatcher` finds exact excerpts inside longer local audio and records the matching
  time ranges. `AudioMatchingCoordinator` persists proposals and applies the confidence policy.
- `SessionContentLineageResolver` combines independent content-anchor evidence with chronology and
  durable user rejections. Automatic attachment requires a labelled calibration profile, two anchors,
  two evidence kinds, no explicit conflict, and a safe runner-up margin.
- `AudioArtifactLinker` proposes masters, stems, and bounces against Set revisions using multi-signal
  evidence. `VariantLineageBuilder` keeps Main and alternate histories separate.

## Confidence policy

Exact byte or complete decoded-PCM identity may unite locations and preselect one unique recovery
candidate. It never authorises deletion. Calibrated high-confidence derivative and Session-lineage
evidence may create reversible links. Uncalibrated, semantic, ambiguous, or conflicting evidence is a
review suggestion or abstention. Move, delete, and DAW-project rewrite actions are never granted by
the policy.

## Deliberately unavailable engines

The production matcher registry exposes transformation-tolerant and semantic/source-separated
capabilities as unavailable instead of silently degrading. They require a labelled-corpus benchmark,
commercial licensing and model-rights review before activation. The local landmark engine is the only
approximate matcher enabled today; semantic resemblance can never establish identity.
