import AppKit
import SwiftUI

enum StudioBrandAssets {
  static let mark = image(named: "StudioMarkWhite", pointSize: NSSize(width: 38, height: 24))
  static let appIcon = image(named: "StudioAppIcon1024")

  private static func image(named name: String, pointSize: NSSize? = nil) -> NSImage {
    let url = Bundle.main.url(
      forResource: name,
      withExtension: "png",
      subdirectory: "Brand")
      ?? Bundle.module.url(
        forResource: name,
        withExtension: "png",
        subdirectory: "Brand")
    guard
      let url,
      let image = NSImage(contentsOf: url)
    else {
      assertionFailure("Missing packaged brand asset: \(name).png")
      return NSImage()
    }
    if let pointSize { image.size = pointSize }
    return image
  }
}

struct StudioBrandMark: View {
  var body: some View {
    Image(nsImage: StudioBrandAssets.mark)
      .accessibilityLabel("Studio")
  }
}
