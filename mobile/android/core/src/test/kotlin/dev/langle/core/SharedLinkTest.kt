package dev.langle.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The shared cases in mobile/protocol/shared-links.json, the same for XCTest. */
class SharedLinkTest {
  @Test
  fun `resolves every shared case`() {
    val cases = parseJson(repoFile("mobile/protocol/shared-links.json")).obj!!["cases"].array!!
    assertTrue(cases.size > 40)
    for (case in cases) {
      val o = case.obj!!
      assertEquals(o["address"].string, SharedLink.resolve(o["url"].string, o["text"].string), o["name"].string)
    }
  }
}
