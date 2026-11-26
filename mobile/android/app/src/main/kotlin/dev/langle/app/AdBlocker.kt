package dev.langle.app

import android.os.Handler
import android.util.Log
import dev.langle.core.AdBlockingSwitches
import dev.langle.core.FilterList
import dev.langle.core.FilterListStore
import dev.langle.core.KeyValueStore
import dev.langle.core.ResourceTypes
import dev.langle.core.Router
import dev.langle.core.UrlListFetcher
import dev.langle.core.array
import dev.langle.core.bool
import dev.langle.core.jsonObject
import dev.langle.core.jsonOf
import dev.langle.core.obj
import dev.langle.core.parseJson
import dev.langle.core.setupDone
import dev.langle.core.string
import java.io.File
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.serialization.json.JsonArray

/**
 * Ad blocking on browsing pages (docs/specs/mobile-app.md "M6: ad blocking"): the list store and
 * its engine, the switches (`adBlocking` in `storage.local`), the requests' answers and each host's
 * document-start scripts. Made and called on the main thread, except [blockedType] (WebView's
 * request threads).
 */
class AdBlocker(private val router: Router, dir: File, lists: List<FilterList>, resources: ByteArray, private val main: Handler) : PageBlocking {
  /** Fetching and building (minutes at worst); the stylesheets for classes and ids (milliseconds). */
  private val listWork = Executors.newSingleThreadExecutor()
  private val css = Executors.newSingleThreadExecutor()
  val store = FilterListStore(dir, lists, UrlListFetcher(), NativeFilterEngines(resources), listWork, { main.post(it) })

  @Volatile
  var switches = AdBlockingSwitches.from(local()[AdBlockingSwitches.KEY])
    private set
  private var setup = setupDone(local()[SETUP_KEY])
  /** The last page URL's site, as requests ask for the same page many times. */
  @Volatile
  private var lastSite: Pair<String, String?> = "" to null

  /** Requests answered empty (check commands only; nothing in the app counts or shows them). */
  val blockedCount = AtomicInteger()

  /** The engine changed, or the switches did: pages register their hosts' scripts again. */
  var onRulesChanged: (() -> Unit)? = null

  /** The switches changed from the first to the second (the page of a site that turned reloads). */
  var onSwitches: ((old: AdBlockingSwitches, new: AdBlockingSwitches) -> Unit)? = null

  private fun local() = router.store.stored(KeyValueStore.Area.LOCAL)

  /** Loads the kept engine, then fetches the lists that are due once the first run is done. */
  fun start() {
    store.onEngine = { onRulesChanged?.invoke() }
    store.onUpdated = { at -> router.setStorage(KeyValueStore.Area.LOCAL, mapOf(AdBlockingSwitches.LISTS_KEY to jsonObject("updatedAt" to at))) }
    store.onError = { report("error", it) }
    store.onFetchFailed = { report("warning", it) }
    store.onLog = { Log.i(TAG, "ad blocking: $it") }
    store.start()
    inUse()
  }

  /** The app is in use (on screen, a page opened): the lists that are due are fetched. */
  fun inUse() {
    if (setup) store.update()
  }

  /** Storage changed (`Router.onStorageChanged`): the first run's Start, or the switches. */
  fun storageChanged(area: KeyValueStore.Area, changes: Map<String, KeyValueStore.Change>) {
    if (area != KeyValueStore.Area.LOCAL) return
    changes[SETUP_KEY]?.let {
      setup = setupDone(it.newValue)
      inUse()
    }
    changes[AdBlockingSwitches.KEY]?.let {
      val old = switches
      switches = AdBlockingSwitches.from(it.newValue)
      if (old != switches) {
        onRulesChanged?.invoke()
        onSwitches?.invoke(old, switches)
      }
    }
  }

  /** ⋮ "Block ads on this site": the switch for [site], saved where Settings reads it too. */
  fun setSite(site: String, blocking: Boolean) {
    router.setStorage(KeyValueStore.Area.LOCAL, mapOf(AdBlockingSwitches.KEY to switches.withSite(site, blocking).value))
  }

  fun siteOf(url: String): String? {
    val last = lastSite
    if (last.first == url) return last.second
    return AdblockNative.siteOf(url).also { lastSite = url to it }
  }

  // PageBlocking

  override fun blockedType(url: String, pageUrl: String, headers: Map<String, String>): String? {
    val engine = store.engine ?: return null
    if (!switches.blocks(siteOf(pageUrl))) return null
    val type = ResourceTypes.guess(url, headers)
    if (!engine.blocks(url, pageUrl, type)) return null
    blockedCount.incrementAndGet()
    return type
  }

