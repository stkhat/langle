package dev.langle.core

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * `appHost.nativeStrings`'s argument (docs/specs/mobile-app.md "Native strings follow the
 * interface language"): the interface language's `app.` strings, as the background sends them.
 */
data class NativeStringSet(val locale: String, val rtl: Boolean, val strings: Map<String, String>) {
  val json: JsonElement
    get() =
      JsonObject(
        linkedMapOf(
          "locale" to JsonPrimitive(locale),
          "dir" to JsonPrimitive(if (rtl) "rtl" else "ltr"),
          "strings" to JsonObject(strings.mapValues { JsonPrimitive(it.value) }),
        ),
      )

  companion object {
    /** The error a bad set gets, the same text in all three routers (reference-native.ts). */
    const val ERROR = "appHost.nativeStrings needs a locale, a direction and strings."

    /** The call's argument as a set, or null when it is not one. */
    fun from(value: JsonElement?): NativeStringSet? {
      val obj = value.obj ?: return null
      val locale = obj["locale"].string?.takeIf { it.isNotEmpty() } ?: return null
      val rtl =
        when (obj["dir"].string) {
          "ltr" -> false
          "rtl" -> true
          else -> return null
        }
      val strings = obj["strings"].obj ?: return null
      return NativeStringSet(locale, rtl, strings.mapValues { (_, text) -> text.string ?: return null })
    }
  }
}

/**
 * The shell's own strings in the interface language: the last set the background sent, kept in
 * [persistence] so a cold start draws it before the background runs; before the first one ever,
 * [english] (en.json's `app.` keys, built in). A key the set lacks is English's; a key neither
 * has shows as itself. Listeners hear each new set, on the thread that [take]s it.
 */
class NativeStrings(private val english: Map<String, String>, private val persistence: Persistence) {
  private var kept: NativeStringSet? = NativeStringSet.from(persistence.load(NAME))
  private val listeners = LinkedHashSet<() -> Unit>()

  /** The interface language ("en" before any set). */
  val locale: String
    get() = kept?.locale ?: "en"

  /** Whether the bars mirror (Arabic). */
  val rtl: Boolean
    get() = kept?.rtl ?: false

  operator fun get(key: String): String = kept?.strings?.get(key) ?: english[key] ?: key

  /** The string [key] with its `{name}` placeholders filled from [vars]; others stay. */
  fun format(key: String, vars: Map<String, String>): String =
    PLACEHOLDER.replace(get(key)) { match -> vars[match.groupValues[1]] ?: match.value }

  /** Keeps [set] and tells the listeners, unless it is the one kept already. */
  fun take(set: NativeStringSet) {
    if (set == kept) return
    kept = set
    persistence.save(NAME, set.json)
    for (listener in listeners.toList()) listener()
  }

  /** Calls [listener] after each new set; returns an unlisten. */
  fun listen(listener: () -> Unit): () -> Unit {
    listeners.add(listener)
    return { listeners.remove(listener) }
  }

  companion object {
    /** Its file in the app's store: `native-strings.json`. */
    const val NAME = "native-strings"

    /** The resource the build generates from en.json (core/build.gradle.kts). */
    const val ENGLISH_RESOURCE = "/native-strings-en.json"

    private val PLACEHOLDER = Regex("\\{(\\w+)\\}")

    /** The built-in English: the generated resource's `app.` keys. */
    val ENGLISH: Map<String, String> by lazy {
      val text =
        NativeStrings::class.java.getResourceAsStream(ENGLISH_RESOURCE)?.use { it.readBytes().toString(Charsets.UTF_8) }
          ?: error("no $ENGLISH_RESOURCE in the build")
      englishOf(text)
    }

    /** A locale file's `app.` keys that are strings. */
    fun englishOf(localeJson: String): Map<String, String> =
      parseJson(localeJson).obj.orEmpty().filterKeys { it.startsWith("app.") }.mapNotNull { (key, value) -> value.string?.let { key to it } }.toMap()
  }
}
