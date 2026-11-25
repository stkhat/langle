import LangleCore
import XCTest

/// The engine as the host sees it: every call is recorded and waits until the test answers it.
private final class FakeEngine: TranslationEngine {
  var statuses: [TranslationPair: TranslatorStatus] = [:]
  /// What the consent sheet leaves the pair at when it closes.
  var afterSheet: TranslatorStatus = .ready
  private(set) var loads: [(TranslationPair, (Result<Void, EngineFailure>) -> Void)] = []
  private(set) var translations: [(String, (Result<String, EngineFailure>) -> Void)] = []
  private(set) var sheets: [(TranslationPair, () -> Void)] = []
  private(set) var releases = 0

  func status(_ pair: TranslationPair, _ done: @escaping (TranslatorStatus) -> Void) {
    done(statuses[pair] ?? .ready)
  }

  func prepare(_ pair: TranslationPair, _ done: @escaping () -> Void) {
    sheets.append((pair, done))
  }

  func load(_ pair: TranslationPair, _ done: @escaping (Result<Void, EngineFailure>) -> Void) {
    loads.append((pair, done))
  }

  func translate(
    _ pair: TranslationPair, _ text: String, _ done: @escaping (Result<String, EngineFailure>) -> Void
  ) {
    translations.append((text, done))
  }

  func release() { releases += 1 }

  /// Closes the oldest sheet still open, leaving its pair at `afterSheet`.
  func closeSheet(at index: Int) {
    let (pair, done) = sheets[index]
    statuses[pair] = afterSheet
    done()
  }
}

final class TranslationHostTests: XCTestCase {
  private let enJa = TranslationPair(from: "en", to: "ja")
  private let page = ContextSpec.content(tabId: 3)
  private var clock: ManualClock!
  private var engine: FakeEngine!
  private var host: TranslationHost!
  private var shown: Set<String> = []

  override func setUp() {
    clock = ManualClock(now: 0)
    engine = FakeEngine()
    shown = ["content"]
    host = TranslationHost(engine: engine, clock: clock) { [unowned self] spec in
      if case .content = spec { return shown.contains("content") }
      return true
    }
  }

  /// Sends a translate call; the answer lands in the returned box.
  private func translate(_ text: String, start: Bool = true, from: ContextSpec? = nil) -> Pending {
    let pending = Pending()
    let request: JSONValue = ["from": "en", "to": "ja", "text": .string(text), "start": .bool(start)]
    host.handle(from ?? page, "appHost.translate", request) { pending.result = $0 }
    return pending
  }

  private func call(_ api: String, _ request: JSONValue) -> Pending {
    let pending = Pending()
    host.handle(page, api, request) { pending.result = $0 }
    return pending
  }

  private func advance(_ ms: Double) { clock.advance(by: ms) {} }

  /// Starts the engine for en → ja with one sentence.
  private func startEngine() {
    let first = translate("A cat.")
    engine.loads.last!.1(.success(()))
    engine.translations.last!.1(.success("猫。"))
    XCTAssertEqual(first.value, .some(.string("猫。")))
    XCTAssertTrue(host.running(enJa))
  }

  func test_translates_one_sentence_at_a_time_in_the_order_asked() {
    let first = translate("A cat.")
    let second = translate("A dog.")
    XCTAssertEqual(engine.loads.count, 1)
    engine.loads[0].1(.success(()))
    XCTAssertEqual(engine.translations.map(\.0), ["A cat."])
    engine.translations[0].1(.success("猫。"))
    XCTAssertEqual(first.value, .some(.string("猫。")))
    XCTAssertFalse(second.settled)
    XCTAssertEqual(engine.translations.map(\.0), ["A cat.", "A dog."])
    engine.translations[1].1(.success("犬。"))
    XCTAssertEqual(second.value, .some(.string("犬。")))
    XCTAssertEqual(engine.loads.count, 1)
  }

  func test_releases_the_engine_60_seconds_after_the_last_use() {
    startEngine()
    advance(30_000)
    let again = translate("A dog.")
    engine.translations.last!.1(.success("犬。"))
    XCTAssertEqual(again.value, .some(.string("犬。")))
    advance(59_000)
    XCTAssertEqual(engine.releases, 0)
    XCTAssertTrue(host.running(enJa))
    XCTAssertEqual(host.loadedPairs, ["en>ja"])
    advance(1_000)
    XCTAssertEqual(engine.releases, 1)
    XCTAssertFalse(host.running(enJa))
    XCTAssertEqual(host.loadedPairs, [])

    // The next sentence starts it again.
    _ = translate("A bird.")
    XCTAssertEqual(engine.loads.count, 2)
  }

  func test_releases_at_once_when_the_app_leaves_the_screen_and_waiting_requests_get_null() {
    startEngine()
    let working = translate("A dog.")
    let waiting = translate("A bird.")
    host.leftScreen()
    XCTAssertEqual(engine.releases, 1)
    XCTAssertFalse(host.running(enJa))
    XCTAssertEqual(working.value, .some(.null))
    XCTAssertEqual(waiting.value, .some(.null))
    // A late answer from the released engine is dropped.
    engine.translations[1].1(.success("犬。"))
    XCTAssertEqual(working.value, .some(.null))
    // No release timer is left behind.
    advance(120_000)
    XCTAssertEqual(engine.releases, 1)
  }

  func test_a_list_request_never_starts_the_engine_nor_keeps_it_alive() {
    let cold = translate("A cat.", start: false)
    XCTAssertEqual(cold.value, .some(.null))
    XCTAssertTrue(engine.loads.isEmpty)

    startEngine()
    advance(50_000)
    let warm = translate("A dog.", start: false)
    engine.translations.last!.1(.success("犬。"))
    XCTAssertEqual(warm.value, .some(.string("犬。")))
    // Released 60 s after the sentence, not after the list's row.
    advance(10_000)
    XCTAssertEqual(engine.releases, 1)
  }

