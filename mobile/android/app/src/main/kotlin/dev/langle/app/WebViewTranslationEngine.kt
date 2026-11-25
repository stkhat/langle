package dev.langle.app

import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import dev.langle.core.TranslationEngine
import dev.langle.core.bool
import dev.langle.core.jsonObject
import dev.langle.core.number
import dev.langle.core.obj
import dev.langle.core.parseJson
import dev.langle.core.string
import dev.langle.core.toJsonText

/**
 * The engine of the translation host on Android (docs/specs/mobile-translation.md "The Android
 * host"): `translate-host.html` in a hidden page of the `translate` profile, which runs Bergamot in
 * a Worker (src/entrypoints/translate-host/). The page is made when the host first needs the
 * engine and destroyed when it releases it, which ends the Worker and gives the renderer's memory
 * back. Requests wait until the page says it is ready; each answer comes back by its id.
 *
 * The page lives in [slot], a zero-size view in the window, as the extension host does.
 */
class WebViewTranslationEngine(private val engine: BrowsingEngine, private val slot: FrameLayout) : TranslationEngine {
  override var onFailure: (() -> Unit)? = null

  private var page: Page? = null
  private var ready = false
  private val waiting = mutableListOf<String>()
  private var nextId = 0
  private val loads = mutableMapOf<Int, (Boolean) -> Unit>()
  private val sentences = mutableMapOf<Int, (String?) -> Unit>()

  /** Whether the page (and its renderer) exists. */
  val isRunning: Boolean
    get() = page != null

  override fun load(from: String, to: String, packs: List<String>, done: (ok: Boolean) -> Unit) {
    val id = nextId++
    loads[id] = done
    send(jsonObject("kind" to "load", "id" to id, "from" to from, "to" to to, "packs" to packs).toJsonText())
  }

  override fun translate(from: String, to: String, text: String, done: (String?) -> Unit) {
    val id = nextId++
    sentences[id] = done
    send(jsonObject("kind" to "translate", "id" to id, "from" to from, "to" to to, "text" to text).toJsonText())
  }

  override fun stop() {
    val page = page ?: return
    this.page = null
    ready = false
    waiting.clear()
    loads.clear()
    sentences.clear()
    slot.removeView(page.view)
    page.destroy()
    Log.i(TAG, "translation engine stopped")
  }

  /** Ends the page's renderer as a crash would (check command `translate-kill`). */
  fun terminateRenderer(): Boolean = page?.terminateRenderer() ?: false

  private fun send(json: String) {
    val page = page ?: start()
    if (ready) page.postMessage(json) else waiting += json
  }

  private fun start(): Page {
    val page = engine.createPage(PageProfile.TRANSLATE, Delegate())
    slot.addView(page.view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    this.page = page
    page.load(URL)
    Log.i(TAG, "translation engine started")
    return page
  }

  private fun fail(why: String) {
    Log.e(TAG, "translation engine failed: $why")
    stop()
    onFailure?.invoke()
  }

  private inner class Delegate : PageDelegate {
    override fun onMessage(page: Page, json: String) {
      if (page !== this@WebViewTranslationEngine.page) return
      val message = runCatching { parseJson(json).obj }.getOrNull() ?: return
      val id = message["id"].number?.toInt()
      when (message["kind"].string) {
        "ready" -> {
          ready = true
          waiting.forEach(page::postMessage)
          waiting.clear()
        }
        "loaded" -> {
          message["error"].string?.let { Log.w(TAG, "translation engine: $it") }
          loads.remove(id)?.invoke(message["ok"].bool == true)
        }
        "translated" -> {
          message["error"].string?.let { Log.w(TAG, "translation engine: $it") }
          sentences.remove(id)?.invoke(message["text"].string)
        }
        "failed" -> fail(message["error"].string ?: "the Worker broke")
      }
    }

    override fun onProcessGone(page: Page) {
      if (page === this@WebViewTranslationEngine.page) fail("its renderer is gone")
    }

    override fun onDocument(page: Page, url: String) {}

    override fun onNavigate(page: Page, url: String) {}

    override fun onLoaded(page: Page, url: String) {}

    override fun onTitle(page: Page, title: String) {}

    override fun onScroll(page: Page, dy: Int, scrollY: Int) {}

    override fun onLeaveApp(page: Page, url: String) {}

    override fun onClose(page: Page) {}

    override fun onEnterFullscreen(page: Page, view: View, exit: () -> Unit) = exit()

    override fun onExitFullscreen(page: Page) {}
  }

  companion object {
    const val URL = "$APP_ORIGIN/translate-host.html"
  }
}
