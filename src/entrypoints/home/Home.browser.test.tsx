import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-preact";
import type { PackStates } from "../../core/packs/state";
import { mergeSettings } from "../../core/settings";
import type {
  Counts,
  PackStatus,
  RecentPage,
  Request,
  SyncStatus,
} from "../../messaging/protocol";
import { listeners, settingsListeners } from "../../testing/stubs";
import { Home, metaLine, sitesOf, videoPicture, type HomeDeps } from "./Home";

const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const SYNC: SyncStatus = {
  enabled: true,
  termsInCloud: false,
  bytesUsed: 1024,
  quotaBytes: 102_400,
  lastSavedAt: NOW - 2 * MINUTE,
  syncedCount: 1,
  localOnlyCount: 0,
  droppedKnownCount: 0,
};

const VIDEO: RecentPage = {
  key: "https://www.youtube.com/watch?v=abc123",
  url: "https://m.youtube.com/watch?v=abc123",
  title: "Baking bread from scratch at home",
  site: "YouTube",
  kind: "video",
  channel: "Home Bakery Club",
  position: 252,
  duration: 570,
  openedAt: NOW - 5 * MINUTE,
  opens: 1,
};

const ARTICLE: RecentPage = {
  key: "https://www.weekendtable.example/patient-bakers",
  url: "https://www.weekendtable.example/patient-bakers",
  title: "Why patient bakers end up with better bread",
  site: "The Weekend Table",
  kind: "page",
  openedAt: NOW - DAY - MINUTE,
  opens: 1,
};

const page = (
  url: string,
  site: string,
  opens: number,
  openedAt = NOW,
): RecentPage => ({
  key: url,
  url,
  title: site,
  site,
  kind: "page",
  openedAt,
  opens,
});

const READY: PackStatus = {
  pair: {
    packs: [
      { pack: "en", size: 100, state: "ready", received: 100, total: 100 },
    ],
  },
  others: [],
};

function fake(
  options: {
    recents?: RecentPage[];
    counts?: Counts;
    sync?: SyncStatus;
    packStatus?: PackStatus;
  } = {},
) {
  const settings = mergeSettings({});
  const settingsWatchers = settingsListeners(settings);
  const packWatchers = listeners<PackStates>();
  const sent: Request[] = [];
  let recents = options.recents ?? [VIDEO, ARTICLE];
  const deps: HomeDeps = {
    send: (async (request: Request) => {
      sent.push(request);
      switch (request.type) {
        case "getSettings":
          return settings;
        case "counts":
          return options.counts ?? { learning: 214, known: 1382, phrases: 47 };
        case "syncStatus":
          return options.sync ?? SYNC;
        case "recentsList":
          return recents.slice(0, request.limit);
        case "packStatus":
          return options.packStatus ?? READY;
        default:
          throw new Error(`unexpected ${request.type}`);
      }
    }) as HomeDeps["send"],
    watchSettings: settingsWatchers.watch,
    watchPackState: packWatchers.watch,
    openPage: vi.fn(),
    openSetup: vi.fn(),
    now: () => NOW,
    refreshMs: 60_000,
  };
  return {
    deps,
    sent,
    setRecents(next: RecentPage[]) {
      recents = next;
    },
  };
}

afterEach(cleanup);

