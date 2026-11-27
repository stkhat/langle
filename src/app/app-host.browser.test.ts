// The real background, started on the app's shim over the reference native side, as
// the phone app's extension host runs it (docs/specs/mobile-app.md). A content
// context talks to it through its own bridge. The host's shim is this test realm's
// `browser`: the content side uses the shim's parts without installing them, so the
// two do not share a global.
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { CONSENT_VERSION, SETUP_KEY } from "../core/setup";
import { SETTINGS_KEY } from "../core/settings";
import { createBridge } from "./bridge/bridge";
import { installShim } from "./shim/install";
import { createRuntime } from "./shim/runtime";
import { createStorage } from "./shim/storage";
import { createReferenceNative } from "./testing/reference-native";

const ORIGIN = "https://app.langle.invalid";
const ARTICLE = "https://example.com/article";
const INFO = {
  id: "langle-app",
  origin: ORIGIN,
  manifest: { manifest_version: 3, name: "Langle", version: "0.1.0" },
};

const native = createReferenceNative({ origin: ORIGIN });
let content: {
  runtime: ReturnType<typeof createRuntime>;
  storage: ReturnType<typeof createStorage>;
};

beforeAll(async () => {
  // Once set up, the background starts the language data downloads: they wait here.
  vi.stubGlobal("fetch", () => new Promise(() => {}));

  const hostBridge = createBridge(native.connect({ kind: "host" }).transport);
  installShim(hostBridge, INFO);
  // Imported after the shim is installed: `wxt/browser` picks `browser` when it loads.
  const { startBackground } = await import("../background/start");
  startBackground();
  await hostBridge.call("bridge.hello", { context: "host" });

  const tabId = native.openTab(ARTICLE);
  const contentBridge = createBridge(
    native.connect({ kind: "content", tabId }).transport,
  );
  content = {
    runtime: createRuntime(contentBridge, INFO),
    storage: createStorage(contentBridge),
  };
  await contentBridge.call("bridge.hello", { context: "content" });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("the background on the app's shim", () => {
  test("opens the setup on install, as an app page", async () => {
    await expect
      .poll(() => native.tabs().map(({ url }) => url))
      .toContain(`${ORIGIN}/welcome.html`);
  });

  test("sends native code the app's strings in the device's language before the setup", async () => {
    // The test browser's language is English, whose messages need no fetch.
    await expect.poll(() => native.nativeStrings()?.locale).toBe("en");
    expect(native.nativeStrings()).toMatchObject({
      dir: "ltr",
      strings: { "app.home": "Home", "app.more": "More" },
    });
  });

  test("answers a content script before the setup", async () => {
    await expect(
      content.runtime.sendMessage({ type: "setupStatus" }),
    ).resolves.toEqual({ ok: true, value: { stage: "consent", pair: null } });
  });

  test("answers a set-up device's requests", async () => {
    await content.storage.local.set({
      [SETUP_KEY]: { consent: CONSENT_VERSION, languages: true },
    });
    await expect(
      content.runtime.sendMessage({ type: "getSettings" }),
    ).resolves.toMatchObject({
      ok: true,
      value: { enabled: true, learningLang: "en", nativeLang: "ja" },
    });
  });

  test("a setting written by the host reaches the content script before the reply", async () => {
    const order: string[] = [];
    content.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && SETTINGS_KEY in changes) order.push("onChanged");
    });
    const reply = await content.runtime.sendMessage({
      type: "setSettings",
      patch: { enabled: false },
    });
    order.push("reply");
    expect(reply).toMatchObject({ ok: true, value: { enabled: false } });
    expect(order).toEqual(["onChanged", "reply"]);
    expect(native.stored("sync")[SETTINGS_KEY]).toMatchObject({
      enabled: false,
    });
  });

  test("keeps the recent pages content reports (the shim sets appHost)", async () => {
    const visit = await content.runtime.sendMessage({
      type: "recentsVisit",
      page: {
        url: ARTICLE,
        title: "An article",
        site: "example.com",
        kind: "page",
      },
    });
    expect(visit).toEqual({ ok: true, value: null });
    await expect(
      content.runtime.sendMessage({ type: "recentsList", limit: 10 }),
    ).resolves.toMatchObject({
      ok: true,
      value: [{ url: ARTICLE, title: "An article", opens: 1 }],
    });
  });
});
