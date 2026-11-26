package dev.langle.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AdBlockingTest {
  @Test
  fun `the switches are on by default and read leniently`() {
    assertEquals(AdBlockingSwitches(true, emptyList()), AdBlockingSwitches.from(null))
    assertEquals(AdBlockingSwitches(true, emptyList()), AdBlockingSwitches.from(jsonOf("on")))
    assertEquals(
      AdBlockingSwitches(false, listOf("youtube.com")),
      AdBlockingSwitches.from(jsonOf(mapOf("on" to false, "offSites" to listOf("youtube.com", 3, "youtube.com")))),
    )
    assertEquals(jsonOf(mapOf("on" to true, "offSites" to listOf("a.com"))), AdBlockingSwitches(true, listOf("a.com")).value)
  }

  @Test
  fun `a site's switch adds or removes it, and on false blocks nothing`() {
    val on = AdBlockingSwitches()
    val off = on.withSite("youtube.com", blocking = false)
    assertEquals(listOf("youtube.com"), off.offSites)
    assertEquals(off, off.withSite("youtube.com", blocking = false))
    assertFalse(off.blocks("youtube.com"))
    assertTrue(off.blocks("example.com"))
    assertTrue(off.blocks(null))
    assertEquals(on, off.withSite("youtube.com", blocking = true))
    val allOff = AdBlockingSwitches(on = false)
    assertFalse(allOff.blocks("example.com"))
    assertFalse(allOff.blocks(null))
  }

  @Test
  fun `a change reloads only the pages of a site whose blocking turned`() {
    val on = AdBlockingSwitches()
    val off = on.withSite("youtube.com", blocking = false)
    assertTrue(AdBlockingSwitches.reloads(on, off, "youtube.com"))
    assertFalse(AdBlockingSwitches.reloads(on, off, "example.com"))
    assertTrue(AdBlockingSwitches.reloads(off, on, "youtube.com"))
    // Turning everything off reloads every page that was blocked; a site already off stays as it was.
    assertTrue(AdBlockingSwitches.reloads(off, off.copy(on = false), "example.com"))
    assertFalse(AdBlockingSwitches.reloads(off, off.copy(on = false), "youtube.com"))
  }

  @Test
  fun `setup is done once the user agreed and chose the languages`() {
    assertFalse(setupDone(null))
    assertFalse(setupDone(jsonOf(mapOf("consent" to 1))))
    assertFalse(setupDone(jsonOf(mapOf("languages" to true))))
    assertTrue(setupDone(jsonOf(mapOf("consent" to 1, "languages" to true))))
  }

  @Test
  fun `guesses the resource type from Sec-Fetch-Dest, Accept and the extension`() {
    val image = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    val frame = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    val table =
      listOf(
        Triple("https://a.test/x", mapOf("Sec-Fetch-Dest" to "script"), "script"),
        Triple("https://a.test/x.png", mapOf("sec-fetch-dest" to "iframe"), "sub_frame"),
        Triple("https://a.test/x", mapOf("Sec-Fetch-Dest" to "empty", "Accept" to "text/css,*/*;q=0.1"), "stylesheet"),
        Triple("https://a.test/pixel", mapOf("Accept" to image), "image"),
        Triple("https://ads.test/frame", mapOf("Accept" to frame), "sub_frame"),
        Triple("https://a.test/api", mapOf("accept" to "application/json, text/plain, */*"), "xmlhttprequest"),
        Triple("https://a.test/app.js?v=3", mapOf("Accept" to "*/*"), "script"),
        Triple("https://a.test/m/app.MJS#x", emptyMap(), "script"),
        Triple("https://a.test/site.css", mapOf("Accept" to "*/*"), "stylesheet"),
        Triple("https://a.test/f.woff2", mapOf("Accept" to "*/*"), "font"),
        Triple("https://v.test/seg-1.m4s", mapOf("Accept" to "*/*"), "media"),
        Triple("https://a.test/data.json", emptyMap(), "xmlhttprequest"),
        Triple("wss://a.test/socket", emptyMap(), "websocket"),
        Triple("https://a.test/collect", mapOf("Accept" to "*/*"), "other"),
        Triple("https://a.test/dir.v2/", emptyMap(), "other"),
      )
    for ((url, headers, type) in table) assertEquals(type, ResourceTypes.guess(url, headers), "$url $headers")
  }

  @Test
  fun `keeps the newest hosts' scripts, and clears them all`() {
    val removed = mutableListOf<String>()
    var blocking = true
    val hosts = CosmeticHosts(capacity = 2, register = { host, _ -> if (blocking) "scripts of $host" else null }, unregister = { removed += it })
    hosts.prepare("a.test", "https://a.test/")
    hosts.prepare("b.test", "https://b.test/")
    hosts.prepare("a.test", "https://a.test/")
    hosts.prepare("c.test", "https://c.test/")
    assertEquals(listOf("scripts of b.test"), removed)
    assertEquals(setOf("a.test", "c.test"), hosts.registered)
    // Blocking off (the switches, or no engine): everything goes, and nothing is registered again.
    blocking = false
    hosts.clear()
    hosts.prepare("a.test", "https://a.test/")
    assertEquals(emptySet<String>(), hosts.registered)
    assertEquals(listOf("scripts of b.test", "scripts of a.test", "scripts of c.test"), removed)
    blocking = true
    hosts.prepare("a.test", "https://a.test/")
    assertEquals(setOf("a.test"), hosts.registered)
  }
}
