package dev.langle.spike.drive

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.android.gms.auth.api.identity.AuthorizationClient
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.identity.RevokeAccessRequest
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import java.security.MessageDigest
import org.json.JSONObject

const val TAG = "LangleM7a"
const val APP_HOST = "appassets.androidplatform.net"
const val APP_ORIGIN = "https://$APP_HOST"
const val PAGE = "$APP_ORIGIN/drive.html"
const val DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata"

/** Not the real app's "langle" profile: the spike installs over the real app's package. */
const val PROFILE = "drive-spike"

/**
 * Spike M7a (docs/plans/mobile-app.md, docs/notes/mobile.md "Drive sign-in (M7a)"): sign in with
 * Google Identity Services' AuthorizationClient (scope drive.appdata) and hand the access token to
 * a WebView on the app origin, whose JS (drive-spike-web/drive.js) calls the Drive API with fetch.
 *
 * Buttons on screen, or from adb (run.sh): am start -n dev.langle.app/dev.langle.spike.drive.MainActivity --es cmd <cmd>
 *   connect [--es prompt select|consent]  authorize, showing Google's sheet when it asks to
 *   silent                                authorize without UI (a resolution is logged, not shown)
 *   drive                                 list, multipart create, media update, alt=media, about, delete
 *   probe                                 tokeninfo of the current token
 *   clear                                 clearToken(current); the cleared token is kept as "old"
 *   old / bad                             a list call with the cleared token / a made-up one
 *   forget                                drop the token from memory (the app keeps none)
 *   revoke                                revokeAccess (ends the grant: ask the user first)
 * Every result is one logcat line "M7A <label> <json>" (tag LangleM7a). Tokens are logged only
 * as a short SHA-256 prefix; the account's address is never logged.
 */
class MainActivity : Activity() {
  private lateinit var web: WebView
  private lateinit var status: TextView
  private val client: AuthorizationClient by lazy { Identity.getAuthorizationClient(this) }
  private var token: String? = null
  private var old: String? = null
  private var last: AuthorizationResult? = null
  private var pageReady = false
  private val queued = mutableListOf<String>()

  private fun log(label: String, json: String) {
    Log.i(TAG, "M7A $label $json")
    runOnUiThread { status.text = "$label $json\n\n${status.text}".take(4000) }
  }

  private fun log(label: String, vararg pairs: Pair<String, Any?>) = log(label, JSONObject(pairs.toMap()).toString())

