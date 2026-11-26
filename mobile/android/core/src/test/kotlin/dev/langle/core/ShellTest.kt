package dev.langle.core

import dev.langle.core.ShellEffect.CloseFirstRun
import dev.langle.core.ShellEffect.CloseSheet
import dev.langle.core.ShellEffect.DropTabPage
import dev.langle.core.ShellEffect.GoBack
import dev.langle.core.ShellEffect.Load
import dev.langle.core.ShellEffect.MoveTaskBack
import dev.langle.core.ShellEffect.OpenFirstRun
import dev.langle.core.ShellEffect.PauseMedia
import dev.langle.core.ShellEffect.PresentSheet
import dev.langle.core.ShellEffect.Reload
import dev.langle.core.ShellEffect.Show
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

private const val ORIGIN = "https://app.langle.invalid"
private const val VIDEO = "https://m.youtube.com/watch?v=iG9CE55wbtY"
private const val ARTICLE = "http://localhost:4719/article-en.html"

private val HOME = Screen.OnTab(AppTab.HOME)
private val WORDS = Screen.OnTab(AppTab.WORDS)
private val SETTINGS = Screen.OnTab(AppTab.SETTINGS)

class ShellTest {
  private val tabs = Tabs()
  private val shell = Shell(ORIGIN, tabs)

  /** What the router does for `tabs.create`: a new active tab, then the action. */
  private fun created(url: String) = shell.handle(RouterAction.OpenTab(tabs.open(url)))

  private val active: Int?
    get() = tabs.active?.id

  @Nested
  inner class Screens {
    @Test
    fun `start on Home, with a tab for the page and one for each of the three tabs`() {
      assertEquals(HOME, shell.screen)
      assertEquals(
        listOf("about:blank", "$ORIGIN/home.html", "$ORIGIN/wordlist.html", "$ORIGIN/options.html"),
        tabs.all.map { it.url },
      )
      assertEquals(shell.tabId(AppTab.HOME), active)
      assertTrue(shell.showsTabBar)
    }

    @Test
    fun `the tab bar switches tabs, and the active tab follows the screen`() {
      assertEquals(listOf(Show(WORDS)), shell.select(AppTab.WORDS))
      assertEquals(shell.tabId(AppTab.WORDS), active)
      assertEquals(listOf(Show(SETTINGS)), shell.select(AppTab.SETTINGS))
      assertEquals(shell.tabId(AppTab.SETTINGS), active)
    }
  }

  @Nested
  inner class ThePageOverHome {
    @Test
    fun `appHost_openPage loads the page over Home and hides the tab bar`() {
      assertEquals(listOf(CloseSheet, Load(Screen.Page, VIDEO), Show(Screen.Page)), shell.handle(RouterAction.OpenPage(VIDEO)))
      assertEquals(Screen.Page, shell.screen)
      assertFalse(shell.showsTabBar)
      assertEquals(shell.pageTab, active)
      assertEquals(VIDEO, tabs.get(shell.pageTab)?.url)
    }

    @Test
    fun `back shows Home, keeps the page and pauses its media`() {
      shell.openPage(VIDEO)
      assertEquals(listOf(PauseMedia, Show(HOME)), shell.home())
      assertEquals(shell.tabId(AppTab.HOME), active)
    }

    @Test
    fun `Continue's row for the kept page shows it again at once, another page loads in its place`() {
      shell.openPage(VIDEO)
      shell.navigated(Screen.Page, "$VIDEO#t=10")
      shell.home()
      assertEquals(listOf(CloseSheet, Show(Screen.Page)), shell.openPage(VIDEO))
      shell.home()
      assertEquals(listOf(CloseSheet, Load(Screen.Page, ARTICLE), Show(Screen.Page)), shell.openPage(ARTICLE))
    }

    @Test
    fun `the kept page's canonical address shows it again too`() {
      shell.openPage("https://m.youtube.com/watch?v=abc")
      shell.home()
      val canonical = "https://www.youtube.com/watch?v=abc"
      assertEquals(listOf(CloseSheet, Show(Screen.Page)), shell.openPage(canonical, canonical))
      shell.home()
      assertEquals(listOf(CloseSheet, Load(Screen.Page, canonical), Show(Screen.Page)), shell.openPage(canonical, null))
    }

    @Test
    fun `a web page from tabs_create opens over Home in the one page, and its tab goes`() {
      val count = tabs.all.size
      assertEquals(listOf(CloseSheet, Load(Screen.Page, ARTICLE), Show(Screen.Page)), created(ARTICLE))
      assertEquals(count, tabs.all.size)
      assertEquals(shell.pageTab, active)
    }

    @Test
    fun `tabs_update and tabs_reload of the page load and reload it where it is`() {
      shell.openPage(VIDEO)
      shell.home()
      assertEquals(listOf(Load(Screen.Page, ARTICLE)), shell.handle(RouterAction.NavigateTab(Tab(shell.pageTab, ARTICLE, false))))
      assertEquals(listOf(Reload(Screen.Page)), shell.handle(RouterAction.ReloadTab(shell.pageTab)))
      assertEquals(HOME, shell.screen)
    }
  }

