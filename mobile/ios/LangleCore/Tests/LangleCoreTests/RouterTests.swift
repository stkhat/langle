import LangleCore
import XCTest

// Ports of src/app/testing/reference-native.test.ts, one for one: each class is a `describe`,
// each method the `test` of the same name, so the TS, Kotlin and Swift sides can be compared.

let origin = "https://app.langle.invalid"
let article = "https://example.com/article"

final class TheHostsStartTests: XCTestCase {
  func test_gets_onInstalled_with_install_on_the_first_run() {
    let h = Harness()
    let host = h.connect(.host)
    let installed = host.record("runtime.onInstalled")
    host.call("bridge.hello", ["context": "host"])
    XCTAssertEqual(installed.seen, [[["reason": "install"]]])
    XCTAssertEqual(h.router.installed, "1.0.0")
    XCTAssertEqual(h.persistence.saved["installed"], ["version": "1.0.0"])
  }

  func test_gets_onInstalled_with_update_when_the_build_changed() {
    let h = Harness(version: "1.0.0", installedVersion: "0.9.0")
    let host = h.connect(.host)
    let installed = host.record("runtime.onInstalled")
    host.call("bridge.hello", ["context": "host"])
    XCTAssertEqual(installed.seen, [[["reason": "update", "previousVersion": "0.9.0"]]])
  }

  func test_gets_onStartup_otherwise_and_nothing_when_it_is_created_again() {
    let h = Harness(installedVersion: "1.0.0")
    let first = h.connect(.host)
    let startup = first.record("runtime.onStartup")
    first.call("bridge.hello", ["context": "host"])
    first.disconnect()
    let second = h.connect(.host)
    let again = second.record("runtime.onStartup")
    let installed = second.record("runtime.onInstalled")
    second.call("bridge.hello", ["context": "host"])
    XCTAssertEqual(startup.seen, [[]])
    XCTAssertEqual(again.seen, [])
    XCTAssertEqual(installed.seen, [])
  }
}

final class StorageTests: XCTestCase {
  func test_keeps_three_areas_with_get_set_remove_and_clear() {
    let h = Harness(local: ["a": 1])
    let page = h.connect(.page(url: "\(origin)/options.html"))
    page.call("storage.local.set", ["b": 2])
    page.call("storage.sync.set", ["s": true])
    page.call("storage.session.set", ["tab": 3])
    XCTAssertEqual(page.call("storage.local.get", nil).value, ["a": 1, "b": 2])
    XCTAssertEqual(page.call("storage.local.get", ["b", "missing"]).value, ["b": 2])
    page.call("storage.local.remove", ["a"])
    page.call("storage.session.clear")
    XCTAssertEqual(page.call("storage.local.get", nil).value, ["b": 2])
    XCTAssertEqual(page.call("storage.sync.get", nil).value, ["s": true])
    XCTAssertEqual(page.call("storage.session.get", nil).value, [:])
  }

  func test_posts_onChanged_to_every_context_before_it_replies_to_the_writer() {
    let h = Harness()
    let host = h.connect(.host)
    let tabId = h.router.openTab(url: article)
    let content = h.connect(.content(tabId: tabId))
    var order: [String] = []
    host.on("storage.onChanged") { args in
      order.append("host onChanged")
      XCTAssertEqual(args, [["settings": ["newValue": ["on": true]]], "sync"])
      return .value(nil)
    }
    content.on("storage.onChanged") { _ in
      order.append("content onChanged")
      return .value(nil)
    }
    content.call("storage.sync.set", [["settings": ["on": true]]]) { order.append("writer resolved") }
    XCTAssertEqual(order, ["host onChanged", "content onChanged", "writer resolved"])
  }

