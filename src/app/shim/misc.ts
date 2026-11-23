import type { Bridge } from "../bridge/bridge";

/** Takes the browser's arguments and does nothing. */
const nothing: (...args: unknown[]) => Promise<void> = async () => {};

/** `browser.windows`: the app has one window, so focusing it does nothing. */
export function createWindows() {
  return { update: nothing };
}

/** What `i18n.detectLanguage` answers. */
interface DetectedLanguage {
  isReliable: boolean;
  languages: { language: string; percentage: number }[];
}

/**
 * `browser.i18n`: the UI language is the web view's, which follows the phone's. The
 * web views have no language detector, so `detectLanguage` is always unsure, which
 * the callers already handle (an unsure block counts as the learning language).
 */
export function createI18n() {
  return {
    getUILanguage: (): string => navigator.language,
    detectLanguage: async (): Promise<DetectedLanguage> => ({
      isReliable: false,
      languages: [],
    }),
  };
}

/** `browser.action`: the app has no toolbar icon; its popup is the Langle sheet. */
export function createAction(bridge: Bridge) {
  return {
    setIcon: nothing,
    openPopup: async (...args: unknown[]): Promise<void> => {
      await bridge.call("action.openPopup", ...args);
    },
  };
}
