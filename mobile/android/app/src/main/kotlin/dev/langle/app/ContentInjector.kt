package dev.langle.app

import android.util.Log
import dev.langle.core.Manifest
import dev.langle.core.MatchPattern
import dev.langle.core.jsonObject
import dev.langle.core.jsonOf
import dev.langle.core.toJsonText

/**
 * Which scripts each kind of context gets (docs/specs/mobile-app.md "Contexts"):
 * - web pages: in Langle's world, `__langleAppInfo` and `langle-shim.js` at document start, then
 *   each content script's `js` at its `run_at`; `world: "MAIN"` scripts go in the page's world
 *   without the shim;
 * - app pages: `__langleAppInfo` and the shim in the page's world at document start;
 * - the extension host: `host.html` sets both itself ([hostPage]).
 *
 * Android registers scripts per WebView, not per document, so every web-page script is wrapped in
 * a check of its frame (top only) and URL (the manifest's match patterns, as regular expressions).
 * `document_end` and `document_idle` scripts are queued at document start and run on
 * DOMContentLoaded, before the shim's hello (which waits for the same event), so a context says
 * hello once its scripts have run. Wrapped that way, a script's top-level `let`, `const` and
 * `function` stay its own (WXT's bundles are IIFEs).
 */
class ContentInjector(val manifest: Manifest, private val read: (String) -> ByteArray?) {
  private val sources = mutableMapOf<String, String>()

  /**
   * `window.__langleAppInfo = …;` for a context (`content`, `page` or `host`). `translator`:
   * the app translates on the device with model packs (the translation host,
   * docs/specs/mobile-translation.md "The bridge").
   */
  fun appInfo(context: String): String {
    val info = jsonObject("origin" to APP_ORIGIN, "manifest" to manifest.value, "context" to context, "translator" to TRANSLATOR)
    return "window.__langleAppInfo = ${info.toJsonText()};"
  }

  private fun source(path: String): String? =
    sources[path]
      ?: read("/$path")?.toString(Charsets.UTF_8)?.also { sources[path] = it }
      ?: null.also { Log.e(TAG, "the build has no $path") }

  /** The scripts of every web page; each runs only where its patterns match. */
  fun webPageScripts(): List<UserScript> {
    val scripts = mutableListOf<UserScript>()
    val content = manifest.contentScripts
    for (world in listOf(ScriptWorld.LANGLE, ScriptWorld.PAGE)) {
      val inWorld = content.filter { (it.world == Manifest.World.MAIN) == (world == ScriptWorld.PAGE) }
      if (inWorld.any { it.runAt != Manifest.RunAt.DOCUMENT_START }) {
        scripts += UserScript(DOCUMENT_END_QUEUE, world, ScriptRunAt.START)
      }
    }
    val isolated = content.filter { it.world == Manifest.World.ISOLATED }
    val shim = source("langle-shim.js")
    if (isolated.isNotEmpty() && shim != null) {
      val matches = isolated.flatMap { it.matches }.distinct()
      scripts += UserScript(guarded(matches, appInfo("content") + "\n" + shim), ScriptWorld.LANGLE, ScriptRunAt.START)
    }
    // As Chrome: start scripts, then document_end, then document_idle, each in manifest order.
    for (script in content.sortedBy { it.runAt.ordinal }) {
      val world = if (script.world == Manifest.World.MAIN) ScriptWorld.PAGE else ScriptWorld.LANGLE
      for (file in script.js) {
        val text = source(file) ?: continue
        val body = if (script.runAt == Manifest.RunAt.DOCUMENT_START) text else deferred(text)
        scripts += UserScript(guarded(script.matches, body), world, ScriptRunAt.START)
      }
    }
    return scripts
  }

  /** The scripts of an app page (popup, options, word list, welcome). */
  fun appPageScripts(): List<UserScript> {
    val shim = source("langle-shim.js") ?: return emptyList()
    return listOf(UserScript("if (window === window.top) {\n${appInfo("page")}\n$shim\n}", ScriptWorld.PAGE, ScriptRunAt.START))
  }

  /** The extension host's page: the app info, the shim, then the background. */
  fun hostPage(): String =
    """
    <!doctype html>
    <meta charset="utf-8">
    <title>Langle</title>
    <script>${appInfo("host").replace("</", "<\\/")}</script>
    <script src="/langle-shim.js"></script>
    <script src="/${manifest.background}"></script>
    """
      .trimIndent()

  companion object {
    /** `appHost.translator`: Android's models are packs the app downloads. */
    val TRANSLATOR = mapOf("models" to "packs")

    /** Runs [body] only in the top frame of a document whose URL one of [matches] matches. */
    fun guarded(matches: List<MatchPattern>, body: String): String {
      val patterns = jsonOf(matches.map { it.regex }).toJsonText()
      return "if (window === window.top && $patterns.some((p) => new RegExp(p).test(location.href))) {\n$body\n}"
    }

    /** A `document_end` / `document_idle` script: queued now, run on DOMContentLoaded. */
    private fun deferred(body: String) = "globalThis.$QUEUE.push(function () {\n$body\n});"

    private const val QUEUE = "__langleDocumentEnd"

    /**
     * Registered before the shim, so its DOMContentLoaded listener runs before the shim's hello.
     * A script that throws does not stop the others, and still reaches the error handlers.
     */
    private val DOCUMENT_END_QUEUE =
      """
      if (window === window.top && !globalThis.$QUEUE) {
        const queue = (globalThis.$QUEUE = []);
        document.addEventListener("DOMContentLoaded", () => {
          for (const run of queue.splice(0)) {
            try { run(); } catch (error) { reportError(error); }
          }
        }, { once: true });
      }
      """
        .trimIndent()
  }
}
