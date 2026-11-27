import Foundation
import LangleCore
import Security
import XCTest

/// The system's sheet as the tests drive it: every sheet waits until the test ends it.
private final class FakeSheet: GoogleSignInSheet {
  private(set) var shown: [(url: URL, scheme: String, done: (SignInSheetResult) -> Void)] = []

  func show(_ url: URL, callbackScheme: String, _ done: @escaping (SignInSheetResult) -> Void) {
    shown.append((url, callbackScheme, done))
  }

  func query(_ index: Int) -> [String: String] {
    let items = URLComponents(url: shown[index].url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    return Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { a, _ in a })
  }

  /// Google's redirect after the user allowed: the code and the sheet's own state.
  func allow(_ index: Int, code: String = "4/code", state: String? = nil) {
    let state = state ?? query(index)["state"]!
    let url = URL(string: "\(GoogleOAuthClient.langle.redirectURI)?state=\(state)&code=\(code)&scope=drive.appdata")!
    shown[index].done(.callback(url))
  }
}

/// Google's token endpoint as the tests drive it: every post waits until the test answers it.
private final class FakeEndpoint: GoogleTokenEndpoint {
  private(set) var posts: [(form: [String: String], done: (TokenEndpointAnswer) -> Void)] = []

  func post(_ form: [String: String], _ done: @escaping (TokenEndpointAnswer) -> Void) {
    posts.append((form, done))
  }

  func answer(_ index: Int, _ status: Int, _ body: JSONValue) {
    posts[index].done(.answered(status: status, body: Data(body.json.utf8)))
  }

  func grant(_ index: Int, access: String, refresh: String? = nil, expiresIn: Double = 3599) {
    var body: [String: JSONValue] = [
      "access_token": .string(access), "expires_in": .number(expiresIn), "token_type": "Bearer",
      "scope": .string(GoogleOAuthClient.langle.scope),
    ]
    if let refresh { body["refresh_token"] = .string(refresh) }
    answer(index, 200, .object(body))
  }
}

final class GoogleAuthTests: XCTestCase {
  private var clock: ManualClock!
  private var sheet: FakeSheet!
  private var endpoint: FakeEndpoint!
  private var store: MemoryRefreshTokenStore!
  private var persistence: MemoryPersistence!
  private var auth: GoogleAuth!
  private var logs: [String] = []

  override func setUp() {
    clock = ManualClock(now: 1_000_000)
    sheet = FakeSheet()
    endpoint = FakeEndpoint()
    store = MemoryRefreshTokenStore()
    persistence = MemoryPersistence()
    logs = []
    makeAuth()
  }

  /// A new GoogleAuth on the same store and Keychain, as after the app's restart.
  private func makeAuth() {
    auth = GoogleAuth(sheet: sheet, endpoint: endpoint, store: store, persistence: persistence, clock: clock)
    auth.onLog = { [unowned self] in logs.append($0) }
  }

  private func connected(refresh: String = "1//refresh") {
    persistence.save(GoogleAuth.key, ["connected": true])
    store.token = refresh
    makeAuth()
  }

  /// Calls `appHost.googleAuth.token`; the answer lands in the returned box.
  private func token(interactive: Bool, refused: String? = nil) -> Pending {
    var request: [String: JSONValue] = ["interactive": .bool(interactive)]
    if let refused { request["refused"] = .string(refused) }
    let box = Pending()
    auth.handle("appHost.googleAuth.token", .object(request)) { box.result = $0 }
    return box
  }

  private func tokenValue(_ token: String, expiresIn: Double = 3599) -> JSONValue {
    ["token": .string(token), "expiresAt": .number(clock.now() + expiresIn * 1000)]
  }

  private let cancelled: JSONValue = ["error": "cancelled"]
  private let unauthorized: JSONValue = ["error": "unauthorized"]
  private let retry: JSONValue = ["error": "retry"]

  // MARK: Connect

