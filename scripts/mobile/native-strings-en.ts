// The iOS shell's built-in English (docs/specs/mobile-app.md "Native strings follow the interface
// language"): en.json's `app.` keys, written at build time by mobile/ios/scripts/bundle-build.sh
// next to the staged build, never copied by hand. Android's Gradle build makes the same file.
//   node scripts/mobile/native-strings-en.ts <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EN = join(import.meta.dirname, "../../src/i18n/locales/en.json");

/** A locale file's `app.` keys that are strings. */
export function appStrings(locale: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(locale).filter(
      ([key, value]) => key.startsWith("app.") && typeof value === "string",
    ),
  ) as Record<string, string>;
}

if (import.meta.main) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: native-strings-en.ts <out.json>");
  const en = JSON.parse(readFileSync(EN, "utf8")) as Record<string, unknown>;
  writeFileSync(out, JSON.stringify(appStrings(en)));
}
