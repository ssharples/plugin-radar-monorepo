import Foundation

enum LibraryDestination: String, CaseIterable, Identifiable {
  case library
  case samples
  case looseAudio
  case recoveredChains
  case locations

  var id: String { rawValue }

  var title: String {
    switch self {
    case .library: "Studio Library"
    case .samples: "Samples"
    case .looseAudio: "Loose audio"
    case .recoveredChains: "Recovered chains"
    case .locations: "Locations"
    }
  }

  var symbol: String {
    switch self {
    case .library: "square.grid.2x2"
    case .samples: "waveform.badge.magnifyingglass"
    case .looseAudio: "waveform"
    case .recoveredChains: "point.3.connected.trianglepath.dotted"
    case .locations: "externaldrive"
    }
  }
}

enum LibraryDensity: String, CaseIterable, Identifiable {
  case spacious
  case compact

  var id: String { rawValue }
  var title: String { rawValue.capitalized }
}

enum LibraryPresentation: String, CaseIterable, Identifiable {
  case list
  case grid

  var id: String { rawValue }

  var title: String {
    switch self {
    case .list: "List"
    case .grid: "Grid"
    }
  }

  var symbol: String {
    switch self {
    case .list: "list.bullet"
    case .grid: "square.grid.2x2"
    }
  }
}
