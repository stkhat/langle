# Korean quality on real content (2026-11-22)

How good English → Korean hover meanings (`en-ko`, for Korean speakers learning English) are on real videos and articles after ko-1, and what ko-2 changed. Default settings: known level 3000, nothing saved. Method as in the real-content-quality skill (`.claude/skills/real-content-quality/SKILL.md`); the pair's sources and gate are in [translation-data-expansion](translation-data-expansion.md) "ko-1".

## Method

- **Corpus**: the 2026-11 English corpus of the translation-quality study, reused (no new collection): 171,625 word tokens over YouTube, Netflix and articles (`data/raw/quality/2026-11/runs/units-87d8606/units.jsonl`, git-ignored).
- **Pipeline**: the skill's `measure.ts` with `NATIVE=ko`, and every other native for the shared rules, over main 02e85fa and over each build. Study folder `data/raw/quality/r4-ko/q/` (git-ignored): runs, packets, results and the helper scripts (`run.sh`, `diff.py`, `packdiff.py`, `prefs.py`, `entry.py`, `ewt.py`, `lesser.py`, `top.py`).
- **Judging**: `judge` subagents (Opus), one per packet. Baseline: 6 packets of main, Korean beside Chinese (tables first, then an edition, as Korean). A/B: main against the ko-2 build, one packet per site, versions shown as X and Y in random order; one packet each for Spanish, Thai, Portuguese, Polish and French, whose packs the shared rule changes. Rates re-weighted to the corpus; one judge per item, so differences under ±4 points are noise.

## Results

Baseline (main, re-weighted to the corpus):

|          | good | acceptable | wrong | misleading |
| -------- | ---- | ---------- | ----- | ---------- |
| ko words | 55%  | 20%        | 24%   | 0%         |
| zh words | 58%  | 29%        | 12%   | 0%         |

Phrase meaning fits (yes / partly / no): ko 47 / 32 / 21%, zh 52 / 22 / 26%; phrase labels useful 103, low-value 20, wrong-match 9 (phrases are shared, so ko-2 leaves them as they are). Korean's wrong rate is twice Chinese's, and most of the gap is one word: "the" showed the Korean edition's only sense, the adverb of "the more, the merrier" (비교급 앞에서 쓰는 부사), on 6,379 tokens, judged wrong every time. The rest comes a class at a time: a term whose only senses are a use English rarely has (just → 공정하다, fair, on 868 tokens), pronouns the edition describes before giving their words in quotes (him: "삼인칭 남성 여격, 목적격 대명사 '그에게', '그를'"), and single rows of the tables (lend → 빌리다, borrow; promote → 진급시키다).

A/B, main against ko-2:

| site     | good before → after | wrong + misleading before → after | changed words preferred after / before / same |
| -------- | ------------------- | --------------------------------- | --------------------------------------------- |
| YouTube  | 64 → 68%            | 9 → 8%                            | 15 / 1 / 0                                    |
| articles | 68 → 71%            | 10 → 8%                           | 11 / 2 / 1                                    |
| Netflix  | 54 → 57%            | 20 → 19%                          | 15 / 1 / 2                                    |

