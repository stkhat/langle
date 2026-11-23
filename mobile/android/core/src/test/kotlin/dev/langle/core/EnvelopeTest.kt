package dev.langle.core

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

/** The repository root (set by core/build.gradle.kts). */
val repoRoot = File(System.getProperty("langle.repo") ?: "../../..")

fun repoFile(path: String) = File(repoRoot, path).readText()

/** The golden envelopes in mobile/protocol/, shared with the TS tests and XCTest. */
class EnvelopeTest {
  private val golden = listOf("call", "hello", "reply-ok", "reply-error", "event", "event-reply")

  @Test
  fun `parses and produces every golden envelope`() {
    for (name in golden) {
      val text = repoFile("mobile/protocol/$name.json")
      assertEquals(parseJson(text), parseJson(Envelope.parse(text).json), name)
    }
  }

  @Test
  fun `reads the golden files' fields`() {
    assertEquals(
      Envelope.Call("c1", "storage.local.get", listOf(jsonOf(listOf("settings")))),
      Envelope.parse(repoFile("mobile/protocol/call.json")),
    )
    assertEquals(Envelope.Reply.error("c2", NO_RECEIVER), Envelope.parse(repoFile("mobile/protocol/reply-error.json")))
    val event = Envelope.parse(repoFile("mobile/protocol/event-reply.json")) as Envelope.Event
    assertEquals("runtime.onMessage", event.api)
    assertEquals("n7", event.replyId)
  }

  @Test
  fun `rejects bad version`() {
    val error = assertThrows<EnvelopeError> { Envelope.parse(repoFile("mobile/protocol/bad-version.json")) }
    assertEquals("unsupported version 2", error.message)
  }

  @Test
  fun `says why a text is not an envelope`() {
    val cases =
      listOf(
        "not json" to "not JSON",
        "[1]" to "not an object",
        """{"kind":"call"}""" to "unsupported version undefined",
        """{"v":1,"kind":"call","api":"tabs.get","args":[]}""" to "call without an id",
        """{"v":1,"kind":"call","id":"x","api":"identity.get","args":[]}""" to "unknown call api identity.get",
        """{"v":1,"kind":"call","id":"x","api":"tabs.get","args":{}}""" to "args is not an array",
        """{"v":1,"kind":"reply","ok":true}""" to "reply without an id",
        """{"v":1,"kind":"reply","id":"x","ok":false}""" to "reply without ok or an error message",
        """{"v":1,"kind":"event","api":"tabs.onUpdated","args":[]}""" to "unknown event api tabs.onUpdated",
        """{"v":1,"kind":"event","api":"alarms.onAlarm","args":[],"replyId":3}""" to "replyId is not a string",
        """{"v":1,"kind":"other"}""" to "unknown kind other",
      )
    for ((text, message) in cases) {
      assertEquals(message, assertThrows<EnvelopeError>(text) { Envelope.parse(text) }.message, text)
    }
  }

  @Test
  fun `leaves out an undefined reply value`() {
    assertEquals("""{"v":1,"kind":"reply","id":"c3","ok":true}""", Envelope.Reply.ok("c3", null).json)
  }

  @Test
  fun `whole numbers stay whole and others keep their digits`() {
    assertEquals("""{"t":1732400000000,"f":0.25}""", jsonObject("t" to 1_732_400_000_000.0, "f" to 0.25).toJsonText())
    assertEquals(jsonOf(listOf(true, 1, "1", null)), parseJson("""[true,1,"1",null]"""))
  }

  /** The API lists are the TS side's, read from protocol.ts. */
  @Test
  fun `knows the same apis as protocol ts`() {
    val source = repoFile("src/app/bridge/protocol.ts")
    fun list(name: String): List<String> {
      val start = source.indexOf("const $name = [") + "const $name = [".length
      val end = source.indexOf("] as const", start)
      return source.substring(start, end).lines().map { it.trim(' ', '"', ',') }.filter { it.isNotEmpty() }
    }
    assertEquals(list("CALL_APIS"), CALL_APIS.toList())
    assertEquals(list("EVENT_APIS"), EVENT_APIS.toList())
  }
}
