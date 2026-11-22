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

## Real-site check (2026-11-22)

en → ko in the user's Chrome on the check build of `9079327` (main with PR #227), the packs from npm (en-ko 2026.1121.1, en-defs 2026.1121.10). Settings were saved first, set through `langle:check-settings` (learning en, native ko; New, Learning and Known highlighted, YouTube on) and restored at the end. Sites: English Wikipedia (Emeritus, plus a paragraph of test sentences added to the page), YouTube "Do schools kill creativity?" (Ken Robinson, iG9CE55wbtY, the fixed baseline) and "The Problem with Time Loop Games | 12 Minutes Analysis" (4cl4OAUYddA, auto-generated English captions, film and game analysis), Netflix Friends (watch/70274124). Every video muted.

Passed: the hover card, phrase card (look forward to: 기다리다 / 바라보다 / 고대하다), dictionary window (word, phrase, in a video and on an article) and the YouTube dual-subtitle Korean line (Chrome's translation under the English line) show no clipping or overlap, and the layout matches the mock; no POS label, no "(부록: …)" on the words checked. Hover lines: just 바로, 꼭, 정확히 / 이제 막 / 겨우, 간신히; him 그에게, 그를; them 그들에게, 그들을; its 그것의; yourself 너 자신; final 마지막의, 끝의, 최후의, 최종적; okay 긍정, 허락, 동의를 나타내는 말 (unchanged); left → 왼쪽 (rule A1b); particular 까다롭다 / 특정하다 / 별다르다; trading "무역 또는 상업 수행" marked Machine translation; ranking 순위; unpack 끄르다; hitman 암살자; thematically 주제별로 (Machine translation).

Found:
- **Hanja in parentheses** ("present" → 현재(現在)의, abandon → 방치(放置)하다): a translation table's words went to the hover line as they are (`pairLine`), and only an edition gloss had its asides in another script cut (`withoutForeignAsides`). 401 table senses are affected (1,060 tokens on the corpus). Fixed at display time by `tableLine` (no pack change).
- **Opening labels** "(타동사) 시작하다", "(자동사)", "(격식)", "(법률)", and a trailing "(부록: 신체 부분의 영어 이름)" (flank, millimeter) showed on the corpus: `withoutOpeningLabels` kept one word in brackets as part of the meaning. An appendix note that ends a gloss is now cut, and a Korean label: a word of two syllables or more that is in the brackets opening the glosses of three headwords or more of the dictionary, alone or in a comma list, and ends in no case particle (`openingLabels`, read from the pack at display, 2.5 ms once; 46 words). After a label only another label is cut. A complement or modifier stays ((잠에서) 깨다, (빚을) 청산하다, (미리) 정하다), and so does a rarer label, as before. "Opening labels compared" below has the candidates.
- **Corpus effect** (`measure.ts`, against main c7bd3c0): 1,325 ko word tokens change (296 distinct), 1,073 by the hanja and appendix cuts, 252 (94 distinct lines, all read) by the label cut; a line a hanja or label made too wide now keeps what the cap had dropped (demonstrate 증거[실례]를 …). One phrase changes (pull out → 회수하다). The other 14 natives' rows are identical (th, zh, hi, ar, id, tr, es, pt, ru, fr, de, it, pl, ja).
- **ruling → 이 / 섭 / 리** (confirmed): the senses are Hangul syllable pages of English Wiktionary's Korean entries (part of speech "syllable": 理 is glossed "ruling") that the reverse glosses read as words. 184 en-ko entries have a "syllable" sense, 92 only such ones (agonize → 민, ashen → 이 / 리, brocade → 금, gallop → 무 / 등). Fixed in ko-4 below.
- **bore → bear** (곰 / 나르다 / 견디다, "bore → bear") for "The bore of the gun is wide." and "He is such a bore", in Chrome only: the same commit's offline measure (`measure.ts`) shows bore's own noun (뚫은 구멍, 시추공), and "left" and "gruelling" are right in Chrome, so rule A1b works there. Traced in ko-4 below.
- Left as they are (3 entries): "燦爛하다" (brilliant: hanja without brackets), "민족주의자((民族主義者) (minjokjuuija()" (nationalist: malformed brackets), "(남의 언설(言說) 등을)" (endorse: hanja inside nested brackets).
- Netflix (Friends, S6E7): English subtitles and cards work (unpack → 끄르다, "unpacked → unpack"), but no Korean line under the English one on this title, which has no Korean track (Japanese UI).
- Not checked: es still / even and th store / direct (optional, skipped to keep the user's settings changes short).
- Settings and error log (done by the orchestrator at about 14:55 JST on 2026-11-22, after the Chrome tools came back): the saved settings were restored and read back equal; the check build's error log held 18 entries, all info pack-mirror records (en, en-defs, en-ko served by jsDelivr, none failed), no error or warning; it was cleared and read back empty. One old Wikipedia tab was unresponsive, so anything only its content script held was not read.
- The label rule above was chosen after this check and was not re-checked in Chrome.

### Opening labels compared

Every single Korean word in brackets that cutting any such word of two syllables or more would take from en-ko's edition glosses (295 distinct, 665 brackets) was read and called a label (register, region, domain, grammar: 122, 475 brackets) or not (a complement, a modifier, or unsure, which stays: 173, 190 brackets). One reader, no blind judge. Distinct / brackets:

| Rule | Cut | Wrongly cut | Wrongly kept |
| --- | --- | --- | --- |
| main (cut none) | 0 | 0 | 122 / 475 |
| Cut every such word | 295 / 665 | 173 / 190 | 0 |
| Ends in no case particle | 163 / 517 | 50 / 52 | 9 / 10 |
| Ends in no case particle or modifier ending | 149 / 502 | 39 / 40 | 12 / 13 |
| Opens 3 headwords, alone | 38 / 383 | 3 / 11 | 87 / 103 |
| Opens 3 headwords, alone or in a list | 49 / 400 | 4 / 13 | 77 / 88 |
| Opens 5 headwords, alone or in a list | 26 / 339 | 0 | 96 / 136 |
| Opens 3 headwords alone, no case particle | 35 / 372 | 0 | 87 / 103 |
| Opens 2 headwords, alone or in a list, no case particle | 63 / 413 | 5 / 7 | 64 / 69 |
| **Opens 3 headwords, alone or in a list, no case particle** | **45 / 387** | **0** | **77 / 88** |

Endings alone cannot tell a bare-noun or adverb complement ((기분) 상하게 하다, (미리) 정하다) from a label. What the chosen rule keeps wrongly is mostly labels seen once or twice (채팅, 요리, 전신). Two cut brackets are borderline, the label being also the verb's subject: languish "(식물) 시들다", roar "(동물) 으르렁거리다". Several words in brackets after a label stay too: cutting on took 47 of them, nearly all complements ((격식) (잘못된 것을) 바로잡다).

## ko-4: syllable pages, bore → bear (2026-11-22)

### Syllable pages read as words (fixed, data)

- **Cause**: `NOT_WORDS` left out characters, affixes and romanizations, but not kaikki's "syllable" (377 Korean entries, each one Hangul syllable glossed with the meanings of the hanja read so) or "combining_form" (8 Hindi entries).
- **Rule**: an entry that is a unit of writing or a bound piece of a word is no word. Every part of speech of the th, hi, ar, id, tr and ko extracts was listed. Kept, after reading samples: root (ko 255, "Rarely used alone", none in the pack; id 115, mixed: samin "ghee", luap; in 6 en-id entries), counter (ko 96, real words), contraction.
- **Per pair**, the six rebuilt and every changed entry read: th, ar, id and tr are identical. hi loses 1 term (wooden → कठ-) and 1 sense (coarse). ko loses 92 terms and changes 92 (the syllable goes; 금 stays gold's and fissure's, 이 tooth's). de-fr, which reads reversed tables, loses no word.
- **What the lost terms show**: en-defs is rebuilt and gains 13 terms it left out while every pair had them (inferior, keen, pleased, wooden and the like); nothing else in it changes. The English definition is then translated at display. Two of the 93 get no definition: waves follows wave (물결), and aslant shows nothing (its senses are archaic).
- **Gate**: en-ko top 5,000 4,572 → 4,571 (91.4%), tokens 134,222 → 134,209 (93.7%), phrases 11.4 → 11.3%: passes by (a). en-hi top 5,000 4,164 → 4,163, tokens 91.1% as before: passes by (b).
- **Corpus** (2026-11, 15 natives): ko 160 tokens change (66 kinds, all read), the other 14 none. Most drop a meaningless syllable for a real word or for the English definition (ruling, inferior, progression). Definitions that give the wrong sense where a meaningless syllable was: rising → "Rebellion" (rising mortality), striker → a person on strike (football), much less → "Let alone" (much less certain), offer up → thanks to God (offer up information), wrap around → text wrapping (a bandage).
- **Rebuild drift, fixed**: since #230 `shortOfPairSenses` cuts asides, so any pair rebuilt stored a table's uncut first word as an override ("현재(現在)의"), undoing #230's hover fix. `packedEntry` no longer stores it. With that, the six pairs rebuild byte for byte from the unchanged rule. The other natives' packs hold no entry it writes differently (checked on their stored shorts, not rebuilt).
- **Left**: a de-fr rebuild drops two trailing separators (Anteilnahme, hervortreten), unrelated to this rule; that pack is not republished.

### bore → bear (cause found, awaits the user's decision)

- **Reproduced** in Playwright (check build of ff4d231, native ko, the lock's packs). A clean profile shows bore's own noun. With "bear" saved, known or learning, both sentences key bear, and the card reads "bore → bear" 곰 / 나르다 / 견디다.
- **Cause**: `classifyWord` keys a word by any saved base, and `bySense` runs `chooseKey` (A1, A1b) only for unsaved words, as specified. #227's exception works; it is never reached. That the ko-3 profile had bear saved is inferred: its saved words were not read.
- **Not changed**, as it decides what a saved word highlights, counts and records. Applying A1b to saved words would touch up to 638 corpus tokens (155 form > base pairs): better for bore, left, ground, bit; debatable for meeting, interested, building, thanks; worse for teeth, media, criteria, phenomena. Options:
  - A. A1b for saved words too: code only, with those losses.
  - B. A saved base claims a form only in the part of speech it is a form of: keeps plurals, needs that part of speech in the en pack, still parts meeting from meet.
  - C. Keep the rule: bore is bear's while bear is saved.

### `measure.ts` differs from the extension (not fixed here)

- It always measures with no saved word, so it cannot show the case above.
- Since 2387af8 (2026-11-21 04:08) the extension passes `spelledOut` to the classifier and measure does not: 36 tokens of 13 forms per native on the 2026-11 corpus (AGI, AED, PKK, ECHR) show no meaning in measure. Runs of code from that commit on (th-2, hi-2, ar-2, id-2, tr-2, ko-2, ko-3's corpus effect, c001, this one) miss those tokens on both sides; changes to other tokens are unaffected by it.
- Both need an edit of `.claude/skills/real-content-quality/scripts/measure.ts`, which the step could not write; the patch is handed over with the step's report.

### To check in Chrome, once the packs are on npm

ruling, inferior, pleased, progression, brilliant, framework, concern (ko) and wooden (hi); present and abandon still without hanja; bore with bear unsaved, then saved.

## Real-site re-check (2026-11-22)

In the user's Chrome on the check build of `7b54251` (main with #230 and #232), en-ko, en-hi and en-defs 2026.1122.0 from jsDelivr (the log held 17 info mirror records, all served by jsDelivr). Settings were saved, set through `langle:check-settings` (learning en, native ko, then hi, then ko again with Known highlighted and YouTube on) and restored; read back, every key equal. Where: English Wikipedia (the "Bore (engineering)" page, which has no article; **all test words below were inserted** as one paragraph into the tab's DOM), YouTube Ken Robinson (iG9CE55wbtY, 2:00 and 2:07: the Korean line under the English one, hover card, dictionary window, no clipping or overlap) and an auto-captioned cooking video, "French Onion Soup Everyone Needs To Make" (kd6lUmbj5ig, Joshua Weissman; the corpus lists it as "The Best French Onion Soup Ever"; its captions carry "[music]"). Videos muted through the video element.

Hover lines seen (card unless noted):
- **Syllable pages gone**: ruling 권위 있는 사람의 명령 또는 법률에 대한 결정 (Machine translation; the dictionary window also lists adjective 그 규칙; 우세한; 수석; 통치; 제어 with the English definition); inferior 순위, 지위 또는 품질이 낮습니다 (MT); pleased 행복, 콘텐츠 (MT; "content" read as the noun); progression 한 가지에서 다른 것으로 이동하는 행위 (MT); brilliant 찬란하다 / 燦爛하다 (the known hanja without brackets); framework 규모 / 틀 / 골격; concern 우려 / 염려 / 심려. None is a lone syllable.
- **No hanja in brackets**: present 선사하다; abandon 방치하다 / 단념하다 / 포기하다.
- **Labels cut**: commence 시작되다 / 시작하다; rob 빼앗다.
- **Complements kept**: rectify (잘못된 것을) 바로잡다; awake 깨어 있는 / (잠에서) 깨다 / 깨우다, 일으키다; liquidate (회사를) 정리하다, 청산하다; deem (…로) 여기다, 생각하다, 간주하다; predetermine 미리 계획하다, 예정하다 (no bracket on this line; the earlier example "(미리) 정하다" was not on screen); dispatch (타) (군대·특사 등을) 급파 [특파] 하다 / (서한을) 보내다, 발송하다, 통지하다: the one-syllable label "(타)" stays, as the two-syllable minimum says. spit's hover shows 침; its dictionary window 침을뱉다, 뱉다 (verb) and 침 (noun).
- **hi**: wooden लकड़ी से बना है (MT), coarse मोटा / परुष. No कठ-.
- **bore** ("The bore of the gun is wide.", "He is such a bore"): both read "bore → bear", 곰, status Known; the dictionary window shows bear as saved: the Known button is active and "Remove" is offered, so bear is saved as Known in the user's data. Nothing was saved, removed or changed. This is the open decision above.
- gruelling 매우 어렵거나 부담스럽습니다 (MT): keyed gruelling, not gruel.
- Also seen: wooden 목조, coarse 상스럽다 / 비속하다 (ko); cooked → cook 요리하다 / 요리사; baggy 헐렁하다; sachet 향주머니; interest 이자 / 흥미 / 이익.

Problems: none new. The hover card of the video shows the previous word for a moment after the pointer moves (a screenshot within a second saw it); a second later it was right. The Wikipedia tab left open before this check (Emeritus) was not touched.
