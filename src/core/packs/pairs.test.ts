import { describe, expect, it } from "vitest";
import { learningLanguages, nativeLanguages } from "../languages";
import { readLock } from "./lock";
import {
  fallbacksOf,
  modelPacksFor,
  packsFor,
  pairsOfPack,
  type ModelPackName,
} from "./pairs";

describe("fallbacksOf", () => {
  it("is a dictionary's definitions written in another language than its native one", () => {
    expect(fallbacksOf("en-ja")).toEqual(["en-defs"]);
    expect(fallbacksOf("en-de")).toEqual(["en-defs"]);
    // English Wiktionary's definitions of Spanish are the dictionary itself.
    expect(fallbacksOf("es-en")).toEqual([]);
    expect(fallbacksOf("fr-ja")).toEqual([]);
    expect(fallbacksOf("constructor")).toEqual([]);
  });

  it("leaves every offered pair a dictionary pack that is not a fallback", () => {
    for (const learning of learningLanguages())
      for (const native of nativeLanguages(learning)) {
        const fallbacks: string[] = fallbacksOf(`${learning}-${native}`);
        const first = packsFor(learning, native).filter(
          (pack) => !fallbacks.includes(pack),
        );
        expect(first).toContain(learning);
        expect(first.length).toBeGreaterThan(1);
      }
  });
});

describe("packsFor", () => {
  it("lists the language's pack, then the dictionary's other packs, its fallbacks last", () => {
    expect(packsFor("en", "ja")).toEqual(["en", "en-ja", "en-defs"]);
    expect(packsFor("en", "pl")).toEqual(["en", "en-pl", "en-defs"]);
    expect(packsFor("es", "en")).toEqual(["es", "es-en"]);
  });

  it("puts every offered pair's fallbacks after its other packs", () => {
    for (const learning of learningLanguages())
      for (const native of nativeLanguages(learning)) {
        const packs = packsFor(learning, native);
        const fallbacks: string[] = fallbacksOf(`${learning}-${native}`);
        expect(packs[0]).toBe(learning);
        expect(packs.slice(packs.length - fallbacks.length)).toEqual(fallbacks);
      }
  });

  it("lists what has a recipe of a pair Langle does not offer", () => {
    expect(packsFor("en", "nl")).toEqual(["en"]);
    expect(packsFor("nl", "ja")).toEqual([]);
    expect(packsFor("constructor", "toString")).toEqual([]);
  });

  it("names packs of the lock for every pair the settings offer", () => {
    const { packs } = readLock();
    for (const learning of learningLanguages())
      for (const native of nativeLanguages(learning)) {
        const needed = packsFor(learning, native);
        expect(needed.length).toBeGreaterThan(1);
        for (const pack of needed) expect(Object.keys(packs)).toContain(pack);
      }
  });
});

describe("pairsOfPack", () => {
  it("names the offered pair a pack's data belongs to", () => {
    expect(pairsOfPack("es")[0]).toEqual({ learning: "es", native: "en" });
    expect(pairsOfPack("es-en")[0]).toEqual({ learning: "es", native: "en" });
    expect(pairsOfPack("en-defs")[0]).toEqual({ learning: "en", native: "ja" });
  });

  it("names a pair for every pack of the lock", () => {
    for (const pack of Object.keys(readLock().packs))
      expect(pairsOfPack(pack)[0]).toBeDefined();
  });

  it("names none for a pack no offered pair uses", () => {
    expect(pairsOfPack("nl")[0]).toBeUndefined();
    expect(pairsOfPack("constructor")[0]).toBeUndefined();
  });
});

describe("modelPacksFor", () => {
  const having =
    (...packs: string[]) =>
    (pack: ModelPackName) =>
      packs.includes(pack);

  it("is the direct model, else two through English", () => {
    const all = having("mt-en-ja", "mt-de-en", "mt-en-fr", "mt-de-fr");
    expect(modelPacksFor("en", "ja", all)).toEqual(["mt-en-ja"]);
    expect(modelPacksFor("de", "fr", all)).toEqual(["mt-de-fr"]);
    expect(modelPacksFor("de", "fr", having("mt-de-en", "mt-en-fr"))).toEqual([
      "mt-de-en",
      "mt-en-fr",
    ]);
  });

  it("is none for one language, or when a model on the way is missing", () => {
    const some = having("mt-en-ja", "mt-de-en");
    expect(modelPacksFor("en", "en", some)).toEqual([]);
    expect(modelPacksFor("ja", "en", some)).toEqual([]);
    expect(modelPacksFor("de", "fr", some)).toEqual([]);
    expect(modelPacksFor("fr", "en", some)).toEqual([]);
  });
});
