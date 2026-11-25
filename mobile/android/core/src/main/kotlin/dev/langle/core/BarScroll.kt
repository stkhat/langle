package dev.langle.core

/**
 * Whether the title bar shows as the page scrolls: it slides away once the page has scrolled
 * down [threshold] in a row and comes back once it has scrolled up as far, or at the top.
 * Scrolls in the [settleMs] after the bar moved are left out: the page's view changes size with
 * the bar, which can move the page by itself (at its end), and would move the bar back.
 */
class BarScroll(private val threshold: Int, private val settleMs: Long = 300) {
  var shown = true
    private set

  /** Distance scrolled in the current direction: down is positive. */
  private var run = 0
  private var movedAt: Long? = null

  /** The page scrolled by [dy] to [scrollY] at [now] (ms); whether the bar shows now. */
  fun scrolled(dy: Int, scrollY: Int, now: Long): Boolean {
    if (scrollY <= 0) return set(true, now)
    if (dy == 0 || movedAt.let { it != null && now - it < settleMs }) return shown
    if ((dy > 0) != (run > 0)) run = 0
    run += dy
    if (run >= threshold) set(false, now) else if (run <= -threshold) set(true, now)
    return shown
  }

  /** The bar shows again whatever the scroll (a new page). */
  fun reset() {
    shown = true
    run = 0
  }

  private fun set(value: Boolean, now: Long): Boolean {
    if (value != shown) movedAt = now
    shown = value
    run = 0
    return shown
  }
}
