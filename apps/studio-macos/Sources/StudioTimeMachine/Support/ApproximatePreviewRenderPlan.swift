import Foundation
import StudioCore

struct ApproximatePreviewRenderPlan: Identifiable {
  let id = UUID()
  let setName: String
  let dryPlan: DryPreviewPlan
  let destinationURL: URL
}
