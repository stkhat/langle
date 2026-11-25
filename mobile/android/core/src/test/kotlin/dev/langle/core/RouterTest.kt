package dev.langle.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

// Ports of src/app/testing/reference-native.test.ts, one for one: each nested class is a
// `describe`, each test the `test` of the same name, so the TS, Kotlin and Swift sides can be
// compared. A name with a dot (not allowed in a Kotlin method name) is in @DisplayName.

private const val ORIGIN = "https://app.langle.invalid"
private const val ARTICLE = "https://example.com/article"

private fun j(value: Any?) = jsonOf(value)

private fun hello(context: String) = mapOf("context" to context)

class RouterTest {
  @Nested
  @DisplayName("the host's start")
  inner class TheHostsStart {
    @Test
    fun `gets onInstalled with install on the first run`() {
      val h = Harness()
      val host = h.connect(ContextSpec.Host)
      val installed = host.record("runtime.onInstalled")
      host.call("bridge.hello", hello("host"))
      assertEquals(listOf(listOf(j(mapOf("reason" to "install")))), installed)
      assertEquals("1.0.0", h.router.installed)
      assertEquals(j(mapOf("version" to "1.0.0")), h.persistence.saved["installed"])
    }

    @Test
    fun `gets onInstalled with update when the build changed`() {
      val h = Harness(version = "1.0.0", installedVersion = "0.9.0")
      val host = h.connect(ContextSpec.Host)
      val installed = host.record("runtime.onInstalled")
      host.call("bridge.hello", hello("host"))
      assertEquals(listOf(listOf(j(mapOf("reason" to "update", "previousVersion" to "0.9.0")))), installed)
    }

    @Test
    fun `gets onStartup otherwise, and nothing when it is created again`() {
      val h = Harness(installedVersion = "1.0.0")
      val first = h.connect(ContextSpec.Host)
      val startup = first.record("runtime.onStartup")
      first.call("bridge.hello", hello("host"))
      first.disconnect()
      val second = h.connect(ContextSpec.Host)
      val again = second.record("runtime.onStartup")
      val installed = second.record("runtime.onInstalled")
      second.call("bridge.hello", hello("host"))
      assertEquals(listOf(emptyList<Any>()), startup)
      assertEquals(emptyList<Any>(), again)
      assertEquals(emptyList<Any>(), installed)
    }
  }

  @Nested
  @DisplayName("storage")
  inner class Storage {
    @Test
    fun `keeps three areas, with get, set, remove and clear`() {
      val h = Harness(local = mapOf("a" to 1))
      val page = h.connect(ContextSpec.Page("$ORIGIN/options.html"))
      page.call("storage.local.set", mapOf("b" to 2))
      page.call("storage.sync.set", mapOf("s" to true))
      page.call("storage.session.set", mapOf("tab" to 3))
      assertEquals(j(mapOf("a" to 1, "b" to 2)), page.call("storage.local.get", null).value)
      assertEquals(j(mapOf("b" to 2)), page.call("storage.local.get", listOf("b", "missing")).value)
      page.call("storage.local.remove", listOf("a"))
      page.call("storage.session.clear")
      assertEquals(j(mapOf("b" to 2)), page.call("storage.local.get", null).value)
      assertEquals(j(mapOf("s" to true)), page.call("storage.sync.get", null).value)
      assertEquals(j(emptyMap<String, Any>()), page.call("storage.session.get", null).value)
    }

    @Test
    fun `posts onChanged to every context before it replies to the writer`() {
      val h = Harness()
      val host = h.connect(ContextSpec.Host)
      val tabId = h.router.openTab(ARTICLE)
      val content = h.connect(ContextSpec.Content(tabId))
      val order = mutableListOf<String>()
      host.on("storage.onChanged") { args ->
        order += "host onChanged"
        assertEquals(listOf(j(mapOf("settings" to mapOf("newValue" to mapOf("on" to true)))), j("sync")), args)
        Handled.Value(null)
      }
      content.on("storage.onChanged") {
        order += "content onChanged"
        Handled.Value(null)
      }
      content.callThen("storage.sync.set", listOf(mapOf("settings" to mapOf("on" to true)))) {
        order += "writer resolved"
      }
      assertEquals(listOf("host onChanged", "content onChanged", "writer resolved"), order)
    }

    @Test
    fun `gives old and new values, and posts nothing when nothing changed`() {
      val h = Harness(local = mapOf("a" to 1, "b" to 2))
      val host = h.connect(ContextSpec.Host)
      val changed = host.record("storage.onChanged")
      host.call("storage.local.set", mapOf("a" to 1))
      host.call("storage.local.remove", listOf("missing"))
      host.call("storage.local.set", mapOf("a" to 5))
      host.call("storage.local.remove", listOf("b"))
      assertEquals(
        listOf(
          listOf(j(mapOf("a" to mapOf("oldValue" to 1, "newValue" to 5))), j("local")),
          listOf(j(mapOf("b" to mapOf("oldValue" to 2))), j("local")),
        ),
        changed,
      )
    }

    @Test
    fun `keeps local and sync for the next process, not session`() {
      val first = Harness()
      val host = first.connect(ContextSpec.Host)
      host.call("storage.local.set", mapOf("l" to 1))
      host.call("storage.sync.set", mapOf("s" to 1))
      host.call("storage.session.set", mapOf("x" to 1))
      val next = Harness(persistence = first.persistence)
      assertEquals(j(mapOf("l" to 1)), j(next.router.store.stored(KeyValueStore.Area.LOCAL)))
      assertEquals(j(mapOf("s" to 1)), j(next.router.store.stored(KeyValueStore.Area.SYNC)))
      assertEquals(j(emptyMap<String, Any>()), j(next.router.store.stored(KeyValueStore.Area.SESSION)))
    }
  }

