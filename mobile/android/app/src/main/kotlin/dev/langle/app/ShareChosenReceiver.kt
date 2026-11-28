package dev.langle.app

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.IntentCompat
import dev.langle.core.ShareWatch

/**
 * The share sheet open now (AppFiles.share), for the pieces that reach the app apart from
 * MainActivity: the chooser's broadcast (ShareChosenReceiver) and Save to device
 * (SaveFileActivity). Touched on the main thread only.
 */
internal object OpenShare {
  var watch: ShareWatch? = null
}

/**
 * The chooser's word on the target the user picked (`Intent.createChooser`'s IntentSender, with
 * `EXTRA_CHOSEN_COMPONENT`): the file went there. Save to device as a first target (Android 13
 * and before) is named too; it only opens the save dialog, which answers itself. Not exported:
 * only the app's own PendingIntent reaches it.
 */
class ShareChosenReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val chosen = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_CHOSEN_COMPONENT, ComponentName::class.java)
    Log.i(TAG, "share target ${chosen?.flattenToShortString()}")
    val watch = OpenShare.watch ?: return
    if (chosen?.className == SaveFileActivity::class.java.name) watch.saveStarted() else watch.chosen()
  }
}
