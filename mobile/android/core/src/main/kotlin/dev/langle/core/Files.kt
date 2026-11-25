package dev.langle.core

import kotlinx.serialization.json.JsonElement

/**
 * `appHost.shareFile`'s file (docs/specs/mobile-app.md "The shells"): the app writes [text] to a
 * file named [name] and hands it to the share sheet as [mime].
 */
data class SharedFile(val name: String, val mime: String, val text: String) {
  companion object {
    /** The error a bad file gets, the same text in all three routers (reference-native.ts). */
    const val ERROR = "appHost.shareFile needs a plain file name, a media type and text."

    /** 1–255 characters, no folder, no control character, not hidden (nor `.` / `..`). */
    private val PLAIN_NAME = Regex("^[^./\\\\\\x00-\\x1f][^/\\\\\\x00-\\x1f]{0,254}$")

    /** The call's argument as a file, or null when it is not one the app writes. */
    fun from(value: JsonElement?): SharedFile? {
      val obj = value.obj ?: return null
      val name = obj["name"].string?.takeIf { PLAIN_NAME.matches(it) } ?: return null
      val mime = obj["mime"].string?.takeIf { '/' in it } ?: return null
      val text = obj["text"].string ?: return null
      return SharedFile(name, mime, text)
    }
  }
}

/**
 * The media types a file input's `accept` asks the document picker for: types as given (a
 * wildcard subtype too), extensions (`.json`) through [typeOfExtension] (the system's table), and
 * the loose types a file of those types often arrives under ([looseTypes]). Anything else, an
 * extension the table lacks, the any-file type or no `accept` at all opens the picker on every file
 * ([ANY_TYPE]), so a file the page takes is never hidden. The page checks what it reads.
 */
fun pickerTypes(accept: List<String>, typeOfExtension: (String) -> String?): List<String> {
  val entries = accept.flatMap { it.split(',') }.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
  val types =
    entries.map { entry ->
      when {
        entry.startsWith('.') -> typeOfExtension(entry.removePrefix("."))?.lowercase() ?: return listOf(ANY_TYPE)
        '/' in entry -> entry
        else -> return listOf(ANY_TYPE)
      }
    }
  if (types.isEmpty() || ANY_TYPE in types) return listOf(ANY_TYPE)
  val loose = looseTypes(types).filter { type -> types.none { covers(it, type) } }
  return (types + loose).distinct()
}

/**
 * Where a file of [types] often ends up without its precise type: any file as
 * [UNKNOWN_TYPE] (saved by a mail or chat app that did not know it), a text format's
 * (`text/…`, JSON, XML and their `+json` / `+xml` kinds) also as `text/plain`.
 */
private fun looseTypes(types: List<String>): List<String> =
  listOf(UNKNOWN_TYPE) + if (types.any(::isText)) listOf("text/plain") else emptyList()

private fun isText(type: String): Boolean {
  val (main, sub) = type.split('/', limit = 2).let { it[0] to it.getOrElse(1) { "" } }
  return main == "text" || sub == "json" || sub == "xml" || sub.endsWith("+json") || sub.endsWith("+xml")
}

/** Whether [pattern] (a type, or a main type with the wildcard subtype) takes [type]. */
private fun covers(pattern: String, type: String): Boolean =
  pattern == type || (pattern.endsWith("/*") && type.startsWith(pattern.dropLast(1)))

/**
 * [mime] as apps' intent filters and the save dialog name types: `main/sub` in lower case,
 * without its parameters (`;charset=utf-8`); null when it is not a media type.
 */
fun bareMediaType(mime: String): String? {
  val type = mime.substringBefore(';').trim().lowercase()
  val parts = type.split('/')
  return type.takeIf { parts.size == 2 && parts.all { it.isNotEmpty() && it.none(Char::isWhitespace) } }
}

const val ANY_TYPE = "*/*"

/** A file whose type its app did not know. */
const val UNKNOWN_TYPE = "application/octet-stream"

/** `appHost.shareFile` in an app that has no share sheet (the router's tests). */
const val NO_SHARING = "Sharing a file is not available here."
