package dev.langle.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** An engine the tests answer by hand. */
class FakeEngine : TranslationEngine {
  val loads = mutableListOf<Pair<String, (Boolean) -> Unit>>()
  val sentences = mutableListOf<Pair<String, (String?) -> Unit>>()
  var stops = 0
  var running = false
  override var onFailure: (() -> Unit)? = null

  override fun load(from: String, to: String, packs: List<String>, done: (ok: Boolean) -> Unit) {
    running = true
    loads += "$from>$to ${packs.joinToString("+")}" to done
  }

  override fun translate(from: String, to: String, text: String, done: (String?) -> Unit) {
    sentences += text to done
  }

  override fun stop() {
    running = false
    stops++
  }

  fun loadOk() = loads.last().second(true)

  fun answer(text: String? = null) {
    val (source, done) = sentences.last()
    done(text ?: "[$source]")
  }
}

class TranslationHostTest {
  private val clock = ManualClock()
  private val engine = FakeEngine()
  private var packs: (String, String) -> List<String>? = { from, to -> if (from == "en" && to == "ja") listOf("mt-en-ja") else null }
  private val host = TranslationHost(engine, clock, { from, to -> packs(from, to) })

  private class Answers {
    val got = mutableListOf<String?>()
    var count = 0

    fun add(text: String?) {
      got += text
      count++
    }
  }

  private fun ask(text: String, start: Boolean = true, onScreen: Boolean = true, answers: Answers = Answers()): Answers {
    host.translate("en", "ja", text, start, onScreen, answers::add)
    return answers
  }

  private fun advance(ms: Double) = clock.advance(ms) {}

  /** The engine running with en>ja loaded, one sentence translated. */
  private fun warm() {
    val first = ask("Hello")
    engine.loadOk()
    engine.answer()
    assertEquals(listOf("[Hello]"), first.got)
  }

  @Test
  fun `starts the engine, loads the pair and translates one sentence at a time`() {
    val a = ask("one")
    val b = ask("two")
    assertEquals(listOf("en>ja mt-en-ja"), engine.loads.map { it.first })
    assertTrue(engine.sentences.isEmpty())
    engine.loadOk()
    assertEquals(listOf("one"), engine.sentences.map { it.first })
    engine.answer()
    assertEquals(listOf("one", "two"), engine.sentences.map { it.first })
    engine.answer()
    assertEquals(listOf("[one]"), a.got)
    assertEquals(listOf("[two]"), b.got)
    assertTrue(host.isRunning)
    // The pair stays loaded.
    ask("three")
    assertEquals(1, engine.loads.size)
  }

  @Test
  fun `a page not on screen gets null at once and starts nothing`() {
    val a = ask("one", onScreen = false)
    assertEquals(listOf<String?>(null), a.got)
    assertTrue(engine.loads.isEmpty())
    assertFalse(host.isRunning)
  }

  @Test
  fun `a pair without ready model packs gets null at once`() {
    val answers = Answers()
    host.translate("en", "ko", "one", true, true, answers::add)
    assertEquals(listOf<String?>(null), answers.got)
    assertTrue(engine.loads.isEmpty())
  }

  @Test
  fun `start false never starts the engine`() {
    val a = ask("row", start = false)
    assertEquals(listOf<String?>(null), a.got)
    assertTrue(engine.loads.isEmpty())
    assertFalse(host.isRunning)
  }

  @Test
  fun `start false is translated while the engine runs, and does not keep it alive`() {
    warm()
    advance(50_000.0)
    val row = ask("row", start = false)
    engine.answer()
    assertEquals(listOf("[row]"), row.got)
    // 60 s after the last start request, not after the list's.
    advance(10_000.0)
    assertFalse(host.isRunning)
    assertEquals(1, engine.stops)
  }

  @Test
  fun `releases the engine 60 seconds after the last translation`() {
    warm()
    advance(59_000.0)
    assertTrue(host.isRunning)
    ask("again")
    engine.answer()
    advance(59_000.0)
    assertTrue(host.isRunning)
    advance(1_000.0)
    assertFalse(host.isRunning)
    assertEquals(1, engine.stops)
    // The next sentence starts it again.
    ask("later")
    assertEquals(2, engine.loads.size)
  }

