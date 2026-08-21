import StudioCore
import SwiftUI

struct StudioSidebarView: View {
  @Bindable var store: StudioLibraryStore
  @FocusState private var searchTriggerFocused: Bool
  @AccessibilityFocusState private var searchTriggerAccessibilityFocused: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      topBar
        .padding(.horizontal, 12)
        .padding(.top, 48)
        .padding(.bottom, 14)

      addProjectFolderButton
        .padding(.horizontal, 8)
        .padding(.bottom, 18)

      ScrollView {
        LazyVStack(alignment: .leading, spacing: 2) {
          sidebarLabel("Studio")

          ForEach(primaryDestinations) { destination in
            SidebarNavigationRow(
              destination: destination,
              isSelected: isDestinationSelected(destination),
              select: { store.navigate(to: destination) }
            )
          }

          recentSongs
            .padding(.top, 22)
        }
        .padding(.horizontal, 8)
        .padding(.bottom, 24)
      }

      sidebarFooter
        .padding(.horizontal, 8)
        .padding(.bottom, 10)
    }
    .background(StudioShellPalette.chrome)
    .onAppear {
      restoreSearchTriggerFocus()
    }
    .onChange(of: store.globalSearchPresented) { _, isPresented in
      if !isPresented { restoreSearchTriggerFocus() }
    }
  }

  private var topBar: some View {
    HStack(spacing: 10) {
      Menu {
        Button("Studio Library") { store.navigate(to: .library) }
        Button("Samples") { store.navigate(to: .samples) }
        Button("Locations") { store.navigate(to: .locations) }
      } label: {
        HStack(spacing: 8) {
          VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 5) {
              StudioBrandMark()
                .frame(width: 38, height: 24)
                .clipped()

              Image(systemName: "chevron.down")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(.white.opacity(0.32))
            }

            Text("Private local archive")
              .font(.system(size: 10.5, weight: .medium))
              .foregroundStyle(.white.opacity(0.40))
          }
        }
      }
      .menuStyle(.borderlessButton)
      .menuIndicator(.hidden)
      .fixedSize()
      .help("Open Studio navigation")

      Spacer(minLength: 4)

      SidebarSearchButton(
        isFocused: $searchTriggerFocused,
        action: store.presentGlobalSearch
      )
      .accessibilityFocused($searchTriggerAccessibilityFocused)

      notificationMenu
    }
  }

  private func restoreSearchTriggerFocus() {
    guard store.shouldRestoreGlobalSearchTriggerFocus else { return }
    Task { @MainActor in
      await Task.yield()
      searchTriggerFocused = true
      searchTriggerAccessibilityFocused = true
      store.shouldRestoreGlobalSearchTriggerFocus = false
    }
  }

  private var addProjectFolderButton: some View {
    Button(action: store.chooseLibraryFolder) {
      HStack(spacing: 10) {
        Image(systemName: "plus")
          .font(.system(size: 12, weight: .bold))
          .frame(width: 18)

        Text("Add to Studio")
          .font(.system(size: 13.5, weight: .semibold, design: .rounded))
          .lineLimit(1)

        Spacer(minLength: 4)

        Text("⌘O")
          .font(.system(size: 9.5, weight: .semibold, design: .rounded))
          .foregroundStyle(.white.opacity(0.36))
      }
    }
    .buttonStyle(SidebarPrimaryActionStyle())
    .help("Add an existing folder to Studio without moving or changing its files")
  }

  private var notificationMenu: some View {
    Menu {
      if store.hasPendingLibraryChanges {
        Button {
          store.rescan()
        } label: {
          Label("Index new library changes", systemImage: "arrow.triangle.2.circlepath")
        }
      }

      if indexingIssueCount > 0 {
        Button {
          store.issueSheetPresented = true
        } label: {
          Label(
            "Review \(indexingIssueCount) indexing \(indexingIssueCount == 1 ? "issue" : "issues")",
            systemImage: "exclamationmark.triangle"
          )
        }
      }

      if unavailableLocationCount > 0 {
        Button {
          store.navigate(to: .locations)
        } label: {
          Label(
            "Review \(unavailableLocationCount) unavailable \(unavailableLocationCount == 1 ? "location" : "locations")",
            systemImage: "externaldrive.badge.exclamationmark"
          )
        }
      }

      if notificationCount == 0 {
        Button("You’re all caught up") {}
          .disabled(true)
      }
    } label: {
      ZStack(alignment: .topTrailing) {
        Image(systemName: "bell")
          .font(.system(size: 13.5, weight: .medium))
          .foregroundStyle(.white.opacity(0.54))
          .frame(width: 29, height: 29)

        if notificationCount > 0 {
          Circle()
            .fill(Color(red: 0.96, green: 0.73, blue: 0.29))
            .frame(width: 8, height: 8)
            .overlay {
              Circle().stroke(StudioShellPalette.chrome, lineWidth: 2)
            }
            .offset(x: -1, y: 2)
        }
      }
      .contentShape(Rectangle())
    }
    .menuStyle(.borderlessButton)
    .menuIndicator(.hidden)
    .fixedSize()
    .help(notificationCount == 0 ? "No library alerts" : "Library alerts")
    .accessibilityLabel(
      notificationCount == 0
        ? "Notifications, no alerts"
        : "Notifications, \(notificationCount) \(notificationCount == 1 ? "alert" : "alerts")"
    )
  }

  private var recentSongs: some View {
    VStack(alignment: .leading, spacing: 4) {
      sidebarLabel("Recent Songs")

      if store.recentWorks.isEmpty {
        Text("Songs you open will appear here.")
          .font(.system(size: 11.5, weight: .regular))
          .foregroundStyle(.white.opacity(0.40))
          .padding(.horizontal, 10)
          .padding(.vertical, 5)
      } else {
        ForEach(store.recentWorks) { work in
          RecentSongRow(
            work: work,
            isSelected: store.destination == .library && store.selectedWorkID == work.id,
            select: { store.selectWork(work) }
          )
        }
      }
    }
  }

  private var sidebarFooter: some View {
    VStack(alignment: .leading, spacing: 2) {
      Divider()
        .overlay(Color.white.opacity(0.07))
        .padding(.horizontal, 7)
        .padding(.bottom, 7)

      Button {
        store.navigate(to: .locations)
      } label: {
        HStack(spacing: 10) {
          ZStack {
            Circle()
              .fill(syncColor.opacity(0.16))
              .frame(width: 28, height: 28)
            Circle()
              .fill(syncColor)
              .frame(width: 7, height: 7)
          }

          VStack(alignment: .leading, spacing: 1) {
            Text(syncTitle)
              .font(.system(size: 12.5, weight: .semibold, design: .rounded))
              .foregroundStyle(.white.opacity(0.74))
            Text(locationSummary)
              .font(.system(size: 10.5, weight: .medium))
              .foregroundStyle(.white.opacity(0.38))
          }

          Spacer(minLength: 4)

          Image(systemName: "chevron.right")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(.white.opacity(0.25))
        }
      }
      .buttonStyle(SidebarFooterRowStyle(isSelected: store.destination == .locations))

      SettingsLink {
        Label("Settings", systemImage: "gearshape")
          .font(.system(size: 12.5, weight: .medium, design: .rounded))
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .buttonStyle(SidebarUtilityRowStyle())
    }
  }

  private func sidebarLabel(_ title: String) -> some View {
    Text(title)
      .font(.system(size: 10.5, weight: .semibold, design: .rounded))
      .textCase(.uppercase)
      .tracking(0.35)
      .foregroundStyle(.white.opacity(0.32))
      .padding(.horizontal, 10)
      .padding(.bottom, 5)
  }

  private var primaryDestinations: [LibraryDestination] {
    LibraryDestination.allCases.filter { $0 != .locations }
  }

  private func isDestinationSelected(_ destination: LibraryDestination) -> Bool {
    store.destination == destination && store.selectedWork == nil && store.selectedProject == nil
  }

  private var indexingIssueCount: Int {
    store.library?.issues.count ?? 0
  }

  private var unavailableLocationCount: Int {
    store.registeredRoots.count { $0.availability != .available }
  }

  private var notificationCount: Int {
    (store.hasPendingLibraryChanges ? 1 : 0) + indexingIssueCount + unavailableLocationCount
  }

  private var syncTitle: String {
    switch store.syncStatus {
    case .monitoring: "Library watching"
    case .indexing: "Updating library"
    case .idle: "Library ready"
    case .stopped: "Watching paused"
    }
  }

  private var locationSummary: String {
    "\(store.registeredRoots.count) tracked \(store.registeredRoots.count == 1 ? "location" : "locations")"
  }

  private var syncColor: Color {
    switch store.syncStatus {
    case .monitoring, .idle: StudioShellPalette.signal
    case .indexing: .orange
    case .stopped: .secondary
    }
  }
}

