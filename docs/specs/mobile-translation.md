# Mobile app: on-device translation

How the phone app translates when a video has no usable site translation, and what it shares with the extension. Approved with the user section by section on 2026-11-23. The measurements and the reasons behind each decision are in [docs/notes/mobile.md](../notes/mobile.md) ("Decided", "Translated captions", "Android on-device translators", "Apple's translator on the same set").

## Decisions this spec builds on
- **Order** (architecture: "Choosing a translation"): a human track, then YouTube's translation (`tlang`), then on-device translation. One choice per video, never switched midway.
- **A refused `tlang`** (HTTP 429, or a body with no cues) makes the video use on-device translation. It is asked again only the next time the video is opened.
- **Engines**: Android uses Mozilla's models on Bergamot's WebAssembly build. iOS uses Apple's Translation framework with `preferredStrategy` `highFidelity`, which falls back to the traditional models on devices without Apple Intelligence.
- **Lowest iOS version: 26.4**, where the strategy can be named and installed languages translate without a view.
- **Sentence cards without `tlang`** keep the extension's rules (`asrSentenceCards`).
- **Nothing new is stored**: translated subtitles stay in memory; translated definitions keep `mtCache`.

## Parts
```
Langle on each page (subtitles, dictionary window, lists)
  └ translation queue (priorities, shared requests)        shared code
      └ TranslatorBackend → TranslationProvider             shared code
          ├ extension: Chrome's Translator API              existing
          └ app: bridge provider                            new
               └ the app's translation host (one per app)   native
                    ├ iOS: Apple Translation (a SwiftUI view only to download)
                    └ Android: a hidden WebView running Bergamot in a Worker
```

- **Shared code**: what today calls Chrome's Translator API directly (creating a translator, `builtInTranslatorAvailable`, starting model downloads) moves behind one part, `TranslatorBackend` (`content/translate/backend.ts`). The page picks the bridge provider when the app's bridge exists, detected by the feature, not by platform name (architecture: "Browser differences").
- **The host** translates one sentence at a time. Which sentence comes next is the page's queue's decision. Each request tells the host whether it may start the engine and whether it keeps the engine alive (both false for `list`).
- **Android's hidden WebView** loads only files the app serves (`shouldInterceptRequest`), from the app's own origin, with no network. It sits behind the engine interface, so a switch to GeckoView changes only the host's inside (notes: "Android engine", boundary 1). It has a profile of its own (`translate`), so it gets a renderer process of its own (renderers are per profile, notes: "Android extension host spike (S2)"): the engine's memory and a crash stay out of the pages and the extension host (M5, 2026-11-26).
- **The bridge is reachable from Langle's scripts only**, never from the page's own scripts. How this holds on WebView older than 146 belongs to the extension API shim's design.
- One engine for the app, not one per tab: Bergamot holds about 340 MB. The host serves the page on screen only; a page in the background gets no translation until it is shown again.

## Requests and priorities
The queue serves, the most urgent first:

1. `subtitle`: the playing card
2. `window`: the dictionary window
3. `hover`: a tapped word, phrase or selection (hover on desktop)
4. `ahead`: a card about to play (new)
5. `list`: the lists' rows

- **Translate ahead**, only while Langle follows the video (on, no ad showing): whenever the set of cards that start in the next **10 seconds of video time** changes (as the video plays, when captions load, after a seek), the session asks for the new ones at `ahead` and aborts the requests for those that left it. At 2x speed the window is 5 seconds of real time.
- A card that starts playing while its `ahead` request waits joins it at `subtitle` (the queue shares requests for the same text and keeps the higher priority).
- **Cancelling**: a request can carry an `AbortSignal`. An aborted request resolves with no translation at once. The queue drops a job only when every request sharing it was aborted and it has not started; a job that has started finishes and is kept. The session asks for the new cards before it aborts the old ones, so a text in both keeps its job.
- **Display**: English shows until the translation arrives, then the translation replaces it (as in the extension today).
- The queue and the session are shared code, so the extension gets translate-ahead and cancelling too.

