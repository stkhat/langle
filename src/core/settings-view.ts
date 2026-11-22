import { mergeSettings, type Settings, type SettingsPatch } from "./settings";

/** The settings as a page that changes them shows them. */
export interface SettingsView {
  /** The settings are stored like this now: as first read, then as `watchSettings` tells. */
  stored(settings: Settings): void;
  /** Shows `patch` at once and writes it; settles as the write does. */
  change(patch: SettingsPatch): Promise<void>;
}

/**
 * What to show while changes made here are on their way: those changes, in their order,
 * over what is stored. The background stores them in that order and each is told
 * (`storage.onChanged`) before its write is answered, so the echo of an earlier change
 * never covers a later one. An answer is no news: by then a newer change may have been
 * told. It only ends its change's wait, and a failed one uncovers what is stored.
 */
export function createSettingsView(
  show: (settings: Settings) => void,
  write: (patch: SettingsPatch) => Promise<unknown>,
): SettingsView {
  let stored: Settings | undefined;
  let shown = "";
  const waiting = new Set<{ patch: SettingsPatch }>();

  function update() {
    if (!stored) return;
    let next = stored;
    for (const { patch } of waiting) next = mergeSettings(patch, next);
    const json = JSON.stringify(next);
    if (json === shown) return;
    shown = json;
    show(next);
  }

  return {
    stored(settings) {
      stored = settings;
      update();
    },
    async change(patch) {
      const entry = { patch };
      waiting.add(entry);
      update();
      try {
        await write(patch);
      } finally {
        waiting.delete(entry);
        update();
      }
    },
  };
}
