# Competitor extensions: subtitle cards and their translations (read 2026-11-28)

How six competing extensions cut subtitles into cards, translate them and pair the two, read from their shipped code, and what Langle can take from it. Reference only: ideas, not code (Read Frog and Kiss Translator are GPL-3.0; the others are proprietary).

## Method
- Code: Language Reactor 6.0.1, Immersive Translate 1.35.4, Relingo 3.33.2 and Trancy 8.0.2 from their Chrome Web Store packages (minified, not run); Read Frog and Kiss Translator from their public repositories.
- One reader per extension answered the same questions: caption sources, re-segmentation, translation unit and engine, mapping translations to cards, bilingual display, word meaning in context, articles. Key claims were spot-checked in the code.
- Server-side steps are visible only as requests; their algorithms are unknown.
- Per-extension reports with grep anchors: `data/raw/competitors-2026-11/` (git-ignored).

## How each one works
| | Cards | Translation | Pairing a site or human track |
|---|---|---|---|
| Language Reactor | One cue per card. Client merges only ASR events ≤10 ms apart and Netflix cues with the same start; a pause over 1.5 s inside an ASR cue adds " …" | Site `tlang` / human track by default. Pro: server re-cuts ASR (`caption_prepareSource`) and aligns `tlang` to it (`caption_alignTranslation`); Netflix MT per cue on the server, 5 cues of context each side | Time overlap: the largest overlap, plus any card overlapped > 500 ms or > 80% of the translated cue; the whole line repeats on each |
| Immersive Translate | English ASR only: pause (> 1 s) and discourse-word cuts ("and", "but", "so", `>>`, "um"…), 15–20 words, no sentences. Pro: server sentence cuts (`subtitles/yt-asr-subs`). Other languages and manual tracks: cues as they are | Own MT or LLM per card, 4 cards ahead of the playhead; fast MT shown first, the LLM result replaces it. `tlang` off by default | Human track: overlap with 0.5 s tolerance, then source cards sharing one human line are merged (≤ 10 s, ≤ 200 characters) |
| Trancy | Client sentence builder: word times from `tOffsetMs`, abbreviation and ellipsis guards, a forced end at a 2 s gap or a speaker change; long sentences cut into ~14-word lines (max 24) by dynamic programming over clause and function-word scores and pauses. Manual tracks keep cues and join only on an obvious continuation (cue ends in `, ; :` or a function word, next starts lower case) | Per line, Google's keyless endpoint by default, LLM batches of 6 with numbered chunks | Overlap > 50% of the shorter span; a human track is first shifted by a clock offset found from a histogram of start differences |
| Relingo | Ends a card at `.?!`, a trailing comma, or 120 characters; nothing for ASR without punctuation | Per card, own server or Google/DeepL/LLM, no context | By index when the lengths match, else by overlap |
| Read Frog | Punctuation, a 1 s silence, 15 words; optional LLM re-cut returning VTT | Per cue in numbered batches; Microsoft MT as a placeholder while the LLM answers | None: never uses `tlang` or a human track |
| Kiss Translator | Rules (100 characters, 10 s, 1 s pause) by default; optional statistical breaker scoring each gap against the track's own gap distribution; optional LLM that returns only the last word id of each segment | Per segment; the LLM mode translates and cuts in one call | None: never uses `tlang` or a human track |

## What this says about Langle
- **Nobody aligns the site's translation better on the client.** The open-source ones and Relingo avoid alignment by translating their own cards; Language Reactor and Immersive Translate moved the hard case (ASR without punctuation + `tlang`) to their servers. Langle's cut at the translated track's sentence ends, with ends dated when said, is ahead of every client-side method seen.
- **Pauses and clause starters as cut priors are already in Langle** (`asr.ts`: the prior of an English boundary uses its gap and `EN_STARTERS`; the balance split prefers pauses and marks). Immersive Translate's and Kiss's rules add little beyond that.
- **A human line over two cards**: Langle's `joinCoveredCards` is the same answer as Immersive Translate's merge; the others repeat the line on both cards.
- **Sense in context**: no competitor picks a sense on the device; all send the sentence to a server LLM. Relingo's "the sense whose gloss appears in the sentence's translation" was tried here and dropped (`translation-quality.md`: about 7 fixed, 7 broken of 282).

