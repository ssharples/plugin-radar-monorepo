import AppKit
import StudioCore
import SwiftUI

extension Notification.Name {
  static let focusStudioSearch = Notification.Name("StudioTimeMachine.focusStudioSearch")
}

struct LibraryRootView: View {
  @Bindable var store: StudioLibraryStore

  var body: some View {
    ZStack {
      StudioAccessibilityIsolationHost(
        isAccessibilityHidden: store.globalSearchPresented
      ) {
        studioShell
      }

      if store.globalSearchPresented {
        StudioGlobalSearchOverlay(store: store)
          .zIndex(20)
      }
    }
    .ignoresSafeArea()
    .inspector(isPresented: inspectorIsPresented) {
      StudioInspectorView(store: store)
        .inspectorColumnWidth(min: 260, ideal: 310, max: 380)
    }
    .tint(.black)
    .onReceive(NotificationCenter.default.publisher(for: .focusStudioSearch)) { _ in
      store.presentGlobalSearch()
    }
    .sheet(isPresented: $store.issueSheetPresented) {
      IndexIssuesView(issues: store.library?.issues ?? [])
    }
    .sheet(isPresented: $store.snapshotSheetPresented) {
      SnapshotHistoryView(store: store)
    }
    .sheet(item: $store.restorePlan) { plan in
      RestorePlanReviewView(plan: plan, store: store)
    }
    .sheet(item: $store.audioRecoveryPlan) { plan in
      AudioRecoveryPlanReviewView(plan: plan, store: store)
    }
    .sheet(item: $store.approximatePreviewRenderPlan) { renderPlan in
      ApproximatePreviewReviewView(renderPlan: renderPlan, store: store)
    }
    .sheet(item: $store.liveOpenPlan) { plan in
      AbletonLiveOpenReviewView(plan: plan, store: store)
    }
    .sheet(item: $store.liveExportPlan) { plan in
      AbletonExportReviewView(plan: plan, store: store)
    }
    .sheet(item: $store.organisationSessionToEdit) { session in
      SessionOrganisationReviewView(session: session, store: store)
    }
  }

  private var studioShell: some View {
    HStack(spacing: 0) {
      StudioSidebarView(store: store)
        .frame(width: 258)
      workspace
    }
    .background(StudioShellPalette.chrome)
  }

  private var workspace: some View {
    VStack(spacing: 0) {
      StudioCommandBarView(store: store)

      ZStack(alignment: .bottom) {
        detailContent
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(StudioShellPalette.canvas)
          .safeAreaInset(edge: .top, spacing: 0) {
            if let message = store.noticeMessage {
              StudioNoticeView(
                message: message,
                actionTitle: store.noticeActionTitle,
                action: store.performNoticeAction,
                dismiss: store.dismissNotice)
            }
          }

        if let asset = store.player.currentAsset {
          PreviewTransportView(
            asset: asset, isSample: store.isSampleLibrary, player: store.player
          )
          .padding(.horizontal, 28)
          .padding(.bottom, 18)
        }
      }
    }
    .background(StudioShellPalette.canvas)
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(Color.white.opacity(0.13), lineWidth: 1)
    }
    .padding(.top, 8)
    .padding(.trailing, 8)
    .padding(.bottom, 8)
  }

  private var inspectorIsPresented: Binding<Bool> {
    Binding(
      get: { store.inspectorPresented && !store.globalSearchPresented },
      set: { isPresented in
        guard !store.globalSearchPresented else { return }
        store.inspectorPresented = isPresented
      }
    )
  }

  @ViewBuilder
  private var detailContent: some View {
    if store.destination == .samples {
      SamplesView(store: store)
    } else {
      switch store.phase {
      case .welcome:
        FirstRunView(chooseFolder: store.chooseLibraryFolder)
      case .indexing(let url):
        IndexingView(rootURL: url, progress: store.indexingProgress)
      case .failed(let url, let message):
        IndexFailureView(rootURL: url, message: message) {
          if let url { store.indexFolder(url) } else { store.chooseLibraryFolder() }
        }
      case .ready(let index):
        switch store.destination {
        case .library:
          if let project = store.selectedProject {
            ProjectDetailView(project: project, store: store)
          } else if let work = store.selectedWork {
            WorkDetailView(work: work, store: store)
          } else {
            StudioLibraryView(index: index, store: store)
          }
        case .looseAudio:
          LooseAudioView(index: index, store: store)
        case .recoveredChains:
          RecoveredChainsView(store: store)
        case .locations:
          LocationsView(
            index: index,
            isSample: store.isSampleLibrary,
            syncStatus: store.syncStatus,
            store: store
          )
        case .samples:
          SamplesView(store: store)
        }
      }
    }
  }

}

