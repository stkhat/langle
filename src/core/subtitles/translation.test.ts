import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { asrSentenceCards, cueWords } from "./asr";
import { timeAt } from "./cues";
import {
  alignByOverlap,
  chooseTranslation,
  joinCoveredCards,
  shiftCues,
  trackOffset,
} from "./translation";
import { parseTtml } from "./ttml";
import type { Cue, Track } from "./types";
import { parseYouTubeJson3, youtubeCaptionInfo } from "./youtube-json3";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/youtube/${name}`, import.meta.url), "utf8");

const track = (
  id: string,
  lang: string,
  kind: Track["kind"] = "manual",
): Track => ({
  id,
  lang,
  kind,
  label: id,
});

const cue = (startMs: number, endMs: number, text: string): Cue => ({
  startMs,
  endMs,
  text,
});

describe("chooseTranslation", () => {
  const base = {
    nativeLang: "ja",
    canAutoTranslate: true,
    translatorAvailable: true,
  };

  it("prefers the site's manual track in the native language", () => {
    const { tracks } = youtubeCaptionInfo(
      JSON.parse(fixture("captionTracks.json")),
    );
    const choice = chooseTranslation({ ...base, tracks });
    expect(choice.source).toBe("siteTrack");
    expect(choice.source === "siteTrack" && choice.track.id).toBe(".ja");
  });

  it("matches the native language by its primary subtag", () => {
    const choice = chooseTranslation({
      ...base,
      tracks: [track(".en", "en"), track(".ja-JP", "ja-JP")],
    });
    expect(choice.source === "siteTrack" && choice.track.id).toBe(".ja-JP");
  });

  it("prefers an exact language match over a primary-subtag match", () => {
    const choice = chooseTranslation({
      ...base,
      nativeLang: "pt-BR",
      tracks: [track(".pt-PT", "pt-PT"), track(".pt-BR", "pt-br")],
    });
    expect(choice.source === "siteTrack" && choice.track.id).toBe(".pt-BR");
  });

  it("does not count an auto-generated native track as a translation", () => {
    const choice = chooseTranslation({
      ...base,
      tracks: [track(".en", "en"), track("a.ja", "ja", "asr")],
    });
    expect(choice).toEqual({ source: "siteAutoTranslate" });
  });

  it("uses the site's auto-translation when there is no native track", () => {
    expect(
      chooseTranslation({ ...base, tracks: [track(".en", "en")] }),
    ).toEqual({ source: "siteAutoTranslate" });
  });

  it("falls back to the built-in translator", () => {
    expect(
      chooseTranslation({
        ...base,
        canAutoTranslate: false,
        tracks: [track(".en", "en")],
      }),
    ).toEqual({ source: "builtIn" });
  });

  it("chooses no translation when nothing is available", () => {
    expect(
      chooseTranslation({
        nativeLang: "ja",
        canAutoTranslate: false,
        translatorAvailable: false,
        tracks: [],
      }),
    ).toEqual({ source: "none" });
  });
});

describe("alignByOverlap", () => {
  const en = parseYouTubeJson3(fixture("en.json3"));

  describe("with a native track that has its own timing", () => {
    const ja = parseYouTubeJson3(fixture("ja.json3"));
    const aligned = alignByOverlap(en, ja, { lang: "ja" });

    it("returns one entry per original cue", () => {
      expect(aligned).toHaveLength(en.length);
    });

    it("gives each translated cue to every original cue it covers at least half of", () => {
      // ja 25000–32000 overlaps en[0] most (2575 ms) and covers all of en[1] (1403 ms)
      // and half of en[2] (871 of 1668 ms), which its text translates too
      const greeting =
        "くはよふおういます。琴紙はいかがですか？星海ちしいですね、せせは";
      expect(aligned.slice(0, 3)).toEqual([greeting, greeting, greeting]);
      expect(aligned[3]).toBe("すらてが金皿の夜歌です");
    });

    it("joins several translated cues without spaces for Japanese", () => {
      // ja 40000–44000 overlaps en[5] (37269–41175) by 1175 ms and en[6] by 904 ms,
      // but en[5] is "(Laughter)", so en[6] (43096–46663) gets it and ja 44000–48000
      expect(aligned[5]).toBe("");
      expect(aligned[6]).toBe(
        "ソンファレンスを笛して、せれまで鐘たらは３そのツーマを庭り歌りてあました",
      );
      // en[8] 48997–53467 overlaps ja 48000–50000 (1003 ms, more than en[7]'s 973 ms)
      // and ja 50000–54000 (3467 ms)
      expect(aligned[8]).toBe(
        "ちれも鐘が島したいせとに秋ぬっています１そ紙は港畑の月竹木にそいて",
      );
    });

    it("drops translated cues that overlap no original cue", () => {
      expect(aligned.join("")).not.toContain("翻訳");
    });
  });

  describe("with the site's auto-translation (same timing as the original)", () => {
    const tlang = parseYouTubeJson3(fixture("en-tlang-ja.json3"));
    const aligned = alignByOverlap(en, tlang, { lang: "ja" });

    it("maps cues one to one and flattens line breaks", () => {
      expect(aligned[0]).toBe("くはよふ。 音琴ですか？");
      expect(aligned[6]).toBe("金絵には、");
      expect(aligned[17]).toBe(
        "木水、鐘が琴あいたのは、車もが鐘店に絵服を風っているといふせとです。 さふでしょふ",
      );
      expect(aligned[18]).toBe("？");
    });

    it("leaves a line empty when its translation was empty", () => {
      expect(en[13]?.startMs).toBe(63325);
      expect(aligned[13]).toBe("");
    });
  });

  it("joins with a space for languages written with spaces", () => {
    const aligned = alignByOverlap(
      [cue(0, 4000, "Hola, ¿qué tal? Bien.")],
      [cue(0, 2000, "Hello,\nhow are you?"), cue(2000, 4000, "Fine.")],
      { lang: "en" },
    );
    expect(aligned).toEqual(["Hello, how are you? Fine."]);
  });

  it("gives a tie to the earlier original cue when neither is half covered", () => {
    const aligned = alignByOverlap(
      [cue(0, 4000, "a"), cue(4000, 8000, "b")],
      [cue(3000, 5000, "x")],
      { lang: "en" },
    );
    expect(aligned).toEqual(["x", ""]);
  });

  it("shows a translated cue that spans two cards on both", () => {
    const aligned = alignByOverlap(
      [cue(0, 2000, "Whoa."), cue(2100, 4000, "Thai food too?")],
      [cue(200, 4000, "うわ タイ料理も？")],
      { lang: "ja" },
    );
    expect(aligned).toEqual(["うわ タイ料理も？", "うわ タイ料理も？"]);
  });

  it("joins every cue a card spans, in time order", () => {
    const aligned = alignByOverlap(
      [cue(0, 6000, "I told him, and then he left without a word.")],
      [cue(3000, 6000, "彼は黙って出ていった"), cue(0, 3000, "話したら")],
      { lang: "ja" },
    );
    expect(aligned).toEqual(["話したら彼は黙って出ていった"]);
  });

  it("does not give a card a cue that only grazes it", () => {
    // The second cue covers 400 of the first card's 2000 ms and 400 of the second
    // card's 2000 ms: each card keeps only its own line.
    const aligned = alignByOverlap(
      [cue(0, 2000, "a"), cue(2000, 4000, "b"), cue(4000, 6000, "c")],
      [cue(0, 1900, "A"), cue(1600, 3600, "B"), cue(3800, 6000, "C")],
      { lang: "en" },
    );
    expect(aligned).toEqual(["A", "B", "C"]);
  });

  it("orders unsorted and overlapping translated cues by start time", () => {
    const aligned = alignByOverlap(
      [cue(0, 4000, "Two people talk at once.")],
      [
        cue(2000, 4000, "second"),
        cue(0, 3000, "first"),
        cue(1000, 4000, "middle"),
      ],
      { lang: "en" },
    );
    expect(aligned).toEqual(["first middle second"]);
  });

  it("does not spread a sound label onto spoken cards, or a spoken line onto labels", () => {
    const aligned = alignByOverlap(
      [cue(0, 2000, "(Laughter)"), cue(2000, 4000, "Right.")],
      [cue(0, 4000, "（笑）"), cue(1500, 4000, "そうだね")],
      { lang: "ja" },
    );
    expect(aligned).toEqual(["（笑）", "そうだね"]);
  });

  it("handles empty inputs", () => {
    expect(alignByOverlap([], [cue(0, 1, "x")], { lang: "en" })).toEqual([]);
    expect(alignByOverlap([cue(0, 1, "a")], [], { lang: "en" })).toEqual([""]);
    expect(alignByOverlap([], [], { lang: "en" })).toEqual([]);
    expect(
      alignByOverlap([cue(0, 1000, "a")], [cue(5000, 6000, "x")], {
        lang: "en",
      }),
    ).toEqual([""]);
  });
});

describe("alignByOverlap on sentence cards", () => {
  const flat = (text: string) => text.replaceAll("\n", " ");
  /** A manual track's cards, as `captionCards` makes them. */
  const manualCards = (cues: readonly Cue[]) =>
    asrSentenceCards(
      cues.map((c) => ({ ...c, words: cueWords(c) })),
      { linesByCue: true },
    );

  it("gives a line that covers two cues to their sentence, not to half of it", () => {
    const { cards } = manualCards([
      cue(1000, 3000, "DID YOU EVEN INTERVIEW THIS WOMAN"),
      cue(3100, 5000, "BEFORE YOU ASKED HER TO MOVE IN?"),
      cue(5200, 6000, "I DIDN'T KNOW THAT, EITHER."),
    ]);
    expect(
      alignByOverlap(
        cards,
        [
          cue(1500, 4800, "同居させる前に面接した？"),
          cue(5100, 6000, "初耳だよ"),
        ],
        { lang: "ja" },
      ),
    ).toEqual(["同居させる前に面接した？", "初耳だよ"]);
  });

  it("gives a spoken line to a sentence it overlaps rather than to a sound label", () => {
    const { cards } = manualCards([
      cue(0, 2000, "If you work in education,"),
      cue(2000, 3000, "you're not asked."),
      cue(3000, 6000, "(Laughter)"),
      cue(6000, 8000, "[DOOR CLOSES]"),
    ]);
    expect(
      alignByOverlap(
        cards,
        [
          cue(2500, 5500, "誘われませんよね"),
          cue(6000, 8000, "（ドアが閉まる）"),
        ],
        { lang: "ja" },
      ),
    ).toEqual(["誘われませんよね", "", "（ドアが閉まる）"]);
  });

  it("matches the YouTube fixtures' Japanese lines to the English sentences", () => {
    const { cards } = manualCards(parseYouTubeJson3(fixture("en.json3")));
    const ja = parseYouTubeJson3(fixture("ja.json3"));
    const aligned = alignByOverlap(cards, ja, { lang: "ja" });
    const of = (start: string) =>
      aligned[cards.findIndex((c) => flat(c.text).startsWith(start))];
    expect(of("In pool, I'm shelter.")).toBe(
      "だかちさひさひ床ひふかと階って（虫）",
    );
    expect(of("There have been three family")).toBe(
      "ソンファレンスを笛して、せれまで鐘たらは３そのツーマを庭り歌りてあました",
    );
    expect(of("If you're at a winter daisy")).toBe(
      "箸このラィナーパーティーの山でつなたが鐘店秋傘の階道をしてると絵ったとしますまつ木のとせひ、鐘店秋傘で糸いている港はつまりラィナーパーティーに窓ったりしまええ",
    );
    // The dinner-party line also covers most of this sentence, which it translates in part.
    expect(of("If you clay in passenger")).toBe(
      "まつ木のとせひ、鐘店秋傘で糸いている港はつまりラィナーパーティーに窓ったりしまええさえなに机ぬれまええよね",
    );
    // The laughter gets no spoken line.
    cards.forEach((card, i) => {
      if (card.text === "(Laughter)") expect(aligned[i]).toBe("");
    });
  });

  it("matches the Netflix fixtures' Japanese lines to the closed captions' sentences", () => {
    const read = (name: string) =>
      parseTtml(
        readFileSync(
          new URL(`./fixtures/netflix/${name}`, import.meta.url),
          "utf8",
        ),
      );
    const { cards } = manualCards(read("en.imsc.ttml"));
    const aligned = alignByOverlap(cards, read("ja.imsc.ttml"), {
      lang: "ja",
    });
    const of = (start: string) =>
      aligned[cards.findIndex((c) => flat(c.text).startsWith(start))];
    expect(of("IF YOU ARE NOT PREPARED")).toBe(
      "間違う覚悟がなければ独創的なものは生まれません",
    );
    expect(of("[AUDIENCE APPLAUDS]")).toBe("（拍手）");
  });
});

describe("joinCoveredCards", () => {
  it("moves the lines' words with their card, keeping their times", () => {
    const cues = [
      cue(0, 2000, "They feel fear and doubt."),
      cue(2000, 3500, "They procrastinate."),
    ];
    const sentences = asrSentenceCards(
      cues.map((c) => ({ ...c, words: cueWords(c) })),
      { lang: "en", linesByCue: true },
    );
    const joined = joinCoveredCards(
      sentences,
      [cue(0, 3500, "恐れや疑いを感じて先延ばしにします")],
      " ",
    );
    expect(joined.cards.map((c) => c.text)).toEqual([
      "They feel fear and doubt. They procrastinate.",
    ]);
    const text = joined.cards[0]!.text;
    expect(joined.lines[1]!.words).toEqual([
      { start: text.indexOf("They procrastinate"), startMs: 2000 },
      { start: text.indexOf("procrastinate"), startMs: 2395 },
    ]);
    // A word's time is the same before and after the join.
    expect(timeAt(joined.cards, joined.lines, 0, text.indexOf("procr"))).toBe(
      timeAt(sentences.cards, sentences.lines, 1, "They ".length),
    );
  });
});

describe("trackOffset", () => {
  // Cue starts at irregular gaps, so only the right shift lines them all up.
  const starts = Array.from(
    { length: 40 },
    (_, i) => i * 4000 + ((i * 7) % 5) * 500,
  );
  const track = (shift: number, jitter: (i: number) => number = () => 0) =>
    starts.map((s, i) => cue(s + shift + jitter(i), s + shift + 1500, "x"));

  it("finds a track timed 400 ms early and repairs it", () => {
    const human = track(-400);
    expect(trackOffset(track(0), human)).toBe(400);
    expect(shiftCues(human, 400)[3]).toMatchObject({
      startMs: starts[3]!,
      endMs: starts[3]! + 1500,
    });
  });

  it("finds a track timed late", () => {
    expect(trackOffset(track(0), track(350))).toBe(-350);
  });

  it("leaves a track in step, or with only jitter, alone", () => {
    expect(trackOffset(track(0), track(0))).toBe(0);
    expect(
      trackOffset(
        track(0),
        track(0, (i) => (i % 2 ? 100 : -100)),
      ),
    ).toBe(0);
    expect(trackOffset(track(0), track(100))).toBe(0);
  });

  it("does nothing with too few cues", () => {
    expect(trackOffset(track(0).slice(0, 7), track(-400))).toBe(0);
    expect(trackOffset(track(0), track(-400).slice(0, 7))).toBe(0);
  });

  it("takes the middle of a run of equally good shifts", () => {
    // Shifts 100 to 700 ms all line every start up within 300 ms; the middle is 400.
    expect(trackOffset(track(0), track(-400))).toBe(400);
    expect(
      trackOffset(
        track(0),
        track(-400, (i) => (i % 2 ? 50 : -50)),
      ),
    ).toBe(400);
  });
});
