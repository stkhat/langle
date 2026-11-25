package dev.langle.core

import dev.langle.core.ShellEffect.CloseFirstRun
import dev.langle.core.ShellEffect.CloseSheet
import dev.langle.core.ShellEffect.DropTabPage
import dev.langle.core.ShellEffect.GoBack
import dev.langle.core.ShellEffect.Load
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
}
