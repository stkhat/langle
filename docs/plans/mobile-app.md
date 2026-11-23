# Mobile app: implementation plan (M0, spikes S1 and S2, M1 and M2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build M0 of [docs/specs/mobile-app.md](../specs/mobile-app.md) "Build order": the `langle-app` build target, the bridge protocol with its golden files, and the `browser.*` shim with a TS reference of the native side. Alongside, run spikes S1 (iOS) and S2 (Android), which settle the storage and isolation questions before M1/M2.

**Architecture:**
- The shim (`src/app/shim/`) gives the extension code a `globalThis.browser` whose calls become JSON envelopes (`src/app/bridge/`) on a `Transport`.
- On a phone the transport is the native message handler. In tests it is `src/app/testing/reference-native.ts`, a TS implementation of the router and key-value store. Its behaviour is what the Kotlin and Swift routers copy in M1/M2.
- WXT builds the target with `wxt build -b langle-app`.

**Tech stack:** TypeScript, WXT 0.21 + Preact, Vitest (unit in Node, browser on Chromium and Firefox). The spikes use Kotlin + androidx.webkit 1.18 (Android) and Swift + WKWebView (iOS 26.4 floor, built with the installed SDK).

## Progress
- [x] Design approved (2026-11-24): [docs/specs/mobile-app.md](../specs/mobile-app.md)
- [x] M0: `langle-app` target, protocol, shim, reference native (branch `claude/mobile-m0`)
- [x] S1: iOS spike (branch `claude/mobile-s1`): the storage plan holds; the host must stay in the view hierarchy (notes/mobile.md "iOS extension host spike")
- [x] S2: Android spike (branch `claude/mobile-s2`): the plan holds on WebView 146.0.7680.10 or later; renderers are per profile, and the host stops in the background (notes/mobile.md "Android extension host spike")
- [ ] M2: iOS shell (branch `claude/mobile-m2`)
- [x] M1: Android shell (branch `claude/mobile-m1`): Langle runs on the E2E article on the emulator (WebView Dev 160): highlights, a saved word survives a restart, the error log is empty

## Running order
- M0 and S1 start together. S2 starts when S1 has shut its Simulator down: the dev Mac runs only one of the iOS Simulator and the Android emulator at a time.
- M0 and S1 branches were cut from `claude/langle-mobile-app-build-5ac38c`, which held the spec and this plan. M0 is on `main` now: S2, M1 and M2 PRs are based on `main`.

## Before you start (every agent)
- Read [CLAUDE.md](../../CLAUDE.md), [docs/testing.md](../testing.md) and the spec.
- Work in your own worktree on your branch. Commit after each task (English, no Claude attribution).
- Edit files with Edit and Write, not `python3 - <<EOF`. Use one simple git command per Bash call.
- For anything over 180 s, use `run_in_background` and wait for the notification. No `until` or `sleep` loops.
- `npm run verify` before every push. The pre-push hook refuses a tree it has not passed on.
- Open a **draft** PR with `--body-file <absolute path>`, then read the body back with `gh pr view <n> --json body`. Finish with `gh pr ready <n>`. Never merge, never poll CI.
- Report the PR number, the branch and what you found.
- Stop at about 150 turns or 250k context. If you stop there, write `HANDOFF.md` at the worktree root saying what is done and what is next.
- While iterating, run only the touched test files:
  - unit: `npx vitest run --project unit <file>`
  - browser: `VITEST_BROWSERS=chromium npx vitest run --project browser <file>`
  - Firefox, sandbox off: `npm run test:browser:firefox -- <file>`

---

## M0 (one agent, Opus)

