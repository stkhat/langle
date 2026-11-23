# HANDOFF: spike S2 (Android extension host), paused 2026-11-24

Second pause (2026-11-24, ~04:55 JST): Q3–Q5 measured on WebView 145 (below). The emulator is left
**booted** so the user can sign in to Google and update Android System WebView from the Play Store.
origin/main is merged in (ad8e5dd8). Nothing pushed; `npm run verify` not run.

## Measured 2026-11-24 on WebView 145.0.7632.218 (Q3–Q5)

- Q3, IndexedDB in ProfileStore profile "langle" on `https://appassets.androidplatform.net` (WebViewAssetLoader):
  - write: 1,000 rows + 20,971,520-byte ArrayBuffer in 478 ms (default profile, same origin: 258 ms), checksum efd3b250.
  - after force-stop + relaunch: 1,000 rows ok, 20,971,520 bytes, checksum efd3b250, read 187 ms; usage 21.1 MB,
    `persisted()` false. Same origin in the two profiles keeps separate localStorage ("store-langle" vs "store-default").
  - on disk: `app_webview/Default/` and `app_webview/Profile 1/` (the "langle" profile; IndexedDB 20,692 KB, profile 21,164 KB).
  - `WebStorage.getInstance().deleteAllData()` + `CookieManager.getInstance().removeAllCookies` (removed=true) + flush:
    default profile then had no database (`indexedDB.databases()` empty), no cookie, no localStorage (its IndexedDB dir 28 KB);
    "langle" profile after relaunch: 1,000 rows ok, checksum efd3b250, its cookie and localStorage still there.
  - a cookie set ~20 s before a force-stop was lost in the default profile (one run); one set ~45 s before survived
    (CookieManager flush timing; Langle keeps nothing in cookies).
- Q4, 1 s setInterval for 2 min, four WebViews in "langle" (visible 200 px control, View.GONE attached, 0x0 attached,
  never attached) + a visible default-profile page on about:blank, app in the foreground:
  all four 121 ticks in 121.5 s, mean 1,000 ms, max 1,071 ms, 0 gaps > 1.5 s; `visibilityState` "visible" for all, even GONE
  and detached. (Unlike iOS, detached is not throttled.)
  - extra: app sent to the background (HOME) right after start: attached views 7 ticks then nothing for ~75 s
    (`visibilityState` hidden); the detached one had one 73,254 ms gap, i.e. stopped too, and resumed when the app came back.
    The app process was cached (procState 15) and not frozen (`isFrozen=false`) 20 s after HOME; cause not established.
- Q5, page WebView (default profile, Wikipedia) + GONE host WebView ("langle", app origin):
  - two renderer processes (`sandboxed_process0 …:1` / `:2`, isolated uids); `getWebViewRenderProcess` objects differ.
    Five WebViews in two profiles (timer mode) also gave two renderers: one per profile.
  - `adb shell kill` / `kill -9` on a renderer pid: "Operation not permitted" (user build, isolated uid); `run-as … kill`
    also refused. Used `WebViewRenderProcess.terminate()` instead.
  - terminate host's renderer: only `host` got `onRenderProcessGone` (didCrash=false, priority 2); recreated, new process,
    page reloaded and posted "ready". The page WebView was untouched.
  - terminate page's renderer: only `page` got it; recreated, Wikipedia reloaded (pageFinished). Host untouched.

## Done

