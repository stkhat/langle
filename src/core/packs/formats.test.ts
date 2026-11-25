import { describe, expect, it } from "vitest";
import { PACK_FORMATS } from "./formats";
import { MODEL_FORMAT } from "./model-manifest";
import lockFile from "./packs.lock.json";
import type { PackLock } from "./lock";

// A reader change bumps PACK_FORMATS; the data then has to be built and published again
// in the new format (npm run data:publish), or this fails.
describe("PACK_FORMATS", () => {
  const entries = Object.entries((lockFile as PackLock).packs);
  it("is the format of every data pack in the lock", () => {
    expect(PACK_FORMATS).toEqual(
      Object.fromEntries(
        entries
          .filter(([, entry]) => entry.kind === undefined)
          .map(([name, entry]) => [name, entry.format]),
      ),
    );
  });
  it("leaves model packs to MODEL_FORMAT", () => {
    const models = entries.filter(([, entry]) => entry.kind === "model");
    expect(models.map(([name]) => name)).toContain("mt-en-ja");
    for (const [, entry] of models) expect(entry.format).toBe(MODEL_FORMAT);
  });
});
