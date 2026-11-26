package dev.langle.core

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URI
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.concurrent.Executor
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** One list of mobile/protocol/filter-lists.json: its URL, then its fallbacks. */
data class FilterList(val id: String, val urls: List<String>, val trusted: Boolean) {
  companion object {
    /** The lists of filter-lists.json's text (the langle-app build's `adblock/filter-lists.json`). */
    fun read(text: String): List<FilterList> =
      parseJson(text).obj?.get("lists").array.orEmpty().mapNotNull { item ->
        val o = item.obj ?: return@mapNotNull null
        val id = o["id"].string?.takeIf(::isSafeName) ?: return@mapNotNull null
        val url = o["url"].string ?: return@mapNotNull null
        FilterList(id, listOf(url) + o["fallbacks"].array.orEmpty().mapNotNull { it.string }, o["trusted"].bool == true)
      }
  }
}

/** A list fetch's answer: 200 with the text, 304 (not modified), or another status. */
class ListAnswer(val status: Int, val body: ByteArray = ByteArray(0), val etag: String? = null, val lastModified: String? = null)

/** Fetches a list (blocking, on the store's background thread), conditionally when it has validators. */
fun interface ListFetcher {
  /** Throws [IOException] when it cannot connect or read. */
  fun fetch(url: String, etag: String?, lastModified: String?): ListAnswer
}

/** [ListFetcher] over `HttpURLConnection`: `If-None-Match` / `If-Modified-Since`, at most [maxBytes]. */
class UrlListFetcher(private val connectMs: Int = 15_000, private val readMs: Int = 30_000, private val maxBytes: Int = 32_000_000) : ListFetcher {
  override fun fetch(url: String, etag: String?, lastModified: String?): ListAnswer {
    val connection = URI(url).toURL().openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = connectMs
      connection.readTimeout = readMs
      connection.instanceFollowRedirects = true
      connection.useCaches = false
      etag?.let { connection.setRequestProperty("If-None-Match", it) }
      lastModified?.let { connection.setRequestProperty("If-Modified-Since", it) }
      val status = connection.responseCode
      if (status != 200) return ListAnswer(status)
      val out = ByteArrayOutputStream()
      connection.inputStream.use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val n = input.read(buffer)
          if (n < 0) break
          out.write(buffer, 0, n)
          if (out.size() > maxBytes) throw IOException("over $maxBytes bytes")
        }
      }
      return ListAnswer(200, out.toByteArray(), connection.getHeaderField("ETag"), connection.getHeaderField("Last-Modified"))
    } finally {
      connection.disconnect()
    }
  }
}

/**
 * The shell's engine (adblock-rust over JNI on Android) as the store uses it: built from the
 * lists' texts and serialized, loaded from those bytes, released once swapped out.
 */
interface FilterEngines<E> {
  /** Builds an engine from the lists (text, trusted) and serializes it; throws when it cannot. */
  fun build(lists: List<Pair<ByteArray, Boolean>>): ByteArray

  /** Loads a serialized engine; throws when the bytes are bad or of another crate version. */
  fun load(bytes: ByteArray): E

  /** Frees an engine no longer in use (calls already running on it finish first). */
  fun release(engine: E)
}

/**
 * The ad-blocking filter lists in the app's files and the engine built from them
 * (docs/specs/mobile-app.md "M6: ad blocking" › "The list store"; iOS's store keeps the same rules):
 * - each list's text (`<id>.txt`), `ETag`, `Last-Modified`, the URL it came from and the fetch time
 *   (`lists.json`); the serialized engine (`engine.bin`);
 * - [start] loads the kept engine (or builds it again from the kept texts when the bytes are of
 *   another crate version);
 * - [update] fetches every list that is due: never fetched, or past its own `! Expires:` (4 days
 *   when it names none). The request is conditional when the list has validators from the same
 *   URL; a 304 only renews the fetch time. A list whose URLs all fail keeps its text and is tried
 *   again after [retryMs]. After any list changed, the engine is built again and swapped in when
 *   built; a failed build keeps the engine in use;
 * - until a first fetch succeeds there is no engine, so nothing is blocked.
 * Work runs one job at a time on [background]; [main] brings the swaps and reports back to the
 * app's thread, where every call is made. [engine] may be read from any thread.
 */
