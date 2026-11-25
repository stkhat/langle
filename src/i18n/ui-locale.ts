// Which interface language a context shows, and getting its messages there
// (architecture "Interface language").
import codes from "virtual:langle-locales";
import { browser } from "wxt/browser";
import { primary } from "../core/languages";
import { NATIVE_LANGUAGES, writtenRightToLeft } from "../core/natives";
import type { Settings } from "../core/settings";
import { setUiLocale, uiLocale, type LocaleMessages } from "./t";

/** The locales Langle has (a file in src/i18n/locales), English among them. */
export const UI_LOCALES: readonly string[] = codes;

/**
 * The interface languages Settings offers, in the native languages' order (English
 * last): every native language Langle has a locale for.
 */
export const interfaceLanguages = (
  has: readonly string[] = UI_LOCALES,
): string[] =>
  Object.keys(NATIVE_LANGUAGES).filter((code) => has.includes(code));

/**
 * The interface language the settings ask for: the one picked in Settings, else Your
 * language where Langle has it, else English.
 */
export function interfaceLocale(
  settings: Pick<Settings, "interfaceLanguage" | "nativeLang">,
  has: readonly string[] = UI_LOCALES,
): string {
  const picked = settings.interfaceLanguage;
  if (picked !== "" && has.includes(picked)) return picked;
  return has.includes(settings.nativeLang) ? settings.nativeLang : "en";
}

/**
 * The interface language for a language tag ("pt-BR", the browser's UI language before
 * the setup): its primary language where Langle has it, else English.
 */
export function localeOfTag(
  tag: string,
  has: readonly string[] = UI_LOCALES,
): string {
  const code = primary(tag);
  return has.includes(code) ? code : "en";
}

/** The direction the interface in `locale` is laid out in: Arabic's mirrors. */
export const uiDirection = (locale = uiLocale()): "ltr" | "rtl" =>
  writtenRightToLeft(locale) ? "rtl" : "ltr";

/** Gets a locale's messages (never English's: they are bundled). */
export type LoadLocale = (locale: string) => Promise<LocaleMessages>;

/**
 * A locale's messages from the build's `locales/<code>.json`: for extension pages and
 * the background, which read the extension's files. Content scripts ask the background
 * (`uiMessages`): the files are not web-accessible.
 */
export const fetchLocale: LoadLocale = async (locale) => {
  const url = browser.runtime.getURL(
    `/locales/${locale}.json` as "/popup.html",
  );
  const response = await fetch(url);
  if (!response.ok) throw new Error(`no locale file for ${locale}`);
  return (await response.json()) as LocaleMessages;
};

/** The latest request: an answer to an earlier one that comes later is dropped. */
let latest = 0;

/**
 * Shows the interface in `locale`, once its messages are there; in English when they
 * cannot be loaded.
 */
export async function showUiLocale(
  locale: string,
  load: LoadLocale,
): Promise<void> {
  const request = ++latest;
  if (locale === "en") return setUiLocale("en");
  let messages: LocaleMessages | undefined;
  try {
    messages = await load(locale);
  } catch (error) {
    console.warn("Langle:", error);
  }
  if (request !== latest) return;
  if (messages) setUiLocale(locale, messages);
  else setUiLocale("en");
}

/** Where a context reads the settings the interface language comes from. */
export interface UiLocaleDeps {
  getSettings(): Promise<Settings>;
  watchSettings(listener: (settings: Settings) => void): () => void;
  load: LoadLocale;
}

/**
 * Shows the interface language the settings ask for and follows their changes: Your
 * language too while no interface language is picked. Settles once the first one is
 * shown (English when the settings cannot be read); returns an unwatch.
 */
export async function followUiLocale(deps: UiLocaleDeps): Promise<() => void> {
  let shown = "";
  let heard = false;
  const show = (settings: Settings) => {
    const locale = interfaceLocale(settings);
    if (locale === shown) return Promise.resolve();
    shown = locale;
    return showUiLocale(locale, deps.load);
  };
  const unwatch = deps.watchSettings((settings) => {
    heard = true;
    void show(settings);
  });
  try {
    const settings = await deps.getSettings();
    // A change heard meanwhile is newer than what was read.
    if (!heard) await show(settings);
  } catch (error) {
    console.warn("Langle:", error);
  }
  return unwatch;
}
