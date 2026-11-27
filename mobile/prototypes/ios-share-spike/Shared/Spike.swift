import Foundation
import os

/// Shared by the app and the extension: the App Group, the URL scheme and one log for both
/// processes (the unified log, subsystem dev.langle.spike, and log.txt in the group container).
enum Spike {
  static let group = "group.dev.langle.spike.share"
  static let openURL = URL(string: "langlespike://shared")!

  static var container: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
  }

  static var sharedFile: URL? { container?.appendingPathComponent("shared.json") }

  private static let stampFormat: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()

  static func stamp() -> String { stampFormat.string(from: Date()) }

  static func log(_ who: String, _ message: String) {
    Logger(subsystem: "dev.langle.spike", category: who).info("\(message, privacy: .public)")
    guard let dir = container else { return }
    let line = Data("\(stamp()) [\(who)] \(message)\n".utf8)
    let file = dir.appendingPathComponent("log.txt")
    if let handle = try? FileHandle(forWritingTo: file) {
      handle.seekToEndOfFile()
      handle.write(line)
      try? handle.close()
    } else {
      try? line.write(to: file)
    }
  }
}
