import Foundation

/// The bridge's JSON envelopes (docs/specs/mobile-app.md "Bridge protocol"), the Swift copy of
/// `src/app/bridge/protocol.ts`. `mobile/protocol/` holds the golden files both are tested on.
public enum Envelope: Equatable, Sendable {
  case call(id: String, api: String, args: [JSONValue])
  case reply(id: String, result: ReplyResult)
  /// `replyId`: the event expects an answer, sent as a reply with that id.
  case event(api: String, args: [JSONValue], replyId: String?)

  public enum ReplyResult: Equatable, Sendable {
    /// `nil`: no value (JavaScript's `undefined`, left out of the JSON).
    case ok(JSONValue?)
    case error(String)
  }

  public static let version = 1

  /// What a script can ask native code to do (protocol.ts `CALL_APIS`).
  public static let callApis: [String] = [
    "bridge.hello",
    "runtime.sendMessage",
    "runtime.openOptionsPage",
    "runtime.reload",
    "storage.local.get",
    "storage.local.set",
    "storage.local.remove",
    "storage.local.clear",
    "storage.sync.get",
    "storage.sync.set",
    "storage.sync.remove",
    "storage.sync.clear",
    "storage.session.get",
    "storage.session.set",
    "storage.session.remove",
    "storage.session.clear",
    "tabs.query",
    "tabs.get",
    "tabs.getCurrent",
    "tabs.sendMessage",
    "tabs.create",
    "tabs.update",
    "tabs.remove",
    "tabs.reload",
    "action.openPopup",
    "alarms.create",
    "alarms.get",
    "alarms.clear",
    "appHost.openPage",
    "appHost.shareFile",
    "appHost.nativeStrings",
    "appHost.contentHeight",
    "appHost.pageSheet",
    "appHost.translate",
    "appHost.translatorStatus",
    "appHost.prepareTranslator",
    "appHost.models.ensure",
    "appHost.models.remove",
    "appHost.googleAuth.token",
    "appHost.googleAuth.forget",
  ]

  /// What native code tells a script (protocol.ts `EVENT_APIS`).
  public static let eventApis: [String] = [
    "runtime.onMessage",
    "runtime.onInstalled",
    "runtime.onStartup",
    "storage.onChanged",
    "alarms.onAlarm",
    "appHost.models.onProgress",
    "app.hidden",
    "app.visible",
  ]

  private static let callSet = Set(callApis)
  private static let eventSet = Set(eventApis)

  /// Why a text is not an envelope; the messages are the TS side's.
  public struct ParseError: Error, Equatable, Sendable {
    public let message: String
    public init(message: String) { self.message = message }
  }

  public static func parse(_ text: String) -> Result<Envelope, ParseError> {
    guard let value = try? JSONValue.parse(text) else { return .failure(.init(message: "not JSON")) }
    return parse(value)
  }

  public static func parse(_ value: JSONValue) -> Result<Envelope, ParseError> {
    func fail(_ message: String) -> Result<Envelope, ParseError> { .failure(.init(message: message)) }
    guard case .object(let o) = value else { return fail("not an object") }
    guard o["v"] == .number(Double(version)) else {
      return fail("unsupported version \(JSONValue.jsString(o["v"]))")
    }
    switch o["kind"] {
    case .string("call"):
      guard let id = o["id"]?.string else { return fail("call without an id") }
      guard let api = o["api"]?.string, callSet.contains(api) else {
        return fail("unknown call api \(JSONValue.jsString(o["api"]))")
      }
      guard let args = o["args"]?.array else { return fail("args is not an array") }
      return .success(.call(id: id, api: api, args: args))
    case .string("reply"):
      guard let id = o["id"]?.string else { return fail("reply without an id") }
      if o["ok"] == .bool(true) { return .success(.reply(id: id, result: .ok(o["value"]))) }
      if o["ok"] == .bool(false), let message = o["error"]?["message"]?.string {
        return .success(.reply(id: id, result: .error(message)))
      }
      return fail("reply without ok or an error message")
    case .string("event"):
      guard let api = o["api"]?.string, eventSet.contains(api) else {
        return fail("unknown event api \(JSONValue.jsString(o["api"]))")
      }
      guard let args = o["args"]?.array else { return fail("args is not an array") }
      let replyId = o["replyId"]
      if let replyId, replyId.string == nil { return fail("replyId is not a string") }
      return .success(.event(api: api, args: args, replyId: replyId?.string))
    default:
      return fail("unknown kind \(JSONValue.jsString(o["kind"]))")
    }
  }

  public var value: JSONValue {
    var o: [String: JSONValue] = ["v": .number(Double(Self.version))]
    switch self {
    case .call(let id, let api, let args):
      o["kind"] = "call"
      o["id"] = .string(id)
      o["api"] = .string(api)
      o["args"] = .array(args)
    case .reply(let id, let result):
      o["kind"] = "reply"
      o["id"] = .string(id)
      switch result {
      case .ok(let value):
        o["ok"] = true
        if let value { o["value"] = value }
      case .error(let message):
        o["ok"] = false
        o["error"] = ["message": .string(message)]
      }
    case .event(let api, let args, let replyId):
      o["kind"] = "event"
      o["api"] = .string(api)
      o["args"] = .array(args)
      if let replyId { o["replyId"] = .string(replyId) }
    }
    return .object(o)
  }

  public var json: String { value.json }

  /// The id of a call that could not be read, so it can be answered with the error.
  public static func callId(of text: String) -> String? {
    guard let value = try? JSONValue.parse(text), value["kind"] == "call" else { return nil }
    return value["id"]?.string
  }
}