  override fun documentScripts(url: String): List<UserScript>? {
    val engine = store.engine ?: return null
    if (!switches.blocks(siteOf(url))) return null
    val cosmetic = engine.cosmetic(url)?.let { runCatching { parseJson(it).obj }.getOrNull() } ?: return null
    val scripts = mutableListOf<UserScript>()
    val sheet = cosmetic["css"].string.orEmpty()
    val generic = cosmetic["generichide"].bool != true
    if (sheet.isNotEmpty() || generic) {
      val exceptions = cosmetic["exceptions"].array ?: JsonArray(emptyList())
      val source =
        COSMETIC_SCRIPT
          .replace("__CSS__", jsonOf(sheet).toString())
          .replace("__GENERIC__", generic.toString())
          .replace("__EXCEPTIONS__", exceptions.toString())
      scripts += UserScript(source, ScriptWorld.LANGLE, ScriptRunAt.START)
    }
    val scriptlets = cosmetic["scriptlets"].string.orEmpty()
    if (scriptlets.isNotBlank()) scripts += UserScript("(function(){\n$scriptlets\n})();", ScriptWorld.PAGE, ScriptRunAt.START)
    return scripts
  }

  override fun hiddenCss(message: String, reply: (String) -> Unit) {
    val engine = store.engine ?: return
    css.execute {
      val sheet = engine.hiddenClassIdCss(message)
      if (!sheet.isNullOrEmpty()) main.post { reply(sheet) }
    }
  }

  /**
   * A failed fetch or build: a log line, and in debug builds an entry of the check build's error
   * log (`checkErrorLog`, as src/check/error-log.ts keeps it), so a check reads it with the rest.
   */
  private fun report(level: String, message: String) {
    if (level == "error") Log.e(TAG, message) else Log.w(TAG, message)
    if (!BuildConfig.DEBUG) return
    val entry = jsonObject("level" to level, "message" to message, "context" to "app (Android)", "url" to "", "time" to Instant.now().toString())
    val log = local()[ERROR_LOG_KEY].array.orEmpty() + entry
    router.setStorage(KeyValueStore.Area.LOCAL, mapOf(ERROR_LOG_KEY to JsonArray(log.takeLast(MAX_ERRORS))))
  }

  fun close() {
    listWork.shutdown()
    css.shutdown()
  }

  companion object {
    const val SETUP_KEY = "setup"
    const val ERROR_LOG_KEY = "checkErrorLog"
    const val MAX_ERRORS = 200

    /**
     * Langle's world, at document start in every frame of the host: the page's stylesheet, then
     * (unless `generichide`) the page's classes and ids, at start and as nodes are added, sent to
     * native code in batches for the generic `##.class` / `###id` rules, whose answers are added
     * as stylesheets too. Constructed stylesheets are not subject to the page's CSP.
     */
    private val COSMETIC_SCRIPT =
      """
      (() => {
        const css = __CSS__, generic = __GENERIC__, exceptions = __EXCEPTIONS__;
        const add = (text) => {
          if (!text) return;
          try {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(text);
            document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
          } catch {
            const style = document.createElement("style");
            style.textContent = text;
            (document.head ?? document.documentElement).append(style);
          }
        };
        add(css);
        const bridge = globalThis.${WebViewEngine.ADBLOCK_BRIDGE};
        if (!generic || !bridge) return;
        bridge.addEventListener("message", (event) => add(event.data));
        const seen = new Set();
        let classes = [], ids = [], timer = 0, last = 0;
        const send = () => {
          timer = 0;
          last = Date.now();
          if (classes.length === 0 && ids.length === 0) return;
          bridge.postMessage(JSON.stringify({ classes, ids, exceptions }));
          classes = [];
          ids = [];
        };
        const note = (el) => {
          const id = el.id;
          if (typeof id === "string" && id !== "" && !seen.has("#" + id)) {
            seen.add("#" + id);
            ids.push(id);
          }
          if (el.classList) {
            for (const name of el.classList) {
              if (!seen.has("." + name)) {
                seen.add("." + name);
                classes.push(name);
              }
            }
          }
        };
        const scan = (node) => {
          if (node.nodeType !== 1) return;
          note(node);
          for (const el of node.querySelectorAll("[id],[class]")) note(el);
        };
        const later = () => {
          if (!timer) timer = setTimeout(send, Math.max(0, last + 250 - Date.now()));
        };
        new MutationObserver((records) => {
          for (const record of records) for (const node of record.addedNodes) scan(node);
          later();
        }).observe(document, { childList: true, subtree: true });
        if (document.documentElement) scan(document.documentElement);
        later();
      })();
      """
        .trimIndent()
  }
}
