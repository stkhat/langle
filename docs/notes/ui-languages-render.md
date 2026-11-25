# Interface languages: the rendering sweep (U2)

2026-11-26, [plan](../plans/ui-languages.md) U2. Every surface rendered in all 16 interface languages, measured, and the breakage fixed with general rules.

## The sweep

`npm run ui-render` (scripts/ui-render): Playwright on the check build and the E2E fixtures (no real sites), one test per locale and layout, run in parallel (`WORKERS`, default 4; about 1.5 min with 5). `LOCALES=de,ru` narrows it; `UI_RENDER_OUT` moves the output (default `reports/ui-render`, git-ignored). Build first: `npx wxt build --mode check`.

- **Surfaces**: setup (consent, then languages), popup (setup, set up, after "Mark all as Learning"), Settings (desktop; every section in the phone layout), hover card and dictionary window on an article word, a word with several senses and a phrase, the video subtitle's hover card, dictionary and Langle menu, the transcript's Words tab, page words, word list and its details, notices. Each locale uses the pair English → that language (English: English → Japanese), so meanings are in the locale's language where a pack exists.
- **Phone layout**: Playwright's `isMobile` does not reach extension pages. The sweep sets the touch media features, touch emulation and a 390×844 mobile viewport through CDP after each navigation (Playwright resets the emulation on navigation).
- **Measured** (`measure.ts`, in the page, through open shadow roots): text cut with an ellipsis, clipped or overflowing its box, cut by an ancestor, siblings that overlap (positioned ones, sticky bars and sheets, apart as info), single-line controls that wrap and grow taller than in English, a label that wraps inside a button of a row of buttons (`rowWrap`, below), horizontal page scroll, `text-align: left` in a right-to-left UI, `lang` on the roots, English strings left (en.json values with 4+ letters of their own), console errors.
- **Summed up** (`summarize.ts`): counts per locale and type; `summary.json` holds every row with its screenshot. An ellipsis on a text that is none of the locale's strings is content (a meaning cut in a row, by design) and counted apart.

## Before and after

All 16 locales, desktop and phone (64 runs, every surface reached in every locale).

| Issue | Before | After | What it was |
|---|---|---|---|
| overflow | 24 | 0 | Word list headings longer than their fixed column (de "Gesehen", pl "Wystąpienia", ru "Встречалось" over "Последний раз", tr "Görülme"), 8 rows; notices' license text on the phone (every locale, English too), 16 |
| pageScrollX | 16 | 0 | The same license line widening the phone page |
| cutByAncestor | 10 | 0 | Phone word list: filter chips and the sort menu running off the right edge (es it pl pt tr) |
| grew | 8 | 0 | Video menu: "Text size" wrapping to two lines in its 84px label (es fr hi it pl pt ru tr) |
| ellipsis (interface text) | 4 | 2 | The popup's language pair (ru, th); ru still 4px short (below) |
| overlap | 11 | 0 | All were the setup's sticky bottom bar over the scrolled text, by design: now counted as positioned |
| english, wrongLang, console | 0 | 0 | One fixture-timing warning (es: an empty caption body), Chrome's built-in-AI notes filtered |

Info, by design: overlapPositioned 27 (the sticky setup bar; the phone word details sheet over the list), ellipsisContent 95 (meanings cut in word rows).

## General fixes

- **Line breaking by language** (`src/ui/locale-root.tsx`): `:lang(ko)` breaks between words (`word-break: keep-all`, with `overflow-wrap: break-word` for a word longer than the line), `:lang(ja)` between phrases (`word-break: auto-phrase`). On every extension page and inside every in-page shadow root, so it follows each text's own `lang`: Japanese meanings in an English interface break between phrases too. Before, Korean split words ("클라우\n드") and Japanese split inside words ("一切あ\nりません").
- **Mirrored paddings**: every padding with different left and right sides is now `padding-block` / `padding-inline` (popup header, dictionary window header and back bar, page words panel, transcript cards, Settings rows and Sites, Support footer, word details, phone title bar), so Arabic gets the start side's padding at the right.
- **IPA left to right** (hover card, dictionary window, word details): the transcription is an isolate with `dir="ltr"` in any interface. In Arabic the leading stress mark had moved to the end ("/saʊər,doʊˈ/"); the line keeps its place at the start side.
- **Columns fit their headings** (word list): the header grid's fixed columns are `minmax(<English width>, max-content)` and the rows take the widths the header got (`--fixed-columns`); headings stay on one line. English keeps 110 / 70 / 110 px.
- **Wrapping toolbars**: the word list's sort label and menu are one item, so a wrapping toolbar keeps them together; the phone filter chips wrap, and the sort menu moves to its own line when the chips need the row.
- **Shared label column** (video menu): the two sliders sit in one grid whose label column is 84px or the longest label (up to 160px), so the labels stay on one line and the sliders line up.
- **Popup pair**: the header's spacer is the first button's `margin-inline-start: auto`, one gap more for the pair; a pair still cut shows in full on hover (`title`).
- **Notices**: `overflow-wrap: anywhere` on the license texts.

