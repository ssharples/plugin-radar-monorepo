import Foundation

public struct SampleUsageAggregator: @unchecked Sendable {
  private let fileManager: FileManager
  private let metadataReader: SampleMetadataReader

  public init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
    metadataReader = SampleMetadataReader()
  }

  func aggregate(
    indexes: [StudioLibraryIndex],
    sampleIDsByPath: [String: String],
    worksBySessionID: [String: LogicalWorkIdentity] = [:]
  ) -> SampleUsageAggregation {
    let projectRoots = indexes.flatMap(\.projects).map(\.rootURL)
    var occurrences: [SampleUsageOccurrence] = []
    var seedsByPath: [String: SampleResourceSeed] = [:]

    for index in indexes {
      for project in index.projects {
        let work = worksBySessionID[project.id]
        for timeline in project.timelines {
          for set in timeline.versions {
            for track in set.content.tracks {
              for clip in track.clips where clip.kind == .audio {
                guard let reference = clip.sampleReference else { continue }
                let dependency =
                  set.content.dependencies.first {
                    $0.kind == .clipAudio && $0.ownerID == clip.id && $0.reference == reference
                  }
                  ?? set.content.dependencies.first {
                    $0.kind == .clipAudio && $0.ownerID == clip.id
                  }
                let candidateURL =
                  dependency?.resolvedURL
                  ?? reference.absolutePath.map(URL.init(fileURLWithPath:))
                  ?? reference.relativePath.map { project.rootURL.appending(path: $0) }
                guard let candidateURL else { continue }
                let canonicalURL = candidateURL.resolvingSymlinksInPath().standardizedFileURL
                let path = canonicalURL.path
                let sampleID = sampleIDsByPath[path] ?? StableID.forValue("sample:\(path)")
                if sampleIDsByPath[path] == nil, seedsByPath[path] == nil {
                  let available = fileManager.fileExists(atPath: path)
                  let metadata =
                    available
                    ? ((try? metadataReader.read(canonicalURL))
                      ?? metadataReader.missing(format: canonicalURL.pathExtension))
                    : metadataReader.missing(format: canonicalURL.pathExtension)
                  let classification =
                    available
                    ? SamplePathClassifier.classify(
                      canonicalURL, projectRoots: projectRoots, selectedLocation: nil)
                    : (
                      .missingReference,
                      "Parsed Ableton clip reference does not currently resolve to a readable local file."
                    )
                  seedsByPath[path] = SampleResourceSeed(
                    fileURL: canonicalURL, name: canonicalURL.lastPathComponent,
                    locationName: "Referenced by Set",
                    packName: canonicalURL.deletingLastPathComponent().lastPathComponent,
                    classification: classification.0,
                    classificationExplanation: classification.1,
                    availability: available
                      ? .available
                      : (dependency?.availability == .disconnected ? .disconnected : .missing),
                    metadata: metadata)
                }
                occurrences.append(
                  SampleUsageOccurrence(
                    id: StableID.forValue(
                      "sample-use:\(set.id):\(track.id):\(clip.id):\(sampleID)"),
                    sampleID: sampleID, workID: work?.id, workName: work?.displayName,
                    sessionID: project.id, sessionName: project.displayName,
                    timelineID: timeline.id, setID: set.id, setName: set.displayName,
                    setURL: set.fileURL, setModifiedAt: set.modifiedAt,
                    trackID: track.id, trackName: track.name, clipID: clip.id,
                    clipName: clip.name, placement: clip.placement, isWarped: clip.isWarped,
                    warpMode: clip.warpMode, warpMarkerCount: clip.warpMarkerCount,
                    deviceChain: track.devices))
              }
            }
          }
        }
      }
    }
    return SampleUsageAggregation(
      occurrences: occurrences, referencedSamples: Array(seedsByPath.values))
  }
}
