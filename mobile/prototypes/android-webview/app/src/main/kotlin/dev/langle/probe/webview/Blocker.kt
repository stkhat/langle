package dev.langle.probe.webview

import android.content.Context
import android.net.Uri
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/**
 * Prototype ad blocker: EasyList's host rules (`||host^`, optionally `$third-party`) and its
 * generic element-hiding rules (`##selector`). Not the real engine (adblock-rust is the
 * candidate); this only measures what request and element blocking do to the pages and to
 * caption capture. The list is data, fetched at run time and cached.
 */
class Blocker(context: Context, private val enabled: Boolean, onReady: (css: String?) -> Unit) {
  @Volatile private var blockedHosts: Set<String> = emptySet()
  @Volatile private var allowedHosts: Set<String> = emptySet()
  private val count = AtomicInteger()
  val pageBlocked: Int
    get() = count.get()

  init {
    if (enabled) {
      thread(name = "blocker-load") {
        try {
          val cache = File(context.filesDir, "easylist.txt")
          if (!cache.exists() || System.currentTimeMillis() - cache.lastModified() > 86_400_000) {
            val conn = URL(EASYLIST).openConnection() as HttpURLConnection
            conn.inputStream.use { input -> cache.outputStream().use { input.copyTo(it) } }
          }
          val blocked = HashSet<String>()
          val allowed = HashSet<String>()
          val selectors = ArrayList<String>()
          cache.forEachLine { line ->
            when {
              line.startsWith("@@||") -> hostOf(line.substring(4))?.let { allowed += it }
              line.startsWith("||") -> hostOf(line.substring(2))?.let { blocked += it }
              line.startsWith("##") -> {
                val sel = line.substring(2)
                if (UNSUPPORTED.none { sel.contains(it) }) selectors += sel
              }
            }
          }
          blockedHosts = blocked
          allowedHosts = allowed
          Log.i(TAG, "blocker loaded hosts=${blocked.size} allow=${allowed.size} selectors=${selectors.size}")
          onReady(selectors.joinToString("\n") { "$it{display:none!important}" })
        } catch (e: Exception) {
          Log.e(TAG, "blocker load failed", e)
          onReady(null)
        }
      }
    } else {
      onReady(null)
    }
  }

  fun resetPageCount() = count.set(0)

  fun blocks(url: Uri, mainFrame: Boolean): Boolean {
    if (!enabled || mainFrame) return false
    val host = url.host ?: return false
    var h = host
    while (true) {
      if (h in allowedHosts) return false
      if (h in blockedHosts) {
        val n = count.incrementAndGet()
        Log.i(TAG, "blocked #$n $host")
        return true
      }
      val dot = h.indexOf('.')
      if (dot < 0) return false
      h = h.substring(dot + 1)
    }
  }

  /** `host^` or `host^$third-party` → host; anything with a path or other options → null. */
  private fun hostOf(rule: String): String? {
    val caret = rule.indexOf('^')
    if (caret <= 0) return null
    val rest = rule.substring(caret + 1)
    if (rest.isNotEmpty() && rest != "\$third-party") return null
    val host = rule.substring(0, caret)
    return if (host.all { it.isLetterOrDigit() || it == '.' || it == '-' }) host else null
  }

  companion object {
    const val EASYLIST = "https://easylist.to/easylist/easylist.txt"
    private val UNSUPPORTED =
      listOf(":-abp-", ":has-text", ":style(", ":matches-", ":xpath", ":upward", ":remove", ":watch-attr")
  }
}
