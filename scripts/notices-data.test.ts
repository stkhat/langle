import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AD_BLOCKING_NOTICES } from "./data/ad-blocking.ts";
import { MODEL_PACKS, NOTICES_DIR, PACKS } from "./data/formats.ts";
import { adblockVersion } from "./licenses.ts";
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
    const app = noticesData({ app: true });
    expect(app.packs.map((pack) => pack.package)).toEqual([
      ...data.packs.map((pack) => pack.package),
      ...models,
    ]);
    expect(data.packs.map((pack) => pack.package)).not.toContain(models[0]);
    expect(app.notices.map((notice) => notice.title)).toContain("MPL 2.0");
  });

  it("credits every filter list the phone app downloads, and its engine, in the app's build only", () => {
    expect(data.adBlocking).toBeUndefined();
    const { adBlocking } = noticesData({ app: true });
    expect(adBlocking?.lists.map((list) => list.title)).toEqual([
      "EasyList",
      "EasyPrivacy",
      "uBlock filters",
    ]);
    const lists = (
      JSON.parse(
        readFileSync(
          new URL("../mobile/protocol/filter-lists.json", import.meta.url),
          "utf8",
        ),
      ) as { lists: { id: string; home: string }[] }
    ).lists;
    // Every list the shells fetch is credited once, under its own home.
    const credited = AD_BLOCKING_NOTICES.lists.flatMap((notice) =>
      notice.ids.map((id) => [id, notice.url]),
    );
    expect(credited.map(([id]) => id).sort()).toEqual(
      lists.map((list) => list.id).sort(),
    );
    for (const [id, url] of credited)
      expect(lists.find((list) => list.id === id)?.home).toBe(url);
    for (const list of adBlocking!.lists) {
      expect(list.license.url).toMatch(/^https:\/\//);
      expect(list.used).not.toBe("");
    }
    expect(adBlocking!.engine).toMatchObject({
      title: `adblock-rust ${adblockVersion()}`,
      url: "https://github.com/brave/adblock-rust",
      license: { name: "MPL 2.0" },
    });
    expect(adblockVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
