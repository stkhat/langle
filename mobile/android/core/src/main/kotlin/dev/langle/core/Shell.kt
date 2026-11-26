package dev.langle.core

/** The app's three tabs, each one app page kept for the app's life. */
enum class AppTab(val path: String) {
  HOME("/home.html"),
  WORDS("/wordlist.html"),
  SETTINGS("/options.html");

  companion object {
    fun of(path: String): AppTab? = entries.firstOrNull { it.path == path }
  }
}

/** What is on screen (docs/specs/mobile-app.md "The shells (native)"). */
sealed interface Screen {
  /** `welcome.html` full screen, without the tab bar, until setup is done. */
  data object FirstRun : Screen

  /** Home, Words or Settings, under the tab bar. */
  data class OnTab(val tab: AppTab) : Screen

  /** The one browsing page, over Home, under the title bar. */
  data object Page : Screen
}

/** What the shell's views do, in order, for a router action, a tap or back. */
sealed interface ShellEffect {
  data class Show(val screen: Screen) : ShellEffect

  /** Loads [url] in the screen's page. */
  data class Load(val screen: Screen, val url: String) : ShellEffect

  data class Reload(val screen: Screen) : ShellEffect

  /** One step back in the screen's page's history. */
  data class GoBack(val screen: Screen) : ShellEffect

  /** The first run's page is created for its tab. */
  data class OpenFirstRun(val url: String, val tabId: Int) : ShellEffect

  data object CloseFirstRun : ShellEffect

  /** The tab's page goes; it is made again, at the tab's address, when the tab is next shown. */
  data class DropTabPage(val tab: AppTab) : ShellEffect

  /** An app page in the sheet frame: the Langle sheet (no tab), or another app page a tab opened. */
  data class PresentSheet(val url: String, val tabId: Int?) : ShellEffect

  data object CloseSheet : ShellEffect

  /** The page's audio and video pause (a named command): it left the screen, and is kept. */
  data object PauseMedia : ShellEffect

  /** The app goes behind the app that shared the page (Android's `moveTaskToBack`). */
  data object MoveTaskBack : ShellEffect
}

/**
 * The shell's screens over the router's tabs: one tab for the browsing page and one for each of
 * the three tabs, the active one being the screen's. Router actions, the tab bar, ‹ and back
 * come in; effects for the views go out. `tabs.create` with Words or Settings switches tabs
 * (the Langle sheet's buttons), `welcome.html` is the first run, a web page opens over Home.
 */
class Shell(private val origin: String, private val tabs: Tabs) {
  /** The browsing page's tab; `about:blank` until a page opens. */
  val pageTab: Int = tabs.open("about:blank", active = false).id
  private val tabIds: Map<AppTab, Int> = AppTab.entries.associateWith { tabs.open(origin + it.path, active = false).id }
  private val tabUrls = AppTab.entries.associateWith { origin + it.path }.toMutableMap()

  var screen: Screen = Screen.OnTab(AppTab.HOME)
    private set

  /** The first run's tab, while it is open. */
  var firstRunTab: Int? = null
    private set

  /** The browsing page's address; null until a page was opened. */
  var pageUrl: String? = null
    private set

  /** A shared address waiting for the first run to close (one at most: a newer share replaces it). */
  var heldShare: String? = null
    private set

  /** A first run is about to open (Langle was just installed): a share waits for it. */
  private var firstRunExpected = false

  /** The browsing page's current entry, its place in the page's history. */
  private var pageEntry = 0

  /**
   * The page's entry opened from another app: [PENDING] until its load commits, then its place in
   * the page's history; null when the page was not shared or moved on.
   */
  private var sharedEntry: Int? = null

  init {
    tabs.activate(tabIds.getValue(AppTab.HOME))
  }

  val showsTabBar: Boolean
    get() = screen is Screen.OnTab

  fun tabId(tab: AppTab): Int = tabIds.getValue(tab)

  fun url(tab: AppTab): String = tabUrls.getValue(tab)

  fun handle(action: RouterAction): List<ShellEffect> =
    when (action) {
      is RouterAction.OpenTab -> openTab(action.tab)
      is RouterAction.OpenPage -> openPage(action.url)
      is RouterAction.NavigateTab -> screenOf(action.tab.id)?.let { listOf(load(it, action.tab.url)) }.orEmpty()
      is RouterAction.ActivateTab -> activate(action.tab.id)
      is RouterAction.CloseTab -> if (action.tab.id == firstRunTab) closeFirstRun() else emptyList()
      is RouterAction.ReloadTab -> screenOf(action.id)?.let { listOf(ShellEffect.Reload(it)) }.orEmpty()
      RouterAction.OpenPopup ->
        if (screen == Screen.Page) listOf(ShellEffect.PresentSheet("$origin/popup.html", null)) else emptyList()
      RouterAction.ReloadHost -> emptyList()
    }

