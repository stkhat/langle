package dev.langle.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class FilesTest {
  private val table = mapOf("json" to "application/json", "csv" to "text/comma-separated-values", "png" to "image/png")

  @Test
  fun `the picker asks for the accept attribute's types, extensions through the system's table`() {
    // WebView splits Backup's accept="application/json,.json" at its commas.
    val backup = listOf("application/json", UNKNOWN_TYPE, "text/plain")
    assertEquals(backup, pickerTypes(listOf("application/json", ".json"), table::get))
    assertEquals(backup, pickerTypes(listOf("application/json,.JSON"), table::get))
    assertEquals(backup, pickerTypes(listOf(".json"), table::get))
    assertEquals(listOf("text/*", "text/comma-separated-values", UNKNOWN_TYPE), pickerTypes(listOf("text/*", ".csv"), table::get))
  }

  @Test
  fun `the picker also takes files that arrived without a precise type, as text too for a text format`() {
    // A mail or chat app saves a file it does not know as application/octet-stream (or text/plain).
    assertEquals(listOf("image/png", UNKNOWN_TYPE), pickerTypes(listOf(".png"), table::get))
    assertEquals(listOf("image/*", UNKNOWN_TYPE), pickerTypes(listOf("image/*"), table::get))
    assertEquals(listOf("application/ld+json", UNKNOWN_TYPE, "text/plain"), pickerTypes(listOf("application/ld+json"), table::get))
    assertEquals(listOf("application/xml", UNKNOWN_TYPE, "text/plain"), pickerTypes(listOf("application/xml"), table::get))
    assertEquals(listOf(UNKNOWN_TYPE), pickerTypes(listOf("application/octet-stream"), table::get))
  }

  @Test
  fun `the picker shows every file when accept is missing, empty, takes any file or names what the table lacks`() {
    assertEquals(listOf(ANY_TYPE), pickerTypes(emptyList(), table::get))
    assertEquals(listOf(ANY_TYPE), pickerTypes(listOf(""), table::get))
    assertEquals(listOf(ANY_TYPE), pickerTypes(listOf("application/json", "*/*"), table::get))
    assertEquals(listOf(ANY_TYPE), pickerTypes(listOf("application/json", ".langle"), table::get))
    assertEquals(listOf(ANY_TYPE), pickerTypes(listOf("audio"), table::get))
  }

  @Test
  fun `a shared file's media type is named without its parameters, in lower case`() {
    assertEquals("text/csv", bareMediaType("text/csv;charset=utf-8"))
    assertEquals("application/json", bareMediaType(" Application/JSON ; charset=UTF-8"))
    assertEquals("text/plain", bareMediaType("text/plain"))
    assertNull(bareMediaType("text"))
    assertNull(bareMediaType("text/"))
    assertNull(bareMediaType("a/b/c"))
    assertNull(bareMediaType("text/pl ain"))
  }
}
