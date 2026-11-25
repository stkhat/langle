import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cueAt,
  cueIndexAt,
  landingSeek,
  lastStartedIndex,
  lineIndexAt,
  type SubtitleLine,
  timeAt,
} from "./cues";
import type { Cue } from "./types";
import { parseYouTubeJson3 } from "./youtube-json3";

const asr = parseYouTubeJson3(
  readFileSync(
    new URL("./fixtures/youtube/en-asr.json3", import.meta.url),
    "utf8",
  ),
);

const cue = (startMs: number, endMs: number, text: string): Cue => ({
  startMs,
  endMs,
  text,
});

describe("cueIndexAt / cueAt", () => {
  const cues = [
    cue(1000, 2000, "a"),
    cue(2000, 3000, "b"),
    cue(4000, 5000, "c"),
  ];

  it("finds the cue playing at a time", () => {
    expect(cueIndexAt(cues, 1000)).toBe(0);
    expect(cueIndexAt(cues, 1999)).toBe(0);
    expect(cueIndexAt(cues, 2000)).toBe(1);
    expect(cueIndexAt(cues, 4500)).toBe(2);
    expect(cueAt(cues, 4500)?.text).toBe("c");
  });

  it("returns -1 / undefined before the first cue, in gaps and after the last", () => {
    expect(cueIndexAt(cues, 999)).toBe(-1);
    expect(cueIndexAt(cues, 3500)).toBe(-1);
    expect(cueIndexAt(cues, 5000)).toBe(-1);
    expect(cueAt(cues, 3500)).toBeUndefined();
    expect(cueIndexAt([], 0)).toBe(-1);
  });

  it("prefers the cue that started last when cues overlap", () => {
    const overlapping = [cue(0, 5000, "long"), cue(1000, 2000, "short")];
    expect(cueAt(overlapping, 1500)?.text).toBe("short");
  });

  it("finds cues in a real track", () => {
    expect(cueAt(asr, 29000)?.text).toBe(
      "how are you it's been ember hasn't it",
    );
  });
});

describe("lastStartedIndex", () => {
  const cues = [
    cue(1000, 2000, "a"),
    cue(2000, 3000, "b"),
    cue(4000, 5000, "c"),
  ];

  it("is the last cue that started by a time, also in gaps and after the end", () => {
    expect(lastStartedIndex(cues, 999)).toBe(-1);
    expect(lastStartedIndex(cues, 1000)).toBe(0);
    expect(lastStartedIndex(cues, 2500)).toBe(1);
    expect(lastStartedIndex(cues, 3500)).toBe(1);
    expect(lastStartedIndex(cues, 9000)).toBe(2);
    expect(lastStartedIndex([], 0)).toBe(-1);
  });
});

describe("timeAt", () => {
  // Card 0 said as two lines with the site's word times; card 1 has a line without words.
  const text = "It is an open question whether he will succeed";
  const at = (word: string) => text.indexOf(word);
  const cards = [cue(1000, 6000, text), cue(6000, 8000, "Argentina.")];
  const lines: SubtitleLine[] = [
    {
      startMs: 1000,
      endMs: 3500,
      card: 0,
      start: 0,
      end: at("whether") - 1,
      words: [
        { start: at("It"), startMs: 1000 },
        { start: at("is"), startMs: 1300 },
        { start: at("an"), startMs: 1500 },
        { start: at("open"), startMs: 1800 },
        { start: at("question"), startMs: 2400 },
      ],
    },
    {
      startMs: 3500,
      endMs: 6000,
      card: 0,
      start: at("whether"),
      end: text.length,
      words: [
        { start: at("whether"), startMs: 3500 },
        { start: at("he"), startMs: 4100 },
        { start: at("will"), startMs: 4400 },
        { start: at("succeed"), startMs: 4900 },
      ],
    },
    { startMs: 6000, endMs: 8000, card: 1, start: 0, end: 10 },
  ];

  it("gives the site's time of the word at the offset", () => {
    expect(timeAt(cards, lines, 0, at("open"))).toBe(1800);
    expect(timeAt(cards, lines, 0, at("succeed"))).toBe(4900);
    // Inside a word: that word's time.
    expect(timeAt(cards, lines, 0, at("estion"))).toBe(2400);
  });

  it("falls back to the line's start, then the card's", () => {
    expect(timeAt(cards, lines, 1, 3)).toBe(6000);
    expect(timeAt(cards, [], 0, at("succeed"))).toBe(1000);
  });

  it("finds the line that holds the offset", () => {
    expect(lineIndexAt(lines, 0, 0)).toBe(0);
    expect(lineIndexAt(lines, 0, at("he"))).toBe(1);
    expect(lineIndexAt(lines, 1, 0)).toBe(2);
    expect(lineIndexAt(lines, 2, 0)).toBe(-1);
  });
});

describe("landingSeek", () => {
  const cards = [cue(10_000, 15_000, "First."), cue(15_000, 21_000, "Second.")];

  it("goes back to the start of the card that holds the time while the player is in it", () => {
    // The link's `t` is the whole second before the word.
    expect(landingSeek(cards, 18_400, 18_000)).toBe(15_000);
    // It played on a little while the cards were read.
    expect(landingSeek(cards, 18_400, 20_500)).toBe(15_000);
  });

  it("does not seek once the viewer moved, or where no seek is needed", () => {
    expect(landingSeek(cards, 18_400, 12_000)).toBeUndefined();
    expect(landingSeek(cards, 18_400, 40_000)).toBeUndefined();
    expect(landingSeek(cards, 18_400, 15_000)).toBeUndefined();
    // No card holds the time (after the last one).
    expect(landingSeek(cards, 30_000, 30_000)).toBeUndefined();
  });

  it("lands an old record, a card start of another cut, at a card start too", () => {
    expect(landingSeek(cards, 17_000, 17_000)).toBe(15_000);
  });
});
