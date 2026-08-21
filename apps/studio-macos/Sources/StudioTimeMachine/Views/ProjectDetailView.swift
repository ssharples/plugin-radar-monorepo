import StudioCore
import SwiftUI

struct ProjectDetailView: View {
  let project: StudioProject
  @Bindable var store: StudioLibraryStore

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 40) {
          Button {
            if store.selectedWork != nil {
              store.returnToSelectedWork()
            } else {
              store.showLibrary()
            }
          } label: {
            Label(store.selectedWork?.displayName ?? "Studio Library", systemImage: "chevron.left")
          }
          .buttonStyle(.plain)
          .foregroundStyle(.secondary)

          projectHeader

          if project.timelines.isEmpty {
            ContentUnavailableView(
              "No Sets found",
              systemImage: "doc.badge.ellipsis",
              description: Text(
                "Audio is still available below when this project contains playable artifacts.")
            )
          } else {
            timelineSection
          }

          if let selectedSet = store.selectedSet {
            SetContentView(
              set: selectedSet,
              compatibilityReport: store.selectedCompatibilityReport,
              versionDiff: store.selectedVersionDiff,
              comparedOlderSet: store.comparedOlderSet
            )
            .id("set-content")

            RecoveryEvidenceView(store: store)
          }

          audioSection
        }
        .padding(.horizontal, 42)
        .padding(.top, 30)
        .padding(.bottom, store.player.currentAsset == nil ? 50 : 118)
        .frame(maxWidth: 980, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .center)
      }
      .onAppear {
        guard
          ProcessInfo.processInfo.arguments.contains(where: {
            $0.hasPrefix("--sample-project-")
          })
        else { return }
        Task { @MainActor in
          try? await Task.sleep(for: .milliseconds(250))
          proxy.scrollTo("set-content", anchor: .top)
        }
      }
    }
  }

  private var projectHeader: some View {
    HStack(alignment: .center, spacing: 34) {
      ProjectObjectView(identity: project.displayName, size: 188, showsDisc: true, isActive: true)

      VStack(alignment: .leading, spacing: 12) {
        Text(project.displayName)
          .font(.custom("Helvetica Neue", size: 34).weight(.bold))
          .lineLimit(2)

        Text(
          "\(project.timelines.count) timelines · \(project.setCount) Sets · \(project.previewAssets.count) audio artifacts"
        )
        .foregroundStyle(.secondary)

        Label {
          LocalPathText(url: project.rootURL, font: .caption, lineLimit: 1)
        } icon: {
          Image(systemName: "folder")
        }
      }

      Spacer(minLength: 0)
    }
  }

  private var timelineSection: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .firstTextBaseline) {
        Text("Set history")
          .font(.title2.weight(.semibold))
        Spacer()
        Text("Newest first")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          ForEach(project.timelines) { timeline in
            Button {
              store.selectTimeline(timeline)
            } label: {
              Text(timeline.displayName)
                .lineLimit(1)
                .padding(.horizontal, 13)
                .padding(.vertical, 7)
                .background(
                  store.selectedTimeline?.id == timeline.id
                    ? Color.primary : Color.secondary.opacity(0.1),
                  in: Capsule()
                )
                .foregroundStyle(
                  store.selectedTimeline?.id == timeline.id
                    ? Color(nsColor: .textBackgroundColor) : .primary)
            }
            .buttonStyle(.plain)
          }
        }
      }

      if let timeline = store.selectedTimeline {
        VStack(spacing: 0) {
          ForEach(Array(timeline.versions.enumerated()), id: \.element.id) { index, set in
            VersionRow(
              set: set,
              lineageIdentity: timeline.displayName,
              isSelected: store.selectedSet?.id == set.id,
              isLast: index == timeline.versions.count - 1
            ) {
              store.selectSet(set)
            } reveal: {
              store.revealInFinder(set.fileURL)
            }
          }
        }
      }
    }
  }

  private var audioSection: some View {
    VStack(alignment: .leading, spacing: 18) {
      HStack(alignment: .firstTextBaseline) {
        Text("Existing audio")
          .font(.title2.weight(.semibold))
        Spacer()
        Text("Available files play without reconstruction")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      if project.previewAssets.isEmpty {
        Text("No audio artifacts were found inside this project.")
          .foregroundStyle(.secondary)
          .padding(.vertical, 18)
      } else {
        VStack(spacing: 0) {
          ForEach(project.previewAssets.prefix(24)) { asset in
            AudioAssetRow(
              asset: asset,
              isSelected: store.selectedAsset?.id == asset.id,
              select: { store.selectAsset(asset) },
              play: { store.player.toggle(asset) },
              reveal: { store.revealInFinder(asset.fileURL) }
            )
          }
        }
      }
    }
  }
}

private struct VersionRow: View {
  let set: AbletonSet
  let lineageIdentity: String
  let isSelected: Bool
  let isLast: Bool
  let select: () -> Void
  let reveal: () -> Void

  var body: some View {
    Button(action: select) {
      HStack(alignment: .top, spacing: 14) {
        ZStack(alignment: .top) {
          if !isLast {
            Rectangle()
              .fill(Color.secondary.opacity(0.2))
              .frame(width: 1)
              .padding(.top, 48)
          }

          ProjectObjectView(
            identity: lineageIdentity,
            size: 56,
            showsDisc: true,
            isActive: isSelected
          )
        }
        .frame(width: 60)
        .frame(minHeight: 74)

        HStack(alignment: .top, spacing: 14) {
          VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 8) {
              Text(set.displayName)
                .font(.body.weight(.medium))
                .lineLimit(1)
              Text(set.isBackup ? "BACKUP" : "CURRENT")
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(.quaternary, in: Capsule())
            }
            Text(set.modifiedText)
              .font(.callout)
              .foregroundStyle(.secondary)
          }

          Spacer()

          Text("\(set.structure.trackCount) tracks")
            .font(.callout)
            .foregroundStyle(.secondary)
          Text(set.liveVersionText)
            .font(.callout)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(
          isSelected ? Color.black.opacity(0.09) : .clear,
          in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(
      "\(set.displayName), \(set.isBackup ? "backup" : "current"), \(set.modifiedText)"
    )
    .contextMenu {
      Button("Select Set", action: select)
      Button("Reveal in Finder", action: reveal)
    }
  }
}
