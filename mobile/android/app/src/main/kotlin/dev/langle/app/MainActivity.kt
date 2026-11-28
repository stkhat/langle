package dev.langle.app

import android.app.Activity
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import dev.langle.core.AdBlockingSwitches
import dev.langle.core.AppLifecycle
import dev.langle.core.FilePersistence
import dev.langle.core.FilterList
import dev.langle.core.GoogleAuth
import dev.langle.core.Manifest
import dev.langle.core.ModelStore
import dev.langle.core.modelCatalogue
import dev.langle.core.ManifestRefusal
import dev.langle.core.Router
import dev.langle.core.RouterAction
import dev.langle.core.SharedLink
import dev.langle.core.TranslationHost
import dev.langle.core.TranslationService
import dev.langle.core.UrlFetcher
import java.io.File
import java.util.concurrent.Executors

/**
 * The app's activity: the router, the hidden extension host and the screens (ScreenController.kt),
 * the page's fullscreen, and the system back. It does for the router what its actions ask
 * (docs/specs/mobile-app.md "Shim surface").
 *
 * Launch extras (check.sh): `url`, a page to open over Home. Debug builds also take check commands
 * (CheckCommands.kt).
 */
class MainActivity : Activity() {
  private val main = Handler(Looper.getMainLooper())
  lateinit var router: Router
    private set
  lateinit var screens: ScreenController
    private set
  var host: ExtensionHost? = null
    private set
  private lateinit var engine: WebViewEngine
  /** The translation host and its engine (docs/specs/mobile-translation.md "The Android host"). */
  var translation: TranslationHost? = null
    private set
  var translationEngine: WebViewTranslationEngine? = null
    private set
  /** Ad blocking on the browsing page (null without the crate's library or the build's files). */
  var adBlocker: AdBlocker? = null
    private set
  private val downloads = Executors.newSingleThreadExecutor()
  /** Whether the activity is on the screen (between onStart and onStop). */
  private var shown = false
  private val files = AppFiles(this, HandlerClock())
  /** Google sign-in (null without Play services) and Google's sheet's results. */
  private var googleAuth: GoogleAuth? = null
  private var authorizer: PlayGoogleAuthorizer? = null
  private var lifecycle: AppLifecycle? = null
  private var backCallback: Any? = null
  private var recovering = false

  /** The page's fullscreen element, and the orientation to go back to. */
  private class Fullscreen(val view: View, val exit: () -> Unit, val orientation: Int)
  private var fullscreen: Fullscreen? = null
  val isFullscreen: Boolean
    get() = fullscreen != null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val origin = AppOrigin(assets)
    engine = WebViewEngine(this, origin)
    engine.chooseFiles = files::choose
    val strings = AppStrings.of(this)
    var notice: String? = null
    var manifest: Manifest? = null
    if (!engine.supportsLangle) {
      notice = strings["app.updateWebView"]
    } else {
      try {
        val text = origin.file("/manifest.json") ?: throw ManifestRefusal(listOf("no bundled build (scripts/bundle-build.sh)"))
        manifest = Manifest.read(text.toString(Charsets.UTF_8))
      } catch (refusal: ManifestRefusal) {
        notice = strings.format("app.buildRefused", mapOf("reasons" to refusal.unsupported.joinToString(", ")))
        Log.e(TAG, "Langle does not run: ${refusal.unsupported}")
      }
    }
    router =
      Router(
        Router.Options(origin = APP_ORIGIN, version = manifest?.version ?: "0"),
        FilePersistence(File(filesDir, AppStrings.STORE)),
        HandlerClock(),
      )
    router.onError = { Log.e("LangleBridge", it) }
    router.onAction = ::perform
    router.onShareFile = files::share
    // Posted, so a redraw never runs in the middle of the router's dispatch.
    router.onNativeStrings = { set -> runOnUiThread { strings.take(set) } }
    adBlocker = startAdBlocking(origin)

    val hostSlot = FrameLayout(this)
    startGoogleAuth()
    val injector = manifest?.let { ContentInjector(it, googleAuth != null, origin::file) }
    if (injector != null) origin.generated["/host.html"] = injector.hostPage()

    screens = ScreenController(this, engine, router, origin, injector, adBlocker, notice, hostSlot)
    adBlocker?.onSwitches = { old, new ->
      val url = screens.browsing.page.url
      if (url != null && AdBlockingSwitches.reloads(old, new, adBlocker?.siteOf(url))) screens.browsing.page.reload()
    }
    screens.onChanged = ::updateBack
    val browsing = screens.browsing
    // Spike S2: renderers are per profile, so only this page needs to come back.
    browsing.onProcessGone = {
      leaveFullscreen()
      browsing.recreate()
    }
    browsing.onEnterFullscreen = ::enterFullscreen
    browsing.onExitFullscreen = ::leaveFullscreen
    setContentView(screens.root)

