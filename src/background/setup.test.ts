import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { browser } from "wxt/browser";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { agreed, chosen, SETUP_KEY } from "../core/setup";
import { getSetupStage } from "../messaging/setup";
import type { Reply } from "../messaging/protocol";
import { createSetup } from "./setup";
import { getSettings, setSettings } from "./settings-store";

const PAGE = "chrome-extension://langle/welcome.html";
const TAB = { id: 7, windowId: 1 };
const FROM_PAGE = { url: PAGE, tab: TAB };
const JA = { learningLang: "en", nativeLang: "ja" };

let tab: { open: () => Promise<void>; back: () => Promise<void> };
/** Whether Langle ran on this device before it had a setup. */
let ranBefore: () => Promise<boolean>;
let inner: Mock<(request: unknown, sender?: object) => Promise<Reply>>;
let handle: (request: unknown, sender?: object) => Promise<Reply>;

beforeEach(() => {
  fakeBrowser.reset();
  tab = { open: vi.fn(async () => {}), back: vi.fn(async () => {}) };
  ranBefore = async () => false;
  inner = vi.fn<(request: unknown, sender?: object) => Promise<Reply>>(
    async () => ({ ok: true, value: "handled" }),
  );
  handle = createSetup({ pageUrl: PAGE, tab, ranBefore }).guard(inner);
});

const store = (value: unknown) =>
  browser.storage.local.set({ [SETUP_KEY]: value });
const AGREED = agreed(undefined);

describe("before the setup ends", () => {
  it.each([
    "getSettings",
    "setSettings",
    "analyze",
    "lookup",
    "recordHistory",
    "recordEncounters",
    "syncStatus",
    "cloudCheck",
    "importJson",
    "retryPacks",
  ])("refuses %s, before and after consent", async (type) => {
    expect(await handle({ type }, FROM_PAGE)).toMatchObject({ ok: false });
    await store(AGREED);
    expect(await handle({ type }, FROM_PAGE)).toMatchObject({ ok: false });
    expect(inner).not.toHaveBeenCalled();
  });

  it.each(["cloudStatus", "cloudConnect"])(
    "passes %s on from the setup page after consent only",
    async (type) => {
      expect(await handle({ type }, FROM_PAGE)).toMatchObject({ ok: false });
      await store(AGREED);
      expect(await handle({ type }, { url: "https://example.com/" })).toEqual({
        ok: false,
        error: "Only the setup page can do this",
      });
      expect(inner).not.toHaveBeenCalled();
      expect(await handle({ type }, FROM_PAGE)).toEqual({
        ok: true,
        value: "handled",
      });
      expect(inner).toHaveBeenCalledWith({ type }, FROM_PAGE);
    },
  );

  it("passes everything on once set up", async () => {
    await store(chosen(AGREED));
    expect(await handle({ type: "analyze" }, FROM_PAGE)).toEqual({
      ok: true,
      value: "handled",
    });
    expect(inner).toHaveBeenCalledWith({ type: "analyze" }, FROM_PAGE);
  });
});

describe("setupStatus", () => {
  it("reads nothing from browser sync before consent", async () => {
    await setSettings({ nativeLang: "pt" });
    const get = vi.spyOn(browser.storage.sync, "get");
    expect(await handle({ type: "setupStatus" }, FROM_PAGE)).toEqual({
      ok: true,
      value: { stage: "consent", pair: null },
    });
    expect(get).not.toHaveBeenCalled();
    get.mockRestore();
  });

  it("gives the stored or synced pair after consent", async () => {
    await store(AGREED);
    expect(await handle({ type: "setupStatus" }, FROM_PAGE)).toEqual({
      ok: true,
      value: { stage: "languages", pair: null },
    });
    await setSettings({ nativeLang: "pt" });
    expect(await handle({ type: "setupStatus" }, FROM_PAGE)).toEqual({
      ok: true,
      value: {
        stage: "languages",
        pair: { learningLang: "en", nativeLang: "pt" },
      },
    });
  });

  it("gives no pair while the stored one is the default no one chose", async () => {
    await store(AGREED);
    // As connecting cloud storage before the languages step stores it.
    await setSettings({ cloudProvider: "googleDrive" });
    expect(await handle({ type: "setupStatus" }, FROM_PAGE)).toEqual({
      ok: true,
      value: { stage: "languages", pair: null },
    });
    // Chosen, if back to the default.
    await setSettings({ nativeLang: "pt" });
    await setSettings({ nativeLang: "ja" });
    expect(await handle({ type: "setupStatus" }, FROM_PAGE)).toMatchObject({
      value: { pair: JA },
    });
  });
});

describe("openSetup", () => {
  it("opens the setup", async () => {
    expect(await handle({ type: "openSetup" })).toMatchObject({ ok: true });
    expect(tab.open).toHaveBeenCalledOnce();
  });
});

