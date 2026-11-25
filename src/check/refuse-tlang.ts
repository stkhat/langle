import { browser } from "wxt/browser";

/**
 * Check builds only: the `storage.local` key of the switch that makes the YouTube
 * adapter treat its auto-translation (`tlang`) as refused, the path a 429 answer
 * takes, so a video that would get `tlang` (the TED baseline) shows on-device
 * translated subtitles. Set through `langle:check-settings` (`refuseTlang`).
 */
const REFUSE_TLANG_KEY = "checkRefuseTlang";

/** Whether the switch is on; off when it cannot be read. */
export async function tlangRefused(): Promise<boolean> {
  try {
    const stored = await browser.storage.local.get(REFUSE_TLANG_KEY);
    return stored[REFUSE_TLANG_KEY] === true;
  } catch {
    return false;
  }
}

/** Turns the switch on, or off (removing the key). */
export const setTlangRefused = (on: boolean): Promise<void> =>
  on
    ? browser.storage.local.set({ [REFUSE_TLANG_KEY]: true })
    : browser.storage.local.remove(REFUSE_TLANG_KEY);
