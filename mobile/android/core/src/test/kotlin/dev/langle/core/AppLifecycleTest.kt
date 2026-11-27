package dev.langle.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class AppLifecycleTest {
  private val h = Harness()
  private val holds = mutableListOf<Boolean>()
  private val lifecycle = AppLifecycle(h.router, { holds += it })
  private val host = h.connect(ContextSpec.Host)

  private fun events() = host.received.mapNotNull { it.obj?.get("api").string }.filter { it.startsWith("app.") }

  private fun startHost() {
    host.call("bridge.hello", mapOf("context" to "host"))
  }

  @Test
  fun `app hidden holds the host until it answers`() {
    startHost()
    host.on("app.hidden") { Handled.Never }
    lifecycle.hidden()
    h.settle()
    assertEquals(listOf("app.hidden"), events())
    assertEquals(listOf(true), holds)
    val replyId = host.received.last().obj?.get("replyId").string!!
    host.connection.receive(Envelope.Reply.ok(replyId, null).json)
    h.settle()
    assertEquals(listOf(true, false), holds)
  }

  @Test
  fun `app hidden lets go after 20 s without an answer`() {
    startHost()
    host.on("app.hidden") { Handled.Never }
    lifecycle.hidden()
    h.advance(19_999.0)
    assertEquals(listOf(true), holds)
    h.advance(1.0)
    assertEquals(listOf(true, false), holds)
  }

  @Test
  fun `app visible comes only after app hidden, once each`() {
    startHost()
    host.on("app.hidden") { Handled.Value(null) }
    lifecycle.visible()
    lifecycle.hidden()
    lifecycle.hidden()
    lifecycle.visible()
    lifecycle.visible()
    h.settle()
    assertEquals(listOf("app.hidden", "app.visible"), events())
    assertEquals(listOf(true, false), holds)
  }

  @Test
  fun `nothing is sent or held before the host said hello`() {
    lifecycle.hidden()
    lifecycle.visible()
    h.advance(30_000.0)
    assertEquals(emptyList<String>(), events())
    assertEquals(emptyList<Boolean>(), holds)
  }

  @Test
  fun `an earlier answer does not end a later hold`() {
    startHost()
    host.on("app.hidden") { Handled.Never }
    lifecycle.hidden()
    lifecycle.visible()
    lifecycle.hidden()
    h.settle()
    val replyIds = host.received.filter { it.obj?.get("api").string == "app.hidden" }.map { it.obj?.get("replyId").string!! }
    assertEquals(2, replyIds.size)
    host.connection.receive(Envelope.Reply.ok(replyIds[0], null).json)
    h.settle()
    assertEquals(listOf(true), holds)
    host.connection.receive(Envelope.Reply.ok(replyIds[1], null).json)
    h.settle()
    assertEquals(listOf(true, false), holds)
  }
}
