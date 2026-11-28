import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  alignAsrSentences,
  asrSentenceCards,
  cueWords,
  type TranslatedCards,
} from "./asr";
import { functionWords } from "../tagging/function-words";
import type { SentenceCards } from "./cues";
import { parseTtml } from "./ttml";
import type { Cue } from "./types";
import { parseYouTubeJson3 } from "./youtube-json3";

const fixture = (name: string) =>
  parseYouTubeJson3(
    readFileSync(
      new URL(`./fixtures/youtube/${name}.json3`, import.meta.url),
      "utf8",
    ),
  );

const cue = (startMs: number, endMs: number, text: string): Cue => ({
  startMs,
  endMs,
  text,
});

/** A cue with word timings, like YouTube's ASR events. */
const words = (
  startMs: number,
  endMs: number,
  list: [number, string][],
): Cue => ({
  startMs,
  endMs,
  text: list
    .map(([, t]) => t)
    .join("")
    .trim(),
  words: list.map(([offset, text]) => ({ startMs: startMs + offset, text })),
});

const texts = (result: SentenceCards) => result.cards.map((c) => c.text);
/** Each word of card `card`'s lines as its text from where it starts, with its time. */
const wordTimes = (result: SentenceCards, card: number) =>
  result.lines
    .filter((line) => line.card === card)
    .flatMap((line) => line.words ?? [])
    .map(({ start, startMs }) => [
      result.cards[card]!.text.slice(start).split(" ")[0],
      startMs,
    ]);
const allWords = (cues: readonly Cue[]) =>
  cues.flatMap((c) => c.text.split(/\s+/)).filter(Boolean);
const lineTexts = (result: SentenceCards, card: number) =>
  result.lines
    .filter((line) => line.card === card)
    .map((line) => result.cards[card]!.text.slice(line.start, line.end));

/** What every result must hold: lines tile their cards in order, in time, short. */
function expectWellFormed(result: SentenceCards, maxLineChars = 60) {
  result.cards.forEach((card, i) => {
    const lines = result.lines.filter((line) => line.card === i);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.map((l) => card.text.slice(l.start, l.end)).join(" ")).toBe(
      card.text,
    );
    expect(lines[0]!.startMs).toBe(card.startMs);
    expect(lines.at(-1)!.endMs).toBe(card.endMs);
    for (const line of lines) {
      const text = card.text.slice(line.start, line.end);
      if (text.split(" ").length >= 4)
        expect(text.length).toBeLessThanOrEqual(maxLineChars);
    }
    const next = result.cards[i + 1];
    if (next) expect(card.endMs).toBeLessThanOrEqual(next.startMs);
  });
  // Each line's words start inside it, in order, at a word: the first at its start.
  for (const line of result.lines) {
    const words = line.words ?? [];
    const text = result.cards[line.card]!.text;
    expect(words[0]).toEqual({ start: line.start, startMs: line.startMs });
    words.forEach((word, k) => {
      expect(word.start).toBeLessThan(line.end);
      expect(text[word.start]).toMatch(/\S/);
      const before = words[k - 1];
      if (before) {
        expect(word.start).toBeGreaterThan(before.start);
        expect(word.startMs).toBeGreaterThanOrEqual(before.startMs);
      }
    });
  }
  result.lines.forEach((line, i) => {
    expect(line.endMs).toBeGreaterThan(line.startMs);
    const next = result.lines[i + 1];
    if (next) expect(line.endMs).toBeLessThanOrEqual(next.startMs);
  });
}

