import Foundation
import LangleAdblock
import LangleCore

/// The crate's C interface (mobile/adblock/include/langle_adblock.h, the module LangleAdblock of
/// `npm run mobile:adblock -- ios`) in Swift: strings in and out, the crate's errors as throws.
enum AdblockNative {
  struct Failure: Error, CustomStringConvertible {
    let description: String
  }

  /// A string the crate returned (freed here), or the calling thread's last error.
  static func take(_ pointer: UnsafeMutablePointer<CChar>?) throws -> String {
    guard let pointer else { throw lastError() }
    defer { langle_adblock_string_free(pointer) }
    return String(cString: pointer)
  }

  static func lastError() -> Failure {
    guard let pointer = langle_adblock_last_error() else { return Failure(description: "failed") }
    defer { langle_adblock_string_free(pointer) }
    return Failure(description: String(cString: pointer))
  }

  /// Calls `body` with the lists as the C structs (their bytes pinned meanwhile).
  static func withLists<T>(
    _ lists: [(text: Data, trusted: Bool)], _ body: (UnsafePointer<LangleAdblockList>, Int) -> T
  ) -> T {
    // NSData keeps its bytes at one address while it lives.
    let datas = lists.map { $0.text as NSData }
    let structs = zip(datas, lists).map { data, list in
      LangleAdblockList(
        text: data.bytes.assumingMemoryBound(to: UInt8.self), len: data.length, trusted: list.trusted)
    }
    return withExtendedLifetime(datas) {
      structs.withUnsafeBufferPointer { body($0.baseAddress!, $0.count) }
    }
  }

  /// The lists' network rules as WebKit content-blocker JSON (seconds for a large list).
  static func webkitRules(_ list: (text: Data, trusted: Bool)) throws -> String {
    try take(withLists([list]) { langle_adblock_webkit_rules($0, $1) })
  }

  /// The registrable domain of the URL's host ("https://m.youtube.com/watch" → "youtube.com").
  static func site(_ url: String) -> String? {
    try? take(url.withCString { langle_adblock_site($0) })
  }
}

/// A loaded engine: thread-safe, freed when the last reference goes (calls running on it hold
/// one), so the store's release has nothing to do.
final class AdblockEngine: @unchecked Sendable {
  private let pointer: OpaquePointer

  init(_ pointer: OpaquePointer) { self.pointer = pointer }
  deinit { langle_adblock_engine_free(pointer) }

  /// The page's cosmetic resources as the crate's JSON: css, scriptlets, generichide, exceptions.
  func cosmetic(_ pageURL: String) -> JSONValue? {
    guard let text = try? AdblockNative.take(pageURL.withCString { langle_adblock_cosmetic(pointer, $0) })
    else { return nil }
    return try? JSONValue.parse(text)
  }

  /// The stylesheet the page's classes and ids need (`{ classes, ids, exceptions }`).
  func hiddenClassIdCss(_ pageJSON: String) -> String? {
    try? AdblockNative.take(pageJSON.withCString { langle_adblock_hidden_class_id_css(pointer, $0) })
  }
}

/// The list store's engines: adblock-rust built from the lists and serialized, loaded with the
/// bundled scriptlets (`adblock/resources.json`, passed on every load).
final class NativeFilterEngines: FilterEngines {
  private let resources: Data

  init(resources: Data) { self.resources = resources }

  func build(_ lists: [(text: Data, trusted: Bool)]) throws -> Data {
    var out = LangleAdblockBytes(data: nil, len: 0)
    let built = AdblockNative.withLists(lists) { langle_adblock_build($0, $1, &out) }
    guard built, let data = out.data else { throw AdblockNative.lastError() }
    defer { langle_adblock_bytes_free(out) }
    return Data(bytes: data, count: out.len)
  }

  func load(_ bytes: Data) throws -> AdblockEngine {
    let pointer = bytes.withUnsafeBytes { engine in
      resources.withUnsafeBytes { resources in
        langle_adblock_load(
          engine.bindMemory(to: UInt8.self).baseAddress, engine.count,
          resources.bindMemory(to: UInt8.self).baseAddress, resources.count)
      }
    }
    guard let pointer else { throw AdblockNative.lastError() }
    return AdblockEngine(pointer)
  }

  func release(_ engine: AdblockEngine) {}
}
