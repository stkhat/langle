import LangleCore
import XCTest

// The shell's screens (docs/specs/mobile-app.md "The shells (native)"): which screen a router
// action shows, back's order, the title bar's site and address, and its hiding on scroll.

private let home = "\(origin)/home.html"
private let words = "\(origin)/wordlist.html"
private let settings = "\(origin)/options.html"
private let welcome = "\(origin)/welcome.html"
private let video = "https://m.youtube.com/watch?v=iG9CE55wbtY"

/// A shell over a router's tabs, as the app makes it.
private func makeShell() -> (Shell, Tabs) {
  let tabs = Tabs()
  return (Shell(origin: origin, tabs: tabs), tabs)
}

/// What `tabs.create` does in the router: a new tab, active, then the action.
private func created(_ tabs: Tabs, _ url: String) -> RouterAction {
  .openTab(tabs.open(url: url))
}

final class ShellScreensTests: XCTestCase {
  func test_starts_on_Home_with_one_tab_for_each_screen_and_the_page_Home_active() {
    let (shell, tabs) = makeShell()
    XCTAssertEqual(shell.screen, .tab(.home))
    XCTAssertEqual(tabs.all.map(\.url), [home, words, settings, "about:blank"])
    XCTAssertEqual(tabs.active?.id, shell.tabId(.home))
    XCTAssertFalse(shell.hasPage)
  }

  func test_the_tab_bar_switches_screens_and_the_active_tab() {
    let (shell, tabs) = makeShell()
    shell.select(.words)
    XCTAssertEqual(shell.screen, .tab(.words))
    XCTAssertEqual(tabs.active?.id, shell.tabId(.words))
    shell.select(.settings)
    XCTAssertEqual(tabs.active?.url, settings)
  }

  func test_the_word_list_and_settings_from_the_sheet_switch_tabs_and_drop_the_new_tab() {
    let (shell, tabs) = makeShell()
    _ = shell.handle(created(tabs, video))
    XCTAssertEqual(shell.handle(created(tabs, words)), .showTab(.words, load: nil))
    XCTAssertEqual(shell.screen, .tab(.words))
    XCTAssertEqual(tabs.all.count, 4)
    XCTAssertEqual(tabs.active?.id, shell.tabId(.words))
    // runtime.openOptionsPage opens options.html the same way.
    XCTAssertEqual(shell.handle(created(tabs, settings)), .showTab(.settings, load: nil))
    XCTAssertEqual(shell.screen, .tab(.settings))
    XCTAssertEqual(tabs.all.count, 4)
  }

  func test_an_app_page_with_another_address_loads_it_into_its_tab() {
    let (shell, tabs) = makeShell()
    let url = "\(words)#term=bread"
    XCTAssertEqual(shell.handle(created(tabs, url)), .showTab(.words, load: url))
    XCTAssertEqual(tabs.get(shell.tabId(.words))?.url, url)
  }

  func test_a_web_page_opens_over_Home_in_the_one_browsing_tab() {
    let (shell, tabs) = makeShell()
    XCTAssertEqual(shell.handle(created(tabs, video)), .loadPage(video))
    XCTAssertEqual(shell.screen, .page)
    XCTAssertTrue(shell.hasPage)
    XCTAssertEqual(tabs.all.count, 4)
    XCTAssertEqual(tabs.active?.id, shell.browsingTab)
    XCTAssertEqual(tabs.active?.url, video)
    // Another page loads into the same tab.
    XCTAssertEqual(shell.handle(created(tabs, article)), .loadPage(article))
    XCTAssertEqual(tabs.all.count, 4)
  }

  func test_the_page_already_shown_is_shown_again_without_a_load() {
    let (shell, tabs) = makeShell()
    _ = shell.handle(created(tabs, video))
    shell.home()
    XCTAssertEqual(shell.screen, .tab(.home))
    XCTAssertEqual(tabs.active?.id, shell.tabId(.home))
    XCTAssertEqual(shell.handle(created(tabs, "\(video)#t=1")), .show(.page))
    XCTAssertEqual(shell.screen, .page)
    XCTAssertEqual(tabs.active?.id, shell.browsingTab)
  }

