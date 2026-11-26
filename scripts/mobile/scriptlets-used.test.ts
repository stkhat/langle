import { describe, expect, test } from "vitest";
import {
  canonicalName,
  countScriptlets,
  filterLists,
  onYouTube,
  scriptletRules,
} from "./scriptlets-used.ts";

const LIST = [
  "! Title: a list",
  "! example.com##+js(aopr, commented)",
  "example.com##+js(aopr, adConfig)",
  "m.youtube.com,youtube.*##+js(json-prune, playerResponse.adPlacements)",
  "youtube.com##+js(set, a\\,b, undefined)",
  "youtube.com#@#+js(set, a, undefined)",
  "##+js(nowebrtc)",
  "example.com##.banner",
].join("\n");

describe("scriptletRules", () => {
  test("reads the +js rules, with canonical names, and leaves comments and cosmetic rules", () => {
    const rules = scriptletRules(LIST);
    expect(rules.map((rule) => rule.name)).toEqual([
      "abort-on-property-read",
      "json-prune",
      "set-constant",
      "set-constant",
      "nowebrtc",
    ]);
    expect(rules.map((rule) => rule.exception)).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(rules[1]?.domains).toEqual(["m.youtube.com", "youtube.*"]);
    expect(rules[4]?.domains).toEqual([]);
  });

  test("knows uBO's aliases, and keeps other names as they are", () => {
    expect(canonicalName("nostif")).toBe("prevent-setTimeout");
    expect(canonicalName("rmnt")).toBe("remove-node-text");
    expect(canonicalName("json-prune.js")).toBe("json-prune");
    expect(canonicalName("something-new")).toBe("something-new");
  });
});

describe("countScriptlets", () => {
  test("counts blocking rules by scriptlet, YouTube's first", () => {
    const rules = scriptletRules(LIST);
    expect(onYouTube(rules[1]!)).toBe(true);
    expect(onYouTube(rules[0]!)).toBe(false);
    const counts = countScriptlets([
      { id: "a", rules },
      { id: "b", rules: scriptletRules("x.com##+js(aopr, y)") },
    ]);
    expect(
      counts.map(({ name, rules, youtube }) => [name, rules, youtube]),
    ).toEqual([
      ["json-prune", 1, 1],
      ["set-constant", 1, 1],
      ["abort-on-property-read", 2, 0],
      ["nowebrtc", 1, 0],
    ]);
    expect(counts[2]?.byList).toEqual({ a: 1, b: 1 });
  });
});

describe("the filter lists", () => {
  test("each has a URL, fallbacks and a licence; the uBO lists are trusted", () => {
    const lists = filterLists();
    expect(lists.map((list) => list.id)).toEqual([
      "easylist",
      "easyprivacy",
      "ublock-filters",
      "ublock-quick-fixes",
      "ublock-unbreak",
    ]);
    for (const list of lists) {
      expect(list.url).toMatch(/^https:\/\//);
      expect(list.fallbacks.length).toBeGreaterThan(0);
      expect(list.licence).not.toBe("");
      expect(list.trusted ?? false).toBe(list.id.startsWith("ublock-"));
    }
  });
});
