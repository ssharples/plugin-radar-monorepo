# Content Intelligence and Portability

This specification turns the Firecrawl Research Index findings into implementable Studio Time
Machine features. It extends `audio-identity-lineage.md`, `organisation-engine.md`,
`export-detection-and-delivery.md`, and `ableton-project-handoff.md`; it does not replace their
identity, provenance, or source-safety contracts.

## Product outcome

Studio Time Machine should automate messy studio-file management while remaining able to explain
every relationship:

- recognise when a larger Session evolved from a smaller Session even when their names disagree;
- distinguish an exact copy, the same recording, an excerpt, a transformed sample, and broad musical
  similarity;
- connect masters and stems to the Set revision that produced them using audio-container evidence;
- represent DAW projects through one adapter-neutral model without claiming unsupported round trips;
- audit an Ableton Project before managed-library migration or recipient handoff; and
- turn user review decisions into local calibration evidence without uploading private music.

## Non-negotiable evidence semantics

One score must never collapse the following meanings:

| Evidence tier | Meaning | Permitted consequence |
| --- | --- | --- |
| Verified identity | Complete byte or canonical decoded-PCM identity | Unite physical locations; unique recovery candidate |
| Same recording | Re-encode or near-identical recording evidence | Reversible family link after policy validation |
| Contains excerpt | Located segment of one recording inside another | Reversible derivative/usage link with time range |
| Probable transformed use | Pitch/time/effect/chop-tolerant similarity | Review suggestion only until corpus calibration permits more |
| Musically related | Version/semantic embedding similarity | Candidate discovery only |
| Unknown | Evidence is absent, ambiguous, stale, or conflicting | Abstain |

No similarity tier may establish file identity, authorise deletion, silently move files, rewrite a
Set, or relabel a user-reviewed Song. Every algorithm and calibration version must persist alongside
its observation. User assignments, separations, and rejections remain authoritative.

## Feature 1: Directional Session containment

### Why

Symmetric similarity penalises differently sized Sessions. A later production may retain nearly all
of an earlier idea while adding vocals, resampling, stems, or new recorded material. The useful
questions are directional:

```text
containment(A -> B) = distinctive material from A found in B / distinctive material in A
containment(B -> A) = distinctive material from B found in A / distinctive material in B
```

### Model

Add a versioned `DirectionalSessionContainmentObservation` containing:

- source and candidate `StudioRevisionReference` values;
- the algorithm family/version and optional calibration ID;
- both directional scores;
- weighted intersection and denominator totals;
- matched anchors grouped by independent evidence family;
- common/corpus-frequency-suppressed anchors;
- exact, PCM, excerpt, placement, MIDI-structure, and arrangement evidence counts;
- runner-up margin, chronology compatibility, Artist compatibility, and conflicts; and
- a human-readable explanation suitable for review UI.

For anchor `x`, start with an inverse-corpus-frequency weight such as:

```text
weight(x) = confidence(x) * log((sessionCount + 1) / (sessionsContaining(x) + 1))
```

The formula is an implementation prior, not a shipped threshold. Exact scores and thresholds must be
benchmarked against a labelled local fixture corpus before authorising automatic attachment.

### Interpretation

- high A -> B and high B -> A: probable copy or duplicate Session;
- high older -> newer and materially lower newer -> older: probable evolved lineage;
- isolated rare excerpt evidence: possible derivative use, not Session identity;
- evidence dominated by common library material: abstain;
- Artist conflict, close runner-up, weak-to-weak cycle, or stale reference: review or abstain.

### Scale strategy

Use weighted/asymmetric MinHash sketches only to generate a bounded candidate set. Recompute exact
weighted containment and all safety gates before persisting a suggestion. Persist sketches by
algorithm version and invalidate them when the underlying manifest observation changes.

### UI

Expose suggestions in the existing organisation review flow:

- “Likely evolved from …” for directional lineage;
- “Possible duplicate Session” when both directions are high;
- both scores and the distinctive matched material behind progressive disclosure;
- Accept, Keep separate, Assign elsewhere, and Reject actions; and
- no automatic attachment while production calibration is unavailable.

### Acceptance tests

- small Session largely contained in a larger later Session;
- exact copies with different paths;
- common sample pack producing no match;
- one rare shared sample remaining derivative-only;
- Artist conflict and close runner-up;
- direction reversal and chronology conflict;
- manual assignment, `keepSeparate`, and rejection authority;
- stale Set observation and cross-instance authority changes; and
- sketch candidate generation returning the same final decisions as exact bounded comparison.

## Feature 2: Layered audio matching

### 2A. Near-identical recording fingerprint