### Files
| File | Responsibility |
| --- | --- |
| `src/app/bridge/protocol.ts` | envelope types, `PROTOCOL_VERSION`, `parseEnvelope`, the API name lists |
| `src/app/bridge/bridge.ts` | `Transport`, `createBridge`: pending calls by id, events, replies to events |
| `src/app/bridge/native-transport.ts` | finds the platform's transport (iOS handler, Android listener object) |
| `src/app/shim/events.ts` | `createEvent<T>()`: `addListener`, `removeListener`, `hasListener`, `emit` |
| `src/app/shim/runtime.ts`, `storage.ts`, `tabs.ts`, `alarms.ts`, `misc.ts` | one namespace each, over the bridge |
| `src/app/shim/install.ts` | `installShim(bridge, info)`: builds `browser`, sets `globalThis.browser` and `globalThis.chrome` |
| `src/entrypoints/langle-shim.ts` | unlisted script, `langle-app` only: finds the transport, says hello, installs the shim |
| `src/app/testing/reference-native.ts` | the native side in TS: router, key-value store, contexts, tabs, alarms |
| `mobile/protocol/*.json` | golden envelopes (call, reply, event, error, hello) |
| `src/app/bridge/protocol.test.ts`, `bridge.test.ts`, `src/app/shim/*.test.ts`, `src/app/app-host.browser.test.ts` | tests |
| `wxt.config.ts`, `src/entrypoints/*` | `langle-app` target: `include` / `exclude` per entrypoint |
| `package.json`, `scripts/verify.ts` | `build:app`, and the build in verify |
| `tests/app-manifest.test.ts` | the `langle-app` manifest uses only what the app supports |
| `docs/specs/architecture.md` | `app/` in the code layout, and a row in "Browser differences" |

### Task 1: protocol and golden envelopes
- [ ] Write `mobile/protocol/`:
  - `call.json`: `{"v":1,"kind":"call","id":"c1","api":"storage.local.get","args":[["settings"]]}`
  - `reply-ok.json`: `{"v":1,"kind":"reply","id":"c1","ok":true,"value":{"settings":{}}}`
  - `reply-error.json`: `{"v":1,"kind":"reply","id":"c2","ok":false,"error":{"message":"Could not establish connection. Receiving end does not exist."}}`
  - `event.json`: `{"v":1,"kind":"event","api":"storage.onChanged","args":[{"settings":{"newValue":1}},"local"]}`
  - `event-reply.json`: `{"v":1,"kind":"event","api":"runtime.onMessage","args":[{"type":"counts"},{"tab":{"id":3,"url":"https://example.com/"},"frameId":0,"url":"https://example.com/"}],"replyId":"n7"}`
  - `hello.json`: `{"v":1,"kind":"call","id":"h1","api":"bridge.hello","args":[{"context":"content"}]}`
  - `bad-version.json`: `{"v":2,"kind":"call","id":"x","api":"storage.local.get","args":[]}`. It must be rejected.
  - `README.md` (three lines: what these are, that TS, JUnit and XCTest read them, and that a change here changes all three).
- [ ] Failing test `src/app/bridge/protocol.test.ts`. It reads every file in `mobile/protocol/` and expects:
  - `parseEnvelope(JSON.stringify(x))` returns the same object for each good file;
  - `bad-version.json` gives `{ error: "unsupported version 2" }`;
  - an unknown `kind`, a missing `id` on a call, a non-array `args` and an unknown `api` each give an error.
- [ ] Implement `protocol.ts`:

```ts
export const PROTOCOL_VERSION = 1;
export const CALL_APIS = [
  "bridge.hello",
  "runtime.sendMessage", "runtime.openOptionsPage", "runtime.reload",
  "storage.local.get", "storage.local.set", "storage.local.remove", "storage.local.clear",
  "storage.sync.get", "storage.sync.set", "storage.sync.remove", "storage.sync.clear",
  "storage.session.get", "storage.session.set", "storage.session.remove", "storage.session.clear",
  "tabs.query", "tabs.get", "tabs.sendMessage", "tabs.create", "tabs.update", "tabs.remove", "tabs.reload",
  "action.openPopup",
  "alarms.create", "alarms.get", "alarms.clear",
] as const;
export const EVENT_APIS = [
  "runtime.onMessage", "runtime.onInstalled", "runtime.onStartup",
  "storage.onChanged", "alarms.onAlarm",
] as const;
export type CallApi = (typeof CALL_APIS)[number];
export type EventApi = (typeof EVENT_APIS)[number];
export interface Call { v: 1; kind: "call"; id: string; api: CallApi; args: unknown[] }
export type Reply =
  | { v: 1; kind: "reply"; id: string; ok: true; value?: unknown }
  | { v: 1; kind: "reply"; id: string; ok: false; error: { message: string } };
export interface Event { v: 1; kind: "event"; api: EventApi; args: unknown[]; replyId?: string }
export type Envelope = Call | Reply | Event;
export function parseEnvelope(json: string): Envelope | { error: string } { /* validate as the test says */ }
```

