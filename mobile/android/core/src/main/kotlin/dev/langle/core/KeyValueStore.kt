package dev.langle.core

import java.io.File
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Where the store keeps what outlives the process: one JSON value per name. */
interface Persistence {
  fun load(name: String): JsonElement?

  fun save(name: String, value: JsonElement)
}

/**
 * One JSON file per name in a directory (the app's files), written atomically: to a temp file
 * in the same directory, then renamed over the old one.
 */
class FilePersistence(private val directory: File) : Persistence {
  private fun file(name: String) = File(directory, "$name.json")

  override fun load(name: String): JsonElement? =
    try {
      file(name).takeIf { it.isFile }?.readText()?.let(::parseJson)
    } catch (_: Exception) {
      null
    }

  override fun save(name: String, value: JsonElement) {
    if (!directory.isDirectory && !directory.mkdirs()) throw java.io.IOException("cannot create $directory")
    val temp = File.createTempFile(name, ".tmp", directory)
    try {
      temp.writeText(value.toJsonText())
      Files.move(temp.toPath(), file(name).toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
    } finally {
      temp.delete()
    }
  }
}

/** Kept in memory only: tests, and what a new process would start from. */
class MemoryPersistence(initial: Map<String, JsonElement> = emptyMap()) : Persistence {
  val saved = initial.toMutableMap()

  override fun load(name: String) = saved[name]

  override fun save(name: String, value: JsonElement) {
    saved[name] = value
  }
}

/**
 * `storage.local`, `storage.sync` and `storage.session` (docs/specs/mobile-app.md "Shim surface").
 * `local` and `sync` are saved on every write; `session` lives in memory and starts empty.
 */
class KeyValueStore(private val persistence: Persistence) {
  enum class Area(val key: String) {
    LOCAL("local"),
    SYNC("sync"),
    SESSION("session");

    companion object {
      fun of(key: String) = entries.firstOrNull { it.key == key }
    }
  }

  /** One key's change, as `storage.onChanged` gives it. */
  data class Change(val oldValue: JsonElement?, val newValue: JsonElement?) {
    val value: JsonObject
      get() =
        JsonObject(
          buildMap {
            oldValue?.let { put("oldValue", it) }
            newValue?.let { put("newValue", it) }
          }
        )
  }

  private val areas =
    mutableMapOf(
      Area.LOCAL to (persistence.load(Area.LOCAL.key).obj ?: emptyMap()),
      Area.SYNC to (persistence.load(Area.SYNC.key).obj ?: emptyMap()),
      Area.SESSION to emptyMap(),
    )

  /** What the area holds now. */
  fun stored(area: Area): Map<String, JsonElement> = areas.getValue(area)

  /** The stored keys among `keys` (all of them for null): Chrome's defaults stay in the shim. */
  fun get(area: Area, keys: List<String>?): Map<String, JsonElement> {
    val store = stored(area)
    return if (keys == null) store else store.filterKeys { it in keys }
  }

  /** Saves first, then returns what changed (empty when nothing did). */
  fun set(area: Area, items: Map<String, JsonElement>) = write(area, stored(area) + items)

  fun remove(area: Area, keys: List<String>) = write(area, stored(area).filterKeys { it !in keys })

  fun clear(area: Area) = write(area, emptyMap())

  private fun write(area: Area, next: Map<String, JsonElement>): Map<String, Change> {
    val store = stored(area)
    val changes = linkedMapOf<String, Change>()
    for (key in store.keys + next.keys) {
      if (store[key] != next[key]) changes[key] = Change(store[key], next[key])
    }
    if (changes.isEmpty()) return changes
    if (area != Area.SESSION) persistence.save(area.key, JsonObject(next))
    areas[area] = next
    return changes
  }
}
