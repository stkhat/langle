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
import dev.langle.core.FilePersistence
import dev.langle.core.Manifest
import dev.langle.core.ManifestRefusal
import dev.langle.core.Router
import dev.langle.core.RouterAction
import java.io.File

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
    val injector = manifest?.let { ContentInjector(it, origin::file) }
    if (injector != null) origin.generated["/host.html"] = injector.hostPage()

    screens = ScreenController(this, engine, router, origin, injector, notice, hostSlot)
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
    }
    intent.getStringExtra("url")?.let { screens.apply(screens.shell.openPage(it)) }
    updateBack()
    if (BuildConfig.DEBUG) CheckCommands.ready()
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
      else -> screens.shell.back(canGoBack)?.let(screens::apply)
    }
    updateBack()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    if (BuildConfig.DEBUG && CheckCommands.run(this, intent)) return
    intent.getStringExtra("url")?.let { screens.apply(screens.shell.openPage(it)) }
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
    screens.close()
    host?.context?.close()
    super.onDestroy()
  }
}
