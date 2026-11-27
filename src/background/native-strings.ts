// The phone app's own strings (its bars, menu and notices) in the interface language
// (mobile-app.md "Native strings").
import type { NativeStringSet } from "../core/app-host";
import en from "../i18n/locales/en.json";
import { onUiLocaleChange, t, uiLocale, type MessageKey } from "../i18n/t";
import {
  followUiLocale,
  localeOfTag,
  showUiLocale,
  uiDirection,
  type UiLocaleDeps,
} from "../i18n/ui-locale";

/** The keys native code draws with: en.json's `app.` ones. */
const APP_KEYS = Object.keys(en).filter((key) =>
  key.startsWith("app."),
) as MessageKey[];

/**
 * The app's strings in the interface language now, English where it lacks one; the
 * placeholders (`{site}`) are left for native code to fill.
 */
export function nativeStringSet(): NativeStringSet {
  return {
    locale: uiLocale(),
    dir: uiDirection(),
    strings: Object.fromEntries(APP_KEYS.map((key) => [key, t(key)])),
  };
}

/** What following the interface language needs; the background passes the app's. */
export interface NativeStringsDeps extends UiLocaleDeps {
  /** `appHost.nativeStrings`. */
  send(set: NativeStringSet): Promise<void>;
  /** The device's language tag (`i18n.getUILanguage`): the one before the setup. */
  uiLanguage(): string;
  /** `whenSetUp` (messaging/setup.ts). */
  whenSetUp(run: () => void, waiting: () => void): () => void;
}

/**
 * Sends native code the app's strings once the interface language is known, and again
 * on each change of it: the device's language until this device is set up, then the
 * settings' (followed through their changes). The same strings are not sent twice.
 * Returns an unwatch.
 */
export function followNativeStrings(deps: NativeStringsDeps): () => void {
  let sent = "";
  const send = () => {
    const set = nativeStringSet();
    const json = JSON.stringify(set);
    if (json === sent) return;
    sent = json;
    deps.send(set).catch((error: unknown) => {
      // Sent again on the next change.
      if (sent === json) sent = "";
      console.error(error);
    });
  };
  const unlisten = onUiLocaleChange(send);
  let unwatch: (() => void) | undefined;
  let stopped = false;
  const cancel = deps.whenSetUp(
    () => {
      void followUiLocale(deps).then((stop) => {
        if (stopped) stop();
        else unwatch = stop;
        send();
      });
    },
    () => {
      void showUiLocale(localeOfTag(deps.uiLanguage()), deps.load).then(send);
    },
  );
  return () => {
    stopped = true;
    cancel();
    unlisten();
    unwatch?.();
  };
}
