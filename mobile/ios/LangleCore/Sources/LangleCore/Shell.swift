import Foundation

/// The screens under the tab bar: app-origin pages, one each, kept while the app runs.
public enum AppTab: String, CaseIterable, Sendable {
  case home
  case words
  case settings

  /// The page each tab shows (docs/specs/mobile-app.md "The `langle-app` build target").
  public var path: String {
    switch self {
    case .home: "/home.html"
    case .words: "/wordlist.html"
    case .settings: "/options.html"
    }
  }
}

/// What fills the window: the first run (no bars), a tab (the tab bar), or the page over Home
/// (the title bar).
public enum Screen: Equatable, Sendable {
  case firstRun
  case tab(AppTab)
  case page
}

/// What the shell does for a router action, beyond the screen and the tabs `Shell` keeps.
public enum ShellStep: Equatable, Sendable {
  case nothing
  /// Only the screen changes (to the page already loaded, or the first run again).
  case show(Screen)
  /// The tab shows; `load`: the address its page loads first (it asked for another one).
  case showTab(AppTab, load: String?)
  /// A tab's page loads another address, wherever the screen is.
  case loadTab(AppTab, url: String)
  /// The browsing page loads the address and shows over Home.
  case loadPage(String)
  /// `welcome.html` in its tab, full screen.
  case startFirstRun(url: String, tabId: Int)
  /// The tab's page went to `welcome.html` (Words or Settings before setup): that page goes and
  /// is made again, at the tab's own address, when the tab next shows; the first run shows full
  /// screen in its own tab (`tabId`, just opened; nil: the first run already open).
  case firstRunFromTab(AppTab, url: String, tabId: Int?)
  /// The first run's tab closed: Home shows.
  case endFirstRun
  /// Another app page, in the sheet frame.
  case appSheet(url: String, tabId: Int)
  case closeAppSheet(tabId: Int)
  /// The Langle sheet (`popup.html`) over the page.
  case langleSheet
}

/// What back does on the page: its history first, then Home.
public enum BackStep: Equatable, Sendable {
  case history
  case home
  case none
}

/// The app's screens over the router's tabs (docs/specs/mobile-app.md "The shells (native)"):
/// Home, Words and Settings in a tab each, one browsing tab for every web page, and the first
/// run. It keeps `tabs.active` on what is on screen, so `tabs.query({ active: true })` (the
/// Langle sheet's) finds the page under it.
public final class Shell {
  public private(set) var screen: Screen = .tab(.home)
  /// A web page is loaded in the browsing tab (kept while Home shows).
  public private(set) var hasPage = false
  public let browsingTab: Int
  private let origin: String
  private let tabs: Tabs
  private var tabIds: [AppTab: Int] = [:]
  private var firstRunTab: Int?
  private var sheetTabs: Set<Int> = []
  /// A shared address waiting for the first run to close (one at most: a newer share replaces it).
  public private(set) var heldShare: String?
  /// A first run is about to open (Langle was just installed): a share waits for it.
  private var firstRunExpected = false

  public init(origin: String, tabs: Tabs) {
    self.origin = origin
    self.tabs = tabs
    for tab in AppTab.allCases {
      tabIds[tab] = tabs.open(url: origin + tab.path, active: tab == .home).id
    }
    browsingTab = tabs.open(url: "about:blank", active: false).id
  }

  public func tabId(_ tab: AppTab) -> Int { tabIds[tab]! }

  /// The first run's tab is open (shown, or kept while another screen shows).
  public var firstRunOpen: Bool { firstRunTab != nil }

  /// The browsing page's address, as its last commit said.
  public var pageURL: String? { hasPage ? tabs.get(browsingTab)?.url : nil }

  /// A tap on the tab bar.
  public func select(_ tab: AppTab) { show(.tab(tab)) }

  /// ‹ on the title bar: Home, the page kept.
  public func home() { show(.tab(.home)) }

  public func back(canGoBack: Bool) -> BackStep {
    guard screen == .page else { return .none }
    if canGoBack { return .history }
    home()
    return .home
  }

  /// A page opened from the shell itself (a launch argument, the title bar's address).
  public func open(_ url: String) -> ShellStep {
    tabs.setURL(browsingTab, url)
    hasPage = true
    show(.page)
    return .loadPage(url)
  }

