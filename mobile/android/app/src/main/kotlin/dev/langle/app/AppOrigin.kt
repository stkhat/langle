package dev.langle.app

import android.content.res.AssetManager
import android.net.Uri
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.io.IOException

const val APP_HOST = "appassets.androidplatform.net"

/** The app origin (docs/specs/mobile-app.md "Contexts"): `WebViewAssetLoader`'s https host. */
const val APP_ORIGIN = "https://$APP_HOST"

/**
 * Serves the app origin from `/`: the bundled `langle-app` build (`assets/langle-app/`, copied by
 * scripts/bundle-build.sh; its pages load `/chunks/…` from the root) and the pages the app writes
 * itself (`host.html`). Only app-profile pages ask it; browsing pages never reach these files.
 */
class AppOrigin(private val assets: AssetManager) {
  /** Pages the app writes, by path (`/host.html`). */
  val generated = mutableMapOf<String, String>()

  private val loader =
    WebViewAssetLoader.Builder().setDomain(APP_HOST).addPathHandler("/") { path -> response("/$path") }.build()

  /** A file of the build by its path on the origin; null when there is none. */
  fun file(path: String): ByteArray? {
    generated[path]?.let { return it.toByteArray() }
    val parts = path.trimStart('/').split('/')
    // Nothing outside the build's folder.
    if (parts.any { it.isEmpty() || it == "." || it == ".." }) return null
    return try {
      assets.open("$BUILD_FOLDER/${parts.joinToString("/")}").use { it.readBytes() }
    } catch (_: IOException) {
      null
    }
  }

  fun intercept(url: Uri): WebResourceResponse? = loader.shouldInterceptRequest(url)

  private fun response(path: String): WebResourceResponse {
    val headers = mapOf("Cache-Control" to "no-store")
    val data = file(path)
      ?: return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers, ByteArrayInputStream("Not found".toByteArray()))
    val type = TYPES[path.substringAfterLast('.', "").lowercase()] ?: "application/octet-stream"
    val encoding = if (type.startsWith("text/") || type == "application/json") "utf-8" else null
    return WebResourceResponse(type, encoding, 200, "OK", headers, ByteArrayInputStream(data))
  }

  companion object {
    const val BUILD_FOLDER = "langle-app"

    /** Module scripts need a JavaScript type. */
    private val TYPES =
      mapOf(
        "html" to "text/html", "js" to "text/javascript", "mjs" to "text/javascript", "css" to "text/css",
        "json" to "application/json", "txt" to "text/plain", "png" to "image/png", "svg" to "image/svg+xml",
        "woff" to "font/woff", "woff2" to "font/woff2", "wasm" to "application/wasm",
      )
  }
}
