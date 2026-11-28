import LangleCore
import UIKit
import WebKit
import os

/// The iOS `BrowsingEngine`: WKWebView. Browsing pages use the default data store; the extension
/// host and the app pages share one `WKWebsiteDataStore(forIdentifier:)` (spike S1: IndexedDB on
/// the `langle-app://` origin works there, persists, and outlives clearing the browsing data).
@MainActor
final class WebKitEngine: BrowsingEngine {
  /// Fixed: the app's data lives in this store for good.
  static let appStoreID = UUID(uuidString: "5E1A0C3B-7D2F-4B8E-A6C1-0F9D3E2B7A41")!
  static let langleWorld = WKContentWorld.world(name: "langle")

  let schemeHandler: AppSchemeHandler
  /// Ad blocking on browsing pages, or nil (none).
  var blocking: PageBlocking?
  private let browsingPages = NSHashTable<WebKitPage>.weakObjects()

  init(schemeHandler: AppSchemeHandler) {
    self.schemeHandler = schemeHandler
  }

  func createPage(profile: PageProfile, delegate: PageDelegate) -> Page {
    let page = WebKitPage(profile: profile, schemeHandler: schemeHandler, delegate: delegate, engine: self)
    if profile == .browsing { browsingPages.add(page) }
    return page
  }

  /// `blocking`'s rules or switches changed: browsing pages take them for their next requests.
  func blockingChanged() {
    for page in browsingPages.allObjects { page.applyRules(for: page.url) }
  }

  /// Empties the app's data store (`check.sh launch … -reset 1`, a first run again). It clears
  /// the store rather than removing it: `WKWebsiteDataStore.remove(forIdentifier:)` crashes in
  /// WebKit (iOS 26.4 Simulator) when it runs before any web view exists.
  static func removeAppStore() async {
    let store = WKWebsiteDataStore(forIdentifier: appStoreID)
    await store.removeData(
      ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
  }
}

/// Ad blocking as browsing pages ask it (AdBlocker, docs/specs/mobile-app.md "M6: ad blocking"):
/// the lists' network rules while a page's site gets blocking, and the stylesheet of a document's
/// classes and ids. The document-start scripts come with the page's other scripts (`willLoad`).
@MainActor
protocol PageBlocking: AnyObject {
  /// Whether a page of `url` gets blocking now (an engine in use, the switches for its site).
  func blocks(_ url: URL) -> Bool
  /// The lists' compiled rules (empty until they are ready).
  var ruleLists: [WKContentRuleList] { get }
  /// A document's classes and ids (`message`, JSON); `reply` gets their stylesheet.
  func hiddenCss(_ message: String, reply: @escaping (String) -> Void)
}

/// Keeps WKUserContentController from retaining the page (it holds its handlers strongly).
private final class WeakHandler: NSObject, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
  weak var page: WebKitPage?
  init(_ page: WebKitPage) { self.page = page }
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    page?.received(message)
  }

  /// `langleAdblock` (Langle's world on browsing pages): a document's classes and ids in, the
  /// stylesheet they need back.
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage,
    replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
  ) {
    guard let page, let body = message.body as? String, let blocking = page.engine?.blocking else {
      return replyHandler("", nil)
    }
    blocking.hiddenCss(body) { css in replyHandler(css, nil) }
  }
}

