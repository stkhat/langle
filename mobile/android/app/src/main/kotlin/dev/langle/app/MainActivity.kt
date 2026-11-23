package dev.langle.app

import android.app.Activity
import android.app.Dialog
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import dev.langle.core.ContextSpec
import dev.langle.core.FilePersistence
import dev.langle.core.Manifest
import dev.langle.core.ManifestRefusal
import dev.langle.core.Router
import dev.langle.core.RouterAction
import java.io.File

/**
 * The app's one screen (docs/plans/mobile-app.md "M1"): an address field, back and forward, the
 * Langle button, one browsing page (tab 1), the hidden extension host, and app pages in a sheet.
 * It does for the router what its actions ask (docs/specs/mobile-app.md "Shim surface").
 *
 * Launch extras (check.sh): `url`, the page to open. Debug builds also take check commands
 * (CheckCommands.kt).
 */
class MainActivity : Activity() {
  /** An app page in the sheet: the Langle sheet (`popup.html`, no tab), or a page a tab opened. */
  class Sheet(val tabId: Int?, val context: ContextPage, val dialog: Dialog)

  private val main = Handler(Looper.getMainLooper())
  lateinit var router: Router
    private set
  lateinit var browsing: ContextPage
    private set
  var host: ExtensionHost? = null
    private set
  var sheet: Sheet? = null
    private set
  private var injector: ContentInjector? = null
  private lateinit var engine: WebViewEngine
  private var browsingTab = 0
  private lateinit var address: EditText
  private lateinit var back: Button
  private lateinit var forward: Button
  private var backCallback: Any? = null
  private var recovering = false

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val origin = AppOrigin(assets)
    engine = WebViewEngine(this, origin)
    var notice: String? = null
    var manifest: Manifest? = null
    if (!engine.supportsLangle) {
      notice = getString(R.string.update_webview)
    } else {
      try {
        val text = origin.file("/manifest.json") ?: throw ManifestRefusal(listOf("no bundled build (scripts/bundle-build.sh)"))
        manifest = Manifest.read(text.toString(Charsets.UTF_8))
      } catch (refusal: ManifestRefusal) {
        notice = getString(R.string.build_refused, refusal.unsupported.joinToString(", "))
        Log.e(TAG, "Langle does not run: ${refusal.unsupported}")
      }
    }
    router =
      Router(
        Router.Options(origin = APP_ORIGIN, version = manifest?.version ?: "0"),
        FilePersistence(File(filesDir, "LangleStore")),
        HandlerClock(),
      )
    router.onError = { Log.e("LangleBridge", it) }
    router.onAction = ::perform

    val hostSlot = FrameLayout(this)
    if (manifest != null) {
      val injector = ContentInjector(manifest, origin::file)
      this.injector = injector
      origin.generated["/host.html"] = injector.hostPage()
      host = ExtensionHost(engine, router, hostSlot).also {
        it.onProcessGone = ::appProfileGone
        it.start()
      }
    }

    val start = intent.getStringExtra("url") ?: "about:blank"
    browsingTab = router.openTab(start)
    val tabId = browsingTab
    browsing =
      ContextPage(engine, PageProfile.BROWSING, router, injector?.webPageScripts() ?: emptyList()) { ContextSpec.Content(tabId) }
    browsing.onDocument = { router.tabs.setUrl(tabId, it) }
    browsing.onNavigate = { url ->
      if (url != "about:blank") {
        if (!address.hasFocus()) address.setText(url)
        router.tabs.setUrl(tabId, url)
      }
      updateButtons()
    }
    // Spike S2: renderers are per profile, so only this page needs to come back.
    browsing.onProcessGone = { browsing.recreate() }