  @Test
  fun `leaving the screen releases the engine at once, and waiting requests get null`() {
    warm()
    val waiting = ask("one")
    val queued = ask("two")
    host.uiHidden()
    assertFalse(host.isRunning)
    assertEquals(1, engine.stops)
    assertEquals(listOf<String?>(null), waiting.got)
    assertEquals(listOf<String?>(null), queued.got)
    // A late answer from the released engine is dropped.
    engine.answer("late")
    assertEquals(1, waiting.count)
    // Released already: nothing more to do.
    host.uiHidden()
    assertEquals(1, engine.stops)
  }

  @Test
  fun `loading gives up after 30 seconds`() {
    val a = ask("one")
    advance(29_999.0)
    assertTrue(a.got.isEmpty())
    advance(1.0)
    assertEquals(listOf<String?>(null), a.got)
    assertFalse(host.isRunning)
    assertEquals(1, engine.stops)
    // A late load is ignored.
    engine.loads.last().second(true)
    assertTrue(engine.sentences.isEmpty())
  }

  @Test
  fun `a sentence gives up after 10 seconds, and the next one is sent`() {
    warm()
    val slow = ask("slow")
    val next = ask("next")
    advance(10_000.0)
    assertEquals(listOf<String?>(null), slow.got)
    assertEquals("next", engine.sentences.last().first)
    engine.answer()
    assertEquals(listOf("[next]"), next.got)
    // The engine keeps running.
    assertTrue(host.isRunning)
    assertEquals(0, engine.stops)
  }

  @Test
  fun `a failure answers the waiting requests with null, and the next request restarts the engine once`() {
    warm()
    val waiting = ask("one")
    engine.onFailure!!()
    assertEquals(listOf<String?>(null), waiting.got)
    assertFalse(host.isRunning)
    assertEquals(1, engine.stops)
    ask("two")
    assertEquals(2, engine.loads.size)
    engine.loadOk()
    engine.answer()
    // It translated again: a later failure restarts it again.
    engine.onFailure!!()
    assertFalse(host.isOff)
    ask("three")
    assertEquals(3, engine.loads.size)
  }

  @Test
  fun `when the restarted engine fails too, translation is off until a page is opened`() {
    ask("one")
    engine.loads.last().second(false)
    assertFalse(host.isOff)
    val second = ask("two")
    assertEquals(2, engine.loads.size)
    engine.onFailure!!()
    assertTrue(host.isOff)
    assertEquals(listOf<String?>(null), second.got)
    val off = ask("three")
    assertEquals(listOf<String?>(null), off.got)
    assertEquals(2, engine.loads.size)
    host.pageOpened()
    assertFalse(host.isOff)
    ask("four")
    assertEquals(3, engine.loads.size)
  }

  @Test
  fun `a load timeout counts as a failure`() {
    ask("one")
    advance(30_000.0)
    ask("two")
    advance(30_000.0)
    assertTrue(host.isOff)
  }

  @Test
  fun `a failure while stopped is ignored`() {
    engine.onFailure!!()
    assertFalse(host.isOff)
    ask("one")
    assertEquals(1, engine.loads.size)
  }

  @Test
  fun `a list request waiting when the engine let go of its pair gets null`() {
    warm()
    val playing = ask("card")
    val row = ask("row", start = false)
    host.packRemoved("mt-en-ja")
    assertEquals(listOf<String?>(null), playing.got)
    assertEquals(listOf<String?>(null), row.got)
    assertTrue(engine.loads.size == 1)
  }

  @Test
  fun `blank text gets null without the engine`() {
    assertEquals(listOf<String?>(null), ask("  ").got)
    assertTrue(engine.loads.isEmpty())
  }

  @Test
  fun `a new pair is loaded into the running engine`() {
    packs = { _, _ -> listOf("mt-de-en", "mt-en-ja") }
    warm()
    val answers = Answers()
    host.translate("de", "ja", "Hallo", true, true, answers::add)
    assertEquals("de>ja mt-de-en+mt-en-ja", engine.loads.last().first)
    engine.loadOk()
    engine.answer()
    assertEquals(listOf("[Hallo]"), answers.got)
    assertEquals(setOf("en>ja", "de>ja"), host.loadedPairs)
  }
}
