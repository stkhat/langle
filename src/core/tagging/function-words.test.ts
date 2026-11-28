import { describe, expect, it } from "vitest";
import { functionWords } from "./function-words";

describe("functionWords", () => {
  it("lists the closed-class words a sentence seldom ends on", () => {
    const english = functionWords("en-GB");
    expect(["the", "to", "of", "and", "because", "my"].every(english!)).toBe(
      true,
    );
    // Words of those classes that also end clauses: pronouns, particles, adverbs.
    expect(
      ["this", "in", "on", "out", "her", "so", "that"].some(english!),
    ).toBe(false);
  });

  it("has no list for a language without one", () => {
    expect(functionWords("de")).toBeUndefined();
  });
});
