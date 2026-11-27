package dev.langle.core

import java.net.URI
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** Which script context a connection is (docs/specs/mobile-app.md "Contexts"). */
sealed interface ContextSpec {
  /** The extension host, running `background.js`. */
  data object Host : ContextSpec

  /** Langle's content scripts in a tab's frame (0: the top frame). */
  data class Content(val tabId: Int, val frameId: Int = 0) : ContextSpec

  /** An app page (`popup.html`, `options.html` …), in a tab or in no tab (the Langle sheet). */
  data class Page(val url: String, val tabId: Int? = null) : ContextSpec
}

/** What the router asks the app to do with its screens. */
sealed interface RouterAction {
  /** `tabs.create` or `runtime.openOptionsPage` opened a tab. */
  data class OpenTab(val tab: Tab) : RouterAction

  /** `tabs.update` gave a tab a new address. */
  data class NavigateTab(val tab: Tab) : RouterAction

  /** `tabs.update` brought a tab to the front. */
  data class ActivateTab(val tab: Tab) : RouterAction

  data class CloseTab(val tab: Tab) : RouterAction

  data class ReloadTab(val id: Int) : RouterAction

  /** `appHost.openPage`: a web page over Home, in the one browsing page. */
  data class OpenPage(val url: String) : RouterAction

  /** `action.openPopup`: the Langle sheet. */
  data object OpenPopup : RouterAction

  /** `runtime.reload`: the extension host again. */
  data object ReloadHost : RouterAction
}

/** An error a call is answered with. */
class BridgeError(message: String) : Exception(message)

/** A call's answer: a value (null: none), or an error message. */
sealed interface Answer {
  data class Value(val value: JsonElement?) : Answer

  data class Failure(val message: String) : Answer
}

/**
 * One script context's line to the router. The app passes what the scripts post to [receive]; the
 * router answers through the `deliver` it was connected with.
 */
class Connection internal constructor(val spec: ContextSpec, private val router: Router, internal val deliver: (String) -> Unit) {
  internal var ready = false
  internal var connected = true

  /** A JSON envelope from the context's scripts. */
  fun receive(json: String) {
    if (connected) router.receive(this, json)
  }

  /** The context is gone (its page closed or navigated, its renderer lost). */
  fun disconnect() = router.disconnect(this)

  /** The scripts said hello: events can reach them. */
  val isReady: Boolean
    get() = ready
}

/**
 * The router of docs/specs/mobile-app.md "Bridge protocol": the Kotlin copy of
 * `src/app/testing/reference-native.ts`, ported with its tests.
 * - native code fills in the sender of every message; nothing in an envelope says who sent it;
 * - a storage write saves, posts `storage.onChanged` to every context, and only then replies to the
 *   writer; a write that changes nothing posts nothing;
 * - a message for the extension host waits (up to `hostWaitMs`) for the host's hello, then fails
 *   with "Receiving end does not exist", as does a message whose receiver goes away first;
 * - after the host's first hello in a process it gets `runtime.onInstalled` (first run, or a new
 *   build) or `runtime.onStartup`.
 * Not thread-safe: the app calls it on the main thread.
 */
class Router(val options: Options = Options(), private val persistence: Persistence, private val clock: Clock) {
  data class Options(
    val id: String = "langle-app",
    val origin: String = "https://app.langle.invalid",
    /** The bundled build's version. */
    val version: String = "1.0.0",
    val hostWaitMs: Double = 10_000.0,
  )

  private class Forward(val target: Connection, val settle: (Answer) -> Unit)

  private class Waiter(val resolve: (Connection?) -> Unit) {
    var timer: Any? = null
  }

  val store = KeyValueStore(persistence)
  val tabs = Tabs()

  /** What the app does for the router (open a sheet, reload a page …). */
  var onAction: ((RouterAction) -> Unit)? = null

  /** Bad envelopes and other things worth a log line; never a crash. */
  var onError: ((String) -> Unit)? = null

  /**
   * `appHost.shareFile`: the app shows the share sheet with the file, then calls `done` with null
   * once it shows, or with why it could not.
   */
  var onShareFile: ((file: SharedFile, done: (error: String?) -> Unit) -> Unit)? = null

  /**
   * `appHost.nativeStrings`: the background's strings for the shell's bars, menu and notices in
   * the interface language (the app keeps them in its [NativeStrings]). Without it the call is
   * still answered: a shell that draws no strings of its own has nothing to change.
   */
  var onNativeStrings: ((set: NativeStringSet) -> Unit)? = null