describe("Home", () => {
  it("shows Langle and the pair, the counts and the saved line", async () => {
    const f = fake();
    const screen = await render(<Home deps={f.deps} stage="ready" />);
    await expect
      .element(screen.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Langle");
    await expect.element(screen.getByText("English → Japanese")).toBeVisible();
    const words = screen.getByRole("region", { name: "Your words" });
    await expect
      .poll(() => words.element().textContent)
      .toContain("214Learning1,382Known47Phrases");
    await expect
      .element(screen.getByText("Saved on this phone · 2 minutes ago"))
      .toBeVisible();
    expect(f.sent).toContainEqual({ type: "counts", lang: "en" });
  });

  it("says Not saved yet before the first save", async () => {
    const f = fake({ sync: { ...SYNC, lastSavedAt: undefined } });
    const screen = await render(<Home deps={f.deps} stage="ready" />);
    await expect.element(screen.getByText("Not saved yet")).toBeVisible();
  });

  it("opens what the search field parses: an address or a YouTube search", async () => {
    const f = fake();
    const screen = await render(<Home deps={f.deps} stage="ready" />);
    const search = screen.getByRole("textbox", {
      name: "Search YouTube or enter an address",
    });
    await userEvent.fill(search, "example.com/news");
    await userEvent.keyboard("{Enter}");
    expect(f.deps.openPage).toHaveBeenLastCalledWith(
      "https://example.com/news",
    );
    await expect.element(search).toHaveValue("");
    await userEvent.fill(search, "sourdough starter");
    await userEvent.keyboard("{Enter}");
    expect(f.deps.openPage).toHaveBeenLastCalledWith(
      "https://m.youtube.com/results?search_query=sourdough%20starter",
    );
    await userEvent.fill(search, "  ");
    await userEvent.keyboard("{Enter}");
    expect(f.deps.openPage).toHaveBeenCalledTimes(2);
  });

  it("lists the recent pages under Continue and opens one over Home", async () => {
    const f = fake();
    const screen = await render(<Home deps={f.deps} stage="ready" />);
    const continued = screen.getByRole("region", { name: "Continue" });
    const video = continued.getByRole("link", {
      name: /Baking bread from scratch/,
    });
    await expect
      .poll(() => video.element().textContent)
      .toMatch(/Home Bakery Club · 4:12 of 9:30$/);
    expect(
      continued.getByRole("link", { name: /Why patient bakers/ }).element()
        .textContent,
    ).toMatch(/The Weekend Table · Yesterday$/);
    await video.click();
    expect(f.deps.openPage).toHaveBeenCalledWith(VIDEO.url);
  });

  it("shows no Continue without recent pages, and YouTube alone under Sites", async () => {
    const f = fake({ recents: [] });
    const screen = await render(<Home deps={f.deps} stage="ready" />);
    const sites = screen.getByRole("region", { name: "Sites" });
    await expect.element(sites.getByRole("link")).toHaveTextContent("YouTube");
    expect(screen.getByRole("region", { name: "Continue" }).query()).toBeNull();
    await sites.getByRole("link").click();
    expect(f.deps.openPage).toHaveBeenCalledWith("https://m.youtube.com/");
  });

  it("asks again when it shows again (a page over it closed)", async () => {
    const f = fake({ recents: [] });
    const screen = await render(<Home deps={f.deps} stage="ready" />);
    await expect.element(screen.getByText("YouTube")).toBeVisible();
    f.setRecents([ARTICLE]);
    document.dispatchEvent(new Event("visibilitychange"));
    await expect
      .element(screen.getByRole("region", { name: "Continue" }))
      .toBeVisible();
  });

  it("shows the language data's download", async () => {
    const f = fake({
      packStatus: {
        pair: {
          packs: [
            {
              pack: "en",
              size: 100,
              state: "downloading",
              received: 45,
              total: 100,
            },
          ],
        },
        others: [],
      },
    });
    const screen = await render(<Home deps={f.deps} stage="ready" />);
    await expect
      .element(screen.getByRole("status"))
      .toHaveTextContent("Downloading English data · 45%");
  });

  it("before the setup shows only the way to it", async () => {
    const f = fake();
    const screen = await render(<Home deps={f.deps} stage="consent" />);
    await expect
      .element(screen.getByText("Langle hasn’t started"))
      .toBeVisible();
    expect(screen.getByRole("textbox").query()).toBeNull();
    await screen.getByRole("button", { name: "Review and agree" }).click();
    expect(f.deps.openSetup).toHaveBeenCalledOnce();
    expect(f.sent).toEqual([]);
  });
});

describe("Home's lines", () => {
  it("a video's line is its channel (else its site) and how far it was watched", () => {
    expect(metaLine(VIDEO, NOW)).toBe("Home Bakery Club · 4:12 of 9:30");
    expect(
      metaLine(
        {
          ...VIDEO,
          channel: undefined,
          position: undefined,
          duration: undefined,
        },
        NOW,
      ),
    ).toBe("YouTube");
  });

  it("a page's line is its site and when it was opened, capitalized", () => {
    expect(metaLine(ARTICLE, NOW)).toBe("The Weekend Table · Yesterday");
    expect(metaLine({ ...ARTICLE, openedAt: NOW - 2 * MINUTE }, NOW)).toBe(
      "The Weekend Table · 2 minutes ago",
    );
  });

  it("a YouTube video's picture comes from its id", () => {
    expect(videoPicture(VIDEO.key)).toBe(
      "https://i.ytimg.com/vi/abc123/mqdefault.jpg",
    );
    expect(videoPicture("https://www.example.com/watch?v=abc")).toBeUndefined();
  });

  it("Sites: YouTube, then the hosts of the pages, the most opened first, four in all", () => {
    expect(
      sitesOf([
        VIDEO,
        page("https://www.a.example/1", "Site A", 1),
        page("https://m.b.example/1", "Site B new name", 2),
        page("https://b.example/2", "Site B", 3),
        page("https://c.example/1", "Site C", 4),
        page("https://d.example/1", "Site D", 1),
      ]),
    ).toEqual([
      { name: "YouTube", url: "https://m.youtube.com/" },
      { name: "Site B new name", url: "https://m.b.example/", letter: "B" },
      { name: "Site C", url: "https://c.example/", letter: "C" },
      { name: "Site A", url: "https://www.a.example/", letter: "A" },
    ]);
  });
});
