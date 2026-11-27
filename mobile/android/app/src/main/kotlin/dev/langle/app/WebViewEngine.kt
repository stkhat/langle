package dev.langle.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.MimeTypeMap
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.JavaScriptExecutionWorld
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.ProfileStore
import androidx.webkit.ScriptHandler
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import dev.langle.core.CosmeticHosts
import dev.langle.core.jsonOf
import dev.langle.core.obj
import dev.langle.core.parseJson
import dev.langle.core.pickerTypes
import dev.langle.core.string
import dev.langle.core.toJsonText
import java.io.ByteArrayInputStream

const val TAG = "Langle"

/**
 * The engine over Android System WebView (androidx.webkit 1.18.0; spike S2, docs/notes/mobile.md):
 * - browsing pages use the default profile; app pages and the extension host the profile "langle"
 *   (`ProfileStore`), with the app origin served by [AppOrigin]; the translation host's page the
 *   profile "translate", served by [translateFiles] only;
 * - Langle's world is the execution world "langle"; scripts go in with `addJavaScriptOnEvent`,
 *   which registers them per WebView, so each script checks its frame and URL itself
 *   (ContentInjector);
 * - the bridge is the `addWebMessageListener` object `langleBridge`: in Langle's world for every
 *   origin on browsing pages, in the page's world for the app origin only on app pages. Native →
 *   scripts goes through the `JavaScriptReplyProxy` of the top document's first message;
 * - ad blocking ([blocking]) answers browsing pages' subresource requests in
 *   `shouldInterceptRequest`, and registers each host's document-start scripts (cosmetics in
 *   Langle's world, scriptlets in the page's) for the origins of that host only, before its first
 *   document starts, newest 8 hosts kept: before a navigation starts (load, reload, back,
 *   forward, a link or a redirect; a registration made once the main frame's request is out comes
 *   too late for that document, measured on the emulator), and for the page's host again when the
 *   rules change. The generic class and id rules come back through the `langleAdblock` listener.
 */
class WebViewEngine(private val context: Context, private val origin: AppOrigin) : BrowsingEngine {
  val missingFeatures = REQUIRED_FEATURES.filterNot { WebViewFeature.isFeatureSupported(it) }
  override val supportsLangle = missingFeatures.isEmpty()

  init {
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    if (supportsLangle) {
      ProfileStore.getInstance().getOrCreateProfile(APP_PROFILE)
      ProfileStore.getInstance().getOrCreateProfile(TRANSLATE_PROFILE)
    } else Log.w(TAG, "Langle does not run on pages: the WebView lacks $missingFeatures")
  }

  /**
   * Answers a page's `<input type=file>` with the files the user picked, or null (MainActivity:
   * the system's document picker); without it the input gets nothing.
   */
  var chooseFiles: ((types: List<String>, multiple: Boolean, done: (Array<Uri>?) -> Unit) -> Unit)? = null

  /**
   * Serves the translate profile's requests (TranslateOrigin): the app origin with the engine and
   * the model files; whatever it does not serve is not found, so that page never reaches the network.
   */
  var translateFiles: ((Uri) -> WebResourceResponse?)? = null

  override var blocking: PageBlocking? = null
  private val browsingPages = mutableSetOf<WebViewPage>()

  override fun blockingChanged() = browsingPages.toList().forEach { it.blockingChanged() }

  override fun createPage(profile: PageProfile, delegate: PageDelegate): Page =
    WebViewPage(
      context, profile, delegate, supportsLangle,
      blocking = { if (profile == PageProfile.BROWSING) blocking else null },
      onDestroyed = { browsingPages.remove(it) },
      intercept = { url ->
        when (profile) {
          PageProfile.BROWSING -> null
          PageProfile.APP -> origin.intercept(url)
          PageProfile.TRANSLATE -> translateFiles?.invoke(url) ?: notFound()
        }
      },
    ) { types, multiple, done ->
      chooseFiles?.invoke(types, multiple, done) ?: done(null)
    }.also { if (profile == PageProfile.BROWSING) browsingPages += it }

