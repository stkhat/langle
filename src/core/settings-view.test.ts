import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Settings,
  type SettingsPatch,
} from "./settings";
import { createSettingsView } from "./settings-view";

/** A view over storage that stores, tells and answers each write when the test says. */
function open() {
  let stored = DEFAULT_SETTINGS;
  const shown: Settings[] = [];
  const writes: {
    patch: SettingsPatch;
    resolve: () => void;
    reject: (error: Error) => void;
  }[] = [];
  const view = createSettingsView(
    (settings) => shown.push(settings),
    (patch) =>
      new Promise<void>((resolve, reject) => {
        writes.push({ patch, resolve, reject });
      }),
  );
  view.stored(stored);
  return {
    view,
    shown,
    last: () => shown.at(-1)!,
    /** A change made elsewhere is stored and told. */
    elsewhere(patch: SettingsPatch) {
      stored = mergeSettings(patch, stored);
      view.stored(stored);
    },
    /** The oldest write is stored and told; the returned function answers it. */
    storeNext() {
      const write = writes.shift()!;
      stored = mergeSettings(write.patch, stored);
      view.stored(stored);
      return write.resolve;
    },
    failNext: () => writes.shift()!.reject(new Error("not stored")),
  };
}

describe("createSettingsView", () => {
  it("shows a change at once", () => {
    const { view, last } = open();
    void view.change({ theme: "dark" });
    expect(last().theme).toBe("dark");
  });

  it("never shows a value older than the last change made here", async () => {
    const { view, shown, storeNext } = open();
    const changes = [
      view.change({ learningLang: "es", nativeLang: "en" }),
      view.change({ learningLang: "de", nativeLang: "fr" }),
      view.change({ learningLang: "en", nativeLang: "ja" }),
    ];
    const chosen = shown.length;
    const answers = [storeNext(), storeNext(), storeNext()];
    for (const answer of answers) answer();
    await Promise.all(changes);
    expect(shown).toHaveLength(chosen);
  });

  it("lays what is on its way over a change made elsewhere", () => {
    const { view, last, elsewhere } = open();
    void view.change({ theme: "dark", highlight: { known: true } });
    elsewhere({ theme: "light", knownLevel: 5000, highlight: { new: false } });
    expect(last()).toMatchObject({
      theme: "dark",
      knownLevel: 5000,
      highlight: { new: false, known: true },
    });
  });

  it("shows a change made elsewhere after its own was stored, before the answer", async () => {
    const { view, last, elsewhere, storeNext } = open();
    const change = view.change({ theme: "dark" });
    const answer = storeNext();
    elsewhere({ theme: "light" });
    answer();
    await change;
    expect(last().theme).toBe("light");
  });

  it("goes back to what is stored when a write fails", async () => {
    const { view, last, failNext } = open();
    const change = view.change({ theme: "dark" });
    failNext();
    await expect(change).rejects.toThrow("not stored");
    expect(last().theme).toBe(DEFAULT_SETTINGS.theme);
  });
});
