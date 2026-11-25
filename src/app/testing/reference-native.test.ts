import { afterEach, describe, expect, test, vi } from "vitest";
import { createBridge, NO_RECEIVER, type Bridge } from "../bridge/bridge";
import type { EventApi } from "../bridge/protocol";
import {
  createReferenceNative,
  type ContextSpec,
  type ReferenceNativeOptions,
  SHARE_FILE_ERROR,
} from "./reference-native";

const ORIGIN = "https://app.langle.invalid";
const ARTICLE = "https://example.com/article";

/** Lets every queued delivery through (deliveries are microtasks). */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function setup(options?: ReferenceNativeOptions) {
  const native = createReferenceNative(options);
  const contexts: { bridge: Bridge; disconnect: () => void }[] = [];
  const connect = (spec: ContextSpec) => {
    const { transport, disconnect } = native.connect(spec);
    const context = { bridge: createBridge(transport), disconnect };
    contexts.push(context);
    return context;
  };
  /** Records every event of `api` the context gets. */
  const record = (bridge: Bridge, api: EventApi) => {
    const seen: unknown[][] = [];
    bridge.on(api, (args) => void seen.push(args));
    return seen;
  };
  return { native, connect, record };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the host's start", () => {
  test("gets onInstalled with install on the first run", async () => {
    const { connect, record, native } = setup();
    const host = connect({ kind: "host" });
    const installed = record(host.bridge, "runtime.onInstalled");
    await host.bridge.call("bridge.hello", { context: "host" });
    await settle();
    expect(installed).toEqual([[{ reason: "install" }]]);
    expect(native.persisted().installedVersion).toBe("1.0.0");
  });

  test("gets onInstalled with update when the build changed", async () => {
    const { connect, record } = setup({
      installedVersion: "0.9.0",
      version: "1.0.0",
    });
    const host = connect({ kind: "host" });
    const installed = record(host.bridge, "runtime.onInstalled");
    await host.bridge.call("bridge.hello", { context: "host" });
    await settle();
    expect(installed).toEqual([
      [{ reason: "update", previousVersion: "0.9.0" }],
    ]);
  });

  test("gets onStartup otherwise, and nothing when it is created again", async () => {
    const { connect, record } = setup({ installedVersion: "1.0.0" });
    const first = connect({ kind: "host" });
    const startup = record(first.bridge, "runtime.onStartup");
    await first.bridge.call("bridge.hello", { context: "host" });
    first.disconnect();
    const second = connect({ kind: "host" });
    const again = record(second.bridge, "runtime.onStartup");
    const installed = record(second.bridge, "runtime.onInstalled");
    await second.bridge.call("bridge.hello", { context: "host" });
    await settle();
    expect(startup).toEqual([[]]);
    expect(again).toEqual([]);
    expect(installed).toEqual([]);
  });
});

describe("storage", () => {
  test("keeps three areas, with get, set, remove and clear", async () => {
    const { connect } = setup({ local: { a: 1 } });
    const { bridge } = connect({ kind: "page", url: `${ORIGIN}/options.html` });
    await bridge.call("storage.local.set", { b: 2 });
    await bridge.call("storage.sync.set", { s: true });
    await bridge.call("storage.session.set", { tab: 3 });
    await expect(bridge.call("storage.local.get", null)).resolves.toEqual({
      a: 1,
      b: 2,
    });
    await expect(
      bridge.call("storage.local.get", ["b", "missing"]),
    ).resolves.toEqual({ b: 2 });
    await bridge.call("storage.local.remove", ["a"]);
    await bridge.call("storage.session.clear");
    await expect(bridge.call("storage.local.get", null)).resolves.toEqual({
      b: 2,
    });
    await expect(bridge.call("storage.sync.get", null)).resolves.toEqual({
      s: true,
    });
    await expect(bridge.call("storage.session.get", null)).resolves.toEqual({});
  });

  test("posts onChanged to every context before it replies to the writer", async () => {
    const { connect, native } = setup();
    const host = connect({ kind: "host" });
    const tabId = native.openTab(ARTICLE);
    const content = connect({ kind: "content", tabId });
    const order: string[] = [];
    host.bridge.on("storage.onChanged", ([changes, area]) => {
      order.push("host onChanged");
      expect(changes).toEqual({ settings: { newValue: { on: true } } });
      expect(area).toBe("sync");
    });
    content.bridge.on(
      "storage.onChanged",
      () => void order.push("content onChanged"),
    );
    await content.bridge.call("storage.sync.set", { settings: { on: true } });
    order.push("writer resolved");
    expect(order).toEqual([
      "host onChanged",
      "content onChanged",
      "writer resolved",
    ]);
  });

  test("gives old and new values, and posts nothing when nothing changed", async () => {
    const { connect, record } = setup({ local: { a: 1, b: 2 } });
    const { bridge } = connect({ kind: "host" });
    const changed = record(bridge, "storage.onChanged");
    await bridge.call("storage.local.set", { a: 1 });
    await bridge.call("storage.local.remove", ["missing"]);
    await bridge.call("storage.local.set", { a: 5 });
    await bridge.call("storage.local.remove", ["b"]);
    expect(changed).toEqual([
      [{ a: { oldValue: 1, newValue: 5 } }, "local"],
      [{ b: { oldValue: 2 } }, "local"],
    ]);
  });

  test("keeps local and sync for the next process, not session", async () => {
    const first = setup();
    const { bridge } = first.connect({ kind: "host" });
    await bridge.call("storage.local.set", { l: 1 });
    await bridge.call("storage.sync.set", { s: 1 });
    await bridge.call("storage.session.set", { x: 1 });
    const next = setup(first.native.persisted());
    expect(next.native.stored("local")).toEqual({ l: 1 });
    expect(next.native.stored("sync")).toEqual({ s: 1 });
    expect(next.native.stored("session")).toEqual({});
  });
});

