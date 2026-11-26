import AuthenticationServices
import CryptoKit
import Security
import SwiftUI
import WebKit
import os

/// Spike M7a (docs/plans/mobile-app.md, docs/notes/mobile.md "Drive sign-in (M7a)"): Google sign-in
/// with ASWebAuthenticationSession and PKCE against the iOS OAuth client (no secret), the refresh
/// token in the Keychain (this device only), and the access token handed to a WKWebView on the app
/// origin `langle-app://app`, whose JS (drive-spike-web/drive.js) calls the Drive API with fetch.
///
/// Buttons on screen, or one launch per command list (check.sh):
///   xcrun simctl launch <device> dev.langle.app -cmds refresh,drive
/// Commands: connect (the sheet, then probe and drive), refresh, drive, probe, bad, revoked
/// (a refresh with a made-up refresh token), forget (the Keychain item).
/// Results go to the unified log, subsystem dev.langle.spike; tokens only as a SHA-256 prefix.
let log = Logger(subsystem: "dev.langle.spike", category: "drive")
func say(_ label: String, _ fields: [String: Any?]) {
  let clean = fields.compactMapValues { $0 }
  let data = (try? JSONSerialization.data(withJSONObject: clean, options: [.sortedKeys])) ?? Data()
  log.info("M7A \(label, privacy: .public) \(String(decoding: data, as: UTF8.self), privacy: .public)")
}
func tag(_ value: String?) -> String? {
  value.map { SHA256.hash(data: Data($0.utf8)).prefix(4).map { String(format: "%02x", $0) }.joined() }
}

let clientId = "191564468385-kil3pjtfv2ai5p0bud9fh7n5rj68c2pl.apps.googleusercontent.com"
let redirectScheme = "com.googleusercontent.apps.191564468385-kil3pjtfv2ai5p0bud9fh7n5rj68c2pl"
let redirectURI = "\(redirectScheme):/oauth2redirect"
let scope = "https://www.googleapis.com/auth/drive.appdata"
let tokenURL = URL(string: "https://oauth2.googleapis.com/token")!

@main
struct LangleDriveSpikeApp: App {
  var body: some Scene {
    WindowGroup { SpikeView() }
  }
}

struct SpikeView: View {
  @StateObject private var spike = Spike()
  var body: some View {
    VStack(spacing: 8) {
      HStack {
        ForEach(["connect", "refresh", "drive", "forget"], id: \.self) { cmd in
          Button(cmd) { Task { await spike.run(cmd) } }.buttonStyle(.bordered)
        }
      }
      WebHolder(web: spike.web).frame(height: 120)
      ScrollView { Text(spike.lines).font(.system(size: 10, design: .monospaced)).textSelection(.enabled) }
    }
    .padding(8)
    .task { await spike.start() }
  }
}

struct WebHolder: UIViewRepresentable {
  let web: WKWebView
  func makeUIView(context: Context) -> WKWebView { web }
  func updateUIView(_ view: WKWebView, context: Context) {}
}

/// Serves drive.html and drive.js from the bundle on langle-app://app/, like the real host's
/// AppSchemeHandler.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url, url.host == "app",
      let file = Bundle.main.url(forResource: url.lastPathComponent, withExtension: nil),
      let data = try? Data(contentsOf: file)
    else {
      task.didFailWithError(URLError(.fileDoesNotExist))
      return
    }
    let type = url.pathExtension == "js" ? "text/javascript" : "text/html"
    let response = HTTPURLResponse(
      url: url, statusCode: 200, httpVersion: "HTTP/1.1",
      headerFields: ["Content-Type": "\(type); charset=utf-8", "Content-Length": "\(data.count)", "Cache-Control": "no-store"])!
    task.didReceive(response)
    task.didReceive(data)
    task.didFinish()
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

/// The refresh token in the Keychain, this device only (not in iCloud Keychain).
enum Vault {
  static let base: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "dev.langle.spike.drive",
    kSecAttrAccount as String: "google-refresh-token",
  ]
  static func save(_ token: String) -> OSStatus {
    SecItemDelete(base as CFDictionary)
    var item = base
    item[kSecValueData as String] = Data(token.utf8)
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    return SecItemAdd(item as CFDictionary, nil)
  }
  static func load() -> String? {
    var query = base
    query[kSecReturnData as String] = true
    var out: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return String(decoding: data, as: UTF8.self)
  }
  static func forget() -> OSStatus { SecItemDelete(base as CFDictionary) }
}

@MainActor
final class Spike: NSObject, ObservableObject, WKScriptMessageHandler, ASWebAuthenticationPresentationContextProviding {
  @Published var lines = ""
  let web: WKWebView
  private var token: String?
  private var loaded: CheckedContinuation<Void, Never>?
  private var isLoaded = false
  private var answer: CheckedContinuation<Void, Never>?
  private var session: ASWebAuthenticationSession?

  override init() {
    let config = WKWebViewConfiguration()
    // Not the real app's store: its own identifier.
    config.websiteDataStore = WKWebsiteDataStore(forIdentifier: UUID(uuidString: "7A7A7A7A-0000-4000-8000-00000000D51E")!)
    let handler = AppSchemeHandler()
    config.setURLSchemeHandler(handler, forURLScheme: "langle-app")
    web = WKWebView(frame: .zero, configuration: config)
    super.init()
    config.userContentController.add(self, name: "spikeBridge")
    web.isInspectable = true
  }

  func note(_ label: String, _ fields: [String: Any?]) {
    say(label, fields)
    let clean = fields.compactMapValues { $0 }
    lines = "\(label) \(clean)\n\n" + lines.prefix(4000)
  }

