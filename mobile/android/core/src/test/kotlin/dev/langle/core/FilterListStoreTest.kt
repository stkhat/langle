package dev.langle.core

import java.io.File
import java.io.IOException
import java.nio.file.Files
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** An engine of the fake builder: the texts it was built from. */
class FakeFilterEngine(val texts: List<String>) {
  var released = false
}

/** Builds "engines" that are the lists' texts joined; bytes of another version fail to load. */
class FakeFilterEngines : FilterEngines<FakeFilterEngine> {
  var builds = 0
  var failBuild = false
  val released = mutableListOf<FakeFilterEngine>()

  override fun build(lists: List<Pair<ByteArray, Boolean>>): ByteArray {
    builds++
    if (failBuild) throw IllegalStateException("bad lists")
    return ("v1\n" + lists.joinToString("\u0000") { (text, trusted) -> (if (trusted) "T" else "U") + String(text) }).toByteArray()
  }

  override fun load(bytes: ByteArray): FakeFilterEngine {
    val text = String(bytes)
    if (!text.startsWith("v1\n")) throw IllegalStateException("another crate version")
    return FakeFilterEngine(text.removePrefix("v1\n").split("\u0000"))
  }

  override fun release(engine: FakeFilterEngine) {
    engine.released = true
    released += engine
  }
}

class FilterListStoreTest {
  private val dir: File = Files.createTempDirectory("lists").toFile()
  private val lists =
    listOf(
      FilterList("easylist", listOf("https://a.test/easylist.txt", "https://b.test/easylist.txt"), trusted = false),
      FilterList("ublock", listOf("https://u.test/filters.txt"), trusted = true),
    )
  private var time = 1_000_000.0
  /** What each URL answers: a list's text, an HTTP status, or a refused connection. */
  private val served = mutableMapOf<String, Any>()
  private val etags = mutableMapOf<String, String>()
  private val requests = mutableListOf<String>()
  private val fetcher = ListFetcher { url, etag, lastModified ->
    requests += "$url ${etag ?: "-"} ${lastModified ?: "-"}"
    when (val answer = served[url]) {
      is String ->
        if (etag != null && etag == etags[url]) ListAnswer(304)
        else ListAnswer(200, answer.toByteArray(), etags[url], "Wed, 25 Nov 2026 10:00:00 GMT")
      is Int -> ListAnswer(answer)
      else -> throw IOException("connection refused")
    }
  }
  private val engines = FakeFilterEngines()
  private val errors = mutableListOf<String>()
  private val updates = mutableListOf<Double>()

  /** Runs on the calling thread: background and main are the test's own. */
  private fun store() =
    FilterListStore(dir, lists, fetcher, engines, { it.run() }, { it() }, { time }, retryMs = 1_800_000.0).also {
      it.onError = { e -> errors += e }
      it.onFetchFailed = { e -> errors += e }
      it.onUpdated = { t -> updates += t }
    }

  private fun serveAll() {
    served["https://a.test/easylist.txt"] = "[Adblock Plus 2.0]\n! Expires: 2 days\n##.ad"
    served["https://u.test/filters.txt"] = "! Title: uBlock filters\n! Expires: 12 hours\nyoutube.com##+js(set-constant, a, 1)"
    etags["https://a.test/easylist.txt"] = "\"e1\""
    etags["https://u.test/filters.txt"] = "\"u1\""
  }

  @Test
  fun `blocks nothing until a first fetch succeeds, then builds an engine of every list`() {
    val store = store()
    store.start()
    assertNull(store.engine)
    store.update()
    assertNull(store.engine)
    assertEquals(2, errors.size)
    assertTrue(errors[0].contains("easylist") && errors[0].contains("https://b.test/easylist.txt"), errors[0])
    assertTrue(updates.isEmpty())

    serveAll()
    time += 1_800_000.0
    store.update()
    val engine = store.engine!!
    assertEquals(listOf("U[Adblock Plus 2.0]\n! Expires: 2 days\n##.ad", "T! Title: uBlock filters\n! Expires: 12 hours\nyoutube.com##+js(set-constant, a, 1)"), engine.texts)
    assertEquals(listOf(time), updates)
    assertEquals(time, store.updatedAt())
  }

  @Test
  fun `takes a fallback when the list's own URL fails, and asks that URL conditionally later`() {
    serveAll()
    served["https://a.test/easylist.txt"] = 503
    served["https://b.test/easylist.txt"] = "[Adblock Plus 2.0]\n##.from-b"
    etags["https://b.test/easylist.txt"] = "\"b1\""
    val store = store()
    store.update()
    assertEquals("U[Adblock Plus 2.0]\n##.from-b", store.engine!!.texts[0])
    assertTrue(errors.isEmpty())
    requests.clear()
    time += 4 * 24 * 3600_000.0
    store.update()
    // easylist names no expiry: 4 days. Its own URL still fails, so the fallback is asked with its validators.
    assertEquals(
      listOf("https://a.test/easylist.txt - -", "https://b.test/easylist.txt \"b1\" Wed, 25 Nov 2026 10:00:00 GMT", "https://u.test/filters.txt \"u1\" Wed, 25 Nov 2026 10:00:00 GMT"),
      requests,
    )
  }

