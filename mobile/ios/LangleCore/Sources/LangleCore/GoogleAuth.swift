import CryptoKit
import Foundation
import Security

/// `appHost.googleAuth.token`'s error answers (`AppGoogleAuthError` in src/core/app-host.ts).
public enum GoogleAuthError: String, Sendable {
  /// The user closed the sheet (or iOS's "wants to use accounts.google.com" alert) or declined
  /// at Google: their answer, not a failure.
  case cancelled
  /// No grant, or a sign-in that did not work: the background shows Reconnect needed.
  case unauthorized
  /// Google could not be reached (offline, or its server failed): try again later.
  case retry
}

/// Langle's iOS OAuth client in its Cloud project (docs/notes/mobile.md "Drive sign-in (M7a)").
/// Client ids are public; an iOS client has no secret.
public struct GoogleOAuthClient: Sendable {
  public let clientId: String
  /// The client's reversed id: the redirect's scheme.
  public let redirectScheme: String
  public let scope: String

  public init(clientId: String, redirectScheme: String, scope: String) {
    self.clientId = clientId
    self.redirectScheme = redirectScheme
    self.scope = scope
  }

  public var redirectURI: String { "\(redirectScheme):/oauth2redirect" }

  public static let langle = GoogleOAuthClient(
    clientId: "191564468385-kil3pjtfv2ai5p0bud9fh7n5rj68c2pl.apps.googleusercontent.com",
    redirectScheme: "com.googleusercontent.apps.191564468385-kil3pjtfv2ai5p0bud9fh7n5rj68c2pl",
    scope: "https://www.googleapis.com/auth/drive.appdata")

  public static let authorizationURL = URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
  public static let tokenURL = URL(string: "https://oauth2.googleapis.com/token")!
}

/// PKCE (RFC 7636) with S256: the code flow's proof in place of a client secret.
public enum Pkce {
  /// 32 random bytes, base64url: 43 characters (also the sheet's `state`).
  public static func verifier() -> String {
    base64URL(Data((0..<32).map { _ in UInt8.random(in: .min ... .max) }))
  }

  public static func challenge(_ verifier: String) -> String {
    base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
  }

  static func base64URL(_ data: Data) -> String {
    data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }
}

/// What the system's sign-in sheet (`ASWebAuthenticationSession`) ended with.
public enum SignInSheetResult: Equatable, Sendable {
  /// The redirect to the client's scheme, with Google's answer in its query.
  case callback(URL)
  /// Closed by the user (iOS's alert's Cancel, or the sheet's): `canceledLogin`.
  case cancelled
  /// The sheet could not show, or failed otherwise.
  case failed(String)
}

/// The system's sign-in sheet; the app gives `ASWebAuthenticationSession`, the tests a fake.
/// Answers come on the main thread.
public protocol GoogleSignInSheet: AnyObject {
  func show(_ url: URL, callbackScheme: String, _ done: @escaping (SignInSheetResult) -> Void)
}

/// What Google's token endpoint answered: a status and a body, or that it could not be reached.
public enum TokenEndpointAnswer: Equatable, Sendable {
  case answered(status: Int, body: Data)
  case unreachable(String)
}

/// `POST https://oauth2.googleapis.com/token` with a form (`formBody`); the app gives
/// `URLSession`, the tests a fake. Answers come on the main thread.
public protocol GoogleTokenEndpoint: AnyObject {
  func post(_ form: [String: String], _ done: @escaping (TokenEndpointAnswer) -> Void)
}

/// `application/x-www-form-urlencoded`: every character but the unreserved ones escaped, keys in
/// order.
public func formBody(_ form: [String: String]) -> Data {
  let unreserved = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
  func escape(_ text: String) -> String { text.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "" }
  return Data(form.sorted { $0.key < $1.key }.map { "\(escape($0.key))=\(escape($0.value))" }.joined(separator: "&").utf8)
}

