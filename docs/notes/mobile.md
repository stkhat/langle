# Mobile (iOS / Android): direction (investigated 2026-11-12 to 11-13)

Not part of any phase yet. A record of what was considered for bringing Langle to phones, what was chosen, and what is still unverified.

## Decided
- **Build our own browser app.** YouTube and articles open as ordinary web pages, and the extension's scripts are injected into them.
  - A general-purpose browser (any site, URL bar), so articles work too and the app is not "a YouTube wrapper" in store review.
- **Targets: YouTube (`m.youtube.com`) and web articles.** Netflix is out: DRM licenses go only to Netflix's own apps and supported browsers, and mobile browsers are sent to the app.
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

## Not decided: Android engine
- **GeckoView**: can bundle a WebExtension (`WebExtensionController`, messaging between the extension and the app), so the existing Firefox build could run almost as is. Adds tens of MB to the app.
- **System WebView**: no extension APIs; we write the same shim as on iOS, shared between platforms.
- iOS has no choice: WebKit (`WKWebView`) is required outside the EU.
- The prototypes below do not settle it: YouTube's translated captions were refused on both engines ("Translated captions"). What differs is the extension support and the app size.

## Android prototypes (2026-11-22)
Two throwaway apps in `mobile/prototypes/` (setup: [development.md](../development.md) "Mobile app"), on the emulator (Android 17, arm64, Google Play image), logged out, video `iG9CE55wbtY`. Both inject the same `probe.js` at document start in every frame: it prunes the player response's ad fields (`adPlacements`, `playerAds`, `adSlots`, `adBreakHeartbeatParams`, through `JSON.parse`, `Response.json` and a `ytInitialPlayerResponse` setter), records `/api/timedtext` responses, and refetches the variants measured above. Both block with EasyList's `||host^` rules (46,385 hosts) and hide with its generic `##` rules (13,636 selectors), the list fetched at run time.
- **System WebView** (`android-webview`, WebView 145): the script goes in through `WebViewCompat.addDocumentStartJavaScript` and talks back through `addWebMessageListener`. It runs in the page's own world: WebView has no isolated world. Requests are blocked in `shouldInterceptRequest`. `cdp.mjs` drives the page over the DevTools protocol (`adb forward` to `webview_devtools_remote_<pid>`).
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
3. **Extension API shim** (WKWebView / WebView): messaging, `storage`, background work, an isolated world (`WKContentWorld` on iOS; WKUserScript can also inject into cross-origin frames).
4. **Translation.** No Chrome Translator API. Use Apple's Translation framework (iOS) and ML Kit translation (Android), on device and free, through a native bridge.
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
3. From the results, choose the Android engine and design the extension API shim.
4. Then: `m.youtube.com` adapter, own-cloud sync.

The phone mock is drawn (2026-11-22): the mock's `Mobile app` page, specified in [ui.md](../specs/ui.md) "Mobile app". It looks like an app (home with tabs, a title bar with no URL) while staying a full browser underneath, for the store reviews above.
