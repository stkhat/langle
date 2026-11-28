package dev.langle.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.DocumentsContract
import android.util.Log
import android.widget.Toast
import dev.langle.core.UNKNOWN_TYPE

/**
 * The share sheet's "Save to device" (AppFiles.share): the system's save dialog for the shared
 * file (its address in the intent's data, its name in `EXTRA_TITLE`, its type), then the file's
 * bytes to the place the user chose. Backing out of the dialog saves nothing; a failed write is
 * logged, shown in a toast and its half-written file removed. Each tells the open share
 * (OpenShare) whether the file was saved. The activity has no screen of its own and is not
 * exported: only the app's own chooser starts it.
 */
class SaveFileActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // Recreated while the dialog is open: the dialog answers this instance.
    if (savedInstanceState != null) return
    OpenShare.watch?.saveStarted()
    if (intent.data == null) return done(false)
    val create =
      Intent(Intent.ACTION_CREATE_DOCUMENT)
        .addCategory(Intent.CATEGORY_OPENABLE)
        .setType(intent.type ?: UNKNOWN_TYPE)
        .putExtra(Intent.EXTRA_TITLE, intent.getStringExtra(Intent.EXTRA_TITLE))
    try {
      @Suppress("DEPRECATION")
      startActivityForResult(create, CREATE_FILE)
    } catch (e: ActivityNotFoundException) {
      failed("no save dialog", e)
      done(false)
    }
  }

  @Deprecated("Activity's result, for the save dialog")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    val source = intent.data
    val target = data?.data
    if (requestCode == CREATE_FILE && resultCode == RESULT_OK && source != null && target != null) done(save(source, target))
    else {
      Log.i(TAG, "save cancelled")
      done(false)
    }
  }

  private fun done(saved: Boolean) {
    OpenShare.watch?.saveFinished(saved)
    finish()
  }

  /** True once the file is there. */
  private fun save(source: Uri, target: Uri): Boolean {
    return try {
      val input = contentResolver.openInputStream(source) ?: error("cannot read $source")
      input.use { from ->
        val output = contentResolver.openOutputStream(target, "w") ?: error("cannot write $target")
        output.use { from.copyTo(it) }
      }
      Log.i(TAG, "saved ${intent.getStringExtra(Intent.EXTRA_TITLE)} to $target")
      true
    } catch (e: Exception) {
      failed("could not save to $target", e)
      runCatching { DocumentsContract.deleteDocument(contentResolver, target) }
      false
    }
  }

  private fun failed(message: String, e: Exception) {
    Log.e(TAG, message, e)
    Toast.makeText(applicationContext, AppStrings.of(this)["app.saveFailed"], Toast.LENGTH_LONG).show()
  }

  private companion object {
    const val CREATE_FILE = 42
  }
}
