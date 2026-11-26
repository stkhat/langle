package dev.langle.core

import java.net.URI
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * The ad-blocking switches (docs/specs/mobile-app.md "M6: ad blocking" › "The switches"): the app's
 * `storage.local` key `adBlocking: { on, offSites }`, written by ⋮ and Settings › Ad blocking. On
 * by default; a site is the page's registrable domain.
 */
data class AdBlockingSwitches(val on: Boolean = true, val offSites: List<String> = emptyList()) {
  /** Whether pages of [site] get blocking (a page without a site follows [on]). */
  fun blocks(site: String?): Boolean = on && (site == null || site !in offSites)

  /** ⋮'s switch for [site]: off adds it to [offSites], on removes it. */
  fun withSite(site: String, blocking: Boolean): AdBlockingSwitches =
    copy(offSites = if (blocking) offSites - site else (offSites - site) + site)

  val value: JsonObject
    get() = jsonObject("on" to on, "offSites" to offSites)

  companion object {
    const val KEY = "adBlocking"
    /** Written by the list store: `{ updatedAt }`, milliseconds since 1970 as `Date.now()`. */
    const val LISTS_KEY = "adBlockingLists"

    fun from(value: JsonElement?): AdBlockingSwitches {
      val o = value.obj ?: return AdBlockingSwitches()
      return AdBlockingSwitches(o["on"].bool ?: true, o["offSites"].array.orEmpty().mapNotNull { it.string }.distinct())
    }

    /**
     * Whether a change of the switches reloads a page of [site]: its blocking turned off or on
     * (the page's requests and its document-start scripts follow only a new document).
     */
    fun reloads(old: AdBlockingSwitches, new: AdBlockingSwitches, site: String?): Boolean = old.blocks(site) != new.blocks(site)
  }
}

/**
 * Whether the first run is done (`storage.local` `setup`, src/core/setup.ts): the user agreed and
 * chose the languages at Start. Nothing is fetched before (the lists come with the language packs).
 */
fun setupDone(value: JsonElement?): Boolean {
  val o = value.obj ?: return false
  return o["consent"].number != null && o["languages"].bool == true
}

/**
 * A subresource's type for the engine (adblock-rust's names), which WebView does not give: from
 * `Sec-Fetch-Dest` when the request has it, else its `Accept` header, else the URL's extension,
 * else `other`.
 */
object ResourceTypes {
  private val DEST =
    mapOf(
      "script" to "script", "worker" to "script", "sharedworker" to "script", "serviceworker" to "script",
      "style" to "stylesheet", "image" to "image", "font" to "font", "audio" to "media", "video" to "media",
      "track" to "media", "iframe" to "sub_frame", "frame" to "sub_frame", "embed" to "object", "object" to "object",
      "document" to "sub_frame",
    )

  private val EXTENSIONS =
    buildMap {
      for (e in listOf("js", "mjs", "cjs")) put(e, "script")
      put("css", "stylesheet")
      for (e in listOf("png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp", "apng")) put(e, "image")
      for (e in listOf("woff", "woff2", "ttf", "otf", "eot")) put(e, "font")
      for (e in listOf("mp4", "webm", "m4a", "m4s", "m4v", "mp3", "aac", "ogg", "oga", "opus", "wav", "m3u8", "mpd", "ts", "vtt")) put(e, "media")
      for (e in listOf("html", "htm")) put(e, "sub_frame")
      put("json", "xmlhttprequest")
    }

  /** [headers] as WebView gives them (names in any case). */
  fun guess(url: String, headers: Map<String, String>): String {
    fun header(name: String) = headers.entries.firstOrNull { it.key.equals(name, ignoreCase = true) }?.value?.trim()?.lowercase()
    header("Sec-Fetch-Dest")?.let { dest -> DEST[dest]?.let { return it } }
    val accept = header("Accept").orEmpty()
    when {
      accept.startsWith("text/css") -> return "stylesheet"
      accept.startsWith("image/") -> return "image"
      accept.startsWith("text/html") || accept.startsWith("application/xhtml+xml") -> return "sub_frame"
      accept.startsWith("application/json") || accept.startsWith("text/event-stream") -> return "xmlhttprequest"
    }
    val scheme = url.substringBefore(':').lowercase()
    if (scheme == "ws" || scheme == "wss") return "websocket"
    val path = runCatching { URI(url).rawPath }.getOrNull() ?: url.substringBefore('?').substringBefore('#')
    val extension = path.substringAfterLast('/').substringAfterLast('.', "").lowercase()
    return EXTENSIONS[extension] ?: "other"
  }
}

/**
 * The hosts whose document-start scripts (the page's cosmetics and scriptlets) a page has
 * registered, newest last, at most [capacity]: each is registered before the host's document
 * starts (a main-frame request or a redirect to it) and kept for its later documents. [register]
 * gives null when the host gets nothing (blocking off for its site, no engine yet), and is asked
 * again next time; a change of the engine or of the switches [clear]s them all.
 */
class CosmeticHosts<H : Any>(private val capacity: Int = 8, private val register: (host: String, url: String) -> H?, private val unregister: (H) -> Unit) {
  private val hosts = LinkedHashMap<String, H>(capacity, 0.75f, true)

  val registered: Set<String>
    get() = hosts.keys

  /** Makes sure [host]'s scripts are registered, for [url] (the oldest host goes when over [capacity]). */
  fun prepare(host: String, url: String) {
    if (hosts[host] != null) return
    val handle = register(host, url) ?: return
    hosts[host] = handle
    while (hosts.size > capacity) {
      val oldest = hosts.keys.first()
      hosts.remove(oldest)?.let(unregister)
    }
  }

  fun clear() {
    val all = hosts.values.toList()
    hosts.clear()
    all.forEach(unregister)
  }
}
