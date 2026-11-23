import Foundation
import LangleCore
import XCTest

final class MatchPatternTests: XCTestCase {
  func matches(_ pattern: String, _ url: String) -> Bool {
    (try? MatchPattern(pattern))?.matches(url) ?? false
  }

  func test_all_urls_is_every_web_page_but_not_the_app_origin() {
    XCTAssertTrue(matches("<all_urls>", "https://example.com/article"))
    XCTAssertTrue(matches("<all_urls>", "http://localhost:4719/article-en.html"))
    XCTAssertFalse(matches("<all_urls>", "langle-app://app/popup.html"))
    XCTAssertFalse(matches("<all_urls>", "about:blank"))
  }

  func test_scheme_star_is_http_and_https() {
    XCTAssertTrue(matches("*://m.youtube.com/*", "https://m.youtube.com/watch?v=x"))
    XCTAssertTrue(matches("*://m.youtube.com/*", "http://m.youtube.com/"))
    XCTAssertFalse(matches("*://m.youtube.com/*", "https://www.youtube.com/watch?v=x"))
    XCTAssertFalse(matches("*://m.youtube.com/*", "ftp://m.youtube.com/"))
    XCTAssertTrue(matches("https://m.youtube.com/*", "https://M.YouTube.com/"))
    XCTAssertFalse(matches("https://m.youtube.com/*", "http://m.youtube.com/"))
  }

  func test_host_wildcard_is_the_domain_and_its_subdomains() {
    XCTAssertTrue(matches("https://*.example.com/*", "https://example.com/"))
    XCTAssertTrue(matches("https://*.example.com/*", "https://a.b.example.com/x"))
    XCTAssertFalse(matches("https://*.example.com/*", "https://badexample.com/"))
    XCTAssertTrue(matches("https://*/*", "https://anything.test/"))
  }

  func test_a_host_without_a_port_matches_any_port() {
    XCTAssertTrue(matches("http://localhost/*", "http://localhost:4719/a"))
    XCTAssertTrue(matches("http://localhost:4719/*", "http://localhost:4719/a"))
    XCTAssertFalse(matches("http://localhost:4719/*", "http://localhost:8080/a"))
  }

  func test_the_path_is_a_glob_over_path_and_query() {
    XCTAssertTrue(matches("https://example.com/watch*", "https://example.com/watch?v=1"))
    XCTAssertTrue(matches("https://example.com/a/*/c", "https://example.com/a/b/x/c"))
    XCTAssertFalse(matches("https://example.com/a/*/c", "https://example.com/a/b/x/d"))
    XCTAssertFalse(matches("https://example.com/a", "https://example.com/a/b"))
    XCTAssertTrue(matches("https://example.com/*", "https://example.com"))
  }

  func test_refuses_bad_patterns() {
    for pattern in ["example.com", "chrome://x/*", "https://exa*mple.com/*", "https://example.com", "file://host/*"] {
      XCTAssertThrowsError(try MatchPattern(pattern), pattern)
    }
  }
}

final class ManifestTests: XCTestCase {
  /// The shape of `.output/langle-app-mv3/manifest.json`.
  let built = """
    {"manifest_version":3,"name":"Langle","description":"d","version":"0.1.0","icons":{"16":"icon/16.png"},
     "permissions":["storage","alarms","identity"],"key":"MIIB","background":{"service_worker":"background.js"},
     "action":{"default_title":"Langle","default_popup":"popup.html"},
     "options_ui":{"open_in_tab":true,"page":"options.html"},
     "content_scripts":[{"matches":["<all_urls>"],"js":["content-scripts/content.js"]},
       {"matches":["*://m.youtube.com/*"],"js":["content-scripts/youtube-main.js"],"run_at":"document_start","world":"MAIN"}]}
    """

  func test_reads_the_build_the_app_supports() throws {
    let manifest = try Manifest.read(built)
    XCTAssertEqual(manifest.version, "0.1.0")
    XCTAssertEqual(manifest.background, "background.js")
    XCTAssertEqual(manifest.contentScripts.map(\.js), [["content-scripts/content.js"], ["content-scripts/youtube-main.js"]])
    XCTAssertEqual(manifest.contentScripts.map(\.runAt), [.documentIdle, .documentStart])
    XCTAssertEqual(manifest.contentScripts.map(\.world), [.isolated, .main])
    XCTAssertEqual(manifest.scripts(for: "https://example.com/").map(\.js), [["content-scripts/content.js"]])
    XCTAssertEqual(manifest.scripts(for: "https://m.youtube.com/watch?v=1").count, 2)
    XCTAssertEqual(manifest.value["name"], "Langle")
  }

  func test_refuses_what_it_does_not_support_naming_each() {
    let cases: [(String, String)] = [
      (#""permissions":["storage","alarms","identity"]"#, #""permissions":["storage","tabs"]"#),
      (#""key":"MIIB""#, #""host_permissions":["<all_urls>"]"#),
      (#""service_worker":"background.js""#, #""service_worker":"background.js","type":"module""#),
      (#""js":["content-scripts/content.js"]"#, #""js":["content-scripts/content.js"],"all_frames":true"#),
      (#""js":["content-scripts/content.js"]"#, #""js":["content-scripts/content.js"],"css":["a.css"]"#),
      (#""run_at":"document_start""#, #""run_at":"document_later""#),
      (#""world":"MAIN""#, #""world":"USER_SCRIPT""#),
      (#""manifest_version":3"#, #""manifest_version":2"#),
    ]
    let expected = [
      "permission tabs", "host_permissions", "background.type", "content_scripts[0].all_frames",
      "content_scripts[0].css", "content_scripts[1].run_at document_later",
      "content_scripts[1].world USER_SCRIPT", "manifest_version 2",
    ]
    for ((from, to), reason) in zip(cases, expected) {
      let text = built.replacingOccurrences(of: from, with: to)
      XCTAssertNotEqual(text, built, from)
      XCTAssertThrowsError(try Manifest.read(text), reason) { error in
        XCTAssertEqual((error as? Manifest.Refusal)?.unsupported, [reason])
      }
    }
  }

  /// The real build, when there is one (`npm run build:app`).
  func test_reads_the_langle_app_build() throws {
    let url = repoRoot.appendingPathComponent(".output/langle-app-mv3/manifest.json")
    guard let text = try? String(contentsOf: url, encoding: .utf8) else {
      throw XCTSkip("no build: npm run build:app")
    }
    let manifest = try Manifest.read(text)
    XCTAssertFalse(manifest.contentScripts.isEmpty)
    for script in manifest.contentScripts {
      for file in script.js {
        XCTAssertTrue(
          FileManager.default.fileExists(
            atPath: repoRoot.appendingPathComponent(".output/langle-app-mv3/\(file)").path), file)
      }
    }
  }
}
