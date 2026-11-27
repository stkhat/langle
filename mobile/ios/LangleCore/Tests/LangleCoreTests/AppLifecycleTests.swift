import LangleCore
import XCTest

final class AppLifecycleTests: XCTestCase {
  private var h: Harness!
  private var holds: [Bool] = []
  private var lifecycle: AppLifecycle!
  private var host: Script!

  override func setUp() {
    h = Harness()
    holds = []
    lifecycle = AppLifecycle(router: h.router) { [unowned self] in holds.append($0) }
    host = h.connect(.host)
  }

  private func events() -> [String] {
    host.received.compactMap { $0["api"]?.string }.filter { $0.hasPrefix("app.") }
  }

  private func replyIds() -> [String] {
    host.received.filter { $0["api"]?.string == "app.hidden" }.compactMap { $0["replyId"]?.string }
  }

  private func startHost() { host.call("bridge.hello", ["context": "host"]) }

  private func answer(_ replyId: String) {
    host.connection.receive(Envelope.reply(id: replyId, result: .ok(nil)).json)
    h.settle()
  }

  func test_app_hidden_holds_the_app_until_the_host_answers() {
    startHost()
    host.on("app.hidden") { _ in .never }
    lifecycle.hidden()
    h.settle()
    XCTAssertEqual(events(), ["app.hidden"])
    XCTAssertEqual(holds, [true])
    answer(replyIds()[0])
    XCTAssertEqual(holds, [true, false])
  }

  func test_app_hidden_lets_go_after_20_s_without_an_answer() {
    startHost()
    host.on("app.hidden") { _ in .never }
    lifecycle.hidden()
    h.advance(by: 19_999)
    XCTAssertEqual(holds, [true])
    h.advance(by: 1)
    XCTAssertEqual(holds, [true, false])
  }

  func test_app_visible_comes_only_after_app_hidden_once_each() {
    startHost()
    host.on("app.hidden") { _ in .value(nil) }
    lifecycle.visible()
    lifecycle.hidden()
    lifecycle.hidden()
    lifecycle.visible()
    lifecycle.visible()
    h.settle()
    XCTAssertEqual(events(), ["app.hidden", "app.visible"])
    XCTAssertEqual(holds, [true, false])
  }

  func test_nothing_is_sent_or_held_before_the_host_said_hello() {
    lifecycle.hidden()
    lifecycle.visible()
    h.advance(by: 30_000)
    XCTAssertEqual(events(), [])
    XCTAssertEqual(holds, [])
  }

  func test_an_earlier_answer_does_not_end_a_later_hold() {
    startHost()
    host.on("app.hidden") { _ in .never }
    lifecycle.hidden()
    lifecycle.visible()
    lifecycle.hidden()
    h.settle()
    let ids = replyIds()
    XCTAssertEqual(ids.count, 2)
    answer(ids[0])
    XCTAssertEqual(holds, [true])
    answer(ids[1])
    XCTAssertEqual(holds, [true, false])
  }
}
