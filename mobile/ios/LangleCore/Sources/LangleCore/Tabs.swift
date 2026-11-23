/// The app's pages as `browser.tabs` sees them (docs/specs/mobile-app.md "Shim surface"): ids,
/// the active one (the page on screen), and app pages opened by `tabs.create`. One window.
public struct Tab: Equatable, Sendable {
  public let id: Int
  public var url: String
  public var active: Bool
  public let windowId = 1
  public let incognito = false

  public var value: JSONValue {
    [
      "id": .number(Double(id)), "url": .string(url), "active": .bool(active),
      "windowId": .number(Double(windowId)), "incognito": .bool(incognito),
    ]
  }
}

public final class Tabs {
  private var tabs: [Int: Tab] = [:]
  private var order: [Int] = []
  private var nextId = 1

  public init() {}

  public var all: [Tab] { order.compactMap { tabs[$0] } }
  public var active: Tab? { all.first { $0.active } }

  @discardableResult
  public func open(url: String, active: Bool = true) -> Tab {
    let tab = Tab(id: nextId, url: url, active: false)
    nextId += 1
    tabs[tab.id] = tab
    order.append(tab.id)
    if active { activate(tab.id) }
    return tabs[tab.id]!
  }

  public func get(_ id: Int) -> Tab? { tabs[id] }

  public func activate(_ id: Int) {
    for key in tabs.keys { tabs[key]?.active = key == id }
  }

  public func setURL(_ id: Int, _ url: String) { tabs[id]?.url = url }

  @discardableResult
  public func remove(_ id: Int) -> Tab? {
    order.removeAll { $0 == id }
    return tabs.removeValue(forKey: id)
  }

  /// `tabs.query`: only `active` and an exact `url` narrow it, as in the reference.
  public func query(active: Bool?, url: String?) -> [Tab] {
    all.filter { (active == nil || $0.active == active) && (url == nil || $0.url == url) }
  }
}
