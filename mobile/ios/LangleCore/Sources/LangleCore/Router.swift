import Foundation

/// Which script context a connection is (docs/specs/mobile-app.md "Contexts").
public enum ContextSpec: Equatable, Sendable {
  /// The extension host, running `background.js`.
  case host
  /// Langle's content scripts in a tab's frame (0: the top frame).
  case content(tabId: Int, frameId: Int = 0)
  /// An app page (`popup.html`, `options.html` …), in a tab or in no tab (the Langle sheet).
  case page(url: String, tabId: Int? = nil)
}

/// What the router asks the app to do with its screens.
public enum RouterAction: Equatable, Sendable {
  /// `tabs.create` or `runtime.openOptionsPage` opened a tab.
  case openTab(Tab)
  /// `tabs.update` gave a tab a new address.
  case navigateTab(Tab)
  /// `tabs.update` brought a tab to the front.
  case activateTab(Tab)
  case closeTab(Tab)
  case reloadTab(Int)
  /// `action.openPopup`: the Langle sheet.
  case openPopup
  /// `runtime.reload`: the extension host again.
  case reloadHost
}

/// Chrome's text when a message has nobody to answer it (`messaging/client.ts` retries on it).
public let noReceiver = "Could not establish connection. Receiving end does not exist."

/// An error a call is answered with.
public struct BridgeError: Error, Equatable, Sendable {
  public let message: String
  public init(_ message: String) { self.message = message }
}

/// One script context's line to the router. The app passes what the scripts post to
/// `receive`; the router answers through the `deliver` it was connected with.
public final class Connection {
  public let spec: ContextSpec
  fileprivate weak var router: Router?
  fileprivate let deliver: (String) -> Void
  fileprivate var ready = false
  fileprivate var connected = true

  fileprivate init(spec: ContextSpec, router: Router, deliver: @escaping (String) -> Void) {
    self.spec = spec
    self.router = router
    self.deliver = deliver
  }

  /// A JSON envelope from the context's scripts.
  public func receive(_ json: String) {
    guard connected else { return }
    router?.receive(self, json)
  }

  /// The context is gone (its page closed or navigated, its content process lost).
  public func disconnect() {
    router?.disconnect(self)
  }

  /// The scripts said hello: events can reach them.
  public var isReady: Bool { ready }
}

/// The router of docs/specs/mobile-app.md "Bridge protocol": the Swift copy of
/// `src/app/testing/reference-native.ts`, ported with its tests.
/// - native code fills in the sender of every message; nothing in an envelope says who sent it;
/// - a storage write saves, posts `storage.onChanged` to every context, and only then replies to
///   the writer; a write that changes nothing posts nothing;
/// - a message for the extension host waits (up to `hostWaitMs`) for the host's hello, then fails
///   with "Receiving end does not exist", as does a message whose receiver goes away first;
/// - after the host's first hello in a process it gets `runtime.onInstalled` (first run, or a new
///   build) or `runtime.onStartup`.
/// Not thread-safe: the app calls it on the main thread.
public final class Router {
  public struct Options: Sendable {
    public var id = "langle-app"
    public var origin = "https://app.langle.invalid"
    /// The bundled build's version.
    public var version = "1.0.0"
    public var hostWaitMs = 10_000.0
    public init(id: String? = nil, origin: String? = nil, version: String? = nil, hostWaitMs: Double? = nil) {
      if let id { self.id = id }
      if let origin { self.origin = origin }
      if let version { self.version = version }
      if let hostWaitMs { self.hostWaitMs = hostWaitMs }
    }
  }

  private struct Forward {
    let target: Connection
    let settle: (Result<JSONValue?, BridgeError>) -> Void
  }

  private final class Waiter {
    var timer: AnyObject?
    let resolve: (Result<Connection, BridgeError>) -> Void
    init(_ resolve: @escaping (Result<Connection, BridgeError>) -> Void) { self.resolve = resolve }
  }

  public let options: Options
  public let store: KeyValueStore
  public let tabs = Tabs()
  /// What the app does for the router (open a sheet, reload a page …).
  public var onAction: ((RouterAction) -> Void)?
  /// Bad envelopes and other things worth a log line; never a crash.
  public var onError: ((String) -> Void)?
  /// `appHost.shareFile`: the app shows the share sheet with the file, then calls `done` with nil
  /// once it shows, or with why it could not.
  public var onShareFile: ((SharedFile, _ done: @escaping (String?) -> Void) -> Void)?
  /// After any write that changed a storage area (the shim's or `setStorage`): what changed.
  public var onStorageChanged: ((KeyValueStore.Area, [String: KeyValueStore.Change]) -> Void)?
  /// The app's translation host (docs/specs/mobile-translation.md "M5: the hosts"): the calls in
  /// `translationApis`, with the context that asked (the host answers a page not on screen with
  /// null at once) and the call's one argument; the app answers through `done`. Nil until the app
  /// has a host: each such call fails with "<api> is not available here."
  public var onTranslation:
    (
      (
        _ from: ContextSpec, _ api: String, _ request: JSONValue?,
        _ done: @escaping (Result<JSONValue?, BridgeError>) -> Void
      ) -> Void
    )?

