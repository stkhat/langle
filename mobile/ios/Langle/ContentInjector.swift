import Foundation
import LangleCore

/// Which scripts each kind of context gets (docs/specs/mobile-app.md "Contexts").
/// - web pages: in Langle's world, `__langleAppInfo` and `langle-shim.js` at document start, then
///   each matching content script's `js` at its `run_at` (`document_idle` at document end);
///   `world: "MAIN"` scripts go in the page's world without the shim;
/// - app pages: `__langleAppInfo` and the shim in the page's world at document start;
/// - the extension host: `host.html` sets both itself (`hostPage`).
@MainActor
final class ContentInjector {
  let manifest: Manifest
  private let read: (String) -> Data?
  private var sources: [String: String] = [:]

  init(manifest: Manifest, read: @escaping (String) -> Data?) {
    self.manifest = manifest
    self.read = read
  }

  /// `window.__langleAppInfo = …;` for a context (`content`, `page` or `host`).
  func appInfo(_ context: String) -> String {
    let info: JSONValue = [
      "origin": .string(AppSchemeHandler.origin), "manifest": manifest.value,
      "context": .string(context),
      // `appHost.translator`: the phone's own models (Apple Translation), no model packs.
      "translator": ["models": "system"],
    ]
    return "window.__langleAppInfo = \(info.json);"
  }

  private func source(_ path: String) -> String? {
    if let cached = sources[path] { return cached }
    guard let data = read("/\(path)") else {
      Log.app.error("the build has no \(path, privacy: .public)")
      return nil
    }
    let text = String(decoding: data, as: UTF8.self)
    sources[path] = text
    return text
  }

  /// The scripts for a web page at `url`: the app's own fullscreen on every page (it installs
  /// itself only where WebKit has no element fullscreen, docs/plans/mobile-app.md "M3e"), then
  /// Langle's when a content script matches it.
  func webPageScripts(for url: URL) -> [UserScript] {
    var scripts: [UserScript] = []
    if let fullscreen = source("langle-fullscreen.js") {
      scripts.append(UserScript(source: fullscreen, world: .page, runAt: .start))
    }
    let matched = manifest.scripts(for: url.absoluteString)
    guard !matched.isEmpty else { return scripts }
    scripts += debugScripts(.langle)
    if matched.contains(where: { $0.world == .isolated }), let shim = source("langle-shim.js") {
      scripts.append(UserScript(source: appInfo("content"), world: .langle, runAt: .start))
      scripts.append(UserScript(source: shim, world: .langle, runAt: .start))
    }
    for script in matched {
      let world: ScriptWorld = script.world == .main ? .page : .langle
      let runAt: ScriptRunAt = script.runAt == .documentStart ? .start : .end
      for file in script.js {
        if let text = source(file) { scripts.append(UserScript(source: text, world: world, runAt: runAt)) }
      }
    }
    return scripts
  }

  /// The scripts of an app page (popup, options, word list, welcome).
  func appPageScripts() -> [UserScript] {
    guard let shim = source("langle-shim.js") else { return [] }
    return debugScripts(.page) + [
      UserScript(source: appInfo("page"), world: .page, runAt: .start),
      UserScript(source: shim, world: .page, runAt: .start),
    ]
  }

  /// The extension host's page: the app info, the shim, then the background.
  func hostPage() -> String {
    """
    <!doctype html>
    <meta charset="utf-8">
    <title>Langle</title>
    <script>\(appInfo("host"))</script>
    <script src="/langle-shim.js"></script>
    <script src="/\(manifest.background)"></script>
    """
  }

  func hostScripts() -> [UserScript] { debugScripts(.page) }

  /// Debug builds: console errors and warnings, uncaught errors and rejections go to the unified
  /// log (`check.sh log`), next to the check build's own error log.
  private func debugScripts(_ world: ScriptWorld) -> [UserScript] {
    #if DEBUG
      return [UserScript(source: Self.consoleRelay, world: world, runAt: .start)]
    #else
      return []
    #endif
  }

  private static let consoleRelay = """
    (() => {
      const handler = globalThis.webkit?.messageHandlers?.\(WebKitPage.logName);
      if (!handler) return;
      const text = (value) => {
        if (value instanceof Error) return value.stack ? `${value.message} ${value.stack}` : value.message;
        if (typeof value === "string") return value;
        try { return JSON.stringify(value); } catch { return String(value); }
      };
      const post = (level, values) => {
        try { handler.postMessage(`${level} ${location.href} ${values.map(text).join(" ")}`.slice(0, 4000)); } catch {}
      };
      for (const level of ["error", "warn"]) {
        const original = console[level];
        console[level] = (...values) => { post(level, values); original.apply(console, values); };
      }
      addEventListener("error", (e) => post("uncaught", [e.error ?? e.message, `${e.filename}:${e.lineno}`]));
      addEventListener("unhandledrejection", (e) => post("unhandled", [e.reason]));
    })();
    """
}
