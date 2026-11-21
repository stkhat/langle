# Language cycles

The log of the weekly language cycle ([skill](../../.claude/skills/language-cycle/SKILL.md), [development](../development.md) "Language quality cycle"). Newest cycle first. Data for each cycle is in `data/raw/quality/cycles/<cycle>/` (git-ignored).

## Current
- State: c001 in flight at step 4, one step at a time (user, 2026-11-22: machine load). Merged: fix 1 #223, fix 2 #226; last re-measure `cycles/c001/after-names` (main `125dbf9`). Running: fix 3 `claude/c001-expressions` (`.claude/worktrees/agent-a3bc52a8acabfbad3`, rebased WIP `676a88b`), from `data/raw/quality/cycles/c001/BRIEF-common.md`. Then steps 6–7; log branch `claude/cycle-c001`
- Last cycle: c000 (2026-11-22, baseline `bda1bda`); last sweep: `cycles/c001/base`
- Next: c002. Next tidy-up: c002 (every third cycle: c002, c005, …), or earlier when the inventory grows ≥ 15% over c000's or a pair is added
- Level rotation: c001 runs `es` also at level 1000; then `fr` 8000, `de` 1000, `en` 8000, …
- Corpus refresh: due at c004 (corpora as of 2026-11: `en` 2026-11 round 2, `es`, `fr`, `de` from their L1/L2 studies)

## Queue
Causes found and not yet fixed, by layer, with evidence. A cycle picks from here and from its own findings.

Ranked; c001 picks from the top unless its own sweep shows a WORSE flag.

**LEARNING/CORE (en; ≥ 3 natives on the same words)**
1. **Hover senses ignore the token's part of speech.** `looming` → loom (weaving), `netted` → net (fishing net), `checked` → cheque, `still` (adverb) → a photo still, `centred` (verb) → centre (noun), `slash` → the punctuation, `dip` → dunk, `stirring` → stir a liquid, `won` → the Korean currency: 12–14 natives each. In `en-es` rows, 4,610 of 14,714 New words (31%) have no POS (1,110 of them inflected forms such as `looming`, `netted`, `gathered`), and where a POS is known the senses are still in dictionary order (`use`, `act`, `checked` tagged verb show noun senses first). Cause: sense order does not follow the tagged POS, and the tagger leaves inflected forms untagged. One rule in the hover builder, all 14 English natives.
2. **Acronyms and capitalised names looked up as common words.** `CAT` (Climate Action Tracker) → cat, `Stack Overflow` → stack + overflow, `Python` → the snake, `Prime Minister` → prime + minister (priest): 12–14 natives each. 615 all-caps New words in `en-es`. Cause: an all-caps token with no all-caps entry falls back to its lowercase entry; a mid-sentence run of capitalised words with no phrase entry is split into words. `US` → EE. UU. and `UN` → ONU work because those entries exist, so the rule is "all-caps or mid-sentence capitalised run without its own entry → name", not a list.
3. **Missed expressions.** The biggest mechanism (126 findings, all 18 pairs): `missing out`, `ice pack`, `centred on`, `feel like` (sense), German split verbs `davon ausgehen`, `zur Welt kommen`, `für verrückt halten`, `auf … aufmerksam machen`. Cause to confirm: inflected and separated phrasal verbs are not matched, and some phrases are not in the pack. Measure match rate per form first.
4. **Translated phrase senses: one wrong sense only.** `go back to` → "To stem from" (14 natives), `here we go` → frustration (14), `heat up` → an English gloss. Cause: en-defs keeps a rare sense as the only one for some phrases. Phrase-sense ordering in the en-defs build.
5. **Missing entries for informal and tech words.** `PJs`, `backend` are `ignored` (no entry); `gotta` has an entry but is Known and not highlighted (12–14 natives). Learning-data coverage (slang/clipped forms, tech vocabulary).
6. **Phrase precision.** `by the way` matched in "a career by the way that…" across a caption line break (13 natives); `give me` highlighted as a phrase (14). Phrase matches across a line break, and very easy phrases highlighted.

**NATIVE/PAIR (hot spots, ≥ 2× the other natives' median)**
- `en-id` wrong-meaning 1.76 vs 0.79 per unit: nouns for verbs (`forcing` → daya, `awarded` → anugerah), `Atlantic` → the atlas vertebra, `Barely` → hanya. Mostly cause 1 plus thin en-id senses; recheck after 1.
- `en-it`, `en-ru`, `en-fr` unreadable 0.26–0.29 vs 0.10: long English definitions translated at display (`takedown`, `wrestled`, `neighbourhoods`, `contained`) where a one-word gloss exists. Short-line choice for the en-defs fallback.
- `en-de` noise-highlight 0.26 vs 0.12; `en-ja`, `en-pt`, `en-ru` wrong-split 0.12 vs 0.05 (small; look after 6).

**de-fr / de-en (one learning language, two natives)**
- Separable verbs shown with the wrong sense or as the noun: `lehnte … ab` → "appuyer", `stufte … zurück` → "accusatif pluriel de Stufe", `auftrat`, `geladen` (invited). `daß` (old spelling) and `Komparserie`, `pauschal` have no entry. Cause 3 for German plus German lemma coverage.

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

### Next: a selection check in the cycle (user, 2026-11-22; build after c001's fixes)
What a learner gets when they select several words: is the expression found, and is its meaning right; and whether the on-device AI's prompt should change. Not UI (layout, flicker, latency of the card): out of scope by the user's choice.
- **Items, every learning language**, from the cycle's corpus, as the 2026-11-19 study made them (`data/raw/quality/2026-11-correct/proto/make.ts`): a dictionary phrase selected exactly, with a word too many, shifted by a word, with a word missing; controls with no phrase; and the expressions the learners reported as missed (`missed-expression` findings), selected whole and off by a word.
- **Offline part, every cycle, all 18 pairs** (Langle's own code in Node, deterministic, like `measure.ts`): snapping and `matchSelection` / `correctPhrase` without the AI → phrase recovered, a wrong phrase, nothing; the meaning shown for the selection in each native (dictionary phrase sense, or the definition translated at display), judged blind by `judge` agents on a sample.
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
