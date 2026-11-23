import { beforeEach, describe, expect, it, vi } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { DEFAULT_SETTINGS } from "../core/settings";
import {
  getSettings,
  getTimedSettings,
  setSettings,
  settingsStored,
  storeChosenPair,
} from "./settings-store";

beforeEach(() => {
  fakeBrowser.reset();
});

describe("settings store", () => {
  it("gives the defaults when nothing is stored", async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips a patch through storage.sync under the key settings", async () => {
    const saved = await setSettings({
      knownLevel: 5000,
      highlight: { new: true },
    });
    expect(saved.knownLevel).toBe(5000);
    expect(saved.highlight).toEqual({
      new: true,
      learning: true,
      known: false,
    });
    expect(await getSettings()).toEqual(saved);

    const stored = await browser.storage.sync.get("settings");
    expect(stored.settings).toEqual(saved);
  });

  it("applies a later patch on top of the stored settings", async () => {
    await setSettings({ knownLevel: 5000 });
    const saved = await setSettings({ sites: { netflix: false } });
    expect(saved.knownLevel).toBe(5000);
    expect(saved.sites.netflix).toBe(false);
  });

  it("keeps both of two patches sent at the same time", async () => {
    await Promise.all([
      setSettings({ knownLevel: 5000 }),
      setSettings({ syncEnabled: false }),
    ]);
    const settings = await getSettings();
    expect(settings.knownLevel).toBe(5000);
    expect(settings.syncEnabled).toBe(false);
  });

  it("cleans up what it reads (clamps, drops unknown keys)", async () => {
    await browser.storage.sync.set({
      settings: { knownLevel: 50, bogus: true },
    });
    const settings = await getSettings();
    expect(settings.knownLevel).toBe(1000);
    expect(settings).not.toHaveProperty("bogus");
  });
});

describe("storeChosenPair", () => {
  const spanish = { learningLang: "en", nativeLang: "es" };

  it("stores the pair chosen at the first run", async () => {
    expect(await settingsStored()).toBe(false);
    await storeChosenPair(spanish);
    expect((await browser.storage.sync.get("settings")).settings).toEqual({
      ...DEFAULT_SETTINGS,
      ...spanish,
    });
  });

  it("changes only the pair of the settings stored already", async () => {
    await setSettings({ knownLevel: 5000 });
    await storeChosenPair(spanish);
    expect(await getSettings()).toMatchObject({ ...spanish, knownLevel: 5000 });
  });

  it("writes nothing when the stored pair is chosen again", async () => {
    await setSettings(spanish);
    const set = vi.spyOn(browser.storage.sync, "set");
    await storeChosenPair(spanish);
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });
});

describe("field times", () => {
  const at = (time: number) => () => time;
  const storedTimes = async () =>
    (await browser.storage.sync.get("settingsTimes")).settingsTimes;

  it("stores the time of each field a change sets, beside the plain settings", async () => {
    const saved = await setSettings(
      { knownLevel: 5000, sites: { netflix: false } },
      at(10),
    );
    expect(await storedTimes()).toEqual({
      values: saved,
      times: { knownLevel: 10, "sites.netflix": 10 },
    });
    // Older versions read the settings item as before.
    expect((await browser.storage.sync.get("settings")).settings).toEqual(
      saved,
    );
    expect(await getTimedSettings()).toEqual({
      values: saved,
      times: { knownLevel: 10, "sites.netflix": 10 },
    });
  });

  it("keeps the other fields' times, and times a change after the previous one", async () => {
    await setSettings({ knownLevel: 5000 }, at(10));
    await setSettings({ syncEnabled: false }, at(20));
    // The clock is behind: the change still comes after the one it replaces.
    await setSettings({ knownLevel: 8000 }, at(5));
    // A patch that changes nothing changes no time.
    await setSettings({ syncEnabled: false }, at(30));
    expect((await getTimedSettings()).times).toEqual({
      knownLevel: 11,
      syncEnabled: 20,
    });
  });

  it("times the changed fields of settings stored before field times, once", async () => {
    await browser.storage.sync.set({ settings: { knownLevel: 5000 } });
    expect((await getTimedSettings(at(50))).times).toEqual({ knownLevel: 50 });
    expect((await getTimedSettings(at(60))).times).toEqual({ knownLevel: 50 });
  });

  it("times a field another device changed without field times when it is read", async () => {
    const saved = await setSettings({ knownLevel: 5000 }, at(10));
    // An older version on another device, through browser sync.
    await browser.storage.sync.set({
      settings: { ...saved, syncEnabled: false },
    });
    expect(await getTimedSettings(at(30))).toEqual({
      values: { ...saved, syncEnabled: false },
      times: { knownLevel: 10, syncEnabled: 30 },
    });
  });

  it("reads damaged times as none", async () => {
    await browser.storage.sync.set({
      settings: { knownLevel: 5000 },
      settingsTimes: { values: 3, times: { knownLevel: "x", syncEnabled: -1 } },
    });
    expect((await getTimedSettings(at(40))).times).toEqual({ knownLevel: 40 });
  });

  it("gives the starting pair time 0, so any device's choice wins over it", async () => {
    await storeChosenPair({ learningLang: "en", nativeLang: "es" });
    expect(await storedTimes()).toEqual({
      values: { ...DEFAULT_SETTINGS, learningLang: "en", nativeLang: "es" },
      times: {},
    });
  });

  it("times a chosen pair that replaces a stored one, as any change", async () => {
    await setSettings({}, () => 1000);
    await storeChosenPair({ learningLang: "en", nativeLang: "es" }, () => 2000);
    expect((await getTimedSettings()).times).toEqual({ nativeLang: 2000 });
  });
});
