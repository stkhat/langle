import Foundation

/// The ad-blocking switches (docs/specs/mobile-app.md "M6: ad blocking" › "The switches"): the
/// app's `storage.local` key `adBlocking: { on, offSites }`, written by ⋮ and Settings › Ad
/// blocking. On by default; a site is the page's registrable domain. Android's
/// `AdBlockingSwitches` (mobile/android/core) keeps the same rules.
public struct AdBlockingSwitches: Equatable, Sendable {
  public static let key = "adBlocking"
  /// Written by the list store: `{ updatedAt }`, milliseconds since 1970 as `Date.now()`.
  public static let listsKey = "adBlockingLists"

  public var on: Bool
  public var offSites: [String]

  public init(on: Bool = true, offSites: [String] = []) {
    self.on = on
    self.offSites = offSites
  }

  /// Read leniently: anything that is not the key's shape counts as the default.
  public init(_ value: JSONValue?) {
    guard let o = value?.object else {
      self.init()
      return
    }
    var sites: [String] = []
    for site in o["offSites"]?.array?.compactMap(\.string) ?? [] where !sites.contains(site) {
      sites.append(site)
    }
    self.init(on: o["on"]?.bool ?? true, offSites: sites)
  }

  /// Whether pages of `site` get blocking (a page without a site follows `on`).
  public func blocks(_ site: String?) -> Bool {
    on && (site.map { !offSites.contains($0) } ?? true)
  }

  /// ⋮'s switch for `site`: off adds it to `offSites`, on removes it.
  public func withSite(_ site: String, blocking: Bool) -> AdBlockingSwitches {
    var sites = offSites.filter { $0 != site }
    if !blocking { sites.append(site) }
    return AdBlockingSwitches(on: on, offSites: sites)
  }

  public var value: JSONValue {
    ["on": .bool(on), "offSites": .array(offSites.map { .string($0) })]
  }

  /// Whether a change of the switches reloads a page of `site`: its blocking turned off or on
  /// (the page's rules and its document-start scripts follow only a new document).
  public static func reloads(_ old: AdBlockingSwitches, _ new: AdBlockingSwitches, site: String?)
    -> Bool
  {
    old.blocks(site) != new.blocks(site)
  }
}

/// Whether the first run is done (`storage.local` `setup`, src/core/setup.ts): the user agreed and
/// chose the languages at Start. Nothing is fetched before (the lists come with the language packs).
public func setupDone(_ value: JSONValue?) -> Bool {
  value?["consent"]?.number != nil && value?["languages"]?.bool == true
}