  companion object {
    const val APP_PROFILE = "langle"
    const val TRANSLATE_PROFILE = "translate"
    const val LANGLE_WORLD = "langle"
    const val BRIDGE = "langleBridge"
    /** Langle's world on browsing pages: a document's classes and ids out, their stylesheet back. */
    const val ADBLOCK_BRIDGE = "langleAdblock"

    val REQUIRED_FEATURES =
      listOf(
        WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD,
        WebViewFeature.WEB_MESSAGE_LISTENER,
        WebViewFeature.DOCUMENT_START_SCRIPT,
        WebViewFeature.MULTI_PROFILE,
      )
  }
}

/**
 * What a blocked subresource gets: an empty 200, of a type its element accepts (an empty script
 * or stylesheet does nothing, an empty frame shows nothing), never cached.
 */
fun blockedResponse(type: String): WebResourceResponse {
  val mime =
    when (type) {
      "script" -> "text/javascript"
      "stylesheet" -> "text/css"
      "sub_frame" -> "text/html"
      "image" -> "image/gif"
      else -> "text/plain"
    }
  val headers = mapOf("Cache-Control" to "no-store", "Access-Control-Allow-Origin" to "*")
  return WebResourceResponse(mime, "utf-8", 200, "OK", headers, ByteArrayInputStream(ByteArray(0)))
}

/** A 404 for what an origin does not serve. */
fun notFound(): WebResourceResponse =
  WebResourceResponse("text/plain", "utf-8", 404, "Not Found", mapOf("Cache-Control" to "no-store"), ByteArrayInputStream("Not found".toByteArray()))

