import Foundation
import LangleCore
import XCTest

// The same cases as Android's FilterListStoreTest.kt and AdBlockingTest.kt (mobile/android/core):
// the store's rules are shared (docs/specs/mobile-app.md "M6: ad blocking" › "The list store").

/// An engine of the fake builder: the texts it was built from.
final class FakeFilterEngine {
  let texts: [String]
  var released = false
  init(texts: [String]) { self.texts = texts }
}

struct FakeError: Error, CustomStringConvertible {
  let description: String
}

/// Builds "engines" that are the lists' texts joined; bytes of another version fail to load.
final class FakeFilterEngines: FilterEngines {
  var builds = 0
  var failBuild = false
  var released: [FakeFilterEngine] = []

  func build(_ lists: [(text: Data, trusted: Bool)]) throws -> Data {
    builds += 1
    if failBuild { throw FakeError(description: "bad lists") }
    let joined = lists.map { (($0.trusted ? "T" : "U") + String(decoding: $0.text, as: UTF8.self)) }
    return Data(("v1\n" + joined.joined(separator: "\u{0}")).utf8)
  }

  func load(_ bytes: Data) throws -> FakeFilterEngine {
    let text = String(decoding: bytes, as: UTF8.self)
    guard text.hasPrefix("v1\n") else { throw FakeError(description: "another crate version") }
    return FakeFilterEngine(texts: text.dropFirst(3).components(separatedBy: "\u{0}"))
  }

  func release(_ engine: FakeFilterEngine) {
    engine.released = true
    released.append(engine)
  }
}

/// What each URL answers: a list's text, an HTTP status, or (missing) a refused connection.
final class FakeFetcher: ListFetcher {
  enum Served {
    case text(String)
    case status(Int)
  }
  var served: [String: Served] = [:]
  var etags: [String: String] = [:]
  var requests: [String] = []

  func fetch(_ url: String, etag: String?, lastModified: String?) throws -> ListAnswer {
    requests.append("\(url) \(etag ?? "-") \(lastModified ?? "-")")
    switch served[url] {
    case .text(let text):
      if let etag, etag == etags[url] { return ListAnswer(status: 304) }
      return ListAnswer(
        status: 200, body: Data(text.utf8), etag: etags[url],
        lastModified: "Wed, 25 Nov 2026 10:00:00 GMT")
    case .status(let status): return ListAnswer(status: status)
    case nil: throw FakeError(description: "connection refused")
    }
  }
}

final class FilterListStoreTests: XCTestCase {
  var dir: URL!
  let lists = [
    FilterList(id: "easylist", urls: ["https://a.test/easylist.txt", "https://b.test/easylist.txt"], trusted: false),
    FilterList(id: "ublock", urls: ["https://u.test/filters.txt"], trusted: true),
  ]
  var time = 1_000_000.0
  var fetcher: FakeFetcher!
  var engines: FakeFilterEngines!
  var errors: [String] = []
  var updates: [Double] = []

  override func setUp() {
    dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    fetcher = FakeFetcher()
    engines = FakeFilterEngines()
  }

  override func tearDown() {
    try? FileManager.default.removeItem(at: dir)
  }

  /// Runs on the calling thread: background and main are the test's own.
  func store() -> FilterListStore<FakeFilterEngines> {
    let store = FilterListStore(
      dir: dir, lists: lists, fetcher: fetcher, engines: engines, background: { $0() },
      main: { $0() }, now: { [unowned self] in time }, retryMs: 1_800_000)
    store.onError = { [unowned self] in errors.append($0) }
    store.onFetchFailed = { [unowned self] in errors.append($0) }
    store.onUpdated = { [unowned self] in updates.append($0) }
    return store
  }

