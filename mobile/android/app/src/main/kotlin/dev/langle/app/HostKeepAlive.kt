package dev.langle.app

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log

/**
 * Keeps the app's process running while the background answers `app.hidden`
 * (docs/specs/mobile-app.md "M7" › "The app's lifecycle"; AppLifecycle in :core holds it until
 * the answer or 20 s). A started service with no work and no notification: while it runs, the
 * process is not a cached one the system may freeze, and the extension host's renderer is bound
 * to it. Android lets an app start a service for a few minutes after leaving the screen, which
 * is when `app.hidden` is sent.
 */
class HostKeepAlive : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

  companion object {
    fun hold(context: Context, on: Boolean) {
      val intent = Intent(context, HostKeepAlive::class.java)
      try {
        if (on) context.startService(intent) else context.stopService(intent)
      } catch (e: IllegalStateException) {
        // The system no longer lets the app start one; the writes not done are done at the next start.
        Log.w(TAG, "could not keep the host running: $e")
      }
    }
  }
}