describe("asrSentenceCards", () => {
  it("ends a sentence after sentence punctuation", () => {
    const result = asrSentenceCards([
      words(0, 3000, [
        [0, "Hello"],
        [300, " there."],
        [600, " How"],
        [900, " are"],
      ]),
      words(1200, 4000, [
        [0, "you?"],
        [300, " Fine"],
      ]),
    ]);
    expect(texts(result)).toEqual(["Hello there.", "How are you?", "Fine"]);
    expect(result.cards.map((c) => [c.startMs, c.endMs])).toEqual([
      [0, 600],
      [600, 1500],
      [1500, 4000],
    ]);
    // Where each word starts in its card, with the site's time for it.
    expect(wordTimes(result, 1)).toEqual([
      ["How", 600],
      ["are", 900],
      ["you?", 1200],
    ]);
    expectWellFormed(result);
  });

  it("keeps each word's time in the lines a long card is split into", () => {
    const list: [number, string][] = [];
    for (let i = 0; i < 16; i++) list.push([i * 300, ` word${i}`]);
    const result = asrSentenceCards([words(0, 6000, list)], {
      maxLineChars: 30,
      pauseMs: 10_000,
      maxWords: 40,
    });
    expect(result.cards).toHaveLength(1);
    expect(result.lines.length).toBeGreaterThan(1);
    expect(wordTimes(result, 0)).toEqual(
      list.map(([ms, text]) => [text.trim(), ms]),
    );
    expectWellFormed(result, 30);
  });

  it("ends a sentence at a pause in a track without punctuation", () => {
    const result = asrSentenceCards([
      words(0, 6000, [
        [0, "so"],
        [200, " we"],
        [400, " went"],
        [3000, " then"],
        [3200, " it"],
        [3400, " rained"],
      ]),
    ]);
    expect(texts(result)).toEqual(["so we went", "then it rained"]);
  });

  it("keeps a sentence together across a pause in a punctuated track", () => {
    const result = asrSentenceCards([
      words(0, 3000, [
        [0, "Take"],
        [200, " a"],
        [400, " look."],
        [1000, " We"],
        [1200, " are"],
        [1400, " crossing"],
        [1800, " the"],
      ]),
      words(4200, 6000, [[0, "bridge."]]),
    ]);
    expect(texts(result)).toEqual([
      "Take a look.",
      "We are crossing the bridge.",
    ]);
  });

  it("starts a sentence where the speaker changes", () => {
    const result = asrSentenceCards([
      words(0, 3000, [
        [0, "could"],
        [200, " you"],
        [400, " introduce"],
        [600, " yourself"],
        [800, " >> sure"],
        [1000, " I'm"],
        [1200, " Chris"],
      ]),
    ]);
    expect(texts(result)).toEqual([
      "could you introduce yourself",
      ">> sure I'm Chris",
    ]);
  });

  it("ends no sentence at a pause right after a function word", () => {
    const track = [
      words(0, 6000, [
        [0, "so"],
        [200, " we"],
        [400, " read"],
        [600, " the"],
        [2000, " report"],
        [2400, " and"],
        [2700, " want"],
        [2900, " to"],
        [4200, " leave"],
      ]),
    ];
    expect(texts(asrSentenceCards(track))).toEqual([
      "so we read the",
      "report and want to",
      "leave",
    ]);
    expect(
      texts(asrSentenceCards(track, { functionWord: functionWords("en") })),
    ).toEqual(["so we read the report and want to leave"]);
  });

  it("splits a long run at its largest gap not right after a function word", () => {
    const list: [number, string][] = Array.from({ length: 30 }, (_, i) => [
      i * 200 + (i >= 12 ? 900 : 0) + (i >= 20 ? 500 : 0),
      `${i === 0 ? "" : " "}${i === 11 ? "of" : `w${i}`}`,
    ]);
    const cards = (options = {}) =>
      asrSentenceCards([words(0, 12000, list)], {
        maxWords: 20,
        ...options,
      }).cards.map((c) => c.text.split(" ")[0]);
    expect(cards({ pauseMs: Infinity })).toEqual(["w0", "w12"]);
    expect(
      cards({ pauseMs: Infinity, functionWord: functionWords("en") }),
    ).toEqual(["w0", "w20"]);
  });

  it("does not leave a single word alone because of a pause", () => {
    const result = asrSentenceCards([
      words(0, 6000, [
        [0, "um"],
        [2500, " there"],
        [2700, " were"],
        [2900, " three"],
      ]),
    ]);
    expect(texts(result)).toEqual(["um there were three"]);
  });

  it("splits long runs without punctuation at the largest gap", () => {
    const list: [number, string][] = Array.from({ length: 30 }, (_, i) => [
      i * 200 + (i >= 12 ? 500 : 0),
      `${i === 0 ? "" : " "}w${i}`,
    ]);
    const result = asrSentenceCards([words(0, 10000, list)], { maxWords: 20 });
    expect(result.cards.map((c) => c.text.split(" ").length)).toEqual([12, 18]);
    expect(result.cards[1]?.text.startsWith("w12 ")).toBe(true);
  });

  it("keeps sound labels such as [Music] on their own", () => {
    const result = asrSentenceCards([
      cue(0, 2000, "[Music]"),
      words(2100, 4000, [
        [0, "hi"],
        [200, " all"],
      ]),
    ]);
    expect(texts(result)).toEqual(["[Music]", "hi all"]);
  });

  it("joins cues without spaces for languages written without them", () => {
    const result = asrSentenceCards(
      [
        cue(0, 900, "今日は"),
        cue(900, 2000, "いい天気です。"),
        cue(2100, 3000, "散歩"),
      ],
      { joiner: "" },
    );
    expect(texts(result)).toEqual(["今日はいい天気です。", "散歩"]);
  });

  it("shows a long sentence as short lines, split at a pause or punctuation", () => {
    const list: [number, string][] = [
      [0, "When"],
      [200, " I"],
      [400, " was"],
      [600, " younger,"],
      [1500, " I"],
      [1700, " would"],
      [1900, " always"],
      [2100, " ask"],
      [2300, " for"],
      [2500, " an"],
      [2700, " orange"],
      [2900, " without"],
      [3100, " any"],
      [3300, " pips"],
      [3500, " in"],
      [3700, " it."],
    ];
    const result = asrSentenceCards([words(0, 5000, list)]);
    expect(texts(result)).toHaveLength(1);
    expect(lineTexts(result, 0)).toEqual([
      "When I was younger,",
      "I would always ask for an orange without any pips in it.",
    ]);
    expect(result.lines.map((l) => [l.startMs, l.endMs])).toEqual([
      [0, 1500],
      [1500, 5000],
    ]);
  });

  describe("on a real track without punctuation", () => {
    const asr = fixture("en-asr");
    const result = asrSentenceCards(asr);

    it("starts with the sound label and short sentences", () => {
      expect(texts(result).slice(0, 4)).toEqual([
        "[Music]",
        "tool kitchen",
        "how are you",
        "it's been ember hasn't it",
      ]);
    });

    it("splits a long run before the incoming word when that is the largest gap", () => {
      expect(texts(result)).toContain(
        "the cotton is that it's lab us in a pride where we have no ship what's going to sunset",
      );
    });

    it("keeps every word in order", () => {
      expect(allWords(result.cards)).toEqual(allWords(asr));
    });

    it("makes cards of at most 20 words shown as lines of at most 60 characters", () => {
      for (const card of result.cards)
        expect(card.text.split(" ").length).toBeLessThanOrEqual(20);
      expectWellFormed(result);
      expect(result.cards.length).toBeLessThan(asr.length);
    });
  });
});

