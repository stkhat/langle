import UIKit
import WebKit

final class SpikeController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler,
  WKScriptMessageHandlerWithReply
{
  static let storeID = UUID(uuidString: "6C1E0A2B-4F3D-4E8A-9B7C-1D2E3F405162")!
  let args = UserDefaults.standard
  let langle = WKContentWorld.world(name: "langle")
  var browse: WKWebView!
  var host: WKWebView!
  var loads: [ObjectIdentifier: CheckedContinuation<Void, Never>] = [:]
  var arrivals: [Double] = []  // native receive times of timer ticks (s)
  var jsTimes: [Double] = []  // the page's performance.now() at each tick (ms)

  var mode: String { args.string(forKey: "mode") ?? "read" }
  var origin: String { args.string(forKey: "origin") ?? "scheme" }
  var placement: String { args.string(forKey: "host") ?? "hidden" }
  var hostURL: URL {
    origin == "file"
      ? Bundle.main.url(forResource: "host", withExtension: "html")!
      : URL(string: "langle-app://app/host.html")!
  }
  var pageURL: URL { URL(string: args.string(forKey: "page") ?? "https://en.wikipedia.org/wiki/Language")! }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .white
    say(
      "launch mode=\(mode) origin=\(origin) host=\(placement) ios=\(UIDevice.current.systemVersion) stores=\(Self.storeID)"
    )
    browse = makeBrowse()
    browse.frame = view.bounds
    browse.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(browse)
    host = makeHost()
    switch placement {
    case "detached": break
    case "alpha":
      host.frame = .zero
      host.alpha = 0
      view.addSubview(host)
    case "visible":
      host.frame = CGRect(x: 0, y: 120, width: 120, height: 120)
      view.addSubview(host)
    default:
      host.frame = .zero
      host.isHidden = true
      view.addSubview(host)
    }
    Task { await run() }
  }

  // MARK: web views

  /// The browsing view: default store, a handler only in the "langle" world (question 4).
  func makeBrowse() -> WKWebView {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .default()
    let c = config.userContentController
    c.add(self, contentWorld: .page, name: "pageOnly")
    c.addScriptMessageHandler(self, contentWorld: langle, name: "langleBridge")
    c.addUserScript(
      WKUserScript(
        source: """
          window.__langleSecret = 1;
          window.__langleAtStart = { readyState: document.readyState, scripts: document.scripts.length,
            bridge: typeof webkit.messageHandlers.langleBridge };
          window.addEventListener("message", (e) => { if (e.data?.langleTest) window.__langleGot = e.data.langleTest; });
          """, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: langle))
    let wv = WKWebView(frame: .zero, configuration: config)
    wv.isInspectable = true
    wv.navigationDelegate = self
    return wv
  }

  /// The extension host: its own store, the app origin's scheme handler.
  func makeHost() -> WKWebView {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = WKWebsiteDataStore(forIdentifier: Self.storeID)
    config.setURLSchemeHandler(AppSchemeHandler(), forURLScheme: "langle-app")
    config.userContentController.add(self, contentWorld: .page, name: "spike")
    let wv = WKWebView(frame: .zero, configuration: config)
    wv.isInspectable = true
    wv.navigationDelegate = self
    return wv
  }

  func load(_ wv: WKWebView, _ url: URL) async {
    await withCheckedContinuation { k in
      loads[ObjectIdentifier(wv)] = k
      if url.isFileURL {
        wv.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
      } else {
        wv.load(URLRequest(url: url))
      }
    }
  }

  func finish(_ wv: WKWebView) { loads.removeValue(forKey: ObjectIdentifier(wv))?.resume() }
  func webView(_ wv: WKWebView, didFinish navigation: WKNavigation!) { finish(wv) }
  func webView(_ wv: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    say("load failed \(wv === host ? "host" : "browse"): \(error.localizedDescription)")
    finish(wv)
  }
  func webView(_ wv: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    say("load failed \(wv === host ? "host" : "browse"): \(error.localizedDescription)")
    finish(wv)
  }
  func webViewWebContentProcessDidTerminate(_ wv: WKWebView) {
    say("content process terminated: \(wv === host ? "host" : "browse")")
  }

  /// Runs a function body; the scripts return JSON strings (an undefined result trips the async API).
  func js(_ wv: WKWebView, _ body: String, in world: WKContentWorld? = nil) async -> String {
    do {
      let r = try await wv.callAsyncJavaScript(body, contentWorld: world ?? .page)
      return "\(r ?? "nil")"
    } catch {
      return "error: \(error)"
    }
  }

  // MARK: messages

  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
    if m.name == "spike", let body = m.body as? [String: Any] {
      arrivals.append(Date().timeIntervalSince1970)
      jsTimes.append(body["perf"] as? Double ?? 0)
      return
    }
    say("message \(m.name) world=\(m.world.name ?? "page") body=\(m.body)")
  }

  func userContentController(
    _ c: WKUserContentController, didReceive m: WKScriptMessage,
    replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
  ) {
    say("bridge message world=\(m.world.name ?? "page") body=\(m.body)")
    replyHandler(["pong": 1, "world": m.world.name ?? "page"], nil)
  }

  // MARK: modes

  func run() async {
    switch mode {
    case "wipe":
      await load(host, hostURL)
      say("wipe \(await js(host, "return JSON.stringify(await spike.wipe())"))")
    case "write":
      await load(host, hostURL)
      say("env \(await js(host, "return JSON.stringify(await spike.env())"))")
      say("write \(await js(host, "return JSON.stringify(await spike.write())"))")
      say("read \(await js(host, "return JSON.stringify(await spike.read())"))")
    case "read":
      await load(host, hostURL)
      say("env \(await js(host, "return JSON.stringify(await spike.env())"))")
      say("read \(await js(host, "return JSON.stringify(await spike.read())"))")
    case "clear": await clear()
    case "timer": await timer()
    case "worlds": await worlds()
    default: say("unknown mode \(mode)")
    }
    say("DONE \(mode)")
  }

  /// Question 2: clearing the default store leaves the app store alone.
  func clear() async {
    await load(host, hostURL)
    say("app store before: \(await js(host, "return JSON.stringify(await spike.read())"))")
    await load(browse, pageURL)
    let control = """
      const r = indexedDB.open("control", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      const db = await new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      const keys = await new Promise((ok) => { const q = db.transaction("kv").objectStore("kv").getAllKeys(); q.onsuccess = () => ok(q.result); });
      if (write) { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(Date.now(), "k");
        await new Promise((ok) => (tx.oncomplete = ok)); localStorage.setItem("control", "1"); }
      db.close();
      return JSON.stringify({ origin: location.origin, keysBefore: keys.length, localStorage: localStorage.getItem("control") });
      """
    say("default control write \(await callControl(control, write: true))")
    let types = WKWebsiteDataStore.allWebsiteDataTypes()
    let appStore = WKWebsiteDataStore(forIdentifier: Self.storeID)
    say("records before: default=\(await names(.default())) app=\(await names(appStore))")
    let t0 = Date()
    await WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: .distantPast)
    say("removeData(default) took \(Int(Date().timeIntervalSince(t0) * 1000)) ms")
    say("records after: default=\(await names(.default())) app=\(await names(appStore))")
    await load(browse, pageURL)
    say("default control after reload \(await callControl(control, write: false))")
    say("app store, same page: \(await js(host, "return JSON.stringify(await spike.read())"))")
    await load(host, hostURL)
    say("app store, reloaded: \(await js(host, "return JSON.stringify(await spike.read())"))")
  }

  func callControl(_ body: String, write: Bool) async -> String {
    do {
      let r = try await browse.callAsyncJavaScript(body, arguments: ["write": write], contentWorld: .page)
      return "\(r ?? "nil")"
    } catch {
      return "error: \(error)"
    }
  }

  func names(_ store: WKWebsiteDataStore) async -> String {
    let records = await store.dataRecords(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes())
    let described = records.map { r in
      "\(r.displayName):\(r.dataTypes.map { $0.replacingOccurrences(of: "WKWebsiteDataType", with: "") }.sorted().joined(separator: "+"))"
    }
    return "\(records.count) [\(described.sorted().joined(separator: ", "))]"
  }

  /// Question 3: a hidden host keeps a 1 s setInterval on time while the browsing view shows a page.
  func timer() async {
    let seconds = args.integer(forKey: "seconds") > 0 ? args.integer(forKey: "seconds") : 120
    await load(host, hostURL)
    Task { await load(browse, pageURL) }
    let start = Date().timeIntervalSince1970
    say("timer start \(await js(host, "return JSON.stringify(spike.startTimer())"))")
    for step in 1...(seconds / 30) {
      try? await Task.sleep(nanoseconds: 30_000_000_000)
      say("timer t=\(step * 30)s ticks=\(arrivals.count)")
    }
    let elapsed = Date().timeIntervalSince1970 - start
    say("timer \(placement) native: \(stats(arrivals.map { $0 * 1000 }, elapsed: elapsed))")
    say("timer \(placement) page clock: \(stats(jsTimes, elapsed: elapsed))")
  }

  func stats(_ times: [Double], elapsed: Double) -> String {
    let gaps = zip(times.dropFirst(), times).map { $0 - $1 }
    let late = gaps.filter { $0 > 1500 }.count
    let mean = gaps.isEmpty ? 0 : gaps.reduce(0, +) / Double(gaps.count)
    return
      "ticks=\(times.count) in \(Int(elapsed)) s, mean gap=\(Int(mean)) ms, min=\(Int(gaps.min() ?? 0)) max=\(Int(gaps.max() ?? 0)) ms, gaps>1.5s=\(late)"
  }

  /// Question 4: a handler added only in the "langle" world is invisible to the page's world.
  func worlds() async {
    await load(browse, pageURL)
    let page = """
      const h = window.webkit?.messageHandlers;
      const r = { handlers: typeof h, bridge: typeof h?.langleBridge, bridgeIn: !!h && ("langleBridge" in h),
        pageOnly: typeof h?.pageOnly, secret: typeof window.__langleSecret };
      try { h.langleBridge.postMessage("from page"); r.post = "sent"; } catch (e) { r.post = "threw: " + e.message; }
      window.postMessage({ langleTest: "from page" }, "*");
      return JSON.stringify(r);
      """
    say("page world: \(await js(browse, page))")
    let isolated = """
      await new Promise((ok) => setTimeout(ok, 300));
      const h = webkit.messageHandlers;
      const r = { bridge: typeof h.langleBridge, pageOnly: typeof h.pageOnly, secret: typeof window.__langleSecret,
        pageGlobal: typeof window.mw, atStart: window.__langleAtStart, gotPageMessage: window.__langleGot ?? null };
      r.reply = await h.langleBridge.postMessage({ ping: 1 });
      return JSON.stringify(r);
      """
    say("langle world: \(await js(browse, isolated, in: langle))")
    say("page world sees mw: \(await js(browse, "return typeof window.mw"))")
  }
}
