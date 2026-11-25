import LangleCore
import SwiftUI

/// The app's one window (docs/specs/mobile-app.md "The shells (native)"): Home, Words and
/// Settings under the tab bar, one browsing page over Home under the title bar, the first run,
/// and app pages in the sheet frame. `Shell` (LangleCore) decides the screens; this does what
/// it says with the pages.
@MainActor
final class AppModel: ObservableObject {
  /// A page in the sheet frame: the Langle sheet (`popup.html`, no tab of its own), or another
  /// app page a tab opened.
  final class Sheet: Identifiable {
    let id = UUID()
    let tabId: Int?
    let context: ContextPage
    init(tabId: Int?, context: ContextPage) {
      self.tabId = tabId
      self.context = context
    }
  }

  @Published private(set) var screen: Screen = .tab(.home)
  @Published private(set) var started = false
  /// Why Langle does not run (no build, or one the app refuses); browsing still works.
  @Published private(set) var refusal: String?
  /// The browsing page has an element in fullscreen: WebKit's own (in its own window, where
  /// WebKit has element fullscreen) or the app's (the page fills the window, the bars hidden).
  @Published private(set) var fullscreen = false
  @Published private(set) var sheet: Sheet?
  /// The title bar: the page's title and site, its history, and whether it shows.
  @Published private(set) var title = ""
  @Published private(set) var site = ""
  @Published private(set) var canGoBack = false
  @Published private(set) var canGoForward = false
  @Published private(set) var barShown = true
  private var barScroll = TitleBarScroll()
  private var rotation: RotationWatch?

  private(set) var engine: WebKitEngine!
  private(set) var router: Router!
  private(set) var shell: Shell!
  private(set) var host: ExtensionHost?
  private(set) var browsing: ContextPage!
  @Published private(set) var firstRun: ContextPage?
  @Published private(set) var tabPages: [AppTab: ContextPage] = [:]
  private var injector: ContentInjector?
  /// The site name asked for this address last (one ask per page).
  private var siteAskedFor: URL?
  private var ogSiteName: String?
  private var siteAsks = 0

  /// The view the host's slot sits in (zero size, in the window).
  let hostView = UIView(frame: .zero)

  static let buildFolder = Bundle.main.resourceURL!.appendingPathComponent("langle-app")
  static let storeFolder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("LangleStore")
  /// Langle's mark (the toolbar icon of the bundled build).
  static let mark = UIImage(contentsOfFile: buildFolder.appendingPathComponent("icon/128.png").path)

  func start(arguments: UserDefaults = .standard) async {
    if arguments.bool(forKey: "reset") {
      try? FileManager.default.removeItem(at: Self.storeFolder)
      await WebKitEngine.removeAppStore()
      Log.app.info("app data reset")
    }
    let handler = AppSchemeHandler(root: Self.buildFolder)
    engine = WebKitEngine(schemeHandler: handler)
    var manifest: Manifest?
    do {
      guard let data = handler.file("/manifest.json") else {
        throw Manifest.Refusal(unsupported: ["no bundled build (scripts/bundle-build.sh)"])
      }
      manifest = try Manifest.read(String(decoding: data, as: UTF8.self))
    } catch {
      refusal = "\(error)"
      Log.app.error("Langle does not run: \(String(describing: error), privacy: .public)")
    }
    router = Router(
      options: .init(origin: AppSchemeHandler.origin, version: manifest?.version ?? "0"),
      persistence: FilePersistence(directory: Self.storeFolder), clock: DispatchClock())
    router.onError = { Log.bridge.error("\($0, privacy: .public)") }
    router.onAction = { [weak self] in self?.perform($0) }
    shell = Shell(origin: AppSchemeHandler.origin, tabs: router.tabs)

    if let manifest {
      let injector = ContentInjector(manifest: manifest, read: handler.file)
      self.injector = injector
      handler.generated["/host.html"] = injector.hostPage()
      let host = ExtensionHost(engine: engine, router: router, injector: injector)
      host.onRecreated = { [weak self] in self?.reloadPages() }
      hostView.addSubview(host.slot)
      self.host = host
      host.start()
    }

    makeBrowsingPage()
    _ = page(for: .home)
    if let start = arguments.string(forKey: "url") { follow(shell.open(start)) }
    syncScreen()
    started = true
    #if DEBUG
      CheckCommands.shared.start(model: self)
    #endif
  }

