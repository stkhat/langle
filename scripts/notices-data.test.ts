import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_PACKS, NOTICES_DIR, PACKS } from "./data/formats.ts";
import { noticesData } from "./notices-data.ts";

describe("noticesData", () => {
  const data = noticesData();

  it("lists every pack with its license, changes and every source", () => {
    expect(data.packs.map((pack) => pack.package)).toEqual(
      Object.values(PACKS).map((info) => info.package),
    );
    for (const info of Object.values(PACKS)) {
      const pack = data.packs.find((p) => p.package === info.package)!;
      expect(pack.license).toEqual({
        name: info.license.name,
        url: info.license.url,
      });
      expect(pack.changes).toBe(info.changes);
      expect(pack.sources).toEqual(
        info.sources.map((source) =>
          expect.objectContaining({
            title: source.title,
            url: source.url,
            by: source.by,
            used: source.used,
            license: expect.objectContaining({ name: source.license.name }),
          }),
        ),
      );
    }
  });

  it("carries the full text of every notice a source's license asks for, once", () => {
    const files = new Set(
      Object.values(PACKS).flatMap((info) =>
        info.sources.flatMap((source) =>
          "notice" in source.license && source.license.notice
            ? [source.license.notice]
            : [],
        ),
      ),
    );
    expect(files.size).toBeGreaterThan(0);
    expect(data.notices).toHaveLength(files.size);
    for (const file of files)
      expect(data.notices.map((notice) => notice.text)).toContain(
        readFileSync(join(NOTICES_DIR, file), "utf8").trimEnd(),
      );
  });

  it("lists the translation models in the phone app's build only", () => {
    const models = Object.values(MODEL_PACKS).map((info) => info.package);
    expect(models).toContain("@langle/mt-en-ja");
    const app = noticesData({ models: true });
    expect(app.packs.map((pack) => pack.package)).toEqual([
      ...data.packs.map((pack) => pack.package),
      ...models,
    ]);
    expect(data.packs.map((pack) => pack.package)).not.toContain(models[0]);
    expect(app.notices.map((notice) => notice.title)).toContain("MPL 2.0");
  });
});
