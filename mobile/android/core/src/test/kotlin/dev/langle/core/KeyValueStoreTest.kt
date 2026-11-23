package dev.langle.core

import java.io.File
import java.nio.file.Files
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir

class KeyValueStoreTest {
  @TempDir lateinit var temp: File

  private val local = KeyValueStore.Area.LOCAL
  private val sync = KeyValueStore.Area.SYNC
  private val session = KeyValueStore.Area.SESSION

  private fun values(vararg pairs: Pair<String, Any?>) = jsonObject(*pairs)

  @Test
  fun `saves local and sync as one JSON file each and reads them in the next process`() {
    val directory = File(temp, "store")
    val store = KeyValueStore(FilePersistence(directory))
    store.set(local, values("settings" to mapOf("on" to true), "n" to 1.5))
    store.set(sync, values("s" to "x"))
    store.set(session, values("t" to 1))
    assertEquals(listOf("local.json", "sync.json"), directory.list()!!.sorted())
    val next = KeyValueStore(FilePersistence(directory))
    assertEquals(values("settings" to mapOf("on" to true), "n" to 1.5), jsonOf(next.stored(local)))
    assertEquals(values("s" to "x"), jsonOf(next.stored(sync)))
    assertEquals(values(), jsonOf(next.stored(session)))
  }

  @Test
  fun `writes through a temp file and leaves none behind`() {
    val directory = File(temp, "store")
    val store = KeyValueStore(FilePersistence(directory))
    repeat(3) { store.set(local, values("n" to it)) }
    assertEquals(listOf("local.json"), directory.list()!!.toList())
    assertEquals("""{"n":2}""", File(directory, "local.json").readText())
  }

  @Test
  fun `a write that cannot be saved changes nothing`() {
    // A file where the directory should be: the save fails.
    val directory = File(temp, "store")
    Files.writeString(directory.toPath(), "")
    val store = KeyValueStore(FilePersistence(directory))
    assertThrows<Exception> { store.set(local, values("a" to 1)) }
    assertEquals(emptyMap<String, Any>(), store.stored(local))
  }
}