/// Where the refresh token is kept: the Keychain in the app, memory in the tests.
public protocol RefreshTokenStore: AnyObject {
  func load() -> String?
  func save(_ token: String) throws
  func delete()
}

/// The refresh token in the Keychain, this device only: never in iCloud Keychain or a backup
/// moved to another phone (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`), and readable
/// after the first unlock, so a renewal in the background works.
public final class KeychainRefreshTokenStore: RefreshTokenStore {
  public struct Failure: Error, Equatable { public let status: OSStatus }

  public let service: String
  public let account: String

  public init(service: String = "dev.langle.app.google-drive", account: String = "refresh-token") {
    self.service = service
    self.account = account
  }

  /// The item, without its data.
  public var query: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  /// What `save` adds.
  public func item(_ token: String) -> [String: Any] {
    var item = query
    item[kSecValueData as String] = Data(token.utf8)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    item[kSecAttrSynchronizable as String] = false
    return item
  }

  public func load() -> String? {
    var search = query
    search[kSecReturnData as String] = true
    search[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    guard SecItemCopyMatching(search as CFDictionary, &out) == errSecSuccess, let data = out as? Data
    else { return nil }
    return String(decoding: data, as: UTF8.self)
  }

  public func save(_ token: String) throws {
    SecItemDelete(query as CFDictionary)
    let status = SecItemAdd(item(token) as CFDictionary, nil)
    if status != errSecSuccess { throw Failure(status: status) }
  }

  public func delete() { SecItemDelete(query as CFDictionary) }
}

/// A refresh token kept in memory (tests).
public final class MemoryRefreshTokenStore: RefreshTokenStore {
  public var token: String?
  public init(_ token: String? = nil) { self.token = token }
  public func load() -> String? { token }
  public func save(_ token: String) { self.token = token }
  public func delete() { token = nil }
}

/// The calls in `googleAuthApis` (`Router.onGoogleAuth`; docs/specs/mobile-app.md "M7"): the
/// authorization code flow with PKCE against Langle's iOS client, in the system's sheet, and
/// renewals with the refresh token, which is kept in the Keychain. Access tokens live in memory
/// only. Whether this device is connected is kept too (in the app's store, which goes with the
/// app; a Keychain item outlives an uninstall), so nothing signs in quietly after Disconnect or a
/// reinstall.
/// - `token({ interactive: false })`: the kept access token while it has more than a minute
///   left, else a renewal; `unauthorized` when not connected or the grant is gone
///   (`invalid_grant`: the refresh token is dropped), `retry` when Google cannot be reached;
/// - `token({ interactive: true })`: as above while connected and the grant works, else the
///   sheet; with Google's account chooser (`prompt=select_account`) when this device is not
///   connected (the first Connect, or the next one after `forget`);
/// - `refused`: a token that got a 401: dropped, then renewed;
/// - `forget`: Disconnect; the Keychain item and the access token go, and this device is not
///   connected. Nothing is revoked at Google, so the user's other devices stay signed in.
/// Main thread only, like the router.
public final class GoogleAuth {
  /// The name `connected` is kept under in the app's store.
  public static let key = "googleAuth"
  /// A kept access token is renewed this long before it ends.
  public static let expiryMarginMs = 60_000.0
  /// How long an access token is taken to last when Google does not say (it says 3599 s).
  public static let assumedLifetimeS = 3_600.0

  public var onLog: ((String) -> Void)?

  private enum Outcome {
    case token(String, expiresAt: Double)
    case failed(GoogleAuthError, String)

    var value: JSONValue {
      switch self {
      case .token(let token, let expiresAt): ["token": .string(token), "expiresAt": .number(expiresAt)]
      case .failed(let error, _): ["error": .string(error.rawValue)]
      }
    }
  }