  /// Another app's Share (docs/specs/mobile-app.md "M8: Share → Langle"): `url` in the one page,
  /// shown without a load when it is the page kept. Before the first run is done it waits, and
  /// opens once the first run closes.
  public func shared(_ url: String) -> ShellStep {
    if firstRunTab != nil || firstRunExpected {
      heldShare = url
      return .nothing
    }
    return openShared(url)
  }

  /// Langle was just installed: the first run is about to open, and a share waits for it.
  public func expectFirstRun() { firstRunExpected = true }

  /// The first run did not open after all: a share that waited for it opens.
  public func firstRunNotComing() -> ShellStep {
    firstRunExpected = false
    return firstRunTab == nil ? releaseShare() ?? .nothing : .nothing
  }

  private func openShared(_ url: String) -> ShellStep {
    if hasPage, PageTitle.samePage(pageURL, url) {
      show(.page)
      return .show(.page)
    }
    return open(url)
  }

  private func releaseShare() -> ShellStep? {
    guard let url = heldShare else { return nil }
    heldShare = nil
    return openShared(url)
  }

  /// A tab's page committed a new document. The first run's page leaving for a screen of its
  /// own (Settings, when the device was set up already) ends the first run there; a tab's page
  /// going to the first run (before setup) shows it in its own tab instead
  /// (docs/notes/mobile.md "Device checks of M4 (M4e, Android)").
  @discardableResult
  public func committed(tab id: Int, url: String) -> ShellStep {
    if path(of: url) == "/welcome.html", let tab = tabIds.first(where: { $0.value == id })?.key {
      return firstRun(from: tab, url: url)
    }
    tabs.setURL(id, url)
    guard id == firstRunTab, path(of: url) != "/welcome.html", let tab = appTab(url) else {
      return .nothing
    }
    tabs.remove(id)
    firstRunTab = nil
    show(.tab(tab))
    return releaseShare() ?? .showTab(tab, load: nil)
  }

  /// `canonical` is the kept page's `rel=canonical` address, when `asksCanonical` said to ask
  /// the page for it: a page opened by that address shows the kept page too.
  public func handle(_ action: RouterAction, canonical: String? = nil) -> ShellStep {
    switch action {
    case .openTab(let tab): return opened(tab, canonical: canonical)
    case .navigateTab(let tab): return navigated(tab)
    case .activateTab(let tab): return activated(tab)
    case .closeTab(let tab): return closed(tab)
    case .openPopup: return screen == .page ? .langleSheet : .nothing
    case .reloadTab, .reloadHost: return .nothing
    }
  }

  /// Whether `handle` wants the kept page's canonical address for `action`: a web page opened
  /// while a page is kept (Continue names a page by the address it reported, which can be the
  /// canonical one: www.youtube.com for a video on m.youtube.com).
  public func asksCanonical(_ action: RouterAction) -> Bool {
    guard case .openTab(let tab) = action else { return false }
    return hasPage && !isApp(tab.url)
  }

  // MARK: actions

  private func opened(_ tab: Tab, canonical: String?) -> ShellStep {
    guard isApp(tab.url) else {
      // One browsing page: a web page opened in a new tab opens there.
      tabs.remove(tab.id)
      if hasPage, let current = pageURL,
        sameDocument(current, tab.url) || canonical.map({ sameDocument($0, tab.url) }) == true
      {
        show(.page)
        return .show(.page)
      }
      return open(tab.url)
    }
    if path(of: tab.url) == "/welcome.html" {
      firstRunTab = tab.id
      firstRunExpected = false
      show(.firstRun)
      return .startFirstRun(url: tab.url, tabId: tab.id)
    }
    if let app = appTab(tab.url) {
      tabs.remove(tab.id)
      let id = tabId(app)
      let load = tabs.get(id)?.url == tab.url ? nil : tab.url
      if let load { tabs.setURL(id, load) }
      show(.tab(app))
      return .showTab(app, load: load)
    }
    sheetTabs.insert(tab.id)
    return .appSheet(url: tab.url, tabId: tab.id)
  }

  private func navigated(_ tab: Tab) -> ShellStep {
    if tab.id == browsingTab {
      hasPage = true
      show(.page)
      return .loadPage(tab.url)
    }
    if let app = tabIds.first(where: { $0.value == tab.id })?.key {
      return .loadTab(app, url: tab.url)
    }
    return .nothing
  }

