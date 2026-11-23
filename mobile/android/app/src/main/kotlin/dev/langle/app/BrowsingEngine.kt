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
}

/**
 * Which data a page uses: the browsing data, or the app's own (the extension host and the app
 * pages, on the app origin), kept apart from it (boundary 2). The bridge is in Langle's world on
 * browsing pages, in the page's world (the app origin only) on app pages.
 */
enum class PageProfile {
  BROWSING,
  APP,
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
}

interface PageDelegate {
  /** A new top-level document started at [url] (its bridge said so before any envelope). */
  fun onDocument(page: Page, url: String)

  /** Scripts → native: one bridge envelope from the top document. */
  fun onMessage(page: Page, json: String)

  /** The page's URL changed (a new document, or the history API). */
  fun onNavigate(page: Page, url: String)

  /** An app page followed a link off the app origin. */
  fun onLeaveApp(page: Page, url: String)

  /** The page's script closed it (`window.close()`, as the popup does after opening a page). */
  fun onClose(page: Page)

  /** The page's renderer is gone (memory pressure, a crash); the page waits for [Page.recreate]. */
  fun onProcessGone(page: Page)
}
