package dev.langle.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Test

class ShareWatchTest {
  private val clock = ManualClock()
  private val answers = mutableListOf<Boolean>()
  private val watch = ShareWatch(clock) { answers += it }

  private fun wait(ms: Double) = clock.advance(ms) {}

  @Test
  @DisplayName("a target picked answers true, whatever comes after")
  fun `a target picked answers true`() {
    watch.chosen()
    watch.sheetClosed()
    wait(ShareWatch.GRACE_MS * 2)
    watch.replaced()
    assertEquals(listOf(true), answers)
  }

  @Test
  @DisplayName("a sheet closed without a target answers false after the grace time")
  fun `a sheet closed without a target answers false`() {
    watch.sheetClosed()
    wait(ShareWatch.GRACE_MS - 1)
    assertEquals(listOf<Boolean>(), answers)
    wait(1.0)
    assertEquals(listOf(false), answers)
  }

  @Test
  @DisplayName("a target named just after the sheet closed still answers true")
  fun `a late target answers true`() {
    watch.sheetClosed()
    watch.sheetClosed()
    wait(ShareWatch.GRACE_MS / 2)
    watch.chosen()
    wait(ShareWatch.GRACE_MS)
    assertEquals(listOf(true), answers)
  }

  @Test
  @DisplayName("Save to device answers once its dialog saved or was backed out of")
  fun `Save to device answers with its dialog`() {
    watch.sheetClosed()
    watch.saveStarted()
    wait(ShareWatch.GRACE_MS * 10)
    assertEquals(listOf<Boolean>(), answers)
    watch.saveFinished(true)
    assertEquals(listOf(true), answers)

    val backedOut = mutableListOf<Boolean>()
    ShareWatch(clock) { backedOut += it }.apply {
      saveStarted()
      sheetClosed()
      wait(ShareWatch.GRACE_MS * 2)
      saveFinished(false)
    }
    assertEquals(listOf(false), backedOut)
  }

  @Test
  @DisplayName("a share replaced by the next one answers false")
  fun `a replaced share answers false`() {
    watch.replaced()
    watch.chosen()
    assertEquals(listOf(false), answers)
  }
}