  private func activated(_ tab: Tab) -> ShellStep {
    if tab.id == firstRunTab {
      show(.firstRun)
      return .show(.firstRun)
    }
    // The setup's own steps (it shows the page it came from) do not end the first run.
    if screen == .firstRun { return .nothing }
    if tab.id == browsingTab {
      guard hasPage else { return .nothing }
      show(.page)
      return .show(.page)
    }
    if let app = tabIds.first(where: { $0.value == tab.id })?.key {
      show(.tab(app))
      return .showTab(app, load: nil)
    }
    return .nothing
  }

  private func closed(_ tab: Tab) -> ShellStep {
    if tab.id == firstRunTab {
      firstRunTab = nil
      show(.tab(.home))
      return releaseShare() ?? .endFirstRun
    }
    if sheetTabs.remove(tab.id) != nil { return .closeAppSheet(tabId: tab.id) }
    return .nothing
  }

  private func firstRun(from tab: AppTab, url: String) -> ShellStep {
    tabs.setURL(tabId(tab), origin + tab.path)
    var opened: Int?
    if firstRunTab == nil {
      let id = tabs.open(url: url, active: false).id
      firstRunTab = id
      firstRunExpected = false
      opened = id
    }
    show(.firstRun)
    return .firstRunFromTab(tab, url: url, tabId: opened)
  }

  // MARK: helpers

  private func show(_ next: Screen) {
    screen = next
    switch next {
    case .firstRun: if let firstRunTab { tabs.activate(firstRunTab) }
    case .tab(let tab): tabs.activate(tabId(tab))
    case .page: tabs.activate(browsingTab)
    }
  }

  private func isApp(_ url: String) -> Bool { url.hasPrefix(origin + "/") }

  private func path(of url: String) -> String? { URLComponents(string: url)?.path }

  private func appTab(_ url: String) -> AppTab? {
    guard isApp(url) else { return nil }
    let path = path(of: url)
    return AppTab.allCases.first { $0.path == path }
  }

  /// The same document: the addresses differ at most in their fragment.
  private func sameDocument(_ a: String, _ b: String) -> Bool {
    a.split(separator: "#", maxSplits: 1).first == b.split(separator: "#", maxSplits: 1).first
  }
}

/// The site on the title bar's second line.
public enum SiteName {
  /// The page's `og:site_name`, else its host without `www.` or `m.` ("" without a host).
  public static func of(url: String, ogSiteName: String?) -> String {
    let named = ogSiteName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if !named.isEmpty { return named }
    guard let host = URLComponents(string: url)?.host?.lowercased() else { return "" }
    for prefix in ["www.", "m."] where host.hasPrefix(prefix) {
      return String(host.dropFirst(prefix.count))
    }
    return host
  }
}

/// The title bar's first line through a page's loads: the title the document reported, kept
/// through a reload of the same page until the reloaded document reports its own (WebKit reports
/// an empty title meanwhile), the host while a new page has none.
public struct PageTitle {
  /// The current document's own title, once reported.
  public private(set) var own: String?
  private var document: String?

  public init() {}

  /// A document committed at `url`. True when it is the page shown before (a reload): its title
  /// and site name stay until the document's own are read.
  @discardableResult
  public mutating func committed(_ url: String) -> Bool {
    let same = Self.samePage(document, url)
    if !same { own = nil }
    document = url
    return same
  }

  /// WebKit reported `title` for the page at `url`; blank or only the page's address is no title.
  public mutating func reported(_ title: String, url: String) {
    if let text = Self.own(title, url: url) { own = text }
  }

  /// The line shown for the page at `url`.
  public func line(url: String) -> String { own ?? SiteName.of(url: url, ogSiteName: nil) }

  /// The page's own title from a reported one: nil when it is blank or only the page's address.
  static func own(_ title: String, url: String) -> String? {
    let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.isEmpty || bareAddress(text) == bareAddress(url) { return nil }
    return text
  }

  /// Whether `a` and `b` are one page (the fragment aside).
  static func samePage(_ a: String?, _ b: String) -> Bool {
    guard let a else { return false }
    return a.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).first
      == b.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).first
  }

  /// An address without its scheme and trailing slash, in lower case.
  private static func bareAddress(_ text: String) -> String {
    var bare = text.lowercased()
    if let range = bare.range(of: "^[a-z][a-z0-9+.-]*://", options: .regularExpression) {
      bare.removeSubrange(range)
    }
    while bare.hasSuffix("/") { bare.removeLast() }
    return bare
  }
}

