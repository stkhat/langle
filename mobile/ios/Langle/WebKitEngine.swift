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

  init(schemeHandler: AppSchemeHandler) {
    self.schemeHandler = schemeHandler
  }

  func createPage(profile: PageProfile, delegate: PageDelegate) -> Page {
    WebKitPage(profile: profile, schemeHandler: schemeHandler, delegate: delegate)
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

/// Keeps WKUserContentController from retaining the page (it holds its handlers strongly).
private final class WeakHandler: NSObject, WKScriptMessageHandler {
  weak var page: WebKitPage?
  init(_ page: WebKitPage) { self.page = page }
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    page?.received(message)
  }
}

@MainActor
final class WebKitPage: NSObject, Page, WKNavigationDelegate, WKUIDelegate {
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

  init(profile: PageProfile, schemeHandler: AppSchemeHandler, delegate: PageDelegate) {
    self.profile = profile
    self.delegate = delegate
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
    ]
  }

  /// The app's own fullscreen (WebKit has no element fullscreen on the iPhone): the page's
  /// stand-in said `on`. The back swipe is off meanwhile; a swipe from the left edge leaves.
  private var appFullscreen = false
  private lazy var edgeSwipe: UIScreenEdgePanGestureRecognizer = {
    let swipe = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(swipedFromEdge))
    swipe.edges = .left
    return swipe
  }()

  private func setAppFullscreen(_ on: Bool) {
    guard on != appFullscreen else { return }
    appFullscreen = on
    webView.allowsBackForwardNavigationGestures = !on
    if on { webView.addGestureRecognizer(edgeSwipe) } else { webView.removeGestureRecognizer(edgeSwipe) }
    Log.app.info("app fullscreen \(on ? "on" : "off", privacy: .public)")
    delegate?.page(self, fullscreen: on)
  }

  @objc private func swipedFromEdge(_ swipe: UIScreenEdgePanGestureRecognizer) {
    if swipe.state == .recognized || swipe.state == .ended { exitFullscreen() }
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

  func load(_ url: URL) { webView.load(URLRequest(url: url)) }
  func reload() {
    if webView.url == nil, let url = lastRequested { load(url) } else { webView.reload() }
  }
  func stop() { webView.stopLoading() }
  func goBack() { webView.goBack() }
  func goForward() { webView.goForward() }

  private var lastRequested: URL?

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
    if action.targetFrame?.isMainFrame ?? true, let url = action.request.url {
      // The target frame is nil for target=_blank: it loads here (one page).
      if action.targetFrame == nil {
        decisionHandler(.cancel)
        load(url)
        return
      }
      lastRequested = url
      delegate?.page(self, willLoad: url)
    }
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
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
    if let url = action.request.url { load(url) }
    return nil
  }
}

enum Log {
  static let app = Logger(subsystem: "dev.langle.app", category: "app")
  static let bridge = Logger(subsystem: "dev.langle.app", category: "bridge")
  static let console = Logger(subsystem: "dev.langle.app", category: "console")
  static let check = Logger(subsystem: "dev.langle.app", category: "check")
}