  func test_the_kept_page_is_shown_again_by_its_canonical_address() {
    // Continue names m.youtube.com's videos by their canonical www.youtube.com address.
    let (shell, tabs) = makeShell()
    let canonical = "https://www.youtube.com/watch?v=iG9CE55wbtY"
    _ = shell.handle(created(tabs, video))
    shell.home()
    let action = created(tabs, canonical)
    XCTAssertTrue(shell.asksCanonical(action))
    XCTAssertEqual(shell.handle(action, canonical: canonical), .show(.page))
    XCTAssertEqual(tabs.get(shell.browsingTab)?.url, video)
    shell.home()
    XCTAssertEqual(shell.handle(created(tabs, canonical)), .loadPage(canonical))
  }

  func test_the_canonical_address_is_asked_for_only_for_a_web_page_over_a_kept_page() {
    let (shell, tabs) = makeShell()
    XCTAssertFalse(shell.asksCanonical(created(tabs, video)))
    _ = shell.handle(created(tabs, video))
    XCTAssertFalse(shell.asksCanonical(created(tabs, words)))
    XCTAssertTrue(shell.asksCanonical(created(tabs, article)))
  }

  func test_the_page_follows_its_commits() {
    let (shell, tabs) = makeShell()
    _ = shell.handle(created(tabs, video))
    shell.committed(tab: shell.browsingTab, url: article)
    XCTAssertEqual(shell.pageURL, article)
    XCTAssertEqual(shell.handle(created(tabs, article)), .show(.page))
  }

  func test_the_first_run_shows_welcome_until_its_tab_is_closed_then_Home() {
    let (shell, tabs) = makeShell()
    let step = shell.handle(created(tabs, welcome))
    let welcomeTab = tabs.active!
    XCTAssertEqual(step, .startFirstRun(url: welcome, tabId: welcomeTab.id))
    XCTAssertEqual(shell.screen, .firstRun)
    // The setup's tab shows the page it came from first, then closes itself.
    XCTAssertEqual(shell.handle(.activateTab(tabs.get(shell.tabId(.home))!)), .nothing)
    XCTAssertEqual(shell.screen, .firstRun)
    tabs.remove(welcomeTab.id)
    XCTAssertEqual(shell.handle(.closeTab(welcomeTab)), .endFirstRun)
    XCTAssertEqual(shell.screen, .tab(.home))
    XCTAssertEqual(tabs.active?.id, shell.tabId(.home))
  }

  func test_the_first_run_shown_again_brings_its_tab_back() {
    let (shell, tabs) = makeShell()
    _ = shell.handle(created(tabs, welcome))
    let welcomeTab = tabs.active!
    shell.select(.home)
    XCTAssertEqual(shell.handle(.activateTab(welcomeTab)), .show(.firstRun))
    XCTAssertEqual(shell.screen, .firstRun)
  }

  func test_the_first_run_leaving_for_another_screen_ends_there() {
    let (shell, tabs) = makeShell()
    _ = shell.handle(created(tabs, welcome))
    let welcomeTab = tabs.active!
    XCTAssertEqual(
      shell.committed(tab: welcomeTab.id, url: settings), .showTab(.settings, load: nil))
    XCTAssertEqual(shell.screen, .tab(.settings))
    XCTAssertNil(tabs.get(welcomeTab.id))
  }

