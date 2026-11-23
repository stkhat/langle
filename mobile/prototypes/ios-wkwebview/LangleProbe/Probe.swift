import Foundation
import WebKit
import os

let log = Logger(subsystem: "dev.langle.probe", category: "probe")

/// The web view, the probe script, the prototype ad blocker and the shell commands.
final class Probe: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  static let shared = Probe()
  let webView: WKWebView
  private let defaults = UserDefaults.standard

  /// Commands run in the page world with callAsyncJavaScript (from native, so the page's CSP
  /// does not apply).
  static let commands: [String: String] = [
    "variants": "return await window.__langleProbeVariants();",
    "captions": """
      const p = document.querySelector("#movie_player");
      p.mute?.();
      if (p.getPlayerState?.() !== 1) { p.playVideo?.(); return "playing"; }
      p.loadModule?.("captions");
      p.setOption("captions", "track", { languageCode: "en" });
      return "ok";
      """,
    "captionsJa": """
      document.querySelector("#movie_player").setOption("captions", "track", {
        languageCode: "en", translationLanguage: { languageCode: "ja", languageName: "Japanese" } });
      return "ok";
      """,
    "state": """
      const p = document.querySelector("#movie_player");
      return { state: p?.getPlayerState?.(), t: document.querySelector("video")?.currentTime,
        ad: !!p?.classList.contains("ad-showing"), pruned: window.__langleProbe?.pruned };
      """,
    // The timedtext requests so far: the parameters that matter, values cut short (log lines are capped).
    "urls": """
      return (window.__langleProbe?.timedtext ?? [])
        .map((e) => { const q = new URL(e).searchParams;
          return ["lang", "tlang", "kind", "cbr", "c", "pot"].map((k) => k + "=" + (q.get(k) ?? "").slice(0, 8)).join("&"); });
      """,
    "hosts": """
      return [...new Set(performance.getEntriesByType("resource").map((x) => new URL(x.name).hostname))].sort().join(" ");
      """,
    "measure": """
      const r = performance.getEntriesByType("resource");
      return { resources: r.length, hosts: new Set(r.map((x) => new URL(x.name).hostname)).size,
        textChars: document.body?.innerText.length, webdriver: navigator.webdriver,
        ua: navigator.userAgent, cosmetic: !!document.getElementById("langle-cosmetic") };
      """,
  ]

  override init() {
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = []
    if defaults.string(forKey: "ua") == "safari" {
      config.applicationNameForUserAgent = "Version/27.0 Mobile/15E148 Safari/604.1"
    }
    webView = WKWebView(frame: .zero, configuration: config)
    webView.isInspectable = true
    super.init()

    let controller = config.userContentController
    controller.add(self, contentWorld: .page, name: "langleNative")
    let shim = "window.langleNative = { postMessage: (s) => webkit.messageHandlers.langleNative.postMessage(s) };"
    let probe = (try? String(contentsOf: Bundle.main.url(forResource: "probe", withExtension: "js")!, encoding: .utf8)) ?? ""
    for source in [shim, probe] {
      controller.addUserScript(
        WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false, in: .page))
    }
    webView.navigationDelegate = self

    for name in Array(Probe.commands.keys) + ["llm"] {
      CFNotificationCenterAddObserver(
        CFNotificationCenterGetDarwinNotifyCenter(), Unmanaged.passUnretained(self).toOpaque(),
        { _, observer, name, _, _ in
          guard let observer, let name = name?.rawValue as String? else { return }
          let probe = Unmanaged<Probe>.fromOpaque(observer).takeUnretainedValue()
          DispatchQueue.main.async { probe.run(String(name.dropFirst("dev.langle.probe.".count))) }
        }, "dev.langle.probe.\(name)" as CFString, nil, .deliverImmediately)
    }

    let url = URL(string: defaults.string(forKey: "url") ?? "https://m.youtube.com/")!
    let block = defaults.string(forKey: "block") != "off"
    log.info("start block=\(block, privacy: .public) ua=\(config.applicationNameForUserAgent ?? "", privacy: .public)")
    if block {
      Blocker.load(into: controller) { self.webView.load(URLRequest(url: url)) }
    } else {
      webView.load(URLRequest(url: url))
    }
  }

  func run(_ name: String) {
    if name == "llm" { return LLMProbe.run() }
    guard let js = Probe.commands[name] else { return }
    webView.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
      switch result {
      case .success(let value):
        let data = (try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed])) ?? Data()
        log.info("cmd \(name, privacy: .public) \(String(data: data, encoding: .utf8) ?? "?", privacy: .public)")
      case .failure(let error):
        log.error("cmd \(name, privacy: .public) failed \(String(describing: error), privacy: .public)")
      }
    }
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    let frame = message.frameInfo.isMainFrame ? "main" : "frame"
    log.info("page \(frame, privacy: .public) \(String(describing: message.body), privacy: .public)")
  }

  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
    // Stay in the app for web pages; drop app links and custom schemes (YouTube tries its app).
    let scheme = action.request.url?.scheme ?? ""
    return ["http", "https", "about", "blob", "data"].contains(scheme) ? .allow : .cancel
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    log.info("pageFinished \(webView.url?.absoluteString ?? "", privacy: .public)")
  }
}