- [ ] Run the test until it passes, then commit "Add the app bridge protocol and its golden envelopes".

### Task 2: the bridge
- [ ] Failing tests `src/app/bridge/bridge.test.ts`, using a fake `Transport` that records posts and can deliver strings:
  - `call()` posts a call envelope and resolves with the reply's `value`.
  - An error reply rejects with `new Error(message)`, so `client.ts`'s `/Receiving end does not exist/` still matches.
  - Replies resolve by id even when out of order.
  - `on(api, handler)` gets the event's args.
  - When an event has a `replyId`, the handler's result (sync or a Promise) is posted back as a reply with `id = replyId`. A thrown error is posted as an error reply. A handler returning `undefined` with no listener left gives an error reply "Could not establish connection. Receiving end does not exist." (see Task 4).
  - A bad envelope is ignored and reported once through `console.error`.
- [ ] Implement `bridge.ts`:

```ts
export interface Transport { post(json: string): void; listen(receive: (json: string) => void): void }
export interface Bridge {
  call(api: CallApi, ...args: unknown[]): Promise<unknown>;
  on(api: EventApi, handler: (args: unknown[]) => unknown): void;
}
export function createBridge(transport: Transport, newId = counterIds()): Bridge
```

- [ ] Implement `native-transport.ts`:
  - iOS: `webkit.messageHandlers.langleBridge.postMessage(json)`. Native calls `globalThis.__langleBridgeReceive(json)` in Langle's world.
  - Android: `globalThis.langleBridge.postMessage(json)`, and receives through `langleBridge.onmessage = (e) => receive(e.data)`.
  - It returns `undefined` when neither exists.
  - Unit-test both with stubbed globals.
- [ ] Commit "Add the app bridge".

### Task 3: events and storage
- [ ] `events.ts` test and implementation: listeners are called in the order they were added, `removeListener` works during an emit, and `hasListener`.
- [ ] `storage.ts` failing tests over a fake bridge:
  - `get(key | keys | null | object of defaults)` keeps Chrome's semantics: defaults fill in missing keys, and `null` returns everything.
  - `set`, `remove` and `clear` call the bridge with the area's API.
  - `onChanged` gets `(changes, areaName)` from `storage.onChanged` events.
  - The per-area `browser.storage.local.onChanged` exists too, filtered by area.
- [ ] Implement it. Commit "Add the shim's storage".

### Task 4: runtime, tabs, alarms, the rest
- [ ] Failing tests, then implementation:
  - `runtime.id`, `getURL(path)`, `getManifest()`: from the `info` given to `installShim` (`{ id, origin, manifest }`). `getURL("/welcome.html")` is `origin + "/welcome.html"`.
  - `runtime.sendMessage(msg)`: calls `runtime.sendMessage`. It rejects with the reply's error, so a missing receiver gives Chrome's text.
  - `runtime.onMessage`: on an event with a `replyId`, every listener is called with `(message, sender, sendResponse)`.
    - The first `sendResponse` value, or the first Promise a listener returns, becomes the reply.
    - A listener returning `true` means it will call `sendResponse` later.
    - When no listener answers, the reply is the error "Could not establish connection. Receiving end does not exist." (what Chrome reports when nobody answers).
  - `runtime.onInstalled`, `runtime.onStartup`: events.
  - `runtime.openOptionsPage`, `runtime.reload`: calls.
  - `tabs.*`: calls that return what native code answers. `tabs.sendMessage(tabId, msg)` works like `runtime.sendMessage`.
  - `alarms.create(name, info)`, `get`, `clear`, `onAlarm`.
  - `windows.update`: resolves with nothing.
  - `action.setIcon`: resolves. `action.openPopup`: a call.
  - `identity`, `offscreen` and anything else are left out (`browser.identity === undefined`).
- [ ] `install.ts`: `installShim(bridge, info)` builds the object and sets `globalThis.browser` and `globalThis.chrome`, so `wxt/browser` picks it (it checks `browser.runtime.id`).
- [ ] Commit "Add the shim's runtime, tabs, alarms and install".

