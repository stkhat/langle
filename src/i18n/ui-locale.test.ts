import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
} from "../core/settings";
import { setUiLocale, t, uiLocale } from "./t";
import {
  followUiLocale,
  interfaceLanguages,
  interfaceLocale,
  localeOfTag,
  showUiLocale,
  uiDirection,
  UI_LOCALES,
  type LoadLocale,
} from "./ui-locale";

// The build has Japanese and Arabic besides English.
vi.mock("virtual:langle-locales", () => ({ default: ["en", "ja", "ar"] }));

afterEach(() => setUiLocale("en"));

const HAS = ["en", "ja", "ar"];

describe("interfaceLocale", () => {
  const settings = (interfaceLanguage: string, nativeLang: string) => ({
    interfaceLanguage,
    nativeLang,
  });

  it("follows Your language where Langle has it, else English", () => {
    expect(interfaceLocale(settings("", "ja"), HAS)).toBe("ja");
    expect(interfaceLocale(settings("", "es"), HAS)).toBe("en");
    expect(interfaceLocale(settings("", "en"), HAS)).toBe("en");
  });

  it("keeps the language picked, English too", () => {
    expect(interfaceLocale(settings("en", "ja"), HAS)).toBe("en");
    expect(interfaceLocale(settings("ar", "ja"), HAS)).toBe("ar");
  });

  it("follows Your language when the language picked is not there", () => {
    expect(interfaceLocale(settings("nl", "ja"), HAS)).toBe("ja");
  });

  it("follows for settings stored with the uiLocale of before", () => {
    expect(
      interfaceLocale(mergeSettings({ uiLocale: "en", nativeLang: "ja" }), HAS),
    ).toBe("ja");
  });

  it("has English among the build's locales", () => {
    expect(UI_LOCALES).toContain("en");
  });
});

describe("interfaceLanguages", () => {
  it("offers the native languages Langle has, in their order, English last", () => {
    expect(interfaceLanguages(["en", "ar", "ja", "nl"])).toEqual([
      "ja",
      "ar",
      "en",
    ]);
  });
});

describe("localeOfTag", () => {
  it("takes a tag's primary language where Langle has it, else English", () => {
    expect(localeOfTag("ja", HAS)).toBe("ja");
    expect(localeOfTag("ar-EG", HAS)).toBe("ar");
    expect(localeOfTag("pt-BR", HAS)).toBe("en");
    expect(localeOfTag("", HAS)).toBe("en");
  });
});

describe("uiDirection", () => {
  it("lays Arabic out right to left, the others left to right", () => {
    expect(uiDirection("ar")).toBe("rtl");
    expect(uiDirection("ja")).toBe("ltr");
    expect(uiDirection()).toBe("ltr");
  });
});

const JA = { "app.name": "ラングル" };

describe("showUiLocale", () => {
  it("shows the locale once its messages are there", async () => {
    const load = vi.fn<LoadLocale>(async () => JA);
    await showUiLocale("ja", load);
    expect(load).toHaveBeenCalledWith("ja");
    expect(uiLocale()).toBe("ja");
    expect(t("app.name")).toBe("ラングル");
  });

  it("loads nothing for English", async () => {
    const load = vi.fn<LoadLocale>(async () => JA);
    await showUiLocale("ja", load);
    await showUiLocale("en", load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(uiLocale()).toBe("en");
  });

  it("shows English when the messages cannot be loaded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setUiLocale("ja", JA);
    await showUiLocale("ar", async () => {
      throw new Error("gone");
    });
    expect(uiLocale()).toBe("en");
  });

  it("drops an answer that comes after a later request's", async () => {
    let answer: (messages: typeof JA) => void = () => {};
    const slow = showUiLocale(
      "ja",
      () => new Promise((resolve) => (answer = resolve)),
    );
    await showUiLocale("en", async () => ({}));
    answer(JA);
    await slow;
    expect(uiLocale()).toBe("en");
  });
});

/** Settings a test hands out, and a way to change them as storage would tell. */
function fakeSettings(initial: Partial<Settings>) {
  let listener: ((settings: Settings) => void) | undefined;
  const settings = { ...DEFAULT_SETTINGS, ...initial };
  return {
    getSettings: vi.fn(async () => settings),
    watchSettings: vi.fn((next: (settings: Settings) => void) => {
      listener = next;
      return () => (listener = undefined);
    }),
    change: (patch: Partial<Settings>) =>
      listener?.({ ...DEFAULT_SETTINGS, ...patch }),
    watching: () => listener !== undefined,
  };
}

describe("followUiLocale", () => {
  const load = vi.fn<LoadLocale>(async (locale) =>
    locale === "ja" ? JA : { "app.name": "لانغل" },
  );

  it("shows the settings' interface language before it settles", async () => {
    const settings = fakeSettings({ nativeLang: "ja" });
    await followUiLocale({ ...settings, load });
    expect(uiLocale()).toBe("ja");
  });

  it("follows Your language, then the language picked, and stops on unwatch", async () => {
    const settings = fakeSettings({ nativeLang: "es" });
    const unwatch = await followUiLocale({ ...settings, load });
    expect(uiLocale()).toBe("en");
    settings.change({ nativeLang: "ja" });
    await vi.waitFor(() => expect(uiLocale()).toBe("ja"));
    settings.change({ nativeLang: "ja", interfaceLanguage: "ar" });
    await vi.waitFor(() => expect(uiLocale()).toBe("ar"));
    settings.change({ nativeLang: "ja", interfaceLanguage: "en" });
    await vi.waitFor(() => expect(uiLocale()).toBe("en"));
    unwatch();
    expect(settings.watching()).toBe(false);
  });

  it("keeps a change heard while the settings were read", async () => {
    const settings = fakeSettings({ nativeLang: "ja" });
    settings.getSettings.mockImplementationOnce(async () => {
      settings.change({ nativeLang: "ar" });
      return { ...DEFAULT_SETTINGS, nativeLang: "ja" };
    });
    await followUiLocale({ ...settings, load });
    await vi.waitFor(() => expect(uiLocale()).toBe("ar"));
  });

  it("settles in English when the settings cannot be read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const settings = fakeSettings({});
    settings.getSettings.mockRejectedValueOnce(new Error("no"));
    await followUiLocale({ ...settings, load });
    expect(uiLocale()).toBe("en");
  });
});
