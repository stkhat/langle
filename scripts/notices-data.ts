import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NoticeSource, NoticesData } from "../src/core/notices.ts";
import { AD_BLOCKING_NOTICES } from "./data/ad-blocking.ts";
import { MODEL_PACKS, NOTICES_DIR, PACKS } from "./data/formats.ts";

interface CreditedSource {
  title: string;
  url: string;
  via?: string;
  by: string;
  license: { name: string; url?: string; notice?: string };
  used: string;
}

/**
 * What the extension's data sources and licenses page lists: every pack with its
 * license, changes and sources (as `scripts/data/formats.ts` records them for the npm
 * packages), and the full text of each notice a source's license asks every copy to
 * carry, once. The phone app's build (`app`) also lists the translation models its
 * on-device translator downloads, and its ad blocking's filter lists and engine
 * (`scripts/data/ad-blocking.ts`).
 */
export function noticesData({ app = false } = {}): NoticesData {
  const notices = new Map<string, { title: string; text: string }>();
  const credit = (source: CreditedSource): NoticeSource => {
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
  };
  const listed = [
    ...Object.values(PACKS),
    ...(app ? Object.values(MODEL_PACKS) : []),
  ];
  const packs = listed.map((info) => ({
    package: info.package,
    title: info.title,
    license: { name: info.license.name, url: info.license.url },
    changes: info.changes,
    sources: info.sources.map(credit),
  }));
  const { lists, engine } = AD_BLOCKING_NOTICES;
  return {
    packs,
    ...(app && {
      adBlocking: {
        lists: lists.map(credit),
        engine: credit({
          ...engine,
          title: `${engine.title} ${engine.version}`,
        }),
      },
    }),
    notices: [...notices.values()],
  };
}
