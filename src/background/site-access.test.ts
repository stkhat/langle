import { describe, expect, it, vi } from "vitest";
import type { PendingTab } from "../messaging/site-access";
import {
  ARTICLES_SCRIPT_FILE,
  ARTICLES_SCRIPT_ID,
  followSiteAccess,
  type RegisteredScript,
  type SiteAccessDeps,
} from "./site-access";

const STATIC = ["*://www.youtube.com/*", "*://www.netflix.com/*"];

function event<A extends unknown[]>() {
  const all: ((...args: A) => void)[] = [];
  return {
    addListener: (listener: (...args: A) => void) => void all.push(listener),
    emit: (...args: A) => all.forEach((listener) => listener(...args)),
  };
}

interface FakeTab {
  url?: string;
  /** A Langle content script answers in its top frame. */
  langle?: boolean;
}

/** Chrome's permissions, scripting and tabs as far as the follower uses them. */
function fake(granted: string[], tabs: Record<number, FakeTab> = {}) {
  let origins = [...STATIC, ...granted];
  const registry = new Map<string, RegisteredScript>();
  let pending: PendingTab | undefined;
  const onAdded = event<[{ origins?: string[] }]>();
  const onRemoved = event<[{ origins?: string[] }]>();
  const onInstalled = event<[]>();
  const onStartup = event<[]>();
  const injected: number[] = [];
  const sent: { tabId: number; message: unknown; frameId?: number }[] = [];
  const deps: SiteAccessDeps = {
    staticMatches: STATIC,
    permissions: {
      getAll: async () => ({ origins: [...origins], permissions: [] }),
      onAdded,
      onRemoved,
    },
    scripting: {
      async getRegisteredContentScripts(filter) {
        return [...registry.values()].filter(
          (script) => !filter?.ids || filter.ids.includes(script.id),
        );
      },
      async registerContentScripts(scripts) {
        for (const script of scripts) {
          if (registry.has(script.id))
            throw new Error(`Duplicate script ID '${script.id}'`);
          registry.set(script.id, script);
        }
      },
      async updateContentScripts(scripts) {
        for (const script of scripts) {
          const current = registry.get(script.id);
          if (!current) throw new Error(`Nonexistent script ID '${script.id}'`);
          registry.set(script.id, { ...current, ...script });
        }
      },
      async unregisterContentScripts(filter) {
        for (const id of filter.ids) registry.delete(id);
      },
      async executeScript({ target, files }) {
        expect(files).toEqual([ARTICLES_SCRIPT_FILE]);
        expect(target.allFrames ?? false).toBe(false);
        injected.push(target.tabId);
        return [];
      },
    },
    tabs: {
      async get(tabId) {
        const tab = tabs[tabId];
        if (!tab) throw new Error(`No tab with id: ${tabId}.`);
        return { url: tab.url };
      },
      query: async () => Object.keys(tabs).map((id) => ({ id: Number(id) })),
      async sendMessage(tabId, message, options) {
        sent.push({ tabId, message, frameId: options.frameId });
        if (!tabs[tabId]?.langle)
          throw new Error("Could not establish connection.");
        return { reload: false };
      },
    },
    pending: {
      get: async () => pending,
      set: async (value) => void (pending = value),
      clear: async () => void (pending = undefined),
    },
    onInstalled,
    onStartup,
  };
  const access = followSiteAccess(deps);
  return {
    access,
    registry,
    injected,
    sent,
    pending: () => pending,
    matches: () => registry.get(ARTICLES_SCRIPT_ID)?.matches,
    async grant(...added: string[]) {
      origins.push(...added);
      onAdded.emit({ origins: added });
      await access.idle;
    },
    async revoke(...removed: string[]) {
      origins = origins.filter((origin) => !removed.includes(origin));
      onRemoved.emit({ origins: removed });
      await access.idle;
    },
    /** An extension update: Chrome drops registered scripts, keeps grants. */
    async update() {
      registry.clear();
      onInstalled.emit();
      await access.idle;
    },
    async restartBrowser() {
      registry.clear();
      onStartup.emit();
      await access.idle;
    },
  };
}

