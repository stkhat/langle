import Foundation
import LangleCore
import XCTest

final class KeyValueStoreTests: XCTestCase {
  var directory: URL!

  override func setUp() {
    directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  }

  override func tearDown() {
    try? FileManager.default.removeItem(at: directory)
  }

  func test_saves_local_and_sync_as_one_JSON_file_each_and_reads_them_in_the_next_process() throws {
    let store = KeyValueStore(persistence: FilePersistence(directory: directory))
    _ = try store.set(.local, ["settings": ["on": true], "n": 1.5])
    _ = try store.set(.sync, ["s": "x"])
    _ = try store.set(.session, ["t": 1])
    let files = try FileManager.default.contentsOfDirectory(atPath: directory.path).sorted()
    XCTAssertEqual(files, ["local.json", "sync.json"])
    let next = KeyValueStore(persistence: FilePersistence(directory: directory))
    XCTAssertEqual(next.stored(.local), ["settings": ["on": true], "n": 1.5])
    XCTAssertEqual(next.stored(.sync), ["s": "x"])
    XCTAssertEqual(next.stored(.session), [:])
  }

  func test_a_write_that_cannot_be_saved_changes_nothing() throws {
    // A file where the directory should be: the save fails.
    try Data().write(to: directory)
    let store = KeyValueStore(persistence: FilePersistence(directory: directory))
    XCTAssertThrowsError(try store.set(.local, ["a": 1]))
    XCTAssertEqual(store.stored(.local), [:])
  }

  func test_whole_numbers_stay_whole_and_others_keep_their_digits() throws {
    XCTAssertEqual(JSONValue.object(["t": 1_732_400_000_000, "f": 0.25]).json, #"{"f":0.25,"t":1732400000000}"#)
    XCTAssertEqual(try JSONValue.parse("[true,1,\"1\",null]"), [true, 1, "1", nil])
  }
}