    if (injector != null) {
      host = ExtensionHost(engine, router, hostSlot).also {
        it.onProcessGone = ::appProfileGone
        it.start()
      }
      startTranslation(origin)
      if (router.installed == null) expectFirstRun()
    }
    if (BuildConfig.DEBUG) openFromCheck(intent)
    // A share that started the app; not again when the system makes the activity again or
    // relaunches it from the recent apps with the intent it was started with.
    if (savedInstanceState == null && intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY == 0) openShared(intent)
    updateBack()
    if (BuildConfig.DEBUG) CheckCommands.ready()
  }

  // Google sign-in and the lifecycle (docs/specs/mobile-app.md "M7")

  /**
   * The router's Google sign-in over Play services, where the phone has it (without it the app
   * says nothing of `googleAuth` and the background offers no provider), and the lifecycle
   * events for the extension host.
   */
  private fun startGoogleAuth() {
    lifecycle = AppLifecycle(router, { on -> HostKeepAlive.hold(this, on) }).also { it.onLog = { Log.w(TAG, it) } }
    if (!PlayGoogleAuthorizer.available(this)) return
    val authorizer = PlayGoogleAuthorizer(this)
    val auth = GoogleAuth(authorizer, FilePersistence(File(filesDir, "LangleStore")), HandlerClock())
    auth.onLog = { Log.w(TAG, "googleAuth: $it") }
    router.onGoogleAuth = auth::handle
    this.authorizer = authorizer
    googleAuth = auth
  }

  // ad blocking

  /**
   * The list store and its engine (docs/specs/mobile-app.md "M6: ad blocking"): the lists and the
   * scriptlets come with the bundled build, the lists' copies and the engine live in the app's
   * files. The kept engine loads at once; fetching waits for the first run's Start.
   */
  private fun startAdBlocking(origin: AppOrigin): AdBlocker? {
    if (!AdblockNative.loaded) return null
    val lists = origin.file("/adblock/filter-lists.json")?.let { FilterList.read(it.toString(Charsets.UTF_8)) }
    val resources = origin.file("/adblock/resources.json")
    if (lists == null || resources == null) {
      Log.e(TAG, "ad blocking is off: the bundled build has no adblock/ files (scripts/bundle-build.sh)")
      return null
    }
    val blocker = AdBlocker(router, File(filesDir, "adblock"), lists, resources, main)
    blocker.onRulesChanged = engine::blockingChanged
    router.onStorageChanged = blocker::storageChanged
    engine.blocking = blocker
    blocker.start()
    return blocker
  }

  // translation

  /**
   * The model packs in the app's files, the engine's page in a zero-size slot of its own, and the
   * host that keeps the release rules, answering the router's translation calls.
   */
  private fun startTranslation(origin: AppOrigin) {
    val catalogue = modelCatalogue(origin.file("/packs/models.json")?.toString(Charsets.UTF_8))
    if (catalogue.isEmpty()) Log.e(TAG, "the bundled build lists no model packs (packs/models.json)")
    val models =
      ModelStore(File(filesDir, "models"), UrlFetcher(), downloads, { run -> main.post(run) }, catalogue = catalogue)
    models.onLog = { Log.i(TAG, "models: $it") }
    engine.translateFiles = TranslateOrigin(origin, assets, models)::intercept
    val slot = FrameLayout(this)
    screens.root.addView(slot, FrameLayout.LayoutParams(0, 0))
    val pageEngine = WebViewTranslationEngine(engine, slot)
    val host = TranslationHost(pageEngine, HandlerClock(), models::packsFor)
    host.onLog = { Log.i(TAG, "translation: $it") }
    val service = TranslationService(host, models, { shown && screens.isOnScreen(it) }, router::postToHost)
    router.onTranslation = service::handle
    screens.onPageOpened = host::pageOpened
    translation = host
    translationEngine = pageEngine
  }

  override fun onStart() {
    super.onStart()
    shown = true
    adBlocker?.inUse()
    lifecycle?.visible()
  }

  override fun onStop() {
    shown = false
    lifecycle?.hidden()
    super.onStop()
  }

  /** The app left the screen: the engine goes at once (its memory is the largest the app has). */
  override fun onTrimMemory(level: Int) {
    super.onTrimMemory(level)
    if (level >= TRIM_MEMORY_UI_HIDDEN) translation?.uiHidden()
  }

  // fullscreen

  /**
   * The page's element fullscreen (YouTube's fullscreen button): its view over the whole window,
   * in landscape, with the system bars hidden (a swipe from the edge shows them for a moment).
   * The view is the page's own fullscreen element, so Langle's overlay inside it stays on screen.
   */
  private fun enterFullscreen(view: View, exit: () -> Unit) {
    fullscreen?.let { leaveFullscreen() }
    fullscreen = Fullscreen(view, exit, requestedOrientation)
    view.setBackgroundColor(Color.BLACK)
    screens.root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    bars().apply {
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      hide(WindowInsetsCompat.Type.systemBars())
    }
    updateBack()
  }

  /** The page left fullscreen: the page, the system bars and the orientation come back. */
  private fun leaveFullscreen() {
    val current = fullscreen ?: return
    fullscreen = null
    screens.root.removeView(current.view)
    bars().show(WindowInsetsCompat.Type.systemBars())
    requestedOrientation = current.orientation
    updateBack()
  }

  /** The system back gesture in fullscreen: the page leaves it (and says so, or not). */
  private fun exitFullscreen() {
    val current = fullscreen ?: return
    leaveFullscreen()
    current.exit()
  }

  private fun bars() = WindowCompat.getInsetsController(window, window.decorView)

  // back

  private val canGoBack: Boolean
    get() = screens.screenPage?.canGoBack ?: false

  /** Whether the system back is the app's: fullscreen, editing the address, or the shell's. */
  private val handlesBack: Boolean
    get() = fullscreen != null || screens.isEditing || screens.shell.handlesBack(canGoBack)

  /**
   * The system back leaves fullscreen first, then stops editing the address, then goes back in
   * the screen's page, then to Home (docs/specs/mobile-app.md), and leaves the app after.
   */
  private fun updateBack() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
    val wanted = handlesBack
    if (wanted && backCallback == null) {
      val callback = OnBackInvokedCallback { handleBack() }
      onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
      backCallback = callback
    } else if (!wanted && backCallback != null) {
      onBackInvokedDispatcher.unregisterOnBackInvokedCallback(backCallback as OnBackInvokedCallback)
      backCallback = null
    }
  }

  @Deprecated("Android 12 and earlier")
  override fun onBackPressed() {
    if (handlesBack) handleBack() else super.onBackPressed()
  }

  private fun handleBack() {
    when {
      fullscreen != null -> exitFullscreen()
      screens.isEditing -> screens.stopEditing()
      else -> screens.shell.back(canGoBack, screens.screenPage?.historyIndex ?: 0)?.let(screens::apply)
    }
    updateBack()
  }

  @Deprecated("Activity's result, for the share sheet and the document picker (AppFiles) and Google's sheet")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (files.onResult(requestCode, resultCode, data)) return
    if (authorizer?.onResult(requestCode, resultCode, data) == true) return
    @Suppress("DEPRECATION")
    super.onActivityResult(requestCode, resultCode, data)
  }

  /**
   * check.sh's `--es url <address>`: debug builds only, since the activity is exported and any
   * app could otherwise make the browsing page load an address of its choosing.
   */
  private fun openFromCheck(intent: Intent) {
    intent.getStringExtra("url")?.let { screens.apply(screens.shell.openPage(it)) }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (BuildConfig.DEBUG && CheckCommands.run(this, intent)) return
    if (BuildConfig.DEBUG) openFromCheck(intent)
    openShared(intent)
  }

  // Share → Langle (docs/specs/mobile-app.md "M8: Share → Langle")

  /** Another app's Share: its text's address in the one page (or waiting for the first run). */
  private fun openShared(intent: Intent) {
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
    val address = SharedLink.ofIntent(intent.action, intent.type, text) ?: return
    Log.i(TAG, "shared: $address")
    leaveFullscreen()
    if (screens.isEditing) screens.stopEditing()
    screens.apply(screens.shell.shared(address))
    updateBack()
  }

  /**
   * Langle was just installed: `runtime.onInstalled` opens the first run once the host is up, and
   * a share waits for it. Should it not open (the host failed), the share opens anyway.
   */
  private fun expectFirstRun() {
    screens.shell.expectFirstRun()
    main.postDelayed({ screens.apply(screens.shell.firstRunNotComing()) }, FIRST_RUN_WAIT_MS)
  }

  /**
   * The "langle" profile's renderer is gone (spike S2: one per profile): every app-profile page
   * reports it. Once they all have, the host comes back first, then the app pages.
   */
  fun appProfileGone() {
    if (recovering) return
    recovering = true
    main.post {
      recovering = false
      host?.takeIf { it.isGone }?.recreate()
      screens.recreateAppPages()
    }
  }

  // router actions

  private fun perform(action: RouterAction) {
    Log.i(TAG, "router: $action")
    if (action == RouterAction.ReloadHost) host?.reload() else screens.perform(action)
  }

  override fun onDestroy() {
    translation?.uiHidden()
    downloads.shutdown()
    adBlocker?.close()
    screens.close()
    host?.context?.close()
    super.onDestroy()
  }
}

/** How long a share right after installing waits for the first run to open before it opens anyway. */
private const val FIRST_RUN_WAIT_MS = 15_000L
