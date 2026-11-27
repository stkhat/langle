import Foundation

/// One list of mobile/protocol/filter-lists.json: its URL, then its fallbacks.
public struct FilterList: Equatable, Sendable {
  public let id: String
  public let urls: [String]
  public let trusted: Bool

  public init(id: String, urls: [String], trusted: Bool) {
    self.id = id
    self.urls = urls
    self.trusted = trusted
  }

  /// The lists of filter-lists.json's text (the langle-app build's `adblock/filter-lists.json`).
  public static func read(_ text: String) -> [FilterList] {
    guard let items = (try? JSONValue.parse(text))?["lists"]?.array else { return [] }
    return items.compactMap { item in
      guard let id = item["id"]?.string, isSafeName(id), let url = item["url"]?.string else {
        return nil
      }
      let fallbacks = item["fallbacks"]?.array?.compactMap(\.string) ?? []
      return FilterList(id: id, urls: [url] + fallbacks, trusted: item["trusted"]?.bool == true)
    }
  }

  /// A file name of the app's own (no path, no `..`).
  static func isSafeName(_ name: String) -> Bool {
    (1...128).contains(name.count) && name != "." && name != ".."
      && name.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "._-".contains($0)) }
  }
}

/// A list fetch's answer: 200 with the text, 304 (not modified), or another status.
public struct ListAnswer: Sendable {
  public let status: Int
  public let body: Data
  public let etag: String?
  public let lastModified: String?

  public init(status: Int, body: Data = Data(), etag: String? = nil, lastModified: String? = nil) {
    self.status = status
    self.body = body
    self.etag = etag
    self.lastModified = lastModified
  }
}

/// Fetches a list (blocking, on the store's background queue), conditionally when it has
/// validators. Throws when it cannot connect or read.
public protocol ListFetcher {
  func fetch(_ url: String, etag: String?, lastModified: String?) throws -> ListAnswer
}

/// `ListFetcher` over URLSession, with no cache of its own: `If-None-Match` /
/// `If-Modified-Since`, at most `maxBytes`.
public final class URLSessionListFetcher: ListFetcher {
  public struct Failure: Error, CustomStringConvertible {
    public let description: String
  }

  private final class Box: @unchecked Sendable {
    var result: Result<ListAnswer, Error> = .failure(Failure(description: "no answer"))
  }

  private let session: URLSession
  private let maxBytes: Int

  public init(timeout: TimeInterval = 30, maxBytes: Int = 32_000_000) {
    let config = URLSessionConfiguration.ephemeral
    config.urlCache = nil
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = timeout
    session = URLSession(configuration: config)
    self.maxBytes = maxBytes
  }

  public func fetch(_ url: String, etag: String?, lastModified: String?) throws -> ListAnswer {
    guard let address = URL(string: url) else { throw Failure(description: "bad URL") }
    var request = URLRequest(url: address)
    if let etag { request.setValue(etag, forHTTPHeaderField: "If-None-Match") }
    if let lastModified { request.setValue(lastModified, forHTTPHeaderField: "If-Modified-Since") }
    let box = Box()
    let done = DispatchSemaphore(value: 0)
    let maxBytes = self.maxBytes
    session.dataTask(with: request) { data, response, error in
      defer { done.signal() }
      if let error {
        box.result = .failure(Failure(description: error.localizedDescription))
        return
      }
      guard let http = response as? HTTPURLResponse else {
        box.result = .failure(Failure(description: "not HTTP"))
        return
      }
      guard http.statusCode == 200 else {
        box.result = .success(ListAnswer(status: http.statusCode))
        return
      }
      let body = data ?? Data()
      if body.count > maxBytes {
        box.result = .failure(Failure(description: "over \(maxBytes) bytes"))
        return
      }
      box.result = .success(
        ListAnswer(
          status: 200, body: body, etag: http.value(forHTTPHeaderField: "ETag"),
          lastModified: http.value(forHTTPHeaderField: "Last-Modified")))
    }.resume()
    done.wait()
    return try box.result.get()
  }
}

/// The shell's engine (adblock-rust through the module LangleAdblock on iOS) as the store uses
/// it: built from the lists' texts and serialized, loaded from those bytes, released once
/// swapped out.
public protocol FilterEngines {
  associatedtype Engine: AnyObject
  /// Builds an engine from the lists (text, trusted) and serializes it; throws when it cannot.
  func build(_ lists: [(text: Data, trusted: Bool)]) throws -> Data
  /// Loads a serialized engine; throws when the bytes are bad or of another crate version.
  func load(_ bytes: Data) throws -> Engine
  /// An engine no longer in use (calls already running on it finish first).
  func release(_ engine: Engine)
}