/// What the title bar's address field opens, with Home's rules (src/entrypoints/home/address.ts).
public enum PageAddress {
  public static let search = "https://m.youtube.com/results?search_query="

  /// An http(s) address as typed; text with a dot and no space as an address (`https://`
  /// added); anything else a YouTube search. Nil for blank text.
  public static func forSearch(_ text: String) -> String? {
    let typed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if typed.isEmpty { return nil }
    let lower = typed.lowercased()
    if lower.hasPrefix("http://") || lower.hasPrefix("https://") {
      return parsed(typed) ?? searching(typed)
    }
    if typed.contains("."), !typed.contains(where: \.isWhitespace) {
      return parsed("https://\(typed)") ?? searching(typed)
    }
    return searching(typed)
  }

  /// Whether `url` is a web page's address (http or https): what the browsing page loads.
  /// `javascript:` would run in the shown document, `file:` would read the phone's files.
  public static func isWeb(_ url: URL) -> Bool {
    ["http", "https"].contains(url.scheme?.lowercased() ?? "")
  }

  /// Whether `url` is on `origin` (scheme and host, no port): app pages stay on the app origin,
  /// `langle-app://app`, since their page world holds the bridge (docs/specs/mobile-app.md
  /// "Contexts").
  public static func isOn(_ origin: String, _ url: URL) -> Bool {
    guard let own = URL(string: origin) else { return false }
    return url.scheme?.lowercased() == own.scheme && url.host?.lowercased() == own.host
      && url.port == nil
  }

  /// The text editing starts from: the search on a YouTube results page, else the address.
  public static func editText(for url: String) -> String {
    if url.hasPrefix(search), let parts = URLComponents(string: url),
      let query = parts.percentEncodedQueryItems?.first(where: { $0.name == "search_query" })?.value
    {
      return query.replacingOccurrences(of: "+", with: " ").removingPercentEncoding ?? query
    }
    return url == "about:blank" ? "" : url
  }

  /// `encodeURIComponent`: everything but letters, digits and `-_.!~*'()` is escaped.
  private static let component = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

  static func searching(_ text: String) -> String {
    search + (text.addingPercentEncoding(withAllowedCharacters: component) ?? "")
  }

  /// The address as a browser reads it (scheme and host in lower case, `/` for no path), if
  /// it reads it and it has a host.
  private static func parsed(_ text: String) -> String? {
    guard var parts = URLComponents(string: text), let host = parts.host, !host.isEmpty else {
      return nil
    }
    parts.scheme = parts.scheme?.lowercased()
    parts.host = host.lowercased()
    if parts.percentEncodedPath.isEmpty { parts.percentEncodedPath = "/" }
    return parts.string
  }
}

/// The title bar slides away while the page scrolls down and comes back when it scrolls up or
/// reaches the top. Moves shorter than `threshold`, and those right after the bar moved (the
/// page resizing under it), do not count.
public struct TitleBarScroll: Sendable {
  public private(set) var shown = true
  public static let threshold = 24.0
  /// Seconds after the bar moved in which offsets are only followed.
  public static let settle = 0.4

  private var last = 0.0
  private var travel = 0.0
  private var movedAt = -Double.infinity

  public init() {}

  /// The page's scroll offset is `y` at `time` (seconds); returns whether the bar shows.
  public mutating func scrolled(to y: Double, at time: Double) -> Bool {
    defer { last = y }
    if y <= 0 {
      set(true, at: time)
      return shown
    }
    if time - movedAt < Self.settle {
      travel = 0
      return shown
    }
    let dy = y - last
    travel = (travel >= 0) == (dy >= 0) ? travel + dy : dy
    if travel > Self.threshold {
      set(false, at: time)
    } else if travel < -Self.threshold {
      set(true, at: time)
    }
    return shown
  }

  /// A new page: the bar shows.
  public mutating func reset() {
    shown = true
    last = 0
    travel = 0
    movedAt = -Double.infinity
  }

  private mutating func set(_ on: Bool, at time: Double) {
    guard on != shown else { return }
    shown = on
    travel = 0
    movedAt = time
  }
}
