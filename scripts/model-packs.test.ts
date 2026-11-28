import { describe, expect, it } from "vitest";
import lock from "../src/core/packs/packs.lock.json";
import type { PackLock } from "../src/core/packs/lock";
import { modelPacksFile } from "./model-packs";

const entry = { package: "@langle/x", version: "1", format: 1, files: [] };

describe("modelPacksFile", () => {
  it("lists the lock's model packs only, sorted", () => {
    const packs = {
      "mt-en-ja": { ...entry, kind: "model" },
      en: entry,
      "mt-de-en": { ...entry, kind: "model" },
    } as unknown as PackLock["packs"];
    expect(JSON.parse(modelPacksFile({ packs }))).toEqual([
      "mt-de-en",
      "mt-en-ja",
    ]);
  });

  it("names every model pack of the real lock as mt-<from>-<to>", () => {
    const names = JSON.parse(modelPacksFile(lock as PackLock)) as string[];
    expect(names.length).toBeGreaterThan(0);
    for (const name of names)
      expect(name).toMatch(/^mt-[a-z]{2,3}-[a-z]{2,3}$/);
  });
});