/// The store's files and numbers (outside the generic store, which cannot hold static ones).
public enum FilterLists {
  public static let listsFile = "lists.json"
  public static let engineFile = "engine.bin"
  /// A list that names no `! Expires:`.
  public static let defaultExpiresMs = 4 * 24 * 3_600_000.0
  /// A list whose URLs all failed is tried again after this.
  public static let retryMs = 30 * 60_000.0
  private static let hourMs = 3_600_000.0
  private static let expires = try! NSRegularExpression(
    pattern: #"^!\s*Expires:\s*(\d+)\s*(days?|hours?|d|h)\b"#,
    options: [.caseInsensitive, .anchorsMatchLines])

  /// A list's own `! Expires: 4 days` / `12 hours` in its header, kept within 1 hour and 14 days.
  public static func expiryMs(_ text: Data) -> Double {
    let head = String(decoding: text.prefix(4096), as: UTF8.self)
    let range = NSRange(head.startIndex..., in: head)
    guard let match = expires.firstMatch(in: head, range: range),
      let number = Range(match.range(at: 1), in: head), let unit = Range(match.range(at: 2), in: head),
      let n = Double(head[number])
    else { return defaultExpiresMs }
    let ms = head[unit].lowercased().hasPrefix("h") ? n * hourMs : n * 24 * hourMs
    return min(max(ms, hourMs), 14 * 24 * hourMs)
  }

  /// A filter list starts with `[Adblock …]` or a `!` comment; a portal's HTML page does not.
  public static func looksLikeList(_ text: Data) -> Bool {
    let head = String(decoding: text.prefix(1024), as: UTF8.self)
      .drop { $0 == "\u{FEFF}" || $0 == " " || $0 == "\t" || $0 == "\r" || $0 == "\n" || $0 == "\r\n" }
    return head.hasPrefix("[") || head.hasPrefix("!")
  }
}

/// The ad-blocking filter lists in the app's files and the engine built from them
/// (docs/specs/mobile-app.md "M6: ad blocking" › "The list store"; Android's `FilterListStore` in
/// mobile/android/core keeps the same rules, and these tests mirror its JUnit tests):
/// - each list's text (`<id>.txt`), `ETag`, `Last-Modified`, the URL it came from and the fetch
///   time (`lists.json`); the serialized engine (`engine.bin`);
/// - `start` loads the kept engine (or builds it again from the kept texts when the bytes are of
///   another crate version);
/// - `update` fetches every list that is due: never fetched, or past its own `! Expires:` (4 days
///   when it names none). The request is conditional when the list has validators from the same
///   URL; a 304 only renews the fetch time. A list whose URLs all fail keeps its text and is
///   tried again after `retryMs`. After any list changed, the engine is built again and swapped
///   in when built; a failed build keeps the engine in use;
/// - until a first fetch succeeds there is no engine, so nothing is blocked.
/// Work runs one job at a time through `background`; `main` brings the swaps and reports back to
/// the app's thread, where every call is made and `engine` is read.
public final class FilterListStore<Engines: FilterEngines> {
  public typealias Engine = Engines.Engine

  /// What is kept about a list; `fetchedAt` is nil for a list never fetched (only failed).
  private struct Kept {
    var etag: String?
    var lastModified: String?
    var source: String?
    var fetchedAt: Double?
    var expiresMs: Double
    var failedAt: Double?

    var value: JSONValue {
      var o: [String: JSONValue] = ["expiresMs": .number(expiresMs)]
      if let etag { o["etag"] = .string(etag) }
      if let lastModified { o["lastModified"] = .string(lastModified) }
      if let source { o["source"] = .string(source) }
      if let fetchedAt { o["fetchedAt"] = .number(fetchedAt) }
      if let failedAt { o["failedAt"] = .number(failedAt) }
      return .object(o)
    }

    func failed(_ at: Double) -> Kept {
      var next = self
      next.failedAt = at
      return next
    }

    init(
      etag: String?, lastModified: String?, source: String?, fetchedAt: Double?, expiresMs: Double,
      failedAt: Double?
    ) {
      self.etag = etag
      self.lastModified = lastModified
      self.source = source
      self.fetchedAt = fetchedAt
      self.expiresMs = expiresMs
      self.failedAt = failedAt
    }

