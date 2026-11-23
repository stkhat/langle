package dev.langle.core

import kotlinx.serialization.json.JsonElement

/** A clock the tests move by hand (`vi.useFakeTimers` on the TS side). */
class ManualClock(var time: Double = 0.0) : Clock {
  private class Timer(val due: Double, val order: Int, val run: () -> Unit)

  private val timers = mutableListOf<Timer>()
  private var count = 0

  override fun now() = time

  override fun schedule(afterMs: Double, run: () -> Unit): Any = Timer(time + afterMs, ++count, run).also { timers += it }

  override fun cancel(token: Any) {
    timers.remove(token)
  }

  /** Moves the time, running each timer that comes due in order and `between` after each. */
  fun advance(ms: Double, between: () -> Unit) {
    val end = time + ms
    while (true) {
      val next = timers.filter { it.due <= end }.minWithOrNull(compareBy({ it.due }, { it.order })) ?: break
      timers.remove(next)
      time = next.due
      next.run()
      between()
    }
    time = end
  }
}

/** A call's answer, once it came. */
class Pending {
  var answer: Answer? = null
  var onSettle: (() -> Unit)? = null

  val settled: Boolean
    get() = answer != null

  /** The value of an ok reply (null: ok with no value, or not ok). */
  val value: JsonElement?
    get() = (answer as? Answer.Value)?.value

  val error: String?
    get() = (answer as? Answer.Failure)?.message
}

/** What a script's event handler does: answer, throw, or never answer. */
sealed interface Handled {
  data class Value(val value: JsonElement?) : Handled

  data class Error(val message: String) : Handled

  data object Never : Handled
}

/** The script side of one context, as `createBridge` is in the TS tests. */
class Script(private val harness: Harness) {
  lateinit var connection: Connection
  private val handlers = mutableMapOf<String, (List<JsonElement>) -> Handled>()
  private val pending = mutableMapOf<String, Pending>()
  private var nextId = 0

  /** Every envelope delivered to this script, as JSON values. */
  val received = mutableListOf<JsonElement>()

  fun on(api: String, handler: (List<JsonElement>) -> Handled) {
    handlers[api] = handler
  }

  /** Records every event of `api` the context gets. */
  fun record(api: String): MutableList<List<JsonElement>> {
    val seen = mutableListOf<List<JsonElement>>()
    on(api) {
      seen += it
      Handled.Value(null)
    }
    return seen
  }

  /** Posts a call, lets every delivery through, and returns its answer (unsettled if waiting). */
  fun call(api: String, vararg args: Any?): Pending = callThen(api, args.toList(), null)

  /** The same, with `then` run when the answer arrives (an `await` going on). */
  fun callThen(api: String, args: List<Any?>, then: (() -> Unit)?): Pending {
    val id = "c${++nextId}"
    val answer = Pending().also { it.onSettle = then }
    pending[id] = answer
    connection.receive(Envelope.Call(id, api, args.map(::jsonOf)).json)
    harness.settle()
    return answer
  }

  /** Posts any text, as a broken script would. */
  fun post(json: String) {
    connection.receive(json)
    harness.settle()
  }

  fun disconnect() = connection.disconnect()

  internal fun receive(json: String) {
    received += parseJson(json)
    val envelope =
      try {
        Envelope.parse(json)
      } catch (_: EnvelopeError) {
        return
      }
    when (envelope) {
      is Envelope.Reply -> {
        val answer = pending.remove(envelope.id) ?: return
        answer.answer = if (envelope.ok) Answer.Value(envelope.value) else Answer.Failure(envelope.error!!)
        answer.onSettle?.invoke()
      }
      is Envelope.Event -> {
        val handler = handlers[envelope.api]
        val replyId = envelope.replyId
        if (replyId == null) {
          handler?.invoke(envelope.args)
          return
        }
        when (val handled = handler?.invoke(envelope.args) ?: Handled.Error(NO_RECEIVER)) {
          is Handled.Value -> connection.receive(Envelope.Reply.ok(replyId, handled.value).json)
          is Handled.Error -> connection.receive(Envelope.Reply.error(replyId, handled.message).json)
          Handled.Never -> Unit
        }
      }
      is Envelope.Call -> Unit
    }
  }
}

/**
 * The router with scripts around it. Deliveries queue up, as microtasks do on the TS side, and
 * [settle] lets them through.
 */
class Harness(
  version: String? = null,
  installedVersion: String? = null,
  local: Map<String, Any?>? = null,
  persistence: MemoryPersistence? = null,
  now: Double = 0.0,
) {
  val clock = ManualClock(now)
  val persistence = persistence ?: MemoryPersistence()
  val router: Router
  val actions = mutableListOf<RouterAction>()
  val errors = mutableListOf<String>()
  private val queue = ArrayDeque<() -> Unit>()

  init {
    installedVersion?.let { this.persistence.save("installed", jsonObject("version" to it)) }
    local?.let { this.persistence.save("local", jsonOf(it)) }
    router =
      Router(Router.Options(version = version ?: "1.0.0"), this.persistence, clock).also {
        it.onAction = { action -> actions += action }
        it.onError = { error -> errors += error }
      }
  }

  fun connect(spec: ContextSpec): Script {
    val script = Script(this)
    script.connection = router.connect(spec) { json -> queue.addLast { script.receive(json) } }
    return script
  }

  fun settle() {
    while (queue.isNotEmpty()) queue.removeFirst()()
  }

  fun advance(ms: Double) {
    settle()
    clock.advance(ms, ::settle)
    settle()
  }
}
