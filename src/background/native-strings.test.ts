import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeStringSet } from "../core/app-host";
import { mergeSettings, type Settings } from "../core/settings";
import en from "../i18n/locales/en.json";
import { setUiLocale, type LocaleMessages } from "../i18n/t";
import { settingsListeners } from "../testing/stubs";
import { followNativeStrings, nativeStringSet } from "./native-strings";

const localeFile = (code: string) =>
  JSON.parse(
    readFileSync(
      join(import.meta.dirname, `../i18n/locales/${code}.json`),
      "utf8",
    ),
  ) as LocaleMessages;

const APP_KEYS = Object.keys(en).filter((key) => key.startsWith("app."));

afterEach(() => setUiLocale("en"));

function fake({
  stored = {},
  setUp = true,
  device = "en-US",
  load = async (code: string) => localeFile(code),
}: {
  stored?: Partial<Settings>;
  setUp?: boolean;
  device?: string;
  load?: (code: string) => Promise<LocaleMessages>;
}) {
  let settings = mergeSettings(stored);
  const watchers = settingsListeners(settings);
  const sent: NativeStringSet[] = [];
  let finishSetup = () => {};
  const unwatch = followNativeStrings({
    send: async (set) => {
      sent.push(set);
    },
    uiLanguage: () => device,
    getSettings: async () => settings,
    watchSettings: watchers.watch,
    load,
    whenSetUp(run, waiting) {
      if (setUp) run();
      else {
        finishSetup = run;
        waiting();
      }
      return () => {};
    },
  });
  return {
    sent,
    unwatch,
    finishSetup: () => finishSetup(),
    change(patch: Partial<Settings>) {
      settings = mergeSettings(patch, settings);
      watchers.emit(settings);
    },
  };
}

const last = (sent: NativeStringSet[]) => sent.at(-1);

describe("nativeStringSet", () => {
  it("has every app. key, with its placeholders left in", () => {
    const set = nativeStringSet();
    expect(set.locale).toBe("en");
    expect(set.dir).toBe("ltr");
    expect(Object.keys(set.strings).sort()).toEqual(APP_KEYS.sort());
    expect(set.strings["app.blockAdsSiteLabel"]).toBe(
      "Block ads on this site, {site}",
    );
  });
});

describe("followNativeStrings", () => {
  it("sends the device's language before the setup, then the settings' once set up", async () => {
    const app = fake({
      setUp: false,
      device: "ja-JP",
      stored: { nativeLang: "ar" },
    });
    await vi.waitFor(() => expect(last(app.sent)?.locale).toBe("ja"));
    expect(last(app.sent)?.strings["app.home"]).toBe(
      localeFile("ja")["app.home"],
    );
    app.finishSetup();
    await vi.waitFor(() => expect(last(app.sent)?.locale).toBe("ar"));
    expect(last(app.sent)?.dir).toBe("rtl");
    expect(app.sent.map((set) => set.locale)).toEqual(["ja", "ar"]);
  });

  it("sends English before the setup where the device's language has no locale", async () => {
    const app = fake({ setUp: false, device: "sw-KE" });
    await vi.waitFor(() => expect(app.sent).toHaveLength(1));
    expect(app.sent[0]).toEqual(nativeStringSet());
    expect(app.sent[0]?.locale).toBe("en");
  });

  it("sends the settings' language at start, and again on each change of it", async () => {
    const app = fake({ stored: { nativeLang: "ja" } });
    await vi.waitFor(() => expect(last(app.sent)?.locale).toBe("ja"));
    app.change({ interfaceLanguage: "ar" });
    await vi.waitFor(() => expect(last(app.sent)?.locale).toBe("ar"));
    expect(last(app.sent)?.dir).toBe("rtl");
    app.change({ interfaceLanguage: "en" });
    await vi.waitFor(() => expect(last(app.sent)?.locale).toBe("en"));
    expect(last(app.sent)?.strings["app.more"]).toBe("More");
    // A change of something else sends nothing.
    app.change({ enabled: false });
    await Promise.resolve();
    expect(app.sent.map((set) => set.locale)).toEqual(["ja", "ar", "en"]);
    app.unwatch();
  });

  it("sends English once at start when English is the interface language", async () => {
    const app = fake({ stored: { nativeLang: "en" } });
    await vi.waitFor(() => expect(app.sent).toHaveLength(1));
    expect(app.sent[0]?.locale).toBe("en");
  });

  it("sends a key the locale lacks in English", async () => {
    const app = fake({
      stored: { nativeLang: "ja" },
      load: async () => ({ "app.home": "ホーム" }),
    });
    await vi.waitFor(() => expect(last(app.sent)?.locale).toBe("ja"));
    expect(last(app.sent)?.strings["app.home"]).toBe("ホーム");
    expect(last(app.sent)?.strings["app.more"]).toBe("More");
    expect(Object.keys(last(app.sent)!.strings)).toHaveLength(APP_KEYS.length);
  });

  it("stops sending once unwatched", async () => {
    const app = fake({ stored: { nativeLang: "ja" } });
    await vi.waitFor(() => expect(app.sent).toHaveLength(1));
    app.unwatch();
    app.change({ interfaceLanguage: "ar" });
    setUiLocale("de", localeFile("de"));
    await Promise.resolve();
    expect(app.sent).toHaveLength(1);
  });
});