  @Nested
  @DisplayName("messages")
  inner class Messages {
    @Test
    fun `a content script's message reaches the host with the sender native code knows`() {
      val h = Harness()
      val host = h.connect(ContextSpec.Host)
      val senders = mutableListOf<Any>()
      host.on("runtime.onMessage") { args ->
        senders += args[1]
        Handled.Value(j(mapOf("echo" to args[0])))
      }
      host.call("bridge.hello", hello("host"))
      val tabId = h.router.openTab(ARTICLE)
      val content = h.connect(ContextSpec.Content(tabId))
      // A second argument claiming another sender is not believed.
      val answer = content.call("runtime.sendMessage", mapOf("type" to "counts"), mapOf("tab" to mapOf("id" to 99)))
      assertEquals(j(mapOf("echo" to mapOf("type" to "counts"))), answer.value)
      assertEquals(
        listOf(
          j(
            mapOf(
              "id" to "langle-app",
              "url" to ARTICLE,
              "origin" to "https://example.com",
              "tab" to mapOf("id" to tabId, "url" to ARTICLE, "active" to true, "windowId" to 1, "incognito" to false),
              "frameId" to 0,
            )
          )
        ),
        senders,
      )
    }

    @Test
    fun `the host's error reaches the sender`() {
      val h = Harness()
      val host = h.connect(ContextSpec.Host)
      host.on("runtime.onMessage") { Handled.Error("bad request") }
      host.call("bridge.hello", hello("host"))
      val page = h.connect(ContextSpec.Page("$ORIGIN/popup.html"))
      assertEquals("bad request", page.call("runtime.sendMessage", emptyMap<String, Any>()).error)
    }

    @Test
    fun `a message waits for the host's hello`() {
      val h = Harness()
      val page = h.connect(ContextSpec.Page("$ORIGIN/popup.html"))
      val answer = page.call("runtime.sendMessage", mapOf("type" to "a"))
      assertFalse(answer.settled)
      val host = h.connect(ContextSpec.Host)
      host.on("runtime.onMessage") { Handled.Value(j("late but there")) }
      host.call("bridge.hello", hello("host"))
      assertEquals(j("late but there"), answer.value)
    }

    @Test
    fun `a message fails with Chrome's text when the host has not said hello in 10 s`() {
      val h = Harness()
      val page = h.connect(ContextSpec.Page("$ORIGIN/popup.html"))
      val answer = page.call("runtime.sendMessage", mapOf("type" to "a"))
      h.advance(9_999.0)
      assertFalse(answer.settled)
      h.advance(1.0)
      assertEquals(NO_RECEIVER, answer.error)
    }

    @Test
    fun `a message fails with Chrome's text when the host goes away before it answers`() {
      val h = Harness()
      val host = h.connect(ContextSpec.Host)
      host.on("runtime.onMessage") { Handled.Never }
      host.call("bridge.hello", hello("host"))
      val page = h.connect(ContextSpec.Page("$ORIGIN/popup.html"))
      val answer = page.call("runtime.sendMessage", emptyMap<String, Any>())
      assertFalse(answer.settled)
      host.disconnect()
      h.settle()
      assertEquals(NO_RECEIVER, answer.error)
    }

    @Test
    @DisplayName("tabs.sendMessage reaches the tab's top frame, or fails as Chrome does")
    fun `tabs_sendMessage reaches the tab's top frame, or fails as Chrome does`() {
      val h = Harness()
      val host = h.connect(ContextSpec.Host)
      val tabId = h.router.openTab(ARTICLE)
      val top = h.connect(ContextSpec.Content(tabId))
      val frame = h.connect(ContextSpec.Content(tabId, frameId = 4))
      top.on("runtime.onMessage") { args -> Handled.Value(j(mapOf("top" to args[1]))) }
      frame.on("runtime.onMessage") { Handled.Value(j("frame")) }
      assertEquals(NO_RECEIVER, host.call("tabs.sendMessage", tabId, mapOf("type" to "summary")).error)
      top.call("bridge.hello", hello("content"))
      frame.call("bridge.hello", hello("content"))
      assertEquals(
        j(mapOf("top" to mapOf("id" to "langle-app", "url" to "$ORIGIN/", "origin" to ORIGIN))),
        host.call("tabs.sendMessage", tabId, mapOf("type" to "summary")).value,
      )
      assertEquals(
        j("frame"),
        host.call("tabs.sendMessage", tabId, emptyMap<String, Any>(), mapOf("frameId" to 4)).value,
      )
      assertEquals(NO_RECEIVER, host.call("tabs.sendMessage", 99, emptyMap<String, Any>()).error)
    }
  }