  /**
   * Home's search, Continue, a site, a link from Words: the page over Home, in the one page. The
   * kept page is shown as it is when [url] is its address or [canonical], its `rel=canonical`
   * address (what Langle records for it: a video's is `www.youtube.com` while the phone is on
   * `m.youtube.com`).
   */
  fun openPage(url: String, canonical: String? = null): List<ShellEffect> {
    sharedEntry = null
    val same = PageText.samePage(pageUrl, url) || PageText.samePage(canonical, url)
    val load = if (same) emptyList() else listOf(load(Screen.Page, url))
    return listOf(ShellEffect.CloseSheet) + load + show(Screen.Page)
  }

  /**
   * Another app's Share (docs/specs/mobile-app.md "M8: Share → Langle"): [url] in the one page,
   * its entry marked as opened from another app. Before the first run is done it waits, and
   * opens once the first run closes.
   */
  fun shared(url: String): List<ShellEffect> {
    if (firstRunTab != null || firstRunExpected) {
      heldShare = url
      return emptyList()
    }
    return openShared(url)
  }

  /** Langle was just installed: the first run is about to open, and a share waits for it. */
  fun expectFirstRun() {
    firstRunExpected = true
  }

  /** The first run did not open after all: a share that waited for it opens. */
  fun firstRunNotComing(): List<ShellEffect> {
    firstRunExpected = false
    return if (firstRunTab == null) releaseShare() else emptyList()
  }

  private fun openShared(url: String): List<ShellEffect> {
    val load =
      if (PageText.samePage(pageUrl, url)) {
        sharedEntry = pageEntry
        emptyList()
      } else {
        sharedEntry = PENDING
        listOf(load(Screen.Page, url))
      }
    return listOf(ShellEffect.CloseSheet) + load + show(Screen.Page)
  }

  private fun releaseShare(): List<ShellEffect> {
    val url = heldShare ?: return emptyList()
    heldShare = null
    return openShared(url)
  }

  /** A tap on the tab bar. */
  fun select(tab: AppTab): List<ShellEffect> = if (screen == Screen.FirstRun) emptyList() else show(Screen.OnTab(tab))

  /** ‹ on the title bar: Home (or the first run a page was opened from), the page kept. */
  fun home(): List<ShellEffect> = show(if (firstRunTab != null) Screen.FirstRun else Screen.OnTab(AppTab.HOME))

  /** Whether the system back is the shell's ([back] is not null), not the system's (leaving the app). */
  fun handlesBack(canGoBack: Boolean): Boolean = canGoBack || screen != Screen.OnTab(AppTab.HOME)

  /**
   * The system back, [canGoBack] being the screen's page's and [entry] its current entry: on the
   * entry another app shared, Home under it and the app behind the other app; else back in that
   * page's history, then from a page to Home, from Words or Settings to Home, from the first run
   * to Home (its Not now); null on Home, where the app is left.
   */
  fun back(canGoBack: Boolean, entry: Int = pageEntry): List<ShellEffect>? {
    val current = screen
    val shared = sharedEntry
    if (current == Screen.Page && shared != null && (shared == PENDING || shared == entry)) {
      sharedEntry = null
      return home() + ShellEffect.MoveTaskBack
    }
    if (canGoBack) return listOf(ShellEffect.GoBack(current))
    return when (current) {
      Screen.Page -> home()
      Screen.FirstRun -> closeFirstRun()
      is Screen.OnTab -> if (current.tab == AppTab.HOME) null else show(Screen.OnTab(AppTab.HOME))
    }
  }

  /**
   * A page went to [url] (a new document or the history API), [entry] being its place in the
   * page's history now. The shared entry's mark goes once the page is on another entry.
   */
  fun navigated(on: Screen, url: String, entry: Int = 0): List<ShellEffect> {
    when (on) {
      Screen.Page -> {
        if (url != "about:blank") pageUrl = url
        pageEntry = entry
        when (val shared = sharedEntry) {
          null -> Unit
          PENDING -> sharedEntry = entry
          else -> if (shared != entry) sharedEntry = null
        }
      }
      is Screen.OnTab -> {
        // Words or Settings before setup goes to the first run in its place: the first run
        // shows full screen in its own tab, and the tab's page is made again when next shown
        // (docs/notes/mobile.md "Device checks of M4 (M4e, Android)").
        if (appPath(url) == WELCOME) return firstRunFrom(on, url)
        tabUrls[on.tab] = url
      }
      Screen.FirstRun -> {
        // The first run's page going to a tab's page (it was set up already): that tab.
        val tab = appPath(url)?.let(AppTab::of)
        if (tab != null) return closeFirstRun(Screen.OnTab(tab), url)
      }
    }
    idOf(on)?.let { tabs.setUrl(it, url) }
    return emptyList()
  }

