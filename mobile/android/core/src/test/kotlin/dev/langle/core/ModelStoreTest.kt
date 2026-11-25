package dev.langle.core

import com.sun.net.httpserver.HttpServer
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.net.InetSocketAddress
import java.nio.file.Files
import java.security.MessageDigest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

private fun sha(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

/** A small model pack as scripts/data/mt-models.ts writes one: a model in two parts, a lex, a vocab. */
class FakePack(val pack: String = "mt-en-ja", val version: String = "2026.1125.0") {
  val model = ByteArray(300) { (it % 251).toByte() }
  val lex = "lex bytes".toByteArray()
  val vocab = "vocab bytes".toByteArray()
  val parts = mapOf("model.bin.1" to model.copyOfRange(0, 200), "model.bin.2" to model.copyOfRange(200, 300), "lex.bin" to lex, "vocab.spm" to vocab)

  private fun entry(whole: ByteArray, vararg names: String) =
    mapOf("size" to whole.size, "sha256" to sha(whole), "parts" to names.map { mapOf("path" to it, "size" to parts[it]!!.size, "sha256" to sha(parts[it]!!)) })

  val manifest =
    jsonOf(
      mapOf(
        "v" to 1, "from" to "en", "to" to "ja", "gemmPrecision" to "int8shiftAlphaAll",
        "files" to mapOf("model" to entry(model, "model.bin.1", "model.bin.2"), "lex" to entry(lex, "lex.bin"), "vocab" to entry(vocab, "vocab.spm")),
      ),
    ).toJsonText().toByteArray()

  /** Every file of the npm package, by path. */
  val files: Map<String, ByteArray> = parts + ("manifest.json" to manifest)

  fun request(mirrors: List<String> = listOf("https://a.test/{file}", "https://b.test/{file}"), files: Map<String, ByteArray> = this.files) =
    ModelRequest(pack, version, files.map { (path, bytes) -> ModelRequest.File(path, sha(bytes), bytes.size.toLong()) }, mirrors)
}

class ModelStoreTest {
  private val dir: File = Files.createTempDirectory("models").toFile()
  private val pack = FakePack()
  /** What each URL answers: bytes, or an HTTP status. */
  private val served = mutableMapOf<String, Any>()
  private val fetched = mutableListOf<String>()
  private val fetcher = Fetcher { url ->
    fetched += url
    when (val answer = served[url]) {
      is ByteArray -> Fetched(200, ByteArrayInputStream(answer))
      is Int -> Fetched(answer, ByteArrayInputStream(ByteArray(0)))
      else -> throw IOException("connection refused")
    }
  }
  private var time = 0.0
  private fun store() = ModelStore(dir, fetcher, { it.run() }, { it() }, now = { time })

  @AfterEach
  fun cleanUp() {
    dir.deleteRecursively()
  }

  private fun serve(mirror: String, files: Map<String, ByteArray> = pack.files) {
    for ((path, bytes) in files) served["https://$mirror.test/$path"] = bytes
  }

  private class Result {
    var error: String? = "not done"
    val progress = mutableListOf<Pair<Long, Long>>()
  }

  private fun ensure(store: ModelStore, request: ModelRequest = pack.request()): Result {
    val result = Result()
    store.ensure(request, { received, total -> result.progress += received to total }) { result.error = it }
    return result
  }

  @Test
  fun `downloads every file from the first mirror, joins the model and serves it`() {
    serve("a")
    val store = store()
    assertEquals("unavailable", store.status("en", "ja"))
    val result = ensure(store)
    assertNull(result.error)
    assertTrue(fetched.all { it.startsWith("https://a.test/") })
    assertTrue(store.isReady("mt-en-ja"))
    assertEquals("ready", store.status("en", "ja"))
    assertEquals(listOf("mt-en-ja"), store.packsFor("en", "ja"))
    assertTrue(pack.model.contentEquals(store.file("mt-en-ja", "model")!!.readBytes()))
    assertTrue(pack.lex.contentEquals(store.file("mt-en-ja", "lex")!!.readBytes()))
    assertTrue(pack.manifest.contentEquals(store.file("mt-en-ja", "manifest.json")!!.readBytes()))
    // The parts are gone; nothing outside the version's files is served.
    assertNull(store.file("mt-en-ja", "model.bin.1"))
    assertNull(store.file("mt-en-ja", "../request.json"))
    assertNull(store.file("mt-en-ja", "complete"))
    // Progress ends at the total.
    val total = pack.files.values.sumOf { it.size }.toLong()
    assertEquals(total to total, result.progress.last())
    assertEquals(0L to total, result.progress.first())
  }

  @Test
  fun `tries the mirrors in order`() {
    served["https://a.test/lex.bin"] = 404
    serve("b")
    val result = ensure(store())
    assertNull(result.error)
    assertEquals(listOf("https://a.test/lex.bin", "https://b.test/lex.bin"), fetched.filter { it.endsWith("/lex.bin") })
  }

  @Test
  fun `a file with other bytes than the lock's is refused, and the next mirror tried`() {
    serve("a")
    served["https://a.test/vocab.spm"] = "other bytes".toByteArray()
    serve("b")
    val result = ensure(store())
    assertNull(result.error)
    assertTrue("https://b.test/vocab.spm" in fetched)
    // The bytes of the refused attempt do not count.
    val total = pack.files.values.sumOf { it.size }.toLong()
    assertTrue(result.progress.all { it.first <= total })
  }

  @Test
  fun `a file no mirror has fails the download, with every mirror's error`() {
    serve("a", pack.files - "lex.bin")
    val store = store()
    val result = ensure(store)
    assertTrue(result.error!!.startsWith("Could not download lex.bin ("), result.error)
    assertTrue("https://a.test/lex.bin: connection refused" in result.error!!)
    assertTrue("https://b.test/lex.bin: connection refused" in result.error!!)
    assertFalse(store.isReady("mt-en-ja"))
    // Asked for: its status is packs, not unavailable.
    assertEquals("packs", store.status("en", "ja"))
    // A retry fetches only what is missing: the files before lex.bin are kept.
    fetched.clear()
    serve("b")
    assertNull(ensure(store).error)
    assertEquals(listOf("https://a.test/lex.bin", "https://b.test/lex.bin"), fetched.take(2))
    assertFalse(fetched.any { it.endsWith("/model.bin.1") || it.endsWith("/model.bin.2") })
  }

  @Test
  fun `joined parts that do not match the manifest fail the download`() {
    val bad = pack.parts + ("model.bin.2" to ByteArray(100)) + ("manifest.json" to pack.manifest)
    serve("a", bad)
    val result = ensure(store(), pack.request(files = bad))
    assertEquals("model: the joined parts do not match the pack's manifest.json", result.error)
  }

  @Test
  fun `a ready version answers at once, and survives a new store`() {
    serve("a")
    assertNull(ensure(store()).error)
    fetched.clear()
    val again = store()
    assertTrue(again.isReady("mt-en-ja"))
    assertNull(ensure(again).error)
    assertTrue(fetched.isEmpty())
  }

  @Test
  fun `a new version replaces the old one once it is complete`() {
    serve("a")
    val store = store()
    assertNull(ensure(store).error)
    val newer = FakePack(version = "2026.1201.0")
    assertNull(ensure(store, newer.request()).error)
    assertEquals(listOf("2026.1201.0", "request.json"), File(dir, "mt-en-ja").list()!!.sorted())
    assertEquals("2026.1201.0", store.file("mt-en-ja", "model")!!.parentFile.name)
  }

  @Test
  fun `remove deletes the files and keeps the pack known`() {
    serve("a")
    val store = store()
    assertNull(ensure(store).error)
    store.remove("mt-en-ja")
    assertFalse(store.isReady("mt-en-ja"))
    assertNull(store.file("mt-en-ja", "model"))
    assertEquals("packs", store.status("en", "ja"))
    assertEquals(listOf("request.json"), File(dir, "mt-en-ja").list()!!.toList())
    assertFalse(store().isReady("mt-en-ja"))
  }

  @Test
  fun `progress is reported at most every 250 ms, and at the start and the end`() {
    serve("a")
    val result = ensure(store())
    // The clock does not move: the start, then the end (twice: after the files, before joining).
    val total = pack.files.values.sumOf { it.size }.toLong()
    assertEquals(listOf(0L to total, total to total), result.progress.distinct())
  }

  @Test
  fun `pairs through English need both packs`() {
    val store = store()
    assertNull(modelPacksFor("de", "fr") { it == "mt-de-en" })
    assertEquals(listOf("mt-de-en", "mt-en-fr"), modelPacksFor("de", "fr") { it != "mt-de-fr" })
    assertEquals(listOf("mt-de-fr"), modelPacksFor("de", "fr") { it == "mt-de-fr" })
    assertNull(modelPacksFor("en", "en") { true })
    assertNull(modelPacksFor("en", "ko") { it == "mt-ko-en" })
    assertEquals("unavailable", store.status("de", "fr"))
  }

  @Test
  fun `requests with unsafe names are not requests`() {
    val good = jsonOf(mapOf("pack" to "mt-en-ja", "version" to "1", "files" to listOf(mapOf("path" to "a", "sha256" to "0".repeat(64), "size" to 1)), "mirrors" to listOf("https://x/{file}")))
    assertNotNull(ModelRequest.from(good))
    assertNull(ModelRequest.from(parseJson(good.toJsonText().replace("\"a\"", "\"../a\""))))
    assertNull(ModelRequest.from(parseJson(good.toJsonText().replace("mt-en-ja", ".."))))
    assertNull(ModelRequest.from(parseJson(good.toJsonText().replace("{file}", ""))))
    assertNull(ModelRequest.from(JsonPrimitive("mt-en-ja")))
  }

  @Test
  fun `UrlFetcher reads an HTTP server's status and body`() {
    val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    server.createContext("/") { exchange ->
      val body = pack.files[exchange.requestURI.path.removePrefix("/")]
      if (body == null) {
        exchange.sendResponseHeaders(404, -1)
      } else {
        exchange.sendResponseHeaders(200, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
      }
      exchange.close()
    }
    server.start()
    try {
      val base = "http://127.0.0.1:${server.address.port}"
      val store = ModelStore(dir, UrlFetcher(), { it.run() }, { it() })
      val result = Result()
      store.ensure(pack.request(listOf("$base/missing/{file}", "$base/{file}")), { _, _ -> }) { result.error = it }
      assertNull(result.error)
      assertTrue(pack.model.contentEquals(store.file("mt-en-ja", "model")!!.readBytes()))
    } finally {
      server.stop(0)
    }
  }
}

class TranslationServiceTest {
  private val dir: File = Files.createTempDirectory("models").toFile()
  private val pack = FakePack()
  private val clock = ManualClock()
  private val engine = FakeEngine()
  private val posted = mutableListOf<Pair<String, String>>()
  private val store = ModelStore(dir, { url -> Fetched(200, ByteArrayInputStream(pack.files[url.substringAfterLast('/')]!!)) }, { it.run() }, { it() })
  private val host = TranslationHost(engine, clock, store::packsFor)
  private var screen: ContextSpec = ContextSpec.Content(1)
  private val service = TranslationService(host, store, { it == screen }) { api, args -> posted += api to args.single().toJsonText() }

  @AfterEach
  fun cleanUp() {
    dir.deleteRecursively()
  }

  private fun call(api: String, request: Any?, from: ContextSpec = ContextSpec.Content(1)): Answer? {
    var answer: Answer? = null
    service.handle(from, api, jsonOf(request)) { answer = it }
    return answer
  }

  private val ensureRequest
    get() =
      mapOf(
        "pack" to pack.pack, "version" to pack.version, "mirrors" to listOf("https://cdn.test/{file}"),
        "files" to pack.files.map { (path, bytes) -> mapOf("path" to path, "sha256" to sha(bytes), "size" to bytes.size) },
      )

  @Test
  fun `status, ensure with progress, then translations for the page on screen`() {
    val pair = mapOf("from" to "en", "to" to "ja")
    assertEquals(Answer.Value(JsonPrimitive("unavailable")), call("appHost.translatorStatus", pair))
    assertEquals(Answer.Value(null), call("appHost.models.ensure", ensureRequest))
    assertEquals("appHost.models.onProgress", posted.last().first)
    val total = pack.files.values.sumOf { it.size }
    assertEquals("{\"pack\":\"mt-en-ja\",\"received\":$total,\"total\":$total}", posted.last().second)
    assertEquals(Answer.Value(JsonPrimitive("ready")), call("appHost.translatorStatus", pair))
    assertEquals(Answer.Value(JsonPrimitive("ready")), call("appHost.prepareTranslator", pair))

    var answer: Answer? = null
    service.handle(ContextSpec.Content(1), "appHost.translate", jsonOf(pair + ("text" to "Hello") + ("start" to true))) { answer = it }
    engine.loadOk()
    engine.answer()
    assertEquals(Answer.Value(JsonPrimitive("[Hello]")), answer)
    // A page not on screen: null at once.
    assertEquals(Answer.Value(JsonNull), call("appHost.translate", pair + ("text" to "Hi") + ("start" to true), ContextSpec.Content(2)))
  }

  @Test
  fun `remove releases the engine and deletes the pack`() {
    call("appHost.models.ensure", ensureRequest)
    call("appHost.translate", mapOf("from" to "en", "to" to "ja", "text" to "Hello", "start" to true))
    assertTrue(host.isRunning)
    assertEquals(Answer.Value(null), call("appHost.models.remove", mapOf("pack" to "mt-en-ja")))
    assertFalse(host.isRunning)
    assertEquals(Answer.Value(JsonPrimitive("packs")), call("appHost.translatorStatus", mapOf("from" to "en", "to" to "ja")))
  }

  @Test
  fun `bad arguments fail with the call's name`() {
    assertEquals(Answer.Failure("appHost.translate needs from, to and text."), call("appHost.translate", mapOf("from" to "en")))
    assertEquals(Answer.Failure(ModelRequest.ERROR), call("appHost.models.ensure", mapOf("pack" to "mt-en-ja")))
    assertEquals(Answer.Failure("appHost.models.remove needs a pack."), call("appHost.models.remove", mapOf("pack" to "../x")))
  }

  @Test
  fun `a download that fails answers with the error`() {
    val failing = ModelStore(dir, { throw IOException("offline") }, { it.run() }, { it() })
    val service = TranslationService(host, failing, { true }) { _, _ -> }
    var answer: Answer? = null
    service.handle(ContextSpec.Host, "appHost.models.ensure", jsonOf(ensureRequest)) { answer = it }
    assertTrue((answer as Answer.Failure).message.startsWith("Could not download"))
  }
}
