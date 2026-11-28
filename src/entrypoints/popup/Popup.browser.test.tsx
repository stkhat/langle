import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-preact";
import type {
  CloudStatus,
  Counts,
  PackStatus,
  Request,
  SyncStatus,
} from "../../messaging/protocol";
import type { PackState, PackStates } from "../../core/packs/state";
import type { SupportLinks } from "../../core/links";
import { mergeSettings, type Settings } from "../../core/settings";
import type { PageRequest, PageSummary } from "../../messaging/page-protocol";
import type { SyncPlace } from "../../core/browser-env";
import { Popup, type PopupDeps, type SiteAccessDeps } from "./Popup";
import { heldWrites, listeners, settingsListeners } from "../../testing/stubs";
import { fixedTouchMode } from "../../testing/touch";
import { page, userEvent } from "vitest/browser";

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const ARTICLE: PageSummary = {
  supported: true,
  hostname: "theweekendtable.example",
  scope: "page",
  unsaved: 46,
  done: null,
};

const SYNC: SyncStatus = {
  enabled: true,
  termsInCloud: false,
  bytesUsed: 41 * 1024,
  quotaBytes: 102_400,
  lastSavedAt: NOW - 2 * MINUTE,
  syncedCount: 10,
  localOnlyCount: 0,
  droppedKnownCount: 0,
};

/** Connected to Google Drive, saved 2 minutes ago. */
const CONNECTED: CloudStatus = {
  available: ["googleDrive"],
  provider: "googleDrive",
  lastSavedAt: NOW - 2 * MINUTE,
  lastCheckedAt: NOW - MINUTE,
  bytes: 1.4 * 1024 * 1024,
  devices: 3,
};

interface FakeOptions {
  settings?: Partial<Settings>;
  /** What the active tab answers; undefined when nothing answers. */
  page?: PageSummary;
  counts?: Counts;
  sync?: SyncStatus;
  /** What `cloudStatus` answers first (default: a build with no provider). */
  cloud?: CloudStatus;
  refreshMs?: number;
  /** What `packStatus` answers for the settings (default: `JAPANESE`). */
  packStatus?: (settings: Settings) => PackStatus;
  /** The footer's links (default: none set). */
  links?: Partial<SupportLinks>;
  /** Where the data is kept (default: Chrome sync). */
  place?: SyncPlace;
  /** The page is in touch mode: the phone layout. */
  phone?: boolean;
  /** The phone app can sign in to Google (default: no). */
  googleAuth?: boolean;
  /** Chrome's per-site access on the active tab (default: none, as in the phone app). */
  access?: FakeAccess;
}

interface FakeAccess {
  /** The tab's host (default: the article's). */
  host?: string;
  granted?: boolean;
  seen?: string[];
  /** The page's `<html lang>`, or the probe fails (default: "en"). */
  lang?: string | Error;
  /** One of the manifest's own hosts (the video sites). */
  static?: boolean;
  /** Chrome's prompt is answered Allow (default: it never settles, as the popup closes). */
  allow?: boolean;
  /** Chrome refuses to remove the grant (the manifest makes it). */
  required?: boolean;
}

const TAB_ID = 7;

/** A fake of Chrome's per-site access; `log` lists what was asked of it, in order. */
function fakeAccess(options: FakeAccess, log: string[]): SiteAccessDeps {
  let granted = options.granted ?? false;
  const seen = [...(options.seen ?? [])];
  return {
    activeTab: async () => ({
      tabId: TAB_ID,
      host: options.host ?? ARTICLE.hostname,
    }),
    async probeLang(tabId) {
      log.push(`probe ${tabId}`);
      const lang = options.lang ?? "en";
      if (lang instanceof Error) throw lang;
      return lang;
    },
    staticHost: () => options.static ?? false,
    granted: async () => granted,
    request(host) {
      log.push(`request ${host}`);
      if (!options.allow) return new Promise(() => {});
      granted = true;
      return Promise.resolve(true);
    },
    async remove(host) {
      log.push(`remove ${host}`);
      if (options.required)
        throw new Error("You cannot remove required permissions.");
      granted = false;
      return true;
    },
    seenHosts: async () => [...seen],
    async addSeen(host) {
      log.push(`seen ${host}`);
      seen.push(host);
    },
  };
}

const readyPack = (pack: string, size: number) =>
  ({ pack, size, state: "ready", received: size, total: size }) as const;

/** The default pair's packs (English → Japanese), downloaded. */
const JAPANESE: PackStatus = {
  pair: {
    packs: [
      readyPack("en", 6_500_000),
      readyPack("en-ja", 7_700_000),
      readyPack("en-defs", 20_500_000),
    ],
  },
  others: [],
};

/** The Spanish pair's packs, downloaded, in these states. */
const spanish = (es: PackState, esEn: PackState): PackStatus => ({
  pair: {
    packs: [
      { pack: "es", size: 3_000_000, ...es },
      { pack: "es-en", size: 3_500_000, ...esEn },
    ],
  },
  others: [],
});