describe("messages", () => {
  test("a content script's message reaches the host with the sender native code knows", async () => {
    const { connect, native } = setup();
    const host = connect({ kind: "host" });
    const senders: unknown[] = [];
    host.bridge.on("runtime.onMessage", ([message, sender]) => {
      senders.push(sender);
      return { echo: message };
    });
    await host.bridge.call("bridge.hello", { context: "host" });
    const tabId = native.openTab(ARTICLE);
    const content = connect({ kind: "content", tabId });
    // A second argument claiming another sender is not believed.
    await expect(
      content.bridge.call(
        "runtime.sendMessage",
        { type: "counts" },
        { tab: { id: 99 } },
      ),
    ).resolves.toEqual({ echo: { type: "counts" } });
    expect(senders).toEqual([
      {
        id: "langle-app",
        url: ARTICLE,
        origin: "https://example.com",
        tab: {
          id: tabId,
          url: ARTICLE,
          active: true,
          windowId: 1,
          incognito: false,
        },
        frameId: 0,
      },
    ]);
  });

  test("the host's error reaches the sender", async () => {
    const { connect } = setup();
    const host = connect({ kind: "host" });
    host.bridge.on("runtime.onMessage", () => {
      throw new Error("bad request");
    });
    await host.bridge.call("bridge.hello", { context: "host" });
    const page = connect({ kind: "page", url: `${ORIGIN}/popup.html` });
    await expect(page.bridge.call("runtime.sendMessage", {})).rejects.toThrow(
      "bad request",
    );
  });

  test("a message waits for the host's hello", async () => {
    const { connect } = setup();
    const page = connect({ kind: "page", url: `${ORIGIN}/popup.html` });
    const answer = page.bridge.call("runtime.sendMessage", { type: "a" });
    await settle();
    const host = connect({ kind: "host" });
    host.bridge.on("runtime.onMessage", () => "late but there");
    await host.bridge.call("bridge.hello", { context: "host" });
    await expect(answer).resolves.toBe("late but there");
  });

  test("a message fails with Chrome's text when the host has not said hello in 10 s", async () => {
    vi.useFakeTimers();
    const { connect } = setup();
    const page = connect({ kind: "page", url: `${ORIGIN}/popup.html` });
    const answer = page.bridge.call("runtime.sendMessage", { type: "a" });
    const failed = expect(answer).rejects.toThrow(NO_RECEIVER);
    await vi.advanceTimersByTimeAsync(9_999);
    let done = false;
    void answer.catch(() => (done = true));
    await settle();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await failed;
  });

  test("a message fails with Chrome's text when the host goes away before it answers", async () => {
    const { connect } = setup();
    const host = connect({ kind: "host" });
    host.bridge.on("runtime.onMessage", () => new Promise(() => {}));
    await host.bridge.call("bridge.hello", { context: "host" });
    const page = connect({ kind: "page", url: `${ORIGIN}/popup.html` });
    const answer = page.bridge.call("runtime.sendMessage", {});
    await settle();
    host.disconnect();
    await expect(answer).rejects.toThrow(NO_RECEIVER);
  });

  test("tabs.sendMessage reaches the tab's top frame, or fails as Chrome does", async () => {
    const { connect, native } = setup();
    const host = connect({ kind: "host" });
    const tabId = native.openTab(ARTICLE);
    const top = connect({ kind: "content", tabId });
    const frame = connect({ kind: "content", tabId, frameId: 4 });
    top.bridge.on("runtime.onMessage", ([, sender]) => ({ top: sender }));
    frame.bridge.on("runtime.onMessage", () => "frame");
    await expect(
      host.bridge.call("tabs.sendMessage", tabId, { type: "summary" }),
    ).rejects.toThrow(NO_RECEIVER);
    await top.bridge.call("bridge.hello", { context: "content" });
    await frame.bridge.call("bridge.hello", { context: "content" });
    await expect(
      host.bridge.call("tabs.sendMessage", tabId, { type: "summary" }),
    ).resolves.toEqual({
      top: { id: "langle-app", url: `${ORIGIN}/`, origin: ORIGIN },
    });
    await expect(
      host.bridge.call("tabs.sendMessage", tabId, {}, { frameId: 4 }),
    ).resolves.toBe("frame");
    await expect(host.bridge.call("tabs.sendMessage", 99, {})).rejects.toThrow(
      NO_RECEIVER,
    );
  });
});

