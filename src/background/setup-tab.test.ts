import { describe, expect, it, vi } from "vitest";
import { createSetupTab, type SetupTabDeps } from "./setup-tab";

const PAGE = "chrome-extension://langle/welcome.html";

interface FakeTab {
  id: number;
  windowId: number;
  active?: boolean;
  status?: string;
  /** What its content script answers; none without one. */
  presence?: { reload: boolean };
  setup?: boolean;
}

function fake({
  tabs,
  focused = 1,
  popup = async () => {},
  answersAfter = 0,
}: {
  tabs: FakeTab[];
  focused?: number;
  popup?: ((options: { windowId: number }) => Promise<void>) | null;
  /** The content script answers from this question on (still starting). */
  answersAfter?: number;
}) {
  let window = focused;
  let asked = 0;
  let kept: unknown;
  const did: string[] = [];
  const find = (id: number) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) throw new Error(`No tab with id: ${id}.`);
    return tab;
  };
  const activate = (tab: FakeTab) => {
    for (const t of tabs) if (t.windowId === tab.windowId) t.active = t === tab;
  };
  const deps: SetupTabDeps = {
    pageUrl: PAGE,
    tabs: {
      query: async ({ active, lastFocusedWindow, windowId }) =>
        tabs
          .filter(
            (t) =>
              (!active || t.active) &&
              (!lastFocusedWindow || t.windowId === window) &&
              (windowId === undefined || t.windowId === windowId),
          )
          .map((t) => ({ ...t })),
      get: async (id) => ({ ...find(id) }),
      create: async ({ url, windowId = window }) => {
        const tab: FakeTab = {
          id: 100 + tabs.length,
          windowId,
          setup: url === PAGE,
        };
        tabs.push(tab);
        activate(tab);
        did.push(url ? "open setup" : "new tab");
        return { ...tab };
      },
      update: async (id) => {
        const tab = find(id);
        activate(tab);
        did.push(`show ${id}`);
        return { ...tab };
      },
      remove: async (id) => {
        const tab = find(id);
        tabs.splice(tabs.indexOf(tab), 1);
        const rest = tabs.filter((t) => t.windowId === tab.windowId);
        if (tab.active && rest[0]) activate(rest[0]);
        did.push(`close ${id}`);
      },
      reload: async (id) => {
        find(id);
        did.push(`reload ${id}`);
      },
      sendMessage: async (id, message) => {
        const tab = find(id);
        const { type } = message as { type: string };
        if (type === "setupPing" && tab.setup) return true;
        if (type === "pagePresence" && tab.presence && asked++ >= answersAfter)
          return tab.presence;
        throw new Error("Receiving end does not exist.");
      },
    },
    focusWindow: async (id) => {
      window = id;
      did.push(`focus ${id}`);
    },
    session: {
      get: async () => kept,
      set: async (value) => {
        kept = value;
      },
    },
    openPopup:
      popup === null
        ? undefined
        : async (options) => {
            did.push(`popup ${options.windowId}`);
            await popup(options);
          },
    wait: async () => {
      for (const tab of tabs) if (tab.status === "loading") delete tab.status;
    },
  };
  const setupTab = createSetupTab(deps);
  return {
    did,
    tabs,
    setupTab,
    focus(id: number) {
      window = id;
    },
    /** Opens the setup, then goes back from it. */
    async through() {
      await setupTab.open();
      const setup = tabs.find((t) => t.setup)!;
      did.length = 0;
      await setupTab.back({ id: setup.id, windowId: setup.windowId });
      return setup;
    },
  };
}

const page = (fields: Partial<FakeTab> = {}): FakeTab => ({
  id: 1,
  windowId: 1,
  active: true,
  ...fields,
});

