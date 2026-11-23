import Foundation
import WebKit

/// The app origin, `langle-app://app/` (docs/specs/mobile-app.md "Contexts"): the bundled
/// `langle-app` build (`langle-app/` in the app's resources, copied by scripts/bundle-build.sh and
/// the Xcode build phase) and the pages the app writes itself (`host.html`).
@MainActor
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
  static let scheme = "langle-app"
  static let origin = "langle-app://app"

  /// The bundled build's folder.
  let root: URL
  /// Pages the app writes, by path (`/host.html`).
  var generated: [String: String] = [:]

  init(root: URL) {
    self.root = root.standardizedFileURL
  }

  static let types = [
    "html": "text/html", "js": "text/javascript", "mjs": "text/javascript", "css": "text/css",
    "json": "application/json", "txt": "text/plain", "png": "image/png", "svg": "image/svg+xml",
    "woff": "font/woff", "woff2": "font/woff2", "wasm": "application/wasm",
  ]

  /// A file of the build, by its path on the origin; nil when there is none.
  func file(_ path: String) -> Data? {
    if let page = generated[path] { return Data(page.utf8) }
    let file = root.appendingPathComponent(String(path.drop { $0 == "/" })).standardizedFileURL
    // Nothing outside the build's folder.
    guard file.path.hasPrefix(root.path + "/") else { return nil }
    return try? Data(contentsOf: file)
  }

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url, url.host == "app" else {
      task.didFailWithError(URLError(.badURL))
      return
    }
    let path = url.path.isEmpty ? "/" : url.path
    let data = file(path)
    let type = Self.types[url.pathExtension.lowercased()] ?? "application/octet-stream"
    let body = data ?? Data("Not found".utf8)
    let response = HTTPURLResponse(
      url: url, statusCode: data == nil ? 404 : 200, httpVersion: "HTTP/1.1",
      headerFields: [
        "Content-Type": data == nil ? "text/plain; charset=utf-8" : Self.contentType(type),
        "Content-Length": "\(body.count)",
        "Cache-Control": "no-store",
      ])!
    task.didReceive(response)
    task.didReceive(body)
    task.didFinish()
  }

  static func contentType(_ type: String) -> String {
    type.hasPrefix("text/") || type == "application/json" ? "\(type); charset=utf-8" : type
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
