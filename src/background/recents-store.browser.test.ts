import { beforeEach, describe, expect, it } from "vitest";
import type { RecentVisit } from "../messaging/protocol";
import { fakeClock } from "../testing/clock";
import { freshDb } from "../testing/db";
import type { LangleDb } from "./db";
import { createRecentsStore, type RecentsStore } from "./recents-store";

const ARTICLE: RecentVisit = {
  url: "https://Example.com/bread?utm_source=x#top",
  title: "Why patient bakers end up with better bread",
  site: "The Weekend Table",
  kind: "page",
};
const VIDEO: RecentVisit = {
  url: "https://m.youtube.com/watch?v=abc123&pp=x",
  title: "Baking bread from scratch at home",
  site: "YouTube",
  kind: "video",
};

let db: LangleDb;
let clock: ReturnType<typeof fakeClock>;
let recents: RecentsStore;

beforeEach(() => {
  db = freshDb();
  clock = fakeClock();
  recents = createRecentsStore(db, { now: clock.now, limit: 3 });
});

describe("recents", () => {
  it("keeps a page by its normalized URL, with the address it was opened at", async () => {
    await recents.visit(ARTICLE);
    expect(await recents.list(10)).toEqual([
      {
        key: "https://example.com/bread",
        url: ARTICLE.url,
        title: ARTICLE.title,
        site: ARTICLE.site,
        kind: "page",
        openedAt: clock.time,
        opens: 1,
      },
    ]);
  });

  it("counts a page opened again once, as the newest, with its new title", async () => {
    await recents.visit(ARTICLE);
    clock.tick();
    await recents.visit(VIDEO);
    clock.tick();
    await recents.visit({
      ...ARTICLE,
      url: "https://example.com/bread",
      title: "Patient bakers",
    });
    const [first, second] = await recents.list(10);
    expect(first).toMatchObject({
      key: "https://example.com/bread",
      url: "https://example.com/bread",
      title: "Patient bakers",
      opens: 2,
      openedAt: clock.time,
    });
    expect(second?.key).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("moves a video visited before, which becomes the newest, and keeps its place when it is opened again", async () => {
    await recents.visit(VIDEO);
    clock.tick();
    await recents.visit(ARTICLE);
    clock.tick();
    await recents.progress({
      url: "https://www.youtube.com/watch?v=abc123",
      position: 252,
      duration: 570,
      title: "Baking bread at home",
      channel: "Home Bakery Club",
    });
    expect((await recents.list(10))[0]).toMatchObject({
      key: "https://www.youtube.com/watch?v=abc123",
      title: "Baking bread at home",
      channel: "Home Bakery Club",
      position: 252,
      duration: 570,
      openedAt: clock.time,
      opens: 1,
    });

    await recents.visit(VIDEO);
    expect((await recents.list(1))[0]).toMatchObject({
      title: VIDEO.title,
      channel: "Home Bakery Club",
      position: 252,
      opens: 2,
    });
  });

  it("leaves alone the progress of a video never visited", async () => {
    await recents.progress({ url: VIDEO.url, position: 3, duration: 9 });
    expect(await recents.list(10)).toEqual([]);
  });

  it("keeps only the newest pages, and lists as many as asked", async () => {
    for (const n of [1, 2, 3, 4]) {
      clock.tick();
      await recents.visit({ ...ARTICLE, url: `https://example.com/${n}` });
    }
    expect((await recents.list(10)).map((page) => page.key)).toEqual([
      "https://example.com/4",
      "https://example.com/3",
      "https://example.com/2",
    ]);
    expect(await recents.list(1)).toHaveLength(1);
  });
});