  private let persistence: Persistence
  private let clock: Clock
  private var contexts: [Connection] = []
  private var forwards: [String: Forward] = [:]
  private var hostWaiters: [Waiter] = []
  private var installedVersion: String?
  private var started = false
  private var nextReply = 0
  private lazy var alarms = Alarms(clock: clock) { [weak self] alarm in self?.fire(alarm) }

  private static let installedKey = "installed"

  public init(options: Options = Options(), persistence: Persistence, clock: Clock) {
    self.options = options
    self.persistence = persistence
    self.clock = clock
    store = KeyValueStore(persistence: persistence)
    installedVersion = persistence.load(Self.installedKey)?["version"]?.string
  }

  /// Connects a script context; its scripts say hello when they have run.
  public func connect(_ spec: ContextSpec, deliver: @escaping (String) -> Void) -> Connection {
    let connection = Connection(spec: spec, router: self, deliver: deliver)
    contexts.append(connection)
    return connection
  }

  /// The version that ran last (nil before the first run).
  public var installed: String? { installedVersion }

  // MARK: delivery

  private func deliver(_ context: Connection, _ envelope: Envelope) {
    if context.connected { context.deliver(envelope.json) }
  }

  private func postEvent(_ context: Connection, _ api: String, _ args: [JSONValue]) {
    deliver(context, .event(api: api, args: args, replyId: nil))
  }

  private var host: Connection? { contexts.first { $0.spec == .host && $0.ready } }

  private func sender(_ context: Connection) -> JSONValue {
    let id = JSONValue.string(options.id)
    switch context.spec {
    case .host:
      return ["id": id, "url": .string("\(options.origin)/"), "origin": .string(options.origin)]
    case .content(let tabId, let frameId):
      let tab = tabs.get(tabId)
      var o = senderBase(id: id, url: tab?.url ?? "")
      if let tab { o["tab"] = tab.value }
      o["frameId"] = .number(Double(frameId))
      return .object(o)
    case .page(let url, let tabId):
      var o = senderBase(id: id, url: url)
      if let tab = tabId.flatMap(tabs.get) { o["tab"] = tab.value }
      return .object(o)
    }
  }

  private func senderBase(id: JSONValue, url: String) -> [String: JSONValue] {
    var o: [String: JSONValue] = ["id": id, "url": .string(url)]
    if let origin = Self.origin(of: url) { o["origin"] = .string(origin) }
    return o
  }

  /// `scheme://host[:port]`, as the engines report a page's origin.
  static func origin(of url: String) -> String? {
    guard let parts = URLComponents(string: url), let scheme = parts.scheme, let host = parts.host
    else { return nil }
    return "\(scheme)://\(host)\(parts.port.map { ":\($0)" } ?? "")"
  }

  /// Sends a message as `runtime.onMessage` and settles with the receiver's answer.
  private func forward(
    _ target: Connection, _ message: JSONValue, from: Connection,
    _ done: @escaping (Result<JSONValue?, BridgeError>) -> Void
  ) {
    nextReply += 1
    let replyId = "n\(nextReply)"
    forwards[replyId] = Forward(target: target) { [weak self] result in
      self?.forwards.removeValue(forKey: replyId)
      done(result)
    }
    deliver(
      target, .event(api: "runtime.onMessage", args: [message, sender(from)], replyId: replyId))
  }

  private func whenHostReady(_ done: @escaping (Result<Connection, BridgeError>) -> Void) {
    if let host { return done(.success(host)) }
    let waiter = Waiter(done)
    waiter.timer = clock.schedule(after: options.hostWaitMs) { [weak self, weak waiter] in
      guard let self, let waiter else { return }
      self.hostWaiters.removeAll { $0 === waiter }
      waiter.resolve(.failure(BridgeError(noReceiver)))
    }
    hostWaiters.append(waiter)
  }

  private func startHost(_ context: Connection) {
    context.ready = true
    if !started {
      started = true
      if installedVersion == nil {
        postEvent(context, "runtime.onInstalled", [["reason": "install"]])
      } else if let previous = installedVersion, previous != options.version {
        postEvent(
          context, "runtime.onInstalled",
          [["reason": "update", "previousVersion": .string(previous)]])
      } else {
        postEvent(context, "runtime.onStartup", [])
      }
      installedVersion = options.version
      do {
        try persistence.save(Self.installedKey, ["version": .string(options.version)])
      } catch {
        onError?("Router: could not save the installed version: \(error)")
      }
    }
    let waiting = hostWaiters
    hostWaiters.removeAll()
    for waiter in waiting {
      if let timer = waiter.timer { clock.cancel(timer) }
      waiter.resolve(.success(context))
    }
  }