  func test_tells_native_code_of_every_change_and_posts_native_writes_to_the_contexts() {
    let h = Harness(local: ["a": 1])
    let host = h.connect(.host)
    let posted = host.record("storage.onChanged")
    var heard: [(KeyValueStore.Area, [String: KeyValueStore.Change])] = []
    h.router.onStorageChanged = { heard.append(($0, $1)) }
    host.call("storage.local.set", ["a": 2])
    h.router.setStorage(.local, ["adBlocking": ["on": false]])
    h.router.setStorage(.local, ["adBlocking": ["on": false]])
    h.settle()
    XCTAssertEqual(heard.map(\.0), [.local, .local])
    XCTAssertEqual(heard[0].1, ["a": KeyValueStore.Change(oldValue: 1, newValue: 2)])
    XCTAssertEqual(heard[1].1, ["adBlocking": KeyValueStore.Change(oldValue: nil, newValue: ["on": false])])
    XCTAssertEqual(posted.seen.last, [["adBlocking": ["newValue": ["on": false]]], "local"])
    XCTAssertEqual(posted.seen.count, 2)
  }

  func test_gives_old_and_new_values_and_posts_nothing_when_nothing_changed() {
    let h = Harness(local: ["a": 1, "b": 2])
    let host = h.connect(.host)
    let changed = host.record("storage.onChanged")
    host.call("storage.local.set", ["a": 1])
    host.call("storage.local.remove", ["missing"])
    host.call("storage.local.set", ["a": 5])
    host.call("storage.local.remove", ["b"])
    XCTAssertEqual(
      changed.seen,
      [
        [["a": ["oldValue": 1, "newValue": 5]], "local"],
        [["b": ["oldValue": 2]], "local"],
      ])
  }

  func test_keeps_local_and_sync_for_the_next_process_not_session() {
    let first = Harness()
    let host = first.connect(.host)
    host.call("storage.local.set", ["l": 1])
    host.call("storage.sync.set", ["s": 1])
    host.call("storage.session.set", ["x": 1])
    let next = Harness(persistence: first.persistence)
    XCTAssertEqual(next.router.store.stored(.local), ["l": 1])
    XCTAssertEqual(next.router.store.stored(.sync), ["s": 1])
    XCTAssertEqual(next.router.store.stored(.session), [:])
  }
}

final class MessagesTests: XCTestCase {
  func test_a_content_scripts_message_reaches_the_host_with_the_sender_native_code_knows() {
    let h = Harness()
    let host = h.connect(.host)
    var senders: [JSONValue] = []
    host.on("runtime.onMessage") { args in
      senders.append(args[1])
      return .value(["echo": args[0]])
    }
    host.call("bridge.hello", ["context": "host"])
    let tabId = h.router.openTab(url: article)
    let content = h.connect(.content(tabId: tabId))
    // A second argument claiming another sender is not believed.
    let answer = content.call("runtime.sendMessage", ["type": "counts"], ["tab": ["id": 99]])
    XCTAssertEqual(answer.value, ["echo": ["type": "counts"]])
    XCTAssertEqual(
      senders,
      [
        [
          "id": "langle-app",
          "url": .string(article),
          "origin": "https://example.com",
          "tab": [
            "id": .number(Double(tabId)), "url": .string(article), "active": true, "windowId": 1,
            "incognito": false,
          ],
          "frameId": 0,
        ]
      ])
  }

  func test_the_hosts_error_reaches_the_sender() {
    let h = Harness()
    let host = h.connect(.host)
    host.on("runtime.onMessage") { _ in .error("bad request") }
    host.call("bridge.hello", ["context": "host"])
    let page = h.connect(.page(url: "\(origin)/popup.html"))
    XCTAssertEqual(page.call("runtime.sendMessage", [:]).error, "bad request")
  }

  func test_a_message_waits_for_the_hosts_hello() {
    let h = Harness()
    let page = h.connect(.page(url: "\(origin)/popup.html"))
    let answer = page.call("runtime.sendMessage", ["type": "a"])
    XCTAssertFalse(answer.settled)
    let host = h.connect(.host)
    host.on("runtime.onMessage") { _ in .value("late but there") }
    host.call("bridge.hello", ["context": "host"])
    XCTAssertEqual(answer.value, "late but there")
  }

