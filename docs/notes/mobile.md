# Mobile (iOS / Android): direction (investigated 2026-11-12 to 11-13)

Not part of any phase yet. A record of what was considered for bringing Langle to phones, what was chosen, and what is still unverified.

## Decided
- **Build our own browser app.** YouTube and articles open as ordinary web pages, and the extension's scripts are injected into them.
  - A general-purpose browser (any site, URL bar), so articles work too and the app is not "a YouTube wrapper" in store review.
- **Targets: YouTube (`m.youtube.com`) and web articles.** Netflix is out: DRM licenses go only to Netflix's own apps and supported browsers, and mobile browsers are sent to the app.
- **Android engine: System WebView** (the user's decision, 2026-11-22, risks accepted), behind a boundary that allows a later switch to GeckoView. See "Android engine" below.
- **Translation order: a human track, then YouTube's translation (`tlang`), then on-device translation for a video where that fails** (the user's decision, 2026-11-22). The rest of the translation design is open: see "Open issues and risks" 4.
- **Android on-device translator: Mozilla's models on Bergamot's WebAssembly build** (2026-11-22, by criteria the user approved before the measurement; measured on English→Japanese only). Because of its memory use it is **loaded only when used** (the user's decision, 2026-11-22): started for a video whose `tlang` fails and, since 2026-11-23 (the user's decision), when a tapped word, phrase or selection needs a translation; lists never start it (they show kept translations or the English). Its worker is ended 60 seconds after the last translation, and at once when the app leaves the screen (the user's decision, 2026-11-23; 60 seconds is not measured and is tuned on the real phone). The WebAssembly build stays although it missed the speed criterion in one run on one emulated core during playback (the user's decision, 2026-11-23). **Before release it is measured on a real low-end phone during playback**: if it misses 95% of sentences within 1 second there, a native build is discussed. See "Android on-device translators" below.
- **Sentence cards without `tlang` keep the extension's rules** (`asrSentenceCards`; the user's decision, 2026-11-23). Their translation quality is measured on real content once built.
- **iOS on-device translator on Apple Intelligence devices: Apple's Translation framework, `highFidelity`** (2026-11-23, by criteria the user approved before the judging; English→Japanese on a Mac only, speed on a real iPhone is a condition before release). Devices without Apple Intelligence get Apple's traditional models (`lowLatency`), which are judged later, at the real-iPhone check before release (the user's decision, 2026-11-23). See "Apple's translator on the same set" below.
- **iOS releases its translation session by the same rule as Android**: 60 seconds after the last translation, and at once when the app leaves the screen (the user's decision, 2026-11-23).
- **The lowest iOS version: 26.4** (the user's decision, 2026-11-23): the strategy can be named, and installed languages translate without a view. Downloading a language still needs a SwiftUI view. See "The lowest iOS version" below.
- **Translate ahead: the cards that start in the next 10 seconds of video time** (the user's decision, 2026-11-23).
- **A refused `tlang` is asked again only the next time the video is opened** (the user's decision, 2026-11-23): no retry while watching, nothing remembered about the refusal.
- **Translated subtitles are not cached on the device**: they stay in memory, following the decided storage policy (architecture: "Subtitle tracks are processed in memory; what is stored is" the saved words' sentences and, while Sentence history is on, the played lines, each with the translation it showed). Translated definitions keep their cache (`mtCache`).
- **Ads are blocked, on articles and on YouTube** (the user's decision, 2026-11-22, replacing "ads are not blocked"). Articles keep the original page, with ads removed (no reader view). See "Ad blocking" below.

## Rejected
| Option | Why not |
|---|---|
| Safari Web Extension (iOS) | The user's decision |
| Overlay on other apps (YouTube / Netflix apps) | iOS cannot draw over other apps at all (only Picture in Picture / Live Activities, both unfit). Android can draw (`SYSTEM_ALERT_WINDOW`), but reading the captions needs OCR on screen capture or the Accessibility API: fragile, battery-heavy, risky in Play review. Netflix is black in screen captures (`FLAG_SECURE`) |
| Our app with the official embedded player (IFrame API) | Videos with embedding disabled do not play; YouTube's developer policies forbid overlays on the player; no login in a WebView; caption capture inside the cross-origin iframe is unverified; Data API search quota (10,000 units/day per project, 100 per search) is shared by all users |
| Chromium fork (Brave / Kiwi style) | Far too much maintenance |
| Chrome for Android extension | Chrome for Android still has no extensions |

## Checked: captions on the mobile site (2026-11-13)
Setup: the Claude desktop app's built-in browser (Chromium, not automated, `navigator.webdriver === false`) with a 375x812 viewport and an Android Chrome user agent, logged out. Video `iG9CE55wbtY` (same as [youtube-captions.md](youtube-captions.md)).

- The phone UA gets `m.youtube.com`. `#movie_player` has the same player API as desktop (`getPlayerResponse`, `loadModule`, `setOption`, `getOption`; caption options `reload, fontSize, track, tracklist, translationLanguages, sampleSubtitle, stickyLoading, serverDefaultTrack`). 65 caption tracks listed, including `.en`, `a.en`, `.ja`.
- `setOption("captions", "track", { languageCode: "en" })` made the player send one **XHR** to `/api/timedtext` with `potc=1&pot=…`, `fmt=json3` and client params `c=MWEB`, `cplatform`, `cmodel`, … The body was 59,007 bytes.
- Rewriting that URL and fetching it from the page, as on desktop:

| Variant | Bytes |
|---|---|
| `lang=ja` | 43,818 |
| `tlang=ja` | 50,844 |
| `kind=asr` | 379,178 |
| `lang=es` | 58,953 |
| without `pot` / `potc` | 0 (empty `200`) |

- So **the desktop capture method works unchanged on the mobile site.**
- DOM differs: present are `#movie_player`, `video.html5-main-video`, `.ytp-caption-window-container`; absent are `ytd-watch-flexy` and `.ytp-chrome-bottom` (desktop controls). Player at 375x211 under a 48 px header. A separate `PlatformAdapter` is needed for button and transcript placement.
- Not checked here: signed-in state, Shorts, live streams. Real Android WebView and GeckoView were checked on 2026-11-22 ("Android prototypes" below), WKWebView too ("iOS prototype").

## Android engine: System WebView (decided 2026-11-22)
- **Why**: GeckoView bundles the engine. Its debug APK is 210 MB, about 96 MB compressed (estimate), against 6.8 MB and about 2.2 MB for WebView. About 90 MB is the engine, which a release build does not shrink. `tlang` is refused on both ("Translated captions"), so it does not justify the size.
- **What WebView costs, given that iOS needs the shim anyway**:
  - Ad blocking is the large one (from the APIs, not measured): `shouldInterceptRequest` gives no resource type, sees only the first URL of a redirect, and cannot edit a response as it streams.
  - The extension API shim and the app's own storage need an Android native side.
  - The WebView version differs per device.
- **A switch to GeckoView must stay possible** (the user's decision), through three boundaries:
  1. Engine: loading, injection, messaging and blocking go through one interface. WebView types stay behind it.
  2. Data: terms, settings and packs do not live in the browsing engine's storage, so a switch migrates none of them.
  3. Messages: the format between the scripts and the app does not depend on the engine, and is shared with iOS.
- **Cost of a switch** (estimates, not tried): 4-8 working days with the boundaries, 10-20 without. Site cookies would probably be lost (sign in again).
- **A switch would not fix** the `tlang` refusal, and probably not server-side ad stitching or store policy. Whether it fixes a Google sign-in refusal is unknown.
- GeckoView would not run the Firefox build as it is: Firefox for Android has no `identity` API and does not sync `storage.sync`, and the mobile site needs its own adapter.
- iOS has no choice: WebKit (`WKWebView`) is required outside the EU.

## Android prototypes (2026-11-22)
Two throwaway apps in `mobile/prototypes/` (setup: [development.md](../development.md) "Mobile app"), on the emulator (Android 17, arm64, Google Play image), logged out, video `iG9CE55wbtY`. Both inject the same `probe.js` at document start in every frame: it prunes the player response's ad fields (`adPlacements`, `playerAds`, `adSlots`, `adBreakHeartbeatParams`, through `JSON.parse`, `Response.json` and a `ytInitialPlayerResponse` setter), records `/api/timedtext` responses, and refetches the variants measured above. Both block with EasyList's `||host^` rules (46,385 hosts) and hide with its generic `##` rules (13,636 selectors), the list fetched at run time.
- **System WebView** (`android-webview`, WebView 145): the script goes in through `WebViewCompat.addDocumentStartJavaScript` and talks back through `addWebMessageListener`. It runs in the page's own world: isolated worlds (`JS_INJECTION_IN_FRAME_AND_WORLD`) need androidx.webkit 1.16.0 and, by Chromium's source, WebView 146 or later, while the prototype has 1.14.0 and WebView 145. Not tried. Requests are blocked in `shouldInterceptRequest`. `cdp.mjs` drives the page over the DevTools protocol (`adb forward` to `webview_devtools_remote_<pid>`).
- **GeckoView** (`android-geckoview`, GeckoView 160): a built-in MV3 extension (`ensureBuiltIn`) with a `"world": "MAIN"` content script for the probe, an isolated content script that relays to the background, and the background's native port to the app. Requests are blocked with blocking `webRequest`, elements are hidden with `scripting.insertCSS`. The app sends named commands (no `eval`: YouTube's CSP).

| | System WebView | GeckoView |
|---|---|---|
| `navigator.webdriver` | false | false |
| Player's own request (`en`, with `pot`, `c=MWEB`) | 59,007 B | 59,007 B |
| `lang=ja` / `lang=es` / without `pot` | 43,818 / 58,953 / 0 B | 43,818 / 58,953 / 0 B |
| `tlang=ja` (the site's translation) | 200 or 429 ("Translated captions") | 200 or 429 ("Translated captions") |
| Ad fields pruned, playback | pruned, kept playing, no ad, no warning | pruned, kept playing, no ad |
| Request blocking | works: Daily Mail 148 requests blocked, page intact | works (3 ad requests blocked on YouTube); article run not measured |
| Google sign-in (default UA) | reached the password step | not checked |
| Debug APK | 6.8 MB | 210 MB (arm64 only; `libxul.so` 155 MB, stored uncompressed); download size not measured |

- **`tlang`**: 429 in some runs on both engines. The first reading of this day ("Android WebView's refusal, not the network's or the visitor's") came from a few runs with uneven timing and was wrong: see "Translated captions".
- **Keep the default user agent**: with "; wv" and "Version/4.0" removed, WebView got empty bodies for every timedtext request, the captured one included (one run, right after request bursts); so did the built-in browser with a phone UA the same day (it had worked there on 2026-11-13). The cause is not established: an empty body also comes when a track is asked for before the player has its PO token ("Translated captions").
- YouTube shows Firefox a "Watch in YouTube app" sheet. The player requests no captions until the video plays. WebView with `mediaPlaybackRequiresUserGesture = false` autoplays muted. GeckoView blocks autoplay unless the app allows it (`permissionDelegate`), and even then the player sometimes waited: the probe starts playback itself.
- GeckoView, after a restart: an MV3 extension's event page does not run unless it has a startup listener, so it never connected to the app. With `runtime.onStartup` it does; checked with restarts that keep the data.
- Not checked: GeckoView sign-in and article blocking, signed-in YouTube, Shorts, live streams, real phones, release APK sizes, Langle's own Firefox build inside GeckoView.

## Android extension host spike (S2, 2026-11-24)
`mobile/prototypes/android-host-spike` (spec [mobile-app.md](../specs/mobile-app.md) "Spikes before building"; copied from `android-webview`, androidx.webkit 1.18.0). Emulator `Medium_Phone_API_37.0` (Android 17, SDK 37, Google Play arm64 image). `run.sh` starts one measurement per launch (`am start` extras); each result is one logcat line. The extension host is a WebView in a `ProfileStore` profile "langle" loading `https://appassets.androidplatform.net/assets/host.html` through `WebViewAssetLoader`, with a `langleBridge` listener for that origin. The browsing page is a WebView in the default profile.

**WebView versions.** The image's stable WebView is 145.0.7632.218. It reports `JS_INJECTION_IN_FRAME_AND_WORLD` **false**, and `getExecutionWorld` throws. `MULTI_PROFILE`, `WEB_MESSAGE_LISTENER` and `DOCUMENT_START_SCRIPT` are true.
- The user's Play Store update left stable at 145.
- Android System WebView **Dev 160.0.8171.0** was installed and made the provider (`cmd webviewupdate set-webview-implementation com.google.android.webview.dev`). It reports all four features true.
- Questions 3–5 were measured on 145. Question 2 was measured on Dev 160; questions 2 and 5 (host renderer) were repeated there.

**The lowest WebView with `JS_INJECTION_IN_FRAME_AND_WORLD` is 146.0.7680.10**, by Chromium's source (`android_webview/support_library/java/src/org/chromium/support_lib_glue/SupportLibWebViewChromiumFactory.java`):
- The glue landed hidden behind `DEV_SUFFIX` in 19d3b9960b (main@{#1582059}, 2026-02-09). The suffix was removed in a6cae35a38 (main@{#1584520}, 2026-02-13), which was merged to the M146 branch.
- By tag: absent in 145.0.7632.218, suffixed in 146.0.7680.0–.9, plain from 146.0.7680.10 on.
- M146 reached Stable on 2026-03-10 (chromiumdash milestone schedule). Chrome for Android Stable shipped 146.0.7680.31 on 2026-02-25 (early stable) and 146.0.7680.111 on 2026-03-10. Today's Stable is 158/159 (2026-11-18).
- That is Chrome's channel. WebView normally ships the same versions, but this was not checked separately.
- So most updated phones have the feature. Phones whose WebView is not updated do not, like this emulator image, whose Play Store visit left it at 145. The app must check the feature at run time.

| Question | Result |
|---|---|
| 2. Langle world: `getExecutionWorld(web, "langle")`, `addJavaScriptOnEvent(…, INJECTION_EVENT_DOCUMENT_START, …, world)`, `addWebMessageListener(…, "langleBridge", setOf("*"), world, …)` on `https://en.wikipedia.org/wiki/Language` (Dev 160, two runs) | The script runs before the page's scripts: `readyState` loading, 0 scripts in the document, `<html class="client-nojs …">`; Wikipedia's first inline script swapped in `client-js` 13–17 ms later. It posts and gets the native reply through `replyProxy` ("pong"). In the page world `typeof window.langleBridge` is `"undefined"` (and the world's own global too), while `RLQ` is an object there and `"undefined"` in the Langle world. The page's `window.postMessage` reaches a `message` listener in the Langle world (`e.source === window`), so `youtube-main` can talk to it as on the desktop. |
| 3. IndexedDB in the "langle" profile on the app origin | Works. 1,000 rows plus a 20 MB `ArrayBuffer` (deterministic, FNV checksum) written in 478 ms. After a force-stop and relaunch: 1,000 rows ok, 20,971,520 bytes, same checksum, read in 187 ms; usage 21.1 MB, `persisted()` false. The same origin in the default profile keeps its own IndexedDB, `localStorage` and cookies. On disk: `app_webview/Default/` and `app_webview/Profile 1/` (the "langle" profile, 21 MB). |
| 3. `WebStorage.getInstance().deleteAllData()` and `CookieManager.getInstance().removeAllCookies` (the default profile) | The default profile's database, `localStorage` and cookie were gone. The "langle" profile still had 1,000 rows, the checksum, its cookie and its `localStorage`, read after a relaunch. |
| 4. Host WebViews in "langle", 1 s `setInterval` for 2 minutes, the page WebView on `about:blank`, app in the foreground | All on time: a visible 200 px control, `View.GONE` attached, 0×0 attached and **never attached** each gave 121 ticks in 121.5 s, mean gap 1,000 ms, max 1,071 ms, none over 1.5 s. `visibilityState` is `"visible"` in all four. Unlike iOS, a detached WebView is not throttled. |
| 4. The same, app sent to the background (Home) right after start | Every variant stopped. Attached ones ran 7 ticks and then nothing for about 75 s (`visibilityState` hidden). The detached one had one 73 s gap and resumed when the app came back. The app process was cached (procState 15) and not frozen 20 s after Home; the cause was not established. |
| 5. Renderer loss: page WebView (default profile) and a `GONE` host WebView ("langle") | One renderer process **per profile**: two `sandboxed_process0` processes (isolated uids). The two `WebViewRenderProcess` objects differ. Five WebViews in two profiles also gave two. `adb shell kill` (and `run-as … kill`) on a renderer pid is refused ("Operation not permitted", user build), so `WebViewRenderProcess.terminate()` was used. Ending the host's renderer fired `onRenderProcessGone` (didCrash false) **only for the host**; ending the page's fired it only for the page. Each was recreated (destroy, new WebView in the same profile, reload) and worked again (host "ready", Wikipedia loaded); the other WebView was untouched. Same on Dev 160 for the host. |

- **The spec's plan holds on Android** where the WebView is new enough:
  - an isolated world with a world-scoped listener;
  - IndexedDB in the extension host's own `ProfileStore` profile on the `WebViewAssetLoader` origin, independent of the browsing data;
  - a hidden host WebView, any of the three ways.
- **Differences from iOS that M1 must follow**:
  - With WebView 145 (or anything before 146.0.7680.10) there is no isolated world. M1's feature check (no injection, "Update Android System WebView") is required, not defensive.
  - Renderers are per profile, so losing the page's renderer leaves the host running, and losing the host's leaves the pages. App pages in the "langle" profile share the host's renderer and go down with it. Recovery is per profile, not "host first, then every page".
  - In the background the host's timers stop. Alarms and anything else that must run with the app in the background need native scheduling.
- A cookie set about 20 s before a force-stop was lost in the default profile (one run); one set 45 s before survived. This is the cookie store's flush timing. Langle keeps nothing in cookies.
- Limits:
  - emulator only, one Android version;
  - Q2 on the Dev channel only; Q3 and Q4 on 145 only;
  - renderers ended with `terminate()`, not a real crash or a low-memory kill;
  - not checked: iframes (`setOf("*")` with frames), a real phone, memory pressure, the real `langle-app` build.

## iOS prototype (2026-11-22)
`mobile/prototypes/ios-wkwebview` (SwiftUI shell, a hand-written Xcode project with a synchronized folder; no generator), on the Simulator (iPhone 17, iOS 27.2), logged out, the same video and the same `probe.js`. Driven from the shell by `check.sh` (`simctl launch` arguments, Darwin notifications for commands, results in the unified log).
- **Script**: two `WKUserScript`s at document start in every frame, in `WKContentWorld.page` (the probe must patch the page's own `JSON.parse` and `fetch`); messages back through `WKScriptMessageHandler`. Commands run with `callAsyncJavaScript` from native code, so YouTube's CSP does not apply. Isolated worlds exist (`.defaultClient` or named worlds) for the extension's own content scripts.
- **Captions**: the same sizes as Android: the player's own request 59,007 B (`en`), `lang=ja` 43,818, `lang=es` 58,953, without `pot` 0, `kind=asr` 379,178. YouTube labels the client `cbr=Webview` with the default UA and `cbr=Safari Mobile` with `applicationNameForUserAgent` set to Safari's tail; both get captions.
- **`tlang=ja`**: 200 (50,846 B) in the morning's runs (with either UA), 429 in all 9 runs of the afternoon's retest ("Translated captions"). Right after `variants` (six refetches at once) every timedtext request, even the plain captured one, got 429 (1,103 B) for a few minutes, across app restarts. Langle must not burst timedtext requests (one at a time, cached).
- **Ad fields**: `adBreakHeartbeatParams` pruned on this video, playback kept going, no ad, no warning.
- **Blocking**: EasyList's `||host^` rules (46,396) as one `WKContentRuleList` (compiled in 2.3 s on the Simulator, cached by WebKit after that) plus the generic `##` rules (13,636) as a document-start stylesheet. Daily Mail: 175 resources from 44 hosts, 17 of them EasyList ad hosts (`ad.doubleclick.net`, `c.amazon-adsystem.com` …), without blocking; 129 resources from 41 hosts, none of them listed, with it; the page looked the same.
- **Google sign-in** (default UA): the email was accepted and Google moved on to its passkey step, then offered "passkey / enter password / try another way"; no "this browser or app may not be secure" block. Stopped there (the password was not entered).
- App: 364 KB (debug, Simulator).
- Not checked: finishing sign-in, signed-in YouTube, Shorts, live streams, a real iPhone, pages that never finish loading (CNN's run waited for `didFinish` and was stopped).

## iOS extension host spike (S1, 2026-11-24)
`mobile/prototypes/ios-host-spike` (spec [mobile-app.md](../specs/mobile-app.md) "Spikes before building"; the same hand-written project and `check.sh` pattern as above, one measurement per launch). Simulator iPhone 17, iOS 27.2 (24B8117), built with Xcode 27.2 (27B52) and the iOS 27.2 SDK, deployment target 26.4. Two WKWebViews: the extension host (`WKWebsiteDataStore(forIdentifier:)` with a fixed UUID, a `WKURLSchemeHandler` serving `langle-app://app/host.html` and `host.js` from the bundle) and a browsing view in the default store on `https://en.wikipedia.org/wiki/Language`.

| Question | Result |
|---|---|
| 1. IndexedDB on `langle-app://app/` in the identifier store | Works. `location.origin` is `langle-app://app`, `isSecureContext` true, `crypto.subtle` present, `navigator.storage.estimate()` quota 10.3 GB, `persisted()` false. Raw IndexedDB: 1,000 rows in 338 ms, one 20 MB `ArrayBuffer` (random bytes) in 382 ms, read back in 90 ms with a matching checksum. |
| 1. Survives a kill and relaunch | Yes: `kill -9` of the app under a second after the write finished, then two relaunches: 1,000 rows, 20,971,520 bytes, checksum ok, the same write stamp. Usage 21.3 MB after relaunch. On disk the store is `Library/WebKit/<bundle id>/WebsiteDataStore/<uuid>/` (21 MB); the default store is `…/WebsiteData/`. |
| 2. `WKWebsiteDataStore.default().removeData(ofTypes: allWebsiteDataTypes(), modifiedSince: .distantPast)` | The app store is untouched: read in the open host page and again after reloading it, both 1,000 rows and 20 MB ok. The control (an IndexedDB key and a `localStorage` item written on Wikipedia in the default store) was gone after the reload; the default store's records went from 2 to 0 in 32 ms. |
| 3. Hidden host, 1 s `setInterval` for 2 minutes, browsing view showing a page | On time when in the view hierarchy: zero frame with `isHidden`, zero frame with alpha 0, and a visible 120 pt control all gave 126 ticks in 126 s, mean gap 1,003 ms, page-clock gaps 994–1,014 ms, none over 1.5 s. |
| 3. Host **not** in the view hierarchy | Throttled: 66 ticks in 127 s, mean gap 1,918 ms, 58 of 65 gaps over 1.5 s (max 2.5 s). The page still loads and answers `callAsyncJavaScript`. |
| 4. Handler `langleBridge` added only in `WKContentWorld.world(name: "langle")` | Not visible to the page: in the page world `webkit.messageHandlers.langleBridge` is undefined (`"langleBridge" in` false) and `postMessage` throws, while a control handler added in `.page` is visible there. In the Langle world it is defined (the `.page` handler is not), `postMessage` returns the native reply (`WKScriptMessageHandlerWithReply`), the page's globals (`mw`) and the world's own (`__langleSecret`) do not cross, and the page's `window.postMessage` reaches a `message` listener in the Langle world. A document-start script in the world runs at `readyState` loading with 0 scripts in the document. |

- **The spec's storage plan holds**: IndexedDB in the extension host's own `WKWebsiteDataStore(forIdentifier:)` on the `langle-app://` origin works, persists and is independent of the browsing data. No polyfill is needed. The host WebView must stay in the view hierarchy (zero size, hidden); a detached one runs its timers at about half speed.
- Also tried (the fallback the plan names, not needed): a `loadFileURL` page in the same store also gets IndexedDB (origin `file://`, 1,000 rows and 20 MB written and read back).
- `dataRecords(ofTypes:)` on the identifier store lists 0 records even while it holds the 21 MB database: custom-scheme origins are not enumerated, so clearing or sizing the app's data has to go through the store as a whole (`removeData(ofTypes:modifiedSince:)` or `WKWebsiteDataStore.remove(forIdentifier:)`), not per record. Not tried.
- On the first run, the default store also listed hosts that only the older prototype app had visited (cnn.com, dailymail.co.uk); on the next run it listed only Wikipedia's. Not looked into; a Simulator artefact is likely.
- Limits: Simulator only, iOS 27.2 only (no 26.4 runtime installed), app in the foreground the whole time. Not checked: a real iPhone, the app in the background or the screen locked, memory pressure (whether iOS kills the hidden host's content process; `webViewWebContentProcessDidTerminate` is logged but never fired), storage eviction under low disk, and the real `langle-app` build (not ready).

## Translated captions (2026-11-22)
**Result: YouTube refused `tlang` (HTTP 429, 1,103 B) on all three engines, and the original track loaded in the same runs. Waiting and fresh cookies did not prevent it. An app on any engine must expect the refusal.**

`mobile/prototypes/tlang-check.mjs` runs the same steps on each engine: one launch on `iG9CE55wbtY` (signed out), the player's own English track, then one request by the player for its Japanese translation. "Fresh" clears the app's data first. "No added wait" still means 15 to 59 seconds after the player response, because the English track takes that long here; "90 s" counts from the player response. Runs were one at a time, at least 45 seconds apart except for pilots and repeats.

Translated requests answered 200 / valid runs:

| | System WebView | GeckoView | iOS WKWebView |
|---|---|---|---|
| Fresh, no added wait | 1 / 2 | 2 / 2 | 0 / 3 |
| Fresh, 90 s | 1 / 2 | 2 / 2 | 0 / 2 |
| Data kept, no added wait | 1 / 2 | 2 / 2 | 0 / 3 |
| Fresh, no added wait, blocking off | 0 / 1 | 0 / 1 | 0 / 1 |
| **All** | **3 / 7** | **6 / 7** | **0 / 9** |
| Not counted | 1 (empty English track) | 1 (no player response) | 0 |
| Time (UTC) | 06:49-07:25 | 06:49-07:22 | 07:26-07:42 |

- **This does not rank the engines.** WebView and GeckoView were interleaved, and 3/7 against 6/7 can be chance (Fisher's exact test, p = 0.27). iOS ran after both, and every valid run from 07:22 on was refused, whatever the engine (11 in a row), so its 0/9 mixes engine and time; the same app got 200 that morning.
- **It was not a refusal of the whole network.** A desktop Chromium on the same network (the Claude app's browser, www.youtube.com, signed out) got the translation with 200 at 07:39, between iOS refusals at 07:37 and 07:40. One run: why it passed is not known.
- **Blocking is not shown to matter**: one run each without it, all refused, all in that late stretch.
- **Earlier runs that day**, with a harness that often asked for captions too early (empty bodies), agree that both outcomes occur: WebView 200 on fresh data 4 seconds after the player response, GeckoView 429 on fresh data after 92 seconds.
- **Limits**: one video, one network, an emulator and a Simulator, no real phones, no signed-in runs. The iPhone Simulator stayed booted during the Android runs, so the host was loaded.
- **Reported by others**: [yt-dlp #13831](https://github.com/yt-dlp/yt-dlp/issues/13831) (429 on translated captions; suggests fresh cookies or a 60 second wait), [ytdlnis #1498](https://github.com/deniscerri/ytdlnis/issues/1498) (429 after that wait too), [Brave #61805](https://github.com/brave/brave-browser/issues/61805) (429 in desktop Brave, 200 in Edge on the same network), [SmartTube #4760](https://github.com/yuliskov/SmartTube/issues/4760) (intermittent, every device on one connection). No report of a refusal only in Android WebView was found. The desktop extension's study met it too ([youtube-cards.md](youtube-cards.md)).
- **The extension's code on a 429** (run on a simulated response, not on YouTube): the body gives no cues, so the translation falls to the built-in translator when there is one, else to none, without retrying.
- **For the app**: `tlang` is no reason to pick an Android engine, and it needs a fallback on all of them. The user's decision (2026-11-22): if the app has to lean on on-device translation, discuss the design again before building it.

## Android on-device translators: ML Kit vs Mozilla (2026-11-22)
A throwaway app in `mobile/prototypes/android-translate` with a flavor per engine (and `none` as the baseline): ML Kit `translate:17.0.3`, and Mozilla's Bergamot WebAssembly v0.6.0 with Firefox 145's glue and worker settings and Mozilla's en→ja model. The engine files are not in the repo (`-PengineAssets=<dir>`; unpacked wasm sha256 starts `f38ef807`).

- **Criteria, fixed before measuring**: a quality gap of 0.3 points or more picks the better one; a smaller gap picks Mozilla (no attribution duty, no metrics to Google); Mozilla needs 95% of sentences within 1 second, else a native build is discussed first.
- **Result: Mozilla.** It is 0.81 points better and meets the speed condition with the engine running alone, as compared here. While a video plays on one CPU core it can miss it: see "Loaded only when used" below.

Quality: 200 sentences from 30 YouTube videos of the local corpus, translated by each engine and by YouTube, scored blind from 1 to 5 by four `judge` agents (50 sentences each, the order shuffled per sentence).

| | All | Manual captions (100) | Auto captions (100) | Good (4-5) | Bad (1-2) |
|---|--:|--:|--:|--:|--:|
| YouTube (reference) | 4.49 | 4.65 | 4.32 | 86% | 4% |
| Mozilla | 3.33 | 3.52 | 3.15 | 44% | 24% |
| ML Kit | 2.52 | 2.67 | 2.38 | 14% | 58% |

Mozilla minus ML Kit: +0.81, 95% interval +0.68 to +0.96 (bootstrap by video), +0.68 to +0.98 in each judge's packet. Mozilla was better on 125 sentences, equal on 61, worse on 14. It is still far below YouTube, so it stays the last choice in the order.

Cost, on one emulator (Android 17, arm64, 1 vCPU, WebView 145, host Apple M5), in airplane mode:

| | ML Kit | Mozilla (WASM) |
|---|--:|--:|
| Per sentence, median (3 runs of 400) | 20-46 ms | 29-57 ms |
| Per sentence, 95th percentile | 49-346 ms | 117-404 ms |
| Share within 1 second, worst run | 99.75% | 99.25% |
| Engine ready plus first sentence | 0.8-7.3 s | 1.1-1.5 s |
| Memory added while held (PSS, app + renderer) | +77 MB | **+339 MB** |
| Debug APK added (as built / deflated) | 23.2 / 9.3 MB | 2.0 / 1.8 MB |
| English-Japanese model, download | not measured | 36.2 MB |
| English-Japanese model, on disk | 62.2 MB | 49.6 MB |

- **Memory is the risk.** The WASM heap is 73 MB after loading and 343 MB after the first sentence, even a one-word one. It is the same with `workspace` at 128, 64, 32 or 16 (checked in Node). A WASM heap does not shrink, so giving it back means ending the worker, which works (below). A native build has not been tried.
- A fourth run with memory sampling, which disturbs timing, also met the speed condition (95th percentile 594 ms; first sentence ready after 5.8 s, ML Kit 8.3 s).
- **Limits**: English→Japanese only; the judges are language models, not native speakers; auto captions were cut at YouTube's translated-sentence boundaries, which the real fallback does not have; emulator speed varied with the host's load, and no real phone was used.

### Loaded only when used (checked 2026-11-22)
The prototype's `lifecycle` run starts the worker, translates the 200 sentences, holds, then ends the worker. 25 cycles on throwaway boots of the same emulator (`-read-only`), some with `m.youtube.com` playing in a second WebView, which shares the renderer process.

| Memory, cores, page | Cycles | Held, MB | Released, MB | First sentence | 95th percentile |
|---|--:|--:|--:|--:|--:|
| 4 GB, 1, engine alone | 5 | 462-464 | 154-159 | 0.6-1.8 s | not timed |
| 4 GB, 1, YouTube playing | 3 | 570-582 | 265-279 | 1.5-4.0 s | not timed |
| 2 GB, 1, engine alone | 6 | 420-491 | 87-185 | 0.6-15.9 s | 80 ms (1 timed) |
| 2 GB, 1, YouTube playing | 7 | 582-611 | 273-309 | 3.3-7.6 s | **499 and 1,215 ms** (2 timed) |
| 2 GB, 4, engine alone | 1 | 480 | 172-176 | 0.6 s | 70 ms |
| 2 GB, 4, YouTube playing | 3 | 575-578 | 258-278 | 1.0-2.4 s | 106-313 ms |

- **Release works**: about 300 MB is back within 2 seconds of ending the worker, with no growth after the second cycle and no page reload. Every cycle gave the same translations as the judged ones.
- **2 GB did not break it**: in 17 cycles neither the app nor the renderer died. Android killed only cached background processes (`oom_score_adj` 900 and up). The 15.9 s first sentence came just after boot, while the system was still busy.
- **One core while playing can be too slow**: in the worse timed cycle 93% of sentences took under a second and playback lost 33 of 94 seconds. With four cores every sentence took under a second and playback lost at most 0.3 seconds while translating. The user accepted this on 2026-11-23, with a real low-end phone as a check before release ("Decided").
- **Limits**: the emulator decodes and draws video on the CPU (it used 4-8 host cores during playback), so playback costs differ on a phone. `-lowram` did not set `ro.config.low_ram`, so Android's low-RAM behavior is untested. No real phone, no app switching, English→Japanese only.

### Cards and translate-ahead without `tlang` (measured and decided 2026-11-23)

main's own rules (`asrSentenceCards`, at 410c8756) over the 30 stored English tracks of the 2026-11 quality corpus, against the cards made with YouTube's translation (`alignAsrSentences`):

| Tracks | Videos | Cards | Also a start with `tlang` | Cut mid-sentence (`runsOn`) | Median card |
| --- | --: | --: | --: | --: | --: |
| Manual | 16 | 2,192 | 97% | 18% | 4.5 s |
| Auto, punctuated | 9 | 3,678 | 82% | 7% | 2.0 s |
| Auto, unpunctuated | 5 | 1,252 | 26% | 89% | 3.4 s |

- The extension already splits without `tlang`. Only unpunctuated auto tracks differ much. `runsOn` counts every card there without end punctuation, so 89% is not an error rate.
- Ten spans of those five videos were translated with the Mozilla model both ways and read by Claude (not judged): neither cut was always better, as YouTube's cuts also split sentences. The comparison's auto-caption items (3.15) were all cut at YouTube's sentence ends, so that score does not give the quality of these cards.

The extension asks the built-in translator when a card starts to play (`translateCard`). Simulated over the same 30 tracks (one translation at a time, 1x from the start, every card at the stated time, first card left out), share of cards late / of card time without a translation:

| Cards ahead | 0.3 s (4 cores) | 0.5 s (1 core) | 1.2 s (1 core, worse run) |
| --- | --: | --: | --: |
| 0 (now) | 100% / 8.4% | 100% / 14.3% | 100% / 33.7% |
| 1 | 3% / 0.2% | 8% / 0.9% | 24% / 5.7% |
| 2 | 0% / 0.0% | 1% / 0.5% | 9% / 2.3% |
| 3 | 0% / 0.0% | 1% / 0.4% | 4% / 1.3% |
| All | 0% / 0.0% | 1% / 0.4% | 1% / 0.7% |

- The three times are 95th percentiles measured during playback, used for every card, and the first card took 2.4 or 7.6 s. Seeking, playback speed and the translator's own load on playback are not simulated.
- Translating ahead cannot shorten the first wait: that depends on when the engine is loaded.

Windows counted in video time against windows counted in cards, share of cards late (same simulation, at 1.2 s a card):

| Window | 1x | 1.5x | 2x | Cards ahead, median / p95 |
| --- | --: | --: | --: | --: |
| 3 cards | 4% | 20% | 38% | 3 / 3 |
| 5 cards | 2% | 15% | 36% | 5 / 5 |
| 5 s | 2% | 21% | 41% | 1 / 4 |
| 10 s | 1% | 14% | 37% | 2 / 7 |
| 3 cards or 10 s | 1% | 14% | 36% | 3 / 7 |

- Short cards come in bursts, so a window in seconds covers them with less work thrown away on a seek than a count large enough to do the same.
- At 0.3 s a card no window is late in 1% or more at any of these speeds, at 0.5 s none in more than 3%. At 1.2 s and 2x none of them keeps up: that is the engine's speed, for the check on a real phone.

### The translator's other uses (found and decided 2026-11-23)

"Started for a video whose `tlang` fails" was proposed without counting the extension's other uses of its translator: English definitions translated at display time (hover card, dictionary window, word lists), the literal translation of a phrase or selection without an entry, and the same on articles. From the stored English→Japanese run of language cycle c001 (`after-adverb`, known level 3,000, nothing saved):

| | YouTube (30 videos) | Articles (30) |
| --- | --: | --: |
| Words and phrases that need the translator for their meaning | 2.1% | 1.7% |
| The same among highlighted ones (New) | 15.2% | 8.0% |
| Among highlighted phrases | 46% (1,009 of 2,204) | 47% (202 of 429) |
| Pages with at least one highlighted | 30 of 30 | 30 of 30 |
| Distinct such highlighted terms a page, median | 26 | 10 |

- Started only for `tlang`, the engine leaves these meanings in English. Pairs offered by the gate's token rule also count on a translator (architecture: "Quality gate").
- Started for the word lists, it could load on nearly every video and article, as each has such a term and lists translate the rows they render.
- The counts are of words shown, not of taps. Selections are not counted.

### When to release the engine (checked and decided 2026-11-23)

- Since API level 34 Android no longer tells a running app that memory is low: `ComponentCallbacks2` in the SDK 37 sources marks the `TRIM_MEMORY_RUNNING_*` levels "Apps are not notified of this level since API level 34". `TRIM_MEMORY_UI_HIDDEN` (the app's UI left the screen) and `TRIM_MEMORY_BACKGROUND` remain. So releasing cannot wait for a low-memory warning: it needs the app's own rule.

### Apple's translator on the same set (run 2026-11-23)

`TranslationSession(installedSource:target:)` (iOS 26 / macOS 26 and later) on this Mac (Apple M5, macOS 27.2.1), Apple Intelligence on, default strategy (which is `highFidelity` here, below), one sentence at a time: all 200 items of the comparison translated; first 1,715 ms, median 429 ms, p95 909 ms. A second run: first 1,285 ms, median 430 ms, p95 971 ms, the same 200 translations. A Mac is not an iPhone: neither the speed nor that the models are the same is checked. The sandbox blocks the translation service, so run it with the sandbox off.

**Criteria, fixed before judging** (approved by the user 2026-11-23; blind, with the rubric of the Android comparison): only if Mozilla scores 0.3 points or more above Apple is Mozilla on iOS discussed again; otherwise iOS uses Apple's translator (no model to ship, no engine of about 300 MB in the app). Either way speed on a real iPhone is a condition before release.

Judged 2026-11-23 by four blind judges, the three translations shuffled per item:

| | Mean | Manual | Auto | Good (4-5) | Bad (1-2) |
| --- | --: | --: | --: | --: | --: |
| YouTube | 4.43 | 4.62 | 4.23 | 84.5% | 5% |
| Apple (`highFidelity`) | 3.81 | 3.94 | 3.68 | 65.5% | 7% |
| Mozilla | 3.18 | 3.42 | 2.93 | 38% | 31.5% |

- Apple is 0.64 above Mozilla (95% interval by video 0.50-0.78), in each of the four packets and for manual and auto captions alike, so by the criteria iOS uses Apple where this model runs.
- Mozilla's same translations scored 3.33 in the Android round: compare within a round only.
- **The result holds only for Apple Intelligence.** The SDK's documentation says `highFidelity` uses Apple Intelligence models and falls back to `lowLatency`'s traditional models on devices without it. On this Mac `lowLatency` is `supported` (not installed) and fails with `notInstalled`, while the default and a named `highFidelity` gave the same 200 translations: everything judged came from Apple Intelligence's model. The traditional models need a download and are not judged: they wait for the real-iPhone check before release.
- `init(installedSource:target:)` needs iOS 26. Naming a strategy needs iOS 26.4, and apps built with older SDKs default to the traditional models.

### The lowest iOS version (checked and decided 2026-11-23: 26.4)

- iOS 18: `TranslationSession` only from a SwiftUI view's `translationTask`. iOS 26.0: also without a view, for installed languages. iOS 26.4: the strategy can be named (iOS 27.2 SDK's interfaces).
- A session made without a view cannot ask for a download (`canRequestDownloads` is false; the SDK's documentation). Where languages are to be downloaded (the traditional models), a floor of 26.4 still needs a `translationTask` view for the consent and the download. The options were first given to the user as "one code path", which holds for translating only.
- [Apple's figures](https://developer.apple.com/support/app-store/), the latest there: iOS 26 on 79% of all iPhones and 86% of those of the last four years (2026-06-07). None for 26.4 alone or for iOS 27.
- iOS 26 dropped the iPhone XS, XS Max and XR. [iOS 27 runs on every iPhone that runs iOS 26](https://www.macrumors.com/2026/06/08/ios-27-supports-iphone-11-newer/), so a floor of 26.4 leaves out no model that 26.0 takes.

## Ad blocking (not built; 2026-11-22)
The app is the browser, so blocking runs in the app, outside any extension API and its limits (as Brave does; Brave on iOS also runs on WKWebView).
- **Requests**: ad and tracker loads are stopped before they are sent, matched against filter lists in the uBlock Origin / EasyList syntax.
  - iOS: `WKContentRuleList` (WebKit's compiled, declarative content-blocker rules; no per-request code). The lists must be converted to its JSON.
  - Android System WebView: `shouldInterceptRequest` sees every subresource and can answer with an empty response (per-request matching).
  - GeckoView: a bundled WebExtension's blocking `webRequest`.
  - Candidate engine: Brave's adblock-rust (MPL-2.0): it matches requests and converts lists to WebKit's format. Unverified in our app.
- **Elements**: what the requests miss is hidden with the lists' CSS rules (injected stylesheets, or the rules' `css-display-none` on iOS).
- **Scriptlets**: small scripts injected at document start that defuse ad scripts (uBlock Origin's scriptlets). Needed for YouTube.
- **YouTube**: its video ads come from the same hosts as the video, so blocking requests is not enough. The player response's ad fields (`adPlacements`, `playerAds`, `adSlots`) are removed before the player reads them. This touches the same data the caption capture reads (`getPlayerResponse`): both must keep working together.
- **Filter lists** are data: fetched and updated at run time, credited (EasyList: GPLv3 or CC BY-SA 3.0; uBlock Origin's lists: GPLv3). Scriptlets are code: shipped in the app (App Store guideline 2.5.2 forbids downloading code), so a scriptlet fix waits for store review.
- A per-site switch turns blocking off where it breaks a page.

## Open issues and risks
1. **Google sign-in.** Google blocks sign-in from browsers embedded in other apps (OAuth `disallowed_useragent` since 2021-09-30; its help page says sign-in may be blocked in browsers "embedded inside another app"). Browsers built on the same engines (Brave / Firefox / DuckDuckGo on iOS, Firefox on Android) can sign in, so detection seems to rely on signals such as the user agent, not the engine. Android WebView's UA contains `; wv`. Unverified for our app and a policy gray area. Watching and captions work without sign-in; age-restricted and members-only videos need it.
2. **PO token in the real engines** (see above).
3. **Extension API shim** (WKWebView / WebView): messaging, `storage`, background work, an isolated world (`WKContentWorld` on iOS, `JavaScriptExecutionWorld` on Android from WebView 146, with older versions' handling still to decide; WKUserScript can also inject into cross-origin frames).
4. **Translation.** No Chrome Translator API, so on-device translation goes through a native bridge. The order is decided ("Decided").
   - iOS: Apple's Translation framework. `TranslationSession` without a view needs iOS 26, and downloading a language needs the user's consent. It runs on a Mac ("Apple's translator on the same set"), judged better than Mozilla with Apple Intelligence; the traditional models of other devices are not judged. To check on a real iPhone.
   - Android: Mozilla's models (MPL 2.0) on Bergamot's WebAssembly build ("Android on-device translators" above). The [registry](https://mozilla.github.io/translations/model-registry/) has released models for all 19 pairs (de→fr through English), 17-44 MB each unpacked for Android; only en→ja is measured.
     - Not ML Kit: lower quality on that test. Its terms also ask for Cloud Translation's attribution as far as it applies to apps (a "powered by Google Translate" mark adjacent to results), and the SDK sends usage metrics to Google, to be disclosed to users.
     - Not [Foxlet Translate](https://github.com/yinvoke/foxlet-translate): a prebuilt native binary from a repository created 2026-08-31 by one author, too little track record to run or ship.
   - Open: quality of Apple's traditional models (at the real-iPhone check before release) and of the other language pairs, speed on a real iPhone and on a real low-end Android phone (both required before release).
5. **Sync.** Chrome sync cannot be read from mobile, so sync to the user's own cloud (architecture: "Sync to the user's own cloud storage") becomes required.
   - Google Drive (2026-11-22, by design, not built): sign-in goes through the system sheet (`ASWebAuthenticationSession` on iOS, Custom Tabs on Android) because Google refuses OAuth inside a WebView (item 1). Add an iOS and an Android OAuth client to the same Cloud project: `appDataFolder` belongs to the project, so the app and the extension share the same file (two clients in one project already shared it on desktop). Tokens and Drive calls live in native code behind the bridge. Still to check: creating those clients (Android needs the signing certificate's SHA-1) and "Checks before building" item 5 in the architecture; while the Cloud project is in Testing, only its test users can connect.
6. **Touch UI.** Hover becomes tap; subtitles, dictionary window and buttons need a phone layout (mocked 2026-11-22, [ui.md](../specs/ui.md) "Mobile app").
7. **Distribution.**
   - App Store: be a real browser (guideline 2.5.6 WebKit; avoid 4.2 minimum functionality and 5.2.2 third-party content rejections).
   - Google Play: new personal developer accounts need a closed test with 12 testers for 14 days before production.
   - Fees: Apple Developer Program $99/year (required for TestFlight and the App Store; lapsing removes the app), Google Play $25 once.
8. **Maintenance.** When undocumented YouTube internals change, a fix waits for store review (slower than an extension update).
9. **On-device LLM (phase 3 "Meaning in context", [architecture](../specs/architecture.md) "Meaning in context": the `NativeBridge` provider).** No Chrome Prompt API (`LanguageModel`) in WKWebView, GeckoView or Android WebView, so `builtInAi` is false there. Like translation, call the platform model through the native bridge: Apple's Foundation Models framework (iOS 26+) and the ML Kit GenAI Prompt API (Gemini Nano through AICore; alpha/beta as of 2026-11). The AI part then has three providers: Chrome Prompt API, native bridge, the user's own API key.
   - Our app is in the foreground while it runs. Foundation Models' strict rate limit was reported for app extensions running in the background (a Safari extension calling through native messaging), and ML Kit allows inference only from the top foreground app, so neither is expected to bite. Unverified.
   - Device coverage is narrow: Apple Intelligence devices with it turned on (about iPhone 15 Pro and later); on Android a set of recent high-end phones, with different Nano versions per device. The API-key fallback stays required.
   - Three different models (Nano in Chrome, Apple's, Nano on Android). The measurements in the design ("Phases") were made on Chrome only; JSON output and Japanese explanations must be checked per model.
   - **Apple, measured 2026-11-22** (`ios-wkwebview/LLMProbe.swift`, `check.sh cmd llm`; `llm-mac.swift` for the Mac): in the iOS 27.2 Simulator `SystemLanguageModel.default` reports `available`, Japanese supported (24 languages), but every `respond` fails (`LanguageModelError` -1 from `com.apple.SensitiveContentAnalysisML` code 15), so generation needs a real device. The same model on the Mac (macOS 27.2) answered in 0.6–2.9 s. Plain text was weaker than structured output (`@Generable` with a Japanese meaning and an English part of speech): "run" in "run for mayor" came back as 走る in text but 市長選に出馬する as `@Generable`; "put up with" 我慢する; "went right over my head" wrong both ways (literal, and the part of speech came back in Japanese). So it is callable and fast, structured output is the way to ask, and idioms need a quality check (or Langle's own idiom data first) before relying on it.
   - **Android, not measured**: the ML Kit GenAI Prompt API (`com.google.mlkit:genai-prompt`, `1.0.0-beta5` on Google's Maven 2026-11-22) runs Gemini Nano through AICore, which the emulator does not have, so it needs a supported phone (Pixel 9 and later, recent Galaxy S and others). `checkStatus()` tells the app whether the model is available, downloadable or unsupported.

10. **YouTube ad blocking.** YouTube's terms forbid it, and YouTube fights it: warnings, playback stopped for detected blockers, and ads stitched into the video stream on the server (which pruning the player response cannot remove). Detection that stops playback would stop the learning features too. YouTube changes often, and scriptlet fixes wait for store review (above). Whether the stores accept YouTube ad blocking in our app is unverified (Brave's apps do it in both stores).

## Tooling needed for the prototype
- **iOS: full Xcode** (Xcode.app; Command Line Tools have no iOS SDK or Simulator). Builds and Simulator can be driven from the command line (`xcodebuild`, `simctl`); the IDE itself need not be used. Roughly 10+ GB plus about 8 GB for the iOS Simulator runtime (`xcodebuild -downloadPlatform iOS`). After install: `sudo xcode-select -s /Applications/Xcode.app` and `sudo xcodebuild -license accept`.
- **A free Apple ID is enough** for the Simulator and for one's own iPhone (apps expire after 7 days, 3 apps per device, no iCloud / push). The paid program is needed only for TestFlight and the App Store.
- **Android: no Android Studio needed.** Command-line tools (SDK, emulator, a system image) are enough, a few GB.

## Next steps
1. Install Xcode (the user) and the Android command-line tools. Done 2026-11-22.
2. (Android and iOS done 2026-11-22, "Android prototypes" and "iOS prototype" above; `tlang` can be refused on all three engines, "Translated captions".) Minimal browser app prototypes that inject a script, capture timedtext, and try to reach Google's password step (the user signs in; Claude never enters credentials):
   - iOS: `WKWebView`, default UA and a Safari-like UA.
   - Android: GeckoView and System WebView, to choose the engine.
   - In both: one compiled filter list on an article, and the ad-field pruning on `m.youtube.com`; check that captions are still captured and that playback is not stopped.
3. Translation designed ([mobile-translation.md](../specs/mobile-translation.md)); the extension host, API shim and engine boundary designed 2026-11-24 ([mobile-app.md](../specs/mobile-app.md), [plan](../plans/mobile-app.md)).
4. Then: `m.youtube.com` adapter, own-cloud sync.

The phone mock is drawn (2026-11-22): the mock's `Mobile app` page, specified in [ui.md](../specs/ui.md) "Mobile app". It looks like an app (home with tabs, a title bar with no URL) while staying a full browser underneath, for the store reviews above.