5.4% of word tokens change (22 distinct words). All changed words: ko-2 preferred 41, main 4, same 3. The losses: concern / concerning → 환 (the reverse glosses' noun, 25 tokens), and final once (마지막의 where the noun "the final" was meant). "the" now shows its English definition, machine translated at display; judges rated it acceptable (long) against wrong.

Other pairs, changed words preferred after / before / same: es 28 / 2 / 6 (still → todavía, even → incluso, mean → querer decir, level → nivel; worse: bore → oso, level once), th 22 / 7 / 7 (store → ร้าน, join → เข้าร่วม, specific → เฉพาะ; worse: direct → แน่ว, storing → ร้าน), pl 10 / 1 / 2 (even → nawet, pick → wybrać), pt 7 / 2 / 13 (under → sob, cut → cortar), fr 3 / 3 / 6 (one → "un / on", even → "même / encore", after). Not judged, read: ar pick → "جرم / اختار" (was فأس, the pickaxe), tr final → son. ru, de, it, zh, hi, id and ja do not change.

Numbers that need no judge (ko, main → ko-2): tokens 171,625; New 86.7 and phrases 27.2 per 1,000 tokens, unchanged; no entry 83 tokens, unchanged; names 1,090; translated at display 4,921 → 11,300 tokens ("the"); lines over the cap 0.

## Root causes

- **A term given only in a use English rarely has** (CORE): the main part of speech that lets a later source supply a term (`mergeSources` "lacks") is that of the tables' most translated sense, so it never checks a term whose only source gives one sense of the wrong use. The Korean edition gives "the" only as the comparative adverb, the tables give "just" only the adjective, ar "will" only the noun (إرادة), es "still" and "even" only the adjectives, pl "pick" only the nouns. Nothing in the dictionaries says which use is the common one; a tagged corpus does: the English treebank (UD English-EWT, 254k tokens, already read for the tagger) uses "just" as an adverb 498 times of 498, "the" as a determiner always.
- **Quoted translations after a description** (NATIVE, the edition): 위키낱말사전 describes pronouns and some nouns before giving their words in quotes ("나라 이름 '룩셈부르크'"), and ko-1's description rule needs translations after a period or comma, not in quotes.
- **A row's first word** (PAIR data, left open): want → 빌다, day → 일주야, hour → 시 lead their rows. Korean FrequencyWords cannot reorder them (it lacks most -다 forms and inflates one-syllable homonyms: 이 rank 7, 일 180).

## What was tested

| Idea | Result | Decision |
| --- | --- | --- |
| Take a term from a later source when the treebank uses its senses' parts of speech at most 10% of the time; leave it out when none has the main use | ko the, just, him; es still / even / mean; but ru okay and it okay lost "хорошо, ладно" and "Indica un assenso" (the interjection), id google, s, x, d left out (names, possessive 's), zh / th / hi / pt off left out (the particle tagged RP, counted as a preposition), id outside / additional / egyptian (the reverse glosses' Indonesian nouns), th somewhere / executive / plenty to their English definitions | Refined |
| The same, counting an interjection's uses for any sense, only classified uses, RP as an adverb, only senses whose labels are the English word's, and leaving a term out only for a closed-class main use | ko 41 / 4, es 28 / 2, th 22 / 7, pl 10 / 1, pt 7 / 2, fr 3 / 3; zh, hi, id, ru unchanged | Recommended |
| The quoted words a description ends with | ko him → 그에게, 그를; them, its, yourself, himself, ourselves, sulphur → 황; but es who's "quién es, quién esta, contracción de 'who is'" → "who is" | Refined: not words in Latin letters (the learning language's, quoted) |
| Reorder a row's words by Korean FrequencyWords | -다 predicates missing, homonyms inflated | Dropped (ko-1 found the list tied as a source order too) |

A follow-up (before merging): es "full bore" showed bear's noun (oso) once ko-2's rule gave en-es bear its table senses. The cause is rule A1b (`chooseKey`): a headword whose entry lacks the tagged part of speech goes to a base that has it, and the lemma table lists bore under bear (its past), so a noun-tagged "bore" took bear's noun. A form only takes its base's senses of the part of speech it is a form of; English nouns, adjectives and adverbs inflect only by endings, so a word tagged NN, JJ or RB that English lists in that part of speech is itself. Over every native 3 to 25 tokens change: bore → aburrir / เจาะ / ثقب; left ("on the left") → sol, gauche, левый instead of leave's "permission"; fit → 合适, uymak instead of fight's noun; gruelling, dying, demanding, staggering get their own adjectives; ko housing → 주택, teeth → 이, 치아, wrestling → 레슬링. Worse: ja trading, stabbing, ranking, cheering (EJDict's -ing entries have only adjectives, where the base's noun fitted), ko ruling → "이 / 섭 / 리", and a mis-tagged "the regime fell" (fr abattre, de fällen). th direct → แน่ว is not this rule: the treebank uses "direct" as an adjective 21 times of 23, the wordnet gives only verbs and an adverb, and the reverse glosses supply แน่ว labelled as a Thai adjective; left as it is (a guard on the later source's labels would also undo th store → ร้าน, join → เข้าร่วม, specific → เฉพาะ).

## Fixes by layer

| Layer | Rule | Where |
| --- | --- | --- |
| CORE | A term of 20 classified treebank uses or more whose senses are all of open parts of speech English Wiktionary gives it, used so at most 10% of the time and none its most translated sense's, comes from the first later source with its main use; with none and a closed-class main use it is left out (en-defs shows its English definition). Not for senses labelled by the native word (reverse glosses, reversed tables), nor a form; an interjection's uses count for any sense; RP counts as an adverb | `recipe.ts` `lesserUse`, `treebankUses`, `mergeSources` "lesser"; `native.ts` `buildPairDictionary` |
| CORE | Rule A1b: a noun, adjective or adverb the tag says has no ending, and that English lists in that part of speech, keeps its own entry rather than another base's (full bore: not bear's noun) | `word-sense.ts` `chooseKey` |
| NATIVE | An edition gloss that ends with quoted words after a description of two words or more (or is only quoted words) is those words, when each is a translation in the description's scripts and in no Latin letters; a bracketed note after them is left out | `short-lines.ts` `quotedTranslations` (`editionLine`) |

