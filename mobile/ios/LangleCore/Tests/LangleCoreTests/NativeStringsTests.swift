import Foundation
import LangleCore
import XCTest

/// The shell's own strings (docs/specs/mobile-app.md "Native strings follow the interface language").
final class NativeStringsTests: XCTestCase {
  let arabic = NativeStringSet(
    locale: "ar", rtl: true,
    strings: ["app.home": "الرئيسية", "app.blockAdsSiteLabel": "حظر الإعلانات على هذا الموقع، {site}"])

  func english() throws -> [String: String] {
    NativeStrings.english(localeJSON: try repoFile("src/i18n/locales/en.json"))
  }

  func test_reads_the_golden_calls_set() throws {
    guard case .success(.call(_, _, let args)) = Envelope.parse(try repoFile("mobile/protocol/native-strings.json")),
      let set = NativeStringSet(args.first)
    else { return XCTFail("native-strings.json was not read") }
    XCTAssertEqual(set.locale, "ar")
    XCTAssertTrue(set.rtl)
    XCTAssertEqual(set.strings["app.more"], "المزيد")
    XCTAssertEqual(set.json, args.first)
  }

  func test_english_is_en_jsons_app_keys() throws {
    let english = try english()
    XCTAssertEqual(english["app.home"], "Home")
    XCTAssertTrue(english.keys.allSatisfy { $0.hasPrefix("app.") })
    XCTAssertNil(english["nav.settings"])
  }

  func test_draws_English_before_any_set_then_the_set_English_where_it_lacks_a_key() throws {
    var strings = NativeStrings(english: try english())
    XCTAssertEqual(strings.locale, "en")
    XCTAssertFalse(strings.rtl)
    XCTAssertEqual(strings["app.home"], "Home")
    XCTAssertTrue(strings.take(arabic))
    XCTAssertEqual(strings.locale, "ar")
    XCTAssertTrue(strings.rtl)
    XCTAssertEqual(strings["app.home"], "الرئيسية")
    XCTAssertEqual(strings["app.more"], "More")
    XCTAssertEqual(strings["app.unknown"], "app.unknown")
    XCTAssertFalse(strings.take(arabic))
  }

  func test_fills_placeholders_and_leaves_unknown_ones() throws {
    var strings = NativeStrings(english: try english())
    XCTAssertEqual(
      strings.format("app.blockAdsSiteLabel", ["site": "example.com"]), "Block ads on this site, example.com")
    XCTAssertEqual(strings.format("app.buildRefused", [:]), "Langle cannot run: {reasons}")
    _ = strings.take(arabic)
    XCTAssertEqual(
      strings.format("app.blockAdsSiteLabel", ["site": "example.com"]), "حظر الإعلانات على هذا الموقع، example.com")
  }

  func test_a_kept_set_is_drawn_at_a_cold_start() throws {
    let persistence = MemoryPersistence()
    persistence.save(NativeStrings.name, arabic.json)
    let again = NativeStrings(english: try english(), kept: persistence.load(NativeStrings.name))
    XCTAssertEqual(again.locale, "ar")
    XCTAssertEqual(again["app.home"], "الرئيسية")
  }

  func test_a_kept_value_that_is_no_set_is_English() throws {
    let strings = NativeStrings(english: try english(), kept: [1])
    XCTAssertEqual(strings.locale, "en")
    XCTAssertEqual(strings["app.home"], "Home")
  }
}
