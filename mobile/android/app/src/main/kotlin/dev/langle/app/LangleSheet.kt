package dev.langle.app

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Activity
import android.app.Dialog
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlin.math.min

/**
 * The sheet frame an app page shows in (mock `MobileLangleSheet`): white, rounded on top, over a
 * scrim, with a grabber; the page under the grabber draws the rest. Nine tenths of the screen
 * high; in landscape at most 520 dp wide, centred. Back, a tap on the scrim or a drag down on the
 * grabber closes it (the page itself scrolls, so only the grabber drags).
 */
@SuppressLint("ClickableViewAccessibility")
class LangleSheet(activity: Activity, content: View, fullscreen: Boolean, onDismiss: () -> Unit) {
  val dialog = Dialog(activity, android.R.style.Theme_Material_Light_NoActionBar)
  private val sheet: LinearLayout

  init {
    val landscape = activity.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    val metrics = activity.resources.displayMetrics
    val width = if (landscape) min(activity.dp(520), metrics.widthPixels) else ViewGroup.LayoutParams.MATCH_PARENT
    val root = FrameLayout(activity).apply { setOnClickListener { dialog.cancel() } }
    sheet =
      LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        isClickable = true
        background =
          GradientDrawable().apply {
            setColor(Palette.WHITE)
            val r = activity.dp(16).toFloat()
            cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
          }
        clipToOutline = true
        elevation = activity.dp(10).toFloat()
      }
    val grabber =
      FrameLayout(activity).apply {
        setPadding(0, activity.dp(8), 0, activity.dp(8))
        val bar =
          View(activity).apply {
            background =
              GradientDrawable().apply {
                setColor(Palette.GRABBER)
                cornerRadius = activity.dp(3).toFloat()
              }
          }
        addView(bar, FrameLayout.LayoutParams(activity.dp(36), activity.dp(5), Gravity.CENTER_HORIZONTAL))
        setOnTouchListener(Drag(activity.dp(96)))
      }
    sheet.addView(grabber, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    (content.parent as? ViewGroup)?.removeView(content)
    sheet.addView(content, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
    val height = (metrics.heightPixels * 0.9).toInt()
    root.addView(sheet, FrameLayout.LayoutParams(width, height, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL))
    ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
      sheet.setPadding(0, 0, 0, bars.bottom)
      insets
    }
    dialog.setContentView(root)
    dialog.window?.apply {
      setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
      setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
      addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
      setDimAmount(Palette.SCRIM_ALPHA)
      // Up from the bottom edge, as the keyboard comes.
      setWindowAnimations(android.R.style.Animation_InputMethod)
      setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
      statusBarColor = Color.TRANSPARENT
      navigationBarColor = Color.TRANSPARENT
      WindowCompat.setDecorFitsSystemWindows(this, false)
      if (fullscreen) {
        WindowCompat.getInsetsController(this, decorView).apply {
          systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
          hide(WindowInsetsCompat.Type.systemBars())
        }
      }
    }
    dialog.setOnDismissListener { onDismiss() }
  }

  fun show() = dialog.show()

  fun dismiss() = dialog.dismiss()

  /** A drag down on the grabber moves the sheet; far enough (or a fling) closes it. */
  private inner class Drag(private val far: Int) : View.OnTouchListener {
    private var startY = 0f
    private var startTime = 0L

    override fun onTouch(view: View, event: MotionEvent): Boolean {
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          startY = event.rawY
          startTime = event.eventTime
        }
        MotionEvent.ACTION_MOVE -> sheet.translationY = (event.rawY - startY).coerceAtLeast(0f)
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          val moved = sheet.translationY
          val fast = moved > far / 4 && event.eventTime - startTime < 200
          if (event.actionMasked == MotionEvent.ACTION_UP && (moved > far || fast)) {
            dialog.cancel()
          } else {
            ValueAnimator.ofFloat(moved, 0f).apply {
              duration = 150
              addUpdateListener { sheet.translationY = it.animatedValue as Float }
              start()
            }
          }
        }
      }
      return true
    }
  }
}
