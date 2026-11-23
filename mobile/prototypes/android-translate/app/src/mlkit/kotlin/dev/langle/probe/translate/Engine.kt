package dev.langle.probe.translate

import android.app.Activity
import android.os.SystemClock
import android.webkit.WebView
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import org.json.JSONArray
import org.json.JSONObject

private fun ms(from: Long) = (SystemClock.elapsedRealtimeNanos() - from) / 1e6

/** ML Kit, English to Japanese. The run "download" only fetches the model. */
fun startEngine(activity: Activity, web: WebView, run: String, done: (String) -> Unit) {
  web.loadUrl("about:blank")
  thread(name = "mlkit") {
    val result = JSONObject().put("engine", "mlkit").put("run", run)
    try {
      val started = SystemClock.elapsedRealtimeNanos()
      val translator =
        Translation.getClient(
          TranslatorOptions.Builder()
            .setSourceLanguage(TranslateLanguage.ENGLISH)
            .setTargetLanguage(TranslateLanguage.JAPANESE)
            .build()
        )
      if (run == "download") {
        Tasks.await(translator.downloadModelIfNeeded(), 10, TimeUnit.MINUTES)
      } else {
        result.put("loadMs", ms(started))
        val set = JSONArray(File(activity.filesDir, "set.json").readText())
        val rows = JSONArray()
        for (pass in 0..1) {
          for (i in 0 until set.length()) {
            val item = set.getJSONObject(i)
            val from = SystemClock.elapsedRealtimeNanos()
            val out = Tasks.await(translator.translate(item.getString("en")), 1, TimeUnit.MINUTES)
            rows.put(JSONObject().put("id", item.getString("id")).put("pass", pass).put("ms", ms(from)).put("out", out))
          }
        }
        result.put("rows", rows)
      }
      result.put("totalMs", ms(started))
    } catch (e: Exception) {
      result.put("error", e.toString())
    }
    done(result.toString())
  }
}