  func test_a_message_fails_with_Chromes_text_when_the_host_has_not_said_hello_in_10_s() {
    let h = Harness()
    let page = h.connect(.page(url: "\(origin)/popup.html"))
    let answer = page.call("runtime.sendMessage", ["type": "a"])
    h.advance(by: 9_999)
    XCTAssertFalse(answer.settled)
    h.advance(by: 1)
    XCTAssertEqual(answer.error, noReceiver)
  }

  func test_a_message_fails_with_Chromes_text_when_the_host_goes_away_before_it_answers() {
    let h = Harness()
    let host = h.connect(.host)
    host.on("runtime.onMessage") { _ in .never }
    host.call("bridge.hello", ["context": "host"])
    let page = h.connect(.page(url: "\(origin)/popup.html"))
    let answer = page.call("runtime.sendMessage", [:])
    XCTAssertFalse(answer.settled)
    host.disconnect()
    h.settle()
    XCTAssertEqual(answer.error, noReceiver)
  }

  func test_tabs_sendMessage_reaches_the_tabs_top_frame_or_fails_as_Chrome_does() {
    let h = Harness()
    let host = h.connect(.host)
    let tabId = h.router.openTab(url: article)
    let top = h.connect(.content(tabId: tabId))
    let frame = h.connect(.content(tabId: tabId, frameId: 4))
    top.on("runtime.onMessage") { args in .value(["top": args[1]]) }
    frame.on("runtime.onMessage") { _ in .value("frame") }
    let tab = JSONValue.number(Double(tabId))
    XCTAssertEqual(host.call("tabs.sendMessage", tab, ["type": "summary"]).error, noReceiver)
    top.call("bridge.hello", ["context": "content"])
    frame.call("bridge.hello", ["context": "content"])
    XCTAssertEqual(
      host.call("tabs.sendMessage", tab, ["type": "summary"]).value,
      ["top": ["id": "langle-app", "url": .string("\(origin)/"), "origin": .string(origin)]])
    XCTAssertEqual(host.call("tabs.sendMessage", tab, [:], ["frameId": 4]).value, "frame")
    XCTAssertEqual(host.call("tabs.sendMessage", 99, [:]).error, noReceiver)
  }
}

final class TabsTests: XCTestCase {
  func test_query_finds_the_active_tab_create_opens_app_pages_get_and_remove_know_them() {
    let h = Harness()
    let host = h.connect(.host)
    let articleTab = h.router.openTab(url: article)
    let active = host.call("tabs.query", ["active": true]).value??.array
    XCTAssertEqual(active?.map { $0["id"] }, [.number(Double(articleTab))])
    XCTAssertEqual(active?.first?["url"], .string(article))
    let welcome = host.call("tabs.create", ["url": .string("\(origin)/welcome.html")]).value??["id"]
    let nowActive = host.call("tabs.query", ["active": true]).value??.array
    XCTAssertEqual(nowActive?.map { $0["id"] }, [welcome])
    XCTAssertEqual(nowActive?.first?["url"], .string("\(origin)/welcome.html"))
    host.call("tabs.update", .number(Double(articleTab)), ["active": true])
    XCTAssertEqual(host.call("tabs.get", welcome!).value??["active"], false)
    host.call("tabs.remove", welcome!)
    XCTAssertEqual(
      host.call("tabs.get", welcome!).error, "No tab with id: \(JSONValue.jsString(welcome))."
    )
  }

  func test_getCurrent_is_the_calling_pages_own_tab_and_nothing_without_one() {
    let h = Harness()
    let host = h.connect(.host)
    let welcome = host.call("tabs.create", ["url": .string("\(origin)/welcome.html")]).value??["id"]
    let id = Int(welcome!.number!)
    let page = h.connect(.page(url: "\(origin)/welcome.html", tabId: id))
    let current = page.call("tabs.getCurrent").value ?? nil
    XCTAssertEqual(current?["id"], welcome)
    XCTAssertEqual(current?["url"], .string("\(origin)/welcome.html"))
    let popup = h.connect(.page(url: "\(origin)/popup.html"))
    XCTAssertNil(popup.call("tabs.getCurrent").error)
    XCTAssertEqual((popup.call("tabs.getCurrent").value ?? nil) ?? .null, .null)
    XCTAssertEqual((host.call("tabs.getCurrent").value ?? nil) ?? .null, .null)
  }

