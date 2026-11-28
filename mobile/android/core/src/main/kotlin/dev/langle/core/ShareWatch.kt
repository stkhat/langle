package dev.langle.core

/**
 * One share sheet's answer to `appHost.shareFile` (docs/specs/mobile-app.md "Files"): true once
 * the file went to a target, false when the sheet closed without one, so "Last export" is set
 * only for a file that left. Android tells the steps apart, not always in this order:
 * - [chosen]: the chooser named the target the user picked (`EXTRA_CHOSEN_COMPONENT`).
 * - [saveStarted] / [saveFinished]: the sheet's own "Save to device" opened its save dialog, then
 *   saved there or was backed out of. It is not a target the chooser names on Android 14+.
 * - [sheetClosed]: the chooser is gone. A target picked a moment earlier may still be on its
 *   way (its broadcast, the save dialog's activity), so the answer false waits [GRACE_MS].
 * - [replaced]: another share started; this one is answered false unless it was answered.
 * The first answer wins; later steps change nothing.
 */
class ShareWatch(private val clock: Clock, private val answer: (shared: Boolean) -> Unit) {
  private var answered = false
  private var saving = false
  private var timer: Any? = null

  fun chosen() = settle(true)

  fun saveStarted() {
    saving = true
    timer?.let(clock::cancel)
    timer = null
  }

  fun saveFinished(saved: Boolean) = settle(saved)

  fun sheetClosed() {
    if (answered || saving || timer != null) return
    timer = clock.schedule(GRACE_MS) { if (!saving) settle(false) }
  }

  fun replaced() = settle(false)

  private fun settle(shared: Boolean) {
    if (answered) return
    answered = true
    timer?.let(clock::cancel)
    timer = null
    answer(shared)
  }

  companion object {
    /** How long a closed sheet waits for a target picked just before it closed. */
    const val GRACE_MS = 1500.0
  }
}