  // MARK: storage

  private func storage(_ area: KeyValueStore.Area, _ op: String, _ args: [JSONValue]) throws
    -> JSONValue?
  {
    let changes: [String: KeyValueStore.Change]
    switch op {
    case "get":
      let keys = args.first?.array?.compactMap(\.string)
      return .object(store.get(area, keys: keys))
    case "set":
      changes = try store.set(area, args.first?.object ?? [:])
    case "remove":
      changes = try store.remove(area, args.first?.array?.compactMap(\.string) ?? [])
    default:
      changes = try store.clear(area)
    }
    if !changes.isEmpty {
      let value = JSONValue.object(changes.mapValues(\.value))
      for context in contexts {
        postEvent(context, "storage.onChanged", [value, .string(area.rawValue)])
      }
      onStorageChanged?(area, changes)
    }
    return nil
  }

  /// Native code's own write (the ad-blocking switches, the list store): heard as the shim's are.
  public func setStorage(_ area: KeyValueStore.Area, _ items: [String: JSONValue]) {
    do {
      _ = try storage(area, "set", [.object(items)])
    } catch {
      onError?("storage.\(area.rawValue).set: \(error)")
    }
  }

  // MARK: tabs

  private func tab(_ id: JSONValue?) throws -> Tab {
    guard let number = id?.number, let tab = tabs.get(Int(number)) else {
      throw BridgeError("No tab with id: \(JSONValue.jsString(id)).")
    }
    return tab
  }

  private func appURL(_ url: String?) -> String {
    let base = URL(string: "\(options.origin)/")!
    guard let url, let resolved = URL(string: url, relativeTo: base) else { return base.absoluteString }
    return resolved.absoluteString
  }

  @discardableResult
  private func openTab(_ url: String, active: Bool = true) -> Tab {
    let tab = tabs.open(url: url, active: active)
    onAction?(.openTab(tab))
    return tab
  }

  /// A page the user opened (a web page in the browsing engine).
  public func openTab(url: String, active: Bool = true) -> Int {
    tabs.open(url: url, active: active).id
  }

  /// An event for the extension host (`appHost.models.onProgress`); dropped while it has not
  /// said hello (it asks again when it starts).
  public func postToHost(_ api: String, _ args: [JSONValue]) {
    if let host { postEvent(host, api, args) }
  }

  // MARK: alarms

  private func fire(_ alarm: Alarm) {
    whenHostReady { [weak self] result in
      if case .success(let host) = result {
        self?.postEvent(host, "alarms.onAlarm", [alarm.value])
      }
    }
  }

  // MARK: calls

