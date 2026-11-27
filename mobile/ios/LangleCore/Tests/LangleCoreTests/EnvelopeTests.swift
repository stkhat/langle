import Foundation
import LangleCore
import XCTest

/// The repository root, found from this file (mobile/ios/LangleCore/Tests/LangleCoreTests/).
let repoRoot = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
  .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

func repoFile(_ path: String) throws -> String {
  try String(contentsOf: repoRoot.appendingPathComponent(path), encoding: .utf8)
}

/// The golden envelopes in mobile/protocol/, shared with the TS tests and JUnit.
final class EnvelopeTests: XCTestCase {
  let golden = ["call", "hello", "reply-ok", "reply-error", "event", "event-reply", "open-page", "get-current", "share-file", "native-strings",
    "translate", "translator-status", "prepare-translator", "models-ensure", "models-remove", "models-progress",
  ]

  func test_parses_and_produces_every_golden_envelope() throws {
    for name in golden {
      let text = try repoFile("mobile/protocol/\(name).json")
      guard case .success(let envelope) = Envelope.parse(text) else {
        return XCTFail("\(name).json was not read")
      }
      XCTAssertEqual(try JSONValue.parse(envelope.json), try JSONValue.parse(text), name)
    }
  }

  func test_reads_the_golden_files_fields() throws {
    XCTAssertEqual(
      Envelope.parse(try repoFile("mobile/protocol/call.json")),
      .success(.call(id: "c1", api: "storage.local.get", args: [["settings"]])))
    XCTAssertEqual(
      Envelope.parse(try repoFile("mobile/protocol/reply-error.json")),
      .success(
        .reply(
          id: "c2",
          result: .error("Could not establish connection. Receiving end does not exist."))))
    guard case .success(.event(let api, _, let replyId)) = Envelope.parse(
      try repoFile("mobile/protocol/event-reply.json"))
    else { return XCTFail("event-reply.json was not read") }
    XCTAssertEqual(api, "runtime.onMessage")
    XCTAssertEqual(replyId, "n7")
  }

  func test_rejects_bad_version() throws {
    XCTAssertEqual(
      Envelope.parse(try repoFile("mobile/protocol/bad-version.json")),
      .failure(.init(message: "unsupported version 2")))
  }

  func test_says_why_a_text_is_not_an_envelope() {
    let cases: [(String, String)] = [
      ("not json", "not JSON"),
      ("[1]", "not an object"),
      (#"{"kind":"call"}"#, "unsupported version undefined"),
      (#"{"v":1,"kind":"call","api":"tabs.get","args":[]}"#, "call without an id"),
      (#"{"v":1,"kind":"call","id":"x","api":"identity.get","args":[]}"#, "unknown call api identity.get"),
      (#"{"v":1,"kind":"call","id":"x","api":"tabs.get","args":{}}"#, "args is not an array"),
      (#"{"v":1,"kind":"reply","ok":true}"#, "reply without an id"),
      (#"{"v":1,"kind":"reply","id":"x","ok":false}"#, "reply without ok or an error message"),
      (#"{"v":1,"kind":"event","api":"tabs.onUpdated","args":[]}"#, "unknown event api tabs.onUpdated"),
      (#"{"v":1,"kind":"event","api":"alarms.onAlarm","args":[],"replyId":3}"#, "replyId is not a string"),
      (#"{"v":1,"kind":"other"}"#, "unknown kind other"),
    ]
    for (text, message) in cases {
      XCTAssertEqual(Envelope.parse(text), .failure(.init(message: message)), text)
    }
  }

  func test_leaves_out_an_undefined_reply_value() {
    XCTAssertEqual(
      Envelope.reply(id: "c3", result: .ok(nil)).json, #"{"id":"c3","kind":"reply","ok":true,"v":1}"#)
  }

  /// The API lists are the TS side's, read from protocol.ts.
  func test_knows_the_same_apis_as_protocol_ts() throws {
    let source = try repoFile("src/app/bridge/protocol.ts")
    func list(_ name: String) -> [String] {
      guard let start = source.range(of: "const \(name) = ["),
        let end = source.range(of: "] as const", range: start.upperBound..<source.endIndex)
      else { return [] }
      return source[start.upperBound..<end.lowerBound]
        .split(separator: "\n")
        .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: " \",")) }
        .filter { !$0.isEmpty }
    }
    XCTAssertEqual(Envelope.callApis, list("CALL_APIS"))
    XCTAssertEqual(Envelope.eventApis, list("EVENT_APIS"))
  }
}
