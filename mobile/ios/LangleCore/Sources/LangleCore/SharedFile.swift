import Foundation

/// `appHost.shareFile`'s file (docs/specs/mobile-app.md "The shells"): the app writes `text` to a
/// file named `name` and hands it to the share sheet.
public struct SharedFile: Equatable, Sendable {
  public let name: String
  public let mime: String
  public let text: String

  public init(name: String, mime: String, text: String) {
    self.name = name
    self.mime = mime
    self.text = text
  }

  /// The error a bad file gets, the same text in all three routers (reference-native.ts).
  public static let error = "appHost.shareFile needs a plain file name, a media type and text."

  /// 1–255 characters, no folder, no control character, not hidden (nor `.` / `..`).
  private static let plainName = try! NSRegularExpression(
    pattern: #"^[^./\\\x00-\x1f][^/\\\x00-\x1f]{0,254}$"#)

  /// The call's argument as a file, or nil when it is not one the app writes.
  public init?(_ value: JSONValue?) {
    guard let name = value?["name"]?.string, let mime = value?["mime"]?.string,
      let text = value?["text"]?.string, mime.contains("/"),
      Self.plainName.firstMatch(in: name, range: NSRange(name.startIndex..., in: name)) != nil
    else { return nil }
    self.init(name: name, mime: mime, text: text)
  }
}

/// `appHost.shareFile` in an app that has no share sheet (the router's tests).
public let noSharing = "Sharing a file is not available here."

/// The calls the app's translation host answers (`Router.onTranslation`).
public let translationApis: Set<String> = [
  "appHost.translate",
  "appHost.translatorStatus",
  "appHost.prepareTranslator",
  "appHost.models.ensure",
  "appHost.models.remove",
]

/// Google sign-in for Drive sync (docs/specs/mobile-app.md "M7"; `Router.onGoogleAuth`).
public let googleAuthApis: Set<String> = [
  "appHost.googleAuth.token",
  "appHost.googleAuth.forget",
]

/// The error of a call the app cannot answer yet, the same text in all three routers.
public func notAvailable(_ api: String) -> String { "\(api) is not available here." }
