// The interface's strings in the interface language (architecture "Interface language").
// English is bundled; another locale's messages come in with `setUiLocale`.
import en from "./locales/en.json";

export type MessageKey = keyof typeof en;
export type MessageVars = Record<string, string | number>;

/**
 * A message that depends on a number: a form per plural category the language has
 * (`Intl.PluralRules`), `other` required, chosen by the `count` var.
 */
type PluralForms = {
  readonly [category in Intl.LDMLPluralRule]?: string;
} & { readonly other: string };

type MessageValue = string | PluralForms;

/** A locale file: en.json's keys, each a string or plural forms. A missing key shows in English. */
export type LocaleMessages = { readonly [key in MessageKey]?: MessageValue };

/** What `t` reads from: the locale and its messages. */
let current: { locale: string; messages: LocaleMessages } = {
  locale: "en",
  messages: en,
};
const listeners = new Set<() => void>();

/** The interface language now ("en", "ja" …). */
export const uiLocale = () => current.locale;

/**
 * Shows the interface in `locale` with its `messages` (English's own when `locale` is
 * "en"), and tells the listeners when that changes anything.
 */
export function setUiLocale(locale: string, messages: LocaleMessages = {}) {
  const next = locale === "en" ? en : messages;
  if (locale === current.locale && next === current.messages) return;
  current = { locale, messages: next };
  for (const listener of [...listeners]) listener();
}

/** Calls `listener` after each change of the interface language; returns an unwatch. */
export function onUiLocaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The space between a text and the sentence after it: none after a full-width mark
 * (Japanese and Chinese "。", "："), which carries its own space; one after any other
 * end (".", "।", Korean's ".", Thai's sentence without a mark).
 */
export const sentenceGap = (before: string): "" | " " =>
  /[\u3000-\u303f\uff00-\uffef]$/u.test(before) ? "" : " ";

/** Sentences as one text, each gap as `sentenceGap` puts it; missing ones left out. */
export function sentences(...parts: readonly (string | undefined)[]): string {
  return parts
    .filter((part): part is string => part !== undefined && part !== "")
    .reduce(
      (text, part) => (text === "" ? part : text + sentenceGap(text) + part),
      "",
    );
}

/**
 * The tag Intl writes the interface's numbers, dates and times with: the locale with
 * Western digits 0–9, as Chrome's own interface writes them in every language Langle
 * has (in Arabic too, where Intl may default to Arabic-Indic digits).
 */
export const formatTag = (locale: string) => `${locale}-u-nu-latn`;

/** A locale's plural rules and number format, made once. */
const formats = new Map<
  string,
  { plural: Intl.PluralRules; number: Intl.NumberFormat }
>();
function formatsOf(locale: string) {
  let made = formats.get(locale);
  if (!made) {
    made = {
      plural: new Intl.PluralRules(locale),
      number: new Intl.NumberFormat(formatTag(locale)),
    };
    formats.set(locale, made);
  }
  return made;
}

/**
 * Replaces `{name}` placeholders; a placeholder without a matching var stays as literal
 * text. A number var is written with `formatNumber` (as it is without one).
 */
export function interpolate(
  template: string,
  vars?: MessageVars,
  formatNumber: (n: number) => string = String,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    if (!Object.hasOwn(vars, name)) return placeholder;
    const value = vars[name]!;
    return typeof value === "number" ? formatNumber(value) : value;
  });
}

/** The form of `value` for `count` in `locale`; `other` without a number. */
function formOf(value: MessageValue, locale: string, count: unknown): string {
  if (typeof value === "string") return value;
  if (typeof count !== "number") return value.other;
  return value[formatsOf(locale).plural.select(count)] ?? value.other;
}

/**
 * The message `key` in the interface language, English where the locale lacks it, with
 * its vars filled in: numbers written as the language writes them (grouping, digits),
 * and the plural form chosen by `count`.
 */
export function t(key: MessageKey, vars?: MessageVars): string {
  const own = current.messages[key];
  // English's forms follow English's plural rules.
  const locale = own === undefined ? "en" : current.locale;
  // A key from outside the types (stored data) shows as itself.
  const value = (own ?? en[key]) as MessageValue | undefined;
  if (value === undefined) return key;
  const template = formOf(value, locale, vars?.count);
  return interpolate(template, vars, (n) => formatsOf(locale).number.format(n));
}
