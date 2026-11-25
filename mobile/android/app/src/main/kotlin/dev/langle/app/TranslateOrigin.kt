package dev.langle.app

import android.content.res.AssetManager
import android.net.Uri
import android.webkit.WebResourceResponse
import dev.langle.core.ModelStore
import java.io.FileInputStream
import java.io.IOException

/**
 * What the translate profile's page may load (docs/specs/mobile-translation.md "The Android
 * host"), all on the app origin:
 * - `/models/<pack>/<file>`: a ready model pack's files from the app's files ([ModelStore]),
 *   streamed (the model is tens of MB);
 * - `/bergamot/<file>`: the engine's WebAssembly build and glue, shipped in the APK
 *   (`assets/bergamot/`, npm run mobile:bergamot);
 * - anything else from the `langle-app` build ([AppOrigin]: `translate-host.html`, its chunks
 *   and its Worker).
 * Any other host, and anything missing, is not found. Called on the WebView's request threads.
 */
class TranslateOrigin(private val origin: AppOrigin, private val assets: AssetManager, private val models: ModelStore) {
  fun intercept(url: Uri): WebResourceResponse {
    if (url.scheme != "https" || url.host != APP_HOST) return notFound()
    val parts = (url.path ?: "/").trimStart('/').split('/')
    return when {
      parts.size == 3 && parts[0] == "models" -> {
        val file = models.file(parts[1], parts[2]) ?: return notFound()
        AppOrigin.found(file.name, FileInputStream(file), file.length())
      }
      parts.size == 2 && parts[0] == "bergamot" && parts[1] in ENGINE_FILES ->
        try {
          AppOrigin.found(parts[1], assets.open("bergamot/${parts[1]}"))
        } catch (_: IOException) {
          notFound()
        }
      parts[0] == "models" || parts[0] == "bergamot" -> notFound()
      else -> origin.intercept(url) ?: notFound()
    }
  }

  companion object {
    val ENGINE_FILES = setOf("bergamot-translator.wasm", "bergamot-translator.js")
  }
}