  private fun tag(value: String?) =
    value?.let { MessageDigest.getInstance("SHA-256").digest(it.toByteArray()).take(4).joinToString("") { b -> "%02x".format(b) } }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WebView.setWebContentsDebuggingEnabled(true)
    status = TextView(this).apply { textSize = 11f; setTextIsSelectable(true) }
    val buttons =
      LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        listOf("connect", "silent", "drive", "clear", "forget").forEach { cmd ->
          addView(Button(this@MainActivity).apply { text = cmd; isAllCaps = false; setOnClickListener { command(cmd, null) } })
        }
      }
    web = WebView(this)
    if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
      ProfileStore.getInstance().getOrCreateProfile(PROFILE)
      WebViewCompat.setProfile(web, PROFILE)
    }
    web.settings.javaScriptEnabled = true
    val assets =
      WebViewAssetLoader.Builder().setDomain(APP_HOST).addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this)).build()
    web.webViewClient =
      object : WebViewClient() {
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
          if (request.url.host == APP_HOST) assets.shouldInterceptRequest(request.url) else null
      }
    WebViewCompat.addWebMessageListener(web, "spikeBridge", setOf(APP_ORIGIN)) { _, message, _, _, _ ->
      val data = message.data ?: return@addWebMessageListener
      val what = runCatching { JSONObject(data).optString("what") }.getOrDefault("js")
      log("js.$what", data)
      if (what == "loaded") {
        pageReady = true
        queued.forEach { web.evaluateJavascript(it, null) }
        queued.clear()
      }
    }
    val root =
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        addView(buttons)
        addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 200))
        addView(ScrollView(this@MainActivity).apply { addView(status) }, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
      }
    setContentView(root)
    val pkg = WebViewCompat.getCurrentWebViewPackage(this)
    log("start", "webview" to "${pkg?.packageName} ${pkg?.versionName}", "profile" to WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE))
    web.loadUrl(PAGE)
    handle(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handle(intent)
  }

  private fun handle(intent: Intent?) {
    val cmd = intent?.getStringExtra("cmd") ?: return
    command(cmd, intent.getStringExtra("prompt"))
  }

  private fun js(source: String) {
    if (pageReady) web.evaluateJavascript(source, null) else queued.add(source)
  }

  private fun command(cmd: String, prompt: String?) {
    when (cmd) {
      "connect" -> authorize(interactive = true, prompt)
      "silent" -> authorize(interactive = false, prompt)
      "drive" -> token?.let { js("driveSpike.run(${JSONObject.quote(it)}, 'android')") } ?: log("drive", "error" to "no token")
      "probe" -> token?.let { js("driveSpike.probe(${JSONObject.quote(it)})") } ?: log("probe", "error" to "no token")
      "old" -> old?.let { js("driveSpike.refused(${JSONObject.quote(it)}, 'old-token')") } ?: log("old", "error" to "no cleared token")
      "bad" -> js("driveSpike.refused('ya29.not-a-real-token', 'bad-token')")
      "clear" -> clear()
      "forget" -> {
        token = null
        log("forget", "ok" to true)
      }
      "revoke" -> revoke()
      else -> log("error", "unknown" to cmd)
    }
  }

  private fun request(prompt: String?): AuthorizationRequest {
    val builder = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(DRIVE_APPDATA)))
    when (prompt) {
      "select" -> builder.setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT)
      "consent" -> builder.setPrompt(AuthorizationRequest.Prompt.CONSENT)
    }
    return builder.build()
  }

  private fun authorize(interactive: Boolean, prompt: String?) {
    val started = System.currentTimeMillis()
    client
      .authorize(request(prompt))
      .addOnSuccessListener { result ->
        val ms = System.currentTimeMillis() - started
        if (result.hasResolution()) {
          log("authorize", "interactive" to interactive, "prompt" to prompt, "resolution" to true, "ms" to ms)
          if (interactive) {
            startIntentSenderForResult(result.pendingIntent!!.intentSender, REQUEST_AUTHORIZE, null, 0, 0, 0)
          }
        } else {
          got(result, "authorize", interactive, prompt, ms)
        }
      }
      .addOnFailureListener { error -> log("authorize", "interactive" to interactive, "failure" to describe(error)) }
  }

  @Deprecated("Activity's own result path is enough for a spike")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != REQUEST_AUTHORIZE) return
    if (resultCode != RESULT_OK) {
      log("resolution", "resultCode" to resultCode, "cancelled" to (resultCode == RESULT_CANCELED))
    }
    try {
      got(client.getAuthorizationResultFromIntent(data), "resolution", true, null, null)
    } catch (error: Exception) {
      log("resolution", "resultCode" to resultCode, "failure" to describe(error))
    }
  }

  private fun got(result: AuthorizationResult, label: String, interactive: Boolean, prompt: String?, ms: Long?) {
    last = result
    val previous = token
    token = result.accessToken
    log(
      label,
      "interactive" to interactive,
      "prompt" to prompt,
      "resolution" to false,
      "token" to tag(token),
      "sameAsBefore" to (previous != null && previous == token),
      "sameAsCleared" to (old != null && old == token),
      "scopes" to result.grantedScopes.joinToString(" "),
      "hasAccount" to (result.toGoogleSignInAccount()?.account != null),
      "params" to result.tokenResponseParams?.keySet()?.joinToString(","),
      "ms" to ms,
    )
  }

  private fun clear() {
    val current = token ?: return log("clear", "error" to "no token")
    client
      .clearToken(ClearTokenRequest.builder().setToken(current).build())
      .addOnSuccessListener {
        old = current
        token = null
        log("clear", "ok" to true, "token" to tag(current))
      }
      .addOnFailureListener { error -> log("clear", "failure" to describe(error)) }
  }

  private fun revoke() {
    val account = last?.toGoogleSignInAccount()?.account ?: return log("revoke", "error" to "no account (connect first)")
    client
      .revokeAccess(RevokeAccessRequest.builder().setAccount(account).setScopes(listOf(Scope(DRIVE_APPDATA))).build())
      .addOnSuccessListener {
        token = null
        log("revoke", "ok" to true)
      }
      .addOnFailureListener { error -> log("revoke", "failure" to describe(error)) }
  }

  private fun describe(error: Exception) =
    if (error is ApiException) "ApiException ${error.statusCode} ${error.status.statusMessage}" else "${error.javaClass.simpleName}: ${error.message}"

  companion object {
    const val REQUEST_AUTHORIZE = 7
  }
}
