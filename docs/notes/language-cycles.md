# Language cycles

The log of the weekly language cycle ([skill](../../.claude/skills/language-cycle/SKILL.md), [development](../development.md) "Language quality cycle"). Newest cycle first. Data for each cycle is in `data/raw/quality/cycles/<cycle>/` (git-ignored).

## Current
- State: idle. c002 (tidy-up) finished 2026-11-28: #339, #340, #341 merged, 0 changed rows; the WORSE flags since c001 come from merged PRs and are queued for c003 (c002, "Sweep")
- Last cycle: c002 (2026-11-28); last sweep: `cycles/c002/after-natives-defaults` (main at #339; #340 and #341 change no shipped code)
- Next: c003 (scheduled). Next tidy-up: c005, or earlier when the inventory grows ≥ 15% over c002's or a pair is added
- Level rotation: c001 ran `es` also at level 1000; c003 runs `fr` at 8000, then `de` 1000, `en` 8000, …
- Corpus refresh: due at c004 (corpora as of 2026-11: `en` 2026-11 round 2, `es`, `fr`, `de` from their L1/L2 studies)

## Queue
Causes found and not yet fixed, by layer, with evidence. A cycle picks from here and from its own findings.

Ranked; c001 picks from the top unless its own sweep shows a WORSE flag.

**From c002's sweep (merged since c001; c003 looks at these first)**
- `en-ru` translated at display 3,109 → 11,439 (+268%) and no entry 48 → 62: "Leave the Russian Wiktionary edition out of en-ru" (`ea8fdbc9`, 2026-11-22) left the tables alone (55,645 terms). Measure what the learner now sees on those 8,330 tokens (translated English definitions vs the edition's meanings) and whether en-defs or the tables can give a native line; a trade-off for the user if the edition's meanings were better.
- Over cap up in most English pairs (en-zh 1 → 12, en-ko 0 → 13, en-hi 0 → 11, en-it 33 → 44, en-tr 81 → 92, en-es 269 → 292; en-ru 257 → 34 with the edition gone): "Lead with a word's main use …" (`b3c692ab`, en-defs). Check which lines now pass the cap and whether the cap or the line choice should move.

**LEARNING/CORE (en; ≥ 3 natives on the same words)**
1. **Hover senses ignore the token's part of speech.** *(c001: partly fixed by #223 — tagger readings for inflected forms; adverb `even` in en-ja fixed afterwards by a note rule (#236); left: **for c003, the tagger's fixed words, then `still` in en-ja**: `data/packs/en/tagger.json` `words` (481; `KNOWN_MIN_SHARE` 0.97 in `scripts/data/tagger.ts`) tags every `even` and `still` as an adverb without reading context, so since #236 *an even surface* loses 平らな in en-ja, and the other 14 English natives' `even` hover has no adjective sense either (tagger or dictionary: not separated); settle this before reordering `still`, or *still water* is expected to lose 静止した the same way; test on adjective and verb uses, which the corpus lacks for `even`; **`still` in en-ja** (177 tokens, tagged adverb, the card leads with 静止した…; the other English pairs lead with the adverb; cause and the two rules that failed blind: c001, "Adverb senses"), pair-build sense gaps (`readEdition` keeps 4 senses in file order, `mergeSources` takes the whole term from the first source: en-ar 601, en-id 752, en-zh 729 terms), participial adjectives, won/act tagger errors, German `gerecht werden` → rechen.)* `looming` → loom (weaving), `netted` → net (fishing net), `checked` → cheque, `still` (adverb) → a photo still, `centred` (verb) → centre (noun), `slash` → the punctuation, `dip` → dunk, `stirring` → stir a liquid, `won` → the Korean currency: 12–14 natives each. In `en-es` rows, 4,610 of 14,714 New words (31%) have no POS (1,110 of them inflected forms such as `looming`, `netted`, `gathered`), and where a POS is known the senses are still in dictionary order (`use`, `act`, `checked` tagged verb show noun senses first). Cause: sense order does not follow the tagged POS, and the tagger leaves inflected forms untagged. One rule in the hover builder, all 14 English natives.
2. **Acronyms and capitalised names looked up as common words.** *(c001: all-caps part fixed by #226; left: capitalised runs with no entry (Stack Overflow: 330 runs in en-es), Python/RAM whose capital entry is empty, es/fr/de dictionaries with no capitalised headwords (PAN → bread), \"Prime Minister\" as a phrase unit.)* `CAT` (Climate Action Tracker) → cat, `Stack Overflow` → stack + overflow, `Python` → the snake, `Prime Minister` → prime + minister (priest): 12–14 natives each. 615 all-caps New words in `en-es`. Cause: an all-caps token with no all-caps entry falls back to its lowercase entry; a mid-sentence run of capitalised words with no phrase entry is split into words. `US` → EE. UU. and `UN` → ONU work because those entries exist, so the rule is "all-caps or mid-sentence capitalised run without its own entry → name", not a list.
3. **Missed expressions.** *(c001: of 159 findings, 71 were phrases the build kept for selections only, 59 not in the data, 13 artefacts, 11 dropped by a rule (`set to` ×10), 5 matcher misses; #228 fixed the figurative ones among the 71; left: B2b compounds with tables in 5+ languages (prime minister, ice pack, real estate: +1.6 phrases/1k, ~70% useful, a density trade-off), gotta/wanna/about to, German separable verbs in `src/core/tagging/de.ts` (`lehnte … ab`, `stufte … zurück`).)* The biggest mechanism (126 findings, all 18 pairs): `missing out`, `ice pack`, `centred on`, `feel like` (sense), German split verbs `davon ausgehen`, `zur Welt kommen`, `für verrückt halten`, `auf … aufmerksam machen`. Cause to confirm: inflected and separated phrasal verbs are not matched, and some phrases are not in the pack. Measure match rate per form first.
4. **Translated phrase senses: one wrong sense only.** `go back to` → "To stem from" (14 natives), `here we go` → frustration (14), `heat up` → an English gloss. Cause: en-defs keeps a rare sense as the only one for some phrases. Phrase-sense ordering in the en-defs build.
5. **Missing entries for informal and tech words.** `PJs`, `backend` are `ignored` (no entry); `gotta` has an entry but is Known and not highlighted (12–14 natives). Learning-data coverage (slang/clipped forms, tech vocabulary).
6. **Phrase precision.** `by the way` matched in "a career by the way that…" across a caption line break (13 natives); `give me` highlighted as a phrase (14). Phrase matches across a line break, and very easy phrases highlighted.

**NATIVE/PAIR (hot spots, ≥ 2× the other natives' median)**
- `en-id` wrong-meaning 1.76 vs 0.79 per unit: nouns for verbs (`forcing` → daya, `awarded` → anugerah), `Atlantic` → the atlas vertebra, `Barely` → hanya. Mostly cause 1 plus thin en-id senses; recheck after 1.
- `en-it`, `en-ru`, `en-fr` unreadable 0.26–0.29 vs 0.10: long English definitions translated at display (`takedown`, `wrestled`, `neighbourhoods`, `contained`) where a one-word gloss exists. Short-line choice for the en-defs fallback.
- `en-de` noise-highlight 0.26 vs 0.12; `en-ja`, `en-pt`, `en-ru` wrong-split 0.12 vs 0.05 (small; look after 6).

**Seen at c001 step 6, not investigated (no layer yet)**
- en-ko: `netted` (a goal) → net with noun senses (그물, 네트워크, 전개도).
- Acronym cards write their headword in lower case (ceo, nasa), while UN is upper case.

**de-fr / de-en (one learning language, two natives)**
- Separable verbs shown with the wrong sense or as the noun: `lehnte … ab` → "appuyer", `stufte … zurück` → "accusatif pluriel de Stufe", `auftrat`, `geladen` (invited). `daß` (old spelling) and `Komparserie`, `pauschal` have no entry. Cause 3 for German plus German lemma coverage.

## c002 — 2026-11-28 (scheduled; tidy-up)

Main at `3ea326c8`. Third cycle, and en-ko was added since c000's inventory: a tidy-up ([tidy](../../.claude/skills/language-cycle/references/tidy.md)) in place of steps 1–6.

### Sweep
`cycles/c002/before` against `cycles/c001/after-adverb`: 19/19 ok, 8 WORSE, 1 MOVED. None from this cycle: all come from PRs merged after c001's last sweep (`ea8fdbc9` en-ru without the Russian edition; `b3c692ab` en-defs main use), so they are queued for c003 ("From c002's sweep") and not fixed in a tidy-up. Timing fell 6–66% on most pairs (not compared with `timing-ab.ts`; no flag).

### Items (one PR each, 0 changed rows)
| item | PR | change | acceptance |
|---|---|---|---|
| Same-value fields → defaults | #339 | `NATIVE_LANGUAGES` `spaces` and `dense` set only by the exceptions (`spaces?: false` ja zh th; `dense?: true` ja zh ko): 26 lines fewer | `after-natives-defaults`: 0 changed rows in 19 pairs |
| Branches → table fields | #340 | the five `zh` branches of the data scripts read the zh recipe instead (`tables.langCodes`, `simplified`, a new `wikidata` field): `defaultRecipe`, `LANGS`, `acronymNative`, `entityNative` | data scripts only (no pack rebuilt; the sweep reads the published packs); unit tests show the old and new values identical (`langCodes` order is unused: read as a set) |
| Study scripts → the skill | #341 | 9 parametrised scripts in real-content-quality `scripts/` (`base-packets.py`, `base-tally.py`, `pack-diff.py`, `hover-diff.py`, `by-source.py`, `gate-source.py`, `order-packets.py`, `order-tally.py`, `gate-lines.ts`) for the copies in the round-4 native studies; SKILL.md Phase 3 says which to use | byte-identical output to the old copies on r4-tr's data |

Also in the log PR: `rule-inventory.ts --before` reads an inventory that holds the totals alone (c001's), instead of failing.

### Rule inventory (c002)
At `3ea326c8` before → after the items: branches 18 → 13, tables 5, table fields 36 → 37 (the zh `wikidata` field), one-off fields 7 → 8 (same), same-value fields 13 → 11, language files 21 (4,313 lines), quality notes 2,077 lines, repeated study scripts 25 (counted by name across study folders: the old folders keep their copies, so the count falls only as new studies use the shared scripts). Against c000: tables +1, notes +11%, under the 15% trigger. `cycles/c002/inventory.json` (after the items; before: `inventory-before.json`).

### Left for the next tidy (c005)
- Ablation of one-off rules (the language files: `tagging/de.ts` 710 lines, `tagging/fr.ts` 653): not started.
- Docs: `native-quality.md` (443 lines) and the other `*-quality.md` restate shipped rules that architecture.md should hold once.
- `englishPair = { format: 4 }` is set by all 15 pair natives; it says how the pair pack is built, so it stays explicit until a format 5 exists.

### Trade-offs
None from this cycle (every item changes no row). The en-ru question above is for c003 to measure first.

## c001 — 2026-11-22 (manual)

Main at `bab876e`. Started by hand to fix the c000 Queue; manual runs are extra cycles, so the weekly scheduled run still runs (user, 2026-11-22).

### Sweep
`cycles/c001/base` against `cycles/c000/base`: 18/18 ok, 0 WORSE, 0 changed rows (no code or data change since `bda1bda`).

### Simulation
Not rerun: c000's findings are one day old and the code is unchanged. The next cycle simulates again.

### Picks
Queue items 1 (hover senses by POS), 2 (acronyms and capitalised names) and 3 (missed expressions), one PR each. Started in parallel worktrees, which made the user's Mac too slow; stopped and resumed one at a time (SKILL.md "Machine load").

### Fix 1 — hover senses by POS (#223, merged `9882d19`)
CORE tagging: `readTag` replaces `trustedTag` (a form other than the headword carries only tags with an ending; the tagger's lead is measured against the best differing reading; Proper never trusted; top 4 rival tags kept). Tagger on EWT: headwords coverage 87.9 → 88.7% at 97.1%; inflected forms coverage 82.7 → 89.6%, accuracy 98.6 → 97.5%. Blind A/B old : new — tune 40 : 290, confirm 52 : 271, Netflix held out 66 : 219. Sweep 0 WORSE, timing ≤ +3.7 ms/1k. No trade-offs.

Re-measure (`after-pos-senses` on `9882d19`, 19 pairs with en-ko): 19/19 ok, 0 WORSE; changed rows vs base de-en 48, de-fr 45, en-* 273–1280, es-en 9, fr-en 16. Rows that differ from the fix branch's own sweep (en-pl 772, en-th 167, en-es 162, en-zh 77, en-fr 69, en-ru 6) come from #221 (en-ko), which taught `short-lines.ts` to drop brackets in another script and trailing "…" ("he (piąta litera …), (ה,ه)" → "he (piąta litera …)", "ไม่สามารถ (cannot) (…)" → "ไม่สามารถ (…)", "no puedo, no puedes, ..." → "no puedo, no puedes"): improvements, not regressions.

### Fix 2 — acronyms and capitalised names (#226, merged `125dbf9`)
CORE casing + LEARNING en: an all-caps word the page never writes in lower case, at most 6 letters, outside an all-caps run, with no all-caps headword in the pair's dictionary and not in `en/uppercase.json` (563 words Wiktionary's examples write mostly in capitals: ceo, nasa, tv) reads as a name. An all-caps run now reads through a lone capital ("IT'S" is no longer IT). en pack format 7 → 8; packs.yml run after merge. Off for es/fr/de learning: their dictionaries keep no capitalised headwords. Blind A/B new : old : same — tune (en-es) 11 : 0 : 0, confirm (en-ja, en-zh) 15 : 2 : 0, Netflix held out 10 : 4 : 3 (losses: acronyms whose lower-case entry was right, RPMs, PM). Without `uppercase.json`, en-ja lost 120 and en-id 90 right acronym meanings: the list is what keeps them.

Re-measure (`after-names` vs `after-pos-senses`): 19/19 ok, 0 WORSE, 0 MOVED; changed rows only in en-* (15–40 each: CAT, ETH, UN → name), 0 in de-*, es-en, fr-en. Timing CHECK en-tr (+64% ms/1k, loads +58–75%) and en-ko load dictionary (+38%): one pair each for a rule every en pair runs, so machine load; not settled with timing-ab. `measure.ts` (real-content-quality) gained the `acronym` hook, so sweeps see the rule.

Measured, not built (for the end-of-cycle question): names keep no hover (alternatives: a name hover, or New with the old meaning); "Prime Minister"-type runs as phrase units (87 runs in en-es; overlaps fix 3); capitalised runs with no entry, Stack Overflow type, as names (330 runs / 725 tokens in en-es); Python/RAM show the common word when the capitalised entry is empty; es/fr/de dictionaries keep no capitalised headwords (PAN → "bread").

### Fix 3 — missed expressions (#228, merged `aed609c`)
Of c000's 159 missed-expression findings: 71 phrases in the pack but kept for selections only by the phrase build (B2/B2b; 13 of them "prime minister"), 59 not in the data (gotta/wanna, German separable verbs, "about to"), 13 simulation artefacts, 11 dropped by an existing rule (`set to` ×10), 5 real matcher misses. Rule (data build B2b, `scripts/data/idiomaticity.ts`): a phrase whose first sense Wiktionary tags `idiomatic` or `figuratively` is never taken for transparent; the usual score decides (grey area, small talk, last resort, cara larga, chant du cygne). Detected phrases en +325, es +28, fr +32, de +3; learning packs en/es/fr/de rebuilt, packs.yml run after merge. Blind A/B new : old : same 41 : 10 : 2 over ja, ar, es-en, fr-en, Netflix held out 17 : 6 : 2; word hovers unchanged. Own check of the 31 new phrase rows: 25 good, 4 neutral, 2 bad ("own goal" in "their own goals", "de fer" in "lingot de fer").

Re-measure (`after-expressions` vs `after-names`, main `aed609c`, which also has #227 ko-quality from another session): 19/19 ok. Fix 3 moves phrases/1k +0.1–0.2 and ~80 rows per en pair, es-en 17, fr-en 7, de-* 0–1. The rest is #227's, measured and judged in its own PR ([korean-quality](korean-quality.md)): its shared rules change hover senses in en-fr 895, en-es 659, en-th 285 rows and others (still → todavía, mean → querer decir; judged es 28 : 2, th 22 : 7), and its one WORSE flag, en-ko translated at display 4,867 → 11,255 tokens, is "the" showing its English definition, intended there. Against `base`: 0 WORSE.

### Real-site check
Done 2026-11-22 on check build `aed609c` in the user's Chrome (Claude in Chrome), with limits: the article examples were a test paragraph injected into a live Wikipedia page's DOM, not text found on the site; YouTube was only a smoke check (subtitles, translation, one hover), where no example of the three fixes came up; Netflix was one subtitle line hovered and one more seen.

- Articles, en-ja: looming, netted and checked open loom, net and check with verb senses first (fix 1); CAT is a name with no card, UN, CEO and NASA keep their meanings (fix 2); grey area, small talk and last resort are phrases with idiomatic meanings (fix 3). en-ko, the same paragraph: CAT, CEO, NASA and the three phrases highlighted the same way, still → 여전히. es-en: sano(s) y salvo(s), de emergencia, idas y venidas and en pedo are highlighted as phrases; the meanings of the three hovered were right (de emergencia not hovered).
- Netflix en-ja (Friends, all-caps subtitles): UNPACKED highlighted, GUESS and HOME open their word cards, JOEY is a name. YouTube en-ja (Ken Robinson TED): run opens with verb senses first.
- Error log: 18 info entries (pack downloads), 0 errors or warnings; cleared and re-read empty. The user's settings restored.
- Found, none a regression from c001, none fixed at this step (Queue): en-ja `still` and `even` still lead with the wrong part of speech (item 1; adverb `even` fixed later, with a regression on the adjective, "Adverb senses"), en-ko `netted` → noun senses, acronym headwords in lower case.

Data loss: fix 2's study folder `cycles/c001/proto/names` was deleted with its worktree before being copied. 18 files (scripts, PR body, handoff, 9 judge results) were rebuilt from session transcripts (`proto/names/RECOVERED.md`); packets, answer keys, runs and tallies made by commands are lost, so that A/B cannot be re-tallied. Its numbers are in #226 and above.

### Selection
First run of the selection check ([selection](../../.claude/skills/language-cycle/references/selection.md)) on `fe74080` (the code and data of main `c7bd3c0`), `cycles/c001/selection`. Recovered / wrong phrase / nothing. Judged: 50 shown phrases in each of six pairs, one blind judge per pair. Exact selections and controls are right by construction in this first run (they are the regression guard).

| pair | n | exact | word too many | shifted | word missing | reported whole | reported off | controls with a phrase | meaning: dictionary / English definition / literal % | judged meaning good/acceptable/wrong | judged phrase right/off/wrong |
|---|---|---|---|---|---|---|---|---|---|---|---|
| de-en | 289 | 80/0/0 | 0/0/63 | 0/0/58 | 40/0/0 | 0/0/8 | 0/0/10 | 0 of 30 | 100 / 0 / 0 | not judged | not judged |
| de-fr | 289 | 80/0/0 | 0/0/63 | 0/0/58 | 40/0/0 | 0/0/8 | 0/0/10 | 0 of 30 | 62 / 38 / 0 | 40/3/7 | 46/0/4 |
| en-ja | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 40 / 57 / 3 | 26/12/12 | 45/1/4 |
| en-es | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 58 / 41 / 2 | 31/13/6 | 45/1/4 |
| en-pt | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 49 / 48 / 3 | not judged | not judged |
| en-ru | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 58 / 39 / 3 | not judged | not judged |
| en-fr | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 64 / 36 / 0 | not judged | not judged |
| en-de | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 62 / 38 / 0 | not judged | not judged |
| en-zh | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 59 / 39 / 2 | not judged | not judged |
| en-it | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 60 / 37 / 3 | not judged | not judged |
| en-pl | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 68 / 32 / 0 | not judged | not judged |
| en-th | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 50 / 47 / 3 | not judged | not judged |
| en-hi | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 29 / 68 / 3 | 28/10/12 | 45/1/4 |
| en-ar | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 42 / 55 / 3 | not judged | not judged |
| en-id | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 48 / 48 / 3 | not judged | not judged |
| en-tr | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 41 / 55 / 3 | not judged | not judged |
| en-ko | 333 | 80/0/0 | 0/0/74 | 0/1/72 | 40/0/0 | 7/0/9 | 0/0/20 | 0 of 30 | 45 / 53 / 2 | not judged | not judged |
| es-en | 308 | 80/0/0 | 0/0/70 | 0/1/68 | 40/0/0 | 3/0/4 | 2/1/9 | 0 of 30 | 100 / 0 / 0 | 36/9/5 | 45/0/5 |
| fr-en | 301 | 79/0/0 | 0/0/65 | 0/2/62 | 37/0/3 | 1/0/9 | 1/0/12 | 0 of 30 | 100 / 0 / 0 | 37/6/7 | 44/1/5 |

#### On-device AI (Nano)
The shipped prompt in the user's Chrome 157, test split, 741 of 741 answered (one fr-en timeout run again): `selection/nano`. Recovered counts are of the selections that aim at an expression.

| pair | answered | recovered: offline → with AI | offered | correct | wrong (on controls) | repeats what is shown | ms p50 / p90 |
|---|---|---|---|---|---|---|---|
| de-en | 80 | 28 → 28 of 66 | not asked for | | | | 1200 / 1541 |
| de-fr | 80 | 28 → 28 of 66 | not asked for | | | | 1218 / 1616 |
| en-ja | 103 | 33 → 42 of 89 | 10 | 9 | 1 (0) | 3 | 2248 / 2583 |
| en-es | 103 | 33 → 40 of 89 | 9 | 7 | 2 (0) | 2 | 2211 / 2566 |
| en-fr | 103 | 33 → 40 of 89 | 8 | 7 | 1 (0) | 0 | 1988 / 2391 |
| en-de | 103 | 33 → 42 of 89 | 9 | 9 | 0 (0) | 1 | 1941 / 2399 |
| es-en | 83 | 33 → 33 of 69 | not asked for | | | | 1380 / 1723 |
| fr-en | 86 | 28 → 28 of 72 | not asked for | | | | 1367 / 1723 |

Nano often writes the selected words again as the phrase (en-ja / en-es / en-fr / en-de): a word too many 9 / 9 / 10 / 10 of 14, shifted 3 / 3 / 5 / 4 of 14, controls 9 / 7 / 5 / 7 of 14.

"In this sentence", judged blind (good/acceptable/wrong; one judge per pair, offline meanings mixed in; an English definition is recognisable as offline by its "translated later" mark and is judged on its sense alone, not on the translation shown):

| pair | all answers | where a phrase meaning exists offline too: AI | the same, offline | where none does (offline: a literal translation, not judged): AI |
|---|---|---|---|---|
| en-ja | 53/32/18 | 24/3/6 | 18/7/8 | 29/29/12 |
| en-es | 55/29/19 | 22/9/2 | 21/6/6 | 33/20/17 |
| de-fr | 37/24/19 | 19/7/2 | 23/3/2 | 18/17/17 |
| es-en | 47/24/12 | 23/7/3 | 22/7/4 | 24/17/9 |
| fr-en | 53/20/13 | 19/5/5 | 21/4/4 | 34/15/8 |
| all five | 245/129/81 | 107/31/18 | 105/27/24 | 138/98/63 |

**Prompt: unchanged. No candidate prompt was run in this cycle.** Why none:
- The 2026-11-19 tuning ([meaning in context](meaning-in-context.md) "Correcting a selected phrase") ended at one in five bad selections of a dictionary phrase recovered. The shipped prompt gives the same here: 6–8 of 28 (a word too many or shifted), 32 of its 36 proposals correct.
- The main loss is the model repeating the selection (above), against a prompt that already asks for the whole expression.
- A prompt can only help where Nano exists, and only English learning asks for a proposal. The rule below needs neither.

#### Trade-off, not adopted by the user (2026-11-22): propose a phrase without the AI
Prototype only (`selection/proto`, no product code). [Architecture](../specs/architecture.md) "Phrase patterns" says on purpose that a selection that reaches past a pattern "is its own words"; changing that is the user's call.
- **Simple rule:** when the selection matches no pattern, propose (never snap to) the sentence's pattern with the most of its words selected, two at least; a tie proposes nothing; `checkPhrase` as for the AI's proposals.
- **Narrowed rule:** the same, among the `detect` patterns only. Chosen on dev (random selections judged right, simple → narrowed: en 32 of 50 → 17 of 23, es 16 of 25 → 3 of 4, fr 19 of 25 → 11 of 12, de 17 of 25 → 6 of 8); both rules were then frozen and run once on test, where the narrowing mostly halves the proposals and raises precision only in es.

On the check's items, test split (offered, correct):

| learning | rule | a word too many | shifted | reported | controls | recovered: offline → with the rule |
|---|---|---|---|---|---|---|
| en | simple | 50, 50 of 54 | 20, 20 of 54 | 13, 5 of 33 | 0 of 19 | 86 → 161 of 222 |
| en | narrowed | 39, 39 of 54 | 9, 9 of 54 | 5, 1 of 33 | 0 of 19 | 86 → 135 of 222 |
| es | simple | 48, 48 of 49 | 22, 22 of 48 | 3, 3 of 13 | 0 of 21 | 90 → 163 of 195 |
| es | narrowed | 38, 38 of 49 | 14, 14 of 48 | 0 of 13 | 0 of 21 | 90 → 142 of 195 |
| fr | simple | 52, 52 of 53 | 24, 24 of 52 | 3, 0 of 16 | 0 of 22 | 93 → 169 of 217 |
| fr | narrowed | 45, 45 of 53 | 17, 17 of 52 | 0 of 16 | 0 of 22 | 93 → 155 of 217 |
| de | simple | 38, 38 of 38 | 19, 19 of 35 | 0 of 10 | 0 of 20 | 75 → 132 of 158 |
| de | narrowed | 33, 33 of 38 | 16, 16 of 35 | 0 of 10 | 0 of 20 | 75 → 124 of 158 |

Exact selections and a word missing get no proposal. These items flatter the rule: the same matcher made the phrases, and a control is by definition words that no pattern touches, so its zero says nothing. The reported expressions are the only ones the matcher did not make.

Beside Nano on its English batch (89 selections with an expression, 14 controls; scored alike; the rule's proposal first in the combination; every wrong proposal of the rule alone is on a reported expression, which must be matched word for word: `open the door` for `open the door to`):

| | recovered (offline 33) | offered | correct | wrong |
|---|---|---|---|---|
| Nano | 40–42 | 8–10 | 7–9 | 0–2 |
| simple rule | 55 | 30 | 22 | 8 |
| simple rule + Nano | 58–60 | 33–35 | 25–27 | 8 |
| narrowed rule | 42 | 13 | 9 | 4 |
| narrowed rule + Nano | 47–49 | 19–21 | 14–16 | 4–6 |

Random natural selections (test documents of `after-expressions`; one selection of 2–4 words per unit), proposals judged blind (right / a real phrase but not the one aimed at / wrong):

| learning | selections with no pattern | rule | proposes | judged | right (95% interval) |
|---|---|---|---|---|---|
| en | 9,131 | simple | 1,235 (13.5%) | 37/2/11 | 74% (60–84) |
| en | 9,131 | narrowed | 624 (6.8%) | 37/2/11 | 74% (60–84) |
| es | 2,677 | simple | 249 (9.3%) | 15/1/9 | 60% (41–77) |
| es | 2,677 | narrowed | 63 (2.4%) | 18/0/7 | 72% (52–86) |
| fr | 3,449 | simple | 298 (8.6%) | 17/3/5 | 68% (48–83) |
| fr | 3,449 | narrowed | 173 (5.0%) | 18/3/4 | 72% (52–86) |
| de | 4,246 | simple | 117 (2.8%) | 22/0/3 | 88% (70–96) |
| de | 4,246 | narrowed | 43 (1.0%) | 23/0/2 | 92% (75–98) |

Wrong ones are mostly literal uses and chance pairs: `you know Walt`, `live in`, `going to get` → `go to`, `en la` → `en ello`, `de la`, `qui sait`. How often a learner's selection aims at an expression is not known: the constructed items are the rule's best case, random selections stand in for the rest.

**Recommendation: drop.** The rule recovers much more than Nano when the selection is a dictionary phrase off by a word, but precision comes first: on random natural selections 91 of 125 judged proposals are right (narrowed 96 of 125, pooled over four languages). Correction: the first report rested on 8 wrong of 30 proposals on Nano's batch, which overstates the error. They are four expressions (`open the door` ×3, `set to` ×3, `home ground`, `to let`); seven are part of the expression aimed at and only `to let` is unrelated. **User (2026-11-22): not adopted.**


#### Causes
Causes it points at (candidates for the next picks, none fixed):
- **CORE, matcher:** a selection that goes past the phrase shows nothing: 532 of the 539 constructed misses in en, es, fr and de (`moment over and over`, `hubiera perdido la cabeza`, `On prend l'eau`, `nur unter der Woche`), because `matchSelection` needs a pattern over every selected word. A word missing is completed (157 of 160). The rule measured for it: "Trade-off" above, not adopted.
- **LEARNING, AI prompt:** the checker would take the right phrase for 536 of the 539 phrase misses, but only English learning's prompt asks for one; es, fr and de get no proposal by design.
- **LEARNING, phrase data:** of the 41 reported expressions selected whole, 11 are found; the rest mostly have no pattern (de all 8: `gehen davon aus`, `zur Welt kommen`; `if you don't mind`, `en ningún momento`, `en hommage à`) or only a smaller one (`open the door to`, `à la recherche de`).
- **LEARNING, en-defs (Queue 4):** English definitions shown for phrases have the wrong sense in 25 of 83 judged (en-ja, en-es, en-hi, largely the same selections), dictionary lines in 5 of 67: `bring back` → To fetch something, `from the top` → From the beginning, `give it to someone` → To beat up…; `be suppose to` shows as an eggcorn entry.
- **LEARNING, phrase precision (Queue 6):** 4–5 of 50 shown phrases per pair are not that expression there (literal uses): `gave it to you`, `über den Bergen`, `está en`, `la vache`, `qui parle`.
- **NATIVE/PAIR, dictionary:** broken or wrong phrase lines: en-ja `full stop` → 7, en-hi `as long as` → लग; English-definition share of shown phrases up to 68% (en-hi), 57% (en-ja).

### Adverb senses (en-ja `still`, `even`; user: fix now, 2026-11-22)
Cause: EJDict has no parts of speech, and `scripts/data/sense-pos.ts` reads them from the Japanese gloss's ending. Adverbs such as まだ, なお and でさえも have none of an adverb's endings, so their senses stay unlabelled, read as verbs or are filled in as nouns. Rule A2 then keeps the dictionary's order or finds no adverb sense to put first. Data: `cycles/c001/proto/adverb`.

Two rules fix both words and failed blind, so neither shipped:
- **Modifier notes + English Wiktionary's Japanese translations:** on held-out words 122 tokens better, 29 same, 122 worse (today: きょう → 現代).
- **Modifier notes + 〜た as an adjective's ending** (gate frozen before judging): of 118 judged tokens outside the two words 64 better, 32 same, 22 worse (18.6%; limit 10%). Worse: original (→ 原物, 9 tokens), fit (4), understood (3), elect, lively, old, corrupt, compact, past. It would also change open (23 tokens) and correct (1), not judged.

Shipped, the user's choice of three (modifier notes alone, the second rule with its regressions, nothing): **modifier notes alone**. A 《》 note that says what the sense modifies (《比較級の前に用いて》, 《動詞を修飾して》) labels an adverb's sense. Six words get new labels (any, even, no, still, the, yet); under the main part-of-speech tags only `even`'s order changes, and the English tagger only ever gives it the adverb tag: every `even` leads with …でさえも (was 平らな; judged better by 3 of 3 dev and 5 of 5 test judgements of the same lines, none of them an adjective use). `even` is a word the rule was designed on, so this is no held-out evidence. `still` keeps 静止した… (Queue 1, c003).

Re-measure: all 19 pairs (`before-adverb` on main `fe6d6c6` → `after-adverb`): 207 of en-ja's 157,188 rows change, each an `even` tagged adverb and only in its hover; 0 rows in the other 18 pairs; 0 WORSE, 0 MOVED. 17 timing CHECKs, all on pairs whose code and data are unchanged (machine load; not re-timed).

After release (#236, merged `f769190`, en-ja 2026.1122.0), checked in Chrome on an injected article paragraph:
- *was even worse*: …でさえも, right.
- *an even surface*: …でさえも, **a regression**: 平らな led before and is no longer among the hover's three lines.
- *to even the ground*: …でさえも, wrong, as 平らな was before.

Correction: this section first said that `even` as a verb leads with …を釣り合わせる. That came from probing senses per tag; the tagger never gives that tag, because `even` and `still` are among its fixed words (Queue 1). The sweep and the judgements missed the regression for want of examples: in a non-blind reading by Claude of the 207 changed tokens' short contexts 206 are adverb uses, 1 is not (*Ten thousand even*, wrong before and after) and none means flat.

**User (2026-11-22): keep #236 and correct this record.** The cause is queued for c003 (Queue 1).

### Rule inventory (c001)
At `da71c99` (main `aed609c`): 18 branches (=), 4 tables, 33 fields, 7 one-off (+1) and 13 same-value (+1), 21 language-named files with 4,260 lines (+17), 1,960 lines of quality notes (+86, korean-quality), 25 repeated study scripts (+1). Under the 15% trigger; the next tidy is due at c002 anyway (third cycle, and en-ko was added since c000). `cycles/c001/inventory.json`.

### Trade-offs (asked 2026-11-22; user's answers)
- How names look: no hover (kept), a name hover, or New with the common word's meaning. **User: keep no hover.**
- Capitalised runs with no entry (Stack Overflow type) as names: 330 runs / 725 tokens in en-es. **User: keep as now (each word keeps its meaning); don't re-propose without new evidence.**
- B2b compounds with translation tables in 5+ languages highlighted as phrases (prime minister, ice pack, real estate): +1.6 phrases per 1,000 tokens, ~70% useful. **User: keep as now (selection only).**

### The selection check's plan (user, 2026-11-22; built: step 5b, numbers under Selection)
What a learner gets when they select several words: is the expression found, and is its meaning right; and whether the on-device AI's prompt should change. Not UI (layout, flicker, latency of the card): out of scope by the user's choice.
- **Items, every learning language**, from the cycle's corpus, as the 2026-11-19 study made them (`data/raw/quality/2026-11-correct/proto/make.ts`): a dictionary phrase selected exactly, with a word too many, shifted by a word, with a word missing; controls with no phrase; and the expressions the learners reported as missed (`missed-expression` findings), selected whole and off by a word.
- **Offline part, every cycle, all offered pairs** (Langle's own code in Node, deterministic, like `measure.ts`): snapping and `matchSelection` / `correctPhrase` without the AI → phrase recovered, a wrong phrase, nothing; the meaning shown for the selection in each native (dictionary phrase sense, or the definition translated at display), judged blind by `judge` agents on a sample.
- **On-device AI part** (Gemini Nano via the Prompt API, only in the user's Chrome): the probe check build and study server of the 2026-11-19 study (`proto/batch.ts`, `score.ts`), driven through Claude in Chrome, one batch at a time. Measures the phrase proposal (offered, correct) and the "In this sentence" meaning for the natives Chrome supports (ja, en, es, de, fr). Runs when the prompt, the phrase data or the matcher changed, or every other cycle; a scheduled run without Chrome connected skips it and says so.
- **Prompt changes**: tuned on a dev split, measured once on a held-out split with the prompt frozen, blind-judged, against the shipped prompt (`src/core/explain/prompt.ts`); precision before recall (a proposal only when the dictionary lists it stays unless a measured prompt beats it).
- Lands as a step of the skill (`references/selection.md`, scripts next to the others) and a "Selection" table per cycle in this log.

## c000 — 2026-11-22 (baseline and dry run)

Main at `bda1bda`. Sweep only, no fixes: the baseline every later cycle compares with, and a dry run of the simulation.

### Sweep
Level 3000. `translated at display`: hovers that exist only as an English definition, translated by the browser at display time. Same-commit sweeps give identical rows (0 changed of 157,212 in en-ja); timing moved by up to +150% between two sweeps of the same commit, so timing is compared with `timing-ab.ts`, never across days.

| pair | tokens | unknown % | New /1k | phrases /1k | no entry | translated at display | over cap | ms/1k | dictionary load ms | packs MB |
|---|---|---|---|---|---|---|---|---|---|---|
| de-en | 70,944 | 6.73 | 124 | 5.1 | 4 | 0 | 9 | 12.74 | 43 | 6.8 |
| de-fr | 70,944 | 6.73 | 124 | 5.1 | 4 | 971 | 27 | 13.09 | 85 | 11.0 |
| en-ja | 171,625 | 1.97 | 86.8 | 27.2 | 0 | 3,132 | 328 | 10.92 | 236 | 38.1 |
| en-es | 171,625 | 1.97 | 85.7 | 27.1 | 118 | 2,611 | 269 | 10.17 | 240 | 35.0 |
| en-pt | 171,625 | 1.97 | 85.9 | 27.1 | 65 | 4,355 | 237 | 16.92 | 291 | 33.0 |
| en-ru | 171,625 | 1.97 | 87 | 27.1 | 48 | 3,142 | 257 | 17.86 | 370 | 37.3 |
| en-fr | 171,625 | 1.97 | 85.9 | 27.1 | 30 | 2,314 | 296 | 14.96 | 401 | 36.2 |
| en-de | 171,625 | 1.97 | 85.6 | 27.2 | 59 | 3,206 | 245 | 10.24 | 246 | 36.7 |
| en-zh | 171,625 | 1.97 | 87 | 27.1 | 63 | 4,788 | 1 | 11.15 | 308 | 35.6 |
| en-it | 171,625 | 1.97 | 85.6 | 27.1 | 60 | 2,393 | 33 | 10.21 | 226 | 35.3 |
| en-pl | 171,625 | 1.97 | 86.1 | 27.2 | 33 | 1,091 | 314 | 10.78 | 238 | 35.1 |
| en-th | 171,625 | 1.97 | 86.6 | 27.1 | 111 | 4,104 | 0 | 9.9 | 236 | 35.5 |
| en-hi | 171,625 | 1.97 | 86.6 | 27.1 | 103 | 16,360 | 0 | 13.66 | 229 | 31.3 |
| en-ar | 171,625 | 1.97 | 86.7 | 27.1 | 82 | 6,537 | 6 | 19.11 | 359 | 33.1 |
| en-id | 171,625 | 1.97 | 85.3 | 27.1 | 230 | 6,431 | 4 | 21.14 | 399 | 32.5 |
| en-tr | 171,625 | 1.97 | 85.8 | 27.1 | 98 | 6,017 | 81 | 15.9 | 317 | 31.9 |
| es-en | 72,835 | 3.02 | 85.3 | 13.3 | 0 | 0 | 2 | 11.44 | 70 | 7.9 |
| fr-en | 82,121 | 3.54 | 84.8 | 24.6 | 0 | 0 | 2 | 8.64 | 46 | 6.1 |

### Simulation
Seed 0, level 3000, 42 units per pair (the same stretches for every native of a learning language), one Sonnet learner per pair: 1,090 findings, 104 clusters reported by ≥ 3 natives, 8 pair hot spots (`cycles/c000/sim/tally.md`). Units understood: 27–38 of 42 (lowest `en-hi` 27, `en-ar`/`en-id`/`en-th`/`en-tr` 29; highest `en-pt` 38). Every top cluster was checked against `en-es` rows; all were real. The triage is the Queue above: no fixes in c000 (dry run).

Dry-run lessons, now in the skill: subagents can write only inside the session's worktree, so the sim folder is a real folder there; display-translated meanings appear in English in the packet, so "unreadable" means long, not untranslated.

### Rule inventory (c000)
`rule-inventory.ts` at `bda1bda`: 18 branches on a language code (mostly `lang_code !== "en"` filters in the data scripts and `zh` script variants), 4 per-language tables (NATIVE_LANGUAGES 15 entries / 11 fields, RECIPES 13 / 6, the test packs, LEARNING_RECIPES) with 6 one-off fields and 12 same-value fields, 21 language-named files (4,243 lines), 1,874 lines of `*-quality.md` notes, and 24 study scripts repeated across study folders (`diff.py`, `packets.py`, `base_packets.py`, `base_tally.py`, `bysource.py`, `packdiff.py`, `lines.ts`, `variants.sh` in each of the round-4 natives' studies). Inventory JSON: `cycles/c000/inventory.json`.
