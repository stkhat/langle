package dev.langle.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import dev.langle.core.AppTab

/**
 * The tab bar under Home, Words and Settings (mock `MobileStart`): three equal items of a 24 dp
 * icon over an 11 sp label, 52 dp high under 4 dp, white with a line on top; the chosen one green.
 * The window's bottom inset is its bottom padding, so the white goes under the navigation bar.
 */
@SuppressLint("ViewConstructor")
class TabBar(context: Context, private val onSelect: (AppTab) -> Unit) : LinearLayout(context) {
  private class Item(val root: LinearLayout, val icon: ImageView, val label: TextView)

  private val items: Map<AppTab, Item>

  init {
    orientation = HORIZONTAL
    background = context.lined(top = true)
    contentDescription = context.getString(R.string.tabs)
    setPadding(context.dp(8), context.dp(1) + context.dp(4), context.dp(8), 0)
    items =
      AppTab.entries.associateWith { tab ->
        val (icon, label) =
          when (tab) {
            AppTab.HOME -> R.drawable.ic_tab_home to R.string.home
            AppTab.WORDS -> R.drawable.ic_tab_words to R.string.words
            AppTab.SETTINGS -> R.drawable.ic_tab_settings to R.string.settings
          }
        item(icon, label).also { item ->
          item.root.setOnClickListener { onSelect(tab) }
          addView(item.root, LayoutParams(0, context.dp(52), 1f))
        }
      }
  }

  private fun item(icon: Int, label: Int): Item {
    val root =
      LinearLayout(context).apply {
        orientation = VERTICAL
        gravity = Gravity.CENTER
        background = context.touchFeedback(borderless = true)
      }
    val image = ImageView(context).apply { setImageResource(icon) }
    val text =
      TextView(context).apply {
        setText(label)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
        includeFontPadding = false
      }
    root.addView(image, LayoutParams(context.dp(24), context.dp(24)))
    root.addView(text, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = context.dp(2) })
    return Item(root, image, text)
  }

  /** Shows [tab] as the chosen one. */
  fun select(tab: AppTab) {
    for ((key, item) in items) {
      val on = key == tab
      val color = if (on) Palette.GREEN else Palette.MUTED
      item.icon.imageTintList = ColorStateList.valueOf(color)
      item.label.setTextColor(color)
      item.label.typeface = if (on) SEMIBOLD else Typeface.DEFAULT
      item.root.isSelected = on
    }
  }

  /** The window's bottom inset (the navigation bar). */
  fun setBottomInset(px: Int) {
    setPadding(paddingLeft, paddingTop, paddingRight, px)
  }
}
