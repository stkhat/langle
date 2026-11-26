package dev.langle.app

import android.app.Activity
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.Switch
import android.widget.TextView

/**
 * The title bar's ⋮ menu (mock `MobileArticleMenu`): the items, then under a divider the switch
 * "Block ads on this site" with the site's registrable domain under it, when ad blocking is on.
 * Each choice closes the menu.
 */
class MoreMenu(private val activity: Activity) {
  class Item(val label: Int, val enabled: Boolean, val run: () -> Unit)

  class AdSwitch(val site: String, val blocking: Boolean, val toggle: (blocking: Boolean) -> Unit)

  fun show(anchor: View, items: List<Item>, ads: AdSwitch?) {
    val box =
      LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        val pad = activity.dp(6)
        setPadding(pad, pad, pad, pad)
        background = rounded(Palette.WHITE, 12).apply { setStroke(activity.dp(1), Palette.LINE) }
        elevation = activity.dp(10).toFloat()
        clipToOutline = true
      }
    val popup = PopupWindow(box, activity.dp(WIDTH), ViewGroup.LayoutParams.WRAP_CONTENT, true)
    for (item in items) box.addView(itemView(item) { popup.dismiss() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, activity.dp(44)))
    if (ads != null) {
      box.addView(
        View(activity).apply { setBackgroundColor(Palette.LINE) },
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, activity.dp(1)).apply {
          val side = activity.dp(4)
          val gap = activity.dp(6)
          setMargins(side, gap, side, gap)
        },
      )
      box.addView(switchRow(ads) { popup.dismiss() }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
    popup.elevation = activity.dp(10).toFloat()
    popup.setBackgroundDrawable(null)
    // Its right edge 8 dp from the screen's (the button sits 4 dp in), 2 dp under the bar.
    popup.showAsDropDown(anchor, -activity.dp(4), activity.dp(8), Gravity.END)
  }

  private fun itemView(item: Item, close: () -> Unit): View =
    TextView(activity).apply {
      text = activity.getString(item.label)
      textSize = 15f
      setTextColor(Palette.INK)
      gravity = Gravity.CENTER_VERTICAL
      val pad = activity.dp(12)
      setPadding(pad, 0, pad, 0)
      isSingleLine = true
      background = activity.touchFeedback(borderless = false)
      isEnabled = item.enabled
      if (!item.enabled) alpha = DISABLED_ALPHA
      setOnClickListener {
        close()
        item.run()
      }
    }

  private fun switchRow(ads: AdSwitch, close: () -> Unit): View {
    val row =
      LinearLayout(activity).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        minimumHeight = activity.dp(56)
        setPadding(activity.dp(12), activity.dp(6), activity.dp(8), activity.dp(6))
        background = activity.touchFeedback(borderless = false)
      }
    val words = LinearLayout(activity).apply { orientation = LinearLayout.VERTICAL }
    words.addView(
      TextView(activity).apply {
        text = activity.getString(R.string.block_ads_site)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        setTextColor(Palette.INK)
      },
    )
    words.addView(
      TextView(activity).apply {
        text = ads.site
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setTextColor(Palette.MUTED)
        isSingleLine = true
        ellipsize = android.text.TextUtils.TruncateAt.END
      },
      LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = activity.dp(2) },
    )
    row.addView(words, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginEnd = activity.dp(12) })
    val track = FrameLayout(activity)
    val knob = View(activity).apply { background = rounded(Palette.WHITE, 13) }
    track.addView(knob, FrameLayout.LayoutParams(activity.dp(26), activity.dp(26)))
    fun paint(on: Boolean) {
      track.background = rounded(if (on) TRACK_ON else TRACK_OFF, 16)
      (knob.layoutParams as FrameLayout.LayoutParams).apply {
        topMargin = activity.dp(3)
        marginStart = activity.dp(if (on) 23 else 3)
      }
      knob.elevation = activity.dp(1).toFloat()
      knob.requestLayout()
    }
    paint(ads.blocking)
    row.addView(track, LinearLayout.LayoutParams(activity.dp(52), activity.dp(32)))
    row.accessibilityDelegate =
      object : View.AccessibilityDelegate() {
        override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
          super.onInitializeAccessibilityNodeInfo(host, info)
          info.className = Switch::class.java.name
          info.isCheckable = true
          info.isChecked = ads.blocking
        }
      }
    row.setOnClickListener {
      paint(!ads.blocking)
      close()
      ads.toggle(!ads.blocking)
    }
    return row
  }

  private fun rounded(color: Int, radius: Int) =
    GradientDrawable().apply {
      setColor(color)
      cornerRadius = activity.dp(radius).toFloat()
    }

  private companion object {
    const val WIDTH = 272
    const val DISABLED_ALPHA = 0.38f
    /** The mock's switch: green on, grey off. */
    const val TRACK_ON = 0xFF0B8A6C.toInt()
    const val TRACK_OFF = 0xFFC9CDD6.toInt()
  }
}
