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
 * wildcard subtype too), extensions (`.json`) through [typeOfExtension] (the system's table). Anything else, an
 * extension the table lacks, or no `accept` at all opens the picker on every file ([ANY_TYPE]),
 * so a file the page takes is never hidden.
 */
fun pickerTypes(accept: List<String>, typeOfExtension: (String) -> String?): List<String> {
  val entries = accept.flatMap { it.split(',') }.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
  val types =
    entries.map { entry ->
      when {
        entry.startsWith('.') -> typeOfExtension(entry.removePrefix(".")) ?: return listOf(ANY_TYPE)
        '/' in entry -> entry
        else -> return listOf(ANY_TYPE)
      }
    }
  return types.distinct().ifEmpty { listOf(ANY_TYPE) }
}

const val ANY_TYPE = "*/*"

/** `appHost.shareFile` in an app that has no share sheet (the router's tests). */
const val NO_SHARING = "Sharing a file is not available here."