  /** The sheet went away: the screen's tab is the active one again. */
  fun sheetClosed() {
    idOf(screen)?.let(tabs::activate)
  }

  private fun openTab(tab: Tab): List<ShellEffect> {
    val path = appPath(tab.url)
    val appTab = path?.let(AppTab::of)
    return when {
      path == null -> {
        tabs.remove(tab.id)
        openPage(tab.url)
      }
      path == WELCOME -> {
        firstRunTab?.takeIf { it != tab.id }?.let(tabs::remove)
        firstRunTab = tab.id
        firstRunExpected = false
        listOf(ShellEffect.CloseSheet, ShellEffect.OpenFirstRun(tab.url, tab.id)) + show(Screen.FirstRun)
      }
      appTab != null -> {
        tabs.remove(tab.id)
        listOf(ShellEffect.CloseSheet) + loadIfNew(appTab, tab.url) + show(Screen.OnTab(appTab))
      }
      else -> listOf(ShellEffect.PresentSheet(tab.url, tab.id))
    }
  }

  private fun firstRunFrom(on: Screen.OnTab, url: String): List<ShellEffect> {
    tabUrls[on.tab] = origin + on.tab.path
    tabs.setUrl(tabIds.getValue(on.tab), origin + on.tab.path)
    val effects = mutableListOf<ShellEffect>(ShellEffect.DropTabPage(on.tab))
    if (firstRunTab == null) {
      val id = tabs.open(url, active = false).id
      firstRunTab = id
      firstRunExpected = false
      effects += ShellEffect.OpenFirstRun(url, id)
    }
    return effects + show(Screen.FirstRun)
  }

  private fun activate(id: Int): List<ShellEffect> {
    val target = screenOf(id) ?: return emptyList()
    if (target == Screen.Page && pageUrl == null) {
      // Nothing to show yet: the screen's tab stays the active one.
      sheetClosed()
      return emptyList()
    }
    return show(target)
  }

  /**
   * The first run goes; [next] shows if it was on screen ([url] loaded in it if new), then a
   * shared address that waited for it.
   */
  private fun closeFirstRun(next: Screen.OnTab = Screen.OnTab(AppTab.HOME), url: String? = null): List<ShellEffect> {
    val id = firstRunTab ?: return emptyList()
    firstRunTab = null
    tabs.remove(id)
    val effects = mutableListOf<ShellEffect>(ShellEffect.CloseFirstRun)
    if (screen == Screen.FirstRun) {
      url?.let { effects += loadIfNew(next.tab, it) }
      effects += show(next)
    }
    return effects + releaseShare()
  }

  private fun show(next: Screen): List<ShellEffect> {
    val effects = mutableListOf<ShellEffect>()
    if (screen == Screen.Page && next != Screen.Page) effects += ShellEffect.PauseMedia
    screen = next
    idOf(next)?.let(tabs::activate)
    effects += ShellEffect.Show(next)
    return effects
  }

  private fun load(on: Screen, url: String): ShellEffect {
    when (on) {
      Screen.Page -> pageUrl = url
      is Screen.OnTab -> tabUrls[on.tab] = url
      Screen.FirstRun -> Unit
    }
    idOf(on)?.let { tabs.setUrl(it, url) }
    return ShellEffect.Load(on, url)
  }

  private fun loadIfNew(tab: AppTab, url: String): List<ShellEffect> =
    if (tabUrls[tab] == url) emptyList() else listOf(load(Screen.OnTab(tab), url))

  private fun idOf(on: Screen): Int? =
    when (on) {
      Screen.Page -> pageTab
      Screen.FirstRun -> firstRunTab
      is Screen.OnTab -> tabIds.getValue(on.tab)
    }

  private fun screenOf(id: Int): Screen? =
    when (id) {
      pageTab -> Screen.Page
      firstRunTab -> Screen.FirstRun
      else -> tabIds.entries.firstOrNull { it.value == id }?.let { Screen.OnTab(it.key) }
    }

  /** The path of an app-origin address ("/options.html"), without its query and fragment. */
  private fun appPath(url: String): String? {
    if (!url.startsWith("$origin/")) return null
    return url.removePrefix(origin).substringBefore('#').substringBefore('?')
  }

  private companion object {
    const val WELCOME = "/welcome.html"

    /** The shared entry before its load committed. */
    const val PENDING = -1
  }
}