describe("tabs", () => {
  test("query finds the active tab, create opens app pages, get and remove know them", async () => {
    const { connect, native } = setup();
    const { bridge } = connect({ kind: "host" });
    const article = native.openTab(ARTICLE);
    await expect(bridge.call("tabs.query", { active: true })).resolves.toEqual([
      expect.objectContaining({ id: article, url: ARTICLE }),
    ]);
    const welcome = (await bridge.call("tabs.create", {
      url: `${ORIGIN}/welcome.html`,
    })) as { id: number };
    await expect(bridge.call("tabs.query", { active: true })).resolves.toEqual([
      expect.objectContaining({
        id: welcome.id,
        url: `${ORIGIN}/welcome.html`,
      }),
    ]);
    await bridge.call("tabs.update", article, { active: true });
    await expect(bridge.call("tabs.get", welcome.id)).resolves.toMatchObject({
      active: false,
    });
    await bridge.call("tabs.remove", welcome.id);
    await expect(bridge.call("tabs.get", welcome.id)).rejects.toThrow(
      `No tab with id: ${welcome.id}.`,
    );
  });

  test("getCurrent is the calling page's own tab, and nothing without one", async () => {
    const { connect } = setup();
    const { bridge: host } = connect({ kind: "host" });
    const welcome = (await host.call("tabs.create", {
      url: `${ORIGIN}/welcome.html`,
    })) as { id: number };
    const { bridge: page } = connect({
      kind: "page",
      url: `${ORIGIN}/welcome.html`,
      tabId: welcome.id,
    });
    await expect(page.call("tabs.getCurrent")).resolves.toMatchObject({
      id: welcome.id,
      url: `${ORIGIN}/welcome.html`,
    });
    const { bridge: popup } = connect({
      kind: "page",
      url: `${ORIGIN}/popup.html`,
    });
    await expect(popup.call("tabs.getCurrent")).resolves.toBeUndefined();
    await expect(host.call("tabs.getCurrent")).resolves.toBeUndefined();
  });

  test("openOptionsPage opens Settings; openPopup, reload and tabs.reload are logged", async () => {
    const { connect, native } = setup();
    const { bridge } = connect({ kind: "host" });
    await bridge.call("runtime.openOptionsPage");
    await bridge.call("action.openPopup");
    await bridge.call("runtime.reload");
    await bridge.call("tabs.reload", 1);
    expect(native.tabs()).toEqual([
      expect.objectContaining({ url: `${ORIGIN}/options.html`, active: true }),
    ]);
    expect(native.log).toEqual([
      "action.openPopup",
      "runtime.reload",
      "tabs.reload 1",
    ]);
  });

  test("appHost.openPage opens the web page in a tab and is logged", async () => {
    const { connect, native } = setup();
    const { bridge } = connect({ kind: "page", url: `${ORIGIN}/home.html` });
    await bridge.call("appHost.openPage", ARTICLE);
    expect(native.tabs()).toContainEqual(
      expect.objectContaining({ url: ARTICLE, active: true }),
    );
    expect(native.log).toEqual([`appHost.openPage ${ARTICLE}`]);
  });

  test("appHost.shareFile takes a plain file name, a media type and text", async () => {
    const { connect, native } = setup();
    const { bridge } = connect({
      kind: "page",
      url: `${ORIGIN}/wordlist.html`,
    });
    const file = {
      name: "langle-backup.json",
      mime: "application/json",
      text: "{}",
    };
    await expect(
      bridge.call("appHost.shareFile", file),
    ).resolves.toBeUndefined();
    expect(native.log).toEqual([
      "appHost.shareFile langle-backup.json application/json {}",
    ]);
    for (const bad of [
      { ...file, name: "../langle.json" },
      { ...file, name: "a/b.json" },
      { ...file, name: ".hidden" },
      { ...file, name: "" },
      { ...file, mime: "json" },
      { name: file.name, mime: file.mime },
      "langle.json",
    ])
      await expect(bridge.call("appHost.shareFile", bad)).rejects.toThrow(
        SHARE_FILE_ERROR,
      );
  });

  test("the translation calls go to the app's translation host, and are not available without one", async () => {
    const pair = { from: "en", to: "ja" };
    const calls = [
      ["appHost.translate", { ...pair, text: "A cat.", start: true }],
      ["appHost.translatorStatus", pair],
      ["appHost.prepareTranslator", pair],
      ["appHost.models.ensure", { pack: "mt-en-ja", files: [], mirrors: [] }],
      ["appHost.models.remove", { pack: "mt-en-ja" }],
    ] as const;
    const without = setup();
    const tab = without.native.openTab(ARTICLE);
    const bare = without.connect({ kind: "content", tabId: tab });
    for (const [api, request] of calls)
      await expect(bare.bridge.call(api, request)).rejects.toThrow(
        `${api} is not available here.`,
      );

    const asked: unknown[] = [];
    const { connect, record, native } = setup({
      translator: {
        status: () => "packs",
        translate: (request) => {
          asked.push(request);
          return `ja(${request.text})`;
        },
        prepare: () => "ready",
        ensure: (_, progress) => progress(5),
        remove: (pack) => void asked.push(`remove ${pack}`),
      },
    });
    const host = connect({ kind: "host" });
    const progress = record(host.bridge, "appHost.models.onProgress");
    await host.bridge.call("bridge.hello", { context: "host" });
    const shown = native.openTab(ARTICLE);
    const content = connect({ kind: "content", tabId: shown });
    await expect(content.bridge.call(...calls[0])).resolves.toBe("ja(A cat.)");
    await expect(content.bridge.call(...calls[1])).resolves.toBe("packs");
    await expect(content.bridge.call(...calls[2])).resolves.toBe("ready");
    await expect(
      host.bridge.call("appHost.models.ensure", {
        pack: "mt-en-ja",
        version: "1",
        files: [{ path: "a", sha256: "b", size: 10 }],
        mirrors: [],
      }),
    ).resolves.toBeUndefined();
    await host.bridge.call(...calls[4]);
    await settle();
    expect(progress).toEqual([[{ pack: "mt-en-ja", received: 5, total: 10 }]]);
    expect(asked).toEqual([calls[0][1], "remove mt-en-ja"]);
  });

  test("appHost.translate answers a page not on screen with null at once, never asking the host", async () => {
    const translate = vi.fn(() => "訳");
    const { connect, native } = setup({
      translator: { status: () => "ready", translate },
    });
    const hidden = native.openTab(ARTICLE);
    native.openTab("https://example.com/other");
    const content = connect({ kind: "content", tabId: hidden });
    await expect(
      content.bridge.call("appHost.translate", {
        from: "en",
        to: "ja",
        text: "A cat.",
        start: true,
      }),
    ).resolves.toBeNull();
    expect(translate).not.toHaveBeenCalled();
  });
});

