/// Time and timers, injected so tests can move the clock.
public protocol Clock: AnyObject {
  /// Milliseconds since 1970, as `Date.now()`.
  func now() -> Double
  /// Runs `run` once after `ms`; the token cancels it.
  func schedule(after ms: Double, _ run: @escaping () -> Void) -> AnyObject
  func cancel(_ token: AnyObject)
}

public struct Alarm: Equatable, Sendable {
  public let name: String
  public let scheduledTime: Double
  public let periodInMinutes: Double?

  public var value: JSONValue {
    var o: [String: JSONValue] = ["name": .string(name), "scheduledTime": .number(scheduledTime)]
    if let periodInMinutes { o["periodInMinutes"] = .number(periodInMinutes) }
    return .object(o)
  }
}

/// `browser.alarms` on native timers, while the app runs (not kept across restarts).
public final class Alarms {
  private static let minute = 60_000.0
  private let clock: Clock
  private let fire: (Alarm) -> Void
  private var alarms: [String: (alarm: Alarm, timer: AnyObject)] = [:]

  /// `fire` gets each alarm when it is due.
  public init(clock: Clock, fire: @escaping (Alarm) -> Void) {
    self.clock = clock
    self.fire = fire
  }

  /// Chrome's `alarms.create(name, { when, delayInMinutes, periodInMinutes })`.
  public func create(name: String, when: Double?, delayInMinutes: Double?, periodInMinutes: Double?) {
    let delay = delayInMinutes ?? periodInMinutes ?? 0
    arm(
      Alarm(
        name: name, scheduledTime: when ?? clock.now() + delay * Self.minute,
        periodInMinutes: periodInMinutes.flatMap { $0 > 0 ? $0 : nil }))
  }

  public func get(_ name: String) -> Alarm? { alarms[name]?.alarm }

  public func clear(_ name: String) -> Bool {
    guard let entry = alarms.removeValue(forKey: name) else { return false }
    clock.cancel(entry.timer)
    return true
  }

  private func arm(_ alarm: Alarm) {
    if let old = alarms[alarm.name] { clock.cancel(old.timer) }
    let timer = clock.schedule(after: max(0, alarm.scheduledTime - clock.now())) { [weak self] in
      self?.due(alarm.name)
    }
    alarms[alarm.name] = (alarm, timer)
  }

  private func due(_ name: String) {
    guard let alarm = alarms[name]?.alarm else { return }
    if let period = alarm.periodInMinutes {
      arm(
        Alarm(
          name: name, scheduledTime: alarm.scheduledTime + period * Self.minute,
          periodInMinutes: period))
    } else {
      alarms.removeValue(forKey: name)
    }
    fire(alarm)
  }
}
