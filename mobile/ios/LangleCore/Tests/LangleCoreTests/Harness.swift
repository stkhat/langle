import Foundation
import LangleCore

/// A clock the tests move by hand (`vi.useFakeTimers` on the TS side).
final class ManualClock: Clock {
  private final class Timer {
    let due: Double
    let order: Int
    let run: () -> Void
    init(due: Double, order: Int, run: @escaping () -> Void) {
      self.due = due
      self.order = order
      self.run = run
    }
  }

  private(set) var time: Double
  private var timers: [Timer] = []
  private var count = 0

  init(now: Double = 0) { time = now }

  func now() -> Double { time }

  func schedule(after ms: Double, _ run: @escaping () -> Void) -> AnyObject {
    count += 1
    let timer = Timer(due: time + ms, order: count, run: run)
    timers.append(timer)
    return timer
  }

  func cancel(_ token: AnyObject) { timers.removeAll { $0 === token } }

  /// Moves the time, running each timer that comes due in order and `between` after each.
  func advance(by ms: Double, between: () -> Void) {
    let end = time + ms
    while let next = timers.filter({ $0.due <= end }).min(by: { ($0.due, $0.order) < ($1.due, $1.order) }) {
      timers.removeAll { $0 === next }
      time = next.due
      next.run()
      between()
    }
    time = end
  }
}

/// A call's answer, once it came.
final class Pending {
  var result: Result<JSONValue?, BridgeError>?
  var onSettle: (() -> Void)?

  var settled: Bool { result != nil }
  /// The value of an ok reply (`.some(nil)`: ok with no value).
  var value: JSONValue?? {
    if case .success(let value) = result { return .some(value) }
    return nil
  }
  var error: String? {
    if case .failure(let error) = result { return error.message }
    return nil
  }
}

/// What a script's event handler does: answer, throw, or never answer.
enum Answer {
  case value(JSONValue?)
  case error(String)
  case never
}

/// The script side of one context, as `createBridge` is in the TS tests.
final class Script {
  let harness: Harness
  var connection: Connection!
  private var handlers: [String: ([JSONValue]) -> Answer] = [:]
  private var pending: [String: Pending] = [:]
  private var nextId = 0
  /// Every envelope delivered to this script, as JSON values.
  var received: [JSONValue] = []

  init(harness: Harness) { self.harness = harness }

  func on(_ api: String, _ handler: @escaping ([JSONValue]) -> Answer) { handlers[api] = handler }

  /// Records every event of `api` the context gets.
  func record(_ api: String) -> Recorder {
    let recorder = Recorder()
    on(api) { args in
      recorder.seen.append(args)
      return .value(nil)
    }
    return recorder
  }

  /// Posts a call, lets every delivery through, and returns its answer (unsettled if waiting).
  @discardableResult
  func call(_ api: String, _ args: JSONValue...) -> Pending { call(api, args, then: nil) }

  /// The same, with `then` run when the answer arrives (an `await` going on).
  @discardableResult
  func call(_ api: String, _ args: [JSONValue], then: (() -> Void)?) -> Pending {
    nextId += 1
    let id = "c\(nextId)"
    let answer = Pending()
    answer.onSettle = then
    pending[id] = answer
    connection.receive(Envelope.call(id: id, api: api, args: args).json)
    harness.settle()
    return answer
  }

  /// Posts any text, as a broken script would.
  func post(_ json: String) {
    connection.receive(json)
    harness.settle()
  }

  func disconnect() { connection.disconnect() }

  fileprivate func receive(_ json: String) {
    received.append((try? JSONValue.parse(json)) ?? .null)
    guard case .success(let envelope) = Envelope.parse(json) else { return }
    switch envelope {
    case .reply(let id, let result):
      guard let answer = pending.removeValue(forKey: id) else { return }
      switch result {
      case .ok(let value): answer.result = .success(value)
      case .error(let message): answer.result = .failure(BridgeError(message))
      }
      answer.onSettle?()
    case .event(let api, let args, let replyId):
      let handler = handlers[api]
      guard let replyId else {
        _ = handler?(args)
        return
      }
      let answer = handler?(args) ?? .error(noReceiver)
      switch answer {
      case .value(let value):
        connection.receive(Envelope.reply(id: replyId, result: .ok(value)).json)
      case .error(let message):
        connection.receive(Envelope.reply(id: replyId, result: .error(message)).json)
      case .never: break
      }
    case .call: break
    }
  }
}

final class Recorder {
  var seen: [[JSONValue]] = []
}

/// The router with scripts around it. Deliveries queue up, as microtasks do on the TS side, and
/// `settle` lets them through.
final class Harness {
  let clock: ManualClock
  let persistence: MemoryPersistence
  let router: Router
  var actions: [RouterAction] = []
  var errors: [String] = []
  private var queue: [() -> Void] = []

  init(
    version: String? = nil, installedVersion: String? = nil, local: [String: JSONValue]? = nil,
    persistence: MemoryPersistence? = nil, now: Double = 0
  ) {
    clock = ManualClock(now: now)
    let saved = persistence ?? MemoryPersistence()
    if let installedVersion { saved.save("installed", ["version": .string(installedVersion)]) }
    if let local { saved.save("local", .object(local)) }
    self.persistence = saved
    router = Router(options: .init(version: version), persistence: saved, clock: clock)
    router.onAction = { [unowned self] in actions.append($0) }
    router.onError = { [unowned self] in errors.append($0) }
  }

  func connect(_ spec: ContextSpec) -> Script {
    let script = Script(harness: self)
    script.connection = router.connect(spec) { [unowned self, weak script] json in
      queue.append { script?.receive(json) }
    }
    return script
  }

  func settle() {
    while !queue.isEmpty { queue.removeFirst()() }
  }

  func advance(by ms: Double) {
    settle()
    clock.advance(by: ms, between: settle)
    settle()
  }
}
