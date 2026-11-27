package dev.langle.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The shell's own strings (docs/specs/mobile-app.md "Native strings follow the interface language"). */
class NativeStringsTest {
  private val arabic = NativeStringSet("ar", true, mapOf("app.home" to "الرئيسية", "app.blockAdsSiteLabel" to "حظر الإعلانات على هذا الموقع، {site}"))

  @Test
  fun `reads the golden call's set`() {
    val call = Envelope.parse(repoFile("mobile/protocol/native-strings.json")) as Envelope.Call
    val set = NativeStringSet.from(call.args.first())!!
    assertEquals("ar", set.locale)
    assertTrue(set.rtl)
    assertEquals("المزيد", set.strings["app.more"])
    assertEquals(call.args.first(), set.json)
  }

  @Test
  fun `the built-in English is en json's app keys, generated at build time`() {
    val english = NativeStrings.englishOf(repoFile("src/i18n/locales/en.json"))
    assertEquals(english, NativeStrings.ENGLISH)
    assertEquals("Home", NativeStrings.ENGLISH["app.home"])
    assertTrue(NativeStrings.ENGLISH.keys.all { it.startsWith("app.") })
    assertNull(NativeStrings.ENGLISH["nav.settings"])
  }

  @Test
  fun `draws English before any set, then the set, English where it lacks a key`() {
    val strings = NativeStrings(NativeStrings.ENGLISH, MemoryPersistence())
    assertEquals("en", strings.locale)
    assertFalse(strings.rtl)
    assertEquals("Home", strings["app.home"])
    strings.take(arabic)
    assertEquals("ar", strings.locale)
    assertTrue(strings.rtl)
    assertEquals("الرئيسية", strings["app.home"])
    assertEquals("More", strings["app.more"])
    assertEquals("app.unknown", strings["app.unknown"])
  }

  @Test
  fun `fills placeholders and leaves unknown ones`() {
    val strings = NativeStrings(NativeStrings.ENGLISH, MemoryPersistence())
    assertEquals("Block ads on this site, example.com", strings.format("app.blockAdsSiteLabel", mapOf("site" to "example.com")))
    assertEquals("Langle cannot run: {reasons}", strings.format("app.buildRefused", emptyMap()))
    strings.take(arabic)
    assertEquals("حظر الإعلانات على هذا الموقع، example.com", strings.format("app.blockAdsSiteLabel", mapOf("site" to "example.com")))
  }

  @Test
  fun `keeps the set, so a cold start draws it`() {
    val persistence = MemoryPersistence()
    NativeStrings(NativeStrings.ENGLISH, persistence).take(arabic)
    val again = NativeStrings(NativeStrings.ENGLISH, persistence)
    assertEquals("ar", again.locale)
    assertEquals("الرئيسية", again["app.home"])
  }

  @Test
  fun `a kept file it cannot read is English`() {
    val strings = NativeStrings(NativeStrings.ENGLISH, MemoryPersistence(mapOf(NativeStrings.NAME to jsonOf(listOf(1)))))
    assertEquals("en", strings.locale)
    assertEquals("Home", strings["app.home"])
  }

  @Test
  fun `tells the listeners of a new set, once, until unlistened`() {
    val strings = NativeStrings(NativeStrings.ENGLISH, MemoryPersistence())
    var heard = 0
    val unlisten = strings.listen { heard++ }
    strings.take(arabic)
    strings.take(arabic.copy())
    assertEquals(1, heard)
    unlisten()
    strings.take(NativeStringSet("ja", false, mapOf("app.home" to "ホーム")))
    assertEquals(1, heard)
    assertEquals("ホーム", strings["app.home"])
  }
}