private struct SidebarSearchButton: View {
  let isFocused: FocusState<Bool>.Binding
  let action: () -> Void
  @Environment(\.accessibilityDifferentiateWithoutColor) private var differentiateWithoutColor
  @State private var isHovered = false

  var body: some View {
    Button(action: action) {
      Image(systemName: "magnifyingglass")
        .font(.system(size: 13.5, weight: .semibold))
        .foregroundStyle(.white.opacity(isHovered || isFocused.wrappedValue ? 0.86 : 0.54))
        .frame(width: 29, height: 29)
        .background(
          Color.white.opacity(isHovered || isFocused.wrappedValue ? 0.09 : 0.001),
          in: RoundedRectangle(cornerRadius: 8, style: .continuous)
        )
        .overlay {
          if isFocused.wrappedValue || (isHovered && differentiateWithoutColor) {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .stroke(Color.white.opacity(0.30), lineWidth: 1)
          }
        }
    }
    .buttonStyle(.plain)
    .focused(isFocused)
    .onHover { isHovered = $0 }
    .help("Search Songs and studio files (Command-F)")
    .accessibilityLabel("Search Studio")
    .accessibilityHint("Opens Song search. Press Command-F from anywhere to open it.")
    .accessibilityIdentifier("studio.sidebar.search")
  }
}