describe("followSiteAccess: the registered article script", () => {
  it("matches the granted article origins from the start, without the video sites", async () => {
    const chrome = fake(["*://b.example/*", "*://a.example/*"]);
    await chrome.access.idle;
    expect([...chrome.registry.values()]).toEqual([
      {
        id: ARTICLES_SCRIPT_ID,
        js: [ARTICLES_SCRIPT_FILE],
        matches: ["*://a.example/*", "*://b.example/*"],
        runAt: "document_idle",
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
  });

  it("is not registered while no article origin is granted", async () => {
    const chrome = fake([]);
    await chrome.access.idle;
    expect(chrome.registry.size).toBe(0);
  });

  it("follows grants added and removed, and goes with the last one", async () => {
    const chrome = fake([]);
    await chrome.grant("*://a.example/*");
    expect(chrome.matches()).toEqual(["*://a.example/*"]);
    await chrome.grant("*://b.example/*");
    expect(chrome.matches()).toEqual(["*://a.example/*", "*://b.example/*"]);
    await chrome.revoke("*://a.example/*");
    expect(chrome.matches()).toEqual(["*://b.example/*"]);
    await chrome.revoke("*://b.example/*");
    expect(chrome.registry.size).toBe(0);
  });

  it("matches every web page while every host is granted", async () => {
    const chrome = fake(["*://a.example/*"]);
    await chrome.grant("*://*/*");
    expect(chrome.matches()).toEqual(["*://*/*"]);
  });

  it("is registered again after an extension update and a browser start", async () => {
    const chrome = fake(["*://a.example/*"]);
    await chrome.access.idle;
    await chrome.update();
    expect(chrome.matches()).toEqual(["*://a.example/*"]);
    await chrome.restartBrowser();
    expect(chrome.matches()).toEqual(["*://a.example/*"]);
  });

  it("registers once when events come together", async () => {
    const chrome = fake(["*://a.example/*"]);
    chrome.registry.clear();
    await Promise.all([chrome.update(), chrome.restartBrowser()]);
    expect(chrome.matches()).toEqual(["*://a.example/*"]);
  });
});

describe("followSiteAccess: the pending tab", () => {
  it("gets the article script once a grant covers its host, once", async () => {
    const chrome = fake([], { 7: { url: "https://a.example/story" } });
    await chrome.access.setPending({ tabId: 7, host: "a.example" });
    await chrome.grant("*://a.example/*");
    expect(chrome.injected).toEqual([7]);
    expect(chrome.matches()).toEqual(["*://a.example/*"]);
    expect(chrome.pending()).toBeUndefined();
    await chrome.grant("*://b.example/*");
    expect(chrome.injected).toEqual([7]);
  });

  it("waits through a grant for another host", async () => {
    const chrome = fake([], { 7: { url: "https://a.example/" } });
    await chrome.access.setPending({ tabId: 7, host: "a.example" });
    await chrome.grant("*://b.example/*");
    expect(chrome.injected).toEqual([]);
    expect(chrome.pending()).toEqual({ tabId: 7, host: "a.example" });
    await chrome.grant("*://*/*");
    expect(chrome.injected).toEqual([7]);
  });

  it("is the last one the popup sent", async () => {
    const chrome = fake([], {
      7: { url: "https://a.example/" },
      8: { url: "https://a.example/" },
    });
    await chrome.access.setPending({ tabId: 7, host: "a.example" });
    await chrome.access.setPending({ tabId: 8, host: "a.example" });
    await chrome.grant("*://a.example/*");
    expect(chrome.injected).toEqual([8]);
  });

  it("is left alone when it moved to another host, was closed or already runs Langle", async () => {
    const cases: Record<number, FakeTab>[] = [
      { 7: { url: "https://b.example/" } },
      { 7: {} },
      {},
      { 7: { url: "https://a.example/", langle: true } },
    ];
    for (const tabs of cases) {
      const chrome = fake([], tabs);
      await chrome.access.setPending({ tabId: 7, host: "a.example" });
      await chrome.grant("*://a.example/*");
      expect(chrome.injected, JSON.stringify(tabs)).toEqual([]);
      expect(chrome.pending()).toBeUndefined();
    }
  });

  it("asks the tab's top frame whether Langle runs there", async () => {
    const chrome = fake([], { 7: { url: "https://a.example/" } });
    await chrome.access.setPending({ tabId: 7, host: "a.example" });
    await chrome.grant("*://a.example/*");
    expect(chrome.sent).toEqual([
      { tabId: 7, message: { type: "pagePresence" }, frameId: 0 },
    ]);
  });
});

describe("followSiteAccess: removed grants", () => {
  it("tells every tab's top frame what was removed and what stays", async () => {
    const chrome = fake(["*://a.example/*", "*://b.example/*"], {
      1: { langle: true },
      2: {},
    });
    await chrome.revoke("*://a.example/*");
    expect(chrome.sent).toEqual(
      [1, 2].map((tabId) => ({
        tabId,
        message: {
          type: "siteAccessRemoved",
          removed: ["*://a.example/*"],
          granted: ["*://b.example/*"],
        },
        frameId: 0,
      })),
    );
  });

  it("logs nothing for tabs without a Langle script", async () => {
    const error = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    const chrome = fake(["*://a.example/*"], { 2: {} });
    await chrome.revoke("*://a.example/*");
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
