package dev.langle.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * The bar over a page opened from Home (mock `MobileLangleSheet`): ‹ (Home), the page's title
 * over its site (a tap edits the address), L (the Langle sheet) and ⋮. 56 dp high, white, with a
 * line under it.
 */
@SuppressLint("ViewConstructor")
class TitleBar(
  context: Context,
  mark: Bitmap?,
  private val onHome: () -> Unit,
  private val onGo: (text: String) -> Unit,
  private val onLangle: () -> Unit,
  private val onMore: (anchor: View) -> Unit,
) : LinearLayout(context) {
  private val titleBox: LinearLayout
  private val title: TextView
  private val site: TextView
  private val input: EditText
  private var address = ""

  val isEditing: Boolean
    get() = input.visibility == VISIBLE

  init {
    orientation = HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    background = context.lined(top = false)
    setPadding(context.dp(4), context.dp(6), context.dp(4), context.dp(6) + context.dp(1))
    isClickable = true // taps on the bar stay off the page under it

    addView(iconButton(R.drawable.ic_back, R.string.home) { onHome() }, square())
    title =
      text(15f, Palette.INK).apply { typeface = SEMIBOLD }
    site = text(12f, Palette.MUTED)
    titleBox =
      LinearLayout(context).apply {
        orientation = VERTICAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(context.dp(6), 0, context.dp(6), 0)
        background = context.touchFeedback(borderless = false)
        contentDescription = context.getString(R.string.edit_address)
        addView(title)
        addView(site, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = context.dp(1) })
        setOnClickListener { startEditing() }
      }
    addView(titleBox, LayoutParams(0, LayoutParams.MATCH_PARENT, 1f))
    input =
      EditText(context).apply {
        visibility = GONE
        hint = context.getString(R.string.edit_address)
        isSingleLine = true
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        setTextColor(Palette.INK)
        inputType = EditorInfo.TYPE_CLASS_TEXT or EditorInfo.TYPE_TEXT_VARIATION_URI
        imeOptions = EditorInfo.IME_ACTION_GO
        setSelectAllOnFocus(true)
        setPadding(context.dp(12), 0, context.dp(12), 0)
        background =
          GradientDrawable().apply {
            cornerRadius = context.dp(10).toFloat()
            setColor(Palette.WHITE)
            setStroke(context.dp(1), Palette.FIELD_LINE)
          }
        setOnEditorActionListener { _, action, event ->
          val go = action == EditorInfo.IME_ACTION_GO || event?.keyCode == KeyEvent.KEYCODE_ENTER
          if (go) {
            val typed = text.toString()
            stopEditing()
            onGo(typed)
          }
          go
        }
        setOnFocusChangeListener { _, focused -> if (!focused) stopEditing() }
      }
    addView(input, LayoutParams(0, context.dp(40), 1f).apply { marginStart = context.dp(4) })
    val langle =
      ImageButton(context).apply {
        if (mark != null) setImageBitmap(mark)
        scaleType = ImageView.ScaleType.FIT_CENTER
        setPadding(context.dp(8), context.dp(8), context.dp(8), context.dp(8))
        background = context.touchFeedback(borderless = true)
        contentDescription = context.getString(R.string.langle)
        setOnClickListener { onLangle() }
      }
    addView(langle, square())
    val more = iconButton(R.drawable.ic_more, R.string.more) {}
    more.setOnClickListener { onMore(more) }
    addView(more, square())
  }

  /** The page's title and site; [url] when it has no title, and the address to edit. */
  fun show(title: String, site: String, url: String) {
    this.title.text = title
    this.site.text = site
    this.site.visibility = if (site.isEmpty()) GONE else VISIBLE
    address = url
  }

  /** A tap on the title: the address, chosen, with the keyboard up. */
  fun startEditing() {
    titleBox.visibility = GONE
    input.visibility = VISIBLE
    input.setText(address)
    input.requestFocus()
    input.selectAll()
    keyboard()?.showSoftInput(input, 0)
  }

  /** Back to the title, the keyboard down; what was typed is dropped. */
  fun stopEditing() {
    if (!isEditing) return
    input.visibility = GONE
    titleBox.visibility = VISIBLE
    keyboard()?.hideSoftInputFromWindow(input.windowToken, 0)
    input.clearFocus()
  }

  private fun keyboard() = context.getSystemService(InputMethodManager::class.java)

  private fun square() = LayoutParams(context.dp(44), context.dp(44))

  private fun iconButton(icon: Int, description: Int, click: () -> Unit) =
    ImageButton(context).apply {
      setImageResource(icon)
      imageTintList = ColorStateList.valueOf(Palette.INK)
      background = context.touchFeedback(borderless = true)
      contentDescription = context.getString(description)
      setOnClickListener { click() }
    }

  private fun text(sp: Float, color: Int) =
    TextView(context).apply {
      setTextSize(TypedValue.COMPLEX_UNIT_SP, sp)
      setTextColor(color)
      isSingleLine = true
      ellipsize = TextUtils.TruncateAt.END
      includeFontPadding = false
    }
}