  func serveAll() {
    fetcher.served["https://a.test/easylist.txt"] = .text("[Adblock Plus 2.0]\n! Expires: 2 days\n##.ad")
    fetcher.served["https://u.test/filters.txt"] = .text(
      "! Title: uBlock filters\n! Expires: 12 hours\nyoutube.com##+js(set-constant, a, 1)")
    fetcher.etags["https://a.test/easylist.txt"] = "\"e1\""
    fetcher.etags["https://u.test/filters.txt"] = "\"u1\""
  }

  func test_blocks_nothing_until_a_first_fetch_succeeds_then_builds_an_engine_of_every_list() throws {
    let store = store()
    store.start()
    XCTAssertNil(store.engine)
    store.update()
    XCTAssertNil(store.engine)
    XCTAssertEqual(errors.count, 2)
    XCTAssertTrue(errors[0].contains("easylist") && errors[0].contains("https://b.test/easylist.txt"), errors[0])
    XCTAssertTrue(updates.isEmpty)

    serveAll()
    time += 1_800_000
    store.update()
    let engine = try XCTUnwrap(store.engine)
    XCTAssertEqual(
      engine.texts,
      [
        "U[Adblock Plus 2.0]\n! Expires: 2 days\n##.ad",
        "T! Title: uBlock filters\n! Expires: 12 hours\nyoutube.com##+js(set-constant, a, 1)",
      ])
    XCTAssertEqual(updates, [time])
    XCTAssertEqual(store.updatedAt(), time)
  }

  func test_takes_a_fallback_when_the_lists_own_URL_fails_and_asks_that_URL_conditionally_later() throws {
    serveAll()
    fetcher.served["https://a.test/easylist.txt"] = .status(503)
    fetcher.served["https://b.test/easylist.txt"] = .text("[Adblock Plus 2.0]\n##.from-b")
    fetcher.etags["https://b.test/easylist.txt"] = "\"b1\""
    let store = store()
    store.update()
    XCTAssertEqual(try XCTUnwrap(store.engine).texts[0], "U[Adblock Plus 2.0]\n##.from-b")
    XCTAssertTrue(errors.isEmpty)
    fetcher.requests.removeAll()
    time += 4 * 24 * 3_600_000
    store.update()
    // easylist names no expiry: 4 days. Its own URL still fails, so the fallback is asked with its validators.
    XCTAssertEqual(
      fetcher.requests,
      [
        "https://a.test/easylist.txt - -",
        "https://b.test/easylist.txt \"b1\" Wed, 25 Nov 2026 10:00:00 GMT",
        "https://u.test/filters.txt \"u1\" Wed, 25 Nov 2026 10:00:00 GMT",
      ])
  }

  func test_fetches_each_list_when_its_own_expiry_has_passed_and_a_304_keeps_the_engine() throws {
    serveAll()
    let store = store()
    store.update()
    let first = try XCTUnwrap(store.engine)
    XCTAssertEqual(engines.builds, 1)
    fetcher.requests.removeAll()

    time += 11 * 3_600_000
    XCTAssertFalse(store.isDue())
    store.update()
    XCTAssertTrue(fetcher.requests.isEmpty)

    time += 1 * 3_600_000
    XCTAssertTrue(store.isDue())
    store.update()
    // Only uBO's list (12 hours) was due, asked with its ETag: not modified.
    XCTAssertEqual(fetcher.requests, ["https://u.test/filters.txt \"u1\" Wed, 25 Nov 2026 10:00:00 GMT"])
    XCTAssertTrue(first === store.engine)
    XCTAssertEqual(engines.builds, 1)
    XCTAssertEqual(updates.count, 2)

    fetcher.requests.removeAll()
    time += 2 * 24 * 3_600_000
    fetcher.served["https://a.test/easylist.txt"] = .text("[Adblock Plus 2.0]\n##.ad2")
    fetcher.etags["https://a.test/easylist.txt"] = "\"e2\""
    store.update()
    XCTAssertEqual(fetcher.requests.count, 2)
    XCTAssertEqual(try XCTUnwrap(store.engine).texts[0], "U[Adblock Plus 2.0]\n##.ad2")
    XCTAssertTrue(first.released)
  }