## Packs

`en-ko` 2026.1121.1 (4.13 MB); `en-ar`, `en-es`, `en-fr`, `en-pl`, `en-pt` 2026.1121.7; `en-th` 2026.1121.8; `en-tr` 2026.1121.6. `en-defs` (2026.1121.10), `en-ja`, `en-ru`, `en-de`, `en-zh`, `en-it`, `en-hi`, `en-id` and the learning packs unchanged. Gate: en-ko passes by (a): top 5,000 91.4% (tables 3,816, the edition 531, reverse glosses 225), top 2,000 95.9%; tokens 93.7% (was 98.2%: "the" has no Korean entry now, its 4.5% of tokens show the English definition). Every other pair still passes.

## Still open

- **A row's first word**: want → 빌다, day → 일주야, hour → 시, lend → 빌리다 (borrow), promote → 진급시키다. Needs a Korean frequency list that counts lemmas.
- **concern → 환**: the reverse glosses' 환 (患) follows 우려 / 염려, and "concerning" shows it alone.
- **single, forward, executive, overall, due**: the tables give only nouns where the treebank's are adjectives or adverbs; no later source has the main use, so they keep the nouns (ko-1's "single shows no main sense").
- **Contractions** described in the edition ("«you are»를 붙여서 줄여 쓴 말"), judged acceptable; i'm "저는 ...(이)예요", i've "저는 ~을 있어요".
- **yes** shows 아니요 as its second line (the answer to a negative question).
- **th direct → แน่ว, around → ตาม / บริเวณ / รอบ**: the Thai edition labels "direct" and "around" adjectives, so the shared rule takes the reverse glosses' verbs and prepositions, losing โดยตรง and ราว ๆ.
- Leads from ko-1 not reached: register (penis → 자지 first), table words tagged negative (아니다 in be), figure out → 맞히다, good's "(사람에 대하여)", hey-like words' descriptions, the provenance of glosses in printed-dictionary style.

## Measuring

```
Q=data/raw/quality/r4-ko/q
npm run data:native -- es pt ru fr de zh it pl th hi ar id tr ko   # the shared rule touches every recipe pair
DEFS=1 sh $Q/run.sh <label> ko zh th hi ar id tr es pt ru fr de it pl ja
python3 -I $Q/diff.py $Q/runs/base-ko $Q/runs/<label>-ko 40
python3 -I .claude/skills/real-content-quality/scripts/ab-packets.py --before $Q/runs/base-ko --after $Q/runs/<label>-ko --out $Q/packets/<tag> --tag <tag> --packets 1 --units-changed 0 --units-same 0
python3 -I .claude/skills/real-content-quality/scripts/ab-tally.py --key $Q/packets/<tag>/key-<tag>.json $Q/packets/<tag>/result-*.json
python3 -I $Q/prefs.py $Q/packets/<tag> <tag>
```
