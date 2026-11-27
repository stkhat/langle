package dev.langle.app

import java.io.File
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** What the app's manifest must declare for the shell to work as the spec says. */
class AppManifestTest {
  private val manifest = File("src/main/AndroidManifest.xml").readText()

  @Test
  fun `declares RTL support so Arabic mirrors the bars`() {
    // Without it every view resolves to LTR, whatever layoutDirection the bars set
    // (docs/specs/mobile-app.md "Native strings follow the interface language").
    assertTrue(Regex("""<application[^>]*android:supportsRtl="true"""").containsMatchIn(manifest))
  }
}