  func test_the_first_connect_shows_the_sheet_with_the_account_chooser_and_exchanges_the_code_with_pkce() {
    let answer = token(interactive: true)
    XCTAssertEqual(sheet.shown.count, 1)
    XCTAssertEqual(sheet.shown[0].scheme, GoogleOAuthClient.langle.redirectScheme)
    let url = sheet.shown[0].url
    XCTAssertEqual(url.host, "accounts.google.com")
    XCTAssertEqual(url.path, "/o/oauth2/v2/auth")
    let query = sheet.query(0)
    XCTAssertEqual(query["client_id"], GoogleOAuthClient.langle.clientId)
    XCTAssertEqual(
      query["redirect_uri"],
      "com.googleusercontent.apps.191564468385-kil3pjtfv2ai5p0bud9fh7n5rj68c2pl:/oauth2redirect")
    XCTAssertEqual(query["response_type"], "code")
    XCTAssertEqual(query["scope"], "https://www.googleapis.com/auth/drive.appdata")
    XCTAssertEqual(query["code_challenge_method"], "S256")
    XCTAssertEqual(query["prompt"], "select_account")
    XCTAssertEqual(query["state"]?.count, 43)
    XCTAssertFalse(answer.settled)

    sheet.allow(0, code: "4/the-code")
    XCTAssertEqual(endpoint.posts.count, 1)
    let form = endpoint.posts[0].form
    XCTAssertEqual(form["grant_type"], "authorization_code")
    XCTAssertEqual(form["code"], "4/the-code")
    XCTAssertEqual(form["client_id"], GoogleOAuthClient.langle.clientId)
    XCTAssertEqual(form["redirect_uri"], GoogleOAuthClient.langle.redirectURI)
    XCTAssertEqual(Pkce.challenge(form["code_verifier"]!), query["code_challenge"])
    XCTAssertNil(form["client_secret"])
    XCTAssertFalse(auth.isConnected)

    endpoint.grant(0, access: "ya29.first", refresh: "1//first")
    XCTAssertEqual(answer.value, tokenValue("ya29.first"))
    XCTAssertEqual(store.token, "1//first")
    XCTAssertTrue(auth.isConnected)
    XCTAssertEqual(persistence.saved[GoogleAuth.key], ["connected": true])
  }

  func test_each_sheet_has_its_own_verifier_and_state() {
    _ = token(interactive: true)
    sheet.shown[0].done(.cancelled)
    _ = token(interactive: true)
    XCTAssertNotEqual(sheet.query(0)["state"], sheet.query(1)["state"])
    XCTAssertNotEqual(sheet.query(0)["code_challenge"], sheet.query(1)["code_challenge"])
  }

  func test_closing_the_sheet_or_declining_at_google_is_cancelled() {
    let closed = token(interactive: true)
    sheet.shown[0].done(.cancelled)
    XCTAssertEqual(closed.value, cancelled)

    let declined = token(interactive: true)
    let state = sheet.query(1)["state"]!
    sheet.shown[1].done(.callback(URL(string: "\(GoogleOAuthClient.langle.redirectURI)?error=access_denied&state=\(state)")!))
    XCTAssertEqual(declined.value, cancelled)
    XCTAssertTrue(endpoint.posts.isEmpty)
    XCTAssertFalse(auth.isConnected)
  }