  func test_Words_before_setup_goes_to_the_first_run_in_its_own_tab_and_Words_is_made_again() {
    let (shell, tabs) = makeShell()
    shell.select(.words)
    let step = shell.committed(tab: shell.tabId(.words), url: welcome)
    let firstRun = tabs.active!
    XCTAssertNotEqual(firstRun.id, shell.tabId(.words))
    XCTAssertEqual(step, .firstRunFromTab(.words, url: welcome, tabId: firstRun.id))
    XCTAssertEqual(shell.screen, .firstRun)
    XCTAssertEqual(tabs.get(shell.tabId(.words))?.url, words)
    // Start: the first run's tab is removed, Home shows; Words loads its own page again.
    tabs.remove(firstRun.id)
    XCTAssertEqual(shell.handle(.closeTab(firstRun)), .endFirstRun)
    XCTAssertEqual(shell.screen, .tab(.home))
    shell.select(.words)
    XCTAssertEqual(tabs.active?.url, words)
  }

  func test_a_tab_going_to_welcome_while_the_first_run_is_open_shows_that_first_run() {
    let (shell, tabs) = makeShell()
    _ = shell.handle(created(tabs, welcome))
    let welcomeTab = tabs.active!
    shell.select(.settings)
    XCTAssertEqual(
      shell.committed(tab: shell.tabId(.settings), url: welcome),
      .firstRunFromTab(.settings, url: welcome, tabId: nil))
    XCTAssertEqual(shell.screen, .firstRun)
    XCTAssertEqual(tabs.active?.id, welcomeTab.id)
    XCTAssertEqual(tabs.get(shell.tabId(.settings))?.url, settings)
  }

  func test_activating_a_kept_tab_or_the_page_shows_it() {
    let (shell, tabs) = makeShell()
    XCTAssertEqual(shell.handle(.activateTab(tabs.get(shell.tabId(.words))!)), .showTab(.words, load: nil))
    // No page yet: the browsing tab shows nothing.
    XCTAssertEqual(shell.handle(.activateTab(tabs.get(shell.browsingTab)!)), .nothing)
    _ = shell.handle(created(tabs, article))
    shell.home()
    XCTAssertEqual(shell.handle(.activateTab(tabs.get(shell.browsingTab)!)), .show(.page))
  }

  func test_tabs_update_with_an_address_loads_the_tab_it_names() {
    let (shell, tabs) = makeShell()
    tabs.setURL(shell.browsingTab, article)
    XCTAssertEqual(shell.handle(.navigateTab(tabs.get(shell.browsingTab)!)), .loadPage(article))
    XCTAssertEqual(shell.screen, .page)
    tabs.setURL(shell.tabId(.words), "\(words)?q=a")
    XCTAssertEqual(
      shell.handle(.navigateTab(tabs.get(shell.tabId(.words))!)),
      .loadTab(.words, url: "\(words)?q=a"))
    XCTAssertEqual(shell.screen, .page)
  }

  func test_other_app_pages_open_in_a_sheet_that_closes_with_its_tab() {
    let (shell, tabs) = makeShell()
    let other = "\(origin)/other.html"
    let step = shell.handle(created(tabs, other))
    let tab = tabs.active!
    XCTAssertEqual(step, .appSheet(url: other, tabId: tab.id))
    XCTAssertEqual(shell.handle(.closeTab(tab)), .closeAppSheet(tabId: tab.id))
  }

  func test_the_Langle_sheet_opens_only_over_a_page() {
    let (shell, tabs) = makeShell()
    // After the setup the background asks for the popup over Home: not there.
    XCTAssertEqual(shell.handle(.openPopup), .nothing)
    _ = shell.handle(created(tabs, article))
    XCTAssertEqual(shell.handle(.openPopup), .langleSheet)
  }
}

final class ShellBackTests: XCTestCase {
  func test_back_goes_through_the_history_then_Home() {
    let (shell, tabs) = makeShell()
    _ = shell.handle(created(tabs, article))
    XCTAssertEqual(shell.back(canGoBack: true), .history)
    XCTAssertEqual(shell.screen, .page)
    XCTAssertEqual(shell.back(canGoBack: false), .home)
    XCTAssertEqual(shell.screen, .tab(.home))
    XCTAssertTrue(shell.hasPage)
    XCTAssertEqual(tabs.active?.id, shell.tabId(.home))
  }

