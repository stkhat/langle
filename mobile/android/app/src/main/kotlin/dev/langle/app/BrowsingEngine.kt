package dev.langle.app

import android.view.View

/**
 * Boundary 1 of docs/specs/mobile-app.md "Engine boundary": pages, injection and messages by
 * world. The router, the extension host, the tabs and the screen depend only on this; WebView
 * types stay behind it (WebViewEngine.kt).
 */
interface BrowsingEngine {
  /** Whether Langle can run on pages (the WebView has isolated worlds and profiles). */
  val supportsLangle: Boolean

  fun createPage(profile: PageProfile, delegate: PageDelegate): Page

  /** Ad blocking on browsing pages, or null (none). */
  var blocking: PageBlocking?

  /** [blocking]'s rules or switches changed: browsing pages ask it again for their next documents. */
  fun blockingChanged()
}

/**
 * Ad blocking as browsing pages ask it (AdBlocker, docs/specs/mobile-app.md "M6: ad blocking"):
 * subresources before they go out, and each host's document-start scripts before its documents.
 */
interface PageBlocking {
  /** The type of a subresource of [pageUrl] that is blocked, or null (WebView's request threads). */
  fun blockedType(url: String, pageUrl: String, headers: Map<String, String>): String?

  /** The document-start scripts for pages of [url]'s host, or null while it gets none (main thread). */
  fun documentScripts(url: String): List<UserScript>?

  /** A document's classes and ids ([message], JSON); [reply] gets their stylesheet, on the main thread. */
  fun hiddenCss(message: String, reply: (String) -> Unit)
}

/**
 * Which data a page uses: the browsing data, or the app's own (the extension host and the app
 * pages, on the app origin), kept apart from it (boundary 2), or the translation host's
 * (`translate-host.html` on the app origin, with the model files; a renderer of its own, so the
 * engine's memory and a crash stay out of the others). The bridge is in Langle's world on browsing
 * pages, in the page's world (the app origin only) on the others.
 */
enum class PageProfile {
  BROWSING,
  APP,
  TRANSLATE,
}

/** The page's own world, or Langle's isolated world (content scripts, the bridge). */
enum class ScriptWorld {
  PAGE,
  LANGLE,
}

enum class ScriptRunAt {
  START,
  END,
}

/** A script for every new document of a page; it checks its frame and URL itself. */
data class UserScript(val source: String, val world: ScriptWorld, val runAt: ScriptRunAt)

interface Page {
  /** The page's place in the layout; it stays the same when the page is created again. */
  val view: View
  val url: String?
  val canGoBack: Boolean
  val canGoForward: Boolean

  fun load(url: String)

  fun reload()

  fun goBack()

  fun goForward()

  /** Replaces the page's scripts; they run in documents loaded after the call. */
  fun setUserScripts(scripts: List<UserScript>)

  /** Native → scripts: one bridge envelope to the top document's bridge. */
  fun postMessage(json: String)

  /** Runs an async function body in a world; [done] gets its result as text (check commands). */
  fun evaluate(world: ScriptWorld, source: String, done: (String) -> Unit)

  /** After the renderer was lost: a new page in the same place, with the same scripts and URL. */
  fun recreate()

  /** The page is gone for good. */
  fun destroy()

  /** Ends the page's renderer, as a crash would (check commands); false when it cannot. */
  fun terminateRenderer(): Boolean
}

interface PageDelegate {
  /** A new top-level document started at [url] (its bridge said so before any envelope). */
  fun onDocument(page: Page, url: String)

  /** Scripts → native: one bridge envelope from the top document. */
  fun onMessage(page: Page, json: String)

  /** The page's URL changed (a new document, or the history API). */
  fun onNavigate(page: Page, url: String)

  /** The top document finished loading. */
  fun onLoaded(page: Page, url: String)

  /** The document's title changed. */
  fun onTitle(page: Page, title: String)

  /** The page scrolled by [dy] to [scrollY] (CSS px times the density: the view's pixels). */
  fun onScroll(page: Page, dy: Int, scrollY: Int)

  /** An app page followed a link off the app origin. */
  fun onLeaveApp(page: Page, url: String)

  /** The page's script closed it (`window.close()`, as the popup does after opening a page). */
  fun onClose(page: Page)

  /** The page's renderer is gone (memory pressure, a crash); the page waits for [Page.recreate]. */
  fun onProcessGone(page: Page)

  /**
   * The page put an element in fullscreen: [view] shows it until the page leaves fullscreen
   * ([onExitFullscreen]). [exit] asks the page to leave (the system back gesture).
   */
  fun onEnterFullscreen(page: Page, view: View, exit: () -> Unit)

  /** The page left fullscreen; [onEnterFullscreen]'s view is no longer in use. */
  fun onExitFullscreen(page: Page)
}