@MainActor
final class WebKitPage: NSObject, Page, WKNavigationDelegate, WKUIDelegate,
  UIGestureRecognizerDelegate
{
  static let bridgeName = "langleBridge"
  static let logName = "langleLog"
  /// The app's own fullscreen in the page's world (`src/app/fullscreen/`): `on` and `off`.
  static let fullscreenName = "langleFullscreen"

  let profile: PageProfile
  weak var delegate: PageDelegate?
  private let webView: WKWebView
  /// Where the bridge handler lives: Langle's world on web pages, the page's own on app pages.
  private let bridgeWorld: ScriptWorld
  private var observations: [NSKeyValueObservation] = []

  var view: UIView { webView }
  var url: URL? { webView.url }

  /// The engine, for its ad blocking (browsing pages).
  private(set) weak var engine: WebKitEngine?
  /// The ad-blocking rule lists on this page's content controller now.
  private var appliedRules: [WKContentRuleList] = []

  init(profile: PageProfile, schemeHandler: AppSchemeHandler, delegate: PageDelegate, engine: WebKitEngine) {
    self.profile = profile
    self.delegate = delegate
    self.engine = engine
    let config = WKWebViewConfiguration()
    switch profile {
    case .browsing:
      config.websiteDataStore = .default()
      // The page's element fullscreen (`requestFullscreen`, YouTube's fullscreen button), not
      // only the video's own: Langle's overlay inside the fullscreen element stays on screen.
      config.preferences.isElementFullscreenEnabled = true
      bridgeWorld = .langle
    case .app:
      config.websiteDataStore = WKWebsiteDataStore(forIdentifier: WebKitEngine.appStoreID)
      config.setURLSchemeHandler(schemeHandler, forURLScheme: AppSchemeHandler.scheme)
      bridgeWorld = .page
    }
    config.allowsInlineMediaPlayback = true
    webView = WKWebView(frame: .zero, configuration: config)
    super.init()
    let handler = WeakHandler(self)
    let world = Self.contentWorld(bridgeWorld)
    config.userContentController.add(handler, contentWorld: world, name: Self.bridgeName)
    #if DEBUG
      config.userContentController.add(handler, contentWorld: world, name: Self.logName)
    #endif
    if profile == .browsing {
      config.userContentController.add(handler, contentWorld: .page, name: Self.fullscreenName)
      config.userContentController.addScriptMessageHandler(
        handler, contentWorld: WebKitEngine.langleWorld, name: AdBlocker.bridgeName)
    }
    webView.isInspectable = true
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true
    let notify: (WKWebView) -> Void = { [weak self] _ in
      MainActor.assumeIsolated { self?.navigated() }
    }
    observations = [
      webView.observe(\.url) { view, _ in notify(view) },
      webView.observe(\.title) { view, _ in notify(view) },
      webView.observe(\.canGoBack) { view, _ in notify(view) },
      webView.observe(\.canGoForward) { view, _ in notify(view) },
      webView.observe(\.fullscreenState) { [weak self] view, _ in
        MainActor.assumeIsolated { self?.fullscreenChanged(view.fullscreenState) }
      },
      // The title bar slides with the page's scrolling (the shell's `onScroll(dy)`).
      webView.scrollView.observe(\.contentOffset) { [weak self] scroll, _ in
        MainActor.assumeIsolated {
          guard let self else { return }
          let y = Double(scroll.contentOffset.y + scroll.adjustedContentInset.top)
          self.delegate?.page(self, scrolledTo: y)
        }
      },
    ]
  }

  /// The app's own fullscreen (WebKit has no element fullscreen on the iPhone): the page's
  /// stand-in said `on`. The back swipe is off meanwhile; a swipe from the left edge leaves.
  private var appFullscreen = false
  private lazy var edgeSwipe: UIPanGestureRecognizer = {
    let swipe = UIPanGestureRecognizer(target: self, action: #selector(swipedFromEdge))
    swipe.delegate = self
    return swipe
  }()
  /// How near the left edge a swipe that leaves fullscreen starts, and how far right it goes.
  private static let edgeWidth: CGFloat = 24
  private static let swipeDistance: CGFloat = 80

  private func setAppFullscreen(_ on: Bool) {
    guard on != appFullscreen else { return }
    appFullscreen = on
    webView.allowsBackForwardNavigationGestures = !on
    // On the web view's container: WebKit fails the gestures inside the web view when the
    // page takes the touch (m.youtube.com's player does).
    if on {
      (webView.superview ?? webView).addGestureRecognizer(edgeSwipe)
    } else {
      edgeSwipe.view?.removeGestureRecognizer(edgeSwipe)
    }
    Log.app.info("app fullscreen \(on ? "on" : "off", privacy: .public)")
    delegate?.page(self, fullscreen: on)
  }

  /// Only a swipe that starts at the left edge. (A screen-edge recognizer was never called
  /// on the Simulator, so this is a pan that checks where it started.)
  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === edgeSwipe else { return true }
    let start = edgeSwipe.location(in: webView).x - edgeSwipe.translation(in: webView).x
    return start <= Self.edgeWidth
  }

  /// The web view's own gestures (its scrolling, the page's touches) take the swipe otherwise.
  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
  ) -> Bool {
    gestureRecognizer === edgeSwipe
  }

  @objc private func swipedFromEdge(_ swipe: UIPanGestureRecognizer) {
    guard swipe.state == .ended else { return }
    let moved = swipe.translation(in: webView)
    if moved.x >= Self.swipeDistance && abs(moved.y) < moved.x { exitFullscreen() }
  }

  func exitFullscreen() {
    guard appFullscreen || inFullscreen else { return }
    webView.evaluateJavaScript(
      "document.exitFullscreen().catch(() => {}); undefined", in: nil, in: .page
    ) { [weak self] result in
      // A page whose stand-in is gone (or never answers): the shell leaves on its own.
      if case .failure = result { self?.setAppFullscreen(false) }
    }
  }

  /// Entering counts from its start (so the window can turn), leaving from its end.
  private var inFullscreen = false
  private func fullscreenChanged(_ state: WKWebView.FullscreenState) {
    let now: Bool
    switch state {
    case .enteringFullscreen, .inFullscreen: now = true
    case .notInFullscreen: now = false
    case .exitingFullscreen: return
    @unknown default: return
    }
    guard now != inFullscreen else { return }
    inFullscreen = now
    Log.app.info("fullscreen \(now ? "on" : "off", privacy: .public)")
    delegate?.page(self, fullscreen: now)
  }

  private func navigated() {
    delegate?.page(
      self, didNavigate: webView.url, title: webView.title ?? "", canGoBack: webView.canGoBack,
      canGoForward: webView.canGoForward)
  }

  static func contentWorld(_ world: ScriptWorld) -> WKContentWorld {
    world == .langle ? WebKitEngine.langleWorld : .page
  }

  func load(_ url: URL) {
    guard mayLoad(url) else {
      Log.app.error("not loading \(url.scheme ?? "", privacy: .public): off this page's origins")
      return
    }
    webView.load(URLRequest(url: url))
  }

  /// Web pages load web addresses; app pages only the app origin, since their page world holds
  /// the bridge (Android's WebViewEngine keeps to the same rules).
  private func mayLoad(_ url: URL) -> Bool {
    profile == .browsing ? PageAddress.isWeb(url) : PageAddress.isOn(AppSchemeHandler.origin, url)
  }
  func reload() {
    if webView.url == nil, let url = lastRequested { load(url) } else { webView.reload() }
  }
  func stop() { webView.stopLoading() }
  func goBack() { webView.goBack() }
  func goForward() { webView.goForward() }

  private var lastRequested: URL?

  /// The lists' rules while `url`'s site gets blocking, none otherwise: set when a main-frame
  /// navigation is decided (before its request goes out) and when the rules or switches change.
  func applyRules(for url: URL?) {
    guard profile == .browsing else { return }
    var wanted: [WKContentRuleList] = []
    if let blocking = engine?.blocking, let url, blocking.blocks(url) { wanted = blocking.ruleLists }
    guard wanted.map(ObjectIdentifier.init) != appliedRules.map(ObjectIdentifier.init) else { return }
    let controller = webView.configuration.userContentController
    for list in appliedRules { controller.remove(list) }
    for list in wanted { controller.add(list) }
    appliedRules = wanted
  }

  func setUserScripts(_ scripts: [UserScript]) {
    let controller = webView.configuration.userContentController
    controller.removeAllUserScripts()
    for script in scripts {
      controller.addUserScript(
        WKUserScript(
          source: script.source,
          injectionTime: script.runAt == .start ? .atDocumentStart : .atDocumentEnd,
          forMainFrameOnly: true, in: Self.contentWorld(script.world)))
    }
  }

  func postMessage(world: ScriptWorld, frameId: Int, json: String) {
    // The JSON travels as a string literal: the bridge reads JSON text both ways.
    let literal = JSONValue.string(json).json
    webView.evaluateJavaScript(
      "__langleBridgeReceive(\(literal))", in: nil, in: Self.contentWorld(world)
    ) { result in
      if case .failure(let error) = result {
        // A page that navigated away meanwhile; its context is gone.
        Log.bridge.debug("delivery failed: \(error.localizedDescription, privacy: .public)")
      }
    }
  }

  /// The world of `keepRunning`'s script, apart from the page's and Langle's.
  private static let keepRunningWorld = WKContentWorld.world(name: "langle-keep-running")

  /// WebKit holds a page's process (and the network process with its IndexedDB) running while a
  /// script call on it has not finished, also with the app off screen: an awaited promise in a
  /// world of its own is that call, settled by `false` or after `ms` (notes/mobile.md "Device
  /// checks (M7e, iOS)").
  func keepRunning(_ on: Bool, ms: Double) {
    let world = Self.keepRunningWorld
    guard on else {
      webView.evaluateJavaScript(
        "for (const end of globalThis.__langleKeepRunning ?? []) end();", in: nil, in: world)
      return
    }
    let source = """
      await new Promise((resolve) => {
        const ends = (globalThis.__langleKeepRunning ??= new Set());
        const end = () => { ends.delete(end); clearTimeout(timer); resolve(); };
        const timer = setTimeout(end, ms);
        ends.add(end);
      });
      """
    webView.callAsyncJavaScript(source, arguments: ["ms": ms], in: nil, in: world) { _ in }
  }

  func evaluate(world: ScriptWorld, source: String) async -> String {
    do {
      let value = try await webView.callAsyncJavaScript(
        source, arguments: [:], in: nil, contentWorld: Self.contentWorld(world))
      return "\(value ?? "undefined")"
    } catch {
      return "error: \(error)"
    }
  }

  fileprivate func received(_ message: WKScriptMessage) {
    guard message.frameInfo.isMainFrame, let body = message.body as? String else { return }
    // On app pages, only the app origin's documents speak to the bridge.
    if profile == .app {
      let from = message.frameInfo.securityOrigin
      guard let url = URL(string: "\(from.protocol)://\(from.host)"), from.port == 0,
        PageAddress.isOn(AppSchemeHandler.origin, url)
      else { return }
    }
    if message.name == Self.fullscreenName {
      setAppFullscreen(body == "on")
      return
    }
    let world: ScriptWorld = message.world.name == "langle" ? .langle : .page
    if message.name == Self.logName {
      Log.console.info("\(self.profile == .browsing ? "page" : "app", privacy: .public) \(body, privacy: .public)")
      return
    }
    delegate?.page(
      self, message: body, world: world, frameId: 0,
      frameURL: message.frameInfo.request.url?.absoluteString ?? "")
  }

  // MARK: WKNavigationDelegate

  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
  ) {
    // A download link (an export's blob) would show the file in place of the page, with no
    // way back from a tab: nothing happens, as on Android, until the shells save or share
    // files (docs/notes/mobile.md "Device checks of M4 (M4e, iOS)").
    if action.shouldPerformDownload {
      decisionHandler(.cancel)
      return
    }
    if action.targetFrame?.isMainFrame ?? true, let url = action.request.url {
      // An app page's link to the web (Support, the notices, a dictionary): in the browsing
      // page, never in the app page's own view.
      if profile == .app, !PageAddress.isOn(AppSchemeHandler.origin, url) {
        decisionHandler(.cancel)
        delegate?.page(self, leaveApp: url)
        return
      }
      // The target frame is nil for target=_blank: it loads here (one page).
      if action.targetFrame == nil {
        decisionHandler(.cancel)
        load(url)
        return
      }
      lastRequested = url
      applyRules(for: url)
      delegate?.page(self, willLoad: url)
    }
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
    applyRules(for: webView.url)
    if let url = webView.url { delegate?.page(self, willLoad: url) }
  }

  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
    // A new document: the old one's fullscreen went with it.
    setAppFullscreen(false)
    if let url = webView.url { delegate?.page(self, didCommit: url) }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    Log.app.info("load failed: \(error.localizedDescription, privacy: .public)")
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    Log.app.error("content process gone: \(webView.url?.absoluteString ?? "", privacy: .public)")
    delegate?.pageProcessGone(self)
  }

  // MARK: WKUIDelegate

  func webView(
    _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
    for action: WKNavigationAction, windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    guard let url = action.request.url else { return nil }
    if profile == .app, !PageAddress.isOn(AppSchemeHandler.origin, url) {
      delegate?.page(self, leaveApp: url)
    } else {
      load(url)
    }
    return nil
  }
}

enum Log {
  static let app = Logger(subsystem: "dev.langle.app", category: "app")
  static let bridge = Logger(subsystem: "dev.langle.app", category: "bridge")
  static let console = Logger(subsystem: "dev.langle.app", category: "console")
  static let check = Logger(subsystem: "dev.langle.app", category: "check")
}
