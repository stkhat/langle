package dev.langle.probe.translate

import android.app.Activity
import android.webkit.WebView

/** The baseline for size and memory: a blank WebView. */
fun startEngine(activity: Activity, web: WebView, run: String, done: (String) -> Unit) {
  web.loadUrl("about:blank")
  done("{\"engine\":\"none\"}")
}
