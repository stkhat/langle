package dev.langle.app

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import dev.langle.core.Clock
import dev.langle.core.Connection
import dev.langle.core.ContextSpec
import dev.langle.core.Router

/**
 * One page with one script context of the router: the extension host, an app page or a web page.
 * Each new top-level document gets a new connection (the old one fails its waiting messages with
 * "Receiving end does not exist"); the document's envelopes go to it, its deliveries come back.
 */
class ContextPage(
  engine: BrowsingEngine,
  val profile: PageProfile,
  private val router: Router,
  scripts: List<UserScript>,
  private val spec: (url: String) -> ContextSpec,
) : PageDelegate {
  val page: Page = engine.createPage(profile, this).also { it.setUserScripts(scripts) }
  var connection: Connection? = null
    private set

  var onDocument: ((url: String) -> Unit)? = null
  var onNavigate: ((url: String) -> Unit)? = null
  var onLoaded: ((url: String) -> Unit)? = null
  var onTitle: ((title: String) -> Unit)? = null
  var onScroll: ((dy: Int, scrollY: Int) -> Unit)? = null
  var onLeaveApp: ((url: String) -> Unit)? = null
  var onClose: (() -> Unit)? = null
  var onProcessGone: (() -> Unit)? = null
  var onEnterFullscreen: ((view: View, exit: () -> Unit) -> Unit)? = null
  var onExitFullscreen: (() -> Unit)? = null

  /** The renderer is gone, and the page waits to be created again. */
  var isGone = false
    private set

  fun load(url: String) = page.load(url)

  /** After the renderer was lost. */
  fun recreate() {
    isGone = false
    page.recreate()
  }

  /** The page is gone for good (a closed sheet, a host replaced). */
  fun close() {
    connection?.disconnect()
    connection = null
    page.destroy()
  }

  private fun connect(url: String) {
    connection?.disconnect()
    val page = page
    connection = router.connect(spec(url)) { json -> page.postMessage(json) }
  }

  override fun onDocument(page: Page, url: String) {
    onDocument?.invoke(url)
    connect(url)
  }

  override fun onMessage(page: Page, json: String) {
    // The document's mark comes first; a page without one still gets a context.
    if (connection == null) connect(page.url ?: "about:blank")
    connection?.receive(json)
  }

  override fun onNavigate(page: Page, url: String) {
    onNavigate?.invoke(url)
  }

  override fun onLoaded(page: Page, url: String) {
    onLoaded?.invoke(url)
  }

  override fun onTitle(page: Page, title: String) {
    onTitle?.invoke(title)
  }

  override fun onScroll(page: Page, dy: Int, scrollY: Int) {
    onScroll?.invoke(dy, scrollY)
  }

  override fun onLeaveApp(page: Page, url: String) {
    onLeaveApp?.invoke(url)
  }

  override fun onClose(page: Page) {
    onClose?.invoke()
  }

  override fun onProcessGone(page: Page) {
    connection?.disconnect()
    connection = null
    isGone = true
    onProcessGone?.invoke()
  }

  override fun onEnterFullscreen(page: Page, view: View, exit: () -> Unit) {
    // A page nobody shows in fullscreen leaves it at once.
    onEnterFullscreen?.invoke(view, exit) ?: exit()
  }

  override fun onExitFullscreen(page: Page) {
    onExitFullscreen?.invoke()
  }
}

/**
 * The extension host (docs/specs/mobile-app.md "Parts"): a hidden page on the app origin, in the
 * "langle" profile, running `host.html` (the app info, the shim, `background.js`). It stays in
 * the layout at zero size, as on iOS; spike S2 measured that its timers keep time in the
 * foreground whether it is attached or not, and stop in the background.
 */
class ExtensionHost(
  private val engine: BrowsingEngine,
  private val router: Router,
  /** A zero-size view in the window; the host's page lives in it. */
  val slot: FrameLayout,
) {
  var context: ContextPage? = null
    private set

  /** The host's renderer is gone; the app creates it again before the app pages (S2). */
  var onProcessGone: (() -> Unit)? = null

  val isReady: Boolean
    get() = context?.connection?.isReady ?: false

  val isGone: Boolean
    get() = context?.isGone ?: false

  fun start() {
    context?.close()
    val context = ContextPage(engine, PageProfile.APP, router, emptyList(), spec = { ContextSpec.Host })
    context.onProcessGone = { onProcessGone?.invoke() }
    slot.removeAllViews()
    slot.addView(context.page.view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    this.context = context
    context.load(URL)
    Log.i(TAG, "extension host started")
  }

  /** `runtime.reload`: the background starts again in a new document. */
  fun reload() {
    context?.load(URL)
  }

  fun recreate() {
    Log.e(TAG, "extension host lost its renderer: creating it again")
    context?.recreate()
  }

  fun evaluate(source: String, done: (String) -> Unit) {
    context?.page?.evaluate(ScriptWorld.PAGE, source, done) ?: done("no host")
  }

  companion object {
    const val URL = "$APP_ORIGIN/host.html"
  }
}

/** Timers on the main thread, while the app runs; times in milliseconds since the epoch. */
class HandlerClock : Clock {
  private val handler = Handler(Looper.getMainLooper())

  override fun now(): Double = System.currentTimeMillis().toDouble()

  override fun schedule(afterMs: Double, run: () -> Unit): Any {
    val task = Runnable(run)
    handler.postDelayed(task, afterMs.toLong().coerceAtLeast(0))
    return task
  }

  override fun cancel(token: Any) {
    (token as? Runnable)?.let(handler::removeCallbacks)
  }
}
