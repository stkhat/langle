import { describe, expect, it } from "vitest";
import {
  learnableFrom,
  learningFor,
  learningLanguages,
  nativeLanguages,
  speechLang,
  spokenLanguages,
  suggestedPair,
} from "./languages";

describe("learningLanguages", () => {
  it("lists English, then Spanish, French and German, in the packs' order", () => {
    expect(learningLanguages()).toEqual(["en", "es", "fr", "de"]);
  });
});

describe("nativeLanguages", () => {
  it("lists the languages each learning language has a dictionary into, from the lock", () => {
    expect(nativeLanguages("en")).toEqual([
      ...["ja", "es", "pt", "ru", "fr", "de"],
      ...["zh", "it", "pl", "th", "hi", "ar", "id", "tr", "ko"],
    ]);
    expect(nativeLanguages("es")).toEqual(["en"]);
    expect(nativeLanguages("fr")).toEqual(["en"]);
    expect(nativeLanguages("de")).toEqual(["en", "fr"]);
  });

  it("has none for a language without a pack", () => {
    expect(nativeLanguages("nl")).toEqual([]);
    expect(nativeLanguages("toString")).toEqual([]);
  });
});

describe("speechLang", () => {
  it("picks a regional voice for each learning language", () => {
    expect(speechLang("en")).toBe("en-US");
    expect(speechLang("es")).toBe("es-ES");
    expect(speechLang("fr")).toBe("fr-FR");
    expect(speechLang("de")).toBe("de-DE");
  });

  it("keeps other codes as they are", () => {
    expect(speechLang("nl")).toBe("nl");
    expect(speechLang("constructor")).toBe("constructor");
  });
});

describe("the languages screen's choices", () => {
  const offered = {
    en: ["ja", "fr"],
    es: ["en"],
    fr: ["en"],
    de: ["en", "fr"],
    it: ["nl"],
  };

  it("offers every native language of a pair once", () => {
    expect([...spokenLanguages(offered)].sort()).toEqual([
      "en",
      "fr",
      "ja",
      "nl",
    ]);
  });

  it("offers only what can be learned from that language, in the usual order", () => {
    expect(learnableFrom("en", offered)).toEqual(["es", "fr", "de"]);
    expect(learnableFrom("fr", offered)).toEqual(["en", "de"]);
    expect(learnableFrom("", offered)).toEqual([]);
  });

  it.each([
    ["ja", "en", "ja"],
    ["ja-JP", "en", "ja"],
    ["fr-CA", "en", "fr"],
    ["nl", "it", "nl"],
  ])("fills in a %s browser with %s → %s", (ui, learning, native) => {
    expect(suggestedPair(ui, undefined, offered)).toEqual({
      learningLang: learning,
      nativeLang: native,
    });
  });

  it("leaves the language to learn open for an English browser", () => {
    expect(suggestedPair("en-US", undefined, offered)).toEqual({
      learningLang: "",
      nativeLang: "en",
    });
  });

  it("guesses nothing for a language that is not offered", () => {
    expect(suggestedPair("sw", undefined, offered)).toEqual({
      learningLang: "",
      nativeLang: "",
    });
  });

  it("puts a stored pair before the browser's language", () => {
    const stored = { learningLang: "de", nativeLang: "fr" };
    expect(suggestedPair("ja", stored, offered)).toEqual(stored);
  });

  it("falls back to the browser's language for a pair no longer offered", () => {
    const stored = { learningLang: "ko", nativeLang: "ja" };
    expect(suggestedPair("fr", stored, offered)).toEqual({
      learningLang: "en",
      nativeLang: "fr",
    });
  });

  it("keeps the learning language when the new native language has it", () => {
    expect(learningFor("fr", "de", offered)).toBe("de");
    expect(learningFor("ja", "de", offered)).toBe("en");
    expect(learningFor("en", "en", offered)).toBe("");
    expect(learningFor("nl", "", offered)).toBe("it");
  });
});