  func test_back_does_nothing_off_a_page() {
    let (shell, _) = makeShell()
    XCTAssertEqual(shell.back(canGoBack: true), .none)
    shell.select(.settings)
    XCTAssertEqual(shell.back(canGoBack: false), .none)
    XCTAssertEqual(shell.screen, .tab(.settings))
  }
}

final class TitleBarTextTests: XCTestCase {
  func test_the_site_is_og_site_name_else_the_host_without_www_or_m() {
    XCTAssertEqual(SiteName.of(url: video, ogSiteName: "YouTube"), "YouTube")
    XCTAssertEqual(SiteName.of(url: video, ogSiteName: nil), "youtube.com")
    XCTAssertEqual(SiteName.of(url: "https://www.bbc.co.uk/news", ogSiteName: "  "), "bbc.co.uk")
    XCTAssertEqual(SiteName.of(url: "https://en.wikipedia.org/wiki/Bread", ogSiteName: ""), "en.wikipedia.org")
    XCTAssertEqual(SiteName.of(url: "http://localhost:4719/article-en.html", ogSiteName: nil), "localhost")
    XCTAssertEqual(SiteName.of(url: "https://M.YouTube.com/", ogSiteName: nil), "youtube.com")
    XCTAssertEqual(SiteName.of(url: "about:blank", ogSiteName: nil), "")
    XCTAssertEqual(SiteName.of(url: article, ogSiteName: " The Weekend Table "), "The Weekend Table")
  }

  func test_editing_starts_from_the_search_on_a_results_page_else_the_address() {
    XCTAssertEqual(
      PageAddress.editText(for: "https://m.youtube.com/results?search_query=sourdough%20bread"),
      "sourdough bread")
    XCTAssertEqual(
      PageAddress.editText(for: "https://m.youtube.com/results?search_query=a+b"), "a b")
    XCTAssertEqual(PageAddress.editText(for: video), video)
    XCTAssertEqual(PageAddress.editText(for: "about:blank"), "")
  }
}

// A port of src/entrypoints/home/address.test.ts: the title bar edits with Home's rules.
private let search = "https://m.youtube.com/results?search_query="

final class PageForSearchTests: XCTestCase {
  func test_opens_an_http_s_address_as_typed() {
    XCTAssertEqual(PageAddress.forSearch("https://example.com/a?b=1"), "https://example.com/a?b=1")
    XCTAssertEqual(PageAddress.forSearch("  http://example.com  "), "http://example.com/")
    XCTAssertEqual(PageAddress.forSearch("HTTPS://Example.com/Path"), "https://example.com/Path")
  }

  func test_adds_https_to_text_with_a_dot_and_no_space() {
    XCTAssertEqual(PageAddress.forSearch("example.com"), "https://example.com/")
    XCTAssertEqual(
      PageAddress.forSearch("news.example.co.uk/story/1"), "https://news.example.co.uk/story/1")
    XCTAssertEqual(
      PageAddress.forSearch("m.youtube.com/watch?v=abc"), "https://m.youtube.com/watch?v=abc")
  }

  func test_searches_YouTube_for_anything_else() {
    XCTAssertEqual(PageAddress.forSearch("sourdough bread"), "\(search)sourdough%20bread")
    XCTAssertEqual(PageAddress.forSearch("bread"), "\(search)bread")
    XCTAssertEqual(PageAddress.forSearch("how to bake. fast"), "\(search)how%20to%20bake.%20fast")
    XCTAssertEqual(PageAddress.forSearch("javascript:alert(1)"), "\(search)javascript%3Aalert(1)")
    XCTAssertEqual(PageAddress.forSearch("C++ & Rust?"), "\(search)C%2B%2B%20%26%20Rust%3F")
  }

  func test_gives_nothing_for_blank_text() {
    XCTAssertNil(PageAddress.forSearch(""))
    XCTAssertNil(PageAddress.forSearch("   "))
  }
}