@SuppressLint("SetJavaScriptEnabled")
private class WebViewPage(
  private val context: Context,
  private val profile: PageProfile,
  private val delegate: PageDelegate,
  private val langle: Boolean,
  private val blocking: () -> PageBlocking?,
  private val onDestroyed: (WebViewPage) -> Unit,
  private val intercept: (Uri) -> WebResourceResponse?,
  private val chooseFiles: (types: List<String>, multiple: Boolean, done: (Array<Uri>?) -> Unit) -> Unit,
) : Page {
  override val view = FrameLayout(context)
  private var web: WebView
  private var scripts = emptyList<UserScript>()
  private val handlers = mutableListOf<ScriptHandler>()
  /** The top document's bridge, from its first message. */
  private var reply: JavaScriptReplyProxy? = null
  private var lastUrl: String? = null
  private var nextEval = 0
  private val evals = mutableMapOf<Int, (String) -> Unit>()
  private val main = Handler(Looper.getMainLooper())
  /** The top document's URL, which its subresources are checked against (on request threads). */
  @Volatile private var topUrl: String? = null
  /** The hosts whose ad-blocking scripts are registered on [web]. */
  private val hosts =
    CosmeticHosts<List<ScriptHandler>>(register = ::registerHost, unregister = { all -> all.forEach { runCatching { it.remove() } } })

  private val onAppOrigin = profile != PageProfile.BROWSING
  /** Every bridge origin rule: the app origin's pages, or any web page. */
  private val rules = if (onAppOrigin) setOf(APP_ORIGIN) else setOf("*")
  private val bridgeWorld = if (onAppOrigin) ScriptWorld.PAGE else ScriptWorld.LANGLE

  init {
    web = makeWebView()
  }

  override val url: String?
    get() = web.url ?: lastUrl

  override val canGoBack: Boolean
    get() = web.canGoBack()

  override val canGoForward: Boolean
    get() = web.canGoForward()

  override val historyIndex: Int
    get() = web.copyBackForwardList().currentIndex.coerceAtLeast(0)

  private fun makeWebView(): WebView {
    val web = WebView(context)
    // Before any other use of the WebView.
    if (langle && profile == PageProfile.APP) WebViewCompat.setProfile(web, WebViewEngine.APP_PROFILE)
    if (langle && profile == PageProfile.TRANSLATE) WebViewCompat.setProfile(web, WebViewEngine.TRANSLATE_PROFILE)
    web.settings.allowFileAccess = false
    web.settings.allowContentAccess = false
    web.settings.javaScriptEnabled = true
    web.settings.domStorageEnabled = true
    if (profile == PageProfile.BROWSING) {
      // As a phone browser does: a page without a viewport meta is laid out at desktop
      // width and shown zoomed out to fit; pinch zoom works without the zoom buttons.
      web.settings.useWideViewPort = true
      web.settings.loadWithOverviewMode = true
      web.settings.builtInZoomControls = true
      web.settings.displayZoomControls = false
    }
    web.webViewClient = Client()
    web.webChromeClient = Chrome()
    web.setOnScrollChangeListener { _, _, y, _, oldY -> if (y != oldY) delegate.onScroll(this, y - oldY, y) }
    if (langle) {
      WebViewCompat.addWebMessageListener(web, WebViewEngine.BRIDGE, rules, world(web, bridgeWorld)) {
        _, message, _, isMainFrame, proxy ->
        if (isMainFrame && message.type == WebMessageCompat.TYPE_STRING) message.data?.let { received(it, proxy) }
      }
      // Before every other script: a new document says so, then its envelopes follow in order.
      WebViewCompat.addJavaScriptOnEvent(
        web, DOCUMENT_MARK_SCRIPT, WebViewCompat.INJECTION_EVENT_DOCUMENT_START, rules, world(web, bridgeWorld),
      )
      if (profile == PageProfile.BROWSING) {
        WebViewCompat.addWebMessageListener(web, WebViewEngine.ADBLOCK_BRIDGE, rules, world(web, ScriptWorld.LANGLE)) {
          _, message, _, _, proxy ->
          val data = message.data
          if (message.type == WebMessageCompat.TYPE_STRING && data != null) {
            blocking()?.hiddenCss(data) { css -> runCatching { proxy.postMessage(css) } }
          }
        }
      }
    }
    view.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    return web
  }

  private fun world(web: WebView, world: ScriptWorld): JavaScriptExecutionWorld =
    WebViewCompat.getExecutionWorld(
      web,
      if (world == ScriptWorld.LANGLE) WebViewEngine.LANGLE_WORLD else JavaScriptExecutionWorld.PAGE_WORLD_NAME,
    )

  private fun received(data: String, proxy: JavaScriptReplyProxy) {
    val document = if (data.startsWith(DOCUMENT_MARK_PREFIX)) runCatching { parseJson(data).obj?.get(DOCUMENT_MARK).string }.getOrNull() else null
    if (document != null) {
      reply = proxy
      lastUrl = document
      delegate.onDocument(this, document)
    } else {
      if (reply == null) reply = proxy
      delegate.onMessage(this, data)
    }
  }

  override fun load(url: String) {
    lastUrl = url
    prepareHost(Uri.parse(url))
    web.loadUrl(url)
  }

  // ad blocking

  /** Makes sure [url]'s host has its ad-blocking scripts before its document starts (main thread). */
  private fun prepareHost(url: Uri) {
    if (profile != PageProfile.BROWSING || !langle) return
    val host = url.host?.lowercase() ?: return
    if (url.scheme != "https" && url.scheme != "http" || !COMPLETE_HOST.matches(host)) return
    hosts.prepare(host, url.toString())
  }

  /** [url]'s host's scripts, for that host's origins only, or null while it gets none. */
  private fun registerHost(host: String, url: String): List<ScriptHandler>? {
    val scripts = blocking()?.documentScripts(url) ?: return null
    val origins = setOf("https://$host", "http://$host")
    if (BuildConfig.DEBUG) Log.i(TAG, "ad blocking: ${scripts.size} document-start scripts for $host")
    return scripts.map { WebViewCompat.addJavaScriptOnEvent(web, it.source, event(it.runAt), origins, world(web, it.world)) }
  }

  /**
   * The rules or the switches changed: hosts get their scripts again as they are next opened, the
   * page's own at once (for its next document: a reload the page itself asks for, say).
   */
  fun blockingChanged() {
    hosts.clear()
    url?.let { prepareHost(Uri.parse(it)) }
  }

  /**
   * A browsing page's request: the main frame is never blocked (its host's scripts are registered
   * for its later documents, if a navigation came no way that did it before); a subresource is
   * checked against the top document's URL.
   */
  private fun browsingRequest(request: WebResourceRequest): WebResourceResponse? {
    val blocking = blocking() ?: return null
    val url = request.url
    if (url.scheme != "https" && url.scheme != "http") return null
    val text = url.toString()
    if (request.isForMainFrame) {
      topUrl = text
      main.post { prepareHost(url) }
      return null
    }
    val page = topUrl ?: return null
    val type = blocking.blockedType(text, page, request.requestHeaders.orEmpty()) ?: return null
    return blockedResponse(type)
  }

  override fun reload() {
    url?.let { prepareHost(Uri.parse(it)) }
    web.reload()
  }

  override fun goBack() {
    prepareHistory(-1)
    web.goBack()
  }

  override fun goForward() {
    prepareHistory(1)
    web.goForward()
  }

  /** The history entry [step] away gets its host's scripts before it loads. */
  private fun prepareHistory(step: Int) {
    val history = web.copyBackForwardList()
    history.getItemAtIndex(history.currentIndex + step)?.url?.let { prepareHost(Uri.parse(it)) }
  }

  override fun setUserScripts(scripts: List<UserScript>) {
    this.scripts = scripts
    handlers.forEach { it.remove() }
    handlers.clear()
    if (!langle) return
    for (script in scripts) {
      handlers += WebViewCompat.addJavaScriptOnEvent(web, script.source, event(script.runAt), rules, world(web, script.world))
    }
  }

  private fun event(runAt: ScriptRunAt) =
    if (runAt == ScriptRunAt.START) WebViewCompat.INJECTION_EVENT_DOCUMENT_START else WebViewCompat.INJECTION_EVENT_DOCUMENT_END

  override fun postMessage(json: String) {
    val reply = reply
    if (reply == null) Log.w(TAG, "no bridge to post to on ${url ?: "a page"}") else reply.postMessage(json)
  }

  override fun evaluate(world: ScriptWorld, source: String, done: (String) -> Unit) {
    val id = nextEval++
    evals[id] = done
    val prefix = jsonOf("$EVAL_PREFIX$id ").toJsonText()
    val wrapped =
      "(async () => { $source\n})().then((v) => console.info($prefix + (typeof v === \"string\" ? v : JSON.stringify(v))), " +
        "(e) => console.info($prefix + \"error \" + (e?.stack ?? e)))"
    when {
      world == ScriptWorld.PAGE -> web.evaluateJavascript(wrapped, null)
      world == bridgeWorld && reply != null -> reply?.executeJavaScript(wrapped) { }
      else -> evals.remove(id)?.invoke("no bridge in that world")
    }
  }

  override fun recreate() {
    Log.i(TAG, "creating the page again at $lastUrl")
    hosts.clear()
    view.removeView(web)
    web.destroy()
    reply = null
    web = makeWebView()
    setUserScripts(scripts)
    lastUrl?.let { web.loadUrl(it) }
  }

  override fun destroy() {
    onDestroyed(this)
    hosts.clear()
    handlers.clear()
    view.removeView(web)
    web.destroy()
  }

  override fun terminateRenderer(): Boolean =
    WebViewFeature.isFeatureSupported(WebViewFeature.GET_WEB_VIEW_RENDERER) &&
      WebViewCompat.getWebViewRenderProcess(web)?.terminate() == true

  private inner class Client : WebViewClient() {
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
      if (profile == PageProfile.BROWSING) browsingRequest(request) else intercept(request.url)

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      if (!request.isForMainFrame) return false
      val url = request.url
      if (onAppOrigin) {
        if (url.scheme == "https" && url.host == APP_HOST) return false
        if (profile == PageProfile.APP) delegate.onLeaveApp(this@WebViewPage, url.toString())
        return true
      }
      if (url.scheme in WEB_SCHEMES) {
        prepareHost(url)
        return false
      }
      // mailto:, intent: and the like go to the apps that handle them.
      try {
        context.startActivity(Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (_: ActivityNotFoundException) {
        Log.i(TAG, "no app opens $url")
      }
      return true
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
      lastUrl = url
      topUrl = url
    }

    override fun onPageFinished(view: WebView, url: String) {
      if (view === web) delegate.onLoaded(this@WebViewPage, url)
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
      lastUrl = url
      topUrl = url
      delegate.onNavigate(this@WebViewPage, url)
    }

    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
      Log.e(TAG, "renderer gone (crash: ${detail.didCrash()}) for ${profile.name.lowercase()} page $lastUrl")
      // A WebView this page already replaced: nothing more to do.
      if (view === web) {
        reply = null
        delegate.onProcessGone(this@WebViewPage)
      }
      return true
    }
  }

  private inner class Chrome : WebChromeClient() {
    /**
     * Element fullscreen (`requestFullscreen`, YouTube's fullscreen button): [view] renders the
     * page's fullscreen element, with everything inside it, Langle's overlay included.
     */
    override fun onShowCustomView(view: View, callback: CustomViewCallback) {
      delegate.onEnterFullscreen(this@WebViewPage, view) { callback.onCustomViewHidden() }
    }

    override fun onHideCustomView() {
      delegate.onExitFullscreen(this@WebViewPage)
    }

    override fun onReceivedTitle(view: WebView, title: String?) {
      if (view === web && title != null) delegate.onTitle(this@WebViewPage, title)
    }

    /** A file input (Import's): the picker asks for the input's `accept` types where it has them. */
    override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
      val types = pickerTypes(params.acceptTypes.orEmpty().toList()) { MimeTypeMap.getSingleton().getMimeTypeFromExtension(it) }
      chooseFiles(types, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) { callback.onReceiveValue(it) }
      return true
    }

    override fun onCloseWindow(window: WebView) {
      if (window === web) delegate.onClose(this@WebViewPage)
    }

    override fun onConsoleMessage(message: ConsoleMessage): Boolean {
      val text = message.message()
      if (text.startsWith(EVAL_PREFIX)) {
        val rest = text.removePrefix(EVAL_PREFIX)
        val id = rest.substringBefore(' ').toIntOrNull()
        evals.remove(id)?.invoke(rest.substringAfter(' '))
        return true
      }
      // Debug builds: errors and warnings go to logcat (check.sh log), next to the check build's
      // own error log. Uncaught errors and rejections arrive here as console errors.
      if (!BuildConfig.DEBUG) return true
      val level = message.messageLevel()
      if (level == ConsoleMessage.MessageLevel.ERROR || level == ConsoleMessage.MessageLevel.WARNING) {
        Log.w(CONSOLE_TAG, "${level.name.lowercase()} $lastUrl ${message.sourceId()}:${message.lineNumber()} ${text.take(3000)}")
      }
      return true
    }
  }

  companion object {
    const val CONSOLE_TAG = "LangleConsole"
    const val DOCUMENT_MARK = "langleDocument"
    const val DOCUMENT_MARK_PREFIX = "{\"$DOCUMENT_MARK\":"
    const val EVAL_PREFIX = "langle-check-eval "
    val WEB_SCHEMES = setOf("http", "https", "about", "data", "blob", "javascript", "file")
    /** A host an origin rule can name (no IPv6 brackets, no ports, no odd characters). */
    val COMPLETE_HOST = Regex("[a-z0-9-]+(\\.[a-z0-9-]+)*")

    /** Each new top-level document tells native code it started (and where), before its envelopes. */
    val DOCUMENT_MARK_SCRIPT =
      """
      if (window === window.top && globalThis.${WebViewEngine.BRIDGE}) {
        ${WebViewEngine.BRIDGE}.postMessage(JSON.stringify({ $DOCUMENT_MARK: location.href }));
      }
      """
        .trimIndent()
  }
}
