import { normalizeUrl } from "../core/url";
import type {
  RecentPage,
  RecentProgress,
  RecentVisit,
} from "../messaging/protocol";
import type { LangleDb } from "./db";

/**
 * The phone app's recent pages (`recents`, mobile-app.md "Home"), for Home's Continue
 * and Sites. One row per normalized URL; only the newest `limit` are kept. The
 * background creates it only where `appHost` exists.
 */
export interface RecentsStore {
  /** The page was opened: it is the newest, opened once more. */
  visit(page: RecentVisit): Promise<void>;
  /**
   * A video visited before plays at `position`: it is the newest again (it was shown
   * again without a load). A video never visited is left alone.
   */
  progress(progress: RecentProgress): Promise<void>;
  /** Newest first. */
  list(limit: number): Promise<RecentPage[]>;
}

export interface RecentsStoreOptions {
  /** Most rows kept. */
  limit?: number;
  now?: () => number;
}

/** The default `limit` (spec: "at most 50 pages"). */
export const RECENTS_LIMIT = 50;

export function createRecentsStore(
  db: LangleDb,
  { limit = RECENTS_LIMIT, now = Date.now }: RecentsStoreOptions = {},
): RecentsStore {
  return {
    async visit(page) {
      const key = normalizeUrl(page.url);
      await db.transaction("rw", db.recents, async () => {
        const before = await db.recents.get(key);
        await db.recents.put({
          ...before,
          key,
          url: page.url,
          title: page.title,
          site: page.site,
          kind: page.kind,
          openedAt: now(),
          opens: (before?.opens ?? 0) + 1,
        });
        const extra = (await db.recents.count()) - limit;
        if (extra > 0)
          await db.recents.orderBy("openedAt").limit(extra).delete();
      });
    },

    async progress({ url, position, duration, title, channel }) {
      await db.recents.update(normalizeUrl(url), {
        position,
        duration,
        openedAt: now(),
        ...(title && { title }),
        ...(channel && { channel }),
      });
    },

    list: (count) =>
      db.recents.orderBy("openedAt").reverse().limit(count).toArray(),
  };
}
