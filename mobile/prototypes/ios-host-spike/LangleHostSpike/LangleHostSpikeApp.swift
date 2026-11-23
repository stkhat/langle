import SwiftUI
import WebKit
import os

/// Spike S1 (docs/plans/mobile-app.md): an extension-host WKWebView on a `langle-app://` origin in
/// its own data store, next to a browsing WKWebView in the default store. One measurement per launch:
///   xcrun simctl launch booted dev.langle.spike.host -mode <write|read|clear|timer|worlds|wipe>
///     [-origin scheme|file] [-host hidden|alpha|detached|visible] [-page <url>] [-seconds 120]
/// Results go to the unified log, subsystem dev.langle.spike (see check.sh).
let log = Logger(subsystem: "dev.langle.spike", category: "host")
func say(_ s: String) { log.info("\(s, privacy: .public)") }

@main
struct LangleHostSpikeApp: App {
  var body: some Scene {
    WindowGroup { SpikeView().ignoresSafeArea() }
  }
}

struct SpikeView: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> SpikeController { SpikeController() }
  func updateUIViewController(_ controller: SpikeController, context: Context) {}
}

/// Serves the bundle's files (flattened by the synchronized folder) on langle-app://app/.
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url,
      let file = Bundle.main.url(forResource: url.lastPathComponent, withExtension: nil),
      let data = try? Data(contentsOf: file)
    else {
      task.didFailWithError(URLError(.fileDoesNotExist))
      return
    }
    let type = url.pathExtension == "js" ? "text/javascript" : "text/html"
    let response = HTTPURLResponse(
      url: url, statusCode: 200, httpVersion: "HTTP/1.1",
      headerFields: ["Content-Type": "\(type); charset=utf-8", "Content-Length": "\(data.count)"])!
    task.didReceive(response)
    task.didReceive(data)
    task.didFinish()
  }
  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
