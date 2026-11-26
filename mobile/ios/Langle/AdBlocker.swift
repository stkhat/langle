import Foundation
import LangleCore
import WebKit

/// Ad blocking on the browsing page (docs/specs/mobile-app.md "M6: ad blocking"; Android's
/// `AdBlocker` does the same over WebView): the list store and its engine, the lists' WebKit rules
/// (`ContentRules`), the switches (`adBlocking` in `storage.local`), and each document's
/// cosmetics and scriptlets, set when its main-frame navigation is decided. Made and called on
/// the main thread.
@MainActor
final class AdBlocker: PageBlocking {
  /// Fetching and building (seconds); the stylesheets for classes and ids (milliseconds).
  private let listWork = DispatchQueue(label: "dev.langle.app.filter-lists", qos: .utility)
  private let cssWork = DispatchQueue(label: "dev.langle.app.adblock-css", qos: .userInitiated)
  let store: FilterListStore<NativeFilterEngines>
  let rules = ContentRules()
  private let router: Router

  private(set) var switches: AdBlockingSwitches
  private var setup: Bool
  /// The last URL's site, as a page asks for the same URL several times.
  private var lastSite: (url: String, site: String?) = ("", nil)

  /// The rules or the switches changed: the browsing page takes them for its next requests.
  var onRulesChanged: (() -> Void)?
  /// The switches changed from the first to the second (the page of a site that turned reloads).
  var onSwitches: ((_ old: AdBlockingSwitches, _ new: AdBlockingSwitches) -> Void)?

  init(router: Router, dir: URL, lists: [FilterList], resources: Data) {
    self.router = router
    let work = listWork
    store = FilterListStore(
      dir: dir, lists: lists, fetcher: URLSessionListFetcher(),
      engines: NativeFilterEngines(resources: resources),
      background: { job in
        let job = Job(run: job)
        work.async { job.run() }
      }, main: AdBlocker.onMain)
    let local = router.store.stored(.local)
    switches = AdBlockingSwitches(local[AdBlockingSwitches.key])
    setup = setupDone(local[Self.setupKey])
  }

  private nonisolated static func onMain(_ job: @escaping () -> Void) {
    let job = Job(run: job)
    DispatchQueue.main.async { job.run() }
  }

  /// The list store's work, handed between queues: the store keeps its own state to one queue
  /// at a time (its rounds run on `listWork`, their results on main).
  private struct Job: @unchecked Sendable {
    let run: () -> Void
  }

  /// Loads the kept engine, then fetches the lists that are due once the first run is done.
  func start() {
    store.onEngine = { [weak self] _ in
      guard let self else { return }
      onRulesChanged?()
      rules.refresh(store.keptLists())
    }
    store.onUpdated = { [weak self] at in
      self?.router.setStorage(.local, [AdBlockingSwitches.listsKey: ["updatedAt": .number(at)]])
    }
    store.onError = { [weak self] in self?.report("error", $0) }
    store.onFetchFailed = { [weak self] in self?.report("warning", $0) }
    store.onLog = { message in Log.app.info("ad blocking: \(message, privacy: .public)") }
    rules.onReady = { [weak self] in
      guard let self else { return }
      let count = rules.all.count
      Log.app.info("ad blocking: \(count, privacy: .public) WebKit rule lists in use")
      onRulesChanged?()
    }
    rules.onError = { [weak self] in self?.report("error", $0) }
    rules.onLog = { message in Log.app.info("ad blocking: \(message, privacy: .public)") }
    store.start()
    inUse()
  }

  /// The app is in use (on screen, a page opened): the lists that are due are fetched.
  func inUse() {
    if setup { store.update() }
  }

  /// Storage changed (`Router.onStorageChanged`): the first run's Start, or the switches.
  func storageChanged(_ area: KeyValueStore.Area, _ changes: [String: KeyValueStore.Change]) {
    guard area == .local else { return }
    if let change = changes[Self.setupKey] {
      setup = setupDone(change.newValue)
      inUse()
    }
    if let change = changes[AdBlockingSwitches.key] {
      let old = switches
      switches = AdBlockingSwitches(change.newValue)
      if old != switches {
        onRulesChanged?()
        onSwitches?(old, switches)
      }
    }
  }

  /// ⋮ "Block ads on this site": the switch for `site`, saved where Settings reads it too.
  func setSite(_ site: String, blocking: Bool) {
    router.setStorage(.local, [AdBlockingSwitches.key: switches.withSite(site, blocking: blocking).value])
  }

  func site(of url: URL) -> String? {
    let text = url.absoluteString
    if lastSite.url == text { return lastSite.site }
    let scheme = url.scheme?.lowercased()
    let site = scheme == "https" || scheme == "http" ? AdblockNative.site(text) : nil
    lastSite = (text, site)
    return site
  }

  // MARK: PageBlocking

  func blocks(_ url: URL) -> Bool {
    store.engine != nil && switches.blocks(site(of: url))
  }

