package dev.langle.core

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Why a build is refused, naming each thing the app does not support. */
class ManifestRefusal(val unsupported: List<String>) :
  Exception("The app does not support this build: ${unsupported.joinToString("; ")}")

/**
 * The parts of the `langle-app` build's `manifest.json` the app supports (docs/specs/mobile-app.md
 * "The langle-app build target"; the same rules as `tests/app-manifest.test.ts`). A build that asks
 * for anything else is refused, naming what the app does not support.
 */
class Manifest
private constructor(
  val version: String,
  /** The background script (`background.service_worker`), run in the extension host. */
  val background: String,
  val contentScripts: List<ContentScript>,
  /** The manifest as it is, for `runtime.getManifest`. */
  val value: JsonObject,
) {
  enum class RunAt(val key: String) {
    DOCUMENT_START("document_start"),
    DOCUMENT_END("document_end"),
    DOCUMENT_IDLE("document_idle"),
  }

  enum class World(val key: String) {
    ISOLATED("ISOLATED"),
    MAIN("MAIN"),
  }

  data class ContentScript(val matches: List<MatchPattern>, val js: List<String>, val runAt: RunAt, val world: World) {
    fun matches(url: String) = matches.any { it.matches(url) }
  }

  /** The content scripts that run on a page at `url`, in manifest order. */
  fun scripts(url: String) = contentScripts.filter { it.matches(url) }

  companion object {
    private val KEYS =
      setOf(
        "manifest_version",
        "name",
        "description",
        "version",
        "icons",
        "permissions",
        "background",
        "action",
        "options_ui",
        "content_scripts",
        // Check and development builds carry the extension key (wxt.config.ts); it means nothing here.
        "key",
      )
    private val PERMISSIONS = setOf("storage", "alarms", "identity")
    private val SCRIPT_KEYS = setOf("matches", "js", "run_at", "world", "css")
    private val ACTION_KEYS = setOf("default_title", "default_popup", "default_icon")
    private val OPTIONS_KEYS = setOf("page", "open_in_tab")

    fun read(text: String): Manifest {
      val manifest =
        try {
          parseJson(text) as? JsonObject
        } catch (_: Exception) {
          null
        } ?: throw ManifestRefusal(listOf("a manifest that is not a JSON object"))
      val unsupported = mutableListOf<String>()
      fun extra(o: JsonObject, allowed: Set<String>, prefix: String) {
        o.keys.sorted().filter { it !in allowed }.forEach { unsupported += "$prefix$it" }
      }

      extra(manifest, KEYS, "")
      if (manifest["manifest_version"].number != 3.0) {
        unsupported += "manifest_version ${jsString(manifest["manifest_version"])}"
      }
      val version = manifest["version"].string ?: ""
      if (version.isEmpty()) unsupported += "a manifest without a version"
      for (permission in manifest["permissions"].array ?: emptyList<JsonElement>()) {
        if (permission.string !in PERMISSIONS) unsupported += "permission ${jsString(permission)}"
      }
      manifest["action"].obj?.let { extra(it, ACTION_KEYS, "action.") }
      manifest["options_ui"].obj?.let { extra(it, OPTIONS_KEYS, "options_ui.") }

      var background = ""
      manifest["background"].obj?.let {
        extra(it, setOf("service_worker"), "background.")
        background = it["service_worker"].string ?: ""
      }
      if (background.isEmpty()) unsupported += "a manifest without background.service_worker"

      val scripts = mutableListOf<ContentScript>()
      (manifest["content_scripts"].array ?: emptyList<JsonElement>()).forEachIndexed { index, entry ->
        val prefix = "content_scripts[$index]."
        val script = entry.obj
        if (script == null) {
          unsupported += "content_scripts[$index]"
          return@forEachIndexed
        }
        extra(script, SCRIPT_KEYS, prefix)
        if (!script["css"].array.isNullOrEmpty()) unsupported += "${prefix}css"
        val patterns =
          (script["matches"].array ?: emptyList<JsonElement>()).mapNotNull { match ->
            try {
              MatchPattern(match.string ?: "")
            } catch (_: InvalidMatchPattern) {
              unsupported += "${prefix}matches ${jsString(match)}"
              null
            }
          }
        val runAtKey = script["run_at"].string ?: RunAt.DOCUMENT_IDLE.key
        val runAt = RunAt.entries.firstOrNull { it.key == runAtKey }
        if (runAt == null) unsupported += "${prefix}run_at ${jsString(script["run_at"])}"
        val worldKey = script["world"].string ?: World.ISOLATED.key
        val world = World.entries.firstOrNull { it.key == worldKey }
        if (world == null) unsupported += "${prefix}world ${jsString(script["world"])}"
        val js = (script["js"].array ?: emptyList<JsonElement>()).mapNotNull { it.string }
        if (runAt != null && world != null) scripts += ContentScript(patterns, js, runAt, world)
      }

      if (unsupported.isNotEmpty()) throw ManifestRefusal(unsupported)
      return Manifest(version, background, scripts, manifest)
    }
  }
}
