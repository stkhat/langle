package dev.langle.core

import java.net.URI

/**
 * What the title bar shows and reads (docs/specs/mobile-app.md "The shells (native)"): the
 * page's site and title, the address its editing opens, and whether two addresses are one page.
 */
object PageText {
  /** Where text that is not an address goes, as on Home (`src/entrypoints/home/address.ts`). */
  private const val SEARCH = "https://m.youtube.com/results?search_query="

  /** The separators a title puts before the site's name at its end ("Bread | Site"). */
  private val SEPARATORS = listOf(" - ", " | ", " – ", " — ", " · ", " : ")

  /**
   * The page the title bar's editing (and Home's search field) opens for [text]: an http(s)
   * address as typed; text with a dot and no space as an address (`https://` added); anything
   * else a YouTube search. Null for blank text.
   */
  fun pageForSearch(text: String): String? {
    val typed = text.trim()
    if (typed.isEmpty()) return null
    if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(typed)) return parsed(typed) ?: search(typed)
    if (typed.contains('.') && !typed.any { it.isWhitespace() }) return parsed("https://$typed") ?: search(typed)
    return search(typed)
  }

  /** The page's site: its `og:site_name`, else its host without `www.` or `m.`. */
  fun siteName(url: String, ogSiteName: String?): String {
    ogSiteName?.trim()?.takeIf { it.isNotEmpty() }?.let { return it }
    val host = runCatching { URI(url).host }.getOrNull() ?: return ""
    return host.lowercase().removePrefix("www.").removePrefix("m.")
  }

  /**
   * The page's own title from a title WebView reports for the page at [url]: null when it is blank
   * or only the page's address, which WebView reports while a document has no title of its own
   * (a reload, before the page's title is read again).
   */
  fun reportedTitle(title: String?, url: String?): String? {
    val text = title?.trim().orEmpty()
    if (text.isEmpty()) return null
    if (url != null && bareAddress(text) == bareAddress(url)) return null
    return text
  }

  /** An address without its scheme and trailing slash, in lower case. */
  private fun bareAddress(text: String): String =
    text.lowercase().replaceFirst(Regex("^[a-z][a-z0-9+.-]*://"), "").trimEnd('/')

  /**
   * The title line: the page's title without the site's name at its end ("Talk - YouTube" under
   * "YouTube" is "Talk"), the address while the page has no title.
   */
  fun shownTitle(title: String?, site: String, url: String): String {
    val text = title?.trim().orEmpty()
    if (text.isEmpty()) return url
    if (site.isNotEmpty()) {
      for (separator in SEPARATORS) {
        val end = separator + site
        if (text.length > end.length && text.endsWith(end, ignoreCase = true)) return text.dropLast(end.length).trim()
      }
    }
    return text
  }

  /** Whether [a] and [b] are one page (Continue's row for the kept page shows it again at once). */
  fun samePage(a: String?, b: String?): Boolean = a != null && b != null && a.substringBefore('#') == b.substringBefore('#')

  private fun search(text: String) = SEARCH + encodeComponent(text)

  /** The address as a browser reads it (scheme and host in lower case, `/` for no path), if it has a host. */
  private fun parsed(text: String): String? {
    val uri = runCatching { URI(text) }.getOrNull() ?: return null
    val host = uri.host?.takeIf { it.isNotEmpty() } ?: return null
    return buildString {
      append(uri.scheme.lowercase()).append("://")
      uri.rawUserInfo?.let { append(it).append('@') }
      append(host.lowercase())
      if (uri.port != -1) append(':').append(uri.port)
      append(uri.rawPath.takeIf { !it.isNullOrEmpty() } ?: "/")
      uri.rawQuery?.let { append('?').append(it) }
      uri.rawFragment?.let { append('#').append(it) }
    }
  }

  /** JavaScript's `encodeURIComponent`. */
  private fun encodeComponent(text: String): String =
    buildString {
      for (byte in text.toByteArray(Charsets.UTF_8)) {
        val code = byte.toInt() and 0xff
        val char = code.toChar()
        if (code < 0x80 && (char in 'a'..'z' || char in 'A'..'Z' || char in '0'..'9' || char in "-_.!~*'()")) append(char)
        else append('%').append("%02X".format(code))
      }
    }
}