  @Nested
  @DisplayName("tabs")
  inner class Tabs {
    @Test
    fun `query finds the active tab, create opens app pages, get and remove know them`() {
      val h = Harness()
      val host = h.connect(ContextSpec.Host)
      val article = h.router.openTab(ARTICLE)
      val active = host.call("tabs.query", mapOf("active" to true)).value.array!!
      assertEquals(listOf(article to ARTICLE), active.map { it.obj!!["id"].number!!.toInt() to it.obj!!["url"].string })
      val welcome = host.call("tabs.create", mapOf("url" to "$ORIGIN/welcome.html")).value.obj!!
      val welcomeId = welcome["id"].number!!.toInt()
      val nowActive = host.call("tabs.query", mapOf("active" to true)).value.array!!
      assertEquals(
        listOf(welcomeId to "$ORIGIN/welcome.html"),
        nowActive.map { it.obj!!["id"].number!!.toInt() to it.obj!!["url"].string },
      )
      host.call("tabs.update", article, mapOf("active" to true))
      assertEquals(false, host.call("tabs.get", welcomeId).value.obj!!["active"].bool)
      host.call("tabs.remove", welcomeId)
      assertEquals("No tab with id: $welcomeId.", host.call("tabs.get", welcomeId).error)
    }

    @Test
    @DisplayName("openOptionsPage opens Settings; openPopup, reload and tabs.reload are logged")
    fun `openOptionsPage opens Settings, openPopup, reload and tabs_reload are logged`() {
      val h = Harness()
      val host = h.connect(ContextSpec.Host)
      host.call("runtime.openOptionsPage")
      host.call("action.openPopup")
      host.call("runtime.reload")
      host.call("tabs.reload", 1)
      assertEquals(listOf(Tab(1, "$ORIGIN/options.html", active = true)), h.router.tabs.all)
      assertEquals(
        listOf(
          RouterAction.OpenTab(Tab(1, "$ORIGIN/options.html", active = true)),
          RouterAction.OpenPopup,
          RouterAction.ReloadHost,
          RouterAction.ReloadTab(1),
        ),
        h.actions,
      )
    }

    // The shell opens the page over Home in its one browsing page (Shell.kt), so the router
    // opens no tab of its own; only http(s) addresses are opened.
    @Test
    @DisplayName("appHost.openPage opens the web page in a tab and is logged")
    fun `appHost_openPage opens the web page in a tab and is logged`() {
      val h = Harness()
      val home = h.connect(ContextSpec.Page("$ORIGIN/home.html"))
      assertNull(home.call("appHost.openPage", ARTICLE).error)
      assertEquals(
        "appHost.openPage needs an http(s) address.",
        home.call("appHost.openPage", "javascript:alert(1)").error,
      )
      assertEquals(listOf<RouterAction>(RouterAction.OpenPage(ARTICLE)), h.actions)
    }
  }

