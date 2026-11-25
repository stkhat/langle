import { describe, expect, it } from "vitest";
import { isTimeSpan, samePlace } from "./place";

const rows = [
  { sentence: "we went home", timeMs: 1000 },
  { sentence: "and then we went home again", timeMs: 9000 },
  { sentence: "home sweet home", timeMs: 20_000 },
];
const of = (r: { sentence: string; timeMs?: number }) => r;

describe("samePlace", () => {
  it("finds the place with the same sentence first", () => {
    expect(
      samePlace(rows, of, {
        sentence: "home sweet home",
        cardSpan: { startMs: 500, endMs: 1500 },
      }),
    ).toBe(rows[2]);
  });

  it("finds a video place by time when the card was cut otherwise", () => {
    expect(
      samePlace(rows, of, {
        sentence: "so we went home",
        cardSpan: { startMs: 400, endMs: 3000 },
        timeMs: 1100,
      }),
    ).toBe(rows[0]);
  });

  it("is a new place when no time lies in the card's span", () => {
    expect(
      samePlace(rows, of, {
        sentence: "so we went home",
        cardSpan: { startMs: 3000, endMs: 8999 },
      }),
    ).toBeUndefined();
    // The span's end is not in it.
    expect(
      samePlace(rows, of, {
        sentence: "so we went home",
        cardSpan: { startMs: 0, endMs: 1000 },
      }),
    ).toBeUndefined();
  });

  it("matches by sentence only without a span (web pages)", () => {
    expect(
      samePlace(rows, of, { sentence: "so we went home", timeMs: 1000 }),
    ).toBeUndefined();
    expect(samePlace(rows, of, { sentence: "we went home" })).toBe(rows[0]);
  });

  it("takes the place nearest to the term when several are in the span", () => {
    const live = {
      sentence: "we went home and then we went home again",
      cardSpan: { startMs: 0, endMs: 12_000 },
    };
    expect(samePlace(rows, of, { ...live, timeMs: 8000 })).toBe(rows[1]);
    expect(samePlace(rows, of, { ...live, timeMs: 2000 })).toBe(rows[0]);
    // Without the term's time, the nearest to the span's start.
    expect(samePlace(rows, of, live)).toBe(rows[0]);
  });

  it("skips places without a time", () => {
    expect(
      samePlace([{ sentence: "a" }], of, {
        sentence: "b",
        cardSpan: { startMs: 0, endMs: 10 },
      }),
    ).toBeUndefined();
  });
});

describe("isTimeSpan", () => {
  it("accepts finite, ordered spans only", () => {
    expect(isTimeSpan({ startMs: 0, endMs: 10 })).toBe(true);
    expect(isTimeSpan({ startMs: 10, endMs: 0 })).toBe(false);
    expect(isTimeSpan({ startMs: 0, endMs: Infinity })).toBe(false);
    expect(isTimeSpan({ startMs: "0", endMs: 10 })).toBe(false);
    expect(isTimeSpan(null)).toBe(false);
  });
});
