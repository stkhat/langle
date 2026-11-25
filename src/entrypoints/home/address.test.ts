import { describe, expect, test } from "vitest";
import { pageForSearch } from "./address";

const SEARCH = "https://m.youtube.com/results?search_query=";

describe("pageForSearch", () => {
  test("opens an http(s) address as typed", () => {
    expect(pageForSearch("https://example.com/a?b=1")).toBe(
      "https://example.com/a?b=1",
    );
    expect(pageForSearch("  http://example.com  ")).toBe("http://example.com/");
    expect(pageForSearch("HTTPS://Example.com/Path")).toBe(
      "https://example.com/Path",
    );
  });

  test("adds https:// to text with a dot and no space", () => {
    expect(pageForSearch("example.com")).toBe("https://example.com/");
    expect(pageForSearch("news.example.co.uk/story/1")).toBe(
      "https://news.example.co.uk/story/1",
    );
    expect(pageForSearch("m.youtube.com/watch?v=abc")).toBe(
      "https://m.youtube.com/watch?v=abc",
    );
  });

  test("searches YouTube for anything else", () => {
    expect(pageForSearch("sourdough bread")).toBe(`${SEARCH}sourdough%20bread`);
    expect(pageForSearch("bread")).toBe(`${SEARCH}bread`);
    // A dot with a space is a sentence, not an address.
    expect(pageForSearch("how to bake. fast")).toBe(
      `${SEARCH}how%20to%20bake.%20fast`,
    );
    // Other schemes are never opened.
    expect(pageForSearch("javascript:alert(1)")).toBe(
      `${SEARCH}javascript%3Aalert(1)`,
    );
    expect(pageForSearch("C++ & Rust?")).toBe(
      `${SEARCH}C%2B%2B%20%26%20Rust%3F`,
    );
  });

  test("gives nothing for blank text", () => {
    expect(pageForSearch("")).toBeUndefined();
    expect(pageForSearch("   ")).toBeUndefined();
  });
});
