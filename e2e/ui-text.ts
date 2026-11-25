// The interface's texts in a language, for tests that see Langle in one other than
// English: the setup in the browser's language, and everything after "I speak".
import { existsSync, readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import en from "../src/i18n/locales/en.json" with { type: "json" };

type Key = keyof typeof en;
type Value = string | { other: string };

const LOCALES = new URL("../src/i18n/locales/", import.meta.url);

/** `key` in `locale` (English where it lacks the key), its `other` form, vars filled in. */
export type UiText = (key: Key, vars?: Record<string, string>) => string;

export function uiText(locale: string): UiText {
  const file = new URL(`${locale}.json`, LOCALES);
  const own = (
    locale !== "en" && existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : en
  ) as Record<string, Value | undefined>;
  return (key, vars = {}) => {
    const value = (own[key] ?? en[key]) as Value;
    const text = typeof value === "string" ? value : value.other;
    return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      Object.hasOwn(vars, name) ? vars[name]! : placeholder,
    );
  };
}

/**
 * The language an extension page shows: its `<html lang>` once it has rendered into
 * `#app` (before that, the template's "en"). The setup and the popup show the
 * browser's language before the setup ends; what the browser reports can change while
 * a page stays open (macOS with `--lang`), so tests read the page instead.
 */
export async function pageUiLocale(page: Page): Promise<string> {
  await page.locator("#app > *").first().waitFor();
  return page.evaluate(() => document.documentElement.lang);
}

/**
 * The language the setup starts in: the browser's UI language where Langle has it
 * (by its primary subtag), else English.
 */
export async function browserUiLocale(page: Page): Promise<string> {
  const tag = await page.evaluate(() =>
    (
      globalThis as unknown as {
        chrome: { i18n: { getUILanguage(): string } };
      }
    ).chrome.i18n.getUILanguage(),
  );
  const code = tag.toLowerCase().split(/[-_]/)[0]!;
  return existsSync(new URL(`${code}.json`, LOCALES)) ? code : "en";
}