## Starting and releasing the engine
- **The engine starts** (both platforms) for a request from a video that uses on-device translation (`subtitle`, `ahead`), and for `window` and `hover`. A `list` request never starts it: it is translated only while the engine is already running, else it gets no translation, which the lists show as the English.
- **Both platforms release** the engine (Android: end the Worker; iOS: drop the `TranslationSession`) **60 seconds after the last translation** that was not a `list` request, and **at once when the app leaves the screen** (Android `TRIM_MEMORY_UI_HIDDEN`, iOS scene background). The 60 seconds are not measured; they are tuned on real phones. A paused video longer than that releases it too; the next sentence starts it again (first sentence 1-8 s on the Android emulator).
- Requests waiting when the engine is released get no translation. The video session asks again for such a card when the window or the playing card next changes (never on every frame); the dictionary window and the hover card ask again when they are next opened.

## Failures
- **Engine error or Worker crash**: that request gets no translation; the next request restarts the engine once. If the restarted engine fails too, on-device translation stays off until the page or video is opened again (English shows).
- **No answer**: loading gives up after 30 seconds, one sentence after 10 seconds, each as no translation. Both numbers are provisional and tuned on real phones.
- **Android renderer gone**: the hidden WebView has its own renderer (its own profile), so only the engine goes: waiting requests get no translation and the next one starts it again, as for a Worker crash. A page's renderer gone is the shell's existing rule (mobile-app.md "Engine boundary").
- **iOS `notInstalled`**: the translator is not ready (see "Downloads").

## Downloads and what they show
- **Android**: Mozilla's model for the pair (English→Japanese: 36.2 MB to download) is part of the pair's language data: one row in Settings' "Language data", one download, with that row's existing states (size, "Downloading · 45%", "Couldn't download" with Retry, "Remove"). It comes from npm (`@langle/<pack>`, through jsDelivr, then unpkg) like the packs, and is kept in the app's own files, not in the engine's storage (notes: "Android engine", boundary 2). The host reads it from there.
- **iOS with Apple Intelligence**: no download.
- **iOS without it**: right after the languages are chosen, with the packs' download, the app shows Apple's consent sheet (`translationTask` + `prepareTranslation()`; a session made without a view cannot ask for a download). If the user declines, translations stay English and the pair's "Language data" row shows "Translator not downloaded" with "Download", which shows the sheet again. The app never asks again by itself.
- **Dictionary window while the model is missing** (as in the extension): Android shows "Downloading translator · 45%" from the download's share; iOS shows "Downloading translator…" without a share, as Apple's sheet shows the progress. When the translations arrive they replace it with "Machine translation".
- **Licence**: Mozilla's models and Bergamot are open source under their own licences; their notices and attribution go on the app's notices page. Check the terms before the models ship through npm.
- The only new UI is the iOS row state "Translator not downloaded" / "Download". It goes into the mock and [ui.md](ui.md) "Mobile app" with the phone's settings screen.

## Testing
Follows [testing.md](../testing.md).

- **Shared TypeScript** (in the existing CI, so the extension is covered too):
  - The queue (Vitest unit): the five priorities in order; an `ahead` request joined by `subtitle` moves up; an aborted request resolves at once; a job is dropped only when all its requests were aborted and it has not started.
  - The video session: cards in the next 10 seconds are asked for at `ahead`; after a seek the ones outside the new window are aborted and those inside keep their jobs; a card that got no translation is asked again only when the window changes; nothing is asked while Langle is off. Hand-written cues, as in the existing session tests.
  - The bridge provider, with a fake host (the host is a boundary).
  - A refused `tlang` (a recorded 429 answer) makes the video choose on-device translation without asking `tlang` again.
- **Native**, unit tests with a fake clock (JUnit, XCTest): the 60-second release, the release when leaving the screen, the one restart, the 30- and 10-second limits, `list` never starting the engine.
- **Android on the emulator**: Bergamot loads, translates and gives about 300 MB back on release; after the renderer is killed the host is created again and the page reloads.
- **iOS**: Apple Translation on the Mac or the Simulator. If the Simulator cannot translate, it moves to the real-iPhone check.
- **CI**: the native tests run locally for now (Actions minutes are limited and emulators are heavy). CI for the app is decided when the app is built.
- **Quality and real devices** (conditions already recorded in the notes): once built, the translations of cards without `tlang` are judged blind on real content. Before release: on a real low-end Android phone during playback, 95% of sentences within 1 second (else a native build is discussed); speed on a real iPhone; the quality of Apple's traditional models.

## Build order
1. **Shared code, useful to the extension now**: `ahead` and cancelling in the queue, translate-ahead in the video session.
2. **The translator part** that hides the Translator API (creating, availability, downloads) behind one interface, with the extension's implementation; no change in behaviour.
3. **The app's hosts and bridge provider**, after the app's skeleton, the extension API shim and the engine boundary are designed (notes: "Next steps" 3).

