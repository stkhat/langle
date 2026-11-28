# Site access spike (S0, measured 2026-11-28)

Answers to the eight questions of [site-access](../plans/site-access.md) "S0 Spike in Chrome". The questions were measured with a check build on a branch that is never merged (`claude/site-access-spike`). It ran in the user's Chrome **158.0.0.0** (macOS, Japanese UI, unpacked) and was driven through Claude in Chrome. Test pages were served from `localhost:8765` and `127.0.0.1:8765`; the two names count as two hosts.

The spike manifest added `activeTab`, `scripting`, `declarativeContent` and `optional_host_permissions: ["*://*/*"]`, and had no `host_permissions` (WXT adds a runtime script's matches there; a `build:manifestGenerated` hook removed them). `content.js` used `registration: "runtime"`. A worker-side harness ran the experiments and wrote to the check error log as `info` entries. Toolbar icons were read from screenshots of the window.

**Gate: passed.** The mark works (1, 2), and 2,000 undecided-host exclusions fit with room to spare (3).

## 1. The mark: `SetIcon` from `declarativeContent`
- `SetIcon` with `imageData` decoded in the MV3 worker works: `fetch` → `createImageBitmap` → `OffscreenCanvas` → `ImageData` at 16 and 32 px. The marked icon shows on a matching page. On a non-matching page, and after the tab navigates to one, the default icon comes back.
- **A global `action.setIcon` beats the rule**: once an icon is set globally, matching pages no longer show the mark. No call unsets a global icon; only an extension reload cleared it.
- **A per-tab `action.setIcon({ tabId })` beats the rule too, until the tab navigates.** On a matching page with a per-tab gray icon, the icon stayed gray. After a reload of that tab, the mark showed.
- Between two rules matching the same page, the higher `priority` wins.
- Rules survive `runtime.reload()` (onInstalled reason `update`) and a version bump, and apply to tabs already open. In the user's steps the rules were gone after a reload from `chrome://extensions` followed by a browser start. Which of the two cleared them was not measured.

What this means for S2:
- `toolbar-icon.ts` must never set a global icon while Langle is on.
- The gray icon while Langle is off should be per tab: every open tab, then tabs as they load. Per-tab icons go away on navigation. Rules exist only while Langle is on, so there is nothing to conflict with while off. After switching back on, an open tab shows the mark from its next navigation.
- Rebuild the rules on every install, update and start (remove all, then add); do not rely on persistence. Use one priority for all mark rules.
- A granted host stays marked as long as the rule's URL regex does not exclude it. The real rule excludes decided hosts; the complement rule was checked end to end (excluded hosts plain, others marked).

## 2. `css: ['html[lang|="en"]']`
| `<html lang>` | Mark |
|---|---|
| `en` | yes |
| `en-GB` | yes |
| `EN` | yes |
| `eng` | no |
| `fr` | no |
| none | no |
| none, set to `en` 3 s after load | yes, follows the change |
| `en`, set to `fr` 3 s after load | no after the change |

## 3. `pageUrl.urlMatches` limits and timings
- Invalid regexes are refused through `runtime.lastError`, and nothing of that `addRules` call is stored. Examples: lookahead `invalid perl operator: (?!`, backreference `invalid escape sequence: \1`, unbalanced `missing ):`.
- **One complement regex** (the trie shape S2 builds, see below) is accepted up to **1,894 hosts / 476,851 chars**. At 1,895 hosts / 477,275 chars it is refused as a parse error (RE2's program-size limit, so the limit depends on the shape, not only on length).
- A plain alternation of literal hosts is accepted up to 32,767 hosts / 683,214 chars. One more host is refused.
- `removeRules` + `addRules` with the complement split into regexes under 100k chars each, one rule with one condition per regex, three runs:

| Hosts | Regexes | Total chars | Build (worker) | Replace, median |
|---|---|---|---|---|
| 50 | 1 | 18k | 3 ms | 19 ms |
| 500 | 2 | 151k | 14 ms | 162 ms |
| 2,000 | 7 | 500k | 55 ms | 449 ms |
| 5,000 | 13 | 1.14M | 177 ms | 1,073 ms |

- With pieces under 20k chars, 2,000 hosts take 29 regexes and 664 ms; small pieces cost more.
- The shape: `^https?://` then, per trie node, `(?:[:/]|[^<kids>:/][^:/]*[:/]|k1(…)|k2(…))`, with `[^:/]+[:/]` after a leaf. The pieces split the trie by leading characters. Checked in Node against a plain set over 50, 500 and 2,000 sample hosts with 0 wrong.
- **For S2**: cap each regex at about 100k chars, which is far under the measured limit and still keeps 2,000 hosts at 7 conditions. Keep one rule with many conditions.

## 4. `permissions.request` from the popup
- **Chrome's prompt closes the popup**, for Allow and for Deny. The popup logged the call but never logged the promise settling. The background must finish the grant, as the spec plans.
- `permissions.onAdded` fires in the worker on Allow: `{"origins":["*://127.0.0.1/*"],"permissions":[]}`, 7.2 s after the click (the user's time on the prompt).
- Right after `onAdded`, the worker registered the script (23 ms). It then ran `scripting.executeScript` of `content.js` into the pending tab, which succeeded in 39 ms. **Highlights appeared without a reload** and stayed after one.
- On Deny, nothing reached the worker (no `onAdded`), and the page was left as it was.

## 5. Registered content scripts
- **`persistAcrossSessions: true` does not survive an extension update**: after `runtime.reload()` (same version, reason `update`) and after a version bump (0.1.0 → 0.1.1), `getRegisteredContentScripts()` returned `[]`. Grants survive both, and a browser start.
- Registering a script for a host without a grant succeeds without an error, but injects nothing.
- **For S1**: rebuild the registration from `permissions.getAll()` on every `onInstalled` (any reason) and on `onStartup`, not only on `onAdded` / `onRemoved`.
- Not measured: survival of a registration across a browser restart (the registration was already gone after an update before the restart), and `updateContentScripts` on the next navigation. S1's start-up sync makes both moot; its unit tests cover the update path.

## 6. `activeTab` from the popup
| Tab | `tabs.query` `url` | Probe (`executeScript` → `<html lang>`) |
|---|---|---|
| Article (`127.0.0.1`, `localhost`) | the full URL | `"en"` / `"en-GB"` in 17–28 ms |
| `chromewebstore.google.com` | the URL | fails: `The extensions gallery cannot be scripted.` |
| Error page (`localhost:1`) | the URL | fails: `Frame with ID 0 is showing error page` |
| `chrome://extensions` | `null` (also `pendingUrl`, `title`) | fails: `Cannot access a chrome:// URL` |

- Every failure arrives as a rejected promise within 7 ms, so S3 can hide "On this site" on any failure.
- Without `activeTab` (from the worker), `executeScript` fails with `Cannot access contents of the page. Extension manifest must request permission to access the respective host.` This happens on YouTube too: the static `content_scripts` matches show in `permissions.getAll()` but do not allow `executeScript`.

## 7. Chrome's own UI
- `chrome://extensions` details (Japanese UI): "Permissions" has no items. "Site access" reads "Allow this extension to read and change all your data on websites you visit", with a menu that showed "On all sites".
- With that menu on "On all sites", `permissions.getAll()` did not list `*://*/*`, and no `onAdded` was logged. A page on another host got no highlights, but no script was registered then (5). Whether that menu ever reaches `onAdded` was not settled; S1 handles a `*://*/*` grant anyway.
- Not measured: the install prompt's wording (an unpacked build shows none), the menu's other options, and the extensions (puzzle) menu's per-site options. Check them in S4's real-site check with a packed build.

## 8. Playwright
Measured with Playwright's bundled Chromium, headless, the extension loaded through CDP `Extensions.loadUnpacked` as `e2e/fixtures.ts` does:
- `permissions.request` from the worker rejects: `This function must be called during a user gesture`.
- From an extension page, inside a Playwright click (a trusted gesture), it **never settles**: no answer within 5 s, and the prompt cannot be answered.
- **A test-only `host_permissions: ["*://localhost/*"]`** in a copy of the build works. The origin shows in `getAll()`, a script registered for it from the worker injects, and without the registration nothing injects.
- `permissions.remove` of that origin is refused: `You cannot remove required permissions.`
- **So E2E covers**: start-up registration and highlights on the granted test origin, and no highlights on an origin without a grant. Unit tests with fake `permissions` / `scripting` cover the request, `onAdded` / `onRemoved`, the pending injection and turning off. The prompt and the mark stay with the real-site check.

## 9. S4 real-site check (2026-11-28)
The check build of `f218529d` (S1 to S3 merged) in the user's Chrome 158, Japanese UI, learning English. The build replaced one that had `<all_urls>` as a manifest host; after the reload no article site was granted (the old grant did not carry over to `*://*/*`).
- **The mark**: an English site not decided yet (theguardian.com, apnews.com, bbc.com after a browser restart) showed the orange dot; a Japanese one (news.web.nhk) did not; a site on Never run on (npr.org) did not; the Guardian lost it once the popup had been opened there and the page loaded again.
- **The popup**: the first opening on the Guardian showed the switch off with the orange ring and the bubble; the second opening showed no bubble.
- **On**: Chrome's prompt, Allow, highlights on the open page with no reload (27 New); the next page on the host was highlighted (registered script).
- **Off**: the highlights and Langle's UI left the page. `chrome://extensions` then dropped the host from the extension's site list, and **Chrome turned the extension's "Automatically allow access on the following sites" switch off by itself**; YouTube and Netflix kept their own switches and kept working. Chrome also reloaded the tab at least once.
- **Back on after off: no prompt.** Chrome grants a host it granted before again silently; `permissions.getAll()` lists it, `contains` is true and the `articles` script matches it, but the open page got no script: the grant's `onAdded` came before the popup's `siteAccessPending`, so there was no pending tab to inject into. A reload ran Langle. Fixed after the check: `setPending` injects at once when the host is granted already (architecture "Turning a host on and off").
- **A state not reproduced**: once, after an off and an on with the prompt, the top switch was off, YouTube's and Netflix's switches were off and apnews.com was on, so Langle ran nowhere. The user does not remember changing them; the same steps done again left YouTube and Netflix on. Turning the switches back on in `chrome://extensions` restored everything.
- **Browser restart**: the Guardian highlighted, YouTube highlighted, bbc.com showed the dot.
- **YouTube and Netflix**: unchanged (YouTube checked; highlights, no errors).
- The check build's error log stayed empty through the check and was cleared at the end. Never run on was set through the settings channel and restored.
- Not checked: the install warning of a packed or store build (an unpacked build shows none); the extensions (puzzle) menu's per-site options.