  func test_openOptionsPage_opens_Settings_openPopup_reload_and_tabs_reload_are_logged() {
    let h = Harness()
    let host = h.connect(.host)
    host.call("runtime.openOptionsPage")
    host.call("action.openPopup")
    host.call("runtime.reload")
    host.call("tabs.reload", 1)
    XCTAssertEqual(h.router.tabs.all.map(\.url), ["\(origin)/options.html"])
    XCTAssertEqual(h.router.tabs.all.map(\.active), [true])
    XCTAssertEqual(
      h.actions, [.openTab(h.router.tabs.all[0]), .openPopup, .reloadHost, .reloadTab(1)])
  }

  func test_appHost_openPage_opens_the_web_page_in_a_tab_and_is_logged() {
    let h = Harness()
    let page = h.connect(.page(url: "\(origin)/home.html"))
    page.call("appHost.openPage", .string(article))
    XCTAssertEqual(
      page.call("appHost.openPage", .string("javascript:alert(1)")).error,
      "appHost.openPage needs an http(s) address.")
    XCTAssertTrue(h.router.tabs.all.contains { $0.url == article && $0.active })
    XCTAssertEqual(h.actions, [.openTab(h.router.tabs.all.last!)])
  }

  // The share sheet answers: the call settles once it shows, or fails with the app's reason.
  func test_appHost_shareFile_hands_a_plain_named_file_to_the_share_sheet() {
    let h = Harness()
    let words = h.connect(.page(url: "\(origin)/wordlist.html"))
    let file: JSONValue = ["name": "langle-backup.json", "mime": "application/json", "text": "{}"]
    XCTAssertEqual(words.call("appHost.shareFile", file).error, noSharing)

    var shared: [SharedFile] = []
    var answer: ((String?) -> Void)?
    h.router.onShareFile = { file, done in
      shared.append(file)
      answer = done
    }
    let pending = words.call("appHost.shareFile", file)
    XCTAssertEqual(shared, [SharedFile(name: "langle-backup.json", mime: "application/json", text: "{}")])
    XCTAssertFalse(pending.settled)
    answer?(nil)
    h.settle()
    XCTAssertEqual(pending.value, .some(nil))

    let failed = words.call("appHost.shareFile", file)
    answer?("No app can take it.")
    h.settle()
    XCTAssertEqual(failed.error, "No app can take it.")

    let bad: [JSONValue] = [
      ["name": "../langle.json", "mime": "application/json", "text": "{}"],
      ["name": "a/b.json", "mime": "application/json", "text": "{}"],
      ["name": ".hidden", "mime": "application/json", "text": "{}"],
      ["name": "", "mime": "application/json", "text": "{}"],
      ["name": "langle.json", "mime": "json", "text": "{}"],
      ["name": "langle.json", "mime": "application/json"],
      "langle.json",
    ]
    for value in bad {
      XCTAssertEqual(words.call("appHost.shareFile", value).error, SharedFile.error, "\(value)")
    }
    XCTAssertEqual(shared.count, 2)
  }

  func test_appHost_nativeStrings_keeps_a_locale_a_direction_and_text_strings_for_the_bars() {
    let h = Harness()
    let host = h.connect(.host)
    let strings: JSONValue = ["app.home": "الرئيسية", "app.more": "المزيد"]
    let set: JSONValue = ["locale": "ar", "dir": "rtl", "strings": strings]
    // Answered without a hook too: nothing to redraw.
    XCTAssertEqual(host.call("appHost.nativeStrings", set).value, .some(nil))
    var taken: [NativeStringSet] = []
    h.router.onNativeStrings = { taken.append($0) }
    XCTAssertEqual(host.call("appHost.nativeStrings", set).value, .some(nil))
    XCTAssertEqual(
      taken, [NativeStringSet(locale: "ar", rtl: true, strings: ["app.home": "الرئيسية", "app.more": "المزيد"])])
    let bad: [JSONValue] = [
      ["locale": "", "dir": "rtl", "strings": strings],
      ["locale": "ar", "dir": "up", "strings": strings],
      ["locale": "ar", "dir": "rtl", "strings": ["app.home": 1]],
      ["locale": "ar", "dir": "rtl", "strings": ["Home"]],
      ["locale": "ar", "dir": "rtl"],
      "ar",
    ]
    for value in bad {
      XCTAssertEqual(host.call("appHost.nativeStrings", value).error, NativeStringSet.error, "\(value)")
    }
    XCTAssertEqual(taken.count, 1)
  }

