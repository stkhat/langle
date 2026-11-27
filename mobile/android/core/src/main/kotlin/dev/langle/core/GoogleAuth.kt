package dev.langle.core

import kotlinx.serialization.json.JsonElement

/** `appHost.googleAuth.token`'s error answers (`AppGoogleAuthError` in src/core/app-host.ts). */
enum class GoogleAuthError(val value: String) {
  /** The user closed Google's sheet or declined: their answer, not a failure. */
  CANCELLED("cancelled"),

  /** No grant, or a sign-in that did not work: the background shows Reconnect needed. */
  UNAUTHORIZED("unauthorized"),

  /** Google could not be reached (offline): try again later. */
  RETRY("retry");

  companion object {
    /**
     * A Google Play services status code (`CommonStatusCodes`): CANCELED (16) is the user's
     * answer; NETWORK_ERROR (7), INTERNAL_ERROR (8), INTERRUPTED (14) and TIMEOUT (15) are
     * worth trying again; anything else is a sign-in that did not work.
     */
    fun ofStatusCode(code: Int): GoogleAuthError =
      when (code) {
        16 -> CANCELLED
        7, 8, 14, 15 -> RETRY
        else -> UNAUTHORIZED
      }
  }
}

/** What Play services' `AuthorizationClient.authorize` (or its sheet) answered. */
sealed interface Authorization {
  /** An access token; `expiresInSeconds` when Play services said how long it lasts. */
  data class Granted(val token: String, val expiresInSeconds: Long? = null) : Authorization

  /** Google's sheet has to show (the result's `PendingIntent`, opaque here). */
  data class NeedsSheet(val sheet: Any) : Authorization

  data class Failed(val error: GoogleAuthError, val reason: String) : Authorization
}

/**
 * Play services' `AuthorizationClient` as the app uses it, with the scope `drive.appdata`
 * (docs/notes/mobile.md "Drive sign-in (M7a)"); the tests give a fake. Answers come on the main
 * thread.
 */
interface GoogleAuthorizer {
  /** `authorize`; `selectAccount`: with `Prompt.SELECT_ACCOUNT`, so the sheet offers the accounts. */
  fun authorize(selectAccount: Boolean, done: (Authorization) -> Unit)

  /** Shows Google's sheet (the account chooser, then consent); done with what it gave. */
  fun showSheet(sheet: Any, done: (Authorization) -> Unit)

  /** `clearToken`: Play services drops its cached copy. It revokes nothing (M7a). */
  fun clearToken(token: String, done: () -> Unit)
}

/**
 * The calls in [GOOGLE_AUTH_APIS] (`Router.onGoogleAuth`; docs/specs/mobile-app.md "M7"), over
 * Play services. Play services keeps the grant and renews tokens; the app keeps no refresh token,
 * only whether this device is connected (so a silent call after Disconnect does not quietly sign
 * in again) and, in memory, the last token it handed out.
 * - `token({ interactive: false })`: a token without UI, or `unauthorized` when Google's sheet
 *   would have to show (or after `forget`);
 * - `token({ interactive: true })`: the sheet when it is needed; with the account chooser when
 *   this device is not connected (the first Connect, or the next one after `forget`: M7a found
 *   that a plain `authorize` after Disconnect signs in again with the same account at once);
 * - `refused`: a token that got a 401; Play services drops it (`clearToken`), then renews;
 * - `forget`: Disconnect; clears the cached token and remembers that this device is not
 *   connected. Nothing is revoked at Google, so the user's other devices stay signed in.
 */
class GoogleAuth(
  private val authorizer: GoogleAuthorizer,
  private val persistence: Persistence,
  private val clock: Clock,
) {
  var onLog: ((String) -> Unit)? = null

  private var connected = persistence.load(KEY).obj?.get("connected").bool == true

  /** The last token handed out, so `forget` can clear it. */
  private var last: String? = null

  /** The callers of the interactive sign-in going on: a second Connect waits for the same one. */
  private var signingIn: MutableList<(JsonElement) -> Unit>? = null

  /** Whether this device is connected (it got a token since the last `forget`). */
  val isConnected: Boolean
    get() = connected

  fun handle(api: String, request: JsonElement?, done: (Answer) -> Unit) {
    when (api) {
      "appHost.googleAuth.token" -> {
        val o = request.obj
        token(o?.get("interactive").bool == true, o?.get("refused").string) { done(Answer.Value(it)) }
      }
      "appHost.googleAuth.forget" -> forget { done(Answer.Value(null)) }
      else -> done(Answer.Failure(notAvailable(api)))
    }
  }

  private fun token(interactive: Boolean, refused: String?, answer: (JsonElement) -> Unit) {
    if (refused == null) return ask(interactive, answer)
    if (last == refused) last = null
    authorizer.clearToken(refused) { ask(interactive, answer) }
  }

  private fun ask(interactive: Boolean, answer: (JsonElement) -> Unit) {
    if (!interactive) {
      if (!connected) return answer(error(GoogleAuthError.UNAUTHORIZED))
      authorizer.authorize(selectAccount = false) { result ->
        when (result) {
          is Authorization.Granted -> answer(granted(result))
          is Authorization.NeedsSheet -> answer(error(GoogleAuthError.UNAUTHORIZED, "the sheet would have to show"))
          is Authorization.Failed -> answer(error(result.error, result.reason))
        }
      }
      return
    }
    signingIn?.let {
      it += answer
      return
    }
    val waiting = mutableListOf(answer)
    signingIn = waiting
    val finish = { value: JsonElement ->
      signingIn = null
      for (each in waiting) each(value)
    }
    authorizer.authorize(selectAccount = !connected) { result ->
      when (result) {
        is Authorization.Granted -> finish(granted(result))
        is Authorization.NeedsSheet ->
          authorizer.showSheet(result.sheet) { shown ->
            finish(
              when (shown) {
                is Authorization.Granted -> granted(shown)
                is Authorization.NeedsSheet -> error(GoogleAuthError.UNAUTHORIZED, "the sheet asked for another sheet")
                is Authorization.Failed -> error(shown.error, shown.reason)
              },
            )
          }
        is Authorization.Failed -> finish(error(result.error, result.reason))
      }
    }
  }

  private fun granted(result: Authorization.Granted): JsonElement {
    last = result.token
    if (!connected) setConnected(true)
    val lifetime = result.expiresInSeconds?.takeIf { it > 0 } ?: ASSUMED_LIFETIME_S
    return jsonObject("token" to result.token, "expiresAt" to clock.now() + lifetime * 1000.0)
  }

  private fun error(error: GoogleAuthError, reason: String? = null): JsonElement {
    reason?.let { onLog?.invoke("token: ${error.value} ($it)") }
    return jsonObject("error" to error.value)
  }

  private fun forget(done: () -> Unit) {
    setConnected(false)
    val token = last ?: return done()
    last = null
    authorizer.clearToken(token, done)
  }

  private fun setConnected(value: Boolean) {
    connected = value
    try {
      persistence.save(KEY, jsonObject("connected" to value))
    } catch (e: Exception) {
      onLog?.invoke("could not save whether the device is connected: $e")
    }
  }

  companion object {
    const val KEY = "googleAuth"

    /**
     * How long a token is taken to last when Play services does not say. Google's access tokens
     * last an hour, but Play services may hand out a cached one partly used; a token that ends
     * sooner gets a 401, and the background asks again with `refused`.
     */
    const val ASSUMED_LIFETIME_S = 30 * 60L
  }
}
