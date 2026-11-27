import Foundation

/// The app's lifecycle for the background (docs/specs/mobile-app.md "M7" › "The app's
/// lifecycle"): alarms run only while the app does, so the extension host hears when the app
/// leaves the screen (`app.hidden`, which it answers once its pending cloud writes are done) and
/// comes back (`app.visible`, a cloud check).
/// - `hidden`: `app.hidden`, holding the app (`hold(true)`: a background task on iOS) until the
///   host answers or `holdMs` pass, then `hold(false)`. Nothing is sent, or held, while the host
///   has not said hello.
/// - `visible`: `app.visible`, only after a `hidden` (not at the app's start).
/// Main thread only, like the router.
public final class AppLifecycle {
  /// How long the app is held for `app.hidden`'s answer (the spec's 20 s; iOS ends a background
  /// task after about 30 s).
  public static let holdMs = 20_000.0

  public var onLog: ((String) -> Void)?

  private let router: Router
  private let hold: (Bool) -> Void
  private let holdMs: Double
  private var isHidden = false
  /// The latest `app.hidden`: an earlier one's answer does not end a later one's hold.
  private var turn = 0
  private var holding = false

  public init(router: Router, holdMs: Double = AppLifecycle.holdMs, hold: @escaping (Bool) -> Void) {
    self.router = router
    self.holdMs = holdMs
    self.hold = hold
  }

  public func hidden() {
    if isHidden { return }
    isHidden = true
    guard router.isHostReady else { return }
    turn += 1
    let current = turn
    if !holding {
      holding = true
      hold(true)
    }
    router.askHost("app.hidden", [], timeoutMs: holdMs) { [weak self] result in
      guard let self else { return }
      if case .failure(let error) = result { onLog?("app.hidden: \(error.message)") }
      if current == turn && holding {
        holding = false
        hold(false)
      }
    }
  }

  public func visible() {
    if !isHidden { return }
    isHidden = false
    router.postToHost("app.visible", [])
  }
}
