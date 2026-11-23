package dev.langle.spike.host

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

const val TAG = "LangleS2"
const val APP_ORIGIN = "https://appassets.androidplatform.net"
const val HOST_URL = "$APP_ORIGIN/assets/host.html"
const val PROFILE = "langle"
const val WEBKIT_VERSION = "1.18.0" // gradle/libs.versions.toml

/**
 * Spike S2 (docs/plans/mobile-app.md): an extension host on Android System WebView.
 *
 * Driven from adb (run.sh): am start -n dev.langle.spike.host/.MainActivity --es mode <mode> …
 *   world                              Langle world + world-scoped listener on a Wikipedia page
 *   store --es op write|read [--es profile default] [--es clear default]
 *   timer                              hidden host WebViews in the "langle" profile, 1 s interval
 *   crash                              a page WebView and a host WebView; --es cmd terminate later
 * Every result is one logcat line: "S2 <label> <json>" with the tag LangleS2.
 */
class MainActivity : Activity() {
  private val main = Handler(Looper.getMainLooper())
  private lateinit var root: LinearLayout
  private val views = mutableMapOf<String, WebView>()
  private val recipes = mutableMapOf<String, () -> WebView>()
  private val assetLoader by lazy {
    WebViewAssetLoader.Builder().addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this)).build()
  }

  private fun log(label: String, text: String) = Log.i(TAG, "S2 $label $text")

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WebView.setWebContentsDebuggingEnabled(true)
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    setContentView(root)
    logFeatures()
    when (val mode = intent.getStringExtra("mode") ?: "world") {
      "world" -> world()
      "store" -> store()
      "timer" -> timer()
      "crash" -> crash()
      else -> log("error", "unknown mode $mode")
    }
  }

  private fun logFeatures() {
    val pkg = WebViewCompat.getCurrentWebViewPackage(this)
    val features =
      listOf(
          WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD,
          WebViewFeature.MULTI_PROFILE,
          WebViewFeature.WEB_MESSAGE_LISTENER,
          WebViewFeature.DOCUMENT_START_SCRIPT,
        )
        .joinToString(",") { "\"$it\":${WebViewFeature.isFeatureSupported(it)}" }
    log(
      "features",
      "{\"webview\":\"${pkg?.packageName} ${pkg?.versionName}\",\"androidxWebkit\":\"$WEBKIT_VERSION\"," +
        "\"sdk\":${Build.VERSION.SDK_INT},$features}",
    )
  }

  /** A WebView in [profile] (null: the default profile), set up like every WebView in the spike. */
  private fun makeWebView(label: String, profile: String?, appListener: Boolean = true): WebView {
    val web = WebView(this)
    if (profile != null) WebViewCompat.setProfile(web, profile) // before any other use
    web.settings.javaScriptEnabled = true
    web.settings.domStorageEnabled = true
    web.webViewClient =
      object : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
          assetLoader.shouldInterceptRequest(request.url)

        override fun onPageFinished(view: WebView, url: String) {
          log(label, "{\"pageFinished\":\"$url\"}")
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
          log(label, "{\"renderProcessGone\":true,\"didCrash\":${detail.didCrash()},\"priority\":${detail.rendererPriorityAtExit()}}")
          recreate(label, view)
          return true
        }
      }
    web.webChromeClient =
      object : WebChromeClient() {
        override fun onConsoleMessage(m: ConsoleMessage): Boolean {
          if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) log(label, "{\"console\":${org.json.JSONObject.quote(m.message())}}")
          return true
        }
      }
    // The app origin's listener: page world (the app owns these pages).
    if (appListener) WebViewCompat.addWebMessageListener(web, "langleBridge", setOf(APP_ORIGIN)) { _, message, _, _, _ ->
      log(label, message.data ?: "null")
    }
    views[label] = web
    return web
  }

  private fun recreate(label: String, dead: WebView) {
    (dead.parent as? android.view.ViewGroup)?.removeView(dead)
    dead.destroy()
    views.remove(label)
    val fresh = recipes[label]?.invoke()
    log(label, "{\"recreated\":${fresh != null}}")
  }

  // Q2: Langle's world on a real page.
  private fun world() {
    if (!WebViewFeature.isFeatureSupported(WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD)) {
      log("world", "{\"error\":\"JS_INJECTION_IN_FRAME_AND_WORLD unsupported\"}")
      return
    }
    recipes["page"] = {
      val web = makeWebView("page", null, appListener = false)
      val world = WebViewCompat.getExecutionWorld(web, "langle")
      val script = assets.open("world.js").bufferedReader().use { it.readText() }
      WebViewCompat.addJavaScriptOnEvent(web, script, WebViewCompat.INJECTION_EVENT_DOCUMENT_START, setOf("*"), world)
      WebViewCompat.addWebMessageListener(web, "langleBridge", setOf("*"), world) { _, message, origin, isMain, reply ->
        log("world", "{\"origin\":\"$origin\",\"main\":$isMain,\"msg\":${message.data}}")
        if (message.data?.contains("\"kind\":\"start\"") == true) reply.postMessage("pong")
      }
      root.addView(web, LinearLayout.LayoutParams(-1, -1))
      web.webViewClient = pageClient(web.webViewClient)
      web.loadUrl(intent.getStringExtra("url") ?: "https://en.wikipedia.org/wiki/Language")
      web
    }
    recipes["page"]!!()
  }

  /** Adds the page-world checks after load to a page WebView's client. */
  private fun pageClient(base: WebViewClient) =
    object : WebViewClient() {
      override fun onPageFinished(view: WebView, url: String) {
        base.onPageFinished(view, url)
        val check =
          "(() => { window.postMessage({ langle: 'from-page' }, '*'); return JSON.stringify({" +
            "bridge: typeof window.langleBridge, langleWorld: typeof window.__langleWorld," +
            "pageGlobalRLQ: typeof window.RLQ }); })()"
        main.postDelayed({ view.evaluateJavascript(check) { log("pageWorld", it) } }, 1500)
      }

      override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail) =
        base.onRenderProcessGone(view, detail)
    }

  // Q3: IndexedDB in the "langle" profile on the app origin; clearing the default profile.
  private fun store() {
    val op = intent.getStringExtra("op") ?: "read"
    val profile = if (intent.getStringExtra("profile") == "default") null else PROFILE
    val label = "store-${profile ?: "default"}"
    if (profile != null) ProfileStore.getInstance().getOrCreateProfile(profile)
    log(label, "{\"profiles\":\"${ProfileStore.getInstance().allProfileNames}\"}")
    val load = {
      val web = makeWebView(label, profile)
      root.addView(web, LinearLayout.LayoutParams(-1, -1))
      web.loadUrl("$HOST_URL?op=$op&label=$label")
    }
    if (intent.getStringExtra("clear") == "default") {
      WebStorage.getInstance().deleteAllData()
      CookieManager.getInstance().removeAllCookies { removed ->
        CookieManager.getInstance().flush()
        log("clear", "{\"defaultProfileCleared\":true,\"cookiesRemoved\":$removed}")
        load()
      }
    } else {
      load()
    }
  }

  // Q4: host WebViews kept off screen in three ways, plus a visible control, while the main page is blank.
  private fun timer() {
    ProfileStore.getInstance().getOrCreateProfile(PROFILE)
    val page = makeWebView("page", null)
    root.addView(page, LinearLayout.LayoutParams(-1, 0, 1f))
    page.loadUrl("about:blank")
    val hosts =
      listOf("visible", "gone", "zero", "detached").map { label ->
        val web = makeWebView(label, PROFILE)
        when (label) {
          "visible" -> root.addView(web, LinearLayout.LayoutParams(-1, 200))
          "gone" -> {
            web.visibility = View.GONE
            root.addView(web, LinearLayout.LayoutParams(-1, 200))
          }
          "zero" -> root.addView(web, LinearLayout.LayoutParams(0, 0))
          "detached" -> Unit
        }
        web.loadUrl("$HOST_URL?op=timer&label=$label")
        web
      }
    val seconds = intent.getStringExtra("seconds")?.toLong() ?: 122L
    main.postDelayed({ hosts.forEach { it.evaluateJavascript("window.__report()", null) } }, seconds * 1000)
  }

  // Q5: a page WebView (default profile) and a host WebView ("langle" profile, GONE) share a renderer?
  private fun crash() {
    ProfileStore.getInstance().getOrCreateProfile(PROFILE)
    recipes["page"] = {
      val web = makeWebView("page", null)
      root.addView(web, LinearLayout.LayoutParams(-1, -1))
      web.loadUrl("https://en.wikipedia.org/wiki/Language")
      web
    }
    recipes["host"] = {
      val web = makeWebView("host", PROFILE)
      web.visibility = View.GONE
      root.addView(web, LinearLayout.LayoutParams(-1, 200))
      web.loadUrl("$HOST_URL?op=ping&label=host")
      web
    }
    recipes.values.forEach { it() }
    main.postDelayed(::logRenderers, 4000)
  }

  private fun logRenderers() {
    val page = views["page"]?.let { WebViewCompat.getWebViewRenderProcess(it) }
    val host = views["host"]?.let { WebViewCompat.getWebViewRenderProcess(it) }
    log("renderers", "{\"page\":${page != null},\"host\":${host != null},\"same\":${page != null && page === host}}")
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    when (intent.getStringExtra("cmd")) {
      "terminate" -> {
        val target = views[intent.getStringExtra("target") ?: "page"] ?: return
        val ok = WebViewCompat.getWebViewRenderProcess(target)?.terminate()
        log("terminate", "{\"terminated\":$ok}")
      }
      "renderers" -> logRenderers()
      "report" -> views.values.forEach { it.evaluateJavascript("window.__report?.()", null) }
    }
  }
}
