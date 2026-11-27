package dev.langle.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import dev.langle.core.AppTab
import dev.langle.core.BarScroll
import dev.langle.core.ContextSpec
import dev.langle.core.PageText
import dev.langle.core.Router
import dev.langle.core.RouterAction
import dev.langle.core.Screen
import dev.langle.core.Shell
import dev.langle.core.ShellEffect

/**
 * The shell's screens (docs/specs/mobile-app.md "The shells (native)"): Home, Words and Settings
 * under the tab bar, each one app page kept; the first run full screen; the one browsing page
 * over Home under the title bar; app pages in the sheet frame. [Shell] decides, this does what
 * its effects say.
 */
class ScreenController(
  private val activity: MainActivity,
  private val engine: BrowsingEngine,
  private val router: Router,
  origin: AppOrigin,
  private val injector: ContentInjector?,
  private val adBlocker: AdBlocker?,
  notice: String?,
  hostSlot: FrameLayout,
) {
  /** An app page in the sheet frame: the Langle sheet (no tab), or a page a tab opened. */
  class Sheet(val tabId: Int?, val context: ContextPage, val frame: LangleSheet)

  val shell = Shell(APP_ORIGIN, router.tabs)
  val browsing: ContextPage
  var sheet: Sheet? = null
    private set
  private val tabPages = mutableMapOf<AppTab, ContextPage>()
  private var firstRun: ContextPage? = null
  private var firstRunTab: Int? = null

  /** The window's content: the shell, and the page's fullscreen view over it while there is one. */
  val root = FrameLayout(activity)
  private val column = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
  private val stage = FrameLayout(activity)
  private val pageArea = FrameLayout(activity)
  private val titleBar: TitleBar
  private val tabBar = TabBar(activity) { apply(shell.select(it)) }
  /** Without Langle (an old WebView, a refused build): the notice and a search field, for every tab. */
  private val noLangle: View?

  private val barHeight = activity.dp(56)
  private val barScroll = BarScroll(threshold = activity.dp(24))
  private var barShown = true
  private var pageTitle: String? = null

  /** The address of the page's current document, to tell a reload from a new page. */
  private var documentUrl: String? = null
  private var ogSite: String? = null
  private var shownScreen: Screen? = null

  /** Called after anything that can change what the system back does. */
  var onChanged: (() -> Unit)? = null

  /** A new document started in the browsing page (the translation host turns back on). */
  var onPageOpened: (() -> Unit)? = null

  init {
    val mark = origin.file("/icon/128.png")?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
    titleBar =
      TitleBar(
        activity,
        mark,
        onHome = { apply(shell.home()) },
        onGo = { text -> PageText.pageForSearch(text)?.let { apply(shell.openPage(it)) } },
        onLangle = { apply(shell.handle(RouterAction.OpenPopup)) },
        onMore = ::more,
      )
    val tabId = shell.pageTab
    browsing =
      ContextPage(engine, PageProfile.BROWSING, router, injector?.webPageScripts() ?: emptyList()) { ContextSpec.Content(tabId) }
    browsing.onDocument = { url ->
      router.tabs.setUrl(tabId, url)
      onPageOpened?.invoke()
      adBlocker?.inUse()
      // A reload keeps the title and site name until the document's own are read: WebView does
      // not report a title again that has not changed.
      if (!PageText.samePage(documentUrl, url)) {
        pageTitle = null
        ogSite = null
      }
      documentUrl = url
      barScroll.reset()
      setBar(true)
      showTitle()
    }
    browsing.onNavigate = { url ->
      apply(shell.navigated(Screen.Page, url, browsing.page.historyIndex))
      showTitle()
    }
    browsing.onTitle = { title ->
      // Only the page's address is no title: the one known so far stays.
      PageText.reportedTitle(title, browsing.page.url ?: shell.pageUrl)?.let { pageTitle = it }
      showTitle()
    }
    browsing.onLoaded = { readSiteName() }
    browsing.onScroll = { dy, y ->
      if (shell.screen == Screen.Page && sheet == null && !titleBar.isEditing) {
        setBar(barScroll.scrolled(dy, y, SystemClock.uptimeMillis()))
      }
    }

    noLangle = if (injector == null) noLangleView(notice.orEmpty()) else null
    pageArea.addView(browsing.page.view, matchParent().apply { topMargin = barHeight })
    pageArea.addView(titleBar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, barHeight))
    stage.addView(pageArea, matchParent())
    noLangle?.let { stage.addView(it, matchParent()) }
    column.addView(stage, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    column.addView(tabBar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    // The extension host: attached, at zero size.
    column.addView(hostSlot, LinearLayout.LayoutParams(0, 0))
    root.addView(column, matchParent())
    ViewCompat.setOnApplyWindowInsetsListener(column) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      val typing = insets.isVisible(WindowInsetsCompat.Type.ime())
      tabBar.setBottomInset(bars.bottom)
      tabBar.visibility = if (shell.showsTabBar && !typing) View.VISIBLE else View.GONE
      val bottom = if (tabBar.visibility == View.VISIBLE) 0 else maxOf(bars.bottom, ime.bottom)
      view.setPadding(bars.left, bars.top, bars.right, bottom)
      WindowInsetsCompat.CONSUMED
    }
    showScreen(shell.screen)
  }

  /** Does what the shell's effects say, in order. */
  fun apply(effects: List<ShellEffect>) {
    for (effect in effects) {
      Log.i(TAG, "shell: $effect")
      when (effect) {
        is ShellEffect.Show -> showScreen(effect.screen)
        is ShellEffect.Load -> pageOf(effect.screen, load = false)?.load(effect.url)
        is ShellEffect.Reload -> pageOf(effect.screen)?.page?.reload()
        is ShellEffect.GoBack -> pageOf(effect.screen)?.page?.goBack()
        is ShellEffect.OpenFirstRun -> openFirstRun(effect.url, effect.tabId)
        ShellEffect.CloseFirstRun -> closeFirstRun()
        is ShellEffect.DropTabPage -> dropTabPage(effect.tab)
        is ShellEffect.PresentSheet -> present(effect.url, effect.tabId)
        ShellEffect.CloseSheet -> sheet?.frame?.dismiss()
        ShellEffect.PauseMedia -> browsing.page.evaluate(ScriptWorld.PAGE, PAUSE_MEDIA) {}
        ShellEffect.MoveTaskBack -> activity.moveTaskToBack(true)
      }
    }
    onChanged?.invoke()
  }

  /** A router action the sheet's page is the tab of, or one for the shell. */
  fun perform(action: RouterAction) {
    val sheet = sheet
    val sheetTab = sheet?.tabId
    when {
      action is RouterAction.NavigateTab && action.tab.id == sheetTab -> sheet.context.load(action.tab.url)
      action is RouterAction.CloseTab && action.tab.id == sheetTab -> sheet.frame.dismiss()
      action is RouterAction.ReloadTab && action.id == sheetTab -> sheet.context.page.reload()
      action is RouterAction.OpenPage -> openPage(action.url)
      else -> apply(shell.handle(action))
    }
  }

  /** The page on screen (for the system back): the one whose history back goes through. */
  val screenPage: Page?
    get() = pageOf(shell.screen, load = false)?.page

  val isEditing: Boolean
    get() = titleBar.isEditing

  fun stopEditing() {
    titleBar.stopEditing()
    onChanged?.invoke()
  }

  fun tabPage(tab: AppTab): ContextPage? = tabPages[tab]

  /**
   * Whether a context's page is on the screen the shell shows (the translation host serves only
   * those): the browsing page on the page screen (under the sheet too), the sheet's page, the
   * shown tab's page, the first run's. The extension host never is.
   */
  fun isOnScreen(spec: ContextSpec): Boolean =
    when (spec) {
      ContextSpec.Host -> false
      is ContextSpec.Content -> spec.tabId == shell.pageTab && shell.screen == Screen.Page
      is ContextSpec.Page -> {
        val screen = shell.screen
        when {
          sheet?.let { it.tabId == spec.tabId } == true -> true
          spec.tabId == null -> false
          screen == Screen.FirstRun -> firstRunTab == spec.tabId
          screen is Screen.OnTab -> shell.tabId(screen.tab) == spec.tabId
          else -> false
        }
      }
    }

  val firstRunPage: ContextPage?
    get() = firstRun

  /** The "langle" profile's renderer is gone: the app pages that were in it come back. */
  fun recreateAppPages() {
    for (context in tabPages.values + listOfNotNull(firstRun, sheet?.context)) {
      if (context.isGone) context.recreate()
    }
  }

  fun close() {
    sheet?.frame?.dismiss()
    tabPages.values.forEach { it.close() }
    firstRun?.close()
    browsing.close()
  }

  // screens

  private fun showScreen(screen: Screen) {
    if (screen != Screen.Page) titleBar.stopEditing()
    if (screen != shownScreen) {
      // The keyboard a field on the screen going away opened (Home's search) would stay up.
      activity.currentFocus?.clearFocus()
      activity.getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(root.windowToken, 0)
    }
    shownScreen = screen
    pageArea.visibility = if (screen == Screen.Page) View.VISIBLE else View.GONE
    firstRun?.page?.view?.visibility = if (screen == Screen.FirstRun) View.VISIBLE else View.GONE
    val tab = (screen as? Screen.OnTab)?.tab
    if (tab != null && noLangle == null) pageOf(screen)
    for ((key, page) in tabPages) page.page.view.visibility = if (key == tab) View.VISIBLE else View.GONE
    noLangle?.visibility = if (tab != null) View.VISIBLE else View.GONE
    tab?.let(tabBar::select)
    tabBar.visibility = if (shell.showsTabBar) View.VISIBLE else View.GONE
    root.setBackgroundColor(if (screen == Screen.Page) Palette.WHITE else Palette.SURFACE)
    ViewCompat.requestApplyInsets(column)
  }

  /**
   * The screen's page; a tab's is made the first time it is wanted, with the tab's address
   * loaded unless [load] is false (the caller loads one).
   */
  private fun pageOf(screen: Screen, load: Boolean = true): ContextPage? =
    when (screen) {
      Screen.Page -> browsing
      Screen.FirstRun -> firstRun
      is Screen.OnTab -> tabPages[screen.tab] ?: if (noLangle != null) null else makeTabPage(screen.tab, load)
    }

  private fun makeTabPage(tab: AppTab, load: Boolean): ContextPage {
    val context = appPage(shell.tabId(tab))
    context.onNavigate = { url -> apply(shell.navigated(Screen.OnTab(tab), url)) }
    context.page.view.visibility = View.GONE
    stage.addView(context.page.view, 0, matchParent())
    tabPages[tab] = context
    if (load) context.load(shell.url(tab))
    return context
  }

  /** The tab's page goes, after the navigation that asked for it (its own callback). */
  private fun dropTabPage(tab: AppTab) {
    val context = tabPages.remove(tab) ?: return
    context.onNavigate = {}
    stage.post {
      stage.removeView(context.page.view)
      context.close()
    }
  }

  private fun openFirstRun(url: String, tabId: Int) {
    if (injector == null) return
    closeFirstRun()
    val context = appPage(tabId)
    context.onNavigate = { apply(shell.navigated(Screen.FirstRun, it)) }
    context.onClose = { router.tabs.get(tabId)?.let { apply(shell.handle(RouterAction.CloseTab(it))) } }
    stage.addView(context.page.view, matchParent())
    firstRun = context
    firstRunTab = tabId
    context.load(url)
  }

  private fun closeFirstRun() {
    val context = firstRun ?: return
    firstRun = null
    firstRunTab = null
    stage.removeView(context.page.view)
    context.close()
  }

  /** An app page (a tab's, the first run's): a link off the app opens over Home. */
  private fun appPage(tabId: Int?): ContextPage {
    val context = ContextPage(engine, PageProfile.APP, router, injector?.appPageScripts().orEmpty()) { ContextSpec.Page(it, tabId) }
    context.onProcessGone = activity::appProfileGone
    context.onLeaveApp = ::openPage
    return context
  }

  /**
   * A page an app page opened (Home, a link from Words): the kept page when it is that page, by
   * its address or its canonical one, which the page is asked for now (it changes as it navigates).
   */
  private fun openPage(url: String) {
    if (shell.pageUrl == null) return apply(shell.openPage(url))
    browsing.page.evaluate(ScriptWorld.PAGE, CANONICAL) { result ->
      val canonical = result.trim().takeIf { it.isNotEmpty() && !it.startsWith("error ") }
      apply(shell.openPage(url, canonical))
    }
  }

  // the sheet

  private fun present(url: String, tabId: Int?) {
    if (injector == null) return
    sheet?.frame?.dismiss()
    val context = appPage(tabId)
    lateinit var sheet: Sheet
    val frame = LangleSheet(activity, context.page.view, activity.isFullscreen) { closed(sheet) }
    sheet = Sheet(tabId, context, frame)
    context.onClose = { frame.dismiss() }
    this.sheet = sheet
    setBar(false)
    context.load(url)
    frame.show()
  }

  /**
   * The sheet went away (back, the scrim, the grabber, `window.close()`, its tab closed, or
   * another sheet replaced it; dialogs report it after the fact).
   */
  private fun closed(closed: Sheet) {
    closed.context.close()
    closed.tabId?.let { if (router.tabs.get(it) != null) router.tabs.remove(it) }
    if (sheet === closed) {
      sheet = null
      shell.sheetClosed()
      setBar(true)
    }
  }

  // the title bar

  private fun showTitle() {
    val url = browsing.page.url ?: shell.pageUrl ?: ""
    val site = PageText.siteName(url, ogSite)
    titleBar.show(PageText.shownTitle(pageTitle, site, url), site, url)
  }

  private fun readSiteName() {
    browsing.page.evaluate(ScriptWorld.PAGE, SITE_NAME) { result ->
      // The text itself; "" when the page has none ("error …" when it failed).
      val name = result.trim().takeIf { it.isNotEmpty() && !it.startsWith("error ") }
      if (name != ogSite) {
        ogSite = name
        showTitle()
      }
    }
    // The document's own title once it has loaded: after a reload WebView reports only the page's
    // address (or nothing) and not the title the document keeps.
    browsing.page.evaluate(ScriptWorld.PAGE, TITLE) { result ->
      val title = result.takeUnless { it.startsWith("error ") }?.let { PageText.reportedTitle(it, browsing.page.url) }
      if (title != null && title != pageTitle) {
        pageTitle = title
        showTitle()
      }
    }
  }

  /**
   * The bar slides away (a scroll down, the sheet) or back. The page takes the bar's place at once
   * and follows it as it slides, so it lays out once per move.
   */
  private fun setBar(shown: Boolean) {
    if (shown == barShown) return
    barShown = shown
    val view = browsing.page.view
    val params = view.layoutParams as FrameLayout.LayoutParams
    titleBar.animate().cancel()
    view.animate().cancel()
    if (shown) {
      titleBar.animate().translationY(0f).setDuration(SLIDE_MS).start()
      view.animate().translationY(barHeight.toFloat()).setDuration(SLIDE_MS).withEndAction {
        params.topMargin = barHeight
        view.layoutParams = params
        view.translationY = 0f
      }.start()
    } else {
      params.topMargin = 0
      view.layoutParams = params
      view.translationY = barHeight.toFloat() + view.translationY
      titleBar.animate().translationY(-barHeight.toFloat()).setDuration(SLIDE_MS).start()
      view.animate().translationY(0f).setDuration(SLIDE_MS).start()
    }
  }

  val isBarShown: Boolean
    get() = barShown

  /** ⋮: Forward, Share, Copy link, Open in another browser; the site's ad blocking under a divider. */
  private fun more(anchor: View) {
    val url = browsing.page.url ?: return
    val items =
      listOf(
        MoreMenu.Item(R.string.forward, browsing.page.canGoForward) { browsing.page.goForward() },
        MoreMenu.Item(R.string.share, true) {
          val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url)
          pageTitle?.let { send.putExtra(Intent.EXTRA_SUBJECT, it) }
          activity.startActivity(Intent.createChooser(send, null))
        },
        MoreMenu.Item(R.string.copy_link, true) {
          activity.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText(pageTitle ?: url, url))
          Toast.makeText(activity, R.string.link_copied, Toast.LENGTH_SHORT).show()
        },
        MoreMenu.Item(R.string.open_elsewhere, true) { openElsewhere(url) },
      )
    // Only while ad blocking is on, on a page with a site (Settings › Ad blocking has the rest).
    val blocker = adBlocker
    val site = blocker?.siteOf(url)
    val ads =
      if (blocker == null || site == null || !blocker.switches.on) null
      else MoreMenu.AdSwitch(site, blocker.switches.blocks(site)) { blocker.setSite(site, it) }
    MoreMenu(activity).show(anchor, items, ads)
  }

  /**
   * Opens [url] in a browser the user picks. Only browsers (apps that open any https address)
   * are offered: a site's own app (YouTube's for a video) would otherwise take the link.
   */
  private fun openElsewhere(url: String) {
    val view = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)
    val probe = Intent(Intent.ACTION_VIEW, Uri.parse("https://")).addCategory(Intent.CATEGORY_BROWSABLE)
    val browsers =
      activity.packageManager
        .queryIntentActivities(probe, PackageManager.MATCH_ALL)
        .map { it.activityInfo.packageName }
        .distinct()
        .filter { it != activity.packageName }
        .map { Intent(view).setPackage(it) }
    try {
      when (browsers.size) {
        0 -> Toast.makeText(activity, R.string.no_browser, Toast.LENGTH_SHORT).show()
        1 -> activity.startActivity(browsers[0])
        else ->
          activity.startActivity(
            Intent.createChooser(browsers[0], null).putExtra(Intent.EXTRA_INITIAL_INTENTS, browsers.drop(1).toTypedArray()),
          )
      }
    } catch (_: android.content.ActivityNotFoundException) {
      Toast.makeText(activity, R.string.no_browser, Toast.LENGTH_SHORT).show()
    }
  }

  // without Langle

  private fun noLangleView(notice: String): View =
    LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      val pad = activity.dp(16)
      setPadding(pad, pad, pad, pad)
      addView(TextView(activity).apply {
        text = notice
        setTextColor(Palette.INK)
      })
      addView(
        EditText(activity).apply {
          hint = activity.getString(R.string.search_hint)
          isSingleLine = true
          inputType = EditorInfo.TYPE_CLASS_TEXT or EditorInfo.TYPE_TEXT_VARIATION_URI
          imeOptions = EditorInfo.IME_ACTION_GO
          setOnEditorActionListener { _, _, _ ->
            PageText.pageForSearch(text.toString())?.let { apply(shell.openPage(it)) }
            true
          }
        },
      )
    }

  private fun matchParent() = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

  private companion object {
    const val SLIDE_MS = 180L

    /** Named commands (the page's world): the page's own site name, and pausing its media. */
    const val SITE_NAME = """return document.querySelector('meta[property="og:site_name"]')?.content ?? "";"""
    const val TITLE = """return document.title;"""
    const val CANONICAL ="""return document.querySelector('link[rel="canonical"]')?.href ?? "";"""
    const val PAUSE_MEDIA = """for (const m of document.querySelectorAll("video, audio")) m.pause(); return "paused";"""
  }
}
