package dev.langle.probe.translate

import android.annotation.SuppressLint
import android.app.Activity
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.io.File

private const val HOST = "probe.langle.invalid"
private val NAME = Regex("[A-Za-z0-9._-]+")

/**
 * Mozilla's Bergamot (WebAssembly) in a Web Worker. Everything is served from the app: scripts
 * and engine from the assets, model and test set from files/. No other address loads.
 */
@SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
fun startEngine(activity: Activity, web: WebView, run: String, done: (String) -> Unit) {
  web.settings.javaScriptEnabled = true
  web.addJavascriptInterface(
    object {
      @JavascriptInterface fun report(json: String) = done(json)
    },
    "Host",
  )
  web.webChromeClient =
    object : WebChromeClient() {
      override fun onConsoleMessage(message: ConsoleMessage): Boolean {
        Log.i(MainActivity.TAG, "page ${message.message()}")
        return true
      }
    }
  web.webViewClient =
    object : WebViewClient() {
      override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        Log.i(MainActivity.TAG, "RENDERER GONE engine crashed=${detail.didCrash()}")
        return true
      }

      override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
        val name = request.url.lastPathSegment.orEmpty()
        val missing = WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
        if (request.url.host != HOST || !NAME.matches(name) || name.startsWith(".")) return missing
        val file = File(activity.filesDir, name)
        val body =
          if (file.isFile) file.inputStream()
          else runCatching { activity.assets.open(name) }.getOrNull() ?: return missing
        val type =
          when (name.substringAfterLast('.')) {
            "html" -> "text/html"
            "js" -> "text/javascript"
            "json" -> "application/json"
            "wasm" -> "application/wasm"
            else -> "application/octet-stream"
          }
        return WebResourceResponse(type, if (type.startsWith("text/")) "utf-8" else null, body)
      }
    }
  web.loadUrl("https://$HOST/index.html?run=$run")
}