  // As the reference: each call fails at once until the app sets a sign-in (M7d).
  func test_google_sign_in_is_not_available_until_the_app_sets_one() {
    let h = Harness()
    let host = h.connect(.host)
    host.call("bridge.hello", ["context": "host"])
    XCTAssertEqual(
      host.call("appHost.googleAuth.token", ["interactive": true]).error,
      "appHost.googleAuth.token is not available here.")
    XCTAssertEqual(
      host.call("appHost.googleAuth.forget").error, "appHost.googleAuth.forget is not available here.")
  }

  // iOS only (M7d): the app's sign-in answers the host, and no other context.
  func test_google_sign_in_goes_to_the_apps_sign_in_for_the_extension_host_only() {
    let h = Harness()
    let host = h.connect(.host)
    host.call("bridge.hello", ["context": "host"])
    var asked: [(String, JSONValue?)] = []
    let granted: JSONValue = ["token": "ya29.t", "expiresAt": 5]
    h.router.onGoogleAuth = { api, request, done in
      asked.append((api, request))
      done(.success(api == "appHost.googleAuth.token" ? granted : nil))
    }
    XCTAssertEqual(host.call("appHost.googleAuth.token", ["interactive": false]).value, granted)
    XCTAssertNil(host.call("appHost.googleAuth.forget").error)
    XCTAssertEqual(asked.map(\.0), ["appHost.googleAuth.token", "appHost.googleAuth.forget"])
    XCTAssertEqual(asked[0].1, ["interactive": false])
    XCTAssertNil(asked[1].1)

    let settingsTab = h.router.openTab(url: "\(origin)/options.html")
    let settings = h.connect(.page(url: "\(origin)/options.html", tabId: settingsTab))
    settings.call("bridge.hello", ["context": "page"])
    XCTAssertEqual(
      settings.call("appHost.googleAuth.token", ["interactive": true]).error,
      "appHost.googleAuth.token is not available here.")
    let content = h.connect(.content(tabId: h.router.openTab(url: article)))
    XCTAssertEqual(content.call("appHost.googleAuth.forget").error, "appHost.googleAuth.forget is not available here.")
    XCTAssertEqual(asked.count, 2)
  }

  // iOS only (M7d): `app.hidden` is answered by the host.
  func test_an_event_the_host_answers_gets_its_answer_or_fails_without_a_host_or_an_answer_in_time() {
    let h = Harness()
    var answers: [Result<JSONValue?, BridgeError>] = []
    h.router.askHost("app.hidden", [], timeoutMs: 20_000) { answers.append($0) }
    XCTAssertEqual(answers.count, 1)
    if case .failure(let error) = answers[0] { XCTAssertEqual(error.message, noReceiver) } else { XCTFail() }
    XCTAssertFalse(h.router.isHostReady)

    let host = h.connect(.host)
    host.call("bridge.hello", ["context": "host"])
    XCTAssertTrue(h.router.isHostReady)
    host.on("app.hidden") { _ in .value(nil) }
    h.router.askHost("app.hidden", [], timeoutMs: 20_000) { answers.append($0) }
    h.settle()
    XCTAssertEqual(answers.count, 2)
    if case .success(let value) = answers[1] { XCTAssertNil(value) } else { XCTFail() }
    let event = host.received.last { $0["api"]?.string == "app.hidden" }
    XCTAssertEqual(event?["replyId"]?.string, "n1")

    host.on("app.hidden") { _ in .never }
    h.router.askHost("app.hidden", [], timeoutMs: 20_000) { answers.append($0) }
    h.advance(by: 19_999)
    XCTAssertEqual(answers.count, 2)
    h.advance(by: 1)
    XCTAssertEqual(answers.count, 3)
    if case .failure(let error) = answers[2] {
      XCTAssertEqual(error.message, "app.hidden: no answer in 20000 ms")
    } else {
      XCTFail()
    }
    h.advance(by: 60_000)
    XCTAssertEqual(answers.count, 3)
  }