## M5: the hosts (approved with the user on 2026-11-26)
"Build order" 3, with the user's choices of 2026-11-26: Android stays on Mozilla's models (not ML Kit); models for all 18 directions the 19 offered pairs need are published in M5; the early-load missing subtitles (notes "Open items for M4") are fixed in M5; ad blocking, own-cloud sync, Share / Open with and the checks before release are M6 or later.

### The bridge
- `appHost.translate` `{ from, to, text, start }` → the translation or `null`. `start` is false only for `list`: such a request neither starts the engine nor counts as a use for the 60-second release. The queue passes it to the provider (`TranslationProvider.translate(text, { start })`, an optional argument the built-in translator ignores).
- `appHost.translatorStatus` `{ from, to }` → `ready` (can translate now), `download` (iOS: Apple's models to be downloaded, needs the consent sheet), `packs` (Android: the model packs are not on the phone yet) or `unavailable`.
- `appHost.prepareTranslator` `{ from, to }` (iOS): shows Apple's consent sheet; resolves with the status after it closes.
- `appHost.translator` (a value in the shim, no call): `{ models: "packs" | "system" }`. `packs` (Android) makes `packsFor` add the pair's model packs, only in the app; `system` (iOS) adds none. Detected by the feature, never the platform's name.
- The native host answers a request from a page that is not on screen with `null` at once.

### The bridge provider (shared TS)
- `TranslatorBackend` picks it where `appHost` exists (`translatorBackend()`). `create` → a provider whose `open` asks `translatorStatus` (`download: false` never shows a sheet), `translate` calls `appHost.translate`, and `watchDownload` follows the model packs' `packState` (Android, with their share) or the sheet (iOS, no share).
- `available` is `translatorStatus` other than `unavailable`. `downloadModels` calls `prepareTranslator` on iOS (right after the languages are chosen) and does nothing on Android (the packs download with the pair's). `downloadOnFirstActivation` does nothing in the app.

### Model packs (Android)
- One npm package per direction, `@langle/mt-<from>-<to>` (18: `en` to each of the 15 natives, `de`, `es` and `fr` to `en`), in the lock with `kind: "model"`, files split below the CDNs' per-file limit and each checked by SHA-256. A pair with no direct model uses two through English (`de`→`fr` = `mt-de-en` + `mt-en-fr`); the definitions' language (English) to the native one uses the same packs.
- **Native code downloads them** into the app's files (boundary 2), from the lock's mirrors in order, checking each file: the background asks with `appHost.models.ensure` (`{ pack, files: [{ path, sha256, size }], mirrors }`), progress and the end come back as `appHost.models.onProgress` events, and the background keeps them in `packState` like any pack, so Settings' "Language data" row shows them with the states it has. `appHost.models.remove` deletes a pack's files. Nothing of the model crosses the bridge.
- Bergamot's WebAssembly build and its glue are code: pinned by version and SHA-256, fetched by a script and shipped in the APK (never downloaded at run time). Mozilla's models and Bergamot are both MPL 2.0 (checked 2026-11-26), and their notices go on the app's notices page. The packs' format, the parts and `manifest.json`: architecture.md "Model packs".

### The Android host
- A hidden WebView in the `translate` profile on the app origin loads `translate-host.html` (shared TS in the `langle-app` build): it runs Bergamot in a Worker, reads the model files the app serves from its files, and translates through English where the pair needs it. Native code relays requests, keeps the release rules (60 seconds, `TRIM_MEMORY_UI_HIDDEN`, one restart, 30- and 10-second limits) and serves the files.

### The iOS host
- `TranslationSession(installedSource:target:)` with `preferredStrategy` `highFidelity`; the status from `LanguageAvailability`; `prepareTranslator` presents a SwiftUI view with `translationTask` and `prepareTranslation()`. The same release rules (scene background in place of `TRIM_MEMORY_UI_HIDDEN`).
- Settings' "Language data" row for the pair shows "Translator not downloaded" with "Download" while the status is `download` (mock first).

### Checks on the devices
- Check builds get a switch through `langle:check-settings` that treats YouTube's translation as refused, so a video that would get `tlang` (the TED baseline) shows on-device translated subtitles. Production builds leave it out.
