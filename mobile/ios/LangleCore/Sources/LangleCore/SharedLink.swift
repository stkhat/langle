/// The address another app's Share opens (docs/specs/mobile-app.md "M8: Share → Langle", "The
/// shared item → an address"). The same rule as the Android core's `SharedLink`, both checked
/// against `mobile/protocol/shared-links.json`. Plain work on UTF-16 units (as Kotlin's `Char`),
/// so both sides read a link alike.
public enum SharedLink {
  private static let schemes = ["https://", "http://"].map { Array($0.utf16) }

  /// Spaces the shell trims and a link ends at: controls and space, and Unicode's other spaces.
  private static let spaces = Set(
    "\u{0085}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{200B}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}"
      .utf16)

  /// Characters a link never has as they are: it ends before them.
  private static let stops = Set("<>\"`“”‘’「」『』（）【】〔〕〈〉《》、。，．！？：；".utf16)

  /// Punctuation a sentence puts right after a link, taken off its end.
  private static let trailing = Set(".,;:!?'\"".utf16)

  /// Closing brackets taken off the end unless the link opened them.
  private static let closing: [UInt16: UInt16] = [u(")"): u("("), u("]"): u("["), u("}"): u("{")]

  /// The address for a shared `url` item or `text`: the URL item if it is an http(s) address,
  /// else the first http(s) link in the text, a YouTube link as its `m.youtube.com` page; text
  /// without a link as a YouTube search. Nil when there is nothing to open.
  public static func resolve(url: String?, text: String?) -> String? {
    let item = url.map { trim(Array($0.utf16)) }.flatMap { isLink($0) ? $0 : nil }
    if let link = item ?? text.flatMap({ linkIn(Array($0.utf16)) }) {
      return youTube(link)
    }
    guard let text else { return nil }
    let search = trim(Array(text.utf16))
    if search.isEmpty { return nil }
    return PageAddress.searching(string(search))
  }

  private static func u(_ c: Character) -> UInt16 { c.utf16.first! }

  private static func string(_ units: some Collection<UInt16>) -> String {
    String(decoding: Array(units), as: UTF16.self)
  }

  private static func isSpace(_ c: UInt16) -> Bool { c <= 0x20 || spaces.contains(c) }

  private static func trim(_ units: [UInt16]) -> [UInt16] {
    guard let first = units.firstIndex(where: { !isSpace($0) }),
      let last = units.lastIndex(where: { !isSpace($0) })
    else { return [] }
    return Array(units[first...last])
  }

  /// The length of the scheme at `at` ("https://"), 0 if none is there.
  private static func scheme(_ units: [UInt16], at: Int) -> Int {
    for scheme in schemes where at + scheme.count <= units.count {
      if zip(units[at..<at + scheme.count], scheme).allSatisfy({ lower($0) == $1 }) { return scheme.count }
    }
    return 0
  }

  private static func lower(_ c: UInt16) -> UInt16 { c >= 0x41 && c <= 0x5A ? c + 0x20 : c }

  /// Whether `units` are an http(s) address with a host.
  private static func isLink(_ units: [UInt16]) -> Bool {
    let length = scheme(units, at: 0)
    return length > 0 && units.count > length && !"/?#".utf16.contains(units[length])
      && !units.contains(where: isSpace)
  }

  private static func linkIn(_ units: [UInt16]) -> [UInt16]? {
    var at = 0
    while at < units.count {
      let length = scheme(units, at: at)
      if length == 0 {
        at += 1
        continue
      }
      var end = at + length
      while end < units.count, !isSpace(units[end]), !stops.contains(units[end]) { end += 1 }
      let link = withoutTrailing(Array(units[at..<end]))
      if isLink(link) { return link }
      at += 1
    }
    return nil
  }

  private static func withoutTrailing(_ link: [UInt16]) -> [UInt16] {
    var end = link.count
    while end > 0 {
      let last = link[end - 1]
      var drop = trailing.contains(last)
      if !drop, let opening = closing[last] {
        let part = link[0..<end]
        drop = part.filter { $0 == last }.count > part.filter { $0 == opening }.count
      }
      if !drop { break }
      end -= 1
    }
    return Array(link[0..<end])
  }

  /// A youtu.be or (www.)youtube.com link as its m.youtube.com page; any other link as it is.
  private static func youTube(_ link: [UInt16]) -> String {
    let rest = Array(link[scheme(link, at: 0)...])
    let split = rest.firstIndex(where: { "/?#".utf16.contains($0) }) ?? rest.count
    let host = string(rest[0..<split]).lowercased()
    let tail = Array(rest[split...])
    switch host {
    case "youtube.com", "www.youtube.com":
      return "https://m.youtube.com" + (tail.first == u("/") ? "" : "/") + string(tail)
    case "youtu.be":
      let pathEnd = tail.firstIndex(where: { "?#".utf16.contains($0) }) ?? tail.count
      var path = tail[0..<pathEnd]
      if path.first == u("/") { path = path.dropFirst() }
      let id = path.split(separator: u("/"), maxSplits: 1, omittingEmptySubsequences: false).first ?? []
      if id.isEmpty { return string(link) }
      let fragmentAt = tail.firstIndex(of: u("#")) ?? tail.count
      let query = pathEnd < tail.count && tail[pathEnd] == u("?") ? tail[(pathEnd + 1)..<fragmentAt] : []
      return "https://m.youtube.com/watch?v=" + string(id) + (query.isEmpty ? "" : "&" + string(query))
        + string(tail[fragmentAt...])
    default:
      return string(link)
    }
  }
}