describe("agreeSetup", () => {
  it("keeps the consent on this device only, and goes on to the languages", async () => {
    expect(await handle({ type: "agreeSetup" }, FROM_PAGE)).toEqual({
      ok: true,
      value: { stage: "languages", pair: null },
    });
    expect(await getSetupStage()).toBe("languages");
    expect(await browser.storage.sync.get()).toEqual({});
    expect(tab.back).not.toHaveBeenCalled();
  });

  it("goes straight back on a device that chose its languages before", async () => {
    await store({ consent: 0, languages: true });
    await handle({ type: "agreeSetup" }, FROM_PAGE);
    expect(await getSetupStage()).toBe("ready");
    expect(tab.back).toHaveBeenCalledWith(TAB);
  });

  it.each([
    ["no page", {}],
    [
      "a web page's script",
      { url: "https://example.com/welcome.html", tab: TAB },
    ],
    ["another page of Langle", { url: "chrome-extension://langle/popup.html" }],
    ["a look-alike address", { url: `${PAGE}.evil`, tab: TAB }],
  ])("takes no consent from %s", async (_name, sender) => {
    expect(await handle({ type: "agreeSetup" }, sender)).toMatchObject({
      ok: false,
    });
    expect(await getSetupStage()).toBe("consent");
  });

  it("takes the page with a query or a hash", async () => {
    const sender = { url: `${PAGE}?again#top`, tab: TAB };
    expect(await handle({ type: "agreeSetup" }, sender)).toMatchObject({
      ok: true,
    });
  });
});

describe("startLangle", () => {
  const start = (pair: object, sender: object = FROM_PAGE) =>
    handle({ type: "startLangle", ...pair }, sender);

  it("stores the pair before the setup ends, then goes back", async () => {
    await store(AGREED);
    const order: string[] = [];
    const listener = (_changes: unknown, area: string) => {
      order.push(area);
    };
    browser.storage.onChanged.addListener(listener);
    const pair = { learningLang: "en", nativeLang: "es" };
    expect(await start(pair)).toEqual({ ok: true, value: null });
    expect(order).toEqual(["sync", "local"]);
    expect(await getSettings()).toMatchObject(pair);
    expect(await getSetupStage()).toBe("ready");
    expect(tab.back).toHaveBeenCalledWith(TAB);
  });

  it("does not start without consent", async () => {
    expect(await start(JA)).toMatchObject({ ok: false });
    expect(await getSetupStage()).toBe("consent");
    expect(await browser.storage.sync.get()).toEqual({});
  });

  it("refuses a pair that is not offered", async () => {
    await store(AGREED);
    for (const pair of [{}, { learningLang: "ja", nativeLang: "xx" }])
      expect(await start(pair)).toMatchObject({ ok: false });
    expect(await getSetupStage()).toBe("languages");
  });

  it("is taken only from the setup page", async () => {
    await store(AGREED);
    const sender = { url: "https://example.com/", tab: TAB };
    expect(await start(JA, sender)).toMatchObject({ ok: false });
    expect(await getSetupStage()).toBe("languages");
  });

  it("stays set up when going back fails", async () => {
    await store(AGREED);
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    tab.back = async () => {
      throw new Error("no window");
    };
    handle = createSetup({ pageUrl: PAGE, tab, ranBefore }).guard(inner);
    expect(await start(JA)).toMatchObject({ ok: true });
    expect(await getSetupStage()).toBe("ready");
  });
});

describe("when the extension is installed or updated", () => {
  it.each(["install", "update"])(
    "opens the setup on %s until it is done",
    async (reason) => {
      createSetup({ pageUrl: PAGE, tab, ranBefore }).openOnInstall();
      await fakeBrowser.runtime.onInstalled.trigger({ reason } as never);
      await vi.waitFor(() => expect(tab.open).toHaveBeenCalledOnce());
    },
  );

  it.each([
    ["update", chosen(AGREED)],
    ["browser_update", undefined],
  ])("does not open it on %s with %j", async (reason, setup) => {
    if (setup) await store(setup);
    createSetup({ pageUrl: PAGE, tab, ranBefore }).openOnInstall();
    await fakeBrowser.runtime.onInstalled.trigger({ reason } as never);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(tab.open).not.toHaveBeenCalled();
  });

  describe("on a device that ran Langle before it had a setup", () => {
    beforeEach(() => {
      ranBefore = async () => true;
    });
    const installed = async (reason: string) => {
      createSetup({ pageUrl: PAGE, tab, ranBefore }).openOnInstall();
      await fakeBrowser.runtime.onInstalled.trigger({ reason } as never);
      await new Promise((resolve) => setTimeout(resolve, 10));
    };

    it("sets it up on update without asking, keeping its languages", async () => {
      await setSettings(JA);
      await installed("update");
      expect(await getSetupStage()).toBe("ready");
      expect(tab.open).not.toHaveBeenCalled();
      expect(await getSettings()).toMatchObject(JA);
    });

    it("asks again when the consent changed since", async () => {
      await store({ consent: 0, languages: true });
      await installed("update");
      expect(await getSetupStage()).toBe("consent");
      expect(tab.open).toHaveBeenCalledOnce();
    });

    it("asks on install", async () => {
      await installed("install");
      expect(await getSetupStage()).toBe("consent");
      expect(tab.open).toHaveBeenCalledOnce();
    });
  });
});
