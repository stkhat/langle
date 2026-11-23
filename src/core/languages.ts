import lockFile from "./packs/packs.lock.json";
import { LANGUAGE_PACKS } from "./packs/formats";
import { DEFAULT_SETTINGS } from "./settings";
import { own } from "./util";

/**
 * The language pairs Langle offers: each learning language (one with a language pack)
 * with the native languages it has a dictionary into, the default first. They are the
 * pairs whose dictionaries pass the quality gate, as `npm run data:publish` writes them
 * into the lock (scripts/data/gate.ts). The background's registry
 * (`src/background/language-resources.ts`) builds every one.
 */
const LANGUAGE_PAIRS: Readonly<Record<string, readonly string[]>> = inPackOrder(
  lockFile.pairs,
);

/**
 * The offered pairs with the learning languages in `LANGUAGE_PACKS`' order (English,
 * Spanish, French, German), not the lock's, whose keys are sorted: Settings list them
 * so, and the first run offers them so (`learnableFrom`).
 */
function inPackOrder(
  pairs: Readonly<Record<string, readonly string[]>>,
): Readonly<Record<string, readonly string[]>> {
  const order = (lang: string) => {
    const at = (LANGUAGE_PACKS as readonly string[]).indexOf(lang);
    return at < 0 ? LANGUAGE_PACKS.length : at;
  };
  return Object.fromEntries(
    Object.entries(pairs).sort(([a], [b]) => order(a) - order(b)),
  );
}

/** Speech voices by learning language. */
const SPEECH_LANGS: Readonly<Record<string, string>> = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

/** The learning languages, in the order the settings offer them. */
export function learningLanguages(): string[] {
  return Object.keys(LANGUAGE_PAIRS);
}

/** The native languages `learning` has a dictionary into, the default first. */
export const nativeLanguages = (learning: string): readonly string[] =>
  own(LANGUAGE_PAIRS, learning) ?? [];

/** The language tag to speak `lang` with: a regional voice where one is chosen. */
export const speechLang = (lang: string) => own(SPEECH_LANGS, lang) ?? lang;

/** The primary subtag of a language tag, lowercase: "pt-BR" → "pt". */
export const primary = (tag: string) =>
  tag.trim().split(/[-_]/)[0]!.toLowerCase();

/** The languages "I speak" offers: the native language of any offered pair. */
export const spokenLanguages = (
  offered: Readonly<Record<string, readonly string[]>> = LANGUAGE_PAIRS,
): string[] => [...new Set(Object.values(offered).flat())];

/** The languages "I’m learning" offers with `native`, in the usual order. */
export const learnableFrom = (
  native: string,
  offered: Readonly<Record<string, readonly string[]>> = LANGUAGE_PAIRS,
): string[] =>
  Object.keys(offered).filter((lang) => offered[lang]!.includes(native));

/**
 * The language to learn that the languages screen fills in with `native`: `current`
 * where it is offered, else English where it is, else the only choice; "" where the
 * user has to choose.
 */
export function learningFor(
  native: string,
  current: string,
  offered: Readonly<Record<string, readonly string[]>> = LANGUAGE_PAIRS,
): string {
  const list = learnableFrom(native, offered);
  for (const lang of [current, DEFAULT_SETTINGS.learningLang])
    if (list.includes(lang)) return lang;
  return list.length === 1 ? list[0]! : "";
}

/**
 * What the languages screen starts with: the stored pair where it is offered, else the
 * browser's UI language (a tag such as "pt-BR") as the native language, where it is one,
 * with `learningFor`'s language. "" for what is not guessed.
 */
export function suggestedPair(
  uiLanguage: string,
  stored: { learningLang: string; nativeLang: string } | undefined,
  offered: Readonly<Record<string, readonly string[]>> = LANGUAGE_PAIRS,
): { learningLang: string; nativeLang: string } {
  if (stored && own(offered, stored.learningLang)?.includes(stored.nativeLang))
    return { learningLang: stored.learningLang, nativeLang: stored.nativeLang };
  const ui = primary(uiLanguage);
  const native = spokenLanguages(offered).includes(ui) ? ui : "";
  return { learningLang: learningFor(native, "", offered), nativeLang: native };
}