describe("opening the setup", () => {
  it("opens it in a new tab, and shows it again instead of a second one", async () => {
    const f = fake({ tabs: [page()] });
    await f.setupTab.open();
    expect(f.did).toEqual(["open setup"]);
    const setup = f.tabs.find((t) => t.setup)!;
    f.did.length = 0;
    await f.setupTab.open();
    expect(f.did).toEqual([`focus 1`, `show ${setup.id}`]);
  });

  it("opens another when the one it opened shows something else now", async () => {
    const f = fake({ tabs: [page()] });
    await f.setupTab.open();
    f.tabs.find((t) => t.setup)!.setup = false;
    f.did.length = 0;
    await f.setupTab.open();
    expect(f.did).toEqual(["open setup"]);
  });
});

describe("going back after the setup", () => {
  it("shows the page it came from, reloads it without Langle, then opens the popup", async () => {
    const f = fake({ tabs: [page({ id: 2, active: false }), page()] });
    const setup = await f.through();
    expect(f.did).toEqual([
      "focus 1",
      "show 1",
      `close ${setup.id}`,
      "reload 1",
      "popup 1",
    ]);
  });

  it("does not reload a page that has Langle", async () => {
    const f = fake({ tabs: [page({ presence: { reload: false } })] });
    await f.through();
    expect(f.did).not.toContain("reload 1");
    expect(f.did.at(-1)).toBe("popup 1");
  });

  it("reloads one that has Langle but missed what it needs of the load", async () => {
    const f = fake({ tabs: [page({ presence: { reload: true } })] });
    await f.through();
    expect(f.did).toContain("reload 1");
  });

  it("asks again before it reloads: the content script may be starting", async () => {
    const f = fake({
      tabs: [page({ presence: { reload: false } })],
      answersAfter: 1,
    });
    await f.through();
    expect(f.did).not.toContain("reload 1");
  });

  it("asks a page that is loading once it is done", async () => {
    const tab = page({ presence: { reload: false }, status: "loading" });
    const f = fake({ tabs: [tab] });
    await f.through();
    expect(tab.status).toBeUndefined();
    expect(f.did).not.toContain("reload 1");
  });

  it("returns to another window", async () => {
    const f = fake({
      tabs: [page(), page({ id: 2, windowId: 2 })],
    });
    await f.setupTab.open();
    const setup = f.tabs.find((t) => t.setup)!;
    setup.windowId = 2;
    f.focus(2);
    f.did.length = 0;
    await f.setupTab.back({ id: setup.id, windowId: 2 });
    expect(f.did).toEqual([
      "focus 1",
      "show 1",
      `close ${setup.id}`,
      "reload 1",
      "popup 1",
    ]);
  });

  it("takes the tab the browser picks when that page is gone", async () => {
    const f = fake({ tabs: [page(), page({ id: 2, active: false })] });
    await f.setupTab.open();
    const setup = f.tabs.find((t) => t.setup)!;
    f.tabs.splice(0, 1);
    f.did.length = 0;
    await f.setupTab.back({ id: setup.id, windowId: 1 });
    expect(f.did).toEqual([`close ${setup.id}`, "reload 2", "popup 1"]);
  });

  it("does the same for a setup it did not open", async () => {
    const f = fake({
      tabs: [page({ id: 5, active: true }), page({ id: 2, active: false })],
    });
    await f.setupTab.back({ id: 5, windowId: 1 });
    expect(f.did).toEqual(["close 5", "reload 2", "popup 1"]);
  });

  it("opens a new tab in place of the window's only one, and does not reload it", async () => {
    const f = fake({ tabs: [page({ id: 5 })] });
    await f.setupTab.back({ id: 5, windowId: 1 });
    expect(f.did).toEqual(["new tab", "close 5", "popup 1"]);
  });

  it("is quiet where the popup cannot open", async () => {
    const error = vi.spyOn(console, "error");
    await fake({ tabs: [page()], popup: null }).through();
    const f = fake({
      tabs: [page()],
      popup: async () => {
        throw new Error("Could not find an active browser window.");
      },
    });
    await f.through();
    expect(f.did).toContain("reload 1");
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