  @Nested
  inner class BacksOrder {
    @Test
    fun `back goes through the page's history, then to Home, then leaves the app`() {
      shell.openPage(VIDEO)
      assertTrue(shell.handlesBack(canGoBack = true))
      assertEquals(listOf(GoBack(Screen.Page)), shell.back(canGoBack = true))
      assertEquals(listOf(PauseMedia, Show(HOME)), shell.back(canGoBack = false))
      assertFalse(shell.handlesBack(canGoBack = false))
      assertNull(shell.back(canGoBack = false))
    }

    @Test
    fun `back on Words or Settings goes through its history, then to Home`() {
      shell.select(AppTab.WORDS)
      assertEquals(listOf(GoBack(WORDS)), shell.back(canGoBack = true))
      assertEquals(listOf(Show(HOME)), shell.back(canGoBack = false))
    }
  }

  @Nested
  inner class TheSheet {
    @Test
    fun `L opens the Langle sheet only over a page`() {
      assertEquals(emptyList<ShellEffect>(), shell.handle(RouterAction.OpenPopup))
      shell.openPage(VIDEO)
      assertEquals(listOf(PresentSheet("$ORIGIN/popup.html", null)), shell.handle(RouterAction.OpenPopup))
    }

    @Test
    fun `the sheet's word list and settings buttons switch tabs and close the sheet`() {
      shell.openPage(VIDEO)
      val count = tabs.all.size
      assertEquals(listOf(CloseSheet, PauseMedia, Show(WORDS)), created("$ORIGIN/wordlist.html"))
      assertEquals(shell.tabId(AppTab.WORDS), active)
      shell.openPage(VIDEO)
      assertEquals(listOf(CloseSheet, PauseMedia, Show(SETTINGS)), created("$ORIGIN/options.html"))
      assertEquals(count, tabs.all.size)
    }

    @Test
    fun `a tab page opened at another address loads it there`() {
      assertEquals(
        listOf(CloseSheet, Load(SETTINGS, "$ORIGIN/options.html#sync"), Show(SETTINGS)),
        created("$ORIGIN/options.html#sync"),
      )
      assertEquals("$ORIGIN/options.html#sync", shell.url(AppTab.SETTINGS))
    }

    @Test
    fun `another app page opens in the sheet with its tab, which is active until the sheet closes`() {
      val effects = created("$ORIGIN/about.html")
      val id = (effects.single() as PresentSheet).tabId!!
      assertEquals(listOf(PresentSheet("$ORIGIN/about.html", id)), effects)
      assertEquals(id, active)
      tabs.remove(id)
      shell.sheetClosed()
      assertEquals(shell.tabId(AppTab.HOME), active)
    }
  }

  @Nested
  inner class TheFirstRun {
    @Test
    fun `welcome opens full screen without the tab bar, and Home shows when its tab closes`() {
      val effects = created("$ORIGIN/welcome.html")
      val id = shell.firstRunTab!!
      assertEquals(listOf(CloseSheet, OpenFirstRun("$ORIGIN/welcome.html", id), Show(Screen.FirstRun)), effects)
      assertFalse(shell.showsTabBar)
      assertEquals(id, active)
      // The setup's end: the tab it came from is shown, then the setup's tab is removed.
      assertEquals(listOf(Show(HOME)), shell.handle(RouterAction.ActivateTab(Tab(shell.tabId(AppTab.HOME), "", true))))
      tabs.remove(id)
      assertEquals(listOf(CloseFirstRun), shell.handle(RouterAction.CloseTab(Tab(id, "$ORIGIN/welcome.html", false))))
      assertNull(shell.firstRunTab)
      assertEquals(HOME, shell.screen)
    }

    @Test
    fun `Not now by back closes the first run to Home`() {
      created("$ORIGIN/welcome.html")
      val id = shell.firstRunTab!!
      assertTrue(shell.handlesBack(canGoBack = false))
      assertEquals(listOf(CloseFirstRun, Show(HOME)), shell.back(canGoBack = false))
      assertNull(tabs.get(id))
    }

    @Test
    fun `a page opened from the first run goes back to it`() {
      created("$ORIGIN/welcome.html")
      shell.openPage(ARTICLE)
      assertEquals(listOf(PauseMedia, Show(Screen.FirstRun)), shell.home())
    }

    @Test
    fun `the first run going to a tab's page shows that tab`() {
      created("$ORIGIN/welcome.html")
      assertEquals(
        listOf(CloseFirstRun, Show(SETTINGS)),
        shell.navigated(Screen.FirstRun, "$ORIGIN/options.html"),
      )
    }

    @Test
    fun `Words before setup goes to the first run in its own tab, and Words is made again when shown`() {
      shell.select(AppTab.WORDS)
      val effects = shell.navigated(WORDS, "$ORIGIN/welcome.html")
      val id = shell.firstRunTab!!
      assertEquals(
        listOf(DropTabPage(AppTab.WORDS), OpenFirstRun("$ORIGIN/welcome.html", id), Show(Screen.FirstRun)),
        effects,
      )
      assertEquals(id, active)
      assertEquals("$ORIGIN/wordlist.html", shell.url(AppTab.WORDS))
      assertEquals("$ORIGIN/wordlist.html", tabs.get(shell.tabId(AppTab.WORDS))!!.url)
      // Start: the first run's tab is removed, Home shows.
      tabs.remove(id)
      assertEquals(listOf(CloseFirstRun, Show(HOME)), shell.handle(RouterAction.CloseTab(Tab(id, "$ORIGIN/welcome.html", false))))
      assertEquals(listOf(Show(WORDS)), shell.select(AppTab.WORDS))
    }

    @Test
    fun `activating the page before any page was opened leaves the screen as it is`() {
      assertEquals(emptyList<ShellEffect>(), shell.handle(RouterAction.ActivateTab(Tab(shell.pageTab, "about:blank", true))))
      assertEquals(HOME, shell.screen)
      assertEquals(shell.tabId(AppTab.HOME), active)
    }
  }

