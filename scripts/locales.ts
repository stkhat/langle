import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/** The interface's locale files (`<code>.json`, architecture "Interface language"). */
export const LOCALES_DIR = join(import.meta.dirname, "../src/i18n/locales");

/** The module that names the locales Langle has. */
const MODULE_ID = "virtual:langle-locales";

/** The codes of the locale files in `dir` ("en", "ja" …), sorted. */
export function localeCodes(dir = LOCALES_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
}

/**
 * Serves `virtual:langle-locales`: the codes of the locale files, English among them.
 * The bundles carry only the codes; English is imported where `t` is, and every other
 * locale is a file of its own in the build (`localeFiles`), loaded when it is chosen.
 */
export function localesPlugin(dir = LOCALES_DIR): Plugin {
  const resolved = `\0${MODULE_ID}`;
  return {
    name: "langle-locales",
    resolveId: (source) => (source === MODULE_ID ? resolved : undefined),
    load: (id) =>
      id === resolved
        ? `export default ${JSON.stringify(localeCodes(dir))};`
        : undefined,
  };
}

/**
 * The locale files the build ships besides English, at `locales/<code>.json`
 * (`fetchLocale` in src/i18n/ui-locale.ts reads them), without the source's spacing.
 * They are not web-accessible: content scripts get them through the background.
 */
export function localeFiles(
  dir = LOCALES_DIR,
): { relativeDest: string; contents: string }[] {
  return localeCodes(dir)
    .filter((code) => code !== "en")
    .map((code) => ({
      relativeDest: `locales/${code}.json`,
      contents: JSON.stringify(
        JSON.parse(readFileSync(join(dir, `${code}.json`), "utf8")),
      ),
    }));
}