  func test_a_failed_fetch_keeps_the_old_list_and_the_engine_and_is_tried_again_after_the_retry_time() throws {
    serveAll()
    let store = store()
    store.update()
    let engine = try XCTUnwrap(store.engine)
    time += 3 * 24 * 3_600_000
    fetcher.served["https://u.test/filters.txt"] = nil
    fetcher.requests.removeAll()
    store.update()
    XCTAssertTrue(engine === store.engine)
    XCTAssertEqual(errors.count, 1)
    XCTAssertTrue(errors[0].hasPrefix("Ad blocking: could not update the filter list ublock"), errors[0])
    XCTAssertEqual(updates.count, 1)
    // Not again before the retry time.
    fetcher.requests.removeAll()
    time += 600_000
    store.update()
    XCTAssertTrue(fetcher.requests.isEmpty)
    time += 1_200_000
    store.update()
    XCTAssertEqual(fetcher.requests.count, 1)
  }

  func test_a_failed_build_keeps_the_engine_in_use() throws {
    serveAll()
    let store = store()
    store.update()
    let engine = try XCTUnwrap(store.engine)
    engines.failBuild = true
    time += 13 * 3_600_000
    fetcher.served["https://u.test/filters.txt"] = .text("! Title: uBlock filters\n##.new")
    fetcher.etags["https://u.test/filters.txt"] = "\"u2\""
    store.update()
    XCTAssertTrue(engine === store.engine)
    XCTAssertFalse(engine.released)
    XCTAssertEqual(errors.count, 1)
    XCTAssertTrue(errors.first?.contains("could not build") == true, errors.first ?? "")
    XCTAssertEqual(updates.count, 1)
  }

  func test_refuses_an_answer_that_is_not_a_filter_list() throws {
    serveAll()
    fetcher.served["https://a.test/easylist.txt"] = .text("<html>Sign in to the Wi-Fi</html>")
    let store = store()
    store.update()
    XCTAssertEqual(errors.count, 1)
    XCTAssertTrue(errors.first?.contains("https://a.test/easylist.txt: not a filter list") == true, errors.first ?? "")
    XCTAssertEqual(try XCTUnwrap(store.engine).texts.count, 1)
  }

  func test_a_new_process_loads_the_kept_engine_and_builds_again_from_the_kept_lists_when_its_bytes_are_of_another_version() throws {
    serveAll()
    store().update()
    let again = store()
    again.start()
    XCTAssertEqual(try XCTUnwrap(again.engine).texts.count, 2)
    XCTAssertEqual(engines.builds, 1)

    try Data("v0\nold".utf8).write(to: dir.appendingPathComponent(FilterLists.engineFile))
    let third = store()
    third.start()
    XCTAssertEqual(try XCTUnwrap(third.engine).texts.count, 2)
    XCTAssertEqual(engines.builds, 2)
    let kept = try Data(contentsOf: dir.appendingPathComponent(FilterLists.engineFile))
    XCTAssertTrue(String(decoding: kept, as: UTF8.self).hasPrefix("v1\n"))
  }

  func test_an_update_asked_while_a_job_runs_runs_after_it() throws {
    serveAll()
    var jobs: [() -> Void] = []
    let store = FilterListStore(
      dir: dir, lists: lists, fetcher: fetcher, engines: engines, background: { jobs.append($0) },
      main: { $0() }, now: { [unowned self] in time })
    store.start()
    store.update()
    XCTAssertEqual(jobs.count, 1)
    jobs.removeFirst()()
    XCTAssertEqual(jobs.count, 1)
    jobs.removeFirst()()
    XCTAssertEqual(try XCTUnwrap(store.engine).texts.count, 2)
  }