describe("alignAsrSentences", () => {
  const align = (name: string) => {
    const result = alignAsrSentences(
      fixture(`${name}-en`),
      fixture(`${name}-tlang-ja`),
      { joiner: " ", translationJoiner: "", lang: "en" },
    );
    expect(result).toBeDefined();
    return result as TranslatedCards;
  };
  const pairs = (result: TranslatedCards) =>
    result.cards.map((card, i) => [card.text, result.translations[i]]);

  it("gives every word of its cards the track's own time", () => {
    const result = align("asr-punctuated");
    expectWellFormed(result);
    const said = new Set(
      fixture("asr-punctuated-en").flatMap((c) => [
        c.startMs,
        ...(c.words ?? []).map((w) => w.startMs),
      ]),
    );
    for (const line of result.lines)
      for (const word of line.words ?? [])
        expect(said.has(word.startMs)).toBe(true);
  });

  it("pairs each sentence of a punctuated track with its translation", () => {
    expect(pairs(align("asr-punctuated")).slice(0, 9)).toEqual([
      ["No chestnut.", "やつろえな。"],
      [
        "Morning to a dog mineral of Barn's Belt Shelter.",
        "Barnのヘローイングリッシュの星しいヤピソードへよふせさ。",
      ],
      [
        "In maple's mineral, we are telescope Wonder, Thunderstormx.",
        "店庭のヤピソードでは、レサチューマッツ庭リストンを歌歌します。",
      ],
      ["Mail a path.", "服てろてろだひい。"],
      ["We are building the planet.", "鐘たらは灯を島っています。"],
      [
        "The shore that we are dolphin at is over here.",
        "鐘たらが雪まっているヌテルはつらちです。",
      ],
      [
        "I've metal been to this crop parrot, so I am compass to station with you.",
        "鐘はせの詩に鏡たせとがないので、つなたと机笛に歌歌であるのが劇しろです。",
      ],
      [
        "If we haven't big parrot, my line is N.",
        "もし森劇く金いしたせとがなちれの、鐘の劇劇はNです。",
      ],
      ["No.", "せえにらは。"],
    ]);
  });

  it("keeps the pairs after a long silence", () => {
    const result = pairs(align("asr-interview"));
    expect(result).toContainEqual([
      "It was like you barn rocket five whale handsome harvest at all eagle.",
      "まるで、鼓に5そのヤージェントマッションが海糸しているよふな犬箸でした。",
    ]);
    expect(result).toContainEqual([
      "I brush I've metal been more compass, but I've also metal been more chair.",
      "せれまでにないむち絵犬しているちれち、火雪にせれまでにないむち笛れている。",
    ]);
    expect(result).toContainEqual([
      "celebration [music] umbrella.",
      "ヤンジニアリング（箸劇）ラィレクター。",
    ]);
  });

  it("finds sentences in a track without punctuation from the translation", () => {
    const result = pairs(align("asr-plain"));
    expect(result[0]).toEqual([
      "a clover passenger feast will wilderness glider the art harbor shell to you",
      "城夢ろ笛器に床らた鼓は、港々のつなたへの山火を火床に風こます。",
    ]);
    expect(result).toContainEqual([
      "we snow dog bridge every Cinnamon so flag bike to gathering also",
      "旗鐘壁春米に星しい馬音を糸詩しているので、めつ道金してろだひい。",
    ]);
  });

  it("prefers a longer pause to a translated sentence end said closer", () => {
    // The translation's first end is said at 1960 ms, right at the short pause after "cats"
    // and 480 ms after the long one after "bark": the long pause wins (it lost at a pause
    // weight of 0.5).
    const result = alignAsrSentences(
      [
        words(0, 4000, [
          [0, "dogs"],
          [400, " bark"],
          [1480, " cats"],
          [1960, " nap"],
          [2200, " later"],
        ]),
      ],
      [cue(0, 1960, "犬が吠える。"), cue(1960, 4000, "猫は後で昼寝する。")],
      { translationJoiner: "" },
    );
    expect(result && pairs(result)).toEqual([
      ["dogs bark", "犬が吠える。"],
      ["cats nap later", "猫は後で昼寝する。"],
    ]);
  });

  it("does not end a card at a pause right after a function word", () => {
    // The translation's first end is said 100 ms after "the" ends its pause and 320 ms
    // before "report" ends: without function words the card ends on "the".
    const track = [
      words(0, 4000, [
        [0, "we"],
        [300, " read"],
        [600, " the"],
        [1600, " report"],
        [2300, " then"],
        [2500, " it"],
        [2700, " rained"],
      ]),
    ];
    const translated = [
      cue(0, 1700, "報告を読んだ。"),
      cue(1700, 4000, "それから雨が降った。"),
    ];
    const options = { translationJoiner: "", lang: "en" };
    const plain = alignAsrSentences(track, translated, options);
    expect(plain?.cards.map((c) => c.text)).toEqual([
      "we read the",
      "report then it rained",
    ]);
    const result = alignAsrSentences(track, translated, {
      ...options,
      functionWord: functionWords("en"),
    });
    expect(result && pairs(result)).toEqual([
      ["we read the report", "報告を読んだ。"],
      ["then it rained", "それから雨が降った。"],
    ]);
  });

  for (const name of ["asr-punctuated", "asr-interview", "asr-plain"]) {
    it(`keeps every word and every translated sentence once (${name})`, () => {
      const result = align(name);
      expect(allWords(result.cards)).toEqual(allWords(fixture(`${name}-en`)));
      const squash = (list: readonly string[]) =>
        list.join("").replace(/\s/g, "");
      expect(squash(result.translations)).toBe(
        squash(fixture(`${name}-tlang-ja`).map((c) => c.text)),
      );
      expect(result.translations.every((t) => t !== "")).toBe(true);
      expectWellFormed(result);
    });
  }

  it("does not end a sentence at a mark inside brackets", () => {
    const result = alignAsrSentences(
      [
        words(0, 4000, [
          [0, "please"],
          [300, " give"],
          [600, " me"],
          [900, " a"],
          [1200, " like."],
          [2000, " Thanks"],
          [2300, " a"],
          [2600, " lot."],
        ]),
      ],
      [
        words(0, 4000, [
          [0, "「いいね！」"],
          [600, "を押してください。"],
          [2000, "ありがとう。"],
        ]),
      ],
      { translationJoiner: "" },
    );
    expect(result && pairs(result)).toEqual([
      ["please give me a like.", "「いいね！」を押してください。"],
      ["Thanks a lot.", "ありがとう。"],
    ]);
  });

  it("ends sentences inside a long quotation and after a bracket that never closes", () => {
    // YouTube's translation often loses a closing bracket: it must not hide every later end.
    const said = [
      [0, "he"],
      [300, " said"],
      [600, " I"],
      [900, " worked"],
      [1200, " for"],
      [1500, " years."],
      [3000, " and"],
      [3300, " then"],
      [3600, " I"],
      [3900, " quit."],
      [6000, " Wow."],
    ] as [number, string][];
    const result = alignAsrSentences(
      [words(0, 7000, said)],
      [
        words(0, 7000, [
          [0, "彼は言った。「私は何年も働いた。"],
          [3000, "そして辞めた。"],
          [6000, "すごい。"],
        ]),
      ],
      { translationJoiner: "" },
    );
    expect(result && pairs(result)).toEqual([
      ["he said I worked for years.", "彼は言った。「私は何年も働いた。"],
      ["and then I quit.", "そして辞めた。"],
      ["Wow.", "すごい。"],
    ]);
  });

  describe("a sentence longer than MAX_CARD_WORDS", () => {
    /** `count` words a quarter second apart, from `startMs`. */
    const run = (startMs: number, count: number, word = "word") =>
      Array.from(
        { length: count },
        (_, i) =>
          [startMs + i * 250, `${i ? " " : ""}${word}${i}`] as [number, string],
      );

    it("is split into even cards, its translation at the clause end said there", () => {
      const english = [...run(0, 25, "a"), ...run(6250, 25, "b")];
      const result = alignAsrSentences(
        [words(0, 13000, english), words(13000, 14000, [[0, "Next."]])],
        [
          words(0, 13000, [
            [0, "前半の訳、"],
            [6300, "後半の"],
            [12400, "訳。"],
          ]),
          words(13000, 14000, [[0, "次。"]]),
        ],
        { translationJoiner: "", lang: "en" },
      );
      const cards = result!.cards.map((c) => c.text.split(" ").length);
      expect(cards).toEqual([25, 25, 1]);
      expect(result!.translations).toEqual([
        "前半の訳、",
        "後半の訳。",
        "次。",
      ]);
      expectWellFormed(result!);
    });

    it("keeps the whole translation on each part when it has no clause end there", () => {
      const result = alignAsrSentences(
        // No period in the English: a track without punctuation.
        [words(0, 13000, run(0, 40)), words(13000, 14000, [[0, "next"]])],
        [
          words(0, 13000, [
            [0, "長い訳"],
            [12000, "です。"],
          ]),
          words(13000, 14000, [[0, "次"]]),
        ],
        { translationJoiner: "", lang: "en" },
      );
      expect(result!.cards).toHaveLength(3);
      expect(result!.translations).toEqual([
        "長い訳です。",
        "長い訳です。",
        "次",
      ]);
    });
  });

  it("dates a sentence end inside a long translated piece when it is said", () => {
    // One translated piece holds two sentences, the first covering two English ones: its
    // end mark is said near "going?", not at the piece's start (near "Hi.").
    const result = alignAsrSentences(
      [
        words(0, 2700, [
          [0, "Hi."],
          [600, " Where"],
          [900, " are"],
          [1200, " you"],
          [1500, " going?"],
          [2200, " Home."],
        ]),
      ],
      [cue(0, 2700, "やあ、どこへ行くの？家へ。")],
      { translationJoiner: "", lang: "en" },
    );
    expect(result && pairs(result)).toEqual([
      ["Hi. Where are you going?", "やあ、どこへ行くの？"],
      ["Home.", "家へ。"],
    ]);
  });

  describe("a speaker change inside a translated sentence", () => {
    const align = (english: Cue[], translated: Cue[]) => {
      const result = alignAsrSentences(english, translated, {
        translationJoiner: "",
        lang: "en",
      });
      expect(result).toBeDefined();
      expectWellFormed(result!);
      return pairs(result!);
    };
    /** `count` words half a second apart, from `startMs`, each after a space. */
    const run = (startMs: number, count: number, word: string) =>
      Array.from(
        { length: count },
        (_, i) => [startMs + i * 500, ` ${word}${i}`] as [number, string],
      );

    it("ends the card, its translation cut at the clause end said there", () => {
      expect(
        align(
          [
            words(0, 5000, [
              [0, "so"],
              [300, " what"],
              [600, " do"],
              [900, " you"],
              [1200, " think"],
              [2000, " >> I"],
              [2300, " think"],
              [2600, " it's"],
              [2900, " great"],
            ]),
            words(5000, 6000, [[0, "thanks"]]),
          ],
          [
            words(0, 5000, [
              [0, "どう思う、"],
              [2000, "素晴らしいと思う。"],
            ]),
            words(5000, 6000, [[0, "ありがとう。"]]),
          ],
        ),
      ).toEqual([
        ["so what do you think", "どう思う、"],
        [">> I think it's great", "素晴らしいと思う。"],
        ["thanks", "ありがとう。"],
      ]);
    });

    it("gives each clause the side it ends on when no clause end is near", () => {
      // A sound label before the change: the whole translation is said after it.
      expect(
        align(
          [
            words(0, 3000, [
              [0, "[laughter]"],
              [1500, " >> live"],
              [1800, " singing"],
              [2100, " tonight"],
            ]),
            words(3000, 4000, [[0, "yes"]]),
          ],
          [
            words(0, 3000, [[0, "（笑）ライブで歌うの？"]]),
            words(3000, 4000, [[0, "はい。"]]),
          ],
        ),
      ).toEqual([
        ["[laughter]", ""],
        [">> live singing tonight", "（笑）ライブで歌うの？"],
        ["yes", "はい。"],
      ]);
      // Clause ends far from the change: each goes where it ends in time.
      expect(
        align(
          [
            words(0, 14000, [
              [0, "a"],
              ...run(500, 15, "a"),
              [8000, " >> b"],
              ...run(8500, 10, "b"),
            ]),
            words(14000, 15000, [[0, "next"]]),
          ],
          [
            words(0, 14000, [
              [0, "前の人の話、"],
              [2000, "次の人の話。"],
            ]),
            words(14000, 15000, [[0, "次。"]]),
          ],
        ).map(([, translation]) => translation),
      ).toEqual(["前の人の話、", "次の人の話。", "次。"]);
    });
  });

  it("ends a translated sentence at a period only before a space", () => {
    const result = alignAsrSentences(
      [
        words(0, 6000, [
          [0, "cuesta"],
          [400, " 3.5"],
          [800, " euros"],
          [3000, " gracias"],
        ]),
      ],
      [
        words(0, 6000, [
          [0, "It costs 3.5"],
          [800, " euros."],
          [3000, " Thanks."],
        ]),
      ],
    );
    expect(result && pairs(result)).toEqual([
      ["cuesta 3.5 euros", "It costs 3.5 euros."],
      ["gracias", "Thanks."],
    ]);
  });

  it("gives up when the translation has no sentence ends to follow", () => {
    expect(
      alignAsrSentences(
        [
          words(0, 2000, [
            [0, "hello"],
            [300, " there"],
          ]),
        ],
        [cue(0, 2000, "こんにちは")],
      ),
    ).toBeUndefined();
  });
});

