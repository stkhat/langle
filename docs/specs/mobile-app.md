# Mobile app: extension host, API shim and engine boundary

How the phone app runs Langle's extension code on `m.youtube.com` and web articles. Approved with the user on 2026-11-24. The background is in [docs/notes/mobile.md](../notes/mobile.md) ("Decided", "Android engine", "Open issues and risks" 3). Translation is in [mobile-translation.md](mobile-translation.md), and the screens are in [ui.md](ui.md) "Mobile app".

## Decisions
- **The app is a small extension host** (the user's choice, 2026-11-24). WXT builds a `langle-app` target. The app reads that build's `manifest.json` and injects its content scripts as its `matches`, `world` and `run_at` say. Every `browser.*` call goes through a shim over one native bridge. The background runs unchanged in a hidden WebView that the app owns. Rejected:
  - running the background in a bare JS engine with an IndexedDB polyfill (it needs a bundled engine on Android, and the polyfill risks speed and compatibility);
  - rewriting the stores natively (a second and third copy of the handlers).
- **Android needs isolated worlds** (the user's choice, 2026-11-24): androidx.webkit 1.16 or later and a System WebView with `JS_INJECTION_IN_FRAME_AND_WORLD`. Without it the app says "Update Android System WebView" and Langle does not run on pages. Browsing still works.
- **The app's screens are web UI in a thin native shell** (the user's choice, 2026-11-24):
  - Home, Words, Settings and the Langle sheet are Preact pages in WebViews on the app's own origin. They reuse the extension's pages, with phone layouts.
  - Native code draws only the tab bar, the title bar, the frames of the sheets, and the share and open-with entries.

## Parts
```
langle-app build (WXT, -b langle-app): manifest.json, background.js, content scripts, pages
                                    │ bundled into the app as files of the app origin
Native (Kotlin / Swift), behind three boundaries (notes: "Android engine")
├ BrowsingEngine          boundary 1: pages, injection, messages by world, blocking
│   ├ Android: System WebView     (a GeckoView implementation can replace it)
│   └ iOS: WKWebView
├ BridgeRouter            boundary 3: one JSON envelope format, shared by TS, Kotlin and Swift
│   ├ runtime messaging   content scripts / pages ⇄ extension host
│   ├ storage             native key-value store (local, sync, session) + onChanged fan-out
│   ├ tabs, action        mapped onto the app's pages and sheets
│   ├ alarms              native timers (while the app runs)
│   └ app services        translation host, later AI and sign-in (feature-detected)
├ ExtensionHost           hidden WebView running background.js on the app origin
├ AppOrigin               serves the bundled build and the app's files (models) to app WebViews
└ AppStore (boundary 2)   the extension host's data store and the key-value store, kept apart
                          from browsing data (the profile pages browse with)
```

### The `langle-app` build target
- WXT's `-b langle-app` (MV3). Entrypoints pick targets with `include` / `exclude`:
  - the app gets `background`, `content` (articles), the YouTube content scripts with `matches: ["*://m.youtube.com/*"]`, and the pages: popup → the Langle sheet, options → Settings, wordlist → Words, welcome → first run;
  - Netflix is excluded.
- `npm run build:app` writes `.output/langle-app-mv3/`. The Android and iOS builds copy it into their assets. The app reads only the parts of `manifest.json` that it supports (below) and refuses a build that uses anything else.
- `wxt/browser` resolves `globalThis.browser` when it has `runtime.id`. The shim defines it before any bundle runs, so the extension code compiles and runs unchanged.

### Contexts
| Context | Engine | World | Shim |
|---|---|---|---|
| A page's top frame: Langle's content scripts | the page's WebView | Langle's isolated world | full |
| A page's top frame: MAIN-world scripts (`youtube-main`) | the page's WebView | the page's world | none (they talk to the isolated script with `postMessage`, as today) |
| Extension host | hidden WebView, app origin, app data store | page world (the app owns it) | full |
| App pages (sheet, Settings, Words, first run) | WebViews on the app origin, app data store | page world | full |

- Only the background opens IndexedDB (checked 2026-11-24). It stays in the extension host's data store, which is not the browsing profile:
  - iOS: its own `WKWebsiteDataStore(forIdentifier:)`;
  - Android: a `ProfileStore` profile of its own.
  Clearing browsing data, or a later switch of the page engine, leaves terms, settings and packs alone (boundary 2).
- The app origin:
  - iOS: a custom scheme served by `WKURLSchemeHandler` (`langle-app://app/`);
  - Android: `WebViewAssetLoader` on an `https` host the app intercepts.
  `runtime.getURL` returns URLs on it.

## Bridge protocol (boundary 3)
JSON envelopes, the same on both platforms and independent of the engine. They are defined in `src/app/bridge/protocol.ts` and checked against shared golden files in `mobile/protocol/` by the TS tests, JUnit and XCTest.

```
call   { v: 1, kind: "call",  id, api: "storage.local.get" | "runtime.sendMessage" | …, args }
reply  { v: 1, kind: "reply", id, ok: true, value } | { …, ok: false, error: { message } }
event  { v: 1, kind: "event", api: "storage.onChanged" | "runtime.onMessage" | "alarms.onAlarm" | …, args, replyId? }
```

- **The sender is filled in by native code** (its tab id, its frame, its URL as the engine reports it), never taken from the envelope.
- **Only Langle's scripts can reach the bridge**:
  - iOS registers its `WKScriptMessageHandler` only in Langle's named `WKContentWorld`.
  - Android registers its listener with `addWebMessageListener(…, world, …)` and injects with `addJavaScriptOnEvent(…, INJECTION_EVENT_DOCUMENT_START, …, world)`. Listeners are keyed by name and world (androidx.webkit 1.16).
  - App-origin WebViews load nothing else, so their page world is Langle's.
- **`runtime.onMessage` replies**: the receiver answers through `sendResponse` or a returned Promise. The shim sends a `reply` with the call's id. When no listener answered, the error is "Receiving end does not exist", so `messaging/client.ts`'s retry rules work unchanged.
- **Storage order**: native code writes one change at a time. For each one it saves the change, posts `storage.onChanged` to every context, and only then replies to the writer. `createSettingsView` relies on this order (architecture: "Changing settings").

## Shim surface
Only what Langle calls (counted 2026-11-24). Anything else is left `undefined`, so feature detection hides what depends on it.

| API | In the app |
|---|---|
| `runtime.id`, `getURL`, `getManifest` | the app's values |
| `runtime.sendMessage`, `onMessage` | through the router. Content scripts and pages reach the extension host, and the host reaches pages through `tabs.sendMessage` |
| `runtime.onInstalled`, `onStartup` | sent by the host at start: `install` on the first run, `update` when the bundled build changes, `onStartup` otherwise |
| `runtime.openOptionsPage` | opens the Settings tab |
| `runtime.reload` | reloads the extension host (check builds) |
| `storage.local`, `storage.sync`, `storage.session`, `onChanged` | native key-value store. `sync` is stored but never synced, which is what signed-out Chrome does: the UI already says "Saved". `session` lives in memory and is cleared when the process starts |
| `tabs.query`, `get`, `sendMessage`, `create`, `update`, `remove`, `reload` | tabs are the app's pages. `active` is the page on screen. `create` with an app-origin URL opens the matching screen (welcome → first run, wordlist → Words) |
| `windows.update` | does nothing (one window) |
| `action.setIcon` | does nothing. `action.openPopup` opens the Langle sheet |
| `alarms` | native timers while the app runs. They are not kept across restarts: pack downloads resume at start anyway |
| `identity` | left out until own-cloud sync is built for the app (its own design: Google needs the app's OAuth clients and the system sign-in sheet). Until then the app offers no cloud provider |

Things the extension does not have (the translation host first) go into a separate `appHost` object, which pages detect by checking that it exists (`TranslatorBackend` picks the bridge provider this way, mobile-translation.md "Parts").

## Engine boundary (boundary 1)
One interface per platform, with the same shape in Kotlin and Swift. WebView and WebKit types stay behind it.

```
BrowsingEngine
  createPage(profile: Browsing | App, delegate) → Page
Page
  load(url), reload(), stop(), goBack(), goForward()
  addUserScript(source, world: Page | Langle, runAt: Start | End, frames: Top)  // before load
  postMessage(world, frameId, json)                 // native → scripts
  delegate.onMessage(world, frameId, frameUrl, json) // scripts → native
  setBlocker(RequestBlocker); insertStyleSheet(css)  // ad blocking milestone
  evaluate(world, source)                            // named commands only, as in the prototypes
  delegate: onNavigation(url, title, canGoBack, canGoForward), onScroll(dy), onProcessGone()
```

- The router, the key-value store, the extension host, tab bookkeeping and the app's screens depend only on this interface.
- `run_at: document_idle` scripts are injected at document end.
- **Losing the renderer**: the app creates the extension host again first, then reloads the pages, as a browser restores a crashed tab. Calls that were waiting fail with "Receiving end does not exist", and the client sends the repeatable ones again. On Android renderers are per profile, not per process ([notes/mobile.md](../notes/mobile.md) "Android extension host spike (S2)"): when the "langle" profile's renderer is lost, the app creates the host again first, then the app pages; when a browsing page's renderer is lost, only that page is created again and reloaded.
- **iOS**: the hidden extension host is kept in the view hierarchy (invisible, zero size), so WebKit does not suspend it while the app is on screen. Whether that is needed is spike S1 below.

## Failures
- **A bad envelope** (wrong version, unknown API, bad shape) is answered with an error and logged. It never crashes the app.
- **An extension host still starting**: calls wait for its ready signal (at most 10 seconds) before they are answered with "Receiving end does not exist".
- **A build mismatch** (the manifest asks for something the app does not support): the app refuses to start Langle, and the check build logs why.

## Testing
Follows [testing.md](../testing.md).

- **Shim** (Vitest unit and browser tests) with a fake native side:
  - every API in the table;
  - `onChanged` comes before the writer's reply;
  - no listener gives "Receiving end does not exist";
  - the client's retries over a host restart.
- **Golden envelopes** in `mobile/protocol/`, parsed and produced by TS, JUnit and XCTest.
- **Native** unit tests:
  - JUnit: the router, the key-value store, match patterns, manifest reading, recreating the host;
  - XCTest: the same.
- **On the emulator and the Simulator**: the E2E article fixture loads in the app, its highlights appear, a word is saved and survives an app restart, and the check build's error log is empty.
- **CI**: the native tests run locally for now, as in mobile-translation.md.

## Spikes before building
Throwaway, in `mobile/prototypes/`. Each one ends in a recorded result in notes/mobile.md.

- **S1 (iOS)**:
  - Does IndexedDB work on a `WKURLSchemeHandler` origin in a `WKWebsiteDataStore(forIdentifier:)` store, and does it persist across launches?
  - Does a hidden extension-host WebView keep running?
  - If IndexedDB does not work, the background's `indexedDB` is replaced by a polyfill over native SQLite, and the change is brought back to the user.
- **S2 (Android)**, on the emulator's WebView:
  - `JS_INJECTION_IN_FRAME_AND_WORLD` and `MULTI_PROFILE` are supported;
  - a listener in Langle's world cannot be seen from the page's world;
  - IndexedDB persists in a separate profile on the `WebViewAssetLoader` origin;
  - record the lowest WebView version with these features.

## Build order
Each milestone has its own branch and its own draft PR. At most three subagents run at once.

1. **M0**: the `langle-app` target, the bridge protocol and golden files, and the shim with its tests (shared TS). S1 and S2 run alongside it.
2. **M1 Android shell** and **M2 iOS shell**, in parallel. Each one has the engine implementation, the router, the key-value store, the extension host, the app origin, and a minimal screen (one page and an address field). It is done when Langle runs on an article end to end.
3. **M3**: the `m.youtube.com` `PlatformAdapter`, and touch in place of hover (tap → dictionary sheet, long-press selection). This is shared TS, checked first in desktop Chromium with a phone viewport.
4. **M4**: the app's screens from the mock (Home, title bar, Langle sheet, Words, Settings, first run).
5. Then the translation hosts (mobile-translation.md "Build order" 3), ad blocking, own-cloud sync in the app, Share / Open with, and the release checks already listed in the notes. Each one gets its own short design pass where the notes leave a decision open.
