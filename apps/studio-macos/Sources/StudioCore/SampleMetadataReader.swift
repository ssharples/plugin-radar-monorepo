import AudioToolbox
import Foundation

struct SampleMetadataReader: Sendable {
  func read(_ fileURL: URL) throws -> SampleTechnicalMetadata {
    let values = try fileURL.resourceValues(forKeys: [
      .fileSizeKey, .creationDateKey, .contentModificationDateKey,
      .fileResourceIdentifierKey, .isRegularFileKey,
    ])
    guard values.isRegularFile == true else { throw CocoaError(.fileReadUnsupportedScheme) }

    var duration: Double?
    var sampleRate: Double?
    var bitDepth: Int?
    var channels: Int?
    var audioFile: AudioFileID?
    if AudioFileOpenURL(fileURL as CFURL, .readPermission, 0, &audioFile) == noErr,
      let audioFile
    {
      defer { AudioFileClose(audioFile) }
      var format = AudioStreamBasicDescription()
      var formatSize = UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
      if AudioFileGetProperty(audioFile, kAudioFilePropertyDataFormat, &formatSize, &format)
        == noErr
      {
        sampleRate = format.mSampleRate > 0 ? format.mSampleRate : nil
        channels = format.mChannelsPerFrame > 0 ? Int(format.mChannelsPerFrame) : nil
        bitDepth = format.mBitsPerChannel > 0 ? Int(format.mBitsPerChannel) : nil
      }
      var estimatedDuration = 0.0
      var durationSize = UInt32(MemoryLayout<Double>.size)
      if AudioFileGetProperty(
        audioFile, kAudioFilePropertyEstimatedDuration, &durationSize, &estimatedDuration) == noErr,
        estimatedDuration.isFinite, estimatedDuration >= 0
      {
        duration = estimatedDuration
      }
    }

    return SampleTechnicalMetadata(
      format: fileURL.pathExtension.lowercased(),
      bytes: Int64(values.fileSize ?? 0),
      durationSeconds: duration,
      sampleRate: sampleRate,
      bitDepth: bitDepth,
      channelCount: channels,
      createdAt: values.creationDate,
      modifiedAt: values.contentModificationDate,
      fileResourceIdentifier: values.fileResourceIdentifier.map { String(describing: $0) }
    )
  }

  func missing(format: String) -> SampleTechnicalMetadata {
    SampleTechnicalMetadata(
      format: format.lowercased(), bytes: 0, durationSeconds: nil, sampleRate: nil,
      bitDepth: nil, channelCount: nil, createdAt: nil, modifiedAt: nil,
      fileResourceIdentifier: nil)
  }
}

enum SamplePathClassifier {
  static func classify(
    _ fileURL: URL,
    projectRoots: [URL],
    selectedLocation: URL?
  ) -> (SampleClassification, String) {
    let path = fileURL.standardizedFileURL.path
    let projectRoot =
      projectRoots
      .filter {
        path == $0.standardizedFileURL.path || path.hasPrefix($0.standardizedFileURL.path + "/")
      }
      .max { $0.path.count < $1.path.count }
    if projectRoot != nil {
      let lower = path.lowercased()
      if lower.contains("/samples/recorded/") {
        return (
          .projectRecorded,
          "Inside Ableton Samples/Recorded; this is project-contained audio, not proven external provenance."
        )
      }
      if lower.contains("/samples/imported/") {
        return (
          .projectImported,
          "Inside Ableton Samples/Imported; Collect All and Save is possible but not proven without a source match."
        )
      }
      if lower.contains("/samples/collected/") {
        return (
          .projectImported,
          "Inside Ableton Samples/Collected; this is a likely collected project copy, but external provenance remains unverified until content identity matches."
        )
      }
      if lower.contains("/samples/processed/") {
        return (
          .projectProcessed,
          "Inside Ableton Samples/Processed; this is an Ableton-created project copy or render."
        )
      }
      return (
        .looseUnassigned,
        "Inside a physical project Session without stronger Recorded, Imported, or Processed folder evidence."
      )
    }
    if selectedLocation != nil {
      return (
        .externalLibraryOriginal,
        "Resource in a user-selected sample library outside recognised project Sessions; 'original' describes location, not historical provenance."
      )
    }
    return (
      .looseUnassigned,
      "Referenced local audio outside the selected sample locations and recognised project Sessions."
    )
  }
}