  private func makeBrowsingPage() {
    let tabId = shell.browsingTab
    let injector = self.injector
    browsing = ContextPage(
      engine: engine, profile: .browsing, router: router, world: .langle,
      spec: { _ in .content(tabId: tabId) },
      scripts: { injector?.webPageScripts(for: $0) ?? [] })
    browsing.onCommit = { [weak self] url in
      guard let self else { return }
      shell.committed(tab: tabId, url: url.absoluteString)
      // The new document's own site name: an ask made when the address changed (a back or
      // forward changes it before the commit) may have read the document it replaced.
      if url.absoluteString != "about:blank" { askSiteName(url) }
      barScroll.reset()
      barShown = true
    }
    browsing.onNavigate = { [weak self] url, title, back, forward in
      self?.navigated(url: url, title: title, back: back, forward: forward)
    }
    browsing.onScroll = { [weak self] y in
      guard let self, screen == .page, !fullscreen else { return }
      let shown = barScroll.scrolled(to: y, at: CACurrentMediaTime())
      if shown != barShown { barShown = shown }
    }
    browsing.onProcessGone = { [weak self] in self?.browsing.page.reload() }
    browsing.onFullscreen = { [weak self] on in
      guard let self else { return }
      fullscreen = on
      Orientation.fullscreen(on)
      // Turning the phone back to portrait leaves fullscreen.
      rotation = on ? RotationWatch { [weak self] in self?.browsing.page.exitFullscreen() } : nil
    }
  }

  /// The tab's page, made and loaded the first time it is wanted, then kept.
  func page(for tab: AppTab) -> ContextPage? {
    if let page = tabPages[tab] { return page }
    guard let url = URL(string: router.tabs.get(shell.tabId(tab))?.url ?? "") else { return nil }
    let page = appPage(url: url, tabId: shell.tabId(tab))
    tabPages[tab] = page
    return page
  }

  private func appPage(url: URL, tabId: Int?) -> ContextPage? {
    guard let injector else { return nil }
    let context = ContextPage(
      engine: engine, profile: .app, router: router, world: .page,
      spec: { .page(url: $0.absoluteString, tabId: tabId) },
      scripts: { _ in injector.appPageScripts() })
    context.onCommit = { [weak self] url in
      guard let self, let tabId else { return }
      follow(shell.committed(tab: tabId, url: url.absoluteString))
    }
    context.onProcessGone = { [weak context] in context?.page.reload() }
    context.load(url)
    return context
  }

  // MARK: the shell's controls

  /// A tap on the tab bar.
  func select(_ tab: AppTab) {
    _ = page(for: tab)
    shell.select(tab)
    syncScreen()
  }

  /// ‹ on the title bar: Home, the page kept with its media paused (`syncScreen`).
  func goHome() {
    shell.home()
    syncScreen()
  }

  /// The edge swipe from a page's first history entry.
  func back() {
    switch shell.back(canGoBack: canGoBack) {
    case .history: browsing.page.goBack()
    case .home:
      syncScreen()
    case .none: break
    }
  }

  /// The edge swipe goes Home only from the page's first history entry (WebKit's own swipe
  /// goes back in its history).
  var edgeBackEnabled: Bool { screen == .page && !canGoBack && !fullscreen && sheet == nil }

  func goForward() { browsing.page.goForward() }

  /// The title bar's address field.
  func submit(_ text: String) {
    guard let url = PageAddress.forSearch(text) else { return }
    follow(shell.open(url))
  }

  var pageURL: URL? { browsing.page.url ?? shell.pageURL.flatMap(URL.init(string:)) }

  var editText: String { PageAddress.editText(for: pageURL?.absoluteString ?? "") }

  /// L: the Langle sheet over the page.
  func openLangle() {
    guard screen == .page, let url = URL(string: "\(AppSchemeHandler.origin)/popup.html"),
      let context = appPage(url: url, tabId: nil)
    else { return }
    present(Sheet(tabId: nil, context: context))
  }

  /// The sheet was swiped down or the dimmed page tapped.
  func closeSheet() {
    guard let sheet else { return }
    self.sheet = nil
    sheet.context.close()
    if let tabId = sheet.tabId, router.tabs.get(tabId) != nil { router.tabs.remove(tabId) }
  }

  func pauseMedia() {
    Task { _ = await browsing.page.evaluate(world: .langle, source: PageCommands.pauseMedia) }
  }

  // MARK: router actions

  private func perform(_ action: RouterAction) {
    Log.app.info("router: \(String(describing: action), privacy: .public)")
    switch action {
    case .reloadTab(let id): reloadTab(id)
    case .reloadHost: host?.reload()
    default:
      guard shell.asksCanonical(action) else { return follow(shell.handle(action)) }
      // Asked now: the page's canonical address changes as it navigates.
      Task { [weak self] in
        guard let self else { return }
        let answer = await browsing.page.evaluate(world: .page, source: PageCommands.canonical)
        let canonical = answer.isEmpty || answer.hasPrefix("error:") ? nil : answer
        follow(shell.handle(action, canonical: canonical))
      }
    }
  }