    init?(_ value: JSONValue) {
      guard value.object != nil else { return nil }
      self.init(
        etag: value["etag"]?.string, lastModified: value["lastModified"]?.string,
        source: value["source"]?.string, fetchedAt: value["fetchedAt"]?.number,
        expiresMs: value["expiresMs"]?.number ?? FilterLists.defaultExpiresMs,
        failedAt: value["failedAt"]?.number)
    }
  }

  private let dir: URL
  public let lists: [FilterList]
  private let fetcher: ListFetcher
  private let engines: Engines
  private let background: (@escaping () -> Void) -> Void
  private let main: (@escaping () -> Void) -> Void
  private let now: () -> Double
  private let retryMs: Double

  /// The engine in use, or nil (no list fetched yet).
  public private(set) var engine: Engine?
  /// After an engine was swapped in.
  public var onEngine: ((Engine) -> Void)?
  /// A round fetched every due list (each changed or not modified) and the engine took them.
  public var onUpdated: ((_ updatedAt: Double) -> Void)?
  /// An engine that could not be built or loaded (a bug, not the network).
  public var onError: ((String) -> Void)?
  /// A list none of whose URLs answered with a list (the network, or a list host down).
  public var onFetchFailed: ((String) -> Void)?
  /// Something worth a log line (a list fetched, an engine built).
  public var onLog: ((String) -> Void)?

  private var busy = false
  private var again = false
  private var againForced = false

