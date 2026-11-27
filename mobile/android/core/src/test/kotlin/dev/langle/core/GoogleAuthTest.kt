package dev.langle.core

import kotlinx.serialization.json.JsonElement
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DisplayName
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

/** Play services' AuthorizationClient as M7a measured it, answered by hand. */
private class FakeAuthorizer : GoogleAuthorizer {
  /** What `authorize` answers next (one per call; the last one repeats). */
  val answers = ArrayDeque<Authorization>()
  /** What the sheet gives when it closes; null: it stays open until [closeSheet]. */
  var sheetAnswer: Authorization? = Authorization.Granted("ya29.from-sheet", 3599)
  val asked = mutableListOf<String>()
  private var openSheet: ((Authorization) -> Unit)? = null

  override fun authorize(selectAccount: Boolean, done: (Authorization) -> Unit) {
    asked += if (selectAccount) "authorize select-account" else "authorize"
    done(if (answers.size > 1) answers.removeFirst() else answers.first())
  }

  override fun showSheet(sheet: Any, done: (Authorization) -> Unit) {
    asked += "sheet $sheet"
    val answer = sheetAnswer
    if (answer != null) done(answer) else openSheet = done
  }

  fun closeSheet(answer: Authorization) {
    openSheet?.invoke(answer)
    openSheet = null
  }

  override fun clearToken(token: String, done: () -> Unit) {
    asked += "clearToken $token"
    done()
  }
}

private fun token(token: String, expiresAt: Double) = jsonOf(mapOf("token" to token, "expiresAt" to expiresAt))

private fun error(error: String) = jsonOf(mapOf("error" to error))

class GoogleAuthTest {
  private val authorizer = FakeAuthorizer()
  private val persistence = MemoryPersistence()
  private val clock = ManualClock(1_000_000.0)

  private fun auth() = GoogleAuth(authorizer, persistence, clock)

  private fun GoogleAuth.call(api: String, request: Map<String, Any?>? = null): JsonElement? {
    var answer: Answer? = null
    handle(api, request?.let(::jsonOf)) { answer = it }
    return (answer as Answer.Value).value
  }

  private fun GoogleAuth.token(vararg pairs: Pair<String, Any?>) = call("appHost.googleAuth.token", mapOf(*pairs))

  private fun connected(): GoogleAuth {
    persistence.save(GoogleAuth.KEY, jsonOf(mapOf("connected" to true)))
    return auth()
  }

  @Nested
  @DisplayName("silent")
  inner class Silent {
    @Test
    fun `answers Play services' token without UI, ending when Play services says`() {
      authorizer.answers += Authorization.Granted("ya29.cached", 1200)
      assertEquals(token("ya29.cached", 1_000_000.0 + 1_200_000.0), connected().token("interactive" to false))
      assertEquals(listOf("authorize"), authorizer.asked)
    }

    @Test
    fun `takes a token to last the assumed lifetime when Play services does not say`() {
      authorizer.answers += Authorization.Granted("ya29.cached")
      assertEquals(
        token("ya29.cached", 1_000_000.0 + GoogleAuth.ASSUMED_LIFETIME_S * 1000.0),
        connected().token("interactive" to false),
      )
    }

    @Test
    fun `answers unauthorized when Google's sheet would have to show, and never shows it`() {
      authorizer.answers += Authorization.NeedsSheet("intent")
      assertEquals(error("unauthorized"), connected().token("interactive" to false))
      assertEquals(listOf("authorize"), authorizer.asked)
    }

    @Test
    fun `answers unauthorized without asking Play services on a device not connected`() {
      authorizer.answers += Authorization.Granted("ya29.kept-grant")
      assertEquals(error("unauthorized"), auth().token("interactive" to false))
      assertEquals(emptyList<String>(), authorizer.asked)
    }

    @Test
    fun `answers retry when Google cannot be reached`() {
      authorizer.answers += Authorization.Failed(GoogleAuthError.RETRY, "ApiException 7")
      assertEquals(error("retry"), connected().token("interactive" to false))
    }
  }