  private func handle(
    _ context: Connection, _ api: String, _ args: [JSONValue],
    _ done: @escaping (Result<JSONValue?, BridgeError>) -> Void
  ) throws {
    switch api {
    case "bridge.hello":
      if context.spec == .host { startHost(context) } else { context.ready = true }
      done(.success(nil))
    case "runtime.sendMessage":
      if context.spec == .host { throw BridgeError(noReceiver) }
      let message = args.first ?? .null
      whenHostReady { [weak self] result in
        switch result {
        case .success(let host): self?.forward(host, message, from: context, done)
        case .failure(let error): done(.failure(error))
        }
      }
    case "tabs.sendMessage":
      let tabId = args.first?.number.map { Int($0) }
      let frameId = args.count > 2 ? Int(args[2]["frameId"]?.number ?? 0) : 0
      let target = contexts.first { candidate in
        guard candidate.ready else { return false }
        switch candidate.spec {
        case .host: return false
        case .content(let id, let frame): return id == tabId && frame == frameId
        case .page(_, let id): return id != nil && id == tabId
        }
      }
      guard let target else { throw BridgeError(noReceiver) }
      forward(target, args.count > 1 ? args[1] : .null, from: context, done)
    case "runtime.openOptionsPage":
      openTab("\(options.origin)/options.html")
      done(.success(nil))
    case "runtime.reload":
      onAction?(.reloadHost)
      done(.success(nil))
    case "action.openPopup":
      onAction?(.openPopup)
      done(.success(nil))
    case "tabs.query":
      let query = args.first
      let found = tabs.query(active: query?["active"]?.bool, url: query?["url"]?.string)
      done(.success(.array(found.map(\.value))))
    case "tabs.get":
      done(.success(try tab(args.first).value))
    case "tabs.getCurrent":
      // As Chrome: an app page's own tab; nothing for the host, content or a page without one.
      if case .page(_, let id?) = context.spec, let current = tabs.get(id) {
        done(.success(current.value))
      } else {
        done(.success(nil))
      }
    case "tabs.create":
      let properties = args.first
      let created = openTab(
        appURL(properties?["url"]?.string), active: properties?["active"]?.bool ?? true)
      done(.success(created.value))
    case "tabs.update":
      let (id, properties): (JSONValue?, JSONValue?) =
        args.first?.number != nil ? (args.first, args.count > 1 ? args[1] : nil) : (nil, args.first)
      guard var target = id == nil ? tabs.active : try tab(id) else {
        throw BridgeError("No active tab.")
      }
      if let url = properties?["url"]?.string {
        tabs.setURL(target.id, appURL(url))
        target = tabs.get(target.id)!
        onAction?(.navigateTab(target))
      }
      if properties?["active"]?.bool == true {
        tabs.activate(target.id)
        target = tabs.get(target.id)!
        onAction?(.activateTab(target))
      }
      done(.success(target.value))
    case "tabs.remove":
      let ids = args.first?.array ?? [args.first ?? .null]
      for id in ids {
        let removed = try tab(id)
        tabs.remove(removed.id)
        onAction?(.closeTab(removed))
      }
      done(.success(nil))
    case "tabs.reload":
      let id = args.first?.number.map { Int($0) } ?? tabs.active?.id
      if let id { onAction?(.reloadTab(id)) }
      done(.success(nil))
    case "alarms.create":
      let (name, info): (String, JSONValue?) =
        args.first?.string != nil ? (args[0].string!, args.count > 1 ? args[1] : nil) : ("", args.first)
      alarms.create(
        name: name, when: info?["when"]?.number, delayInMinutes: info?["delayInMinutes"]?.number,
        periodInMinutes: info?["periodInMinutes"]?.number)
      done(.success(nil))
    case "alarms.get":
      done(.success(alarms.get(args.first?.string ?? "")?.value))
    case "alarms.clear":
      done(.success(.bool(alarms.clear(args.first?.string ?? ""))))
    case "appHost.openPage":
      // A web page from an app page (Home's search, Continue, a link in Words): the shell
      // opens it over Home.
      guard let text = args.first?.string, let url = URL(string: text), url.scheme != nil else {
        throw BridgeError("appHost.openPage needs an address")
      }
      openTab(url.absoluteString)
      done(.success(nil))
    case "appHost.shareFile":
      guard let file = SharedFile(args.first) else { throw BridgeError(SharedFile.error) }
      guard let share = onShareFile else { throw BridgeError(noSharing) }
      share(file) { error in done(error.map { .failure(BridgeError($0)) } ?? .success(nil)) }
    case _ where translationApis.contains(api):
      guard let host = onTranslation else { throw BridgeError(notAvailable(api)) }
      host(context.spec, api, args.first, done)
    case _ where googleAuthApis.contains(api):
      throw BridgeError(notAvailable(api))
    default:
      // storage.<area>.<get | set | remove | clear>
      let parts = api.split(separator: ".").map(String.init)
      guard parts.count == 3, parts[0] == "storage", let area = KeyValueStore.Area(rawValue: parts[1])
      else { throw BridgeError("unknown call api \(api)") }
      done(.success(try storage(area, parts[2], args)))
    }
  }

  fileprivate func receive(_ context: Connection, _ json: String) {
    let envelope: Envelope
    switch Envelope.parse(json) {
    case .failure(let error):
      onError?("Router: \(error.message) \(json.prefix(300))")
      if let id = Envelope.callId(of: json) {
        deliver(context, .reply(id: id, result: .error(error.message)))
      }
      return
    case .success(let parsed): envelope = parsed
    }
    switch envelope {
    case .reply(let id, let result):
      guard let pending = forwards[id], pending.target === context else { return }
      switch result {
      case .ok(let value): pending.settle(.success(value))
      case .error(let message): pending.settle(.failure(BridgeError(message)))
      }
    case .event(let api, _, _):
      onError?("Router: an event from a script (\(api))")
    case .call(let id, let api, let args):
      let reply: (Result<JSONValue?, BridgeError>) -> Void = { [weak self, weak context] result in
        guard let self, let context else { return }
        switch result {
        case .success(let value): self.deliver(context, .reply(id: id, result: .ok(value)))
        case .failure(let error): self.deliver(context, .reply(id: id, result: .error(error.message)))
        }
      }
      do {
        try handle(context, api, args, reply)
      } catch let error as BridgeError {
        reply(.failure(error))
      } catch {
        reply(.failure(BridgeError("\(error)")))
      }
    }
  }

  fileprivate func disconnect(_ context: Connection) {
    context.connected = false
    context.ready = false
    contexts.removeAll { $0 === context }
    for (_, pending) in forwards where pending.target === context {
      pending.settle(.failure(BridgeError(noReceiver)))
    }
  }
}
