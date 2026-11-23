import { describe, expect, it } from "vitest";
import { cardEnding, stepActionOf, stepTarget } from "./steps";

const keys = { on: true, previous: "a", replay: "s", next: "d" };
const press = (key: string, more: Partial<KeyboardEvent> = {}) => ({
  key,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  ...more,
});

describe("stepActionOf", () => {
  it("maps the step keys to their actions, either case", () => {
    expect(stepActionOf(press("a"), keys)).toBe("previous");
    expect(stepActionOf(press("S"), keys)).toBe("replay");
    expect(stepActionOf(press("d"), keys)).toBe("next");
    expect(stepActionOf(press("k"), keys)).toBeUndefined();
  });

  it("follows keys the user chose", () => {
    const chosen = { on: true, previous: ",", replay: "r", next: "." };
    expect(stepActionOf(press(","), chosen)).toBe("previous");
    expect(stepActionOf(press("."), chosen)).toBe("next");
    expect(stepActionOf(press("a"), chosen)).toBeUndefined();
  });

  it("leaves the keys to the site while they are off, with a modifier, or while composing", () => {
    expect(stepActionOf(press("a"), { ...keys, on: false })).toBeUndefined();
    for (const more of [
      { shiftKey: true },
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true },
    ])
      expect(stepActionOf(press("a", more), keys)).toBeUndefined();
  });
});

describe("stepTarget", () => {
  it("goes to the card before, the same card or the card after", () => {
    expect(stepTarget(5, 2, "previous")).toBe(1);
    expect(stepTarget(5, 2, "replay")).toBe(2);
    expect(stepTarget(5, 2, "next")).toBe(3);
  });

  it("goes to the first card from before it, and nowhere past the ends", () => {
    expect(stepTarget(5, -1, "next")).toBe(0);
    expect(stepTarget(5, -1, "replay")).toBeUndefined();
    expect(stepTarget(5, -1, "previous")).toBeUndefined();
    expect(stepTarget(5, 0, "previous")).toBeUndefined();
    expect(stepTarget(5, 4, "next")).toBeUndefined();
    expect(stepTarget(0, -1, "next")).toBeUndefined();
  });
});

describe("cardEnding", () => {
  const cards = [
    { startMs: 0, endMs: 2000 },
    { startMs: 2500, endMs: 5000 },
    // Rolling fragments: the card goes on past the next one's start.
    { startMs: 5000, endMs: 8000 },
    { startMs: 7000, endMs: 9000 },
  ];

  it("pauses a frame before the card's end, while its line still shows", () => {
    expect(cardEnding(cards, 0, 1870, 1890)).toBeUndefined();
    expect(cardEnding(cards, 0, 1885, 1905)).toBe(0);
  });

  it("pauses when a step already went past the end", () => {
    expect(cardEnding(cards, 0, 1900, 2100)).toBe(0);
    expect(cardEnding(cards, 0, 2000, 2100)).toBeUndefined();
  });

  it("ends a card where the next one starts when that comes first", () => {
    expect(cardEnding(cards, 2, 6980, 6995)).toBe(2);
  });

  it("looks at most a quarter second ahead, even after a long step", () => {
    expect(cardEnding(cards, 1, 4000, 4700)).toBeUndefined();
    expect(cardEnding(cards, 1, 4000, 4750)).toBe(1);
  });

  it("does not pause on a seek, a pause or before the first card", () => {
    expect(cardEnding(cards, 0, 500, 1990)).toBeUndefined();
    expect(cardEnding(cards, 0, 1000, 1500)).toBeUndefined();
    expect(cardEnding(cards, 0, 1990, 1990)).toBeUndefined();
    expect(cardEnding(cards, 0, 1990, 1500)).toBeUndefined();
    expect(cardEnding(cards, -1, 0, 20)).toBeUndefined();
  });
});