  private func follow(_ step: ShellStep) {
    switch step {
    case .nothing, .show:
      break
    case .showTab(let tab, let load):
      if let load, let url = URL(string: load), let page = tabPages[tab] {
        page.load(url)
      } else {
        _ = page(for: tab)
      }
    case .loadTab(let tab, let url):
      if let url = URL(string: url) { page(for: tab)?.load(url) }
    case .loadPage(let address):
      if let url = URL(string: address) { browsing.load(url) }
    case .startFirstRun(let address, let tabId):
      firstRun?.close()
      firstRun = URL(string: address).flatMap { appPage(url: $0, tabId: tabId) }
    case .firstRunFromTab(let tab, let address, let tabId):
      // The tab's page goes after the commit that asked for it; `page(for:)` makes it again.
      if let page = tabPages.removeValue(forKey: tab) {
        page.onCommit = nil
        DispatchQueue.main.async { page.close() }
      }
      if let tabId {
        firstRun?.close()
        firstRun = URL(string: address).flatMap { appPage(url: $0, tabId: tabId) }
      }
    case .endFirstRun:
      break
    case .appSheet(let address, let tabId):
      if let url = URL(string: address), let context = appPage(url: url, tabId: tabId) {
        present(Sheet(tabId: tabId, context: context))
      }
    case .closeAppSheet(let tabId):
      if sheet?.tabId == tabId { closeSheet() }
    case .langleSheet:
      openLangle()
    }
    // The first run's page lives as long as its tab.
    if !shell.firstRunOpen, let page = firstRun {
      page.close()
      firstRun = nil
    }
    if case .loadPage = step, sheet != nil { closeSheet() }
    syncScreen()
  }

  private func present(_ next: Sheet) {
    if let sheet {
      sheet.context.close()
      if let tabId = sheet.tabId, router.tabs.get(tabId) != nil { router.tabs.remove(tabId) }
    }
    sheet = next
  }

  /// The screen `Shell` chose; a sheet over the page goes when another screen shows, and the
  /// sheet's own buttons (word list, settings) leave the page. A page left by any way (‹, the
  /// edge swipe, the sheet's buttons) is kept with its media paused.
  private func syncScreen() {
    let now = shell.screen
    guard now != screen else { return }
    if sheet != nil { closeSheet() }
    if screen == .page {
      barShown = true
      pauseMedia()
    }
    screen = now
  }

  private func reloadTab(_ id: Int) {
    if id == shell.browsingTab {
      browsing.page.reload()
    } else if let tab = AppTab.allCases.first(where: { shell.tabId($0) == id }) {
      tabPages[tab]?.page.reload()
    } else if let sheet, sheet.tabId == id {
      sheet.context.page.reload()
    } else if let firstRun, router.tabs.get(id)?.url.hasSuffix("/welcome.html") == true {
      firstRun.page.reload()
    }
  }

  private func navigated(url: URL?, title: String, back: Bool, forward: Bool) {
    canGoBack = back
    canGoForward = forward
    guard let url, url.absoluteString != "about:blank" else { return }
    router.tabs.setURL(shell.browsingTab, url.absoluteString)
    if url != siteAskedFor { askSiteName(url) }
    self.title = title.isEmpty ? SiteName.of(url: url.absoluteString, ogSiteName: nil) : title
    site = SiteName.of(url: url.absoluteString, ogSiteName: ogSiteName)
  }

  /// Asks the page for its `og:site_name`; only the latest ask's answer counts.
  private func askSiteName(_ url: URL) {
    siteAskedFor = url
    ogSiteName = nil
    siteAsks += 1
    let ask = siteAsks
    site = SiteName.of(url: url.absoluteString, ogSiteName: nil)
    Task { [weak self] in
      guard let self else { return }
      let named = await browsing.page.evaluate(world: .langle, source: PageCommands.siteName)
      guard ask == siteAsks, browsing.page.url == url else { return }
      ogSiteName = named.hasPrefix("error:") ? nil : named
      site = SiteName.of(url: url.absoluteString, ogSiteName: ogSiteName)
    }
  }

  /// After the host came back: the pages reload, as a browser restores crashed tabs.
  private func reloadPages() {
    browsing.page.reload()
    for page in tabPages.values { page.page.reload() }
    firstRun?.page.reload()
    sheet?.context.page.reload()
  }
}

/// Timers on the main queue, while the app runs.
final class DispatchClock: Clock {
  func now() -> Double { Date().timeIntervalSince1970 * 1000 }

  func schedule(after ms: Double, _ run: @escaping () -> Void) -> AnyObject {
    let item = DispatchWorkItem(block: run)
    DispatchQueue.main.asyncAfter(deadline: .now() + ms / 1000, execute: item)
    return item
  }

  func cancel(_ token: AnyObject) { (token as? DispatchWorkItem)?.cancel() }
}
