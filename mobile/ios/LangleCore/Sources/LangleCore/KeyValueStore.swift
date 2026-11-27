import Foundation

/// Where the store keeps what outlives the process: one JSON value per name.
public protocol Persistence: AnyObject {
  func load(_ name: String) -> JSONValue?
  func save(_ name: String, _ value: JSONValue) throws
}

/// One JSON file per name in a directory (Application Support in the app), written atomically.
public final class FilePersistence: Persistence {
  public let directory: URL

  public init(directory: URL) {
    self.directory = directory
  }

  private func file(_ name: String) -> URL { directory.appendingPathComponent("\(name).json") }

  public func load(_ name: String) -> JSONValue? {
    guard let data = try? Data(contentsOf: file(name)) else { return nil }
    return try? JSONValue.parse(String(decoding: data, as: UTF8.self))
  }

  public func save(_ name: String, _ value: JSONValue) throws {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data(value.json.utf8).write(to: file(name), options: .atomic)
  }
}

/// Kept in memory only: tests, and what a new process would start from.
public final class MemoryPersistence: Persistence {
  public private(set) var saved: [String: JSONValue] = [:]
  public init(_ saved: [String: JSONValue] = [:]) { self.saved = saved }
  public func load(_ name: String) -> JSONValue? { saved[name] }
  public func save(_ name: String, _ value: JSONValue) { saved[name] = value }
}

/// `storage.local`, `storage.sync` and `storage.session` (docs/specs/mobile-app.md "Shim surface").
/// `local` and `sync` are saved on every write; `session` lives in memory and starts empty.
public final class KeyValueStore {
  public enum Area: String, CaseIterable, Sendable {
    case local, sync, session
  }

  /// One key's change, as `storage.onChanged` gives it.
  public struct Change: Equatable, Sendable {
    public var oldValue: JSONValue?
    public var newValue: JSONValue?

    public init(oldValue: JSONValue?, newValue: JSONValue?) {
      self.oldValue = oldValue
      self.newValue = newValue
    }

    public var value: JSONValue {
      var o: [String: JSONValue] = [:]
      if let oldValue { o["oldValue"] = oldValue }
      if let newValue { o["newValue"] = newValue }
      return .object(o)
    }
  }

  private let persistence: Persistence
  private var areas: [Area: [String: JSONValue]] = [:]

  public init(persistence: Persistence) {
    self.persistence = persistence
    for area in [Area.local, .sync] {
      areas[area] = persistence.load(area.rawValue)?.object ?? [:]
    }
    areas[.session] = [:]
  }

  /// What the area holds now.
  public func stored(_ area: Area) -> [String: JSONValue] { areas[area] ?? [:] }

  /// The stored keys among `keys` (all of them for nil): Chrome's defaults stay in the shim.
  public func get(_ area: Area, keys: [String]?) -> [String: JSONValue] {
    let store = stored(area)
    guard let keys else { return store }
    return store.filter { keys.contains($0.key) }
  }

  /// Saves first, then returns what changed (empty when nothing did).
  public func set(_ area: Area, _ items: [String: JSONValue]) throws -> [String: Change] {
    try write(area, stored(area).merging(items) { _, new in new })
  }

  public func remove(_ area: Area, _ keys: [String]) throws -> [String: Change] {
    try write(area, stored(area).filter { !keys.contains($0.key) })
  }

  public func clear(_ area: Area) throws -> [String: Change] {
    try write(area, [:])
  }

  private func write(_ area: Area, _ next: [String: JSONValue]) throws -> [String: Change] {
    let store = stored(area)
    var changes: [String: Change] = [:]
    for key in Set(store.keys).union(next.keys) where store[key] != next[key] {
      changes[key] = Change(oldValue: store[key], newValue: next[key])
    }
    if changes.isEmpty { return [:] }
    if area != .session { try persistence.save(area.rawValue, .object(next)) }
    areas[area] = next
    return changes
  }
}
