import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localeCodes, localeFiles, localesPlugin } from "./locales";

/** A locales folder with English and Japanese. */
function folder() {
  const dir = mkdtempSync(join(tmpdir(), "langle-locales-"));
  writeFileSync(join(dir, "en.json"), '{\n  "app.name": "Langle"\n}\n');
  writeFileSync(join(dir, "ja.json"), '{\n  "app.name": "ラングル"\n}\n');
  writeFileSync(join(dir, "notes.txt"), "not a locale");
  return dir;
}

describe("the locale files in the build", () => {
  it("are every locale but English, at locales/<code>.json, without spacing", () => {
    const dir = folder();
    expect(localeCodes(dir)).toEqual(["en", "ja"]);
    expect(localeFiles(dir)).toEqual([
      { relativeDest: "locales/ja.json", contents: '{"app.name":"ラングル"}' },
    ]);
  });

  it("name the locales in virtual:langle-locales", () => {
    const plugin = localesPlugin(folder());
    const resolve = plugin.resolveId as (id: string) => string | undefined;
    const load = plugin.load as (id: string) => string | undefined;
    const id = resolve("virtual:langle-locales")!;
    expect(load(id)).toBe('export default ["en","ja"];');
    expect(resolve("./other")).toBeUndefined();
  });
});

describe("the store listing", () => {
  it("has English's name and summary, which the manifest reads", () => {
    const listing = JSON.parse(
      readFileSync(
        join(import.meta.dirname, "../public/_locales/en/messages.json"),
        "utf8",
      ),
    ) as Record<string, { message: string }>;
    expect(listing.name!.message).toBe("Langle");
    expect(listing.description!.message.length).toBeLessThanOrEqual(132);
  });
});
