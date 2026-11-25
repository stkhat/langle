import LangleCore
import UIKit

/// One page with one script context of the router: the extension host, an app page or a web page.
/// Each new top-level document gets a new connection (the old one fails its waiting messages
/// with "Receiving end does not exist"); scripts' envelopes go to it, its deliveries come back.
@MainActor
final class ContextPage: PageDelegate {
  private(set) var page: Page!
  private let router: Router
  /// Where the bridge's scripts run in this page.
  private let world: ScriptWorld
  private let spec: (URL) -> ContextSpec
  private let scripts: (URL) -> [UserScript]
  private(set) var connection: Connection?

  var onNavigate: ((_ url: URL?, _ title: String, _ canGoBack: Bool, _ canGoForward: Bool) -> Void)?
  var onCommit: ((URL) -> Void)?
  var onProcessGone: (() -> Void)?
  var onFullscreen: ((Bool) -> Void)?
  var onScroll: ((Double) -> Void)?

  init(
    engine: BrowsingEngine, profile: PageProfile, router: Router, world: ScriptWorld,
    spec: @escaping (URL) -> ContextSpec, scripts: @escaping (URL) -> [UserScript]
  ) {
    self.router = router
    self.world = world
    self.spec = spec
    self.scripts = scripts
    page = engine.createPage(profile: profile, delegate: self)
  }

  func load(_ url: URL) {
    page.setUserScripts(scripts(url))
    page.load(url)
  }

  /// The page is gone for good (a closed sheet, a host replaced).
  func close() {
    connection?.disconnect()
    connection = nil
    page.stop()
  }

  // MARK: PageDelegate

  func page(_ page: Page, message json: String, world: ScriptWorld, frameId: Int, frameURL: String) {
    guard world == self.world, frameId == 0 else { return }
    connection?.receive(json)
  }

  func page(_ page: Page, willLoad url: URL) {
    page.setUserScripts(scripts(url))
  }

  func page(_ page: Page, didCommit url: URL) {
    connection?.disconnect()
    let world = self.world
    connection = router.connect(spec(url)) { [weak page] json in
      page?.postMessage(world: world, frameId: 0, json: json)
    }
    onCommit?(url)
  }

  func page(_ page: Page, didNavigate url: URL?, title: String, canGoBack: Bool, canGoForward: Bool) {
    onNavigate?(url, title, canGoBack, canGoForward)
  }

  func pageProcessGone(_ page: Page) {
    connection?.disconnect()
    connection = nil
    onProcessGone?()
  }

  func page(_ page: Page, fullscreen: Bool) {
    onFullscreen?(fullscreen)
  }

  func page(_ page: Page, scrolledTo y: Double) {
    onScroll?(y)
  }
}

/// The extension host (docs/specs/mobile-app.md "Parts"): a hidden page on the app origin, in the
/// app's data store, running `host.html` (the app info, the shim, `background.js`). It stays in
/// the view hierarchy at zero size: spike S1 measured that a detached WKWebView runs its timers at
/// about half speed. When its content process is lost it is created again, and then the pages
/// reload (`onRecreated`).
@MainActor
final class ExtensionHost {
  static let url = URL(string: "\(AppSchemeHandler.origin)/host.html")!

  private let engine: BrowsingEngine
  private let router: Router
  private let injector: ContentInjector
  /// A zero-size view in the window; the host's web view lives in it.
  let slot = UIView(frame: .zero)
  private(set) var context: ContextPage?
  var onRecreated: (() -> Void)?

  init(engine: BrowsingEngine, router: Router, injector: ContentInjector) {
    self.engine = engine
    self.router = router
    self.injector = injector
    slot.isUserInteractionEnabled = false
  }

  var isReady: Bool { context?.connection?.isReady ?? false }

  func start() {
    let injector = self.injector
    let context = ContextPage(
      engine: engine, profile: .app, router: router, world: .page, spec: { _ in .host },
      scripts: { _ in injector.hostScripts() })
    context.onProcessGone = { [weak self] in self?.recreate() }
    let view = context.page.view
    view.frame = .zero
    view.isHidden = true
    slot.subviews.forEach { $0.removeFromSuperview() }
    slot.addSubview(view)
    self.context = context
    context.load(Self.url)
    Log.app.info("extension host started")
  }

  /// `runtime.reload`: the background starts again in a new document.
  func reload() {
    context?.load(Self.url)
  }

  private func recreate() {
    Log.app.error("extension host lost its content process: creating it again")
    context?.close()
    start()
    onRecreated?()
  }

  func evaluate(_ source: String) async -> String {
    await context?.page.evaluate(world: .page, source: source) ?? "no host"
  }
}
