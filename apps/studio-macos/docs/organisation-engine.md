# Phase 1 organisation engine

`WorkCatalogResolver` derives a logical studio catalogue without changing the physical
`StudioLibraryIndex`. Its public interface is deliberately small:

```swift
let overrides = try await OrganisationOverrideStore(storageURL: overrideURL).load()
let catalog = WorkCatalogResolver().resolve(indexes: indexes, overrides: overrides)
```

The catalogue uses the domain sequence **Artist/Client → Work → Session → Set Revision**.
Every Session retains its physical URL, every Set retains its raw file URL, and every inferred
relationship includes human-readable evidence. Unknown-owner Sessions do not merge. Similar
titles enter `reviewQueue`; only exact deterministic matches with the same owner auto-organise.

The resolver currently understands the `Engineering/<artist>/...` convention automatically.
It also recognises that convention below a broader tracked root such as `Music/Engineering/<artist>`.
Other roots can supply explicit `RootOwnerConvention` values.

## Manual organisation for messy libraries

Libraries without reliable Artist folders remain conservative: matching titles with an unknown
owner do not merge automatically. The user can create or choose a durable Artist, create or choose a
Song/Work beneath that Artist, and assign any physical Session to it. These are virtual relationships;
Studio Time Machine never moves or renames the source project folder.

`StudioOrganisationStore` persists three independent record collections atomically in
`studio-organisation.plist`:

- Artist records, reused by the Artist combo selection;
- Work records linked to an Artist;
- explicit Session-to-Work assignments.

Assignments outrank inferred path and filename evidence. Legacy resolver decisions remain supported
through `OrganisationOverrideStore` and `organisation-overrides.plist`.

The Studio Library presents Works rather than physical project folders. Opening a Work reveals every
related physical Session, its path, role, artifacts, and chronological Set Revisions.

## Filename semantics and Revision Qualifiers

Raw Set, project, and export filenames remain evidence. The typed filename parser splits
the creative identity from version counters, dates, Session roles, Variants, workflow states, and
delivery descriptors without discarding the original name. For example, `idea005_clean.als` can
suggest the Variant **Clean Edit**, but it cannot verify that the audio contains no explicit language.

Recognised qualifiers support organisation and display; they do not create a separate Work by
themselves. Exact suffix tokens, sibling pairs such as `clean`/`explicit`, compatible Session role,
and Content Lineage may raise confidence. Ambiguous tokens remain suggestions, and accepted or
rejected user decisions persist across rescans and parser upgrades.

Variants have independent lineages within the same Work. For example, `idea005_clean_1.2.als`
suggests the **Clean Edit** Variant and Revision Identifier `1.2`; the identifier is scoped to the
Clean Variant rather than the Work's main revision sequence. When evidence permits, the catalogue
also records the main or alternate revision from which the Variant was derived. This relationship
supports a compact main timeline with expandable Variant lanes without treating a Variant as a
separate Song. Filename numbering is naming evidence, not authoritative chronology; timestamps,
content evidence, DAW metadata, and user corrections remain available when ordering conflicts.

The parser's qualifier decisions are stored as durable accept/reject overrides. `VariantLineageBuilder`
then creates independent Main, Clean Edit, Explicit, Instrumental, Acapella, Radio Edit, Extended,
or custom lanes and can retain an evidence-backed branch origin without pretending the Finder tree is
a Git repository.

## Corpus report

The CLI can derive a Markdown report from an existing parent cache without rescanning or
rewriting it:

```sh
swift run studio-index /path/to/report/scope \
  --cache /path/to/index-cache.plist \
  --cached-only \
  --organisation-report /path/to/report.md
```

The report includes every Work, physical Session, Set Revision, timestamp source, evidence
summary, and medium-confidence review candidate. `--organisation-json` emits the full Codable
catalogue instead.
