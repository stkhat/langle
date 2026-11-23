package dev.langle.core

/** A pattern Chrome would refuse. */
class InvalidMatchPattern(val pattern: String) : Exception("bad match pattern $pattern")

/**
 * A Chrome match pattern (`<all_urls>`, `*://m.youtube.com/` then `*`, and so on; Kotlin comments
 * nest, so the patterns are not written out here), for the manifest's content scripts:
 * - scheme `*` is http or https;
 * - host `*` is any host, `*.example.com` is example.com and its subdomains; a host without a port
 *   matches any port;
 * - the path is a glob (`*` is any run of characters) over the URL's path and query.
 */
class MatchPattern(val pattern: String) {
  private val schemes: Set<String>
  private val host: String? // null: any host
  private val subdomains: Boolean
  private val port: Int? // null: any port
  private val path: String

  init {
    if (pattern == "<all_urls>") {
      schemes = ALL_URL_SCHEMES
      host = null
      subdomains = false
      port = null
      path = "/*"
    } else {
      val separator = pattern.indexOf("://")
      if (separator < 0) throw InvalidMatchPattern(pattern)
      val scheme = pattern.substring(0, separator)
      val rest = pattern.substring(separator + 3)
      schemes =
        when (scheme) {
          "*" -> setOf("http", "https")
          in KNOWN_SCHEMES -> setOf(scheme)
          else -> throw InvalidMatchPattern(pattern)
        }
      val slash = rest.indexOf('/')
      if (slash < 0) throw InvalidMatchPattern(pattern)
      var authority = rest.substring(0, slash).lowercase()
      path = rest.substring(slash)
      if (scheme == "file") {
        if (authority.isNotEmpty()) throw InvalidMatchPattern(pattern)
        host = null
        subdomains = false
        port = null
      } else {
        var port: Int? = null
        val colon = authority.lastIndexOf(':')
        if (colon >= 0) {
          val text = authority.substring(colon + 1)
          if (text != "*") port = text.toIntOrNull() ?: throw InvalidMatchPattern(pattern)
          authority = authority.substring(0, colon)
        }
        this.port = port
        when {
          authority == "*" -> {
            host = null
            subdomains = false
          }
          authority.startsWith("*.") -> {
            host = authority.substring(2)
            subdomains = true
          }
          authority.isEmpty() || authority.contains('*') -> throw InvalidMatchPattern(pattern)
          else -> {
            host = authority
            subdomains = false
          }
        }
      }
    }
  }

  fun matches(url: String): Boolean {
    val parts = WebUrl.parse(url) ?: return false
    if (parts.scheme !in schemes) return false
    if (parts.scheme != "file") {
      if (parts.host.isEmpty()) return false
      if (host != null && parts.host != host && !(subdomains && parts.host.endsWith(".$host"))) return false
      if (port != null && port != (parts.port ?: DEFAULT_PORTS[parts.scheme])) return false
    }
    return glob(path, parts.pathAndQuery)
  }

  /**
   * A regular expression, in the syntax JavaScript and Java share, matching the URLs this pattern
   * matches as `location.href` writes them (lower-case scheme and host, no default port, a path).
   * Android registers scripts per WebView, not per document, so injected scripts test it.
   */
  val regex: String by lazy {
    val alternatives =
      schemes.sorted().map { scheme ->
        if (scheme == "file") return@map "file://"
        val hostPart =
          when {
            host == null -> ANY_HOST
            subdomains -> "(?:$HOST_LABELS\\.)?" + escape(host)
            else -> escape(host)
          }
        val portPart =
          when {
            port == null -> "(?::[0-9]+)?"
            port == DEFAULT_PORTS[scheme] -> "(?::$port)?"
            else -> ":$port"
          }
        escape(scheme) + "://" + hostPart + portPart
      }
    val path = this.path.split('*').joinToString("[^#]*") { escape(it) }
    "^(?:" + alternatives.joinToString("|") + ")" + path + "(?:#.*)?$"
  }

  override fun toString() = pattern

  override fun equals(other: Any?) = other is MatchPattern && other.pattern == pattern

  override fun hashCode() = pattern.hashCode()

  companion object {
    private val ALL_URL_SCHEMES = setOf("http", "https", "ws", "wss", "ftp", "file")
    private val KNOWN_SCHEMES = ALL_URL_SCHEMES
    private val DEFAULT_PORTS = mapOf("http" to 80, "https" to 443, "ws" to 80, "wss" to 443, "ftp" to 21)

    private const val HOST_LABELS = "[^/?#:@\\[\\]]+"
    private const val ANY_HOST = "(?:\\[[0-9a-f:.]*\\]|$HOST_LABELS)"

    /** Every character but letters and digits as `\\uXXXX`, which both syntaxes read. */
    private fun escape(text: String) =
      text.map { if (it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9') "$it" else "\\u%04x".format(it.code) }.joinToString("")

    /** `*` matches any run of characters; everything else itself. */
    internal fun glob(pattern: String, text: String): Boolean {
      var pi = 0
      var ti = 0
      var star = -1
      var mark = 0
      while (ti < text.length) {
        when {
          pi < pattern.length && pattern[pi] == '*' -> {
            star = pi
            mark = ti
            pi++
          }
          pi < pattern.length && pattern[pi] == text[ti] -> {
            pi++
            ti++
          }
          star >= 0 -> {
            pi = star + 1
            mark++
            ti = mark
          }
          else -> return false
        }
      }
      while (pi < pattern.length && pattern[pi] == '*') pi++
      return pi == pattern.length
    }
  }
}

/**
 * The parts of a URL that match patterns and senders need, read leniently (a page's URL is what
 * the engine reports; it is not validated again): lower-case scheme and host, the port when one
 * is written, the path (`/` when empty) and query without the fragment.
 */
data class WebUrl(val scheme: String, val host: String, val port: Int?, val pathAndQuery: String) {
  /** `scheme://host[:port]`, as `new URL(url).origin` gives it for web URLs. */
  val origin: String?
    get() =
      if (host.isEmpty()) null
      else "$scheme://$host" + (port?.takeIf { it != DEFAULT_PORTS[scheme] }?.let { ":$it" } ?: "")

  companion object {
    private val DEFAULT_PORTS = mapOf("http" to 80, "https" to 443, "ws" to 80, "wss" to 443, "ftp" to 21)

    fun parse(url: String): WebUrl? {
      val separator = url.indexOf("://")
      if (separator <= 0) return null
      val scheme = url.substring(0, separator).lowercase()
      if (!scheme.all { it.isLetterOrDigit() || it in "+-." }) return null
      val rest = url.substring(separator + 3).substringBefore('#')
      val end = rest.indexOfFirst { it == '/' || it == '?' }.let { if (it < 0) rest.length else it }
      val authority = rest.substring(0, end).substringAfterLast('@')
      var target = rest.substring(end)
      if (target.startsWith("?")) target = "/$target"
      if (target.isEmpty()) target = "/"
      var host = authority
      var port: Int? = null
      val colon = authority.lastIndexOf(':')
      if (colon >= 0 && !authority.endsWith("]")) {
        val text = authority.substring(colon + 1)
        if (text.isNotEmpty()) port = text.toIntOrNull() ?: return null
        host = authority.substring(0, colon)
      }
      return WebUrl(scheme, host.lowercase(), port, target)
    }
  }
}