English is unchanged: pixel diffs of the English screenshots before and after differ only where Japanese text now breaks between phrases (meanings, translated subtitle lines), where the notices' long line now wraps, and in timing (a meaning or the download percentage not yet shown in one of the runs).

## Rows of options (rowWrap)

Added 2026-11-26 after a check in Chrome: in German the dictionary window's status buttons read "Lernen | Bekannt | Nicht gespeichert", the last one on two lines. The sweep had missed it: the buttons are 40 px tall whatever their text, so `grew` (taller than in English) never fired.

- **Check**: a button (`button`, `role` button, tab, radio, menuitem) with one label (one text run: not a card with a title and a description) whose siblings are all buttons and which shares its line with one of them; its label taking more than one line where English keeps one (in English itself: any). Height plays no part. `measure.ts` records `row` and `wraps` (the most lines one text node takes) per control; `summarize.ts` counts `rowWrap`.
- **Before**: 66 in 9 locales (es fr it pl pt ru tr de id). The hover card's "+ Learning" (32: es fr it pl pt ru tr, every surface the card shows on), the popup's "Mark all as Learning / Known" (14: de es fr id it pl pt tr), the phone Settings' "Keep as New / Mark as Known" (12: de es fr it pl pt ru tr), the dictionary's "Not saved" (8: de fr id ru, in the article panel's 340 px; the sweep's video word is saved, so its 360 px YouTube window showed "Entfernen", which fits). A first version of the check also counted English's subtitle-position cards (title and description), 4, which the one-label rule leaves out.
- **After**: 0, all 16 locales, desktop and phone.

The rule (`src/ui/Segmented.tsx`), for every row of options:

- **`useOptionRow`** (status buttons, segmented controls, the video panel's tabs, Mark all, the fullscreen transcript choice): while the labels fit on one line, a grid of `minmax(max-content, 1fr)` columns: equal widths as the mock draws them, and a longer label takes the width it needs while the others share the rest ("Lernen | Bekannt | Nicht gespeichert" in the dictionary). When the columns run past the row (it measures this, and again on a resize), a wrapping flex row whose options grow from 0 and never get narrower than their labels; back to the grid once they fit. A grid, not a flex row, while they fit: Chrome hands the last 1/64 px of a fractional width to another column in a flex row than in a grid, which moved "Right" in the phone Settings by a subpixel; the grid keeps English to the pixel (`minmax(max-content, 1fr)` gives the same columns as the old `minmax(0, 1fr)`, checked over 200–420 px in steps of 0.25 px, 2–4 columns, gaps 0–8).
- **`wrapRow` + `rowOption`**: rows that were already flex rows (the phone Settings' choices) and, with `flex: none` options, rows of options as wide as their labels (the hover card).
- Rows that wrap now: the hover card's "Details" goes under "+ Learning" and "Known" (es fr it pl pt ru tr: 300 px is too narrow for the three); Mark all's two buttons stack (de es fr id it pl pt tr); the phone Settings' two choices stack (de es fr it pl pt ru tr); the dictionary's touch panel (300 px, 14 px text) in German. No translation was shortened: every label fits alone.

English before and after: pixel-identical on every surface (37 screenshots) apart from the sweep's timing (a download percentage, the word list's details panel open or not when the shot is taken, the notices), which two runs of the same build differ in too. `DictionaryWindow.browser.test.tsx` checks the German status buttons at the window's, the panel's and the touch panel's widths, and English's equal widths.

## Looked at by eye

- **ar**: popup, Settings, hover card, dictionary window and word list mirrored (after the IPA fix above, which the measurements cannot see): switch knobs, progress bars filling from the right, chevrons, button order, English sentences and digits in their own direction.
- **th, hi**: no clipped marks above or below the line in the hover card, popup or Settings.
- **de, ru, pl**: long words fit after the fixes above; no hyphenation added (English would change, and nothing needed it).

## Left as it is

- **ru popup pair** "английский → русский" is 144px for 140px of room: it ends in "…", the designed behaviour for a long pair (`BrandHeader`), and shows in full on hover.
- **Dictionary parts of speech** ("noun", "verb") come from the dictionary data in English in every interface language. Translating them is a separate decision (they are data, not en.json strings).