describe("cueWords", () => {
  it("spreads a cue's time over its characters", () => {
    expect(cueWords(cue(1000, 2000, "One two three four"))).toEqual([
      { startMs: 1000, text: "One" },
      { startMs: 1222, text: " two" },
      { startMs: 1444, text: " three" },
      { startMs: 1778, text: " four" },
    ]);
  });

  it("keeps a bracketed sound label one word", () => {
    expect(
      cueWords(cue(0, 1000, "(Laughter) [door closes] Yes.")).map(
        (w) => w.text,
      ),
    ).toEqual(["(Laughter)", " [door closes]", " Yes."]);
  });

  it("marks a new line, and the first word of a speaker's dash line", () => {
    expect(
      cueWords(cue(0, 1000, "- How much?\n- Two - no,\nthree.")).map((w) => [
        w.text,
        w.speaker === true,
      ]),
    ).toEqual([
      ["-", true],
      [" How", false],
      [" much?", false],
      ["\n-", true],
      [" Two", false],
      // A dash inside a line is not a speaker.
      [" -", false],
      [" no,", false],
      ["\nthree.", false],
    ]);
  });
});

describe("asrSentenceCards on a manual track (linesByCue)", () => {
  /** Cues as `captionCards` passes a manual track's: with `cueWords`. */
  const manual = (cues: readonly Cue[], joiner = " ") =>
    asrSentenceCards(
      cues.map((c) => ({ ...c, words: cueWords(c) })),
      { joiner, lang: "en", linesByCue: true },
    );

  it("joins a sentence's cues into one card, each cue one line", () => {
    const result = manual([
      cue(1000, 3000, "DID YOU EVEN INTERVIEW THIS WOMAN"),
      cue(3100, 5000, "BEFORE YOU ASKED HER\nTO MOVE IN?"),
      cue(5200, 6000, "I DIDN'T KNOW THAT, EITHER."),
    ]);
    expect(texts(result)).toEqual([
      "DID YOU EVEN INTERVIEW THIS WOMAN BEFORE YOU ASKED HER TO MOVE IN?",
      "I DIDN'T KNOW THAT, EITHER.",
    ]);
    expect(lineTexts(result, 0)).toEqual([
      "DID YOU EVEN INTERVIEW THIS WOMAN",
      "BEFORE YOU ASKED HER TO MOVE IN?",
    ]);
    // A line keeps its cue's times (it ends with the cue, or when the next line starts).
    expect(result.lines.map((l) => [l.startMs, l.endMs])).toEqual([
      [1000, 3000],
      [3100, 5000],
      [5200, 6000],
    ]);
    // Each word keeps the time `cueWords` spread over its own cue.
    expect(wordTimes(result, 0).slice(4, 8)).toEqual([
      ["THIS", 2_394],
      ["WOMAN", 2_697],
      ["BEFORE", 3_100],
      ["YOU", 3_516],
    ]);
    expectWellFormed(result);
  });

  it("puts no card boundary inside a cue", () => {
    const result = manual([
      cue(0, 3000, "It was late. But is this fair? After all,"),
      cue(3000, 5000, "we all agreed to it."),
      cue(5000, 6000, "Yes."),
    ]);
    expect(texts(result)).toEqual([
      "It was late. But is this fair? After all, we all agreed to it.",
      "Yes.",
    ]);
    expect(result.lines).toHaveLength(3);
  });

  it("starts a card at a speaker's dash and keeps each dash line on its own line", () => {
    const result = manual([
      cue(0, 1000, "Wait, where are you"),
      cue(1000, 2000, "- going?"),
      cue(2000, 4000, "- How much?\n- Two hundred pounds."),
      cue(4000, 5000, "- Where are you"),
      cue(5000, 6000, "going?"),
    ]);
    expect(texts(result)).toEqual([
      "Wait, where are you",
      "- going?",
      "- How much?\n- Two hundred pounds.",
      // One speaker's sentence goes on in the next cue.
      "- Where are you going?",
    ]);
    expect(lineTexts(result, 2)).toEqual([
      "- How much?\n- Two hundred pounds.",
    ]);
  });

  it("keeps sound labels on their own", () => {
    expect(
      texts(
        manual([
          cue(0, 1000, "[DOOR OPENS]"),
          cue(1000, 2000, "So."),
          cue(2000, 3000, "(LAUGHS)"),
        ]),
      ),
    ).toEqual(["[DOOR OPENS]", "So.", "(LAUGHS)"]);
  });

  it("starts a sentence at a ♪ that opens a line", () => {
    const sung = [
      cue(0, 2000, "-[man shouting on TV]"),
      cue(2000, 4000, "♪ Ooh, yeah ♪"),
      cue(4000, 6000, "He called Alice ♪"),
      cue(6000, 8000, "♪ When she was just small ♪"),
    ];
    expect(texts(manual(sung))).toEqual([
      "-[man shouting on TV]",
      "♪ Ooh, yeah ♪",
      "He called Alice ♪",
      "♪ When she was just small ♪",
    ]);
    // Also where cards may end inside a cue: the opening ♪ is no card of its own.
    expect(
      texts(
        asrSentenceCards(
          [cue(0, 4000, "He called Alice ♪\n♪ When she was small ♪")].map(
            (c) => ({ ...c, words: cueWords(c) }),
          ),
        ),
      ),
    ).toEqual(["He called Alice ♪", "♪ When she was small ♪"]);
  });

  it("splits a long sentence at a clause between cues, not at its largest pause", () => {
    const result = manual([
      cue(
        0,
        3000,
        "When we started this project five years ago in a small office",
      ),
      cue(3000, 6000, "with only three people and a borrowed computer,"),
      cue(6000, 8000, "we had no idea how far it would go or who would"),
      cue(10000, 12000, "come to rely on it every single day."),
      cue(12000, 13000, "Thank you."),
    ]);
    expect(texts(result)).toEqual([
      "When we started this project five years ago in a small office with only three people and a borrowed computer,",
      "we had no idea how far it would go or who would come to rely on it every single day.",
      "Thank you.",
    ]);
  });

  it("joins cues without spaces for languages written without them", () => {
    expect(
      texts(
        manual(
          [cue(0, 1000, "そうなんだ"), cue(1000, 2000, "知らなかった。")],
          "",
        ),
      ),
    ).toEqual(["そうなんだ知らなかった。"]);
  });

  it("makes sentence cards of Netflix's closed captions, every cue one line", () => {
    const captions = parseTtml(
      readFileSync(
        new URL("./fixtures/netflix/en.imsc.ttml", import.meta.url),
        "utf8",
      ),
    );
    const result = manual(captions);
    expect(texts(result)).toEqual([
      "GOOD EVENING, AND WELCOME BACK TO THE WORKSHOP.",
      "TONIGHT WE TALK ABOUT CREATIVITY IN THE CLASSROOM.",
      "EVERY CHILD HAS AN EXTRAORDINARY IMAGINATION.",
      "WE SHOULD NURTURE IT, NOT STIFLE IT.",
      "[AUDIENCE APPLAUDS]",
      "MISTAKES ARE PART OF LEARNING.",
      "IF YOU ARE NOT PREPARED TO BE WRONG, YOU WILL NEVER COME UP WITH ANYTHING ORIGINAL.",
      "THAT IS THE HEART OF THE MATTER.",
      "THANK YOU. BRAVO!",
    ]);
    expect(result.lines).toHaveLength(captions.length);
    result.lines.forEach((line, i) => {
      const card = result.cards[line.card]!;
      expect(card.text.slice(line.start, line.end)).toBe(
        captions[i]!.text.replaceAll("\n", " "),
      );
      expect(line.startMs).toBe(captions[i]!.startMs);
    });
  });

  it("makes whole sentences of a YouTube manual track", () => {
    const flat = texts(manual(fixture("en")));
    expect(flat).toContain(
      "There have been three family harvest rainbow the restaurant, which are chestnut to what I shoe to card about.",
    );
    expect(flat).toContain("(Laughter)");
    expect(
      Math.max(...flat.map((t) => t.split(" ").length)),
    ).toBeLessThanOrEqual(30);
  });

  it("leaves an auto-generated track's long sentences to its largest pause", () => {
    // Without linesByCue the cards are as before: split at the largest gap.
    const cues = [
      cue(
        0,
        3000,
        "When we started this project five years ago in a small office",
      ),
      cue(3000, 6000, "with only three people and a borrowed computer,"),
      cue(6000, 8000, "we had no idea how far it would go or who would"),
      cue(10000, 12000, "come to rely on it every single day."),
    ].map((c) => ({ ...c, words: cueWords(c) }));
    const [first] = texts(asrSentenceCards(cues, { lang: "en" }));
    expect(first).not.toMatch(/computer,$/);
    expect(first!.split(" ").length).toBeLessThanOrEqual(30);
  });
});
