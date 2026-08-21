// swift-tools-version: 6.2

import PackageDescription

let package = Package(
  name: "PluginRadarStudio",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .library(name: "StudioCore", targets: ["StudioCore"]),
    .executable(name: "studio-index", targets: ["StudioIndexCLI"]),
    .executable(name: "StudioTimeMachine", targets: ["StudioTimeMachine"]),
  ],
  targets: [
    .systemLibrary(
      name: "CZlib",
      pkgConfig: "zlib",
      providers: [.brew(["zlib"])]
    ),
    .systemLibrary(
      name: "CSQLite"
    ),
    .target(
      name: "StudioCore",
      dependencies: ["CZlib", "CSQLite"]
    ),
    .executableTarget(
      name: "StudioIndexCLI",
      dependencies: ["StudioCore"]
    ),
    .executableTarget(
      name: "StudioTimeMachine",
      dependencies: ["StudioCore"],
      resources: [
        .copy("Resources/Brand")
      ]
    ),
    .testTarget(
      name: "StudioCoreTests",
      dependencies: ["StudioCore", "CZlib", "CSQLite"],
      exclude: ["Fixtures"]
    ),
  ]
)
