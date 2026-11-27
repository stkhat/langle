import UIKit

/// Boundary 1 of docs/specs/mobile-app.md "Engine boundary": pages, injection and messages by
/// world. The router, the extension host, the tabs and the screens depend only on this; WebKit
/// types stay behind it (WebKitEngine.swift).
@MainActor
protocol BrowsingEngine {
  func createPage(profile: PageProfile, delegate: PageDelegate) -> Page
}

/// Which data a page uses: the browsing data, or the app's own (the extension host and the app
/// pages, on the app origin), kept apart from it (boundary 2).
enum PageProfile {
  case browsing
  case app
}

/// The page's own world, or Langle's isolated world (content scripts, the bridge).
enum ScriptWorld {
  case page
  case langle
}

enum ScriptRunAt {
  case start
  case end
}

/// A script injected into every new document of a page, top frame only.
struct UserScript {
  let source: String
  let world: ScriptWorld
  let runAt: ScriptRunAt
}

@MainActor
protocol Page: AnyObject {
  var view: UIView { get }
  var url: URL? { get }
  func load(_ url: URL)
  func reload()
  func stop()
  func goBack()
  func goForward()
  /// Takes effect for documents loaded after the call (from `willLoad` on, the next one).
  func setUserScripts(_ scripts: [UserScript])
  /// Native → scripts: hands one bridge envelope to `__langleBridgeReceive` in that world.
  func postMessage(world: ScriptWorld, frameId: Int, json: String)
  /// Runs a function body in a world and returns its result as text (named commands only).
  func evaluate(world: ScriptWorld, source: String) async -> String
  /// Keeps the page's content process running while the app is off screen (`true`, at most
  /// `ms`), until `false`. WebKit suspends a page's process, and the IndexedDB it uses, as soon
  /// as the app leaves the screen, whatever background task the app holds.
  func keepRunning(_ on: Bool, ms: Double)
  /// Leaves the page's fullscreen (the app's own, or the browser's).
  func exitFullscreen()
}

@MainActor
protocol PageDelegate: AnyObject {
  /// Scripts → native: one bridge envelope from a frame (0: the top frame).
  func page(_ page: Page, message json: String, world: ScriptWorld, frameId: Int, frameURL: String)
  /// A new top-level document is about to load at `url` (also after a redirect): the moment to
  /// choose its scripts.
  func page(_ page: Page, willLoad url: URL)
  /// A new top-level document replaced the old one.
  func page(_ page: Page, didCommit url: URL)
  func page(_ page: Page, didNavigate url: URL?, title: String, canGoBack: Bool, canGoForward: Bool)
  /// The page's content process is gone (memory pressure, a crash).
  func pageProcessGone(_ page: Page)
  /// The page put an element in fullscreen (true), or left it (false).
  func page(_ page: Page, fullscreen: Bool)
  /// The page scrolled: its top is `y` points down the document.
  func page(_ page: Page, scrolledTo y: Double)
}
