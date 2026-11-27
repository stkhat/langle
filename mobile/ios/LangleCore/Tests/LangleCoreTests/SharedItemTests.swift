import LangleCore
import XCTest

/// The share extension's kept item (docs/specs/mobile-app.md "M8: Share → Langle", "Testing").
final class SharedItemTests: XCTestCase {
  private var directory: URL!

  override func setUpWithError() throws {
    directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("SharedItemTests-\(UUID().uuidString)").appendingPathComponent("LangleShared")
  }

  override func tearDownWithError() throws {
    try? FileManager.default.removeItem(at: directory.deletingLastPathComponent())
  }

  func test_a_kept_item_is_read_once() throws {
    let inbox = SharedInbox(directory: directory)
    let item = SharedItem(url: "https://en.wikipedia.org/wiki/Language", text: "Language - Wikipedia", sharedAt: "2026-11-27T10:00:00.000Z")
    try inbox.put(item)
    XCTAssertEqual(inbox.file.lastPathComponent, "shared.json")
    XCTAssertEqual(inbox.take(), item)
    XCTAssertNil(inbox.take())
    XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path), [])
  }

  func test_a_newer_share_replaces_the_kept_one() throws {
    let inbox = SharedInbox(directory: directory)
    try inbox.put(SharedItem(url: "https://example.com/a", text: nil, sharedAt: "2026-11-27T10:00:00.000Z"))
    let newer = SharedItem(url: nil, text: "phrasal verbs", sharedAt: "2026-11-27T10:01:00.000Z")
    try inbox.put(newer)
    XCTAssertEqual(inbox.take(), newer)
    XCTAssertNil(inbox.take())
  }

  func test_nothing_kept_and_a_file_that_is_no_item_read_as_nil() throws {
    let inbox = SharedInbox(directory: directory)
    XCTAssertNil(inbox.take())
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    try Data("{\"sharedAt\":\"x\"}".utf8).write(to: inbox.file)
    XCTAssertNil(inbox.take())
    XCTAssertFalse(FileManager.default.fileExists(atPath: inbox.file.path))
  }

  func test_the_file_is_the_spec_s_shape() throws {
    let item = SharedItem(url: "https://youtu.be/iG9CE55wbtY?t=42", text: nil, sharedAt: "2026-11-27T10:00:00.000Z")
    XCTAssertEqual(item.json.json, #"{"sharedAt":"2026-11-27T10:00:00.000Z","url":"https://youtu.be/iG9CE55wbtY?t=42"}"#)
    XCTAssertEqual(SharedItem(item.json), item)
  }

  func test_its_address_is_SharedLink_s() {
    XCTAssertEqual(
      SharedItem(url: "https://youtu.be/iG9CE55wbtY?t=42", text: nil, sharedAt: "").address,
      "https://m.youtube.com/watch?v=iG9CE55wbtY&t=42")
    XCTAssertEqual(
      SharedItem(url: nil, text: "phrasal verbs", sharedAt: "").address,
      "https://m.youtube.com/results?search_query=phrasal%20verbs")
    XCTAssertEqual(
      SharedItem(url: "file:///tmp/a.txt", text: "see https://example.com/a.", sharedAt: "").address,
      "https://example.com/a")
  }

  func test_picks_the_url_attachment_that_keeps_the_most() {
    // Safari on a YouTube watch page: the canonical address first, then the one shown with `t`.
    XCTAssertEqual(
      SharedItem.pickURL([
        "https://www.youtube.com/watch?v=iG9CE55wbtY",
        "https://m.youtube.com/watch?v=iG9CE55wbtY&t=42s",
      ]),
      "https://m.youtube.com/watch?v=iG9CE55wbtY&t=42s")
    XCTAssertEqual(
      SharedItem.pickURL(["https://example.com/a?x=1", "https://example.com/b?y=2"]),
      "https://example.com/a?x=1")
    XCTAssertEqual(
      SharedItem.pickURL(["file:///tmp/a?x=1&y=2", "https://example.com/a"]), "https://example.com/a")
    XCTAssertEqual(SharedItem.pickURL(["file:///tmp/a"]), "file:///tmp/a")
    XCTAssertNil(SharedItem.pickURL([]))
  }
}