  func test_a_page_not_on_screen_gets_null_at_once() {
    shown = []
    let hidden = translate("A cat.")
    XCTAssertEqual(hidden.value, .some(.null))
    XCTAssertTrue(engine.loads.isEmpty)
  }

  func test_an_engine_failure_restarts_it_once_then_translation_stays_off_until_a_page_is_opened() {
    startEngine()
    let failed = translate("A dog.")
    engine.translations.last!.1(.failure(.engine))
    XCTAssertEqual(failed.value, .some(.null))
    XCTAssertEqual(engine.releases, 1)
    XCTAssertFalse(host.running(enJa))

    // The restart.
    let restarted = translate("A bird.")
    XCTAssertEqual(engine.loads.count, 2)
    engine.loads[1].1(.failure(.engine))
    XCTAssertEqual(restarted.value, .some(.null))

    // Off: no engine is started.
    let off = translate("A fish.")
    XCTAssertEqual(off.value, .some(.null))
    XCTAssertEqual(engine.loads.count, 2)
    XCTAssertTrue(host.isOff)
    XCTAssertEqual(host.loadedPairs, [])

    host.pageOpened()
    XCTAssertFalse(host.isOff)
    _ = translate("A fish.")
    XCTAssertEqual(engine.loads.count, 3)
  }

  func test_a_text_the_engine_cannot_translate_keeps_the_engine() {
    startEngine()
    let odd = translate("…")
    engine.translations.last!.1(.failure(.text))
    XCTAssertEqual(odd.value, .some(.null))
    XCTAssertEqual(engine.releases, 0)
    XCTAssertTrue(host.running(enJa))
  }

  func test_models_not_installed_load_again_next_time_without_a_restart() {
    startEngine()
    let missing = translate("A dog.")
    engine.translations.last!.1(.failure(.notInstalled))
    XCTAssertEqual(missing.value, .some(.null))
    XCTAssertFalse(host.running(enJa))
    XCTAssertEqual(engine.releases, 0)
    _ = translate("A bird.")
    XCTAssertEqual(engine.loads.count, 2)
  }

  func test_loading_gives_up_after_30_seconds_as_an_engine_failure() {
    let slow = translate("A cat.")
    let after = translate("A dog.")
    advance(29_999)
    XCTAssertFalse(slow.settled)
    advance(1)
    XCTAssertEqual(slow.value, .some(.null))
    XCTAssertEqual(engine.releases, 1)
    // The load that answers late is dropped; the next request loads again.
    engine.loads[0].1(.success(()))
    XCTAssertFalse(host.running(enJa))
    XCTAssertEqual(engine.loads.count, 2)
    XCTAssertFalse(after.settled)
  }

  func test_a_sentence_gives_up_after_10_seconds_and_the_engine_is_kept() {
    startEngine()
    let slow = translate("A dog.")
    let after = translate("A bird.")
    advance(9_999)
    XCTAssertFalse(slow.settled)
    advance(1)
    XCTAssertEqual(slow.value, .some(.null))
    XCTAssertTrue(host.running(enJa))
    XCTAssertEqual(engine.translations.last!.0, "A bird.")
    engine.translations[1].1(.success("犬。"))
    XCTAssertEqual(slow.value, .some(.null))
    engine.translations[2].1(.success("鳥。"))
    XCTAssertEqual(after.value, .some(.string("鳥。")))
  }

  func test_status_is_the_engines() {
    engine.statuses[enJa] = .download
    XCTAssertEqual(call("appHost.translatorStatus", ["from": "en", "to": "ja"]).value, .some(.string("download")))
    XCTAssertEqual(call("appHost.translatorStatus", ["from": "en"]).error, TranslationHost.badPair)
    XCTAssertEqual(call("appHost.translate", ["from": "en", "to": "ja"]).error, TranslationHost.badRequest)
  }

  func test_consent_sheets_show_one_after_another_and_each_is_answered() {
    let esJa = TranslationPair(from: "es", to: "ja")
    engine.statuses[enJa] = .download
    engine.statuses[esJa] = .download
    let first = call("appHost.prepareTranslator", ["from": "en", "to": "ja"])
    // The page that asks second closes before its sheet shows: its answer is still sent.
    let second = call("appHost.prepareTranslator", ["from": "es", "to": "ja"])
    XCTAssertEqual(engine.sheets.map(\.0), [enJa])
    engine.closeSheet(at: 0)
    XCTAssertEqual(first.value, .some(.string("ready")))
    XCTAssertEqual(engine.sheets.map(\.0), [enJa, esJa])
    engine.afterSheet = .download  // declined
    engine.closeSheet(at: 1)
    XCTAssertEqual(second.value, .some(.string("download")))
  }

  func test_no_sheet_for_a_pair_that_needs_no_download() {
    engine.statuses[enJa] = .ready
    let ready = call("appHost.prepareTranslator", ["from": "en", "to": "ja"])
    XCTAssertEqual(ready.value, .some(.string("ready")))
    XCTAssertTrue(engine.sheets.isEmpty)
  }

  func test_model_packs_are_not_this_apps() {
    XCTAssertEqual(call("appHost.models.ensure", ["pack": "mt-en-ja"]).error, "appHost.models.ensure is not available here.")
    XCTAssertEqual(call("appHost.models.remove", ["pack": "mt-en-ja"]).value, .some(nil))
  }
}
