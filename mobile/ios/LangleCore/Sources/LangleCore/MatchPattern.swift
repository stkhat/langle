import Foundation

/// A Chrome match pattern (`<all_urls>`, `*://m.youtube.com/*`, `https://*.example.com/a/*`),
/// for the manifest's content scripts.
/// - scheme `*` is http or https;
/// - host `*` is any host, `*.example.com` is example.com and its subdomains; a host without a
///   port matches any port;
/// - the path is a glob (`*` is any run of characters) over the URL's path and query.
public struct MatchPattern: Equatable, Sendable, CustomStringConvertible {
  public let description: String
  private let schemes: Set<String>
  private let host: String?  // nil: any host
  private let subdomains: Bool
  private let port: Int?  // nil: any port
  private let path: String

  private static let allURLSchemes: Set<String> = ["http", "https", "ws", "wss", "ftp", "file"]
  private static let knownSchemes: Set<String> = ["http", "https", "ws", "wss", "ftp", "file"]

  public struct Invalid: Error, Equatable, CustomStringConvertible {
    public let pattern: String
    public var description: String { "bad match pattern \(pattern)" }
  }

  public init(_ pattern: String) throws {
    description = pattern
    if pattern == "<all_urls>" {
      schemes = Self.allURLSchemes
      host = nil
      subdomains = false
      port = nil
      path = "/*"
      return
    }
    guard let separator = pattern.range(of: "://") else { throw Invalid(pattern: pattern) }
    let scheme = String(pattern[..<separator.lowerBound])
    let rest = pattern[separator.upperBound...]
    if scheme == "*" {
      schemes = ["http", "https"]
    } else if Self.knownSchemes.contains(scheme) {
      schemes = [scheme]
    } else {
      throw Invalid(pattern: pattern)
    }
    guard let slash = rest.firstIndex(of: "/") else { throw Invalid(pattern: pattern) }
    var authority = String(rest[..<slash]).lowercased()
    path = String(rest[slash...])
    if scheme == "file" {
      guard authority.isEmpty else { throw Invalid(pattern: pattern) }
      host = nil
      subdomains = false
      port = nil
      return
    }
    var port: Int?
    if let colon = authority.lastIndex(of: ":") {
      let text = authority[authority.index(after: colon)...]
      if text != "*" {
        guard let number = Int(text) else { throw Invalid(pattern: pattern) }
        port = number
      }
      authority = String(authority[..<colon])
    }
    self.port = port
    if authority == "*" {
      host = nil
      subdomains = false
    } else if authority.hasPrefix("*.") {
      host = String(authority.dropFirst(2))
      subdomains = true
    } else {
      guard !authority.isEmpty, !authority.contains("*") else { throw Invalid(pattern: pattern) }
      host = authority
      subdomains = false
    }
  }

  public func matches(_ url: String) -> Bool {
    guard let parts = URLComponents(string: url), let scheme = parts.scheme?.lowercased(),
      schemes.contains(scheme)
    else { return false }
    if scheme != "file" {
      guard let urlHost = parts.host?.lowercased(), !urlHost.isEmpty else { return false }
      if let host {
        let hostMatches = urlHost == host || (subdomains && urlHost.hasSuffix(".\(host)"))
        if !hostMatches { return false }
      }
      if let port, port != (parts.port ?? Self.defaultPort(scheme)) { return false }
    }
    var target = parts.percentEncodedPath.isEmpty ? "/" : parts.percentEncodedPath
    if let query = parts.percentEncodedQuery { target += "?\(query)" }
    return Self.glob(path, target)
  }

  private static func defaultPort(_ scheme: String) -> Int? {
    ["http": 80, "https": 443, "ws": 80, "wss": 443, "ftp": 21][scheme]
  }

  /// `*` matches any run of characters; everything else itself.
  static func glob(_ pattern: String, _ text: String) -> Bool {
    let p = Array(pattern.unicodeScalars)
    let t = Array(text.unicodeScalars)
    var pi = 0
    var ti = 0
    var star: Int?
    var mark = 0
    while ti < t.count {
      if pi < p.count, p[pi] == "*" {
        star = pi
        mark = ti
        pi += 1
      } else if pi < p.count, p[pi] == t[ti] {
        pi += 1
        ti += 1
      } else if let star {
        pi = star + 1
        mark += 1
        ti = mark
      } else {
        return false
      }
    }
    while pi < p.count, p[pi] == "*" { pi += 1 }
    return pi == p.count
  }
}