/** A background, settings storage and active tab behind the popup. */
function fake(options: FakeOptions = {}) {
  let settings = mergeSettings(options.settings ?? {});
  let page = options.page;
  let counts = options.counts ?? { learning: 128, known: 2341, phrases: 37 };
  let cloud: CloudStatus = options.cloud ?? {
    available: [],
    bytes: 0,
    devices: 0,
  };
  const settingsWatchers = settingsListeners(settings);
  const packWatchers = listeners<PackStates>();
  const sent: Request[] = [];
  const asked: PageRequest[] = [];
  const log: string[] = [];
  const deps: PopupDeps = {
    send: (async (request: Request) => {
      sent.push(request);
      switch (request.type) {
        case "siteAccessPending":
          log.push(`pending ${request.tabId} ${request.host}`);
          return null;
        case "getSettings":
          return settings;
        case "setSettings":
          settings = mergeSettings(request.patch, settings);
          settingsWatchers.emit(settings);
          return settings;
        case "counts":
          return counts;
        case "syncStatus":
          return options.sync ?? SYNC;
        case "cloudStatus":
          return cloud;
        case "cloudCheck":
          return null;
        case "cloudConnect":
          cloud = { ...CONNECTED, provider: request.provider };
          return null;
        case "packStatus":
          return options.packStatus?.(settings) ?? JAPANESE;
        case "retryPacks":
          return null;
        default:
          throw new Error(`unexpected ${request.type}`);
      }
    }) as PopupDeps["send"],
    async askPage(request) {
      asked.push(request);
      if (!page) return undefined;
      if (request.type === "pageSaveAll") {
        counts = { ...counts, [request.status]: counts[request.status] + 46 };
        page = {
          ...page,
          unsaved: 0,
          done: { count: page.unsaved, target: request.status },
        };
      } else if (request.type === "pageUndo" && page.done) {
        counts = {
          ...counts,
          [page.done.target]: counts[page.done.target] - page.done.count,
        };
        page = { ...page, unsaved: page.done.count, done: null };
      }
      return page;
    },
    watchSettings: settingsWatchers.watch,
    watchPackState: packWatchers.watch,
    sync: options.place ?? { kind: "browser", browser: "Chrome" },
    appGoogleAuth: options.googleAuth ?? false,
    ...(options.phone && { touch: fixedTouchMode(true) }),
    links: {
      coffee: "",
      feedback: "",
      sponsor: "",
      review: "",
      ...options.links,
    },
    openTab: vi.fn(),
    openOptions: vi.fn(),
    openWordList: vi.fn(),
    close: vi.fn(),
    now: () => NOW,
    refreshMs: options.refreshMs ?? 60_000,
    ...(options.access && { siteAccess: fakeAccess(options.access, log) }),
  };
  return {
    deps,
    sent,
    asked,
    log,
    settings: () => settings,
    setPage(next: PageSummary | undefined) {
      page = next;
    },
    /** A change made elsewhere (another page, another device). */
    changeSettings(patch: Partial<Settings>) {
      settings = mergeSettings(patch, settings);
      settingsWatchers.emit(settings);
    },
    /** The background writes `packState`. */
    setPackStates(states: PackStates) {
      packWatchers.emit(states);
    },
    packWatchers: packWatchers.count,
  };
}

/** Makes `cloudConnect` wait (Google's window is open); returns what lets it go on. */
function holdConnect(deps: PopupDeps): () => void {
  let release = () => {};
  const send = deps.send;
  deps.send = (async (request: Request) => {
    if (request.type === "cloudConnect")
      await new Promise<void>((resolve) => (release = resolve));
    return send(request as never);
  }) as PopupDeps["send"];
  return () => release();
}

afterEach(cleanup);

const siteSwitch = (screen: Awaited<ReturnType<typeof render>>) =>
  screen.getByRole("switch", { name: "Use Langle on this site" });