  func test_reads_a_lists_own_expiry_within_1_hour_and_14_days() {
    func expiry(_ text: String) -> Double { FilterLists.expiryMs(Data(text.utf8)) / 3_600_000 }
    XCTAssertEqual(expiry("[Adblock Plus 2.0]\n! Title: EasyList\n! Expires: 4 days (update frequency)\n"), 96)
    XCTAssertEqual(expiry("! Expires: 1 day\n"), 24)
    XCTAssertEqual(expiry("! Title: x\n! Expires: 8 hours\n"), 8)
    XCTAssertEqual(expiry("! Title: none\n||ads.test^\n"), 96)
    XCTAssertEqual(expiry("! Expires: 0 hours\n"), 1)
    XCTAssertEqual(expiry("! Expires: 90 days\n"), 336)
  }

  func test_reads_filter_lists_json() throws {
    let read = FilterList.read(try repoFile("mobile/protocol/filter-lists.json"))
    XCTAssertEqual(read.map(\.id), ["easylist", "easyprivacy", "ublock-filters", "ublock-quick-fixes", "ublock-unbreak"])
    XCTAssertEqual(read.map(\.trusted), [false, false, true, true, true])
    XCTAssertEqual(
      read[0].urls,
      [
        "https://easylist.to/easylist/easylist.txt", "https://secure.fanboy.co.nz/easylist.txt",
        "https://easylist-downloads.adblockplus.org/easylist.txt",
      ])
  }
}

final class AdBlockingTests: XCTestCase {
  func test_the_switches_are_on_by_default_and_read_leniently() {
    XCTAssertEqual(AdBlockingSwitches(nil), AdBlockingSwitches(on: true, offSites: []))
    XCTAssertEqual(AdBlockingSwitches("on"), AdBlockingSwitches(on: true, offSites: []))
    XCTAssertEqual(
      AdBlockingSwitches(["on": false, "offSites": ["youtube.com", 3, "youtube.com"]]),
      AdBlockingSwitches(on: false, offSites: ["youtube.com"]))
    XCTAssertEqual(AdBlockingSwitches(on: true, offSites: ["a.com"]).value, ["on": true, "offSites": ["a.com"]])
  }

  func test_a_sites_switch_adds_or_removes_it_and_on_false_blocks_nothing() {
    let on = AdBlockingSwitches()
    let off = on.withSite("youtube.com", blocking: false)
    XCTAssertEqual(off.offSites, ["youtube.com"])
    XCTAssertEqual(off, off.withSite("youtube.com", blocking: false))
    XCTAssertFalse(off.blocks("youtube.com"))
    XCTAssertTrue(off.blocks("example.com"))
    XCTAssertTrue(off.blocks(nil))
    XCTAssertEqual(on, off.withSite("youtube.com", blocking: true))
    let allOff = AdBlockingSwitches(on: false)
    XCTAssertFalse(allOff.blocks("example.com"))
    XCTAssertFalse(allOff.blocks(nil))
  }

  func test_a_change_reloads_only_the_pages_of_a_site_whose_blocking_turned() {
    let on = AdBlockingSwitches()
    let off = on.withSite("youtube.com", blocking: false)
    XCTAssertTrue(AdBlockingSwitches.reloads(on, off, site: "youtube.com"))
    XCTAssertFalse(AdBlockingSwitches.reloads(on, off, site: "example.com"))
    XCTAssertTrue(AdBlockingSwitches.reloads(off, on, site: "youtube.com"))
    // Turning everything off reloads every page that was blocked; a site already off stays as it was.
    var allOff = off
    allOff.on = false
    XCTAssertTrue(AdBlockingSwitches.reloads(off, allOff, site: "example.com"))
    XCTAssertFalse(AdBlockingSwitches.reloads(off, allOff, site: "youtube.com"))
  }

  func test_setup_is_done_once_the_user_agreed_and_chose_the_languages() {
    XCTAssertFalse(setupDone(nil))
    XCTAssertFalse(setupDone(["consent": 1]))
    XCTAssertFalse(setupDone(["languages": true]))
    XCTAssertTrue(setupDone(["consent": 1, "languages": true]))
  }
}