  @Nested
  @DisplayName("alarms")
  inner class Alarms {
    @Test
    fun `fire on the host at their time, again when periodic, and can be cleared`() {
      val h = Harness()
      val host = h.connect(ContextSpec.Host)
      val fired = host.record("alarms.onAlarm")
      host.call("bridge.hello", hello("host"))
      host.call("alarms.create", "once", mapOf("delayInMinutes" to 1))
      host.call("alarms.create", "often", mapOf("periodInMinutes" to 2))
      assertEquals(j(mapOf("name" to "once", "scheduledTime" to 60_000)), host.call("alarms.get", "once").value)
      h.advance(4 * 60_000.0)
      assertEquals(
        listOf(
          listOf(j(mapOf("name" to "once", "scheduledTime" to 60_000))),
          listOf(j(mapOf("name" to "often", "scheduledTime" to 120_000, "periodInMinutes" to 2))),
          listOf(j(mapOf("name" to "often", "scheduledTime" to 240_000, "periodInMinutes" to 2))),
        ),
        fired,
      )
      val gone = host.call("alarms.get", "once")
      assertTrue(gone.settled)
      assertNull(gone.value)
      assertEquals(j(true), host.call("alarms.clear", "often").value)
      assertEquals(j(false), host.call("alarms.clear", "often").value)
      h.advance(10 * 60_000.0)
      assertEquals(3, fired.size)
    }
  }

  @Nested
  @DisplayName("bad envelopes")
  inner class BadEnvelopes {
    @Test
    fun `are answered with an error and logged`() {
      val h = Harness()
      val host = h.connect(ContextSpec.Host)
      host.post("""{"v":1,"kind":"call","id":"x1","api":"identity.get","args":[]}""")
      host.post("not json")
      assertEquals(
        listOf(
          j(
            mapOf(
              "v" to 1,
              "kind" to "reply",
              "id" to "x1",
              "ok" to false,
              "error" to mapOf("message" to "unknown call api identity.get"),
            )
          )
        ),
        host.received,
      )
      assertEquals(2, h.errors.size)
    }
  }

  // Not in the reference: the app's side of "Losing the renderer" (docs/specs/mobile-app.md).
  @Nested
  @DisplayName("recreating the host")
  inner class RecreatingTheHost {
    @Test
    fun `a message sent while the host is gone reaches the host created again`() {
      val h = Harness()
      val lost = h.connect(ContextSpec.Host)
      lost.call("bridge.hello", hello("host"))
      lost.disconnect()
      assertFalse(h.router.isHostReady)
      val page = h.connect(ContextSpec.Page("$ORIGIN/popup.html"))
      val answer = page.call("runtime.sendMessage", mapOf("type" to "a"))
      assertFalse(answer.settled)
      val again = h.connect(ContextSpec.Host)
      again.on("runtime.onMessage") { Handled.Value(j("from the new host")) }
      again.call("bridge.hello", hello("host"))
      assertEquals(j("from the new host"), answer.value)
    }

    @Test
    fun `storage and tabs outlive the host`() {
      val h = Harness()
      val lost = h.connect(ContextSpec.Host)
      lost.call("storage.local.set", mapOf("terms" to 3))
      val tabId = h.router.openTab(ARTICLE)
      lost.disconnect()
      val again = h.connect(ContextSpec.Host)
      assertEquals(j(mapOf("terms" to 3)), again.call("storage.local.get", null).value)
      assertEquals(ARTICLE, again.call("tabs.get", tabId).value.obj!!["url"].string)
    }
  }
}
