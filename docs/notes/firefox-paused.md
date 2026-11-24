# Firefox paused (2026-11-24)

Langle is built and tested for Chrome only, for now. The user decided on 2026-11-24 to pause the Firefox version. The code stays browser-neutral ([architecture](../specs/architecture.md) "Browser differences"), so Firefox can come back without a rewrite.

## Why
1. **Heavy tests.** Playwright's Firefox does not launch on the dev Mac (macOS 27: "Could not find profile folder."), so the browser tests ran on Firefox in CI's Playwright image, in Docker on a Colima VM (4 CPUs, 4 GB, an image of 3.6 GB), split over 3 containers because Firefox runs its test files one at a time ([notes](firefox-tests.md)). That lane needed the sandbox off, a lock between parallel sessions, and its own flake fixes.
2. **No LLM features.** Firefox has no Translator API and no Prompt API: no machine translation of subtitles, articles or English definitions, and no "In this sentence".
3. **Few users** compared with Chrome.

## What was removed
In the pull request "Pause Firefox: Chrome-only build and tests" (restore from git from there):
- `scripts/test-firefox.ts` (`npm run test:browser:firefox`, Docker on Colima, `--shards=N`) and the Firefox lane of `scripts/verify.ts` (`--skip-firefox` stays accepted and does nothing)
- Firefox in Vitest browser mode (`vitest.config.ts`: `VITEST_BROWSERS`, `fileParallelism: false` for Firefox)
- The scripts `dev:firefox`, `build:firefox`, `zip:firefox`, and the `web-ext` dev dependency (`web-ext lint` in CI)
- `browser_specific_settings.gecko.id` (`langle@stkhat`) in `wxt.config.ts`, and the `firefox-mv3` cases of `tests/manifest.test.ts` (Gecko id, `background.scripts`)
- Firefox steps in `ci.yml`, `cross-os.yml` (Playwright's Firefox) and `release.yml` (the Firefox zip)
- The `/core` entry of `.gitignore` (Firefox's out-of-memory crash dumps in `verify`)

Kept: WXT's `browser` for every extension API, feature detection, `BrowserEnv` with Firefox's names ("Firefox", "Firefox Sync", the AMO review URL in `REVIEW_URLS`), and the Firefox workarounds and comments in `src/` (harmless in Chrome). `scripts/playwright-image.ts` and `scripts/test-lock.ts` stay: CI's image check and `verify` still use them.

## Open issues when it was paused
From `docs/status.md`:
- `data_collection_permissions` missing in the manifest (AMO requires it for new add-ons)
- Highlight-underline support not detected (Firefox 140 draws `CSS.highlights` without `text-decoration`)
- `adoptedStyleSheets` / `CSS.highlights` not checked from a Firefox content script
- The Firefox build was only built and linted, never run as an extension; only the browser tests ran on Firefox

## How Chrome and Firefox differ
| Feature | Chrome | Firefox |
|---|---|---|
| Browser sync (`storage.sync`) | Google account, almost immediate | Mozilla account (stored encrypted), about every 10 minutes or "Sync now"; needs "Add-ons" on in sync options and the Gecko id in the manifest (without it `storage.sync` does not work); not synced on Android |
| Translator API (subtitles, sentences, English definitions) | 138+ | none (Mozilla opposes it): videos without a site translation and articles get no translation; English definitions show as they are, up to 9% of tokens for a pair passing the gate by its token rule (hi 8.7%) |
| Prompt API ("In this sentence") | yes | none: the section and its Settings rows are hidden |
| Background | service worker | event page (`background.scripts`), which has a DOM |
| Downloaded language data | IndexedDB | IndexedDB (Cache Storage on `moz-extension:` only behind a pref, so not used) |
| Article highlights (CSS Custom Highlight API) | with underlines | from 140, without underlines: use background colors only (detection to be written) |
| Selection inside shadow roots | `getComposedRanges`, older `ShadowRoot.getSelection` | `getComposedRanges` in recent versions |
| Page (MAIN world) scripts | yes | from 128 |
| File System Access API | yes | none (folder saving not offered) |
| OAuth (cloud sync) | `launchWebAuthFlow` | `launchWebAuthFlow` only; redirect `*.extensions.allizom.org` |

Also to confirm: minimum versions of `Intl.Segmenter`, `caretPositionFromPoint`, `requestVideoFrameCallback`, `CompressionStream`, `speechSynthesis`; whether Firefox MV3 grants manifest host permissions at install or asks. Publishing on addons.mozilla.org needs the source code and build instructions (it reviews built, minified code), and every text file under 5 MB.

## If Firefox comes back: spike list
1. Restore the build and test lane from the pull request above: `build:firefox` / `zip:firefox`, `web-ext lint`, Firefox in `vitest.config.ts` (files one at a time) and the Docker lane in `verify`, or a lighter one if Playwright's Firefox launches on the dev Mac by then
2. The Gecko id in the manifest, then check `storage.sync` with a Mozilla account (delay, "Add-ons" option)
3. The event-page background: pack downloads, alarms and the caches run there instead of a service worker
4. `data_collection_permissions` in the manifest, and the AMO listing (source upload)
5. Highlights: detect underline support for `CSS.highlights` and fall back to background colors; check `adoptedStyleSheets` from a content script
6. Cloud sync: register Firefox's redirect (`*.extensions.allizom.org`) in Google's Web client (and Dropbox's), check `launchWebAuthFlow` there, and whether Firefox takes `identity` as an optional permission
7. No Translator: check what the English-definitions fallback shows per pair, and whether Firefox offers a translation API for extensions by then