  func test_a_sheet_that_fails_a_wrong_state_or_a_refused_code_is_unauthorized() {
    let failed = token(interactive: true)
    sheet.shown[0].done(.failed("presentationContextNotProvided"))
    XCTAssertEqual(failed.value, unauthorized)

    let wrongState = token(interactive: true)
    sheet.allow(1, state: "not-the-sheets-state")
    XCTAssertEqual(wrongState.value, unauthorized)
    XCTAssertTrue(endpoint.posts.isEmpty)

    let otherError = token(interactive: true)
    let state = sheet.query(2)["state"]!
    sheet.shown[2].done(.callback(URL(string: "\(GoogleOAuthClient.langle.redirectURI)?error=invalid_scope&state=\(state)")!))
    XCTAssertEqual(otherError.value, unauthorized)

    let refusedCode = token(interactive: true)
    sheet.allow(3)
    endpoint.answer(0, 400, ["error": "invalid_grant", "error_description": "Bad Request"])
    XCTAssertEqual(refusedCode.value, unauthorized)
    XCTAssertFalse(auth.isConnected)
    XCTAssertNil(store.token)
    XCTAssertTrue(logs.contains { $0.contains("invalid_grant") }, "\(logs)")
  }

  func test_an_exchange_that_cannot_reach_google_is_retry() {
    let answer = token(interactive: true)
    sheet.allow(0)
    endpoint.posts[0].done(.unreachable("NSURLErrorDomain -1009"))
    XCTAssertEqual(answer.value, retry)
    XCTAssertFalse(auth.isConnected)
  }

  func test_a_second_connect_while_the_sheet_shows_waits_for_the_same_sheet() {
    let first = token(interactive: true)
    let second = token(interactive: true)
    XCTAssertEqual(sheet.shown.count, 1)
    sheet.allow(0)
    endpoint.grant(0, access: "ya29.once", refresh: "1//once")
    XCTAssertEqual(first.value, tokenValue("ya29.once"))
    XCTAssertEqual(second.value, tokenValue("ya29.once"))
  }

  // MARK: renewal

  func test_a_silent_call_renews_with_the_refresh_token_and_no_secret_then_keeps_the_token() {
    connected(refresh: "1//kept")
    let answer = token(interactive: false)
    XCTAssertTrue(sheet.shown.isEmpty)
    XCTAssertEqual(
      endpoint.posts[0].form,
      ["grant_type": "refresh_token", "refresh_token": "1//kept", "client_id": GoogleOAuthClient.langle.clientId])
    endpoint.grant(0, access: "ya29.renewed")
    XCTAssertEqual(answer.value, tokenValue("ya29.renewed"))
    // No new refresh token in the answer: the kept one stays.
    XCTAssertEqual(store.token, "1//kept")

    let expiresAt = clock.now() + 3_599_000
    clock.advance(by: 3_599_000 - GoogleAuth.expiryMarginMs - 1, between: {})
    XCTAssertEqual(token(interactive: false).value, ["token": "ya29.renewed", "expiresAt": .number(expiresAt)])
    XCTAssertEqual(endpoint.posts.count, 1)

    clock.advance(by: 1, between: {})
    let late = token(interactive: false)
    XCTAssertEqual(endpoint.posts.count, 2)
    endpoint.grant(1, access: "ya29.later", refresh: "1//rotated")
    XCTAssertEqual(late.value, tokenValue("ya29.later"))
    XCTAssertEqual(store.token, "1//rotated")
  }

  func test_a_refused_token_is_dropped_and_renewed() {
    connected()
    _ = token(interactive: false)
    endpoint.grant(0, access: "ya29.refused")
    let answer = token(interactive: false, refused: "ya29.refused")
    XCTAssertEqual(endpoint.posts.count, 2)
    endpoint.grant(1, access: "ya29.fresh")
    XCTAssertEqual(answer.value, tokenValue("ya29.fresh"))
    // Another token refused (an older one) does not drop the kept one.
    XCTAssertEqual(token(interactive: false, refused: "ya29.older").value, tokenValue("ya29.fresh"))
    XCTAssertEqual(endpoint.posts.count, 2)
  }

  func test_calls_during_a_renewal_wait_for_it() {
    connected()
    let first = token(interactive: false)
    let second = token(interactive: false)
    XCTAssertEqual(endpoint.posts.count, 1)
    endpoint.grant(0, access: "ya29.shared")
    XCTAssertEqual(first.value, tokenValue("ya29.shared"))
    XCTAssertEqual(second.value, tokenValue("ya29.shared"))
  }

