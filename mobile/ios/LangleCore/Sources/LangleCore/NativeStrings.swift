import Foundation

/// `appHost.nativeStrings`'s argument (docs/specs/mobile-app.md "Native strings follow the
/// interface language"): the interface language's `app.` strings, as the background sends them.
public struct NativeStringSet: Equatable, Sendable {
  public let locale: String
  public let rtl: Bool
  public let strings: [String: String]

  public init(locale: String, rtl: Bool, strings: [String: String]) {
    self.locale = locale
    self.rtl = rtl
    self.strings = strings
  }

  /// The error a bad set gets, the same text in all three routers (reference-native.ts).
  public static let error = "appHost.nativeStrings needs a locale, a direction and strings."

  /// The call's argument as a set, or nil when it is not one.
  public init?(_ value: JSONValue?) {
    guard let locale = value?["locale"]?.string, !locale.isEmpty,
      let dir = value?["dir"]?.string, dir == "ltr" || dir == "rtl",
      let object = value?["strings"]?.object
    else { return nil }
    var strings: [String: String] = [:]
    for (key, text) in object {
      guard let text = text.string else { return nil }
      strings[key] = text
    }
    self.init(locale: locale, rtl: dir == "rtl", strings: strings)
  }

  public var json: JSONValue {
    .object([
      "locale": .string(locale),
      "dir": .string(rtl ? "rtl" : "ltr"),
      "strings": .object(strings.mapValues { .string($0) }),
    ])
  }
}

/// The shell's own strings in the interface language: the last set the background sent (the app
/// keeps it, so a cold start draws it before the background runs); before the first one ever,
/// `english` (en.json's `app.` keys, generated into the build). A key the set lacks is English's;
/// a key neither has shows as itself.
public struct NativeStrings: Equatable, Sendable {
  public let english: [String: String]
  public private(set) var kept: NativeStringSet?

  /// The kept set's name in the app's store: `native-strings.json`.
  public static let name = "native-strings"

  /// `kept`: what the store has under `name` (nil, or a value that is no set, is English).
  public init(english: [String: String], kept: JSONValue? = nil) {
    self.english = english
    self.kept = NativeStringSet(kept)
  }

  /// The interface language ("en" before any set).
  public var locale: String { kept?.locale ?? "en" }

  /// Whether the bars mirror (Arabic).
  public var rtl: Bool { kept?.rtl ?? false }

  public subscript(key: String) -> String { kept?.strings[key] ?? english[key] ?? key }

  /// The string `key` with its `{name}` placeholders filled from `vars`; others stay.
  public func format(_ key: String, _ vars: [String: String]) -> String {
    let template = self[key]
    var out = ""
    var rest = template[...]
    while let open = rest.firstIndex(of: "{") {
      out += rest[..<open]
      let after = rest[rest.index(after: open)...]
      if let close = after.firstIndex(of: "}"), let value = vars[String(after[..<close])] {
        out += value
        rest = after[after.index(after: close)...]
      } else {
        out += "{"
        rest = after
      }
    }
    return out + rest
  }

  /// Takes `set`; true when it differs from the one kept (the app then saves and redraws).
  public mutating func take(_ set: NativeStringSet) -> Bool {
    if set == kept { return false }
    kept = set
    return true
  }

  /// A locale file's `app.` keys that are strings.
  public static func english(localeJSON: String) -> [String: String] {
    guard let object = (try? JSONValue.parse(localeJSON))?.object else { return [:] }
    return object.reduce(into: [:]) { out, entry in
      if entry.key.hasPrefix("app."), let text = entry.value.string { out[entry.key] = text }
    }
  }
}
