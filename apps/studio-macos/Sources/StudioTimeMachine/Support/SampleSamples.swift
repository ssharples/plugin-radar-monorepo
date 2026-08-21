import Foundation
import StudioCore

enum SampleSamples {
  struct Fixture {
    let rows: [SampleListRow]
    let locations: [SampleLocation]
    let occurrences: [SampleUsageOccurrence]
    let reviews: [SampleMatchReview]
    let verifiedReviews: [SampleMatchReview]
  }

  static func make(project: StudioProject, playableSampleURL: URL? = nil) -> Fixture {
    let now = Date(timeIntervalSince1970: 1_786_464_000)
    let locationURL = URL(fileURLWithPath: "/Volumes/Fixture Studio Samples", isDirectory: true)
    let kickURL = playableSampleURL
      ?? locationURL.appendingPathComponent("Night Circuit/Drums/NC Kick 17.wav")
    let textureURL = locationURL.appendingPathComponent("Field Archive/Metal Hall.aif")
    let collectedURL = project.rootURL.appendingPathComponent("Samples/Imported/NC Kick 17.wav")
    let metadata = SampleTechnicalMetadata(
      format: "wav", bytes: 1_842_240, durationSeconds: 1.74, sampleRate: 48_000,
      bitDepth: 24, channelCount: 1, createdAt: now.addingTimeInterval(-5_000_000),
      modifiedAt: now.addingTimeInterval(-2_000_000), fileResourceIdentifier: "sample-kick")
    let rows = [
      SampleListRow(
        id: "sample-kick", fileURL: kickURL, name: kickURL.lastPathComponent,
        locationName: "Studio Samples", packName: "Night Circuit",
        classification: .externalLibraryOriginal,
        classificationExplanation:
          "Selected external-library resource; historical originality is not claimed.",
        availability: .available, metadata: metadata, workCount: nil, sessionCount: 2,
        setCount: 4, occurrenceCount: 7, lastUsedAt: now.addingTimeInterval(-86_400)),
      SampleListRow(
        id: "sample-texture", fileURL: textureURL, name: textureURL.lastPathComponent,
        locationName: "Studio Samples", packName: "Field Archive",
        classification: .externalLibraryOriginal,
        classificationExplanation:
          "Selected external-library resource; historical originality is not claimed.",
        availability: .unavailable,
        metadata: SampleTechnicalMetadata(
          format: "aif", bytes: 18_430_000, durationSeconds: 19.2, sampleRate: 44_100,
          bitDepth: 24, channelCount: 2, createdAt: nil,
          modifiedAt: now.addingTimeInterval(-900_000),
          fileResourceIdentifier: nil),
        workCount: 0, sessionCount: 0, setCount: 0, occurrenceCount: 0, lastUsedAt: nil),
      SampleListRow(
        id: "sample-collected", fileURL: collectedURL, name: collectedURL.lastPathComponent,
        locationName: "Engineering", packName: "Halogen Sky",
        classification: .collectedProjectCopy,
        classificationExplanation:
          "Verified exact duplicate of an external library resource; this project copy is linked without claiming the external file was the historical source.",
        availability: .available, metadata: metadata, workCount: nil, sessionCount: 1,
        setCount: 2, occurrenceCount: 3, lastUsedAt: now.addingTimeInterval(-172_800)),
    ]

    let set = project.sets[0]
    let track = set.content.tracks[0]
    let clip = track.clips[0]
    let occurrence = SampleUsageOccurrence(
      id: "sample-occurrence", sampleID: "sample-kick", workID: nil, workName: nil,
      sessionID: project.id, sessionName: project.displayName,
      timelineID: project.timelines[0].id, setID: set.id, setName: set.displayName,
      setURL: set.fileURL, setModifiedAt: set.modifiedAt, trackID: track.id,
      trackName: track.name, clipID: clip.id, clipName: clip.name,
      placement: clip.placement, isWarped: clip.isWarped, warpMode: clip.warpMode,
      warpMarkerCount: clip.warpMarkerCount, deviceChain: track.devices)
    let possible = SampleMatchReview(
      evidence: SampleFamilyEvidence(
        id: "sample-possible-source", sourceSampleID: "sample-kick",
        targetSampleID: "sample-collected", relationship: .possibleSourceOf,
        score: 0.35, tier: .filenameFolderTimeSimilarity,
        explanation:
          "Same filename and byte size. Candidate only until content verification succeeds.",
        algorithmVersion: "samples-copy-v1"),
      candidateName: collectedURL.lastPathComponent, candidateURL: collectedURL,
      candidateClassification: .projectImported)
    let exact = SampleMatchReview(
      evidence: SampleFamilyEvidence(
        id: "sample-exact-duplicate", sourceSampleID: "sample-kick",
        targetSampleID: "sample-collected", relationship: .exactDuplicateOf,
        score: 1, tier: .stagedExactHash,
        explanation: "Quick digests matched and full SHA-256 verified identical file bytes.",
        algorithmVersion: "samples-copy-v1"),
      candidateName: collectedURL.lastPathComponent, candidateURL: collectedURL,
      candidateClassification: .collectedProjectCopy)
    return Fixture(
      rows: rows,
      locations: [
        SampleLocation(
          id: "sample-location", fileURL: locationURL, displayName: "Studio Samples",
          availability: .available, requiresBookmarkRefresh: false,
          lastScannedAt: now, sampleCount: 2)
      ],
      occurrences: [occurrence], reviews: [possible], verifiedReviews: [exact])
  }
}
