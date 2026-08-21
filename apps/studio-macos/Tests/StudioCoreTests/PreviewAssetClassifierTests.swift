import Foundation
import Testing

@testable import StudioCore

@Suite("Preview asset classifier")
struct PreviewAssetClassifierTests {
  @Test(
    "Classifies Ableton sample provenance",
    arguments: [
      ("Samples/Processed/Freeze/Audio.wav", PreviewAssetCategory.freeze),
      ("Samples/Processed/Consolidate/Audio.wav", PreviewAssetCategory.consolidated),
      ("Samples/Processed/Crop/Audio.wav", PreviewAssetCategory.crop),
      ("Samples/Processed/Reverse/Audio.wav", PreviewAssetCategory.reversed),
      ("Samples/Recorded/Audio.wav", PreviewAssetCategory.recorded),
      ("Samples/Imported/Audio.wav", PreviewAssetCategory.imported),
      ("Exports/Audio.wav", PreviewAssetCategory.otherAudio),
    ]
  )
  func classifiesProvenance(path: String, expected: PreviewAssetCategory) {
    let result = PreviewAssetClassifier.classification(
      for: URL(fileURLWithPath: "/Project/\(path)")
    )

    #expect(result.category == expected)
  }

  @Test("Tracks likely user renders independently from provenance")
  func detectsLikelyRender() {
    let result = PreviewAssetClassifier.classification(
      for: URL(fileURLWithPath: "/Project/Samples/Recorded/Final mix.wav")
    )

    #expect(result.category == .recorded)
    #expect(result.isLikelyUserRender)
  }

  @Test("Treats audio inside a stems folder as a likely user render")
  func detectsStemFolder() {
    let result = PreviewAssetClassifier.classification(
      for: URL(fileURLWithPath: "/Project/Exports/Stems/Kick.wav")
    )

    #expect(result.category == .otherAudio)
    #expect(result.isLikelyUserRender)
  }
}