describe("alarms", () => {
  test("fire on the host at their time, again when periodic, and can be cleared", async () => {
    vi.useFakeTimers({ now: 0 });
    const { connect } = setup();
    const host = connect({ kind: "host" });
    const fired: unknown[][] = [];
    host.bridge.on("alarms.onAlarm", (args) => void fired.push(args));
    await host.bridge.call("bridge.hello", { context: "host" });
    await host.bridge.call("alarms.create", "once", { delayInMinutes: 1 });
    await host.bridge.call("alarms.create", "often", { periodInMinutes: 2 });
    await expect(host.bridge.call("alarms.get", "once")).resolves.toEqual({
      name: "once",
      scheduledTime: 60_000,
    });
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(fired).toEqual([
      [{ name: "once", scheduledTime: 60_000 }],
      [{ name: "often", scheduledTime: 120_000, periodInMinutes: 2 }],
      [{ name: "often", scheduledTime: 240_000, periodInMinutes: 2 }],
    ]);
    await expect(host.bridge.call("alarms.get", "once")).resolves.toBe(
      undefined,
    );
    await expect(host.bridge.call("alarms.clear", "often")).resolves.toBe(true);
    await expect(host.bridge.call("alarms.clear", "often")).resolves.toBe(
      false,
    );
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fired).toHaveLength(3);
  });
});

describe("bad envelopes", () => {
  test("are answered with an error and logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const native = createReferenceNative();
    const { transport } = native.connect({ kind: "host" });
    const received: unknown[] = [];
    transport.listen((json) => received.push(JSON.parse(json)));
    transport.post(
      JSON.stringify({
        v: 1,
        kind: "call",
        id: "x1",
        api: "identity.get",
        args: [],
      }),
    );
    transport.post("not json");
    await settle();
    expect(received).toEqual([
      {
        v: 1,
        kind: "reply",
        id: "x1",
        ok: false,
        error: { message: "unknown call api identity.get" },
      },
    ]);
    expect(error).toHaveBeenCalledTimes(2);
  });
});