## Ideas worth measuring (no server)
| # | Idea (from) | Targets | How to measure |
|---|---|---|---|
| 1 | Per-card on-device translation where the `tlang` alignment is unsure: unpunctuated ASR windows whose translated ends sit far from any English boundary, or need many skips, get Chrome's Translator per card instead of `tlang` pieces (the competitors' default, used locally) | "1 card in 4 has a neighbour's translation" on unpunctuated ASR and Shorts (`youtube-cards.md` "Still open") | 2026-11-cards corpus, unpunctuated tracks: blind A/B of translation matches; Translator quality is lower (3.3 vs 4.2 / 5), so only where alignment is the bigger error |
| 2 | Track-relative pauses (Kiss): score a gap against the track's own gap distribution (z-score, percentiles), not fixed milliseconds | Fast talkers and Shorts, where every gap is short; slow speakers, where every gap looks like an end | Same corpus: distance of chosen boundaries to translated ends; cards ending mid-sentence |
| 3 | Function-word cut penalties (Trancy): never cut after an article, preposition, auxiliary or conjunction, nor before `'s` / `n't`; small penalty between two capitalised words | Splits of long sentences (30-word cap, balance split) and manual-track cards ending mid-sentence (14–20%) | Cards ending mid-sentence; needs per-language function-word data in the `LanguagePack` (a short list per language) |
| 4 | Clock-offset repair for a human track (Trancy): histogram of start differences in 100 ms bins, shift only when one offset clearly wins | Human tracks timed for another cut of the video | Count tracks in both corpora where the best offset is not 0; likely rare, cheap to check |
| 5 | Fast first, better later (Immersive Translate, Read Frog): show the on-device translation while `tlang` or the human track loads or after a 429, replace it when the better one arrives | Cards without Japanese at start-up and on `tlang` refusals | Time to first translated card; share of empty cards in the first minute |
| 6 | Partial human track: none of them handles it either; keep Langle's planned fallback to `tlang` when the human track covers under half of the speech | `UF8uR6Z6KLc` case | As planned in `youtube-cards.md` |

Not adopted: their per-card LLM prompts, server segmentation, crowd-sourced caption caches, the keyless Google endpoint (sends text to a third party and is unofficial), and display extras such as blurred translations (minimal UI). If an optional bring-your-own-key mode ever comes, two designs are worth reusing: numbered items returned in any order with per-batch recovery (Immersive Translate), and an LLM that returns only segment-end word ids so the app keeps the text and times (Kiss).

## What was tested (2026-11-28)
Ideas 2–4 were prototyped outside the repo over the 2026-11-cards corpus ("new": 28 videos, Netflix) and the 2026-11 round-2 corpus ("r2"). Two kinds of evidence:
- **Strip proxy, no judge**: punctuated ASR tracks with their punctuation removed, card ends scored against the removed punctuation. P(S) = share of card ends that were a sentence end, R(S) = share of sentence ends that became card ends. Caveat: their `tlang` was made from the punctuated track, so this flatters `tlang` alignment.
- **Blind A/B**: `judge` agents on windows that changed, current build vs variant, with the 2026-11-cards rubric; "pref" counts windows where one side was preferred.

| Idea | Variant | Proxy (strip-tlang P(S) new / r2) | Blind A/B (current vs variant) | Decision |
|---|---|---|---|---|
| 2 Track-relative pauses | Each track's gap median and p90 mapped onto the corpus-wide ones (−10 / 250 ms; per-track p90 ranges 170–710 ms) | 47.3 / 52.7 → 47.4 / 52.3 (±0.5); worse than absolute gaps when the pause term is weighted more | Not judged (no effect) | Dropped |
| Side finding: pause weight | Unpunctuated prior `1.2 − w·gap`, w = 0 / 0.5 (current) / 1 / 2 / 3 | 45.6 / 50.3, 47.3 / 52.7, 50.5 / 54.6, **51.9 / 56.3**, 51.7 / 56.5; w = 3 adds tiny cards | Judged together with idea 3 (below) | Recommended: w = 2 |
| 3 Function-word cut penalties | No cut after a determiner, infinitive *to*, preposition, conjunction or possessive pronoun (tagger roles, no word lists): +0.6 (unpunctuated) / +3 (punctuated) on the end prior, no pause boundary and no balance split there | 50.3 / 55.5, R(S) +3.5; strip-none +1 / +0.2 | 40 windows: pref 9 current / 7 variant / 11 same. ASR `tlang` 2 / 3 (seg good 67→69%); manual `tlang` **5 / 2** (Japanese ok 87→80%); human 1 / 2 | Refined: ASR tracks only |
| 2-weight + 3 | w = 2 plus idea 3 | **54.0 / 57.8**; P(S\|C) 55.4→62.4 / 59.4→65.5; R(S) 54.7→62.6 / 64.7→71.6 | 41 windows (32 unpunctuated ASR `tlang`): pref **5 / 19** / 8 same. ASR `tlang` 3 / 13: seg good 68→71%, mid-sentence 20→16%, Japanese ok 62→65% | Recommended (on ASR tracks) |
| 4 Clock offset of a human track | Best shift of the human track in −1.5…+1.5 s (50 ms steps) by share of its cue starts within 300 ms of an English start; shift when ≥ 150 ms and the share gains ≥ 0.1 | 22 human tracks: 4 shifted (two Netflix episodes −450 / −350 ms, share 0.33→0.69 and 0.46→0.64; two YouTube +350 / +150 ms). None reaches Trancy's 500 ms | 18 windows: Netflix pref 2 / **10**, Japanese ok 85→89%, misplaced 3.4→0%; YouTube human 2 / 0 (2 windows) | Recommended (Netflix-sized evidence; YouTube too few to tell) |

What shipping would need:
- Idea 3 needs the learning language's tagger in `captionCards` (LEARNING layer: `LanguagePack` roles; a pack without a tagger gets no penalty). Limited to auto-generated tracks, since on manual tracks the cue ends are the author's and the penalty moved good ends.
- The pause weight is one constant in `candidatesOf`; it changes only unpunctuated tracks (403 r2 cards at w = 2; the new sample's ASR tracks are mostly punctuated).
- Idea 4 is CORE (times only) and runs once per human track before `alignByOverlap`.
