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
  /// Why Langle does not run (no build, or what the app refuses in it); browsing still works.
  @Published private(set) var refusal: String?
  /// The shell's own strings in the interface language (docs/specs/mobile-app.md "Native strings
  /// follow the interface language"): kept in the app group, drawn at once on a cold start.
  @Published private(set) var strings = NativeStrings(
    english: AppModel.english, kept: AppModel.sharedStore.load(NativeStrings.name))
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
  /// The title bar's ⋮ menu is open.
  @Published var menuOpen = false
  private var barScroll = TitleBarScroll()
  private var rotation: RotationWatch?

  private(set) var engine: WebKitEngine!
  private(set) var router: Router!
  private(set) var shell: Shell!
  private(set) var host: ExtensionHost?
  /// Ad blocking on the browsing page (nil without the bundled build's `adblock/` files).
  private(set) var adBlocker: AdBlocker?
  /// Apple Translation and the host that answers the pages' translation calls with it.
  let translation = AppleTranslation()
  private var translationHost: TranslationHost?
  /// Google sign-in for Drive sync, and the lifecycle events that let it write before the app
  /// is suspended (docs/specs/mobile-app.md "M7").
  private var googleAuth: GoogleAuth?
  private var lifecycle: AppLifecycle?
  private let backgroundHold = BackgroundHold()
  private(set) var browsing: ContextPage!
  @Published private(set) var firstRun: ContextPage?
  @Published private(set) var tabPages: [AppTab: ContextPage] = [:]
  private var injector: ContentInjector?
  /// The site name asked for this address last (one ask per page).
  private var siteAskedFor: URL?
  private var ogSiteName: String?
  private var siteAsks = 0
  /// The title bar's first line, kept through a reload of the same page.
  private var pageTitle = PageTitle()

  /// The view the host's slot sits in (zero size, in the window).
  let hostView = UIView(frame: .zero)

  static let buildFolder = Bundle.main.resourceURL!.appendingPathComponent("langle-app")
  static let storeFolder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("LangleStore")
  /// The filter lists' copies and the engine built from them (the list store's `adblock/`).
  static let adblockFolder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("adblock")
  /// What the app keeps for its share extension too (the native strings), and what the extension
  /// leaves for the app (the shared item): `LangleShared` in the app group's container.
  static let sharedFolder = AppGroup.folder
  static let sharedStore = FilePersistence(directory: sharedFolder)
  /// Another app's Share, kept by the share extension (docs/specs/mobile-app.md "M8").
  static let inbox = SharedInbox(directory: sharedFolder)
  /// The built-in English, generated into the build from en.json (scripts/bundle-build.sh).
  static let english: [String: String] = {
    guard let url = Bundle.main.url(forResource: "native-strings-en", withExtension: "json"),
      let data = try? Data(contentsOf: url)
    else { return [:] }
    return NativeStrings.english(localeJSON: String(decoding: data, as: UTF8.self))
  }()
  /// Langle's mark (the toolbar icon of the bundled build).
  static let mark = UIImage(contentsOfFile: buildFolder.appendingPathComponent("icon/128.png").path)

  func start(arguments: UserDefaults = .standard) async {
    if arguments.bool(forKey: "reset") {
      try? FileManager.default.removeItem(at: Self.storeFolder)
      try? FileManager.default.removeItem(at: Self.adblockFolder)
      try? FileManager.default.removeItem(at: Self.sharedFolder)
      KeychainRefreshTokenStore().delete()
      strings = NativeStrings(english: Self.english)
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
      refusal = (error as? Manifest.Refusal)?.unsupported.joined(separator: ", ") ?? "\(error)"
      Log.app.error("Langle does not run: \(String(describing: error), privacy: .public)")
    }
    router = Router(
      options: .init(origin: AppSchemeHandler.origin, version: manifest?.version ?? "0"),
      persistence: FilePersistence(directory: Self.storeFolder), clock: DispatchClock())
    router.onError = { Log.bridge.error("\($0, privacy: .public)") }
    router.onAction = { [weak self] in self?.perform($0) }
    router.onShareFile = { file, done in FileShare.present(file, done: done) }
    router.onNativeStrings = { [weak self] set in self?.takeStrings(set) }
    shell = Shell(origin: AppSchemeHandler.origin, tabs: router.tabs)
    // Langle was just installed: the host's `runtime.onInstalled` opens the first run, and a share
    // waits for it. Should it not open (the host failed), the share opens anyway.
    if router.installed == nil {
      shell.expectFirstRun()
      DispatchQueue.main.asyncAfter(deadline: .now() + Self.firstRunWait) { [weak self] in
        guard let self else { return }
        follow(shell.firstRunNotComing())
      }
    }
    let translationHost = TranslationHost(engine: translation, clock: DispatchClock()) {
      [weak self] spec in self?.onScreen(spec) ?? false
    }
    self.translationHost = translationHost
    router.onTranslation = { [weak self] from, api, request, done in
      #if DEBUG
        self?.countTranslationCall(api, request)
      #endif
      translationHost.handle(from, api, request, done)
    }
    adBlocker = startAdBlocking(handler)
    startGoogleAuth()

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
    takeShared()
  }

  // MARK: Share → Langle

  /// How long a share right after installing waits for the first run to open (as Android's).
  private static let firstRunWait: TimeInterval = 15

  /// `langle://shared` (the share extension), or any other `langle://` address: the app is in
  /// front already; only the kept item is opened, so another app cannot open pages through it.
  func opened(url: URL) {
    Log.app.info("opened \(url.absoluteString, privacy: .public)")
    takeShared()
  }

  /// The item the share extension kept (at launch, on `langle://shared` and each time the scene
  /// becomes active): read once and opened in the one page, or held through the first run.
  func takeShared() {
    guard started, let item = Self.inbox.take() else { return }
    guard let address = item.address else {
      return Log.app.info("shared item with nothing to open")
    }
    Log.app.info("shared: \(address, privacy: .public)")
    menuOpen = false
    if sheet != nil { closeSheet() }
    follow(shell.shared(address))
  }

  /// A new set from the background: kept for the next start, and every bar redraws.
  private func takeStrings(_ set: NativeStringSet) {
    guard strings.take(set) else { return }
    do {
      try Self.sharedStore.save(NativeStrings.name, set.json)
    } catch {
      Log.app.error("could not keep the native strings: \(String(describing: error), privacy: .public)")
    }
  }

  // MARK: Google sign-in and the lifecycle

  /// The router's Google sign-in (the system's sheet, the refresh token in the Keychain) and the
  /// lifecycle events for the extension host. The store is the router's: `connected` goes with
  /// the app's data, as the background's cloud state does.
  private func startGoogleAuth() {
    let auth = GoogleAuth(
      sheet: WebAuthenticationSheet(), endpoint: URLSessionTokenEndpoint(),
      store: KeychainRefreshTokenStore(), persistence: FilePersistence(directory: Self.storeFolder),
      clock: DispatchClock())
    auth.onLog = { Log.app.info("googleAuth: \($0, privacy: .public)") }
    router.onGoogleAuth = auth.handle
    googleAuth = auth
    let lifecycle = AppLifecycle(router: router) { [weak self] on in self?.backgroundHold.hold(on) }
    lifecycle.onLog = { Log.app.info("\($0, privacy: .public)") }
    self.lifecycle = lifecycle
  }

  // MARK: ad blocking

  /// The list store and its engine (docs/specs/mobile-app.md "M6: ad blocking"): the lists and
  /// the scriptlets come with the bundled build, the lists' copies and the engine live in the
  /// app's files. The kept engine loads at once; fetching waits for the first run's Start.
  private func startAdBlocking(_ handler: AppSchemeHandler) -> AdBlocker? {
    guard let listsFile = handler.file("/adblock/filter-lists.json"),
      let resources = handler.file("/adblock/resources.json")
    else {
      Log.app.error("ad blocking is off: the bundled build has no adblock/ files (scripts/bundle-build.sh)")
      return nil
    }
    let lists = FilterList.read(String(decoding: listsFile, as: UTF8.self))
    let blocker = AdBlocker(router: router, dir: Self.adblockFolder, lists: lists, resources: resources)
    blocker.onRulesChanged = { [weak self] in self?.engine.blockingChanged() }
    blocker.onSwitches = { [weak self] old, new in
      guard let self, let url = browsing?.page.url, url.absoluteString != "about:blank" else { return }
      if AdBlockingSwitches.reloads(old, new, site: blocker.site(of: url)) { browsing.page.reload() }
    }
    router.onStorageChanged = { [weak blocker] area, changes in blocker?.storageChanged(area, changes) }
    engine.blocking = blocker
    blocker.start()
    return blocker
  }

  /// ⋮ "Block ads on this site", while blocking is on and the page has a site.
  var adSwitch: (site: String, blocking: Bool)? {
    guard let adBlocker, adBlocker.switches.on, let url = pageURL, let site = adBlocker.site(of: url)
    else { return nil }
    return (site, adBlocker.switches.blocks(site))
  }

  func setSiteBlocking(_ blocking: Bool) {
    guard let adBlocker, let site = adSwitch?.site else { return }
    adBlocker.setSite(site, blocking: blocking)
  }

  /// The app came on screen: the lists that are due are fetched.
  func cameOnScreen() {
    adBlocker?.inUse()
    lifecycle?.visible()
  }

  private func makeBrowsingPage() {
    let tabId = shell.browsingTab
    let injector = self.injector
    browsing = ContextPage(
      engine: engine, profile: .browsing, router: router, world: .langle,
      spec: { _ in .content(tabId: tabId) },
      // The scriptlets first: they must see the page's objects before anything else.
      scripts: { [weak self] url in
        (self?.adBlocker?.documentScripts(url) ?? []) + (injector?.webPageScripts(for: url) ?? [])
      })
    browsing.onCommit = { [weak self] url in
      guard let self else { return }
      shell.committed(tab: tabId, url: url.absoluteString)
      adBlocker?.inUse()
      // A reload (⋮'s switch reloads) keeps the title and site name shown until the document's
      // own are read: meanwhile WebKit reports an empty title.
      let reload = pageTitle.committed(url.absoluteString)
      // The new document's own site name: an ask made when the address changed (a back or
      // forward changes it before the commit) may have read the document it replaced.
      if url.absoluteString != "about:blank" {
        title = pageTitle.line(url: url.absoluteString)
        askSiteName(url, keepShown: reload)
        translationHost?.pageOpened()
      }
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
    menuOpen = false
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
    if url != siteAskedFor {
      askSiteName(url)
      // Another video in the same document (YouTube) is a page opened too.
      translationHost?.pageOpened()
    }
    pageTitle.reported(title, url: url.absoluteString)
    self.title = pageTitle.line(url: url.absoluteString)
    site = SiteName.of(url: url.absoluteString, ogSiteName: ogSiteName)
  }

  /// Asks the page for its `og:site_name`; only the latest ask's answer counts. `keepShown`: the
  /// site name shown stays until the answer (a reload of the same page).
  private func askSiteName(_ url: URL, keepShown: Bool = false) {
    siteAskedFor = url
    siteAsks += 1
    let ask = siteAsks
    if !keepShown {
      ogSiteName = nil
      site = SiteName.of(url: url.absoluteString, ogSiteName: nil)
    }
    Task { [weak self] in
      guard let self else { return }
      let named = await browsing.page.evaluate(world: .langle, source: PageCommands.siteName)
      guard ask == siteAsks, browsing.page.url == url else { return }
      ogSiteName = named.hasPrefix("error:") ? nil : named
      site = SiteName.of(url: url.absoluteString, ogSiteName: ogSiteName)
    }
  }

  // MARK: translation

  /// The app left the screen (scene background): the translator's memory goes back at once, and
  /// the background does its pending cloud writes now (`app.hidden`).
  func leftScreen() {
    translationHost?.leftScreen()
    lifecycle?.hidden()
  }

  #if DEBUG
    /// The pages' translation calls since the launch, by kind (check builds' `translate-state`):
    /// "translate" (a sentence that may start the engine), "translate-list" (`start: false`),
    /// "translatorStatus", "prepareTranslator".
    private(set) var translationCalls: [String: Int] = [:]

    private func countTranslationCall(_ api: String, _ request: JSONValue?) {
      var kind = String(api.dropFirst("appHost.".count))
      if kind == "translate", request?["start"]?.bool == false { kind = "translate-list" }
      translationCalls[kind, default: 0] += 1
    }

    /// `translate-state`: whether the engine runs and for which pairs, whether it is off after
    /// failures, and the calls counted so far.
    var translationState: String {
      let calls = translationCalls.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }
      let loaded = translationHost?.loadedPairs ?? []
      return
        "running=\(!loaded.isEmpty) loaded=[\(loaded.joined(separator: ", "))] off=\(translationHost?.isOff ?? false) calls=[\(calls.joined(separator: ", "))]"
    }
  #endif

  /// Whether a context's page shows now: only that page gets translations (others get null).
  private func onScreen(_ spec: ContextSpec) -> Bool {
    guard UIApplication.shared.applicationState != .background else { return false }
    switch spec {
    case .host:
      return true
    case .content(let tabId, _):
      return tabId == shell.browsingTab && screen == .page
    case .page(_, let tabId):
      // No tab: the Langle sheet.
      guard let tabId else { return sheet != nil && sheet?.tabId == nil }
      if sheet?.tabId == tabId { return true }
      if let tab = AppTab.allCases.first(where: { shell.tabId($0) == tabId }) {
        return screen == .tab(tab)
      }
      return screen == .firstRun
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
