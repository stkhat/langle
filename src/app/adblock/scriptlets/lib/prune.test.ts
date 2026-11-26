import { describe, expect, it } from "vitest";
import { jsonPruner } from "./prune";

describe("jsonPruner", () => {
  it("removes the space-separated paths, nested ones too", () => {
    const value = { ads: [1], keep: 1, a: { b: { c: 1, d: 2 } } };
    expect(jsonPruner("ads a.b.c missing.path")(value)).toBe(true);
    expect(value).toEqual({ keep: 1, a: { b: { d: 2 } } });
  });

  it("answers false when nothing was there", () => {
    expect(jsonPruner("ads")({ keep: 1 })).toBe(false);
    expect(jsonPruner("ads")("text")).toBe(false);
  });

  it("prunes only when every needle path is there", () => {
    const value = { ads: 1, flag: { on: true } };
    expect(jsonPruner("ads", "flag.on other")(value)).toBe(false);
    expect(value).toHaveProperty("ads");
    expect(jsonPruner("ads", "flag.on")(value)).toBe(true);
    expect(value).toEqual({ flag: { on: true } });
  });

  it("takes a regex needle as uBO's logger's, no condition", () => {
    const value = { ads: 1 };
    expect(jsonPruner("ads", "/never/")(value)).toBe(true);
  });

  it("goes through every item with [] and every property with *", () => {
    const value = {
      playlist: [
        { adserver: 1, id: "a" },
        { adserver: 2, id: "b" },
      ],
      random: { r1: { adserver: 1 }, r2: { adserver: 2, id: "c" } },
    };
    jsonPruner("playlist.[].adserver random.*.adserver")(value);
    expect(value).toEqual({
      playlist: [{ id: "a" }, { id: "b" }],
      random: { r1: {}, r2: { id: "c" } },
    });
  });

  it("removes the items and properties holding the rest of the path with [-] and {-}", () => {
    const value = {
      entries: [
        { command: { ad: { isAd: true } } },
        { command: { video: "a" } },
        { command: { ad: { isAd: true } } },
      ],
      slots: { s1: { isAd: true }, s2: { video: "b" } },
    };
    jsonPruner("entries.[-].command.ad.isAd slots.{-}.isAd")(value);
    expect(value).toEqual({
      entries: [{ command: { video: "a" } }],
      slots: { s2: { video: "b" } },
    });
  });
});
