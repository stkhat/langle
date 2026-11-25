# Chrome Web Store launch

Checked 2026-11-22 against `main` at 6421ee32, its production zip and the store's pages of that day (Sources, at the end). It will replace [status](../status.md) "Before publishing" and [architecture](../specs/architecture.md) "Chrome Web Store requirements" as the launch checklist (E8 brings them in line).

Owner: **U** the user, **C** Claude, **U+C** Claude prepares and the user decides or submits. **Blocker**: no submission without it.

## Order

1. Decisions still open (A5) and the developer account (B1–B3)
2. In parallel: consent and the other code fixes (C), the public site (D), the repository (F)
3. Upload a draft for the item id (B4), then the Google client (H1, now before the launch) and the listing (E)
4. Release candidate, checks, submission to testers (G). Review takes a few days to a few weeks; broad host access makes it slower
5. After testing: the repository (F3), then Public (G6)

## A. Decisions (U)

| #   | Decision | State |
| --- | --- | --- |
| A1 | Google Drive sync | **Decided 2026-11-23**: in the first release |
| A2 | Monetisation | **Decided 2026-11-23**: "Buy me a coffee" (Ko-fi) only; no affiliate card, no sponsor spot |
| A3 | Trader or non-trader (EU) | **Decided 2026-11-23**: non-trader. The listing then tells EU users that consumer rights do not apply to contracts with the developer. Look at it again before earning more than donations (a sponsor, an affiliate card, sales) |
| A4 | Repository visibility | **Decided 2026-11-23**: public while only testers can install. Before Public: decide again (private as first intended stops npm provenance and needs the site elsewhere) |
| A5 | Publisher name, emails, site domain | **Contact email decided 2026-11-23**: the npm maintainer's address, already public, for the listing, the site, the policy and the OAuth consent screen. **Sign-in account decided 2026-11-25**: another of the user's Google accounts, not the contact address (Google's identity check kept failing there, so its 2-Step Verification could not be turned on); its address is not published and stays out of this repository; it cannot be changed. The contact address is verified by mail and needs no sign-in. Open: the publisher name, the domain (one we can verify for Google: our own `github.io` host or a domain) |
| A6 | The name "Langle" | **Decided 2026-11-23**: keep "Langle" |
| A7 | First visibility | **Decided 2026-11-23**: Private to trusted testers. It gets the same review as Public |

Affiliate: the policy names "inserting affiliate links when no discount, cashback, or donation is provided" as a violation. The planned card (a commission, no benefit to the user) probably is one: check this again before any affiliate card after the launch (none at launch, A2).

## B. Account (U)

- [x] B1 **Blocker**: register the developer account and pay the one-time fee (2026-11-25, the sign-in account in A5)
- [ ] B2 **Blocker**: 2-Step Verification; publisher name; verify the contact email (A5; it may differ from the sign-in account). Both the name and that email show on the listing
- [ ] B3 **Blocker**: declare non-trader (A3)
- [x] B4 **Blocker**: upload a draft zip without submitting: this gives the item id, which the Google client needs (H1), and runs the store's installation test. Item id `dldcjcapnikfmodbgnnlbkilbcepnbnf` (2026-11-25)
- [ ] B5 **Blocker**: list the testers (Google accounts in the account settings, or a Google Group we own)

## C. Product (C)

- [x] C1 **Blocker**: first-run disclosure and consent (built 2026-11-23 with C11; [UI](../specs/ui.md) "First-run consent", [architecture](../specs/architecture.md) "First run"). The store requires a screen in the product and an explicit action before any user data is collected or handled, local-only data included; the listing and the privacy policy do not count. New installs and a second device with synced settings are asked, and every device again when the disclosure changes (`CONSENT_VERSION`); an update of a device from before the setup (a build no store offered) is set up as it is; the page hooks at document_start hold what passes unread until the consent is known. Left: C8 (the link), and the check in a clean Chrome profile (G3)
- [ ] C2 **Blocker** (A1): turn Drive on in production. `PRODUCTION_GOOGLE_CLIENTS` is the Web client (2026-11-25, H1); `identity` kept. Left: check connect, history, renewal and Disconnect in the store build (G5)
- [x] C3 **Blocker**: ship the licences of the bundled code and fonts (built 2026-11-24; [architecture](../specs/architecture.md) "Licenses"). Every build writes `THIRD_PARTY_LICENSES.txt` at the root of the zip from the packages its output comes from (15 today: Inter and Nunito with the full OFL, Preact, Dexie, WXT's runtime and what it brings in, Vite's and Rolldown's helpers) and fails for a package without a license text; the data sources and licenses page links to it
- [ ] C4 Set `minimum_chrome_version` (none today; `world: "MAIN"` alone needs 111) and test on that version
- [ ] C5 Store icon: `icon/128.png` fills all 128 px; the store asks for about 96 px of artwork with transparent padding
- [ ] C6 Rewrite the manifest description ("videos … you already read"); 132 characters at most
- [ ] C7 Fill `KOFI_URL` in `src/core/links.ts`, and the feedback form if wanted (U makes the pages). `SPONSOR_PAGE_URL` stays empty and `SPONSOR_CARD` null, which hides the spot and both sponsor links
- [ ] C8 Link the privacy policy from the consent screen and Settings
- [ ] C9 Go through status "Known issues" and mark what blocks a launch. First candidates: PR 238 (draft, a settings change overwritten by an older echo), the first download (about 24 s for English → Japanese, one file at a time), no hover while a dictionary is missing
- [x] C10 **Blocker**: correct the sync copy in Settings. It says only each word and its status are synced, but settings sync too (the hosts of Never run on and of switched-off sites among them), also with word sync off. Done 2026-11-24: the section's lead says settings, site lists included, are always saved to browser sync; the switch says it adds each word and its status
- [x] C11 Language choice right after install (decided and built 2026-11-23): "Your languages" follows consent; Start downloads, returns to the page that was open before, reloads that tab if Langle isn't running in it, and opens the toolbar popup. Tested on headless Chromium. Left for G3, in Chrome itself: the popup opening by itself and across the reload, a page that asks before it is left, a page where extensions can't run, the translation model's download after the setup tab closes

## D. Public site (C writes, U publishes)

- [ ] D1 **Blocker**: a public home page saying what Langle does, with support contact and a link to the policy
- [ ] D2 **Blocker**: privacy policy
  - Stored on the device: terms, sentences, URLs and titles, sentence history, settings; retention and deletion
  - Browser sync: what goes there, the settings' host lists included
  - jsDelivr and unpkg: they see the IP address and the packs fetched
  - Chrome's on-device AI and translator: what they are given
  - Read aloud: the browser's voice gets the word, and a remote voice sends it to its provider
  - All that the short consent screen leaves to the policy: history on by default, its 50 MB limit and how to turn it off, incognito, words' sentences kept with history off, what the AI is given without a click
  - No servers: Langle saves only on the device and in the user's own cloud services (as the consent screen says); the developer receives nothing; what other services may keep of the requests they get; links that leave the product
  - The Limited Use statement
  - Google Drive: what goes there (terms, sources and sentences, history unless switched off, settings), the account's email kept on the device, how to disconnect and delete
  - Ko-fi: a plain link; Ko-fi and the payment provider handle what a supporter enters

## E. Listing (C drafts, U enters)

- [ ] E1 **Blocker**: description: features, sentence history (prominently), the download after setup, on-device AI and its device requirements, the supported pairs, Drive sync, the Ko-fi link. No keyword lists
- [ ] E2 **Blocker**: single purpose, and a justification for each of `storage`, `alarms`, `identity` and `<all_urls>`
- [ ] E3 **Blocker**: data-use checkboxes (at least website content, web history and, with Drive, personally identifiable information (the email); go through the rest), the Limited Use certifications, "no remote code", the policy's URL. All must agree with D2 and with what the build does
- [ ] E4 **Blocker**: 1–5 screenshots at 1280×800, with demo content we have the rights to: no Netflix titles, real creators' videos, logos or personal data
- [ ] E5 Small promo tile 440×280 (items without one rank after those with one); marquee 1400×560 optional
- [ ] E6 **Blocker**: category, language, regions, content rating; support and home page URLs
- [ ] E7 Reviewer notes: test steps that need no Netflix account, why page hooks are needed on YouTube and Netflix, that subtitles are only those the user can already access and that there is no download of media. This is the largest policy risk left ("unauthorized access to content"); read both sites' terms before submitting
- [ ] E8 Bring status and architecture in line: the consent rule, no affiliate or sponsor at launch, Drive in production, when the repository turns private

## F. Repository (it is public today)

- [x] F1 **Do first, the repository stays public**: recorded YouTube captions are committed (`src/core/subtitles/fixtures/youtube/`, a talk's human translation among them). Replace them with made-up lines, as the Netflix fixtures are. Done: all text in the 10 caption files is made up (word-for-word substitution on the recorded timings, segment splits and ASR shapes), the talk's Japanese translation and its translator credit included; `captionTracks.json`, the watch-page fixtures and the test helpers use made-up video ids, titles and channel names (`sampleVid01`). Git history still holds the old files, see F2
- [x] F2 Remove personal identifiers from the committed notes; decide whether the history needs rewriting (U). Done 2026-11-25 (user's choice: rewrite): `main` was rewritten with git-filter-repo and force-pushed. Every commit now has F1's made-up versions of the 14 YouTube fixture files; older test lines that quoted the recorded captions, the talk's full title with its channel, the translators' names, a Netflix profile name and a local home path were replaced in every text file outside `data/` (packs untouched, so the lock's hashes hold). Today's tree changed only in four quality notes. The real video ids named in the notes, plans and `scripts/mobile/phone-check.ts` stay on purpose (user's choice): they are public videos used for live-site checks, and none of them reaches the build. Left for the user: ask GitHub Support to drop the old pull-request refs and cached views (PRs #2–#269 point at the old commits), see MANUAL-TASKS.md
- [ ] F3 While public: add a code licence, or state that there is none on purpose. Decide the visibility again before G6

## G. Release

- [x] G1 **Blocker** (C): confirm every pack version in the lock downloads from both mirrors. Checked 2026-11-24 on main at b604539c: all 154 files of the 24 packs downloaded from jsDelivr and unpkg (308 downloads) with the lock's SHA-256 and size. Check again if the lock changes before G4
- [ ] G2 **Blocker** (C): `npm run verify`, `cross-os.yml` and a dry run of `release.yml` (neither workflow has ever run)
- [ ] G3 **Blocker** (U+C): check the production zip in a clean Chrome profile: consent, language choice, back to the page (reloaded if it was open before the install) with the popup, download, an article, YouTube, Netflix, Settings, export and import, offline, a device without on-device AI
- [ ] G4 **Blocker** (U): freeze pack and feature merges, choose the version, tag, upload that zip, submit with deferred publishing
- [ ] G5 (U+C): after approval install from the store and check again, then publish. Contact support if review passes three weeks
- [ ] G6 (U): testers to Public, on the same item: A4, the listing, then a review again if the dashboard asks for one

## H. Google Drive (before the launch), then after it

- [ ] H1 **Blocker** (U+C): production OAuth client with the redirect `https://dldcjcapnikfmodbgnnlbkilbcepnbnf.chromiumapp.org/` (the item id, B4). **2026-11-25**: redirect added to the one Web client and production builds use it; the Cloud project belongs to the contact address, so it is the support email; the logo was removed from Branding (a logo needs brand verification before publishing; add it back with D1, D2 and a domain). Left: "Publish app" stays disabled until Branding has a home page and a privacy policy link (D1, D2), whose domain goes into Authorized domains. Until then the consent screen is in Testing, so testers must also be listed as test users there. Consent screen **In production even while only testers install**: in Testing only listed test users (100 at most) can connect and each has to agree again after 7 days. `drive.appdata` is non-sensitive, so no scope review; brand verification (needs D1, D2 and a verified domain) shows the name and logo. The support email there is public too (A5): that account, or a Google Group it manages, has to set it, so it needs access to the Cloud project. Risk to clear early: Google wants every authorized domain verified and `chromiumapp.org` cannot be ours; whether it is accepted is not confirmed
- [ ] H2 `REVIEW_URLS.chromeWebStore`: it can go in as soon as B4 gives the id, but the page works only once public
- [ ] H3 Watch reviews, the support email and policy mails (violations allow 7–30 days)

## Checked and fine

- Production zip: builds, 773 KB, 41 files; no development `key`, check channel, source map, `eval` or `new Function`
- Permissions are `storage`, `alarms`, `identity`; language packs are data checked by hash, not code
- `npm run verify` with C1 and C11 (2026-11-23): 2,939 unit tests, browser tests on Chromium and Firefox, E2E on headless Chromium
- No key or token of the common formats in the tracked files (history not scanned); all commits on main use a no-reply address

## Not checked

- The real sites, the zip installed in Chrome, the first run in Chrome itself (G3)
- The mirrors' files (G1), YouTube's and Netflix's terms (E7)
- The state of the developer account and of the Google Cloud project
- Legal questions (trader, trademarks, licences): not legal advice

## Sources

- [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies), [user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) (question 10: consent), [2026 policy update](https://developer.chrome.com/blog/cws-policy-updates-2026)
- [Register](https://developer.chrome.com/docs/webstore/register), [account](https://developer.chrome.com/docs/webstore/set-up-account), [trader disclosure](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)
- [Listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), [images](https://developer.chrome.com/docs/webstore/images), [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution), [review](https://developer.chrome.com/docs/webstore/review-process)
- [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification), [OAuth branding](https://support.google.com/cloud/answer/15549049)