  /**
   * The app's translation host and model downloads (docs/specs/mobile-translation.md "M5: the
   * hosts"): the calls in [TRANSLATION_APIS], with the context that asked (the host answers a page
   * not on screen with null at once) and the call's one argument; the app answers through `done`.
   * Null until the app has a host: each such call fails with "<api> is not available here."
   */
  var onTranslation: ((from: ContextSpec, api: String, request: JsonElement?, done: (Answer) -> Unit) -> Unit)? = null

  /** After any write that changed a storage area (the shim's or [setStorage]): what changed. */
  var onStorageChanged: ((area: KeyValueStore.Area, changes: Map<String, KeyValueStore.Change>) -> Unit)? = null

  private val contexts = mutableListOf<Connection>()
  private val forwards = linkedMapOf<String, Forward>()
  private val hostWaiters = mutableListOf<Waiter>()
  private var installedVersion: String? = persistence.load(INSTALLED_KEY).obj?.get("version").string
  private var started = false
  private var nextReply = 0
  private val alarms = Alarms(clock) { fire(it) }

  /** The version that ran last (null before the first run). */
  val installed: String?
    get() = installedVersion

  /** Whether the extension host said hello. */
  val isHostReady: Boolean
    get() = host != null

  /** Connects a script context; its scripts say hello when they have run. */
  fun connect(spec: ContextSpec, deliver: (String) -> Unit): Connection =
    Connection(spec, this, deliver).also { contexts += it }

  /** A page the user opened (a web page in the browsing engine). */
  fun openTab(url: String, active: Boolean = true): Int = tabs.open(url, active).id

  /**
   * An event for the extension host (`appHost.models.onProgress`); dropped while it has not said
   * hello (it asks again when it starts).
   */
  fun postToHost(api: String, args: List<JsonElement>) {
    host?.let { postEvent(it, api, args) }
  }

  // delivery

  private fun deliver(context: Connection, envelope: Envelope) {
    if (context.connected) context.deliver(envelope.json)
  }

  private fun postEvent(context: Connection, api: String, args: List<JsonElement>) =
    deliver(context, Envelope.Event(api, args))

  private val host: Connection?
    get() = contexts.firstOrNull { it.spec == ContextSpec.Host && it.ready }

  private fun sender(context: Connection): JsonObject {
    val o = linkedMapOf<String, JsonElement>("id" to JsonPrimitive(options.id))
    when (val spec = context.spec) {
      ContextSpec.Host -> {
        o["url"] = JsonPrimitive("${options.origin}/")
        o["origin"] = JsonPrimitive(options.origin)
      }
      is ContextSpec.Content -> {
        val tab = tabs.get(spec.tabId)
        senderUrl(o, tab?.url ?: "")
        tab?.let { o["tab"] = it.value }
        o["frameId"] = JsonPrimitive(spec.frameId)
      }
      is ContextSpec.Page -> {
        senderUrl(o, spec.url)
        spec.tabId?.let(tabs::get)?.let { o["tab"] = it.value }
      }
    }
    return JsonObject(o)
  }

  private fun senderUrl(o: MutableMap<String, JsonElement>, url: String) {
    o["url"] = JsonPrimitive(url)
    WebUrl.parse(url)?.origin?.let { o["origin"] = JsonPrimitive(it) }
  }

  /** Sends a message as `runtime.onMessage` and settles with the receiver's answer. */
  private fun forward(target: Connection, message: JsonElement, from: Connection, done: (Answer) -> Unit) {
    val replyId = "n${++nextReply}"
    forwards[replyId] =
      Forward(target) {
        forwards.remove(replyId)
        done(it)
      }
    deliver(target, Envelope.Event("runtime.onMessage", listOf(message, sender(from)), replyId))
  }

  /** Resolves with the host once it said hello, or null after `hostWaitMs`. */
  private fun whenHostReady(done: (Connection?) -> Unit) {
    host?.let { return done(it) }
    val waiter = Waiter(done)
    waiter.timer =
      clock.schedule(options.hostWaitMs) {
        hostWaiters.remove(waiter)
        waiter.resolve(null)
      }
    hostWaiters += waiter
  }

  private fun startHost(context: Connection) {
    context.ready = true
    if (!started) {
      started = true
      val previous = installedVersion
      when {
        previous == null -> postEvent(context, "runtime.onInstalled", listOf(jsonObject("reason" to "install")))
        previous != options.version ->
          postEvent(
            context,
            "runtime.onInstalled",
            listOf(jsonObject("reason" to "update", "previousVersion" to previous)),
          )
        else -> postEvent(context, "runtime.onStartup", emptyList())
      }
      installedVersion = options.version
      try {
        persistence.save(INSTALLED_KEY, jsonObject("version" to options.version))
      } catch (e: Exception) {
        onError?.invoke("Router: could not save the installed version: $e")
      }
    }
    val waiting = hostWaiters.toList()
    hostWaiters.clear()
    for (waiter in waiting) {
      waiter.timer?.let(clock::cancel)
      waiter.resolve(context)
    }
  }