Add a compact local fingerprint engine for re-encodes and near-identical full recordings. Chromaprint
is a useful benchmark and possible implementation dependency, but its documented scope is
near-identical audio rather than general similarity.

- Store the engine/version, duration covered, fingerprint digest, and source observation.
- Require duration/sequence consistency rather than treating a hash collision as proof.
- Return `sameRecordingCandidate`; never silently promote it to verified PCM identity.
- Benchmark WAV/AIFF/FLAC conversions, gain changes, channel changes, leading silence, and unrelated
  same-duration audio.

### 2B. High-specific excerpt retrieval

Extend the local landmark engine with an optional compact embedding backend for distorted excerpts:

- start validation with one-second windows and 0.5-second hops;
- aggregate consecutive, offset-consistent matches across a five-to-ten-second query;
- return candidate source, query and reference ranges, offset consistency, score distribution, and
  runner-up margin;
- use a local approximate-nearest-neighbour index only for candidate retrieval; and
- verify the final sequence against the current immutable file observations.

The research values are experimental priors, not product thresholds. The implementation must report
coverage and false-positive behaviour on the Studio corpus before enabling production decisions.

### 2C. Transformed sample lab

Implement behind an unavailable-by-default capability flag:

- five-second analysis windows with overlapping hops;
- test pitch shifts, microtonal shifts, time stretch, EQ, compression, gain, filtering, bitcrush,
  delay, distortion, reverb, silence, duplication, removal, reversal, and chopping;
- retain the located time ranges and transformation hypotheses;
- separate directly reused audio from possible interpolation/re-performance; and
- surface only “Possible transformed use” during the research phase.

Activation requires a labelled real producer corpus, held-out Artist/Song splits, precision/recall
and calibration reports, model/licence review, bounded on-device resource use, and a reviewed false
positive budget. Synthetic augmentation alone is insufficient.

### 2D. Musical-version discovery

Whole-recording or segment-level version embeddings may find alternate bounces, performances, or
old exports hidden under unrelated names. They are never a primary Session-to-Song authority.

- Keep this index separate from identity and excerpt indexes.
- Use it as a recall layer after deterministic search.
- Label results “Musically related”; require manual confirmation.
- Store no cloud embedding unless the user explicitly opts in to a defined data boundary.

## Feature 3: Export DNA from BWF and iXML

### Why

WAV/BWF files may contain sample-accurate and production-specific evidence that is stronger than a
filename heuristic.

### Parser

Add a bounded read-only RIFF/RF64/BW64 metadata reader for:

- `bext`: originator, originator reference, origination date/time, 64-bit sample time reference,
  coding history, UMID, and loudness fields where present;
- `iXML`: project, scene, take, tape, note, track list/name/function, timecode and related production
  fields;
- `axml` and RIFF `INFO` as explicitly untrusted descriptive metadata; and
- container/sample-rate information needed to interpret time reference exactly.

Never assume AVFoundation exposes every chunk. Bound chunk sizes, reject integer overflow and invalid
offsets, and tolerate unknown chunks without loading the complete audio payload.

### Export association

Extend artifact association evidence with independent signals:

- immutable source file observation;
- BWF origination timestamp near the export event;
- sample time reference compatible with the reviewed arrangement range;
- duration/range agreement;
- iXML project/track labels compatible with the Set and stem names;
- export folder and filename evidence;
- exact or excerpt audio evidence; and
- expected track/file-count evidence from a reviewed export plan.

Embedded descriptive metadata alone is never verified provenance. A verified association still
requires an automation evidence binding or multiple independent, non-conflicting signals under a
calibrated policy.

### Sidecar manifest

Do not rewrite existing user audio. Packages created by Studio Time Machine include a deterministic
JSON sidecar that records the reviewed Set revision, export observation, association evidence,
checksums, relative paths, and application/algorithm versions.

### Acceptance tests

- valid BWF v0/v1/v2 fields and 64-bit time references;
- RF64/BW64, odd-sized chunks, unknown chunks, malformed lengths, and truncation;
- iXML multiple-track metadata and Unicode;
- metadata absent or contradictory;
- two plausible Set revisions remaining review-only;
- changed file at the same path invalidating evidence; and
- sidecar/report redaction of absolute paths and personal data.

## Feature 4: DAW-neutral project representation

Create a versioned internal `StudioProjectInterchange` inspired by DAWproject:

```text
Project identity and application provenance
  Musical timeline and tempo map
  Track hierarchy and routing evidence
  Clips, notes, placements, fades and warp evidence
  Automation
  Media references and Content Asset identities
  Devices, plug-in identifiers and state availability
  Markers/locators
  Export and handoff references
```