- Branch `claude/mobile-s2` from 920c30b5. Prototype in `mobile/prototypes/android-host-spike/`
  (copied from `android-webview`, androidx.webkit 1.18.0, app id `dev.langle.spike.host`).
  - `MainActivity.kt`: modes `world`, `store` (op write|read, `--es profile default`, `--es clear default`),
    `timer` (visible / GONE / 0x0 attached / detached host WebViews in profile "langle", report after 122 s),
    `crash` (page WebView default profile + GONE host WebView in "langle"; `--es cmd terminate --es target page|host`
    via `run.sh send`). Every result is a logcat line `S2 <label> <json>` (tag LangleS2).
  - `assets/host.html` + `host.js` (app origin `https://appassets.androidplatform.net/assets/`, WebViewAssetLoader):
    IndexedDB 1,000 rows + one 20 MB ArrayBuffer with an FNV checksum, cookie + localStorage marker, 1 s timer stats
    (ticks, mean, max, gaps > 1.5 s, visibilityState).
  - `assets/world.js`: the Langle-world document-start script (scripts count at start, Wikipedia's client-nojs -> client-js
    swap seen after it, replyProxy round trip, relays the page's `window.postMessage`).
  - `run.sh`: `install`, `<seconds> <extras…>` (force-stop, clear logcat, start, wait, print lines), `send`, `log`.
  - Builds (`./gradlew assembleDebug`, sandbox off; `source` is refused by the worktree guard, so export
    ANDROID_HOME / JAVA_HOME / PATH by hand, as in `scripts/mobile/env.sh`).
- Not yet run: `store`, `timer`, `crash`. The notes section in docs/notes/mobile.md is not written; S2 not ticked.

## Measured so far

- Q1, on `Medium_Phone_API_37.0` (Android 17, SDK 37): WebView `com.google.android.webview 145.0.7632.218`,
  androidx.webkit 1.18.0.
  `JS_INJECTION_IN_FRAME_AND_WORLD` **false**, `MULTI_PROFILE` true, `WEB_MESSAGE_LISTENER` true,
  `DOCUMENT_START_SCRIPT` true. `getExecutionWorld` throws on it (the app crashed at start; `world` now logs and returns).
- Lowest WebView with the feature, from Chromium's source (GitHub mirror chromium/chromium,
  `android_webview/support_library/java/src/org/chromium/support_lib_glue/SupportLibWebViewChromiumFactory.java`):
  - glue added with `+ Features.DEV_SUFFIX` (hidden from release androidx) in 19d3b9960b "Create support library glue for
    worldly JS injection" (main@{#1582059}, 2026-02-09);
  - suffix removed in a6cae35a38 "Remove dev suffix for worldly framely api" (main@{#1584520}, 2026-02-13), merged to M146;
  - tags: 145.0.7632.218 absent; 146.0.7680.0–.9 with DEV_SUFFIX; **146.0.7680.10** first without it (also .11–.252);
    147.0.7681.0 with suffix again, 147.0.7727.0 without.
  - So: WebView **146.0.7680.10** or later (a tag, not necessarily a shipped build; the first Stable 146 release is at or above it).
- Q2: blocked on this emulator (WebView 145).

## Next (decision for the coordinator first)

1. Q2 needs WebView ≥ 146.0.7680.10 on the emulator. Options: update "Android System WebView" from the Play Store
   (needs a Google sign-in on the emulator: a user step), or a newer system image (changes or adds an AVD). Pick one;
   do not wipe the existing AVD.
2. Meanwhile Q3–Q5 run on WebView 145 (MULTI_PROFILE is supported). From the repo root, sandbox off, after
   `xcrun simctl list devices booted` shows nothing and the emulator is booted
   (`emulator -avd Medium_Phone_API_37.0 -no-snapshot-save -no-boot-anim` in the background, then
   `adb wait-for-device`, `adb shell getprop sys.boot_completed` = 1):
   - `sh mobile/prototypes/android-host-spike/run.sh install`
   - Q3: `run.sh 25 --es mode store --es op write`; `run.sh 25 --es mode store --es op write --es profile default`;
     `run.sh 20 --es mode store --es op read`; `run.sh 20 --es mode store --es op read --es profile default`
     (force-stop is built into run.sh); `run.sh 20 --es mode store --es op read --es profile default --es clear default`;
     `run.sh 20 --es mode store --es op read` (langle profile still there?); also
     `adb shell run-as dev.langle.spike.host ls -R app_webview | head` to see the profile directory.
   - Q4: `run.sh 135 --es mode timer` (run_in_background; >180 s rule is fine at 135 s).
   - Q5: `run.sh 12 --es mode crash`; `adb shell ps -A | grep -i sandboxed` (renderer pids, count);
     `adb shell kill <pid>` (likely refused for the isolated uid on a user build; then
     `run.sh send 10 --es cmd terminate --es target host`), and check `renderProcessGone` + `recreated` + `ready`
     for both `page` and `host`.
   - Q2 once the WebView is ≥ 146: `run.sh 15 --es mode world`.
3. Write "Android extension host spike (S2, 2026-11-24)" in docs/notes/mobile.md right after "Android prototypes";
   tick S2 in docs/plans/mobile-app.md Progress; `npm run verify` (bare, background); push; draft PR base `main`,
   title "Mobile app spike S2: Android extension host"; `gh pr ready`. `adb emu kill` at the end. Delete this file.
