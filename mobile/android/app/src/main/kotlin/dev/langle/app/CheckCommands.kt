package dev.langle.app

import android.content.Intent
import android.util.Base64
import android.util.Log
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
 *   sheet, and logs what it returns;
 * - `state`: the tabs, the sheet, the page and whether the host said hello.
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
        when (intent.getStringExtra("target")) {
          "host" -> activity.host?.evaluate(source, done) ?: done("no host")
          "page" -> activity.browsing.page.evaluate(ScriptWorld.PAGE, source, done)
          "langle" -> activity.browsing.page.evaluate(ScriptWorld.LANGLE, source, done)
          "sheet" -> activity.sheet?.context?.page?.evaluate(ScriptWorld.PAGE, source, done) ?: done("no sheet")
          else -> done("unknown target")
        }
      }
      "state" -> {
        val tabs = activity.router.tabs.all.joinToString(", ") { "${it.id}${if (it.active) "*" else ""} ${it.url}" }
        say(
          "state host=${activity.host?.isReady ?: false} tabs=[$tabs] sheet=${activity.sheet?.context?.page?.url ?: "none"} " +
            "page=${activity.browsing.page.url ?: "none"}",
        )
      }
      else -> say("unknown command $command")
    }
    return true
  }
}