class FilterListStore<E : Any>(
  private val dir: File,
  private val lists: List<FilterList>,
  private val fetcher: ListFetcher,
  private val engines: FilterEngines<E>,
  private val background: Executor,
  private val main: (() -> Unit) -> Unit,
  private val now: () -> Double = { System.currentTimeMillis().toDouble() },
  private val retryMs: Double = RETRY_MS,
) {
  /** What is kept about a list; `fetchedAt` is null for a list never fetched (only failed). */
  private class Kept(val etag: String?, val lastModified: String?, val source: String?, val fetchedAt: Double?, val expiresMs: Double, val failedAt: Double?) {
    val value: JsonObject
      get() = jsonObject("etag" to etag, "lastModified" to lastModified, "source" to source, "fetchedAt" to fetchedAt, "expiresMs" to expiresMs, "failedAt" to failedAt)

    fun failed(at: Double) = Kept(etag, lastModified, source, fetchedAt, expiresMs, at)

    companion object {
      fun from(value: JsonElement?): Kept? {
        val o = value.obj ?: return null
        return Kept(o["etag"].string, o["lastModified"].string, o["source"].string, o["fetchedAt"].number, o["expiresMs"].number ?: DEFAULT_EXPIRES_MS, o["failedAt"].number)
      }
    }
  }

  /** When a list is due: at once when never tried; after [retryMs] from a failure; else at its expiry. */
  private fun dueAt(kept: Kept?, hasText: Boolean): Double {
    val retry = kept?.failedAt?.let { it + retryMs } ?: Double.NEGATIVE_INFINITY
    val fetched = kept?.fetchedAt
    return if (!hasText || fetched == null) retry else maxOf(fetched + kept.expiresMs, retry)
  }

  private fun hasText(list: FilterList) = File(dir, "${list.id}.txt").isFile

  /** The engine in use, or null (no list fetched yet). */
  @Volatile
  var engine: E? = null
    private set

  /** After an engine was swapped in (main thread). */
  var onEngine: ((E) -> Unit)? = null

  /** A round fetched every due list (each changed or not modified) and the engine took them: the time. */
  var onUpdated: ((updatedAt: Double) -> Unit)? = null

  /** An engine that could not be built or loaded (a bug, not the network). */
  var onError: ((String) -> Unit)? = null

  /** A list none of whose URLs answered with a list (the network, or a list host down). */
  var onFetchFailed: ((String) -> Unit)? = null

  /** Something worth a log line (a list fetched, an engine built). */
  var onLog: ((String) -> Unit)? = null

  private var busy = false
  private var again = false
  private var againForced = false

  /** Loads the kept engine, if any. */
  fun start() {
    busy = true
    background.execute {
      val result = runCatching { loadKept() }
      main {
        result.fold({ it?.let(::swap) }, { onError?.invoke("Ad blocking: could not load the filter lists' engine: ${it.message ?: it}") })
        finish()
      }
    }
  }

  /** Whether a list is due now. */
  fun isDue(): Boolean {
    val kept = readKept()
    val time = now()
    return lists.any { time >= dueAt(kept[it.id], hasText(it)) }
  }

  /**
   * Fetches the lists that are due (every list when [force]: check commands), then builds and swaps
   * the engine when one changed.
   */
  fun update(force: Boolean = false) {
    if (busy) {
      again = true
      againForced = againForced || force
      return
    }
    if (!force && !isDue()) return
    busy = true
    background.execute {
      val messages = mutableListOf<Pair<String, Boolean>>()
      val outcome = runCatching { round(messages, force) }
      main {
        for ((message, fetch) in messages) (if (fetch) onFetchFailed else onError)?.invoke(message)
        outcome.fold(
          { (built, updatedAt) ->
            built?.let(::swap)
            updatedAt?.let { onUpdated?.invoke(it) }
          },
          { onError?.invoke("Ad blocking: could not update the filter lists: ${it.message ?: it}") },
        )
        finish()
      }
    }
  }

  private fun finish() {
    busy = false
    if (again) {
      val force = againForced
      again = false
      againForced = false
      update(force)
    }
  }

  private fun swap(next: E) {
    val old = engine
    engine = next
    onEngine?.invoke(next)
    if (old != null && old !== next) engines.release(old)
  }

  // the background thread

  private fun readKept(): Map<String, Kept> =
    readJson(File(dir, LISTS))?.obj?.get("lists").obj.orEmpty().mapNotNull { (id, value) -> Kept.from(value)?.let { id to it } }.toMap()

  private fun texts(): List<Pair<ByteArray, Boolean>> =
    lists.mapNotNull { list -> File(dir, "${list.id}.txt").takeIf { it.isFile }?.readBytes()?.let { it to list.trusted } }

  private fun loadKept(): E? {
    val file = File(dir, ENGINE)
    if (file.isFile) {
      try {
        return engines.load(file.readBytes())
      } catch (e: Exception) {
        onLog?.let { log -> main { log("the kept engine did not load (${e.message ?: e}); building it again") } }
      }
    }
    val texts = texts()
    return if (texts.isEmpty()) null else buildAndKeep(texts)
  }

  private fun buildAndKeep(texts: List<Pair<ByteArray, Boolean>>): E {
    val bytes = engines.build(texts)
    val engine = engines.load(bytes)
    writeAtomically(File(dir, ENGINE), bytes)
    onLog?.let { log -> main { log("engine built from ${texts.size} lists (${bytes.size} bytes)") } }
    return engine
  }

  /** One round: the engine built when a list changed (or none), and the update time when every due list is current. */
  private fun round(messages: MutableList<Pair<String, Boolean>>, force: Boolean): Pair<E?, Double?> {
    dir.mkdirs()
    val kept = readKept().toMutableMap()
    val time = now()
    var changed = false
    var allCurrent = true
    for (list in lists) {
      val text = File(dir, "${list.id}.txt")
      val old = kept[list.id]
      val hadText = text.isFile
      if (!force && time < dueAt(old, hadText)) continue
      val errors = mutableListOf<String>()
      var done = false
      for (url in list.urls) {
        val conditional = old?.takeIf { hadText && it.source == url && (it.etag != null || it.lastModified != null) }
        try {
          val answer = fetcher.fetch(url, conditional?.etag, conditional?.lastModified)
          if (answer.status == 304 && conditional != null) {
            kept[list.id] = Kept(conditional.etag, conditional.lastModified, url, time, conditional.expiresMs, null)
            onLog?.let { log -> main { log("${list.id}: not modified") } }
            done = true
            break
          }
          if (answer.status != 200) {
            errors += "$url: HTTP ${answer.status}"
            continue
          }
          if (!looksLikeList(answer.body)) {
            errors += "$url: not a filter list"
            continue
          }
          writeAtomically(text, answer.body)
          kept[list.id] = Kept(answer.etag, answer.lastModified, url, time, listExpiryMs(answer.body), null)
          onLog?.let { log -> main { log("${list.id}: ${answer.body.size} bytes from $url") } }
          changed = true
          done = true
          break
        } catch (e: IOException) {
          errors += "$url: ${e.message ?: e}"
        }
      }
      if (!done) {
        allCurrent = false
        kept[list.id] = old?.failed(time) ?: Kept(null, null, null, null, DEFAULT_EXPIRES_MS, time)
        messages += "Ad blocking: could not update the filter list ${list.id} (${errors.joinToString("; ")})" to true
      }
    }
    var built: E? = null
    if (changed || (engine == null && kept.isNotEmpty())) {
      val texts = texts()
      if (texts.isNotEmpty()) {
        try {
          built = buildAndKeep(texts)
        } catch (e: Exception) {
          allCurrent = false
          messages += "Ad blocking: could not build the filter lists' engine: ${e.message ?: e}" to false
        }
      }
    }
    val updatedAt = if (allCurrent && (built != null || engine != null)) time else null
    writeAtomically(
      File(dir, LISTS),
      jsonObject("lists" to JsonObject(kept.mapValues { it.value.value }), "updatedAt" to (updatedAt ?: updatedAt())).toJsonText().toByteArray(),
    )
    return built to updatedAt
  }

  /** The last round's update time, when one was complete (kept in `lists.json`). */
  fun updatedAt(): Double? = readJson(File(dir, LISTS))?.obj?.get("updatedAt").number

  private fun readJson(file: File): JsonElement? = runCatching { if (file.isFile) parseJson(file.readText()) else null }.getOrNull()

  private fun writeAtomically(file: File, bytes: ByteArray) {
    file.parentFile.mkdirs()
    val temp = File.createTempFile(file.name, ".tmp", file.parentFile)
    try {
      temp.writeBytes(bytes)
      Files.move(temp.toPath(), file.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
    } finally {
      temp.delete()
    }
  }

  companion object {
    const val LISTS = "lists.json"
    const val ENGINE = "engine.bin"
    /** A list that names no `! Expires:`. */
    const val DEFAULT_EXPIRES_MS = 4 * 24 * 3600_000.0
    /** A list whose URLs all failed is tried again after this. */
    const val RETRY_MS = 30 * 60_000.0
    private const val HOUR_MS = 3600_000.0
    private val EXPIRES = Regex("""^!\s*Expires:\s*(\d+)\s*(days?|hours?|d|h)\b""", setOf(RegexOption.IGNORE_CASE, RegexOption.MULTILINE))

    /** A list's own `! Expires: 4 days` / `12 hours` in its header, kept within 1 hour and 14 days. */
    fun listExpiryMs(text: ByteArray): Double {
      val head = String(text, 0, minOf(text.size, 4096), Charsets.UTF_8)
      val match = EXPIRES.find(head) ?: return DEFAULT_EXPIRES_MS
      val n = match.groupValues[1].toDouble()
      val ms = if (match.groupValues[2].startsWith("h", ignoreCase = true)) n * HOUR_MS else n * 24 * HOUR_MS
      return ms.coerceIn(HOUR_MS, 14 * 24 * HOUR_MS)
    }

    /** A filter list starts with `[Adblock …]` or a `!` comment; a portal's HTML page does not. */
    fun looksLikeList(text: ByteArray): Boolean {
      val head = String(text, 0, minOf(text.size, 1024), Charsets.UTF_8).trimStart('﻿', ' ', '\t', '\r', '\n')
      return head.startsWith("[") || head.startsWith("!")
    }
  }
}
