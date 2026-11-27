package dev.langle.app

import android.content.Intent
import android.content.res.Configuration
import android.util.Base64
import android.util.Log
import dev.langle.core.AppTab
import dev.langle.core.KeyValueStore
import dev.langle.core.jsonOf
import dev.langle.core.toJsonText

/**
 * Debug builds only: commands from `check.sh` as launch intents to the running activity
 * (`am start -n dev.langle.app/.MainActivity --es check <name> …`), with results in logcat
 * (tag LangleCheck), as spike S2 did:
 * - `errors`: the check build's error log (`checkErrorLog` in `storage.local`), read from the store;
 * - `clear-errors`: clears it through the extension host's `browser.storage`, so its listeners hear;
 * - `eval`: runs `source64` (base64 of an async function body) in `target`: host | page | langle |
 *   sheet | home | words | settings | firstrun, and logs what it returns;
 * - `state`: the screen, the tabs, the sheet, the page and whether the host said hello, the page's
 *   history entry, the shared entry's mark and the address waiting for the first run, whether
 *   the title bar shows, whether the page is in fullscreen, the orientation and the window size;
 * - `translate-state`: whether the translation engine runs (its page exists), is off, and the
 *   pairs it loaded;
 * - `adblock`: whether the ad-blocking engine is loaded, when the lists were last all current,
 *   whether some are due, the switches, and how many requests were answered empty;
 * - `adblock-update`: fetches every list now (conditional requests), whether due or not;
 * - `translate`: `from`, `to` and `text` through the translation host, as an on-screen page asks;
 * - `translate-kill`: ends the translation page's renderer, as a crash would.
 */
object CheckCommands {
  const val TAG = "LangleCheck"

  fun ready() = say("ready")

  /** Logs [text] in pieces logcat keeps whole. */
  private fun say(text: String) {
    if (text.length <= 3000) {
      Log.i(TAG, text)
      return
    }
    val pieces = text.chunked(3000)
    pieces.forEachIndexed { i, piece -> Log.i(TAG, "${if (i == 0) "" else "… "}$piece${if (i < pieces.size - 1) " …" else ""}") }
  }

  /** Whether the intent was a check command. */
  fun run(activity: MainActivity, intent: Intent): Boolean {
    val command = intent.getStringExtra("check") ?: return false
    when (command) {
      "errors" -> {
        val log = activity.router.store.stored(KeyValueStore.Area.LOCAL)["checkErrorLog"]
        say("errors ${(log ?: jsonOf(emptyList<Any>())).toJsonText()}")
      }
      "clear-errors" -> {
        val host = activity.host
        if (host == null) say("clear-errors no host")
        else host.evaluate("""await browser.storage.local.remove("checkErrorLog"); return "cleared";""") { say("clear-errors $it") }
      }
      "eval" -> {
        val source = intent.getStringExtra("source64")?.let { String(Base64.decode(it, Base64.DEFAULT), Charsets.UTF_8) }
        if (source == null) {
          say("eval no source64")
          return true
        }
        val done = { result: String -> say("eval $result") }
        val screens = activity.screens
        when (intent.getStringExtra("target")) {
          "host" -> activity.host?.evaluate(source, done) ?: done("no host")
          "page" -> screens.browsing.page.evaluate(ScriptWorld.PAGE, source, done)
          "langle" -> screens.browsing.page.evaluate(ScriptWorld.LANGLE, source, done)
          "sheet" -> screens.sheet?.context?.page?.evaluate(ScriptWorld.PAGE, source, done) ?: done("no sheet")
          "firstrun" -> screens.firstRunPage?.page?.evaluate(ScriptWorld.PAGE, source, done) ?: done("no first run")
          "home", "words", "settings" -> {
            val tab = AppTab.valueOf(intent.getStringExtra("target")!!.uppercase())
            screens.tabPage(tab)?.page?.evaluate(ScriptWorld.PAGE, source, done) ?: done("no $tab page yet")
          }
          else -> done("unknown target")
        }
      }
      "state" -> {
        val tabs = activity.router.tabs.all.joinToString(", ") { "${it.id}${if (it.active) "*" else ""} ${it.url}" }
        val screens = activity.screens
        val landscape = activity.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
        val window = activity.window.decorView
        say(
          "state screen=${screens.shell.screen} host=${activity.host?.isReady ?: false} tabs=[$tabs] " +
            "sheet=${screens.sheet?.context?.page?.url ?: "none"} page=${screens.browsing.page.url ?: "none"} " +
            "entry=${screens.browsing.page.historyIndex} shared=${screens.shell.sharedEntry} held=${screens.shell.heldShare} " +
            "bar=${screens.isBarShown} fullscreen=${activity.isFullscreen} " +
            "orientation=${if (landscape) "landscape" else "portrait"} " +
            "window=${window.width}x${window.height}",
        )
      }
      "translate-state" -> {
        val host = activity.translation
        say(
          if (host == null) "translate-state no host"
          else "translate-state running=${host.isRunning} page=${activity.translationEngine?.isRunning} off=${host.isOff} loaded=${host.loadedPairs}",
        )
      }
      "translate" -> {
        val host = activity.translation ?: return true.also { say("translate no host") }
        val from = intent.getStringExtra("from") ?: "en"
        val to = intent.getStringExtra("to") ?: "ja"
        val text = intent.getStringExtra("text") ?: "Hello."
        val started = System.currentTimeMillis()
        host.translate(from, to, text, start = true, onScreen = true) {
          say("translate ${System.currentTimeMillis() - started} ms ${jsonOf(it).toJsonText()}")
        }
      }
      "translate-kill" -> say("translate-kill ${activity.translationEngine?.terminateRenderer() ?: false}")
      "adblock" -> {
        val blocker = activity.adBlocker
        say(
          if (blocker == null) "adblock none (library loaded=${AdblockNative.loaded})"
          else
            "adblock engine=${blocker.store.engine != null} updatedAt=${blocker.store.updatedAt()} due=${blocker.store.isDue()} " +
              "switches=${blocker.switches.value.toJsonText()} blocked=${blocker.blockedCount.get()}" +
              (intent.getStringExtra("url")?.let { url ->
                val scripts = blocker.documentScripts(url)
                " scripts=${scripts?.joinToString { "${it.world}:${it.source.length}" } ?: "none"}"
              } ?: ""),
        )
      }
      "adblock-update" -> {
        val blocker = activity.adBlocker ?: return true.also { say("adblock-update none") }
        blocker.store.update(force = true)
        say("adblock-update started")
      }
      else -> say("unknown command $command")
    }
    return true
  }
}
