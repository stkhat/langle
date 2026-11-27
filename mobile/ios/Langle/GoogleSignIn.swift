import AuthenticationServices
import LangleCore
import UIKit

/// Google sign-in for Drive sync (docs/specs/mobile-app.md "M7"; docs/notes/mobile.md "Drive
/// sign-in (M7a)"): the system's sheet and Google's token endpoint under `GoogleAuth`
/// (LangleCore), which keeps the refresh token in the Keychain.

/// `ASWebAuthenticationSession` on the client's reversed-id scheme (nothing registered in
/// Info.plist: the session catches the redirect itself). Not ephemeral, so Safari's Google
/// session is offered. iOS first shows its own "wants to use accounts.google.com" alert; its
/// Cancel, like closing the sheet, is `canceledLogin`.
final class WebAuthenticationSheet: NSObject, GoogleSignInSheet, ASWebAuthenticationPresentationContextProviding {
  private var session: ASWebAuthenticationSession?

  func show(_ url: URL, callbackScheme: String, _ done: @escaping (SignInSheetResult) -> Void) {
    let session = ASWebAuthenticationSession(url: url, callback: .customScheme(callbackScheme)) {
      [weak self] callback, error in
      let result: SignInSheetResult
      if let callback {
        result = .callback(callback)
      } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
        result = .cancelled
      } else {
        let ns = (error ?? URLError(.unknown)) as NSError
        result = .failed("\(ns.domain) \(ns.code)")
      }
      DispatchQueue.main.async {
        self?.session = nil
        done(result)
      }
    }
    session.presentationContextProvider = self
    session.prefersEphemeralWebBrowserSession = false
    self.session = session
    if !session.start() {
      self.session = nil
      done(.failed("the sheet did not start"))
    }
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      // A sign-in is asked for from a page on the screen, so the app has a scene.
      return scenes.compactMap(\.keyWindow).first ?? scenes.flatMap(\.windows).first
        ?? UIWindow(windowScene: scenes[0])
    }
  }
}

/// `POST https://oauth2.googleapis.com/token` over `URLSession`, answered on the main thread.
/// No secret: an iOS client proves the code with PKCE.
final class URLSessionTokenEndpoint: GoogleTokenEndpoint {
  func post(_ form: [String: String], _ done: @escaping (TokenEndpointAnswer) -> Void) {
    var request = URLRequest(url: GoogleOAuthClient.tokenURL, timeoutInterval: 30)
    request.httpMethod = "POST"
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    request.httpBody = formBody(form)
    URLSession.shared.dataTask(with: request) { data, response, error in
      let answer: TokenEndpointAnswer
      if let response = response as? HTTPURLResponse {
        answer = .answered(status: response.statusCode, body: data ?? Data())
      } else {
        let ns = (error ?? URLError(.unknown)) as NSError
        answer = .unreachable("\(ns.domain) \(ns.code)")
      }
      DispatchQueue.main.async { done(answer) }
    }.resume()
  }
}

/// `app.hidden`'s hold on iOS: a background task, so the background can finish its cloud writes
/// after the app leaves the screen. It ends when the background answers, after
/// `AppLifecycle.holdMs`, or when iOS ends it first.
@MainActor
final class BackgroundHold {
  private var task: UIBackgroundTaskIdentifier = .invalid

  func hold(_ on: Bool) {
    if on {
      guard task == .invalid else { return }
      task = UIApplication.shared.beginBackgroundTask(withName: "Langle cloud writes") { [weak self] in
        MainActor.assumeIsolated {
          Log.app.info("app.hidden: iOS ended the background task")
          self?.end()
        }
      }
    } else {
      end()
    }
  }

  private func end() {
    guard task != .invalid else { return }
    UIApplication.shared.endBackgroundTask(task)
    task = .invalid
  }
}
