package dev.langle.probe.gecko

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import org.json.JSONObject
import org.mozilla.geckoview.AllowOrDeny
import org.mozilla.geckoview.GeckoResult
import org.mozilla.geckoview.GeckoRuntime
import org.mozilla.geckoview.GeckoRuntimeSettings
import org.mozilla.geckoview.GeckoSession
import org.mozilla.geckoview.GeckoView
import org.mozilla.geckoview.WebExtension

const val TAG = "LangleProbe"

/**
 * Prototype browser on GeckoView with a bundled WebExtension (docs/notes/mobile.md "Next steps" 2).
 *
 * Driven from adb:
 *   adb shell "am start -n dev.langle.probe.gecko/.MainActivity --es url '<url>' [--es block off]"
 *   adb shell "am start -n dev.langle.probe.gecko/.MainActivity --es cmd <variants|captions|captionsJa|state|measure>"
 * Everything the page and the extension report goes to logcat with the tag LangleProbe.
 */
class MainActivity : Activity() {
  private lateinit var session: GeckoSession
  private var port: WebExtension.Port? = null
  private var startUrl = "https://m.youtube.com/"
  private var block = true
  private var loaded = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    startUrl = intent.getStringExtra("url") ?: startUrl
    block = intent.getStringExtra("block") != "off"
    val rt =
      runtime
        ?: GeckoRuntime.create(
            this,
            GeckoRuntimeSettings.Builder().remoteDebuggingEnabled(true).consoleOutput(true).build(),
          )
          .also { runtime = it }

    session = GeckoSession()
    session.navigationDelegate =
      object : GeckoSession.NavigationDelegate {
        override fun onLoadRequest(
          session: GeckoSession,
          request: GeckoSession.NavigationDelegate.LoadRequest,
        ): GeckoResult<AllowOrDeny> {
          val ok = request.uri.startsWith("http") || request.uri.startsWith("about:")
          return GeckoResult.fromValue(if (ok) AllowOrDeny.ALLOW else AllowOrDeny.DENY)
        }
      }
    session.progressDelegate =
      object : GeckoSession.ProgressDelegate {
        override fun onPageStart(session: GeckoSession, url: String) {
          Log.i(TAG, "pageStarted $url")
        }

        override fun onPageStop(session: GeckoSession, success: Boolean) {
          Log.i(TAG, "pageStopped success=$success")
        }
      }
    session.open(rt)
    val view = GeckoView(this)
    view.setSession(session)
    setContentView(view)
    Log.i(TAG, "start block=$block ua=${session.settings.userAgentOverride}")

    rt.webExtensionController
      .ensureBuiltIn("resource://android/assets/probe-ext/", "probe@langle.dev")
      .accept(
        { ext ->
          Log.i(TAG, "extension ${ext?.id} installed")
          ext?.setMessageDelegate(
            object : WebExtension.MessageDelegate {
              override fun onConnect(p: WebExtension.Port) {
                port = p
                p.setDelegate(portDelegate)
                p.postMessage(JSONObject().put("config", JSONObject().put("block", block)))
              }
            },
            "langle",
          )
        },
        { e -> Log.e(TAG, "extension install failed", e) },
      )
  }

  private val portDelegate =
    object : WebExtension.PortDelegate {
      override fun onPortMessage(message: Any, port: WebExtension.Port) {
        val msg = message as? JSONObject ?: return
        when (msg.optString("type")) {
          "ready" -> {
            Log.i(TAG, "extension ready $msg")
            if (!loaded) {
              loaded = true
              session.loadUri(startUrl)
            }
          }
          "page" -> Log.i(TAG, "page ${if (msg.optBoolean("top")) "main" else "frame"} ${msg.optString("data")}")
          else -> Log.i(TAG, "ext $msg")
        }
      }

      override fun onDisconnect(port: WebExtension.Port) {
        if (this@MainActivity.port == port) this@MainActivity.port = null
      }
    }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    intent.getStringExtra("url")?.let { session.loadUri(it) }
    intent.getStringExtra("cmd")?.let { port?.postMessage(JSONObject().put("cmd", it)) }
  }

  @Deprecated("Prototype: plain back handling")
  override fun onBackPressed() {
    session.goBack()
  }

  companion object {
    private var runtime: GeckoRuntime? = null
  }
}