  @Test
  fun `fetches each list when its own expiry has passed, and a 304 keeps the engine`() {
    serveAll()
    val store = store()
    store.update()
    val first = store.engine!!
    assertEquals(1, engines.builds)
    requests.clear()

    time += 11 * 3600_000.0
    assertFalse(store.isDue())
    store.update()
    assertTrue(requests.isEmpty())

    time += 1 * 3600_000.0
    assertTrue(store.isDue())
    store.update()
    // Only uBO's list (12 hours) was due, asked with its ETag: not modified.
    assertEquals(listOf("https://u.test/filters.txt \"u1\" Wed, 25 Nov 2026 10:00:00 GMT"), requests)
    assertSame(first, store.engine)
    assertEquals(1, engines.builds)
    assertEquals(2, updates.size)

    requests.clear()
    time += 2 * 24 * 3600_000.0
    served["https://a.test/easylist.txt"] = "[Adblock Plus 2.0]\n##.ad2"
    etags["https://a.test/easylist.txt"] = "\"e2\""
    store.update()
    assertEquals(2, requests.size)
    assertEquals("U[Adblock Plus 2.0]\n##.ad2", store.engine!!.texts[0])
    assertTrue(first.released)
  }

  @Test
  fun `a failed fetch keeps the old list and the engine, and is tried again after the retry time`() {
    serveAll()
    val store = store()
    store.update()
    val engine = store.engine!!
    time += 3 * 24 * 3600_000.0
    served.remove("https://u.test/filters.txt")
    requests.clear()
    store.update()
    assertSame(engine, store.engine)
    assertEquals(1, errors.size)
    assertTrue(errors[0].startsWith("Ad blocking: could not update the filter list ublock"), errors[0])
    assertEquals(1, updates.size)
    // Not again before the retry time.
    requests.clear()
    time += 600_000.0
    store.update()
    assertTrue(requests.isEmpty())
    time += 1_200_000.0
    store.update()
    assertEquals(1, requests.size)
  }

  @Test
  fun `a failed build keeps the engine in use`() {
    serveAll()
    val store = store()
    store.update()
    val engine = store.engine!!
    engines.failBuild = true
    time += 13 * 3600_000.0
    served["https://u.test/filters.txt"] = "! Title: uBlock filters\n##.new"
    etags["https://u.test/filters.txt"] = "\"u2\""
    store.update()
    assertSame(engine, store.engine)
    assertFalse(engine.released)
    assertTrue(errors.single().contains("could not build"), errors.single())
    assertEquals(1, updates.size)
  }

  @Test
  fun `refuses an answer that is not a filter list`() {
    serveAll()
    served["https://a.test/easylist.txt"] = "<html>Sign in to the Wi-Fi</html>"
    val store = store()
    store.update()
    assertTrue(errors.single().contains("https://a.test/easylist.txt: not a filter list"), errors.single())
    assertEquals(1, store.engine!!.texts.size)
  }

  @Test
  fun `a new process loads the kept engine, and builds again from the kept lists when its bytes are of another version`() {
    serveAll()
    store().update()
    val again = store()
    again.start()
    assertEquals(2, again.engine!!.texts.size)
    assertEquals(1, engines.builds)

    File(dir, FilterListStore.ENGINE).writeText("v0\nold")
    val third = store()
    third.start()
    assertEquals(2, third.engine!!.texts.size)
    assertEquals(2, engines.builds)
    assertTrue(String(File(dir, FilterListStore.ENGINE).readBytes()).startsWith("v1\n"))
  }

  @Test
  fun `an update asked while a job runs runs after it`() {
    serveAll()
    val jobs = ArrayDeque<Runnable>()
    val store = FilterListStore(dir, lists, fetcher, engines, { jobs.addLast(it) }, { it() }, { time })
    store.start()
    store.update()
    assertEquals(1, jobs.size)
    jobs.removeFirst().run()
    assertEquals(1, jobs.size)
    jobs.removeFirst().run()
    assertEquals(2, store.engine!!.texts.size)
  }

  @Test
  fun `reads a list's own expiry, within 1 hour and 14 days`() {
    fun expiry(text: String) = FilterListStore.listExpiryMs(text.toByteArray()) / 3600_000.0
    assertEquals(96.0, expiry("[Adblock Plus 2.0]\n! Title: EasyList\n! Expires: 4 days (update frequency)\n"))
    assertEquals(24.0, expiry("! Expires: 1 day\n"))
    assertEquals(8.0, expiry("! Title: x\n! Expires: 8 hours\n"))
    assertEquals(96.0, expiry("! Title: none\n||ads.test^\n"))
    assertEquals(1.0, expiry("! Expires: 0 hours\n"))
    assertEquals(336.0, expiry("! Expires: 90 days\n"))
  }

  @Test
  fun `reads filter-lists json`() {
    val text = File(System.getProperty("langle.repo"), "mobile/protocol/filter-lists.json").readText()
    val read = FilterList.read(text)
    assertEquals(listOf("easylist", "easyprivacy", "ublock-filters", "ublock-quick-fixes", "ublock-unbreak"), read.map { it.id })
    assertEquals(listOf(false, false, true, true, true), read.map { it.trusted })
    assertEquals(
      listOf("https://easylist.to/easylist/easylist.txt", "https://secure.fanboy.co.nz/easylist.txt", "https://easylist-downloads.adblockplus.org/easylist.txt"),
      read[0].urls,
    )
  }
}
