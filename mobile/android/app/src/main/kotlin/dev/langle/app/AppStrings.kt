package dev.langle.app

import android.content.Context
import android.view.View
import dev.langle.core.FilePersistence
import dev.langle.core.NativeStrings
import java.io.File

/**
 * The shell's own strings in the interface language (docs/specs/mobile-app.md "Native strings
 * follow the interface language"): one [NativeStrings] for the process, kept in the app's store
 * beside the router's files, so every activity (the save dialog's too) draws the same.
 */
object AppStrings {
  @Volatile private var made: NativeStrings? = null

  fun of(context: Context): NativeStrings =
    made
      ?: synchronized(this) {
        made ?: NativeStrings(NativeStrings.ENGLISH, FilePersistence(File(context.applicationContext.filesDir, STORE))).also { made = it }
      }

  /** The router's store directory (MainActivity). */
  const val STORE = "LangleStore"
}

/** Lays the view out as the interface language does: Arabic mirrors the bars. */
internal fun View.followDirection(strings: NativeStrings) {
  layoutDirection = if (strings.rtl) View.LAYOUT_DIRECTION_RTL else View.LAYOUT_DIRECTION_LTR
}