  /** docs/specs/mobile-app.md "M8: Share → Langle", Android. */
  @Nested
  inner class ShareFromAnotherApp {
    private val send = SharedLink.ACTION_SEND

    /** What MainActivity does with an intent, on a cold start and in onNewIntent alike. */
    private fun intent(action: String?, type: String?, text: String?): List<ShellEffect> =
      SharedLink.ofIntent(action, type, text)?.let(shell::shared).orEmpty()

    @Test
    fun `the intent's text is read as SharedLink reads it, and only an ACTION_SEND of text counts`() {
      assertEquals("https://m.youtube.com/watch?v=abc&si=x", SharedLink.ofIntent(send, "text/plain", "https://youtu.be/abc?si=x"))
      assertEquals(ARTICLE, SharedLink.ofIntent(send, "text/plain", "An article $ARTICLE"))
      assertEquals("https://m.youtube.com/results?search_query=ted", SharedLink.ofIntent(send, "text/plain", "ted"))
      assertNull(SharedLink.ofIntent(send, "text/plain", null))
      assertNull(SharedLink.ofIntent(send, "text/plain", "  "))
      assertNull(SharedLink.ofIntent(send, "image/png", ARTICLE))
      assertNull(SharedLink.ofIntent(send, null, ARTICLE))
      assertNull(SharedLink.ofIntent("android.intent.action.MAIN", null, null))
      assertNull(SharedLink.ofIntent("android.intent.action.VIEW", "text/plain", ARTICLE))
    }

    @Test
    fun `a cold start opens the shared page over Home`() {
      assertEquals(listOf(CloseSheet, Load(Screen.Page, VIDEO), Show(Screen.Page)), intent(send, "text/plain", VIDEO))
      assertEquals(Screen.Page, shell.screen)
      assertEquals(shell.pageTab, active)
    }

    @Test
    fun `a running app opens it from any screen in the one page, the sheet closed`() {
      shell.openPage(ARTICLE)
      shell.select(AppTab.WORDS)
      assertEquals(listOf(CloseSheet, Load(Screen.Page, VIDEO), Show(Screen.Page)), intent(send, "text/plain", VIDEO))
      shell.handle(RouterAction.OpenPopup)
      assertEquals(
        listOf(CloseSheet, Load(Screen.Page, "https://m.youtube.com/results?search_query=ted")),
        intent(send, "text/plain", "ted").dropLast(1),
      )
    }

    @Test
    fun `a launcher intent opens nothing`() {
      assertEquals(emptyList<ShellEffect>(), intent("android.intent.action.MAIN", null, null))
      assertEquals(HOME, shell.screen)
    }

    @Test
    fun `back on the shared entry shows Home under it and moves the app back, the page kept`() {
      shell.shared(VIDEO)
      shell.navigated(Screen.Page, VIDEO, entry = 0)
      assertTrue(shell.handlesBack(canGoBack = false))
      assertEquals(listOf(PauseMedia, Show(HOME), MoveTaskBack), shell.back(canGoBack = false, entry = 0))
      assertEquals(HOME, shell.screen)
      assertEquals(VIDEO, shell.pageUrl)
      // Coming to the front again: Home. Continue's first row shows the page again at once.
      assertEquals(listOf(CloseSheet, Show(Screen.Page)), shell.openPage(VIDEO))
      assertEquals(listOf(PauseMedia, Show(HOME)), shell.back(canGoBack = false, entry = 0))
    }

    @Test
    fun `back on the shared entry moves the app back even with the page's earlier history behind it`() {
      shell.openPage(ARTICLE)
      shell.navigated(Screen.Page, ARTICLE, entry = 0)
      shell.shared(VIDEO)
      shell.navigated(Screen.Page, VIDEO, entry = 1)
      assertEquals(listOf(PauseMedia, Show(HOME), MoveTaskBack), shell.back(canGoBack = true, entry = 1))
    }

    @Test
    fun `back before the shared page's load committed moves the app back`() {
      shell.openPage(ARTICLE)
      shell.navigated(Screen.Page, ARTICLE, entry = 0)
      shell.shared(VIDEO)
      assertEquals(listOf(PauseMedia, Show(HOME), MoveTaskBack), shell.back(canGoBack = true, entry = 0))
    }

    @Test
    fun `a redirect or the history API on the same entry keeps the mark`() {
      shell.shared("http://example.com/a")
      shell.navigated(Screen.Page, "https://example.com/a", entry = 0)
      shell.navigated(Screen.Page, "https://example.com/a?ref=x", entry = 0)
      assertEquals(listOf(PauseMedia, Show(HOME), MoveTaskBack), shell.back(canGoBack = false, entry = 0))
    }

    @Test
    fun `the mark goes once the page moves to another entry`() {
      shell.shared(VIDEO)
      shell.navigated(Screen.Page, VIDEO, entry = 0)
      shell.navigated(Screen.Page, ARTICLE, entry = 1)
      assertEquals(listOf(GoBack(Screen.Page)), shell.back(canGoBack = true, entry = 1))
      shell.navigated(Screen.Page, VIDEO, entry = 0)
      assertEquals(listOf(PauseMedia, Show(HOME)), shell.back(canGoBack = false, entry = 0))
    }

    @Test
    fun `the mark goes once the page is opened from Home`() {
      shell.shared(VIDEO)
      shell.navigated(Screen.Page, VIDEO, entry = 0)
      shell.home()
      shell.openPage(VIDEO)
      assertEquals(listOf(PauseMedia, Show(HOME)), shell.back(canGoBack = false, entry = 0))
    }

    @Test
    fun `sharing the kept page shows it at once and marks its entry`() {
      shell.openPage(VIDEO)
      shell.navigated(Screen.Page, VIDEO, entry = 3)
      shell.home()
      assertEquals(listOf(CloseSheet, Show(Screen.Page)), shell.shared(VIDEO))
      assertEquals(listOf(PauseMedia, Show(HOME), MoveTaskBack), shell.back(canGoBack = true, entry = 3))
    }

    @Test
    fun `a share right after installing waits for the first run and opens when it closes`() {
      shell.expectFirstRun()
      assertEquals(emptyList<ShellEffect>(), shell.shared(ARTICLE))
      assertEquals(HOME, shell.screen)
      created("$ORIGIN/welcome.html")
      val id = shell.firstRunTab!!
      // A newer share replaces the waiting one.
      assertEquals(emptyList<ShellEffect>(), shell.shared(VIDEO))
      assertEquals(VIDEO, shell.heldShare)
      assertEquals(Screen.FirstRun, shell.screen)
      // Start: the tab it came from is shown, then the setup's tab is removed.
      shell.handle(RouterAction.ActivateTab(Tab(shell.tabId(AppTab.HOME), "", true)))
      tabs.remove(id)
      assertEquals(
        listOf(CloseFirstRun, CloseSheet, Load(Screen.Page, VIDEO), Show(Screen.Page)),
        shell.handle(RouterAction.CloseTab(Tab(id, "$ORIGIN/welcome.html", false))),
      )
      assertNull(shell.heldShare)
      shell.navigated(Screen.Page, VIDEO, entry = 0)
      assertEquals(listOf(PauseMedia, Show(HOME), MoveTaskBack), shell.back(canGoBack = false, entry = 0))
    }

    @Test
    fun `Not now opens the waiting share too`() {
      created("$ORIGIN/welcome.html")
      shell.shared(VIDEO)
      assertEquals(listOf(CloseFirstRun, Show(HOME), CloseSheet, Load(Screen.Page, VIDEO), Show(Screen.Page)), shell.back(canGoBack = false))
    }

    @Test
    fun `a share waits only while a first run is open or about to open`() {
      shell.expectFirstRun()
      shell.shared(VIDEO)
      assertEquals(listOf(CloseSheet, Load(Screen.Page, VIDEO), Show(Screen.Page)), shell.firstRunNotComing())
      assertEquals(listOf(CloseSheet, Load(Screen.Page, ARTICLE), Show(Screen.Page)), shell.shared(ARTICLE))
    }
  }
}
