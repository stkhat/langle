import { afterEach, describe, expect, it, vi } from "vitest";
import en from "./locales/en.json";
import {
  formatTag,
  interpolate,
  onUiLocaleChange,
  setUiLocale,
  t,
  uiLocale,
} from "./t";

afterEach(() => setUiLocale("en"));

describe("t", () => {
  it("returns the en.json value for a key", () => {
    expect(t("app.name")).toBe(en["app.name"]);
    expect(t("app.name")).toBe("Langle");
  });

  it("accepts vars for keys without placeholders", () => {
    expect(t("app.name", { unused: 1 })).toBe("Langle");
  });

  it("rejects unknown keys at type level", () => {
    // @ts-expect-error unknown key must be a TypeScript error
    const value = t("no.such.key");
    expect(value).toBe("no.such.key");
  });
});

describe("t in another locale", () => {
  it("shows the locale's message, and English for a key it lacks", () => {
    setUiLocale("ja", { "app.name": "ラングル" });
    expect(uiLocale()).toBe("ja");
    expect(t("app.name")).toBe("ラングル");
    expect(t("time.today")).toBe(en["time.today"]);
  });

  it("chooses the plural form by count, with the locale's rules", () => {
    expect(t("dict.sentences", { count: 1 })).toBe("1 sentence");
    expect(t("dict.sentences", { count: 2 })).toBe("2 sentences");
    expect(t("dict.sentences", { count: 0 })).toBe("0 sentences");
    setUiLocale("ru", {
      "dict.sentences": {
        one: "{count} предложение",
        few: "{count} предложения",
        many: "{count} предложений",
        other: "{count} предложения",
      },
    });
    expect(t("dict.sentences", { count: 1 })).toBe("1 предложение");
    expect(t("dict.sentences", { count: 21 })).toBe("21 предложение");
    expect(t("dict.sentences", { count: 3 })).toBe("3 предложения");
    expect(t("dict.sentences", { count: 5 })).toBe("5 предложений");
    expect(t("dict.sentences", { count: 1.5 })).toBe("1,5 предложения");
  });

  it("takes other for a form the message lacks, a plain string for every count", () => {
    setUiLocale("ru", { "dict.sentences": { other: "{count} шт." } });
    expect(t("dict.sentences", { count: 1 })).toBe("1 шт.");
    setUiLocale("ja", { "dict.sentences": "{count}文" });
    expect(t("dict.sentences", { count: 1 })).toBe("1文");
  });

  it("writes number vars as the locale does", () => {
    expect(t("cloud.devices", { count: 12345 })).toBe("12,345 devices");
    setUiLocale("de", { "cloud.devices": "{count} Geräte" });
    expect(t("cloud.devices", { count: 12345 })).toBe("12.345 Geräte");
    expect(t("settings.languages.dataSize", { size: "6.4" })).toBe("6.4 MB");
  });

  it("writes digits 0–9 in Arabic, as Chrome's Arabic interface does", () => {
    expect(
      new Intl.NumberFormat(formatTag("ar")).resolvedOptions().numberingSystem,
    ).toBe("latn");
    // Egyptian Arabic's default digits are Arabic-Indic ("٢").
    setUiLocale("ar-EG", { "cloud.devices": { other: "{count} أجهزة" } });
    expect(t("cloud.devices", { count: 12 })).toBe("12 أجهزة");
  });

  it("chooses the form by the number, however the number is written", () => {
    setUiLocale("ru", {
      "dict.sentences": {
        one: "{count} предложение",
        few: "{count} предложения",
        many: "{count} предложений",
        other: "{count} предложения",
      },
    });
    expect(t("dict.sentences", { count: 5000 })).toBe("5 000 предложений");
    expect(t("dict.sentences", { count: 1.5 })).toBe("1,5 предложения");
  });

  it("tells the listeners when the locale changes, not when it stays", () => {
    const listener = vi.fn();
    const unwatch = onUiLocaleChange(listener);
    const messages = { "app.name": "ラングル" };
    setUiLocale("ja", messages);
    setUiLocale("ja", messages);
    expect(listener).toHaveBeenCalledTimes(1);
    unwatch();
    setUiLocale("en");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("interpolate", () => {
  it("interpolates one var", () => {
    expect(interpolate("Hello, {name}!", { name: "Ann" })).toBe("Hello, Ann!");
  });

  it("interpolates several vars, including numbers and repeats", () => {
    expect(interpolate("{a} and {b}, {a}", { a: "x", b: 3 })).toBe(
      "x and 3, x",
    );
  });

  it("leaves a placeholder literal when its var is not given", () => {
    expect(interpolate("Hello, {name}!")).toBe("Hello, {name}!");
    expect(interpolate("{a} and {b}", { a: "x" })).toBe("x and {b}");
  });
});
