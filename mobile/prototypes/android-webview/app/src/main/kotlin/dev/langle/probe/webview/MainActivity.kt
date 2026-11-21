package dev.langle.probe.webview

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import java.io.ByteArrayInputStream

const val TAG = "LangleProbe"

/**
 * Prototype browser on Android System WebView (docs/notes/mobile.md "Next steps" 2).
 *
 * Driven from adb:
 *   adb shell am start -n dev.langle.probe.webview/.MainActivity --es url <url> [--es ua nowv] [--es block off]
 * `ua nowv` drops "; wv" and "Version/4.0" from the user agent; `block off` turns ad blocking off.
 * Page messages and blocker counts go to logcat with the tag LangleProbe.
 */
class MainActivity : Activity() {
  private lateinit var web: WebView
  private lateinit var root: FrameLayout
  private var fullscreenView: View? = null
  private lateinit var blocker: Blocker

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WebView.setWebContentsDebuggingEnabled(true)
    root = FrameLayout(this)
    web = WebView(this)
    root.addView(web)
    setContentView(root)

    val blockOn = intent.getStringExtra("block") != "off"
    val startUrl = intent.getStringExtra("url") ?: "https://m.youtube.com/"
    // The first page waits for the list, so its requests and its document-start CSS are covered.
    blocker =
      Blocker(this, blockOn) { css ->
        runOnUiThread {
          css?.let { addCosmetics(it) }
          web.loadUrl(startUrl)
        }
      }

    val settings = web.settings
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.mediaPlaybackRequiresUserGesture = false
    if (intent.getStringExtra("ua") == "nowv") {
      settings.userAgentString =
        settings.userAgentString.replace("; wv", "").replace(Regex(" Version/\\d+\\.\\d+"), "")
    }
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)
    Log.i(TAG, "start ua=${settings.userAgentString} block=$blockOn")

    val probe = assets.open("probe.js").bufferedReader().use { it.readText() }
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      WebViewCompat.addDocumentStartJavaScript(web, probe, setOf("*"))
    } else {
      Log.w(TAG, "DOCUMENT_START_SCRIPT unsupported")
    }
    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      WebViewCompat.addWebMessageListener(web, "langleNative", setOf("*")) {
        _, message, origin, isMainFrame, _ ->
        Log.i(TAG, "page ${if (isMainFrame) "main" else "frame"} $origin ${message.data}")
      }
    }

    web.webViewClient =
      object : WebViewClient() {
        override fun shouldInterceptRequest(
          view: WebView,
          request: WebResourceRequest,
        ): WebResourceResponse? {
          if (blocker.blocks(request.url, request.isForMainFrame)) {
            return WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(ByteArray(0)))
          }
          return null
        }

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
          val scheme = request.url.scheme
          // Stay in the app for web pages; drop intent:// and app links (YouTube tries its app).
          return scheme != "http" && scheme != "https"
        }

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
          Log.i(TAG, "pageStarted $url")
          blocker.resetPageCount()
        }

        override fun onPageFinished(view: WebView, url: String) {
          Log.i(TAG, "pageFinished $url blocked=${blocker.pageBlocked}")
        }
      }
    web.webChromeClient =
      object : WebChromeClient() {
        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
          fullscreenView = view
          root.addView(view)
        }

        override fun onHideCustomView() {
          fullscreenView?.let { root.removeView(it) }
          fullscreenView = null
        }
      }
  }

  private fun addCosmetics(css: String) {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
    val quoted = org.json.JSONObject.quote(css)
    val script =
      "(()=>{const s=document.createElement('style');s.id='langle-cosmetic';s.textContent=$quoted;" +
        "(document.head||document.documentElement).appendChild(s);})();"
    WebViewCompat.addDocumentStartJavaScript(web, script, setOf("*"))
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    intent.getStringExtra("url")?.let { web.loadUrl(it) }
  }

  @Deprecated("Prototype: plain back handling")
  override fun onBackPressed() {
    if (web.canGoBack()) web.goBack() else @Suppress("DEPRECATION") super.onBackPressed()
  }
}