final class PageTitleTests: XCTestCase {
  private let page = "https://www.independent.co.uk/news/world/a-b3091723.html"

  func test_a_reload_keeps_the_title_until_the_document_reports_its_own() {
    var title = PageTitle()
    XCTAssertFalse(title.committed(page))
    title.reported("Fire | The Independent", url: page)
    XCTAssertTrue(title.committed(page))
    title.reported("", url: page)
    XCTAssertEqual(title.line(url: page), "Fire | The Independent")
    title.reported("Fire, updated | The Independent", url: page)
    XCTAssertEqual(title.line(url: page), "Fire, updated | The Independent")
    // The fragment aside, it is the same page.
    XCTAssertTrue(title.committed(page + "#comments"))
    XCTAssertEqual(title.line(url: page), "Fire, updated | The Independent")
  }

  func test_a_new_page_shows_its_host_until_it_reports_a_title() {
    var title = PageTitle()
    title.committed(page)
    title.reported("Fire | The Independent", url: page)
    let next = "https://www.nau.ch/politik/park-67206340"
    // WebKit may report the old title for the new address before the commit.
    title.reported("Fire | The Independent", url: next)
    XCTAssertFalse(title.committed(next))
    XCTAssertEqual(title.line(url: next), "nau.ch")
    title.reported("", url: next)
    XCTAssertEqual(title.line(url: next), "nau.ch")
    title.reported("Park | Nau.ch", url: next)
    XCTAssertEqual(title.line(url: next), "Park | Nau.ch")
  }

  func test_a_title_that_is_only_the_address_is_none() {
    var title = PageTitle()
    title.committed(page)
    title.reported(page, url: page)
    title.reported("www.independent.co.uk/news/world/a-b3091723.html", url: page)
    title.reported("  ", url: page)
    XCTAssertNil(title.own)
    XCTAssertEqual(title.line(url: page), "independent.co.uk")
    title.reported("example.com news", url: "https://example.com/")
    XCTAssertEqual(title.own, "example.com news")
    title.reported("Example.com", url: "https://example.com/")
    XCTAssertEqual(title.own, "example.com news")
  }
}

final class TitleBarScrollTests: XCTestCase {
  func test_hides_on_scrolling_down_and_shows_on_scrolling_up() {
    var bar = TitleBarScroll()
    XCTAssertTrue(bar.scrolled(to: 5, at: 0))
    XCTAssertFalse(bar.scrolled(to: 40, at: 0.1))
    XCTAssertFalse(bar.scrolled(to: 300, at: 1))
    // A small move back is not a scroll up.
    XCTAssertFalse(bar.scrolled(to: 295, at: 1.1))
    XCTAssertTrue(bar.scrolled(to: 270, at: 1.2))
  }

  func test_shows_at_the_top_whatever_the_direction() {
    var bar = TitleBarScroll()
    XCTAssertFalse(bar.scrolled(to: 100, at: 0))
    XCTAssertTrue(bar.scrolled(to: 0, at: 1))
    XCTAssertFalse(bar.scrolled(to: 100, at: 2))
    XCTAssertTrue(bar.scrolled(to: -30, at: 3))
  }

  func test_ignores_the_moves_its_own_resizing_makes() {
    var bar = TitleBarScroll()
    XCTAssertFalse(bar.scrolled(to: 1000, at: 0))
    // The page grew by the bar's height: at the bottom its offset is clamped back.
    XCTAssertFalse(bar.scrolled(to: 944, at: 0.1))
    XCTAssertTrue(bar.scrolled(to: 900, at: 1))
  }

  func test_starts_shown_again_for_a_new_page() {
    var bar = TitleBarScroll()
    _ = bar.scrolled(to: 500, at: 0)
    bar.reset()
    XCTAssertTrue(bar.shown)
    XCTAssertTrue(bar.scrolled(to: 0, at: 1))
  }
}