  private let client: GoogleOAuthClient
  private let sheet: GoogleSignInSheet
  private let endpoint: GoogleTokenEndpoint
  private let store: RefreshTokenStore
  private let persistence: Persistence
  private let clock: Clock
  private var connected: Bool
  private var kept: (token: String, expiresAt: Double)?
  /// The callers waiting for the renewal going on, or for the sheet: a second call joins them.
  private var renewing: [(Outcome) -> Void]?
  private var signingIn: [(Outcome) -> Void]?
  /// Moves on at each `forget`: what an earlier renewal or sheet brings back is not kept.
  private var epoch = 0

  public init(
    client: GoogleOAuthClient = .langle, sheet: GoogleSignInSheet, endpoint: GoogleTokenEndpoint,
    store: RefreshTokenStore, persistence: Persistence, clock: Clock
  ) {
    self.client = client
    self.sheet = sheet
    self.endpoint = endpoint
    self.store = store
    self.persistence = persistence
    self.clock = clock
    connected = persistence.load(Self.key)?["connected"]?.bool == true
  }

  /// Whether this device is connected (it signed in since the last `forget`).
  public var isConnected: Bool { connected }

  public func handle(
    _ api: String, _ request: JSONValue?, _ done: @escaping (Result<JSONValue?, BridgeError>) -> Void
  ) {
    switch api {
    case "appHost.googleAuth.token":
      token(interactive: request?["interactive"]?.bool == true, refused: request?["refused"]?.string) {
        [weak self] outcome in
        if case .failed(let error, let reason) = outcome { self?.onLog?("token: \(error.rawValue) (\(reason))") }
        done(.success(outcome.value))
      }
    case "appHost.googleAuth.forget":
      forget()
      done(.success(nil))
    default:
      done(.failure(BridgeError(notAvailable(api))))
    }
  }

  private func token(interactive: Bool, refused: String?, _ answer: @escaping (Outcome) -> Void) {
    if let refused, kept?.token == refused { kept = nil }
    if !interactive && !connected { return answer(.failed(.unauthorized, "not connected")) }
    if connected, let kept, kept.expiresAt - Self.expiryMarginMs > clock.now() {
      return answer(.token(kept.token, expiresAt: kept.expiresAt))
    }
    if !interactive { return renew(answer) }
    guard connected, store.load() != nil else { return signIn(answer) }
    renew { [weak self] outcome in
      if case .failed(.unauthorized, _) = outcome { self?.signIn(answer) } else { answer(outcome) }
    }
  }

  // MARK: renewal

  private func renew(_ answer: @escaping (Outcome) -> Void) {
    guard let refreshToken = store.load() else {
      return answer(.failed(.unauthorized, "no refresh token"))
    }
    if renewing != nil {
      renewing?.append(answer)
      return
    }
    renewing = [answer]
    let started = epoch
    endpoint.post([
      "grant_type": "refresh_token", "refresh_token": refreshToken, "client_id": client.clientId,
    ]) { [weak self] reply in
      guard let self else { return }
      let outcome = took(reply, epoch: started, connecting: false)
      // The grant is gone (`invalid_grant`, also the end of a Testing project's 7 days): its
      // refresh token is dropped, unless a sign-in has put a new one in meanwhile.
      if case .failed(.unauthorized, _) = outcome, store.load() == refreshToken { store.delete() }
      let waiting = renewing ?? []
      renewing = nil
      for each in waiting { each(outcome) }
    }
  }

  // MARK: the sheet

