import LangleCore
import XCTest

/// The shared cases in mobile/protocol/shared-links.json, the same for JUnit.
final class SharedLinkTests: XCTestCase {
  func test_resolves_every_shared_case() throws {
    let cases = try XCTUnwrap(JSONValue.parse(try repoFile("mobile/protocol/shared-links.json"))["cases"]?.array)
    XCTAssertGreaterThan(cases.count, 40)
    for item in cases {
      XCTAssertEqual(
        SharedLink.resolve(url: item["url"]?.string, text: item["text"]?.string), item["address"]?.string,
        item["name"]?.string ?? "")
    }
  }
}