### Task 5: the reference native side
- [ ] `src/app/testing/reference-native.ts` (test-only, like `src/testing/`). It is a router that holds contexts:
  - Kinds: `host` (one), `content` (per tab and frame), `page` (app pages). Each has its own `Transport` pair.
  - It serves:
    - `bridge.hello`;
    - storage: three in-memory areas. **For each write it posts `storage.onChanged` to every context and then replies to the writer.** Nothing is posted when nothing changed;
    - `runtime.sendMessage` from content or page goes to the host as `runtime.onMessage` with a `replyId` and a `sender` that **the router fills in**;
    - `tabs.sendMessage` goes to that tab's top-frame content context;
    - `tabs.query({ active: true })` returns the tab marked active;
    - `tabs.create` with an app-origin URL records an app page;
    - `alarms` run on an injectable clock;
    - while the host has not said hello, calls to it wait up to 10 s, then get "Could not establish connection. Receiving end does not exist.".
  - It also starts the host's run: after its hello it emits `runtime.onInstalled` (`{ reason: "install" }` the first time) or `runtime.onStartup`.
- [ ] Unit tests for each bullet. The order test: a content context writes `settings`; the content context and the host both see `onChanged` before the writer's promise resolves (record the order in an array).
- [ ] Commit "Add a reference native side for the app's shim".

### Task 6: the `langle-app` target
- [ ] `src/entrypoints/langle-shim.ts`: `defineUnlistedScript` with `include: ["langle-app"]`. At run:
  - it finds the transport (if none, it logs and stops);
  - it creates the bridge and installs the shim with `{ id: "langle-app", origin: <the origin native code passes in `globalThis.__langleAppInfo`>, manifest }`, the manifest being fetched from `<origin>/manifest.json` before install. Native code sets `__langleAppInfo = { origin, manifest }` in the same world just before it injects this script, so the install is synchronous;
  - it says hello with its context.
- [ ] Exclude from `langle-app` (`exclude: ["langle-app"]`): `netflix.content.ts`, `netflix-main.content.ts`, `youtube.content.ts`, `youtube-main.content.ts` (M3 adds `m.youtube.com`). For HTML pages, check WXT 0.21's way of including or excluding a page per browser (`<meta name="manifest.exclude" …>`) and use it only where a page must be left out. Keep popup, options, wordlist, welcome and notices.
- [ ] `package.json`: add `"build:app": "wxt build -b langle-app"`, and run it in `scripts/verify.ts`'s host lane after the other builds. Update `scripts/verify.test.ts` if it lists the stages.
- [ ] `tests/app-manifest.test.ts` (manifest project). After `npm run build:app`, read `.output/langle-app-mv3/manifest.json` and assert:
  - `background.service_worker` exists;
  - every content script has only `matches`, `js`, `run_at`, `world`, `css` (empty);
  - `all_frames` is absent or false;
  - no `netflix` matches;
  - `langle-shim.js` is in the output;
  - permissions ⊆ `storage`, `alarms`, `identity`.
  Look at how the existing manifest project finds its build and follow that.
