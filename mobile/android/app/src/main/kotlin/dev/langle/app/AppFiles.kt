package dev.langle.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import dev.langle.core.ANY_TYPE
import dev.langle.core.SharedFile
import java.io.File

/**
 * Files in and out of the app's pages (docs/specs/mobile-app.md "The shells"), which have no
 * downloads: an export (`appHost.shareFile`) goes to the share sheet, where the user saves it to
 * Files or sends it; a file input (Import) opens the system's document picker.
 */
class AppFiles(private val activity: Activity) {
  private var picking: ((Array<Uri>?) -> Unit)? = null

  /**
   * Writes the file under its own name in the cache's `shared/` folder (FileProvider's
   * `res/xml/shared_files.xml`) and shows the share sheet with it, readable by the app the user
   * picks. Answers once the sheet is started. Only the latest file is kept: the folder is emptied
   * first.
   */
  fun share(file: SharedFile, done: (error: String?) -> Unit) {
    try {
      val folder = File(activity.cacheDir, SHARED_FOLDER)
      folder.deleteRecursively()
      folder.mkdirs()
      val written = File(folder, file.name).apply { writeText(file.text) }
      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", written)
      // Without its parameters (`;charset=utf-8`), as apps' intent filters name types.
      val type = Intent.normalizeMimeType(file.mime) ?: ANY_TYPE
      val send =
        Intent(Intent.ACTION_SEND)
          .setType(type)
          .putExtra(Intent.EXTRA_STREAM, uri)
          .putExtra(Intent.EXTRA_TITLE, file.name)
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      send.clipData = ClipData.newRawUri(file.name, uri)
      activity.startActivity(Intent.createChooser(send, file.name))
      Log.i(TAG, "shared ${file.name} as $type (${file.text.length} chars)")
      done(null)
    } catch (e: Exception) {
      Log.e(TAG, "could not share ${file.name}", e)
      done(e.message ?: e.toString())
    }
  }

  /**
   * A page's `<input type=file>`: the document picker for [types] (core's `pickerTypes`), the
   * chosen files' addresses to [done], or null when the user backs out. A picker still open is
   * answered with null first, so every input gets its answer.
   */
  fun choose(types: List<String>, multiple: Boolean, done: (Array<Uri>?) -> Unit) {
    picking?.invoke(null)
    picking = null
    val intent =
      Intent(Intent.ACTION_OPEN_DOCUMENT)
        .addCategory(Intent.CATEGORY_OPENABLE)
        .setType(types.singleOrNull() ?: ANY_TYPE)
        .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
    if (types.size > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
    try {
      @Suppress("DEPRECATION")
      activity.startActivityForResult(intent, PICK_FILES)
      picking = done
    } catch (e: ActivityNotFoundException) {
      Log.e(TAG, "no document picker", e)
      done(null)
    }
  }

  /** The activity's result; true when it was the picker's. */
  fun onResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
    if (requestCode != PICK_FILES) return false
    val done = picking ?: return true
    picking = null
    val clip = data?.clipData
    val uris =
      when {
        resultCode != Activity.RESULT_OK || data == null -> null
        clip != null -> Array(clip.itemCount) { clip.getItemAt(it).uri }
        else -> data.data?.let { arrayOf(it) }
      }
    Log.i(TAG, "picked ${uris?.size ?: 0} file(s)")
    done(uris)
    return true
  }

  companion object {
    const val SHARED_FOLDER = "shared"
    private const val PICK_FILES = 41
  }
}
