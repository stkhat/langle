package dev.langle.app

import android.util.Log
import dev.langle.core.FilterEngines
import java.io.IOException
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/**
 * The ad-blocking crate's JNI layer (mobile/adblock/src/jni.rs, built by `npm run mobile:adblock`
 * into `liblangle_adblock.so`): the C interface's functions with Java strings and byte arrays.
 * A failure returns null, 0 or -1, and [lastError] says why on the same thread.
 */
object AdblockNative {
  /** Whether the library loaded (the APK always has it: its build fails without the .so files). */
  val loaded: Boolean =
    try {
      System.loadLibrary("langle_adblock")
      true
    } catch (e: UnsatisfiedLinkError) {
      Log.e(TAG, "ad blocking is off: ${e.message}")
      false
    }

  external fun build(texts: Array<ByteArray>, trusted: BooleanArray): ByteArray?

  external fun load(engine: ByteArray, resources: ByteArray): Long

  external fun free(engine: Long)

  external fun check(engine: Long, url: String, pageUrl: String, type: String): Int

  external fun cosmetic(engine: Long, pageUrl: String): String?

  external fun hiddenClassIdCss(engine: Long, pageJson: String): String?

  external fun site(url: String): String?

  external fun lastError(): String?

  /** The registrable domain of [url]'s host, or null (no host, or no library). */
  fun siteOf(url: String): String? = if (loaded) site(url) else null
}

/**
 * One loaded engine. Calls may run on several threads at once (WebView's request threads);
 * [close] waits for those running, then frees it, and later calls answer as if nothing matched.
 */
class AdblockEngine(private var handle: Long) {
  private val lock = ReentrantReadWriteLock()

  /** Whether a subresource is blocked (false for bad input: an URL with no host). */
  fun blocks(url: String, pageUrl: String, type: String): Boolean =
    lock.read { handle != 0L && AdblockNative.check(handle, url, pageUrl, type) == 1 }

  /** The page's cosmetic resources as JSON (langle_adblock_cosmetic), or null. */
  fun cosmetic(pageUrl: String): String? = lock.read { if (handle == 0L) null else AdblockNative.cosmetic(handle, pageUrl) }

  /** The stylesheet for a page's classes and ids (langle_adblock_hidden_class_id_css), or null. */
  fun hiddenClassIdCss(pageJson: String): String? =
    lock.read { if (handle == 0L) null else AdblockNative.hiddenClassIdCss(handle, pageJson) }

  fun close() =
    lock.write {
      if (handle != 0L) AdblockNative.free(handle)
      handle = 0L
    }
}

/** The list store's engines: adblock-rust over JNI, loaded with the build's scriptlets. */
class NativeFilterEngines(private val resources: ByteArray) : FilterEngines<AdblockEngine> {
  override fun build(lists: List<Pair<ByteArray, Boolean>>): ByteArray =
    AdblockNative.build(lists.map { it.first }.toTypedArray(), lists.map { it.second }.toBooleanArray())
      ?: throw IOException(AdblockNative.lastError() ?: "build failed")

  override fun load(bytes: ByteArray): AdblockEngine {
    val handle = AdblockNative.load(bytes, resources)
    if (handle == 0L) throw IOException(AdblockNative.lastError() ?: "load failed")
    return AdblockEngine(handle)
  }

  override fun release(engine: AdblockEngine) = engine.close()
}