  var ruleLists: [WKContentRuleList] { rules.all }

  /// Langle's world: the stylesheet and the class and id collector (unless `generichide`); the
  /// page's world: the scriptlets, wrapped in a function of their own.
  func documentScripts(_ url: URL) -> [UserScript] {
    guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http",
      let engine = store.engine, switches.blocks(site(of: url)),
      let cosmetic = engine.cosmetic(url.absoluteString)
    else { return [] }
    var scripts: [UserScript] = []
    let scriptlets = cosmetic["scriptlets"]?.string ?? ""
    if !scriptlets.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      scripts.append(UserScript(source: "(function(){\n\(scriptlets)\n})();", world: .page, runAt: .start))
    }
    let sheet = cosmetic["css"]?.string ?? ""
    let generic = cosmetic["generichide"]?.bool != true
    if !sheet.isEmpty || generic {
      let source = Self.cosmeticScript
        .replacingOccurrences(of: "__CSS__", with: JSONValue.string(sheet).json)
        .replacingOccurrences(of: "__GENERIC__", with: generic ? "true" : "false")
        .replacingOccurrences(of: "__EXCEPTIONS__", with: (cosmetic["exceptions"] ?? []).json)
      scripts.append(UserScript(source: source, world: .langle, runAt: .start))
    }
    return scripts
  }

  func hiddenCss(_ message: String, reply: @escaping (String) -> Void) {
    guard let engine = store.engine else { return reply("") }
    cssWork.async {
      let sheet = engine.hiddenClassIdCss(message) ?? ""
      DispatchQueue.main.async { reply(sheet) }
    }
  }

  /// A failed fetch, build or compile: a log line, and in debug builds an entry of the check
  /// build's error log (`checkErrorLog`, as src/check/error-log.ts keeps it), so a check reads it
  /// with the rest.
  private func report(_ level: String, _ message: String) {
    if level == "error" {
      Log.app.error("\(message, privacy: .public)")
    } else {
      Log.app.warning("\(message, privacy: .public)")
    }
    #if DEBUG
      let entry: JSONValue = [
        "level": .string(level), "message": .string(message), "context": "app (iOS)", "url": "",
        "time": .string(ISO8601DateFormatter().string(from: Date())),
      ]
      let log = (router.store.stored(.local)[Self.errorLogKey]?.array ?? []) + [entry]
      router.setStorage(.local, [Self.errorLogKey: .array(Array(log.suffix(Self.maxErrors)))])
    #endif
  }

  static let setupKey = "setup"
  static let errorLogKey = "checkErrorLog"
  static let maxErrors = 200
  /// The `WKScriptMessageHandlerWithReply` in Langle's world: classes and ids in, CSS back.
  static let bridgeName = "langleAdblock"

  /// Langle's world, at document start: the page's stylesheet, then (unless `generichide`) the
  /// page's classes and ids, at start and as nodes are added, sent to native code in batches for
  /// the generic `##.class` / `###id` rules, whose answers are added as stylesheets too.
  /// Constructed stylesheets are not subject to the page's CSP. Android's is the same but for
  /// the bridge (a web message listener there).
  private static let cosmeticScript = """
    (() => {
      const css = __CSS__, generic = __GENERIC__, exceptions = __EXCEPTIONS__;
      const add = (text) => {
        if (!text) return;
        try {
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(text);
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        } catch {
          const style = document.createElement("style");
          style.textContent = text;
          (document.head ?? document.documentElement).append(style);
        }
      };
      add(css);
      const bridge = globalThis.webkit?.messageHandlers?.\(bridgeName);
      if (!generic || !bridge) return;
      const seen = new Set();
      let classes = [], ids = [], timer = 0, last = 0;
      const send = () => {
        timer = 0;
        last = Date.now();
        if (classes.length === 0 && ids.length === 0) return;
        bridge.postMessage(JSON.stringify({ classes, ids, exceptions })).then(add, () => {});
        classes = [];
        ids = [];
      };
      const note = (el) => {
        const id = el.id;
        if (typeof id === "string" && id !== "" && !seen.has("#" + id)) {
          seen.add("#" + id);
          ids.push(id);
        }
        if (el.classList) {
          for (const name of el.classList) {
            if (!seen.has("." + name)) {
              seen.add("." + name);
              classes.push(name);
            }
          }
        }
      };
      const scan = (node) => {
        if (node.nodeType !== 1) return;
        note(node);
        for (const el of node.querySelectorAll("[id],[class]")) note(el);
      };
      const later = () => {
        if (!timer) timer = setTimeout(send, Math.max(0, last + 250 - Date.now()));
      };
      new MutationObserver((records) => {
        for (const record of records) for (const node of record.addedNodes) scan(node);
        later();
      }).observe(document, { childList: true, subtree: true });
      if (document.documentElement) scan(document.documentElement);
      later();
    })();
    """
}