  // The hosts come in M5c and M5d; until the app sets one, each call fails at once.
  func test_the_translation_calls_go_to_the_apps_translation_host_and_are_not_available_without_one() {
    let h = Harness()
    let host = h.connect(.host)
    host.call("bridge.hello", ["context": "host"])
    let tab = h.router.openTab(url: article)
    let content = h.connect(.content(tabId: tab))
    let translate: JSONValue = ["from": "en", "to": "ja", "text": "A cat.", "start": true]
    let calls: [(String, JSONValue)] = [
      ("appHost.translate", translate),
      ("appHost.translatorStatus", ["from": "en", "to": "ja"]),
      ("appHost.prepareTranslator", ["from": "en", "to": "ja"]),
      ("appHost.models.ensure", ["pack": "mt-en-ja"]),
      ("appHost.models.remove", ["pack": "mt-en-ja"]),
    ]
    for (api, request) in calls {
      XCTAssertEqual(content.call(api, request).error, "\(api) is not available here.")
    }

    var asked: [(ContextSpec, String, JSONValue?)] = []
    h.router.onTranslation = { from, api, request, done in
      asked.append((from, api, request))
      done(.success(api == "appHost.translate" ? .string("猫。") : nil))
    }
    XCTAssertEqual(content.call("appHost.translate", translate).value, .some(.string("猫。")))
    XCTAssertEqual(asked.count, 1)
    XCTAssertEqual(asked.first?.0, .content(tabId: tab))
    XCTAssertEqual(asked.first?.1, "appHost.translate")
    XCTAssertEqual(asked.first?.2, translate)

    let progress = host.record("appHost.models.onProgress")
    let event: JSONValue = ["pack": "mt-en-ja", "received": 5, "total": 10]
    h.router.postToHost("appHost.models.onProgress", [event])
    h.settle()
    XCTAssertEqual(progress.seen, [[event]])
  }
}

final class AlarmsTests: XCTestCase {
  func test_fire_on_the_host_at_their_time_again_when_periodic_and_can_be_cleared() {
    let h = Harness(now: 0)
    let host = h.connect(.host)
    let fired = host.record("alarms.onAlarm")
    host.call("bridge.hello", ["context": "host"])
    host.call("alarms.create", "once", ["delayInMinutes": 1])
    host.call("alarms.create", "often", ["periodInMinutes": 2])
    XCTAssertEqual(host.call("alarms.get", "once").value, ["name": "once", "scheduledTime": 60_000])
    h.advance(by: 4 * 60_000)
    XCTAssertEqual(
      fired.seen,
      [
        [["name": "once", "scheduledTime": 60_000]],
        [["name": "often", "scheduledTime": 120_000, "periodInMinutes": 2]],
        [["name": "often", "scheduledTime": 240_000, "periodInMinutes": 2]],
      ])
    XCTAssertEqual(host.call("alarms.get", "once").value, .some(nil))
    XCTAssertEqual(host.call("alarms.clear", "often").value, true)
    XCTAssertEqual(host.call("alarms.clear", "often").value, false)
    h.advance(by: 10 * 60_000)
    XCTAssertEqual(fired.seen.count, 3)
  }
}

final class BadEnvelopesTests: XCTestCase {
  func test_are_answered_with_an_error_and_logged() {
    let h = Harness()
    let host = h.connect(.host)
    host.post(#"{"v":1,"kind":"call","id":"x1","api":"identity.get","args":[]}"#)
    host.post("not json")
    XCTAssertEqual(
      host.received,
      [
        [
          "v": 1, "kind": "reply", "id": "x1", "ok": false,
          "error": ["message": "unknown call api identity.get"],
        ]
      ])
    XCTAssertEqual(h.errors.count, 2)
  }
}
