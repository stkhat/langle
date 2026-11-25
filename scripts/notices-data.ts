import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NoticesData } from "../src/core/notices.ts";
import { MODEL_PACKS, NOTICES_DIR, PACKS } from "./data/formats.ts";

/**
 * What the extension's data sources and licenses page lists: every pack with its
 * license, changes and sources (as `scripts/data/formats.ts` records them for the npm
 * packages), and the full text of each notice a source's license asks every copy to
 * carry, once. The phone app's build also lists the translation models its on-device
 * translator downloads (`models`).
 */
export function noticesData({ models = false } = {}): NoticesData {
  const notices = new Map<string, { title: string; text: string }>();
  const listed = [
    ...Object.values(PACKS),
    ...(models ? Object.values(MODEL_PACKS) : []),
  ];
  const packs = listed.map((info) => ({
    package: info.package,
    title: info.title,
    license: { name: info.license.name, url: info.license.url },
    changes: info.changes,
    sources: info.sources.map((source) => {
      const { notice } = source.license;
      if (notice && !notices.has(notice))
        notices.set(notice, {
          title: source.license.name,
          text: readFileSync(join(NOTICES_DIR, notice), "utf8").trimEnd(),
        });
      return {
        title: source.title,
        url: source.url,
        ...(source.via !== undefined && { via: source.via }),
        by: source.by,
        license: {
          name: source.license.name,
          ...(source.license.url !== undefined && { url: source.license.url }),
        },
        used: source.used,
      };
    }),
  }));
  return { packs, notices: [...notices.values()] };
}
