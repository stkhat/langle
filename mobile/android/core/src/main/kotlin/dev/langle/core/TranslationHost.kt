package dev.langle.core

/**
 * The on-device translator the host drives (Android: Bergamot in a hidden WebView's Worker). It
 * answers each call once, on the main thread; answers after [stop] are ignored by the host.
 */
interface TranslationEngine {
  /**
   * Starts the engine if it is not running and loads [packs], the model packs that translate
   * [from] into [to] (one, or two through English); `done(true)` once it can translate the pair.
   */
  fun load(from: String, to: String, packs: List<String>, done: (ok: Boolean) -> Unit)

  /** [text] translated from [from] into [to] (a pair loaded before), or null. */
  fun translate(from: String, to: String, text: String, done: (String?) -> Unit)

  /** Ends the engine and gives its memory back; nothing it was doing is answered. */
  fun stop()

  /** Set by the host: the engine broke while running (a crash, its renderer gone). */
  var onFailure: (() -> Unit)?
}

/**
 * The app's translation host (docs/specs/mobile-translation.md "Starting and releasing the
 * engine", "Failures"): one engine for the app, one sentence at a time, in the order the pages
 * ask (their queues decide which comes next).
 * - a request from a page not on screen, or while on-device translation is off, gets null at once;
 * - a request that may not start the engine (`start` false: the lists) is translated only while
 *   the engine runs with its pair loaded, and does not count as a use;
 * - the engine is released [Options.releaseMs] after the last use, and at once when the app
 *   leaves the screen ([uiHidden]); requests waiting then get null;
 * - an engine that fails (an error, a crash, loading that gives up after [Options.loadLimitMs])
 *   answers its waiting requests with null; the next request starts it once more, and if that one
 *   fails too before it translated anything, on-device translation stays off until a page is
 *   opened again ([pageOpened]);
 * - a sentence with no answer after [Options.sentenceLimitMs] gets null.
 * Not thread-safe: the app calls it on the main thread.
 */
class TranslationHost(
  private val engine: TranslationEngine,
  private val clock: Clock,
  /** The ready model packs that translate `from` into `to`, or null when there are none. */
  private val packsFor: (from: String, to: String) -> List<String>?,
  val options: Options = Options(),
) {
  data class Options(
    val releaseMs: Double = 60_000.0,
    val loadLimitMs: Double = 30_000.0,
    val sentenceLimitMs: Double = 10_000.0,
  )

  private class Job(
    val from: String,
    val to: String,
    val text: String,
    val start: Boolean,
    val packs: List<String>,
    private val done: (String?) -> Unit,
  ) {
    val key = "$from>$to"
    private var answered = false

    fun answer(text: String?) {
      if (answered) return
      answered = true
      done(text)
    }
  }

  private val queue = ArrayDeque<Job>()
  private var current: Job? = null
  private var currentTimer: Any? = null
  private var releaseTimer: Any? = null
  private val loaded = mutableSetOf<String>()
  /** Each engine run's number: answers from an earlier run are dropped. */
  private var run = 0
  /** Failures since the engine last translated something. */
  private var failures = 0

  /** Whether the engine runs (loading or translating, or waiting to be released). */
  var isRunning = false
    private set

  /** On-device translation is off until a page is opened again (the restarted engine failed too). */
  var isOff = false
    private set

  /** The pairs the running engine has loaded ("en>ja"). */
  val loadedPairs: Set<String>
    get() = loaded.toSet()

  /** Something worth a log line (a release, a failure, a limit reached). */
  var onLog: ((String) -> Unit)? = null

  init {
    engine.onFailure = { fail("the engine failed") }
  }

  /** `appHost.translate`: [done] gets the translation or null. */
  fun translate(from: String, to: String, text: String, start: Boolean, onScreen: Boolean, done: (String?) -> Unit) {
    if (!onScreen || isOff || text.isBlank()) return done(null)
    val packs = packsFor(from, to) ?: return done(null)
    if (!start && !(isRunning && "$from>$to" in loaded)) return done(null)
    if (start) scheduleRelease()
    queue.addLast(Job(from, to, text, start, packs, done))
    next()
  }

  /** The app left the screen (`TRIM_MEMORY_UI_HIDDEN`): the engine goes at once. */
  fun uiHidden() = release("the app left the screen")

  /** A page or video was opened: on-device translation is on again after it was turned off. */
  fun pageOpened() {
    if (isOff) onLog?.invoke("on-device translation on again: a page was opened")
    isOff = false
    failures = 0
  }

  /** A model pack is going away: the engine lets go of its files. */
  fun packRemoved(pack: String) = release("$pack was removed")

  private fun next() {
    if (current != null) return
    val job = queue.removeFirstOrNull() ?: return
    current = job
    if (isRunning && job.key in loaded) return send(job)
    // A list request whose pair the engine let go of while it waited.
    if (!job.start) return finish(job, null)
    isRunning = true
    val thisRun = run
    currentTimer = clock.schedule(options.loadLimitMs) { if (run == thisRun) fail("loading gave up after ${options.loadLimitMs.toLong()} ms") }
    engine.load(job.from, job.to, job.packs) { ok ->
      if (run != thisRun || current !== job) return@load
      cancelCurrentTimer()
      if (ok) {
        loaded += job.key
        send(job)
      } else {
        fail("the engine could not load ${job.packs.joinToString(" + ")}")
      }
    }
  }

  private fun send(job: Job) {
    val thisRun = run
    currentTimer =
      clock.schedule(options.sentenceLimitMs) {
        if (run == thisRun && current === job) {
          onLog?.invoke("no translation after ${options.sentenceLimitMs.toLong()} ms")
          finish(job, null)
        }
      }
    engine.translate(job.from, job.to, job.text) { text ->
      if (run != thisRun || current !== job) return@translate
      if (text != null) failures = 0
      finish(job, text)
    }
  }

  private fun finish(job: Job, text: String?) {
    cancelCurrentTimer()
    current = null
    if (job.start) scheduleRelease()
    job.answer(text)
    next()
  }

  private fun cancelCurrentTimer() {
    currentTimer?.let(clock::cancel)
    currentTimer = null
  }

  private fun scheduleRelease() {
    releaseTimer?.let(clock::cancel)
    releaseTimer =
      clock.schedule(options.releaseMs) {
        releaseTimer = null
        release("${options.releaseMs.toLong()} ms after the last translation")
      }
  }

  /** Ends the engine; every request waiting gets null. */
  private fun stopEngine() {
    run++
    cancelCurrentTimer()
    releaseTimer?.let(clock::cancel)
    releaseTimer = null
    val waiting = listOfNotNull(current) + queue
    current = null
    queue.clear()
    loaded.clear()
    if (isRunning) {
      isRunning = false
      engine.stop()
    }
    for (job in waiting) job.answer(null)
  }

  private fun release(why: String) {
    if (!isRunning && current == null && queue.isEmpty()) return
    onLog?.invoke("engine released: $why")
    stopEngine()
  }

  private fun fail(why: String) {
    if (!isRunning) return
    failures++
    if (failures >= 2) isOff = true
    onLog?.invoke("engine failed ($why)${if (isOff) "; on-device translation is off until a page is opened" else ""}")
    stopEngine()
  }
}