  func test_invalid_grant_is_unauthorized_and_drops_the_refresh_token_then_reconnect_shows_the_sheet() {
    connected(refresh: "1//ended")
    let answer = token(interactive: false)
    endpoint.answer(0, 400, ["error": "invalid_grant", "error_description": "Token has been expired or revoked."])
    XCTAssertEqual(answer.value, unauthorized)
    XCTAssertNil(store.token)
    // Still connected: the background shows Reconnect needed.
    XCTAssertTrue(auth.isConnected)
    XCTAssertEqual(token(interactive: false).value, unauthorized)
    XCTAssertEqual(endpoint.posts.count, 1)

    // Reconnect: the sheet at once, for the same account (no chooser).
    let reconnect = token(interactive: true)
    XCTAssertEqual(sheet.shown.count, 1)
    XCTAssertNil(sheet.query(0)["prompt"])
    sheet.allow(0)
    endpoint.grant(1, access: "ya29.back", refresh: "1//back")
    XCTAssertEqual(reconnect.value, tokenValue("ya29.back"))
    XCTAssertEqual(store.token, "1//back")
  }

  func test_an_interactive_call_while_connected_renews_without_the_sheet() {
    connected()
    let answer = token(interactive: true)
    XCTAssertTrue(sheet.shown.isEmpty)
    endpoint.grant(0, access: "ya29.quiet")
    XCTAssertEqual(answer.value, tokenValue("ya29.quiet"))
  }

  func test_an_interactive_call_whose_renewal_is_refused_shows_the_sheet() {
    connected()
    let answer = token(interactive: true)
    endpoint.answer(0, 400, ["error": "invalid_grant"])
    XCTAssertEqual(sheet.shown.count, 1)
    XCTAssertFalse(answer.settled)
    sheet.shown[0].done(.cancelled)
    XCTAssertEqual(answer.value, cancelled)
  }

  func test_a_renewal_that_cannot_reach_google_or_meets_its_trouble_is_retry_and_keeps_the_grant() {
    connected(refresh: "1//kept")
    let offline = token(interactive: false)
    endpoint.posts[0].done(.unreachable("NSURLErrorDomain -1009"))
    XCTAssertEqual(offline.value, retry)
    let down = token(interactive: false)
    endpoint.answer(1, 503, ["error": "backendError"])
    XCTAssertEqual(down.value, retry)
    let busy = token(interactive: true)
    endpoint.answer(2, 429, ["error": "rate_limit_exceeded"])
    XCTAssertEqual(busy.value, retry)
    XCTAssertTrue(sheet.shown.isEmpty)
    XCTAssertEqual(store.token, "1//kept")
    XCTAssertTrue(auth.isConnected)
  }

  func test_an_answer_without_an_access_token_is_unauthorized() {
    connected()
    let answer = token(interactive: false)
    endpoint.answer(0, 200, ["token_type": "Bearer"])
    XCTAssertEqual(answer.value, unauthorized)
  }

  func test_a_token_without_expires_in_is_taken_to_last_an_hour() {
    connected()
    let answer = token(interactive: false)
    endpoint.answer(0, 200, ["access_token": "ya29.plain"])
    XCTAssertEqual(answer.value, tokenValue("ya29.plain", expiresIn: GoogleAuth.assumedLifetimeS))
  }

  // MARK: not connected, Disconnect, restarts

  func test_a_silent_call_on_a_device_not_connected_is_unauthorized_even_with_an_old_keychain_item() {
    // A Keychain item outlives an uninstall; the app's store does not.
    store.token = "1//from-before-the-reinstall"
    let silent = token(interactive: false)
    XCTAssertEqual(silent.value, unauthorized)
    XCTAssertTrue(endpoint.posts.isEmpty)
    // Connect goes to the sheet with the chooser, not to the old grant.
    _ = token(interactive: true)
    XCTAssertEqual(sheet.query(0)["prompt"], "select_account")
    XCTAssertTrue(endpoint.posts.isEmpty)
  }

