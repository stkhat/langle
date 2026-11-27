package dev.langle.app

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import android.util.Log
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.Scope
import dev.langle.core.Authorization
import dev.langle.core.GoogleAuthError
import dev.langle.core.GoogleAuthorizer

/**
 * Google Identity Services' `AuthorizationClient` (play-services-auth) with the scope
 * `drive.appdata`, as M7a measured it (docs/notes/mobile.md "Drive sign-in (M7a)"). Google
 * matches the app to Langle's Android OAuth client by the package and the signing certificate's
 * SHA-1 (client 191564468385-pdi5tf39l63lr0oec0b1l4j2l63n2veu, kept here for the record; the
 * request does not name it). Google's sheet is the result's `PendingIntent`, shown with
 * `startIntentSenderForResult`; its answer comes back through [onResult].
 */
class PlayGoogleAuthorizer(private val activity: Activity) : GoogleAuthorizer {
  private val client by lazy { Identity.getAuthorizationClient(activity) }
  private var sheet: ((Authorization) -> Unit)? = null

  override fun authorize(selectAccount: Boolean, done: (Authorization) -> Unit) {
    val request = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(DRIVE_APPDATA)))
    if (selectAccount) request.setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT)
    client
      .authorize(request.build())
      .addOnSuccessListener { result ->
        val intent = result.pendingIntent
        done(if (result.hasResolution() && intent != null) Authorization.NeedsSheet(intent) else granted(result))
      }
      .addOnFailureListener { done(failed(it)) }
  }

  override fun showSheet(sheet: Any, done: (Authorization) -> Unit) {
    // One sheet at a time (GoogleAuth joins a second Connect to the first).
    this.sheet?.invoke(Authorization.Failed(GoogleAuthError.CANCELLED, "another sheet"))
    this.sheet = done
    try {
      @Suppress("DEPRECATION")
      activity.startIntentSenderForResult((sheet as PendingIntent).intentSender, REQUEST_SHEET, null, 0, 0, 0)
    } catch (e: IntentSender.SendIntentException) {
      this.sheet = null
      done(Authorization.Failed(GoogleAuthError.UNAUTHORIZED, "the sheet did not open: $e"))
    }
  }

  /**
   * The activity's result; true when it was the sheet's. A closed sheet gives RESULT_CANCELED,
   * and reading its result throws ApiException 16 (M7a): `cancelled`.
   */
  fun onResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
    if (requestCode != REQUEST_SHEET) return false
    val done = sheet ?: return true
    sheet = null
    val result =
      try {
        granted(client.getAuthorizationResultFromIntent(data))
      } catch (e: Exception) {
        if (resultCode == Activity.RESULT_CANCELED && e !is ApiException) Authorization.Failed(GoogleAuthError.CANCELLED, "closed")
        else failed(e)
      }
    done(result)
    return true
  }

  override fun clearToken(token: String, done: () -> Unit) {
    client
      .clearToken(ClearTokenRequest.builder().setToken(token).build())
      .addOnFailureListener { Log.w(TAG, "googleAuth: clearToken failed: ${describe(it)}") }
      .addOnCompleteListener { done() }
  }

  private fun granted(result: AuthorizationResult): Authorization {
    val token = result.accessToken ?: return Authorization.Failed(GoogleAuthError.UNAUTHORIZED, "no access token")
    return Authorization.Granted(token, expiresIn(result))
  }

  /** `expires_in` of the token response, when Play services passes it on. */
  private fun expiresIn(result: AuthorizationResult): Long? {
    val params = result.tokenResponseParams ?: return null
    @Suppress("DEPRECATION")
    return when (val value = params.get("expires_in")) {
      is Number -> value.toLong()
      is String -> value.toLongOrNull()
      else -> null
    }
  }

  private fun failed(error: Exception): Authorization =
    Authorization.Failed(if (error is ApiException) GoogleAuthError.ofStatusCode(error.statusCode) else GoogleAuthError.UNAUTHORIZED, describe(error))

  private fun describe(error: Exception) =
    if (error is ApiException) "ApiException ${error.statusCode}" else "${error.javaClass.simpleName}: ${error.message}"

  companion object {
    const val DRIVE_APPDATA = "https://www.googleapis.com/auth/drive.appdata"
    private const val REQUEST_SHEET = 47

    /** Whether Google Play services is on the phone and usable: without it the app offers no provider. */
    fun available(context: Context): Boolean =
      try {
        GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
      } catch (e: Exception) {
        Log.w(TAG, "googleAuth: no Play services: $e")
        false
      }
  }
}
