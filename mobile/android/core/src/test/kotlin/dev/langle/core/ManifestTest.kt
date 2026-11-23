package dev.langle.core

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows

class MatchPatternTest {
  private fun matches(pattern: String, url: String) = MatchPattern(pattern).matches(url)

  @Test
  fun `all urls is every web page but not the app origin's files`() {
    assertTrue(matches("<all_urls>", "https://example.com/article"))
    assertTrue(matches("<all_urls>", "http://10.0.2.2:4719/article-en.html"))
    assertTrue(matches("<all_urls>", "https://example.com"))
    assertFalse(matches("<all_urls>", "about:blank"))
    assertFalse(matches("<all_urls>", "data:text/html,x"))
    assertFalse(matches("<all_urls>", "chrome://version/"))
  }

  @Test
  fun `scheme star is http and https`() {
    assertTrue(matches("*://m.youtube.com/*", "https://m.youtube.com/watch?v=x"))
    assertTrue(matches("*://m.youtube.com/*", "http://m.youtube.com/"))
    assertFalse(matches("*://m.youtube.com/*", "https://www.youtube.com/watch?v=x"))
    assertFalse(matches("*://m.youtube.com/*", "ftp://m.youtube.com/"))
    assertTrue(matches("https://m.youtube.com/*", "https://M.YouTube.com/"))
    assertFalse(matches("https://m.youtube.com/*", "http://m.youtube.com/"))
  }

  @Test
  fun `host wildcard is the domain and its subdomains`() {
    assertTrue(matches("https://*.example.com/*", "https://example.com/"))
    assertTrue(matches("https://*.example.com/*", "https://a.b.example.com/x"))
    assertFalse(matches("https://*.example.com/*", "https://badexample.com/"))
    assertTrue(matches("https://*/*", "https://anything.test/"))
  }

  @Test
  fun `a host without a port matches any port`() {
    assertTrue(matches("http://localhost/*", "http://localhost:4719/a"))
    assertTrue(matches("http://localhost:4719/*", "http://localhost:4719/a"))
    assertFalse(matches("http://localhost:4719/*", "http://localhost:8080/a"))
    assertTrue(matches("https://example.com:443/*", "https://example.com/a"))
  }

  @Test
  fun `the path is a glob over path and query`() {
    assertTrue(matches("https://example.com/watch*", "https://example.com/watch?v=1"))
    assertTrue(matches("https://example.com/a/*/c", "https://example.com/a/b/x/c"))
    assertFalse(matches("https://example.com/a/*/c", "https://example.com/a/b/x/d"))
    assertFalse(matches("https://example.com/a", "https://example.com/a/b"))
    assertTrue(matches("https://example.com/*", "https://example.com"))
    assertTrue(matches("https://example.com/a", "https://example.com/a#part"))
  }

  @Test
  fun `refuses bad patterns`() {
    for (pattern in listOf("example.com", "chrome://x/*", "https://exa*mple.com/*", "https://example.com", "file://host/*")) {
      assertThrows<InvalidMatchPattern>(pattern) { MatchPattern(pattern) }
    }
  }

  @Test
  fun `gives a page's origin as the engines do`() {
    assertEquals("https://example.com", WebUrl.parse("https://Example.com:443/a?b#c")?.origin)
    assertEquals("http://10.0.2.2:4719", WebUrl.parse("http://10.0.2.2:4719/article-en.html")?.origin)
    assertEquals(null, WebUrl.parse("about:blank")?.origin)
  }
}

class ManifestTest {
  /** The shape of `.output/langle-app-mv3/manifest.json`. */
  private val built =
    """
    {"manifest_version":3,"name":"Langle","description":"d","version":"0.1.0","icons":{"16":"icon/16.png"},
     "permissions":["storage","alarms","identity"],"key":"MIIB","background":{"service_worker":"background.js"},
     "action":{"default_title":"Langle","default_popup":"popup.html"},
     "options_ui":{"open_in_tab":true,"page":"options.html"},
     "content_scripts":[{"matches":["<all_urls>"],"js":["content-scripts/content.js"]},
       {"matches":["*://m.youtube.com/*"],"js":["content-scripts/youtube-main.js"],"run_at":"document_start","world":"MAIN"}]}
    """
      .trimIndent()

  @Test
  fun `reads the build the app supports`() {
    val manifest = Manifest.read(built)
    assertEquals("0.1.0", manifest.version)
    assertEquals("background.js", manifest.background)
    assertEquals(
      listOf(listOf("content-scripts/content.js"), listOf("content-scripts/youtube-main.js")),
      manifest.contentScripts.map { it.js },
    )
    assertEquals(listOf(Manifest.RunAt.DOCUMENT_IDLE, Manifest.RunAt.DOCUMENT_START), manifest.contentScripts.map { it.runAt })
    assertEquals(listOf(Manifest.World.ISOLATED, Manifest.World.MAIN), manifest.contentScripts.map { it.world })
    assertEquals(listOf(listOf("content-scripts/content.js")), manifest.scripts("https://example.com/").map { it.js })
    assertEquals(2, manifest.scripts("https://m.youtube.com/watch?v=1").size)
    assertEquals(jsonOf("Langle"), manifest.value["name"])
  }

  @Test
  fun `refuses what it does not support, naming each`() {
    val cases =
      listOf(
        """"permissions":["storage","alarms","identity"]""" to """"permissions":["storage","tabs"]""",
        """"key":"MIIB"""" to """"host_permissions":["<all_urls>"]""",
        """"service_worker":"background.js"""" to """"service_worker":"background.js","type":"module"""",
        """"js":["content-scripts/content.js"]""" to """"js":["content-scripts/content.js"],"all_frames":true""",
        """"js":["content-scripts/content.js"]""" to """"js":["content-scripts/content.js"],"css":["a.css"]""",
        """"run_at":"document_start"""" to """"run_at":"document_later"""",
        """"world":"MAIN"""" to """"world":"USER_SCRIPT"""",
        """"manifest_version":3""" to """"manifest_version":2""",
      )
    val expected =
      listOf(
        "permission tabs",
        "host_permissions",
        "background.type",
        "content_scripts[0].all_frames",
        "content_scripts[0].css",
        "content_scripts[1].run_at document_later",
        "content_scripts[1].world USER_SCRIPT",
        "manifest_version 2",
      )
    for ((case, reason) in cases.zip(expected)) {
      val text = built.replace(case.first, case.second)
      assertNotEquals(built, text, case.first)
      assertEquals(listOf(reason), assertThrows<ManifestRefusal>(reason) { Manifest.read(text) }.unsupported)
    }
  }

  @Test
  fun `refuses a text that is not a manifest`() {
    assertEquals(listOf("a manifest that is not a JSON object"), assertThrows<ManifestRefusal> { Manifest.read("[]") }.unsupported)
  }

  /** The real build, when there is one (`npm run build:app`). */
  @Test
  fun `reads the langle-app build`() {
    val file = File(repoRoot, ".output/langle-app-mv3/manifest.json")
    assumeTrue(file.isFile, "no build: npm run build:app")
    val manifest = Manifest.read(file.readText())
    assertFalse(manifest.contentScripts.isEmpty())
    for (script in manifest.contentScripts) {
      for (js in script.js) assertTrue(File(repoRoot, ".output/langle-app-mv3/$js").isFile, js)
    }
  }
}
