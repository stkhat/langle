package dev.langle.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class FilesTest {
  private val table = mapOf("json" to "application/json", "csv" to "text/comma-separated-values")

  @Test
  fun `the picker asks for the accept attribute's types, extensions through the system's table`() {
    // WebView splits Backup's accept="application/json,.json" at its commas.
    assertEquals(listOf("application/json"), pickerTypes(listOf("application/json", ".json"), table::get))
    assertEquals(listOf("application/json"), pickerTypes(listOf("application/json,.JSON"), table::get))
    assertEquals(listOf("text/*", "text/comma-separated-values"), pickerTypes(listOf("text/*", ".csv"), table::get))
  }

  @Test
  fun `the picker shows every file when accept is missing, empty or names what the table lacks`() {
    assertEquals(listOf(ANY_TYPE), pickerTypes(emptyList(), table::get))
    assertEquals(listOf(ANY_TYPE), pickerTypes(listOf(""), table::get))
    assertEquals(listOf(ANY_TYPE), pickerTypes(listOf("application/json", ".langle"), table::get))
    assertEquals(listOf(ANY_TYPE), pickerTypes(listOf("audio"), table::get))
  }
}