  @Nested
  @DisplayName("interactive")
  inner class Interactive {
    @Test
    fun `the first Connect offers the accounts and shows Google's sheet`() {
      authorizer.answers += Authorization.NeedsSheet("intent")
      val auth = auth()
      assertEquals(token("ya29.from-sheet", 1_000_000.0 + 3_599_000.0), auth.token("interactive" to true))
      assertEquals(listOf("authorize select-account", "sheet intent"), authorizer.asked)
      assertTrue(auth.isConnected)
      assertEquals(jsonOf(mapOf("connected" to true)), persistence.saved[GoogleAuth.KEY])
    }

    @Test
    fun `Reconnect on a connected device asks without the chooser`() {
      authorizer.answers += Authorization.NeedsSheet("intent")
      connected().token("interactive" to true)
      assertEquals(listOf("authorize", "sheet intent"), authorizer.asked)
    }

    @Test
    fun `a token without a sheet needs no UI`() {
      authorizer.answers += Authorization.Granted("ya29.at-once", 3599)
      assertEquals(token("ya29.at-once", 1_000_000.0 + 3_599_000.0), connected().token("interactive" to true))
      assertEquals(listOf("authorize"), authorizer.asked)
    }

    @Test
    fun `a closed sheet answers cancelled and leaves the device not connected`() {
      authorizer.answers += Authorization.NeedsSheet("intent")
      authorizer.sheetAnswer = Authorization.Failed(GoogleAuthError.CANCELLED, "ApiException 16")
      val auth = auth()
      assertEquals(error("cancelled"), auth.token("interactive" to true))
      assertFalse(auth.isConnected)
      assertNull(persistence.saved[GoogleAuth.KEY])
    }

    @Test
    fun `a second Connect while the sheet shows gets the same answer`() {
      authorizer.answers += Authorization.NeedsSheet("intent")
      authorizer.sheetAnswer = null
      val auth = auth()
      val answers = mutableListOf<Answer>()
      repeat(2) { auth.handle("appHost.googleAuth.token", jsonOf(mapOf("interactive" to true))) { answers += it } }
      assertEquals(listOf("authorize select-account", "sheet intent"), authorizer.asked)
      authorizer.closeSheet(Authorization.Granted("ya29.chosen", 3599))
      assertEquals(List(2) { Answer.Value(token("ya29.chosen", 1_000_000.0 + 3_599_000.0)) }, answers)
    }

    @Test
    fun `a failure Play services answers is the token's error`() {
      authorizer.answers += Authorization.Failed(GoogleAuthError.UNAUTHORIZED, "ApiException 10")
      assertEquals(error("unauthorized"), auth().token("interactive" to true))
    }
  }

  @Nested
  @DisplayName("refused and forget")
  inner class RefusedAndForget {
    @Test
    fun `a refused token is cleared, then renewed silently`() {
      authorizer.answers += Authorization.Granted("ya29.first", 3599)
      authorizer.answers += Authorization.Granted("ya29.renewed", 3599)
      val auth = connected()
      auth.token("interactive" to false)
      assertEquals(token("ya29.renewed", 1_000_000.0 + 3_599_000.0), auth.token("interactive" to false, "refused" to "ya29.first"))
      assertEquals(listOf("authorize", "clearToken ya29.first", "authorize"), authorizer.asked)
    }

    @Test
    fun `forget clears the cached token, and the next Connect offers the accounts again`() {
      authorizer.answers += Authorization.Granted("ya29.first", 3599)
      val auth = connected()
      auth.token("interactive" to false)
      assertNull(auth.call("appHost.googleAuth.forget"))
      assertEquals(listOf("authorize", "clearToken ya29.first"), authorizer.asked)
      assertFalse(auth.isConnected)
      assertEquals(jsonOf(mapOf("connected" to false)), persistence.saved[GoogleAuth.KEY])

      assertEquals(error("unauthorized"), auth.token("interactive" to false))
      auth.token("interactive" to true)
      assertEquals("authorize select-account", authorizer.asked.last())
    }

    @Test
    fun `forget with no token handed out clears nothing`() {
      assertNull(connected().call("appHost.googleAuth.forget"))
      assertEquals(emptyList<String>(), authorizer.asked)
    }

    @Test
    fun `whether the device is connected outlives the app`() {
      authorizer.answers += Authorization.Granted("ya29.first", 3599)
      auth().token("interactive" to true)
      assertTrue(auth().isConnected)
      auth().call("appHost.googleAuth.forget")
      assertFalse(auth().isConnected)
    }
  }

  @Test
  fun `Play services' status codes map to the background's answers`() {
    assertEquals(GoogleAuthError.CANCELLED, GoogleAuthError.ofStatusCode(16))
    for (code in listOf(7, 8, 14, 15)) assertEquals(GoogleAuthError.RETRY, GoogleAuthError.ofStatusCode(code))
    for (code in listOf(4, 10, 13, 17)) assertEquals(GoogleAuthError.UNAUTHORIZED, GoogleAuthError.ofStatusCode(code))
  }
}
