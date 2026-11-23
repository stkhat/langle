package dev.langle.core

import kotlinx.serialization.json.JsonObject

/** Time and timers, injected so tests can move the clock. */
interface Clock {
  /** Milliseconds since 1970, as `Date.now()`. */
  fun now(): Double

  /** Runs `run` once after `ms`; the token cancels it. */
  fun schedule(afterMs: Double, run: () -> Unit): Any

  fun cancel(token: Any)
}

data class Alarm(val name: String, val scheduledTime: Double, val periodInMinutes: Double?) {
  val value: JsonObject
    get() =
      JsonObject(
        buildMap {
          put("name", jsonOf(name))
          put("scheduledTime", jsonNumber(scheduledTime))
          periodInMinutes?.let { put("periodInMinutes", jsonNumber(it)) }
        }
      )
}

/** `browser.alarms` on native timers, while the app runs (not kept across restarts). */
class Alarms(private val clock: Clock, private val fire: (Alarm) -> Unit) {
  private class Entry(val alarm: Alarm, val timer: Any)

  private val alarms = mutableMapOf<String, Entry>()

  /** Chrome's `alarms.create(name, { when, delayInMinutes, periodInMinutes })`. */
  fun create(name: String, `when`: Double?, delayInMinutes: Double?, periodInMinutes: Double?) {
    val delay = delayInMinutes ?: periodInMinutes ?: 0.0
    arm(Alarm(name, `when` ?: (clock.now() + delay * MINUTE), periodInMinutes?.takeIf { it > 0 }))
  }

  fun get(name: String): Alarm? = alarms[name]?.alarm

  fun clear(name: String): Boolean {
    val entry = alarms.remove(name) ?: return false
    clock.cancel(entry.timer)
    return true
  }

  private fun arm(alarm: Alarm) {
    alarms[alarm.name]?.let { clock.cancel(it.timer) }
    val timer = clock.schedule(maxOf(0.0, alarm.scheduledTime - clock.now())) { due(alarm.name) }
    alarms[alarm.name] = Entry(alarm, timer)
  }

  private fun due(name: String) {
    val alarm = alarms[name]?.alarm ?: return
    val period = alarm.periodInMinutes
    if (period != null) arm(alarm.copy(scheduledTime = alarm.scheduledTime + period * MINUTE))
    else alarms.remove(name)
    fire(alarm)
  }

  private companion object {
    const val MINUTE = 60_000.0
  }
}
