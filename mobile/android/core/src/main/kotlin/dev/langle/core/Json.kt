package dev.langle.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull

/** JSON values are kotlinx.serialization's tree; these read and build them as the TS side does. */
internal val json = Json { prettyPrint = false }

fun parseJson(text: String): JsonElement = json.parseToJsonElement(text)

fun JsonElement.toJsonText(): String = json.encodeToString(JsonElement.serializer(), this)

val JsonElement?.string: String?
  get() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

val JsonElement?.number: Double?
  get() = (this as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull

val JsonElement?.bool: Boolean?
  get() = (this as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull

val JsonElement?.obj: JsonObject?
  get() = this as? JsonObject

val JsonElement?.array: JsonArray?
  get() = this as? JsonArray

/** A number as `JSON.stringify` writes it: whole numbers without a fraction. */
fun jsonNumber(value: Double): JsonPrimitive =
  if (value == Math.rint(value) && !value.isInfinite() && Math.abs(value) < 9.007199254740992E15) {
    JsonPrimitive(value.toLong())
  } else {
    JsonPrimitive(value)
  }

/** Builds a JSON value from Kotlin values: strings, numbers, booleans, null, maps, lists. */
fun jsonOf(value: Any?): JsonElement =
  when (value) {
    null -> JsonNull
    is JsonElement -> value
    is String -> JsonPrimitive(value)
    is Boolean -> JsonPrimitive(value)
    is Int -> JsonPrimitive(value)
    is Long -> JsonPrimitive(value)
    is Number -> jsonNumber(value.toDouble())
    is Map<*, *> -> JsonObject(value.entries.associate { (k, v) -> k.toString() to jsonOf(v) })
    is List<*> -> JsonArray(value.map(::jsonOf))
    else -> throw IllegalArgumentException("not a JSON value: $value")
  }

/** `{ "a": 1, … }` */
fun jsonObject(vararg pairs: Pair<String, Any?>): JsonObject =
  JsonObject(linkedMapOf(*pairs).mapValues { jsonOf(it.value) })

/** What JavaScript's `String(value)` gives, for error messages that match the TS side's. */
fun jsString(value: JsonElement?): String =
  when (value) {
    null -> "undefined"
    is JsonNull -> "null"
    is JsonPrimitive -> value.content
    is JsonObject -> "[object Object]"
    is JsonArray -> value.joinToString(",") { if (it is JsonNull) "" else jsString(it) }
  }
