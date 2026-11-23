import type { Bridge } from "../bridge/bridge";

/** Takes the browser's arguments and does nothing. */
const nothing: (...args: unknown[]) => Promise<void> = async () => {};

/** `browser.windows`: the app has one window, so focusing it does nothing. */
export function createWindows() {
  return { update: nothing };
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
