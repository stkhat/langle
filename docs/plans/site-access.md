# Articles site by site: implementation plan

> **For agentic workers:** the main session orchestrates; each phase below is one subagent and one stacked PR ([CLAUDE.md](../../CLAUDE.md), "Working style" and "Token budget"). Steps use checkbox (`- [ ]`) syntax for tracking; tick a phase when its PR is ready.

**Goal:** Langle stops asking for every site at install. YouTube and Netflix stay as they are; articles run on a site once the user turns it on there, with Chrome's own prompt. A new site in the learning language gets an orange dot on the toolbar icon, and the first popup on it puts a bubble on the "On this site" switch. Both show once per host.

**Spec:** [ui.md](../specs/ui.md) "Articles site by site" and "Toolbar popup"; [architecture.md](../specs/architecture.md) "Site access". Mock: the canvas row `Articles site by site — …` (y 25500, mark A chosen 2026-11-28). The mock wins where they disagree.

**Why now:** the Chrome Web Store's reply to the first submission (2026-11-28) flagged the `<all_urls>` content script and asked for `activeTab` or listed hosts. The first submission goes in with `<all_urls>`; this ships as the next version, or as the resubmission if the review refuses `<all_urls>`.

**Tech stack:** TypeScript, WXT + Preact, Vitest (unit in Node, browser on real Chromium), Playwright E2E.

---

## Before you start
- Read [CLAUDE.md](../../CLAUDE.md), [docs/testing.md](../testing.md), and the spec sections above.
- One worktree and branch per phase off the previous phase's branch (phases stack); the PR's base is that branch. S0 is off `origin/main`.
- Commit after each task (no Claude attribution). `npm run verify` before every push; draft PR, then `gh pr ready` once verified. PR bodies through an absolute `--body-file` path, read back with `gh pr view <n> --json body`. The subagent stops at `gh pr ready` and reports the PR number and branch; the main session merges.
- Every string through `t("key")`, in every locale file the project keeps ([ui-languages](ui-languages.md)).
- Extension APIs through WXT's `browser`; feature-detect `declarativeContent`, `scripting` and `permissions` (the phone app's shim lacks them).

## Progress
- [x] S0 Spike in Chrome (no product code): answers in [site-access notes](../notes/site-access.md)
- [ ] S1 Grants: manifest, registration, no-reload injection
- [ ] S2 The mark (`declarativeContent`)
- [ ] S3 The popup: the switch, the bubble, seen hosts
- [ ] S4 Store texts, privacy policy, real-site check

S2 and S3 both stack on S1 and touch different files, so they may run in parallel; S4 goes last.

---

## S0 Spike in Chrome
Answer these in a throwaway extension (or a check build on a branch that is never merged) in the user's Chrome through Claude in Chrome, and write the answers to `docs/notes/site-access.md` (a docs-only PR). Each answer says what was measured and on which Chrome version.

1. `declarativeContent` `SetIcon` with `imageData` built in the MV3 service worker (`fetch` → `createImageBitmap` → `OffscreenCanvas` → `ImageData`) shows on a matching page, and the icon goes back when the tab navigates to a non-matching page. Whether `SetIcon` wins over a global `action.setIcon` and over a tab's own icon.
2. `PageStateMatcher` `css: ['html[lang|="en"]']` matches `lang="en"`, `"en-GB"`, `"EN"`, not `"eng"` or `"fr"`; it follows a `lang` set after load (single-page sites).
3. `pageUrl.urlMatches` limits: the largest regex Chrome accepts, how errors show (`addRules` callback, `runtime.lastError`), and how long `removeRules` + `addRules` takes with the complement regex for 50, 500 and 2,000 hosts, split per leading character. If no split keeps 2,000 hosts working, record the limit.
4. `permissions.request({ origins: ["*://host/*"] })` from the popup: does Chrome's prompt close the popup; does the returned promise resolve; does `permissions.onAdded` fire in the background either way; can the background `scripting.executeScript` into the tab right after.
5. `scripting.registerContentScripts` with `persistAcrossSessions: true` survives a browser restart and an extension reload/update; `updateContentScripts` with new `matches` takes effect on the next navigation.
6. `activeTab` from the popup: `tabs.query` gives the tab's `url`; `scripting.executeScript` of a one-line function returns `document.documentElement.lang`; it fails cleanly on `chromewebstore.google.com`, `chrome://` and an error page.
7. With `optional_host_permissions: ["*://*/*"]`: the install prompt's wording, and what Chrome's extensions menu and extension settings show ("On click", "On this site", "On all sites") and what `onAdded` reports for each.
8. Whether Playwright can reach the grant path at all (for example a test-only `host_permissions` entry for the test server, or any launch flag); if not, what E2E can still cover.

**Gate:** if 1, 2 or 3 fails (no mark possible, or too few hosts), stop and bring the choice to the user with a recommendation (for example: no mark, the bubble alone; or the mark only up to the measured number of hosts). If 4 shows the popup always closes, S3 relies on the background (already planned).

