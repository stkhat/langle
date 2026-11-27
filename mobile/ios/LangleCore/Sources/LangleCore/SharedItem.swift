import Foundation

/// What another app's Share handed the share extension (docs/specs/mobile-app.md "M8: Share →
/// Langle", "iOS"): a web address, text, or both, and when. The extension keeps it; the app
/// takes it and opens `address`.
public struct SharedItem: Equatable, Sendable {
  public let url: String?
  public let text: String?
  /// When it was shared (ISO 8601).
  public let sharedAt: String

  public init(url: String?, text: String?, sharedAt: String) {
    self.url = url
    self.text = text
    self.sharedAt = sharedAt
  }

  /// The kept file's value as an item; nil when it is none (or has neither a URL nor text).
  public init?(_ value: JSONValue?) {
    guard let sharedAt = value?["sharedAt"]?.string else { return nil }
    let url = value?["url"]?.string
    let text = value?["text"]?.string
    if url == nil, text == nil { return nil }
    self.init(url: url, text: text, sharedAt: sharedAt)
  }

  public var json: JSONValue {
    var object: [String: JSONValue] = ["sharedAt": .string(sharedAt)]
    if let url { object["url"] = .string(url) }
    if let text { object["text"] = .string(text) }
    return .object(object)
  }

  /// The address it opens (`SharedLink.resolve`); nil when there is nothing to open.
  public var address: String? { SharedLink.resolve(url: url, text: text) }

  /// The URL to keep from a share's URL attachments, in their order: the http(s) one that keeps
  /// the most of the address (the most query parameters), the first of those that keep as much.
  /// Safari gives a YouTube page two: its canonical address without `t`, then the address shown
  /// (docs/notes/mobile.md "Device checks (M8b, iOS)"). Nil when none is http(s).
  public static func pickURL(_ candidates: [String]) -> String? {
    var best: (url: String, kept: Int)?
    for url in candidates {
      guard let parts = URLComponents(string: url), let scheme = parts.scheme?.lowercased(),
        scheme == "https" || scheme == "http", parts.host?.isEmpty == false
      else { continue }
      let kept = parts.queryItems?.count ?? 0
      if best == nil || kept > best!.kept { best = (url, kept) }
    }
    return best?.url ?? candidates.first
  }
}

/// The app group the app and its share extension share (both entitled).
public enum AppGroup {
  public static let id = "group.dev.langle.app"

  /// Their shared folder: `LangleShared` in the group's container, else in the process's own
  /// Application Support (a build without the group, where nothing is shared).
  public static var folder: URL {
    (FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
      ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0])
      .appendingPathComponent("LangleShared")
  }
}

/// The one shared item the extension leaves for the app: `shared.json` in the app group's
/// `LangleShared` folder (beside `native-strings.json`). A newer share overwrites it; the app
/// reads it once (the read deletes it).
public struct SharedInbox: Sendable {
  public static let name = "shared"
  public let directory: URL

  public init(directory: URL) {
    self.directory = directory
  }

  public var file: URL { directory.appendingPathComponent("\(Self.name).json") }

  /// Keeps `item`, replacing one kept before (written whole, atomically).
  public func put(_ item: SharedItem) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data(item.json.json.utf8).write(to: file, options: .atomic)
  }

  /// The kept item, once: the file is moved aside first, so a share written meanwhile stays for
  /// the next read. Nil when there is none (a file that is no item is dropped too).
  public func take() -> SharedItem? {
    let taken = directory.appendingPathComponent("\(Self.name)-\(UUID().uuidString).taken")
    do {
      try FileManager.default.moveItem(at: file, to: taken)
    } catch {
      return nil
    }
    defer { try? FileManager.default.removeItem(at: taken) }
    guard let data = try? Data(contentsOf: taken) else { return nil }
    return SharedItem(try? JSONValue.parse(String(decoding: data, as: UTF8.self)))
  }
}