  nonisolated func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    let text = message.body as? String ?? ""
    MainActor.assumeIsolated {
      let what = (try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any])?["what"] as? String ?? "js"
      log.info("M7A js.\(what, privacy: .public) \(text, privacy: .public)")
      lines = "js.\(what) \(text)\n\n" + lines.prefix(4000)
      if what == "loaded" {
        isLoaded = true
        loaded?.resume()
        loaded = nil
      } else {
        answer?.resume()
        answer = nil
      }
    }
  }

  func start() async {
    web.load(URLRequest(url: URL(string: "langle-app://app/drive.html")!))
    if !isLoaded { await withCheckedContinuation { loaded = $0 } }
    note("start", ["keychain": Vault.load() != nil])
    let args = UserDefaults.standard.string(forKey: "cmds") ?? ""
    for cmd in args.split(separator: ",") { await run(String(cmd)) }
    if !args.isEmpty { note("DONE", [:]) }
  }

  /// Calls drive.js and waits for its one answer.
  private func js(_ source: String) async {
    await withCheckedContinuation { continuation in
      answer = continuation
      web.evaluateJavaScript(source, completionHandler: nil)
    }
  }

  private func quoted(_ s: String) -> String {
    String(decoding: try! JSONSerialization.data(withJSONObject: [s]), as: UTF8.self).dropFirst().dropLast().description
  }

  func run(_ cmd: String) async {
    switch cmd {
    case "connect":
      if await connect() {
        await run("probe")
        await run("drive")
      }
    case "refresh": await refresh(Vault.load(), label: "refresh")
    case "revoked": await refresh("1//0not-a-real-refresh-token", label: "refresh-bad")
    case "drive":
      guard let token else { return note("drive", ["error": "no token"]) }
      await js("driveSpike.run(\(quoted(token)), 'ios')")
    case "probe":
      guard let token else { return note("probe", ["error": "no token"]) }
      await js("driveSpike.probe(\(quoted(token)))")
    case "bad": await js("driveSpike.refused('ya29.not-a-real-token', 'bad-token')")
    case "forget":
      token = nil
      note("forget", ["status": Vault.forget()])
    default: note("error", ["unknown": cmd])
    }
  }

  nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
  }

  /// The code flow with PKCE; Google's account chooser every time (prompt=select_account).
  private func connect() async -> Bool {
    let verifier = Data((0..<32).map { _ in UInt8.random(in: 0...255) }).base64URL
    let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URL
    let state = UUID().uuidString
    var parts = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
    parts.queryItems = [
      .init(name: "client_id", value: clientId),
      .init(name: "redirect_uri", value: redirectURI),
      .init(name: "response_type", value: "code"),
      .init(name: "scope", value: scope),
      .init(name: "code_challenge", value: challenge),
      .init(name: "code_challenge_method", value: "S256"),
      .init(name: "prompt", value: "select_account"),
      .init(name: "state", value: state),
    ]
    let started = Date()
    let callback: URL
    do {
      callback = try await withCheckedThrowingContinuation { continuation in
        let session = ASWebAuthenticationSession(url: parts.url!, callback: .customScheme(redirectScheme)) { url, error in
          if let url { continuation.resume(returning: url) } else { continuation.resume(throwing: error ?? URLError(.unknown)) }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        self.session = session
        note("sheet", ["started": session.start()])
      }
    } catch {
      let ns = error as NSError
      note("connect", ["error": "\(ns.domain) \(ns.code)", "cancelled": ns.domain == ASWebAuthenticationSessionErrorDomain && ns.code == ASWebAuthenticationSessionError.canceledLogin.rawValue])
      return false
    }
    let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
    let value = { (name: String) in items.first { $0.name == name }?.value }
    guard value("state") == state, let code = value("code") else {
      note("connect", ["error": value("error") ?? "no code", "stateOk": value("state") == state])
      return false
    }
    let body = [
      "code": code, "client_id": clientId, "redirect_uri": redirectURI,
      "grant_type": "authorization_code", "code_verifier": verifier,
    ]
    let (status, json) = await post(body)
    report("exchange", status, json, since: started)
    if let refresh = json["refresh_token"] as? String { note("keychain", ["saved": Vault.save(refresh)]) }
    token = json["access_token"] as? String
    return token != nil
  }

  private func refresh(_ refreshToken: String?, label: String) async {
    guard let refreshToken else { return note(label, ["error": "no refresh token in the Keychain"]) }
    let started = Date()
    let previous = token
    let (status, json) = await post(["grant_type": "refresh_token", "refresh_token": refreshToken, "client_id": clientId])
    report(label, status, json, since: started)
    if let access = json["access_token"] as? String {
      token = access
      note(label + ".token", ["sameAsBefore": previous == access])
    }
  }

  /// What came back, without the tokens themselves.
  private func report(_ label: String, _ status: Int, _ json: [String: Any], since: Date) {
    var fields: [String: Any?] = ["status": status, "ms": Int(Date().timeIntervalSince(since) * 1000)]
    for (key, value) in json {
      if key.hasSuffix("token") { fields[key] = tag(value as? String) } else { fields[key] = value }
    }
    note(label, fields)
  }

  private func post(_ form: [String: String]) async -> (Int, [String: Any]) {
    var request = URLRequest(url: tokenURL)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    var parts = URLComponents()
    parts.queryItems = form.map { URLQueryItem(name: $0.key, value: $0.value) }
    request.httpBody = Data((parts.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").utf8)
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      return ((response as? HTTPURLResponse)?.statusCode ?? 0, (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:])
    } catch {
      return (0, ["error": "\(error)"])
    }
  }
}

extension Data {
  var base64URL: String {
    base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