Each field carries `verified`, `parsed`, `derived`, `unsupported`, or `unknown` provenance. Adapters
must not invent defaults that look like source truth.

Initial scope:

1. map the current Ableton parser into this representation without losing existing fields;
2. map the read-only Logic adapter only for capabilities it can prove;
3. add deterministic JSON fixtures and adapter conformance tests;
4. evaluate optional `.dawproject` export as a separate capability; and
5. never claim Ableton round-trip fidelity, plug-in portability, or target-DAW support without an
   application-tested compatibility matrix.

This model is an adapter boundary, not a replacement for the physically truthful
`StudioLibraryIndex` or the reviewed `StudioRevisionReference` action boundary.

## Feature 5: Project boundary and portability audit

Run before `Copy into Studio Library`, Send Project, or Collect All and Save automation:

- resolve the intact DAW-owned Project leaf;
- detect nested or conflicting `Ableton Project Info` directories;
- classify every media reference as project-contained, external, missing, disconnected, symlink
  escaped, or unknown;
- inventory Ableton devices, Packs, Max for Live devices, third-party plug-ins, and managed libraries;
- detect cloud placeholders, removable volumes, unavailable permissions, source changes, and
  insufficient destination space;
- distinguish “contained on this Mac” from “portable to another Mac”; and
- produce Ready, Ready with limitations, or Needs attention with exact evidence.

The audit remains read-only. Remediation enters a separately reviewed staging plan, copies the whole
DAW Project leaf, uses never-overwrite, and verifies the promoted result. It never moves the original.

## Feature 6: Private calibration and review flywheel

User decisions become durable local labels:

- same Song / keep separate;
- duplicate Session / evolved Session / derivative use / unrelated;
- correct or incorrect export association;
- same recording / transformed use / false match; and
- accepted Artist, Variant, and branch relationship.

Store the input observation IDs, algorithm version, features needed to reproduce the decision,
decision time, and supersession history. Never store a decision against mutable paths alone.

Local evaluation should produce per-evidence-family precision, recall, calibration, abstention,
coverage, false-auto-attachment count, corpus partitions, and performance/resource measurements.
Any future anonymous aggregation is a separate opt-in product with data minimisation, revocation,
retention, and privacy review; it is not part of this implementation programme.

## Delivery sequence

### Wave A: deterministic value

1. Directional exact containment and review UI.
2. BWF/iXML parser and Export DNA evidence.
3. Project boundary audit extensions.

### Wave B: scale and interoperability

4. Asymmetric/weighted MinHash candidate sketches with exact-decision parity tests.
5. `StudioProjectInterchange` and Ableton adapter mapping.
6. Near-identical recording fingerprints.

### Wave C: research capabilities

7. High-specific excerpt embedding prototype.
8. Transformed sample lab and labelled-corpus evaluation.
9. Musical-version discovery prototype.

Do not begin a Wave C production integration until Wave A/B contracts and calibration storage pass
independent review.

## Verification contract

Every slice requires:

- focused unit and adversarial tests;
- persistence migration and cross-instance tests where state is durable;
- the complete `swift test` suite;
- release builds for `StudioTimeMachine` and `studio-index`;
- strict formatting and diff review;
- independent specification and quality review with no open Critical or Important findings;
- rendered macOS and Accessibility QA for UI changes using deterministic sample fixtures; and
- an explicit report separating implementation, simulated verification, real corpus validation,
  real Ableton/DAW qualification, packaging, and hosted-service status.

No test or implementation may modify indexed music, manipulate a real Ableton Set, create a real
export, upload audio, or send a package without fresh exact-step user approval.

## Research sources

- [Asymmetric Minwise Hashing](https://arxiv.org/abs/1411.3787)
- [DartMinHash: Fast Sketching for Weighted Sets](https://arxiv.org/abs/2005.11547)
- [Neural Audio Fingerprint for High-specific Audio Retrieval](https://arxiv.org/abs/2010.11910)
- [Automatic Identification of Samples in Hip-Hop Music](https://arxiv.org/abs/2502.06364)
- [Accurate and Scalable Version Identification Using Musically-Motivated Embeddings](https://arxiv.org/abs/1910.12551)
- [Less is more: Faster and better music version identification](https://arxiv.org/abs/2010.03284)
- [Chromaprint](https://github.com/acoustid/chromaprint)
- [DAWproject](https://github.com/bitwig/dawproject)
- [BWF MetaEdit](https://github.com/MediaArea/BWFMetaEdit)
- [iXML overview](https://github.com/CommandPost/FCPCafe/blob/main/docs/developers/ixml.md)
- [Live Set portability checks](https://github.com/mslinn/live_set)
