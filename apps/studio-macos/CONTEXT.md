# Studio Time Machine

Studio Time Machine is a local-first catalogue of a producer's physical DAW files and the creative identities that connect them across folders and time.

## Language

**Tracked Root**:
A user-selected directory that grants the app permission to observe and index files. It is a source location, not an artist or a Work.

**Artist/Client**:
The durable person or organisation identity associated with one or more Works. It can be inferred
from paths or explicitly created and assigned by the user.
_Avoid_: Root, folder, project

**Work**:
The durable creative identity of a song or production, spanning folders, Sessions, exports, drives, and years.
_Avoid_: Project

**Collection**:
A virtual grouping used to browse Works inside Studio Time Machine. It never implies a physical
folder move or a change to source music.
_Avoid_: Folder, directory

**Session**:
A physical DAW project folder representing a coherent editing or production phase of a Work.
_Avoid_: Work, project

**Set Revision**:
One Ableton `.als` file retained as a specific save in a Session's history.
_Avoid_: Project, version when referring to a folder

**Variant**:
A named form of the same Work intended for a particular content or use case, such as Clean Edit, Explicit, Instrumental, Acapella, Radio Edit, or Extended. A Variant does not create a separate Work by itself.
_Avoid_: Version, separate Song

**Variant Lineage**:
The ordered history of Set Revisions and Artifacts belonging to one Variant of a Work. It may originate from a Set Revision in another Variant and continue with its own revision identifiers.
_Avoid_: Separate Work, physical folder, Git branch

**Revision Identifier**:
A user-authored version token scoped to its Variant Lineage, such as `1.2` in `idea005_clean_1.2`. It helps order related revisions but does not prove chronology or imply how many earlier revisions exist.
_Avoid_: Global Work version, verified sequence

**Revision Qualifier**:
An evidence-backed descriptor attached to a Set Revision, Session, or Artifact, inferred from its filename or surrounding context. A filename-derived qualifier is a suggestion, not verification of the underlying audio content.
_Avoid_: Proven fact, category

**Content Trait**:
A claim about what the media actually contains, such as language being clean. It is Verified only through an explicit user decision or a separately identified content-analysis process, never from a filename alone.
_Avoid_: Filename label

**Artifact**:
Audio produced, recorded, imported, or collected during studio work, such as a mix, master, stem, vocal print, or raw recording.

**Content Asset**:
The logical identity of one audio payload across one or more physical locations. Exact byte or
decoded-audio evidence may unite locations under one Content Asset, while provenance and every
Finder path remain visible.
_Avoid_: File, duplicate to delete, historical source

**Evidence Link**:
A typed, scored, explainable relationship between studio objects whose provenance records how the relationship was inferred.

**Content Lineage**:
Evidence that one Session evolved from another, derived from distinctive shared media and DAW structure rather than filenames alone. It connects Sessions to a Work; it does not mean that two files or Sessions are duplicates.
_Avoid_: Audio match, duplicate score

**Content Anchor**:
A distinctive creative element that supports Content Lineage, such as an exact project recording, derived project audio, MIDI phrase, or clip placement. Common library samples and template structure are weak or excluded anchors.
_Avoid_: Shared file

**Duplicate Location**:
A second physical location containing the same Session evidence, usually created by copying or adoption. It is location lineage, not a new Session or Work.
_Avoid_: Related Session

**Review Candidate**:
A plausible relationship that remains separate until the user confirms or rejects it.

**Override**:
A durable user decision that constrains organisation on future rescans and resolver upgrades.

**Assignment**:
A user-confirmed relationship connecting a physical Session to a Work. Assignments outrank inferred
folder and filename evidence and survive rescans while the Session retains its identity.
_Avoid_: Move, relocate

**Reviewed Revision Reference**:
An immutable snapshot linking one Set Revision to its containing Session and current Work, together
with the tracked source location, indexed Set observation, and reviewed display labels. Later Work
regrouping or changed Set evidence makes the reference stale and requires explicit review; it is
never silently reinterpreted.
_Avoid_: Raw Work ID, path bookmark, permanent grouping
