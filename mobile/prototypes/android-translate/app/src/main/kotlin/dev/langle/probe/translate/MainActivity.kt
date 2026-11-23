package dev.langle.probe.translate

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import java.io.File

/**
 * Runs the flavor's engine over files/set.json and writes files/result-<run>.json.
 * Every flavor holds a WebView, as the app itself will, so memory can be compared.
 *   am start -n <id>/dev.langle.probe.translate.MainActivity --es run <name>
 * Run "lifecycle" waits for --es cmd load|release|status. With --es video <id>, a YouTube page
 * plays above the engine, in the renderer they share.
 */
class MainActivity : Activity() {
  private lateinit var engine: WebView
  private var browser: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val run = intent.getStringExtra("run") ?: "idle"
    require(run.all { it.isLetterOrDigit() || it == '-' })
    val web = WebView(this)
    engine = web
    val video = intent.getStringExtra("video")
    if (video == null) {
      setContentView(web)
    } else {
      require(video.all { it.isLetterOrDigit() || it == '-' || it == '_' })
      setContentView(
        LinearLayout(this).apply {
          orientation = LinearLayout.VERTICAL
          addView(browse(video).also { browser = it }, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
          addView(web, LinearLayout.LayoutParams(MATCH_PARENT, 1))
        }
      )
    }
    Log.i(TAG, "START $run")
    startEngine(this, web, run) { json ->
      File(filesDir, "result-$run.json").writeText(json)
      Log.i(TAG, "DONE $run")
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    when (val command = intent.getStringExtra("cmd")) {
      "load", "release" -> engine.evaluateJavascript("command('$command')", null)
      "status" -> browser?.evaluateJavascript(VIDEO_STATUS) { Log.i(TAG, "VIDEO $it") }
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun browse(video: String) =
    WebView(this).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.mediaPlaybackRequiresUserGesture = false
      webViewClient =
        object : WebViewClient() {
          override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            Log.i(TAG, "RENDERER GONE browser crashed=${detail.didCrash()}")
            return true
          }
        }
      loadUrl("https://m.youtube.com/watch?v=$video")
    }

  companion object {
    private const val VIDEO_STATUS =
      """(() => { const v = document.querySelector("video"); if (!v) return { video: false };
        v.muted = true; if (v.paused) v.play().catch(() => {});
        return { time: v.currentTime, paused: v.paused, at: Date.now(), since: performance.timeOrigin }; })()"""
    const val TAG = "LangleProbe"
  }
}