- [ ] `npm run check` (knip may flag `reference-native.ts`: it is used by tests only, as `src/testing/` is; follow knip's existing config for test helpers).
- [ ] Commit "Build a langle-app target".

### Task 7: the background on the shim, in a real browser
- [ ] `src/app/app-host.browser.test.ts` (browser project). It wires `reference-native` in the page with two in-page transports: one for the "host" and one for a "content" context. It installs the shim for the host in a separate realm (an `iframe` with its own `globalThis`), runs the real background's start function there, and then from the content side:
  - sends `{ type: "setupStatus" }` and gets a reply;
  - after setup (follow `src/testing/background.ts` for how tests set up a device and packs), sends `getSettings`;
  - writes a setting through `setSettings` and sees `storage.onChanged` in the content realm before the reply.
  - If running WXT's `defineBackground` body outside WXT needs a seam, move the body of `src/entrypoints/background.ts` into `src/background/start.ts` (`export function startBackground(): void`), keep the entrypoint as `defineBackground(startBackground)`, and test that.
- [ ] Run it on Chromium and Firefox. Commit "Run the background on the app shim in a browser test".

### Task 8: docs and PR
- [ ] `docs/specs/architecture.md`:
  - code layout: `app/` (`bridge/`, `shim/`, `testing/reference-native.ts`) and `entrypoints/langle-shim.ts`;
  - "Browser differences": a short line that the phone app runs the `langle-app` build through the shim (mobile-app.md).
- [ ] `docs/status.md`: one line under the current work.
- [ ] `npm run verify`, push, draft PR "Mobile app M0: langle-app target, bridge protocol and shim" based on `claude/langle-mobile-app-build-5ac38c`, then `gh pr ready`. Tick M0 in this plan's Progress in the same PR.

---

## S1: iOS spike (one agent, Opus)
A throwaway app in `mobile/prototypes/ios-host-spike/`. Start from `ios-wkwebview`'s hand-written project and its `check.sh` pattern (simctl launch arguments, Darwin notifications, results in the unified log). Read [development.md](../development.md) "Mobile app" for the setup and the sandbox notes.

- **Before booting**: check that no Android emulator runs (`pgrep -fl qemu-system`). If one does, stop and report. Boot one device, `xcrun simctl shutdown all` when done.
- Questions, each answered with a measurement in the log:
  1. A `WKURLSchemeHandler` serves `langle-app://app/` (an HTML page and a JS file) to a WKWebView whose `websiteDataStore` is `WKWebsiteDataStore(forIdentifier: <fixed UUID>)`. Does the page get `indexedDB`?
     - Open a Dexie-free raw IndexedDB database, write 1,000 rows and one 20 MB blob-like `ArrayBuffer` value, and read them back.
     - Do they survive killing and relaunching the app?
  2. The same store is not the default store: after `WKWebsiteDataStore.default().removeData(ofTypes: allWebsiteDataTypes, modifiedSince: .distantPast)`, is the app store's data still there?
  3. A hidden extension-host WKWebView (in the view hierarchy, zero size, `isHidden` or alpha 0, try both) runs a `setInterval` every second for 2 minutes while another WKWebView shows a page. Are the ticks on time?
     - Then with the host **not** in the view hierarchy: are they throttled?
  4. A named `WKContentWorld("langle")` with a handler `langleBridge` added only in that world: can a page-world script see `webkit.messageHandlers.langleBridge`? It must not.
  5. Optional, if quick: the real `langle-app` build is not ready yet. Skip anything that needs it.
- **If question 1 fails**: try `loadFileURL` with a file-origin page in the same store, and record that too. Do not build a polyfill; report.
- **Deliverables**:
  - the prototype committed on `claude/mobile-s1`;
  - a section "iOS extension host spike (S1, <date>)" in [docs/notes/mobile.md](../notes/mobile.md) right after "iOS prototype", with a table of results and their limits (Simulator only);
  - a draft PR based on `claude/langle-mobile-app-build-5ac38c`, ready when done, ticking S1 here;
  - a report of the answers to 1-4.

## S2: Android spike (one agent, Opus; after S1's Simulator is shut down)
A throwaway app in `mobile/prototypes/android-host-spike/`. Start from `android-webview`, bump androidx.webkit to 1.18.0 and use its setup in [development.md](../development.md) "Mobile app" (`source scripts/mobile/env.sh`; emulator and adb with the sandbox off).

- **Before booting**: check that no iOS Simulator runs (`xcrun simctl list devices booted`). If one does, stop and report. Kill the emulator when done.
- Questions, answered on `Medium_Phone_API_37.0`:
  1. Record the WebView version, and whether `WebViewFeature.isFeatureSupported` reports `JS_INJECTION_IN_FRAME_AND_WORLD`, `MULTI_PROFILE`, `WEB_MESSAGE_LISTENER` and `DOCUMENT_START_SCRIPT`.
     - Find the lowest WebView version with `JS_INJECTION_IN_FRAME_AND_WORLD` from Chromium's source or androidx's docs, cited.
  2. With `getExecutionWorld(webView, "langle")`, `addJavaScriptOnEvent(…, INJECTION_EVENT_DOCUMENT_START, …, world)` and `addWebMessageListener(…, "langleBridge", …, world, …)` on `https://en.wikipedia.org/wiki/Language`:
     - does the Langle world's script run before the page's scripts?
     - can it post and get replies (`replyProxy`)?
     - is `window.langleBridge` undefined in the page world?
     - does the page's `window.postMessage` reach the Langle world (how `youtube-main` will talk to it)?
  3. A `ProfileStore` profile "langle" on a WebView that loads `WebViewAssetLoader` pages from an app `https` host. Does IndexedDB work (1,000 rows and a 20 MB value), and does it survive a force-stop and relaunch?
     - After `WebStorage.getInstance().deleteAllData()` and clearing cookies on the **default** profile, is the "langle" profile's data still there?
  4. A second WebView in that profile kept off screen (`View.GONE`, and also zero size but attached): does its `setInterval` keep time for 2 minutes while the main WebView plays nothing?
  5. Kill the renderer (`adb shell kill` on the sandboxed renderer's pid). Does `onRenderProcessGone` fire for **both** WebViews, and can both be recreated?
- **Deliverables**:
  - the prototype on `claude/mobile-s2`;
  - a section "Android extension host spike (S2, <date>)" in [docs/notes/mobile.md](../notes/mobile.md) right after "Android prototypes";
  - a draft PR based on `claude/langle-mobile-app-build-5ac38c`, ready when done, ticking S2 here;
  - a report of the answers.

---

## M1 and M2: the native shells (planned 2026-11-24, after M0 and S1)
Spec [mobile-app.md](../specs/mobile-app.md) "Build order" 2. Each shell has the engine implementation, the router, the key-value store, the extension host, the app origin and a minimal screen (one page and an address field). It is done when Langle runs on an article end to end. M2 (iOS) starts first. M1 (Android) starts when S2 has answered its questions 3–5, because those answers may change its storage and host tasks.

**Shape shared by both:**
- **A core without the engine**, tested on the Mac without a device:
  - envelopes (parse and produce `mobile/protocol/*.json`; `bad-version.json` is rejected);
  - the router: contexts by kind (`host`, `content` per tab and frame, `page`), the sender filled in natively, calls to a host that has not said hello wait up to 10 s and then fail with "Could not establish connection. Receiving end does not exist.";
  - the key-value store (`local` and `sync` persisted, `session` in memory). For each write: save, post `storage.onChanged` to every context, then reply to the writer. Nothing is posted when nothing changed;
  - the manifest reader: the parts of `.output/langle-app-mv3/manifest.json` the app supports (the same rules as `tests/app-manifest.test.ts`), and a refusal naming what it does not support;
  - Chrome match patterns (`<all_urls>`, `*://m.youtube.com/*`, scheme, host wildcard, path glob);
  - alarms on an injectable clock;
  - tabs: ids, the active tab, app pages opened by `tabs.create`.
  Its behaviour copies `src/app/testing/reference-native.ts`. Port the cases in `src/app/testing/reference-native.test.ts` one for one, and keep their names so the three can be compared.
- **The app**, behind `BrowsingEngine` / `Page` (spec "Engine boundary"):
  - the extension host: a hidden page in the app profile on the app origin. It loads `host.html`, a page the app writes: it sets `__langleAppInfo`, runs `langle-shim.js`, then `background.js`;
  - content scripts from the manifest: in Langle's world, `__langleAppInfo` and then `langle-shim.js` at document start, then each script's `js` at its `run_at`. `world: "MAIN"` scripts go in the page world without the shim;
  - app pages (`popup.html`, `options.html`, `wordlist.html`, `welcome.html`) open in app-origin pages with the shim in the page world;
  - the bundled build: `npm run build:app` (or `wxt build -b langle-app --mode check` for a check build, if WXT allows the two together; otherwise add a script that does) is copied into the app by one script per platform. Its output is git-ignored;
  - losing the renderer or the host's content process: recreate the host first, then reload the pages;
  - the minimal screen: an address field, back and forward, one browsing page, and a button that opens `popup.html` in a sheet. No styling beyond the system's.
- **Done when**, on the Simulator or the emulator:
  - the E2E article page (`node e2e/serve.ts`, `/article-en.html`) loads in the app, and Langle's highlights appear on it;
  - first run works: `runtime.onInstalled` opens `welcome.html`, and setup finishes (packs download);
  - a word is saved (a tap on a word opens the dictionary, as a click does on the desktop; if the tap does not reach it, set the word's state through the check build's settings channel and say so) and is still saved after the app is killed and relaunched;
  - the check build's error log (`checkErrorLog` in `storage.local`, read through the host) is empty, or each entry is fixed or explained;
  - a screenshot of the article with highlights is in the PR.
- **Devices, one at a time** (the dev Mac has 16 GB). Write and build everything first. When you reach the device steps, check that the other device is off (`pgrep -fl qemu-system`, `xcrun simctl list devices booted`), then **stop and report** that you are ready for the device. The parent resumes you when the device is free. Shut the device down when done.
- **Native tests run locally, not in `verify` or CI** (spec "Testing"). Add their commands to [development.md](../development.md) "Mobile app".
- Libraries: no new third-party libraries beyond the ones named here. Ask the parent (report and stop) before adding one.

### M2: iOS shell (one agent, Opus)
Branch `claude/mobile-m2` from `main`. Read [notes/mobile.md](../notes/mobile.md) "iOS prototype" and "iOS extension host spike (S1)", and the S1 prototype `mobile/prototypes/ios-host-spike/` (its hand-written project, scheme handler and `check.sh`).

**Files**
| Path | Responsibility |
| --- | --- |
| `mobile/ios/LangleCore/Package.swift` | Swift package, macOS 15 and iOS 26.4, no dependencies |
| `mobile/ios/LangleCore/Sources/LangleCore/` | `Envelope`, `JSONValue`, `Router`, `KeyValueStore` (persisted as one JSON file per area, written atomically, in Application Support), `Manifest`, `MatchPattern`, `Alarms`, `Tabs` |
| `mobile/ios/LangleCore/Tests/LangleCoreTests/` | XCTest: golden files (read from `../../protocol/` relative to the package, found from `#filePath`), ports of the reference-native tests, match patterns, manifest refusals |
| `mobile/ios/Langle.xcodeproj`, `mobile/ios/Langle/` | the app: SwiftUI shell, `WebKitEngine` (`BrowsingEngine` over WKWebView), `AppSchemeHandler` (`langle-app://app/` from the bundled build), `ExtensionHost`, `ContentInjector` |
| `mobile/ios/scripts/bundle-build.sh` | copies `.output/langle-app-mv3/` into the app's resources (a build phase or run before `xcodebuild`) |
| `mobile/ios/check.sh` | installs and launches on the booted Simulator and drives the checks, as S1's did |

**Tasks**
- [ ] **Core**: write the package test-first. `swift test` in `mobile/ios/LangleCore` passes on the Mac. Commit after each type.
- [ ] **Engine**: `WebKitEngine` and `WebKitPage`.
  - Browsing pages use `WKWebsiteDataStore.default()`. The host and app pages share one `WKWebsiteDataStore(forIdentifier:)` with a fixed UUID (S1).
  - Langle's world is `WKContentWorld.world(name: "langle")`. The handler `langleBridge` (a `WKScriptMessageHandler`; replies and events go back through `__langleBridgeReceive`) is added only in that world for browsing pages, and in `.page` for app-origin pages.
  - Native → script: `evaluateJavaScript("__langleBridgeReceive(…)", in: frame, in: world)` with the JSON as a string literal. Check how `src/app/bridge/native-transport.ts` expects to receive on iOS and match it.
  - The frame id is 0 for the top frame (top frame only).
- [ ] **Host**: `ExtensionHost` keeps its WKWebView in the view hierarchy (zero size, hidden; S1 measured that a detached one runs at half speed). On `webViewWebContentProcessDidTerminate` it is recreated, and then the pages reload.
- [ ] **Shell**: one window; the address field; back and forward; the Langle button opening `popup.html` in a sheet. `tabs.create` with `welcome.html` or `wordlist.html` opens them in a sheet too.
- [ ] **Builds**: `xcodebuild -project mobile/ios/Langle.xcodeproj -scheme Langle -destination 'generic/platform=iOS Simulator' build` passes. Then report and stop for the Simulator (above).
- [ ] **On the Simulator**: the "Done when" list. Use `check.sh`, the unified log and `simctl io booted screenshot`.
- [ ] **Docs**:
  - development.md "Mobile app": how to build, test and run the iOS app;
  - architecture.md: `mobile/ios/` in the code layout;
  - status.md: one line;
  - tick M2 in Progress.
- [ ] `npm run verify`, push, draft PR "Mobile app M2: iOS shell" based on `main`, then `gh pr ready`.

### M1: Android shell (one agent, Opus; after S2 answers 3–5)
Branch `claude/mobile-m1` from `main`. Read [notes/mobile.md](../notes/mobile.md) "Android prototypes" and "Android extension host spike (S2)", and `mobile/prototypes/android-host-spike/`. Gradle and the SDK set up as in [development.md](../development.md) "Mobile app" (`source scripts/mobile/env.sh`).

**Files**
| Path | Responsibility |
| --- | --- |
| `mobile/android/settings.gradle.kts`, `build.gradle.kts`, `gradlew` | the Gradle project (copy the wrapper from `mobile/prototypes/android-webview`) |
| `mobile/android/core/` | pure Kotlin/JVM module, `kotlinx-serialization-json` only: `Envelope`, `Router`, `KeyValueStore` (one JSON file per area, written atomically through a temp file and a rename), `Manifest`, `MatchPattern`, `Alarms`, `Tabs`. JUnit 5 tests: golden files from `../../protocol/`, ports of the reference-native tests, match patterns, manifest refusals |
| `mobile/android/app/` | the app: `WebViewEngine` (`BrowsingEngine` over System WebView, androidx.webkit 1.18.0), `ExtensionHost`, `ContentInjector`, the app origin (`WebViewAssetLoader` on `appassets.androidplatform.net` from the bundled build), the activity with the minimal screen |
| `mobile/android/scripts/bundle-build.sh` | copies `.output/langle-app-mv3/` into `app/src/main/assets/langle-app/` (git-ignored) |
| `mobile/android/check.sh` | installs and drives the app on the emulator, as the prototypes' scripts do |

**Tasks**
- [x] **Core**: test-first. `./gradlew :core:test` passes on the Mac without the emulator.
- [x] **Feature check**: at start, `WebViewFeature.isFeatureSupported` for `JS_INJECTION_IN_FRAME_AND_WORLD`, `WEB_MESSAGE_LISTENER`, `DOCUMENT_START_SCRIPT` and `MULTI_PROFILE`. Without them the screen says "Update Android System WebView" (through the app's string resources), browsing still works, and Langle is not injected.
- [x] **Engine**: `WebViewEngine` and `WebViewPage`.
  - Browsing pages use the default profile. The host and app pages use the `ProfileStore` profile "langle" (change this if S2 found otherwise).
  - Langle's world: `getExecutionWorld(webView, "langle")`. Scripts go in with `addJavaScriptOnEvent(…, INJECTION_EVENT_DOCUMENT_START, …, world)`. Document-end and idle scripts are queued at document start and run on `DOMContentLoaded`.
  - The listener `langleBridge` is added with `addWebMessageListener(…, world, …)` for browsing pages. For app-origin pages it is added in the page world, allowed only for the app origin.
  - Native → script: the frame's `JavaScriptReplyProxy`, kept from its first message (the hello), carries replies and events. Check `src/app/bridge/native-transport.ts`'s Android side and match it.
- [x] **Host**: `ExtensionHost` keeps its WebView attached at zero size, or as S2 found best. `onRenderProcessGone` returns true, destroys every WebView, creates the host first and then reloads the pages (spec "Losing the renderer").
- [x] **Shell**: one activity; the address field; back and forward; the Langle button opening `popup.html` in a bottom sheet. `tabs.create` with `welcome.html` or `wordlist.html` opens them the same way.
- [x] **Builds**: `./gradlew :app:assembleDebug` passes. Then report and stop for the emulator (above). The emulator's WebView must be 146.0.7680.10 or later (the user updates it from the Play Store; S2 records it).
- [x] **On the emulator**: the "Done when" list. `check.sh launch` forwards the E2E port with `adb reverse` (`10.0.2.2` did not reach it).
- [x] **Docs**:
  - development.md "Mobile app": how to build, test and run the Android app;
  - architecture.md: `mobile/android/` in the code layout;
  - status.md: one line;
  - tick M1 in Progress.
- [x] `npm run verify`, push, draft PR "Mobile app M1: Android shell" based on `main`, then `gh pr ready`.
