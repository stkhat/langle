package dev.langle.core

/**
 * The address another app's Share opens (docs/specs/mobile-app.md "M8: Share → Langle", "The
 * shared item → an address"). The same rule as LangleCore's `SharedLink`, both checked against
 * `mobile/protocol/shared-links.json`. Plain string work, so both sides read a link alike.
 */
object SharedLink {
  private const val SEARCH = "https://m.youtube.com/results?search_query="
  private val SCHEMES = listOf("https://", "http://")

  /** Spaces the shell trims and a link ends at: controls and space, and Unicode's other spaces. */
  private const val SPACES = "\u0085             ​    　﻿"

  /** Characters a link never has as they are: it ends before them. */
  private const val STOPS = "<>\"`“”‘’「」『』（）【】〔〕〈〉《》、。，．！？：；"

  /** Punctuation a sentence puts right after a link, taken off its end. */
  private const val TRAILING = ".,;:!?'\""

  /** Closing brackets taken off the end unless the link opened them. */
  private val CLOSING = mapOf(')' to '(', ']' to '[', '}' to '{')

  /**
   * The address for a shared [url] item or [text]: the URL item if it is an http(s) address,
   * else the first http(s) link in the text, a YouTube link as its `m.youtube.com` page; text
   * without a link as a YouTube search. Null when there is nothing to open.
   */
  fun resolve(url: String?, text: String?): String? {
    val link = url?.let { trim(it) }?.takeIf(::isLink) ?: text?.let(::linkIn)
    if (link != null) return youTube(link)
    val search = text?.let(::trim)?.takeIf { it.isNotEmpty() } ?: return null
    return SEARCH + PageText.encodeComponent(search)
  }

  private fun isSpace(c: Char) = c <= ' ' || c in SPACES

  private fun trim(text: String) = text.trim(::isSpace)

  /** The length of [text]'s scheme at [at] ("https://"), 0 if none is there. */
  private fun schemeAt(text: String, at: Int): Int =
    SCHEMES.firstOrNull { text.regionMatches(at, it, 0, it.length, ignoreCase = true) }?.length ?: 0

  /** Whether [text] is an http(s) address with a host. */
  private fun isLink(text: String): Boolean {
    val scheme = schemeAt(text, 0)
    return scheme > 0 && text.length > scheme && text[scheme] !in "/?#" && text.none { isSpace(it) }
  }

  private fun linkIn(text: String): String? {
    var at = 0
    while (at < text.length) {
      val scheme = schemeAt(text, at)
      if (scheme == 0) {
        at++
        continue
      }
      var end = at + scheme
      while (end < text.length && !isSpace(text[end]) && text[end] !in STOPS) end++
      val link = withoutTrailing(text.substring(at, end))
      if (isLink(link)) return link
      at++
    }
    return null
  }

  private fun withoutTrailing(link: String): String {
    var end = link.length
    while (end > 0) {
      val last = link[end - 1]
      val opening = CLOSING[last]
      val drop =
        when {
          last in TRAILING -> true
          opening != null -> {
            val part = link.substring(0, end)
            part.count { it == last } > part.count { it == opening }
          }
          else -> false
        }
      if (!drop) break
      end--
    }
    return link.substring(0, end)
  }

  /** A youtu.be or (www.)youtube.com link as its m.youtube.com page; any other link as it is. */
  private fun youTube(link: String): String {
    val rest = link.substring(schemeAt(link, 0))
    val split = rest.indexOfFirst { it in "/?#" }.let { if (it < 0) rest.length else it }
    val host = rest.substring(0, split).lowercase()
    val tail = rest.substring(split)
    return when (host) {
      "youtube.com", "www.youtube.com" -> "https://m.youtube.com" + (if (tail.startsWith("/")) tail else "/$tail")
      "youtu.be" -> {
        val pathEnd = tail.indexOfFirst { it in "?#" }.let { if (it < 0) tail.length else it }
        val id = tail.substring(0, pathEnd).removePrefix("/").substringBefore('/')
        if (id.isEmpty()) return link
        val fragmentAt = tail.indexOf('#').let { if (it < 0) tail.length else it }
        val query = if (pathEnd < tail.length && tail[pathEnd] == '?') tail.substring(pathEnd + 1, fragmentAt) else ""
        "https://m.youtube.com/watch?v=$id" + (if (query.isEmpty()) "" else "&$query") + tail.substring(fragmentAt)
      }
      else -> link
    }
  }
}
