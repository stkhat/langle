import Foundation
import WebKit

/// Prototype ad blocker, as in the Android prototypes: EasyList's `||host^` rules compiled into a
/// WKContentRuleList (WebKit's declarative blocker; no per-request code), and its generic `##`
/// rules as a stylesheet added at document start. The list is data, fetched at run time.
enum Blocker {
  static let easyList = URL(string: "https://easylist.to/easylist/easylist.txt")!
  static let unsupported = [":-abp-", ":has-text", ":style(", ":matches-", ":xpath", ":upward", ":remove", ":watch-attr"]

  static func load(into controller: WKUserContentController, then done: @escaping () -> Void) {
    Task {
      do {
        let text = try await listText()
        var hosts: [String] = []
        var allowed: [String] = []
        var selectors: [String] = []
        for line in text.split(separator: "\n").map(String.init) {
          if line.hasPrefix("@@||"), let h = host(line.dropFirst(4)) { allowed.append(h) }
          else if line.hasPrefix("||"), let h = host(line.dropFirst(2)) { hosts.append(h) }
          else if line.hasPrefix("##") {
            let sel = String(line.dropFirst(2)).trimmingCharacters(in: .whitespaces)
            if !unsupported.contains(where: sel.contains) { selectors.append(sel) }
          }
        }
        let rules = hosts.map(rule(block: true)) + allowed.map(rule(block: false))
        let json = String(data: try JSONSerialization.data(withJSONObject: rules), encoding: .utf8)!
        let started = Date()
        let list = try await WKContentRuleListStore.default().compileContentRuleList(
          forIdentifier: "easylist-hosts", encodedContentRuleList: json)
        let seconds = Date().timeIntervalSince(started)
        let css = selectors.map { "\($0){display:none!important}" }.joined(separator: "\n")
        let quoted = String(data: try JSONSerialization.data(withJSONObject: [css]), encoding: .utf8)!
        let script =
          "(()=>{const s=document.createElement('style');s.id='langle-cosmetic';s.textContent=\(quoted)[0];" +
          "(document.head||document.documentElement).appendChild(s);})();"
        let counts = "hosts=\(hosts.count) allow=\(allowed.count) selectors=\(selectors.count)"
        await MainActor.run {
          if let list { controller.add(list) }
          controller.addUserScript(
            WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false, in: .defaultClient))
          log.info(
            "blocker loaded \(counts, privacy: .public) compile=\(String(format: "%.1f", seconds), privacy: .public)s")
          done()
        }
      } catch {
        log.error("blocker load failed \(String(describing: error), privacy: .public)")
        await MainActor.run { done() }
      }
    }
  }

  private static func listText() async throws -> String {
    let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("easylist.txt")
    if let date = try? cache.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
      Date().timeIntervalSince(date) < 86_400, let text = try? String(contentsOf: cache, encoding: .utf8)
    {
      return text
    }
    let (data, _) = try await URLSession.shared.data(from: easyList)
    try data.write(to: cache)
    return String(decoding: data, as: UTF8.self)
  }

  /// `host^` or `host^$third-party` → host; anything with a path or other options → nil.
  private static func host(_ rule: Substring) -> String? {
    guard let caret = rule.firstIndex(of: "^"), caret > rule.startIndex else { return nil }
    let rest = rule[rule.index(after: caret)...]
    guard rest.isEmpty || rest == "$third-party" else { return nil }
    let h = rule[..<caret]
    return h.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "." || $0 == "-" }) ? String(h) : nil
  }

  private static func rule(block: Bool) -> (String) -> [String: Any] {
    { host in
      let escaped = host.replacingOccurrences(of: ".", with: "\\.")
      return [
        "trigger": ["url-filter": "^[^:]+://+([^:/]+\\.)?\(escaped)[:/]", "load-type": ["third-party"]],
        "action": ["type": block ? "block" : "ignore-previous-rules"],
      ]
    }
  }
}