  func test_forget_drops_the_keychain_item_and_the_token_and_the_next_connect_shows_the_chooser() {
    connected()
    _ = token(interactive: false)
    endpoint.grant(0, access: "ya29.before")
    let forgot = Pending()
    auth.handle("appHost.googleAuth.forget", nil) { forgot.result = $0 }
    XCTAssertEqual(forgot.value, .some(nil))
    XCTAssertNil(store.token)
    XCTAssertFalse(auth.isConnected)
    XCTAssertEqual(persistence.saved[GoogleAuth.key], ["connected": false])
    XCTAssertEqual(token(interactive: false).value, unauthorized)
    XCTAssertEqual(endpoint.posts.count, 1)

    _ = token(interactive: true)
    XCTAssertEqual(sheet.query(0)["prompt"], "select_account")
  }

  func test_a_renewal_that_comes_back_after_forget_is_not_kept() {
    connected()
    let answer = token(interactive: false)
    auth.handle("appHost.googleAuth.forget", nil) { _ in }
    endpoint.grant(0, access: "ya29.late", refresh: "1//late")
    XCTAssertEqual(answer.value, unauthorized)
    XCTAssertNil(store.token)
    XCTAssertEqual(token(interactive: false).value, unauthorized)
  }

  func test_connected_survives_a_restart_and_the_access_token_does_not() {
    _ = token(interactive: true)
    sheet.allow(0)
    endpoint.grant(0, access: "ya29.memory", refresh: "1//disk")
    makeAuth()
    XCTAssertTrue(auth.isConnected)
    let answer = token(interactive: false)
    XCTAssertEqual(endpoint.posts.count, 2)
    XCTAssertEqual(endpoint.posts[1].form["refresh_token"], "1//disk")
    endpoint.grant(1, access: "ya29.new")
    XCTAssertEqual(answer.value, tokenValue("ya29.new"))
  }

  func test_an_unknown_call_is_not_available() {
    let box = Pending()
    auth.handle("appHost.googleAuth.revoke", nil) { box.result = $0 }
    XCTAssertEqual(box.error, "appHost.googleAuth.revoke is not available here.")
  }

  // MARK: pieces

  // RFC 7636, appendix B.
  func test_the_pkce_challenge_is_rfc_7636s() {
    XCTAssertEqual(
      Pkce.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    let verifier = Pkce.verifier()
    XCTAssertEqual(verifier.count, 43)
    XCTAssertNil(verifier.rangeOfCharacter(from: CharacterSet(charactersIn: "+/=")))
  }

  func test_the_form_escapes_everything_but_the_unreserved_characters() {
    let body = String(decoding: formBody(["refresh_token": "1//a+b=c&d e", "client_id": "x.apps"]), as: UTF8.self)
    XCTAssertEqual(body, "client_id=x.apps&refresh_token=1%2F%2Fa%2Bb%3Dc%26d%20e")
  }

  func test_the_keychain_item_stays_on_this_device() {
    let keychain = KeychainRefreshTokenStore()
    let item = keychain.item("1//secret")
    XCTAssertEqual(item[kSecClass as String] as? String, kSecClassGenericPassword as String)
    XCTAssertEqual(item[kSecAttrService as String] as? String, "dev.langle.app.google-drive")
    XCTAssertEqual(item[kSecAttrAccount as String] as? String, "refresh-token")
    XCTAssertEqual(
      item[kSecAttrAccessible as String] as? String, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
    XCTAssertEqual(item[kSecAttrSynchronizable as String] as? Bool, false)
    XCTAssertEqual(item[kSecValueData as String] as? Data, Data("1//secret".utf8))
    XCTAssertNil(keychain.query[kSecValueData as String])
  }
}
