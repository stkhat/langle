import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  alignAsrSentences,
  asrSentenceCards,
  type TranslatedCards,
} from "./asr";
import type { SentenceCards } from "./cues";
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
        "good morning",
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

  it("pairs each sentence of a punctuated track with its translation", () => {
    expect(pairs(align("asr-punctuated")).slice(0, 9)).toEqual([
      ["Hi everyone.", "やあみんな。"],
      [
        "Morning to a dog mineral of Barn's Belt Shelter.",
        "Barnのヘローイングリッシュの星しいヤピソードへよふせさ。",
      ],
      [
        "In maple's mineral, we are telescope Wonder, Thunderstormx.",
        "店庭のヤピソードでは、レサチューマッツ庭リストンを歌歌します。",
      ],
      ["Take a look.", "服てろてろだひい。"],
      ["We are crossing the bridge.", "鐘たらは灯を島っています。"],
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
      ["Hi.", "こんにちは。"],
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
      "we snow dog bridge every Cinnamon so flag bike to gathering",
      "旗鐘壁春米に星しい馬音を糸詩しているので、めつ道金してろだひい。",
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
