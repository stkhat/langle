/// The parts of the `langle-app` build's `manifest.json` the app supports (docs/specs/mobile-app.md
/// "The langle-app build target"; the same rules as `tests/app-manifest.test.ts`). A build that asks
/// for anything else is refused, naming what the app does not support.
public struct Manifest: Equatable, Sendable {
  public enum RunAt: String, Sendable {
    case documentStart = "document_start"
    case documentEnd = "document_end"
    case documentIdle = "document_idle"
  }

  public enum World: String, Sendable {
    case isolated = "ISOLATED"
    case main = "MAIN"
  }

  public struct ContentScript: Equatable, Sendable {
    public let matches: [MatchPattern]
    public let js: [String]
    public let runAt: RunAt
    public let world: World

    public func matches(_ url: String) -> Bool { matches.contains { $0.matches(url) } }
  }

  /// Why a build is refused.
  public struct Refusal: Error, Equatable, CustomStringConvertible {
    public let unsupported: [String]
    public init(unsupported: [String]) { self.unsupported = unsupported }
    public var description: String {
      "The app does not support this build: \(unsupported.joined(separator: "; "))"
    }
  }

  public let version: String
  /// The background script (`background.service_worker`), run in the extension host.
  public let background: String
  public let contentScripts: [ContentScript]
  /// The manifest as it is, for `runtime.getManifest`.
  public let value: JSONValue

  private static let keys: Set<String> = [
    "manifest_version", "name", "description", "version", "icons", "permissions", "background",
    "action", "options_ui", "content_scripts",
    // Check and development builds carry the extension key (wxt.config.ts); it means nothing here.
    "key",
  ]
  private static let permissions: Set<String> = ["storage", "alarms", "identity"]
  private static let scriptKeys: Set<String> = ["matches", "js", "run_at", "world", "css"]
  private static let actionKeys: Set<String> = ["default_title", "default_popup", "default_icon"]
  private static let optionsKeys: Set<String> = ["page", "open_in_tab"]

  public static func read(_ text: String) throws -> Manifest {
    guard let value = try? JSONValue.parse(text), let manifest = value.object else {
      throw Refusal(unsupported: ["a manifest that is not a JSON object"])
    }
    var unsupported: [String] = []
    func refuse(_ what: String) { unsupported.append(what) }
    func extra(_ object: [String: JSONValue], _ allowed: Set<String>, _ prefix: String) {
      for key in object.keys.sorted() where !allowed.contains(key) { refuse("\(prefix)\(key)") }
    }

    extra(manifest, keys, "")
    if manifest["manifest_version"] != 3 {
      refuse("manifest_version \(JSONValue.jsString(manifest["manifest_version"]))")
    }
    let version = manifest["version"]?.string ?? ""
    if version.isEmpty { refuse("a manifest without a version") }
    for permission in manifest["permissions"]?.array ?? [] where !permissions.contains(permission.string ?? "") {
      refuse("permission \(JSONValue.jsString(permission))")
    }
    if let action = manifest["action"]?.object { extra(action, actionKeys, "action.") }
    if let options = manifest["options_ui"]?.object { extra(options, optionsKeys, "options_ui.") }

    var background = ""
    if let object = manifest["background"]?.object {
      extra(object, ["service_worker"], "background.")
      background = object["service_worker"]?.string ?? ""
    }
    if background.isEmpty { refuse("a manifest without background.service_worker") }

    var scripts: [ContentScript] = []
    for (index, entry) in (manifest["content_scripts"]?.array ?? []).enumerated() {
      let prefix = "content_scripts[\(index)]."
      guard let script = entry.object else {
        refuse("content_scripts[\(index)]")
        continue
      }
      extra(script, scriptKeys, prefix)
      if !(script["css"]?.array ?? []).isEmpty { refuse("\(prefix)css") }
      var patterns: [MatchPattern] = []
      for match in script["matches"]?.array ?? [] {
        if let pattern = try? MatchPattern(match.string ?? "") {
          patterns.append(pattern)
        } else {
          refuse("\(prefix)matches \(JSONValue.jsString(match))")
        }
      }
      let runAt = RunAt(rawValue: script["run_at"]?.string ?? RunAt.documentIdle.rawValue)
      if runAt == nil { refuse("\(prefix)run_at \(JSONValue.jsString(script["run_at"]))") }
      let world = World(rawValue: script["world"]?.string ?? World.isolated.rawValue)
      if world == nil { refuse("\(prefix)world \(JSONValue.jsString(script["world"]))") }
      let js = (script["js"]?.array ?? []).compactMap(\.string)
      if let runAt, let world {
        scripts.append(ContentScript(matches: patterns, js: js, runAt: runAt, world: world))
      }
    }

    if !unsupported.isEmpty { throw Refusal(unsupported: unsupported) }
    return Manifest(version: version, background: background, contentScripts: scripts, value: value)
  }

  /// The content scripts that run on a page at `url`, in manifest order.
  public func scripts(for url: String) -> [ContentScript] {
    contentScripts.filter { $0.matches(url) }
  }
}
