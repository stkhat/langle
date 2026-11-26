import CryptoKit
import Foundation
import LangleCore
import WebKit

/// The lists' network rules on iOS (docs/specs/mobile-app.md "M6: ad blocking" › "Requests"):
/// each kept list converted by the crate into WebKit content-blocker JSON and compiled by
/// `WKContentRuleListStore` into `WKContentRuleList`s, split where a list passes WebKit's
/// 150,000 rules. They are cached in the store by the list's version (a hash of its text and the
/// app's build), so a new process or an unchanged list compiles nothing; a list's conversion
/// runs off the main thread, WebKit compiles off it too (EasyList about 4.7 s, EasyPrivacy about
/// 5.7 s on the Simulator, M6a). A list that fails keeps the rules it had.
@MainActor
final class ContentRules {
  /// WebKit's limit: 150,000 rules compile, 150,001 fail (M6a).
  nonisolated static let maxRules = 150_000
  private nonisolated static let prefix = "langle-adblock-"

  private let store = WKContentRuleListStore.default()!
  private let work = DispatchQueue(label: "dev.langle.app.content-rules", qos: .utility)
  /// The compiled rules of each list, by list id.
  private var byList: [String: [WKContentRuleList]] = [:]
  private var order: [String] = []
  private var generation = 0

  /// Every list's rules, in the lists' order.
  var all: [WKContentRuleList] { order.flatMap { byList[$0] ?? [] } }

  /// A refresh finished: `all` changed (or may have).
  var onReady: (() -> Void)?
  var onError: ((String) -> Void)?
  var onLog: ((String) -> Void)?

  /// Brings the rules up to the kept lists' texts.
  func refresh(_ kept: [(list: FilterList, file: URL)]) {
    generation += 1
    let generation = self.generation
    let build = Self.buildVersion
    work.async {
      // The lists' versions, off the main thread (their texts are megabytes).
      let versions: [(FilterList, URL, String)] = kept.compactMap { list, file in
        guard let data = try? Data(contentsOf: file) else { return nil }
        var hash = SHA256()
        hash.update(data: data)
        hash.update(data: Data(build.utf8))
        let digest = hash.finalize().prefix(8).map { String(format: "%02x", $0) }.joined()
        return (list, file, "\(Self.prefix)\(list.id)-\(digest)")
      }
      DispatchQueue.main.async {
        MainActor.assumeIsolated { self.resolve(versions, generation: generation) }
      }
    }
  }

  private static var buildVersion: String {
    let info = Bundle.main.infoDictionary ?? [:]
    return "\(info["CFBundleShortVersionString"] ?? "")-\(info["CFBundleVersion"] ?? "")"
  }

  private func resolve(_ versions: [(FilterList, URL, String)], generation: Int) {
    guard generation == self.generation else { return }
    store.getAvailableContentRuleListIdentifiers { [weak self] identifiers in
      guard let self, generation == self.generation else { return }
      let available = Set(identifiers ?? [])
      var waiting = versions.count
      var next: [String: [WKContentRuleList]] = [:]
      let finished = { [weak self] in
        guard let self, generation == self.generation else { return }
        self.order = versions.map { $0.0.id }
        self.byList = next
        self.onReady?()
        self.removeStale(keeping: Set(versions.map(\.2)), from: available)
      }
      if versions.isEmpty { return finished() }
      for (list, file, version) in versions {
        let parts = available.filter { $0.hasPrefix(version + "-") }.sorted()
        let got: ([WKContentRuleList]?) -> Void = { [weak self] lists in
          guard let self else { return }
          next[list.id] = lists ?? self.byList[list.id] ?? []
          waiting -= 1
          if waiting == 0 { finished() }
        }
        if parts.isEmpty {
          compile(list, file: file, version: version, done: got)
        } else {
          lookUp(parts, done: got)
        }
      }
    }
  }

  /// The cached parts of a list, or nil when one of them is gone.
  private func lookUp(_ identifiers: [String], done: @escaping ([WKContentRuleList]?) -> Void) {
    var found: [WKContentRuleList?] = Array(repeating: nil, count: identifiers.count)
    var waiting = identifiers.count
    for (i, identifier) in identifiers.enumerated() {
      store.lookUpContentRuleList(forIdentifier: identifier) { list, _ in
        found[i] = list
        waiting -= 1
        if waiting == 0 { done(found.contains { $0 == nil } ? nil : found.compactMap { $0 }) }
      }
    }
  }

  /// Converts a list (off the main thread) and compiles its parts; nil when it fails.
  private func compile(
    _ list: FilterList, file: URL, version: String, done: @escaping ([WKContentRuleList]?) -> Void
  ) {
    let started = Date()
    work.async {
      let parts: Result<[String], Error> = Result {
        let text = try Data(contentsOf: file)
        return try Self.split(AdblockNative.webkitRules((text, list.trusted)))
      }
      DispatchQueue.main.async {
        MainActor.assumeIsolated {
          switch parts {
          case .failure(let error):
            self.onError?("Ad blocking: could not convert the filter list \(list.id) for WebKit: \(error)")
            done(nil)
          case .success(let parts):
            self.compileParts(list, parts, version: version, started: started, done: done)
          }
        }
      }
    }
  }

  private func compileParts(
    _ list: FilterList, _ parts: [String], version: String, started: Date,
    done: @escaping ([WKContentRuleList]?) -> Void
  ) {
    if parts.isEmpty { return done([]) }
    var compiled: [WKContentRuleList?] = Array(repeating: nil, count: parts.count)
    var waiting = parts.count
    var failure: String?
    for (i, json) in parts.enumerated() {
      store.compileContentRuleList(forIdentifier: "\(version)-\(i)", encodedContentRuleList: json) {
        [weak self] ruleList, error in
        compiled[i] = ruleList
        if let error { failure = "\(error)" }
        waiting -= 1
        guard waiting == 0 else { return }
        if let failure {
          self?.onError?("Ad blocking: WebKit could not compile the filter list \(list.id): \(failure)")
          done(nil)
        } else {
          let seconds = String(format: "%.2f", Date().timeIntervalSince(started))
          self?.onLog?("\(list.id): \(parts.count) WebKit rule list(s) compiled in \(seconds) s")
          done(compiled.compactMap { $0 })
        }
      }
    }
  }

  /// The parts of a rules array within WebKit's limit (one part when it fits, none when empty).
  nonisolated static func split(_ json: String) throws -> [String] {
    guard let rules = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [Any] else {
      throw AdblockNative.Failure(description: "not a JSON array")
    }
    if rules.isEmpty { return [] }
    if rules.count <= maxRules { return [json] }
    return try stride(from: 0, to: rules.count, by: maxRules).map { start in
      let part = Array(rules[start..<min(start + maxRules, rules.count)])
      return String(decoding: try JSONSerialization.data(withJSONObject: part), as: UTF8.self)
    }
  }

  /// Compiled rules of lists' older versions go from WebKit's store.
  private func removeStale(keeping versions: Set<String>, from available: Set<String>) {
    for identifier in available where identifier.hasPrefix(Self.prefix) {
      guard !versions.contains(where: { identifier.hasPrefix($0 + "-") }) else { continue }
      store.removeContentRuleList(forIdentifier: identifier) { _ in }
    }
  }
}
