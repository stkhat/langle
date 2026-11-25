package dev.langle.app

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
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
import dev.langle.core.jsonOf
import dev.langle.core.obj
import dev.langle.core.parseJson
import dev.langle.core.pickerTypes
import dev.langle.core.string
import dev.langle.core.toJsonText

const val TAG = "Langle"

/**
 * The engine over Android System WebView (androidx.webkit 1.18.0; spike S2, docs/notes/mobile.md):
 * - browsing pages use the default profile; app pages and the extension host the profile "langle"
 *   (`ProfileStore`), with the app origin served by [AppOrigin];
 * - Langle's world is the execution world "langle"; scripts go in with `addJavaScriptOnEvent`,
 *   which registers them per WebView, so each script checks its frame and URL itself
 *   (ContentInjector);
 * - the bridge is the `addWebMessageListener` object `langleBridge`: in Langle's world for every
 *   origin on browsing pages, in the page's world for the app origin only on app pages. Native →
 *   scripts goes through the `JavaScriptReplyProxy` of the top document's first message.
 */
class WebViewEngine(private val context: Context, private val origin: AppOrigin) : BrowsingEngine {
  val missingFeatures = REQUIRED_FEATURES.filterNot { WebViewFeature.isFeatureSupported(it) }
  override val supportsLangle = missingFeatures.isEmpty()

  init {
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    if (supportsLangle) ProfileStore.getInstance().getOrCreateProfile(APP_PROFILE)
    else Log.w(TAG, "Langle does not run on pages: the WebView lacks $missingFeatures")
  }

  /**
   * Answers a page's `<input type=file>` with the files the user picked, or null (MainActivity:
   * the system's document picker); without it the input gets nothing.
   */
  var chooseFiles: ((types: List<String>, multiple: Boolean, done: (Array<Uri>?) -> Unit) -> Unit)? = null

  override fun createPage(profile: PageProfile, delegate: PageDelegate): Page =
    WebViewPage(context, profile, delegate, origin, supportsLangle) { types, multiple, done ->
      chooseFiles?.invoke(types, multiple, done) ?: done(null)
    }

  companion object {
    const val APP_PROFILE = "langle"
    const val LANGLE_WORLD = "langle"
    const val BRIDGE = "langleBridge"

    val REQUIRED_FEATURES =
      listOf(
        WebViewFeature.JS_INJECTION_IN_FRAME_AND_WORLD,
        WebViewFeature.WEB_MESSAGE_LISTENER,
        WebViewFeature.DOCUMENT_START_SCRIPT,
        WebViewFeature.MULTI_PROFILE,
      )
  }
}

@SuppressLint("SetJavaScriptEnabled")
private class WebViewPage(
  private val context: Context,
  private val profile: PageProfile,
  private val delegate: PageDelegate,
  private val origin: AppOrigin,
  private val langle: Boolean,
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

  /** Every bridge origin rule: the app origin's pages, or any web page. */
  private val rules = if (profile == PageProfile.APP) setOf(APP_ORIGIN) else setOf("*")
  private val bridgeWorld = if (profile == PageProfile.APP) ScriptWorld.PAGE else ScriptWorld.LANGLE

  init {
    web = makeWebView()
  }

  override val url: String?
    get() = web.url ?: lastUrl

  override val canGoBack: Boolean
    get() = web.canGoBack()

  override val canGoForward: Boolean
    get() = web.canGoForward()

  private fun makeWebView(): WebView {
    val web = WebView(context)
    // Before any other use of the WebView.
    if (langle && profile == PageProfile.APP) WebViewCompat.setProfile(web, WebViewEngine.APP_PROFILE)
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
    web.loadUrl(url)
  }

  override fun reload() = web.reload()

  override fun goBack() = web.goBack()

  override fun goForward() = web.goForward()

  override fun setUserScripts(scripts: List<UserScript>) {
    this.scripts = scripts
    handlers.forEach { it.remove() }
    handlers.clear()
    if (!langle) return
    for (script in scripts) {
      val event =
        if (script.runAt == ScriptRunAt.START) WebViewCompat.INJECTION_EVENT_DOCUMENT_START
        else WebViewCompat.INJECTION_EVENT_DOCUMENT_END
      handlers += WebViewCompat.addJavaScriptOnEvent(web, script.source, event, rules, world(web, script.world))
    }
  }

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
    view.removeView(web)
    web.destroy()
    reply = null
    web = makeWebView()
    setUserScripts(scripts)
    lastUrl?.let { web.loadUrl(it) }
  }

  override fun destroy() {
    handlers.clear()
    view.removeView(web)
    web.destroy()
  }

  private inner class Client : WebViewClient() {
    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
      if (profile == PageProfile.APP) origin.intercept(request.url) else null

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
      if (!request.isForMainFrame) return false
      val url = request.url
      if (profile == PageProfile.APP) {
        if (url.scheme == "https" && url.host == APP_HOST) return false
        delegate.onLeaveApp(this@WebViewPage, url.toString())
        return true
      }
      if (url.scheme in WEB_SCHEMES) return false
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
    }

    override fun onPageFinished(view: WebView, url: String) {
      if (view === web) delegate.onLoaded(this@WebViewPage, url)
    }

    override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
      lastUrl = url
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
