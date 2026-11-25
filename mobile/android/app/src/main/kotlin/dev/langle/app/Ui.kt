package dev.langle.app

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.LayerDrawable
import android.util.TypedValue
import kotlin.math.roundToInt

/** The shell's colors, the mock's (`MobileStart`, `MobileLangleSheet`). */
internal object Palette {
  const val INK = 0xFF14182B.toInt()
  const val MUTED = 0xFF5A6075.toInt()
  const val LINE = 0xFFE3E5EA.toInt()
  const val FIELD_LINE = 0xFFD5D8E0.toInt()
  const val GRABBER = 0xFFD5D8E0.toInt()
  const val GREEN = 0xFF0B7F65.toInt()
  const val SURFACE = 0xFFF6F7F9.toInt()
  const val WHITE = 0xFFFFFFFF.toInt()
  /** The scrim over the page behind the sheet: ink at 32 %. */
  const val SCRIM_ALPHA = 0.32f
}

internal fun Context.dp(value: Number): Int = (value.toFloat() * resources.displayMetrics.density).roundToInt()

/** The theme's touch feedback: bounded, or a circle for icon buttons. */
internal fun Context.touchFeedback(borderless: Boolean): Drawable? {
  val value = TypedValue()
  val attr = if (borderless) android.R.attr.selectableItemBackgroundBorderless else android.R.attr.selectableItemBackground
  theme.resolveAttribute(attr, value, true)
  return getDrawable(value.resourceId)
}

/** White with a 1 dp line along one edge (the bars' borders). */
internal fun Context.lined(top: Boolean): Drawable =
  LayerDrawable(arrayOf(ColorDrawable(Palette.LINE), ColorDrawable(Palette.WHITE))).apply {
    if (top) setLayerInset(1, 0, dp(1), 0, 0) else setLayerInset(1, 0, 0, 0, dp(1))
  }

/** The mock's 600 weight. */
internal val SEMIBOLD: Typeface = Typeface.create(Typeface.DEFAULT, 600, false)
