package dev.langle.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** The bridge protocol's version (`src/app/bridge/protocol.ts`). */
const val PROTOCOL_VERSION = 1

/** Chrome's text when a message has nobody to answer it (`messaging/client.ts` retries on it). */
const val NO_RECEIVER = "Could not establish connection. Receiving end does not exist."

/** What a script can ask native code to do (the same list as protocol.ts). */
val CALL_APIS: Set<String> =
  linkedSetOf(
    "bridge.hello",
    "runtime.sendMessage",
    "runtime.openOptionsPage",
    "runtime.reload",
    "storage.local.get",
    "storage.local.set",
    "storage.local.remove",
    "storage.local.clear",
    "storage.sync.get",
    "storage.sync.set",
    "storage.sync.remove",
    "storage.sync.clear",
    "storage.session.get",
    "storage.session.set",
    "storage.session.remove",
    "storage.session.clear",
    "tabs.query",
    "tabs.get",
    "tabs.getCurrent",
    "tabs.sendMessage",
    "tabs.create",
    "tabs.update",
    "tabs.remove",
    "tabs.reload",
    "action.openPopup",
    "alarms.create",
    "alarms.get",
    "alarms.clear",
    "appHost.openPage",
    "appHost.shareFile",
    "appHost.translate",
    "appHost.translatorStatus",
    "appHost.prepareTranslator",
    "appHost.models.ensure",
    "appHost.models.remove",
  )

/** The calls the app's translation host and model downloads answer (`Router.onTranslation`). */
val TRANSLATION_APIS: Set<String> =
  linkedSetOf(
    "appHost.translate",
    "appHost.translatorStatus",
    "appHost.prepareTranslator",
    "appHost.models.ensure",
    "appHost.models.remove",
  )

/** The error of a call the app cannot answer yet, the same text in all three routers. */
fun notAvailable(api: String) = "$api is not available here."

/** What native code tells a script. */
val EVENT_APIS: Set<String> =
  linkedSetOf(
    "runtime.onMessage",
    "runtime.onInstalled",
    "runtime.onStartup",
    "storage.onChanged",
    "alarms.onAlarm",
    "appHost.models.onProgress",
  )

/** Why a text is not an envelope (the TS side's words). */
class EnvelopeError(message: String) : Exception(message)

/**
 * One JSON envelope of docs/specs/mobile-app.md "Bridge protocol"; the golden files in
 * `mobile/protocol/` are shared with the TS tests and XCTest.
 */
sealed interface Envelope {
  data class Call(val id: String, val api: String, val args: List<JsonElement>) : Envelope

  /** `value` null: an ok reply with no value (`undefined` on the TS side, left out). */
  data class Reply(val id: String, val ok: Boolean, val value: JsonElement? = null, val error: String? = null) :
    Envelope {
    companion object {
      fun ok(id: String, value: JsonElement?) = Reply(id, true, value)

      fun error(id: String, message: String) = Reply(id, false, error = message)
    }
  }

  /** `replyId`: the event expects an answer, sent as a reply with that id. */
  data class Event(val api: String, val args: List<JsonElement>, val replyId: String? = null) : Envelope

  val asJson: JsonObject
    get() {
      val o = linkedMapOf<String, JsonElement>("v" to JsonPrimitive(PROTOCOL_VERSION))
      when (this) {
        is Call -> {
          o["kind"] = JsonPrimitive("call")
          o["id"] = JsonPrimitive(id)
          o["api"] = JsonPrimitive(api)
          o["args"] = JsonArray(args)
        }
        is Reply -> {
          o["kind"] = JsonPrimitive("reply")
          o["id"] = JsonPrimitive(id)
          o["ok"] = JsonPrimitive(ok)
          if (ok) value?.let { o["value"] = it } else o["error"] = jsonObject("message" to error)
        }
        is Event -> {
          o["kind"] = JsonPrimitive("event")
          o["api"] = JsonPrimitive(api)
          o["args"] = JsonArray(args)
          replyId?.let { o["replyId"] = JsonPrimitive(it) }
        }
      }
      return JsonObject(o)
    }

  val json: String
    get() = asJson.toJsonText()

  companion object {
    /** Reads an envelope, or throws [EnvelopeError] saying why it is not one. */
    fun parse(text: String): Envelope {
      val parsed =
        try {
          parseJson(text)
        } catch (_: Exception) {
          throw EnvelopeError("not JSON")
        }
      val o = parsed as? JsonObject ?: throw EnvelopeError("not an object")
      val v = o["v"]
      if (v.number != PROTOCOL_VERSION.toDouble()) throw EnvelopeError("unsupported version ${jsString(v)}")
      return when (val kind = o["kind"]) {
        JsonPrimitive("call") -> {
          val id = o["id"].string ?: throw EnvelopeError("call without an id")
          val api = o["api"].string?.takeIf { it in CALL_APIS }
            ?: throw EnvelopeError("unknown call api ${jsString(o["api"])}")
          val args = o["args"].array ?: throw EnvelopeError("args is not an array")
          Call(id, api, args)
        }
        JsonPrimitive("reply") -> {
          val id = o["id"].string ?: throw EnvelopeError("reply without an id")
          val ok = o["ok"].bool
          val message = o["error"].obj?.get("message").string
          when {
            ok == true -> Reply.ok(id, o["value"])
            ok == false && message != null -> Reply.error(id, message)
            else -> throw EnvelopeError("reply without ok or an error message")
          }
        }
        JsonPrimitive("event") -> {
          val api = o["api"].string?.takeIf { it in EVENT_APIS }
            ?: throw EnvelopeError("unknown event api ${jsString(o["api"])}")
          val args = o["args"].array ?: throw EnvelopeError("args is not an array")
          val replyId = o["replyId"]
          if (replyId != null && replyId.string == null) throw EnvelopeError("replyId is not a string")
          Event(api, args, replyId.string)
        }
        else -> throw EnvelopeError("unknown kind ${jsString(kind)}")
      }
    }

    /** The id of a call that could not be read, so it can be answered with the error. */
    fun callIdOf(text: String): String? =
      try {
        val o = parseJson(text) as? JsonObject
        if (o?.get("kind").string == "call") o?.get("id").string else null
      } catch (_: Exception) {
        null
      }
  }
}
