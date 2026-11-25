package dev.langle.core

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BarScrollTest {
  @Test
  fun `slides away after scrolling down far enough in a row, and back after scrolling up`() {
    val bar = BarScroll(threshold = 40)
    assertTrue(bar.scrolled(dy = 30, scrollY = 30, now = 0))
    assertTrue(bar.scrolled(dy = -10, scrollY = 20, now = 10))
    assertTrue(bar.scrolled(dy = 30, scrollY = 50, now = 20))
    assertFalse(bar.scrolled(dy = 15, scrollY = 65, now = 30))
    assertFalse(bar.scrolled(dy = -30, scrollY = 400, now = 1000))
    assertTrue(bar.scrolled(dy = -15, scrollY = 385, now = 1010))
  }

  @Test
  fun `shows at the top of the page`() {
    val bar = BarScroll(threshold = 40)
    assertFalse(bar.scrolled(dy = 100, scrollY = 100, now = 0))
    assertTrue(bar.scrolled(dy = -5, scrollY = 0, now = 10))
  }

  @Test
  fun `leaves out what the page scrolls just after the bar moved`() {
    val bar = BarScroll(threshold = 40, settleMs = 300)
    assertFalse(bar.scrolled(dy = 100, scrollY = 900, now = 0))
    // The page's view grew and the page, at its end, moved up by itself.
    assertFalse(bar.scrolled(dy = -56, scrollY = 844, now = 100))
    assertTrue(bar.scrolled(dy = -56, scrollY = 788, now = 400))
  }

  @Test
  fun `shows again on a reset`() {
    val bar = BarScroll(threshold = 40)
    bar.scrolled(dy = 100, scrollY = 100, now = 0)
    bar.reset()
    assertTrue(bar.shown)
  }
}