    setContentView(layout(notice, hostSlot))
    browsing.load(start)
    if (BuildConfig.DEBUG) CheckCommands.ready()
  }

  private fun layout(notice: String?, hostSlot: FrameLayout): View {
    val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val bar = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
    back = button("‹", R.string.back) { browsing.page.goBack() }
    forward = button("›", R.string.forward) { browsing.page.goForward() }
    address =
      EditText(this).apply {
        hint = getString(R.string.address_hint)
        isSingleLine = true
        inputType = EditorInfo.TYPE_CLASS_TEXT or EditorInfo.TYPE_TEXT_VARIATION_URI
        imeOptions = EditorInfo.IME_ACTION_GO
        setSelectAllOnFocus(true)
        setOnEditorActionListener { _, action, event ->
          val go = action == EditorInfo.IME_ACTION_GO || event?.keyCode == KeyEvent.KEYCODE_ENTER
          if (go) go(text.toString())
          go
        }
      }
    val langle = Button(this).apply {
      text = getString(R.string.langle)
      isEnabled = injector != null
      setOnClickListener { openPopup() }
    }
    bar.addView(back)
    bar.addView(forward)
    bar.addView(address, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    bar.addView(langle)
    root.addView(bar)
    if (notice != null) {
      root.addView(TextView(this).apply {
        text = notice
        setPadding(32, 16, 32, 16)
      })
    }
    root.addView(browsing.page.view, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    // The extension host: attached, at zero size.
    root.addView(hostSlot, LinearLayout.LayoutParams(0, 0))
    ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
    updateButtons()
    return root
  }

  private fun button(label: String, description: Int, click: () -> Unit) =
    Button(this).apply {
      text = label
      contentDescription = getString(description)
      minWidth = 0
      minimumWidth = 0
      setOnClickListener { click() }
    }

  private fun updateButtons() {
    if (!::back.isInitialized) return
    back.isEnabled = browsing.page.canGoBack
    forward.isEnabled = browsing.page.canGoForward
    updateBack()
  }

  /** The system back gesture goes back in the page while it can, and leaves the app after. */
  private fun updateBack() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val wanted = browsing.page.canGoBack
    if (wanted && backCallback == null) {
      val callback = OnBackInvokedCallback { browsing.page.goBack() }
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
      backCallback = callback
    } else if (!wanted && backCallback != null) {
      onBackInvokedDispatcher.unregisterOnBackInvokedCallback(backCallback as OnBackInvokedCallback)
      backCallback = null
    }
  }

  @Deprecated("Android 12 and earlier")
  override fun onBackPressed() {
    if (browsing.page.canGoBack) browsing.page.goBack() else super.onBackPressed()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (BuildConfig.DEBUG && CheckCommands.run(this, intent)) return
    intent.getStringExtra("url")?.let { browsing.load(it) }
  }

  // the shell

  private fun go(text: String) {
    val trimmed = text.trim()
    if (trimmed.isEmpty()) return
    browsing.load(if (trimmed.contains("://") || trimmed.startsWith("about:")) trimmed else "https://$trimmed")
    address.clearFocus()
    getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(address.windowToken, 0)
  }

  /** The Langle button: the popup in the sheet. */
  private fun openPopup() {
    if (injector != null) present("$APP_ORIGIN/popup.html", null)
  }

  /**
   * An app page in a sheet: a plain dialog at the bottom, nine tenths of the screen high (no
   * drag-to-dismiss, which fights the page's own scrolling; back or a tap outside closes it).
   */
  private fun present(url: String, tabId: Int?) {
    val injector = injector ?: return
    sheet?.dialog?.dismiss()
    val context =
      ContextPage(engine, PageProfile.APP, router, injector.appPageScripts()) { ContextSpec.Page(it, tabId) }
    val dialog = Dialog(this, android.R.style.Theme_Material_Light_Dialog_NoActionBar)
    val sheet = Sheet(tabId, context, dialog)
    context.onProcessGone = ::appProfileGone
    context.onLeaveApp = { link ->
      dialog.dismiss()
      browsing.load(link)
    }
    dialog.setContentView(context.page.view)
    dialog.window?.apply {
      setGravity(Gravity.BOTTOM)
      setLayout(ViewGroup.LayoutParams.MATCH_PARENT, (resources.displayMetrics.heightPixels * 0.9).toInt())
    }
    dialog.setOnDismissListener { closed(sheet) }
    this.sheet = sheet
    context.load(url)
    dialog.show()
  }

  /** The sheet went away (back, a tap outside, or the router closed its tab). */
  private fun closed(closed: Sheet) {
    closed.context.close()
    if (sheet === closed) sheet = null
    closed.tabId?.let { if (router.tabs.get(it) != null) router.tabs.remove(it) }
    router.tabs.activate(browsingTab)
  }

  /**
   * The "langle" profile's renderer is gone (spike S2: one per profile): every app-profile page
   * reports it. Once they all have, the host comes back first, then the app pages.
   */
  private fun appProfileGone() {
    if (recovering) return
    recovering = true
    main.post {
      recovering = false
      host?.takeIf { it.isGone }?.recreate()
      sheet?.context?.takeIf { it.isGone }?.recreate()
    }
  }

  // router actions

  private fun perform(action: RouterAction) {
    Log.i(TAG, "router: $action")
    when (action) {
      is RouterAction.OpenTab ->
        if (action.tab.url.startsWith("$APP_ORIGIN/")) {
          present(action.tab.url, action.tab.id)
        } else {
          // One browsing page: a web page opened in a new tab opens there.
          router.tabs.remove(action.tab.id)
          router.tabs.activate(browsingTab)
          browsing.load(action.tab.url)
        }
      is RouterAction.NavigateTab ->
        when (action.tab.id) {
          browsingTab -> browsing.load(action.tab.url)
          sheet?.tabId -> sheet?.context?.load(action.tab.url)
        }
      is RouterAction.ActivateTab -> Unit
      is RouterAction.CloseTab -> sheet?.takeIf { it.tabId == action.tab.id }?.dialog?.dismiss()
      is RouterAction.ReloadTab ->
        when (action.id) {
          browsingTab -> browsing.page.reload()
          sheet?.tabId -> sheet?.context?.page?.reload()
        }
      RouterAction.OpenPopup -> openPopup()
      RouterAction.ReloadHost -> host?.reload()
    }
  }

  override fun onDestroy() {
    sheet?.dialog?.dismiss()
    host?.context?.close()
    browsing.close()
    super.onDestroy()
  }
}
