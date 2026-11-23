import Foundation

/// A JSON value as the bridge carries it. Objects compare by content, not key order.
public enum JSONValue: Equatable, Sendable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSONValue])
  case object([String: JSONValue])

  public struct ParseError: Error, Equatable {}

  /// Reads a JSON text (any value at the top, as `JSON.parse` does).
  public static func parse(_ text: String) throws -> JSONValue {
    do {
      return try JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
    } catch {
      throw ParseError()
    }
  }

  /// The value as JSON text, keys sorted.
  public var json: String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    // A JSONValue always encodes.
    return String(decoding: try! encoder.encode(self), as: UTF8.self)
  }

  public subscript(key: String) -> JSONValue? {
    if case .object(let object) = self { return object[key] }
    return nil
  }

  public var object: [String: JSONValue]? {
    if case .object(let value) = self { return value }
    return nil
  }
  public var array: [JSONValue]? {
    if case .array(let value) = self { return value }
    return nil
  }
  public var string: String? {
    if case .string(let value) = self { return value }
    return nil
  }
  public var number: Double? {
    if case .number(let value) = self { return value }
    return nil
  }
  public var bool: Bool? {
    if case .bool(let value) = self { return value }
    return nil
  }

  /// What JavaScript's `String(value)` gives, for error messages that match the TS side.
  public static func jsString(_ value: JSONValue?) -> String {
    switch value {
    case nil: return "undefined"
    case .null: return "null"
    case .bool(let b): return b ? "true" : "false"
    case .number(let n): return Self.numberText(n)
    case .string(let s): return s
    case .array(let items): return items.map { $0 == .null ? "" : jsString($0) }.joined(separator: ",")
    case .object: return "[object Object]"
    }
  }

  static func numberText(_ n: Double) -> String {
    if n.rounded() == n, abs(n) < 9_007_199_254_740_992 { return String(Int64(n)) }
    return String(n)
  }
}

extension JSONValue: Codable {
  public init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if container.decodeNil() {
      self = .null
    } else if let value = try? container.decode(Bool.self) {
      self = .bool(value)
    } else if let value = try? container.decode(Double.self) {
      self = .number(value)
    } else if let value = try? container.decode(String.self) {
      self = .string(value)
    } else if let value = try? container.decode([JSONValue].self) {
      self = .array(value)
    } else {
      self = .object(try container.decode([String: JSONValue].self))
    }
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch self {
    case .null: try container.encodeNil()
    case .bool(let value): try container.encode(value)
    case .number(let value):
      // Whole numbers as integers, as JavaScript writes them (ids, times in ms).
      if value.rounded() == value, abs(value) < 9_007_199_254_740_992 {
        try container.encode(Int64(value))
      } else {
        try container.encode(value)
      }
    case .string(let value): try container.encode(value)
    case .array(let value): try container.encode(value)
    case .object(let value): try container.encode(value)
    }
  }
}

extension JSONValue: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral,
  ExpressibleByFloatLiteral, ExpressibleByBooleanLiteral, ExpressibleByArrayLiteral,
  ExpressibleByDictionaryLiteral, ExpressibleByNilLiteral
{
  public init(stringLiteral value: String) { self = .string(value) }
  public init(integerLiteral value: Int) { self = .number(Double(value)) }
  public init(floatLiteral value: Double) { self = .number(value) }
  public init(booleanLiteral value: Bool) { self = .bool(value) }
  public init(arrayLiteral elements: JSONValue...) { self = .array(elements) }
  public init(dictionaryLiteral elements: (String, JSONValue)...) {
    self = .object(Dictionary(elements, uniquingKeysWith: { _, last in last }))
  }
  public init(nilLiteral: ()) { self = .null }
}
