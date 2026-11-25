import { REVIEW_URLS } from "./links";

/**
 * Browser differences in one place (architecture.md: "Browser differences"). Names
 * come from the build target; features are detected on a global object, never from
 * the user agent. The translator is not among them: it does not exist in the
 * background's service worker, so the UI detects it where it translates.
 */

/**
 * Where `storage.sync` keeps the data: the browser's own sync (named in the UI), or
 * only this device (the phone app, whose `storage.sync` is never synced).
 */
export type SyncPlace = { kind: "browser"; name: string } | { kind: "device" };

export interface BrowserEnv {
  /** For UI text, e.g. "Chrome". */
  name: string;
  /** e.g. `{ kind: "browser", name: "Chrome sync" }`; `device` in the phone app. */
  sync: SyncPlace;
  /** The store listing's review page ("Rate"); empty until the listing exists. */
  reviewUrl: string;
  features: {
    /** File System Access API (saving to a folder). */
    fileSystemAccess: boolean;
    /**
     * The phone app's `appHost` (core/app-host.ts): a phone with no keyboard, no
     * Netflix and no sponsors, whose own store takes the ratings.
     */
    appHost: boolean;
  };
}

/**
 * Targets other than Firefox are Chromium builds and get Chrome's names. Where the
 * phone app's `appHost` exists on the global, nothing is synced: `sync` is `device`.
 */
export function createBrowserEnv(
  target: string = import.meta.env.BROWSER,
  g: object = globalThis,
): BrowserEnv {
  const firefox = target === "firefox";
  return {
    name: firefox ? "Firefox" : "Chrome",
    sync:
      "appHost" in g
        ? { kind: "device" }
        : { kind: "browser", name: firefox ? "Firefox Sync" : "Chrome sync" },
    reviewUrl: firefox ? REVIEW_URLS.firefoxAddOns : REVIEW_URLS.chromeWebStore,
    features: {
      fileSystemAccess: "showDirectoryPicker" in g,
      appHost: "appHost" in g,
    },
  };
}