describe("Popup", () => {
  it("shows the header, the word counts and the highlight chips from the settings", async () => {
    const f = fake({ page: ARTICLE });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(screen.getByText("Langle")).toBeVisible();
    await expect.element(screen.getByText("English → Japanese")).toBeVisible();
    await expect.element(screen.getByText("2,341")).toBeVisible();
    await expect.element(screen.getByText("128")).toBeVisible();
    await expect.element(screen.getByText("37")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "Learning" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(screen.getByRole("button", { name: "New" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the last change while the one before it is stored", async () => {
    const f = fake();
    const writes = heldWrites(f.deps.send);
    const screen = await render(
      <Popup deps={{ ...f.deps, send: writes.send }} />,
    );
    const chip = screen.getByRole("button", { name: "New" });
    await expect.element(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect.element(chip).toHaveAttribute("aria-pressed", "true");
    await chip.click();
    await expect.element(chip).toHaveAttribute("aria-pressed", "false");

    await writes.storeNext();
    expect(chip.element().getAttribute("aria-pressed")).toBe("false");
    await writes.storeNext();
    expect(chip.element().getAttribute("aria-pressed")).toBe("false");
    expect(f.settings().highlight.new).toBe(false);
  });

  it("shows the language pair and counts the words of the learning language", async () => {
    const f = fake({ settings: { learningLang: "es", nativeLang: "en" } });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(screen.getByText("Spanish → English")).toBeVisible();
    await expect.element(screen.getByText("2,341")).toBeVisible();
    expect(f.sent.filter((r) => r.type === "counts")).toEqual([
      { type: "counts", lang: "es" },
    ]);
  });

  it("switches highlight categories in the settings", async () => {
    const f = fake({ page: ARTICLE });
    const screen = await render(<Popup deps={f.deps} />);
    await screen.getByRole("button", { name: "New" }).click();
    await expect
      .element(screen.getByRole("button", { name: "New" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(f.settings().highlight.new).toBe(true);
  });

  it("follows settings changed elsewhere", async () => {
    const f = fake({ page: ARTICLE });
    const screen = await render(<Popup deps={f.deps} />);
    await expect
      .element(screen.getByRole("button", { name: "Known" }))
      .toHaveAttribute("aria-pressed", "false");
    f.changeSettings({
      highlight: { new: false, learning: true, known: true },
    });
    await expect
      .element(screen.getByRole("button", { name: "Known" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  describe("Langle switch", () => {
    const langleSwitch = (screen: Awaited<ReturnType<typeof render>>) =>
      screen.getByRole("switch", { name: "Use Langle", exact: true });

    it("sits in the header, after the settings button", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(langleSwitch(screen)).toBeChecked();
      const gear = screen.getByRole("button", { name: "Open settings" });
      expect(
        gear.element().compareDocumentPosition(langleSwitch(screen).element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        langleSwitch(screen)
          .element()
          .compareDocumentPosition(siteSwitch(screen).element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("switches Langle off everywhere, leaving only the header and sync, and back on", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("2,341")).toBeVisible();

      await langleSwitch(screen).click();
      await expect.element(langleSwitch(screen)).not.toBeChecked();
      expect(f.settings().enabled).toBe(false);
      await expect.element(siteSwitch(screen)).not.toBeInTheDocument();
      await expect
        .element(screen.getByRole("button", { name: "Learning" }))
        .not.toBeInTheDocument();
      await expect.element(screen.getByText("2,341")).not.toBeInTheDocument();
      await expect
        .element(screen.getByText("This page"))
        .not.toBeInTheDocument();
      await expect
        .element(screen.getByText("Saved to Chrome sync · 2 minutes ago"))
        .toBeVisible();
      await expect
        .element(screen.getByText("English → Japanese"))
        .toBeVisible();

      await langleSwitch(screen).click();
      await expect.element(langleSwitch(screen)).toBeChecked();
      expect(f.settings().enabled).toBe(true);
      await expect.element(siteSwitch(screen)).toBeVisible();
      await expect.element(screen.getByText("2,341")).toBeVisible();
    });

    it("hides the language data line while off", async () => {
      const f = fake({
        settings: { learningLang: "es", nativeLang: "en", enabled: false },
        packStatus: () =>
          spanish(
            { state: "downloading", received: 0, total: 3_000_000 },
            { state: "downloading", received: 0, total: 3_500_000 },
          ),
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(langleSwitch(screen)).not.toBeChecked();
      await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
    });

    it("follows a switch made elsewhere", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(langleSwitch(screen)).toBeChecked();
      f.changeSettings({ enabled: false });
      await expect.element(langleSwitch(screen)).not.toBeChecked();
      await expect.element(siteSwitch(screen)).not.toBeInTheDocument();
    });
  });

  describe("On this site", () => {
    it("shows the tab's host and switches Langle off and on for it", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("theweekendtable.example"))
        .toBeVisible();
      await expect.element(siteSwitch(screen)).toBeChecked();

      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      expect(f.settings().disabledSites).toEqual(["theweekendtable.example"]);

      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).toBeChecked();
      expect(f.settings().disabledSites).toEqual([]);
    });

    it("is off when a parent domain is switched off, and switching on removes that entry", async () => {
      const f = fake({
        page: { ...ARTICLE, supported: false, hostname: "www.example.com" },
        settings: { disabledSites: ["other.org", "example.com"] },
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).toBeChecked();
      expect(f.settings().disabledSites).toEqual(["other.org"]);
    });

    it("is hidden, with This page, when nothing in the tab answers (no per-site access)", async () => {
      const f = fake({ page: undefined });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("2,341")).toBeVisible();
      expect(screen.getByText("On this site").query()).toBeNull();
      expect(screen.getByText("This page").query()).toBeNull();
    });
  });

  describe("On this site, site by site", () => {
    const ASK = "Turn this on to use Langle here.";
    const host = ARTICLE.hostname;
    const ring = (screen: Awaited<ReturnType<typeof render>>) =>
      getComputedStyle(siteSwitch(screen).element()).boxShadow;

    it("on the first opening on a page in the learning language, rings the switch and says what it does", async () => {
      const f = fake({ access: {} });
      const screen = await render(<Popup deps={f.deps} />);
      const bubble = screen.getByRole("status").filter({ hasText: ASK });
      await expect.element(bubble).toBeVisible();
      await expect.element(screen.getByText(host)).toBeVisible();
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      await expect.element(siteSwitch(screen)).toHaveAccessibleDescription(ASK);
      expect(ring(screen)).toContain("rgb(247, 103, 7)");
      // Under the row, its tail pointing up at the switch.
      const row = siteSwitch(screen).element().getBoundingClientRect();
      const box = bubble.element().getBoundingClientRect();
      expect(box.top).toBeGreaterThan(row.bottom);
      expect(getComputedStyle(bubble.element()).fontFamily).toContain("Nunito");
      expect(screen.getByText("This page").query()).toBeNull();
      await expect.element(screen.getByText("2,341")).toBeVisible();
      await expect
        .poll(() => f.log)
        .toEqual([`probe ${TAB_ID}`, `seen ${host}`]);
    });

    it("shows the row plain on the first opening on a page in another language", async () => {
      const f = fake({ access: { lang: "ja" } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      await expect.poll(() => f.log).toContain(`seen ${host}`);
      expect(screen.getByText(ASK).query()).toBeNull();
      expect(ring(screen)).toBe("none");
    });

    it("shows the switch off without the bubble once the host was seen", async () => {
      const f = fake({ access: { seen: [host] } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      expect(screen.getByText(ASK).query()).toBeNull();
      expect(ring(screen)).toBe("none");
      expect(f.log).not.toContain(`seen ${host}`);
    });

    it("hides the row where the probe fails (the store, error pages), and decides nothing", async () => {
      const f = fake({
        access: {
          lang: new Error("The extensions gallery cannot be scripted."),
        },
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.poll(() => f.log).toContain(`probe ${TAB_ID}`);
      await expect.element(screen.getByText("2,341")).toBeVisible();
      expect(screen.getByText("On this site").query()).toBeNull();
      expect(f.log).toEqual([`probe ${TAB_ID}`]);
    });

    it("turning it on tells the background the tab, then asks Chrome, in the same click", async () => {
      const f = fake({
        access: { allow: true },
        settings: { disabledSites: [host, "other.org"] },
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText(ASK)).toBeVisible();
      await siteSwitch(screen).click();
      expect(f.log.slice(-2)).toEqual([
        `pending ${TAB_ID} ${host}`,
        `request ${host}`,
      ]);
      expect(f.settings().disabledSites).toEqual(["other.org"]);
      // Allowed while the popup is still open: the switch follows.
      await expect.element(siteSwitch(screen)).toBeChecked();
      expect(screen.getByText(ASK).query()).toBeNull();
    });

    it("stays off, with no message, while Chrome's prompt is open", async () => {
      const f = fake({ access: {} });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText(ASK)).toBeVisible();
      await siteSwitch(screen).click();
      await expect.poll(() => f.log).toContain(`request ${host}`);
      await expect.element(siteSwitch(screen)).not.toBeChecked();
    });

    it("is on where the host has a grant, with This page; off gives the grant back", async () => {
      const f = fake({ access: { granted: true }, page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(siteSwitch(screen)).toBeChecked();
      await expect.element(screen.getByText("This page")).toBeVisible();
      expect(screen.getByText(ASK).query()).toBeNull();

      f.setPage(undefined);
      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      expect(f.log).toContain(`remove ${host}`);
      expect(f.settings().disabledSites).toEqual([]);
      // The page gave its page back: the row stays, off, plain.
      await expect.element(screen.getByText(host)).toBeVisible();
      expect(screen.getByText(ASK).query()).toBeNull();
    });

    it("keeps a grant Chrome will not remove off through the off list, and back on", async () => {
      const f = fake({
        access: { granted: true, required: true },
        page: ARTICLE,
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(siteSwitch(screen)).toBeChecked();
      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      expect(f.settings().disabledSites).toEqual([host]);

      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).toBeChecked();
      expect(f.settings().disabledSites).toEqual([]);
      expect(f.log.filter((e) => e.startsWith("request"))).toEqual([]);
    });

    it("is off where the off list covers a granted host; on takes it off the list without a prompt", async () => {
      const f = fake({
        access: { granted: true },
        page: { ...ARTICLE, supported: false },
        settings: { disabledSites: [host] },
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).toBeChecked();
      expect(f.settings().disabledSites).toEqual([]);
      expect(f.log.filter((e) => e.startsWith("request"))).toEqual([]);
    });

    it("keeps today's switch on the video sites: the off list, no prompt, no seen host", async () => {
      const video: PageSummary = {
        ...ARTICLE,
        hostname: "www.youtube.com",
        scope: "video",
      };
      const f = fake({
        access: { host: video.hostname, static: true },
        page: video,
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(siteSwitch(screen)).toBeChecked();
      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).not.toBeChecked();
      expect(f.settings().disabledSites).toEqual(["www.youtube.com"]);
      await siteSwitch(screen).click();
      await expect.element(siteSwitch(screen)).toBeChecked();
      expect(f.settings().disabledSites).toEqual([]);
      expect(f.log).toEqual([]);
    });

    it("decides the host only once Langle is on and the row shows", async () => {
      const f = fake({ access: {}, settings: { enabled: false } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.poll(() => f.log).toContain(`probe ${TAB_ID}`);
      expect(screen.getByText("On this site").query()).toBeNull();
      expect(f.log).not.toContain(`seen ${host}`);
      await screen
        .getByRole("switch", { name: "Use Langle", exact: true })
        .click();
      await expect.element(screen.getByText(ASK)).toBeVisible();
      await expect.poll(() => f.log).toContain(`seen ${host}`);
    });
  });

  describe("This page", () => {
    it("saves every unsaved word of the tab, then undoes it", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("This page")).toBeVisible();
      await expect
        .element(screen.getByText("46 words not saved yet"))
        .toBeVisible();

      await screen
        .getByRole("button", { name: "Mark all as Learning" })
        .click();
      await expect
        .element(screen.getByText("46 words marked as Learning"))
        .toBeVisible();
      await expect.element(screen.getByText("174")).toBeVisible();
      expect(f.asked).toContainEqual({
        type: "pageSaveAll",
        status: "learning",
      });

      await screen.getByRole("button", { name: "Undo" }).click();
      await expect
        .element(screen.getByText("46 words not saved yet"))
        .toBeVisible();
      await expect.element(screen.getByText("128")).toBeVisible();
      expect(f.asked).toContainEqual({ type: "pageUndo" });
    });

    it("sits between On this site and the highlight chips", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      const heading = screen.getByText("This page");
      await expect.element(heading).toBeVisible();
      const chips = screen.getByRole("button", {
        name: "Learning",
        exact: true,
      });
      await expect.element(chips).toBeVisible();
      expect(
        siteSwitch(screen)
          .element()
          .compareDocumentPosition(heading.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        heading.element().compareDocumentPosition(chips.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("says This video on a video page", async () => {
      const f = fake({ page: { ...ARTICLE, scope: "video" } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("This video")).toBeVisible();
    });

    it("Show words on this page opens the page's Words list and closes the popup", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      const show = screen.getByRole("button", {
        name: "Show words on this page",
      });
      await expect.element(show).toBeVisible();
      // Right under the heading line, above Mark all (mock Toolbar).
      const buttons = [...screen.container.querySelectorAll("button")].map(
        (b) => b.textContent,
      );
      expect(buttons.indexOf("Show words on this page")).toBe(
        buttons.indexOf("Mark all as Learning") - 1,
      );
      const style = getComputedStyle(show.element());
      expect(style.height).toBe("40px");
      expect(style.borderTopLeftRadius).toBe("8px");
      expect(style.borderTopColor).toBe("rgb(213, 216, 224)");
      expect(style.fontWeight).toBe("600");
      expect(show.element().querySelector("svg")).not.toBeNull();

      await show.click();
      expect(f.asked).toContainEqual({ type: "pageShowWords" });
      await vi.waitFor(() => expect(f.deps.close).toHaveBeenCalled());
    });

    it("has no Show words on a video page (its Words tab is there)", async () => {
      const f = fake({ page: { ...ARTICLE, scope: "video" } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("This video")).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Show words on this page" }).query(),
      ).toBeNull();
    });

    it("is hidden where Langle does not run, until it does", async () => {
      const f = fake({ page: { ...ARTICLE, supported: false }, refreshMs: 50 });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("theweekendtable.example"))
        .toBeVisible();
      expect(screen.getByText("This page").query()).toBeNull();
      f.setPage(ARTICLE);
      await expect.element(screen.getByText("This page")).toBeVisible();
    });
  });

  describe("sync", () => {
    it("shows when the words were last saved and the space used", async () => {
      const f = fake({ page: ARTICLE });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("Saved to Chrome sync · 2 minutes ago"))
        .toBeVisible();
      await expect
        .element(screen.getByText("Sync space: 41 KB of 100 KB used"))
        .toBeVisible();
    });

    it("says not saved yet before the first save", async () => {
      const f = fake({ sync: { ...SYNC, lastSavedAt: undefined } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("Not saved yet")).toBeVisible();
    });

    it("says sync is off, without the space", async () => {
      const f = fake({ sync: { ...SYNC, enabled: false } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("Sync is off")).toBeVisible();
      expect(screen.getByText(/Sync space/).query()).toBeNull();
      expect(screen.getByText(/Saved to/).query()).toBeNull();
    });

    it("on a device that syncs nothing, says the words are saved on this phone, without the space", async () => {
      const f = fake({ page: ARTICLE, place: { kind: "device" } });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("Saved on this phone · 2 minutes ago"))
        .toBeVisible();
      expect(screen.getByText(/Sync space/).query()).toBeNull();
      expect(screen.getByText(/Chrome sync/).query()).toBeNull();
    });
  });

  describe("your own cloud storage", () => {
    const connected = { cloudProvider: "googleDrive" } as const;

    it("asks the background to read the other devices' changes when it opens", async () => {
      const f = fake();
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("Saved to Chrome sync · 2 minutes ago"))
        .toBeVisible();
      expect(f.sent.filter((r) => r.type === "cloudCheck")).toHaveLength(1);
      expect(screen.getByText(/Google Drive/).query()).toBeNull();
    });

    it("shows the last save, the size and the devices instead of browser sync", async () => {
      const f = fake({ cloud: CONNECTED, settings: connected });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("Saved to Google Drive · 2 minutes ago"))
        .toBeVisible();
      await expect
        .element(screen.getByText("1.4 MB · 3 devices"))
        .toBeVisible();
      expect(screen.getByText(/Chrome sync/).query()).toBeNull();
      expect(screen.getByText(/Sync space/).query()).toBeNull();
      expect(screen.getByText(/Last checked/).query()).toBeNull();
    });

    it("asks to connect on this device too, above the counts, and Connect connects", async () => {
      const f = fake({
        cloud: { available: ["googleDrive"], bytes: 0, devices: 0 },
        settings: connected,
      });
      const release = holdConnect(f.deps);
      const screen = await render(<Popup deps={f.deps} />);
      const note = screen.getByText("Connect Google Drive on this device too");
      await expect.element(note).toBeVisible();
      await expect
        .element(screen.getByText("Saved to Chrome sync · 2 minutes ago"))
        .toBeVisible();
      const counts = screen.getByText("Phrases", { exact: true });
      expect(
        note.element().compareDocumentPosition(counts.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      await screen.getByRole("button", { name: "Connect" }).click();
      await expect
        .element(screen.getByRole("button", { name: "Connecting…" }))
        .toBeDisabled();
      release();
      await expect
        .element(screen.getByText("Saved to Google Drive · 2 minutes ago"))
        .toBeVisible();
      expect(screen.getByText("Connecting…").query()).toBeNull();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
    });

    it("does not offer Google Drive when no device chose it", async () => {
      const f = fake({
        cloud: { available: ["googleDrive"], bytes: 0, devices: 0 },
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByText("Saved to Chrome sync · 2 minutes ago"))
        .toBeVisible();
      expect(screen.getByText(/Google Drive/).query()).toBeNull();
    });

    it("says Reconnect needed in red, and Reconnect connects again", async () => {
      const f = fake({
        cloud: {
          ...CONNECTED,
          error: "reconnect",
          lastSavedAt: NOW - 3 * 60 * MINUTE,
        },
        settings: connected,
      });
      const release = holdConnect(f.deps);
      const screen = await render(<Popup deps={f.deps} />);
      const line = screen.getByText("Reconnect needed");
      await expect.element(line).toBeVisible();
      expect(getComputedStyle(line.element()).color).toBe("rgb(180, 35, 24)");
      await expect
        .element(screen.getByText("Last saved to Google Drive 3 hours ago"))
        .toBeVisible();
      await screen.getByRole("button", { name: "Reconnect" }).click();
      await expect
        .element(screen.getByRole("button", { name: "Connecting…" }))
        .toBeDisabled();
      release();
      await expect
        .element(screen.getByText("Saved to Google Drive · 2 minutes ago"))
        .toBeVisible();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
    });

    it("says the storage is full or an update is needed in the same red line, without a button", async () => {
      for (const [error, text] of [
        ["full", "Google Drive storage is full"],
        ["update", "Update Langle on this device"],
      ] as const) {
        const f = fake({ cloud: { ...CONNECTED, error }, settings: connected });
        const screen = await render(<Popup deps={f.deps} />);
        const line = screen.getByText(text);
        await expect.element(line).toBeVisible();
        expect(getComputedStyle(line.element()).color).toBe("rgb(180, 35, 24)");
        await expect
          .element(screen.getByText("Last saved to Google Drive 2 minutes ago"))
          .toBeVisible();
        expect(
          screen.getByRole("button", { name: /Connect/ }).query(),
        ).toBeNull();
        cleanup();
      }
    });
  });

  describe("language data", () => {
    const SPANISH = { learningLang: "es", nativeLang: "en" };
    const ready = (total: number): PackState => ({
      state: "ready",
      received: total,
      total,
    });

    it("shows the download under the header while the pair's data is missing, and nothing once it is there", async () => {
      const f = fake({
        settings: SPANISH,
        page: ARTICLE,
        packStatus: () =>
          spanish(ready(3_000_000), {
            state: "downloading",
            received: 0,
            total: 3_500_000,
          }),
      });
      const screen = await render(<Popup deps={f.deps} />);
      const line = screen.getByRole("status");
      await expect
        .element(line)
        .toHaveTextContent("Downloading Spanish data · 46%");
      // Under the header, before the rest of the popup.
      const header = screen.getByText("Spanish → English").element();
      const site = screen.getByText("On this site").element();
      expect(
        header.compareDocumentPosition(line.element()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        line.element().compareDocumentPosition(site) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      f.setPackStates({
        "es-en": {
          state: "downloading",
          received: 2_500_000,
          total: 3_500_000,
        },
      });
      await expect
        .element(line)
        .toHaveTextContent("Downloading Spanish data · 84%");

      f.setPackStates({ es: ready(3_000_000), "es-en": ready(3_500_000) });
      await expect.element(screen.getByRole("status")).not.toBeInTheDocument();
      expect(f.sent.filter((r) => r.type === "packStatus")).toHaveLength(1);
    });

    it("says the download failed, and Retry asks the background to try again", async () => {
      const f = fake({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3_000_000), {
            state: "failed",
            received: 0,
            total: 3_500_000,
            error: "HTTP 404",
          }),
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect
        .element(screen.getByRole("status"))
        .toMatchTextContent("Couldn't download Spanish data");
      await screen.getByRole("button", { name: "Retry" }).click();
      expect(f.sent).toContainEqual({ type: "retryPacks" });

      f.setPackStates({
        "es-en": { state: "downloading", received: 0, total: 3_500_000 },
      });
      await expect
        .element(screen.getByRole("status"))
        .toHaveTextContent("Downloading Spanish data · 46%");
    });

    it("treats a pack updating while its older version is in use as there", async () => {
      const f = fake({
        settings: SPANISH,
        packStatus: () =>
          spanish(ready(3_000_000), {
            state: "downloading",
            received: 0,
            total: 3_500_000,
            updating: true,
          }),
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("2,341")).toBeVisible();
      expect(screen.getByRole("status").query()).toBeNull();
    });

    it("shows nothing for a pair whose data is on the device, and asks again for another pair", async () => {
      const f = fake({
        packStatus: (s) =>
          s.learningLang === "es"
            ? spanish(ready(3_000_000), {
                state: "downloading",
                received: 0,
                total: 3_500_000,
              })
            : JAPANESE,
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("2,341")).toBeVisible();
      expect(screen.getByRole("status").query()).toBeNull();

      f.changeSettings(SPANISH);
      await expect
        .element(screen.getByRole("status"))
        .toHaveTextContent("Downloading Spanish data · 46%");
    });

    it("stops watching the data when it closes", async () => {
      const f = fake();
      const screen = await render(<Popup deps={f.deps} />);
      await expect.poll(() => f.packWatchers()).toBe(1);
      await screen.unmount();
      expect(f.packWatchers()).toBe(0);
    });
  });

  it("opens the word list and the settings from the header icons", async () => {
    const f = fake({ page: ARTICLE });
    const screen = await render(<Popup deps={f.deps} />);
    const wordList = screen.getByRole("button", { name: "Word list" });
    const gear = screen.getByRole("button", { name: "Open settings" });
    await expect.element(wordList).toBeVisible();
    // The word list sits just left of the gear.
    expect(wordList.element().nextElementSibling).toBe(gear.element());
    expect(
      screen.getByRole("button", { name: "Settings", exact: true }).query(),
    ).toBeNull();

    await wordList.click();
    expect(f.deps.openWordList).toHaveBeenCalledOnce();
    await gear.click();
    expect(f.deps.openOptions).toHaveBeenCalledOnce();
  });
});

describe("Support Langle", () => {
  const LINKS = {
    review: "https://store.example/langle/reviews",
    coffee: "https://ko-fi.example/langle",
  };
  const nudge = (screen: Awaited<ReturnType<typeof render>>) =>
    screen.getByRole("status").filter({ hasText: "Nice work!" });
  const footer = (screen: Awaited<ReturnType<typeof render>>) =>
    screen.getByRole("navigation", { name: "Support Langle" });

  it("asks once for a rating when Learning reaches 100 words, pointing at Rate", async () => {
    const f = fake({
      links: LINKS,
      counts: { learning: 100, known: 2341, phrases: 37 },
    });
    const screen = await render(<Popup deps={f.deps} />);
    await expect
      .element(nudge(screen))
      .toHaveTextContent(
        "Nice work! You've hit 100 words in Learning.Enjoying Langle? A quick rating below helps other learners find it.",
      );
    const rate = footer(screen).getByRole("link", { name: "Rate" });
    expect(getComputedStyle(rate.element()).color).toBe("rgb(26, 79, 181)");
    expect(getComputedStyle(rate.element()).backgroundColor).toBe(
      "rgb(234, 240, 253)",
    );
    // The bubble sits right above the footer.
    expect(
      nudge(screen).element().getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(footer(screen).element().getBoundingClientRect().top);
  });

  it("does not ask at 99 Learning words, and Rate is not highlighted", async () => {
    const f = fake({
      links: LINKS,
      counts: { learning: 99, known: 2341, phrases: 37 },
    });
    const screen = await render(<Popup deps={f.deps} />);
    const rate = footer(screen).getByRole("link", { name: "Rate" });
    await expect.element(rate).toBeVisible();
    expect(nudge(screen).query()).toBeNull();
    expect(getComputedStyle(rate.element()).color).toBe("rgb(90, 96, 117)");
  });

  it("Rate opens the store's review page and the nudge never comes back", async () => {
    const f = fake({ links: LINKS });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(nudge(screen)).toBeVisible();
    await footer(screen).getByRole("link", { name: "Rate" }).click();
    await expect.poll(() => f.deps.openTab).toHaveBeenCalledWith(LINKS.review);
    expect(f.settings().rateNudgeDone).toBe(true);
    expect(nudge(screen).query()).toBeNull();

    await screen.unmount();
    const again = await render(<Popup deps={f.deps} />);
    await expect.element(footer(again)).toBeVisible();
    expect(nudge(again).query()).toBeNull();
  });

  it("× dismisses the nudge for good without opening anything", async () => {
    const f = fake({ links: LINKS });
    const screen = await render(<Popup deps={f.deps} />);
    await nudge(screen).getByRole("button", { name: "Dismiss" }).click();
    await expect.element(nudge(screen)).not.toBeInTheDocument();
    expect(f.settings().rateNudgeDone).toBe(true);
    expect(f.deps.openTab).not.toHaveBeenCalled();
  });

  it("the nudge stays away once answered on another device", async () => {
    const f = fake({ links: LINKS });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(nudge(screen)).toBeVisible();
    f.changeSettings({ rateNudgeDone: true });
    await expect.element(nudge(screen)).not.toBeInTheDocument();
  });

  it("Buy me a coffee opens the Ko-fi page, also while Langle is off", async () => {
    const f = fake({ links: LINKS, settings: { enabled: false } });
    const screen = await render(<Popup deps={f.deps} />);
    const coffee = footer(screen).getByRole("link", {
      name: "Buy me a coffee if you enjoy Langle",
    });
    await coffee.click();
    expect(f.deps.openTab).toHaveBeenCalledWith(LINKS.coffee);
    expect(f.settings().rateNudgeDone).toBe(false);
  });

  it("leaves out a link whose page does not exist yet, and the footer without any", async () => {
    const f = fake({ links: { coffee: LINKS.coffee } });
    const screen = await render(<Popup deps={f.deps} />);
    await expect
      .element(footer(screen).getByRole("link", { name: /Buy me a coffee/ }))
      .toBeVisible();
    expect(screen.getByRole("link", { name: "Rate" }).query()).toBeNull();
    // No Rate to point at: no nudge either.
    expect(nudge(screen).query()).toBeNull();
    await screen.unmount();

    const none = await render(<Popup deps={fake().deps} />);
    await expect.element(none.getByText("2,341")).toBeVisible();
    expect(none.getByRole("navigation").query()).toBeNull();
  });
});

describe("the phone layout", () => {
  const VIDEO: PageSummary = {
    ...ARTICLE,
    hostname: "m.youtube.com",
    scope: "video",
    unsaved: 23,
  };
  const patches = (sent: Request[]) =>
    sent.flatMap((r) => (r.type === "setSettings" ? [r.patch] : []));
  const subtitles = (screen: Awaited<ReturnType<typeof render>>) =>
    screen.getByRole("region", { name: "Subtitles" });
  const size = (element: Element) => {
    const box = element.getBoundingClientRect();
    return [box.width, box.height];
  };

  it("fills the width, with 44px targets and 52×32 switches, and no footer", async () => {
    const f = fake({
      page: ARTICLE,
      phone: true,
      links: { coffee: "https://ko-fi.com/langle" },
    });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(screen.getByText("2,341")).toBeVisible();
    expect(
      screen.getByRole("dialog").element().getBoundingClientRect().width,
    ).toBe(screen.container.getBoundingClientRect().width);
    expect(
      size(screen.getByRole("button", { name: "Word list" }).element()),
    ).toEqual([44, 44]);
    expect(
      size(screen.getByRole("switch", { name: "Use Langle" }).element()),
    ).toEqual([52, 32]);
    expect(size(siteSwitch(screen).element())).toEqual([52, 32]);
    expect(
      size(screen.getByRole("button", { name: "Learning" }).element())[1],
    ).toBe(44);
    expect(
      size(
        screen.getByRole("button", { name: "Mark all as Known" }).element(),
      )[1],
    ).toBe(44);
    expect(screen.getByRole("navigation").query()).toBeNull();
    // Subtitles are a video's.
    expect(subtitles(screen).query()).toBeNull();
  });

  describe("in the app, with Google Drive", () => {
    const app = (cloud: CloudStatus, googleAuth = true) =>
      fake({
        page: ARTICLE,
        phone: true,
        place: { kind: "device" },
        googleAuth,
        cloud,
        settings: { cloudProvider: "googleDrive" },
      });
    const top = (screen: Awaited<ReturnType<typeof render>>, text: string) =>
      screen.getByText(text).element().getBoundingClientRect().top;

    it("puts the size and devices at the right of the saved line, or under it at the right", async () => {
      const screen = await render(<Popup deps={app(CONNECTED).deps} />);
      const saved = "Saved to Google Drive · 2 minutes ago";
      const size = "1.4 MB · 3 devices";
      await expect.element(screen.getByText(saved)).toBeVisible();
      const right = (text: string) =>
        screen.getByText(text).element().getBoundingClientRect().right;
      const line = screen.getByText(saved).element().parentElement!;
      expect(right(size)).toBe(line.getBoundingClientRect().right);
      expect(top(screen, size)).toBeCloseTo(top(screen, saved), -1);
      await page.viewport(390, 844);
      // The saved line stays whole; the size goes under it.
      expect(screen.getByText(saved).element().getClientRects()).toHaveLength(
        1,
      );
      expect(top(screen, size)).toBeGreaterThan(top(screen, saved));
      expect(right(size)).toBe(line.getBoundingClientRect().right);
      // Vitest's own size, for the tests after.
      await page.viewport(414, 896);
    });

    it("says what stopped it, with Reconnect only when signing in again helps", async () => {
      const f = app({
        ...CONNECTED,
        error: "reconnect",
        lastSavedAt: NOW - 3 * HOUR,
      });
      const screen = await render(<Popup deps={f.deps} />);
      await expect.element(screen.getByText("Reconnect needed")).toBeVisible();
      await expect
        .element(screen.getByText("Last saved to Google Drive 3 hours ago"))
        .toBeVisible();
      const reconnect = screen.getByRole("button", { name: "Reconnect" });
      expect(reconnect.element().getBoundingClientRect().height).toBe(40);
      await reconnect.click();
      expect(f.sent).toContainEqual({
        type: "cloudConnect",
        provider: "googleDrive",
      });
      cleanup();

      const update = await render(
        <Popup deps={app({ ...CONNECTED, error: "update" }).deps} />,
      );
      await expect
        .element(update.getByText("Update Langle on this phone"))
        .toBeVisible();
      expect(
        update.getByRole("button", { name: "Reconnect" }).query(),
      ).toBeNull();
    });

    it("never asks to connect on this device too, and shows no Drive without Google sign-in", async () => {
      const offered = {
        available: ["googleDrive" as const],
        bytes: 0,
        devices: 0,
      };
      const screen = await render(<Popup deps={app(offered).deps} />);
      await expect
        .element(screen.getByText("Saved on this phone · 2 minutes ago"))
        .toBeVisible();
      expect(screen.getByText(/Google Drive/).query()).toBeNull();
      cleanup();

      const without = await render(<Popup deps={app(CONNECTED, false).deps} />);
      await expect
        .element(without.getByText("Saved on this phone · 2 minutes ago"))
        .toBeVisible();
      expect(without.getByText(/Google Drive/).query()).toBeNull();
    });
  });

  it("keeps the desktop's popup on a desktop, Subtitles staying in the player's menu", async () => {
    const f = fake({ page: VIDEO });
    const screen = await render(<Popup deps={f.deps} />);
    await expect.element(screen.getByText("This video")).toBeVisible();
    expect(
      screen.getByRole("dialog").element().getBoundingClientRect().width,
    ).toBe(360);
    expect(subtitles(screen).query()).toBeNull();
  });

  it("on a video, shows Subtitles from the settings, the phone's position, not the desktop's", async () => {
    const f = fake({
      page: VIDEO,
      phone: true,
      settings: { subtitlePosition: "inVideo" },
    });
    const screen = await render(<Popup deps={f.deps} />);
    const section = subtitles(screen);
    await expect
      .element(section.getByRole("button", { name: "Below video" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(section.getByRole("switch", { name: "Show dual subtitles" }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(section.getByRole("switch", { name: "Show transcript" }))
      .toHaveAttribute("aria-checked", "true");
    await expect
      .element(section.getByRole("button", { name: "Off" }))
      .toHaveAttribute("aria-pressed", "true");
    await expect
      .element(section.getByRole("slider", { name: "Text size" }))
      .toHaveValue("100");
    // Background is the box behind a subtitle in the video.
    expect(
      section.getByRole("slider", { name: "Background" }).query(),
    ).toBeNull();
  });

  it("writes each control's setting; Background shows only with In video", async () => {
    const f = fake({ page: VIDEO, phone: true });
    const screen = await render(<Popup deps={f.deps} />);
    const section = subtitles(screen);
    await section.getByRole("button", { name: "In video" }).click();
    await section.getByRole("switch", { name: "Show dual subtitles" }).click();
    await section.getByRole("switch", { name: "Show transcript" }).click();
    await section.getByRole("button", { name: "Left" }).click();
    await section.getByRole("button", { name: "Right" }).click();
    await section.getByRole("slider", { name: "Text size" }).click();
    await userEvent.keyboard("{Home}");
    const background = section.getByRole("slider", { name: "Background" });
    await expect.element(background).toHaveValue("80");
    await background.click();
    await userEvent.keyboard("{End}");
    await expect
      .poll(() => f.settings())
      .toMatchObject({
        phoneSubtitlePosition: "inVideo",
        subtitleTranslation: false,
        transcriptShown: false,
        phoneFullscreenTranscript: "right",
        subtitleSize: 50,
        subtitleOpacity: 100,
      });
    expect(patches(f.sent).slice(0, 5)).toEqual([
      { phoneSubtitlePosition: "inVideo" },
      { subtitleTranslation: false },
      { transcriptShown: false },
      { phoneFullscreenTranscript: "left" },
      { phoneFullscreenTranscript: "right" },
    ]);
    // The desktop's position is not the phone's.
    expect(patches(f.sent).some((p) => "subtitlePosition" in p)).toBe(false);
    await section.getByRole("button", { name: "Below video" }).click();
    await expect.element(background).not.toBeInTheDocument();
  });
});
