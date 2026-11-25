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

  /// A tab's page committed a new document. The first run's page leaving for a screen of its
  /// own (Settings, when the device was set up already) ends the first run there.
  @discardableResult
  public func committed(tab id: Int, url: String) -> ShellStep {
    tabs.setURL(id, url)
    guard id == firstRunTab, path(of: url) != "/welcome.html", let tab = appTab(url) else {
      return .nothing
    }
    tabs.remove(id)
    firstRunTab = nil
    show(.tab(tab))
    return .showTab(tab, load: nil)
  }

  public func handle(_ action: RouterAction) -> ShellStep {
    switch action {
    case .openTab(let tab): return opened(tab)
    case .navigateTab(let tab): return navigated(tab)
    case .activateTab(let tab): return activated(tab)
    case .closeTab(let tab): return closed(tab)
    case .openPopup: return screen == .page ? .langleSheet : .nothing
    case .reloadTab, .reloadHost: return .nothing
    }
  }

  // MARK: actions

  private func opened(_ tab: Tab) -> ShellStep {
    guard isApp(tab.url) else {
      // One browsing page: a web page opened in a new tab opens there.
      tabs.remove(tab.id)
      if hasPage, let current = pageURL, sameDocument(current, tab.url) {
        show(.page)
        return .show(.page)
      }
      return open(tab.url)
    }
    if path(of: tab.url) == "/welcome.html" {
      firstRunTab = tab.id
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
      return .endFirstRun
    }
    if sheetTabs.remove(tab.id) != nil { return .closeAppSheet(tabId: tab.id) }
    return .nothing
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

  private static func searching(_ text: String) -> String {
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