## S1 Grants
Files: `wxt.config.ts`, `src/entrypoints/content/index.tsx`, a new `src/background/site-access.ts` (+ tests), `src/entrypoints/background.ts`, `tests/manifest.test.ts`, `tests/app-manifest.test.ts`, the E2E build config.

- [ ] Manifest (Chrome): add `activeTab`, `scripting`, `declarativeContent`; `optional_host_permissions: ["*://*/*"]`. `content.js` gets `registration: "runtime"` in the Chrome build and stays a `<all_urls>` manifest script in `langle-app`. Manifest tests say both.
- [ ] Start-once guard in `content/index.tsx`, so a registered and an injected copy never both run.
- [ ] `site-access.ts`: from `permissions.getAll()`, keep the registered script `articles` equal to the granted article origins (register, update, unregister); follow `onAdded` / `onRemoved`, start-up and install. Deps passed in, like `toolbar-icon.ts`, so it is unit-tested with fakes.
- [ ] Pending injection: a `siteAccessPending { tabId, host }` message (in `src/messaging/`), kept in `storage.session`; an `onAdded` covering that host injects `content.js` into the tab once.
- [ ] Removal: on `onRemoved`, tell the host's open tabs to stop (the content script's existing site-off path).
- [ ] `siteSeen` in `storage.local` with read/add helpers (used by S2 and S3).
- [ ] E2E: the E2E build lists the test server's origin in `host_permissions`; the article E2E passes unchanged. Add one E2E that a page on an origin without a grant gets no highlights.

Done when: verify passes; in a dev build an origin granted from the service worker console gets highlights on the next load.

## S2 The mark
Files: `scripts/make-icons.ts`, `public/icon-new/`, `src/core/site-access/undecided-url.ts` (+ tests), `src/background/site-mark.ts` (+ tests), `src/entrypoints/background.ts`.

- [ ] Draw `icon-new/16.png` and `32.png`: the colored icon with mark A (`#F76707` dot at the top right, about half the icon, a transparent cut-out ring), checked against the mock's `SiteAccessNew` and `SiteAccessMarks` A at both sizes.
- [ ] `undecidedUrlRegexes(decided: { exact: string[]; withSubdomains: string[] })`: RE2-only regexes, split per leading-character group, matching `^https?://H(:\d+)?/` exactly for hosts outside the set. Unit tests against a plain set check (random hosts, subdomains, ports, punycode, a host that is a prefix of another) and a syntax check (no lookaround, no backreferences, under the size limit from S0).
- [ ] `site-mark.ts`: build the rules (`PageStateMatcher` with `css` for the learning language and each regex, `SetIcon` with the decoded images) and rebuild them on every change the spec lists; none while Langle is off or not set up, or `articles` is off. Skip the whole part where `declarativeContent` is missing.

Done when: verify passes; in a dev build an English page on a new host shows the dot, and it goes after the popup opens there (with S3) or the host is added to Never run on.

## S3 The popup
Files: `src/entrypoints/popup/main.tsx`, `Popup.tsx`, a small view function (+ tests), `Popup.browser.test.tsx`, the locale files.

- [ ] Host and probe: where no content script answers on an `http`/`https` tab, read the tab's `url` (`activeTab`) and probe `<html lang>`; a failed probe hides "On this site".
- [ ] Seen: add the host to `siteSeen` on opening, after deciding whether this is the first opening.
- [ ] View: the row's states (first opening with the bubble, first opening without it, later, on, off), the ring and the bubble as the mock draws them (Nunito 15 px 800, `#A33F00` on `#FFF0E6`, the tail at the top right); "This page" hidden until the host is on.
- [ ] Switch: on → `siteAccessPending`, then `permissions.request`, and drop the host from `disabledSites`; off on an article host → `permissions.remove`. YouTube and Netflix keep today's `disabledSites` toggle.
- [ ] Browser tests for each state; render the popup and compare it with the mock's `SiteAccessAsk` and `SiteAccessLater` before committing.

Done when: verify passes and the rendered popup matches the mock.

## S4 Store texts and the real-site check
- [ ] Privacy policy (`site/langle/privacy/`): articles run only on sites the user turns on; opening the popup reads the tab's address and `<html lang>`, kept in this browser as seen hosts.
- [ ] [chrome-store-listing.md](chrome-store-listing.md) and the review justifications ([store-data-review](../notes/store-data-review.md) "Drafts for the listing's privacy fields"): `activeTab`, `scripting`, `declarativeContent`, the optional host permission; drop the `<all_urls>` text.
- [ ] [chrome-store-launch.md](chrome-store-launch.md) E2 and C12 C-h, [status.md](../status.md).
- [ ] Real-site check in the user's Chrome ([development.md](../development.md) "Checking in your own Chrome"): install warning; the mark on a new English article site, none on a Japanese one; the bubble once; Chrome's prompt, Allow, highlights without a reload, the next page on the host; off and back on; Never run on; YouTube and Netflix unchanged; a browser restart. Read and clear the check build's error log.
