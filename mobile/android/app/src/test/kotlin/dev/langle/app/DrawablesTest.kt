package dev.langle.app

import java.io.File
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** What the app's own icons must declare. */
class DrawablesTest {
  private val icons =
    File("src/main/res/drawable").listFiles { file -> file.extension == "xml" }.orEmpty().sortedBy { it.name }

  @Test
  fun `every icon mirrors in a right-to-left interface, as iOS's drawn icons do`() {
    // SwiftUI mirrors every shape the iOS shell draws (Icons.swift) under a right-to-left
    // layoutDirection, so the Words tab's list has its bullets at the right in Arabic. Android
    // mirrors a vector only when it says so (docs/specs/mobile-app.md "Native strings follow the
    // interface language").
    assertTrue(icons.isNotEmpty())
    val unmirrored = icons.filter { file -> !Regex("""<vector[^>]*android:autoMirrored="true"""").containsMatchIn(file.readText()) }
    assertEquals(emptyList<String>(), unmirrored.map { it.name })
  }
}
