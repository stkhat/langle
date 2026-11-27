package dev.langle.core

/**
 * The app's lifecycle for the background (docs/specs/mobile-app.md "M7" › "The app's
 * lifecycle"): alarms run only while the app does, so the extension host hears when the app
 * leaves the screen (`app.hidden`, which it answers once its pending cloud writes are done) and
 * comes back (`app.visible`, a cloud check).
 * - [hidden]: `app.hidden`, holding the host (`hold(true)`) until it answers or [holdMs] pass,
 *   then `hold(false)`. Nothing is sent, or held, while the host has not said hello.
 * - [visible]: `app.visible`, only after a [hidden] (not at the app's start).
 * Main thread only, like the router.
 */
class AppLifecycle(
  private val router: Router,
  private val hold: (Boolean) -> Unit,
  private val holdMs: Double = HOLD_MS,
) {
  var onLog: ((String) -> Unit)? = null

  private var isHidden = false

  /** The latest `app.hidden`: an earlier one's answer does not end a later one's hold. */
  private var turn = 0
  private var holding = false

  fun hidden() {
    if (isHidden) return
    isHidden = true
    if (!router.isHostReady) return
    val current = ++turn
    if (!holding) {
      holding = true
      hold(true)
    }
    router.askHost("app.hidden", emptyList(), holdMs) { answer ->
      if (answer is Answer.Failure) onLog?.invoke("app.hidden: ${answer.message}")
      if (current == turn && holding) {
        holding = false
        hold(false)
      }
    }
  }

  fun visible() {
    if (!isHidden) return
    isHidden = false
    router.postToHost("app.visible", emptyList())
  }

  companion object {
    /** How long the host is kept running for `app.hidden`'s answer (the spec's 20 s). */
    const val HOLD_MS = 20_000.0
  }
}