  // storage

  private fun storage(area: KeyValueStore.Area, op: String, args: List<JsonElement>): JsonElement? {
    val changes =
      when (op) {
        "get" -> {
          val keys = args.firstOrNull().array?.mapNotNull { it.string }
          return JsonObject(store.get(area, keys))
        }
        "set" -> store.set(area, args.firstOrNull().obj ?: emptyMap())
        "remove" -> store.remove(area, args.firstOrNull().array?.mapNotNull { it.string } ?: emptyList())
        else -> store.clear(area)
      }
    if (changes.isNotEmpty()) {
      val value = JsonObject(changes.mapValues { it.value.value })
      for (context in contexts.toList()) postEvent(context, "storage.onChanged", listOf(value, JsonPrimitive(area.key)))
      onStorageChanged?.invoke(area, changes)
    }
    return null
  }

  /** Native code's own write (the ad-blocking switches, the list store): heard as the shim's are. */
  fun setStorage(area: KeyValueStore.Area, items: Map<String, JsonElement>) {
    storage(area, "set", listOf(JsonObject(items)))
  }

  // tabs

  private fun tab(id: JsonElement?): Tab {
    val number = id.number
    return number?.let { tabs.get(it.toInt()) } ?: throw BridgeError("No tab with id: ${jsString(id)}.")
  }

  private fun appUrl(url: String?): String {
    val base = "${options.origin}/"
    if (url == null) return base
    return try {
      URI(base).resolve(url).toString()
    } catch (_: Exception) {
      url
    }
  }

  private fun openAppTab(url: String, active: Boolean = true): Tab =
    tabs.open(url, active).also { onAction?.invoke(RouterAction.OpenTab(it)) }

  // alarms

  private fun fire(alarm: Alarm) {
    whenHostReady { host -> host?.let { postEvent(it, "alarms.onAlarm", listOf(alarm.value)) } }
  }

  // calls