  public init(
    dir: URL, lists: [FilterList], fetcher: ListFetcher, engines: Engines,
    background: @escaping (@escaping () -> Void) -> Void,
    main: @escaping (@escaping () -> Void) -> Void,
    now: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 },
    retryMs: Double = FilterLists.retryMs
  ) {
    self.dir = dir
    self.lists = lists
    self.fetcher = fetcher
    self.engines = engines
    self.background = background
    self.main = main
    self.now = now
    self.retryMs = retryMs
  }

  private func textFile(_ list: FilterList) -> URL { dir.appendingPathComponent("\(list.id).txt") }
  private func hasText(_ list: FilterList) -> Bool {
    FileManager.default.fileExists(atPath: textFile(list).path)
  }

  /// When a list is due: at once when never tried; after `retryMs` from a failure; else at its
  /// expiry.
  private func dueAt(_ kept: Kept?, hasText: Bool) -> Double {
    let retry = kept?.failedAt.map { $0 + retryMs } ?? -.infinity
    guard hasText, let kept, let fetched = kept.fetchedAt else { return retry }
    return max(fetched + kept.expiresMs, retry)
  }

  /// Loads the kept engine, if any.
  public func start() {
    busy = true
    background { [self] in
      let result = Result { try loadKept() }
      main { [self] in
        switch result {
        case .success(let engine): if let engine { swap(engine) }
        case .failure(let error):
          onError?("Ad blocking: could not load the filter lists' engine: \(error)")
        }
        finish()
      }
    }
  }

  /// Whether a list is due now.
  public func isDue() -> Bool {
    let kept = readKept()
    let time = now()
    return lists.contains { time >= dueAt(kept[$0.id], hasText: hasText($0)) }
  }

  /// Fetches the lists that are due (every list when `force`: check commands), then builds and
  /// swaps the engine when one changed.
  public func update(force: Bool = false) {
    if busy {
      again = true
      againForced = againForced || force
      return
    }
    if !force && !isDue() { return }
    busy = true
    let hadEngine = engine != nil
    background { [self] in
      var messages: [(String, fetch: Bool)] = []
      let outcome = Result { try round(&messages, force: force, hadEngine: hadEngine) }
      main { [self] in
        for (message, fetch) in messages { (fetch ? onFetchFailed : onError)?(message) }
        switch outcome {
        case .success(let (built, updatedAt)):
          if let built { swap(built) }
          if let updatedAt { onUpdated?(updatedAt) }
        case .failure(let error):
          onError?("Ad blocking: could not update the filter lists: \(error)")
        }
        finish()
      }
    }
  }

  private func finish() {
    busy = false
    if again {
      let force = againForced
      again = false
      againForced = false
      update(force: force)
    }
  }

  private func swap(_ next: Engine) {
    let old = engine
    engine = next
    onEngine?(next)
    if let old, old !== next { engines.release(old) }
  }

  /// The lists whose text is kept, with their files (the app converts them for WebKit).
  public func keptLists() -> [(list: FilterList, file: URL)] {
    lists.filter(hasText).map { ($0, textFile($0)) }
  }

  /// The last round's update time, when one was complete (kept in `lists.json`).
  public func updatedAt() -> Double? { readJSON(FilterLists.listsFile)?["updatedAt"]?.number }

  // MARK: the background queue

  private func readJSON(_ name: String) -> JSONValue? {
    guard let data = try? Data(contentsOf: dir.appendingPathComponent(name)) else { return nil }
    return try? JSONValue.parse(String(decoding: data, as: UTF8.self))
  }

  private func readKept() -> [String: Kept] {
    (readJSON(FilterLists.listsFile)?["lists"]?.object ?? [:]).compactMapValues(Kept.init)
  }

  private func texts() -> [(text: Data, trusted: Bool)] {
    lists.compactMap { list in (try? Data(contentsOf: textFile(list))).map { ($0, list.trusted) } }
  }

  private func log(_ message: String) {
    guard let onLog else { return }
    main { onLog(message) }
  }

  private func loadKept() throws -> Engine? {
    if let bytes = try? Data(contentsOf: dir.appendingPathComponent(FilterLists.engineFile)) {
      do {
        return try engines.load(bytes)
      } catch {
        log("the kept engine did not load (\(error)); building it again")
      }
    }
    let texts = texts()
    return texts.isEmpty ? nil : try buildAndKeep(texts)
  }

  private func buildAndKeep(_ texts: [(text: Data, trusted: Bool)]) throws -> Engine {
    let bytes = try engines.build(texts)
    let engine = try engines.load(bytes)
    try write(FilterLists.engineFile, bytes)
    log("engine built from \(texts.count) lists (\(bytes.count) bytes)")
    return engine
  }

  private func write(_ name: String, _ bytes: Data) throws {
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    try bytes.write(to: dir.appendingPathComponent(name), options: .atomic)
  }

  /// One round: the engine built when a list changed (or none), and the update time when every
  /// due list is current.
  private func round(_ messages: inout [(String, fetch: Bool)], force: Bool, hadEngine: Bool) throws
    -> (Engine?, Double?)
  {
    var kept = readKept()
    let time = now()
    var changed = false
    var allCurrent = true
    for list in lists {
      let old = kept[list.id]
      let hadText = hasText(list)
      if !force && time < dueAt(old, hasText: hadText) { continue }
      var errors: [String] = []
      var done = false
      for url in list.urls {
        let conditional = old.flatMap {
          hadText && $0.source == url && ($0.etag != nil || $0.lastModified != nil) ? $0 : nil
        }
        do {
          let answer = try fetcher.fetch(
            url, etag: conditional?.etag, lastModified: conditional?.lastModified)
          if answer.status == 304, let conditional {
            kept[list.id] = Kept(
              etag: conditional.etag, lastModified: conditional.lastModified, source: url,
              fetchedAt: time, expiresMs: conditional.expiresMs, failedAt: nil)
            log("\(list.id): not modified")
            done = true
            break
          }
          guard answer.status == 200 else {
            errors.append("\(url): HTTP \(answer.status)")
            continue
          }
          guard FilterLists.looksLikeList(answer.body) else {
            errors.append("\(url): not a filter list")
            continue
          }
          try write("\(list.id).txt", answer.body)
          kept[list.id] = Kept(
            etag: answer.etag, lastModified: answer.lastModified, source: url, fetchedAt: time,
            expiresMs: FilterLists.expiryMs(answer.body), failedAt: nil)
          log("\(list.id): \(answer.body.count) bytes from \(url)")
          changed = true
          done = true
          break
        } catch {
          errors.append("\(url): \(error)")
        }
      }
      if !done {
        allCurrent = false
        kept[list.id] =
          old?.failed(time)
          ?? Kept(
            etag: nil, lastModified: nil, source: nil, fetchedAt: nil,
            expiresMs: FilterLists.defaultExpiresMs, failedAt: time)
        messages.append(
          (
            "Ad blocking: could not update the filter list \(list.id) (\(errors.joined(separator: "; ")))",
            fetch: true
          ))
      }
    }
    var built: Engine?
    if changed || (!hadEngine && !kept.isEmpty) {
      let texts = texts()
      if !texts.isEmpty {
        do {
          built = try buildAndKeep(texts)
        } catch {
          allCurrent = false
          messages.append(("Ad blocking: could not build the filter lists' engine: \(error)", fetch: false))
        }
      }
    }
    let updatedAt = allCurrent && (built != nil || hadEngine) ? time : nil
    var file: [String: JSONValue] = ["lists": .object(kept.mapValues(\.value))]
    if let at = updatedAt ?? self.updatedAt() { file["updatedAt"] = .number(at) }
    try write(FilterLists.listsFile, Data(JSONValue.object(file).json.utf8))
    return (built, updatedAt)
  }
}
