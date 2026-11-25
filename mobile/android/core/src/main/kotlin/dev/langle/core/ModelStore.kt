package dev.langle.core

import java.io.Closeable
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.util.concurrent.Executor
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * One `appHost.models.ensure` request (docs/specs/mobile-translation.md "Model packs (Android)"):
 * the pack's lock version, its files, and the lock's mirrors with only `{file}` left.
 */
data class ModelRequest(val pack: String, val version: String, val files: List<File>, val mirrors: List<String>) {
  data class File(val path: String, val sha256: String, val size: Long)

  val total: Long
    get() = files.sumOf { it.size }

  companion object {
    const val ERROR = "appHost.models.ensure needs a pack, a version, files and mirrors."

    /** The request from the call's argument, or null when it is not one (or names unsafe paths). */
    fun from(value: JsonElement?): ModelRequest? {
      val o = value.obj ?: return null
      val pack = o["pack"].string?.takeIf(::isSafeName) ?: return null
      val version = o["version"].string?.takeIf(::isSafeName) ?: return null
      val files =
        o["files"].array?.map { file ->
          val f = file.obj ?: return null
          File(
            f["path"].string?.takeIf(::isSafeName) ?: return null,
            f["sha256"].string?.lowercase()?.takeIf { it.matches(SHA256) } ?: return null,
            f["size"].number?.toLong()?.takeIf { it >= 0 } ?: return null,
          )
        } ?: return null
      val mirrors = o["mirrors"].array?.map { it.string?.takeIf { m -> "{file}" in m } ?: return null } ?: return null
      if (files.isEmpty()) return null
      return ModelRequest(pack, version, files, mirrors)
    }

    private val SHA256 = Regex("[0-9a-f]{64}")
  }
}

/** A plain file or folder name: no separators, not `.` or `..`. */
fun isSafeName(name: String): Boolean = name.matches(SAFE_NAME) && name != "." && name != ".."

private val SAFE_NAME = Regex("[A-Za-z0-9._-]{1,128}")

/** An HTTP answer: its status and its body, closed by the reader. */
class Fetched(val status: Int, val body: InputStream) : Closeable {
  override fun close() = body.close()
}

/** Fetches a URL (blocking, on the store's background thread); throws [IOException] when it cannot. */
fun interface Fetcher {
  fun fetch(url: String): Fetched
}

/** [Fetcher] over `HttpURLConnection`, with limits on connecting and on each read. */
class UrlFetcher(private val connectMs: Int = 15_000, private val readMs: Int = 30_000) : Fetcher {
  override fun fetch(url: String): Fetched {
    val connection = URI(url).toURL().openConnection() as HttpURLConnection
    connection.connectTimeout = connectMs
    connection.readTimeout = readMs
    connection.instanceFollowRedirects = true
    connection.useCaches = false
    val status = connection.responseCode
    val body = (if (status in 200..299) connection.inputStream else connection.errorStream) ?: InputStream.nullInputStream()
    return Fetched(status, body)
  }
}

/**
 * The model packs in the app's own files (boundary 2 of docs/notes/mobile.md "Android engine"),
 * which native code downloads for the background (`appHost.models.ensure`):
 * - each file from the mirrors in order, checked by size and SHA-256; a file already there with
 *   the right bytes is kept (a stopped download carries on);
 * - then the model's files are joined from their parts as the pack's `manifest.json` lists them,
 *   each checked by its size and SHA-256, and the parts deleted;
 * - `<dir>/<pack>/request.json` marks a pack the background asked for (its status is `packs`
 *   until it is ready); `<dir>/<pack>/<version>/` holds a version, ready once it has `complete`.
 * Downloads run one at a time on [background]; [main] brings their progress and ends back to the
 * app's thread, where every other call is made.
 */