private struct SidebarPrimaryActionStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .foregroundStyle(.white.opacity(configuration.isPressed ? 0.78 : 0.88))
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity, minHeight: 38, alignment: .leading)
      .background(
        Color.white.opacity(configuration.isPressed ? 0.13 : 0.085),
        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
      )
      .scaleEffect(configuration.isPressed ? 0.985 : 1)
      .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
      .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

private struct SidebarNavigationRow: View {
  let destination: LibraryDestination
  let isSelected: Bool
  let select: () -> Void

  var body: some View {
    Button(action: select) {
      HStack(spacing: 10) {
        Image(systemName: destination.symbol)
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(.white.opacity(isSelected ? 0.78 : 0.50))
          .frame(width: 18)

        Text(destination.title)
          .font(.system(size: 13.5, weight: .medium, design: .rounded))
          .foregroundStyle(.white.opacity(isSelected ? 0.90 : 0.64))
          .lineLimit(1)

        Spacer(minLength: 0)
      }
      .padding(.horizontal, 11)
      .frame(height: 35)
      .background(
        Color.white.opacity(isSelected ? 0.085 : 0.001),
        in: RoundedRectangle(cornerRadius: 9, style: .continuous)
      )
      .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }
    .buttonStyle(.plain)
    .focusEffectDisabled()
  }
}

private struct RecentSongRow: View {
  let work: StudioWork
  let isSelected: Bool
  let select: () -> Void

  var body: some View {
    Button(action: select) {
      HStack(spacing: 10) {
        Image(systemName: "music.note")
          .font(.system(size: 11.5, weight: .medium))
          .foregroundStyle(.white.opacity(isSelected ? 0.70 : 0.38))
          .frame(width: 18)

        Text(work.displayName)
          .font(.system(size: 13.5, weight: .medium, design: .rounded))
          .foregroundStyle(.white.opacity(isSelected ? 0.90 : 0.62))
          .lineLimit(1)

        Spacer(minLength: 4)
      }
      .padding(.horizontal, 10)
      .frame(height: 34)
      .background(
        Color.white.opacity(isSelected ? 0.085 : 0.001),
        in: RoundedRectangle(cornerRadius: 9, style: .continuous)
      )
      .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }
    .buttonStyle(.plain)
    .focusEffectDisabled()
    .help("\(work.displayName) — \(work.artist.displayName)")
    .accessibilityLabel("Open \(work.displayName) by \(work.artist.displayName)")
  }
}

private struct SidebarFooterRowStyle: ButtonStyle {
  let isSelected: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .padding(.horizontal, 9)
      .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
      .background(
        Color.white.opacity(isSelected ? 0.085 : (configuration.isPressed ? 0.055 : 0.001)),
        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
      )
      .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
  }
}

private struct SidebarUtilityRowStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .foregroundStyle(.white.opacity(configuration.isPressed ? 0.54 : 0.46))
      .padding(.horizontal, 12)
      .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
      .background(
        Color.white.opacity(configuration.isPressed ? 0.045 : 0.001),
        in: RoundedRectangle(cornerRadius: 9, style: .continuous)
      )
      .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
  }
}