  private func signIn(_ answer: @escaping (Outcome) -> Void) {
    if signingIn != nil {
      signingIn?.append(answer)
      return
    }
    signingIn = [answer]
    let verifier = Pkce.verifier()
    let state = Pkce.verifier()
    var parts = URLComponents(url: GoogleOAuthClient.authorizationURL, resolvingAgainstBaseURL: false)!
    parts.queryItems = [
      URLQueryItem(name: "client_id", value: client.clientId),
      URLQueryItem(name: "redirect_uri", value: client.redirectURI),
      URLQueryItem(name: "response_type", value: "code"),
      URLQueryItem(name: "scope", value: client.scope),
      URLQueryItem(name: "code_challenge", value: Pkce.challenge(verifier)),
      URLQueryItem(name: "code_challenge_method", value: "S256"),
      URLQueryItem(name: "state", value: state),
    ]
    // Google's account chooser on a first Connect and after Disconnect; a Reconnect keeps the
    // account the device was connected to.
    if !connected { parts.queryItems?.append(URLQueryItem(name: "prompt", value: "select_account")) }
    let started = epoch
    sheet.show(parts.url!, callbackScheme: client.redirectScheme) { [weak self] result in
      guard let self else { return }
      switch result {
      case .cancelled:
        finishSignIn(.failed(.cancelled, "the sheet was closed"))
      case .failed(let reason):
        finishSignIn(.failed(.unauthorized, "the sheet: \(reason)"))
      case .callback(let url):
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let value = { (name: String) in items.first { $0.name == name }?.value }
        guard value("state") == state else {
          return finishSignIn(.failed(.unauthorized, "the redirect's state did not match"))
        }
        if let error = value("error") {
          // access_denied: the user declined at Google's consent screen.
          return finishSignIn(.failed(error == "access_denied" ? .cancelled : .unauthorized, "Google: \(error)"))
        }
        guard let code = value("code") else {
          return finishSignIn(.failed(.unauthorized, "the redirect had no code"))
        }
        endpoint.post([
          "grant_type": "authorization_code", "code": code, "client_id": client.clientId,
          "redirect_uri": client.redirectURI, "code_verifier": verifier,
        ]) { [weak self] reply in
          guard let self else { return }
          finishSignIn(took(reply, epoch: started, connecting: true))
        }
      }
    }
  }

  private func finishSignIn(_ outcome: Outcome) {
    let waiting = signingIn ?? []
    signingIn = nil
    for each in waiting { each(outcome) }
  }

  // MARK: the token endpoint's answers

  /// An answer of the token endpoint, kept when it brings tokens.
  private func took(_ reply: TokenEndpointAnswer, epoch started: Int, connecting: Bool) -> Outcome {
    let status: Int
    let body: JSONValue?
    switch reply {
    case .unreachable(let reason):
      return .failed(.retry, "Google could not be reached: \(reason)")
    case .answered(let code, let data):
      status = code
      body = try? JSONValue.parse(String(decoding: data, as: UTF8.self))
    }
    guard status == 200, let access = body?["access_token"]?.string, !access.isEmpty else {
      let error = body?["error"]?.string ?? "no access token"
      // Google's own trouble (5xx) or too many requests: try again later. Anything else, as
      // `invalid_grant` (a refresh token that ended or was revoked), is the grant's end.
      if status >= 500 || status == 429 { return .failed(.retry, "token endpoint: HTTP \(status) \(error)") }
      return .failed(.unauthorized, "token endpoint: HTTP \(status) \(error)")
    }
    guard started == epoch else { return .failed(.unauthorized, "disconnected meanwhile") }
    if let refreshToken = body?["refresh_token"]?.string, !refreshToken.isEmpty {
      do {
        try store.save(refreshToken)
      } catch {
        onLog?("could not keep the refresh token: \(error)")
      }
    } else if connecting {
      onLog?("the sign-in brought no refresh token")
    }
    if connecting && !connected { setConnected(true) }
    let lifetime = body?["expires_in"]?.number.flatMap { $0 > 0 ? $0 : nil } ?? Self.assumedLifetimeS
    let expiresAt = clock.now() + lifetime * 1000
    kept = (access, expiresAt)
    return .token(access, expiresAt: expiresAt)
  }

  // MARK: Disconnect

  private func forget() {
    epoch += 1
    kept = nil
    store.delete()
    setConnected(false)
  }

  private func setConnected(_ value: Bool) {
    connected = value
    do {
      try persistence.save(Self.key, ["connected": .bool(value)])
    } catch {
      onLog?("could not save whether the device is connected: \(error)")
    }
  }
}