class ModelStore(
  val dir: File,
  private val fetcher: Fetcher,
  private val background: Executor,
  private val main: (() -> Unit) -> Unit,
  private val now: () -> Double = { System.currentTimeMillis().toDouble() },
  private val progressMs: Double = 250.0,
) {
  private class Inflight(val version: String) {
    val progress = mutableListOf<(Long, Long) -> Unit>()
    val done = mutableListOf<(String?) -> Unit>()
  }

  /** The ready packs' version folders. */
  // Read from the WebView's request threads too (the translate origin serves the files).
  private val ready: MutableMap<String, File> = java.util.concurrent.ConcurrentHashMap()
  private val known = mutableSetOf<String>()
  private val inflight = mutableMapOf<String, Inflight>()
  /** Bumped by [remove], so a download that ends after it does not make the pack ready. */
  private val removals = mutableMapOf<String, Int>()

  /** Something worth a log line (a mirror that failed, a pack ready). */
  var onLog: ((String) -> Unit)? = null

  init {
    for (pack in dir.listFiles().orEmpty().filter { it.isDirectory && isSafeName(it.name) }) {
      if (File(pack, REQUEST).isFile) known += pack.name
      newestComplete(pack)?.let { ready[pack.name] = it }
    }
  }

  fun isReady(pack: String) = pack in ready

  fun isKnown(pack: String) = pack in known || pack in ready

  /** A ready pack's file (its `manifest.json`, or a joined model file by its type), or null. */
  fun file(pack: String, name: String): File? {
    if (!isSafeName(name) || name == COMPLETE) return null
    return ready[pack]?.let { File(it, name) }?.takeIf { it.isFile }
  }

  /** The ready packs that translate [from] into [to], or null (see [modelPacksFor]). */
  fun packsFor(from: String, to: String): List<String>? = modelPacksFor(from, to, ::isReady)

  /** `appHost.translatorStatus` on Android: `ready`, `packs` (asked for, not here yet) or `unavailable`. */
  fun status(from: String, to: String): String =
    when {
      packsFor(from, to) != null -> "ready"
      modelPacksFor(from, to, ::isKnown) != null -> "packs"
      else -> "unavailable"
    }

  /**
   * Brings [request]'s version to the phone: [onProgress] gets the bytes received of the total,
   * [done] null once it is ready, or why a file could not be downloaded.
   */
  fun ensure(request: ModelRequest, onProgress: (received: Long, total: Long) -> Unit, done: (error: String?) -> Unit) {
    val pack = request.pack
    if (ready[pack]?.name == request.version) {
      onProgress(request.total, request.total)
      return done(null)
    }
    known += pack
    inflight[pack]?.takeIf { it.version == request.version }?.let {
      it.progress += onProgress
      it.done += done
      return
    }
    val job = Inflight(request.version).also {
      it.progress += onProgress
      it.done += done
    }
    inflight[pack] = job
    val removal = removals[pack] ?: 0
    background.execute {
      val error =
        try {
          download(request) { received -> main { job.progress.forEach { it(received, request.total) } } }
        } catch (e: Exception) {
          "Could not save ${request.pack}: ${e.message ?: e}"
        }
      main {
        if (inflight[pack] === job) inflight.remove(pack)
        if (error == null && (removals[pack] ?: 0) == removal) {
          ready[pack] = File(File(dir, pack), request.version)
          onLog?.invoke("$pack ${request.version} ready")
        }
        job.done.forEach { it(error) }
      }
    }
  }

  /** `appHost.models.remove`: the pack's files go (it stays known, so its status is `packs`). */
  fun remove(pack: String) {
    if (!isSafeName(pack)) return
    ready.remove(pack)
    removals[pack] = (removals[pack] ?: 0) + 1
    background.execute {
      File(dir, pack).listFiles().orEmpty().filter { it.isDirectory }.forEach { it.deleteRecursively() }
    }
  }

  // the background thread

  /** Downloads and joins [request]'s files; null when the version is complete, else the error. */
  private fun download(request: ModelRequest, progress: (Long) -> Unit): String? {
    val packDir = File(dir, request.pack).apply { mkdirs() }
    File(packDir, REQUEST).writeText(jsonObject("version" to request.version).toJsonText())
    val versionDir = File(packDir, request.version)
    if (File(versionDir, COMPLETE).isFile) return null
    val parts = File(versionDir, PARTS).apply { mkdirs() }
    var received = 0L
    var lastReport = Double.NEGATIVE_INFINITY
    val report = { force: Boolean ->
      val time = now()
      if (force || time - lastReport >= progressMs) {
        lastReport = time
        progress(received)
      }
    }
    report(true)
    for (file in request.files) {
      val target = File(parts, file.path)
      if (target.isFile && target.length() == file.size && sha256(target) == file.sha256) {
        received += file.size
        report(false)
        continue
      }
      val errors = mutableListOf<String>()
      var saved = false
      for (template in request.mirrors) {
        val url = template.replace("{file}", file.path)
        var attempt = 0L
        try {
          fetch(url, file, target) { count ->
            attempt += count
            received += count
            report(false)
          }
          saved = true
          break
        } catch (e: IOException) {
          received -= attempt
          report(true)
          errors += "$url: ${e.message ?: e}"
          onLog?.let { log -> main { log("$url: ${e.message ?: e}") } }
        }
      }
      if (!saved) return "Could not download ${file.path} (${errors.joinToString("; ").ifEmpty { "no mirrors" }})"
    }
    report(true)
    join(parts, versionDir)?.let { return it }
    parts.deleteRecursively()
    File(versionDir, COMPLETE).writeText(request.version)
    // Older versions go once this one is complete.
    packDir.listFiles().orEmpty().filter { it.isDirectory && it.name != request.version }.forEach { it.deleteRecursively() }
    return null
  }

  /** Saves one file from [url] into [target], checked against the lock; throws when it is not it. */
  private fun fetch(url: String, file: ModelRequest.File, target: File, onBytes: (Long) -> Unit) {
    val partial = File(target.parentFile, "${target.name}$PARTIAL")
    val digest = MessageDigest.getInstance("SHA-256")
    var size = 0L
    try {
      fetcher.fetch(url).use { response ->
        if (response.status !in 200..299) throw IOException("HTTP ${response.status}")
        partial.outputStream().use { out ->
          val buffer = ByteArray(BUFFER)
          while (true) {
            val read = response.body.read(buffer)
            if (read < 0) break
            size += read
            if (size > file.size) throw IOException("more than the lock's ${file.size} bytes")
            digest.update(buffer, 0, read)
            out.write(buffer, 0, read)
            onBytes(read.toLong())
          }
        }
      }
      if (size != file.size) throw IOException("$size bytes, the lock has ${file.size}")
      if (digest.hex() != file.sha256) throw IOException("SHA-256 does not match the lock")
      if (!partial.renameTo(target)) throw IOException("could not save ${target.name}")
    } finally {
      partial.delete()
    }
  }

  /** Joins the model's files from their parts as `manifest.json` lists them; null when all match. */
  private fun join(parts: File, versionDir: File): String? {
    val manifestFile = File(parts, MANIFEST)
    if (!manifestFile.isFile) return "The pack has no $MANIFEST"
    val files =
      try {
        parseJson(manifestFile.readText()).obj?.get("files").obj
      } catch (_: Exception) {
        null
      } ?: return "The pack's $MANIFEST lists no files"
    for ((type, value) in files) {
      val model = value.obj
      val size = model?.get("size").number?.toLong()
      val sha = model?.get("sha256").string
      val list = model?.get("parts").array?.map { it.obj?.get("path").string }
      if (!isSafeName(type) || size == null || sha == null || list == null || list.any { it == null || !isSafeName(it) }) {
        return "The pack's $MANIFEST has a bad entry for $type"
      }
      val out = File(versionDir, type)
      val digest = MessageDigest.getInstance("SHA-256")
      var written = 0L
      out.outputStream().use { stream ->
        for (path in list) {
          val part = File(parts, path!!)
          if (!part.isFile) return "$type: $path is not in the pack"
          part.inputStream().use { input ->
            val buffer = ByteArray(BUFFER)
            while (true) {
              val read = input.read(buffer)
              if (read < 0) break
              digest.update(buffer, 0, read)
              stream.write(buffer, 0, read)
              written += read
            }
          }
        }
      }
      if (written != size || digest.hex() != sha.lowercase()) {
        out.delete()
        return "$type: the joined parts do not match the pack's $MANIFEST"
      }
    }
    manifestFile.copyTo(File(versionDir, MANIFEST), overwrite = true)
    return null
  }

  private fun newestComplete(pack: File): File? =
    pack.listFiles().orEmpty().filter { File(it, COMPLETE).isFile }.maxByOrNull { File(it, COMPLETE).lastModified() }

  companion object {
    const val MANIFEST = "manifest.json"
    private const val REQUEST = "request.json"
    private const val COMPLETE = "complete"
    private const val PARTS = "parts"
    private const val PARTIAL = ".partial"
    private const val BUFFER = 64 * 1024

    fun sha256(file: File): String {
      val digest = MessageDigest.getInstance("SHA-256")
      file.inputStream().use { input ->
        val buffer = ByteArray(BUFFER)
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          digest.update(buffer, 0, read)
        }
      }
      return digest.hex()
    }

    private fun MessageDigest.hex(): String = digest().joinToString("") { "%02x".format(it) }
  }
}

/**
 * The model packs that translate [from] into [to] of those [has] says exist: the direct one, else
 * two through English (de → fr = mt-de-en + mt-en-fr); null for one language or a pair with no
 * models (`modelPacksFor` in src/core/packs/pairs.ts).
 */
fun modelPacksFor(from: String, to: String, has: (String) -> Boolean): List<String>? {
  if (from == to) return null
  val direct = "mt-$from-$to"
  if (has(direct)) return listOf(direct)
  if (from == "en" || to == "en") return null
  val through = listOf("mt-$from-en", "mt-en-$to")
  return through.takeIf { it.all(has) }
}

/** `{ pack, received, total }` for `appHost.models.onProgress`. */
fun modelProgress(pack: String, received: Long, total: Long): JsonObject =
  jsonObject("pack" to pack, "received" to received, "total" to total)