private struct StudioAccessibilityIsolationHost<Content: View>: NSViewRepresentable {
  let isAccessibilityHidden: Bool
  let content: Content

  init(
    isAccessibilityHidden: Bool,
    @ViewBuilder content: () -> Content
  ) {
    self.isAccessibilityHidden = isAccessibilityHidden
    self.content = content()
  }

  func makeNSView(context: Context) -> NSHostingView<Content> {
    let hostingView = NSHostingView(rootView: content)
    hostingView.setAccessibilityHidden(isAccessibilityHidden)
    return hostingView
  }

  func updateNSView(_ hostingView: NSHostingView<Content>, context: Context) {
    hostingView.rootView = content
    hostingView.setAccessibilityHidden(isAccessibilityHidden)
  }
}

private struct StudioCommandBarView: View {
  @Bindable var store: StudioLibraryStore

  var body: some View {
    HStack(spacing: 14) {
      breadcrumb
        .frame(maxWidth: .infinity, alignment: .leading)

      Spacer(minLength: 0)

      HStack(spacing: 3) {
        StudioCanvasIconButton(
          title: store.inspectorPresented ? "Hide inspector" : "Show inspector",
          systemImage: "sidebar.trailing",
          isActive: store.inspectorPresented
        ) {
          store.inspectorPresented.toggle()
        }
      }
      .frame(alignment: .trailing)
    }
    .padding(.horizontal, 15)
    .padding(.top, 22)
    .padding(.bottom, 12)
    .background(StudioShellPalette.canvasRaised)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(StudioShellPalette.canvasStroke)
        .frame(height: 1)
    }
  }

  private var breadcrumb: some View {
    HStack(spacing: 8) {
      if store.selectedWork != nil || store.selectedProject != nil {
        Button {
          if store.selectedProject != nil, store.selectedWork != nil {
            store.returnToSelectedWork()
          } else {
            store.navigate(to: store.destination)
          }
        } label: {
          Image(systemName: "chevron.left")
            .font(.system(size: 11, weight: .bold))
            .frame(width: 14, height: 14)
        }
        .buttonStyle(StudioCanvasButtonStyle(kind: .quiet))
        .help(
          store.selectedProject != nil && store.selectedWork != nil
            ? "Back to \(store.selectedWork?.displayName ?? "Song")"
            : "Back to \(store.destination.title)"
        )
      }

      Text(store.destination.title)
        .font(.system(size: 12.5, weight: .semibold, design: .rounded))
        .foregroundStyle(StudioShellPalette.mutedInk)
        .lineLimit(1)

      if let selectionTitle {
        Image(systemName: "chevron.right")
          .font(.system(size: 8, weight: .bold))
          .foregroundStyle(StudioShellPalette.mutedInk.opacity(0.55))

        Text(selectionTitle)
          .font(.system(size: 12.5, weight: .semibold, design: .rounded))
          .foregroundStyle(StudioShellPalette.ink)
          .lineLimit(1)
      }
    }
  }

  private var selectionTitle: String? {
    if let work = store.selectedWork { return work.displayName }
    if let project = store.selectedProject { return project.displayName }
    return nil
  }
}
