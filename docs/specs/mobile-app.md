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
| `i18n.getUILanguage` | the web view's language (`navigator.language`, the phone's); the first run reads it |
| `i18n.detectLanguage` | always unsure (`isReliable: false`): the web views have no detector. Articles then run only where `<html lang>` names the learning language, and every block counts as that language |
| `action.setIcon` | does nothing. `action.openPopup` opens the Langle sheet |
| `alarms` | native timers while the app runs. They are not kept across restarts: pack downloads resume at start anyway |
| `identity` | left out until own-cloud sync is built for the app (its own design: Google needs the app's OAuth clients and the system sign-in sheet). Until then the app offers no cloud provider |

Things the extension does not have (the translation host first) go into a separate `appHost` object, which pages detect by checking that it exists (`TranslatorBackend` picks the bridge provider this way, mobile-translation.md "Parts"). Its calls are `openPage`, `shareFile` and the translation host's (mobile-translation.md "The bridge"); `appHost.translator` (`{ models: "packs" | "system" }`) is a value native code puts in `__langleAppInfo` as `translator` once it has a translation host, left out before. The routers send the translation calls to one slot of the app (`onTranslation`) and answer "<api> is not available here." while it is empty; `postToHost` sends the host its `appHost.models.onProgress` events.

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
3. **M3**: the `m.youtube.com` `PlatformAdapter`, and touch in place of hover (tap → dictionary sheet, long-press selection), portrait and fullscreen landscape. This is shared TS, checked first in desktop Chromium with a phone viewport. Designed below ("M3: m.youtube.com and touch").
4. **M4**: the app's screens from the mock (Home, title bar, Langle sheet, Words, Settings, first run). Designed below ("M4: the app's screens").
5. Then, each with its own short design pass where the notes leave a decision open: the translation hosts (M5; mobile-translation.md "Build order" 3), ad blocking (M6, below), own-cloud sync in the app (M7), Share / Open with (M8), and last the release checks on a real iPhone (M9; the user's decision, 2026-11-26: every milestone that needs no real device comes first).

## M3: m.youtube.com and touch (approved with the user on 2026-11-24)
What the phone shows is [ui.md](ui.md) "Mobile app" and the mock's `Mobile app` page. This section is how the shared TS gets there.

### Decisions (the user's choices, 2026-11-24)
- **Every build gets the m.youtube.com scripts** (Chrome, Firefox and `langle-app`). The article script already matches `<all_urls>`, so no new permission is asked. Desktop Chromium with a phone viewport runs the ordinary extension, and Firefox for Android gets it later for free. `www.youtube.com` on the desktop behaves as before.
- **Fullscreen landscape is part of M3**: the subtitle over the video, the dictionary as a panel at the right, and the transcript column (Left or Right).
- **The phone has its own subtitle settings**, synced like the others: `phoneSubtitlePosition` (`belowVideo` by default) and `phoneFullscreenTranscript` (`off` by default, or `left` / `right`). The phone layout reads these. Desktop changes do not move the phone, and phone changes do not move the desktop.
- Not in M3: Shorts and comments on m.youtube.com (not in the mock). A `/shorts/` URL on m.youtube.com runs nothing.

### The adapter
- `createYouTubeAdapter(layout, options)`. The part that does not depend on the page's layout is shared:
  - the caption capture (`page.ts` in the page's world, unchanged on m.youtube.com: notes "Checked: captions on the mobile site"), `tracks`, `loadCaptions`;
  - `seek`, `pause`, `play`, `adShowing`, `hideSiteCaptions`;
  - `videoId` and `url()`. `url()` stays `https://www.youtube.com/watch?v=<id>`, so a word met on the phone and on the desktop has the same source.
- `YouTubeLayout` holds the page's structure: the player, the title, the insertion points (`controlsPoint`, `belowVideoElement`, `sideColumn`), the fullscreen box and the layers beside it (`fillsWindow`, `narrowPlayer`, `fullscreenLayers`), Shorts (`vertical`, `besidePlayer`) and `onNavigate`.
  - `desktopLayout` is today's code.
  - `mobileLayout` is measured on the real site first: the DOM points, the navigation signal, whether the player stays pinned while the page scrolls, the fullscreen element, and the ad and caption classes (notes/mobile.md).
- Entrypoints: `youtube.content.ts` (www, desktop layout, not in the app) as now, and a new `youtube-mobile.content.ts` (m.youtube.com, mobile layout, every build) that runs only the video part. The page-world hook runs on both hosts. The manifest's `matches` picks the layout, not a host check in code.

### Touch in place of hover
- **Touch mode** is `matchMedia("(hover: none) and (pointer: coarse)")` (a page whose primary pointer cannot hover), watched for changes and passed in as a dependency so tests can set it. A desktop with a mouse is never in touch mode, so its code path does not change.
- **Gestures**: a pure recognizer over touch pointer events:
  - **tap**: released within 500 ms and moved less than 10 px. It goes where a click goes (`click(ref)`), so the dictionary opens;
  - **long-press**: held for 500 ms within 10 px;
  - **scroll**: moved first. It does nothing.
- In touch mode there is no hover card.
- **Long-press selection**:
  - **Subtitles and the transcript** (Langle's own text): a Langle gesture, long-press and then drag. Whole words (2–8) are snapped as the finger moves. The text has `-webkit-touch-callout: none`, so the system's menu does not show, and `user-select: none` at rest; it is selectable only while Langle's selection is in it (WebKit on iOS takes a long-press on selectable text over: the page gets no release, notes/mobile.md "Device checks (M3d)").
  - **Articles**: the phone's own selection. When it settles it is snapped to words. 1–8 words open the sheet ("Selected · not saved"). More than 8 stay the phone's selection, for copying.
  - **A word inside a link**: a tap follows the link, and a long-press opens its sheet, with the link's own menu kept away: `contextmenu` is prevented (Android), and in touch mode links get `-webkit-touch-callout: none` and `user-select: none` (iOS fires no `contextmenu`; its menu and preview take the touch over, and without them its long-press would select text in the sheet under the finger).
- The video pauses while a selection or the sheet is open, through the existing hold.

### The dictionary sheet
- The same `DictionaryWindow` content in another frame: `Sheet` in touch mode, `Floating` (today's window) on the desktop.
- `Sheet` has a grab handle. A swipe up gives it the full height; a swipe down or × closes it; a tap on another word switches it.
- Where it goes:
  - portrait YouTube: its top is the subtitle's bottom, so the sentence stays in view;
  - articles: the page scrolls so the word stays above it;
  - fullscreen landscape: a white panel at the right, 300 px wide. The subtitle keeps its place and width;
  - with the transcript column: inside the column, in its dark colors, with "‹ Transcript" to go back.

### The watch page on a phone
- **Portrait**:
  - Langle's subtitle sits below the video by default (larger text and its translation), then the transcript (the playing cue marked, auto-scroll, a fold button), where YouTube's metadata would start. YouTube's page continues under them.
  - If the player stays pinned while the page scrolls, the subtitle stays pinned under it.
  - **A general placement rule**: on a page with no side column, the transcript goes below the video, after the subtitle.
  - There is no L or ^ on the player. L is in the app's title bar (M4); until then it is the M1/M2 shells' button.
- **Fullscreen landscape**:
  - the subtitle over the video, and L at the top right. L opens the Langle sheet (`action.openPopup` through the background);
  - with `phoneFullscreenTranscript` set to Left or Right, the transcript takes a 300 px column on that side, 16 px from the top and bottom, rounded and dark. The video shrinks beside it (`narrowPlayer`), never covered, and so do the site's layers that cover the whole screen beside the player's box (m.youtube.com's controls; `fullscreenLayers`).
- **The WebViews' fullscreen** is measured on each device first: Android's `WebChromeClient.onShowCustomView`, and iOS's `WKPreferences.isElementFullscreenEnabled`. The shells get what keeps Langle's overlay inside the page's element fullscreen.
  - If the iPhone offers only the video's native fullscreen (Langle cannot draw over it), the fallback is the app's own fullscreen: landscape, bars hidden, the player filling the page. That fallback is brought back to the user before it is built.
- The controls for the two phone settings are in the Langle sheet (M4). In M3 they are set through the check build's settings channel.

### Testing
- **Vitest (unit and browser)**:
  - the recognizer;
  - touch mode against hover mode;
  - `Sheet`;
  - `mobileLayout` against a DOM fixture made from the measurement;
  - the placement rule;
  - the two settings.
- **E2E**: a Playwright project `phone` (Chromium; 390 × 844, `isMobile`, `hasTouch`, an Android Chrome user agent) on the article fixture and a fake m.youtube.com (from `tests/fake-youtube-player.ts`). It covers tap, long-press, save, the subtitle below the video, the transcript, and fullscreen. The desktop E2E passing unchanged shows the desktop did not change.
- **The real site in desktop Chromium**: a script runs the check build with the phone viewport on m.youtube.com (the TED baseline and one auto-caption video) and reads the error log.
- **On the emulator, then the Simulator** (one at a time), with the real m.youtube.com and an article in the app:
  - highlights in the subtitle;
  - a tap opens the sheet, and a long-press selects a phrase;
  - a saved word survives a restart;
  - fullscreen landscape with and without the transcript column;
  - the error log is empty;
  - screenshots compared with the mock.

## M4: the app's screens (approved with the user on 2026-11-25)
What the phone shows is [ui.md](ui.md) "Mobile app" and the mock's `Mobile app` page. This section is how the shared TS and the shells get there.

### Decisions (the user's choices, 2026-11-25)
- **Words, Settings and the first run are drawn in the mock first** (M4-0) and reviewed by the user before they are built. Home, the title bar and the Langle sheet are already drawn and are built meanwhile.
- **Continue and Sites on Home come from a store of recent pages, kept only in the app**: the URL, title, site and, on a video, its position and length. Recorded only where `appHost` exists (feature detection), kept on the phone, never synced, at most 50 pages. Nothing is recorded on the desktop.
- **"Saved on this phone"**: in the app `storage.sync` is never synced, so the app says "Saved on this phone · {when}" where the extension names its browser's sync. Settings leaves out the browser-sync switch and the cloud-sync rows (the app offers no cloud provider yet, "Shim surface": `identity`), and the first run says the data stays on the phone. Once own-cloud sync is built for the app, the line names the provider as the mock does ("Saved to Google Drive").

### Phone layouts of the shared pages
- One component per page, as now. Its phone layout is chosen by the page itself, by touch mode (`(hover: none) and (pointer: coarse)`, as in M3), never by the build target. Firefox for Android's popup gets it for free.
- **The Langle sheet** (`popup.html`) in the phone layout: the window's full width (no 360 px), touch targets of 44 px, switches 52 × 32, sections as in `MobileLangleSheet`:
  - header (mark, Langle, the pair, word list, settings, "Use Langle"); On this site;
  - on a video, **Subtitles**: Subtitle position Below video / In video (`phoneSubtitlePosition`), Show dual subtitles (`subtitleTranslation`), Show transcript, Transcript in fullscreen Off / Left / Right (`phoneFullscreenTranscript`), Text size (`subtitleSize`), Background (`subtitleOpacity`, only with In video). Only the two `phone*` settings are the phone's own (M3); the others are the desktop's;
  - This page / This video (Show words on this page on articles, Mark all as Learning / Known, Undo); Highlight chips; counts and the saved line.
- **Words** (`wordlist.html`) and **Settings** (`options.html`) keep their data and sections; the phone layout changes only the frame, as drawn in M4-0 (Words: the list, then a word's details; Settings: the list of sections, then one section).
- **First run** (`welcome.html`): the same steps (consent, languages, start), laid out as drawn in M4-0.

### Browser differences
- `BrowserEnv` gets `sync: { kind: "browser", browser } | { kind: "device" }` in place of `syncName`. `device` is chosen where `appHost` exists. Every string that names the browser's sync has a `device` counterpart ("Saved on this phone · {when}"; the first run's line on what is sent). Rows that only make sense with a browser's sync are left out with `device`.

### Home (`home.html`, `langle-app` only)
- As `MobileStart`: the mark, Langle and the pair; the search field; counts (Learning, Known, Phrases) and the saved line; Continue; Sites.
- **The search field**: text that parses as an address (a scheme, or a dot and no space) opens it (`https://` added); anything else opens `https://m.youtube.com/results?search_query=…`. It asks the shell to open the page (`appHost.openPage(url)`).
- **Continue**: the recent pages, newest first (at most 10 shown). A video shows its thumbnail (`i.ytimg.com/vi/<id>/mqdefault.jpg`), its progress bar and "Channel · 4:12 of 9:30"; an article its icon and "Site · Yesterday".
- **Sites**: YouTube first, then the sites of the recent pages, the most opened first (four tiles at most).
- **The recents store**: a Dexie table `recents` (key: the normalized URL; `url`, `title`, `site`, `kind: "video" | "page"`, `channel?`, `position?`, `duration?`, `openedAt`, `opens`). Content scripts report `recentsVisit` on load and `recentsProgress` on a video every 10 s and on pause and leaving; the background keeps the newest 50. Messages are sent only where `appHost` exists, and the background handles them only there.

### The shells (native)
- **Screens**: Home, Words and Settings are app-origin pages under a native tab bar (Home · Words · Settings). The tab bar shows only on them.
- **A page opens over Home** (the search, Continue, a site, a link from Words): the tab bar hides and the **title bar** shows: ‹ (Home) · the page's title and its site on two lines · L · ⋮.
  - The site is `og:site_name` (read by a named command when the page has loaded), else the host without `www.` / `m.`.
  - A tap on the title edits the search or address in place.
  - ⋮: Forward, Share (the system's share sheet), Copy link, Open in another browser (browsers only, not the link's own app).
  - The bar slides away when the page scrolls down (`onScroll(dy)`) or a Langle sheet opens, and comes back when it scrolls up.
- **One browsing page.** ‹ shows Home and keeps the page (its media paused by a named command); Continue's first row is that page and shows it again at once (Home lists a page by its canonical address, so either address counts as the kept page). Opening another page loads it into the same page. Back (the edge swipe on iOS, system back on Android) goes back in the page's history, and from its first entry to Home.
- **L** opens the Langle sheet (`popup.html`) in the native sheet frame. In landscape the frame is at most 520 px wide, centred (M3's open item). The sheet's word list and settings buttons switch to the Words and Settings tabs (`tabs.create` with `wordlist.html`, `runtime.openOptionsPage`), and the sheet closes.
- **First run**: `runtime.onInstalled` opens `welcome.html` full screen, without the tab bar; when setup is done it shows Home. Before setup, Words and Settings send their page to `welcome.html`: the shell opens the first run in its own tab in place of it (full screen, as from Home's "Review and agree") and makes the tab's page again the next time the tab shows.
- M1/M2's address row and Langle button go.
- **Files (M4f)**: the pages have no downloads. Every export (Words' Anki, CSV and Backup, Settings' Backup) saves through `saveFile`, which in the app calls `appHost.shareFile({name, mime, text})`: the shell writes the file under its name and shows the system's share sheet (Save to Files, Drive, mail …), answering once it shows. Android's sheet also offers **Save to device** (the system's save dialog, `ACTION_CREATE_DOCUMENT`, then the file's bytes to the chosen place), since no share target saves to the phone itself without a file manager app: a chip of the app's own above the targets on Android 14 and later (`EXTRA_CHOOSER_CUSTOM_ACTIONS`), the first target before that (`EXTRA_INITIAL_INTENTS`). Backing out of the dialog does nothing; a failed write shows a toast. Import keeps its `<input type=file>`: Android answers it with the system's document picker for the input's `accept` types (extensions through the system's table) plus the loose types such a file often arrives under (`application/octet-stream` for any, `text/plain` for a text format such as JSON); the page checks what it reads. iOS answers it with WebKit's own picker, which types files by their extension.

### Testing
- **Vitest (browser)**: the sheet's phone layout and the two phone settings; `BrowserEnv` (`browser` unchanged, `device` with `appHost`); Home (search parsing, Continue, Sites); the recents store and its messages (nothing sent or kept without `appHost`); Words, Settings and the first run in the phone layout.
- **E2E** (`phone` project): Home → search → a page → L → the sheet's subtitle settings change the page.
- **Native**: JUnit and XCTest for the site name, back's order (history, then Home), and switching tabs from the sheet.
- **On the emulator, then the Simulator** (one at a time): first run → Home → a video and an article → the sheet → Words and Settings → back to Home and Continue; screenshots next to the mock's boards; the error log empty.

## M6: ad blocking (designed with the user on 2026-11-26)
The app is the browser, so blocking runs in the shells, outside any extension API (as Brave does on both stores). Background: [notes/mobile.md](../notes/mobile.md) "Ad blocking" and the prototypes. The desktop extension is unchanged.

### Decisions (the user's choices, 2026-11-26)
- **Engine: Brave's adblock-rust** (MPL-2.0) in both shells, after a short spike (S3) that measures what it adds to the APK and the app, how long a list update takes on the emulator and the Simulator, and whether its WebKit conversion fits WebKit's limits. If the spike fails, the fallback (lists parsed and converted in TS, small matchers in Kotlin) goes back to the user.
- **Lists: EasyList, EasyPrivacy and uBlock filters** (uBO's `filters.txt`, `quick-fixes.txt` and `unbreak.txt`; YouTube's rules are there). Data, credited in About's notices with their licences.
- **Fetched from the lists' own homes**: first at Start (with the language packs; nothing is fetched before the user agrees), then when the app is in use and a list is past its own `! Expires:` (4 days when it names none), as a conditional request (`ETag` / `Last-Modified`). No mirror of ours, no copy in the app. Until the first fetch succeeds, nothing is blocked.
- **YouTube's video ads: scriptlets of our own**, with uBO's names and arguments, shipped in the app. The downloaded lists say which scriptlet runs where and with which arguments, so most YouTube changes are followed by a list update, without an app update.
- **Switches: the title bar's ⋮ and Settings.** ⋮ gets "Block ads on this site"; Settings gets an "Ad blocking" section. On by default. Nothing counts or shows what was blocked. Drawn in the mock first (M6-0) and reviewed by the user.

### Parts
- **`mobile/adblock/`**: a small Rust crate over adblock-rust (pinned at 0.13.6), with a C interface (`include/langle_adblock.h`, which is the contract): build an engine from the lists' texts and serialize it; load a serialized engine with the scriptlet resources; `check(url, pageUrl, type) → block | allow`; `cosmetic(pageUrl) → { css, scriptlets, generichide, exceptions }`; `hiddenClassIdCss({ classes, ids, exceptions }) → css`; `webkitRules(lists) → JSON`; `site(url) → registrable domain`. Built by `npm run mobile:adblock` (as `mobile:bergamot`: not committed, the app builds fail without it) into a `.so` per Android ABI (arm64-v8a, x86_64 for the emulator) and an iOS XCFramework (device and Simulator). Measured in M6a (notes/mobile.md "adblock-rust (M6a)").
  - An engine is thread-safe (built without adblock-rust's `single-thread`): Android's `shouldInterceptRequest` calls `check` from several threads at once.
  - The scriptlets' script is a function body: the shells wrap it, `(function(){` … `})();`, and inject it in the page's world.
  - EasyList's generic hiding is mostly plain `##.class` / `###id` rules, which adblock-rust gives only for the classes and ids a page has: the shells' document-start script collects them (and those of added nodes) and asks `hiddenClassIdCss`, unless `generichide`.
  - Procedural rules become CSS only when they are one CSS selector with no action, `:remove()` or `:style(…)`; the others (`:has-text`, `:upward` …) are skipped. `webkitRules` converts network rules only; cosmetics come from the engine on iOS too.
  - Android: the C interface needs a thin JNI layer (M6c-android). iOS: Swift imports the module `LangleAdblock`.
- **The list store** (native, one per shell, same rules): the three lists' URLs and fallbacks in `mobile/protocol/filter-lists.json`, shared by both shells. Each list's text, `ETag`, `Last-Modified` and fetch time are kept in the app's files. After any list changes, the engine is built again off the main thread and swapped in when ready; a failed fetch or build keeps the engine in use and writes an error-log entry.
- **Requests**:
  - Android: `shouldInterceptRequest` asks the engine for every subresource of the browsing profile. The main frame is never blocked. WebView gives no resource type, so it is read from the request's `Accept` header and the URL's extension (else `other`). A blocked request gets an empty response.
  - iOS: the converted rules as `WKContentRuleList`s (split where a list passes WebKit's rule limit), compiled by `WKContentRuleListStore` and cached by the lists' versions; no per-request code.
- **Elements and scriptlets**: when a page starts, the shell asks the engine for the page's `cosmetic` resources and injects them at document start: the stylesheet with `insertStyleSheet`, the scriptlets as a script in the page's world (`addUserScript(…, world: Page, runAt: Start)`). On iOS the user scripts are set when the main frame's navigation is decided, before it commits.
- **Scriptlets** (`src/app/adblock/scriptlets/`, one TS file each, written from uBO's wiki, not copied from uBO: its code is GPLv3): those the lists' youtube.com rules use, and those more than about 50 rules use (counts: notes/mobile.md "Scriptlets used by the lists (M6b, 2026-11-26)"; `node scripts/mobile/scriptlets-used.ts` counts them again). Each answers to uBO's name and aliases:
  - youtube.com's: `json-prune`, `json-prune-fetch-response`, `json-prune-xhr-response`, `json-edit-fetch-response`, `set-constant`, `adjust-setTimeout`, `remove-node-text`, `trusted-edit-inbound-object`, `trusted-replace-fetch-response`, `trusted-replace-xhr-response`, `trusted-replace-node-text`, `trusted-prevent-dom-bypass`.
  - The most used elsewhere: `abort-on-property-read`, `abort-on-property-write`, `abort-current-script`, `addEventListener-defuser`, `prevent-setTimeout`, `prevent-window-open`, `adjust-setInterval`.
  - The build bundles each into the `langle-app` output's `adblock/resources.json`, in adblock-rust's resource format (`scripts/adblock-resources.ts`, which pins the version read): a function-style resource, so the engine's script defines one function per scriptlet and calls it per rule. The shells run that script inside a function of their own, so the functions stay off the page's globals.
  - The `trusted-*` scriptlets carry a permission bit; only the lists `filter-lists.json` marks `trusted` (uBO's three) are parsed with it, as uBO allows them only in its own lists.
  - A rule naming a scriptlet we do not have is skipped (an info entry in check builds). EasyList has no `+js` rules (its snippets are Adblock Plus's `#$#`, which adblock-rust does not run).
- **Langle's captions on YouTube**: the scriptlets remove only the ad fields of the player response (`adPlacements`, `playerAds`, `adSlots`; m.youtube.com's rules leave `adBreakHeartbeatParams`); Langle's page script reads `captions` through `getPlayerResponse()` as before. Both run in the page's world at document start; the order between them does not matter, as each reads the response when the player builds it.
- **The switches**: stored in the app's `storage.local` as `adBlocking: { on, offSites }` (not synced; the desktop has no use for it). A site is the page's registrable domain (the engine's public-suffix list). The shells read the key from their key-value store and follow `storage.onChanged`. Turning blocking off or on for the page's site reloads the page.
  - ⋮ "Block ads on this site": a switch, shown on every page while `on` is true.
  - Settings › Ad blocking (`options.html`, only where `appHost` exists): "Block ads" (`on`), the sites where it is off (each with Remove), and when the lists were last updated (the list store writes `adBlockingLists: { updatedAt }`).
- **Failures**: YouTube's warnings or a stopped player are not acted on by the app; the user turns blocking off for youtube.com with ⋮. Ads stitched into the video stream on the server are not removed.
- **Privacy**: the site's privacy page names the lists' hosts.

### Testing
- **Rust**: `cargo test` for the crate's interface (build, serialize and load, `check`, `cosmetic`, `webkitRules`) on small fixed lists.
- **Vitest (browser)**: each scriptlet on fixed inputs; the m.youtube.com fixture's player response with ad fields and captions, run through `json-prune` with the arguments of the list's own youtube.com rule (a pinned copy in the fixtures): the ad fields are gone, and the adapter's caption capture still finds the track. The Settings section with a fake `appHost`.
- **Native**: JUnit and XCTest for the list store (expiry, conditional requests, a failed fetch keeps the old list, the engine swapped only when built), the resource-type guess (Android), and the switches (a site's reload, `on` false removes every rule).
- **On the emulator, then the Simulator** (one at a time): two articles in each of English, French and German with ads, before and after (requests to ad hosts, screenshots); the TED baseline and one auto-caption video on m.youtube.com: no ad, subtitles shown, no warning; ⋮ off and on for a site; a list update with an unchanged `ETag`; Settings' section; the error log read and cleared.