  private fun handle(context: Connection, api: String, args: List<JsonElement>, done: (Answer) -> Unit) {
    val first = args.firstOrNull()
    when (api) {
      "bridge.hello" -> {
        if (context.spec == ContextSpec.Host) startHost(context) else context.ready = true
        done(Answer.Value(null))
      }
      "runtime.sendMessage" -> {
        if (context.spec == ContextSpec.Host) throw BridgeError(NO_RECEIVER)
        val message = first ?: JsonNull
        whenHostReady { host ->
          if (host == null) done(Answer.Failure(NO_RECEIVER)) else forward(host, message, context, done)
        }
      }
      "tabs.sendMessage" -> {
        val tabId = first.number?.toInt()
        val frameId = args.getOrNull(2).obj?.get("frameId").number?.toInt() ?: 0
        val target =
          contexts.firstOrNull { candidate ->
            candidate.ready &&
              when (val spec = candidate.spec) {
                ContextSpec.Host -> false
                is ContextSpec.Content -> spec.tabId == tabId && spec.frameId == frameId
                is ContextSpec.Page -> spec.tabId != null && spec.tabId == tabId
              }
          } ?: throw BridgeError(NO_RECEIVER)
        forward(target, args.getOrNull(1) ?: JsonNull, context, done)
      }
      "runtime.openOptionsPage" -> {
        openAppTab("${options.origin}/options.html")
        done(Answer.Value(null))
      }
      "runtime.reload" -> {
        onAction?.invoke(RouterAction.ReloadHost)
        done(Answer.Value(null))
      }
      "appHost.openPage" -> {
        val url = first.string?.takeIf { it.startsWith("https://") || it.startsWith("http://") }
          ?: throw BridgeError("appHost.openPage needs an http(s) address.")
        onAction?.invoke(RouterAction.OpenPage(url))
        done(Answer.Value(null))
      }
      "appHost.shareFile" -> {
        val file = SharedFile.from(first) ?: throw BridgeError(SharedFile.ERROR)
        val share = onShareFile ?: throw BridgeError(NO_SHARING)
        share(file) { error -> done(if (error == null) Answer.Value(null) else Answer.Failure(error)) }
      }
      "appHost.nativeStrings" -> {
        val set = NativeStringSet.from(first) ?: throw BridgeError(NativeStringSet.ERROR)
        onNativeStrings?.invoke(set)
        done(Answer.Value(null))
      }
      in TRANSLATION_APIS -> {
        val host = onTranslation ?: throw BridgeError(notAvailable(api))
        host(context.spec, api, first, done)
      }
      in GOOGLE_AUTH_APIS -> throw BridgeError(notAvailable(api))
      "action.openPopup" -> {
        onAction?.invoke(RouterAction.OpenPopup)
        done(Answer.Value(null))
      }
      "tabs.query" -> {
        val found = tabs.query(first.obj?.get("active").bool, first.obj?.get("url").string)
        done(Answer.Value(JsonArray(found.map { it.value })))
      }
      "tabs.get" -> done(Answer.Value(tab(first).value))
      // As Chrome: an app page's own tab; nothing for the host, content or a page without one.
      "tabs.getCurrent" -> {
        val id = (context.spec as? ContextSpec.Page)?.tabId
        done(Answer.Value(id?.let(tabs::get)?.value))
      }
      "tabs.create" -> {
        val created = openAppTab(appUrl(first.obj?.get("url").string), first.obj?.get("active").bool ?: true)
        done(Answer.Value(created.value))
      }
      "tabs.update" -> {
        val (id, properties) = if (first.number != null) first to args.getOrNull(1) else null to first
        var target = if (id == null) tabs.active ?: throw BridgeError("No active tab.") else tab(id)
        properties.obj?.get("url").string?.let { url ->
          tabs.setUrl(target.id, appUrl(url))
          target = tabs.get(target.id)!!
          onAction?.invoke(RouterAction.NavigateTab(target))
        }
        if (properties.obj?.get("active").bool == true) {
          tabs.activate(target.id)
          target = tabs.get(target.id)!!
          onAction?.invoke(RouterAction.ActivateTab(target))
        }
        done(Answer.Value(target.value))
      }
      "tabs.remove" -> {
        for (id in first.array ?: listOf(first)) {
          val removed = tab(id)
          tabs.remove(removed.id)
          onAction?.invoke(RouterAction.CloseTab(removed))
        }
        done(Answer.Value(null))
      }
      "tabs.reload" -> {
        (first.number?.toInt() ?: tabs.active?.id)?.let { onAction?.invoke(RouterAction.ReloadTab(it)) }
        done(Answer.Value(null))
      }
      "alarms.create" -> {
        val (name, info) = if (first.string != null) first.string!! to args.getOrNull(1) else "" to first
        val o = info.obj
        alarms.create(name, o?.get("when").number, o?.get("delayInMinutes").number, o?.get("periodInMinutes").number)
        done(Answer.Value(null))
      }
      "alarms.get" -> done(Answer.Value(alarms.get(first.string ?: "")?.value))
      "alarms.clear" -> done(Answer.Value(JsonPrimitive(alarms.clear(first.string ?: ""))))
      else -> {
        // storage.<area>.<get | set | remove | clear>
        val parts = api.split(".")
        val area = parts.getOrNull(1)?.let(KeyValueStore.Area::of)
        if (parts.size != 3 || parts[0] != "storage" || area == null) throw BridgeError("unknown call api $api")
        done(Answer.Value(storage(area, parts[2], args)))
      }
    }
  }

  internal fun receive(context: Connection, json: String) {
    val envelope =
      try {
        Envelope.parse(json)
      } catch (e: EnvelopeError) {
        onError?.invoke("Router: ${e.message} ${json.take(300)}")
        Envelope.callIdOf(json)?.let { deliver(context, Envelope.Reply.error(it, e.message ?: "bad envelope")) }
        return
      }
    when (envelope) {
      is Envelope.Reply -> {
        val pending = forwards[envelope.id]?.takeIf { it.target === context } ?: return
        pending.settle(if (envelope.ok) Answer.Value(envelope.value) else Answer.Failure(envelope.error ?: ""))
      }
      is Envelope.Event -> onError?.invoke("Router: an event from a script (${envelope.api})")
      is Envelope.Call -> {
        val reply = { answer: Answer ->
          deliver(
            context,
            when (answer) {
              is Answer.Value -> Envelope.Reply.ok(envelope.id, answer.value)
              is Answer.Failure -> Envelope.Reply.error(envelope.id, answer.message)
            },
          )
        }
        try {
          handle(context, envelope.api, envelope.args, reply)
        } catch (e: BridgeError) {
          reply(Answer.Failure(e.message ?: ""))
        } catch (e: Exception) {
          onError?.invoke("Router: ${envelope.api} failed: $e")
          reply(Answer.Failure(e.message ?: e.toString()))
        }
      }
    }
  }

  internal fun disconnect(context: Connection) {
    context.connected = false
    context.ready = false
    contexts.remove(context)
    for (pending in forwards.values.toList()) {
      if (pending.target === context) pending.settle(Answer.Failure(NO_RECEIVER))
    }
  }

  private companion object {
    const val INSTALLED_KEY = "installed"
  }
}
