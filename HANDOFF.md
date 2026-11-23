# HANDOFF: spike S2 (Android extension host), paused 2026-11-24

Paused on the coordinator's request (machine short on memory). The emulator is stopped
(`adb emu kill`; `pgrep -fl qemu-system` printed nothing). AVD data untouched. Nothing pushed;
`npm run verify` not run.

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
