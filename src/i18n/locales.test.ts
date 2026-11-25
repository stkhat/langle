// The locale files a translator writes, checked against English's (architecture
// "Interface language"): the same keys, the same placeholders, the language's own plural
// forms, and the store listing beside them.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localeCodes, LOCALES_DIR } from "../../scripts/locales";
import { nativeLanguage } from "../core/natives";
import en from "./locales/en.json";

type Value = string | Record<string, string>;

const read = (code: string) =>
  JSON.parse(readFileSync(join(LOCALES_DIR, `${code}.json`), "utf8")) as Record<
    string,
    Value
  >;

/** The `{name}` placeholders of a text. */
const placeholders = (text: string) =>
  new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!));

/** The text whose placeholders a message must have: the string, or its `other` form. */
const main = (value: Value) =>
  typeof value === "string" ? value : (value.other ?? "");

/** What is wrong with one message of `code` against English's. */
function problems(code: string, key: string, value: unknown): string[] {
  const english = (en as Record<string, Value>)[key]!;
  const wanted = [...placeholders(main(english))].sort();
  const found: string[] = [];
  if (typeof value === "string") {
    if (value.trim() === "") found.push("is empty");
  } else if (typeof value === "object" && value !== null) {
    const forms = value as Record<string, unknown>;
    const categories = new Intl.PluralRules(code).resolvedOptions()
      .pluralCategories as string[];
    if (!wanted.includes("count"))
      found.push("has plural forms but no {count}");
    if (typeof forms.other !== "string") found.push("has no other form");
    for (const [category, form] of Object.entries(forms)) {
      if (!categories.includes(category))
        found.push(
          `has a form ${category}, not one of ${categories.join(" ")}`,
        );
      if (typeof form !== "string" || form.trim() === "")
        found.push(`has an empty ${category} form`);
      else
        for (const name of placeholders(form))
          if (!wanted.includes(name))
            found.push(`has {${name}} in ${category}`);
    }
  } else found.push("is neither text nor plural forms");
  if (typeof value === "string" || typeof value === "object") {
    const have = [...placeholders(main(value as Value))].sort();
    if (have.join() !== wanted.join())
      found.push(`has {${have.join("} {")}} for {${wanted.join("} {")}}`);
  }
  return found.map((problem) => `${code} ${key} ${problem}`);
}

/** The store's name for the locale of a native language: Chrome's `_locales` folder. */
const STORE_FOLDER: Readonly<Record<string, string>> = {
  pt: "pt_BR",
  zh: "zh_CN",
};
const storeFolder = (code: string) => STORE_FOLDER[code] ?? code;
const STORE_DIR = join(import.meta.dirname, "../../public/_locales");

describe.each(localeCodes())("locale %s", (code) => {
  const messages = read(code);

  it("is a native language's", () => {
    expect(nativeLanguage(code)).toBeDefined();
  });

  it("has exactly English's keys", () => {
    const keys = Object.keys(messages);
    const english = Object.keys(en);
    expect(english.filter((key) => !keys.includes(key))).toEqual([]);
    expect(keys.filter((key) => !english.includes(key))).toEqual([]);
  });

  it("has English's placeholders and its own plural forms", () => {
    expect(
      Object.entries(messages).flatMap(([key, value]) =>
        Object.hasOwn(en, key) ? problems(code, key, value) : [],
      ),
    ).toEqual([]);
  });

  it("has the store listing", () => {
    const path = join(STORE_DIR, storeFolder(code), "messages.json");
    expect(existsSync(path)).toBe(true);
    const listing = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      { message?: unknown }
    >;
    expect(listing.name?.message).toBe("Langle");
    const description = listing.description?.message;
    expect(typeof description).toBe("string");
    // The store's limit for the summary.
    expect((description as string).length).toBeLessThanOrEqual(132);
    expect(Object.keys(listing).sort()).toEqual(["description", "name"]);
  });
});

describe("the store listings", () => {
  it("are each a locale's", () => {
    const folders = localeCodes().map(storeFolder);
    expect(
      readdirSync(STORE_DIR).filter((folder) => !folders.includes(folder)),
    ).toEqual([]);
  });
});

describe("the checks", () => {
  it("catch a missing placeholder, a wrong plural form and an empty text", () => {
    expect(problems("ja", "dict.sentences", "文")).toEqual([
      "ja dict.sentences has {} for {count}",
    ]);
    expect(
      problems("ja", "dict.sentences", {
        one: "{count}文",
        other: "{count}文",
      }),
    ).toEqual(["ja dict.sentences has a form one, not one of other"]);
    expect(
      problems("ru", "dict.sentences", {
        one: "{count} предложение",
        few: "{count} {n}",
      }),
    ).toEqual([
      "ru dict.sentences has no other form",
      "ru dict.sentences has {n} in few",
      "ru dict.sentences has {} for {count}",
    ]);
    expect(problems("de", "app.name", " ")).toEqual(["de app.name is empty"]);
    expect(problems("de", "app.name", { other: "Langle" })).toEqual([
      "de app.name has plural forms but no {count}",
    ]);
  });

  it("let a form other than other leave the number out (Arabic's two)", () => {
    expect(
      problems("ar", "dict.sentences", {
        zero: "لا جمل",
        one: "جملة واحدة",
        two: "جملتان",
        few: "{count} جمل",
        many: "{count} جملة",
        other: "{count} جملة",
      }),
    ).toEqual([]);
  });
});
