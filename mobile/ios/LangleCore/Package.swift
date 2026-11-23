// swift-tools-version: 6.0
// The phone app's core without the engine (docs/specs/mobile-app.md "Parts"): envelopes,
// the router, the key-value store, the manifest reader, match patterns, alarms and tabs.
// Tested on the Mac with `swift test`; the iOS app links it.
import PackageDescription

let package = Package(
  name: "LangleCore",
  platforms: [.macOS(.v15), .iOS("26.4")],
  products: [.library(name: "LangleCore", targets: ["LangleCore"])],
  targets: [
    .target(name: "LangleCore"),
    .testTarget(name: "LangleCoreTests", dependencies: ["LangleCore"]),
  ]
)
