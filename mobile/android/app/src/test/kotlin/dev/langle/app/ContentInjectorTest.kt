package dev.langle.app

import dev.langle.core.Manifest
import java.io.File
import java.util.concurrent.TimeUnit
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir

/**
 * The injected scripts run in Node with a stand-in for the page (`window`, `top`, `location`,
 * `document` with DOMContentLoaded), one context per world, as a WebView would run them on every
 * document of a page. Skipped without Node.
 */
class ContentInjectorTest {
  @TempDir lateinit var temp: File

  private val manifest =
    Manifest.read(
      """
      {"manifest_version":3,"name":"Langle","version":"0.1.0","permissions":["storage"],
       "background":{"service_worker":"background.js"},
       "content_scripts":[{"matches":["<all_urls>"],"js":["content.js"]},
         {"matches":["*://m.youtube.com/*"],"js":["main.js"],"run_at":"document_start","world":"MAIN"},
         {"matches":["*://m.youtube.com/*"],"js":["youtube.js"],"run_at":"document_end"}]}
      """
        .trimIndent(),
    )

  private val files =
    mapOf(
      "/langle-shim.js" to
        """trace.push("shim " + window.__langleAppInfo.context);
          |document.addEventListener("DOMContentLoaded", () => trace.push("hello"));"""
          .trimMargin(),
      "/content.js" to """var shared = "content"; trace.push("content");""",
      "/main.js" to """trace.push("main " + typeof window.__langleAppInfo);""",
      "/youtube.js" to """trace.push("youtube"); throw new Error("youtube broke");""",
    )

  private val injector = ContentInjector(manifest) { files[it]?.toByteArray() }

  private fun node(): String? =
    listOf("/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node").firstOrNull { File(it).canExecute() }
      ?: System.getenv("PATH")?.split(File.pathSeparator)?.map { File(it, "node") }?.firstOrNull { it.canExecute() }?.path

  /** What the scripts of [world] record on a document at [url]. */
  private fun run(world: ScriptWorld, url: String, top: Boolean = true, scripts: List<UserScript> = injector.webPageScripts()): List<String> {
    val node = node()
    assumeTrue(node != null, "no node")
    val list = scripts.filter { it.world == world }
    val paths = list.mapIndexed { i, script -> File(temp, "$i.js").also { it.writeText(script.source) }.path }
    val harness = File(temp, "harness.cjs")
    harness.writeText(HARNESS)
    val process = ProcessBuilder(listOf(node, harness.path, url, if (top) "top" else "frame") + paths).redirectErrorStream(true).start()
    val output = process.inputStream.bufferedReader().readText()
    process.waitFor(30, TimeUnit.SECONDS)
    assertEquals(0, process.exitValue(), output)
    return output.trim().lines().filter { it.isNotEmpty() }
  }

  @Test
  fun `web pages get the shim then the content scripts, which run before the hello`() {
    assertEquals(listOf("shim content", "content", "hello"), run(ScriptWorld.LANGLE, "https://example.com/article"))
    assertEquals(emptyList<String>(), run(ScriptWorld.PAGE, "https://example.com/article"))
  }

  @Test
  fun `each script runs only where its patterns match, in its world, document_end before idle`() {
    assertEquals(
      listOf("shim content", "youtube", "reported youtube broke", "content", "hello"),
      run(ScriptWorld.LANGLE, "https://m.youtube.com/watch?v=1"),
    )
    assertEquals(listOf("main undefined"), run(ScriptWorld.PAGE, "https://m.youtube.com/watch?v=1"))
  }

  @Test
  fun `nothing runs in frames or on pages no pattern matches`() {
    assertEquals(emptyList<String>(), run(ScriptWorld.LANGLE, "https://example.com/", top = false))
    assertEquals(emptyList<String>(), run(ScriptWorld.LANGLE, "about:blank"))
    assertEquals(emptyList<String>(), run(ScriptWorld.PAGE, "https://www.youtube.com/watch?v=1"))
  }

  @Test
  fun `app pages get the app info and the shim in the page's world`() {
    assertEquals(listOf("shim page", "hello"), run(ScriptWorld.PAGE, "$APP_ORIGIN/popup.html", scripts = injector.appPageScripts()))
  }

  @Test
  fun `the host page loads the app info, the shim and the background`() {
    val page = injector.hostPage()
    val scripts = Regex("<script[^>]*>").findAll(page).map { it.value }.toList()
    assertEquals(listOf("<script>", """<script src="/langle-shim.js">""", """<script src="/background.js">"""), scripts)
    assertEquals(true, page.contains(""""context":"host""""))
  }

  @Test
  fun `every context hears that the app translates with model packs`() {
    for (context in listOf("content", "page", "host")) {
      assertEquals(true, injector.appInfo(context).contains(""""translator":{"models":"packs"}"""))
    }
  }

  /** The bundled build's scripts are valid JavaScript once wrapped (scripts/bundle-build.sh). */
  @Test
  fun `wraps the bundled build's scripts into valid JavaScript`() {
    val build = File("src/main/assets/langle-app")
    assumeTrue(File(build, "manifest.json").isFile, "no bundled build")
    val node = node()
    assumeTrue(node != null, "no node")
    val real = ContentInjector(Manifest.read(File(build, "manifest.json").readText())) { File(build, it.trimStart('/')).takeIf(File::isFile)?.readBytes() }
    val scripts = real.webPageScripts() + real.appPageScripts()
    assertEquals(true, scripts.size >= 3, "$scripts")
    for ((i, script) in scripts.withIndex()) {
      val file = File(temp, "real-$i.js").also { it.writeText(script.source) }
      val process = ProcessBuilder(node, "--check", file.path).redirectErrorStream(true).start()
      val output = process.inputStream.bufferedReader().readText()
      process.waitFor(30, TimeUnit.SECONDS)
      assertEquals(0, process.exitValue(), "script $i: $output")
    }
  }

  companion object {
    /** argv: url, "top" | "frame", script files in injection order. */
    private val HARNESS =
      """
      const vm = require("node:vm");
      const fs = require("node:fs");
      const [url, where, ...files] = process.argv.slice(2);
      const trace = [];
      const listeners = [];
      const world = {
        trace,
        location: { href: url },
        document: { readyState: "loading", addEventListener: (type, run) => type === "DOMContentLoaded" && listeners.push(run) },
        reportError: (error) => trace.push("reported " + error.message),
      };
      world.window = world;
      world.globalThis = world;
      world.top = where === "top" ? world : {};
      const context = vm.createContext(world);
      for (const file of files) vm.runInContext(fs.readFileSync(file, "utf8"), context);
      for (const run of listeners) run();
      for (const line of trace) console.log(line);
      """
        .trimIndent()
  }
}
